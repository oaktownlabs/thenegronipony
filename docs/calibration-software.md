# Calibration Firmware, Protocol, and Cloud Plan

Status: Milestone 2 Worker, D1 migrations, shared protocol/catalog, deterministic
draft analysis/review/publication, and AVR vertical slice implemented for local review. Physical commissioning values,
Cloudflare resource provisioning, Access application values, and live hardware
acceptance remain explicit pre-production gates.

## Design Rules

1. The Arduino owns pump safety and exact step timing.
2. The browser owns operator interaction, USB serial, and an offline upload
   spool.
3. Cloudflare owns authorization, durable storage, live fanout, final analysis,
   and public reads.
4. A live viewer never becomes a remote motor controller.
5. Device monotonic time is measurement time; server receipt time is audit time.
6. Raw evidence is immutable. Derived results are versioned and superseded, not
   silently overwritten.

## Firmware State Machine

```mermaid
stateDiagram-v2
  [*] --> BOOT
  BOOT --> IDLE: outputs proven off
  IDLE --> TARE: valid bounded command
  TARE --> ARMED: stable scale
  ARMED --> RUNNING: valid start step
  RUNNING --> SETTLING: local deadline or stop
  SETTLING --> COMPLETE: settled window captured
  COMPLETE --> IDLE: acknowledged/reset
  RUNNING --> FAULT: watchdog / E-stop / sensor / saturation
  TARE --> FAULT: sensor / stability timeout
  ARMED --> FAULT: watchdog / E-stop
  FAULT --> IDLE: explicit clear while outputs off
```

`BOOT`, parse errors, reset, disconnect, and `FAULT` always set both pump
outputs to off before emitting any response.

### Required local guards

- maximum command duration enforced by firmware;
- heartbeat timeout while armed or running;
- physical emergency-stop sense plus independent power cut;
- HX711 ready timeout and saturation fault;
- configurable maximum collected mass below vessel and sensor limits;
- mutually exclusive pump enables;
- direction change only after an off/dead-time interval;
- Kamoer duty clamped to the reviewed domain; and
- no automatic resume after USB reconnect or MCU reset.

The controller may complete a previously accepted bounded stop deadline without
the browser, but it must never wait for Cloudflare to stop a pump.

## Serial Protocol

The implemented AVR V1 transport is UTF-8 NDJSON at **250000 8N1**. Firmware
uses a fixed 192-byte command buffer and rejects inbound lines longer than 191
bytes excluding CR/LF. It emits one compact `s` frame per HX711 reading at
most 10 SPS; V1 makes no 80 SPS or sample-block claim. Device heartbeat frames
arrive every 500 ms, and the armed/running host watchdog fails off at 1500 ms.

The compact wire shapes and the sole canonical expansion function live in
`shared/calibration/serial-protocol.ts`. The browser must call
`canonicalizeSerialFrame()` before local display, IndexedDB, hashing, or upload.
That makes the Worker, UI, and test fixtures share one translation rather than
independently interpreting AVR abbreviations.

### Device identity and ordering

Every device frame consumes the next `seq`, beginning at one after boot. The
wire `boot` value is an eight-hex EEPROM monotonic reset-session counter, not a
random UUID. Its uniqueness scope is one provisioned `deviceId` while EEPROM is
preserved. Erasing or replacing EEPROM requires a new recorded provenance epoch.

```text
event identity = (deviceId, bootId, seq)
```

`deviceMs` is monotonic time since boot. It is never interpreted as wall-clock
time. The browser and server add their own receipt timestamps.

Wire frames share `{v:1,t,dev,boot,seq,ms}`. The implemented state alphabet is
`boot|idle|tare|armed|running|settling|complete|fault`. `hello` additionally
reports `fw,baud,hz,lastn,scale,cal,caln,cald,idok,limitmg`; unprovisioned
calibration fields are `null` and `limitmg:0` means unknown. `state` reports
`trial,step,pump,duty,zero`. `s` reports
`trial,step,state,pump,raw,mg,duty,tc,flags`. `hb`, `ack`, and `fault` use the
byte-exact shapes and bounds documented in
`firmware/calibration-bench/README.md`.

### Device-to-host frame types

