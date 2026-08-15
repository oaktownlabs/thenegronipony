import canonicalize from 'canonicalize';
import type {
  CreateCalibrationCurveDraftV1,
  CreateTrialV1,
  PublishCalibrationCurveV1,
  PumpModelId,
  ReviewCalibrationCurveV1,
} from '../shared/calibration';
import type { OperatorActor } from './auth';
import {
  analyzeCompletedTrials,
  CALIBRATION_ANALYSIS_METHOD,
  type CompletedTrialForAnalysis,
} from './calibration-analysis';
import { HttpError } from './http';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAXIMUM_SOURCE_TRIALS = 32;
const MAXIMUM_SAMPLES_PER_SOURCE_TRIAL = 5_000;

interface CurveRow {
  id: string;
  pump_specimen_id: string;
  pump_model_id: PumpModelId;
  liquid: string;
  tube_id: string;
  min_duty_basis_points: number;
  max_duty_basis_points: number;
  review_status: 'draft' | 'under_review' | 'accepted' | 'rejected';
  estimate_class: 'water_engineering' | 'ingredient_specific' | 'installed_path_validated';
  source_trial_ids_json: string;
  created_at: string;
  published_at: string | null;
  analysis_method_version: string | null;
  evidence_hash: string | null;
  setup_fingerprint: string | null;
  setup_profile_json: string | null;
  quality_json: string | null;
  publication_eligible: number;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface PointRow {
  duty_basis_points: number;
  flow_ul_per_sec: number;
  uncertainty_ul_per_sec: number;
  sample_count: number;
  evidence_json: string | null;
}

interface SourceTrialRow {
  id: string;
  created_at: string;
  state: string;
  pump_specimen_id: string;
  pump_model_id: PumpModelId;
  load_cell_calibration_id: string;
  fluid_json: string;
  setup_json: string;
  plan_json: string;
  independent_check_json: string;
  contiguous_published_stream_seq: number;
}

interface SourceSampleRow {
  step_index: number | null;
  device_ms: number;
  duty_basis_points: number;
  motor_on: number;
  mass_mg: number | null;
  faults_json: string;
}

function object(value: unknown, field = 'body'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_body', `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new HttpError(422, 'invalid_identifier', `${field} is not a valid identifier`);
  }
  return value;
}

function evidenceHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new HttpError(
      422,
      'invalid_evidence_hash',
      'expectedEvidenceHash must be 64 hex characters',
    );
  }
  return value;
}

function reason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 8 || value.trim().length > 2_000) {
    throw new HttpError(422, 'invalid_review_reason', 'reason must contain 8 to 2000 characters');
  }
  return value.trim();
}

export function validateCreateCalibrationDraft(value: unknown): CreateCalibrationCurveDraftV1 {
  const input = object(value);
  if (input.schema !== 'tnp.calibration.curve-draft.create.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.curve-draft.create.v1');
  }
  if (
    !Array.isArray(input.sourceTrialIds) ||
    input.sourceTrialIds.length < 1 ||
    input.sourceTrialIds.length > MAXIMUM_SOURCE_TRIALS
  ) {
    throw new HttpError(
      422,
      'invalid_source_trials',
      `sourceTrialIds must contain 1 to ${MAXIMUM_SOURCE_TRIALS} trial IDs`,
    );
  }
  const sourceTrialIds = input.sourceTrialIds.map((trialId, index) =>
    identifier(trialId, `sourceTrialIds[${index}]`),
  );
  if (new Set(sourceTrialIds).size !== sourceTrialIds.length) {
    throw new HttpError(
      422,
      'duplicate_source_trial',
      'sourceTrialIds must not contain duplicates',
    );
  }
  return { schema: input.schema, sourceTrialIds };
}

export function validateReviewCalibrationCurve(value: unknown): ReviewCalibrationCurveV1 {
  const input = object(value);
  if (input.schema !== 'tnp.calibration.curve-review.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.curve-review.v1');
  }
  if (input.decision !== 'accept' && input.decision !== 'reject') {
    throw new HttpError(422, 'invalid_review_decision', 'decision must be accept or reject');
  }
  return {
    schema: input.schema,
    decision: input.decision,
    expectedEvidenceHash: evidenceHash(input.expectedEvidenceHash),
    reason: reason(input.reason),
  };
}

export function validatePublishCalibrationCurve(value: unknown): PublishCalibrationCurveV1 {
  const input = object(value);
  if (input.schema !== 'tnp.calibration.curve-publish.v1') {
    throw new HttpError(400, 'invalid_schema', 'Expected tnp.calibration.curve-publish.v1');
  }
  return {
    schema: input.schema,
    expectedEvidenceHash: evidenceHash(input.expectedEvidenceHash),
    reason: reason(input.reason),
  };
}

