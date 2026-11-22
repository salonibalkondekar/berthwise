import { useState } from 'react';
import { DESTINATION, ORIGIN, WAYPOINTS } from '../lib/lane';
import { STAGE_LABEL, type Shipment, type Stage } from '../lib/sim';
import { fmt, seaSeverity, type Signals } from '../lib/signals';
import type { Prediction } from '../lib/predict';
import type { ErpLink } from '../lib/erp';
import type { DelayCost } from '../lib/money';
import { ActionsPanel } from './ActionsPanel';
import { LaneMap } from './LaneMap';
import { SapCard } from './SapView';
import { RiskChip } from './RiskBrief';
import { PredictionCard, STEPS } from './ShipmentDetail';
import { d, daysBetween, daysFromToday, LiveTag, relDays, SeverityChip, SimTag, usd } from './ui';

interface Props {
  s: Shipment;
  shipments: Shipment[];
  preds: Map<string, Prediction>;
  signals: Signals | null;
  erp: ErpLink | null;
  cost: DelayCost | null;
  resetKey: number;
  position: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const JOURNEY: Record<Stage, number> = { booked: 0.04, at_origin: 0.1, sailing: 0, anchorage: 0.93, at_terminal: 1 };
const journeyShare = (s: Shipment) => (s.stage === 'sailing' ? 0.12 + 0.78 * s.progress : JOURNEY[s.stage]);
const addDays = (x: Date, n: number) => new Date(x.getTime() + n * 86_400_000);

function Icon({ d: path }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}
const SHIP = 'M3 12.5h14l-2 4H5l-2-4zM5 12.5V8h10v4.5M8 8V5h4v3';
const PIN = 'M10 17s5-4.6 5-8.5a5 5 0 1 0-10 0C5 12.4 10 17 10 17zM10 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z';

export function CaseFile({ s, shipments, preds, signals, erp, cost, resetKey, position, onSelect, onBack, onPrev, onNext }: Props) {
  const pred = preds.get(s.id) ?? null;
  const [tab, setTab] = useState<'why' | 'sap' | 'sea'>('why');
  const share = journeyShare(s);
  const eta = pred?.predictedArrival ?? s.carrierEta;
  const daysLeft = Math.max(0, Math.round(daysFromToday(eta)));
  const drivers = pred?.factors.filter((f) => f.days >= 0.3) ?? [];
  const stepIndex = STEPS.findIndex((x) => x.stage === s.stage);
  const sailDays = daysBetween(s.departure, s.carrierEta);
  const freeLeft = s.dischargedAt ? s.freeDays - daysBetween(s.dischargedAt, new Date()) : null;
  const slack = pred?.slackDays ?? daysBetween(s.carrierEta, s.needBy);
  const weather = signals?.weather ?? null;

  const checkpoints = WAYPOINTS.map((wp, i) => {
    const w = weather?.[i] ?? null;
    return {
      name: wp.name,
      kind: 'Sea area',
      passed: wp.fraction <= s.progress && s.stage !== 'booked' && s.stage !== 'at_origin',
      when: addDays(s.departure, wp.fraction * sailDays),
      sev: seaSeverity(w?.waveHeightM, w?.windKn),
      wave: w?.waveHeightM ?? null,
      wind: w?.windKn ?? null,
    };
  });
  const passed = checkpoints.filter((c) => c.passed).length;
  const ahead = checkpoints.filter((c) => !c.passed);
  const [showPassed, setShowPassed] = useState(false);
  const shown = checkpoints.map((c, i) => ({ ...c, n: i + 1 })).filter((c, i) => showPassed || !c.passed || i === passed - 1);
  const lat = s.position[0];
  const lon = ((s.position[1] + 540) % 360) - 180;
  const port = pred?.factors.find((f) => f.id.includes('port'));

  const timeline: { label: string; date: Date | null; state: 'done' | 'current' | '' ; note?: string }[] = [
    ...STEPS.map((st, i) => ({
      label: st.label,
      date: st.stage === 'booked' ? addDays(s.departure, -21) : st.stage === 'at_origin' ? addDays(s.departure, -2) : st.stage === 'sailing' ? s.departure : st.stage === 'anchorage' ? addDays(eta, -1) : s.dischargedAt ?? eta,
      state: (i < stepIndex ? 'done' : i === stepIndex ? 'current' : '') as 'done' | 'current' | '',
      note: st.stage === 'at_terminal' && !s.dischargedAt ? 'Berthwise estimate' : undefined,
    })),
    { label: 'Needed by', date: s.needBy, state: '', note: s.needByReason },
  ];

  return (
    <div className="case">
      <section className="case-head">
        <div className="case-id">
          <div className="case-badges">
            {pred && <RiskChip p={pred} />}
            {drivers.length > 0 && <span className="case-badge warn">{drivers.length} delay driver{drivers.length === 1 ? '' : 's'}</span>}
            {s.simulated ? <SimTag /> : <span className="tag tag-csv">CSV</span>}
          </div>
          <h2 className="case-container">
            <span className="mono">{s.container}</span>
            <span className="case-carrier">{s.carrier}</span>
          </h2>
          <div className="muted small">{s.product} · {s.units.toLocaleString()} units · {usd(s.cargoValueUsd)}</div>
        </div>

        <div className="case-track">
          <div className="track" aria-label={`${STAGE_LABEL[s.stage]}, ${Math.round(share * 100)}% of the journey`}>
            <div className="track-fill" style={{ width: `${Math.min(Math.max(share * 100, 34), 84)}%` }}>
              <span className="track-code">CNSHA</span>
              <span className="track-dots" aria-hidden>{STEPS.slice(0, Math.max(1, stepIndex + 1)).map((x) => <i key={x.stage} />)}</span>
              <span className="track-now"><Icon d={SHIP} /> {STAGE_LABEL[s.stage]}</span>
              <strong className="track-pct">{Math.round(share * 100)}% · {daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>
            </div>
            <div className="track-rest">
              <span className="track-dots ghost" aria-hidden>{STEPS.slice(stepIndex + 1).map((x) => <i key={x.stage} />)}</span>
              <span className="track-code">USLAX</span>
            </div>
          </div>
          <div className="track-names muted small">
            <span>{ORIGIN.name}, China</span>
            <span>{DESTINATION.name}, USA</span>
          </div>
        </div>

        <div className="case-eta">
          <div className={`eta-box eta-${pred?.level ?? 'low'}`}>
            <span>Berthwise ETA</span>
            <strong>{d(eta)}</strong>
          </div>
          <div className="muted small">Carrier ETA {d(s.carrierEta)}{pred && Math.abs(pred.delayDays) >= 0.1 && ` · ${pred.delayDays > 0 ? '+' : '−'}${Math.abs(pred.delayDays).toFixed(1)} d`}</div>
        </div>
      </section>

      <section className="case-grid">
        <div className="case-card">
          <div className="case-toolbar">
            <button className="link-btn" onClick={onBack}>← Back</button>
            <div className="pager">
              <button className="icon-btn" onClick={onPrev} aria-label="Previous shipment">‹</button>
              <span className="muted small">{position}</span>
              <button className="icon-btn" onClick={onNext} aria-label="Next shipment">›</button>
            </div>
          </div>
          <dl className="case-dl">
            <dt>Container type</dt><dd>{s.containerType}</dd>
            <dt>PO</dt><dd className="mono">{s.po}</dd>
            <dt>Vessel</dt><dd>{s.vessel} <span className="muted mono small">{s.voyage}</span></dd>
            <dt>Carrier</dt><dd>{s.carrier}</dd>
            <dt>Departure</dt><dd>{d(s.departure)} <span className="muted small">{relDays(daysFromToday(s.departure))}</span></dd>
            <dt>Needed by</dt><dd>{d(s.needBy)} <span className="muted small">{s.needByReason}</span></dd>
            <dt>Time to act</dt>
            <dd className={slack < 0 ? 'bad' : slack < 2 ? 'warnc' : 'okc'}>
              {slack < 0 ? `${Math.abs(slack).toFixed(1)} d late` : `${slack.toFixed(1)} d spare`}
              {cost && cost.total > 0 && <span className="case-pill">{usd(cost.total)} at stake</span>}
            </dd>
            <dt>Free days</dt><dd>{freeLeft != null ? (freeLeft > 0 ? `${freeLeft} of ${s.freeDays} left` : `All ${s.freeDays} used`) : `${s.freeDays} at the terminal`}</dd>
            <dt>Data quality</dt><dd>{pred?.liveDataUsed ? 'Live signals + simulated history' : 'Simulated only'}</dd>
          </dl>
        </div>

        <div className="case-card case-map">
          <div className="case-map-head">
            <span className="case-vessel"><Icon d={SHIP} /> {s.vessel}</span>
            <span className="case-route small">
              <b>{ORIGIN.short}</b>
              {passed > 0 && <b> → {passed} passed</b>}
              {ahead.slice(0, 3).map((c) => <span key={c.name}> → {c.name}</span>)}
              {ahead.length > 3 && <span> → …</span>}
              <span> → {DESTINATION.short}</span>
            </span>
          </div>
          <div className="case-map-body">
            <LaneMap shipments={shipments} weather={weather} preds={preds} selectedId={s.id} onSelect={onSelect} resetKey={resetKey} highlight={null} />
          </div>
          <div className="case-map-foot muted small">
            <span><Icon d={PIN} /> {Math.abs(lat).toFixed(2)}°{lat >= 0 ? 'N' : 'S'}, {Math.abs(lon).toFixed(2)}°{lon >= 0 ? 'E' : 'W'}</span>
            <span>{s.speedKn != null ? `${s.speedKn} kn` : 'Not under way'}</span>
            <span>{s.distanceRemainingNm.toLocaleString()} nm to go</span>
            {s.simulated && <SimTag />}
          </div>
        </div>

        <div className="case-card">
          <div className="case-chips">
            <span>Port traffic <b className={port && port.days > 0.3 ? 'warnc' : 'okc'}>{port && port.days > 0.3 ? 'Busy' : 'Normal'}</b></span>
            <span>Sea ahead <b className={checkpoints.some((c) => !c.passed && (c.sev === 'rough' || c.sev === 'severe')) ? 'warnc' : 'okc'}>{checkpoints.some((c) => !c.passed && (c.sev === 'rough' || c.sev === 'severe')) ? 'Rough' : 'Fair'}</b></span>
          </div>
          <h3 className="case-h3">Route checkpoints <LiveTag /></h3>
          <ol className="checkpoints">
            {passed > 1 && (
              <li className="cp-more">
                <button className="link-btn small" onClick={() => setShowPassed((v) => !v)}>
                  {showPassed ? 'Hide passed checkpoints' : `Show ${passed - 1} earlier checkpoints`}
                </button>
              </li>
            )}
            {shown.map((c) => (
              <li key={c.name} className={c.passed ? 'passed' : ''}>
                <div className="cp-top">
                  <span className="cp-kind">{c.kind}{c.passed && ' ✓'}</span>
                  <span className="muted small">{c.passed ? 'Passed' : `~${d(c.when)}`}</span>
                </div>
                <div className="cp-name">{c.n}. {c.name}</div>
                <div className="cp-chips">
                  <SeverityChip sev={c.sev} />
                  <span className="cp-chip">Waves {fmt(c.wave, 1, ' m')}</span>
                  <span className="cp-chip">Wind {fmt(c.wind, 0, ' kn')}</span>
                </div>
              </li>
            ))}
            <li>
              <div className="cp-top"><span className="cp-kind">Discharge port</span><span className="muted small">~{d(eta)}</span></div>
              <div className="cp-name">{WAYPOINTS.length + 1}. {DESTINATION.name}</div>
              <div className="cp-chips">
                <span className={`cp-chip ${port && port.days > 0.3 ? 'cp-warn' : ''}`}>{port ? port.title : 'Port traffic normal'}</span>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="case-grid case-grid-low">
        <div className="case-card">
          <h3 className="case-h3">Journey timeline</h3>
          <ol className="timeline">
            {timeline.map((t) => (
              <li key={t.label} className={t.state}>
                <span className="tl-dot" />
                <div>
                  <div className="tl-label">{t.label}</div>
                  <div className="muted small">{d(t.date)}{t.note && ` · ${t.note}`}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="case-card case-tabs-card">
          <div className="case-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'why'} onClick={() => setTab('why')}>Why <span className="muted">· {drivers.length}</span></button>
            <button role="tab" aria-selected={tab === 'sap'} onClick={() => setTab('sap')}>SAP orders <span className="muted">· {erp?.orders.length ?? 0}</span></button>
            <button role="tab" aria-selected={tab === 'sea'} onClick={() => setTab('sea')}>Summary</button>
          </div>
          <div className="case-tab-body">
            {tab === 'why' && (pred && pred.level !== 'arrived' ? <PredictionCard s={s} p={pred} /> : <p className="muted">This container has arrived.</p>)}
            {tab === 'sap' && (erp ? <SapCard link={erp} /> : <p className="muted">No SAP link for this container.</p>)}
            {tab === 'sea' && (
              <p className="small">
                {s.product} ({s.units.toLocaleString()} units) left {ORIGIN.short} on {d(s.departure)} aboard {s.vessel}. The carrier says it lands {d(s.carrierEta)}; Berthwise expects {d(eta)}
                {pred && `, with a ${Math.round(pred.missChance * 100)}% chance of missing ${d(s.needBy)} (${s.needByReason})`}.
                {cost && cost.total > 0 && ` The delay is costing about ${usd(cost.total)}.`}
              </p>
            )}
          </div>
        </div>

        <div className="case-card">
          <ActionsPanel s={s} pred={pred} signals={signals} cost={cost} />
        </div>
      </section>
    </div>
  );
}