```ts
type DeviceFrame =
  | {
      v: 1;
      type: 'hello';
      deviceId: string;
      bootId: string;
      seq: number;
      deviceMs: number;
      firmwareVersion: string;
      hardwareRevision: string;
      protocolVersion: 'tnp.serial.v1';
      capabilities: string[];
      serialBaud: 250000;
      acquisitionModes: ['steady_10_sps'];
      lastAcceptedCommandNumber: number;
      loadCellCalibrated: boolean;
      loadCellCalibrationId: string | null;
      countsPerGramNumerator: number | null;
      countsPerGramDenominator: number | null;
      deviceIdentityProvisioned: boolean;
      configuredMassLimitMg: number | null;
    }
  | {
      v: 1;
      type: 'sample';
      deviceId: string;
      bootId: string;
      seq: number;
      deviceMs: number;
      trialId: string | null;
      stepIndex: number | null;
      state: BenchState;
      pumpSpecimenId: string | null;
      acquisitionMode: 'steady_10_sps';
      expectedSampleIntervalMs: number;
      dutyBasisPoints: number;
      dutyTimerCount: number;
      motorOn: boolean;
      rawAdc: number[];
      massMg: number | null;
      tachCount: number | null;
      supplyMv: number | null;
      faults: FaultCode[];
    }
  | {
      v: 1;
      type: 'heartbeat' | 'command_ack' | 'state' | 'fault';
      deviceId: string;
      bootId: string;
      seq: number;
      deviceMs: number;
      trialId: string | null;
      commandId?: string;
      state: BenchState;
      expectedEventIntervalMs: number;
      code?: FaultCode;
      detail?: string;
      lastAcceptedCommandNumber?: number;
    };
```

Fixed-point milligrams, millivolts, and duty basis points avoid ambiguous float
serialization. `null` means not measured; it is not zero. Idle raw `s` frames
canonically carry `trialId:null`, `stepIndex:null`, and `pumpSpecimenId:null` so
commissioning can inspect the load cell before a trial. They are not sent to a
trial batch. Trial-bound TARE and ARMED samples retain the `trialId` while their
step and pump remain `null`; they are preserved in the trial batch and D1 so
device sequences remain contiguous. RUNNING samples bind the stored step and
specimen. SETTLING retains the firmware's finished-step context with a zero
Timer1 count. A sensor-triggered sample is emitted after the core enters FAULT
but before the terminal state and fault-code frames: a RUNNING fault retains
the stored step, specimen, and commanded duty while proving motor off and a
zero timer count; a TARE fault retains only the trial and reports zero duty and
timer count. Other unbound trial samples are valid only in TARE or ARMED with
the pump off.
`flags` bit 0 is motor on, bit 1 is mass available, and bit 2 is E-stop
unhealthy; unknown bits are rejected.

STOP preserves the active trial through its acknowledgment and context-bearing
IDLE state, then clears the firmware buffer. COMPLETE and FAULT likewise emit a
context-bearing terminal state before clearing; FAULT immediately follows it
with the separate fault-code frame. The browser releases its compact trial
context synchronously after COMPLETE/IDLE or after that FAULT code, before the
next heartbeat can enter the closing spool. Subsequent anonymous samples and
heartbeats belong to bench presence, not the trial frontier.

### Host-to-device commands

```ts
type HostCommand =
  | { v: 1; t: 'hello'; id: string }
  | { v: 1; t: 'hb'; id: string; n: number }
  | {
      v: 1;
      t: 'tare';
      id: string;
      n: number;
      trial: string;
      stable: number;
      wait: number;
    }
  | {
      v: 1;
      t: 'run';
      id: string;
      n: number;
      trial: string;
      step: number;
      pump: 'k' | 'g';
      dir: 'f' | 'r';
      duty: number;
      warm: number;
      collect: number;
      settle: number;
      hard: number;
      maxmg: number;
    }
  | { v: 1; t: 'stop'; id: string; n: number }
  | { v: 1; t: 'clear'; id: string; n: number };

interface TrialPlanV1 {
  schema: 'tnp.calibration.plan.v1';
  planId: string;
  steps: Array<{
    stepIndex: number;
    repeatIndex: number;
    direction: 'forward' | 'reverse';
    dutyBasisPoints: number;
    warmupMs: number;
    collectionMs: number;
    settleMs: number;
    acquisitionMode: 'steady_10_sps';
    maximumMassMg: number;
    hardStopMs: number;
  }>;
  maximumTrialMs: number;
}
```

Command IDs use the firmware identifier alphabet and are at most 16 characters;
trial IDs use the same alphabet and are at most 24. `hello` is unsequenced.
Every other command must present `n == lastn + 1`. Firmware caches the last
semantic command fingerprint and acknowledgment, so an exact retry returns
`dup:1` without repeating an action. Older, skipped, exhausted, or changed
same-`n` commands fail off with `command_sequence`.

## Browser Bridge

The operator uses the same `/calibration` page that renders the live readout.
The page exposes connection and run controls only after Cloudflare Access
authorizes the user; public viewers remain read-only.

### Serial responsibilities

- Require HTTPS, feature-detect `navigator.serial`, and request the port only
  from a user gesture.
- Parse incrementally and cap the line, queue, and in-memory history sizes.
- Validate every frame before it can affect UI or cloud data.
- Expand compact AVR frames only through shared `canonicalizeSerialFrame()`;
  throttle rendering without dropping canonical samples.
- Correlate commands and acknowledgments with bounded timeouts.
- Send heartbeats only while the page owns the bench.
- On page close or serial error, attempt `stop`; safety still depends on the
  firmware watchdog, not that attempt.

Web Serial has limited browser availability. V1 operator support is current
desktop Chromium. Read-only live viewing uses ordinary HTTPS/WebSocket and does
not require Web Serial. If browser support becomes a blocker, a local
TypeScript serial bridge may implement the same batch contract later.