function parseJson<T>(value: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new HttpError(500, 'stored_evidence_invalid', `${field} contains invalid stored JSON`);
  }
}

async function sourceTrial(db: D1Database, trialId: string): Promise<CompletedTrialForAnalysis> {
  const row = await db
    .prepare(
      `SELECT t.id, t.created_at, t.state, t.pump_specimen_id, t.pump_model_id,
              t.load_cell_calibration_id, t.fluid_json, t.setup_json, t.plan_json,
              t.contiguous_published_stream_seq, lc.independent_check_json
         FROM trials t
         JOIN load_cell_calibrations lc ON lc.id = t.load_cell_calibration_id
        WHERE t.id = ?`,
    )
    .bind(trialId)
    .first<SourceTrialRow>();
  if (!row)
    throw new HttpError(404, 'source_trial_not_found', `Source trial ${trialId} does not exist`);
  const sampleRows = await db
    .prepare(
      `SELECT step_index, device_ms, duty_basis_points, motor_on, mass_mg, faults_json
         FROM samples
        WHERE trial_id = ? AND stream_seq <= ?
        ORDER BY device_ms, device_seq
        LIMIT ?`,
    )
    .bind(trialId, row.contiguous_published_stream_seq, MAXIMUM_SAMPLES_PER_SOURCE_TRIAL + 1)
    .all<SourceSampleRow>();
  if (sampleRows.results.length > MAXIMUM_SAMPLES_PER_SOURCE_TRIAL) {
    throw new HttpError(
      413,
      'analysis_evidence_too_large',
      `Source trial ${trialId} exceeds the ${MAXIMUM_SAMPLES_PER_SOURCE_TRIAL}-sample analysis limit`,
    );
  }
  const independentCheck = parseJson<{ residualMg?: unknown }>(
    row.independent_check_json,
    'load_cell_calibrations.independent_check_json',
  );
  if (!Number.isSafeInteger(independentCheck.residualMg)) {
    throw new HttpError(
      409,
      'load_cell_uncertainty_missing',
      `Source trial ${trialId} has no integer independent-check residual`,
    );
  }
  return {
    trialId: row.id,
    createdAt: row.created_at,
    state: row.state,
    pumpSpecimenId: row.pump_specimen_id,
    pumpModelId: row.pump_model_id,
    loadCellCalibrationId: row.load_cell_calibration_id,
    fluid: parseJson<CreateTrialV1['fluid']>(row.fluid_json, 'trials.fluid_json'),
    setup: parseJson<CreateTrialV1['setup']>(row.setup_json, 'trials.setup_json'),
    plan: parseJson<CreateTrialV1['plan']>(row.plan_json, 'trials.plan_json'),
    loadCellIndependentResidualMg: independentCheck.residualMg as number,
    samples: sampleRows.results.map((sample) => ({
      stepIndex: sample.step_index,
      deviceMs: sample.device_ms,
      dutyBasisPoints: sample.duty_basis_points,
      motorOn: sample.motor_on === 1,
      massMg: sample.mass_mg,
      faults: parseJson<string[]>(sample.faults_json, 'samples.faults_json'),
    })),
  };
}

function curveResponse(curve: CurveRow, points: PointRow[]): Record<string, unknown> {
  return {
    schema: 'tnp.calibration.curve.v1',
    curve: {
      curveId: curve.id,
      pumpSpecimenId: curve.pump_specimen_id,
      pumpModelId: curve.pump_model_id,
      liquid: curve.liquid,
      tubeId: curve.tube_id,
      minimumDutyBasisPoints: curve.min_duty_basis_points,
      maximumDutyBasisPoints: curve.max_duty_basis_points,
      reviewStatus: curve.review_status,
      estimateClass: curve.estimate_class,
      sourceTrialIds: parseJson<string[]>(curve.source_trial_ids_json, 'source_trial_ids_json'),
      createdAt: curve.created_at,
      publishedAt: curve.published_at,
      reviewedAt: curve.reviewed_at,
      reviewedBy: curve.reviewed_by,
      analysisMethodVersion: curve.analysis_method_version,
      evidenceHash: curve.evidence_hash,
      setupFingerprint: curve.setup_fingerprint,
      setupProfile: curve.setup_profile_json
        ? parseJson<unknown>(curve.setup_profile_json, 'setup_profile_json')
        : null,
      quality: curve.quality_json ? parseJson<unknown>(curve.quality_json, 'quality_json') : null,
      publicationEligible: curve.publication_eligible === 1,
      points: points.map((point) => ({
        dutyBasisPoints: point.duty_basis_points,
        flowUlPerSec: point.flow_ul_per_sec,
        uncertaintyUlPerSec: point.uncertainty_ul_per_sec,
        sampleCount: point.sample_count,
        evidence: point.evidence_json
          ? parseJson<unknown>(point.evidence_json, 'calibration_points.evidence_json')
          : null,
      })),
    },
  };
}

