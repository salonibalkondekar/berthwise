import { greatCirclePoint, type LatLon } from './geo';

export const ORIGIN = {
  code: 'CNSHA',
  name: 'Shanghai (Yangshan)',
  pos: [30.62, 122.07] as LatLon,
};

export const DESTINATION = {
  code: 'USLAX',
  name: 'Los Angeles / Long Beach',
  pos: [33.72, 241.75] as LatLon, // -118.25, unwrapped
};

export const ANCHORAGE: LatLon = [33.62, 241.9];

/** Fractions along the lane where live weather is sampled. */
export const WAYPOINT_FRACTIONS = [0, 0.12, 0.2, 0.3, 0.42, 0.54, 0.66, 0.78, 0.88, 0.96, 1];

export const WAYPOINTS = WAYPOINT_FRACTIONS.map((f, i) => ({
  id: `wp${i}`,
  fraction: f,
  pos: greatCirclePoint(ORIGIN.pos, DESTINATION.pos, f),
  name:
    f === 0
      ? 'Yangshan approach'
      : f === 1
        ? 'San Pedro Bay'
        : `Mid-Pacific ${Math.round(f * 100)}%`,
}));
