import { RISK_LABEL, topReason, type Prediction } from '../lib/predict';
import { IMPORTER, STAGE_LABEL, type Shipment } from '../lib/sim';
import { lateFee, recommend, rerouteOptions, type Recommendation } from '../lib/actions';
import type { Signals } from '../lib/signals';
import { erpTotals, type ErpLink } from '../lib/erp';
import { OrderRow } from './SapView';
import { d, LiveTag, SimTag, usd } from './ui';

const todayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export const pct = (p: number) => `${Math.round(Math.min(0.99, Math.max(0.01, p)) * 100)}%`;
export const signedDays = (n: number) => (Math.abs(n) < 0.1 ? 'on time' : `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} d`);

export function RiskChip({ p }: { p: Prediction }) {
  return <span className={`risk risk-${p.level}`}>{RISK_LABEL[p.level]}</span>;
}

interface Props {
  all: Shipment[];
  signals: Signals | null;
  ranked: Shipment[];
  preds: Map<string, Prediction>;
  erp: Map<string, ErpLink> | null;
  loading: boolean;
  liveMissing: boolean;
  onSelect: (id: string) => void;
}

export function RiskBrief({ erp, ranked, all, signals, preds, loading, liveMissing, onSelect }: Props) {
  if (loading) {
    return (
      <div className="brief">
        {[90, 70, 70, 70, 70].map((h, i) => (
          <div key={i} className="skeleton" style={{ height: h }} />
        ))}
      </div>
    );
  }
  const stockouts = ranked.filter((s) => preds.get(s.id)!.level === 'high');
  const atRisk = ranked.filter((s) => preds.get(s.id)!.level === 'medium');
  const todo = todoList(all, preds, signals);
  const orders = erp ? erpTotals(erp) : null;

  return (
    <div className="brief">
      <div className="brief-head">
        <div>
          <h2>Good morning</h2>
          <div className="muted small">{todayFmt.format(new Date())} · {IMPORTER.name} <SimTag /></div>
        </div>
      </div>
      <p className="brief-summary">
        {stockouts.length === 0 && atRisk.length === 0
          ? 'All containers on the water look on track for their needed-by dates.'
          : [
              stockouts.length && `${stockouts.length} container${stockouts.length === 1 ? ' is' : 's are'} likely to miss ${stockouts.length === 1 ? 'its' : 'their'} needed-by date`,
              atRisk.length && `${atRisk.length} ${stockouts.length ? 'more' : `container${atRisk.length === 1 ? '' : 's'}`} ${atRisk.length === 1 ? 'is' : 'are'} at risk`,
            ]
              .filter(Boolean)
              .join(' and ') + '. The rest look on track.'}
      </p>
      {liveMissing && <div className="error-box">Live weather and port data didn’t load, so these estimates leave them out.</div>}

      {todo.length > 0 && (
        <>
          <h3 className="section-title">Do today <SimTag /></h3>
          <ol className="todo">
            {todo.map(({ s, rec }) => (
              <li key={s.id}>
                <button className={`todo-row rec-${rec.kind}`} onClick={() => onSelect(s.id)}>
                  <span className="todo-head">{rec.headline}</span>
                  <span className="small muted">{s.product} · {rec.detail}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {stockouts.length > 0 && (
        <>
          <h3 className="section-title">Stock-out alerts</h3>
          {stockouts.map((s) => {
            const p = preds.get(s.id)!;
            const short = Math.round(-p.slackDays);
            return (
              <button key={s.id} className="alert" onClick={() => onSelect(s.id)}>
                <div className="alert-icon" aria-hidden>!</div>
                <div>
                  <div className="alert-title">
                    {s.needByReason.startsWith('Restock')
                      ? `${s.product} may run out before the restock lands`
                      : `${s.product}: ${s.needByReason} at risk`}
                  </div>
                  <div className="small">
                    Needed by <strong>{d(s.needBy)}</strong>, now expected <strong>{d(p.predictedArrival)}</strong>
                    {p.slackDays > -0.5 ? ', right at the deadline' : `, about ${short} day${short === 1 ? '' : 's'} late`}. {s.units.toLocaleString()} units, {usd(s.cargoValueUsd)}.
                  </div>
                  <div className="muted small">{pct(p.missChance)} chance of arriving after the needed-by date</div>
                </div>
              </button>
            );
          })}
        </>
      )}

      {orders && orders.atRisk.length > 0 && (
        <>
          <h3 className="section-title">
            Customer orders at risk <SimTag /> <span className="muted small">{usd(orders.atRiskValue)}</span>
          </h3>
          <ul className="sap-list">
            {orders.atRisk.slice(0, 4).map((o) => <OrderRow key={o.so} o={o} onSelect={onSelect} />)}
          </ul>
          {orders.atRisk.length > 4 && <p className="small muted">{orders.atRisk.length - 4} more in the SAP tab.</p>}
        </>
      )}

      <h3 className="section-title">
        Today’s risk list <span className="muted small">highest risk first</span>
      </h3>
      <ol className="risk-list">
        {ranked.map((s, i) => {
          const p = preds.get(s.id)!;
          const why = topReason(p);
          return (
            <li key={s.id}>
              <button className="risk-row" onClick={() => onSelect(s.id)}>
                <span className="rank">{i + 1}</span>
                <span className="risk-main">
                  <span className="row-top">
                    <span className="row-title">{s.product}</span>
                    <RiskChip p={p} />
                  </span>
                  <span className="row-sub">
                    {STAGE_LABEL[s.stage]} · expected {d(p.predictedArrival)}
                    {Math.abs(p.delayDays) >= 0.1 && ` (${signedDays(p.delayDays)} vs carrier)`} · needed {d(s.needBy)}
                  </span>
                  {why && (
                    <span className="why small">
                      {why.title} {why.source === 'live' ? <LiveTag /> : <SimTag />}
                    </span>
                  )}
                </span>
                <span className="miss">
                  <strong>{pct(p.missChance)}</strong>
                  <span className="muted small">miss risk</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="muted small method">
        Estimates come from a simple, explainable model: carrier ETA, adjusted for the live sea forecast along each ship’s path and live port traffic, plus simulated
        ship speed and carrier history. Recommended actions use simulated fees and freight rates.
      </p>
    </div>
  );
}

const ORDER: Record<Recommendation['kind'], number> = { pickup: 0, reroute: 1, notify: 2, none: 3 };

function todoList(all: Shipment[], preds: Map<string, Prediction>, signals: Signals | null) {
  return all
    .map((s) => {
      const p = preds.get(s.id) ?? null;
      const fee = lateFee(s, p);
      const opts = p && p.level !== 'arrived' ? rerouteOptions(s, p, signals) : [];
      return { s, p, rec: recommend(s, p, opts, fee) };
    })
    .filter((x) => x.rec.kind !== 'none')
    .sort((a, b) => ORDER[a.rec.kind] - ORDER[b.rec.kind] || (b.p?.missChance ?? 0) - (a.p?.missChance ?? 0));
}
