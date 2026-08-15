import { describe, expect, it } from 'vitest';
import { calibrationAttestationMatches } from './calibration-attestation';

const registered = [
  {
    deviceId: 'bench-01',
    loadCellCalibrationId: 'scale-2026-08-15',
    countsPerGramNumerator: -21543,
    countsPerGramDenominator: 10,
  },
];

const reported = {
  deviceId: 'bench-01',
  loadCellCalibrationId: 'scale-2026-08-15',
  countsPerGramNumerator: -21543,
  countsPerGramDenominator: 10,
};

describe('load-cell calibration attestation', () => {
  it('allows an exact live device and registered coefficient match', () => {
    expect(calibrationAttestationMatches(reported, 'scale-2026-08-15', registered)).toBe(true);
  });

  it('blocks a reused calibration ID with different compiled coefficients', () => {
    expect(
      calibrationAttestationMatches(
        { ...reported, countsPerGramNumerator: reported.countsPerGramNumerator + 1 },
        'scale-2026-08-15',
        registered,
      ),
    ).toBe(false);
    expect(
      calibrationAttestationMatches(
        { ...reported, countsPerGramDenominator: reported.countsPerGramDenominator + 1 },
        'scale-2026-08-15',
        registered,
      ),
    ).toBe(false);
  });
});
