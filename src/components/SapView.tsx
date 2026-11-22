import { useState } from 'react';
import { erpTotals, type ErpLink, type SalesOrder, type StockLine } from '../lib/erp';
import { IMPORTER } from '../lib/sim';
import { d, daysFromToday, SimTag, usd } from './ui';

const n = (x: number) => x.toLocaleString('en-US');
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

export function StockChip({ x }: { x: StockLine }) {
  if (x.status === 'short') return <span className="risk risk-high">{x.gapDays} d short</span>;
  if (x.status === 'tight') return <span className="risk risk-medium">Tight</span>;
  return <span className="risk risk-low">Covered</span>;
}

export function OrderChip({ o }: { o: SalesOrder }) {
  if (o.status === 'at_risk') return <span className="risk risk-high">Slips {o.slipDays} d</span>;
  if (o.status === 'inbound') return <span className="risk risk-low">From this container</span>;
  return <span className="risk risk-arrived">From stock</span>;
}

/** Days of stock left (bar) against the day this container's goods reach the plant (marker). */
export function CoverBar({ x }: { x: StockLine }) {
  const out = x.coverDays;
  const avail = Math.max(0, daysFromToday(x.availableAt));
  const scale = Math.max(out, avail, 7) * 1.08;
  const pct = (v: number) => `${(v / scale) * 100}%`;
  return (
    <div className="cover" aria-label={`${out} days of stock left, container's goods at the plant in ${avail} days`}>
      <div className="cover-track">
        <div className={`cover-stock ${x.onHand < x.safetyStock ? 'low' : ''}`} style={{ width: pct(out) }} />
        {x.gapDays > 0 && <div className="cover-gap" style={{ left: pct(out), width: pct(avail - out) }} />}
        <div className={`cover-ship ${x.status}`} style={{ left: pct(avail) }} title={`Goods at ${x.plant.code} ${d(x.availableAt)}`} />
      </div>
      <div className="cover-labels small muted">
        <span>{out > 0 ? `Stock runs out ${d(x.runOut)}` : `Out of stock since ${d(x.runOut)}`}</span>
        <span>Container at plant {d(x.availableAt)}</span>
      </div>
    </div>
  );
}

function StockRow({ x, onSelect }: { x: StockLine; onSelect: (id: string) => void }) {
  return (
    <li>
      <button className="sap-row" onClick={() => onSelect(x.shipmentId)}>
        <span className="row-top">
          <span className="row-title">{x.description}</span>
          <StockChip x={x} />
        </span>
        <span className="row-sub">
          <span className="mono">{x.material}</span> · {x.plant.code} {x.plant.name} · {n(x.onHand)} EA on hand, {plural(x.coverDays, 'day')} of cover
        </span>
        <CoverBar x={x} />
      </button>
    </li>
  );
}

export function OrderRow({ o, onSelect }: { o: SalesOrder; onSelect?: (id: string) => void }) {
  const body = (
    <>
      <span className="row-top">
        <span className="row-title">{o.customer.name}</span>
        <OrderChip o={o} />
      </span>
      <span className="row-sub">
        <span className="mono">SO {o.so}</span> · {n(o.qty)} EA {o.description.toLowerCase()} · from {o.plant.code} · requested {d(o.requested)} · {usd(o.valueUsd)}
      </span>
    </>
  );
  return <li>{onSelect ? <button className="sap-row" onClick={() => onSelect(o.shipmentId)}>{body}</button> : <div className="sap-row static">{body}</div>}</li>;
}

