import canonicalize from 'canonicalize';
import type {
  LoadCellCalibrationRegisteredV1,
  OperatorSetupV1,
  PumpSpecimenRegisteredV1,
} from '../shared/calibration';
import { authenticateOperator, operatorSession } from './auth';
import type { BenchCoordinator, CoordinatorResult } from './bench-coordinator';
import {
  createCalibrationDraft,
  getCalibrationCurve,
  publishCalibrationCurve,
  reviewCalibrationCurve,
  validateCreateCalibrationDraft,
  validatePublishCalibrationCurve,
  validateReviewCalibrationCurve,
} from './calibration-analysis-service';
import { randomLease, sha256 } from './crypto';
import {
  assertMutationOrigin,
  errorResponse,
  HttpError,
  json,
  readJsonBody,
  requestId,
  withCalibrationPageHeaders,
} from './http';
import {
  bootstrap,
  comparison,
  EMPTY_PRESENCE,
  pumpReadModels,
  recipePredictions,
} from './read-models';
import {
  benchIdentifier,
  requiredLease,
  routeIdentifier,
  validateBenchHeartbeat,
  validateCreateBenchSession,
  validateCreateTrial,
  validateIngestBatch,
  validateLoadCellCalibration,
  validatePumpSpecimen,
  validateTrialForceAbort,
  validateTrialTransition,
} from './validation';

export { BenchCoordinator } from './bench-coordinator';

type RuntimeEnv = Env & {
  ASSETS?: Fetcher;
  DB?: D1Database;
  BENCH_COORDINATOR?: DurableObjectNamespace<BenchCoordinator>;
};

const MAX_JSON_BYTES = 64 * 1024;
const MAX_BATCH_BYTES = 128 * 1024;
const BENCH_LEASE_MS = 2 * 60 * 1000;
const TRIAL_LEASE_MS = 15 * 60 * 1000;

const expiresAt = (now: string, durationMs: number): string =>
  new Date(Date.parse(now) + durationMs).toISOString();

const firmwareSafeId = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;

function calibrationAssetRequest(request: Request, path: string): Request {
  const isDocumentNavigation =
    request.method === 'GET' &&
    path.startsWith('/calibration') &&
    (request.headers.get('sec-fetch-dest') === 'document' ||
      request.headers.get('sec-fetch-mode') === 'navigate' ||
      request.headers.get('accept')?.includes('text/html'));
  if (!isDocumentNavigation) return request;

  // A nonce-bearing HTML document cannot use a cached 304 body: its cached CSP
  // may predate the nonce rewrite, and every fresh document needs a matching
  // response-local nonce. Assets and non-document requests retain validators.
  const headers = new Headers(request.headers);
  for (const name of [
    'If-Match',
    'If-Modified-Since',
    'If-None-Match',
    'If-Range',
    'If-Unmodified-Since',
    'Range',
  ]) {
    headers.delete(name);
  }
  headers.set('Cache-Control', 'no-cache');
  return new Request(request, { headers });
}

function coordinator(env: RuntimeEnv, benchId: string): DurableObjectStub<BenchCoordinator> {
  if (!env.BENCH_COORDINATOR) {
    throw new HttpError(
      503,
      'live_backend_unavailable',
      'Live coordination is not configured in this deployment',
    );
  }
  return env.BENCH_COORDINATOR.getByName(benchId);
}

function unwrap<T>(result: CoordinatorResult<T>): T {
  if (!result.ok) throw new HttpError(result.status, result.code, result.message, result.details);
  return result.value;
}

function requireDatabase(env: RuntimeEnv): D1Database {
  if (!env.DB)
    throw new HttpError(503, 'storage_unavailable', 'Calibration storage is not configured');
  return env.DB;
}

