import { demurrage, lateFee } from './actions';
import { normalCdf, type Prediction, type RiskLevel } from './predict';
import type { Shipment } from './sim';

/** Milestone 4: hypothetical disruptions. Everything here is a what-if on top of today's estimates. */

const DAY = 86_400_000;
const round1 = (x: number) => Math.round(x * 10) / 10;

export const STORM_ZONES = [
  { id: 'japan', name: 'Sea of Japan and Tsugaru Strait', range: [0.08, 0.26] as [number, number] },
  { id: 'nwp', name: 'Northwest Pacific', range: [0.26, 0.5] as [number, number] },
  { id: 'np', name: 'North Pacific, south of the Aleutians', range: [0.5, 0.72] as [number, number] },
  { id: 'west', name: 'Off the US West Coast', range: [0.72, 0.97] as [number, number] },
];

export type Scenario =
  | { kind: 'storm'; zone: string; startIn: number; days: number; strength: 'strong' | 'extreme' }
  | { kind: 'strike'; port: 'destination' | 'origin'; startIn: number; days: number };

export const STORM_SLOWDOWN = { strong: 0.3, extreme: 0.55 }; // days lost per day spent in the storm area
export const STRIKE_BACKLOG = 0.5; // days of backlog per strike day

export interface Impact {
  s: Shipment;
  before: Prediction;
  after: Prediction;
  extraDays: number;
  extraFees: number;
  why: string;
}

function progressAt(s: Shipment, p: Prediction, t: number, now: Date) {
  const T = Math.max(0.1, (p.predictedArrival.getTime() - now.getTime()) / DAY);
  if (s.stage === 'sailing') return Math.min(1, s.progress + (1 - s.progress) * (t / T));
  if (s.stage === 'booked' || s.stage === 'at_origin') {
    const d0 = Math.max(0, (s.departure.getTime() - now.getTime()) / DAY);
    return t < d0 ? 0 : Math.min(1, (t - d0) / Math.max(0.1, T - d0));
  }
  return 1;
}

function relevel(s: Shipment, p: Prediction, extra: number, title: string, detail: string): Prediction {
  if (p.level === 'arrived') return p;
  const predictedArrival = new Date(p.predictedArrival.getTime() + extra * DAY);
  const slackDays = (s.needBy.getTime() - predictedArrival.getTime()) / DAY;
  const sigma = p.rangeDays + 0.3;
  const missChance = 1 - normalCdf(slackDays / sigma);
  const level: RiskLevel = missChance >= 0.5 ? 'high' : missChance >= 0.2 ? 'medium' : 'low';
  return {
    ...p,
    predictedArrival,
    slackDays,
    missChance,
    level,
    delayDays: round1(p.delayDays + extra),
    rangeDays: round1(sigma),
    factors: [{ id: 'whatif', title, detail, days: round1(extra), source: 'sim' as const }, ...p.factors],
  };
}

export function applyScenario(shipments: Shipment[], preds: Map<string, Prediction>, sc: Scenario, now = new Date()) {
  const impacts: Impact[] = [];
  const after = new Map(preds);
  const end = sc.startIn + sc.days;

  for (const s of shipments) {
    const p = preds.get(s.id);
    if (!p) continue;
    let extra = 0;
    let fees = 0;
    let why = '';

    if (sc.kind === 'storm') {
      const zone = STORM_ZONES.find((z) => z.id === sc.zone)!;
      if (p.level === 'arrived' || s.stage === 'anchorage') continue;
      let inZone = 0;
      for (let t = sc.startIn; t < end; t += 0.25) {
        const pr = progressAt(s, p, t, now);
        if (pr >= zone.range[0] && pr <= zone.range[1]) inZone += 0.25;
      }
      if (inZone > 0) {
        extra = inZone * STORM_SLOWDOWN[sc.strength] + 0.3;
        why = `In the storm area for about ${round1(inZone)} day${inZone === 1 ? '' : 's'}. Ships slow down and steer around it.`;
      }
    } else if (sc.port === 'destination') {
      if (p.level === 'arrived') {
        const fee = lateFee(s, p, now);
        if (fee) {
          const freeLeft = Math.max(0, fee.daysLeft);
          const overBefore = Math.max(0, -fee.daysLeft);
          const stuck = Math.max(0, end - Math.max(sc.startIn, freeLeft));
          if (sc.startIn <= freeLeft + 0.01 || overBefore > 0) {
            fees = demurrage(overBefore + stuck) - demurrage(overBefore);
            if (fees > 0) why = `Can’t be picked up during the strike, so it runs past its free days.`;
          }
        }
      } else {
        const ta = Math.max(0, (p.predictedArrival.getTime() - now.getTime()) / DAY);
        const backlog = STRIKE_BACKLOG * sc.days;
        if (ta >= sc.startIn - 0.5 && ta <= end + backlog) {
          const frac = Math.min(1, Math.max(0, (Math.min(ta, end) - sc.startIn) / sc.days));
          const ready = end + backlog * frac;
          extra = Math.max(0, ready - ta);
          why = `Arrives ${ta < end ? 'during the strike' : 'into the backlog after it'} and waits for terminals to clear.`;
        }
      }
    } else {
      if (s.stage === 'booked' || s.stage === 'at_origin') {
        const td = Math.max(0, (s.departure.getTime() - now.getTime()) / DAY);
        const backlog = STRIKE_BACKLOG * sc.days;
        if (td >= sc.startIn - 0.5 && td <= end + backlog) {
          const frac = Math.min(1, Math.max(0, (Math.min(td, end) - sc.startIn) / sc.days));
          extra = Math.max(0, end + backlog * frac - td);
          why = 'Can’t be loaded in Shanghai until the strike ends and the backlog clears.';
        }
      }
    }

    if (extra < 0.05 && fees === 0) continue;
    const title = sc.kind === 'storm' ? 'What-if: storm' : `What-if: ${sc.port === 'destination' ? 'Los Angeles–Long Beach' : 'Shanghai'} strike`;
    const np = extra >= 0.05 ? relevel(s, p, extra, title, why) : p;
    after.set(s.id, np);
    impacts.push({ s, before: p, after: np, extraDays: round1(extra), extraFees: fees, why });
  }

  impacts.sort((a, b) => b.after.missChance - b.before.missChance - (a.after.missChance - a.before.missChance) || b.extraFees - a.extraFees);
  const newlyLate = impacts.filter((i) => i.after.level === 'high' && i.before.level !== 'high');
  return {
    after,
    impacts,
    newlyLate,
    cargoAtRisk: newlyLate.reduce((sum, i) => sum + i.s.cargoValueUsd, 0),
    extraFees: impacts.reduce((sum, i) => sum + i.extraFees, 0),
  };
}

export function scenarioRange(sc: Scenario | null): [number, number] | null {
  if (!sc) return null;
  if (sc.kind === 'storm') return STORM_ZONES.find((z) => z.id === sc.zone)!.range;
  return sc.port === 'destination' ? [0.97, 1] : [0, 0.03];
}
