import type { Prediction } from './predict';
import type { Shipment } from './sim';

/**
 * Milestone 5: the SAP side of each container. SIMULATED: plants, materials, purchase order items,
 * inbound deliveries, stock, demand and sales orders are invented, laid out the way SAP S/4HANA
 * records them (ME23N, VL33N, MMBE / MD04, VA03) so a planner would recognise them.
 */

const DAY = 86_400_000;
const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
const addDays = (x: Date, n: number) => new Date(sod(x) + n * DAY + 12 * 3_600_000);
const diffDays = (a: Date, b: Date) => Math.round((sod(b) - sod(a)) / DAY);
const round10 = (x: number) => Math.round(x / 10) * 10;

export interface Plant {
  code: string;
  name: string;
  leadDays: number; // terminal pickup → stock posted at the plant
  leadNote: string;
}

export const PLANTS = {
  US10: { code: 'US10', name: 'Ontario, CA DC', leadDays: 2, leadNote: 'Truck from the LA terminal, then goods receipt' },
  US20: { code: 'US20', name: 'Dallas, TX DC', leadDays: 5, leadNote: 'Rail from LA to Dallas, then goods receipt' },
} satisfies Record<string, Plant>;

export const SOLD_TO = [
  { number: '100231', name: 'Maple & Main Stores' },
  { number: '100245', name: 'Harbor Lane Home' },
  { number: '100262', name: 'Northwind Goods Co.' },
  { number: '100288', name: 'Sunday Table Online' },
  { number: '100301', name: 'Copper Kettle Market' },
  { number: '100317', name: 'Bluebird Home Outlet' },
];

/** Gross margin markup from landed cost to the sales price. */
export const MARKUP = 2.2;
/** A container holds about six weeks of a material's demand at its plants. */
const WEEKS_PER_CONTAINER = 6;
export const SAFETY_DAYS = 5;

export interface PoItem {
  po: string;
  item: string;
  material: string;
  description: string;
  qty: number;
  plant: Plant;
}

export type StockStatus = 'short' | 'tight' | 'ok';

export interface StockLine {
  shipmentId: string;
  material: string;
  description: string;
  plant: Plant;
  onHand: number;
  safetyStock: number;
  dailyDemand: number;
  coverDays: number;
  runOut: Date;
  inboundQty: number;
  availableAt: Date;
  gapDays: number;
  status: StockStatus;
}

export type OrderStatus = 'from_stock' | 'inbound' | 'at_risk';

export interface SalesOrder {
  so: string;
  item: string;
  customer: (typeof SOLD_TO)[number];
  material: string;
  description: string;
  plant: Plant;
  qty: number;
  requested: Date;
  valueUsd: number;
  shipmentId: string;
  status: OrderStatus;
  slipDays: number;
}

export interface ErpLink {
  shipmentId: string;
  material: string;
  inboundDelivery: string | null;
  items: PoItem[];
  stock: StockLine[];
  orders: SalesOrder[];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** When the container's goods can leave the destination port: the estimate, or today if it is already at the terminal. */
function portRelease(s: Shipment, p: Prediction | undefined, now: Date) {
  if (s.stage === 'at_terminal') return new Date(Math.max(sod(now), sod(s.dischargedAt ?? s.carrierEta)));
  return p?.predictedArrival ?? s.carrierEta;
}

export function erpLinks(shipments: Shipment[], preds: Map<string, Prediction>, now = new Date()): Map<string, ErpLink> {
  const out = new Map<string, ErpLink>();
  let soSeq = 0;

  shipments.forEach((s, i) => {
    const r = rng(9173 + i * 31);
    const material = `JO-${1001 + i}`;
    const split = i % 3 !== 2;
    const share = 0.55 + Math.floor(r() * 4) * 0.05;
    const q10 = split ? round10(s.units * share) : s.units;
    const parts = [{ plant: PLANTS.US10, qty: q10, offset: 0 }];
    if (split) parts.push({ plant: PLANTS.US20, qty: s.units - q10, offset: [0, 2, 4][i % 3] });

    const release = portRelease(s, preds.get(s.id), now);
    const unitPrice = (s.cargoValueUsd / s.units) * MARKUP;
    const items: PoItem[] = [];
    const stock: StockLine[] = [];
    const orders: SalesOrder[] = [];

    parts.forEach((pt, k) => {
      items.push({ po: s.po, item: String((k + 1) * 10).padStart(5, '0'), material, description: s.product, qty: pt.qty, plant: pt.plant });

      const dailyDemand = pt.qty / (WEEKS_PER_CONTAINER * 7);
      // The needed-by date is when the goods must reach the port, so stock at the plant lasts until then plus the plant's lead time.
      const runOut = addDays(s.needBy, pt.plant.leadDays + pt.offset);
      const coverDays = Math.max(0, diffDays(now, runOut));
      const availableAt = addDays(release, pt.plant.leadDays);
      const gapDays = Math.max(0, diffDays(runOut, availableAt));
      stock.push({
        shipmentId: s.id,
        material,
        description: s.product,
        plant: pt.plant,
        onHand: round10(dailyDemand * coverDays),
        safetyStock: round10(dailyDemand * SAFETY_DAYS),
        dailyDemand,
        coverDays,
        runOut,
        inboundQty: pt.qty,
        availableAt,
        gapDays,
        status: gapDays > 0 ? 'short' : diffDays(availableAt, runOut) <= 2 ? 'tight' : 'ok',
      });

      const offsets = [-(3 + Math.floor(r() * 6)), 1 + Math.floor(r() * 2), 3 + Math.floor(r() * 4), 8 + Math.floor(r() * 7)];
      offsets.forEach((o, j) => {
        const qty = Math.max(10, round10(dailyDemand * (2 + r() * 3)));
        const requested = addDays(runOut, o);
        const seq = soSeq++;
        if (diffDays(now, requested) < 1) return; // already delivered
        const needAtPlant = addDays(requested, -1);
        let status: OrderStatus = 'at_risk';
        if (diffDays(needAtPlant, runOut) > 0) status = 'from_stock';
        else if (diffDays(availableAt, needAtPlant) >= 0) status = 'inbound';
        orders.push({
          so: String(10004120 + seq),
          item: '000010',
          customer: SOLD_TO[(i * 3 + k * 2 + j) % SOLD_TO.length],
          material,
          description: s.product,
          plant: pt.plant,
          qty,
          requested,
          valueUsd: round10(qty * unitPrice),
          shipmentId: s.id,
          status,
          slipDays: status === 'at_risk' ? diffDays(needAtPlant, availableAt) : 0,
        });
      });
    });

    out.set(s.id, {
      shipmentId: s.id,
      material,
      inboundDelivery: s.stage === 'booked' ? null : String(1800041230 + i * 17),
      items,
      stock,
      orders,
    });
  });
  return out;
}

export function erpTotals(links: Map<string, ErpLink>) {
  const all = [...links.values()];
  const stock = all.flatMap((l) => l.stock);
  const orders = all.flatMap((l) => l.orders);
  const atRisk = orders.filter((o) => o.status === 'at_risk').sort((a, b) => b.slipDays - a.slipDays || b.valueUsd - a.valueUsd);
  return {
    stock,
    orders,
    short: stock.filter((x) => x.status === 'short').sort((a, b) => b.gapDays - a.gapDays),
    tight: stock.filter((x) => x.status === 'tight'),
    belowSafety: stock.filter((x) => x.onHand < x.safetyStock),
    atRisk,
    atRiskValue: atRisk.reduce((sum, o) => sum + o.valueUsd, 0),
  };
}
