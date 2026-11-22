import { useState } from 'react';
import { CARRIER_STATS, ON_TIME_WINDOW_DAYS } from '../lib/carriers';
import { MONEY, PLANNING, type CarrierCard, type DelayCost, type ReorderLine } from '../lib/money';
import type { Shipment } from '../lib/sim';
import { d, daysBetween, SimTag, usd } from './ui';

export function CostBar({ c }: { c: DelayCost }) {
  if (!c.total) return null;
  const parts = [
    { k: 'fees', v: c.fees, label: 'Late fees' },
    { k: 'expedite', v: c.expedite, label: 'Expedite' },
    { k: 'lost', v: c.lostSales, label: 'Lost sales' },
  ].filter((p) => p.v > 0);
  return (
    <div className="cost-bar" role="img" aria-label={parts.map((p) => `${p.label} ${usd(p.v)}`).join(', ')}>
      {parts.map((p) => <span key={p.k} className={`cost-${p.k}`} style={{ flexGrow: p.v }} />)}
    </div>
  );
}

function costParts(c: DelayCost) {
  return [c.fees && `${usd(c.fees)} late fees`, c.expedite && `${usd(c.expedite)} ${c.expediteLabel?.toLowerCase() ?? 'expedite'}`, c.lostSales && `${usd(c.lostSales)} lost sales`]
    .filter(Boolean)
    .join(' + ');
}

