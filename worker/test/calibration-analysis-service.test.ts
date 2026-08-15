import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { TrialPlanStepV1 } from '../../shared/calibration';
import { createCalibrationDraft, getCalibrationCurve } from '../calibration-analysis-service';

const NOW = '2026-08-15T13:00:00.000Z';
const TRIAL_ID = 'tr_analysis_service_fixture';
const ORIGIN = 'http://calibration.test';
const OPERATOR_HEADERS = {
  'x-calibration-local-token': 'worker-test-token-not-for-production',
  'x-calibration-local-actor': 'analysis-service-test',
};

const operatorPost = (path: string, body: unknown): Promise<Response> =>
  exports.default.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { ...OPERATOR_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

async function insertCompletedMeasuredFixture(): Promise<void> {
  const steps: TrialPlanStepV1[] = [];
  const samples: Array<{
    seq: number;
    stepIndex: number;
    deviceMs: number;
    dutyBasisPoints: number;
    massMg: number;
  }> = [];
  let stepIndex = 0;
  let seq = 1;
  for (const dutyBasisPoints of [2_500, 5_000, 7_500]) {
    for (let repeatIndex = 0; repeatIndex < 3; repeatIndex += 1) {
      steps.push({
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
      });
      const runStart = stepIndex * 2_000;
      const nominalSlope = dutyBasisPoints / 2_500;
      const repeatFactor = [0.99, 1.01, 1][repeatIndex];
      for (let offset = 0; offset <= 800; offset += 100) {
        samples.push({
          seq,
          stepIndex,
          deviceMs: runStart + offset,
          dutyBasisPoints,
          massMg: Math.round((runStart + offset) * nominalSlope * repeatFactor),
        });
        seq += 1;
      }
      stepIndex += 1;
    }
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pump_specimens (id, pump_model_id, label, created_at)
       VALUES ('analysis-kamoer-01', 'kamoer-kphm600-12b3b17', 'Analysis Kamoer fixture', ?)`,
    ).bind(NOW),
    env.DB.prepare(
      `INSERT INTO bench_devices (id, created_at)
       VALUES ('analysis-device-01', ?)`,
    ).bind(NOW),
    env.DB.prepare(
      `INSERT INTO load_cell_calibrations
          (id, bench_device_id, firmware_version, hx711_mode, channel_count,
           counts_per_gram_numerator, counts_per_gram_denominator,
           reference_observations_json, independent_check_json, method_version,
           recorded_at, created_at, accepted_at)
         VALUES ('analysis-scale-01', 'analysis-device-01', 'fixture', 'steady_10_sps', 1,
                 1000, 1, '[]', '{"referenceMassMg":50000,"rawAdc":50000,"residualMg":0}',
                 'controlled-test-fixture', ?, ?, ?)`,
    ).bind(NOW, NOW, NOW),
    env.DB.prepare(
      `INSERT INTO trials
          (id, bench_id, bench_session_id, producer_session_id, producer_lease_expires_at,
           access_subject, device_id, boot_id, pump_specimen_id, pump_model_id,
           load_cell_calibration_id, state, transport, firmware_version, protocol_version,
           fluid_json, setup_json, plan_json, contiguous_published_stream_seq,
           contiguous_projected_device_seq, created_at, started_at, completed_at, updated_at)
         VALUES (?, 'analysis-bench', 'analysis-session', 'analysis-producer', ?, 'fixture-actor',
                 'analysis-device-01', 'analysis-boot-01', 'analysis-kamoer-01',
                 'kamoer-kphm600-12b3b17', 'analysis-scale-01', 'complete', 'web_serial',
                 'fixture', 'tnp.serial.v1', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      TRIAL_ID,
      '2026-08-15T14:00:00.000Z',
      JSON.stringify({
        name: 'water',
        densityMgPerL: 1_000_000,
        densitySource: 'controlled test fixture',
        temperatureMilliC: 21_000,
      }),
      JSON.stringify({
        tubeId: 'analysis-tube-01',
        inletLengthMm: 250,
        outletLengthMm: 300,
        liftMm: 100,
        nozzleHeightMm: 80,
        supplyMv: 12_000,
        pwmFrequencyHz: 20_000,
      }),
      JSON.stringify({
        schema: 'tnp.calibration.plan.v1',
        planId: 'analysis-service-fixture',
        steps,
        maximumTrialMs: 120_000,
      }),
      samples.length,
      samples.length,
      NOW,
      NOW,
      NOW,
      NOW,
    ),
  ]);
  const sampleStatements = samples.flatMap((sample) => [
    env.DB.prepare(
      `INSERT INTO device_events
          (device_id, boot_id, device_seq, event_sha256, trial_id, stream_seq,
           event_type, device_ms, received_at, event_json)
         VALUES ('analysis-device-01', 'analysis-boot-01', ?, ?, ?, ?, 'sample', ?, ?, '{}')`,
    ).bind(sample.seq, `controlled-hash-${sample.seq}`, TRIAL_ID, sample.seq, sample.deviceMs, NOW),
    env.DB.prepare(
      `INSERT INTO samples
          (device_id, boot_id, device_seq, trial_id, stream_seq, step_index, device_ms,
           received_at, acquisition_mode, expected_sample_interval_ms, duty_basis_points,
           duty_timer_count, motor_on, raw_adc_json, mass_mg, tach_count, supply_mv, faults_json)
         VALUES ('analysis-device-01', 'analysis-boot-01', ?, ?, ?, ?, ?, ?,
                 'steady_10_sps', 100, ?, 0, 1, '[0]', ?, NULL, 12000, '[]')`,
    ).bind(
      sample.seq,
      TRIAL_ID,
      sample.seq,
      sample.stepIndex,
      sample.deviceMs,
      NOW,
      sample.dutyBasisPoints,
      sample.massMg,
    ),
  ]);
  await env.DB.batch(sampleStatements);
}

