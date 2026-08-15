import { DurableObject } from 'cloudflare:workers';
import type {
  BatchAckV1,
  BenchHeartbeatAckV1,
  BenchPresenceV1,
  BenchSessionCreatedV1,
  BenchStreamFrameV1,
  CreateBenchSessionV1,
  CreateTrialV1,
  DeviceFrameV1,
  IngestBatchV1,
  ProjectionQueuedV1,
  TrialCreatedV1,
  TrialForceAbortedV1,
  TrialState,
  TrialStreamFrameV1,
  TrialTransitionedV1,
  TrialTransitionV1,
} from '../shared/calibration';
import { EMPTY_PRESENCE } from './read-models';

export type CoordinatorResult<T> =
  | { ok: true; status: number; value: T }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> };

interface ActorInput {
  subject: string;
  email: string | null;
  authMode: 'access' | 'local';
}

interface SessionCommand {
  benchId: string;
  benchSessionId: string;
  input: CreateBenchSessionV1;
  actor: ActorInput;
  leaseHash: string;
  now: string;
  expiresAt: string;
}

interface HeartbeatCommand {
  benchId: string;
  benchSessionId: string;
  actor: ActorInput;
  leaseHash: string;
  frame: Exclude<DeviceFrameV1, { type: 'sample' | 'hello' }>;
  now: string;
  expiresAt: string;
}

interface StartTrialCommand {
  input: CreateTrialV1;
  actor: ActorInput;
  benchLeaseHash: string;
  trialId: string;
  producerSessionId: string;
  producerLeaseHash: string;
  now: string;
  expiresAt: string;
}

interface HashedEvent {
  hash: string;
  event: DeviceFrameV1;
}

interface IngestCommand {
  actor: ActorInput;
  leaseHash: string;
  batch: IngestBatchV1;
  bodyHash: string;
  events: HashedEvent[];
  receivedAt: string;
  expiresAt: string;
}

interface TransitionCommand {
  trialId: string;
  actor: ActorInput;
  leaseHash: string;
  transition: TrialTransitionV1;
  kind: 'complete' | 'abort';
  now: string;
}

interface ForceAbortCommand {
  trialId: string;
  actor: ActorInput;
  reason: string;
  now: string;
}

interface SessionRow extends Record<string, SqlStorageValue> {
  session_id: string;
  actor_subject: string;
  device_id: string;
  boot_id: string;
  firmware_version: string;
  lease_hash: string;
  lease_expires_at: string;
  last_seen_at: string | null;
  last_seq: number | null;
  expected_interval_ms: number | null;
  latest_durable_at: string | null;
}

interface TrialRow extends Record<string, SqlStorageValue> {
  trial_id: string;
  bench_session_id: string;
  producer_session_id: string;
  actor_subject: string;
  device_id: string;
  boot_id: string;
  pump_specimen_id: string;
  plan_json: string;
  producer_lease_hash: string;
  lease_expires_at: string;
  state: TrialState;
  next_stream_seq: number;
  published_stream_seq: number;
  projected_device_seq: number | null;
  first_device_seq: number | null;
  expected_interval_ms: number | null;
  last_event_received_at: string | null;
  latest_projected_at: string | null;
  latest_mass_mg: number | null;
  latest_duty_basis_points: number;
  latest_device_state: string;
  created_at: string;
  completed_at: string | null;
}

interface BatchRow extends Record<string, SqlStorageValue> {
  body_hash: string;
  status: string;
  ack_json: string | null;
  payload_json: string;
  error_code: string | null;
}

interface LocalEventRow extends Record<string, SqlStorageValue> {
  event_hash: string;
  trial_id: string;
  stream_seq: number;
  projected: number;
}

interface PendingProjection {
  batch: IngestBatchV1;
  novel: Array<HashedEvent & { streamSeq: number }>;
  accepted: number;
  duplicates: number;
  receivedAt: string;
}

const RETRY_AFTER_MS = 1_000;
const REPLAY_LIMIT = 256;

const isoNow = (): string => new Date().toISOString();
const after = (timestamp: string, now: string): boolean => Date.parse(timestamp) > Date.parse(now);
const timerCountForDuty = (dutyBasisPoints: number): number => {
  if (dutyBasisPoints <= 0) return 0;
  return Math.max(1, Math.round((800 * dutyBasisPoints) / 10_000));
};
const chunks = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
};

function safeSend(socket: WebSocket, frame: unknown): void {
  try {
    socket.send(JSON.stringify(frame));
  } catch {
    try {
      socket.close(1011, 'send failed');
    } catch {
      // The peer may already be gone.
    }
  }
}

