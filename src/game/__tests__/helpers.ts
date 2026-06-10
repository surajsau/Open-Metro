import type { Line, ShapeKind, Station } from '../types';

// Routing-only line stub; path/nodeS stay empty (routing never reads them).
export function makeLine(id: number, stations: number[], isLoop = false): Line {
  return { id, stations, isLoop, path: [], nodeS: [] };
}

export function makeStation(id: number, x: number, y: number, shape: ShapeKind): Station {
  return {
    id,
    pos: { x, y },
    shape,
    isInterchange: false,
    waiting: [],
    gauge: 0,
    spawnTimer: 999,
    bornAt: 0,
  };
}
