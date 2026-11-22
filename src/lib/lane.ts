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

/** Rough sea area for each sampled point, in WAYPOINT_FRACTIONS order. */
const WAYPOINT_NAMES = [
  'Yangshan approach',
  'Sea of Japan',
  'Tsugaru Strait',
  'Off the Kuril Islands',
  'Northwest Pacific',
  'South of the Aleutians',
  'North Pacific',
  'Northeast Pacific',
  'Off Northern California',
  'Off Central California',
  'San Pedro Bay',
];

export const WAYPOINTS = WAYPOINT_FRACTIONS.map((f, i) => ({
  id: `wp${i}`,
  fraction: f,
  pos: greatCirclePoint(ORIGIN.pos, DESTINATION.pos, f),
  name: WAYPOINT_NAMES[i],
}));
