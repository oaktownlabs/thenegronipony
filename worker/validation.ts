import type {
  BenchHeartbeatV1,
  BenchState,
  CreateBenchSessionV1,
  CreateTrialV1,
  DeviceFrameV1,
  IngestBatchV1,
  PumpModelId,
  RegisterLoadCellCalibrationV1,
  RegisterPumpSpecimenV1,
  StateDeviceFrameV1,
  TrialForceAbortV1,
  TrialPlanStepV1,
  TrialTransitionV1,
} from '../shared/calibration';
import { PUMP_MODEL_IDS } from '../shared/calibration';
import { HttpError } from './http';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BENCH_IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STATES = new Set<BenchState>([
  'boot',
  'idle',
  'tare',
  'armed',
  'running',
  'settling',
  'complete',
  'fault',
]);

const object = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_schema', `${name} must be an object`);
  }
  return value as Record<string, unknown>;
};

const string = (value: unknown, name: string, maximumLength = 128): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new HttpError(
      422,
      'invalid_value',
      `${name} must be a non-empty string of at most ${maximumLength} characters`,
    );
  }
  return value;
};

const identifier = (value: unknown, name: string): string => {
  const result = string(value, name);
  if (!IDENTIFIER.test(result)) {
    throw new HttpError(422, 'invalid_identifier', `${name} contains unsupported characters`);
  }
  return result;
};

export const benchIdentifier = (value: unknown): string => {
  const result = string(value, 'benchId', 64);
  if (!BENCH_IDENTIFIER.test(result)) {
    throw new HttpError(
      422,
      'invalid_bench_id',
      'benchId must use lowercase letters, numbers, and hyphens',
    );
  }
  return result;
};

const integer = (value: unknown, name: string, minimum: number, maximum: number): number => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new HttpError(
      422,
      'invalid_value',
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return Number(value);
};

const nullableInteger = (
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number | null => (value === null ? null : integer(value, name, minimum, maximum));

const state = (value: unknown, name: string): BenchState => {
  if (typeof value !== 'string' || !STATES.has(value as BenchState)) {
    throw new HttpError(422, 'invalid_state', `${name} is not a supported bench state`);
  }
  return value as BenchState;
};

export function validateCreateBenchSession(value: unknown): CreateBenchSessionV1 {
  const input = object(value, 'body');
  if (input.schema !== 'tnp.calibration.bench-session.create.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.bench-session.create.v1');
  }
  if (input.protocolVersion !== 'tnp.serial.v1' || input.transport !== 'web_serial') {
    throw new HttpError(422, 'unsupported_transport', 'Only Web Serial protocol V1 is supported');
  }
  return {
    schema: input.schema,
    deviceId: identifier(input.deviceId, 'deviceId'),
    bootId: identifier(input.bootId, 'bootId'),
    firmwareVersion: string(input.firmwareVersion, 'firmwareVersion', 64),
    protocolVersion: input.protocolVersion,
    transport: input.transport,
  };
}

const nullableString = (value: unknown, name: string, maximumLength: number): string | null =>
  value === null ? null : string(value, name, maximumLength);

const isoTimestamp = (value: unknown, name: string): string => {
  const result = string(value, name, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || Number.isNaN(Date.parse(result))) {
    throw new HttpError(422, 'invalid_timestamp', `${name} must be an ISO 8601 timestamp`);
  }
  return result;
};

export function validatePumpSpecimen(value: unknown): RegisterPumpSpecimenV1 {
  const input = object(value, 'body');
  if (input.schema !== 'tnp.calibration.pump-specimen.register.v1') {
    throw new HttpError(
      400,
      'invalid_schema',
      'Expected tnp.calibration.pump-specimen.register.v1',
    );
  }
  if (!PUMP_MODEL_IDS.includes(input.pumpModelId as PumpModelId)) {
    throw new HttpError(422, 'unknown_pump_model', 'pumpModelId is not in the calibration catalog');
  }
  return {
    schema: input.schema,
    pumpSpecimenId: identifier(input.pumpSpecimenId, 'pumpSpecimenId'),
    pumpModelId: input.pumpModelId as PumpModelId,
    label: string(input.label, 'label', 128),
    acquiredAt: input.acquiredAt === null ? null : isoTimestamp(input.acquiredAt, 'acquiredAt'),
    notes: nullableString(input.notes, 'notes', 2000),
  };
}