async function storedCurve(
  db: D1Database,
  curveId: string,
): Promise<{ curve: CurveRow; points: PointRow[] }> {
  const curve = await db
    .prepare('SELECT * FROM calibration_curves WHERE id = ?')
    .bind(curveId)
    .first<CurveRow>();
  if (!curve)
    throw new HttpError(404, 'calibration_curve_not_found', 'Calibration curve does not exist');
  const points = await db
    .prepare(
      `SELECT duty_basis_points, flow_ul_per_sec, uncertainty_ul_per_sec, sample_count, evidence_json
         FROM calibration_points WHERE curve_id = ? ORDER BY duty_basis_points`,
    )
    .bind(curveId)
    .all<PointRow>();
  return { curve, points: points.results };
}

export async function createCalibrationDraft(
  db: D1Database,
  input: CreateCalibrationCurveDraftV1,
  now: string,
): Promise<{ body: Record<string, unknown>; created: boolean }> {
  const trials = await Promise.all(input.sourceTrialIds.map((trialId) => sourceTrial(db, trialId)));
  if (trials.some((trial) => trial.state !== 'complete')) {
    throw new HttpError(
      409,
      'source_trial_not_complete',
      'Every source trial must be durably complete',
    );
  }
  const first = trials[0];
  if (
    trials.some(
      (trial) =>
        trial.pumpSpecimenId !== first.pumpSpecimenId || trial.pumpModelId !== first.pumpModelId,
    )
  ) {
    throw new HttpError(
      409,
      'source_identity_mismatch',
      'Every source trial must belong to one physical specimen and model',
    );
  }
  const analysis = await analyzeCompletedTrials(trials);
  const existing = await db
    .prepare(
      'SELECT id FROM calibration_curves WHERE evidence_hash = ? AND analysis_method_version = ?',
    )
    .bind(analysis.evidenceHash, CALIBRATION_ANALYSIS_METHOD)
    .first<{ id: string }>();
  if (existing) {
    const stored = await storedCurve(db, existing.id);
    return { body: curveResponse(stored.curve, stored.points), created: false };
  }
  const curveId = `curve_${analysis.evidenceHash.slice(0, 20)}`;
  const duties = analysis.points.map((point) => point.dutyBasisPoints);
  const setupProfileJson = analysis.setupProfile ? canonicalize(analysis.setupProfile) : null;
  const qualityJson = canonicalize({ ...analysis.quality, policy: analysis.policy });
  if (!qualityJson)
    throw new HttpError(
      500,
      'analysis_not_canonicalizable',
      'Analysis quality could not be stored',
    );
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO calibration_curves
          (id, pump_specimen_id, pump_model_id, liquid, tube_id,
           min_duty_basis_points, max_duty_basis_points, review_status, estimate_class,
           source_trial_ids_json, created_at, published_at, analysis_method_version,
           evidence_hash, setup_fingerprint, setup_profile_json, quality_json,
           publication_eligible)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        curveId,
        analysis.pumpSpecimenId,
        analysis.pumpModelId,
        analysis.liquid,
        analysis.tubeId,
        Math.min(...duties),
        Math.max(...duties),
        analysis.estimateClass,
        JSON.stringify(analysis.sourceTrialIds),
        now,
        analysis.methodVersion,
        analysis.evidenceHash,
        analysis.setupProfile?.fingerprint ?? null,
        setupProfileJson,
        qualityJson,
        analysis.quality.publicationEligible ? 1 : 0,
      ),
  ];
  for (const point of analysis.points) {
    if (point.flowUlPerSec === null || point.uncertaintyUlPerSec === null) continue;
    const pointEvidence = canonicalize(point);
    if (!pointEvidence)
      throw new HttpError(
        500,
        'analysis_not_canonicalizable',
        'Point evidence could not be stored',
      );
    statements.push(
      db
        .prepare(
          `INSERT INTO calibration_points
            (curve_id, duty_basis_points, flow_ul_per_sec, uncertainty_ul_per_sec,
             sample_count, evidence_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          curveId,
          point.dutyBasisPoints,
          point.flowUlPerSec,
          point.uncertaintyUlPerSec,
          point.sampleCount,
          pointEvidence,
        ),
    );
  }
  await db.batch(statements);
  const stored = await storedCurve(db, curveId);
  return { body: curveResponse(stored.curve, stored.points), created: true };
}

export async function getCalibrationCurve(
  db: D1Database,
  curveId: string,
): Promise<Record<string, unknown>> {
  const stored = await storedCurve(db, curveId);
  return curveResponse(stored.curve, stored.points);
}

export async function reviewCalibrationCurve(
  db: D1Database,
  curveId: string,
  input: ReviewCalibrationCurveV1,
  actor: OperatorActor,
  now: string,
): Promise<Record<string, unknown>> {
  const { curve } = await storedCurve(db, curveId);
  if (curve.evidence_hash !== input.expectedEvidenceHash) {
    throw new HttpError(
      409,
      'analysis_evidence_changed',
      'The reviewed evidence hash does not match',
    );
  }
  if (curve.review_status !== 'draft') {
    throw new HttpError(
      409,
      'curve_already_reviewed',
      'The curve already has a final review decision',
    );
  }
  if (input.decision === 'accept' && curve.publication_eligible !== 1) {
    throw new HttpError(
      409,
      'curve_quality_gate_failed',
      'This draft failed the predeclared quality gate and cannot be accepted',
    );
  }
  const reviewId = crypto.randomUUID();
  const reviewStatus = input.decision === 'accept' ? 'accepted' : 'rejected';
  await db.batch([
    db
      .prepare(
        `UPDATE calibration_curves
            SET review_status = ?, reviewed_at = ?, reviewed_by = ?
          WHERE id = ? AND review_status = 'draft' AND evidence_hash = ?`,
      )
      .bind(reviewStatus, now, actor.subject, curveId, input.expectedEvidenceHash),
    db
      .prepare(
        `INSERT INTO calibration_curve_reviews
          (id, curve_id, decision, reason, actor_subject, actor_email, actor_auth_mode,
           analysis_evidence_hash, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reviewId,
        curveId,
        input.decision,
        input.reason,
        actor.subject,
        actor.email,
        actor.authMode,
        input.expectedEvidenceHash,
        now,
      ),
  ]);
  return {
    schema: 'tnp.calibration.curve-reviewed.v1',
    curveId,
    decision: input.decision,
    reviewStatus,
    evidenceHash: input.expectedEvidenceHash,
    occurredAt: now,
  };
}

