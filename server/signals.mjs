import { WAYPOINTS } from './lane.mjs';

const TTL_MS = 30 * 60 * 1000;
let cache = null;

const PORTWATCH =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Ports_Data/FeatureServer/0/query';
const PORTS = [
  { key: 'origin', portid: 'port1188', name: 'Shanghai' },
  { key: 'destination', portid: 'port664', name: 'Los Angeles-Long Beach' },
];

async function getJson(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error(`${new URL(url).host}: ${lastError?.message ?? lastError}`);
}

async function fetchWeather() {
  const lat = WAYPOINTS.map((w) => w.lat).join(',');
  const lon = WAYPOINTS.map((w) => w.lon).join(',');
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&current=wave_height,wave_period,swell_wave_height&daily=wave_height_max&forecast_days=7&timezone=GMT`;
  const windUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=wind_speed_10m,wind_gusts_10m&daily=wind_speed_10m_max,wind_gusts_10m_max&forecast_days=7&wind_speed_unit=kn&timezone=GMT`;
  const [marine, wind] = await Promise.all([getJson(marineUrl), getJson(windUrl)]);
  const m = Array.isArray(marine) ? marine : [marine];
  const w = Array.isArray(wind) ? wind : [wind];
  return WAYPOINTS.map((wp, i) => ({
    id: wp.id,
    lat: wp.lat,
    lon: wp.lon,
    observedAt: m[i]?.current?.time ?? null,
    waveHeightM: m[i]?.current?.wave_height ?? null,
    wavePeriodS: m[i]?.current?.wave_period ?? null,
    swellHeightM: m[i]?.current?.swell_wave_height ?? null,
    windKn: w[i]?.current?.wind_speed_10m ?? null,
    gustKn: w[i]?.current?.wind_gusts_10m ?? null,
    forecast: (m[i]?.daily?.time ?? []).map((date, d) => ({
      date,
      waveMaxM: m[i].daily.wave_height_max?.[d] ?? null,
      windMaxKn: w[i]?.daily?.wind_speed_10m_max?.[d] ?? null,
      gustMaxKn: w[i]?.daily?.wind_gusts_10m_max?.[d] ?? null,
    })),
  }));
}

async function fetchPort({ key, portid, name }) {
  const since = new Date(Date.now() - 150 * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    where: `portid='${portid}' AND date >= DATE '${since}'`,
    outFields: 'date,portcalls_container,import_container,export_container',
    orderByFields: 'date ASC',
    resultRecordCount: '400',
    f: 'json',
  });
  const data = await getJson(`${PORTWATCH}?${params}`);
  if (data.error) throw new Error(data.error.message);
  const series = data.features.map(({ attributes: a }) => ({
    date: typeof a.date === 'number' ? new Date(a.date).toISOString().slice(0, 10) : String(a.date).slice(0, 10),
    containerCalls: a.portcalls_container,
    importTeuProxy: a.import_container,
  }));
  const last7 = series.slice(-7);
  const prior = series.slice(-97, -7);
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x.containerCalls, 0) / xs.length : null);
  const recent = avg(last7);
  const baseline = avg(prior);
  return {
    key,
    name,
    portid,
    asOf: series.at(-1)?.date ?? null,
    recent7dAvgCalls: recent,
    baseline90dAvgCalls: baseline,
    changePct: recent != null && baseline ? ((recent - baseline) / baseline) * 100 : null,
    series: series.slice(-90),
  };
}

async function settle(p) {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: String(e.message ?? e) };
  }
}

export async function getSignals({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const [weather, origin, destination] = await Promise.all([
    settle(fetchWeather()),
    settle(fetchPort(PORTS[0])),
    settle(fetchPort(PORTS[1])),
  ]);
  // A source that fails keeps its last good reading instead of disappearing.
  const prev = cache?.data;
  const data = {
    fetchedAt: new Date().toISOString(),
    weather: weather.ok ? weather.value : (prev?.weather ?? null),
    ports: {
      origin: origin.ok ? origin.value : (prev?.ports.origin ?? null),
      destination: destination.ok ? destination.value : (prev?.ports.destination ?? null),
    },
    errors: [weather, origin, destination].filter((r) => !r.ok).map((r) => r.error),
    sources: [
      { name: 'Open-Meteo Marine API', url: 'https://open-meteo.com/en/docs/marine-weather-api', what: 'Wave and swell height, current + 7-day max' },
      { name: 'Open-Meteo Forecast API', url: 'https://open-meteo.com/en/docs', what: 'Wind speed and gusts, current + 7-day max' },
      { name: 'IMF PortWatch', url: 'https://portwatch.imf.org/', what: 'Daily container vessel port calls from AIS (about 1 week lag)' },
    ],
  };
  cache = { at: Date.now(), data };
  return data;
}
