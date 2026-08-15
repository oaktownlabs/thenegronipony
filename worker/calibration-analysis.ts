import canonicalize from 'canonicalize';
import type { CreateTrialV1, PumpModelId, TrialPlanStepV1 } from '../shared/calibration';
import { sha256 } from './crypto';

export const CALIBRATION_ANALYSIS_METHOD = 'mass-slope-holdout-v1' as const;

export const CALIBRATION_ANALYSIS_POLICY = {
  minimumSamplesPerRun: 8,
  minimumWindowCoverage: 0.7,
  minimumWindowMs: 500,
  minimumRunR2: 0.98,
  minimumTrainingRepeatsPerDuty: 2,
  minimumHoldoutRepeatsPerDuty: 1,
  minimumDutyPoints: 3,
  maximumHoldoutRelativeError: 0.05,
  maximumSupplySpreadMv: 100,
  maximumTemperatureSpreadMilliC: 1_000,
} as const;

export type AnalysisIssueCode =
  | 'source_trial_not_complete'
  | 'source_identity_mismatch'
  | 'missing_setup_provenance'
  | 'setup_mismatch'
  | 'missing_step_samples'
  | 'unsupported_direction'
  | 'faulted_step'
  | 'insufficient_samples'
  | 'insufficient_window'
  | 'non_increasing_time'
  | 'non_positive_flow'
  | 'poor_linearity'
  | 'insufficient_training_repeats'
  | 'missing_holdout'
  | 'holdout_failed'
  | 'insufficient_duty_points'
  | 'non_monotonic_curve';

export interface AnalysisIssue {
  code: AnalysisIssueCode;
  message: string;
  trialId?: string;
  stepIndex?: number;
  dutyBasisPoints?: number;
}

export interface TrialSampleForAnalysis {
  stepIndex: number | null;
  deviceMs: number;
  dutyBasisPoints: number;
  motorOn: boolean;
  massMg: number | null;
  faults: string[];
}

export interface CompletedTrialForAnalysis {
  trialId: string;
  createdAt: string;
  state: string;
  pumpSpecimenId: string;
  pumpModelId: PumpModelId;
  loadCellCalibrationId: string;
  fluid: CreateTrialV1['fluid'];
  setup: CreateTrialV1['setup'];
  plan: CreateTrialV1['plan'];
  loadCellIndependentResidualMg: number;
  samples: TrialSampleForAnalysis[];
}

export interface SetupCompatibilityKey {
  liquid: string;
  tubeId: string;
  inletLengthMm: number;
  outletLengthMm: number;
  liftMm: number;
  nozzleHeightMm: number;
  pwmFrequencyHz: number;
}

export interface SetupProfile {
  fingerprint: string;
  compatibilityKey: SetupCompatibilityKey;
  observed: {
    supplyMv: { minimum: number; maximum: number };
    temperatureMilliC: { minimum: number; maximum: number };
    densityMgPerL: { minimum: number; maximum: number };
  };
  tolerances: {
    maximumSupplyDifferenceMv: number;
    maximumTemperatureDifferenceMilliC: number;
  };
}

export interface RunFitEvidence {
  trialId: string;
  stepIndex: number;
  repeatIndex: number;
  dutyBasisPoints: number;
  observationOrder: string;
  sampleCount: number;
  windowStartDeviceMs: number | null;
  windowEndDeviceMs: number | null;
  windowSpanMs: number;
  massSlopeMgPerMs: number | null;
  flowUlPerSec: number | null;
  uncertaintyUlPerSec: number | null;
  rSquared: number | null;
  acceptedForPoint: boolean;
  issueCodes: AnalysisIssueCode[];
}

export interface DraftFlowPoint {
  dutyBasisPoints: number;
  flowUlPerSec: number | null;
  uncertaintyUlPerSec: number | null;
  sampleCount: number;
  trainingRepeatCount: number;
  holdoutRepeatCount: number;
  holdoutFlowUlPerSec: number | null;
  holdoutRelativeError: number | null;
  holdoutPassed: boolean;
  publicationEligible: boolean;
  runFits: RunFitEvidence[];
}

