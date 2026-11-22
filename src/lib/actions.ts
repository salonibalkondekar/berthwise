import type { Prediction } from './predict';
import type { Shipment } from './sim';
import type { Signals } from './signals';

/**
 * Milestone 3: what to do about a shipment. All rates, fees and customers here are SIMULATED
 * (typical-looking figures for the LA/Long Beach market, not quotes).
 */

const DAY = 86_400_000;
const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;

export const WAREHOUSE = 'Ontario, CA warehouse';

export const RATES = {
  demurrageTier1: 250, // $/day, first 4 days past the last free day
  demurrageTier2: 400, // $/day after that
  priorityPickup: 350, // extra over a standard truck booking
  oaklandChangeFee: 750, // carrier change-of-destination fee
  oaklandExtraTrucking: 1250, // Oakland → Ontario vs LA → Ontario
  airPerKg: 5.5,
  airHandling: 450,
  airDays: 4, // book, fly PVG→LAX, clear customs, deliver
  airShare: 0.3, // share of units flown to cover the launch
};

const KG_PER_UNIT: Record<string, number> = {
  'Ceramic dinnerware sets': 6.5,
  'Bamboo storage baskets': 1.2,
  'Linen throw blankets': 1.1,
  'Stainless cookware sets': 7.8,
  'LED string lights': 0.4,
  'Glass candle holders': 0.6,
  'Cotton bath towels': 0.7,
  'Wooden serving boards': 1.4,
  'Ceramic planters': 2.2,
  'Woven area rugs': 9.5,
  'Enamel mugs': 0.4,
  'Table lamps': 3.1,
  'Kitchen textiles bundle': 0.9,
  'Wall mirrors': 6.8,
};

const CUSTOMERS = [
  { name: 'Maple & Main Stores', contact: 'Dana' },
  { name: 'Harbor Lane Home', contact: 'Priya' },
  { name: 'Northwind Goods Co.', contact: 'Marcus' },
  { name: 'Sunday Table Online', contact: 'Elena' },
];

export function customerFor(s: Shipment) {
  const n = Number(s.id.replace(/\D/g, '')) || 0;
  return CUSTOMERS[n % CUSTOMERS.length];
}

export function demurrage(daysOver: number) {
  if (daysOver <= 0) return 0;
  const t1 = Math.min(daysOver, 4);
  return t1 * RATES.demurrageTier1 + Math.max(0, daysOver - 4) * RATES.demurrageTier2;
}

export interface LateFee {
  lastFreeDay: Date;
  daysLeft: number; // negative once past
  accrued: number;
  nextDayCost: number;
  weekCost: number; // if it sits 7 more days
  arrived: boolean;
  level: 'ok' | 'soon' | 'over';
}

export function lateFee(s: Shipment, p: Prediction | null, now = new Date()): LateFee | null {
  const arrived = s.stage === 'at_terminal';
  const start = arrived ? s.dischargedAt : p?.predictedArrival;
  if (!start) return null;
  if (!arrived && (start.getTime() - now.getTime()) / DAY > 7) return null;
  const lastFreeDay = new Date(start.getTime() + s.freeDays * DAY);
  const daysLeft = Math.floor((lastFreeDay.getTime() - now.getTime()) / DAY);
  const over = Math.max(0, -daysLeft);
  return {
    lastFreeDay,
    daysLeft,
    accrued: demurrage(over),
    nextDayCost: demurrage(over + 1) - demurrage(over),
    weekCost: demurrage(Math.max(0, 7 - Math.max(0, daysLeft)) + over) - demurrage(over),
    arrived,
    level: daysLeft < 0 ? 'over' : daysLeft <= 1 ? 'soon' : 'ok',
  };
}

export interface Option {
  id: 'stay' | 'priority' | 'oakland' | 'air';
  title: string;
  detail: string;
  arrival: Date;
  daysSaved: number;
  extraCost: number;
  makesDate: boolean;
  available: boolean;
  unavailableReason?: string;
}

