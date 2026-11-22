import { recommend, lateFee, rerouteOptions, usd } from './actions';
import { erpTotals, type ErpLink } from './erp';
import type { DelayCost, ReorderLine } from './money';
import { RISK_LABEL, rankByRisk, topReason, type Prediction } from './predict';
import type { Shipment } from './sim';
import type { Signals } from './signals';

const dfmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Digest {
  subject: string;
  text: string;
  html: string;
}

export function buildDigest(opts: {
  shipments: Shipment[];
  preds: Map<string, Prediction>;
  erp: Map<string, ErpLink>;
  costs: Map<string, DelayCost>;
  reorder: ReorderLine[];
  signals: Signals | null;
  importer: string;
  appUrl: string;
  imported: boolean;
  now?: Date;
}): Digest {
  const { shipments, preds, erp, costs, reorder, signals, importer, appUrl, imported, now = new Date() } = opts;
  const ranked = rankByRisk(shipments, preds);
  const late = ranked.filter((s) => preds.get(s.id)?.level === 'high');
  const risk = ranked.filter((s) => preds.get(s.id)?.level === 'medium');
  const todo = shipments
    .map((s) => {
      const p = preds.get(s.id) ?? null;
      const fee = lateFee(s, p, now);
      const o = p && p.level !== 'arrived' ? rerouteOptions(s, p, signals, now) : [];
      const c = costs.get(s.id);
      return { s, rec: recommend(s, p, o, fee, c ? c.doNothing - c.fees : 0) };
    })
    .filter((x) => x.rec.kind !== 'none');
  const totals = erpTotals(erp);
  const costList = [...costs.values()].filter((c) => c.total > 0);
  const costTotal = costList.reduce((a, c) => a + c.total, 0);
  const due = reorder.filter((x) => x.status !== 'later');
  const label = imported ? 'Shipments from your file; SAP, fees and history simulated.' : 'Demo data: shipments, SAP data, fees and carrier history are simulated.';
  const subject = `Berthwise · ${dfmt.format(now)}: ${late.length} likely late, ${risk.length} at risk${costTotal ? `, ${usd(costTotal)} delay cost` : ''}`;

  const top = ranked.slice(0, 5).map((s) => {
    const p = preds.get(s.id)!;
    return { s, p, why: topReason(p)?.title ?? '—' };
  });

  const text = [
    `Good morning. Berthwise risk list for ${importer}, ${longFmt.format(now)}.`,
    '',
    `${late.length} likely late · ${risk.length} at risk · ${totals.atRisk.length} sales orders at risk (${usd(totals.atRiskValue)}) · cost of delay ${usd(costTotal)} · ${due.length} reorders due this week`,
    '',
    'DO TODAY',
    ...(todo.length ? todo.map((x) => `- ${x.rec.headline} (${x.s.product}, ${x.s.container}): ${x.rec.detail}`) : ['- Nothing needs action today.']),
    '',
    'TOP RISKS',
    ...top.map((x, i) => `${i + 1}. ${x.s.product} (${x.s.container}) · ${RISK_LABEL[x.p.level]} · ${Math.round(x.p.missChance * 100)}% miss risk · expected ${dfmt.format(x.p.predictedArrival)}, needed ${dfmt.format(x.s.needBy)} · ${x.why}`),
    ...(due.length ? ['', 'REORDERS DUE THIS WEEK', ...due.map((x) => `- ${x.material} ${x.description} at ${x.plant.code}: order ${x.orderQty} EA by ${dfmt.format(x.orderByAdvised)}`)] : []),
    '',
    `Open Berthwise: ${appUrl}`,
    label,
  ].join('\n');

  const row = (cells: string[], head = false) =>
    `<tr>${cells.map((c) => `<${head ? 'th' : 'td'} style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:13px">${c}</${head ? 'th' : 'td'}>`).join('')}</tr>`;
  const kpi = (v: string, l: string) =>
    `<td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px"><div style="font-size:20px;font-weight:700">${v}</div><div style="font-size:12px;color:#6b7280">${l}</div></td>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#13201f">
<div style="max-width:640px;margin:0 auto;padding:24px;background:#fff">
<div style="font-size:13px;color:#0f766e;font-weight:600">Berthwise · morning risk list</div>
<h1 style="font-size:22px;margin:4px 0 2px">Good morning</h1>
<div style="font-size:13px;color:#6b7280;margin-bottom:14px">${esc(importer)} · ${longFmt.format(now)}</div>
<table style="border-collapse:separate;border-spacing:6px;margin:0 -6px 10px"><tr>${kpi(String(late.length), 'likely late')}${kpi(String(risk.length), 'at risk')}${kpi(usd(totals.atRiskValue), `${totals.atRisk.length} sales orders at risk`)}${kpi(usd(costTotal), 'cost of delay')}</tr></table>
<h2 style="font-size:15px;margin:16px 0 6px">Do today</h2>
${todo.length ? `<ol style="padding-left:18px;margin:0">${todo.map((x) => `<li style="margin-bottom:6px;font-size:13px"><strong>${esc(x.rec.headline)}</strong> · ${esc(x.s.product)}<br><span style="color:#4b5563">${esc(x.rec.detail)}</span></li>`).join('')}</ol>` : '<p style="font-size:13px">Nothing needs action today.</p>'}
<h2 style="font-size:15px;margin:16px 0 6px">Top risks</h2>
<table style="width:100%;border-collapse:collapse">${row(['Shipment', 'Risk', 'Expected', 'Needed', 'Main reason'], true)}${top.map((x) => row([`${esc(x.s.product)}<br><span style="color:#6b7280;font-size:12px">${x.s.container}</span>`, `${RISK_LABEL[x.p.level]} · ${Math.round(x.p.missChance * 100)}%`, dfmt.format(x.p.predictedArrival), dfmt.format(x.s.needBy), esc(x.why)])).join('')}</table>
${due.length ? `<h2 style="font-size:15px;margin:16px 0 6px">Reorders due this week</h2><table style="width:100%;border-collapse:collapse">${row(['Material', 'Plant', 'Qty', 'Order by'], true)}${due.map((x) => row([`${x.material} ${esc(x.description)}`, x.plant.code, `${x.orderQty.toLocaleString()} EA`, dfmt.format(x.orderByAdvised)])).join('')}</table>` : ''}
<p style="margin:20px 0 6px"><a href="${appUrl}" style="background:#0f766e;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Open Berthwise</a></p>
<p style="font-size:11px;color:#9ca3af">${label} Weather and port traffic are live (Open-Meteo, IMF PortWatch).</p>
</div></body></html>`;
  return { subject, text, html };
}

/** A .eml file the user can open in Outlook, Apple Mail or Thunderbird and send. */
export function toEml(dg: Digest, to: string) {
  const b = `bw-${Date.now().toString(36)}`;
  const enc = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/(.{76})/g, '$1\r\n');
  return [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(dg.subject)))}?=`,
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    enc(dg.text),
    `--${b}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    enc(dg.html),
    `--${b}--`,
    '',
  ].join('\r\n');
}
