import { PARALLEL_GAP } from '../game/constants';
import { norm, octilinearPath, sub } from '../game/geometry';
import type { Line, Station, Vec } from '../game/types';

export const legKey = (lineId: number, legIndex: number): string => `${lineId}:${legIndex}`;

// Enumerate a line's legs as (fromStationId, toStationId, legIndex),
// including the closing leg of loops. Shared by renderer and hit-testing.
export function forEachLeg(line: Line, cb: (a: number, b: number, legIndex: number) => void): void {
  for (let i = 1; i < line.stations.length; i++) {
    cb(line.stations[i - 1], line.stations[i], i - 1);
  }
  if (line.isLoop && line.stations.length >= 3) {
    cb(line.stations[line.stations.length - 1], line.stations[0], line.stations.length - 1);
  }
}

// Lines sharing the same unordered station pair get spread sideways so they
// render as parallel strands. The returned offset is relative to the canonical
// corridor direction (min station ID → max station ID). The constant-shift
// rendering functions (legPoints, computeShiftedTermini, drawTrains) all use
// the same canonical direction, so no sign-flip is needed for reversed legs.
export function computeLegOffsets(lines: Line[]): Map<string, number> {
  const groups = new Map<string, { lineId: number; legIndex: number }[]>();
  for (const line of lines) {
    forEachLeg(line, (a, b, legIndex) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ lineId: line.id, legIndex });
    });
  }

  const offsets = new Map<string, number>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((p, q) => p.lineId - q.lineId || p.legIndex - q.legIndex);
    members.forEach((m, idx) => {
      const base = (idx - (members.length - 1) / 2) * PARALLEL_GAP;
      offsets.set(legKey(m.lineId, m.legIndex), base);
    });
  }
  return offsets;
}

// Given the arc-length positions of each station along a line (nodeS), return the
// index of the leg that arc-length position s falls on. For loops, totalLength
// must be provided so s can be mapped onto the closing leg.
export function legIndexAtArcLength(
  nodeS: number[],
  s: number,
  isLoop: boolean,
  totalLength?: number,
): number {
  const numLegs = nodeS.length - 1 + (isLoop ? 1 : 0);
  if (numLegs <= 0) return 0;

  // Walk through station arc-lengths to find the leg that brackets s.
  for (let i = 0; i < nodeS.length - 1; i++) {
    // Leg i spans [nodeS[i], nodeS[i+1]).
    // Use < for upper bound so the station node falls on the *next* leg (train leaving).
    // Exception: clamp on the very last station of a non-loop.
    if (s < nodeS[i + 1]) return i;
  }

  // s is at or past the last station.
  if (isLoop && totalLength !== undefined && s < totalLength) {
    // Closing leg: last leg index = nodeS.length - 1.
    return nodeS.length - 1;
  }

  // Clamp to the last leg for non-loop lines or loop s beyond totalLength.
  return nodeS.length - 2;
}

export interface ShiftedTermini {
  /** World-space start of the head tail stub (first station, shifted perpendicular). */
  headStart: Vec;
  /** World-space start of the tail stub (last station, shifted perpendicular). */
  tailStart: Vec;
}

// Compute the perpendicular-shifted start points for a non-loop line's tail stubs.
// Returns null for loop lines (no tails). For lines with no shared corridor the
// shifts are zero and the returned points coincide with the station positions.
export function computeShiftedTermini(
  line: Line,
  offsets: Map<string, number>,
  stations: Map<number, Station>,
): ShiftedTermini | null {
  if (line.isLoop || line.stations.length < 2) return null;

  // Head terminus: first station, offset of the first leg (legIndex 0).
  const headOffset = offsets.get(legKey(line.id, 0)) ?? 0;
  const stHead0 = stations.get(line.stations[0]);
  const stHead1 = stations.get(line.stations[1]);

  // Tail terminus: last station, offset of the last leg.
  const lastLegIdx = line.stations.length - 2;
  const tailOffset = offsets.get(legKey(line.id, lastLegIdx)) ?? 0;
  const stTail0 = stations.get(line.stations[lastLegIdx]);
  const stTail1 = stations.get(line.stations[lastLegIdx + 1]);

  // Fall back to station.pos when a station is missing (should not happen in practice).
  let headStart: Vec = stHead0?.pos ?? { x: 0, y: 0 };
  let tailStart: Vec = stTail1?.pos ?? { x: 0, y: 0 };

  if (stHead0 && stHead1 && headOffset !== 0) {
    const path = octilinearPath(stHead0.pos, stHead1.pos);
    // Canonical direction: min-ID station → max-ID station (matches computeLegOffsets sign convention).
    const [hA, hB] = line.stations[0] < line.stations[1]
      ? [stHead0.pos, stHead1.pos] : [stHead1.pos, stHead0.pos];
    const dir = norm(sub(hB, hA));
    const perp: Vec = { x: -dir.y, y: dir.x };
    headStart = { x: path[0].x + perp.x * headOffset, y: path[0].y + perp.y * headOffset };
  }

  if (stTail0 && stTail1 && tailOffset !== 0) {
    const path = octilinearPath(stTail0.pos, stTail1.pos);
    const lastIdx = line.stations.length - 1;
    const [tA, tB] = line.stations[lastIdx - 1] < line.stations[lastIdx]
      ? [stTail0.pos, stTail1.pos] : [stTail1.pos, stTail0.pos];
    const dir = norm(sub(tB, tA));
    const perp: Vec = { x: -dir.y, y: dir.x };
    tailStart = { x: path[path.length - 1].x + perp.x * tailOffset, y: path[path.length - 1].y + perp.y * tailOffset };
  }

  return { headStart, tailStart };
}
