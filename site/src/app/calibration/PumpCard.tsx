import { PumpSchematic } from './PumpSchematic';
import type { PumpReadModel } from './types';

const missingCopy = {
  no_selected_specimen: 'Waiting for a physical pump specimen',
  no_accepted_curve: 'No accepted calibration curve yet',
  liquid_not_tested: 'This liquid has not been characterized',
  setup_mismatch: 'Rig setup does not match the accepted curve',
  outside_validated_domain: 'Result falls outside the tested range',
  result_under_review: 'Measurements are awaiting review',
} as const;

interface PumpCardProps {
  pump: PumpReadModel;
  index: number;
}

export function PumpCard({ pump, index }: PumpCardProps) {
  const curve = pump.acceptedCurve;
  const maxPoint = curve?.points.at(-1) ?? null;

  return (
    <article className="instrument-card pump-card">
      <div className="instrument-card__heading">
        <div>
          <p className="micro-label">SPECIMEN {String(index + 1).padStart(2, '0')}</p>
          <h3>{pump.manufacturer}</h3>
          <p className="pump-card__model">{pump.model}</p>
        </div>
        <span className="etched-badge">{index === 0 ? 'HIGH FLOW' : 'COMPACT'}</span>
      </div>
      <PumpSchematic kind={pump.pumpModelId.startsWith('kamoer') ? 'kamoer' : 'gikfun'} />
      <dl className="reading-grid">
        <div>
          <dt>SELECTED UNIT</dt>
          <dd>{pump.specimenLabel ?? '—'}</dd>
        </div>
        <div>
          <dt>CATALOG CLAIM</dt>
          <dd>{pump.advertisedFlowMlMin ? `${pump.advertisedFlowMlMin} ml/min` : '—'}</dd>
        </div>
        <div>
          <dt>MEASURED MAX</dt>
          <dd>{maxPoint ? `${(maxPoint.flowUlPerSec / 1_000).toFixed(2)} ml/s` : '—'}</dd>
        </div>
        <div>
          <dt>ACCEPTED POINTS</dt>
          <dd>{curve?.points.length ?? '—'}</dd>
        </div>
      </dl>
      <p className="missing-note">
        {curve
          ? `Curve ${curve.curveId} · ${curve.liquid}`
          : missingCopy[pump.missingReason ?? 'no_accepted_curve']}
      </p>
    </article>
  );
}