const referenceObservation = (
  value: unknown,
  name: string,
): { referenceMassMg: number; rawAdc: number } => {
  const observation = object(value, name);
  return {
    referenceMassMg: integer(observation.referenceMassMg, `${name}.referenceMassMg`, 0, 1_000_000),
    rawAdc: integer(observation.rawAdc, `${name}.rawAdc`, -0x800000, 0x7fffff),
  };
};

export function validateLoadCellCalibration(value: unknown): RegisterLoadCellCalibrationV1 {
  const input = object(value, 'body');
  if (input.schema !== 'tnp.calibration.load-cell-calibration.register.v1') {
    throw new HttpError(
      400,
      'invalid_schema',
      'Expected tnp.calibration.load-cell-calibration.register.v1',
    );
  }
  if (input.hx711Mode !== 'steady_10_sps' || input.channelCount !== 1) {
    throw new HttpError(
      422,
      'unsupported_scale_configuration',
      'AVR V1 supports one HX711 channel at 10 SPS',
    );
  }
  if (
    !Array.isArray(input.referenceObservations) ||
    input.referenceObservations.length < 4 ||
    input.referenceObservations.length > 16
  ) {
    throw new HttpError(
      422,
      'invalid_calibration_evidence',
      'Provide 4 to 16 known-mass fit observations spanning the working range',
    );
  }
  const numerator = integer(
    input.countsPerGramNumerator,
    'countsPerGramNumerator',
    -0x7fffffff,
    0x7fffffff,
  );
  if (numerator === 0) {
    throw new HttpError(
      422,
      'invalid_calibration_coefficient',
      'countsPerGramNumerator cannot be zero',
    );
  }
  const independent = referenceObservation(input.independentCheck, 'independentCheck');
  const independentInput = object(input.independentCheck, 'independentCheck');
  const observations = input.referenceObservations.map((observation, index) =>
    referenceObservation(observation, `referenceObservations[${index}]`),
  );
  const ordered = [...observations].sort(
    (left, right) => left.referenceMassMg - right.referenceMassMg,
  );
  const low = ordered[0];
  const high = ordered.at(-1);
  if (!low || !high) {
    throw new HttpError(
      422,
      'invalid_calibration_evidence',
      'Known-mass observations are required',
    );
  }
  if (high.referenceMassMg === low.referenceMassMg || high.rawAdc === low.rawAdc) {
    throw new HttpError(
      422,
      'invalid_calibration_evidence',
      'Known-mass observations need distinct mass and raw readings',
    );
  }
  const denominator = integer(
    input.countsPerGramDenominator,
    'countsPerGramDenominator',
    1,
    0x7fffffff,
  );
  if (high.referenceMassMg - low.referenceMassMg < 50_000) {
    throw new HttpError(
      422,
      'calibration_span_too_small',
      'Known-mass fit observations must span at least 50 g',
    );
  }
  const rawDirection = numerator > 0 ? 1 : -1;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      !previous ||
      !current ||
      current.referenceMassMg === previous.referenceMassMg ||
      (current.rawAdc - previous.rawAdc) * rawDirection <= 0
    ) {
      throw new HttpError(
        422,
        'calibration_not_monotonic',
        'Fit observations need distinct masses and strictly monotonic raw readings',
      );
    }
  }
  for (const observation of ordered) {
    const predictedMass =
      low.referenceMassMg + ((observation.rawAdc - low.rawAdc) * 1000 * denominator) / numerator;
    const fitResidual = Math.abs(predictedMass - observation.referenceMassMg);
    const allowedFitResidual = Math.max(
      1_000,
      Math.abs(observation.referenceMassMg - low.referenceMassMg) * 0.01,
    );
    if (fitResidual > allowedFitResidual) {
      throw new HttpError(
        422,
        'calibration_coefficient_mismatch',
        'Rational coefficients do not fit every supplied known-mass observation',
      );
    }
  }
  if (
    independent.referenceMassMg <= low.referenceMassMg ||
    independent.referenceMassMg >= high.referenceMassMg ||
    (independent.rawAdc - low.rawAdc) * rawDirection <= 0 ||
    (high.rawAdc - independent.rawAdc) * rawDirection <= 0 ||
    observations.some(
      (observation) =>
        observation.referenceMassMg === independent.referenceMassMg ||
        observation.rawAdc === independent.rawAdc,
    )
  ) {
    throw new HttpError(
      422,
      'independent_check_not_distinct',
      'Independent check must be a distinct holdout inside the fitted mass span',
    );
  }
  const computedIndependentResidual =
    low.referenceMassMg +
    ((independent.rawAdc - low.rawAdc) * 1000 * denominator) / numerator -
    independent.referenceMassMg;
  const suppliedResidual = integer(
    independentInput.residualMg,
    'independentCheck.residualMg',
    -1_000_000,
    1_000_000,
  );
  if (Math.abs(computedIndependentResidual - suppliedResidual) > 2) {
    throw new HttpError(
      422,
      'independent_check_mismatch',
      'Independent-check residual does not match the supplied raw evidence',
    );
  }
  const allowedIndependentResidual = Math.max(1_000, independent.referenceMassMg * 0.01);
  if (Math.abs(suppliedResidual) > allowedIndependentResidual) {
    throw new HttpError(
      422,
      'independent_check_failed',
      'Independent check exceeds the 1% or 1 g acceptance bound',
    );
  }
  return {
    schema: input.schema,
    loadCellCalibrationId: identifier(input.loadCellCalibrationId, 'loadCellCalibrationId'),
    deviceId: identifier(input.deviceId, 'deviceId'),
    firmwareVersion: string(input.firmwareVersion, 'firmwareVersion', 64),
    hx711Mode: input.hx711Mode,
    channelCount: 1,
    countsPerGramNumerator: numerator,
    countsPerGramDenominator: denominator,
    referenceObservations: observations,
    independentCheck: {
      ...independent,
      residualMg: suppliedResidual,
    },
    methodVersion: string(input.methodVersion, 'methodVersion', 64),
    recordedAt: isoTimestamp(input.recordedAt, 'recordedAt'),
    notes: nullableString(input.notes, 'notes', 2000),
  };
}

