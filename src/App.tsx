import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LaneMap } from './components/LaneMap';
import { ShipmentDetail } from './components/ShipmentDetail';
import { ShipmentList, type StageFilter } from './components/ShipmentList';
import { SignalsPanel } from './components/SignalsPanel';
import { LiveTag, SimTag, timeAgo } from './components/ui';
import { DESTINATION, ORIGIN, WAYPOINTS } from './lib/lane';
import { generateShipments, IMPORTER, LANE_NM } from './lib/sim';
import { fmt, type PortSignal, type Signals, type WeatherPoint } from './lib/signals';

const SESSION_URL = 'https://app.devin.ai/sessions/a3eb9ff2b29a4b0e900ee8b290350bc3';
const INTRO_KEY = 'berthwise:intro-dismissed';

export default function App() {
  const shipments = useMemo(() => generateShipments(), []);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'shipments' | 'signals'>('shipments');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StageFilter>('all');
  const [resetKey, setResetKey] = useState(0);
  const [showIntro, setShowIntro] = useState(() => localStorage.getItem(INTRO_KEY) !== '1');
  const panelRef = useRef<HTMLElement>(null);

  const load = useCallback((refresh = false) => {
    setLoadError(null);
    setRefreshing(true);
    fetch(`/api/signals${refresh ? '?refresh=1' : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setSignals)
      .catch((e) => setLoadError(String(e.message ?? e)))
      .finally(() => setRefreshing(false));
  }, []);
  useEffect(() => load(), [load]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setTab('shipments');
    if (window.matchMedia('(max-width: 1100px)').matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setResetKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedId) clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, clearSelection]);

  const dismissIntro = () => {
    localStorage.setItem(INTRO_KEY, '1');
    setShowIntro(false);
  };

  const idx = shipments.findIndex((s) => s.id === selectedId);
  const selected = idx >= 0 ? shipments[idx] : null;
  const step = (dir: number) => select(shipments[(idx + dir + shipments.length) % shipments.length].id);

  const atSea = shipments.filter((s) => s.stage === 'sailing').length;
  const waiting = shipments.filter((s) => s.stage === 'anchorage').length;
  const roughest = signals?.weather?.reduce<WeatherPoint | null>(
    (m, w) => (w.waveHeightM != null && (m == null || w.waveHeightM > (m.waveHeightM ?? 0)) ? w : m),
    null,
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={30} height={30} />
          <div>
            <div className="brand-name">Berthwise</div>
            <div className="brand-sub">Ocean shipment risk, explained</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="lane-pill" title={`About ${Math.round(LANE_NM).toLocaleString()} nautical miles`}>
            {ORIGIN.short} <span aria-hidden>→</span> {DESTINATION.short}
            <span className="lane-nm"> · {Math.round(LANE_NM).toLocaleString()} nm</span>
          </div>
          <div className={`status ${loadError && !signals ? 'bad' : signals ? 'ok' : ''}`}>
            <span className="status-dot" />
            {signals ? `Live data ${timeAgo(signals.fetchedAt)}` : loadError ? 'Live data unavailable' : 'Loading live data…'}
          </div>
        </div>
      </header>

      {showIntro ? (
        <section className="intro">
          <div className="intro-text">
            <h1>Where your containers are, and the sea and port conditions around them</h1>
            <p>
              Berthwise follows {shipments.length} containers for {IMPORTER.name}, a made-up importer, from {ORIGIN.short} to {DESTINATION.short}.
              Pick a ship on the map or in the list to see where it is, when it’s due, and the sea conditions near it.
            </p>
            <div className="intro-key">
              <span><SimTag /> Shipments, vessels and the importer are invented.</span>
              <span><LiveTag /> Weather and port traffic are real, from free public sources.</span>
            </div>
          </div>
          <button className="btn-secondary" onClick={dismissIntro}>Got it</button>
        </section>
      ) : (
        <div className="banner" role="note">
          <span><SimTag /> Shipments are invented demo data</span>
          <span><LiveTag /> Weather and port traffic are real</span>
          <button className="link-btn small" onClick={() => setShowIntro(true)}>What is this?</button>
        </div>
      )}

      {loadError && !signals && (
        <div className="error-banner">
          Couldn’t load live weather and port data ({loadError}). The simulated shipments still work.{' '}
          <button className="link-btn" onClick={() => load(true)}>Try again</button>
        </div>
      )}

      <section className="kpis">
        <div className="kpi">
          <div className="kpi-label">Containers tracked <SimTag /></div>
          <div className="kpi-value">{shipments.length}</div>
          <div className="kpi-foot">{atSea} at sea · {waiting} waiting to berth</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Highest waves on the lane <LiveTag /></div>
          {signals ? (
            <>
              <div className="kpi-value">{fmt(roughest?.waveHeightM, 1, ' m')}</div>
              <div className="kpi-foot">
                {roughest ? `${WAYPOINTS.find((w) => w.id === roughest.id)?.name} · wind ${fmt(roughest.windKn, 0, ' kn')}` : 'No wave data'}
              </div>
            </>
          ) : (
            <KpiSkeleton />
          )}
        </div>
        <PortKpi port={signals?.ports.origin ?? null} loading={!signals && !loadError} label={`${ORIGIN.short} port traffic`} />
        <PortKpi port={signals?.ports.destination ?? null} loading={!signals && !loadError} label={`${DESTINATION.short} port traffic`} />
      </section>

      <main className="main">
        <div className="map-wrap">
          <LaneMap shipments={shipments} weather={signals?.weather ?? null} selectedId={selectedId} onSelect={select} resetKey={resetKey} />
          <button className="map-reset" onClick={() => setResetKey((k) => k + 1)}>Show whole lane</button>
          <details className="legend" open>
            <summary>Map key</summary>
            <div className="legend-group">
              <div className="legend-title">Sea conditions <LiveTag /></div>
              <div><span className="dot wx-calm" /> Calm</div>
              <div><span className="dot wx-moderate" /> Moderate</div>
              <div><span className="dot wx-rough" /> Rough</div>
              <div><span className="dot wx-severe" /> Severe</div>
              <div><span className="dot wx-unknown" /> No wave data</div>
            </div>
            <div className="legend-group">
              <div className="legend-title">Shipments <SimTag /></div>
              <div><span className="pin-mini">SIM</span> Click to open</div>
            </div>
          </details>
        </div>

        <aside className="panel" ref={panelRef}>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'shipments'} onClick={() => setTab('shipments')}>
              Shipments <span className="count">{shipments.length}</span>
            </button>
            <button role="tab" aria-selected={tab === 'signals'} onClick={() => setTab('signals')}>
              Weather & ports
            </button>
          </div>

          {tab === 'shipments' && !selected && (
            <ShipmentList
              shipments={shipments}
              weather={signals?.weather ?? null}
              query={query}
              onQuery={setQuery}
              filter={filter}
              onFilter={setFilter}
              onSelect={select}
            />
          )}
          {tab === 'shipments' && selected && (
            <ShipmentDetail
              s={selected}
              signals={signals}
              onBack={clearSelection}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              position={`${idx + 1} of ${shipments.length}`}
            />
          )}
          {tab === 'signals' && <SignalsPanel signals={signals} error={loadError} refreshing={refreshing} onRefresh={() => load(true)} />}
        </aside>
      </main>

      <footer className="footer">
        <span>
          Weather: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0) · Port traffic:{' '}
          <a href="https://portwatch.imf.org/" target="_blank" rel="noreferrer">IMF PortWatch</a> · Map © Esri · Shipments are simulated
        </span>
        <span>
          Milestone 1 of 4 · <a href={SESSION_URL} target="_blank" rel="noreferrer">Request changes</a>
        </span>
      </footer>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: 28, width: '50%', marginTop: 6 }} />
      <div className="skeleton" style={{ height: 12, width: '70%', marginTop: 6 }} />
    </>
  );
}

function PortKpi({ port, label, loading }: { port: PortSignal | null; label: string; loading: boolean }) {
  const pct = port?.changePct;
  return (
    <div className="kpi">
      <div className="kpi-label">{label} <LiveTag /></div>
      {loading ? (
        <KpiSkeleton />
      ) : (
        <>
          <div className="kpi-value">
            {fmt(port?.recent7dAvgCalls, 1)}
            <span className="kpi-unit">ships/day</span>
            {pct != null && (
              <span className={`delta ${pct >= 0 ? 'up' : 'down'}`} title="Last 7 days vs the 90-day average">
                {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
              </span>
            )}
          </div>
          <div className="kpi-foot">{port ? `7-day average vs 90 days, as of ${port.asOf}` : 'No data'}</div>
        </>
      )}
    </div>
  );
}
