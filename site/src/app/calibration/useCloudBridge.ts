import type {
  BatchAckV1,
  BenchHeartbeatAckV1,
  BenchSessionCreatedV1,
  CreateTrialV1,
  DeviceFrameV1,
  IngestBatchV1,
  OperatorSessionV1,
  OperatorSetupV1,
  ProjectionQueuedV1,
  TrialCreatedV1,
  TrialTransitionV1,
} from '@shared/calibration';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  countSpooledFrames,
  deleteSpooledThrough,
  loadRetainedTrialSession,
  type RetainedTrialSession,
  readSpooledFrames,
  retainTrialSession,
  spoolFrame,
} from './spool';

const BENCH_ID = 'bench-01';

interface DeviceIdentity {
  deviceId: string;
  bootId: string;
  firmwareVersion: string;
  protocolVersion: string;
}

type OperatorState = 'checking' | 'authorized' | 'unauthorized' | 'unavailable';
type BridgeState = 'idle' | 'registering' | 'ready' | 'uploading' | 'error';

const isOperatorSession = (value: unknown): value is OperatorSessionV1 =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as OperatorSessionV1).schema === 'tnp.calibration.operator-session.v1',
  );

const isBenchSession = (value: unknown): value is BenchSessionCreatedV1 =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as BenchSessionCreatedV1).schema === 'tnp.calibration.bench-session.v1',
  );

const isTrialCreated = (value: unknown): value is TrialCreatedV1 =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as TrialCreatedV1).schema === 'tnp.calibration.trial-created.v1',
  );

const batchId = (trialId: string, frames: DeviceFrameV1[]) =>
  `${trialId.slice(-8)}-${frames[0]?.bootId ?? 'boot'}-${frames[0]?.seq ?? 0}-${frames.at(-1)?.seq ?? 0}`;

const sameOriginPath = (candidate: string, label: string) => {
  const url = new URL(candidate, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error(
      `The server supplied a cross-origin ${label}; refusing to send operator credentials.`,
    );
  }
  return `${url.pathname}${url.search}`;
};

