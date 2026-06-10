import type { ShapeKind, Station } from '../types';

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