function validateStateFrame(value: unknown): StateDeviceFrameV1 {
  const frame = object(value, 'frame');
  if (frame.v !== 1) {
    throw new HttpError(422, 'unsupported_event_version', 'frame.v must be 1');
  }
  const type = frame.type;
  if (type !== 'heartbeat' && type !== 'state' && type !== 'fault' && type !== 'command_ack') {
    throw new HttpError(
      422,
      'invalid_event_type',
      'frame must be a heartbeat, state, fault, or command_ack',
    );
  }
  const code = frame.code === undefined ? undefined : string(frame.code, 'frame.code', 64);
  const detail = frame.detail === undefined ? undefined : string(frame.detail, 'frame.detail', 512);
  return {
    v: 1,
    type,
    deviceId: identifier(frame.deviceId, 'frame.deviceId'),
    bootId: identifier(frame.bootId, 'frame.bootId'),
    seq: integer(frame.seq, 'frame.seq', 0, Number.MAX_SAFE_INTEGER),
    deviceMs: integer(frame.deviceMs, 'frame.deviceMs', 0, 0xffffffff),
    trialId: frame.trialId === null ? null : identifier(frame.trialId, 'frame.trialId'),
    ...(frame.commandId === undefined
      ? {}
      : { commandId: string(frame.commandId, 'frame.commandId', 16) }),
    state: state(frame.state, 'frame.state'),
    expectedEventIntervalMs: integer(
      frame.expectedEventIntervalMs,
      'frame.expectedEventIntervalMs',
      10,
      60_000,
    ),
    ...(code === undefined ? {} : { code }),
    ...(detail === undefined ? {} : { detail }),
    ...(frame.lastAcceptedCommandNumber === undefined
      ? {}
      : {
          lastAcceptedCommandNumber: integer(
            frame.lastAcceptedCommandNumber,
            'frame.lastAcceptedCommandNumber',
            0,
            0xffffffff,
          ),
        }),
  };
}