export interface CalibrationDraftAnalysis {
  methodVersion: typeof CALIBRATION_ANALYSIS_METHOD;
  policy: typeof CALIBRATION_ANALYSIS_POLICY;
  pumpSpecimenId: string;
  pumpModelId: PumpModelId;
  liquid: string;
  tubeId: string;
  estimateClass: 'water_engineering' | 'ingredient_specific';
  sourceTrialIds: string[];
  setupProfile: SetupProfile | null;
  points: DraftFlowPoint[];
  quality: {
    publicationEligible: boolean;
    holdoutStrategy: 'last_chronological_valid_repeat_per_duty';
    uncertaintyMethod: 'ols_95pct_plus_scale_and_repeat_variation';
    issueCount: number;
    issues: AnalysisIssue[];
  };
  evidenceHash: string;
}

interface RegressionResult {
  slope: number;
  rSquared: number;
  slopeCi95: number;
}

const finiteInteger = (value: number | null): value is number =>
  value !== null && Number.isSafeInteger(value);

function compatibilityKey(trial: CompletedTrialForAnalysis): SetupCompatibilityKey | null {
  const { fluid, setup } = trial;
  if (
    !finiteInteger(setup.inletLengthMm) ||
    !finiteInteger(setup.outletLengthMm) ||
    !finiteInteger(setup.liftMm) ||
    !finiteInteger(setup.nozzleHeightMm) ||
    !finiteInteger(setup.supplyMv) ||
    !finiteInteger(fluid.temperatureMilliC) ||
    !Number.isSafeInteger(fluid.densityMgPerL) ||
    fluid.densityMgPerL <= 0
  ) {
    return null;
  }
  return {
    liquid: fluid.name.trim().toLowerCase(),
    tubeId: setup.tubeId.trim(),
    inletLengthMm: setup.inletLengthMm,
    outletLengthMm: setup.outletLengthMm,
    liftMm: setup.liftMm,
    nozzleHeightMm: setup.nozzleHeightMm,
    pwmFrequencyHz: setup.pwmFrequencyHz,
  };
}

const range = (values: number[]): { minimum: number; maximum: number } => ({
  minimum: Math.min(...values),
  maximum: Math.max(...values),
});

async function setupProfile(
  trials: CompletedTrialForAnalysis[],
  issues: AnalysisIssue[],
): Promise<SetupProfile | null> {
  const keys = trials.map(compatibilityKey);
  for (let index = 0; index < keys.length; index += 1) {
    if (!keys[index]) {
      issues.push({
        code: 'missing_setup_provenance',
        message:
          'Temperature, supply voltage, density, tube, and measured geometry are required for analysis.',
        trialId: trials[index].trialId,
      });
    }
  }
  const first = keys[0];
  if (!first || keys.some((key) => !key)) return null;
  const keyJson = canonicalize(first);
  if (!keyJson) throw new Error('Setup compatibility key could not be canonicalized');
  for (let index = 1; index < keys.length; index += 1) {
    if (canonicalize(keys[index]) !== keyJson) {
      issues.push({
        code: 'setup_mismatch',
        message: 'Source trials do not share the same liquid, tube, geometry, and PWM setup.',
        trialId: trials[index].trialId,
      });
    }
  }
  const supply = trials.map((trial) => trial.setup.supplyMv as number);
  const temperature = trials.map((trial) => trial.fluid.temperatureMilliC as number);
  const density = trials.map((trial) => trial.fluid.densityMgPerL);
  const supplyRange = range(supply);
  const temperatureRange = range(temperature);
  if (
    supplyRange.maximum - supplyRange.minimum >
    CALIBRATION_ANALYSIS_POLICY.maximumSupplySpreadMv
  ) {
    issues.push({
      code: 'setup_mismatch',
      message: `Source-trial supply spread exceeds ${CALIBRATION_ANALYSIS_POLICY.maximumSupplySpreadMv} mV.`,
    });
  }
  if (
    temperatureRange.maximum - temperatureRange.minimum >
    CALIBRATION_ANALYSIS_POLICY.maximumTemperatureSpreadMilliC
  ) {
    issues.push({
      code: 'setup_mismatch',
      message: `Source-trial temperature spread exceeds ${CALIBRATION_ANALYSIS_POLICY.maximumTemperatureSpreadMilliC} mC.`,
    });
  }
  return {
    fingerprint: await sha256(keyJson),
    compatibilityKey: first,
    observed: {
      supplyMv: supplyRange,
      temperatureMilliC: temperatureRange,
      densityMgPerL: range(density),
    },
    tolerances: {
      maximumSupplyDifferenceMv: CALIBRATION_ANALYSIS_POLICY.maximumSupplySpreadMv,
      maximumTemperatureDifferenceMilliC:
        CALIBRATION_ANALYSIS_POLICY.maximumTemperatureSpreadMilliC,
    },
  };
}

