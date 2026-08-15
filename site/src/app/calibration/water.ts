/**
 * Atmospheric-pressure pure-water density from the UNESCO 1981 equation.
 * Input is degrees Celsius; output is integer milligrams per litre.
 * Source: https://www.hec.usace.army.mil/confluence/wqetm/reservoir-hydraulics/equation-of-state
 */
export function waterDensityMgPerL(temperatureC: number): number {
  const t = temperatureC;
  const kilogramsPerCubicMeter =
    999.842594 +
    6.793952e-2 * t -
    9.09529e-3 * t ** 2 +
    1.001685e-4 * t ** 3 -
    1.120083e-6 * t ** 4 +
    6.536332e-9 * t ** 5;
  return Math.round(kilogramsPerCubicMeter * 1_000);
}
