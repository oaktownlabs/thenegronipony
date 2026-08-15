import { describe, expect, it } from 'vitest';
import { waterDensityMgPerL } from './water';

describe('waterDensityMgPerL', () => {
  it('matches the UNESCO pure-water equation at calibration-bench temperatures', () => {
    expect(waterDensityMgPerL(0)).toBe(999_843);
    expect(waterDensityMgPerL(25)).toBe(997_048);
    expect(waterDensityMgPerL(40)).toBe(992_220);
  });
});
