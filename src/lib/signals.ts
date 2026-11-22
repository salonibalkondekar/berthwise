export interface ForecastDay {
  date: string;
  waveMaxM: number | null;
  windMaxKn: number | null;
  gustMaxKn: number | null;
}

export interface WeatherPoint {
  id: string;
  lat: number;
  lon: number;
  observedAt: string | null;
  waveHeightM: number | null;
  wavePeriodS: number | null;
  swellHeightM: number | null;
  windKn: number | null;
  gustKn: number | null;
  forecast: ForecastDay[];
}

export interface PortSignal {
  key: 'origin' | 'destination';
  name: string;
  portid: string;
  asOf: string | null;
  recent7dAvgCalls: number | null;
  baseline90dAvgCalls: number | null;
  changePct: number | null;
  series: { date: string; containerCalls: number; importTeuProxy: number }[];
}

export interface Signals {
  fetchedAt: string;
  weather: WeatherPoint[] | null;
  ports: { origin: PortSignal | null; destination: PortSignal | null };
  errors: string[];
  sources: { name: string; url: string; what: string }[];
}

export type Severity = 'calm' | 'moderate' | 'rough' | 'severe' | 'unknown';

export function seaSeverity(waveM: number | null | undefined, windKn?: number | null): Severity {
  if (waveM == null) return 'unknown';
  const w = waveM;
  const k = windKn ?? 0;
  if (w >= 6 || k >= 40) return 'severe';
  if (w >= 4 || k >= 30) return 'rough';
  if (w >= 2.5 || k >= 20) return 'moderate';
  return 'calm';
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  calm: 'Calm',
  moderate: 'Moderate',
  rough: 'Rough',
  severe: 'Severe',
  unknown: 'No wave data',
};

export const fmt = (n: number | null | undefined, digits = 1, unit = '') =>
  n == null ? '—' : `${n.toFixed(digits)}${unit}`;
