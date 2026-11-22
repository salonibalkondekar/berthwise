import { useEffect } from 'react';
import type { AisVessel } from '../lib/ais';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { greatCirclePath, type LatLon } from '../lib/geo';
import { DESTINATION, ORIGIN, WAYPOINTS } from '../lib/lane';
import { STAGE_LABEL, type Shipment } from '../lib/sim';
import { RISK_LABEL, type Prediction } from '../lib/predict';
import { fmt, seaSeverity, SEVERITY_LABEL, type WeatherPoint } from '../lib/signals';

const LANE = greatCirclePath(ORIGIN.pos, DESTINATION.pos, 96);
const LANE_BOUNDS = L.latLngBounds([
  [22, 118],
  [52, 246],
]);

const shipIcon = (selected: boolean, stage: Shipment['stage'], risk: string, sim: boolean) =>
  L.divIcon({
    className: '',
    html: `<div class="ship-pin ${selected ? 'selected' : ''} pin-${stage} pin-risk-${risk}"><span>${sim ? 'SIM' : 'CSV'}</span></div>`,
    iconSize: [34, 20],
    iconAnchor: [17, 10],
  });

interface Props {
  shipments: Shipment[];
  weather: WeatherPoint[] | null;
  preds: Map<string, Prediction>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  resetKey: number;
  highlight?: [number, number] | null;
  vessels?: AisVessel[] | null;
}

function ViewController({ target, resetKey }: { target: LatLon | null; resetKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 4), { duration: 0.8 });
  }, [map, target?.[0], target?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (resetKey) map.flyToBounds(LANE_BOUNDS, { padding: [30, 30], duration: 0.8 });
  }, [map, resetKey]);
  return null;
}

export function LaneMap({ shipments, weather, preds, selectedId, onSelect, resetKey, highlight, vessels }: Props) {
  // Ships sitting at the same port are fanned out slightly so each pin stays clickable.
  const stacks = new Map<string, number>();
  const placed = shipments.map((s) => {
    const key = s.position.map((x) => x.toFixed(1)).join(',');
    const n = stacks.get(key) ?? 0;
    stacks.set(key, n + 1);
    return { s, pos: [s.position[0] - n * 0.9, s.position[1] + (s.progress >= 1 ? n * 0.6 : -n * 0.6)] as LatLon };
  });
  const target = placed.find((p) => p.s.id === selectedId)?.pos ?? null;

  return (
    <MapContainer className="map" bounds={LANE_BOUNDS} boundsOptions={{ padding: [30, 30] }} minZoom={2} scrollWheelZoom>
      <ViewController target={target} resetKey={resetKey} />
      <TileLayer
        attribution="Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={10}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={10}
      />
      <Polyline positions={LANE} pathOptions={{ color: 'var(--lane)', weight: 3, dashArray: '6 6' }} />
      {highlight && (
        <Polyline
          positions={LANE.slice(Math.floor(highlight[0] * (LANE.length - 1)), Math.ceil(highlight[1] * (LANE.length - 1)) + 1)}
          pathOptions={{ color: '#dc2626', weight: 22, opacity: 0.3, lineCap: 'round' }}
        >
          <Tooltip sticky>What-if disruption area</Tooltip>
        </Polyline>
      )}

      {WAYPOINTS.map((wp, i) => {
        const w = weather?.[i];
        const sev = weather ? seaSeverity(w?.waveHeightM, w?.windKn) : 'unknown';
        return (
          <CircleMarker key={wp.id} center={wp.pos} radius={7} pathOptions={{ className: `wx wx-${sev}`, weight: 2 }}>
            <Tooltip direction="top" offset={[0, -6]}>
              <div className="tt-title">
                {wp.name} <span className="tt-live">LIVE</span>
              </div>
              {SEVERITY_LABEL[sev]} · waves {fmt(w?.waveHeightM, 1, ' m')} · wind {fmt(w?.windKn, 0, ' kn')}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {[ORIGIN, DESTINATION].map((p) => (
        <CircleMarker key={p.code} center={p.pos} radius={9} pathOptions={{ className: 'port-dot', weight: 3 }}>
          <Tooltip permanent direction="bottom" offset={[0, 8]} className="port-label">
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}

      {placed.map(({ s, pos }) => (
        <Marker
          key={s.id}
          position={pos}
          icon={shipIcon(s.id === selectedId, s.stage, preds.get(s.id)?.level ?? 'none', s.simulated)}
          zIndexOffset={s.id === selectedId ? 1000 : 0}
          keyboard
          title={`${s.product}, ${s.simulated ? 'simulated' : 'imported'} shipment`}
          eventHandlers={{ click: () => onSelect(s.id) }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            <div className="tt-title">
              {s.product} {s.simulated && <span className="tt-sim">SIM</span>}
            </div>
            <span className="mono">{s.container}</span> · {STAGE_LABEL[s.stage]}
            {preds.get(s.id) && preds.get(s.id)!.level !== 'arrived' && <div>{RISK_LABEL[preds.get(s.id)!.level]}</div>}
          </Tooltip>
        </Marker>
      ))}
      {vessels?.map((v) => (
        <CircleMarker key={v.mmsi} center={[v.lat, v.lon < 0 ? v.lon + 360 : v.lon]} radius={3.5} className="ais" pathOptions={{ weight: 1 }}>
          <Tooltip>
            <strong>LIVE AIS</strong> · {v.name ?? `MMSI ${v.mmsi}`} · {v.sog != null ? `${v.sog.toFixed(1)} kn` : 'speed n/a'}
            {v.destination ? ` · to ${v.destination}` : ''}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