export function rerouteOptions(s: Shipment, p: Prediction, _signals: Signals | null, now = new Date()): Option[] {
  if (s.stage === 'at_terminal') return [];
  const base = p.predictedArrival.getTime();
  const mk = (o: Omit<Option, 'daysSaved' | 'makesDate'>): Option => ({
    ...o,
    daysSaved: r1((base - o.arrival.getTime()) / DAY),
    makesDate: o.arrival.getTime() <= s.needBy.getTime(),
  });

  const opts: Option[] = [
    mk({
      id: 'stay',
      title: 'Keep the current plan',
      detail: `Discharge at Los Angeles–Long Beach and truck to the ${WAREHOUSE}.`,
      arrival: p.predictedArrival,
      extraCost: 0,
      available: true,
    }),
  ];

  opts.push(
    mk({
      id: 'priority',
      title: 'Priority pickup at the terminal',
      detail: 'Book the first truck appointment after it’s unloaded instead of a standard slot. Saves about half a day.',
      arrival: new Date(base - 0.5 * DAY),
      extraCost: RATES.priorityPickup,
      available: true,
    }),
  );

  const congestion = p.factors.find((f) => f.id === 'port-destination')?.days ?? 0;
  const canOakland = (s.stage === 'sailing' && s.progress < 0.85) || s.stage === 'booked' || s.stage === 'at_origin';
  opts.push(
    mk({
      id: 'oakland',
      title: 'Switch to Oakland',
      detail: `Ask the carrier to discharge at Oakland, skipping ${congestion > 0 ? `about ${congestion.toFixed(1)} days of` : 'any'} LA–Long Beach congestion, then truck about 400 miles south (+1 day). Oakland traffic is assumed normal.`,
      arrival: new Date(base - Math.max(0, congestion) * DAY - 0.4 * DAY + DAY),
      extraCost: RATES.oaklandChangeFee + RATES.oaklandExtraTrucking,
      available: canOakland,
      unavailableReason: s.stage === 'anchorage' ? 'Already waiting off LA' : 'Too close to LA to change port',
    }),
  );

  const airUnits = Math.ceil(s.units * RATES.airShare);
  const kg = airUnits * (KG_PER_UNIT[s.product] ?? 2);
  const airArrival = new Date(now.getTime() + RATES.airDays * DAY);
  opts.push(
    mk({
      id: 'air',
      title: `Air-freight ${airUnits.toLocaleString()} units`,
      detail: `Fly ${Math.round(RATES.airShare * 100)}% of the order (about ${r0(kg).toLocaleString()} kg) from Shanghai Pudong to LAX from extra supplier stock, so enough lands for the date. The rest stays on the ship.`,
      arrival: airArrival,
      extraCost: r0((kg * RATES.airPerKg + RATES.airHandling) / 10) * 10,
      available: airArrival.getTime() < base,
      unavailableReason: 'The ship gets there first',
    }),
  );
  return opts;
}

export interface Recommendation {
  kind: 'none' | 'reroute' | 'pickup' | 'notify';
  headline: string;
  detail: string;
  option?: Option;
  notify: boolean;
}