export function CostCard({ c }: { c: DelayCost }) {
  return (
    <div className="cost-card">
      <div className="fee-head">
        <strong>Cost of delay</strong>
        <span className="cost-total">{usd(c.total)}</span>
      </div>
      {c.total > 0 ? (
        <>
          <CostBar c={c} />
          <div className="small">{costParts(c)}</div>
        </>
      ) : (
        <div className="small">Nothing expected: no late fees, no speed-up needed and no stock-out.</div>
      )}
      {c.declined && (
        <div className="small muted">
          {c.declined.title} ({usd(c.declined.cost)}) would cost more than the sales at stake, so Berthwise suggests warning the customer instead.
        </div>
      )}
      {c.worthIt !== null && c.doNothing > c.fees && (
        <div className="small muted">
          Doing nothing would cost about {usd(c.doNothing)} in lost sales and fees, so the speed-up {c.worthIt ? 'pays for itself' : 'costs more than it saves'}.
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<ReorderLine['status'], string> = { now: 'Order now', week: 'This week', later: 'Later' };

function ReorderRow({ x, onSelect }: { x: ReorderLine; onSelect: (id: string) => void }) {
  const shift = daysBetween(x.orderByNow, x.orderByAdvised);
  return (
    <li>
      <button className="sap-row" onClick={() => onSelect(x.shipmentId)}>
        <span className="row-top sap-title-row">
          <span className="row-title">{x.description}</span>
          <span className={`chip reorder-${x.status}`}>{STATUS_LABEL[x.status]}</span>
        </span>
        <span className="small muted">
          {x.material} · {x.plant.code} {x.plant.name} · ships with {x.carrier}
        </span>
        <span className="small">
          Order {x.orderQty.toLocaleString()} EA by <strong>{d(x.orderByAdvised)}</strong>
          {shift !== 0 && <span className="muted"> · current settings say {d(x.orderByNow)}, {Math.abs(shift)} d {shift < 0 ? 'too late' : 'earlier than needed'}</span>}
        </span>
        <span className="reorder-grid small">
          <span className="muted">Planned delivery time</span>
          <span>{x.plannedLt} d → <strong>{x.advisedLt} d</strong></span>
          <span className="muted">Safety stock</span>
          <span>
            {x.ssNow.toLocaleString()} → <strong>{x.ssAdvised.toLocaleString()} EA</strong> ({x.ssDaysNow} → {x.ssDaysAdvised} days)
            {x.cashChange !== 0 && <span className={x.cashChange < 0 ? 'ok-text' : 'muted'}> · {x.cashChange < 0 ? `frees ${usd(-x.cashChange)}` : `ties up ${usd(x.cashChange)}`}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

export function PlanView({
  shipments,
  costs,
  reorder,
  carriers,
  onSelect,
}: {
  shipments: Shipment[];
  costs: Map<string, DelayCost>;
  reorder: ReorderLine[];
  carriers: CarrierCard[];
  onSelect: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const byId = new Map(shipments.map((s) => [s.id, s]));
  const costly = [...costs.values()].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const total = costly.reduce((s, c) => s + c.total, 0);
  const lost = costly.reduce((s, c) => s + c.lostSales, 0);
  const due = reorder.filter((x) => x.status !== 'later');
  const changed = reorder.filter((x) => x.advisedLt !== x.plannedLt || x.ssAdvised !== x.ssNow);
  const cash = reorder.reduce((s, x) => s + x.cashChange, 0);
  const shown = showAll ? reorder : reorder.filter((x) => x.status !== 'later' || x.ssDaysAdvised > x.ssDaysNow).slice(0, 8);
  const best = carriers[0];

  return (
    <div className="brief plan">
      <div className="brief-head">
        <h2>Money and planning</h2>
        <div className="muted small">
          What the delays cost, when to reorder, and which carriers keep their dates. <SimTag />
        </div>
      </div>

      <div className="sap-kpis">
        <div className="acc-card">
          <div className="muted small">Cost of delay</div>
          <div className="acc-big">{usd(total)}</div>
          <div className="small">{costly.length} shipment{costly.length === 1 ? '' : 's'}</div>
        </div>
        <div className={`acc-card ${due.length ? 'warn' : ''}`}>
          <div className="muted small">Reorders due</div>
          <div className="acc-big">{due.length}</div>
          <div className="small">in the next 7 days</div>
        </div>
        <div className="acc-card">
          <div className="muted small">Safety stock change</div>
          <div className="acc-big">{cash <= 0 ? '−' : '+'}{usd(Math.abs(cash))}</div>
          <div className="small">{changed.length} of {reorder.length} lines to update</div>
        </div>
      </div>

      <h3 className="section-title">Cost of delay by shipment <SimTag /></h3>
      {costly.length ? (
        <ul className="sap-list">
          {costly.map((c) => {
            const s = byId.get(c.shipmentId)!;
            return (
              <li key={c.shipmentId}>
                <button className="sap-row" onClick={() => onSelect(c.shipmentId)}>
                  <span className="row-top sap-title-row">
                    <span className="row-title">{s.product}</span>
                    <strong>{usd(c.total)}</strong>
                  </span>
                  <CostBar c={c} />
                  <span className="small muted">{costParts(c)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small muted">No shipment is costing money right now.</p>
      )}
      {lost > 0 && <p className="small muted">{usd(lost)} of it is sales lost while a plant has no stock.</p>}

      <h3 className="section-title sap-title-row">
        <span>Reorder advice <SimTag /></span>
        <span className="seg" aria-label="Which lines">
          <button className={`seg-btn ${!showAll ? 'active' : ''}`} onClick={() => setShowAll(false)}>Needs attention</button>
          <button className={`seg-btn ${showAll ? 'active' : ''}`} onClick={() => setShowAll(true)}>All {reorder.length}</button>
        </span>
      </h3>
      <ul className="sap-list">
        {shown.map((x) => <ReorderRow key={`${x.material}-${x.plant.code}`} x={x} onSelect={onSelect} />)}
      </ul>
      <p className="small muted">
        In SAP, these are the MRP 2 view fields in MM02: planned delivery time and safety stock, per material and plant.
      </p>

      <h3 className="section-title">Carrier scorecard <SimTag /></h3>
      <table className="acc-table sap-table">
        <thead>
          <tr><th>#</th><th>Carrier</th><th>On time</th><th>Avg late</th><th>Spread</th><th>Now</th></tr>
        </thead>
        <tbody>
          {carriers.map((c) => (
            <tr key={c.carrier} className={c.rank === 1 ? 'best-row' : ''}>
              <td>{c.rank}</td>
              <td>{c.carrier}</td>
              <td>
                <div className="ontime"><span style={{ width: `${c.onTimePct}%` }} /></div>
                <strong>{c.onTimePct}%</strong>
              </td>
              <td>{c.avgLateDays > 0 ? '+' : ''}{c.avgLateDays.toFixed(1)} d</td>
              <td>±{c.spreadDays.toFixed(1)} d</td>
              <td className="small">{c.active ? `${c.active} open${c.lateNow ? `, ${c.lateNow} late` : ''}` : '—'}{c.costNow > 0 && <div className="muted">{usd(c.costNow)}</div>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {best && (
        <p className="small">
          <strong>{best.carrier}</strong> keeps its dates most often on this lane ({best.onTimePct}% on time, 1 in 10 voyages more than {CARRIER_STATS[best.carrier].p90LateDays} d late).
          Book launch-critical cargo with it.
        </p>
      )}

      <p className="muted small method">
        Cost of delay adds storage fees so far, the recommended speed-up when it makes the needed-by date, and {Math.round(MONEY.lostShare * 100)}% of the sales a plant
        can’t fill while it’s out of stock. Reorder advice uses the lane’s voyage log: planned delivery time = {PLANNING.productionDays} d production + {PLANNING.originDays} d to
        the port + sailing + plant lead time, plus the carrier’s average delay. Safety stock = {PLANNING.z} × √(lead time × demand swing² + arrival spread²) days of demand, for
        a {Math.round(PLANNING.serviceLevel * 100)}% service level. Order by = the day stock after the inbound container runs out, minus lead time and safety stock. On time means
        arriving no more than {ON_TIME_WINDOW_DAYS} day after the booking ETA, across 36 logged voyages per carrier. Voyages, demand, prices and lead times are simulated.
      </p>
    </div>
  );
}
