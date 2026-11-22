import { useEffect, useState } from 'react';

export interface AisVessel {
  mmsi: number;
  name: string | null;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  destination: string | null;
  eta: number | null;
  zone: 'la_port' | 'la_anchorage' | 'la_approach' | 'shanghai' | 'at_sea';
  lastSeen: number;
}

export interface AisArrival {
  mmsi: number;
  name: string | null;
  arrivedAt: number;
  berthwiseEta: number | null;
  estimateMadeAt: number | null;
  estimateDistanceNm: number | null;
  declaredEta: number | null;
  destination: string | null;
}

export interface AisSnapshot {
  status: { configured: boolean; connected: boolean; since: number | null; messages: number; lastMessageAt: number | null; error: string | null };
  counts: { cargoShips: number; shanghai: number; atSea: number; laApproach: number; laAnchorage: number; laPort: number; trackedToLa: number };
  vessels: AisVessel[];
  arrivals: AisArrival[];
}

export function useAis(intervalMs = 60_000) {
  const [snap, setSnap] = useState<AisSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = () =>
      fetch('/api/ais')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && j && setSnap(j))
        .catch(() => {});
    pull();
    const t = setInterval(pull, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [intervalMs]);
  return snap;
}

const hours = (ms: number) => ms / 3_600_000;
const mae = (v: number[]) => (v.length ? v.reduce((s, x) => s + Math.abs(x), 0) / v.length : null);

/** Arrival error in hours: positive means the ship arrived later than the estimate. */
export const errorHours = (a: AisArrival, eta: number | null) => (eta == null ? null : hours(a.arrivedAt - eta));

export function realScore(arrivals: AisArrival[]) {
  const bw = arrivals.map((a) => errorHours(a, a.berthwiseEta)).filter((x): x is number => x != null);
  const declared = arrivals.map((a) => errorHours(a, a.declaredEta)).filter((x): x is number => x != null);
  return { n: arrivals.length, graded: bw.length, berthwiseMaeH: mae(bw), declaredN: declared.length, declaredMaeH: mae(declared) };
}
