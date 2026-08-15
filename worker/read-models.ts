import {
  type BenchPresenceV1,
  type CalibrationBootstrapV1,
  type ComparisonResponseV1,
  EMPTY_PUMP_READ_MODELS,
  type PumpReadModelV1,
  RECIPE_CATALOG,
  type RecipePredictionsResponseV1,
  type RecipePredictionV1,
} from '../shared/calibration';
import { type SetupProfile, setupProfilesAreCompatible } from './calibration-analysis';

export const EMPTY_PRESENCE: BenchPresenceV1 = {
  producerLeasePresent: false,
  producerLastSeenAt: null,
  expectedEventIntervalMs: null,
  deviceId: null,
  bootId: null,
  latestDeviceEventReceivedAt: null,
  latestDurableAt: null,
  durabilityScope: null,
  lastDurablyAcknowledgedDeviceSeq: null,
  latestProjectedAt: null,
  lastProjectedDeviceSeq: null,
  publishedStreamSeq: null,
};

interface CurveRow {
  id: string;
  pump_specimen_id: string;
  specimen_label: string;
  liquid: string;
  tube_id: string;
  min_duty_basis_points: number;
  max_duty_basis_points: number;
  estimate_class: 'water_engineering' | 'ingredient_specific' | 'installed_path_validated';
  source_trial_ids_json: string;
  published_at: string;
  setup_fingerprint: string;
  setup_profile_json: string;
}

interface PointRow {
  duty_basis_points: number;
  flow_ul_per_sec: number;
  uncertainty_ul_per_sec: number;
  sample_count: number;
}

type AcceptedCurveWithProvenance = NonNullable<PumpReadModelV1['acceptedCurve']>;

interface SelectedPumpReadModel {
  readModel: PumpReadModelV1;
  setupProfile: SetupProfile | null;
}

async function pumpReadModel(
  db: D1Database,
  base: PumpReadModelV1,
): Promise<SelectedPumpReadModel> {
  const curve = await db
    .prepare(
      `SELECT c.id, c.pump_specimen_id, ps.label AS specimen_label, c.liquid, c.tube_id,
              c.min_duty_basis_points, c.max_duty_basis_points, c.estimate_class,
              c.source_trial_ids_json, c.published_at, c.setup_fingerprint,
              c.setup_profile_json
         FROM public_curve_selections selected
         JOIN calibration_curves c ON c.id = selected.curve_id
         JOIN pump_specimens ps ON ps.id = selected.pump_specimen_id
        WHERE selected.pump_model_id = ?
          AND c.pump_model_id = selected.pump_model_id
          AND c.pump_specimen_id = selected.pump_specimen_id
          AND c.review_status = 'accepted'
          AND c.publication_eligible = 1
          AND c.published_at IS NOT NULL
          AND c.setup_fingerprint = selected.setup_fingerprint
        LIMIT 1`,
    )
    .bind(base.pumpModelId)
    .first<CurveRow>();

  if (!curve) {
    const selection = await db
      .prepare(
        `SELECT selected.pump_specimen_id AS id, ps.label
           FROM public_curve_selections selected
           JOIN pump_specimens ps ON ps.id = selected.pump_specimen_id
          WHERE selected.pump_model_id = ?`,
      )
      .bind(base.pumpModelId)
      .first<{ id: string; label: string }>();
    return {
      readModel: {
        ...base,
        selectedSpecimenId: selection?.id ?? null,
        specimenLabel: selection?.label ?? null,
        missingReason: selection ? 'no_accepted_curve' : 'no_selected_specimen',
      },
      setupProfile: null,
    };
  }

  const points = await db
    .prepare(
      `SELECT duty_basis_points, flow_ul_per_sec, uncertainty_ul_per_sec, sample_count
         FROM calibration_points
        WHERE curve_id = ?
        ORDER BY duty_basis_points`,
    )
    .bind(curve.id)
    .all<PointRow>();

  const acceptedCurve: AcceptedCurveWithProvenance = {
    curveId: curve.id,
    specimenId: curve.pump_specimen_id,
    liquid: curve.liquid,
    tubeId: curve.tube_id,
    minDutyBasisPoints: curve.min_duty_basis_points,
    maxDutyBasisPoints: curve.max_duty_basis_points,
    points: points.results.map((point) => ({
      dutyBasisPoints: point.duty_basis_points,
      flowUlPerSec: point.flow_ul_per_sec,
      uncertaintyUlPerSec: point.uncertainty_ul_per_sec,
      sampleCount: point.sample_count,
    })),
    reviewStatus: 'accepted',
    estimateClass: curve.estimate_class,
    setupFingerprint: curve.setup_fingerprint,
    sourceTrialIds: JSON.parse(curve.source_trial_ids_json) as string[],
    publishedAt: curve.published_at,
  };
  return {
    readModel: {
      ...base,
      selectedSpecimenId: curve.pump_specimen_id,
      specimenLabel: curve.specimen_label,
      acceptedCurve,
      missingReason: points.results.length > 0 ? null : 'outside_validated_domain',
    },
    setupProfile: JSON.parse(curve.setup_profile_json) as SetupProfile,
  };
}

