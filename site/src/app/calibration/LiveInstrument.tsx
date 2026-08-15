import type { LiveSample, StreamHealth } from './types';

interface LiveInstrumentProps {
  sample: LiveSample | null;
  health: StreamHealth;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function LiveInstrument({ sample, health }: LiveInstrumentProps) {
  const massGrams =
    sample?.massMg === null || sample?.massMg === undefined ? null : sample.massMg / 1_000;
  const fillFraction = massGrams === null ? 0 : clamp(massGrams / 90);
  const dutyPercent = (sample?.dutyBasisPoints ?? 0) / 100;
  const needleAngle = -132 + clamp(dutyPercent / 100) * 264;
  const isFresh = health.state === 'connected' || sample?.simulated;

  return (
    <section className="live-instrument instrument-card" aria-label="Live collection instrument">
      <div className="instrument-card__heading">
        <div>
          <p className="micro-label">LIVE COLLECTION APPARATUS</p>
          <h2>Mass, motive force &amp; mild hubris</h2>
        </div>
        <span className={`status-lamp ${isFresh ? 'status-lamp--live' : ''}`}>
          {sample?.trialState ?? 'idle'}
        </span>
      </div>
      <div className="live-instrument__body">
        <div className="cylinder-station">
          <div className="cylinder-rig">
            <div className="drip-line">
              <span />
            </div>
            <div className="cylinder">
              <div
                className={`cylinder__liquid ${isFresh ? 'cylinder__liquid--live' : ''}`}
                style={{ height: `${fillFraction * 82}%` }}
              />
              {Array.from({ length: 10 }, (_, index) => (
                <span
                  className="cylinder__tick"
                  key={`cylinder-${index * 10}`}
                  style={{ bottom: `${7 + index * 8.2}%` }}
                >
                  {index % 2 === 1 ? `${(index + 1) * 10}` : ''}
                </span>
              ))}
            </div>
            <div className="scale-base">
              <span>HX711 · MASS AUTHORITY</span>
            </div>
          </div>
          <div className="primary-reading">
            <span>{massGrams === null ? '—' : massGrams.toFixed(2)}</span>
            <small>g measured</small>
          </div>
          <p className="reading-caption">
            100 ml cylinder · mass is canonical; glass marks are scenery
          </p>
        </div>
        <div className="duty-station">
          <div className="analog-gauge">
            <svg
              aria-label={`${dutyPercent.toFixed(1)} percent duty cycle`}
              role="img"
              viewBox="0 0 300 195"
            >
              <path className="gauge__rim" d="M31 160a120 120 0 0 1 238 0" />
              {Array.from({ length: 11 }, (_, index) => {
                const angle = ((-132 + index * 26.4) * Math.PI) / 180;
                const x1 = 150 + Math.sin(angle) * 100;
                const y1 = 157 - Math.cos(angle) * 100;
                const x2 = 150 + Math.sin(angle) * 114;
                const y2 = 157 - Math.cos(angle) * 114;
                const tx = 150 + Math.sin(angle) * 82;
                const ty = 160 - Math.cos(angle) * 82;
                return (
                  <g key={`duty-${index * 10}`}>
                    <line className="gauge__tick" x1={x1} x2={x2} y1={y1} y2={y2} />
                    <text className="gauge__number" x={tx} y={ty}>
                      {index * 10}
                    </text>
                  </g>
                );
              })}
              <g
                className={isFresh ? 'gauge__needle gauge__needle--live' : 'gauge__needle'}
                transform={`rotate(${needleAngle} 150 157)`}
              >
                <path d="M145 158 150 39 155 158z" />
              </g>
              <circle className="gauge__hub" cx="150" cy="157" r="13" />
              <text className="gauge__title" x="150" y="124">
                DUTY
              </text>
            </svg>
          </div>
          <div className="primary-reading">
            <span>{sample ? dutyPercent.toFixed(1) : '—'}</span>
            <small>% command</small>
          </div>
          <dl className="live-readings">
            <div>
              <dt>RAW ADC</dt>
              <dd>{sample?.rawAdc?.toLocaleString() ?? '—'}</dd>
            </div>
            <div>
              <dt>DEVICE CLOCK</dt>
              <dd>{sample ? `${(sample.deviceMs / 1_000).toFixed(2)} s` : '—'}</dd>
            </div>
            <div>
              <dt>SEQUENCE</dt>
              <dd>{sample?.sequence ?? '—'}</dd>
            </div>
            <div>
              <dt>LIVE SLOPE · PROVISIONAL</dt>
              <dd>
                {sample?.flowUlPerSec
                  ? `~${(sample.flowUlPerSec / 1_000).toFixed(2)} ml/s`
                  : 'pending fit'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
