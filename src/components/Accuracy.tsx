import { useMemo } from 'react';
import { backtest, score } from '../lib/accuracy';
import { d, SimTag } from './ui';

export function Accuracy() {
  const v = useMemo(() => backtest(), []);
  const s = useMemo(() => score(v), [v]);
  const recent = v.slice(-24);
  const W = 300, H = 140, max = 4;
  const x = (i: number) => 10 + (i * (W - 20)) / (recent.length - 1);
  const y = (e: number) => H / 2 - (Math.max(-max, Math.min(max, e)) / max) * (H / 2 - 8);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const better = s.carrierMae > 0 ? 1 - s.berthwiseMae / s.carrierMae : 0;

  return (
    <div className="brief accuracy">
      <div className="brief-head">
        <h2>How accurate are the estimates?</h2>
        <div className="muted small">
          Predicted vs actual arrival for {s.n} past voyages, with each estimate made 7 days before arrival. <SimTag />
        </div>
      </div>
      <div className="callout small">
        Berthwise hasn’t run long enough to have real arrivals, so this is a <strong>simulated backtest</strong>. Its voyages have a hidden true delay, and the model sees
        noisy versions of the same weather, port and carrier signals. The score shows how the method works, not how it performs in the real world.
      </div>

      <div className="acc-grid">
        <div className="acc-card good">
          <div className="muted small">Berthwise typical error</div>
          <div className="acc-big">±{s.berthwiseMae.toFixed(1)} d</div>
          <div className="small">{pct(s.berthwiseWithin1)} within a day</div>
        </div>
        <div className="acc-card">
          <div className="muted small">Carrier ETA typical error</div>
          <div className="acc-big">±{s.carrierMae.toFixed(1)} d</div>
          <div className="small">{pct(s.carrierWithin1)} within a day</div>
        </div>
      </div>
      <p className="small">
        That’s <strong>{pct(better)} closer</strong> than the carrier ETA. It flagged <strong>{s.caught} of {s.missed}</strong> containers that missed their needed-by date
        a week ahead, with {s.falseAlarms} false alarm{s.falseAlarms === 1 ? '' : 's'}.
      </p>

      <h3 className="section-title">Last {recent.length} arrivals: days late vs the estimate</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="acc-chart" role="img" aria-label="Arrival error per voyage">
        {[-2, 2].map((e) => (
          <line key={e} x1={0} x2={W} y1={y(e)} y2={y(e)} className="grid" />
        ))}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="zero" />
        <text x={W - 2} y={y(2) - 3} textAnchor="end" className="axis">2 d late</text>
        <text x={W - 2} y={y(-2) + 10} textAnchor="end" className="axis">2 d early</text>
        {recent.map((p, i) => (
          <g key={p.id}>
            <line x1={x(i)} x2={x(i)} y1={y(p.carrierError)} y2={y(p.berthwiseError)} className="link" />
            <circle cx={x(i)} cy={y(p.carrierError)} r={3.5} className="dot-carrier">
              <title>{`${p.id} ${p.carrier}, arrived ${d(p.arrived)}: ${p.carrierError.toFixed(1)} d vs carrier ETA`}</title>
            </circle>
            <circle cx={x(i)} cy={y(p.berthwiseError)} r={3.5} className="dot-bw">
              <title>{`${p.id}: ${p.berthwiseError.toFixed(1)} d vs Berthwise`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="legend-row small">
        <span><i className="dot-bw-key" /> Berthwise estimate</span>
        <span><i className="dot-carrier-key" /> Carrier ETA</span>
        <span className="muted">Closer to the line is better</span>
      </div>

      <h3 className="section-title">By carrier</h3>
      <table className="acc-table">
        <thead>
          <tr><th>Carrier</th><th>Voyages</th><th>Carrier ETA</th><th>Berthwise</th></tr>
        </thead>
        <tbody>
          {s.byCarrier.map((c) => (
            <tr key={c.carrier}>
              <td>{c.carrier}</td>
              <td>{c.n}</td>
              <td>±{c.carrierMae.toFixed(1)} d</td>
              <td><strong>±{c.berthwiseMae.toFixed(1)} d</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small method">“Typical error” is the average number of days between the estimate and the actual arrival, early or late.</p>
    </div>
  );
}
