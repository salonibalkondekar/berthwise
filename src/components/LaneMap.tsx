import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { greatCirclePath } from '../lib/geo';
import { DESTINATION, ORIGIN, WAYPOINTS } from '../lib/lane';
import { STAGE_LABEL, type Shipment } from '../lib/sim';
import { fmt, seaSeverity, SEVERITY_LABEL, type WeatherPoint } from '../lib/signals';

const LANE = greatCirclePath(ORIGIN.pos, DESTINATION.pos, 96);

const shipIcon = (selected: boolean, stage: Shipment['stage']) =>
  L.divIcon({
    className: '',
    html: `<div class="ship-pin ${selected ? 'selected' : ''} pin-${stage}"><span>SIM</span></div>`,
    iconSize: [34, 20],
    iconAnchor: [17, 10],
  });

interface Props {
  shipments: Shipment[];
  weather: WeatherPoint[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function LaneMap({ shipments, weather, selectedId, onSelect }: Props) {
  // Ships sitting at the same port are fanned out slightly so each pin stays clickable.
  const stacks = new Map<string, number>();
  const placed = shipments.map((s) => {
    const key = s.position.map((x) => x.toFixed(1)).join(',');
    const n = stacks.get(key) ?? 0;
    stacks.set(key, n + 1);
    return { s, pos: [s.position[0] - n * 0.9, s.position[1] + (s.progress >= 1 ? n * 0.6 : -n * 0.6)] as [number, number] };
  });

  return (
    <MapContainer
      className="map"
      bounds={[[22, 118], [50, 246]]}
      boundsOptions={{ padding: [30, 30] }}
      minZoom={2}
      worldCopyJump={false}
      scrollWheelZoom
    >
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

      {WAYPOINTS.map((wp, i) => {
        const w = weather?.[i];
        const sev = seaSeverity(w?.waveHeightM, w?.windKn);
        return (
          <CircleMarker
            key={wp.id}
            center={wp.pos}
            radius={7}
            pathOptions={{ className: `wx wx-${sev}`, weight: 2 }}
          >
            <Tooltip>
              <strong>{wp.name}</strong> · live
              <br />
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
          icon={shipIcon(s.id === selectedId, s.stage)}
          zIndexOffset={s.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(s.id) }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            <strong>{s.container}</strong> (simulated)
            <br />
            {s.product} · {STAGE_LABEL[s.stage]}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
