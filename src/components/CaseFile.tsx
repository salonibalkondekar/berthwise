import { useState } from 'react';
import { DESTINATION, ORIGIN, WAYPOINTS } from '../lib/lane';
import { STAGE_LABEL, type Shipment, type Stage } from '../lib/sim';
import { fmt, seaSeverity, type Signals } from '../lib/signals';
import type { Prediction } from '../lib/predict';
import type { ErpLink } from '../lib/erp';
import type { DelayCost } from '../lib/money';
import type { AisVessel } from '../lib/ais';
import { ActionsPanel, RecommendationBox, useActions } from './ActionsPanel';
import { LaneMap } from './LaneMap';
import { SapCard } from './SapView';
import { RiskChip } from './RiskBrief';
import { STEPS } from './ShipmentDetail';
import { d, daysBetween, daysFromToday, LiveTag, SimTag, usd } from './ui';

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
  vessels: AisVessel[] | null;
}

type CaseTab = 'why' | 'route' | 'timeline' | 'sap' | 'options' | 'details';

const JOURNEY: Record<Stage, number> = { booked: 0.04, at_origin: 0.1, sailing: 0, anchorage: 0.93, at_terminal: 1 };
const journeyShare = (s: Shipment) => (s.stage === 'sailing' ? 0.12 + 0.78 * s.progress : JOURNEY[s.stage]);
const addDays = (x: Date, n: number) => new Date(x.getTime() + n * 86_400_000);
const signedDays = (n: number) => (Math.abs(n) < 0.1 ? '0 d' : `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} d`);

function Icon({ d: path }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}
const SHIP = 'M3 12.5h14l-2 4H5l-2-4zM5 12.5V8h10v4.5M8 8V5h4v3';

