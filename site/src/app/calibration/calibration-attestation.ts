interface ReportedLoadCellCalibration {
  deviceId: string | null;
  loadCellCalibrationId: string | null;
  countsPerGramNumerator: number | null;
  countsPerGramDenominator: number | null;
}

interface RegisteredLoadCellCalibration {
  deviceId: string;
  loadCellCalibrationId: string;
  countsPerGramNumerator: number;
  countsPerGramDenominator: number;
}

export function calibrationAttestationMatches(
  reported: ReportedLoadCellCalibration | null,
  selectedCalibrationId: string,
  registered: RegisteredLoadCellCalibration[],
): boolean {
  if (
    !reported ||
    !selectedCalibrationId ||
    reported.loadCellCalibrationId !== selectedCalibrationId ||
    reported.countsPerGramNumerator === null ||
    reported.countsPerGramDenominator === null
  ) {
    return false;
  }
  return registered.some(
    (candidate) =>
      candidate.loadCellCalibrationId === selectedCalibrationId &&
      candidate.deviceId === reported.deviceId &&
      candidate.countsPerGramNumerator === reported.countsPerGramNumerator &&
      candidate.countsPerGramDenominator === reported.countsPerGramDenominator,
  );
}