export function validateBenchHeartbeat(value: unknown): BenchHeartbeatV1 {
  const input = object(value, 'body');
  if (input.schema !== 'tnp.calibration.bench-heartbeat.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.bench-heartbeat.v1');
  }
  const frame = validateStateFrame(input.frame);
  if (frame.type === 'command_ack' || frame.trialId !== null) {
    throw new HttpError(
      409,
      'trial_event_requires_batch',
      'Active-trial events must use the trial batch route',
    );
  }
  return { schema: input.schema, frame };
}

const nullableBoundedInteger = (
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number | null => (value === null ? null : integer(value, name, minimum, maximum));

function validatePlanStep(value: unknown, index: number): TrialPlanStepV1 {
  const step = object(value, `plan.steps[${index}]`);
  const direction = step.direction;
  const acquisitionMode = step.acquisitionMode;
  if (direction !== 'forward' && direction !== 'reverse') {
    throw new HttpError(422, 'invalid_value', `plan.steps[${index}].direction is unsupported`);
  }
  if (acquisitionMode !== 'steady_10_sps') {
    throw new HttpError(
      422,
      'unsupported_acquisition_mode',
      'AVR protocol V1 supports steady_10_sps only',
    );
  }
  return {
    stepIndex: integer(step.stepIndex, `plan.steps[${index}].stepIndex`, 0, 1024),
    repeatIndex: integer(step.repeatIndex, `plan.steps[${index}].repeatIndex`, 0, 100),
    direction,
    dutyBasisPoints: integer(
      step.dutyBasisPoints,
      `plan.steps[${index}].dutyBasisPoints`,
      0,
      10000,
    ),
    warmupMs: integer(step.warmupMs, `plan.steps[${index}].warmupMs`, 0, 600_000),
    collectionMs: integer(step.collectionMs, `plan.steps[${index}].collectionMs`, 100, 3_600_000),
    settleMs: integer(step.settleMs, `plan.steps[${index}].settleMs`, 0, 600_000),
    acquisitionMode,
    maximumMassMg: integer(step.maximumMassMg, `plan.steps[${index}].maximumMassMg`, 1, 1_000_000),
    hardStopMs: integer(step.hardStopMs, `plan.steps[${index}].hardStopMs`, 100, 3_600_000),
  };
}

export function validateCreateTrial(value: unknown): CreateTrialV1 {
  const input = object(value, 'body');
  if (input.schema !== 'tnp.calibration.create.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.create.v1');
  }
  if (!PUMP_MODEL_IDS.includes(input.pumpModelId as PumpModelId)) {
    throw new HttpError(422, 'unknown_pump_model', 'pumpModelId is not in the calibration catalog');
  }
  if (input.transport !== 'web_serial' || input.protocolVersion !== 'tnp.serial.v1') {
    throw new HttpError(422, 'unsupported_transport', 'Only Web Serial protocol V1 is supported');
  }
  const fluid = object(input.fluid, 'fluid');
  const setup = object(input.setup, 'setup');
  const plan = object(input.plan, 'plan');
  if (plan.schema !== 'tnp.calibration.plan.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.plan.v1');
  }
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 256) {
    throw new HttpError(422, 'invalid_plan', 'plan.steps must contain between 1 and 256 steps');
  }
  const steps = plan.steps.map(validatePlanStep);
  if (new Set(steps.map((step) => step.stepIndex)).size !== steps.length) {
    throw new HttpError(422, 'invalid_plan', 'plan step indexes must be unique');
  }
  const loadCellCountsPerGramNumerator = integer(
    input.loadCellCountsPerGramNumerator,
    'loadCellCountsPerGramNumerator',
    -0x7fffffff,
    0x7fffffff,
  );
  if (loadCellCountsPerGramNumerator === 0) {
    throw new HttpError(
      422,
      'invalid_calibration_coefficient',
      'loadCellCountsPerGramNumerator cannot be zero',
    );
  }

  return {
    schema: input.schema,
    benchId: benchIdentifier(input.benchId),
    benchSessionId: identifier(input.benchSessionId, 'benchSessionId'),
    deviceId: identifier(input.deviceId, 'deviceId'),
    bootId: identifier(input.bootId, 'bootId'),
    pumpSpecimenId: identifier(input.pumpSpecimenId, 'pumpSpecimenId'),
    pumpModelId: input.pumpModelId as PumpModelId,
    transport: input.transport,
    firmwareVersion: string(input.firmwareVersion, 'firmwareVersion', 64),
    protocolVersion: input.protocolVersion,
    loadCellCalibrationId: identifier(input.loadCellCalibrationId, 'loadCellCalibrationId'),
    loadCellCountsPerGramNumerator,
    loadCellCountsPerGramDenominator: integer(
      input.loadCellCountsPerGramDenominator,
      'loadCellCountsPerGramDenominator',
      1,
      0x7fffffff,
    ),
    fluid: {
      name: string(fluid.name, 'fluid.name', 96),
      densityMgPerL: integer(fluid.densityMgPerL, 'fluid.densityMgPerL', 100_000, 2_000_000),
      densitySource: string(fluid.densitySource, 'fluid.densitySource', 256),
      temperatureMilliC: nullableBoundedInteger(
        fluid.temperatureMilliC,
        'fluid.temperatureMilliC',
        -20_000,
        100_000,
      ),
    },
    setup: {
      tubeId: identifier(setup.tubeId, 'setup.tubeId'),
      inletLengthMm: nullableBoundedInteger(setup.inletLengthMm, 'setup.inletLengthMm', 0, 100_000),
      outletLengthMm: nullableBoundedInteger(
        setup.outletLengthMm,
        'setup.outletLengthMm',
        0,
        100_000,
      ),
      liftMm: nullableBoundedInteger(setup.liftMm, 'setup.liftMm', -10_000, 10_000),
      nozzleHeightMm: nullableBoundedInteger(
        setup.nozzleHeightMm,
        'setup.nozzleHeightMm',
        -10_000,
        10_000,
      ),
      supplyMv: nullableBoundedInteger(setup.supplyMv, 'setup.supplyMv', 0, 50_000),
      pwmFrequencyHz: integer(setup.pwmFrequencyHz, 'setup.pwmFrequencyHz', 1, 100_000),
    },
    plan: {
      schema: plan.schema,
      planId: identifier(plan.planId, 'plan.planId'),
      steps,
      maximumTrialMs: integer(plan.maximumTrialMs, 'plan.maximumTrialMs', 100, 8 * 60 * 60 * 1000),
    },
  };
}

