import { RIVER_HALF_W } from './constants';
import { nearestPointOnPolyline, pointAtArcLength, polylineLength } from './geometry';
import type { Vec } from './types';

export function distToWater(p: Vec, rivers: Vec[][]): number {
  let best = Infinity;
  for (const river of rivers) {
    best = Math.min(best, nearestPointOnPolyline(river, p).dist);
  }
  return best;
}

export function isInRiver(p: Vec, rivers: Vec[][]): boolean {
  return distToWater(p, rivers) < RIVER_HALF_W;
}

// Tunnel cost of a path = number of contiguous spans inside any water band,
// estimated by sampling along the path.
const SAMPLE_STEP = 5;

export function countRiverCrossings(path: Vec[], rivers: Vec[][]): number {
  const total = polylineLength(path);
  if (total === 0) return 0;
  let crossings = 0;
  const inside = rivers.map(() => false);
  for (let s = 0; s <= total + SAMPLE_STEP; s += SAMPLE_STEP) {
    const { point } = pointAtArcLength(path, Math.min(s, total));
    rivers.forEach((river, i) => {
      const now = nearestPointOnPolyline(river, point).dist < RIVER_HALF_W;
      if (now && !inside[i]) crossings++;
      inside[i] = now;
    });
    if (s >= total) break;
  }
  return crossings;
}
