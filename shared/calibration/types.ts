export const CALIBRATION_API_VERSION = 'v1' as const;

export const PUMP_MODEL_IDS = ['kamoer-kphm600-12b3b17', 'gikfun-ae1207'] as const;

export type PumpModelId = (typeof PUMP_MODEL_IDS)[number];

export type BenchState =
  | 'boot'
  | 'idle'
  | 'tare'
  | 'armed'
  | 'running'
  | 'settling'
  | 'complete'
  | 'fault';

export type TrialState = 'created' | 'running' | 'completing' | 'complete' | 'aborted' | 'fault';

export type AcquisitionMode = 'steady_10_sps';
export type FaultCode = string;

export interface HelloDeviceFrameV1 {
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
  acquisitionModes: AcquisitionMode[];
  lastAcceptedCommandNumber: number;
  loadCellCalibrated: boolean;
  loadCellCalibrationId: string | null;
  countsPerGramNumerator: number | null;
  countsPerGramDenominator: number | null;
  deviceIdentityProvisioned: boolean;
  configuredMassLimitMg: number | null;
}

export interface SampleDeviceFrameV1 {
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
  acquisitionMode: AcquisitionMode;
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

export interface StateDeviceFrameV1 {
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
}

export type DeviceFrameV1 = HelloDeviceFrameV1 | SampleDeviceFrameV1 | StateDeviceFrameV1;

export interface TrialPlanStepV1 {
  stepIndex: number;
  repeatIndex: number;
  direction: 'forward' | 'reverse';
  dutyBasisPoints: number;
  warmupMs: number;
  collectionMs: number;
  settleMs: number;
  acquisitionMode: AcquisitionMode;
  maximumMassMg: number;
  hardStopMs: number;
}

export interface TrialPlanV1 {
  schema: 'tnp.calibration.plan.v1';
  planId: string;
  steps: TrialPlanStepV1[];
  maximumTrialMs: number;
}

export interface CreateTrialV1 {
  schema: 'tnp.calibration.create.v1';
  benchId: string;
  benchSessionId: string;
  deviceId: string;
  bootId: string;
  pumpSpecimenId: string;
  pumpModelId: PumpModelId;
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

export interface OperatorSessionV1 {
  schema: 'tnp.calibration.operator-session.v1';
  authenticated: true;
  actor: {
    subject: string;
    email: string | null;
    authMode: 'access' | 'local';
  };
}

export interface CreateBenchSessionV1 {
  schema: 'tnp.calibration.bench-session.create.v1';
  deviceId: string;
  bootId: string;
  firmwareVersion: string;
  protocolVersion: 'tnp.serial.v1';
  transport: 'web_serial';
}

export interface BenchSessionCreatedV1 {
  schema: 'tnp.calibration.bench-session.v1';
  benchId: string;
  benchSessionId: string;
  benchLease: string;
  leaseExpiresAt: string;
  heartbeatUrl: string;
}

export interface BenchHeartbeatV1 {
  schema: 'tnp.calibration.bench-heartbeat.v1';
  frame: StateDeviceFrameV1;
}

export interface BenchHeartbeatAckV1 {
  schema: 'tnp.calibration.bench-heartbeat-ack.v1';
  benchId: string;
  benchSessionId: string;
  deviceId: string;
  bootId: string;
  seq: number;
  durableAt: string;
  leaseExpiresAt: string;
}

export interface RegisterPumpSpecimenV1 {
  schema: 'tnp.calibration.pump-specimen.register.v1';
  pumpSpecimenId: string;
  pumpModelId: PumpModelId;
  label: string;
  acquiredAt: string | null;
  notes: string | null;
}

export interface PumpSpecimenRegisteredV1 {
  schema: 'tnp.calibration.pump-specimen.v1';
  pumpSpecimenId: string;
  pumpModelId: PumpModelId;
  label: string;
  createdAt: string;
}

export interface LoadCellReferenceObservationV1 {
  referenceMassMg: number;
  rawAdc: number;
}

export interface RegisterLoadCellCalibrationV1 {
  schema: 'tnp.calibration.load-cell-calibration.register.v1';
  loadCellCalibrationId: string;
  deviceId: string;
  firmwareVersion: string;
  hx711Mode: 'steady_10_sps';
  channelCount: 1;
  countsPerGramNumerator: number;
  countsPerGramDenominator: number;
  referenceObservations: LoadCellReferenceObservationV1[];
  independentCheck: LoadCellReferenceObservationV1 & { residualMg: number };
  methodVersion: string;
  recordedAt: string;
  notes: string | null;
}

export interface LoadCellCalibrationRegisteredV1 {
  schema: 'tnp.calibration.load-cell-calibration.v1';
  loadCellCalibrationId: string;
  deviceId: string;
  acceptedAt: string;
}

export interface OperatorSetupV1 {
  schema: 'tnp.calibration.operator-setup.v1';
  pumpSpecimens: Array<{
    pumpSpecimenId: string;
    pumpModelId: PumpModelId;
    label: string;
  }>;
  loadCellCalibrations: Array<{
    loadCellCalibrationId: string;
    deviceId: string;
    firmwareVersion: string;
    countsPerGramNumerator: number;
    countsPerGramDenominator: number;
    recordedAt: string;
    acceptedAt: string;
  }>;
}

export interface TrialCreatedV1 {
  schema: 'tnp.calibration.trial-created.v1';
  trial: {
    id: string;
    benchId: string;
    state: 'created';
    createdAt: string;
  };
  producer: {
    producerSessionId: string;
    producerLease: string;
    leaseExpiresAt: string;
  };
  ingest: {
    url: string;
    maxEventsPerBatch: 25;
    maxBodyBytes: 131072;
  };
}

export interface TrialTransitionV1 {
  schema: 'tnp.calibration.trial-transition.v1';
  finalDeviceSeq: number;
  deviceState: BenchState;
  reason: string | null;
}

export interface TrialTransitionedV1 {
  schema: 'tnp.calibration.trial-transitioned.v1';
  trialId: string;
  state: 'complete' | 'aborted';
  durableAt: string;
  finalDeviceSeq: number;
}

export interface TrialForceAbortV1 {
  schema: 'tnp.calibration.trial-force-abort.v1';
  reason: string;
}

export interface TrialForceAbortedV1 {
  schema: 'tnp.calibration.trial-force-aborted.v1';
  trialId: string;
  state: 'aborted';
  forced: true;
  durableAt: string;
  reason: string;
  previousLeaseExpiresAt: string;
}

export interface IngestBatchV1 {
  schema: 'tnp.calibration.batch.v1';
  batchId: string;
  producerSessionId: string;
  trialId: string;
  deviceId: string;
  bootId: string;
  firstSeq: number;
  lastSeq: number;
  events: DeviceFrameV1[];
}

export interface BatchAckV1 {
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

export interface ProjectionQueuedV1 {
  schema: 'tnp.calibration.queued.v1';
  batchId: string;
  producerSessionId: string;
  state: 'pending_projection';
  retryAfterMs: number;
}

export type EstimateClass =
  | 'water_engineering'
  | 'ingredient_specific'
  | 'installed_path_validated';

export interface CreateCalibrationCurveDraftV1 {
  schema: 'tnp.calibration.curve-draft.create.v1';
  sourceTrialIds: string[];
}

export interface ReviewCalibrationCurveV1 {
  schema: 'tnp.calibration.curve-review.v1';
  decision: 'accept' | 'reject';
  expectedEvidenceHash: string;
  reason: string;
}

export interface PublishCalibrationCurveV1 {
  schema: 'tnp.calibration.curve-publish.v1';
  expectedEvidenceHash: string;
  reason: string;
}

export type MissingReason =
  | 'no_selected_specimen'
  | 'no_accepted_curve'
  | 'liquid_not_tested'
  | 'setup_mismatch'
  | 'outside_validated_domain'
  | 'result_under_review';

export interface PumpReadModelV1 {
  pumpModelId: PumpModelId;
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

export interface RecipeCatalogIngredientV1 {
  ingredientId: string;
  name: string;
  ratioParts: number;
  volumeUl: number;
}

export interface RecipeCatalogEntryV1 {
  recipeId: string;
  name: string;
  targetVolumeUl: number;
  ratioTotalParts: number;
  ingredients: readonly RecipeCatalogIngredientV1[];
}

export interface RecipeCatalogV1 {
  schema: 'tnp.calibration.recipe-catalog.v1';
  sourceVersion: number;
  displayedDecimalPlaces: number;
  recipes: readonly RecipeCatalogEntryV1[];
}

export interface RecipePredictionV1 {
  recipeId: string;
  name: string;
  targetVolumeUl: number;
  ingredients: Array<{
    ingredientId: string;
    name: string;
    volumeUl: number;
  }>;
  specimenResults: Array<{
    pumpModelId: PumpModelId;
    specimenId: string | null;
    durationMs: number | null;
    uncertaintyMs: number | null;
    limitingIngredientId: string | null;
    curveIds: string[];
    estimateClass: EstimateClass | null;
    missingReason: MissingReason | null;
  }>;
}

export interface BenchPresenceV1 {
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
}

export interface CalibrationBootstrapV1 {
  schema: 'tnp.calibration.bootstrap.v1';
  benchId: string;
  serverNow: string;
  presence: BenchPresenceV1;
  activeTrialId: string | null;
  latestCompletedTrialId: string | null;
  pumps: [PumpReadModelV1, PumpReadModelV1];
  recipes: RecipePredictionV1[];
}

export interface CalibrationCurrentV1 {
  schema: 'tnp.calibration.current.v1';
  benchId: string;
  serverNow: string;
  presence: BenchPresenceV1;
  activeTrialId: string | null;
  latestCompletedTrialId: string | null;
}

export interface ComparisonResponseV1 {
  schema: 'tnp.calibration.comparison.v1';
  generatedAt: string;
  pumps: [PumpReadModelV1, PumpReadModelV1];
}

export interface RecipePredictionsResponseV1 {
  schema: 'tnp.calibration.recipe-predictions.v1';
  generatedAt: string;
  recipes: RecipePredictionV1[];
}

export interface BenchStreamFrameV1 {
  schema: 'tnp.calibration.bench-stream.v1';
  benchId: string;
  serverNow: string;
  presence: BenchPresenceV1;
  activeTrialId: string | null;
  latestCompletedTrialId: string | null;
}

export interface TrialStreamFrameV1 {
  schema: 'tnp.calibration.stream.v1';
  type: 'snapshot' | 'sample_batch' | 'state' | 'producer_ack' | 'reset_required';
  trialId: string;
  streamSeq: number;
  serverReceivedAt: string;
  events: DeviceFrameV1[];
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
}

export interface ApiErrorV1 {
  schema: 'tnp.error.v1';
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
