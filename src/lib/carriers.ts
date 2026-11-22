/**
 * Milestone 6: the lane's voyage log. SIMULATED: 36 past Shanghai → Los Angeles arrivals per carrier
 * over the last six months, each with the ETA the carrier gave at booking and the day it actually
 * arrived. Carrier history in the estimate, the scorecard and the reorder advice all read from it.
 */

const DAY = 86_400_000;
const VOYAGES_PER_CARRIER = 36;
/** Arriving no later than one day after the booking ETA counts as on time (a common schedule-reliability window). */
export const ON_TIME_WINDOW_DAYS = 1;

const PROFILES: Record<string, { onTime: number; lateTail: number }> = {
  'Orion Lines': { onTime: 0.61, lateTail: 1.3 },
  'Kestrel Ocean': { onTime: 0.78, lateTail: 0.35 },
  'Meridian Box Co.': { onTime: 0.5, lateTail: 2.1 },
};

export const CARRIERS = Object.keys(PROFILES);

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

export interface LoggedVoyage {
  id: string;
  carrier: string;
  arrivedDaysAgo: number;
  delayDays: number; // actual arrival − booking ETA
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function buildLog(): LoggedVoyage[] {
  const out: LoggedVoyage[] = [];
  CARRIERS.forEach((carrier, c) => {
    const r = rng(4417 + c * 101);
    const { onTime, lateTail } = PROFILES[carrier];
    const onTimeCount = Math.round(onTime * VOYAGES_PER_CARRIER);
    for (let i = 0; i < VOYAGES_PER_CARRIER; i++) {
      // Shuffle which voyages ran late so the log isn't sorted.
      const late = (i * 7 + c * 3) % VOYAGES_PER_CARRIER >= onTimeCount;
      const delay = late ? ON_TIME_WINDOW_DAYS + 0.1 - lateTail * Math.log(1 - r() * 0.95) : -1 + r() * 2;
      out.push({
        id: `${carrier.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
        carrier,
        arrivedDaysAgo: Math.round(3 + (i / VOYAGES_PER_CARRIER) * 177 + r() * 3),
        delayDays: round1(delay),
      });
    }
  });
  return out;
}

export const VOYAGE_LOG = buildLog();

export interface CarrierStats {
  carrier: string;
  voyages: number;
  onTimePct: number;
  avgLateDays: number; // mean of actual − ETA
  spreadDays: number; // standard deviation of actual − ETA
  p90LateDays: number;
  worstLateDays: number;
}

export function carrierStats(carrier: string, log = VOYAGE_LOG): CarrierStats {
  const xs = log.filter((v) => v.carrier === carrier).map((v) => v.delayDays);
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    carrier,
    voyages: n,
    onTimePct: Math.round((xs.filter((x) => x <= ON_TIME_WINDOW_DAYS).length / n) * 100),
    avgLateDays: round1(mean),
    spreadDays: round1(sd),
    p90LateDays: round1(sorted[Math.floor(0.9 * (n - 1))]),
    worstLateDays: round1(sorted[n - 1]),
  };
}

export const CARRIER_STATS: Record<string, CarrierStats> = Object.fromEntries(CARRIERS.map((c) => [c, carrierStats(c)]));

/** SIMULATED: average days late per carrier on this lane, from the voyage log. */
export const CARRIER_HISTORY: Record<string, { avgLateDays: number; onTimePct: number }> = Object.fromEntries(
  CARRIERS.map((c) => [c, { avgLateDays: Math.max(0, CARRIER_STATS[c].avgLateDays), onTimePct: CARRIER_STATS[c].onTimePct }]),
);

export const daysAgoDate = (n: number, now = new Date()) => new Date(now.getTime() - n * DAY);
