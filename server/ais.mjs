// Live ship positions and real arrivals at Los Angeles / Long Beach from AISStream (https://aisstream.io).
// The API key stays on the server (AISSTREAM_API_KEY); the browser only sees /api/ais.
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'ais-state.json');
const BOXES = [
  [[20, 115], [62, 180]],
  [[20, -180], [62, -115]],
];
const ZONES = {
  laPort: { lat: [33.7, 33.78], lon: [-118.3, -118.16] },
  laAnchorage: { lat: [33.55, 33.73], lon: [-118.35, -117.95] },
  laApproach: { lat: [32.8, 34.3], lon: [-119.8, -117.6] },
  shanghai: { lat: [29.5, 32.5], lon: [120.5, 123.5] },
};
const LA_BERTH = [33.745, -118.235];
const LA_DEST = /LAX|LGB|LOS ?ANG|LONG ?BEACH|USLA|US ?LB|L\.?A\.?\b|SAN ?PEDRO/i;
const STALE_MS = 3 * 3600_000;

const vessels = new Map();
let arrivals = [];
const status = { configured: !!process.env.AISSTREAM_API_KEY, connected: false, since: null, messages: 0, lastMessageAt: null, error: null };

const inZone = (z, lat, lon) => lat >= z.lat[0] && lat <= z.lat[1] && lon >= z.lon[0] && lon <= z.lon[1];
const zoneOf = (lat, lon) =>
  inZone(ZONES.laPort, lat, lon) ? 'la_port'
  : inZone(ZONES.laAnchorage, lat, lon) ? 'la_anchorage'
  : inZone(ZONES.laApproach, lat, lon) ? 'la_approach'
  : inZone(ZONES.shanghai, lat, lon) ? 'shanghai'
  : 'at_sea';

function nm([a, b], [c, d]) {
  const r = Math.PI / 180, R = 3440.065;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function parseEta(e, now = new Date()) {
  if (!e || !e.Month || !e.Day || e.Month > 12 || e.Day > 31 || e.Hour > 23 || e.Minute > 59) return null;
  let t = Date.UTC(now.getUTCFullYear(), e.Month - 1, e.Day, e.Hour, e.Minute);
  if (t < now.getTime() - 180 * 86400_000) t = Date.UTC(now.getUTCFullYear() + 1, e.Month - 1, e.Day, e.Hour, e.Minute);
  return t;
}

function vessel(mmsi) {
  let v = vessels.get(mmsi);
  if (!v) vessels.set(mmsi, (v = { mmsi, name: null, type: null, destination: null, eta: null, lat: null, lon: null, sog: null, cog: null, lastSeen: 0, zone: null, estimate: null, lastArrivalAt: 0 }));
  return v;
}

function onPosition(mmsi, name, lat, lon, sog, cog, now) {
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  const v = vessel(mmsi);
  if (name && !v.name) v.name = name.trim() || null;
  Object.assign(v, { lat, lon, sog: sog > 102 ? null : sog, cog: cog >= 360 ? null : cog, lastSeen: now, zone: zoneOf(lat, lon) });
  const cargo = v.type != null && v.type >= 70 && v.type <= 79;
  if (!cargo) return;

  // Berthwise's estimate: first sighting heading for the berths, distance over current speed.
  const boundForLa = v.zone === 'la_approach' || (v.destination && LA_DEST.test(v.destination) && v.zone !== 'la_port');
  if (boundForLa && !v.estimate && v.sog > 3) {
    const dist = nm([lat, lon], LA_BERTH);
    v.estimate = { madeAt: now, eta: now + (dist / v.sog) * 3600_000, distanceNm: Math.round(dist), declaredEta: v.eta };
  }

  if (v.zone === 'la_port' && v.sog != null && v.sog < 1 && now - v.lastArrivalAt > 24 * 3600_000) {
    v.lastArrivalAt = now;
    arrivals.push({
      mmsi, name: v.name, arrivedAt: now,
      berthwiseEta: v.estimate?.eta ?? null,
      estimateMadeAt: v.estimate?.madeAt ?? null,
      estimateDistanceNm: v.estimate?.distanceNm ?? null,
      declaredEta: v.estimate?.declaredEta ?? v.eta ?? null,
      destination: v.destination,
    });
    arrivals = arrivals.slice(-500);
    v.estimate = null;
    save();
  }
}

function onMessage(buf) {
  let m;
  try { m = JSON.parse(buf); } catch { return; }
  const now = Date.now();
  status.messages++;
  status.lastMessageAt = now;
  const meta = m.MetaData ?? {};
  if (m.MessageType === 'ShipStaticData') {
    const s = m.Message.ShipStaticData;
    const v = vessel(s.UserID);
    v.name = s.Name?.trim() || v.name;
    v.type = s.Type ?? v.type;
    v.destination = s.Destination?.trim() || v.destination;
    v.eta = parseEta(s.Eta) ?? v.eta;
  } else if (m.MessageType === 'PositionReport') {
    const p = m.Message.PositionReport;
    onPosition(p.UserID, meta.ShipName, p.Latitude, p.Longitude, p.Sog, p.Cog, now);
  }
}

let retry = 0;
function connect() {
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  ws.on('open', () => {
    ws.send(JSON.stringify({ APIKey: process.env.AISSTREAM_API_KEY, BoundingBoxes: BOXES, FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
    Object.assign(status, { connected: true, since: Date.now(), error: null });
    retry = 0;
  });
  ws.on('message', onMessage);
  ws.on('error', (e) => { status.error = e.message; });
  ws.on('close', () => {
    status.connected = false;
    setTimeout(connect, Math.min(60_000, 2000 * 2 ** retry++));
  });
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const keep = [...vessels.values()].filter((v) => v.type != null || v.estimate);
    fs.writeFileSync(STATE_FILE, JSON.stringify({ arrivals, vessels: keep }));
  } catch (e) { status.error = `save: ${e.message}`; }
}

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    arrivals = s.arrivals ?? [];
    for (const v of s.vessels ?? []) vessels.set(v.mmsi, v);
  } catch { /* first run */ }
}

export function startAis() {
  if (!status.configured) return;
  load();
  connect();
  setInterval(() => {
    const cutoff = Date.now() - 7 * 86400_000;
    for (const [k, v] of vessels) if (v.lastSeen < cutoff && !v.estimate) vessels.delete(k);
    save();
  }, 60_000);
}

export function aisSnapshot() {
  const now = Date.now();
  const live = [...vessels.values()].filter((v) => v.lat != null && v.type >= 70 && v.type <= 79 && now - v.lastSeen < STALE_MS);
  const count = (z) => live.filter((v) => v.zone === z).length;
  return {
    status: { ...status },
    counts: {
      cargoShips: live.length,
      shanghai: count('shanghai'),
      atSea: count('at_sea'),
      laApproach: count('la_approach'),
      laAnchorage: live.filter((v) => v.zone === 'la_anchorage' && v.sog != null && v.sog < 1).length,
      laPort: count('la_port'),
      trackedToLa: [...vessels.values()].filter((v) => v.estimate).length,
    },
    vessels: live.map(({ mmsi, name, lat, lon, sog, cog, destination, eta, zone, lastSeen }) => ({ mmsi, name, lat, lon, sog, cog, destination, eta, zone, lastSeen })),
    arrivals: arrivals.slice(-100),
  };
}
