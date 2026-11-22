// Mirror of src/lib/lane.ts waypoint math for the server (kept tiny to avoid a TS build step).
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function gc(a, b, f) {
  const [la1, lo1, la2, lo2] = [a[0], a[1], b[0], b[1]].map(toRad);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return [toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))];
}

const ORIGIN = [30.62, 122.07];
const DEST = [33.72, -118.25];
export const WAYPOINT_FRACTIONS = [0, 0.12, 0.2, 0.3, 0.42, 0.54, 0.66, 0.78, 0.88, 0.96, 1];
export const WAYPOINTS = WAYPOINT_FRACTIONS.map((f, i) => {
  const [lat, lon] = gc(ORIGIN, DEST, f);
  return { id: `wp${i}`, lat: +lat.toFixed(3), lon: +lon.toFixed(3) };
});
