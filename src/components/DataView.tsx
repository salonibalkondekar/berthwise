import { useMemo, useRef, useState } from 'react';
import { downloadFile, isoDate, parseCsv, toCsv } from '../lib/csv';
import { buildDigest, toEml } from '../lib/digest';
import { erpTotals, type ErpLink } from '../lib/erp';
import { importShipments, OPTIONAL, REQUIRED, templateCsv } from '../lib/importer';
import type { CarrierCard, DelayCost, ReorderLine } from '../lib/money';
import { RISK_LABEL, rankByRisk, topReason, type Prediction } from '../lib/predict';
import { IMPORTER, STAGE_LABEL, type Shipment } from '../lib/sim';
import type { Signals } from '../lib/signals';
import { SimTag } from './ui';

interface Props {
  shipments: Shipment[];
  demo: Shipment[];
  imported: boolean;
  preds: Map<string, Prediction>;
  erp: Map<string, ErpLink>;
  costs: Map<string, DelayCost>;
  reorder: ReorderLine[];
  carriers: CarrierCard[];
  signals: Signals | null;
  onImport: (csv: string, shipments: Shipment[]) => void;
  onReset: () => void;
}

const stamp = () => isoDate(new Date());
const r1 = (x: number) => Math.round(x * 10) / 10;

