export type LatLon = [number, number];

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Point at fraction f along the great circle from a to b. Longitudes are unwrapped to stay continuous across the Pacific. */
export function greatCirclePoint(a: LatLon, b: LatLon, f: number): LatLon {
  const [la1, lo1] = [toRad(a[0]), toRad(a[1])];
  const [la2, lo2] = [toRad(b[0]), toRad(b[1])];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((la2 - la1) / 2) ** 2 +
          Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2,
      ),
    );
  if (d === 0) return a;
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
  let lon = toDeg(Math.atan2(y, x));
  if (lon < 0) lon += 360;
  return [lat, lon];
}

export function greatCirclePath(a: LatLon, b: LatLon, n = 64): LatLon[] {
  return Array.from({ length: n + 1 }, (_, i) => greatCirclePoint(a, b, i / n));
}

/** Haversine distance in nautical miles. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(h));
}

/** Longitude in -180..180 for APIs. */
export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