async function setupReadModel(db: D1Database, deviceId: string | null): Promise<OperatorSetupV1> {
  const specimens = await db
    .prepare('SELECT id, pump_model_id, label FROM pump_specimens ORDER BY created_at, id')
    .all<{
      id: string;
      pump_model_id: 'kamoer-kphm600-12b3b17' | 'gikfun-ae1207';
      label: string;
    }>();
  const calibrationStatement = deviceId
    ? db
        .prepare(
          `SELECT id, bench_device_id, firmware_version,
                  counts_per_gram_numerator, counts_per_gram_denominator,
                  recorded_at, accepted_at
             FROM load_cell_calibrations WHERE bench_device_id = ? ORDER BY recorded_at DESC`,
        )
        .bind(deviceId)
    : db.prepare(
        `SELECT id, bench_device_id, firmware_version,
                counts_per_gram_numerator, counts_per_gram_denominator,
                recorded_at, accepted_at
           FROM load_cell_calibrations ORDER BY recorded_at DESC`,
      );
  const calibrations = await calibrationStatement.all<{
    id: string;
    bench_device_id: string;
    firmware_version: string;
    counts_per_gram_numerator: number;
    counts_per_gram_denominator: number;
    recorded_at: string;
    accepted_at: string;
  }>();
  return {
    schema: 'tnp.calibration.operator-setup.v1',
    pumpSpecimens: specimens.results.map((row) => ({
      pumpSpecimenId: row.id,
      pumpModelId: row.pump_model_id,
      label: row.label,
    })),
    loadCellCalibrations: calibrations.results.map((row) => ({
      loadCellCalibrationId: row.id,
      deviceId: row.bench_device_id,
      firmwareVersion: row.firmware_version,
      countsPerGramNumerator: row.counts_per_gram_numerator,
      countsPerGramDenominator: row.counts_per_gram_denominator,
      recordedAt: row.recorded_at,
      acceptedAt: row.accepted_at,
    })),
  };
}

async function publicTrial(db: D1Database, trialId: string): Promise<Response> {
  const trial = await db
    .prepare(
      `SELECT id, bench_id, device_id, boot_id, pump_specimen_id, pump_model_id,
              state, firmware_version, protocol_version, fluid_json, setup_json,
              contiguous_published_stream_seq, contiguous_projected_device_seq,
              created_at, started_at, completed_at, updated_at
         FROM trials WHERE id = ?`,
    )
    .bind(trialId)
    .first<Record<string, unknown>>();
  if (!trial) throw new HttpError(404, 'trial_not_found', 'Trial does not exist');
  return json({
    schema: 'tnp.calibration.trial.v1',
    trial: {
      ...trial,
      fluid_json: undefined,
      setup_json: undefined,
      fluid: JSON.parse(String(trial.fluid_json)),
      setup: JSON.parse(String(trial.setup_json)),
    },
  });
}

async function publicSamples(db: D1Database, trialId: string, url: URL): Promise<Response> {
  const trial = await db
    .prepare('SELECT contiguous_published_stream_seq FROM trials WHERE id = ?')
    .bind(trialId)
    .first<{ contiguous_published_stream_seq: number }>();
  if (!trial) throw new HttpError(404, 'trial_not_found', 'Trial does not exist');
  const cursor = Math.max(0, Number.parseInt(url.searchParams.get('cursor') ?? '0', 10) || 0);
  const requestedThrough = Number.parseInt(url.searchParams.get('through') ?? '', 10);
  const through = Number.isSafeInteger(requestedThrough)
    ? Math.min(requestedThrough, trial.contiguous_published_stream_seq)
    : trial.contiguous_published_stream_seq;
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Math.min(100, Math.max(1, requestedLimit || 100));
  const samples = await db
    .prepare(
      `SELECT stream_seq, device_seq, step_index, device_ms, received_at,
              acquisition_mode, expected_sample_interval_ms, duty_basis_points,
              duty_timer_count, motor_on, raw_adc_json, mass_mg, tach_count,
              supply_mv, faults_json
         FROM samples
        WHERE trial_id = ? AND stream_seq > ? AND stream_seq <= ?
        ORDER BY stream_seq LIMIT ?`,
    )
    .bind(trialId, cursor, through, limit)
    .all<Record<string, unknown>>();
  const rows: Array<Record<string, unknown>> = samples.results.map((row) => ({
    ...row,
    motor_on: row.motor_on === 1,
    raw_adc: JSON.parse(String(row.raw_adc_json)),
    faults: JSON.parse(String(row.faults_json)),
    raw_adc_json: undefined,
    faults_json: undefined,
  }));
  return json({
    schema: 'tnp.calibration.samples.v1',
    trialId,
    through,
    samples: rows,
    nextCursor: rows.at(-1)?.stream_seq ?? null,
  });
}