export function setupProfilesAreCompatible(left: SetupProfile, right: SetupProfile): boolean {
  const leftKey = left.compatibilityKey;
  const rightKey = right.compatibilityKey;
  if (
    leftKey.liquid !== rightKey.liquid ||
    leftKey.inletLengthMm !== rightKey.inletLengthMm ||
    leftKey.outletLengthMm !== rightKey.outletLengthMm ||
    leftKey.liftMm !== rightKey.liftMm ||
    leftKey.nozzleHeightMm !== rightKey.nozzleHeightMm ||
    leftKey.pwmFrequencyHz !== rightKey.pwmFrequencyHz
  ) {
    return false;
  }
  const leftSupplyCenter = (left.observed.supplyMv.minimum + left.observed.supplyMv.maximum) / 2;
  const rightSupplyCenter = (right.observed.supplyMv.minimum + right.observed.supplyMv.maximum) / 2;
  const leftTemperatureCenter =
    (left.observed.temperatureMilliC.minimum + left.observed.temperatureMilliC.maximum) / 2;
  const rightTemperatureCenter =
    (right.observed.temperatureMilliC.minimum + right.observed.temperatureMilliC.maximum) / 2;
  return (
    Math.abs(leftSupplyCenter - rightSupplyCenter) <=
      Math.min(
        left.tolerances.maximumSupplyDifferenceMv,
        right.tolerances.maximumSupplyDifferenceMv,
      ) &&
    Math.abs(leftTemperatureCenter - rightTemperatureCenter) <=
      Math.min(
        left.tolerances.maximumTemperatureDifferenceMilliC,
        right.tolerances.maximumTemperatureDifferenceMilliC,
      )
  );
}

function regress(samples: Array<{ x: number; y: number }>): RegressionResult | null {
  const xMean = samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length;
  const yMean = samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const sample of samples) {
    const x = sample.x - xMean;
    const y = sample.y - yMean;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  if (sxx <= 0 || syy <= 0) return null;
  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;
  let residualSquares = 0;
  for (const sample of samples) {
    const residual = sample.y - (intercept + slope * sample.x);
    residualSquares += residual * residual;
  }
  return {
    slope,
    rSquared: Math.max(0, Math.min(1, 1 - residualSquares / syy)),
    slopeCi95:
      samples.length > 2 ? 1.96 * Math.sqrt(residualSquares / (samples.length - 2) / sxx) : 0,
  };
}