function validateDeviceFrame(value: unknown, index: number): DeviceFrameV1 {
  const frame = object(value, `events[${index}]`);
  if (frame.v !== 1)
    throw new HttpError(422, 'unsupported_event_version', `events[${index}].v must be 1`);
  if (frame.type === 'sample') {
    if (!Array.isArray(frame.rawAdc) || frame.rawAdc.length < 1 || frame.rawAdc.length > 4) {
      throw new HttpError(
        422,
        'invalid_sample',
        `events[${index}].rawAdc must contain 1 to 4 channels`,
      );
    }
    if (frame.acquisitionMode !== 'steady_10_sps') {
      throw new HttpError(
        422,
        'unsupported_acquisition_mode',
        'AVR protocol V1 supports steady_10_sps only',
      );
    }
    if (!Array.isArray(frame.faults) || frame.faults.length > 16) {
      throw new HttpError(422, 'invalid_sample', `events[${index}].faults is invalid`);
    }
    const sampleState = state(frame.state, `events[${index}].state`);
    const stepIndex =
      frame.stepIndex === null
        ? null
        : integer(frame.stepIndex, `events[${index}].stepIndex`, 0, 1024);
    const pumpSpecimenId =
      frame.pumpSpecimenId === null
        ? null
        : identifier(frame.pumpSpecimenId, `events[${index}].pumpSpecimenId`);
    const boundTrialSample =
      (sampleState === 'running' || sampleState === 'settling' || sampleState === 'fault') &&
      stepIndex !== null &&
      pumpSpecimenId !== null;
    const quiescentTrialSample =
      stepIndex === null &&
      pumpSpecimenId === null &&
      ['tare', 'armed', 'fault'].includes(sampleState);
    if (!boundTrialSample && !quiescentTrialSample) {
      throw new HttpError(
        422,
        'invalid_sample_binding',
        `events[${index}] step and pump binding do not match its trial state`,
      );
    }
    const motorOn =
      typeof frame.motorOn === 'boolean'
        ? frame.motorOn
        : (() => {
            throw new HttpError(
              422,
              'invalid_sample',
              `events[${index}].motorOn must be a boolean`,
            );
          })();
    const dutyBasisPoints = integer(
      frame.dutyBasisPoints,
      `events[${index}].dutyBasisPoints`,
      0,
      10000,
    );
    const dutyTimerCount = integer(frame.dutyTimerCount, `events[${index}].dutyTimerCount`, 0, 800);
    if (quiescentTrialSample && (motorOn || dutyBasisPoints !== 0 || dutyTimerCount !== 0)) {
      throw new HttpError(
        422,
        'quiescent_pump_energized',
        `events[${index}] reports an energized pump outside a running step`,
      );
    }
    if (
      boundTrialSample &&
      (sampleState === 'settling' || sampleState === 'fault') &&
      (motorOn || dutyTimerCount !== 0)
    ) {
      throw new HttpError(
        422,
        'fail_off_sample_energized',
        `events[${index}] reports an energized pump while settling or faulted`,
      );
    }
    return {
      v: 1,
      type: 'sample',
      deviceId: identifier(frame.deviceId, `events[${index}].deviceId`),
      bootId: identifier(frame.bootId, `events[${index}].bootId`),
      seq: integer(frame.seq, `events[${index}].seq`, 0, Number.MAX_SAFE_INTEGER),
      deviceMs: integer(frame.deviceMs, `events[${index}].deviceMs`, 0, 0xffffffff),
      trialId: identifier(frame.trialId, `events[${index}].trialId`),
      stepIndex,
      state: sampleState,
      pumpSpecimenId,
      acquisitionMode: frame.acquisitionMode,
      expectedSampleIntervalMs: integer(
        frame.expectedSampleIntervalMs,
        `events[${index}].expectedSampleIntervalMs`,
        10,
        60_000,
      ),
      dutyBasisPoints,
      dutyTimerCount,
      motorOn,
      rawAdc: frame.rawAdc.map((reading, channel) =>
        integer(reading, `events[${index}].rawAdc[${channel}]`, -0x800000, 0x7fffff),
      ),
      massMg: nullableInteger(frame.massMg, `events[${index}].massMg`, -1_000_000, 1_000_000),
      tachCount: nullableInteger(frame.tachCount, `events[${index}].tachCount`, 0, 0xffffffff),
      supplyMv: nullableInteger(frame.supplyMv, `events[${index}].supplyMv`, 0, 50_000),
      faults: frame.faults.map((fault, faultIndex) =>
        string(fault, `events[${index}].faults[${faultIndex}]`, 64),
      ),
    };
  }
  if (frame.type === 'hello') {
    throw new HttpError(422, 'invalid_trial_event', 'hello events do not belong in a trial batch');
  }
  return validateStateFrame(frame);
}

