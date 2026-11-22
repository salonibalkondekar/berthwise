import { greatCirclePoint, distanceNm, type LatLon } from './geo';
import { ANCHORAGE, DESTINATION, ORIGIN } from './lane';

/**
 * SIMULATED DATA. Every shipment, container number, vessel, carrier, PO and customer here is invented.
 * They are generated deterministically from the current date so the demo always looks current.
 */

export type Stage = 'booked' | 'at_origin' | 'sailing' | 'anchorage' | 'at_terminal';

export const STAGE_LABEL: Record<Stage, string> = {
  booked: 'Booked',
  at_origin: 'At origin port',
  sailing: 'Sailing',
  anchorage: 'Waiting at anchorage',
  at_terminal: 'At destination terminal',
};

export interface Shipment {
  id: string;
  container: string;
  containerType: '20GP' | '40GP' | '40HC';
  po: string;
  product: string;
  units: number;
  cargoValueUsd: number;
  vessel: string;
  voyage: string;
  carrier: string;
  stage: Stage;
  departure: Date;
  carrierEta: Date;
  needBy: Date;
  needByReason: string;
  progress: number; // 0..1 along the lane
  position: LatLon;
  speedKn: number | null;
  distanceRemainingNm: number;
  dischargedAt: Date | null;
  freeDays: number;
  simulated: true;
}

const VESSELS = [
  ['MV Pacific Lantern', 'Orion Lines'],
  ['MV Jade Meridian', 'Kestrel Ocean'],
  ['MV Harbor Crane', 'Orion Lines'],
  ['MV Coral Ascent', 'Meridian Box Co.'],
  ['MV Northern Tide', 'Kestrel Ocean'],
  ['MV Silver Gull', 'Meridian Box Co.'],
  ['MV East Wind Spirit', 'Orion Lines'],
] as const;

const PRODUCTS: [string, number, string][] = [
  ['Ceramic dinnerware sets', 2400, 'Holiday catalog launch'],
  ['Bamboo storage baskets', 5200, 'Retail partner reset'],
  ['Linen throw blankets', 3100, 'Winter sale'],
  ['Stainless cookware sets', 1800, 'Holiday catalog launch'],
  ['LED string lights', 9800, 'Holiday window displays'],
  ['Glass candle holders', 6400, 'Valentine’s promo'],
  ['Cotton bath towels', 7200, 'Restock: below safety stock'],
  ['Wooden serving boards', 4300, 'Marketplace promo'],
  ['Ceramic planters', 3600, 'Spring garden launch'],
  ['Woven area rugs', 900, 'Retail partner reset'],
  ['Enamel mugs', 8800, 'Restock: below safety stock'],
  ['Table lamps', 1500, 'New collection launch'],
  ['Kitchen textiles bundle', 6100, 'Winter sale'],
  ['Wall mirrors', 1100, 'New collection launch'],
];

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

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function containerNumber(r: () => number) {
  const digits = Array.from({ length: 7 }, () => Math.floor(r() * 10)).join('');
  return `BWSU${digits}`; // fictional owner code, not a registered BIC prefix
}

export const LANE_NM = distanceNm(ORIGIN.pos, DESTINATION.pos);

/** Day offsets of departure relative to today; negative = already sailed. Covers every stage. */
const DEPARTURE_OFFSETS = [6, 3, 1, -1, -3, -5, -7, -9, -11, -13, -15, -17, -19, -22];

export function generateShipments(now = new Date()): Shipment[] {
  const today = startOfDay(now);
  const r = rng(Math.floor(today.getTime() / DAY / 7)); // reshuffles weekly, stable within a week
  const transitDays = 15;

  return DEPARTURE_OFFSETS.map((offset, i) => {
    const [vessel, carrier] = VESSELS[Math.floor(r() * VESSELS.length)];
    const [product, units, needByReason] = PRODUCTS[i];
    const departure = new Date(today.getTime() + offset * DAY + Math.floor(r() * 20) * 3600000);
    const carrierEta = new Date(departure.getTime() + (transitDays + Math.floor(r() * 3)) * DAY);
    const elapsed = (now.getTime() - departure.getTime()) / DAY;
    const plannedDays = (carrierEta.getTime() - departure.getTime()) / DAY;

    let stage: Stage;
    let progress: number;
    let position: LatLon;
    let speedKn: number | null = null;
    let dischargedAt: Date | null = null;

    if (offset > 2) {
      stage = 'booked';
      progress = 0;
      position = ORIGIN.pos;
    } else if (elapsed < 0) {
      stage = 'at_origin';
      progress = 0;
      position = ORIGIN.pos;
    } else if (elapsed < plannedDays - 0.5) {
      stage = 'sailing';
      progress = Math.min(0.985, elapsed / plannedDays);
      position = greatCirclePoint(ORIGIN.pos, DESTINATION.pos, progress);
      speedKn = +(LANE_NM / plannedDays / 24 + (r() - 0.5) * 2).toFixed(1);
    } else if (elapsed < plannedDays + 3 && i % 2 === 1) {
      stage = 'anchorage';
      progress = 0.995;
      position = [ANCHORAGE[0] + (r() - 0.5) * 0.12, ANCHORAGE[1] + (r() - 0.5) * 0.2];
      speedKn = 0.2;
    } else {
      stage = 'at_terminal';
      progress = 1;
      position = DESTINATION.pos;
      dischargedAt = new Date(Math.min(now.getTime(), carrierEta.getTime() + Math.floor(r() * 2) * DAY));
    }

    const needBy = new Date(carrierEta.getTime() + (4 + Math.floor(r() * 14)) * DAY);
    const valuePerUnit = 6 + r() * 30;

    return {
      id: `SHP-${String(1040 + i)}`,
      container: containerNumber(r),
      containerType: (['20GP', '40GP', '40HC'] as const)[i % 3 === 0 ? 0 : r() > 0.4 ? 2 : 1],
      po: `PO-${24000 + Math.floor(r() * 900)}`,
      product,
      units,
      cargoValueUsd: Math.round((units * valuePerUnit) / 100) * 100,
      vessel,
      voyage: `${String.fromCharCode(65 + Math.floor(r() * 26))}${100 + Math.floor(r() * 800)}E`,
      carrier,
      stage,
      departure,
      carrierEta,
      needBy,
      needByReason,
      progress,
      position,
      speedKn,
      distanceRemainingNm: Math.round(LANE_NM * (1 - progress)),
      dischargedAt,
      freeDays: 4 + Math.floor(r() * 3),
      simulated: true,
    };
  });
}

export const IMPORTER = {
  name: 'Juniper & Oak Home Goods',
  blurb: 'Fictional small importer of home goods, buying from suppliers near Shanghai and selling across the US.',
};