export function useCloudBridge(identity: DeviceIdentity | null) {
  const localMode =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const [localOperatorToken, setLocalOperatorTokenState] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (window.sessionStorage.getItem('tnp-local-operator-token') ?? ''),
  );
  const [operatorState, setOperatorState] = useState<OperatorState>('checking');
  const [operator, setOperator] = useState<OperatorSessionV1 | null>(null);
  const [operatorSetup, setOperatorSetup] = useState<OperatorSetupV1 | null>(null);
  const [bridgeState, setBridgeState] = useState<BridgeState>('idle');
  const [benchSession, setBenchSession] = useState<BenchSessionCreatedV1 | null>(null);
  const [trialSession, setTrialSession] = useState<RetainedTrialSession | null>(null);
  const [recoverableTrialSession, setRecoverableTrialSession] =
    useState<RetainedTrialSession | null>(null);
  const [spoolDepth, setSpoolDepth] = useState(0);
  const [pendingFrameWrites, setPendingFrameWrites] = useState(0);
  const [lastProjectedDeviceSequence, setLastProjectedDeviceSequence] = useState<number | null>(
    null,
  );
  const [lastDurableAt, setLastDurableAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flushingRef = useRef(false);
  const trialSessionRef = useRef<RetainedTrialSession | null>(null);
  const benchSessionRef = useRef<BenchSessionCreatedV1 | null>(null);
  const benchIdentityKeyRef = useRef<string | null>(null);
  const operatorHeaders = useCallback(
    (jsonBody = false): Record<string, string> => ({
      Accept: 'application/json',
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(localMode && localOperatorToken
        ? { 'X-Calibration-Local-Token': localOperatorToken }
        : {}),
    }),
    [localMode, localOperatorToken],
  );

  useEffect(() => {
    trialSessionRef.current = trialSession;
  }, [trialSession]);

  useEffect(() => {
    benchSessionRef.current = benchSession;
  }, [benchSession]);

  useEffect(() => {
    const identityKey = identity ? `${identity.deviceId}:${identity.bootId}` : null;
    if (benchIdentityKeyRef.current && benchIdentityKeyRef.current !== identityKey) {
      benchIdentityKeyRef.current = null;
      benchSessionRef.current = null;
      setBenchSession(null);
    }
  }, [identity]);

  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch('/api/v1/operator/session', {
          headers: operatorHeaders(),
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          setOperatorState('unauthorized');
          return;
        }
        if (!response.ok) throw new Error(`Operator session returned ${response.status}`);
        const body: unknown = await response.json();
        if (!isOperatorSession(body)) throw new Error('Operator session schema did not validate');
        setOperator(body);
        setOperatorState('authorized');
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setOperatorState('unavailable');
      }
    };
    void check();
    void loadRetainedTrialSession().then((retained) => {
      if (!retained || !identity) return;
      if (
        retained.request?.schema === 'tnp.calibration.create.v1' &&
        retained.deviceId === identity.deviceId &&
        retained.bootId === identity.bootId
      ) {
        setRecoverableTrialSession(null);
        trialSessionRef.current = retained;
        setTrialSession(retained);
      } else if (retained.request?.schema === 'tnp.calibration.create.v1') {
        setRecoverableTrialSession(retained);
      }
    });
    return () => controller.abort();
  }, [identity, operatorHeaders]);

  useEffect(() => {
    if (operatorState !== 'authorized') return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const query = identity ? `?device=${encodeURIComponent(identity.deviceId)}` : '';
        const response = await fetch(`/api/v1/operator/setup${query}`, {
          headers: operatorHeaders(),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Operator setup returned ${response.status}`);
        const body = (await response.json()) as OperatorSetupV1;
        if (body.schema !== 'tnp.calibration.operator-setup.v1') {
          throw new Error('Operator setup schema did not validate');
        }
        setOperatorSetup(body);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'Operator setup could not load');
      }
    };
    void load();
    return () => controller.abort();
  }, [identity, operatorHeaders, operatorState]);

  useEffect(() => {
    if (!identity || operatorState !== 'authorized' || benchSession) return;
    const controller = new AbortController();
    const register = async () => {
      setBridgeState('registering');
      try {
        const response = await fetch(`/api/v1/operator/benches/${BENCH_ID}/sessions`, {
          method: 'POST',
          headers: operatorHeaders(true),
          body: JSON.stringify({
            schema: 'tnp.calibration.bench-session.create.v1',
            deviceId: identity.deviceId,
            bootId: identity.bootId,
            firmwareVersion: identity.firmwareVersion,
            protocolVersion: 'tnp.serial.v1',
            transport: 'web_serial',
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Bench registration returned ${response.status}`);
        const body: unknown = await response.json();
        if (!isBenchSession(body)) throw new Error('Bench registration schema did not validate');
        benchSessionRef.current = body;
        benchIdentityKeyRef.current = `${identity.deviceId}:${identity.bootId}`;
        setBenchSession(body);
        setBridgeState('ready');
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'Bench registration failed');
        setBridgeState('error');
      }
    };
    void register();
    return () => controller.abort();
  }, [benchSession, identity, operatorHeaders, operatorState]);

  const refreshDepth = useCallback(async () => {
    setSpoolDepth(await countSpooledFrames(trialSessionRef.current?.trial.trial.id));
  }, []);

  const flush = useCallback(async () => {
    const retained = trialSessionRef.current;
    if (!retained || flushingRef.current) return;
    flushingRef.current = true;
    setBridgeState('uploading');
    try {
      const frames = await readSpooledFrames(
        retained.trial.trial.id,
        retained.trial.ingest.maxEventsPerBatch,
      );
      if (frames.length === 0) {
        setBridgeState('ready');
        await refreshDepth();
        return;
      }
      const body: IngestBatchV1 = {
        schema: 'tnp.calibration.batch.v1',
        batchId: batchId(retained.trial.trial.id, frames),
        producerSessionId: retained.trial.producer.producerSessionId,
        trialId: retained.trial.trial.id,
        deviceId: retained.deviceId,
        bootId: retained.bootId,
        firstSeq: frames[0].seq,
        lastSeq: frames.at(-1)?.seq ?? frames[0].seq,
        events: frames,
      };
      const response = await fetch(sameOriginPath(retained.trial.ingest.url, 'ingest URL'), {
        method: 'POST',
        headers: {
          ...operatorHeaders(true),
          'X-Calibration-Producer-Lease': retained.trial.producer.producerLease,
        },
        body: JSON.stringify(body),
      });
      if (response.status === 202) {
        const queued = (await response.json()) as ProjectionQueuedV1;
        setBridgeState('ready');
        window.setTimeout(() => void flush(), Math.max(250, queued.retryAfterMs));
        return;
      }
      if (!response.ok) throw new Error(`Cloud ingest returned ${response.status}`);
      const ack = (await response.json()) as BatchAckV1;
      if (ack.schema !== 'tnp.calibration.ack.v1')
        throw new Error('Cloud acknowledgment schema did not validate');
      await deleteSpooledThrough(
        retained.trial.trial.id,
        retained.deviceId,
        retained.bootId,
        ack.contiguousProjectedThrough,
      );
      setLastProjectedDeviceSequence(ack.contiguousProjectedThrough);
      setLastDurableAt(ack.projectedAt);
      setBridgeState('ready');
      await refreshDepth();
      if ((await countSpooledFrames(retained.trial.trial.id)) > 0)
        window.setTimeout(() => void flush(), 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cloud upload failed');
      setBridgeState('error');
      window.setTimeout(() => void flush(), 2_000 + Math.round(Math.random() * 3_000));
    } finally {
      flushingRef.current = false;
    }
  }, [operatorHeaders, refreshDepth]);

  useEffect(() => {
    if (!trialSession) return;
    void refreshDepth();
    const timer = window.setTimeout(() => void flush(), 50);
    return () => window.clearTimeout(timer);
  }, [flush, refreshDepth, trialSession]);

  const acceptFrame = useCallback(
    async (frame: DeviceFrameV1) => {
      const retained = trialSessionRef.current;
      if (retained) {
        if (frame.deviceId !== retained.deviceId || frame.bootId !== retained.bootId) {
          setError('Device identity changed while a trial lease was active.');
          setBridgeState('error');
          return;
        }
        if (frame.type === 'hello') return;
        if (frame.trialId === null && ['idle', 'complete', 'fault'].includes(frame.state)) {
          // The final trial state is retained before the browser clears its compact
          // serial context. Later idle/terminal telemetry belongs to bench presence,
          // not to the sealed trial frontier.
          return;
        }
        if (frame.trialId !== retained.trial.trial.id) {
          setError('A device frame did not match the active trial identity.');
          setBridgeState('error');
          return;
        }
        setPendingFrameWrites((current) => current + 1);
        try {
          await spoolFrame(retained.trial.trial.id, frame);
          await refreshDepth();
          window.setTimeout(() => void flush(), 300);
        } finally {
          setPendingFrameWrites((current) => Math.max(0, current - 1));
        }
        return;
      }

      const session = benchSessionRef.current;
      if (!session || frame.type !== 'heartbeat' || frame.trialId !== null) return;
      try {
        const response = await fetch(sameOriginPath(session.heartbeatUrl, 'heartbeat URL'), {
          method: 'POST',
          headers: {
            ...operatorHeaders(true),
            'X-Calibration-Bench-Lease': session.benchLease,
          },
          body: JSON.stringify({ schema: 'tnp.calibration.bench-heartbeat.v1', frame }),
        });
        if (!response.ok) throw new Error(`Bench heartbeat returned ${response.status}`);
        const ack = (await response.json()) as BenchHeartbeatAckV1;
        if (ack.schema === 'tnp.calibration.bench-heartbeat-ack.v1')
          setLastDurableAt(ack.durableAt);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Bench heartbeat failed');
        setBridgeState('error');
      }
    },
    [flush, operatorHeaders, refreshDepth],
  );

  const startTrial = useCallback(
    async (request: CreateTrialV1): Promise<TrialCreatedV1> => {
      const session = benchSessionRef.current;
      if (!identity || !session)
        throw new Error('Connect and register the bench before creating a trial.');
      const response = await fetch('/api/v1/operator/trials', {
        method: 'POST',
        headers: {
          ...operatorHeaders(true),
          'X-Calibration-Bench-Lease': session.benchLease,
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`Trial creation returned ${response.status}`);
      const body: unknown = await response.json();
      if (!isTrialCreated(body)) throw new Error('Trial creation schema did not validate');
      const retained: RetainedTrialSession = {
        trial: body,
        benchId: BENCH_ID,
        benchSessionId: session.benchSessionId,
        deviceId: identity.deviceId,
        bootId: identity.bootId,
        request,
      };
      await retainTrialSession(retained);
      trialSessionRef.current = retained;
      setTrialSession(retained);
      setLastProjectedDeviceSequence(null);
      setBridgeState('ready');
      return body;
    },
    [identity, operatorHeaders],
  );

  const endTrial = useCallback(
    async (kind: 'complete' | 'abort', transition: TrialTransitionV1) => {
      const retained = trialSessionRef.current;
      if (!retained) return;
      await flush();
      const response = await fetch(`/api/v1/operator/trials/${retained.trial.trial.id}/${kind}`, {
        method: 'POST',
        headers: {
          ...operatorHeaders(true),
          'X-Calibration-Producer-Lease': retained.trial.producer.producerLease,
        },
        body: JSON.stringify(transition),
      });
      if (!response.ok) throw new Error(`Trial ${kind} returned ${response.status}`);
      await retainTrialSession(null);
      trialSessionRef.current = null;
      setTrialSession(null);
      setLastProjectedDeviceSequence(null);
      await refreshDepth();
      setBridgeState('ready');
    },
    [flush, operatorHeaders, refreshDepth],
  );

  const forceAbortExpiredTrial = useCallback(
    async (trialId: string, reason: string) => {
      const response = await fetch(
        `/api/v1/operator/trials/${encodeURIComponent(trialId)}/force-abort`,
        {
          method: 'POST',
          headers: operatorHeaders(true),
          body: JSON.stringify({ schema: 'tnp.calibration.trial-force-abort.v1', reason }),
        },
      );
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(detail?.error?.message ?? `Forced recovery returned ${response.status}`);
      }
      await retainTrialSession(null);
      if (recoverableTrialSession?.trial.trial.id === trialId) {
        setRecoverableTrialSession(null);
      }
      setLastProjectedDeviceSequence(null);
      benchSessionRef.current = null;
      benchIdentityKeyRef.current = null;
      setBenchSession(null);
      await refreshDepth();
      setBridgeState('ready');
    },
    [operatorHeaders, recoverableTrialSession, refreshDepth],
  );

  const setLocalOperatorToken = useCallback(
    (token: string) => {
      if (!localMode) return;
      const normalized = token.trim();
      if (normalized) window.sessionStorage.setItem('tnp-local-operator-token', normalized);
      else window.sessionStorage.removeItem('tnp-local-operator-token');
      setLocalOperatorTokenState(normalized);
      setOperator(null);
      setOperatorState('checking');
    },
    [localMode],
  );

  return {
    operatorState,
    operator,
    operatorSetup,
    bridgeState,
    benchSession,
    trialSession,
    recoverableTrialSession,
    spoolDepth,
    pendingFrameWrites,
    lastProjectedDeviceSequence,
    lastDurableAt,
    error,
    localMode,
    setLocalOperatorToken,
    acceptFrame,
    startTrial,
    forceAbortExpiredTrial,
    completeTrial: (transition: TrialTransitionV1) => endTrial('complete', transition),
    abortTrial: (transition: TrialTransitionV1) => endTrial('abort', transition),
    authorize: () => {
      if (!localMode) window.location.assign('/api/v1/operator/authorize?returnTo=/calibration');
    },
  };
}
