import { PARALLEL_GAP } from '../game/constants';
import type { Line } from '../game/types';

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
// render as parallel strands. The returned offset is signed for the leg drawn
// in the line's own direction; reversed legs get a negated sign so both end up
// on consistent geometric sides.
export function computeLegOffsets(lines: Line[]): Map<string, number> {
  const groups = new Map<string, { lineId: number; legIndex: number; reversed: boolean }[]>();
  for (const line of lines) {
    forEachLeg(line, (a, b, legIndex) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ lineId: line.id, legIndex, reversed: a > b });
    });
  }

  const offsets = new Map<string, number>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((p, q) => p.lineId - q.lineId || p.legIndex - q.legIndex);
    members.forEach((m, idx) => {
      const base = (idx - (members.length - 1) / 2) * PARALLEL_GAP;
      offsets.set(legKey(m.lineId, m.legIndex), m.reversed ? -base : base);
    });
  }
  return offsets;
}
