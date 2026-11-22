import { WAYPOINTS } from './lane';
import { LANE_NM, type Shipment } from './sim';
import { seaSeverity, SEVERITY_LABEL, type Severity, type Signals } from './signals';

/**
 * A transparent, rule-based arrival estimate. Each factor adds (or removes) days from the carrier ETA
 * and says why. Live factors use real weather and port data; simulated ones use invented demo history.
 */

export type Source = 'live' | 'sim';
export type RiskLevel = 'high' | 'medium' | 'low' | 'arrived';

export interface Factor {
  id: string;
  title: string;
  detail: string;
  days: number;
  source: Source;
}

export interface Prediction {
  shipmentId: string;
  predictedArrival: Date;
  rangeDays: number; // ± days, roughly one standard deviation
  delayDays: number; // vs carrier ETA
  slackDays: number; // needed-by minus predicted arrival
  missChance: number; // 0..1, chance of arriving after the needed-by date
  level: RiskLevel;
  factors: Factor[];
  liveDataUsed: boolean;
}

const DAY = 86_400_000;

/** Fraction of speed lost in a day of these conditions. Rough figures for a large container ship. */
const SPEED_LOSS: Record<Severity, number> = { calm: 0, moderate: 0.03, rough: 0.12, severe: 0.25, unknown: 0 };

