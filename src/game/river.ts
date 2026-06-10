import { RIVER_HALF_W } from './constants';
import { nearestPointOnPolyline, pointAtArcLength, polylineLength } from './geometry';
import type { Vec } from './types';

// A gentle meander through the lower-middle of the world, extending past both
// edges so the band never visibly ends on screen.
export const RIVER_POINTS: Vec[] = [
  { x: -60, y: 640 },
  { x: 250, y: 590 },
  { x: 560, y: 640 },
  { x: 880, y: 720 },
  { x: 1180, y: 660 },
  { x: 1420, y: 580 },
  { x: 1700, y: 560 },
];

export function isInRiver(p: Vec, river: Vec[] = RIVER_POINTS): boolean {
  return nearestPointOnPolyline(river, p).dist < RIVER_HALF_W;
}

// Tunnel cost of a path = number of contiguous spans inside the river band,
// estimated by sampling along the path.
const SAMPLE_STEP = 5;

export function countRiverCrossings(path: Vec[], river: Vec[] = RIVER_POINTS): number {
  const total = polylineLength(path);
  if (total === 0) return 0;
  let crossings = 0;
  let prevInside = false;
  for (let s = 0; s <= total + SAMPLE_STEP; s += SAMPLE_STEP) {
    const { point } = pointAtArcLength(path, Math.min(s, total));
    const inside = isInRiver(point, river);
    if (inside && !prevInside) crossings++;
    prevInside = inside;
    if (s >= total) break;
  }
  return crossings;
}
