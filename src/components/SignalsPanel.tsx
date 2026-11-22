import { WAYPOINTS } from '../lib/lane';
import { fmt, seaSeverity, type PortSignal, type Signals } from '../lib/signals';
import { Sparkline } from './Sparkline';
import { LiveTag, SeverityChip, timeAgo } from './ui';

interface Props {
  signals: Signals | null;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}

export function SignalsPanel({ signals, error, refreshing, onRefresh }: Props) {
  if (!signals) {
    return error ? (
      <div className="error-box">
        Couldn’t load live data ({error}).{' '}
        <button className="link-btn" onClick={onRefresh}>Try again</button>
      </div>
    ) : (
      <div className="signals">
        <div className="skeleton" style={{ height: 90 }} />
        <div className="skeleton" style={{ height: 90 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }
  return (
    <div className="signals">
      <div className="signals-head">
        <span className="muted small">Updated {timeAgo(signals.fetchedAt)}</span>
        <button className="btn-secondary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {signals.errors.length > 0 && (
        <div className="error-box">Some sources didn’t respond, so older readings are shown where available.</div>
      )}

      <h3 className="section-title">
        Port traffic <LiveTag />
      </h3>
      <p className="muted small explain">Container ships calling each day, from ship tracking (AIS). Runs about a week behind.</p>
      {[signals.ports.origin, signals.ports.destination].map((p) => p && <PortCard key={p.key} p={p} />)}

      <h3 className="section-title">
        Sea conditions along the lane <LiveTag />
      </h3>
      <p className="muted small explain">From Shanghai (top) to Los Angeles (bottom). Hover a dot on the map for the same reading.</p>
      <table className="wx-table">
        <thead>
          <tr>
            <th>Area</th>
            <th className="num">Waves</th>
            <th className="num">Wind</th>
            <th className="num">7-day high</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(signals.weather ?? []).map((w, i) => {
            const highs = w.forecast.map((f) => f.waveMaxM).filter((x): x is number => x != null);
            return (
              <tr key={w.id}>
                <td>{WAYPOINTS[i].name}</td>
                <td className="num">{fmt(w.waveHeightM, 1, ' m')}</td>
                <td className="num">{fmt(w.windKn, 0, ' kn')}</td>
                <td className="num">{highs.length ? `${Math.max(...highs).toFixed(1)} m` : '—'}</td>
                <td>
                  <SeverityChip sev={seaSeverity(w.waveHeightM, w.windKn)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="section-title">Sources</h3>
      <ul className="sources">
        {signals.sources.map((s) => (
          <li key={s.name}>
            <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
            <span className="muted"> — {s.what}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PortCard({ p }: { p: PortSignal }) {
  const pct = p.changePct;
  return (
    <div className="card">
      <div className="row-top">
        <strong>{p.name}</strong>
        {pct != null && <span className={`delta ${pct >= 0 ? 'up' : 'down'}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(0)}% vs 90-day avg</span>}
      </div>
      <div className="port-stat">
        <span className="port-num">{fmt(p.recent7dAvgCalls, 1)}</span>
        <span className="muted small">container ships a day, last 7 days (90-day avg {fmt(p.baseline90dAvgCalls, 1)})</span>
      </div>
      <Sparkline values={p.series.map((x) => x.containerCalls)} label={`${p.name} daily container calls, last 90 days`} />
      <div className="muted small spark-axis">
        <span>90 days ago</span>
        <span>{p.asOf}</span>
      </div>
    </div>
  );
}