### Offline spool

Before network upload, store every accepted trial event in IndexedDB keyed by
event identity. Build immutable batches from the spool. Connected-idle
heartbeats use the same identity/hash rules but may be compacted after the
`BenchCoordinator` returns its durable acknowledgment; active-trial heartbeats
remain spooled until their D1-projected frontier.

- Flush every 250–500 ms or 25 events, whichever comes first.
- Cap encoded request size at 64 KiB.
- Retain events until the server acknowledges their **D1-projected** contiguous
  sequence frontier for the same device and boot.
- Retry with exponential backoff and full jitter.
- Recover unacknowledged batches after reload.
- Surface spool depth and oldest unacknowledged age.
- Never discard raw frames merely because a later derived result succeeds.

HTTP delivery is at least once. The immutable event identity, payload hash, and
idempotent projection make durable effects effectively once; the plan does not
claim an exactly-once network upload. Losing an acknowledgment or rebuilding
the same events into a differently sized batch must be harmless.

## Cloudflare Topology

Keep one Worker and hostname:

- static React assets remain in `site/build/client`;
- add a Worker entrypoint and `ASSETS` binding;
- configure `assets.run_worker_first` for `/api/*`, `/calibration`, and
  `/calibration/*`;
- retain single-page-app fallback for direct `/calibration`; and
- use generated Wrangler binding types rather than a hand-written `Env`.

The Worker always handles `/api/*`: an unknown API route returns a JSON `404`,
and a non-upgraded live route returns `426`. Neither may fall through to the SPA.
For `/calibration`, it delegates to `ASSETS.fetch()` and adds the reviewed CSP
and `Permissions-Policy: serial=(self)` headers to the response. Successful HTML
is streamed through `HTMLRewriter`: every React Router bootstrap script receives
one cryptographically random per-response nonce and `script-src` permits only
same-origin scripts plus that nonce. The rewritten document is `no-store` and
has stale entity-length/ETag headers removed. Document navigations also drop
request validators before `ASSETS.fetch()` so a cached `304` can never separate
an old HTML body from its response-local CSP nonce. Non-HTML, error, and static
asset bodies are not rewritten, and other static routes keep asset-first
behavior.

One SQLite-backed `BenchCoordinator` Durable Object is addressed with
`getByName(benchId)`. Its SQLite storage owns producer presence, the one-active-
trial invariant, trial producer ownership, ingest journals, stream-sequence
allocation, and bounded replay windows for that physical bench. This single
serialization authority is what makes connected-idle presence truthful without
introducing a second coordinator that can disagree about the active trial. A
trial live route resolves `trialId -> benchId` in D1 and delegates to the same
object. D1 is the canonical normalized query store and accepted-read-model
authority.

### Persist-before-publish path

1. Worker validates request method, content type, size, origin, Access JWT, and
   schema.
2. Worker resolves the trial's bench and routes the batch to that bench's
   Durable Object.
3. Durable Object validates producer ownership, batch identity, body hash,
   state transition, and sequence information.
4. In one Durable Object storage transaction, reserve ordered `streamSeq`
   values, write the immutable batch body/hash as `pending_projection`, and set
   the earliest drain alarm. Do not acknowledge durable projection yet.
5. The drain processes pending entries strictly in `streamSeq` order. It writes
   the batch, immutable device events, sample projections, and the new
   contiguous published frontier to D1 in one idempotent prepared `batch()`
   transaction.
6. A local transaction marks the journal entry projected, stores its
   acknowledgment/replay frame, and schedules the next alarm when work remains.
7. Only then does the object acknowledge the producer and broadcast through the
   contiguous projected frontier.

The alarm is the durable retry mechanism; an ingest request may opportunistically
drain but correctness never depends on that request remaining alive. Object
startup also inspects the persisted pending count and restores a missing alarm.
An alarm failure records bounded backoff and reschedules itself. Trial
completion is refused while the projection outbox is non-empty.

Do not depend on an awaited external D1 call to serialize Durable Object
requests. Use `blockConcurrencyWhile()` only for schema initialization. Public
D1 queries include rows no newer than the stored contiguous published frontier,
so a partially projected future row cannot leak into a read model.

If persistence fails, the live UI does not receive a sample that the system
cannot later explain.

### API v1

