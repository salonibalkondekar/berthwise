import { WAYPOINTS } from '../lib/lane';
import type { Shipment } from '../lib/sim';
import { seaSeverity, SEVERITY_LABEL, type Severity, type WeatherPoint } from '../lib/signals';

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

export const d = (x: Date | null) => (x ? dateFmt.format(x) : '—');
export const weekday = (iso: string) => weekdayFmt.format(new Date(`${iso}T12:00:00`));
export const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const DAY = 86_400_000;
const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
export const daysFromToday = (x: Date, now = new Date()) => Math.round((startOfDay(x) - startOfDay(now)) / DAY);
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

export function relDays(n: number) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return `${h} h ago`;
}

export function SimTag() {
  return (
    <span className="tag tag-sim" title="Invented demo data">
      Simulated
    </span>
  );
}

export function LiveTag() {
  return (
    <span className="tag tag-live" title="Real reading from a free public source">
      Live
    </span>
  );
}

export function SeverityChip({ sev }: { sev: Severity }) {
  return <span className={`chip chip-${sev}`}>{SEVERITY_LABEL[sev]}</span>;
}

export const SEA_SENTENCE: Record<Severity, string> = {
  calm: 'Calm seas. Ships hold normal speed.',
  moderate: 'Moderate seas, normal for the open Pacific.',
  rough: 'Rough seas. Ships often slow down in conditions like these.',
  severe: 'Severe seas. Ships often slow down or steer around conditions like these.',
  unknown: 'No wave reading here right now.',
};

/** Nearest sampled weather point to a shipment that has a wave reading. */
export function weatherFor(s: Shipment, weather: WeatherPoint[] | null) {
  if (!weather) return null;
  let best = -1;
  let bestDist = Infinity;
  WAYPOINTS.forEach((wp, i) => {
    const dist = Math.abs(wp.fraction - s.progress);
    if (weather[i]?.waveHeightM != null && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  if (best < 0) return null;
  const point = weather[best];
  return { point, name: WAYPOINTS[best].name, sev: seaSeverity(point.waveHeightM, point.windKn) };
}
