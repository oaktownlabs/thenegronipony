import { describe, expect, it } from 'vitest';

import {
  buildPourPlan,
  buildServicePlan,
  type PumpCalibration,
  type Recipe,
} from '../src/pour-plan';

const recipe: Recipe = {
  id: 'test_negroni',
  name: 'Test Negroni',
  ingredients: [
    { name: 'Gin', pumpId: 'pump_1', volumeMl: 30 },
    { name: 'Vermouth', pumpId: 'pump_2', volumeMl: 30 },
    { name: 'Bitter red responsibility', pumpId: 'pump_3', volumeMl: 30 },
  ],
};

const calibrations: PumpCalibration[] = [
  { pumpId: 'pump_1', mlPerSecond: 10, antiDripMs: 150 },
  { pumpId: 'pump_2', mlPerSecond: 15 },
  { pumpId: 'pump_3', mlPerSecond: 20, antiDripMs: 100 },
];

describe('buildPourPlan', () => {
  it('turns ingredient volumes into pump timings', () => {
    expect(buildPourPlan(recipe, calibrations)).toEqual([
      {
        type: 'dispense',
        pumpId: 'pump_1',
        ingredientName: 'Gin',
        volumeMl: 30,
        runMs: 3000,
      },
      { type: 'reverse', pumpId: 'pump_1', runMs: 150 },
      {
        type: 'dispense',
        pumpId: 'pump_2',
        ingredientName: 'Vermouth',
        volumeMl: 30,
        runMs: 2000,
      },
      {
        type: 'dispense',
        pumpId: 'pump_3',
        ingredientName: 'Bitter red responsibility',
        volumeMl: 30,
        runMs: 1500,
      },
      { type: 'reverse', pumpId: 'pump_3', runMs: 100 },
    ]);
  });

  it('requires calibration for every pump in the recipe', () => {
    expect(() => buildPourPlan(recipe, calibrations.slice(0, 2))).toThrow(
      'Missing calibration for pump_3',
    );
  });

  it('rejects non-positive calibration constants', () => {
    expect(() => buildPourPlan(recipe, [{ pumpId: 'pump_1', mlPerSecond: 0 }])).toThrow(
      'Calibration for pump_1 must be positive',
    );
  });
});

describe('buildServicePlan', () => {
  it('builds prime or flush pump runs', () => {
    expect(
      buildServicePlan(['pump_1', 'pump_2', 'pump_3'], 'flush', {
        pump_1: 5000,
        pump_2: 4500,
        pump_3: 4000,
      }),
    ).toEqual([
      { type: 'dispense', pumpId: 'pump_1', ingredientName: 'flush', volumeMl: 0, runMs: 5000 },
      { type: 'dispense', pumpId: 'pump_2', ingredientName: 'flush', volumeMl: 0, runMs: 4500 },
      { type: 'dispense', pumpId: 'pump_3', ingredientName: 'flush', volumeMl: 0, runMs: 4000 },
    ]);
  });

  it('rejects missing service durations', () => {
    expect(() => buildServicePlan(['pump_1'], 'prime', {})).toThrow(
      'prime duration for pump_1 must be positive',
    );
  });
});