```text
GET  /api/v1/calibration/bootstrap?bench=bench-01
GET  /api/v1/calibration/current?bench=bench-01
GET  /api/v1/benches/{benchId}/live
GET  /api/v1/trials/{trialId}
GET  /api/v1/trials/{trialId}/samples?cursor=...&through=...
GET  /api/v1/trials/{trialId}/live
GET  /api/v1/pump-models
GET  /api/v1/comparison?models=kamoer-kphm600-12b3b17,gikfun-ae1207
GET  /api/v1/recipes/predictions
GET  /api/v1/health

GET  /api/v1/operator/authorize?returnTo=/calibration
GET  /api/v1/operator/session
GET  /api/v1/operator/setup?device={deviceId}
POST /api/v1/operator/pump-specimens
POST /api/v1/operator/load-cell-calibrations
POST /api/v1/operator/benches/{benchId}/sessions
POST /api/v1/operator/benches/{benchId}/sessions/{sessionId}/heartbeats
POST /api/v1/operator/trials
POST /api/v1/operator/trials/{trialId}/batches
POST /api/v1/operator/trials/{trialId}/complete
POST /api/v1/operator/trials/{trialId}/abort
POST /api/v1/operator/trials/{trialId}/force-abort
POST /api/v1/operator/calibration-curves/drafts
GET  /api/v1/operator/calibration-curves/{curveId}
POST /api/v1/operator/calibration-curves/{curveId}/review
POST /api/v1/operator/calibration-curves/{curveId}/publish
```

The live route requires a WebSocket upgrade. Page and read routes are public;
every route under `/api/v1/operator/*` is protected by Cloudflare Access and
Worker-side token validation. Public responses use explicit view models that
exclude operator identity, private notes, Access claims, leases, and ingest
diagnostics.

Draft fitting, uncertainty, chronological holdout, review, and publication
gates are specified in [calibration-analysis.md](calibration-analysis.md).

Direct `/calibration` uses `bench-01` from checked public configuration unless
a validated `?bench=` is supplied. Bootstrap returns fresh bench presence, the
active trial if exactly one exists, the latest completed trial, both pump read
models, and all six canonical recipes. With no active trial the page still
shows connected-idle presence and historical comparisons. A bench cannot own
multiple active trials; a conflicting start returns `409` rather than choosing
one arbitrarily.

Connecting serial creates an Access-bound bench producer session and returns a
high-entropy bench lease. Idle device heartbeats are written transactionally to
the `BenchCoordinator` and acknowledged with device/boot/sequence plus
`durableAt`; the bench WebSocket then fans out that durable presence. When a
trial is active, heartbeats travel through the trial event journal and are not
acknowledged as current until D1 projection. This gives connected-idle a real
end-to-end durability signal without manufacturing a trial. The heartbeat URL
accepts `{schema:'tnp.calibration.bench-heartbeat.v1', frame}` plus
`X-Calibration-Bench-Lease`; `frame` must be a canonical idle
`heartbeat|state|fault` with `trialId:null`. Its acknowledgment repeats
bench/session/device/boot/seq and returns `durableAt` plus the renewed expiry.

### Physical-record registration

Pump specimens are operator-entered physical identities, not product-listing
aliases. `POST /operator/pump-specimens` records an owner specimen ID, the
catalog pump model, a label, and optional acquisition evidence.

`POST /operator/load-cell-calibrations` accepts one HX711 channel, a nonzero
signed `countsPerGramNumerator`, positive denominator, 4–16 raw known-mass fit
observations spanning at least 50 g, and a distinct interior holdout
mass/raw/residual. Fit masses and raw readings must be strictly monotonic. The
Worker recomputes every fit residual and the holdout residual, rejecting a
coefficient mismatch or residual exceeding 1% or 1 g. It never creates a
calibration ID from defaults. Trial creation rejects an unknown calibration, a
calibration from another device, or a specimen/model mismatch. `GET
/operator/setup` returns each calibration ID with its accepted device and
signed numerator/positive denominator pair for the browser picker.

### Trial creation contract

```ts
interface CreateTrialV1 {
  schema: 'tnp.calibration.create.v1';
  benchId: string;
  benchSessionId: string;
  deviceId: string;
  bootId: string;
  pumpSpecimenId: string;
  pumpModelId: string;
  transport: 'web_serial';
  firmwareVersion: string;
  protocolVersion: 'tnp.serial.v1';
  loadCellCalibrationId: string;
  loadCellCountsPerGramNumerator: number;
  loadCellCountsPerGramDenominator: number;
  fluid: {
    name: string;
    densityMgPerL: number;
    densitySource: string;
    temperatureMilliC: number | null;
  };
  setup: {
    tubeId: string;
    inletLengthMm: number | null;
    outletLengthMm: number | null;
    liftMm: number | null;
    nozzleHeightMm: number | null;
    supplyMv: number | null;
    pwmFrequencyHz: number;
  };
  plan: TrialPlanV1;
}
```

Product-listing flow is pump metadata and never seeds a measured field. The
server resolves the specimen record and rejects a supplied `pumpModelId` that
does not match it.

The trial repeats the load-cell rational coefficients reported by the selected
setup record. The coordinator resolves the accepted calibration and requires
its device, numerator, and denominator to match exactly. A missing calibration
returns `load_cell_calibration_not_registered`; an ID with mismatched device or
coefficients returns `409 load_cell_calibration_mismatch`. This prevents a
stale browser or changed firmware coefficient from silently attaching samples
to the wrong accepted scale provenance.

