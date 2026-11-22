import { useMemo } from 'react';
import { backtest, score } from '../lib/accuracy';
import { errorHours, realScore, type AisArrival, type AisSnapshot } from '../lib/ais';
import { d, LiveTag, SimTag } from './ui';

export function Accuracy({ ais }: { ais: AisSnapshot | null }) {
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
      <RealArrivals ais={ais} />
      <h3 className="section-title">Simulated backtest <SimTag /></h3>
      <div className="callout small">
        A few days of real arrivals is too few to judge the method, so this backtest also runs it on 48 <strong>simulated</strong> voyages, each with a hidden true delay. The model sees noisy versions of the same weather, port and carrier signals.
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

const when = (t: number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const span = (h: number | null) => (h == null ? '—' : Math.abs(h) < 48 ? `${Math.abs(h).toFixed(1)} h` : `${(Math.abs(h) / 24).toFixed(1)} d`);
const signed = (h: number | null) => (h == null ? '—' : Math.abs(h) < 0.05 ? 'on time' : `${span(h)} ${h > 0 ? 'late' : 'early'}`);

function RealArrivals({ ais }: { ais: AisSnapshot | null }) {
  if (!ais) return <div className="callout small">Loading live ship data…</div>;
  if (!ais.status.configured) return <div className="callout small">Live ship tracking is off: the server has no AISStream key.</div>;
  const s = realScore(ais.arrivals);
  const c = ais.counts;
  const recent: AisArrival[] = ais.arrivals.slice(-8).reverse();
  return (
    <section className="real-acc">
      <h3 className="section-title">Real arrivals at Los Angeles–Long Beach <LiveTag /></h3>
      <div className="muted small">
        From AISStream ship positions{ais.status.since ? ` since ${when(ais.status.since)}` : ''}. A cargo ship counts as arrived once it is inside the port below 1 knot.
        {!ais.status.connected && ' Reconnecting to the feed…'}
      </div>
      <div className="acc-grid acc-grid-4">
        <div className="acc-card">
          <div className="muted small">Cargo ships on the lane now</div>
          <div className="acc-big">{c.cargoShips}</div>
          <div className="small">{c.laAnchorage} at anchorage · {c.laPort} in port</div>
        </div>
        <div className="acc-card">
          <div className="muted small">Arrivals logged</div>
          <div className="acc-big">{s.n}</div>
          <div className="small">{c.trackedToLa} more heading in</div>
        </div>
        <div className="acc-card good">
          <div className="muted small">Berthwise typical error</div>
          <div className="acc-big">{s.berthwiseMaeH == null ? '—' : `±${span(s.berthwiseMaeH)}`}</div>
          <div className="small">{s.graded} graded arrival{s.graded === 1 ? '' : 's'}</div>
        </div>
        <div className="acc-card">
          <div className="muted small">Ship-declared ETA typical error</div>
          <div className="acc-big">{s.declaredMaeH == null ? '—' : `±${span(s.declaredMaeH)}`}</div>
          <div className="small">{s.declaredN} graded</div>
        </div>
      </div>
      {s.n === 0 ? (
        <p className="small muted">No arrivals logged yet. The score fills in as ships berth, while the server keeps listening.</p>
      ) : (
        <table className="real-table small">
          <thead>
            <tr><th>Ship</th><th>Arrived</th><th>vs Berthwise</th><th>vs declared ETA</th></tr>
          </thead>
          <tbody>
            {recent.map((a) => (
              <tr key={`${a.mmsi}-${a.arrivedAt}`}>
                <td>{a.name ?? `MMSI ${a.mmsi}`}</td>
                <td>{when(a.arrivedAt)}</td>
                <td title={a.estimateMadeAt ? `Estimated ${span((a.arrivedAt - a.estimateMadeAt) / 3_600_000)} ahead, ${a.estimateDistanceNm} nm out` : 'Not seen before it arrived'}>{signed(errorHours(a, a.berthwiseEta))}</td>
                <td>{signed(errorHours(a, a.declaredEta))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
