import {
  EMPTY_PUMP_READ_MODELS,
  type PumpReadModelV1,
  RECIPE_CATALOG,
  type RecipePredictionV1,
} from '@shared/calibration';
import type { CalibrationBootstrap } from './types';

const emptyResult = (pumpModelId: PumpReadModelV1['pumpModelId']) => ({
  pumpModelId,
  specimenId: null,
  durationMs: null,
  uncertaintyMs: null,
  limitingIngredientId: null,
  curveIds: [],
  estimateClass: null,
  missingReason: 'no_selected_specimen' as const,
});

const recipeFallback: RecipePredictionV1[] = RECIPE_CATALOG.recipes.map((recipe) => ({
  recipeId: recipe.recipeId,
  name: recipe.name,
  targetVolumeUl: recipe.targetVolumeUl,
  ingredients: recipe.ingredients.map((ingredient) => ({
    ingredientId: ingredient.ingredientId,
    name: ingredient.name,
    volumeUl: ingredient.volumeUl,
  })),
  specimenResults: EMPTY_PUMP_READ_MODELS.map((pump) => emptyResult(pump.pumpModelId)),
}));

const clonePump = (pump: PumpReadModelV1): PumpReadModelV1 => ({
  ...pump,
  image: { ...pump.image },
  acceptedCurve: pump.acceptedCurve
    ? { ...pump.acceptedCurve, points: pump.acceptedCurve.points.map((point) => ({ ...point })) }
    : null,
});

export function createEmptyBootstrap(): CalibrationBootstrap {
  return {
    schema: 'tnp.calibration.bootstrap.v1',
    benchId: 'bench-01',
    serverNow: new Date(0).toISOString(),
    presence: {
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
    },
    activeTrialId: null,
    latestCompletedTrialId: null,
    pumps: EMPTY_PUMP_READ_MODELS.map(clonePump) as [PumpReadModelV1, PumpReadModelV1],
    recipes: recipeFallback.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
      specimenResults: recipe.specimenResults.map((result) => ({ ...result, curveIds: [] })),
    })),
  };
}