Trial creation must present the fresh bench-session lease and matching
device/boot identity. Successful creation returns a high-entropy, trial-scoped
producer lease exactly once. The `BenchCoordinator` stores only its
cryptographic hash and binds it to the Access subject, `benchId`, `deviceId`,
`bootId`, and a random `producerSessionId`. Every trial mutation requires both a
valid Access identity and that lease; neither lease is compiled into the SPA.

The browser keeps the lease in the same bounded local operator store as the
spool. An active producer renews a short expiry through accepted active-trial
batches, and the canonical expiry is persisted in both the coordinator and D1.
Reload resumes with the retained lease. While it remains live, only the ordinary
lease-bearing complete/abort routes may close the trial.

Once the lease has expired, an Access-authorized operator may call
`POST /api/v1/operator/trials/{trialId}/force-abort` without the lost producer
lease. It accepts
`{schema:'tnp.calibration.trial-force-abort.v1',reason:<nonblank>}` and rejects a
still-live lease. Success returns `tnp.calibration.trial-force-aborted.v1`,
releases the bench, and appends an immutable transition audit containing the
acting Access identity, reason, prior expiry, and `forced_missing` evidence
status. This is an explicit recovery operation, not automatic takeover or run
resumption.

### Batch and acknowledgment

```ts
interface IngestBatchV1 {
  schema: 'tnp.calibration.batch.v1';
  batchId: string;
  producerSessionId: string;
  trialId: string;
  deviceId: string;
  bootId: string;
  firstSeq: number;
  lastSeq: number;
  events: DeviceFrame[];
}

interface BatchAckV1 {
  schema: 'tnp.calibration.ack.v1';
  batchId: string;
  producerSessionId: string;
  deviceId: string;
  bootId: string;
  accepted: number;
  duplicates: number;
  contiguousProjectedThrough: number;
  missingRanges: Array<[number, number]>;
  publishedStreamSeq: number;
  serverReceivedAt: string;
  projectedAt: string;
  trialState: TrialState;
}

interface ProjectionQueuedV1 {
  schema: 'tnp.calibration.queued.v1';
  batchId: string;
  producerSessionId: string;
  state: 'pending_projection';
  retryAfterMs: number;
}
```

Batch identity is `(trialId, producerSessionId, batchId)` and also stores
`sha256(rawBody)`.

- Same ID and same hash returns the stored acknowledgment without rebroadcast.
- Same ID and different hash returns `409`.
- Every canonical event stores `sha256(canonicalEvent)`. Reusing
  `(deviceId, bootId, seq)` with a different hash returns `409` even when it
  arrives under a new trial or differently shaped batch.
- An event's embedded `trialId` must match the route and active lease. A device
  event cannot be rebound to another trial.
- Sequence gaps may be stored but remain visible in `missingRanges`; a trial
  cannot be accepted with unresolved fit-window gaps.
- Only one authenticated producer owns an active trial.
- Canonical step, specimen, duty, Timer1 count, motor state, and state-frame
  detail are checked against the stored trial plan before journal insertion.

`canonicalEvent` means the validated event serialized with the JSON
Canonicalization Scheme (RFC 8785); all protocol numeric fields are bounded
integers. Batch body hashes cover the exact HTTP request bytes. Share one set of
hash fixtures between browser and Worker so key order or batch rebuilding cannot
change event identity.

The bridge removes spooled events only through
`contiguousProjectedThrough` for the matching device and boot. `accepted` or an
HTTP success alone is insufficient.

Ordinary completion and abort both require an empty projection outbox, an exact
final sequence, a gap-free projected frontier, and a durable terminal firmware
state proving the pump is off. Completion specifically requires COMPLETE;
ordinary abort accepts the terminal IDLE/COMPLETE/FAULT protocol states. Forced
abort is intentionally separate because it records that terminal evidence is
missing rather than pretending the physical trial completed normally.

If projection does not finish inside the ingest request budget, return `202`
with `ProjectionQueuedV1`. A retry with the same batch identity/hash returns the
stored projected acknowledgment once the alarm drain succeeds. The bridge
retains the spool across every queued response.

Use `400` for malformed schema, `401/403` for authorization, `409` for illegal
state or conflicting reuse, `413` for size, `422` for impossible values, and
`429` for abusive rate.

## D1 Schema

Use migrations and fixed-point numeric columns where practical.

