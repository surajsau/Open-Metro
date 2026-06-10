import type { GameState, ShapeKind } from './types';

function buildAdjacency(state: GameState): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const line of state.lines) {
    for (let i = 1; i < line.stations.length; i++) {
      link(line.stations[i - 1], line.stations[i]);
    }
    if (line.isLoop && line.stations.length >= 3) {
      link(line.stations[line.stations.length - 1], line.stations[0]);
    }
  }
  return adj;
}

// For every shape on the map: hop distance from each station to the nearest
// station of that shape (multi-source BFS). Passengers ride any train that
// strictly decreases this distance; transfers fall out of it naturally.
export function recomputeRouting(state: GameState): void {
  const adj = buildAdjacency(state);
  state.distFields = new Map();
  const shapes = new Set<ShapeKind>(state.stations.map((s) => s.shape));
  for (const shape of shapes) {
    const dist = new Map<number, number>();
    const queue: number[] = [];
    for (const st of state.stations) {
      if (st.shape === shape) {
        dist.set(st.id, 0);
        queue.push(st.id);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      const d = dist.get(cur)!;
      for (const next of adj.get(cur) ?? []) {
        if (!dist.has(next)) {
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
    }
    state.distFields.set(shape, dist);
  }
}

export function distTo(state: GameState, shape: ShapeKind, stationId: number): number {
  return state.distFields.get(shape)?.get(stationId) ?? Infinity;
}
