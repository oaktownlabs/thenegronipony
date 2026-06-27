export type PumpId = 'pump_1' | 'pump_2' | 'pump_3';

export type RecipeIngredient = {
  name: string;
  pumpId: PumpId;
  volumeMl: number;
};

export type Recipe = {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
};

export type PumpCalibration = {
  pumpId: PumpId;
  mlPerSecond: number;
  antiDripMs?: number;
};

export type PumpStep =
  | {
      type: 'dispense';
      pumpId: PumpId;
      ingredientName: string;
      volumeMl: number;
      runMs: number;
    }
  | {
      type: 'reverse';
      pumpId: PumpId;
      runMs: number;
    };

export function buildPourPlan(recipe: Recipe, calibrations: PumpCalibration[]): PumpStep[] {
  const calibrationByPump = new Map(
    calibrations.map((calibration) => [calibration.pumpId, calibration]),
  );
  const steps: PumpStep[] = [];

  for (const ingredient of recipe.ingredients) {
    const calibration = calibrationByPump.get(ingredient.pumpId);

    if (!calibration) {
      throw new Error(`Missing calibration for ${ingredient.pumpId}`);
    }

    if (calibration.mlPerSecond <= 0) {
      throw new Error(`Calibration for ${ingredient.pumpId} must be positive`);
    }

    steps.push({
      type: 'dispense',
      pumpId: ingredient.pumpId,
      ingredientName: ingredient.name,
      volumeMl: ingredient.volumeMl,
      runMs: Math.round((ingredient.volumeMl / calibration.mlPerSecond) * 1000),
    });

    if (calibration.antiDripMs && calibration.antiDripMs > 0) {
      steps.push({
        type: 'reverse',
        pumpId: ingredient.pumpId,
        runMs: calibration.antiDripMs,
      });
    }
  }

  return steps;
}

export function buildServicePlan(
  pumpIds: PumpId[],
  mode: 'prime' | 'flush',
  runMsByPump: Partial<Record<PumpId, number>>,
): PumpStep[] {
  return pumpIds.map((pumpId) => {
    const runMs = runMsByPump[pumpId];

    if (!runMs || runMs <= 0) {
      throw new Error(`${mode} duration for ${pumpId} must be positive`);
    }

    return {
      type: 'dispense',
      pumpId,
      ingredientName: mode,
      volumeMl: 0,
      runMs,
    };
  });
}
