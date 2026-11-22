import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette, NavIcon, type PageItem } from './components/CommandPalette';
import { LaneMap } from './components/LaneMap';
import { useAis } from './lib/ais';
import { CaseFile } from './components/CaseFile';
import { Accuracy } from './components/Accuracy';
import { RiskBrief } from './components/RiskBrief';
import { WhatIf } from './components/WhatIf';
import { ShipmentList, type StageFilter } from './components/ShipmentList';
import { SignalsPanel } from './components/SignalsPanel';
import { LiveTag, SimTag, timeAgo } from './components/ui';
import { DESTINATION, ORIGIN, WAYPOINTS } from './lib/lane';
import { generateShipments, LANE_NM } from './lib/sim';
import { predict, rankByRisk, type Prediction } from './lib/predict';
import { erpLinks } from './lib/erp';
import { SapView } from './components/SapView';
import { PlanView } from './components/PlanView';
import { DataView } from './components/DataView';
import { parseCsv } from './lib/csv';
import { importShipments } from './lib/importer';
import type { Shipment } from './lib/sim';
import { carrierScorecard, delayCosts, reorderAdvice } from './lib/money';
import { applyScenario, scenarioRange, type Scenario } from './lib/scenario';
import { fmt, type PortSignal, type Signals, type WeatherPoint } from './lib/signals';

const SESSION_URL = 'https://app.devin.ai/sessions/a3eb9ff2b29a4b0e900ee8b290350bc3';
const INTRO_KEY = 'berthwise:intro-dismissed';

type Tab = 'today' | 'shipments' | 'sap' | 'plan' | 'whatif' | 'accuracy' | 'signals' | 'data';
const IMPORT_KEY = 'bw-import-csv';
const THEME_KEY = 'bw-theme';
const MAP_TABS: Tab[] = ['today', 'shipments', 'whatif', 'signals'];

