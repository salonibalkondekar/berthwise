import { CARRIER_HISTORY } from './predict';

/**
 * Milestone 4: accuracy score. Berthwise has no real past arrivals yet, so this is a SIMULATED
 * backtest: 48 past voyages with a hidden "true" delay, the carrier ETA, and what this model
 * would have estimated 7 days before arrival from noisy readings of the same factors.
 */

const DAY = 86_400_000;

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

export interface PastVoyage {
  id: string;
  carrier: string;
  arrived: Date;
  carrierEta: Date;
  estimate: Date; // Berthwise, 7 days before arrival
  needBy: Date;
  carrierError: number; // actual − carrier ETA, days
  berthwiseError: number; // actual − Berthwise, days
  missed: boolean;
  flagged: boolean;
}

export function backtest(now = new Date()): PastVoyage[] {
  const r = rng(20261122);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const carriers = Object.keys(CARRIER_HISTORY);
  const out: PastVoyage[] = [];
  for (let i = 0; i < 48; i++) {
    const carrier = carriers[i % carriers.length];
    const daysAgo = 84 - i * 1.7 - r();
    const weather = r() < 0.3 ? 0.5 + r() * 2.5 : r() * 0.4;
    const port = Math.max(-0.3, gauss() * 0.8 + 0.4);
    const carrierLate = CARRIER_HISTORY[carrier].avgLateDays * (0.4 + r() * 1.2);
    const truth = weather + port + carrierLate + gauss() * 0.7;
    const seen = weather * (0.4 + r() * 0.9) + port * (0.5 + r() * 0.8) + CARRIER_HISTORY[carrier].avgLateDays + gauss() * 0.5;
    const arrived = new Date(now.getTime() - daysAgo * DAY);
    const carrierEta = new Date(arrived.getTime() - truth * DAY);
    const estimate = new Date(carrierEta.getTime() + seen * DAY);
    const needBy = new Date(carrierEta.getTime() + (r() * 5 - 0.5) * DAY);
    const sigma = 0.7 + 0.12 * 7;
    const z = (needBy.getTime() - estimate.getTime()) / DAY / sigma;
    out.push({
      id: `V${String(i + 1).padStart(2, '0')}`,
      carrier,
      arrived,
      carrierEta,
      estimate,
      needBy,
      carrierError: (arrived.getTime() - carrierEta.getTime()) / DAY,
      berthwiseError: (arrived.getTime() - estimate.getTime()) / DAY,
      missed: arrived > needBy,
      flagged: z < 0, // ≥50% miss chance
    });
  }
  return out;
}

const mae = (xs: number[]) => xs.reduce((s, x) => s + Math.abs(x), 0) / Math.max(1, xs.length);

export function score(v: PastVoyage[]) {
  const missed = v.filter((x) => x.missed);
  return {
    n: v.length,
    carrierMae: mae(v.map((x) => x.carrierError)),
    berthwiseMae: mae(v.map((x) => x.berthwiseError)),
    carrierWithin1: v.filter((x) => Math.abs(x.carrierError) <= 1).length / v.length,
    berthwiseWithin1: v.filter((x) => Math.abs(x.berthwiseError) <= 1).length / v.length,
    missed: missed.length,
    caught: missed.filter((x) => x.flagged).length,
    falseAlarms: v.filter((x) => x.flagged && !x.missed).length,
    byCarrier: Object.keys(CARRIER_HISTORY).map((c) => {
      const xs = v.filter((x) => x.carrier === c);
      return { carrier: c, n: xs.length, carrierMae: mae(xs.map((x) => x.carrierError)), berthwiseMae: mae(xs.map((x) => x.berthwiseError)) };
    }),
  };
}