```text
pump_models
  id PK, manufacturer, model, advertised_flow_ml_min, metadata_json

pump_specimens
  id PK, pump_model_id, label, acquired_at, notes

bench_devices
  id PK, hardware_revision, created_at, last_seen_at,
  last_firmware_version

load_cell_calibrations
  id PK, bench_device_id, firmware_version, hx711_mode, channel_count,
  counts_per_gram_numerator, counts_per_gram_denominator,
  reference_observations_json, independent_check_json, method_version,
  recorded_at, created_at, accepted_at, notes

trials
  id PK, bench_id, bench_session_id, producer_session_id,
  producer_lease_expires_at, access_subject,
  device_id, boot_id, pump_specimen_id, pump_model_id,
  load_cell_calibration_id, state, transport, firmware_version,
  protocol_version, fluid_json, setup_json, plan_json,
  contiguous_published_stream_seq, contiguous_projected_device_seq,
  started_at, completed_at, created_at, updated_at, private_notes

trial_transitions
  id PK, trial_id, transition_kind, evidence_status, from_state, to_state,
  final_device_seq, reason, actor_subject, actor_email, actor_auth_mode,
  occurred_at

trial_steps
  trial_id + step_index PK, repeat_index, direction,
  duty_basis_points, plan_json, state

ingest_batches
  trial_id + producer_session_id + batch_id PK,
  body_sha256, device_id, boot_id, first_seq, last_seq,
  event_count, accepted_count, duplicate_count, ack_json,
  received_at, projected_at

device_events
  device_id + boot_id + device_seq PK,
  event_sha256, trial_id, stream_seq, event_type, device_ms,
  received_at, event_json

samples
  device_id + boot_id + device_seq PK,
  trial_id, stream_seq, step_index, device_ms, received_at,
  acquisition_mode, expected_sample_interval_ms, duty_basis_points,
  duty_timer_count, motor_on, mass_mg, raw_adc_json, tach_count,
  supply_mv, faults_json

trial_events
  trial_id + stream_seq PK, device_id, boot_id, device_seq

calibration_curves
  id PK, pump_specimen_id, pump_model_id, liquid, tube_id,
  min_duty_basis_points, max_duty_basis_points, review_status,
  estimate_class, source_trial_ids_json, analysis_method_version,
  evidence_hash, setup_fingerprint, setup_profile_json, quality_json,
  publication_eligible, reviewed_at, reviewed_by, created_at, published_at

calibration_points
  curve_id + duty_basis_points PK, flow_ul_s,
  uncertainty_ul_s, sample_count, evidence_json

calibration_curve_reviews
  id PK, curve_id UNIQUE, decision, reason, actor identity,
  analysis_evidence_hash, occurred_at

public_curve_selections
  pump_model_id PK, pump_specimen_id, curve_id UNIQUE, setup_fingerprint,
  selected_by, selection_reason, selected_at

calibration_curve_publications
  id PK, curve_id, pump_model_id, pump_specimen_id, analysis_evidence_hash,
  selection_reason, actor identity, occurred_at
```

Required indexes:

```text
samples(trial_id, stream_seq)
samples(trial_id, step_index, device_ms)
device_events(trial_id, stream_seq)
trials(pump_model_id, state, started_at)
calibration_curves(pump_model_id, review_status, published_at)
calibration_curves(evidence_hash, analysis_method_version) UNIQUE when present
public_curve_selections(pump_specimen_id)
```

`device_events` is the immutable authority. `samples` and `trial_events` are
query projections and must be reproducible from it. Public trial reads join the
trial frontier and apply
`stream_seq <= contiguous_published_stream_seq`.

Raw samples, trial metadata, accepted/rejected results, and calibration
provenance have indefinite retention for the first milestone. Do not add an
automatic deletion policy before real volume and export verification exist.

## Public Read Models

Public routes return versioned shapes, never raw tables. `null` plus a specific
`missingReason` represents absent evidence.

The service never chooses a latest curve by model. Publication creates an
explicit `(pumpModelId, pumpSpecimenId, curveId)` selection. Two selected curves
may drive a comparison only when their liquid, measured geometry/head, PWM,
supply, and temperature profiles are compatible. Pump-specific tube IDs remain
explicit and may differ across the two slots; a single specimen curve may not
combine trials from different tube IDs. Incompatible public selections return
`setup_mismatch`, and recipe predictions preserve the curve's stored
`estimateClass`.