const NAV: (PageItem<Tab> & { group: string })[] = [
  { id: 'today', group: 'Operate', label: 'Today', hint: 'Morning risk list and what to do', icon: 'M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z' },
  { id: 'shipments', group: 'Operate', label: 'Shipments', hint: 'Every container, by stage', icon: 'M3 6.2 10 3l7 3.2v7.6L10 17l-7-3.2V6.2zM3 6.2 10 9.4l7-3.2M10 9.4V17' },
  { id: 'whatif', group: 'Operate', label: 'What-if', hint: 'Storms and port strikes', icon: 'M11 2.5 4.5 11H9l-1 6.5L15.5 9H11l1-6.5z' },
  { id: 'sap', group: 'Plan', label: 'SAP view', hint: 'POs, plant stock, sales orders', icon: 'M4 5c0-1.1 2.7-2 6-2s6 .9 6 2-2.7 2-6 2-6-.9-6-2zM4 5v10c0 1.1 2.7 2 6 2s6-.9 6-2V5M4 10c0 1.1 2.7 2 6 2s6-.9 6-2' },
  { id: 'plan', group: 'Plan', label: 'Planning', hint: 'Cost of delay, reorders, carriers', icon: 'M3 17h14M6 14V9.5M10 14V5M14 14v-3.5' },
  { id: 'data', group: 'Plan', label: 'Import · Export', hint: 'CSV in and out, email digest', icon: 'M6.5 3v11M3.5 11l3 3 3-3M13.5 17V6M10.5 9l3-3 3 3' },
  { id: 'accuracy', group: 'Insight', label: 'Accuracy', hint: 'Estimates vs actual arrivals', icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 10h.01' },
  { id: 'signals', group: 'Insight', label: 'Lane signals', hint: 'Live weather and port traffic', icon: 'M2.5 12.5c2-2.7 3.8-2.7 5.5 0s3.8 2.7 5.5 0 3-2.7 4-2M2.5 7.5c2-2.7 3.8-2.7 5.5 0s3.8 2.7 5.5 0 3-2.7 4-2' },
];

export default function App() {
  const demo = useMemo(() => generateShipments(), []);
  const [imported, setImported] = useState<Shipment[] | null>(() => {
    const csv = localStorage.getItem(IMPORT_KEY);
    const res = csv ? importShipments(parseCsv(csv)) : null;
    return res?.shipments.length ? res.shipments : null;
  });
  const shipments = imported ?? demo;
  const [signals, setSignals] = useState<Signals | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [backTab, setBackTab] = useState<Tab>('today');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StageFilter>('all');
  const [resetKey, setResetKey] = useState(0);
  const [showIntro, setShowIntro] = useState(() => localStorage.getItem(INTRO_KEY) !== '1');
  const panelRef = useRef<HTMLElement>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'dark' || t === 'light' ? t : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const signalsSettled = !!signals || !!loadError;
  const preds = useMemo(() => {
    const m = new Map<string, Prediction>();
    if (signalsSettled) shipments.forEach((s) => m.set(s.id, predict(s, signals)));
    return m;
  }, [shipments, signals, signalsSettled]);
  const erp = useMemo(() => (preds.size ? erpLinks(shipments, preds) : null), [shipments, preds]);
  const costs = useMemo(() => (erp ? delayCosts(shipments, preds, erp, signals) : null), [shipments, preds, erp, signals]);
  const reorder = useMemo(() => (erp ? reorderAdvice(shipments, erp) : []), [shipments, erp]);
  const carriers = useMemo(() => carrierScorecard(shipments, preds, costs), [shipments, preds, costs]);
  const ranked = useMemo(() => (preds.size ? rankByRisk(shipments, preds) : []), [shipments, preds]);
  const [scenario, setScenario] = useState<Scenario>({ kind: 'storm', zone: 'nwp', startIn: 1, days: 3, strength: 'extreme' });
  const mapPreds = useMemo(
    () => (tab === 'whatif' && preds.size ? applyScenario(shipments, preds, scenario).after : preds),
    [tab, preds, shipments, scenario],
  );
  const likelyLate = ranked.filter((s) => preds.get(s.id)?.level === 'high').length;
  const atRisk = ranked.filter((s) => preds.get(s.id)?.level === 'medium').length;

  const ais = useAis();
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
    setTab((t) => {
      if (t !== 'shipments') setBackTab(t);
      return 'shipments';
    });
    if (window.matchMedia('(max-width: 1100px)').matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setResetKey((k) => k + 1);
    setTab(backTab);
    setBackTab('shipments');
  }, [backTab]);

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


  const page = NAV.find((n) => n.id === tab)!;
  const mapTab = MAP_TABS.includes(tab);
  const caseOpen = tab === 'shipments' && !!selected;
  const go = (t: Tab) => {
    if (t !== 'shipments') setSelectedId(null);
    setTab(t);
  };

  return (
    <div className="shell">
      <nav className="sidenav" aria-label="Sections">
        <div className="nav-brand">
          <img src="/icon.svg" alt="" width={30} height={30} />
          <div>
            <div className="brand-name">Berthwise</div>
            <div className="brand-sub">Ocean shipment risk, explained</div>
          </div>
        </div>
        {['Operate', 'Plan', 'Insight'].map((g) => (
          <div className="nav-group" key={g}>
            <div className="nav-group-title">{g}</div>
            {NAV.filter((n) => n.group === g).map((n) => (
              <button key={n.id} className="nav-item" aria-current={tab === n.id ? 'page' : undefined} onClick={() => go(n.id)} title={n.hint}>
                <NavIcon d={n.icon} />
                <span className="nav-label">{n.label}</span>
                {n.id === 'today' && likelyLate > 0 && <span className="count count-alert">{likelyLate}</span>}
                {n.id === 'shipments' && <span className="count">{shipments.length}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="nav-foot">
          <div className="lane-pill" title={`About ${Math.round(LANE_NM).toLocaleString()} nautical miles`}>
            {ORIGIN.short} <span aria-hidden>→</span> {DESTINATION.short}
            <span className="lane-nm"> · {Math.round(LANE_NM).toLocaleString()} nm</span>
          </div>
          <div className={`status ${loadError && !signals ? 'bad' : signals ? 'ok' : ''}`}>
            <span className="status-dot" />
            {signals ? `Live data ${timeAgo(signals.fetchedAt)}` : loadError ? 'Live data unavailable' : 'Loading live data…'}
          </div>
        </div>
      </nav>
    <div className="app">
      <header className="topbar">
        <div>
          {caseOpen && selected ? (
            <>
              <nav className="crumbs small" aria-label="Breadcrumb">
                <button className="link-btn" onClick={clearSelection}>{NAV.find((n) => n.id === backTab)?.label ?? 'Shipments'}</button>
                <span aria-hidden>›</span>
                <span>Case file</span>
              </nav>
              <h1 className="page-title">{selected.product}</h1>
            </>
          ) : (
            <>
              <h1 className="page-title">{page.label}</h1>
              <div className="brand-sub">{page.hint}</div>
            </>
          )}
        </div>
        <div className="topbar-right">
          <button className="search-btn" onClick={() => setPaletteOpen(true)} aria-label="Search">
            <NavIcon d="M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2L16.5 16.5" size={16} />
            <span className="search-label">Search shipments and pages</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className="theme-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            <NavIcon size={17} d={theme === 'dark' ? 'M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5 5l1 1M14 14l1 1M5 15l1-1M14 6l1-1M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' : 'M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z'} />
          </button>
        </div>
      </header>

      {!caseOpen && (<>
      {showIntro ? (
        <section className="intro">
          <div className="intro-text">
            <h1>Which containers will be late, and why</h1>
            <p>
              {shipments.length} containers from {ORIGIN.short} to {DESTINATION.short}, ranked by how likely they are to miss their date. Pick one to see why and what to do.
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
          {imported ? <span><strong>Your file</strong> · {shipments.length} imported shipments; SAP, fees and history stay simulated</span> : <span><SimTag /> Shipments are invented demo data</span>}
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
          <div className="kpi-label">Containers tracked {imported ? <span className="muted small">your file</span> : <SimTag />}</div>
          <div className="kpi-value">{shipments.length}</div>
          <div className="kpi-foot">
            {preds.size ? (
              <>
                <span className="risk-text-high">{likelyLate} likely late</span> · <span className="risk-text-medium">{atRisk} at risk</span> · {atSea} at sea
              </>
            ) : (
              `${atSea} at sea · ${waiting} waiting to berth`
            )}
          </div>
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

      </>)}

      {caseOpen && selected ? (
        <CaseFile
          vessels={ais?.vessels ?? null}
          s={selected}
          shipments={shipments}
          preds={preds}
          signals={signals}
          erp={erp?.get(selected.id) ?? null}
          cost={costs?.get(selected.id) ?? null}
          resetKey={resetKey}
          position={`${idx + 1} of ${shipments.length}`}
          onSelect={select}
          onBack={clearSelection}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      ) : (
      <main className={`main ${mapTab ? '' : 'main-wide'}`}>
        {mapTab && (<div className="map-wrap">
          <LaneMap shipments={shipments} weather={signals?.weather ?? null} preds={mapPreds} selectedId={selectedId} onSelect={select} resetKey={resetKey} highlight={tab === 'whatif' ? scenarioRange(scenario) : null} vessels={ais?.vessels ?? null} />
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
              <div className="legend-title">Shipments {!imported && <SimTag />}</div>
              <div><span className="pin-mini pin-risk-high">SIM</span> Likely late</div>
              <div><span className="pin-mini pin-risk-medium">SIM</span> At risk</div>
              <div><span className="pin-mini">SIM</span> On track</div>
            </div>
            {!!ais?.vessels.length && (
              <div className="legend-group">
                <div className="legend-title">Real ships <LiveTag /></div>
                <div><span className="dot ais-dot" /> Cargo ship on AIS · {ais.vessels.length}</div>
              </div>
            )}
          </details>
        </div>)}

        <aside className="panel" ref={panelRef}>
          <div className="pane" key={tab === 'shipments' ? `shipments-${selected ? 'detail' : 'list'}` : tab}>
          {tab === 'today' && (
            <RiskBrief erp={erp} costs={costs} ranked={ranked} all={shipments} signals={signals} preds={preds} loading={!signalsSettled} liveMissing={!signals && !!loadError} onSelect={select} />
          )}
          {tab === 'shipments' && !selected && (
            <ShipmentList
              shipments={shipments}
              preds={preds}
              query={query}
              onQuery={setQuery}
              filter={filter}
              onFilter={setFilter}
              onSelect={select}
            />
          )}
          {tab === 'sap' && (erp ? <SapView links={erp} onSelect={select} /> : <div className="brief"><div className="skeleton" style={{ height: 160 }} /></div>)}
          {tab === 'plan' && (costs ? <PlanView shipments={shipments} costs={costs} reorder={reorder} carriers={carriers} onSelect={select} /> : <div className="brief"><div className="skeleton" style={{ height: 160 }} /></div>)}
          {tab === 'whatif' && <WhatIf shipments={shipments} preds={preds} scenario={scenario} onChange={setScenario} onSelect={select} />}
          {tab === 'accuracy' && <Accuracy ais={ais} />}
          {tab === 'data' && (erp && costs ? (
            <DataView
              shipments={shipments}
              demo={demo}
              imported={!!imported}
              preds={preds}
              erp={erp}
              costs={costs}
              reorder={reorder}
              carriers={carriers}
              signals={signals}
              onImport={(csv, list) => { localStorage.setItem(IMPORT_KEY, csv); setSelectedId(null); setImported(list); }}
              onReset={() => { localStorage.removeItem(IMPORT_KEY); setSelectedId(null); setImported(null); }}
            />
          ) : <div className="brief"><div className="skeleton" style={{ height: 160 }} /></div>)}
          {tab === 'signals' && <SignalsPanel signals={signals} error={loadError} refreshing={refreshing} onRefresh={() => load(true)} />}
          </div>
        </aside>
      </main>
      )}

      <footer className="footer">
        <span>
          Weather: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0) · Port traffic:{' '}
          <a href="https://portwatch.imf.org/" target="_blank" rel="noreferrer">IMF PortWatch</a> · Map © Esri · {imported ? 'Shipments from your file' : 'Shipments are simulated'}
        </span>
        <span>
          <a href={SESSION_URL} target="_blank" rel="noreferrer">Request changes</a>
        </span>
      </footer>
    </div>
      {paletteOpen && (
        <CommandPalette
          pages={NAV}
          shipments={shipments}
          preds={preds}
          onPage={go}
          onShipment={select}
          onClose={() => setPaletteOpen(false)}
        />
      )}
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
