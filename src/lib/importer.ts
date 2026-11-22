import { toCsv, type Row } from './csv';
import { distanceNm, greatCirclePoint } from './geo';
import { ANCHORAGE, DESTINATION, ORIGIN } from './lane';
import type { Shipment, Stage } from './sim';

const DAY = 86_400_000;
const LANE_NM = distanceNm(ORIGIN.pos, DESTINATION.pos);

/** Import columns. The first group is required; the rest have defaults. */
export const REQUIRED = ['container', 'product', 'units', 'carrier', 'departure', 'carrier_eta', 'needed_by'] as const;
export const OPTIONAL = ['po', 'cargo_value_usd', 'vessel', 'voyage', 'needed_by_reason', 'free_days', 'container_type', 'at_anchorage', 'discharged_at'] as const;

export const templateCsv = (shipments: Shipment[]) =>
  toCsv(shipments, [
    ['container', (s) => s.container],
    ['product', (s) => s.product],
    ['units', (s) => s.units],
    ['carrier', (s) => s.carrier],
    ['departure', (s) => s.departure],
    ['carrier_eta', (s) => s.carrierEta],
    ['needed_by', (s) => s.needBy],
    ['po', (s) => s.po],
    ['cargo_value_usd', (s) => s.cargoValueUsd],
    ['vessel', (s) => s.vessel],
    ['voyage', (s) => s.voyage],
    ['needed_by_reason', (s) => s.needByReason],
    ['free_days', (s) => s.freeDays],
    ['container_type', (s) => s.containerType],
    ['at_anchorage', (s) => (s.stage === 'anchorage' ? 'yes' : '')],
    ['discharged_at', (s) => s.dischargedAt ?? ''],
  ]);

function date(v: string | undefined): Date | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? null;
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const num = (v: string | undefined) => (v ? Number(v.replace(/[$,\s]/g, '')) : NaN);

export interface ImportResult {
  shipments: Shipment[];
  errors: string[];
}

export function importShipments(rows: Row[], now = new Date()): ImportResult {
  const errors: string[] = [];
  const shipments: Shipment[] = [];
  if (!rows.length) return { shipments, errors: ['The file has no data rows.'] };
  const missing = REQUIRED.filter((c) => !(c in rows[0]));
  if (missing.length) return { shipments, errors: [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`] };

  rows.forEach((r, i) => {
    const line = i + 2;
    const departure = date(r.departure);
    const carrierEta = date(r.carrier_eta);
    const needBy = date(r.needed_by);
    const units = num(r.units);
    if (!r.container || !r.product || !r.carrier) return void errors.push(`Row ${line}: container, product and carrier are required.`);
    if (!departure || !carrierEta || !needBy) return void errors.push(`Row ${line}: departure, carrier_eta and needed_by must be dates (YYYY-MM-DD).`);
    if (carrierEta <= departure) return void errors.push(`Row ${line}: carrier_eta must be after departure.`);
    if (!(units > 0)) return void errors.push(`Row ${line}: units must be a positive number.`);

    const elapsed = (now.getTime() - departure.getTime()) / DAY;
    const planned = (carrierEta.getTime() - departure.getTime()) / DAY;
    const discharged = date(r.discharged_at);
    let stage: Stage;
    let progress = 0;
    let position = ORIGIN.pos;
    let speedKn: number | null = null;
    if (discharged || elapsed >= planned + 0.5) stage = 'at_terminal';
    else if (/^(y|yes|true|1)$/i.test(r.at_anchorage ?? '')) stage = 'anchorage';
    else if (elapsed >= 0) stage = 'sailing';
    else stage = elapsed < -2 ? 'booked' : 'at_origin';
    if (stage === 'sailing') {
      progress = Math.min(0.985, elapsed / planned);
      position = greatCirclePoint(ORIGIN.pos, DESTINATION.pos, progress);
      speedKn = +(LANE_NM / planned / 24).toFixed(1);
    } else if (stage === 'anchorage') {
      progress = 0.995;
      position = ANCHORAGE;
      speedKn = 0.2;
    } else if (stage === 'at_terminal') {
      progress = 1;
      position = DESTINATION.pos;
    }
    const value = num(r.cargo_value_usd);
    const type = (r.container_type ?? '').toUpperCase();
    shipments.push({
      id: `IMP-${String(i + 1).padStart(3, '0')}`,
      container: r.container.toUpperCase(),
      containerType: type === '20GP' || type === '40GP' || type === '40HC' ? type : '40HC',
      po: r.po || `IMPORT-${i + 1}`,
      product: r.product,
      units: Math.round(units),
      cargoValueUsd: value > 0 ? value : Math.round(units * 15),
      vessel: r.vessel || 'Vessel not given',
      voyage: r.voyage || '—',
      carrier: r.carrier,
      stage,
      departure,
      carrierEta,
      needBy,
      needByReason: r.needed_by_reason || 'Needed-by date from your file',
      progress,
      position,
      speedKn,
      distanceRemainingNm: Math.round(LANE_NM * (1 - progress)),
      dischargedAt: stage === 'at_terminal' ? new Date(Math.min(now.getTime(), (discharged ?? carrierEta).getTime())) : null,
      freeDays: num(r.free_days) >= 0 ? num(r.free_days) : 4,
      simulated: false,
    });
  });
  return { shipments, errors };
}