```ts
type EstimateClass =
  | 'water_engineering'
  | 'ingredient_specific'
  | 'installed_path_validated';

type MissingReason =
  | 'no_selected_specimen'
  | 'no_accepted_curve'
  | 'liquid_not_tested'
  | 'setup_mismatch'
  | 'outside_validated_domain'
  | 'result_under_review';

interface PumpReadModelV1 {
  pumpModelId: string;
  manufacturer: string;
  model: string;
  selectedSpecimenId: string | null;
  specimenLabel: string | null;
  image: { kind: 'owner_photo' | 'schematic'; src: string; alt: string };
  advertisedFlowMlMin: number | null;
  acceptedCurve: null | {
    curveId: string;
    specimenId: string;
    liquid: string;
    tubeId: string;
    minDutyBasisPoints: number;
    maxDutyBasisPoints: number;
    points: Array<{
      dutyBasisPoints: number;
      flowUlPerSec: number;
      uncertaintyUlPerSec: number;
      sampleCount: number;
    }>;
    reviewStatus: 'accepted';
    estimateClass: EstimateClass;
    setupFingerprint: string;
    sourceTrialIds: string[];
    publishedAt: string;
  };
  missingReason: MissingReason | null;
}

interface RecipePredictionV1 {
  recipeId: string;
  name: string;
  targetVolumeUl: number;
  ingredients: Array<{
    ingredientId: string;
    name: string;
    volumeUl: number;
  }>;
  specimenResults: Array<{
    pumpModelId: string;
    specimenId: string | null;
    durationMs: number | null;
    uncertaintyMs: number | null;
    limitingIngredientId: string | null;
    curveIds: string[];
    estimateClass: EstimateClass | null;
    missingReason: MissingReason | null;
  }>;
}

interface CalibrationBootstrapV1 {
  schema: 'tnp.calibration.bootstrap.v1';
  benchId: string;
  serverNow: string;
  presence: {
    producerLeasePresent: boolean;
    producerLastSeenAt: string | null;
    expectedEventIntervalMs: number | null;
    deviceId: string | null;
    bootId: string | null;
    latestDeviceEventReceivedAt: string | null;
    latestDurableAt: string | null;
    durabilityScope: 'bench_do' | 'trial_d1' | null;
    lastDurablyAcknowledgedDeviceSeq: number | null;
    latestProjectedAt: string | null;
    lastProjectedDeviceSeq: number | null;
    publishedStreamSeq: number | null;
  };
  activeTrialId: string | null;
  latestCompletedTrialId: string | null;
  pumps: [PumpReadModelV1, PumpReadModelV1];
  recipes: RecipePredictionV1[]; // exactly six canonical catalog rows
}

interface ComparisonResponseV1 {
  schema: 'tnp.calibration.comparison.v1';
  generatedAt: string;
  pumps: [PumpReadModelV1, PumpReadModelV1];
}

interface RecipePredictionsResponseV1 {
  schema: 'tnp.calibration.recipe-predictions.v1';
  generatedAt: string;
  recipes: RecipePredictionV1[];
}

interface BenchStreamFrameV1 {
  schema: 'tnp.calibration.bench-stream.v1';
  benchId: string;
  serverNow: string;
  presence: CalibrationBootstrapV1['presence'];
  activeTrialId: string | null;
  latestCompletedTrialId: string | null;
}
```

`/api/v1/benches/{benchId}/live` is a hibernatable WebSocket backed by the
`BenchCoordinator`. It emits the same `presence` fields plus active/recent trial
pointers whenever producer heartbeat, durable frontier, or trial lifecycle
changes. That stream—not an active trial sample—is what makes connected-idle
status possible.

Bench presence is deliberately ephemeral durable state owned by the
`BenchCoordinator`, not a row claimed to be current in D1. D1 remains the
authority for trial evidence and accepted read models; `bench_devices` may be
updated asynchronously for audit-only last-seen history.

The recipe catalog is generated at build time from
`firmware/config/recipes.yaml` into a checked, versioned JSON/TypeScript module
consumed by both Worker and UI. CI regenerates and fails on drift. Bootstrap
always includes all six recipes and ingredient volumes, even before a curve or
prediction exists.

## WebSocket Contract

Use the Durable Object Hibernation WebSocket API. Persist important state; any
in-memory cache may disappear when the object hibernates.

```ts
interface TrialStreamFrameV1 {
  schema: 'tnp.calibration.stream.v1';
  type: 'snapshot' | 'sample_batch' | 'state' | 'producer_ack' | 'reset_required';
  trialId: string;
  streamSeq: number;
  serverReceivedAt: string;
  events: DeviceFrame[];
  health: {
    expectedEventIntervalMs: number;
    producerLastSeenAt: string | null;
    latestDeviceEventReceivedAt: string | null;
    latestProjectedAt: string | null;
    deviceId: string | null;
    bootId: string | null;
    contiguousProjectedDeviceSeq: number | null;
    publishedThrough: number;
  };
  latest: {
    state: TrialState;
    massMg: number | null;
    dutyBasisPoints: number;
    provisionalFlowUlPerSec: number | null;
  };
  reset?: { publishedThrough: number };
}
```

Reconnect with `?after={lastStreamSeq}`. Return a snapshot and missed frames
from a bounded replay window. WebSocket registration, the high-water read, and
hot replay selection occur without an external await. Store each socket's last
delivered cursor with `serializeAttachment()` so hibernation does not erase it.

If the requested sequence is too old, return `reset_required` with
`publishedThrough`. Keep the socket registered while the client fetches D1
history only through that watermark. The client buffers live frames above the
watermark, merges them after history, deduplicates by `streamSeq`, and then
resumes normal rendering. This closes the reset/replay race while ingestion
continues.

Frames contain timestamps and frontiers, not a frozen `sampleAgeMs`. Clients
estimate server-clock offset from `serverNow`/receipt time and continuously
recompute producer, device-event, projection, and viewer-frame ages. A stalled
client therefore cannot leave a reassuring static age on screen.

## Authorization

### Browser operator