export function validateIngestBatch(value: unknown, routeTrialId: string): IngestBatchV1 {
  const input = object(value, 'body');
  if (input.schema !== 'tnp.calibration.batch.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.batch.v1');
  }
  if (!Array.isArray(input.events) || input.events.length < 1 || input.events.length > 25) {
    throw new HttpError(
      422,
      'invalid_batch',
      'events must contain between 1 and 25 canonical events',
    );
  }
  const events = input.events.map(validateDeviceFrame);
  const trialId = identifier(input.trialId, 'trialId');
  if (trialId !== routeTrialId) {
    throw new HttpError(409, 'trial_mismatch', 'Batch trialId does not match the route');
  }
  const deviceId = identifier(input.deviceId, 'deviceId');
  const bootId = identifier(input.bootId, 'bootId');
  let prior = -1;
  for (const [index, event] of events.entries()) {
    if (event.deviceId !== deviceId || event.bootId !== bootId) {
      throw new HttpError(
        409,
        'device_mismatch',
        `events[${index}] device identity does not match the batch`,
      );
    }
    if (!('trialId' in event) || event.trialId !== trialId) {
      throw new HttpError(409, 'trial_mismatch', `events[${index}] is not bound to this trial`);
    }
    if (event.seq <= prior) {
      throw new HttpError(422, 'invalid_sequence', 'Batch events must be strictly ordered by seq');
    }
    prior = event.seq;
  }
  const firstSeq = integer(input.firstSeq, 'firstSeq', 0, Number.MAX_SAFE_INTEGER);
  const lastSeq = integer(input.lastSeq, 'lastSeq', firstSeq, Number.MAX_SAFE_INTEGER);
  if (events[0].seq !== firstSeq || events.at(-1)?.seq !== lastSeq) {
    throw new HttpError(422, 'invalid_sequence', 'firstSeq and lastSeq must match the event range');
  }
  return {
    schema: input.schema,
    batchId: identifier(input.batchId, 'batchId'),
    producerSessionId: identifier(input.producerSessionId, 'producerSessionId'),
    trialId,
    deviceId,
    bootId,
    firstSeq,
    lastSeq,
    events,
  };
}