describe('calibration draft review and publication service', () => {
  it('persists measured evidence idempotently and requires review before explicit publication', async () => {
    await insertCompletedMeasuredFixture();
    const first = await createCalibrationDraft(
      env.DB,
      {
        schema: 'tnp.calibration.curve-draft.create.v1',
        sourceTrialIds: [TRIAL_ID],
      },
      NOW,
    );
    expect(first.created).toBe(true);
    const firstCurve = first.body.curve as {
      curveId: string;
      evidenceHash: string;
      publicationEligible: boolean;
      reviewStatus: string;
      points: unknown[];
    };
    expect(firstCurve).toMatchObject({ publicationEligible: true, reviewStatus: 'draft' });
    expect(firstCurve.points).toHaveLength(3);

    const retryResponse = await operatorPost('/api/v1/operator/calibration-curves/drafts', {
      schema: 'tnp.calibration.curve-draft.create.v1',
      sourceTrialIds: [TRIAL_ID],
    });
    expect(retryResponse.status).toBe(200);
    const retry = (await retryResponse.json()) as { curve: { curveId: string } };
    expect(retry.curve.curveId).toBe(firstCurve.curveId);

    const preReviewPublish = await operatorPost(
      `/api/v1/operator/calibration-curves/${encodeURIComponent(firstCurve.curveId)}/publish`,
      {
        schema: 'tnp.calibration.curve-publish.v1',
        expectedEvidenceHash: firstCurve.evidenceHash,
        reason: 'Controlled pre-review publication attempt.',
      },
    );
    expect(preReviewPublish.status).toBe(409);
    expect(await preReviewPublish.json()).toMatchObject({
      error: { code: 'curve_not_publishable' },
    });

    const reviewResponse = await operatorPost(
      `/api/v1/operator/calibration-curves/${encodeURIComponent(firstCurve.curveId)}/review`,
      {
        schema: 'tnp.calibration.curve-review.v1',
        decision: 'accept',
        expectedEvidenceHash: firstCurve.evidenceHash,
        reason: 'Controlled evidence and holdouts were independently checked.',
      },
    );
    expect(reviewResponse.status).toBe(200);
    expect(await reviewResponse.json()).toMatchObject({
      reviewStatus: 'accepted',
      decision: 'accept',
    });

    const publishResponse = await operatorPost(
      `/api/v1/operator/calibration-curves/${encodeURIComponent(firstCurve.curveId)}/publish`,
      {
        schema: 'tnp.calibration.curve-publish.v1',
        expectedEvidenceHash: firstCurve.evidenceHash,
        reason: 'Select this physical specimen for the public comparison.',
      },
    );
    expect(publishResponse.status).toBe(200);
    expect(await publishResponse.json()).toMatchObject({
      curveId: firstCurve.curveId,
      pumpSpecimenId: 'analysis-kamoer-01',
    });
    const selection = await env.DB.prepare(
      'SELECT pump_specimen_id, curve_id FROM public_curve_selections WHERE pump_model_id = ?',
    )
      .bind('kamoer-kphm600-12b3b17')
      .first<{ pump_specimen_id: string; curve_id: string }>();
    expect(selection).toEqual({
      pump_specimen_id: 'analysis-kamoer-01',
      curve_id: firstCurve.curveId,
    });
    const publicationAudit = await env.DB.prepare(
      'SELECT actor_subject, selection_reason FROM calibration_curve_publications WHERE curve_id = ?',
    )
      .bind(firstCurve.curveId)
      .first<{ actor_subject: string; selection_reason: string }>();
    expect(publicationAudit).toEqual({
      actor_subject: 'local:analysis-service-test',
      selection_reason: 'Select this physical specimen for the public comparison.',
    });
    const stored = await getCalibrationCurve(env.DB, firstCurve.curveId);
    expect(stored.curve).toMatchObject({ reviewStatus: 'accepted', publicationEligible: true });

    const publicComparison = await exports.default.fetch(
      new Request(`${ORIGIN}/api/v1/comparison`),
    );
    expect(publicComparison.status).toBe(200);
    const comparisonBody = (await publicComparison.json()) as {
      pumps: Array<{
        selectedSpecimenId: string | null;
        acceptedCurve: null | { estimateClass: string; setupFingerprint: string };
      }>;
    };
    expect(comparisonBody.pumps[0]).toMatchObject({
      selectedSpecimenId: 'analysis-kamoer-01',
      acceptedCurve: { estimateClass: 'water_engineering' },
    });
    expect(comparisonBody.pumps[1]).toMatchObject({
      selectedSpecimenId: null,
      acceptedCurve: null,
    });

    const unauthorizedCurve = await exports.default.fetch(
      new Request(
        `${ORIGIN}/api/v1/operator/calibration-curves/${encodeURIComponent(firstCurve.curveId)}`,
      ),
    );
    expect(unauthorizedCurve.status).toBe(401);
    const authorizedCurve = await exports.default.fetch(
      new Request(
        `${ORIGIN}/api/v1/operator/calibration-curves/${encodeURIComponent(firstCurve.curveId)}`,
        { headers: OPERATOR_HEADERS },
      ),
    );
    expect(authorizedCurve.status).toBe(200);

    const kamoerSetup = await env.DB.prepare(
      'SELECT setup_fingerprint, setup_profile_json FROM calibration_curves WHERE id = ?',
    )
      .bind(firstCurve.curveId)
      .first<{ setup_fingerprint: string; setup_profile_json: string }>();
    if (!kamoerSetup) throw new Error('Published controlled curve must have a setup profile');
    const gikfunSetupProfile = JSON.parse(kamoerSetup.setup_profile_json) as {
      fingerprint: string;
      compatibilityKey: { tubeId: string; nozzleHeightMm: number };
    };
    gikfunSetupProfile.fingerprint = 'd'.repeat(64);
    gikfunSetupProfile.compatibilityKey.tubeId = 'analysis-gikfun-tube-01';
    const gikfunCurveId = 'curve_controlled_gikfun';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO pump_specimens (id, pump_model_id, label, created_at)
         VALUES ('analysis-gikfun-01', 'gikfun-ae1207', 'Analysis Gikfun fixture', ?)`,
      ).bind(NOW),
      env.DB.prepare(
        `INSERT INTO calibration_curves
            (id, pump_specimen_id, pump_model_id, liquid, tube_id,
             min_duty_basis_points, max_duty_basis_points, review_status, estimate_class,
             source_trial_ids_json, created_at, published_at, analysis_method_version,
             evidence_hash, setup_fingerprint, setup_profile_json, quality_json,
             publication_eligible, reviewed_at, reviewed_by)
           VALUES (?, 'analysis-gikfun-01', 'gikfun-ae1207', 'water', 'analysis-gikfun-tube-01',
                   2500, 7500, 'accepted', 'installed_path_validated', ?, ?, ?,
                   'controlled-test-fixture', ?, ?, ?, '{}', 1, ?, 'local:fixture')`,
      ).bind(
        gikfunCurveId,
        JSON.stringify([TRIAL_ID]),
        NOW,
        NOW,
        'b'.repeat(64),
        gikfunSetupProfile.fingerprint,
        JSON.stringify(gikfunSetupProfile),
        NOW,
      ),
      ...[2_500, 5_000, 7_500].map((duty, index) =>
        env.DB.prepare(
          `INSERT INTO calibration_points
              (curve_id, duty_basis_points, flow_ul_per_sec, uncertainty_ul_per_sec,
               sample_count, evidence_json)
             VALUES (?, ?, ?, 25, 16, '{}')`,
        ).bind(gikfunCurveId, duty, (index + 1) * 900),
      ),
      env.DB.prepare(
        `INSERT INTO public_curve_selections
            (pump_model_id, pump_specimen_id, curve_id, setup_fingerprint,
             selected_by, selection_reason, selected_at)
           VALUES ('gikfun-ae1207', 'analysis-gikfun-01', ?, ?, 'local:fixture',
                   'Controlled compatible setup selection.', ?)`,
      ).bind(gikfunCurveId, gikfunSetupProfile.fingerprint, NOW),
    ]);
    const compatibleRecipes = await exports.default.fetch(
      new Request(`${ORIGIN}/api/v1/recipes/predictions`),
    );
    const compatibleRecipeBody = (await compatibleRecipes.json()) as {
      recipes: Array<{ specimenResults: Array<{ estimateClass: string | null }> }>;
    };
    expect(
      compatibleRecipeBody.recipes.every(
        (recipe) => recipe.specimenResults[1].estimateClass === 'installed_path_validated',
      ),
    ).toBe(true);

    const mismatchedProfile = structuredClone(gikfunSetupProfile) as {
      fingerprint: string;
      compatibilityKey: { nozzleHeightMm: number };
    };
    mismatchedProfile.fingerprint = 'c'.repeat(64);
    mismatchedProfile.compatibilityKey.nozzleHeightMm += 1;
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE calibration_curves SET setup_fingerprint = ?, setup_profile_json = ? WHERE id = ?',
      ).bind('c'.repeat(64), JSON.stringify(mismatchedProfile), gikfunCurveId),
      env.DB.prepare(
        'UPDATE public_curve_selections SET setup_fingerprint = ? WHERE pump_model_id = ?',
      ).bind('c'.repeat(64), 'gikfun-ae1207'),
    ]);
    const mismatchedComparison = await exports.default.fetch(
      new Request(`${ORIGIN}/api/v1/comparison`),
    );
    const mismatchedBody = (await mismatchedComparison.json()) as {
      pumps: Array<{ acceptedCurve: unknown; missingReason: string | null }>;
    };
    expect(mismatchedBody.pumps).toEqual([
      expect.objectContaining({ acceptedCurve: null, missingReason: 'setup_mismatch' }),
      expect.objectContaining({ acceptedCurve: null, missingReason: 'setup_mismatch' }),
    ]);

    const rejectedCurveId = 'curve_controlled_rejected';
    const rejectedEvidenceHash = 'e'.repeat(64);
    await env.DB.prepare(
      `INSERT INTO calibration_curves
          (id, pump_specimen_id, pump_model_id, liquid, tube_id,
           min_duty_basis_points, max_duty_basis_points, review_status, estimate_class,
           source_trial_ids_json, created_at, analysis_method_version, evidence_hash,
           setup_fingerprint, setup_profile_json, quality_json, publication_eligible)
         VALUES (?, 'analysis-kamoer-01', 'kamoer-kphm600-12b3b17', 'water',
                 'analysis-tube-01', 5000, 5000, 'draft', 'water_engineering', ?, ?,
                 'controlled-test-fixture', ?, ?, ?, '{"publicationEligible":false}', 0)`,
    )
      .bind(
        rejectedCurveId,
        JSON.stringify([TRIAL_ID]),
        NOW,
        rejectedEvidenceHash,
        kamoerSetup.setup_fingerprint,
        kamoerSetup.setup_profile_json,
      )
      .run();
    const failedAccept = await operatorPost(
      `/api/v1/operator/calibration-curves/${rejectedCurveId}/review`,
      {
        schema: 'tnp.calibration.curve-review.v1',
        decision: 'accept',
        expectedEvidenceHash: rejectedEvidenceHash,
        reason: 'Controlled attempt to accept failed quality evidence.',
      },
    );
    expect(failedAccept.status).toBe(409);
    expect(await failedAccept.json()).toMatchObject({
      error: { code: 'curve_quality_gate_failed' },
    });
    const rejected = await operatorPost(
      `/api/v1/operator/calibration-curves/${rejectedCurveId}/review`,
      {
        schema: 'tnp.calibration.curve-review.v1',
        decision: 'reject',
        expectedEvidenceHash: rejectedEvidenceHash,
        reason: 'Insufficient holdout evidence; retain the draft for audit.',
      },
    );
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({ decision: 'reject', reviewStatus: 'rejected' });
  });
});