async function api(request: Request, env: RuntimeEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const now = new Date().toISOString();

  if (method === 'GET' && path === '/api/v1/health') {
    return json({
      schema: 'tnp.calibration.health.v1',
      status: 'ok',
      service: 'the-negroni-pony-calibration',
      environment: String(env.APP_ENV),
      mutationsEnabled: String(env.MUTATIONS_ENABLED) === 'true',
      storageConfigured: Boolean(env.DB),
      liveConfigured: Boolean(env.BENCH_COORDINATOR),
      serverNow: now,
    });
  }

  if (method === 'GET' && path === '/api/v1/pump-models') {
    return json({ schema: 'tnp.calibration.pump-models.v1', pumps: await pumpReadModels(env.DB) });
  }
  if (method === 'GET' && path === '/api/v1/comparison') {
    return json(await comparison(env.DB, now));
  }
  if (method === 'GET' && path === '/api/v1/recipes/predictions') {
    return json(await recipePredictions(env.DB, now));
  }

  if (method === 'GET' && path === '/api/v1/calibration/bootstrap') {
    const benchId = benchIdentifier(url.searchParams.get('bench') ?? 'bench-01');
    const snapshot = env.BENCH_COORDINATOR
      ? await coordinator(env, benchId).getSnapshot()
      : { presence: { ...EMPTY_PRESENCE }, activeTrialId: null, latestCompletedTrialId: null };
    return json(await bootstrap(env.DB, benchId, snapshot, now));
  }
  if (method === 'GET' && path === '/api/v1/calibration/current') {
    const benchId = benchIdentifier(url.searchParams.get('bench') ?? 'bench-01');
    const snapshot = env.BENCH_COORDINATOR
      ? await coordinator(env, benchId).getSnapshot()
      : { presence: { ...EMPTY_PRESENCE }, activeTrialId: null, latestCompletedTrialId: null };
    return json({
      schema: 'tnp.calibration.current.v1',
      benchId,
      serverNow: now,
      ...snapshot,
    });
  }

  const benchLive = path.match(/^\/api\/v1\/benches\/([^/]+)\/live$/);
  if (method === 'GET' && benchLive) {
    const benchId = benchIdentifier(decodeURIComponent(benchLive[1]));
    return coordinator(env, benchId).fetch(
      new Request(`https://bench.invalid/live?scope=bench`, { headers: request.headers }),
    );
  }

  const trialRoute = path.match(/^\/api\/v1\/trials\/([^/]+)$/);
  if (method === 'GET' && trialRoute) {
    return publicTrial(
      requireDatabase(env),
      routeIdentifier(decodeURIComponent(trialRoute[1]), 'trialId'),
    );
  }
  const samplesRoute = path.match(/^\/api\/v1\/trials\/([^/]+)\/samples$/);
  if (method === 'GET' && samplesRoute) {
    return publicSamples(
      requireDatabase(env),
      routeIdentifier(decodeURIComponent(samplesRoute[1]), 'trialId'),
      url,
    );
  }
  const trialLive = path.match(/^\/api\/v1\/trials\/([^/]+)\/live$/);
  if (method === 'GET' && trialLive) {
    const trialId = routeIdentifier(decodeURIComponent(trialLive[1]), 'trialId');
    const db = requireDatabase(env);
    const row = await db
      .prepare('SELECT bench_id FROM trials WHERE id = ?')
      .bind(trialId)
      .first<{ bench_id: string }>();
    if (!row) throw new HttpError(404, 'trial_not_found', 'Trial does not exist');
    const afterSequence = Math.max(
      0,
      Number.parseInt(url.searchParams.get('after') ?? '0', 10) || 0,
    );
    return coordinator(env, row.bench_id).fetch(
      new Request(
        `https://bench.invalid/live?scope=trial&trialId=${encodeURIComponent(trialId)}&after=${afterSequence}`,
        { headers: request.headers },
      ),
    );
  }

  if (!path.startsWith('/api/v1/operator/')) {
    throw new HttpError(404, 'api_route_not_found', 'API route does not exist');
  }
  assertMutationOrigin(request, env);
  const actor = await authenticateOperator(request, env);

  if (method === 'GET' && path === '/api/v1/operator/session') {
    return json(operatorSession(actor));
  }
  if (method === 'GET' && path === '/api/v1/operator/authorize') {
    const returnTo = url.searchParams.get('returnTo') ?? '/calibration';
    if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
      throw new HttpError(
        422,
        'invalid_return_path',
        'returnTo must be a same-origin absolute path',
      );
    }
    return new Response(null, {
      status: 302,
      headers: { Location: returnTo, 'Cache-Control': 'no-store' },
    });
  }
  if (method === 'GET' && path === '/api/v1/operator/setup') {
    const device = url.searchParams.get('device');
    return json(
      await setupReadModel(
        requireDatabase(env),
        device ? routeIdentifier(device, 'deviceId') : null,
      ),
    );
  }

  if (method === 'POST' && path === '/api/v1/operator/calibration-curves/drafts') {
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validateCreateCalibrationDraft(value);
    const result = await createCalibrationDraft(requireDatabase(env), input, now);
    return json(result.body, result.created ? 201 : 200);
  }

  const calibrationCurve = path.match(/^\/api\/v1\/operator\/calibration-curves\/([^/]+)$/);
  if (method === 'GET' && calibrationCurve) {
    const curveId = routeIdentifier(decodeURIComponent(calibrationCurve[1]), 'calibrationCurveId');
    return json(await getCalibrationCurve(requireDatabase(env), curveId));
  }

  const reviewCurve = path.match(/^\/api\/v1\/operator\/calibration-curves\/([^/]+)\/review$/);
  if (method === 'POST' && reviewCurve) {
    const curveId = routeIdentifier(decodeURIComponent(reviewCurve[1]), 'calibrationCurveId');
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validateReviewCalibrationCurve(value);
    return json(await reviewCalibrationCurve(requireDatabase(env), curveId, input, actor, now));
  }

  const publishCurve = path.match(/^\/api\/v1\/operator\/calibration-curves\/([^/]+)\/publish$/);
  if (method === 'POST' && publishCurve) {
    const curveId = routeIdentifier(decodeURIComponent(publishCurve[1]), 'calibrationCurveId');
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validatePublishCalibrationCurve(value);
    return json(await publishCalibrationCurve(requireDatabase(env), curveId, input, actor, now));
  }

  if (method === 'POST' && path === '/api/v1/operator/pump-specimens') {
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validatePumpSpecimen(value);
    const db = requireDatabase(env);
    const existing = await db
      .prepare('SELECT pump_model_id, label, created_at FROM pump_specimens WHERE id = ?')
      .bind(input.pumpSpecimenId)
      .first<{ pump_model_id: string; label: string; created_at: string }>();
    if (
      existing &&
      (existing.pump_model_id !== input.pumpModelId || existing.label !== input.label)
    ) {
      throw new HttpError(
        409,
        'pump_specimen_identity_conflict',
        'Pump specimen ID already has different metadata',
      );
    }
    if (!existing) {
      await db
        .prepare(
          `INSERT INTO pump_specimens (id, pump_model_id, label, acquired_at, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.pumpSpecimenId,
          input.pumpModelId,
          input.label,
          input.acquiredAt,
          input.notes,
          now,
        )
        .run();
    }
    const response: PumpSpecimenRegisteredV1 = {
      schema: 'tnp.calibration.pump-specimen.v1',
      pumpSpecimenId: input.pumpSpecimenId,
      pumpModelId: input.pumpModelId,
      label: input.label,
      createdAt: existing?.created_at ?? now,
    };
    return json(response, existing ? 200 : 201);
  }

  if (method === 'POST' && path === '/api/v1/operator/load-cell-calibrations') {
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validateLoadCellCalibration(value);
    const db = requireDatabase(env);
    const existing = await db
      .prepare(
        'SELECT bench_device_id, counts_per_gram_numerator, counts_per_gram_denominator, accepted_at FROM load_cell_calibrations WHERE id = ?',
      )
      .bind(input.loadCellCalibrationId)
      .first<{
        bench_device_id: string;
        counts_per_gram_numerator: number;
        counts_per_gram_denominator: number;
        accepted_at: string;
      }>();
    if (
      existing &&
      (existing.bench_device_id !== input.deviceId ||
        existing.counts_per_gram_numerator !== input.countsPerGramNumerator ||
        existing.counts_per_gram_denominator !== input.countsPerGramDenominator)
    ) {
      throw new HttpError(
        409,
        'load_cell_calibration_identity_conflict',
        'Calibration ID already has different evidence',
      );
    }
    if (!existing) {
      await db.batch([
        db
          .prepare(
            `INSERT INTO bench_devices (id, last_seen_at, last_firmware_version)
             VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET last_firmware_version = excluded.last_firmware_version`,
          )
          .bind(input.deviceId, now, input.firmwareVersion),
        db
          .prepare(
            `INSERT INTO load_cell_calibrations
              (id, bench_device_id, firmware_version, hx711_mode, channel_count,
               counts_per_gram_numerator, counts_per_gram_denominator,
               reference_observations_json, independent_check_json, method_version,
               recorded_at, created_at, accepted_at, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.loadCellCalibrationId,
            input.deviceId,
            input.firmwareVersion,
            input.hx711Mode,
            input.channelCount,
            input.countsPerGramNumerator,
            input.countsPerGramDenominator,
            JSON.stringify(input.referenceObservations),
            JSON.stringify(input.independentCheck),
            input.methodVersion,
            input.recordedAt,
            now,
            now,
            input.notes,
          ),
      ]);
    }
    const response: LoadCellCalibrationRegisteredV1 = {
      schema: 'tnp.calibration.load-cell-calibration.v1',
      loadCellCalibrationId: input.loadCellCalibrationId,
      deviceId: input.deviceId,
      acceptedAt: existing?.accepted_at ?? now,
    };
    return json(response, existing ? 200 : 201);
  }

  const createSession = path.match(/^\/api\/v1\/operator\/benches\/([^/]+)\/sessions$/);
  if (method === 'POST' && createSession) {
    const benchId = benchIdentifier(decodeURIComponent(createSession[1]));
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validateCreateBenchSession(value);
    const benchLease = randomLease();
    const benchSessionId = crypto.randomUUID();
    const leaseExpiresAt = expiresAt(now, BENCH_LEASE_MS);
    const response = unwrap(
      await coordinator(env, benchId).createProducerSession({
        benchId,
        benchSessionId,
        input,
        actor,
        leaseHash: await sha256(benchLease),
        now,
        expiresAt: leaseExpiresAt,
      }),
    );
    response.benchLease = benchLease;
    return json(response, 201);
  }

  const heartbeat = path.match(
    /^\/api\/v1\/operator\/benches\/([^/]+)\/sessions\/([^/]+)\/heartbeats$/,
  );
  if (method === 'POST' && heartbeat) {
    const benchId = benchIdentifier(decodeURIComponent(heartbeat[1]));
    const benchSessionId = routeIdentifier(decodeURIComponent(heartbeat[2]), 'benchSessionId');
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validateBenchHeartbeat(value);
    const lease = requiredLease(request, 'x-calibration-bench-lease');
    const result = await coordinator(env, benchId).recordHeartbeat({
      benchId,
      benchSessionId,
      actor,
      leaseHash: await sha256(lease),
      frame: input.frame,
      now,
      expiresAt: expiresAt(now, BENCH_LEASE_MS),
    });
    return json(unwrap(result));
  }

  if (method === 'POST' && path === '/api/v1/operator/trials') {
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validateCreateTrial(value);
    const benchLease = requiredLease(request, 'x-calibration-bench-lease');
    const producerLease = randomLease();
    const trialId = firmwareSafeId('tr');
    const producerSessionId = crypto.randomUUID();
    const leaseExpiresAt = expiresAt(now, TRIAL_LEASE_MS);
    const response = unwrap(
      await coordinator(env, input.benchId).startTrial({
        input,
        actor,
        benchLeaseHash: await sha256(benchLease),
        trialId,
        producerSessionId,
        producerLeaseHash: await sha256(producerLease),
        now,
        expiresAt: leaseExpiresAt,
      }),
    );
    response.producer.producerLease = producerLease;
    return json(response, 201);
  }

  const batches = path.match(/^\/api\/v1\/operator\/trials\/([^/]+)\/batches$/);
  if (method === 'POST' && batches) {
    const trialId = routeIdentifier(decodeURIComponent(batches[1]), 'trialId');
    const { value, raw } = await readJsonBody(request, MAX_BATCH_BYTES);
    const batch = validateIngestBatch(value, trialId);
    const lease = requiredLease(request, 'x-calibration-producer-lease');
    const db = requireDatabase(env);
    const trial = await db
      .prepare('SELECT bench_id FROM trials WHERE id = ?')
      .bind(trialId)
      .first<{ bench_id: string }>();
    if (!trial) throw new HttpError(404, 'trial_not_found', 'Trial does not exist');
    const events = await Promise.all(
      batch.events.map(async (event) => {
        const canonical = canonicalize(event);
        if (canonical === undefined)
          throw new HttpError(422, 'event_not_canonicalizable', 'Event cannot be canonicalized');
        return { event, hash: await sha256(canonical) };
      }),
    );
    const result = await coordinator(env, trial.bench_id).ingestBatch({
      actor,
      leaseHash: await sha256(lease),
      batch,
      bodyHash: await sha256(raw),
      events,
      receivedAt: now,
      expiresAt: expiresAt(now, TRIAL_LEASE_MS),
    });
    if (!result.ok) unwrap(result);
    return json(result.value, result.status);
  }

  const transition = path.match(/^\/api\/v1\/operator\/trials\/([^/]+)\/(complete|abort)$/);
  if (method === 'POST' && transition) {
    const trialId = routeIdentifier(decodeURIComponent(transition[1]), 'trialId');
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validateTrialTransition(value);
    const lease = requiredLease(request, 'x-calibration-producer-lease');
    const db = requireDatabase(env);
    const trial = await db
      .prepare('SELECT bench_id FROM trials WHERE id = ?')
      .bind(trialId)
      .first<{ bench_id: string }>();
    if (!trial) throw new HttpError(404, 'trial_not_found', 'Trial does not exist');
    const result = await coordinator(env, trial.bench_id).transitionTrial({
      trialId,
      actor,
      leaseHash: await sha256(lease),
      transition: input,
      kind: transition[2] as 'complete' | 'abort',
      now,
    });
    return json(unwrap(result));
  }

  const forceAbort = path.match(/^\/api\/v1\/operator\/trials\/([^/]+)\/force-abort$/);
  if (method === 'POST' && forceAbort) {
    const trialId = routeIdentifier(decodeURIComponent(forceAbort[1]), 'trialId');
    const { value } = await readJsonBody(request, MAX_JSON_BYTES);
    const input = validateTrialForceAbort(value);
    const db = requireDatabase(env);
    const trial = await db
      .prepare('SELECT bench_id FROM trials WHERE id = ?')
      .bind(trialId)
      .first<{ bench_id: string }>();
    if (!trial) throw new HttpError(404, 'trial_not_found', 'Trial does not exist');
    const result = await coordinator(env, trial.bench_id).forceAbortExpiredTrial({
      trialId,
      actor,
      reason: input.reason,
      now,
    });
    return json(unwrap(result));
  }

  throw new HttpError(404, 'api_route_not_found', 'Operator API route does not exist');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const runtimeEnv = env as RuntimeEnv;
    const id = requestId(request);
    const started = Date.now();
    try {
      if (new URL(request.url).pathname.startsWith('/api/v1/')) {
        const response = await api(request, runtimeEnv);
        console.log(
          JSON.stringify({
            event: 'calibration_request',
            requestId: id,
            method: request.method,
            path: new URL(request.url).pathname,
            status: response.status,
            durationMs: Date.now() - started,
          }),
        );
        return response;
      }
      if (!runtimeEnv.ASSETS)
        throw new HttpError(404, 'asset_not_found', 'Static assets are unavailable');
      const path = new URL(request.url).pathname;
      const response = await runtimeEnv.ASSETS.fetch(calibrationAssetRequest(request, path));
      return path.startsWith('/calibration')
        ? await withCalibrationPageHeaders(response)
        : response;
    } catch (error) {
      const normalized =
        error instanceof HttpError
          ? error
          : new HttpError(
              500,
              'internal_error',
              'The calibration service could not complete the request',
            );
      console.error(
        JSON.stringify({
          event: 'calibration_request_failed',
          requestId: id,
          method: request.method,
          path: new URL(request.url).pathname,
          status: normalized.status,
          code: normalized.code,
          durationMs: Date.now() - started,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return errorResponse(normalized, id);
    }
  },
} satisfies ExportedHandler<Env>;