export function DataView({ shipments, demo, imported, preds, erp, costs, reorder, carriers, signals, onImport, onReset }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [to, setTo] = useState(() => localStorage.getItem('bw-digest-to') ?? '');
  const [showHtml, setShowHtml] = useState(false);
  const [copied, setCopied] = useState(false);

  const digest = useMemo(
    () => buildDigest({ shipments, preds, erp, costs, reorder, signals, importer: imported ? 'your shipments' : IMPORTER.name, appUrl: location.origin, imported }),
    [shipments, preds, erp, costs, reorder, signals, imported],
  );

  const readFile = async (f: File) => {
    const text = await f.text();
    const res = importShipments(parseCsv(text));
    setErrors(res.errors);
    if (res.shipments.length) {
      onImport(text, res.shipments);
      setNotice(`Loaded ${res.shipments.length} shipment${res.shipments.length === 1 ? '' : 's'} from ${f.name}${res.errors.length ? `; skipped ${res.errors.length} row${res.errors.length === 1 ? '' : 's'}` : ''}.`);
    } else setNotice(null);
  };

  const exportRisk = () =>
    downloadFile(`berthwise-risk-list-${stamp()}.csv`, toCsv(rankByRisk(shipments, preds).concat(shipments.filter((s) => preds.get(s.id)?.level === 'arrived')), [
      ['container', (s) => s.container],
      ['po', (s) => s.po],
      ['product', (s) => s.product],
      ['carrier', (s) => s.carrier],
      ['vessel', (s) => s.vessel],
      ['stage', (s) => STAGE_LABEL[s.stage]],
      ['carrier_eta', (s) => s.carrierEta],
      ['berthwise_eta', (s) => preds.get(s.id)?.predictedArrival],
      ['delay_vs_carrier_days', (s) => r1(preds.get(s.id)?.delayDays ?? 0)],
      ['needed_by', (s) => s.needBy],
      ['miss_chance_pct', (s) => Math.round((preds.get(s.id)?.missChance ?? 0) * 100)],
      ['risk', (s) => RISK_LABEL[preds.get(s.id)?.level ?? 'low']],
      ['main_reason', (s) => { const p = preds.get(s.id); return p ? topReason(p)?.title ?? '' : ''; }],
      ['cost_of_delay_usd', (s) => costs.get(s.id)?.total ?? 0],
      ['data', (s) => (s.simulated ? 'simulated' : 'imported')],
    ]));

  const exportCosts = () =>
    downloadFile(`berthwise-cost-of-delay-${stamp()}.csv`, toCsv(shipments.filter((s) => costs.get(s.id)), [
      ['container', (s) => s.container],
      ['po', (s) => s.po],
      ['product', (s) => s.product],
      ['late_fees_usd', (s) => costs.get(s.id)!.fees],
      ['expedite_usd', (s) => costs.get(s.id)!.expedite],
      ['expedite_action', (s) => costs.get(s.id)!.expediteLabel ?? ''],
      ['lost_sales_usd', (s) => costs.get(s.id)!.lostSales],
      ['total_usd', (s) => costs.get(s.id)!.total],
      ['data', () => 'simulated fees, prices and demand'],
    ]));

  const exportReorder = () =>
    downloadFile(`berthwise-mm02-reorder-${stamp()}.csv`, toCsv(reorder, [
      ['MATNR', (x) => x.material],
      ['WERKS', (x) => x.plant.code],
      ['description', (x) => x.description],
      ['PLIFZ_current', (x) => x.plannedLt],
      ['PLIFZ_advised', (x) => x.advisedLt],
      ['EISBE_current', (x) => x.ssNow],
      ['EISBE_advised', (x) => x.ssAdvised],
      ['order_qty', (x) => x.orderQty],
      ['order_by', (x) => x.orderByAdvised],
      ['carrier', (x) => x.carrier],
      ['data', () => 'simulated'],
    ]));

  const exportOrders = () =>
    downloadFile(`berthwise-sales-orders-at-risk-${stamp()}.csv`, toCsv(erpTotals(erp).atRisk, [
      ['VBELN', (o) => o.so],
      ['POSNR', (o) => o.item],
      ['customer', (o) => o.customer.name],
      ['MATNR', (o) => o.material],
      ['WERKS', (o) => o.plant.code],
      ['qty', (o) => o.qty],
      ['requested', (o) => o.requested],
      ['slip_days', (o) => o.slipDays],
      ['value_usd', (o) => o.valueUsd],
      ['container', (o) => shipments.find((s) => s.id === o.shipmentId)?.container ?? ''],
      ['data', () => 'simulated'],
    ]));

  const exportCarriers = () =>
    downloadFile(`berthwise-carrier-scorecard-${stamp()}.csv`, toCsv(carriers, [
      ['rank', (c) => c.rank],
      ['carrier', (c) => c.carrier],
      ['on_time_pct', (c) => c.onTimePct],
      ['avg_late_days', (c) => c.avgLateDays],
      ['spread_days', (c) => c.spreadDays],
      ['p90_late_days', (c) => c.p90LateDays],
      ['voyages', (c) => c.voyages],
      ['open_shipments', (c) => c.active],
      ['data', () => 'simulated voyage log'],
    ]));

  const saveTo = (v: string) => { setTo(v); localStorage.setItem('bw-digest-to', v); };
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(digest.subject)}&body=${encodeURIComponent(digest.text)}`;
  const copy = async () => { await navigator.clipboard.writeText(digest.text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="brief data">
      <div className="brief-head">
        <h2>Import, export and digest</h2>
        <div className="muted small">Load your own shipments, take results into SAP or Excel, and send the morning list by email.</div>
      </div>

      <h3 className="section-title">Import shipments</h3>
      <div className={`import-box ${imported ? 'on' : ''}`}>
        <div className="small">
          {imported ? (
            <><strong>Using your file: {shipments.length} shipments.</strong> Estimates use live weather and port data; the SAP, fee and carrier-history figures around them stay simulated <SimTag />.</>
          ) : (
            <>Showing {demo.length} simulated demo shipments <SimTag />. Load a CSV to use your own containers on the Shanghai → Los Angeles lane.</>
          )}
        </div>
        <div className="btn-row">
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
          <button className="btn primary" onClick={() => fileRef.current?.click()}>Choose CSV file</button>
          <button className="btn" onClick={() => downloadFile('berthwise-import-template.csv', templateCsv(demo))}>Download template</button>
          {imported && <button className="btn" onClick={() => { onReset(); setNotice('Back to the simulated demo shipments.'); setErrors([]); }}>Use demo data</button>}
        </div>
        {notice && <div className="small ok-text">{notice}</div>}
        {errors.length > 0 && (
          <ul className="import-errors small">
            {errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
            {errors.length > 6 && <li>…and {errors.length - 6} more.</li>}
          </ul>
        )}
        <div className="small muted">
          Required columns: {REQUIRED.join(', ')}. Optional: {OPTIONAL.join(', ')}. Dates as YYYY-MM-DD. The template holds today's demo shipments, so you can edit it in Excel and load it back.
        </div>
      </div>

      <h3 className="section-title">Export</h3>
      <div className="export-grid">
        <button className="export-card" onClick={exportRisk}><strong>Risk list</strong><span className="small muted">Every container with Berthwise ETA, miss risk, reason and cost</span></button>
        <button className="export-card" onClick={exportOrders}><strong>Sales orders at risk</strong><span className="small muted">VBELN, POSNR, MATNR, WERKS, slip days <SimTag /></span></button>
        <button className="export-card" onClick={exportReorder}><strong>MM02 reorder upload</strong><span className="small muted">MATNR, WERKS, PLIFZ, EISBE current vs advised <SimTag /></span></button>
        <button className="export-card" onClick={exportCosts}><strong>Cost of delay</strong><span className="small muted">Fees, expedite and lost sales per container <SimTag /></span></button>
        <button className="export-card" onClick={exportCarriers}><strong>Carrier scorecard</strong><span className="small muted">On-time %, delay and spread per carrier <SimTag /></span></button>
      </div>
      <p className="small muted">CSV files open in Excel, and the SAP field names match LSMW or Migration Cockpit templates.</p>

      <h3 className="section-title">Daily email digest</h3>
      <div className="digest">
        <label className="small digest-to">
          Send to
          <input type="email" placeholder="you@company.com" value={to} onChange={(e) => saveTo(e.target.value)} />
        </label>
        <div className="digest-subject small"><span className="muted">Subject</span> {digest.subject}</div>
        <div className="seg" aria-label="Preview">
          <button className={`seg-btn ${!showHtml ? 'active' : ''}`} onClick={() => setShowHtml(false)}>Email</button>
          <button className={`seg-btn ${showHtml ? 'active' : ''}`} onClick={() => setShowHtml(true)}>Plain text</button>
        </div>
        {showHtml ? <pre className="digest-text">{digest.text}</pre> : <iframe className="digest-frame" title="Digest preview" srcDoc={digest.html} sandbox="" />}
        <div className="btn-row">
          <a className="btn primary" href={mailto}>Open in my email app</a>
          <button className="btn" onClick={() => downloadFile(`berthwise-digest-${stamp()}.eml`, toEml(digest, to), 'message/rfc822')}>Download .eml</button>
          <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy text'}</button>
        </div>
        <p className="small muted">
          The digest is rebuilt from the live risk list every time you open this page. Opening it in your email app or the .eml file (Outlook, Apple Mail) gives a ready-to-send message.
          Automatic 7 am sending needs an email provider account, which this demo doesn't have yet.
        </p>
      </div>
    </div>
  );
}
