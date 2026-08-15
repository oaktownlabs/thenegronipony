import type { CreateTrialV1, DeviceFrameV1, TrialCreatedV1 } from '@shared/calibration';

const DATABASE_NAME = 'tnp-calibration-bridge-v1';
const DATABASE_VERSION = 1;
const EVENT_STORE = 'events';
const OPERATOR_STORE = 'operator';

interface SpooledEvent {
  key: string;
  trialId: string;
  deviceId: string;
  bootId: string;
  seq: number;
  frame: DeviceFrameV1;
  storedAt: number;
}

export interface RetainedTrialSession {
  trial: TrialCreatedV1;
  benchId: string;
  benchSessionId: string;
  deviceId: string;
  bootId: string;
  request: CreateTrialV1;
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('IndexedDB request failed')),
    );
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted')),
    );
    transaction.addEventListener('error', () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed')),
    );
  });

let databasePromise: Promise<IDBDatabase> | null = null;

const database = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        const events = db.createObjectStore(EVENT_STORE, { keyPath: 'key' });
        events.createIndex('trial_seq', ['trialId', 'seq'], { unique: false });
      }
      if (!db.objectStoreNames.contains(OPERATOR_STORE)) {
        db.createObjectStore(OPERATOR_STORE);
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('IndexedDB could not open')),
    );
  });
  return databasePromise;
};

export async function spoolFrame(trialId: string, frame: DeviceFrameV1): Promise<void> {
  const db = await database();
  const transaction = db.transaction(EVENT_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const value: SpooledEvent = {
    key: `${frame.deviceId}:${frame.bootId}:${frame.seq}`,
    trialId,
    deviceId: frame.deviceId,
    bootId: frame.bootId,
    seq: frame.seq,
    frame,
    storedAt: Date.now(),
  };
  transaction.objectStore(EVENT_STORE).put(value);
  await done;
}

export async function readSpooledFrames(trialId: string, limit = 25): Promise<DeviceFrameV1[]> {
  const db = await database();
  const transaction = db.transaction(EVENT_STORE, 'readonly');
  const done = transactionDone(transaction);
  const index = transaction.objectStore(EVENT_STORE).index('trial_seq');
  const range = IDBKeyRange.bound([trialId, 0], [trialId, Number.MAX_SAFE_INTEGER]);
  const values = await requestResult(index.getAll(range, limit) as IDBRequest<SpooledEvent[]>);
  await done;
  return values.sort((left, right) => left.seq - right.seq).map((value) => value.frame);
}

export async function deleteSpooledThrough(
  trialId: string,
  deviceId: string,
  bootId: string,
  throughSeq: number,
): Promise<void> {
  const db = await database();
  const transaction = db.transaction(EVENT_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const index = transaction.objectStore(EVENT_STORE).index('trial_seq');
  const range = IDBKeyRange.bound([trialId, 0], [trialId, throughSeq]);
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = index.openCursor(range);
    cursorRequest.addEventListener('error', () =>
      reject(cursorRequest.error ?? new Error('Spool cleanup failed')),
    );
    cursorRequest.addEventListener('success', () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      const value = cursor.value as SpooledEvent;
      if (value.deviceId === deviceId && value.bootId === bootId) cursor.delete();
      cursor.continue();
    });
  });
  await done;
}

export async function countSpooledFrames(trialId?: string): Promise<number> {
  const db = await database();
  const transaction = db.transaction(EVENT_STORE, 'readonly');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(EVENT_STORE);
  const count = trialId
    ? await requestResult(
        store
          .index('trial_seq')
          .count(IDBKeyRange.bound([trialId, 0], [trialId, Number.MAX_SAFE_INTEGER])),
      )
    : await requestResult(store.count());
  await done;
  return count;
}

export async function retainTrialSession(session: RetainedTrialSession | null): Promise<void> {
  const db = await database();
  const transaction = db.transaction(OPERATOR_STORE, 'readwrite');
  const done = transactionDone(transaction);
  if (session) transaction.objectStore(OPERATOR_STORE).put(session, 'active-trial');
  else transaction.objectStore(OPERATOR_STORE).delete('active-trial');
  await done;
}

export async function loadRetainedTrialSession(): Promise<RetainedTrialSession | null> {
  const db = await database();
  const transaction = db.transaction(OPERATOR_STORE, 'readonly');
  const done = transactionDone(transaction);
  const value = (await requestResult(
    transaction.objectStore(OPERATOR_STORE).get('active-trial'),
  )) as RetainedTrialSession | undefined;
  await done;
  return value ?? null;
}