/** The SAP view tab: stock by material and plant, customer orders at risk, and the PO → container link. */
export function SapView({ links, onSelect }: { links: Map<string, ErpLink>; onSelect: (id: string) => void }) {
  const t = erpTotals(links);
  const [showAll, setShowAll] = useState(false);
  const order = { short: 0, tight: 1, ok: 2 } as const;
  const stock = [...t.stock].sort((a, b) => order[a.status] - order[b.status] || b.gapDays - a.gapDays || a.coverDays - b.coverDays);
  const shown = showAll ? stock : stock.filter((x) => x.status !== 'ok');
  const all = [...links.values()];

  return (
    <div className="brief sap">
      <div className="brief-head">
        <h2>SAP view</h2>
        <div className="muted small">
          Purchase orders, stock and sales orders for {IMPORTER.name}, laid out as in SAP S/4HANA. <SimTag />
        </div>
      </div>

      <div className="sap-kpis">
        <div className="acc-card">
          <div className="muted small">Materials short</div>
          <div className="acc-big">{t.short.length}</div>
          <div className="small">of {t.stock.length} material–plant lines</div>
        </div>
        <div className="acc-card">
          <div className="muted small">Sales orders at risk</div>
          <div className="acc-big">{t.atRisk.length}</div>
          <div className="small">{usd(t.atRiskValue)} in revenue</div>
        </div>
        <div className="acc-card">
          <div className="muted small">Below safety stock</div>
          <div className="acc-big">{t.belowSafety.length}</div>
          <div className="small">under {5} days of cover</div>
        </div>
      </div>

      <h3 className="section-title">Customer orders at risk <SimTag /></h3>
      {t.atRisk.length ? (
        <ul className="sap-list">
          {t.atRisk.map((o) => <OrderRow key={o.so} o={o} onSelect={onSelect} />)}
        </ul>
      ) : (
        <p className="small muted">No open sales order depends on a late container.</p>
      )}

      <h3 className="section-title sap-title-row">
        <span>Stock vs inbound <SimTag /></span>
        <span className="seg" role="group" aria-label="Which materials">
          <button className={`seg-btn ${!showAll ? 'active' : ''}`} onClick={() => setShowAll(false)}>Needs attention</button>
          <button className={`seg-btn ${showAll ? 'active' : ''}`} onClick={() => setShowAll(true)}>All {t.stock.length}</button>
        </span>
      </h3>
      {shown.length ? (
        <ul className="sap-list">
          {shown.map((x) => <StockRow key={`${x.material}-${x.plant.code}`} x={x} onSelect={onSelect} />)}
        </ul>
      ) : (
        <p className="small muted">Every material has stock until its container’s goods reach the plant.</p>
      )}

      <details className="custom sap-po">
        <summary>Purchase order ↔ container link ({all.reduce((k, l) => k + l.items.length, 0)} PO items)</summary>
        <table className="acc-table sap-table">
          <thead>
            <tr><th>PO / item</th><th>Material</th><th>Qty</th><th>Plant</th><th>Inbound delivery</th></tr>
          </thead>
          <tbody>
            {all.flatMap((l) =>
              l.items.map((it) => (
                <tr key={`${it.po}-${it.item}`} onClick={() => onSelect(l.shipmentId)} className="clickable">
                  <td className="mono">{it.po}/{Number(it.item)}</td>
                  <td><span className="mono">{it.material}</span></td>
                  <td>{n(it.qty)}</td>
                  <td>{it.plant.code}</td>
                  <td className="mono">{l.inboundDelivery ?? <span className="muted">Not yet</span>}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </details>

      <p className="muted small method">
        Stock runs out when on-hand stock divided by daily demand reaches zero. Goods reach the plant {PLANTS_NOTE}. A sales order is at risk when it needs stock after the
        run-out date and before the container’s goods arrive. Plants, materials, stock, demand and orders are simulated.
      </p>
    </div>
  );
}

const PLANTS_NOTE = '2 days after the container leaves the LA terminal for US10 Ontario, and 5 days for US20 Dallas';

/** The SAP section of a shipment's detail page. */
export function SapCard({ link }: { link: ErpLink }) {
  const risky = link.orders.filter((o) => o.status === 'at_risk');
  return (
    <>
      <h3 className="section-title">In SAP <SimTag /></h3>
      <div className="card sap-card">
        <dl className="facts sap-facts">
          <dt>PO</dt>
          <dd className="mono">{link.items[0].po}</dd>
          <dt>Material</dt>
          <dd><span className="mono">{link.material}</span> {link.items[0].description}</dd>
          <dt>Inbound</dt>
          <dd>{link.inboundDelivery ? <span className="mono">{link.inboundDelivery}</span> : <span className="muted">Created when the supplier ships</span>}</dd>
        </dl>
        <table className="acc-table sap-table">
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Plant</th><th>On hand</th><th>Stock</th></tr>
          </thead>
          <tbody>
            {link.stock.map((x, i) => (
              <tr key={x.plant.code}>
                <td className="mono">{Number(link.items[i].item)}</td>
                <td>{n(link.items[i].qty)}</td>
                <td title={x.plant.leadNote}>{x.plant.code} {x.plant.name.split(',')[0]}</td>
                <td>{n(x.onHand)}</td>
                <td><StockChip x={x} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {link.stock.map((x) => (
          <div key={x.plant.code}>
            <div className="small"><strong>{x.plant.code}</strong> · {x.plant.leadNote} ({x.plant.leadDays} days)</div>
            <CoverBar x={x} />
          </div>
        ))}
      </div>
      {link.orders.length > 0 && (
        <>
          <h3 className="section-title">
            Sales orders this container serves {risky.length > 0 && <span className="risk risk-high">{risky.length} at risk</span>}
          </h3>
          <ul className="sap-list">
            {link.orders.map((o) => <OrderRow key={o.so} o={o} />)}
          </ul>
        </>
      )}
    </>
  );
}