- Keep `/calibration` and public read routes outside Access.
- Protect `/api/v1/operator/*` with a path-scoped Access application.
- `UNLOCK BENCH CONTROLS` performs a top-level navigation to
  `/api/v1/operator/authorize?returnTo=/calibration`; after Access succeeds, the
  Worker validates the token and redirects only to a same-origin allowlisted
  path. This establishes the browser's Access session without exposing a token
  to application code.
- The public page then calls `/api/v1/operator/session` to discover operator
  state; failure leaves the same page read-only.
- Validate `Cf-Access-Jwt-Assertion` signature, issuer, audience, and expiry in
  the Worker.
- Record the verified operator subject/email.
- Require exact same-origin requests and `application/json` for JSON mutations.
- Require the bench-session lease for idle heartbeat/trial creation and the
  trial producer lease for later trial mutations, in addition to Access.
- Never put a write secret in the SPA bundle.

### Future direct device

Do not implement direct Wi-Fi ingestion in the first slice. The future adapter
uses a per-device secret and HMAC-SHA256 over a version, device ID, timestamp,
nonce, and raw-body digest, with replay protection. It emits the same batch
contract and does not gain remote motor-control routes.

## Observability

Enable structured Workers logs and traces at full sampling while trial volume
is low. Log one summary per batch, not every sample:

- trial/device/batch identity;
- sequence start/end, accepted, duplicate, and gap counts;
- D1 and total duration;
- state transition and result; and
- active viewer count.

Never log Access tokens, authorization cookies, HMAC secrets, or complete raw
payloads.

## Preview and Production Separation

Root `wrangler.jsonc` remains the source of truth. Implementation must:

- set a current compatibility date and `nodejs_compat` when Worker code is
  added;
- generate Worker types after binding changes;
- configure `assets.run_worker_first` explicitly and fail closed when a required
  runtime binding is absent;
- keep ordinary remote PR previews read-only;
- run mutation/integration tests locally with the Cloudflare Vitest pool and
  Miniflare bindings;
- use one explicitly deployed staging environment for remote end-to-end trials,
  never an arbitrary PR preview;
- give staging its own D1/DO IDs, Access audience, secrets, and build namespace;
- omit production ingest secrets from previews and staging; and
- apply backward-compatible migrations before deploying code that requires
  them.

Workers Builds retains root `/`, `pnpm build`, production `wrangler deploy`, and
non-production version upload. CI resolves and inspects the effective config:
production IDs/audiences are forbidden outside production, missing bindings
fail closed, and no mutation smoke test targets a PR URL. If per-PR writable
previews are ever required, provision disposable resources per PR and destroy
them after the branch closes; do not share one writable dataset across builds.

## Automated and Integration Tests

Required coverage:

- firmware state machine, watchdog, deadline, duplicate command, invalid frame,
  scale timeout, saturation, and emergency stop;
- 10 SPS compact framing across partial/multiple lines and oversize input,
  plus a worst-case 250000-baud soak with zero sequence loss;
- IndexedDB reload/retry and deletion only through a projected frontier;
- API schema and fixed units;
- exact compact TARE/ARMED/RUNNING/SETTLING/COMPLETE expansion through Worker
  validation and nullable-step D1 sample projection;
- four-or-more monotonic scale fit points, every-point residual checks, and a
  distinct holdout;
- Access JWT signature, issuer, audience, expiry, public-read/protected-write,
  authorize redirect, bench/trial lease expiry, reload resume, and explicit
  audited expired-lease force-abort followed by fresh bench ownership
  (automatic takeover is intentionally unsupported);
- connected-idle heartbeat durability, fanout, stale transition, and active-trial
  handoff;
- same batch retry, conflicting batch-body reuse, lost acknowledgments, and the
  same events rebuilt into different batches;
- global event duplicate suppression, conflicting event hashes, cross-trial
  rebinding rejection, sequence gaps, and late recovery;
- plan/specimen/duty/timer/motor mismatches, illegal state transitions, and D1
  rollback;
- concurrent `N`/`N+1` ingest and contiguous-frontier enforcement;
- crash recovery after journal insert, after D1 commit, after projected marking,
  and before broadcast;
- alarm recovery after the producer disappears, refusal to complete or
  ordinarily abort with a non-empty outbox, and forced-recovery audit evidence;
- Durable Object snapshot, fanout, hibernation attachments, replay, and reset
  while active ingestion continues;
- migration tests with local bindings;
- UI states for unsupported browser, serial loss, cloud loss, stalled stream,
  complete, rejected, accepted, and recovery; and
- direct `/calibration`, CSP/serial policy, unknown-API JSON `404`, live-route
  `426`, and read-only preview config-isolation checks.

Use the Cloudflare Vitest runtime and Durable Object eviction/hibernation helpers
for Worker tests; a pure Node mock cannot prove storage gates, alarms, or socket
attachments.

The full hardware-in-loop sequence lives in
[calibration-system-plan.md](calibration-system-plan.md).

## References

- [MDN Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [Cloudflare static-assets binding and API-first routes](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Durable Object rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [Cloudflare hibernatable WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Cloudflare Workers observability](https://developers.cloudflare.com/workers/observability/)
