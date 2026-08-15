import type { CurvePoint, PumpReadModel } from './types';

interface FlowChartProps {
  pumps: [PumpReadModel, PumpReadModel];
  currentDutyBasisPoints?: number | null;
}

const chart = { left: 58, top: 24, width: 646, height: 210 };

const linePath = (points: CurvePoint[], maxFlow: number) =>
  points
    .map((point, index) => {
      const x = chart.left + (point.dutyBasisPoints / 10_000) * chart.width;
      const y = chart.top + chart.height - (point.flowUlPerSec / maxFlow) * chart.height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

export function FlowChart({ pumps, currentDutyBasisPoints }: FlowChartProps) {
  const curves = pumps.map((pump) => pump.acceptedCurve);
  const allPoints = curves.flatMap((curve) => curve?.points ?? []);
  const maxFlow = Math.max(1_000, ...allPoints.map((point) => point.flowUlPerSec)) * 1.08;
  const currentX =
    currentDutyBasisPoints === null || currentDutyBasisPoints === undefined
      ? null
      : chart.left + (currentDutyBasisPoints / 10_000) * chart.width;

  return (
    <div className="flow-chart-wrap">
      <svg
        aria-label="Measured duty cycle versus flow rate"
        className="flow-chart"
        role="img"
        viewBox="0 0 740 284"
      >
        <title>Accepted measured flow curves for both pump specimens</title>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = chart.top + chart.height - chart.height * fraction;
          return (
            <g key={`y-${fraction}`}>
              <line
                className="flow-chart__grid"
                x1={chart.left}
                x2={chart.left + chart.width}
                y1={y}
                y2={y}
              />
              <text className="flow-chart__tick" x={chart.left - 10} y={y + 4} textAnchor="end">
                {((maxFlow * fraction) / 1_000).toFixed(1)}
              </text>
            </g>
          );
        })}
        {[0, 25, 50, 75, 100].map((duty) => {
          const x = chart.left + (duty / 100) * chart.width;
          return (
            <g key={`x-${duty}`}>
              <line
                className="flow-chart__grid"
                x1={x}
                x2={x}
                y1={chart.top}
                y2={chart.top + chart.height}
              />
              <text
                className="flow-chart__tick"
                x={x}
                y={chart.top + chart.height + 20}
                textAnchor="middle"
              >
                {duty}%
              </text>
            </g>
          );
        })}
        <line
          className="flow-chart__axis"
          x1={chart.left}
          x2={chart.left + chart.width}
          y1={chart.top + chart.height}
          y2={chart.top + chart.height}
        />
        {curves.map(
          (curve, curveIndex) =>
            curve && (
              <g key={curve.curveId}>
                <path
                  className={
                    curveIndex === 0
                      ? 'flow-chart__series'
                      : 'flow-chart__series flow-chart__series--dashed'
                  }
                  d={linePath(curve.points, maxFlow)}
                />
                {curve.points.map((point) => {
                  const x = chart.left + (point.dutyBasisPoints / 10_000) * chart.width;
                  const y =
                    chart.top + chart.height - (point.flowUlPerSec / maxFlow) * chart.height;
                  return curveIndex === 0 ? (
                    <circle
                      className="flow-chart__marker"
                      cx={x}
                      cy={y}
                      key={`${x}-${y}`}
                      r="3.5"
                    />
                  ) : (
                    <rect
                      className="flow-chart__marker"
                      height="7"
                      key={`${x}-${y}`}
                      width="7"
                      x={x - 3.5}
                      y={y - 3.5}
                    />
                  );
                })}
              </g>
            ),
        )}
        {currentX !== null && (
          <line
            className="flow-chart__current"
            x1={currentX}
            x2={currentX}
            y1={chart.top}
            y2={chart.top + chart.height}
          />
        )}
        {allPoints.length === 0 && (
          <g className="flow-chart__empty">
            <text x="381" y="122" textAnchor="middle">
              NO ACCEPTED MEASUREMENTS
            </text>
            <text x="381" y="146" textAnchor="middle">
              The graph will earn its line.
            </text>
          </g>
        )}
        <text className="flow-chart__label" x="381" y="280" textAnchor="middle">
          COMMAND DUTY CYCLE
        </text>
        <text
          className="flow-chart__label"
          textAnchor="middle"
          transform="translate(14 130) rotate(-90)"
        >
          FLOW · ML/S
        </text>
      </svg>
      <div className="chart-legend">
        <span>
          <i className="legend-line" />
          Kamoer specimen
        </span>
        <span>
          <i className="legend-line legend-line--dashed" />
          Gikfun specimen
        </span>
        <span>
          <i className="legend-current" />
          Current duty
        </span>
      </div>
    </div>
  );
}