export function validateTrialTransition(value: unknown): TrialTransitionV1 {
  const input = object(value, 'body');
  if (input.schema !== 'tnp.calibration.trial-transition.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.trial-transition.v1');
  }
  return {
    schema: input.schema,
    finalDeviceSeq: integer(input.finalDeviceSeq, 'finalDeviceSeq', 0, Number.MAX_SAFE_INTEGER),
    deviceState: state(input.deviceState, 'deviceState'),
    reason: nullableString(input.reason, 'reason', 1000),
  };
}

export function validateTrialForceAbort(value: unknown): TrialForceAbortV1 {
  const input = object(value, 'body');
  if (input.schema !== 'tnp.calibration.trial-force-abort.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.trial-force-abort.v1');
  }
  const reason = string(input.reason, 'reason', 1000).trim();
  if (!reason) {
    throw new HttpError(422, 'reason_required', 'A forced abort requires an audit reason');
  }
  return { schema: input.schema, reason };
}

export function requiredLease(request: Request, headerName: string): string {
  const lease = request.headers.get(headerName);
  if (!lease || lease.length < 32 || lease.length > 256) {
    throw new HttpError(401, 'producer_lease_required', `${headerName} is required`);
  }
  return lease;
}

export function routeIdentifier(value: string, name: string): string {
  return identifier(value, name);
}