export function recommend(s: Shipment, p: Prediction | null, opts: Option[], fee: LateFee | null): Recommendation {
  if (fee && fee.arrived) {
    if (fee.level === 'over')
      return { kind: 'pickup', headline: 'Pick it up today', detail: `Free days ran out ${fmt(fee.lastFreeDay)}. Fees so far: ${usd(fee.accrued)}, rising ${usd(fee.nextDayCost)} a day.`, notify: false };
    if (fee.level === 'soon')
      return { kind: 'pickup', headline: `Book pickup before ${fmt(fee.lastFreeDay)}`, detail: `That’s the last free day. After that it costs ${usd(fee.nextDayCost)} a day.`, notify: false };
    return { kind: 'none', headline: 'No action needed', detail: `Free days run to ${fmt(fee.lastFreeDay)}.`, notify: false };
  }
  if (!p || p.level === 'arrived') return { kind: 'none', headline: 'No action needed', detail: '', notify: false };
  const late = p.predictedArrival.getTime() > s.needBy.getTime();
  if (p.level === 'low') return { kind: 'none', headline: 'No action needed', detail: 'On track for its needed-by date. Berthwise will flag it if that changes.', notify: false };

  const stay = opts.find((o) => o.id === 'stay');
  if (stay?.makesDate) {
    const backup = opts.filter((o) => o.id !== 'stay' && o.available && o.daysSaved > 0).sort((a, b) => b.daysSaved - a.daysSaved)[0];
    return {
      kind: 'none',
      headline: 'Keep the current plan',
      detail: `It makes ${fmt(s.needBy)} if nothing else slips.${backup ? ` If it does, ${backup.title.toLowerCase()} is the backup (${days(backup.daysSaved)} sooner, ${usd(backup.extraCost)}).` : ''}`,
      notify: false,
    };
  }
  const fixes = opts.filter((o) => o.id !== 'stay' && o.available && o.makesDate).sort((a, b) => a.extraCost - b.extraCost);
  if (fixes[0]) {
    const o = fixes[0];
    return {
      kind: 'reroute',
      headline: o.title,
      detail: `Gets it there ${fmt(o.arrival)}, ${days(o.daysSaved)} sooner and in time for ${fmt(s.needBy)}, for ${usd(o.extraCost)} extra.`,
      option: o,
      notify: false,
    };
  }
  const best = opts.filter((o) => o.id !== 'stay' && o.available && o.daysSaved > 0).sort((a, b) => b.daysSaved - a.daysSaved)[0];
  return {
    kind: 'notify',
    headline: `Tell ${customerFor(s).name} about the delay`,
    detail: best
      ? `No option makes ${fmt(s.needBy)}. ${best.title} saves the most (${days(best.daysSaved)}, ${usd(best.extraCost)}).`
      : `No option makes ${fmt(s.needBy)}, so warn them early.`,
    option: best,
    notify: late || p.level === 'high',
  };
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fmt = (d: Date) => dateFmt.format(d);
const days = (n: number) => (Math.abs(n - 1) < 0.05 ? '1 day' : `${n.toFixed(1)} days`);
export const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export type Tone = 'friendly' | 'formal';

export function delayNote(s: Shipment, p: Prediction, rec: Recommendation, tone: Tone, from: string) {
  const c = customerFor(s);
  const daysLate = Math.max(1, Math.round((p.predictedArrival.getTime() - s.needBy.getTime()) / DAY));
  const late = p.predictedArrival.getTime() > s.needBy.getTime();
  const why = p.factors.filter((f) => f.days > 0).slice(0, 2).map((f) => (/^(Los Angeles|Shanghai|Orion|Kestrel|Meridian)/.test(f.title) ? f.title : f.title[0].toLowerCase() + f.title.slice(1)));
  const where =
    s.stage === 'anchorage' ? 'is waiting off the Port of Los Angeles for a berth'
    : s.stage === 'sailing' ? 'is on the water from Shanghai'
    : 'is still at origin in Shanghai';
  const mitigation =
    rec.option && rec.option.id !== 'stay' && !rec.option.makesDate
      ? `We're also arranging ${rec.option.title.toLowerCase()} to save about ${days(rec.option.daysSaved)}.`
      : rec.option && rec.option.id !== 'stay'
      ? `To limit the impact, we're looking at one option: ${rec.option.title.toLowerCase()}, which would get ${rec.option.id === 'air' ? 'part of the order' : 'it'} to you around ${longFmt.format(rec.option.arrival)}.`
      : '';
  const subject = `${s.po}: ${s.product} now expected ${fmt(p.predictedArrival)}`;
  const body =
    tone === 'friendly'
      ? [
          `Hi ${c.contact},`,
          `Quick heads-up on ${s.po} (${s.units.toLocaleString()} ${s.product.toLowerCase()}). The container ${where} and we now expect it around ${longFmt.format(p.predictedArrival)}${late ? `, about ${daysLate} day${daysLate === 1 ? '' : 's'} after the ${fmt(s.needBy)} date we planned for` : ''}.`,
          why.length ? `The main reasons: ${why.join(' and ')}.` : '',
          mitigation,
          `I'll update you as soon as it lands. Sorry for the hassle.`,
          `Thanks,\n${from}`,
        ]
      : [
          `Dear ${c.contact},`,
          `We are writing about purchase order ${s.po} (${s.units.toLocaleString()} units of ${s.product.toLowerCase()}). The container ${where}, and its revised estimated arrival is ${longFmt.format(p.predictedArrival)}${late ? `, ${daysLate} day${daysLate === 1 ? '' : 's'} later than the agreed date of ${longFmt.format(s.needBy)}` : ''}.`,
          why.length ? `The delay is due to ${why.join(' and ')}.` : '',
          mitigation,
          `We will confirm the delivery date once the container is discharged. We apologize for the inconvenience.`,
          `Kind regards,\n${from}`,
        ];
  return { to: c, subject, body: body.filter(Boolean).join('\n\n') };
}
