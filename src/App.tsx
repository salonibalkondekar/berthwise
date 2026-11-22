import { useEffect, useMemo, useState } from 'react';
import { LaneMap } from './components/LaneMap';
import { Sparkline } from './components/Sparkline';
import { DESTINATION, ORIGIN, WAYPOINTS } from './lib/lane';
import { generateShipments, IMPORTER, LANE_NM, STAGE_LABEL, type Shipment } from './lib/sim';
import { fmt, seaSeverity, SEVERITY_LABEL, type PortSignal, type Signals, type WeatherPoint } from './lib/signals';

const SESSION_URL = 'https://app.devin.ai/sessions/a3eb9ff2b29a4b0e900ee8b290350bc3';

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const d = (x: Date | null) => (x ? dateFmt.format(x) : '—');
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function weatherFor(s: Shipment, weather: WeatherPoint[] | null) {
  if (!weather) return null;
  let best = 0;
  let bestDist = Infinity;
  WAYPOINTS.forEach((wp, i) => {
    const dist = Math.abs(wp.fraction - s.progress);
    if (weather[i]?.waveHeightM != null && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return { point: weather[best], name: WAYPOINTS[best].name };
}

function SimTag() {
  return <span className="tag tag-sim" title="Invented demo data">Simulated</span>;
}
function LiveTag() {
  return <span className="tag tag-live" title="Fetched from a free public source">Live data</span>;
}

function SeverityChip({ wave, wind }: { wave: number | null | undefined; wind: number | null | undefined }) {
  const sev = seaSeverity(wave, wind);
  return <span className={`chip chip-${sev}`}>{SEVERITY_LABEL[sev]}</span>;
}

export default function App() {
  const shipments = useMemo(() => generateShipments(), []);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'shipments' | 'signals'>('shipments');

  const load = (refresh = false) => {
    setLoadError(null);
    fetch(`/api/signals${refresh ? '?refresh=1' : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setSignals)
      .catch((e) => setLoadError(String(e.message ?? e)));
  };
  useEffect(() => load(), []);

  const selected = shipments.find((s) => s.id === selectedId) ?? null;
  const select = (id: string) => {
    setSelectedId(id);
    setTab('shipments');
  };

  const onWater = shipments.filter((s) => s.stage === 'sailing').length;
  const waiting = shipments.filter((s) => s.stage === 'anchorage').length;
  const roughest = signals?.weather?.reduce<WeatherPoint | null>(
    (m, w) => (w.waveHeightM != null && (m == null || w.waveHeightM > (m.waveHeightM ?? 0)) ? w : m),
    null,
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span className="brand-name">Berthwise</span>
          <span className="brand-sub">Ocean shipment risk, explained</span>
        </div>
        <div className="lane-pill">
          {ORIGIN.name} <span aria-hidden>→</span> {DESTINATION.name}
          <span className="muted"> · {Math.round(LANE_NM).toLocaleString()} nm</span>
        </div>
      </header>

      <div className="banner" role="note">
        <SimTag /> Shipments, containers, vessels and the importer ({IMPORTER.name}) are invented demo data.
        <LiveTag /> Sea conditions and port activity are real, from free public sources.
      </div>

      <section className="kpis">
        <div className="kpi">
          <div className="kpi-label">Shipments tracked <SimTag /></div>
          <div className="kpi-value">{shipments.length}</div>
          <div className="kpi-foot">{onWater} on the water · {waiting} waiting at anchorage</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Roughest sea on the lane <LiveTag /></div>
          <div className="kpi-value">{fmt(roughest?.waveHeightM, 1, ' m')}</div>
          <div className="kpi-foot">
            {roughest ? `${WAYPOINTS.find((w) => w.id === roughest.id)?.name} · wind ${fmt(roughest.windKn, 0, ' kn')}` : 'Loading…'}
          </div>
        </div>
        <PortKpi port={signals?.ports.origin ?? null} label="Shanghai container calls" />
        <PortKpi port={signals?.ports.destination ?? null} label="LA / Long Beach container calls" />
      </section>

      <main className="main">
        <div className="map-wrap">
          <LaneMap shipments={shipments} weather={signals?.weather ?? null} selectedId={selectedId} onSelect={select} />
          <div className="legend">
            <div><span className="dot wx-calm" /> Calm</div>
            <div><span className="dot wx-moderate" /> Moderate</div>
            <div><span className="dot wx-rough" /> Rough</div>
            <div><span className="dot wx-severe" /> Severe</div>
            <div><span className="pin-mini">SIM</span> Simulated shipment</div>
          </div>
        </div>

        <aside className="panel">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'shipments'} onClick={() => setTab('shipments')}>
              Shipments
            </button>
            <button role="tab" aria-selected={tab === 'signals'} onClick={() => setTab('signals')}>
              Lane signals
            </button>
          </div>

          {tab === 'shipments' && !selected && (
            <ul className="ship-list">
              {shipments.map((s) => {
                const wx = weatherFor(s, signals?.weather ?? null);
                return (
                  <li key={s.id}>
                    <button className="ship-row" onClick={() => select(s.id)}>
                      <div className="row-top">
                        <span className="mono">{s.container}</span>
                        <span className={`stage stage-${s.stage}`}>{STAGE_LABEL[s.stage]}</span>
                      </div>
                      <div className="row-mid">{s.product}</div>
                      <div className="row-foot muted">
                        {s.vessel} · ETA {d(s.carrierEta)}
                        {wx && s.stage === 'sailing' && (
                          <> · <SeverityChip wave={wx.point.waveHeightM} wind={wx.point.windKn} /></>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {tab === 'shipments' && selected && (
            <ShipmentDetail s={selected} signals={signals} onBack={() => setSelectedId(null)} />
          )}

          {tab === 'signals' && <SignalsPanel signals={signals} error={loadError} onRefresh={() => load(true)} />}
        </aside>
      </main>

      <footer className="footer">
        <span>
          Data: weather from <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0), port calls
          from <a href="https://portwatch.imf.org/" target="_blank" rel="noreferrer">IMF PortWatch</a>, basemap © Esri. Shipments are simulated.
        </span>
        <span>
          Milestone 1 of 4 · <a href={SESSION_URL} target="_blank" rel="noreferrer">Request changes</a>
        </span>
      </footer>
    </div>
  );
}

function PortKpi({ port, label }: { port: PortSignal | null; label: string }) {
  const pct = port?.changePct;
  return (
    <div className="kpi">
      <div className="kpi-label">{label} <LiveTag /></div>
      <div className="kpi-value">
        {fmt(port?.recent7dAvgCalls, 1)}
        <span className="kpi-unit">/day</span>
        {pct != null && (
          <span className={`delta ${pct >= 0 ? 'up' : 'down'}`}>
            {pct >= 0 ? '+' : ''}
            {pct.toFixed(0)}% vs 90d
          </span>
        )}
      </div>
      <div className="kpi-foot">{port ? `7-day average, as of ${port.asOf}` : 'Loading…'}</div>
    </div>
  );
}

function ShipmentDetail({ s, signals, onBack }: { s: Shipment; signals: Signals | null; onBack: () => void }) {
  const wx = weatherFor(s, signals?.weather ?? null);
  const dest = signals?.ports.destination;
  const next3 = wx?.point.forecast.slice(0, 3) ?? [];
  const waves3 = next3.map((f) => f.waveMaxM).filter((x): x is number => x != null);
  const maxWave = waves3.length ? Math.max(...waves3) : null;
  return (
    <div className="detail">
      <button className="link-btn" onClick={onBack}>← All shipments</button>
      <div className="detail-head">
        <div>
          <div className="mono big">{s.container}</div>
          <div className="muted">{s.id} · {s.po} · {s.containerType}</div>
        </div>
        <SimTag />
      </div>

      <div className="progress" aria-label={`${Math.round(s.progress * 100)}% of the lane done`}>
        <div className="progress-bar" style={{ width: `${s.progress * 100}%` }} />
      </div>
      <div className="progress-labels muted small">
        <span>{ORIGIN.name}</span>
        <span>{s.distanceRemainingNm.toLocaleString()} nm to go</span>
        <span>{DESTINATION.name}</span>
      </div>

      <dl className="facts">
        <dt>Status</dt><dd><span className={`stage stage-${s.stage}`}>{STAGE_LABEL[s.stage]}</span></dd>
        <dt>Cargo</dt><dd>{s.product} · {s.units.toLocaleString()} units · {usd(s.cargoValueUsd)}</dd>
        <dt>Vessel</dt><dd>{s.vessel} · voyage {s.voyage}</dd>
        <dt>Carrier</dt><dd>{s.carrier}</dd>
        <dt>Departed</dt><dd>{s.stage === 'booked' || s.stage === 'at_origin' ? `Planned ${d(s.departure)}` : d(s.departure)}</dd>
        <dt>Carrier ETA</dt><dd>{d(s.carrierEta)}</dd>
        {s.speedKn != null && (<><dt>Speed</dt><dd>{s.speedKn} kn</dd></>)}
        {s.dischargedAt && (<><dt>Discharged</dt><dd>{d(s.dischargedAt)} · {s.freeDays} free days at terminal</dd></>)}
        <dt>Needed by</dt><dd>{d(s.needBy)} · {s.needByReason}</dd>
      </dl>

      <h3 className="section-title">Conditions around this ship <LiveTag /></h3>
      {wx ? (
        <div className="card">
          <div className="row-top">
            <span>{wx.name}</span>
            <SeverityChip wave={wx.point.waveHeightM} wind={wx.point.windKn} />
          </div>
          <div className="wx-grid">
            <div><div className="muted small">Waves now</div>{fmt(wx.point.waveHeightM, 1, ' m')}</div>
            <div><div className="muted small">Wind now</div>{fmt(wx.point.windKn, 0, ' kn')}</div>
            <div><div className="muted small">Max waves, 3 days</div>{fmt(maxWave, 1, ' m')}</div>
          </div>
        </div>
      ) : (
        <div className="muted">Loading live conditions…</div>
      )}

      {dest && (
        <div className="card">
          <div className="row-top">
            <span>Destination port activity</span>
            <span className={`delta ${(dest.changePct ?? 0) >= 0 ? 'up' : 'down'}`}>
              {(dest.changePct ?? 0) >= 0 ? '+' : ''}{fmt(dest.changePct, 0, '%')} vs 90d
            </span>
          </div>
          <div className="muted small">Container vessel calls per day at LA / Long Beach, as of {dest.asOf}</div>
        </div>
      )}

      <div className="next-up">
        Delay prediction, the reasons behind it, and the stock-out check against the needed-by date arrive in milestone 2.
      </div>
    </div>
  );
}

function SignalsPanel({ signals, error, onRefresh }: { signals: Signals | null; error: string | null; onRefresh: () => void }) {
  if (error) return <div className="error">Couldn’t load live signals: {error} <button className="link-btn" onClick={onRefresh}>Retry</button></div>;
  if (!signals) return <div className="muted pad">Loading live signals…</div>;
  return (
    <div className="signals">
      <div className="muted small pad-x">
        Fetched {new Date(signals.fetchedAt).toLocaleString()} · <button className="link-btn" onClick={onRefresh}>Refresh</button>
      </div>
      {signals.errors.length > 0 && <div className="error">Some sources failed: {signals.errors.join('; ')}</div>}

      <h3 className="section-title">Port activity <LiveTag /></h3>
      {[signals.ports.origin, signals.ports.destination].map(
        (p) =>
          p && (
            <div className="card" key={p.key}>
              <div className="row-top">
                <span>{p.name}</span>
                <span className={`delta ${(p.changePct ?? 0) >= 0 ? 'up' : 'down'}`}>
                  {(p.changePct ?? 0) >= 0 ? '+' : ''}{fmt(p.changePct, 0, '%')} vs 90d
                </span>
              </div>
              <Sparkline values={p.series.map((x) => x.containerCalls)} label={`${p.name} daily container calls, last 90 days`} />
              <div className="muted small">
                Container vessel calls per day, last 90 days. 7-day avg {fmt(p.recent7dAvgCalls, 1)} vs 90-day avg{' '}
                {fmt(p.baseline90dAvgCalls, 1)}. As of {p.asOf}.
              </div>
            </div>
          ),
      )}

      <h3 className="section-title">Sea conditions along the lane <LiveTag /></h3>
      <table className="wx-table">
        <thead>
          <tr><th>Point</th><th>Waves</th><th>Wind</th><th>Max 7d</th><th /></tr>
        </thead>
        <tbody>
          {(signals.weather ?? []).map((w, i) => {
            const max7 = Math.max(...w.forecast.map((f) => f.waveMaxM ?? 0));
            return (
              <tr key={w.id}>
                <td>{WAYPOINTS[i].name}</td>
                <td className="num">{fmt(w.waveHeightM, 1, ' m')}</td>
                <td className="num">{fmt(w.windKn, 0, ' kn')}</td>
                <td className="num">{w.forecast.length && max7 > 0 ? `${max7.toFixed(1)} m` : '—'}</td>
                <td><SeverityChip wave={w.waveHeightM} wind={w.windKn} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="section-title">Sources</h3>
      <ul className="sources">
        {signals.sources.map((s) => (
          <li key={s.name}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> — {s.what}</li>
        ))}
      </ul>
    </div>
  );
}
