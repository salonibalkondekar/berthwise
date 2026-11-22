import { lateFee, recommend, rerouteOptions } from './actions';
import { CARRIER_STATS } from './carriers';
import { MARKUP, SAFETY_DAYS, type ErpLink, type Plant } from './erp';
import type { Prediction } from './predict';
import type { Shipment } from './sim';
import type { Signals } from './signals';

/**
 * Milestone 6: money and planning. SIMULATED inputs: fees, freight rates, prices, demand, lost-sale
 * share and supplier lead times are invented, typical-looking figures. The delay pattern comes from
 * the simulated voyage log in carriers.ts.
 */

const DAY = 86_400_000;
const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
const addDays = (x: Date, n: number) => new Date(sod(x) + Math.round(n) * DAY + 12 * 3_600_000);
const diffDays = (a: Date, b: Date) => Math.round((sod(b) - sod(a)) / DAY);
const round10 = (x: number) => Math.round(x / 10) * 10;

export const MONEY = {
  /** Share of sales lost while a plant has no stock (customers buy elsewhere or cancel). */
  lostShare: 0.3,
};

export const PLANNING = {
  productionDays: 14, // PO to goods ready at the supplier
  originDays: 3, // trucking to Yangshan and gate-in before sailing
  serviceLevel: 0.95,
  z: 1.65, // normal quantile for a 95% cycle service level
  /** Day-to-day swing in demand (coefficient of variation), by material. */
  demandCv: [0.3, 0.45, 0.6],
};

export interface DelayCost {
  shipmentId: string;
  fees: number; // storage fees accrued so far
  expedite: number; // recommended speed-up, if it makes the date
  expediteLabel: string | null;
  lostSales: number; // expected revenue lost while plants are out of stock
  shortUnits: number;
  total: number;
  doNothing: number; // fees + lost sales without the speed-up
  worthIt: boolean | null; // the speed-up costs less than the sales it saves
  declined: { title: string; cost: number } | null; // a speed-up that would cost more than the sales it saves
}

export function delayCost(s: Shipment, p: Prediction | null, link: ErpLink | undefined, signals: Signals | null, now = new Date()): DelayCost {
  const fee = lateFee(s, p, now);
  const opts = p && p.level !== 'arrived' ? rerouteOptions(s, p, signals, now) : [];
  const fees = fee?.arrived ? fee.accrued : 0;
  const shortUnits = (link?.stock ?? []).reduce((sum, x) => sum + x.gapDays * x.dailyDemand, 0);
  const lostIfLate = salesAtStake(s, link);
  const rec = recommend(s, p, opts, fee, lostIfLate);
  const fix = rec.kind === 'reroute' && rec.option?.makesDate ? rec.option : null;
  const expedite = fix?.extraCost ?? 0;
  const lostSales = fix ? 0 : lostIfLate;
  return {
    shipmentId: s.id,
    fees,
    expedite,
    expediteLabel: fix?.title ?? null,
    lostSales,
    shortUnits: Math.round(shortUnits),
    total: fees + expedite + lostSales,
    doNothing: fees + lostIfLate,
    worthIt: fix ? expedite < lostIfLate : null,
    declined: rec.declined ? { title: rec.declined.title, cost: rec.declined.extraCost } : null,
  };
}

/** Sales lost while plants wait for this container (simulated demand, price and lost share). */
export function salesAtStake(s: Shipment, link: ErpLink | undefined | null) {
  const price = (s.cargoValueUsd / s.units) * MARKUP;
  const shortUnits = (link?.stock ?? []).reduce((sum, x) => sum + x.gapDays * x.dailyDemand, 0);
  return round10(shortUnits * price * MONEY.lostShare);
}

export function delayCosts(shipments: Shipment[], preds: Map<string, Prediction>, erp: Map<string, ErpLink>, signals: Signals | null, now = new Date()) {
  return new Map(shipments.map((s) => [s.id, delayCost(s, preds.get(s.id) ?? null, erp.get(s.id), signals, now)]));
}

export type ReorderStatus = 'now' | 'week' | 'later';

