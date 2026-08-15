import { describe, expect, it } from 'vitest';
import type { PumpModelId, TrialPlanStepV1 } from '../../shared/calibration';
import {
  analyzeCompletedTrials,
  type CompletedTrialForAnalysis,
  setupProfilesAreCompatible,
} from '../calibration-analysis';

const MODEL: PumpModelId = 'kamoer-kphm600-12b3b17';

function measuredTrial(options?: {
  duties?: number[];
  repeats?: number;
  supplyMv?: number;
  temperatureMilliC?: number;
  tubeId?: string;
  faultStep?: number;
}): CompletedTrialForAnalysis {
  const duties = options?.duties ?? [2_500, 5_000, 7_500];
  const repeats = options?.repeats ?? 3;
  const steps: TrialPlanStepV1[] = [];
  const samples: CompletedTrialForAnalysis['samples'] = [];
  let stepIndex = 0;
  for (const dutyBasisPoints of duties) {
    for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
      const step: TrialPlanStepV1 = {
        stepIndex,
        repeatIndex,
        direction: 'forward',
        dutyBasisPoints,
        warmupMs: 100,
        collectionMs: 1_000,
        settleMs: 200,
        acquisitionMode: 'steady_10_sps',
        maximumMassMg: 100_000,
        hardStopMs: 2_000,
      };
      steps.push(step);
      const runStart = stepIndex * 2_000;
      const nominalSlopeMgPerMs = dutyBasisPoints / 2_500;
      const repeatFactor = [0.99, 1.01, 1][repeatIndex] ?? 1;
      for (let offset = 0; offset <= 1_100; offset += 100) {
        samples.push({
          stepIndex,
          deviceMs: runStart + offset,
          dutyBasisPoints,
          motorOn: true,
          massMg: Math.round((runStart + offset) * nominalSlopeMgPerMs * repeatFactor),
          faults: options?.faultStep === stepIndex ? ['fixture_fault'] : [],
        });
      }
      stepIndex += 1;
    }
  }
  return {
    trialId: 'tr_controlled_fixture_01',
    createdAt: '2026-08-15T12:00:00.000Z',
    state: 'complete',
    pumpSpecimenId: 'owner-kamoer-01',
    pumpModelId: MODEL,
    loadCellCalibrationId: 'scale-controlled-fixture',
    fluid: {
      name: 'water',
      densityMgPerL: 1_000_000,
      densitySource: 'controlled test fixture',
      temperatureMilliC: options?.temperatureMilliC ?? 21_000,
    },
    setup: {
      tubeId: options?.tubeId ?? 'tube-controlled-fixture',
      inletLengthMm: 250,
      outletLengthMm: 300,
      liftMm: 100,
      nozzleHeightMm: 80,
      supplyMv: options?.supplyMv ?? 12_000,
      pwmFrequencyHz: 20_000,
    },
    plan: {
      schema: 'tnp.calibration.plan.v1',
      planId: 'controlled-fixture-plan',
      steps,
      maximumTrialMs: 120_000,
    },
    loadCellIndependentResidualMg: 0,
    samples,
  };
}

describe('deterministic calibration analysis', () => {
  it('produces an eligible specimen-scoped draft only with training and holdout evidence', async () => {
    const result = await analyzeCompletedTrials([measuredTrial()]);

    expect(result).toMatchObject({
      methodVersion: 'mass-slope-holdout-v1',
      pumpSpecimenId: 'owner-kamoer-01',
      pumpModelId: MODEL,
      estimateClass: 'water_engineering',
      quality: {
        publicationEligible: true,
        issueCount: 0,
        holdoutStrategy: 'last_chronological_valid_repeat_per_duty',
      },
    });
    expect(result.sourceTrialIds).toEqual(['tr_controlled_fixture_01']);
    expect(result.points).toHaveLength(3);
    expect(result.points.map((point) => point.flowUlPerSec)).toEqual([1_000, 2_000, 3_000]);
    expect(result.points.every((point) => point.trainingRepeatCount === 2)).toBe(true);
    expect(result.points.every((point) => point.holdoutRepeatCount === 1)).toBe(true);
    expect(result.points.every((point) => point.holdoutPassed)).toBe(true);
    expect(result.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps a sparse run as a reviewable but unpublishable draft', async () => {
    const result = await analyzeCompletedTrials([measuredTrial({ duties: [5_000], repeats: 1 })]);

    expect(result.quality.publicationEligible).toBe(false);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({
      trainingRepeatCount: 1,
      holdoutRepeatCount: 0,
      publicationEligible: false,
    });
    expect(result.quality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'insufficient_training_repeats',
        'missing_holdout',
        'insufficient_duty_points',
      ]),
    );
  });

  it('rejects faulted evidence instead of silently dropping the bad run', async () => {
    const result = await analyzeCompletedTrials([measuredTrial({ faultStep: 1 })]);

    expect(result.quality.publicationEligible).toBe(false);
    expect(result.quality.issues.map((issue) => issue.code)).toContain('faulted_step');
    expect(result.points[0].publicationEligible).toBe(false);
  });

  it('does not mix reverse-flow evidence into a forward curve', async () => {
    const trial = measuredTrial();
    trial.plan.steps[0].direction = 'reverse';
    const result = await analyzeCompletedTrials([trial]);

    expect(result.quality.publicationEligible).toBe(false);
    expect(result.quality.issues.map((issue) => issue.code)).toContain('unsupported_direction');
  });

  it('does not combine two tube identities into one specimen curve', async () => {
    const first = measuredTrial();
    const second = measuredTrial({ tubeId: 'replacement-tube' });
    second.trialId = 'tr_controlled_fixture_02';
    second.createdAt = '2026-08-15T12:30:00.000Z';
    const result = await analyzeCompletedTrials([first, second]);

    expect(result.quality.publicationEligible).toBe(false);
    expect(result.quality.issues.map((issue) => issue.code)).toContain('setup_mismatch');
  });

  it('uses an explicit setup profile and bounded measured-condition compatibility', async () => {
    const baseline = await analyzeCompletedTrials([measuredTrial()]);
    const near = await analyzeCompletedTrials([measuredTrial({ supplyMv: 12_090 })]);
    const otherPumpTube = await analyzeCompletedTrials([
      measuredTrial({ tubeId: 'different-explicit-pump-tube' }),
    ]);
    const far = await analyzeCompletedTrials([measuredTrial({ supplyMv: 12_101 })]);
    const thermal = await analyzeCompletedTrials([measuredTrial({ temperatureMilliC: 22_001 })]);

    if (
      !baseline.setupProfile ||
      !near.setupProfile ||
      !otherPumpTube.setupProfile ||
      !far.setupProfile ||
      !thermal.setupProfile
    ) {
      throw new Error('Controlled fixtures must produce setup profiles');
    }
    expect(setupProfilesAreCompatible(baseline.setupProfile, near.setupProfile)).toBe(true);
    expect(setupProfilesAreCompatible(baseline.setupProfile, otherPumpTube.setupProfile)).toBe(
      true,
    );
    expect(setupProfilesAreCompatible(baseline.setupProfile, far.setupProfile)).toBe(false);
    expect(setupProfilesAreCompatible(baseline.setupProfile, thermal.setupProfile)).toBe(false);
  });
});