function runFit(
  trial: CompletedTrialForAnalysis,
  step: TrialPlanStepV1,
  issues: AnalysisIssue[],
): RunFitEvidence {
  const issueCodes: AnalysisIssueCode[] = [];
  const recordIssue = (code: AnalysisIssueCode, message: string): void => {
    issueCodes.push(code);
    issues.push({
      code,
      message,
      trialId: trial.trialId,
      stepIndex: step.stepIndex,
      dutyBasisPoints: step.dutyBasisPoints,
    });
  };
  const stepSamples = trial.samples
    .filter((sample) => sample.stepIndex === step.stepIndex)
    .sort((left, right) => left.deviceMs - right.deviceMs);
  if (step.direction !== 'forward') {
    recordIssue(
      'unsupported_direction',
      'V1 publishes forward-direction curves only; reverse runs require a separate method version.',
    );
  }
  if (stepSamples.length === 0)
    recordIssue('missing_step_samples', 'No samples exist for the planned step.');
  if (stepSamples.some((sample) => sample.faults.length > 0)) {
    recordIssue('faulted_step', 'The step contains a device fault and is excluded from the fit.');
  }
  const motorSamples = stepSamples.filter(
    (sample) =>
      sample.motorOn &&
      sample.dutyBasisPoints === step.dutyBasisPoints &&
      finiteInteger(sample.massMg),
  );
  const motorStart = motorSamples[0]?.deviceMs ?? null;
  const windowStart = motorStart === null ? null : motorStart + step.warmupMs;
  const windowEnd = windowStart === null ? null : windowStart + step.collectionMs;
  const selected =
    windowStart === null || windowEnd === null
      ? []
      : motorSamples.filter(
          (sample) => sample.deviceMs >= windowStart && sample.deviceMs <= windowEnd,
        );
  if (selected.length < CALIBRATION_ANALYSIS_POLICY.minimumSamplesPerRun) {
    recordIssue(
      'insufficient_samples',
      `The collection window has ${selected.length} usable samples; ${CALIBRATION_ANALYSIS_POLICY.minimumSamplesPerRun} are required.`,
    );
  }
  const windowSpan =
    selected.length > 1 ? selected[selected.length - 1].deviceMs - selected[0].deviceMs : 0;
  const minimumSpan = Math.max(
    CALIBRATION_ANALYSIS_POLICY.minimumWindowMs,
    Math.floor(step.collectionMs * CALIBRATION_ANALYSIS_POLICY.minimumWindowCoverage),
  );
  if (windowSpan < minimumSpan) {
    recordIssue(
      'insufficient_window',
      `The usable ${windowSpan} ms span is shorter than the required ${minimumSpan} ms.`,
    );
  }
  if (
    selected.some((sample, index) => index > 0 && sample.deviceMs <= selected[index - 1].deviceMs)
  ) {
    recordIssue('non_increasing_time', 'Sample device times are not strictly increasing.');
  }
  const regression =
    selected.length >= 3
      ? regress(selected.map((sample) => ({ x: sample.deviceMs, y: sample.massMg as number })))
      : null;
  let flow: number | null = null;
  let uncertainty: number | null = null;
  if (!regression || regression.slope <= 0) {
    recordIssue('non_positive_flow', 'The measured mass slope is not positive.');
  } else {
    flow = (regression.slope * 1_000_000_000) / trial.fluid.densityMgPerL;
    const regressionUncertainty =
      (regression.slopeCi95 * 1_000_000_000) / trial.fluid.densityMgPerL;
    const scaleUncertainty =
      windowSpan > 0
        ? (Math.abs(trial.loadCellIndependentResidualMg) * 1_000_000_000) /
          (trial.fluid.densityMgPerL * windowSpan)
        : 0;
    uncertainty = Math.sqrt(
      regressionUncertainty * regressionUncertainty + scaleUncertainty * scaleUncertainty,
    );
    if (regression.rSquared < CALIBRATION_ANALYSIS_POLICY.minimumRunR2) {
      recordIssue(
        'poor_linearity',
        `Run R2 ${regression.rSquared.toFixed(5)} is below ${CALIBRATION_ANALYSIS_POLICY.minimumRunR2}.`,
      );
    }
  }
  return {
    trialId: trial.trialId,
    stepIndex: step.stepIndex,
    repeatIndex: step.repeatIndex,
    dutyBasisPoints: step.dutyBasisPoints,
    observationOrder: `${trial.createdAt}\u0000${trial.trialId}\u0000${String(step.stepIndex).padStart(6, '0')}`,
    sampleCount: selected.length,
    windowStartDeviceMs: windowStart,
    windowEndDeviceMs: windowEnd,
    windowSpanMs: windowSpan,
    massSlopeMgPerMs: regression?.slope ?? null,
    flowUlPerSec: flow,
    uncertaintyUlPerSec: uncertainty,
    rSquared: regression?.rSquared ?? null,
    acceptedForPoint: issueCodes.length === 0,
    issueCodes,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pointForDuty(
  dutyBasisPoints: number,
  runFits: RunFitEvidence[],
  issues: AnalysisIssue[],
): DraftFlowPoint {
  const valid = runFits
    .filter((fit) => fit.acceptedForPoint && fit.flowUlPerSec !== null)
    .sort((left, right) => left.observationOrder.localeCompare(right.observationOrder));
  const holdout = valid.length >= 2 ? (valid.at(-1) ?? null) : null;
  const training = holdout ? valid.slice(0, -1) : valid;
  const trainingFlows = training.map((fit) => fit.flowUlPerSec as number);
  const flow = trainingFlows.length > 0 ? mean(trainingFlows) : null;
  let uncertainty: number | null = null;
  if (flow !== null) {
    const within = Math.sqrt(
      training.reduce((sum, fit) => sum + (fit.uncertaintyUlPerSec ?? 0) ** 2, 0) /
        Math.max(1, training.length ** 2),
    );
    const between =
      trainingFlows.length > 1
        ? (1.96 *
            Math.sqrt(
              trainingFlows.reduce((sum, value) => sum + (value - flow) ** 2, 0) /
                (trainingFlows.length - 1),
            )) /
          Math.sqrt(trainingFlows.length)
        : 0;
    uncertainty = Math.sqrt(within * within + between * between);
  }
  const holdoutFlow = holdout?.flowUlPerSec ?? null;
  const holdoutRelativeError =
    flow !== null && flow > 0 && holdoutFlow !== null ? Math.abs(holdoutFlow - flow) / flow : null;
  const combinedUncertainty =
    flow !== null && uncertainty !== null && holdout?.uncertaintyUlPerSec !== null
      ? Math.sqrt(uncertainty ** 2 + (holdout?.uncertaintyUlPerSec ?? 0) ** 2) / flow
      : 0;
  const holdoutPassed =
    holdoutRelativeError !== null &&
    holdoutRelativeError <=
      Math.max(CALIBRATION_ANALYSIS_POLICY.maximumHoldoutRelativeError, combinedUncertainty);
  if (training.length < CALIBRATION_ANALYSIS_POLICY.minimumTrainingRepeatsPerDuty) {
    issues.push({
      code: 'insufficient_training_repeats',
      message: `${CALIBRATION_ANALYSIS_POLICY.minimumTrainingRepeatsPerDuty} training repeats are required at each duty.`,
      dutyBasisPoints,
    });
  }
  if (!holdout) {
    issues.push({
      code: 'missing_holdout',
      message: 'A chronological holdout repeat is required at each duty.',
      dutyBasisPoints,
    });
  } else if (!holdoutPassed) {
    issues.push({
      code: 'holdout_failed',
      message: `The held-out repeat differs by ${((holdoutRelativeError ?? 0) * 100).toFixed(2)}%.`,
      dutyBasisPoints,
    });
  }
  const publicationEligible =
    runFits.every((fit) => fit.acceptedForPoint) &&
    training.length >= CALIBRATION_ANALYSIS_POLICY.minimumTrainingRepeatsPerDuty &&
    Boolean(holdout) &&
    holdoutPassed;
  return {
    dutyBasisPoints,
    flowUlPerSec: flow === null ? null : Math.round(flow),
    uncertaintyUlPerSec: uncertainty === null ? null : Math.max(1, Math.ceil(uncertainty)),
    sampleCount: training.reduce((sum, fit) => sum + fit.sampleCount, 0),
    trainingRepeatCount: training.length,
    holdoutRepeatCount: holdout ? 1 : 0,
    holdoutFlowUlPerSec: holdoutFlow === null ? null : Math.round(holdoutFlow),
    holdoutRelativeError,
    holdoutPassed,
    publicationEligible,
    runFits,
  };
}

export async function analyzeCompletedTrials(
  inputTrials: CompletedTrialForAnalysis[],
): Promise<CalibrationDraftAnalysis> {
  if (inputTrials.length === 0) throw new Error('At least one source trial is required');
  const trials = [...inputTrials].sort((left, right) =>
    `${left.createdAt}\u0000${left.trialId}`.localeCompare(
      `${right.createdAt}\u0000${right.trialId}`,
    ),
  );
  const first = trials[0];
  const issues: AnalysisIssue[] = [];
  for (const trial of trials) {
    if (trial.state !== 'complete') {
      issues.push({
        code: 'source_trial_not_complete',
        message: 'Only durably completed trials may be analyzed.',
        trialId: trial.trialId,
      });
    }
    if (trial.pumpSpecimenId !== first.pumpSpecimenId || trial.pumpModelId !== first.pumpModelId) {
      issues.push({
        code: 'source_identity_mismatch',
        message: 'Every source trial must belong to the same physical pump specimen and model.',
        trialId: trial.trialId,
      });
    }
  }
  const profile = await setupProfile(trials, issues);
  const runFits = trials.flatMap((trial) =>
    trial.plan.steps.map((step) => runFit(trial, step, issues)),
  );
  const duties = [...new Set(runFits.map((fit) => fit.dutyBasisPoints))].sort(
    (left, right) => left - right,
  );
  const points = duties.map((duty) =>
    pointForDuty(
      duty,
      runFits.filter((fit) => fit.dutyBasisPoints === duty),
      issues,
    ),
  );
  if (points.length < CALIBRATION_ANALYSIS_POLICY.minimumDutyPoints) {
    issues.push({
      code: 'insufficient_duty_points',
      message: `${CALIBRATION_ANALYSIS_POLICY.minimumDutyPoints} distinct duty points are required to publish a curve.`,
    });
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      previous.flowUlPerSec !== null &&
      current.flowUlPerSec !== null &&
      current.flowUlPerSec + (current.uncertaintyUlPerSec ?? 0) <
        previous.flowUlPerSec - (previous.uncertaintyUlPerSec ?? 0)
    ) {
      issues.push({
        code: 'non_monotonic_curve',
        message: 'Flow decreases with increasing duty beyond the stated uncertainty.',
        dutyBasisPoints: current.dutyBasisPoints,
      });
    }
  }
  const sourceTrialIds = trials.map((trial) => trial.trialId);
  const evidence = canonicalize({
    methodVersion: CALIBRATION_ANALYSIS_METHOD,
    policy: CALIBRATION_ANALYSIS_POLICY,
    sourceTrialIds,
    trials,
  });
  if (!evidence) throw new Error('Analysis evidence could not be canonicalized');
  const publicationEligible =
    profile !== null &&
    issues.length === 0 &&
    points.length >= CALIBRATION_ANALYSIS_POLICY.minimumDutyPoints &&
    points.every((point) => point.publicationEligible && point.flowUlPerSec !== null);
  return {
    methodVersion: CALIBRATION_ANALYSIS_METHOD,
    policy: CALIBRATION_ANALYSIS_POLICY,
    pumpSpecimenId: first.pumpSpecimenId,
    pumpModelId: first.pumpModelId,
    liquid: first.fluid.name.trim().toLowerCase(),
    tubeId: first.setup.tubeId,
    estimateClass:
      first.fluid.name.trim().toLowerCase() === 'water'
        ? 'water_engineering'
        : 'ingredient_specific',
    sourceTrialIds,
    setupProfile: profile,
    points,
    quality: {
      publicationEligible,
      holdoutStrategy: 'last_chronological_valid_repeat_per_duty',
      uncertaintyMethod: 'ols_95pct_plus_scale_and_repeat_variation',
      issueCount: issues.length,
      issues,
    },
    evidenceHash: await sha256(evidence),
  };
}