export interface ReorderLine {
  shipmentId: string;
  material: string;
  description: string;
  plant: Plant;
  carrier: string;
  dailyDemand: number;
  demandCv: number;
  laneLateDays: number;
  laneSpreadDays: number;
  orderQty: number;
  unitCost: number;
  plannedLt: number; // master data today (planned delivery time, days)
  advisedLt: number;
  ssNow: number; // units
  ssAdvised: number;
  ssDaysNow: number;
  ssDaysAdvised: number;
  coverEnds: Date; // stock runs out after this container's goods are used
  orderByNow: Date;
  orderByAdvised: Date;
  status: ReorderStatus;
  cashChange: number; // inventory value of the safety-stock change (+ more tied up, − freed)
}

export function reorderAdvice(shipments: Shipment[], erp: Map<string, ErpLink>, now = new Date()): ReorderLine[] {
  const out: ReorderLine[] = [];
  shipments.forEach((s, i) => {
    const link = erp.get(s.id);
    const lane = CARRIER_STATS[s.carrier];
    if (!link || !lane) return;
    const demandCv = PLANNING.demandCv[i % PLANNING.demandCv.length];
    const oceanDays = Math.round((s.carrierEta.getTime() - s.departure.getTime()) / DAY);
    const unitCost = s.cargoValueUsd / s.units;
    for (const x of link.stock) {
      const plannedLt = PLANNING.productionDays + PLANNING.originDays + oceanDays + x.plant.leadDays;
      const advisedLt = plannedLt + Math.max(0, Math.round(lane.avgLateDays));
      // Safety stock covers both demand swings over the lead time and the lane's arrival spread.
      const ssDaysAdvised = Math.max(1, Math.round(PLANNING.z * Math.sqrt(advisedLt * demandCv ** 2 + lane.spreadDays ** 2)));
      const leftAtArrival = Math.max(0, x.onHand - x.dailyDemand * Math.max(0, diffDays(now, x.availableAt)));
      const coverEnds = addDays(x.availableAt, (leftAtArrival + x.inboundQty) / x.dailyDemand);
      const orderByNow = addDays(coverEnds, -(plannedLt + SAFETY_DAYS));
      const orderByAdvised = addDays(coverEnds, -(advisedLt + ssDaysAdvised));
      const due = diffDays(now, orderByAdvised);
      const ssAdvised = round10(x.dailyDemand * ssDaysAdvised);
      out.push({
        shipmentId: s.id,
        material: x.material,
        description: x.description,
        plant: x.plant,
        carrier: s.carrier,
        dailyDemand: x.dailyDemand,
        demandCv,
        laneLateDays: lane.avgLateDays,
        laneSpreadDays: lane.spreadDays,
        orderQty: x.inboundQty,
        unitCost,
        plannedLt,
        advisedLt,
        ssNow: x.safetyStock,
        ssAdvised,
        ssDaysNow: SAFETY_DAYS,
        ssDaysAdvised,
        coverEnds,
        orderByNow,
        orderByAdvised,
        status: due <= 0 ? 'now' : due <= 7 ? 'week' : 'later',
        cashChange: round10((ssAdvised - x.safetyStock) * unitCost),
      });
    }
  });
  return out.sort((a, b) => a.orderByAdvised.getTime() - b.orderByAdvised.getTime());
}

export interface CarrierCard {
  carrier: string;
  rank: number;
  onTimePct: number;
  avgLateDays: number;
  spreadDays: number;
  p90LateDays: number;
  voyages: number;
  active: number;
  lateNow: number;
  costNow: number;
}

export function carrierScorecard(shipments: Shipment[], preds: Map<string, Prediction>, costs: Map<string, DelayCost> | null): CarrierCard[] {
  return Object.values(CARRIER_STATS)
    .map((c) => {
      const mine = shipments.filter((s) => s.carrier === c.carrier && s.stage !== 'at_terminal');
      return {
        carrier: c.carrier,
        rank: 0,
        onTimePct: c.onTimePct,
        avgLateDays: c.avgLateDays,
        spreadDays: c.spreadDays,
        p90LateDays: c.p90LateDays,
        voyages: c.voyages,
        active: mine.length,
        lateNow: mine.filter((s) => preds.get(s.id)?.level === 'high').length,
        costNow: shipments.filter((s) => s.carrier === c.carrier).reduce((sum, s) => sum + (costs?.get(s.id)?.total ?? 0), 0),
      };
    })
    .sort((a, b) => b.onTimePct - a.onTimePct || a.avgLateDays - b.avgLateDays)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