export async function pumpReadModels(db?: D1Database): Promise<[PumpReadModelV1, PumpReadModelV1]> {
  const base = EMPTY_PUMP_READ_MODELS.map((pump) => structuredClone(pump)) as [
    PumpReadModelV1,
    PumpReadModelV1,
  ];
  if (!db) return base;
  try {
    const selected = await Promise.all([pumpReadModel(db, base[0]), pumpReadModel(db, base[1])]);
    if (
      selected[0].readModel.acceptedCurve &&
      selected[1].readModel.acceptedCurve &&
      selected[0].setupProfile &&
      selected[1].setupProfile &&
      !setupProfilesAreCompatible(selected[0].setupProfile, selected[1].setupProfile)
    ) {
      return selected.map(({ readModel }) => ({
        ...readModel,
        acceptedCurve: null,
        missingReason: 'setup_mismatch' as const,
      })) as [PumpReadModelV1, PumpReadModelV1];
    }
    return selected.map(({ readModel }) => readModel) as [PumpReadModelV1, PumpReadModelV1];
  } catch (error) {
    console.warn(
      JSON.stringify({ event: 'calibration_read_model_unavailable', message: String(error) }),
    );
    return base;
  }
}

function predictionsForPumps(pumps: [PumpReadModelV1, PumpReadModelV1]): RecipePredictionV1[] {
  return RECIPE_CATALOG.recipes.map((recipe) => ({
    recipeId: recipe.recipeId,
    name: recipe.name,
    targetVolumeUl: recipe.targetVolumeUl,
    ingredients: recipe.ingredients.map(({ ingredientId, name, volumeUl }) => ({
      ingredientId,
      name,
      volumeUl,
    })),
    specimenResults: pumps.map((pump) => {
      const curve = pump.acceptedCurve;
      if (!curve || curve.points.length === 0) {
        return {
          pumpModelId: pump.pumpModelId,
          specimenId: pump.selectedSpecimenId,
          durationMs: null,
          uncertaintyMs: null,
          limitingIngredientId: null,
          curveIds: [],
          estimateClass: null,
          missingReason: pump.missingReason ?? 'no_accepted_curve',
        };
      }
      const operatingPoint = curve.points.reduce((best, point) =>
        point.flowUlPerSec > best.flowUlPerSec ? point : best,
      );
      if (operatingPoint.flowUlPerSec <= 0) {
        return {
          pumpModelId: pump.pumpModelId,
          specimenId: pump.selectedSpecimenId,
          durationMs: null,
          uncertaintyMs: null,
          limitingIngredientId: null,
          curveIds: [curve.curveId],
          estimateClass: null,
          missingReason: 'outside_validated_domain',
        };
      }
      const limiting = recipe.ingredients.reduce((largest, ingredient) =>
        ingredient.volumeUl > largest.volumeUl ? ingredient : largest,
      );
      const durationMs = Math.ceil((limiting.volumeUl * 1000) / operatingPoint.flowUlPerSec);
      const uncertaintyMs = Math.ceil(
        (durationMs * operatingPoint.uncertaintyUlPerSec) / operatingPoint.flowUlPerSec,
      );
      return {
        pumpModelId: pump.pumpModelId,
        specimenId: pump.selectedSpecimenId,
        durationMs,
        uncertaintyMs,
        limitingIngredientId: limiting.ingredientId,
        curveIds: [curve.curveId],
        estimateClass: curve.estimateClass,
        missingReason: null,
      };
    }),
  }));
}

export async function comparison(
  db: D1Database | undefined,
  now: string,
): Promise<ComparisonResponseV1> {
  return {
    schema: 'tnp.calibration.comparison.v1',
    generatedAt: now,
    pumps: await pumpReadModels(db),
  };
}

export async function recipePredictions(
  db: D1Database | undefined,
  now: string,
): Promise<RecipePredictionsResponseV1> {
  const pumps = await pumpReadModels(db);
  return {
    schema: 'tnp.calibration.recipe-predictions.v1',
    generatedAt: now,
    recipes: predictionsForPumps(pumps),
  };
}

export async function bootstrap(
  db: D1Database | undefined,
  benchId: string,
  coordinator: {
    presence: BenchPresenceV1;
    activeTrialId: string | null;
    latestCompletedTrialId: string | null;
  },
  now: string,
): Promise<CalibrationBootstrapV1> {
  const pumps = await pumpReadModels(db);
  return {
    schema: 'tnp.calibration.bootstrap.v1',
    benchId,
    serverNow: now,
    presence: coordinator.presence,
    activeTrialId: coordinator.activeTrialId,
    latestCompletedTrialId: coordinator.latestCompletedTrialId,
    pumps,
    recipes: predictionsForPumps(pumps),
  };
}
