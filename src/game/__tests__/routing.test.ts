import { describe, expect, it } from 'vitest';
import { distTo, recomputeRouting } from '../routing';
import { createGameState } from '../state';
import { makeLine, makeStation } from './helpers';

describe('recomputeRouting', () => {
  it('computes hop distances toward the nearest station of each shape', () => {
    const state = createGameState(1);
    state.stations.push(
      makeStation(1, 0, 0, 'circle'),
      makeStation(2, 100, 0, 'circle'),
      makeStation(3, 200, 0, 'triangle'),
    );
    state.lines.push(makeLine(0, [1, 2, 3]));
    recomputeRouting(state);
    expect(distTo(state, 'triangle', 1)).toBe(2);
    expect(distTo(state, 'triangle', 2)).toBe(1);
    expect(distTo(state, 'triangle', 3)).toBe(0);
  });

  it('routes across lines through shared hub stations', () => {
    const state = createGameState(2);
    state.stations.push(
      makeStation(1, 0, 0, 'circle'),
      makeStation(2, 100, 0, 'circle'), // hub
      makeStation(3, 200, 0, 'circle'),
      makeStation(4, 100, 100, 'circle'),
      makeStation(5, 100, -100, 'square'),
    );
    state.lines.push(makeLine(0, [1, 2, 3]), makeLine(1, [4, 2, 5]));
    recomputeRouting(state);
    expect(distTo(state, 'square', 1)).toBe(2); // 1 → hub 2 → 5
    expect(distTo(state, 'square', 4)).toBe(2);
    expect(distTo(state, 'square', 2)).toBe(1);
  });

  it('wraps adjacency around loops', () => {
    const state = createGameState(3);
    state.stations.push(
      makeStation(1, 0, 0, 'circle'),
      makeStation(2, 100, 0, 'circle'),
      makeStation(3, 100, 100, 'circle'),
      makeStation(4, 0, 100, 'star'),
    );
    state.lines.push(makeLine(0, [1, 2, 3, 4], true));
    recomputeRouting(state);
    expect(distTo(state, 'star', 1)).toBe(1); // closing leg 4–1
    expect(distTo(state, 'star', 3)).toBe(1);
  });

  it('reports Infinity for stations cut off from a shape', () => {
    const state = createGameState(4);
    state.stations.push(
      makeStation(1, 0, 0, 'circle'),
      makeStation(2, 100, 0, 'triangle'),
      makeStation(3, 300, 300, 'circle'), // isolated
    );
    state.lines.push(makeLine(0, [1, 2]));
    recomputeRouting(state);
    expect(distTo(state, 'triangle', 3)).toBe(Infinity);
    expect(distTo(state, 'pentagon', 1)).toBe(Infinity); // shape absent from map
  });
});