export class BenchCoordinator extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // biome-ignore lint/correctness/noUndeclaredVariables: Cloudflare runtime global.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS bench_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS producer_sessions (
          session_id TEXT PRIMARY KEY,
          actor_subject TEXT NOT NULL,
          actor_email TEXT,
          device_id TEXT NOT NULL,
          boot_id TEXT NOT NULL,
          firmware_version TEXT NOT NULL,
          lease_hash TEXT NOT NULL,
          lease_expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_seen_at TEXT,
          last_seq INTEGER,
          expected_interval_ms INTEGER,
          latest_durable_at TEXT
        );
        CREATE TABLE IF NOT EXISTS local_trials (
          trial_id TEXT PRIMARY KEY,
          bench_session_id TEXT NOT NULL,
          producer_session_id TEXT NOT NULL,
          actor_subject TEXT NOT NULL,
          device_id TEXT NOT NULL,
          boot_id TEXT NOT NULL,
          pump_specimen_id TEXT NOT NULL,
          plan_json TEXT NOT NULL,
          producer_lease_hash TEXT NOT NULL,
          lease_expires_at TEXT NOT NULL,
          state TEXT NOT NULL,
          next_stream_seq INTEGER NOT NULL DEFAULT 1,
          published_stream_seq INTEGER NOT NULL DEFAULT 0,
          projected_device_seq INTEGER,
          first_device_seq INTEGER,
          expected_interval_ms INTEGER,
          last_event_received_at TEXT,
          latest_projected_at TEXT,
          latest_mass_mg INTEGER,
          latest_duty_basis_points INTEGER NOT NULL DEFAULT 0,
          latest_device_state TEXT NOT NULL DEFAULT 'idle',
          created_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS local_one_active_trial
          ON local_trials((1))
          WHERE state IN ('created', 'running', 'completing');
        CREATE TABLE IF NOT EXISTS local_batches (
          trial_id TEXT NOT NULL,
          producer_session_id TEXT NOT NULL,
          batch_id TEXT NOT NULL,
          body_hash TEXT NOT NULL,
          status TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          ack_json TEXT,
          error_code TEXT,
          received_at TEXT NOT NULL,
          projected_at TEXT,
          PRIMARY KEY (trial_id, producer_session_id, batch_id)
        );
        CREATE TABLE IF NOT EXISTS local_events (
          device_id TEXT NOT NULL,
          boot_id TEXT NOT NULL,
          device_seq INTEGER NOT NULL,
          event_hash TEXT NOT NULL,
          trial_id TEXT NOT NULL,
          stream_seq INTEGER NOT NULL,
          event_json TEXT NOT NULL,
          projected INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (device_id, boot_id, device_seq),
          UNIQUE (trial_id, stream_seq)
        );
        CREATE TABLE IF NOT EXISTS replay_frames (
          trial_id TEXT NOT NULL,
          stream_seq INTEGER NOT NULL,
          frame_json TEXT NOT NULL,
          PRIMARY KEY (trial_id, stream_seq)
        );
      `);
      const pending = this.sql
        .exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM local_batches WHERE status = 'pending'",
        )
        .one().count;
      if (pending > 0 && (await ctx.storage.getAlarm()) === null) {
        await ctx.storage.setAlarm(Date.now() + RETRY_AFTER_MS);
      }
    });
  }

  private benchId(): string {
    return (
      this.sql
        .exec<{ value: string }>("SELECT value FROM bench_meta WHERE key = 'bench_id'")
        .toArray()[0]?.value ?? ''
    );
  }

  private setBenchId(benchId: string): Extract<CoordinatorResult<never>, { ok: false }> | null {
    const existing = this.benchId();
    if (existing && existing !== benchId) {
      return {
        ok: false,
        status: 409,
        code: 'bench_identity_conflict',
        message: 'Coordinator is already bound to another bench',
      };
    }
    if (!existing) {
      this.sql.exec("INSERT INTO bench_meta (key, value) VALUES ('bench_id', ?)", benchId);
    }
    return null;
  }

  private session(sessionId: string): SessionRow | undefined {
    return this.sql
      .exec<SessionRow>('SELECT * FROM producer_sessions WHERE session_id = ?', sessionId)
      .toArray()[0];
  }

  private trial(trialId: string): TrialRow | undefined {
    return this.sql
      .exec<TrialRow>('SELECT * FROM local_trials WHERE trial_id = ?', trialId)
      .toArray()[0];
  }

  private activeTrial(): TrialRow | undefined {
    return this.sql
      .exec<TrialRow>(
        "SELECT * FROM local_trials WHERE state IN ('created', 'running', 'completing') ORDER BY created_at DESC LIMIT 1",
      )
      .toArray()[0];
  }

  private latestSession(): SessionRow | undefined {
    return this.sql
      .exec<SessionRow>(
        'SELECT * FROM producer_sessions ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1',
      )
      .toArray()[0];
  }

  private latestCompletedTrialId(): string | null {
    return (
      this.sql
        .exec<{ trial_id: string }>(
          "SELECT trial_id FROM local_trials WHERE state = 'complete' ORDER BY completed_at DESC LIMIT 1",
        )
        .toArray()[0]?.trial_id ?? null
    );
  }

  async createProducerSession(
    command: SessionCommand,
  ): Promise<CoordinatorResult<BenchSessionCreatedV1>> {
    const conflict = this.setBenchId(command.benchId);
    if (conflict) return conflict;
    const active = this.activeTrial();
    if (active) {
      return {
        ok: false,
        status: 409,
        code: 'trial_active',
        message: 'Cannot replace the producer session while a trial is active',
      };
    }

    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM producer_sessions');
      this.sql.exec(
        `INSERT INTO producer_sessions
          (session_id, actor_subject, actor_email, device_id, boot_id, firmware_version,
           lease_hash, lease_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        command.benchSessionId,
        command.actor.subject,
        command.actor.email,
        command.input.deviceId,
        command.input.bootId,
        command.input.firmwareVersion,
        command.leaseHash,
        command.expiresAt,
        command.now,
      );
    });

    this.ctx.waitUntil(
      this.env.DB.prepare(
        `INSERT INTO bench_devices (id, last_seen_at, last_firmware_version)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           last_seen_at = excluded.last_seen_at,
           last_firmware_version = excluded.last_firmware_version`,
      )
        .bind(command.input.deviceId, command.now, command.input.firmwareVersion)
        .run()
        .catch((error) => {
          console.warn(
            JSON.stringify({
              event: 'bench_device_audit_failed',
              benchId: command.benchId,
              message: String(error),
            }),
          );
        }),
    );
    this.broadcastBench(command.now);
    return {
      ok: true,
      status: 201,
      value: {
        schema: 'tnp.calibration.bench-session.v1',
        benchId: command.benchId,
        benchSessionId: command.benchSessionId,
        benchLease: '',
        leaseExpiresAt: command.expiresAt,
        heartbeatUrl: `/api/v1/operator/benches/${command.benchId}/sessions/${command.benchSessionId}/heartbeats`,
      },
    };
  }

  async recordHeartbeat(
    command: HeartbeatCommand,
  ): Promise<CoordinatorResult<BenchHeartbeatAckV1>> {
    if (this.benchId() !== command.benchId) {
      return {
        ok: false,
        status: 404,
        code: 'bench_not_found',
        message: 'Bench session does not exist',
      };
    }
    const session = this.session(command.benchSessionId);
    if (!session)
      return {
        ok: false,
        status: 404,
        code: 'session_not_found',
        message: 'Producer session does not exist',
      };
    if (
      session.actor_subject !== command.actor.subject ||
      session.lease_hash !== command.leaseHash
    ) {
      return {
        ok: false,
        status: 403,
        code: 'producer_lease_invalid',
        message: 'Bench producer lease is invalid',
      };
    }
    if (!after(session.lease_expires_at, command.now)) {
      return {
        ok: false,
        status: 409,
        code: 'producer_lease_expired',
        message: 'Bench producer lease has expired',
      };
    }
    if (session.device_id !== command.frame.deviceId || session.boot_id !== command.frame.bootId) {
      return {
        ok: false,
        status: 409,
        code: 'device_identity_mismatch',
        message: 'Heartbeat device identity changed',
      };
    }
    if (this.activeTrial()) {
      return {
        ok: false,
        status: 409,
        code: 'trial_event_requires_batch',
        message: 'Use the active trial batch route',
      };
    }
    if (session.last_seq !== null && command.frame.seq <= session.last_seq) {
      if (command.frame.seq === session.last_seq) {
        return {
          ok: true,
          status: 200,
          value: {
            schema: 'tnp.calibration.bench-heartbeat-ack.v1',
            benchId: command.benchId,
            benchSessionId: command.benchSessionId,
            deviceId: command.frame.deviceId,
            bootId: command.frame.bootId,
            seq: command.frame.seq,
            durableAt: session.latest_durable_at ?? command.now,
            leaseExpiresAt: session.lease_expires_at,
          },
        };
      }
      return {
        ok: false,
        status: 409,
        code: 'device_sequence_rewind',
        message: 'Heartbeat sequence moved backwards',
      };
    }

    this.sql.exec(
      `UPDATE producer_sessions
          SET last_seen_at = ?, last_seq = ?, expected_interval_ms = ?,
              latest_durable_at = ?, lease_expires_at = ?
        WHERE session_id = ?`,
      command.now,
      command.frame.seq,
      command.frame.expectedEventIntervalMs,
      command.now,
      command.expiresAt,
      command.benchSessionId,
    );
    this.broadcastBench(command.now);
    return {
      ok: true,
      status: 200,
      value: {
        schema: 'tnp.calibration.bench-heartbeat-ack.v1',
        benchId: command.benchId,
        benchSessionId: command.benchSessionId,
        deviceId: command.frame.deviceId,
        bootId: command.frame.bootId,
        seq: command.frame.seq,
        durableAt: command.now,
        leaseExpiresAt: command.expiresAt,
      },
    };
  }

  async startTrial(command: StartTrialCommand): Promise<CoordinatorResult<TrialCreatedV1>> {
    if (this.benchId() !== command.input.benchId) {
      return {
        ok: false,
        status: 404,
        code: 'bench_not_found',
        message: 'Create a producer session for this bench first',
      };
    }
    const session = this.session(command.input.benchSessionId);
    if (!session)
      return {
        ok: false,
        status: 404,
        code: 'session_not_found',
        message: 'Bench producer session does not exist',
      };
    if (
      session.actor_subject !== command.actor.subject ||
      session.lease_hash !== command.benchLeaseHash ||
      !after(session.lease_expires_at, command.now)
    ) {
      return {
        ok: false,
        status: 403,
        code: 'bench_lease_invalid',
        message: 'Bench producer lease is invalid or expired',
      };
    }
    if (session.device_id !== command.input.deviceId || session.boot_id !== command.input.bootId) {
      return {
        ok: false,
        status: 409,
        code: 'device_identity_mismatch',
        message: 'Trial device identity does not match the bench session',
      };
    }
    if (this.activeTrial()) {
      return {
        ok: false,
        status: 409,
        code: 'trial_active',
        message: 'This bench already has an active trial',
      };
    }

    const specimen = await this.env.DB.prepare(
      'SELECT pump_model_id FROM pump_specimens WHERE id = ?',
    )
      .bind(command.input.pumpSpecimenId)
      .first<{ pump_model_id: string }>();
    if (!specimen) {
      return {
        ok: false,
        status: 422,
        code: 'pump_specimen_not_registered',
        message: 'Register the physical pump specimen before starting a trial',
      };
    }
    if (specimen.pump_model_id !== command.input.pumpModelId) {
      return {
        ok: false,
        status: 409,
        code: 'pump_model_mismatch',
        message: 'Pump specimen belongs to a different model',
      };
    }
    const scale = await this.env.DB.prepare(
      `SELECT bench_device_id, counts_per_gram_numerator, counts_per_gram_denominator
         FROM load_cell_calibrations WHERE id = ? AND accepted_at IS NOT NULL`,
    )
      .bind(command.input.loadCellCalibrationId)
      .first<{
        bench_device_id: string;
        counts_per_gram_numerator: number;
        counts_per_gram_denominator: number;
      }>();
    if (!scale) {
      return {
        ok: false,
        status: 422,
        code: 'load_cell_calibration_not_registered',
        message: 'Register and independently check the load-cell calibration first',
      };
    }
    if (
      scale.bench_device_id !== command.input.deviceId ||
      scale.counts_per_gram_numerator !== command.input.loadCellCountsPerGramNumerator ||
      scale.counts_per_gram_denominator !== command.input.loadCellCountsPerGramDenominator
    ) {
      return {
        ok: false,
        status: 409,
        code: 'load_cell_calibration_mismatch',
        message: 'Trial scale device or coefficients do not match the accepted calibration',
      };
    }

    try {
      const statements = [
        this.env.DB.prepare(
          `INSERT INTO trials
            (id, bench_id, bench_session_id, producer_session_id, producer_lease_expires_at,
             access_subject, device_id, boot_id, pump_specimen_id, pump_model_id,
             load_cell_calibration_id, state,
             transport, firmware_version, protocol_version, fluid_json, setup_json, plan_json,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          command.trialId,
          command.input.benchId,
          command.input.benchSessionId,
          command.producerSessionId,
          command.expiresAt,
          command.actor.subject,
          command.input.deviceId,
          command.input.bootId,
          command.input.pumpSpecimenId,
          command.input.pumpModelId,
          command.input.loadCellCalibrationId,
          command.input.transport,
          command.input.firmwareVersion,
          command.input.protocolVersion,
          JSON.stringify(command.input.fluid),
          JSON.stringify(command.input.setup),
          JSON.stringify(command.input.plan),
          command.now,
          command.now,
        ),
        ...command.input.plan.steps.map((step) =>
          this.env.DB.prepare(
            `INSERT INTO trial_steps
              (trial_id, step_index, repeat_index, direction, duty_basis_points, plan_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).bind(
            command.trialId,
            step.stepIndex,
            step.repeatIndex,
            step.direction,
            step.dutyBasisPoints,
            JSON.stringify(step),
          ),
        ),
      ];
      await this.env.DB.batch(statements);
    } catch (error) {
      const message = String(error);
      if (message.includes('one_active_trial_per_bench') || message.includes('UNIQUE constraint')) {
        return {
          ok: false,
          status: 409,
          code: 'trial_active',
          message: 'This bench already has an active trial',
        };
      }
      throw error;
    }

    this.sql.exec(
      `INSERT INTO local_trials
        (trial_id, bench_session_id, producer_session_id, actor_subject, device_id, boot_id,
         pump_specimen_id, plan_json, producer_lease_hash, lease_expires_at, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?)`,
      command.trialId,
      command.input.benchSessionId,
      command.producerSessionId,
      command.actor.subject,
      command.input.deviceId,
      command.input.bootId,
      command.input.pumpSpecimenId,
      JSON.stringify(command.input.plan),
      command.producerLeaseHash,
      command.expiresAt,
      command.now,
    );
    this.broadcastBench(command.now);
    return {
      ok: true,
      status: 201,
      value: {
        schema: 'tnp.calibration.trial-created.v1',
        trial: {
          id: command.trialId,
          benchId: command.input.benchId,
          state: 'created',
          createdAt: command.now,
        },
        producer: {
          producerSessionId: command.producerSessionId,
          producerLease: '',
          leaseExpiresAt: command.expiresAt,
        },
        ingest: {
          url: `/api/v1/operator/trials/${command.trialId}/batches`,
          maxEventsPerBatch: 25,
          maxBodyBytes: 131072,
        },
      },
    };
  }

  private localBatch(batch: IngestBatchV1): BatchRow | undefined {
    return this.sql
      .exec<BatchRow>(
        `SELECT body_hash, status, ack_json, payload_json, error_code
           FROM local_batches
          WHERE trial_id = ? AND producer_session_id = ? AND batch_id = ?`,
        batch.trialId,
        batch.producerSessionId,
        batch.batchId,
      )
      .toArray()[0];
  }

  private semanticEventError(
    trial: TrialRow,
    event: DeviceFrameV1,
  ): Extract<CoordinatorResult<never>, { ok: false }> | null {
    const plan = JSON.parse(trial.plan_json) as CreateTrialV1['plan'];
    const stepFor = (stepIndex: number) =>
      plan.steps.find((candidate) => candidate.stepIndex === stepIndex);
    const invalid = (message: string): Extract<CoordinatorResult<never>, { ok: false }> => ({
      ok: false,
      status: 422,
      code: 'event_plan_mismatch',
      message,
    });

    if (event.type === 'sample') {
      if (event.stepIndex === null || event.pumpSpecimenId === null) {
        if (event.stepIndex !== null || event.pumpSpecimenId !== null) {
          return invalid('Sample step and pump binding disagree');
        }
        if (!['tare', 'armed', 'fault'].includes(event.state)) {
          return invalid(`State ${event.state} cannot emit an unbound trial sample`);
        }
        if (event.motorOn || event.dutyBasisPoints !== 0 || event.dutyTimerCount !== 0) {
          return invalid('Unbound tare/armed/fault samples must prove the pump is off');
        }
        return null;
      }
      const step = stepFor(event.stepIndex);
      if (!step) return invalid(`Device step ${event.stepIndex} is absent from the stored plan`);
      if (event.pumpSpecimenId !== trial.pump_specimen_id) {
        return invalid('Sample pump specimen does not match the trial specimen');
      }
      if (event.dutyBasisPoints !== step.dutyBasisPoints) {
        return invalid('Sample duty does not match the stored trial step');
      }
      if (event.state === 'running') {
        if (!event.motorOn || event.dutyTimerCount !== timerCountForDuty(step.dutyBasisPoints)) {
          return invalid('Running sample motor state or Timer1 count does not match the plan');
        }
      } else if (event.state === 'settling' || event.state === 'fault') {
        if (event.motorOn || event.dutyTimerCount !== 0) {
          return invalid('Settling/fault sample must preserve step provenance with the motor off');
        }
      }
      return null;
    }

    if (event.type !== 'state') return null;
    if (!event.detail) return invalid('State event is missing canonical step and duty detail');
    let detail: Record<string, unknown>;
    try {
      const parsed = JSON.parse(event.detail) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return invalid('State event detail is not an object');
      }
      detail = parsed as Record<string, unknown>;
    } catch {
      return invalid('State event detail is not valid JSON');
    }
    const stepIndex = detail.stepIndex;
    const pumpSpecimenId = detail.pumpSpecimenId;
    const dutyBasisPoints = detail.dutyBasisPoints;
    if (!Number.isInteger(dutyBasisPoints)) {
      return invalid('State event duty detail is missing or invalid');
    }
    const unbound = stepIndex === null && pumpSpecimenId === null;
    const bound = Number.isInteger(stepIndex) && typeof pumpSpecimenId === 'string';
    if (!unbound && !bound) return invalid('State event step and pump detail disagree');
    if (unbound) {
      if (dutyBasisPoints !== 0) return invalid('Unbound state event must report zero duty');
      // Firmware COMPLETE retains the finished step and its commanded duty even
      // though the motor is already off. STOP emits unbound IDLE, while a fault
      // before any run step can legitimately remain unbound.
      if (['running', 'settling', 'complete'].includes(event.state)) {
        return invalid(`${event.state} state event must identify its plan step`);
      }
      return null;
    }
    const step = stepFor(Number(stepIndex));
    if (!step) return invalid(`Device step ${String(stepIndex)} is absent from the stored plan`);
    if (pumpSpecimenId !== trial.pump_specimen_id) {
      return invalid('State event pump specimen does not match the trial specimen');
    }
    if (dutyBasisPoints !== step.dutyBasisPoints) {
      return invalid('State event duty does not match the stored trial step');
    }
    if (!['running', 'settling', 'complete', 'fault'].includes(event.state)) {
      return invalid(`State ${event.state} cannot retain a running-step binding`);
    }
    return null;
  }

  async ingestBatch(
    command: IngestCommand,
  ): Promise<CoordinatorResult<BatchAckV1 | ProjectionQueuedV1>> {
    const trial = this.trial(command.batch.trialId);
    if (!trial)
      return {
        ok: false,
        status: 404,
        code: 'trial_not_found',
        message: 'Trial does not exist on this bench',
      };
    if (
      trial.actor_subject !== command.actor.subject ||
      trial.producer_session_id !== command.batch.producerSessionId ||
      trial.producer_lease_hash !== command.leaseHash
    ) {
      return {
        ok: false,
        status: 403,
        code: 'producer_lease_invalid',
        message: 'Trial producer lease is invalid',
      };
    }
    if (trial.device_id !== command.batch.deviceId || trial.boot_id !== command.batch.bootId) {
      return {
        ok: false,
        status: 409,
        code: 'device_identity_mismatch',
        message: 'Batch device identity does not match the trial',
      };
    }
    const priorBatch = this.localBatch(command.batch);
    if (priorBatch) {
      if (priorBatch.body_hash !== command.bodyHash) {
        return {
          ok: false,
          status: 409,
          code: 'batch_identity_conflict',
          message: 'Batch ID was reused with different HTTP bytes',
        };
      }
      if (priorBatch.status === 'projected' && priorBatch.ack_json) {
        return { ok: true, status: 200, value: JSON.parse(priorBatch.ack_json) as BatchAckV1 };
      }
      if (priorBatch.status === 'rejected') {
        return {
          ok: false,
          status: 409,
          code: priorBatch.error_code ?? 'event_identity_conflict',
          message: 'Batch conflicts with immutable event history',
        };
      }
      await this.drainPending();
      const drained = this.localBatch(command.batch);
      if (drained?.status === 'projected' && drained.ack_json) {
        return { ok: true, status: 200, value: JSON.parse(drained.ack_json) as BatchAckV1 };
      }
      return {
        ok: true,
        status: 202,
        value: {
          schema: 'tnp.calibration.queued.v1',
          batchId: command.batch.batchId,
          producerSessionId: command.batch.producerSessionId,
          state: 'pending_projection',
          retryAfterMs: RETRY_AFTER_MS,
        },
      };
    }
    if (!after(trial.lease_expires_at, command.receivedAt)) {
      return {
        ok: false,
        status: 409,
        code: 'producer_lease_expired',
        message: 'Trial producer lease has expired',
      };
    }
    if (!['created', 'running'].includes(trial.state)) {
      return {
        ok: false,
        status: 409,
        code: 'trial_not_writable',
        message: `Trial is ${trial.state}`,
      };
    }
    for (const item of command.events) {
      const semanticError = this.semanticEventError(trial, item.event);
      if (semanticError) return semanticError;
    }
    this.sql.exec(
      'UPDATE local_trials SET lease_expires_at = ? WHERE trial_id = ?',
      command.expiresAt,
      command.batch.trialId,
    );

    const novel: PendingProjection['novel'] = [];
    let duplicates = 0;
    let pendingDependency = false;
    let nextStream = trial.next_stream_seq;
    for (const item of command.events) {
      const existing = this.sql
        .exec<LocalEventRow>(
          `SELECT event_hash, trial_id, stream_seq, projected
             FROM local_events WHERE device_id = ? AND boot_id = ? AND device_seq = ?`,
          item.event.deviceId,
          item.event.bootId,
          item.event.seq,
        )
        .toArray()[0];
      if (existing) {
        if (existing.event_hash !== item.hash || existing.trial_id !== command.batch.trialId) {
          return {
            ok: false,
            status: 409,
            code: 'event_identity_conflict',
            message: 'Device event identity was reused with different content or trial',
          };
        }
        duplicates += 1;
        pendingDependency ||= existing.projected === 0;
      } else {
        novel.push({ ...item, streamSeq: nextStream });
        nextStream += 1;
      }
    }
    if (pendingDependency) {
      await this.ctx.storage.setAlarm(Date.now() + RETRY_AFTER_MS);
      return {
        ok: true,
        status: 202,
        value: {
          schema: 'tnp.calibration.queued.v1',
          batchId: command.batch.batchId,
          producerSessionId: command.batch.producerSessionId,
          state: 'pending_projection',
          retryAfterMs: RETRY_AFTER_MS,
        },
      };
    }

    const payload: PendingProjection = {
      batch: command.batch,
      novel,
      accepted: novel.length,
      duplicates,
      receivedAt: command.receivedAt,
    };
    const lastEvent = command.batch.events.at(-1);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO local_batches
          (trial_id, producer_session_id, batch_id, body_hash, status, payload_json, received_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        command.batch.trialId,
        command.batch.producerSessionId,
        command.batch.batchId,
        command.bodyHash,
        JSON.stringify(payload),
        command.receivedAt,
      );
      for (const item of novel) {
        this.sql.exec(
          `INSERT INTO local_events
            (device_id, boot_id, device_seq, event_hash, trial_id, stream_seq, event_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          item.event.deviceId,
          item.event.bootId,
          item.event.seq,
          item.hash,
          command.batch.trialId,
          item.streamSeq,
          JSON.stringify(item.event),
        );
      }
      this.sql.exec(
        `UPDATE local_trials
            SET next_stream_seq = ?, first_device_seq = COALESCE(first_device_seq, ?),
                last_event_received_at = ?, expected_interval_ms = ?, latest_device_state = ?, state = 'running'
          WHERE trial_id = ?`,
        nextStream,
        command.batch.firstSeq,
        command.receivedAt,
        lastEvent && 'expectedEventIntervalMs' in lastEvent
          ? lastEvent.expectedEventIntervalMs
          : 100,
        lastEvent && 'state' in lastEvent ? lastEvent.state : 'idle',
        command.batch.trialId,
      );
    });

    const projected = await this.projectBatch(
      command.batch.trialId,
      command.batch.producerSessionId,
      command.batch.batchId,
    );
    if (projected.ok || projected.status === 409) return projected;
    await this.ctx.storage.setAlarm(Date.now() + RETRY_AFTER_MS);
    return {
      ok: true,
      status: 202,
      value: {
        schema: 'tnp.calibration.queued.v1',
        batchId: command.batch.batchId,
        producerSessionId: command.batch.producerSessionId,
        state: 'pending_projection',
        retryAfterMs: RETRY_AFTER_MS,
      },
    };
  }

  private projectedFrontier(trialId: string, firstDeviceSeq: number): number {
    const sequences = this.sql
      .exec<{ device_seq: number }>(
        'SELECT device_seq FROM local_events WHERE trial_id = ? AND projected = 1 ORDER BY device_seq',
        trialId,
      )
      .toArray();
    let contiguous = firstDeviceSeq - 1;
    for (const { device_seq: sequence } of sequences) {
      if (sequence === contiguous + 1) contiguous = sequence;
      else if (sequence > contiguous + 1) break;
    }
    return contiguous;
  }

  private missingRanges(trialId: string, first: number, last: number): Array<[number, number]> {
    const present = new Set(
      this.sql
        .exec<{ device_seq: number }>(
          'SELECT device_seq FROM local_events WHERE trial_id = ? AND projected = 1 AND device_seq BETWEEN ? AND ?',
          trialId,
          first,
          last,
        )
        .toArray()
        .map(({ device_seq }) => device_seq),
    );
    const ranges: Array<[number, number]> = [];
    let rangeStart: number | null = null;
    for (let sequence = first; sequence <= last; sequence += 1) {
      if (!present.has(sequence) && rangeStart === null) rangeStart = sequence;
      if (present.has(sequence) && rangeStart !== null) {
        ranges.push([rangeStart, sequence - 1]);
        rangeStart = null;
      }
    }
    if (rangeStart !== null) ranges.push([rangeStart, last]);
    return ranges.slice(0, 64);
  }

  private async projectBatch(
    trialId: string,
    producerSessionId: string,
    batchId: string,
  ): Promise<CoordinatorResult<BatchAckV1>> {
    const row = this.sql
      .exec<BatchRow>(
        `SELECT body_hash, status, ack_json, payload_json, error_code
           FROM local_batches WHERE trial_id = ? AND producer_session_id = ? AND batch_id = ?`,
        trialId,
        producerSessionId,
        batchId,
      )
      .toArray()[0];
    if (!row)
      return {
        ok: false,
        status: 404,
        code: 'batch_not_found',
        message: 'Batch journal entry does not exist',
      };
    if (row.status === 'projected' && row.ack_json) {
      return { ok: true, status: 200, value: JSON.parse(row.ack_json) as BatchAckV1 };
    }
    const payload = JSON.parse(row.payload_json) as PendingProjection;
    const projectedAt = isoNow();
    const publishedStreamSeq =
      payload.novel.at(-1)?.streamSeq ?? this.trial(trialId)?.published_stream_seq ?? 0;

    const remoteBatch = await this.env.DB.prepare(
      `SELECT body_sha256 FROM ingest_batches
        WHERE trial_id = ? AND producer_session_id = ? AND batch_id = ?`,
    )
      .bind(trialId, producerSessionId, batchId)
      .first<{ body_sha256: string }>();
    if (remoteBatch && remoteBatch.body_sha256 !== row.body_hash) {
      this.sql.exec(
        "UPDATE local_batches SET status = 'rejected', error_code = 'batch_identity_conflict' WHERE trial_id = ? AND producer_session_id = ? AND batch_id = ?",
        trialId,
        producerSessionId,
        batchId,
      );
      return {
        ok: false,
        status: 409,
        code: 'batch_identity_conflict',
        message: 'D1 contains a different body for this batch identity',
      };
    }

    const remoteEvents = new Map<
      string,
      { event_sha256: string; trial_id: string; stream_seq: number }
    >();
    if (payload.novel.length > 0) {
      const where = payload.novel
        .map(() => '(device_id = ? AND boot_id = ? AND device_seq = ?)')
        .join(' OR ');
      const bindings = payload.novel.flatMap(({ event }) => [
        event.deviceId,
        event.bootId,
        event.seq,
      ]);
      const found = await this.env.DB.prepare(
        `SELECT device_id, boot_id, device_seq, event_sha256, trial_id, stream_seq
           FROM device_events WHERE ${where}`,
      )
        .bind(...bindings)
        .all<{
          device_id: string;
          boot_id: string;
          device_seq: number;
          event_sha256: string;
          trial_id: string;
          stream_seq: number;
        }>();
      for (const event of found.results) {
        remoteEvents.set(
          `${event.device_id}\u0000${event.boot_id}\u0000${event.device_seq}`,
          event,
        );
      }
    }
    let remoteEventConflict = false;
    const novelToWrite = payload.novel.filter((item) => {
      const existing = remoteEvents.get(
        `${item.event.deviceId}\u0000${item.event.bootId}\u0000${item.event.seq}`,
      );
      if (!existing) return true;
      if (
        existing.event_sha256 !== item.hash ||
        existing.trial_id !== trialId ||
        existing.stream_seq !== item.streamSeq
      ) {
        remoteEventConflict = true;
      }
      return false;
    });
    if (remoteEventConflict) {
      this.sql.exec(
        "UPDATE local_batches SET status = 'rejected', error_code = 'event_identity_conflict' WHERE trial_id = ? AND producer_session_id = ? AND batch_id = ?",
        trialId,
        producerSessionId,
        batchId,
      );
      return {
        ok: false,
        status: 409,
        code: 'event_identity_conflict',
        message: 'D1 contains different content for a device event identity',
      };
    }

    const projectingTrial = this.trial(trialId);
    if (!projectingTrial) {
      return {
        ok: false,
        status: 404,
        code: 'trial_not_found',
        message: 'Trial disappeared before projection',
      };
    }
    const statements: D1PreparedStatement[] = [];
    if (!remoteBatch) {
      statements.push(
        this.env.DB.prepare(
          `INSERT INTO ingest_batches
          (trial_id, producer_session_id, batch_id, body_sha256, device_id, boot_id,
           first_seq, last_seq, event_count, accepted_count, duplicate_count, received_at, projected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          trialId,
          producerSessionId,
          batchId,
          row.body_hash,
          payload.batch.deviceId,
          payload.batch.bootId,
          payload.batch.firstSeq,
          payload.batch.lastSeq,
          payload.batch.events.length,
          payload.accepted,
          payload.duplicates,
          payload.receivedAt,
          projectedAt,
        ),
      );
    }
    for (const group of chunks(novelToWrite, 10)) {
      const values = group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const bindings = group.flatMap(({ event, hash, streamSeq }) => [
        event.deviceId,
        event.bootId,
        event.seq,
        hash,
        trialId,
        streamSeq,
        event.type,
        event.deviceMs,
        payload.receivedAt,
        JSON.stringify(event),
      ]);
      statements.push(
        this.env.DB.prepare(
          `INSERT INTO device_events
          (device_id, boot_id, device_seq, event_sha256, trial_id, stream_seq,
           event_type, device_ms, received_at, event_json) VALUES ${values}`,
        ).bind(...bindings),
      );
    }
    const samples = novelToWrite.filter(
      (item): item is typeof item & { event: Extract<DeviceFrameV1, { type: 'sample' }> } =>
        item.event.type === 'sample',
    );
    for (const group of chunks(samples, 5)) {
      const values = group
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(',');
      const bindings = group.flatMap(({ event, streamSeq }) => [
        event.deviceId,
        event.bootId,
        event.seq,
        trialId,
        streamSeq,
        event.stepIndex,
        event.deviceMs,
        payload.receivedAt,
        event.acquisitionMode,
        event.expectedSampleIntervalMs,
        event.dutyBasisPoints,
        event.dutyTimerCount,
        event.motorOn ? 1 : 0,
        JSON.stringify(event.rawAdc),
        event.massMg,
        event.tachCount,
        event.supplyMv,
        JSON.stringify(event.faults),
      ]);
      statements.push(
        this.env.DB.prepare(
          `INSERT INTO samples
          (device_id, boot_id, device_seq, trial_id, stream_seq, step_index, device_ms,
           received_at, acquisition_mode, expected_sample_interval_ms, duty_basis_points,
           duty_timer_count, motor_on, raw_adc_json, mass_mg, tach_count, supply_mv, faults_json)
         VALUES ${values}`,
        ).bind(...bindings),
      );
    }
    const trialEvents = novelToWrite.filter((item) => item.event.type !== 'sample');
    for (const group of chunks(trialEvents, 14)) {
      const values = group.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
      const bindings = group.flatMap(({ event, streamSeq }) => [
        trialId,
        streamSeq,
        event.deviceId,
        event.bootId,
        event.seq,
        event.type,
        JSON.stringify(event),
      ]);
      statements.push(
        this.env.DB.prepare(
          `INSERT INTO trial_events
          (trial_id, stream_seq, device_id, boot_id, device_seq, event_type, event_json)
         VALUES ${values}`,
        ).bind(...bindings),
      );
    }
    statements.push(
      this.env.DB.prepare(
        `UPDATE trials
            SET state = CASE WHEN state = 'created' THEN 'running' ELSE state END,
                started_at = COALESCE(started_at, ?),
                contiguous_published_stream_seq = ?,
                producer_lease_expires_at = CASE
                  WHEN producer_lease_expires_at > ? THEN producer_lease_expires_at ELSE ? END,
                updated_at = ?
          WHERE id = ?`,
      ).bind(
        payload.receivedAt,
        publishedStreamSeq,
        projectingTrial.lease_expires_at,
        projectingTrial.lease_expires_at,
        projectedAt,
        trialId,
      ),
    );

    try {
      await this.env.DB.batch(statements);
    } catch (error) {
      const message = String(error);
      if (message.includes('UNIQUE constraint failed: device_events')) {
        this.sql.exec(
          "UPDATE local_batches SET status = 'rejected', error_code = 'event_identity_conflict' WHERE trial_id = ? AND producer_session_id = ? AND batch_id = ?",
          trialId,
          producerSessionId,
          batchId,
        );
        return {
          ok: false,
          status: 409,
          code: 'event_identity_conflict',
          message: 'Device event identity already belongs to another trial or bench',
        };
      }
      console.warn(
        JSON.stringify({
          event: 'd1_projection_queued',
          benchId: this.benchId(),
          trialId,
          batchId,
          message,
        }),
      );
      return {
        ok: false,
        status: 503,
        code: 'projection_unavailable',
        message: 'Projection is temporarily unavailable',
      };
    }

    this.ctx.storage.transactionSync(() => {
      for (const item of payload.novel) {
        this.sql.exec(
          'UPDATE local_events SET projected = 1 WHERE device_id = ? AND boot_id = ? AND device_seq = ?',
          item.event.deviceId,
          item.event.bootId,
          item.event.seq,
        );
      }
    });
    const trial = this.trial(trialId);
    if (!trial) {
      return {
        ok: false,
        status: 404,
        code: 'trial_not_found',
        message: 'Trial disappeared during projection',
      };
    }
    const firstDeviceSeq = trial.first_device_seq ?? payload.batch.firstSeq;
    const frontier = this.projectedFrontier(trialId, firstDeviceSeq);
    const missingRanges = this.missingRanges(trialId, firstDeviceSeq, payload.batch.lastSeq);
    const lastSample = [...payload.novel]
      .reverse()
      .find(
        (item): item is typeof item & { event: Extract<DeviceFrameV1, { type: 'sample' }> } =>
          item.event.type === 'sample',
      );
    const ack: BatchAckV1 = {
      schema: 'tnp.calibration.ack.v1',
      batchId,
      producerSessionId,
      deviceId: payload.batch.deviceId,
      bootId: payload.batch.bootId,
      accepted: payload.accepted,
      duplicates: payload.duplicates,
      contiguousProjectedThrough: frontier,
      missingRanges,
      publishedStreamSeq,
      serverReceivedAt: payload.receivedAt,
      projectedAt,
      trialState: 'running',
    };
    await this.env.DB.batch([
      this.env.DB.prepare(
        'UPDATE ingest_batches SET ack_json = ? WHERE trial_id = ? AND producer_session_id = ? AND batch_id = ?',
      ).bind(JSON.stringify(ack), trialId, producerSessionId, batchId),
      this.env.DB.prepare(
        'UPDATE trials SET contiguous_projected_device_seq = ?, updated_at = ? WHERE id = ?',
      ).bind(frontier, projectedAt, trialId),
    ]);
    // The local journal remains pending until D1 has both the canonical rows and
    // their durable acknowledgment. If this write fails, the alarm/retry path
    // can safely finish the projection instead of returning a locally cached
    // acknowledgment that D1 never recorded.
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `UPDATE local_trials
            SET state = 'running', published_stream_seq = ?, projected_device_seq = ?,
                latest_projected_at = ?, latest_mass_mg = COALESCE(?, latest_mass_mg),
                latest_duty_basis_points = COALESCE(?, latest_duty_basis_points)
          WHERE trial_id = ?`,
        publishedStreamSeq,
        frontier,
        projectedAt,
        lastSample?.event.massMg ?? null,
        lastSample?.event.dutyBasisPoints ?? null,
        trialId,
      );
      this.sql.exec(
        `UPDATE local_batches SET status = 'projected', ack_json = ?, projected_at = ?
          WHERE trial_id = ? AND producer_session_id = ? AND batch_id = ?`,
        JSON.stringify(ack),
        projectedAt,
        trialId,
        producerSessionId,
        batchId,
      );
    });

    if (payload.novel.length > 0) {
      const frame = this.trialFrame(
        trialId,
        'sample_batch',
        payload.novel.map(({ event }) => event),
        projectedAt,
      );
      this.sql.exec(
        'INSERT OR REPLACE INTO replay_frames (trial_id, stream_seq, frame_json) VALUES (?, ?, ?)',
        trialId,
        frame.streamSeq,
        JSON.stringify(frame),
      );
      this.sql.exec(
        `DELETE FROM replay_frames
          WHERE trial_id = ? AND stream_seq NOT IN (
            SELECT stream_seq FROM replay_frames WHERE trial_id = ? ORDER BY stream_seq DESC LIMIT ?
          )`,
        trialId,
        trialId,
        REPLAY_LIMIT,
      );
      this.broadcastTrial(trialId, frame);
    }
    this.broadcastBench(projectedAt);
    return { ok: true, status: 200, value: ack };
  }

  private async drainPending(): Promise<void> {
    const pending = this.sql
      .exec<{ trial_id: string; producer_session_id: string; batch_id: string }>(
        "SELECT trial_id, producer_session_id, batch_id FROM local_batches WHERE status = 'pending' ORDER BY received_at LIMIT 16",
      )
      .toArray();
    for (const batch of pending) {
      const result = await this.projectBatch(
        batch.trial_id,
        batch.producer_session_id,
        batch.batch_id,
      );
      if (!result.ok && result.status !== 409) {
        await this.ctx.storage.setAlarm(Date.now() + RETRY_AFTER_MS);
        return;
      }
    }
  }

  async alarm(): Promise<void> {
    await this.drainPending();
  }

  async transitionTrial(
    command: TransitionCommand,
  ): Promise<CoordinatorResult<TrialTransitionedV1>> {
    const trial = this.trial(command.trialId);
    if (!trial)
      return {
        ok: false,
        status: 404,
        code: 'trial_not_found',
        message: 'Trial does not exist on this bench',
      };
    if (
      trial.actor_subject !== command.actor.subject ||
      trial.producer_lease_hash !== command.leaseHash
    ) {
      return {
        ok: false,
        status: 403,
        code: 'producer_lease_invalid',
        message: 'Trial producer lease is invalid',
      };
    }
    if (!after(trial.lease_expires_at, command.now)) {
      return {
        ok: false,
        status: 409,
        code: 'producer_lease_expired',
        message: 'Trial producer lease has expired',
      };
    }
    if (!['created', 'running', 'completing'].includes(trial.state)) {
      return {
        ok: false,
        status: 409,
        code: 'trial_not_active',
        message: `Trial is already ${trial.state}`,
      };
    }
    const pending = this.sql
      .exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM local_batches WHERE trial_id = ? AND status = 'pending'",
        command.trialId,
      )
      .one().count;
    const maximumSequence =
      this.sql
        .exec<{ maximum: number | null }>(
          'SELECT MAX(device_seq) AS maximum FROM local_events WHERE trial_id = ?',
          command.trialId,
        )
        .one().maximum ?? 0;

    if (pending > 0) {
      return {
        ok: false,
        status: 409,
        code: 'projection_pending',
        message: 'All batches must finish D1 projection before a normal transition',
      };
    }
    if (command.transition.finalDeviceSeq !== maximumSequence) {
      return {
        ok: false,
        status: 409,
        code: 'final_sequence_mismatch',
        message: 'Final device sequence does not match durable event history',
      };
    }
    if ((trial.projected_device_seq ?? -1) < command.transition.finalDeviceSeq) {
      return {
        ok: false,
        status: 409,
        code: 'device_sequence_gap',
        message: 'Device sequence gaps remain unresolved',
      };
    }
    const first = trial.first_device_seq ?? command.transition.finalDeviceSeq;
    if (this.missingRanges(command.trialId, first, command.transition.finalDeviceSeq).length > 0) {
      return {
        ok: false,
        status: 409,
        code: 'device_sequence_gap',
        message: 'Device sequence gaps remain unresolved',
      };
    }
    const terminalRow = this.sql
      .exec<{ event_json: string }>(
        'SELECT event_json FROM local_events WHERE trial_id = ? AND device_seq = ?',
        command.trialId,
        maximumSequence,
      )
      .toArray()[0];
    const terminalEvent = terminalRow
      ? (JSON.parse(terminalRow.event_json) as DeviceFrameV1)
      : undefined;
    const terminalPumpOff =
      terminalEvent !== undefined &&
      ((terminalEvent.type === 'state' &&
        ['idle', 'complete', 'fault'].includes(terminalEvent.state)) ||
        (terminalEvent.type === 'fault' && terminalEvent.state === 'fault'));
    if (!terminalPumpOff) {
      return {
        ok: false,
        status: 409,
        code: 'terminal_pump_off_evidence_missing',
        message: 'The durable frontier does not end with a firmware pump-off state',
      };
    }
    if (
      command.transition.deviceState !== terminalEvent.state ||
      trial.latest_device_state !== terminalEvent.state
    ) {
      return {
        ok: false,
        status: 409,
        code: 'terminal_state_mismatch',
        message: 'Requested transition state does not match durable firmware evidence',
      };
    }
    if (command.kind === 'complete' && terminalEvent.state !== 'complete') {
      return {
        ok: false,
        status: 409,
        code: 'device_not_complete',
        message: 'Firmware has not durably reported the complete, pump-off state',
      };
    }

    const state = command.kind === 'complete' ? 'complete' : 'aborted';
    await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE trials SET state = ?, completed_at = ?, updated_at = ?,
                private_notes = CASE WHEN ? IS NULL THEN private_notes ELSE ? END
          WHERE id = ?`,
      ).bind(
        state,
        command.now,
        command.now,
        command.transition.reason,
        command.transition.reason,
        command.trialId,
      ),
      this.env.DB.prepare(
        `INSERT INTO trial_transitions
          (id, trial_id, transition_kind, evidence_status, from_state, to_state,
           final_device_seq, reason,
           actor_subject, actor_email, actor_auth_mode, occurred_at)
         VALUES (?, ?, ?, 'terminal_verified', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `tt_${crypto.randomUUID()}`,
        command.trialId,
        command.kind,
        trial.state,
        state,
        command.transition.finalDeviceSeq,
        command.transition.reason,
        command.actor.subject,
        command.actor.email,
        command.actor.authMode,
        command.now,
      ),
    ]);
    this.sql.exec(
      'UPDATE local_trials SET state = ?, completed_at = ? WHERE trial_id = ?',
      state,
      command.now,
      command.trialId,
    );
    this.broadcastTrial(
      command.trialId,
      this.trialFrame(command.trialId, 'state', [], command.now),
    );
    this.broadcastBench(command.now);
    return {
      ok: true,
      status: 200,
      value: {
        schema: 'tnp.calibration.trial-transitioned.v1',
        trialId: command.trialId,
        state,
        durableAt: command.now,
        finalDeviceSeq: command.transition.finalDeviceSeq,
      },
    };
  }

  async forceAbortExpiredTrial(
    command: ForceAbortCommand,
  ): Promise<CoordinatorResult<TrialForceAbortedV1>> {
    const canonical = await this.env.DB.prepare(
      `SELECT bench_id, state, producer_lease_expires_at
         FROM trials WHERE id = ?`,
    )
      .bind(command.trialId)
      .first<{
        bench_id: string;
        state: TrialState;
        producer_lease_expires_at: string;
      }>();
    if (!canonical || canonical.bench_id !== this.benchId()) {
      return {
        ok: false,
        status: 404,
        code: 'trial_not_found',
        message: 'Trial does not exist on this bench',
      };
    }
    if (!['created', 'running', 'completing'].includes(canonical.state)) {
      return {
        ok: false,
        status: 409,
        code: 'trial_not_active',
        message: `Trial is already ${canonical.state}`,
      };
    }
    const local = this.trial(command.trialId);
    const previousLeaseExpiresAt =
      local && Date.parse(local.lease_expires_at) > Date.parse(canonical.producer_lease_expires_at)
        ? local.lease_expires_at
        : canonical.producer_lease_expires_at;
    if (after(previousLeaseExpiresAt, command.now)) {
      return {
        ok: false,
        status: 409,
        code: 'producer_lease_still_active',
        message: 'The producer lease is still active; use the ordinary authenticated transition',
      };
    }

    await this.drainPending();
    const pending = this.sql
      .exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM local_batches WHERE trial_id = ? AND status = 'pending'",
        command.trialId,
      )
      .one().count;
    if (pending > 0) {
      return {
        ok: false,
        status: 409,
        code: 'projection_pending',
        message: 'Pending evidence must finish projection before forced recovery',
      };
    }

    await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE trials
            SET state = 'aborted', completed_at = ?, updated_at = ?,
                private_notes = COALESCE(private_notes, ?)
          WHERE id = ? AND state IN ('created', 'running', 'completing')`,
      ).bind(command.now, command.now, command.reason, command.trialId),
      this.env.DB.prepare(
        `INSERT INTO trial_transitions
          (id, trial_id, transition_kind, evidence_status, from_state, to_state,
           final_device_seq, reason,
           actor_subject, actor_email, actor_auth_mode, occurred_at)
         VALUES (?, ?, 'forced_abort_expired_lease', 'forced_missing', ?, 'aborted',
                 NULL, ?, ?, ?, ?, ?)`,
      ).bind(
        `tt_${crypto.randomUUID()}`,
        command.trialId,
        canonical.state,
        command.reason,
        command.actor.subject,
        command.actor.email,
        command.actor.authMode,
        command.now,
      ),
    ]);
    if (local) {
      this.sql.exec(
        "UPDATE local_trials SET state = 'aborted', completed_at = ? WHERE trial_id = ?",
        command.now,
        command.trialId,
      );
      this.broadcastTrial(
        command.trialId,
        this.trialFrame(command.trialId, 'state', [], command.now),
      );
    }
    this.broadcastBench(command.now);
    return {
      ok: true,
      status: 200,
      value: {
        schema: 'tnp.calibration.trial-force-aborted.v1',
        trialId: command.trialId,
        state: 'aborted',
        forced: true,
        durableAt: command.now,
        reason: command.reason,
        previousLeaseExpiresAt,
      },
    };
  }

  async getSnapshot(): Promise<{
    presence: BenchPresenceV1;
    activeTrialId: string | null;
    latestCompletedTrialId: string | null;
  }> {
    const now = isoNow();
    const session = this.latestSession();
    const trial = this.activeTrial();
    const presence: BenchPresenceV1 = session
      ? {
          producerLeasePresent: after(session.lease_expires_at, now),
          producerLastSeenAt: session.last_seen_at,
          expectedEventIntervalMs: trial?.expected_interval_ms ?? session.expected_interval_ms,
          deviceId: session.device_id,
          bootId: session.boot_id,
          latestDeviceEventReceivedAt: trial?.last_event_received_at ?? session.last_seen_at,
          latestDurableAt: trial?.latest_projected_at ?? session.latest_durable_at,
          durabilityScope: trial?.latest_projected_at
            ? 'trial_d1'
            : session.latest_durable_at
              ? 'bench_do'
              : null,
          lastDurablyAcknowledgedDeviceSeq: trial?.projected_device_seq ?? session.last_seq,
          latestProjectedAt: trial?.latest_projected_at ?? null,
          lastProjectedDeviceSeq: trial?.projected_device_seq ?? null,
          publishedStreamSeq: trial?.published_stream_seq ?? null,
        }
      : { ...EMPTY_PRESENCE };
    return {
      presence,
      activeTrialId: trial?.trial_id ?? null,
      latestCompletedTrialId: this.latestCompletedTrialId(),
    };
  }

  private async benchFrame(now = isoNow()): Promise<BenchStreamFrameV1> {
    const snapshot = await this.getSnapshot();
    return {
      schema: 'tnp.calibration.bench-stream.v1',
      benchId: this.benchId(),
      serverNow: now,
      ...snapshot,
    };
  }

  private trialFrame(
    trialId: string,
    type: TrialStreamFrameV1['type'],
    events: DeviceFrameV1[],
    serverReceivedAt = isoNow(),
  ): TrialStreamFrameV1 {
    const trial = this.trial(trialId);
    if (!trial) throw new Error('trial not found');
    return {
      schema: 'tnp.calibration.stream.v1',
      type,
      trialId,
      streamSeq: trial.published_stream_seq,
      serverReceivedAt,
      events,
      health: {
        expectedEventIntervalMs: trial.expected_interval_ms ?? 100,
        producerLastSeenAt: this.session(trial.bench_session_id)?.last_seen_at ?? null,
        latestDeviceEventReceivedAt: trial.last_event_received_at,
        latestProjectedAt: trial.latest_projected_at,
        deviceId: trial.device_id,
        bootId: trial.boot_id,
        contiguousProjectedDeviceSeq: trial.projected_device_seq,
        publishedThrough: trial.published_stream_seq,
      },
      latest: {
        state: trial.state,
        massMg: trial.latest_mass_mg,
        dutyBasisPoints: trial.latest_duty_basis_points,
        provisionalFlowUlPerSec: null,
      },
    };
  }

  private broadcastBench(now = isoNow()): void {
    this.ctx.waitUntil(
      this.benchFrame(now).then((frame) => {
        for (const socket of this.ctx.getWebSockets('bench')) safeSend(socket, frame);
      }),
    );
  }

  private broadcastTrial(trialId: string, frame: TrialStreamFrameV1): void {
    for (const socket of this.ctx.getWebSockets(`trial:${trialId}`)) safeSend(socket, frame);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? 'bench';
    const trialId = url.searchParams.get('trialId');
    const afterSequence = Math.max(
      0,
      Number.parseInt(url.searchParams.get('after') ?? '0', 10) || 0,
    );
    if (scope === 'trial' && (!trialId || !this.trial(trialId))) {
      return new Response('Trial not found', { status: 404 });
    }
    // biome-ignore lint/correctness/noUndeclaredVariables: Cloudflare runtime global.
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const tags = scope === 'trial' && trialId ? [`trial:${trialId}`] : ['bench'];
    this.ctx.acceptWebSocket(server, tags);
    server.serializeAttachment({ scope, trialId, afterSequence });
    if (scope === 'trial' && trialId) {
      safeSend(server, this.trialFrame(trialId, 'snapshot', []));
      const frames = this.sql
        .exec<{ stream_seq: number; frame_json: string }>(
          'SELECT stream_seq, frame_json FROM replay_frames WHERE trial_id = ? AND stream_seq > ? ORDER BY stream_seq',
          trialId,
          afterSequence,
        )
        .toArray();
      const oldest = this.sql
        .exec<{ stream_seq: number }>(
          'SELECT stream_seq FROM replay_frames WHERE trial_id = ? ORDER BY stream_seq LIMIT 1',
          trialId,
        )
        .toArray()[0]?.stream_seq;
      if (oldest !== undefined && afterSequence > 0 && afterSequence < oldest - 1) {
        safeSend(server, this.trialFrame(trialId, 'reset_required', []));
      } else {
        for (const frame of frames) safeSend(server, JSON.parse(frame.frame_json));
      }
    } else {
      safeSend(server, await this.benchFrame());
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === 'string' && message === 'ping') safeSend(socket, 'pong');
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    try {
      socket.close(code, reason);
    } catch {
      // Hibernation may report a socket that is already closed.
    }
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    try {
      socket.close(1011, 'websocket error');
    } catch {
      // The socket can already be closed.
    }
  }
}