/** SIMULATED: average days late per carrier on this lane, as if from past voyages. */
export const CARRIER_HISTORY: Record<string, { avgLateDays: number; onTimePct: number }> = {
  'Orion Lines': { avgLateDays: 0.9, onTimePct: 61 },
  'Kestrel Ocean': { avgLateDays: 0.3, onTimePct: 78 },
  'Meridian Box Co.': { avgLateDays: 1.6, onTimePct: 49 },
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function normalCdf(z: number) {
  // Abramowitz–Stegun approximation of the error function
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

function placePhrase(name: string) {
  if (/^(Off|South)\b/.test(name)) return name[0].toLowerCase() + name.slice(1);
  if (/^Sea\b|Pacific/.test(name)) return `in the ${name}`;
  return `near ${name}`;
}

function weatherFactor(s: Shipment, signals: Signals | null, plannedKn: number): Factor | null {
  const weather = signals?.weather;
  if (!weather || s.stage === 'at_terminal' || s.stage === 'anchorage') return null;
  const start = s.stage === 'sailing' ? s.progress : 0;
  const startDay = s.stage === 'sailing' ? 0 : Math.max(0, Math.ceil((s.departure.getTime() - Date.now()) / DAY));
  const perDay = ((s.speedKn ?? plannedKn) * 24) / LANE_NM;

  let lost = 0;
  let worst: { sev: Severity; name: string; date: string; wave: number | null } | null = null;
  for (let day = startDay; day < 7; day++) {
    const f = start + (day - startDay + 0.5) * perDay;
    if (f >= 1) break;
    let best = -1;
    WAYPOINTS.forEach((wp, i) => {
      if (weather[i]?.forecast?.[day] && (best < 0 || Math.abs(wp.fraction - f) < Math.abs(WAYPOINTS[best].fraction - f))) best = i;
    });
    if (best < 0) continue;
    const fc = weather[best].forecast[day];
    const sev = seaSeverity(fc.waveMaxM, fc.windMaxKn);
    lost += SPEED_LOSS[sev];
    if (SPEED_LOSS[sev] > 0 && (!worst || SPEED_LOSS[sev] > SPEED_LOSS[worst.sev])) {
      worst = { sev, name: WAYPOINTS[best].name, date: fc.date, wave: fc.waveMaxM };
    }
  }
  const days = round1(lost);
  if (!worst || days < 0.1) {
    return {
      id: 'weather',
      title: 'Calm enough on the route ahead',
      detail: 'No rough seas in the 7-day forecast along the part of the route this ship will be on.',
      days: 0,
      source: 'live',
    };
  }
  const when = weekdayFmt.format(new Date(`${worst.date}T12:00:00Z`));
  return {
    id: 'weather',
    title: `${SEVERITY_LABEL[worst.sev]} seas ahead`,
    detail: `Forecast ${worst.wave?.toFixed(1) ?? '—'} m waves ${placePhrase(worst.name)} on ${when}, when this ship should be there. Ships slow down in seas like that.`,
    days,
    source: 'live',
  };
}

function portFactor(key: 'origin' | 'destination', signals: Signals | null): Factor | null {
  const port = signals?.ports[key];
  if (!port || port.changePct == null) return null;
  const pct = port.changePct;
  const days = round1(clamp((pct / 100) * 4, -0.4, 3));
  const name = key === 'origin' ? 'Shanghai' : 'Los Angeles–Long Beach';
  const busier = pct >= 0;
  return {
    id: `port-${key}`,
    title: Math.abs(days) < 0.1 ? `${name} traffic is normal` : busier ? `${name} is busier than usual` : `${name} is quieter than usual`,
    detail: `${port.recent7dAvgCalls?.toFixed(1)} container ships a day over the last week vs ${port.baseline90dAvgCalls?.toFixed(1)} on average over 90 days (${busier ? '+' : ''}${pct.toFixed(0)}%). ${busier ? 'More ships means longer waits for a berth.' : 'Fewer ships means shorter waits for a berth.'}`,
    days: Math.abs(days) < 0.1 ? 0 : days,
    source: 'live',
  };
}

export function predict(s: Shipment, signals: Signals | null, now = new Date()): Prediction {
  const factors: Factor[] = [];
  const etaDaysFromNow = (s.carrierEta.getTime() - now.getTime()) / DAY;
  const plannedDays = (s.carrierEta.getTime() - s.departure.getTime()) / DAY;
  const plannedKn = LANE_NM / plannedDays / 24;
  let base = s.carrierEta.getTime();

  if (s.stage === 'at_terminal') {
    const arrived = s.dischargedAt ?? s.carrierEta;
    const slack = (s.needBy.getTime() - arrived.getTime()) / DAY;
    return {
      shipmentId: s.id,
      predictedArrival: arrived,
      rangeDays: 0,
      delayDays: 0,
      slackDays: slack,
      missChance: slack < 0 ? 1 : 0,
      level: 'arrived',
      factors: [],
      liveDataUsed: false,
    };
  }

  if (s.stage === 'sailing' && s.speedKn) {
    const projected = s.distanceRemainingNm / (s.speedKn * 24);
    const days = round1(projected - etaDaysFromNow);
    const faster = s.speedKn >= plannedKn;
    factors.push({
      id: 'pace',
      title: Math.abs(days) < 0.1 ? 'On pace for the carrier ETA' : faster ? 'Sailing ahead of schedule' : 'Sailing behind schedule',
      detail: `Doing ${s.speedKn} kn with ${s.distanceRemainingNm.toLocaleString()} nm to go. It needs about ${plannedKn.toFixed(1)} kn to arrive on the carrier ETA.`,
      days: Math.abs(days) < 0.1 ? 0 : days,
      source: 'sim',
    });
  }

  if (s.stage === 'anchorage') {
    const waited = Math.max(0, (now.getTime() - s.carrierEta.getTime()) / DAY);
    const remaining = round1(Math.max(0.5, 2 - waited));
    base = now.getTime();
    factors.push({
      id: 'anchorage',
      title: 'Waiting at anchorage for a berth',
      detail: `The ship is anchored off San Pedro Bay${waited >= 0.5 ? ` and has waited about ${waited.toFixed(1)} days` : ''}. A typical wait is about 2 days.`,
      days: remaining,
      source: 'sim',
    });
  }

  if (s.stage === 'booked' || s.stage === 'at_origin') {
    const o = portFactor('origin', signals);
    if (o) factors.push({ ...o, detail: `${o.detail} This can hold up loading and departure.` });
  }

  const w = weatherFactor(s, signals, plannedKn);
  if (w) factors.push(w);

  const dst = portFactor('destination', signals);
  if (dst) factors.push(dst);

  const hist = CARRIER_HISTORY[s.carrier];
  if (hist) {
    const remainingShare = s.stage === 'anchorage' ? 0 : 1 - s.progress;
    const days = round1(hist.avgLateDays * remainingShare);
    if (days >= 0.1) {
      factors.push({
        id: 'carrier',
        title: `${s.carrier} often runs late`,
        detail: `On this lane ${s.carrier} arrives on time ${hist.onTimePct}% of the time and is ${hist.avgLateDays} days late on average.`,
        days,
        source: 'sim',
      });
    }
  }

  const delayRaw = factors.reduce((sum, f) => sum + f.days, 0) + (base - s.carrierEta.getTime()) / DAY;
  const predicted = new Date(Math.max(now.getTime(), base + factors.reduce((sum, f) => sum + f.days, 0) * DAY));
  const daysOut = Math.max(0, (predicted.getTime() - now.getTime()) / DAY);
  const sigma = 0.7 + 0.12 * daysOut + (s.stage === 'booked' ? 0.6 : s.stage === 'at_origin' ? 0.3 : 0);
  const slack = (s.needBy.getTime() - predicted.getTime()) / DAY;
  const missChance = 1 - normalCdf(slack / sigma);
  const level: RiskLevel = missChance >= 0.5 ? 'high' : missChance >= 0.2 ? 'medium' : 'low';

  factors.sort((a, b) => Math.abs(b.days) - Math.abs(a.days));

  return {
    shipmentId: s.id,
    predictedArrival: predicted,
    rangeDays: round1(sigma),
    delayDays: round1(delayRaw),
    slackDays: slack,
    missChance,
    level,
    factors,
    liveDataUsed: !!(signals?.weather || signals?.ports.destination),
  };
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  high: 'Likely late',
  medium: 'At risk',
  low: 'On track',
  arrived: 'Arrived',
};

/** Ranks shipments for the morning list: highest chance of missing the needed-by date first, then cargo value. */
export function rankByRisk(shipments: Shipment[], preds: Map<string, Prediction>) {
  return shipments
    .filter((s) => preds.get(s.id)?.level !== 'arrived')
    .sort((a, b) => {
      const pa = preds.get(a.id)!;
      const pb = preds.get(b.id)!;
      return pb.missChance - pa.missChance || b.cargoValueUsd - a.cargoValueUsd;
    });
}

export function topReason(p: Prediction): Factor | null {
  return p.factors.find((f) => f.days > 0) ?? null;
}