export function CaseFile({ s, shipments, preds, signals, erp, cost, resetKey, position, onSelect, onBack, onPrev, onNext, vessels }: Props) {
  const pred = preds.get(s.id) ?? null;
  const [tab, setTab] = useState<CaseTab>('why');
  const [openFactor, setOpenFactor] = useState<string | null>(null);
  const [allPoints, setAllPoints] = useState(false);
  const { rec } = useActions(s, pred, signals, cost ? cost.doNothing - cost.fees : 0);

  const share = journeyShare(s);
  const eta = pred?.predictedArrival ?? s.carrierEta;
  const daysLeft = Math.max(0, Math.round(daysFromToday(eta)));
  const factors = pred?.factors ?? [];
  const maxDays = Math.max(0.5, ...factors.map((f) => Math.abs(f.days)));
  const stepIndex = STEPS.findIndex((x) => x.stage === s.stage);
  const sailDays = daysBetween(s.departure, s.carrierEta);
  const freeLeft = s.dischargedAt ? s.freeDays - daysBetween(s.dischargedAt, new Date()) : null;
  const slack = pred?.slackDays ?? daysBetween(s.carrierEta, s.needBy);
  const weather = signals?.weather ?? null;

  const checkpoints = WAYPOINTS.map((wp, i) => {
    const w = weather?.[i] ?? null;
    return {
      name: wp.name,
      passed: wp.fraction <= s.progress && s.stage !== 'booked' && s.stage !== 'at_origin',
      when: addDays(s.departure, wp.fraction * sailDays),
      sev: seaSeverity(w?.waveHeightM, w?.windKn),
      wave: w?.waveHeightM ?? null,
    };
  });
  const ahead = checkpoints.filter((c) => !c.passed);
  const shownPoints = allPoints ? checkpoints : ahead.slice(0, 3);

  const timeline = [
    ...STEPS.map((st, i) => ({
      label: st.label,
      date: st.stage === 'booked' ? addDays(s.departure, -21) : st.stage === 'at_origin' ? addDays(s.departure, -2) : st.stage === 'sailing' ? s.departure : st.stage === 'anchorage' ? addDays(eta, -1) : s.dischargedAt ?? eta,
      state: i < stepIndex ? 'done' : i === stepIndex ? 'current' : '',
    })),
    { label: 'Needed by', date: s.needBy, state: '' },
  ];

  const tabs: { id: CaseTab; label: string }[] = [
    { id: 'why', label: 'Why' },
    { id: 'route', label: 'Route' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'sap', label: `SAP orders${erp ? ` · ${erp.orders.length}` : ''}` },
    { id: 'options', label: 'Options & costs' },
    { id: 'details', label: 'Details' },
  ];

  return (
    <div className="case">
      <section className="case-head">
        <div className="case-id">
          <div className="case-badges">
            {pred && <RiskChip p={pred} />}
            {s.simulated ? <SimTag /> : <span className="tag tag-csv">CSV</span>}
          </div>
          <h2 className="case-container"><span className="mono">{s.container}</span></h2>
          <div className="muted small">{s.carrier} · {s.units.toLocaleString()} units</div>
        </div>

        <div className="case-track">
          <div className="track" aria-label={`${STAGE_LABEL[s.stage]}, ${Math.round(share * 100)}% of the journey`}>
            <div className="track-fill" style={{ width: `${Math.min(Math.max(share * 100, 34), 84)}%` }}>
              <span className="track-code">CNSHA</span>
              <span className="track-now"><Icon d={SHIP} /> {STAGE_LABEL[s.stage]}</span>
              <strong className="track-pct">{Math.round(share * 100)}% · {daysLeft} d</strong>
            </div>
            <div className="track-rest"><span className="track-code">USLAX</span></div>
          </div>
          <div className="track-names muted small">
            <span>{ORIGIN.short}</span>
            <span>{DESTINATION.short}</span>
          </div>
        </div>

        <div className={`eta-box eta-${pred?.level ?? 'low'}`}>
          <span>ETA</span>
          <strong>{d(eta)}</strong>
        </div>
      </section>

      <section className="case-main">
        <div className="case-card case-map">
          <div className="case-map-body">
            <LaneMap shipments={shipments} weather={weather} preds={preds} selectedId={s.id} onSelect={onSelect} resetKey={resetKey} highlight={null} vessels={vessels} />
          </div>
        </div>

        <div className="case-side">
          <div className="stat-row">
            <div className={`stat ${slack < 0 ? 'bad' : slack < 2 ? 'warnc' : 'okc'}`}>
              <strong>{Math.abs(slack).toFixed(1)} d</strong>
              <span>{slack < 0 ? 'late' : 'spare'}</span>
            </div>
            <div className={`stat ${pred && pred.missChance >= 0.5 ? 'bad' : pred && pred.missChance >= 0.2 ? 'warnc' : 'okc'}`}>
              <strong>{pred ? `${Math.round(pred.missChance * 100)}%` : '—'}</strong>
              <span>miss chance</span>
            </div>
            <div className={`stat ${cost && cost.total > 0 ? 'bad' : ''}`}>
              <strong>{cost ? usd(cost.total) : '—'}</strong>
              <span>at stake</span>
            </div>
          </div>
          <div className="muted small case-need">Needed {d(s.needBy)} for {s.needByReason.toLowerCase()}</div>
          <RecommendationBox rec={rec} />
          <button className="btn-secondary" onClick={() => setTab('options')}>See options and costs</button>
          <div className="case-pager">
            <button className="link-btn" onClick={onBack}>← Back</button>
            <span className="pager">
              <button className="icon-btn" onClick={onPrev} aria-label="Previous shipment">‹</button>
              <span className="muted small">{position}</span>
              <button className="icon-btn" onClick={onNext} aria-label="Next shipment">›</button>
            </span>
          </div>
        </div>
      </section>

      <section className="case-card case-tabs-card">
        <div className="case-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="case-tab-body">
          {tab === 'why' && (factors.length ? (
            <div className="why-chart">
              <div className="muted small">Days each cause adds to the carrier ETA. Click a bar for the detail.</div>
              {factors.map((f) => (
                <button key={f.id} className={`why-row ${openFactor === f.id ? 'open' : ''}`} onClick={() => setOpenFactor(openFactor === f.id ? null : f.id)}>
                  <span className="why-label">{f.title} {f.source === 'live' ? <LiveTag /> : <SimTag />}</span>
                  <span className="why-track"><span className={`why-bar ${f.days < 0 ? 'neg' : ''}`} style={{ width: `${(Math.abs(f.days) / maxDays) * 100}%` }} /></span>
                  <span className={`why-val ${f.days > 0 ? 'bad' : f.days < 0 ? 'okc' : ''}`}>{signedDays(f.days)}</span>
                  {openFactor === f.id && <span className="why-detail muted small">{f.detail}</span>}
                </button>
              ))}
            </div>
          ) : <p className="muted">This container has arrived.</p>)}

          {tab === 'route' && (
            <div>
              <ol className="cp-list">
                {shownPoints.map((c) => (
                  <li key={c.name} className={c.passed ? 'passed' : ''}>
                    <span className={`dot wx-${c.sev}`} />
                    <span className="cp-name">{c.name}</span>
                    <span className="muted small">{fmt(c.wave, 1, ' m')}</span>
                    <span className="muted small">{c.passed ? 'Passed' : `~${d(c.when)}`}</span>
                  </li>
                ))}
                {!allPoints && ahead.length === 0 && <li className="muted small">All sea checkpoints passed.</li>}
              </ol>
              <div className="cp-foot">
                <span className="muted small">Wave heights <LiveTag /></span>
                <button className="link-btn small" onClick={() => setAllPoints((v) => !v)}>{allPoints ? 'Show next 3' : `Show all ${checkpoints.length}`}</button>
              </div>
            </div>
          )}

          {tab === 'timeline' && (
            <ol className="timeline timeline-h">
              {timeline.map((t) => (
                <li key={t.label} className={t.state}>
                  <span className="tl-dot" />
                  <div className="tl-label">{t.label}</div>
                  <div className="muted small">{d(t.date)}</div>
                </li>
              ))}
            </ol>
          )}

          {tab === 'sap' && (erp ? <SapCard link={erp} /> : <p className="muted">No SAP link for this container.</p>)}

          {tab === 'options' && <ActionsPanel s={s} pred={pred} signals={signals} cost={cost} hideRec />}

          {tab === 'details' && (
            <dl className="case-dl case-dl-2">
              <dt>Product</dt><dd>{s.product}</dd>
              <dt>Cargo value</dt><dd>{usd(s.cargoValueUsd)}</dd>
              <dt>PO</dt><dd className="mono">{s.po}</dd>
              <dt>Container type</dt><dd>{s.containerType}</dd>
              <dt>Vessel</dt><dd>{s.vessel} · {s.voyage}</dd>
              <dt>Carrier ETA</dt><dd>{d(s.carrierEta)}</dd>
              <dt>Departure</dt><dd>{d(s.departure)}</dd>
              <dt>Free days</dt><dd>{freeLeft != null ? (freeLeft > 0 ? `${freeLeft} of ${s.freeDays} left` : `All ${s.freeDays} used`) : s.freeDays}</dd>
              <dt>Speed</dt><dd>{s.speedKn != null ? `${s.speedKn} kn` : '—'}</dd>
              <dt>Distance left</dt><dd>{s.distanceRemainingNm.toLocaleString()} nm</dd>
            </dl>
          )}
        </div>
      </section>
    </div>
  );
}