export async function publishCalibrationCurve(
  db: D1Database,
  curveId: string,
  input: PublishCalibrationCurveV1,
  actor: OperatorActor,
  now: string,
): Promise<Record<string, unknown>> {
  const { curve, points } = await storedCurve(db, curveId);
  if (curve.evidence_hash !== input.expectedEvidenceHash) {
    throw new HttpError(
      409,
      'analysis_evidence_changed',
      'The published evidence hash does not match',
    );
  }
  if (
    curve.review_status !== 'accepted' ||
    curve.publication_eligible !== 1 ||
    !curve.setup_fingerprint ||
    !curve.setup_profile_json ||
    points.length < 3
  ) {
    throw new HttpError(
      409,
      'curve_not_publishable',
      'Only an accepted, quality-passing curve with a complete setup profile may be published',
    );
  }
  const publicationId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        'UPDATE calibration_curves SET published_at = COALESCE(published_at, ?) WHERE id = ?',
      )
      .bind(now, curveId),
    db
      .prepare(
        `INSERT INTO public_curve_selections
          (pump_model_id, pump_specimen_id, curve_id, setup_fingerprint,
           selected_by, selection_reason, selected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pump_model_id) DO UPDATE SET
           pump_specimen_id = excluded.pump_specimen_id,
           curve_id = excluded.curve_id,
           setup_fingerprint = excluded.setup_fingerprint,
           selected_by = excluded.selected_by,
           selection_reason = excluded.selection_reason,
           selected_at = excluded.selected_at`,
      )
      .bind(
        curve.pump_model_id,
        curve.pump_specimen_id,
        curveId,
        curve.setup_fingerprint,
        actor.subject,
        input.reason,
        now,
      ),
    db
      .prepare(
        `INSERT INTO calibration_curve_publications
          (id, curve_id, pump_model_id, pump_specimen_id, analysis_evidence_hash,
           selection_reason, actor_subject, actor_email, actor_auth_mode, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        publicationId,
        curveId,
        curve.pump_model_id,
        curve.pump_specimen_id,
        input.expectedEvidenceHash,
        input.reason,
        actor.subject,
        actor.email,
        actor.authMode,
        now,
      ),
  ]);
  return {
    schema: 'tnp.calibration.curve-published.v1',
    curveId,
    pumpModelId: curve.pump_model_id,
    pumpSpecimenId: curve.pump_specimen_id,
    evidenceHash: input.expectedEvidenceHash,
    publishedAt: now,
  };
}
