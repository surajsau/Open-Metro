import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, EDGE_MARGIN, MIN_STATION_DIST, STATION_LIMIT, WORLD } from '../constants';
import { dist } from '../geometry';
import { isInRiver } from '../river';
import { createGameState } from '../state';
import { initialStations, pickPassengerShape, pickStationShape, spawnPassenger, spawnStation } from '../spawn';
import { makeStation } from './helpers';

describe('spawnStation', () => {
  it('places stations inside margins, off the river, and apart from each other', () => {
    const state = createGameState(101);
    state.time = 30 * DAY_SECONDS; // fully grown placement ellipse
    for (let i = 0; i < 30; i++) spawnStation(state);
    expect(state.stations.length).toBeGreaterThan(10);
    for (const st of state.stations) {
      expect(st.pos.x).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(st.pos.x).toBeLessThanOrEqual(WORLD.w - EDGE_MARGIN);
      expect(st.pos.y).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(st.pos.y).toBeLessThanOrEqual(WORLD.h - EDGE_MARGIN);
      expect(isInRiver(st.pos)).toBe(false);
    }
    for (const a of state.stations) {
      for (const b of state.stations) {
        if (a.id !== b.id) expect(dist(a.pos, b.pos)).toBeGreaterThanOrEqual(MIN_STATION_DIST);
      }
    }
  });

  it('returns null at the station limit', () => {
    const state = createGameState(102);
    for (let i = 0; i < STATION_LIMIT; i++) {
      state.stations.push(makeStation(i, 0, 0, 'circle'));
    }
    expect(spawnStation(state)).toBeNull();
  });
});

describe('pickStationShape', () => {
  it('never picks rare shapes in the first days', () => {
    const state = createGameState(103);
    state.time = 0;
    for (let i = 0; i < 300; i++) {
      expect(['circle', 'triangle', 'square']).toContain(pickStationShape(state));
    }
  });

  it('never exceeds the per-shape rare cap', () => {
    const state = createGameState(104);
    state.time = 10 * DAY_SECONDS;
    state.stations.push(makeStation(900, 100, 100, 'star'), makeStation(901, 200, 100, 'star'));
    for (let i = 0; i < 300; i++) {
      expect(pickStationShape(state)).not.toBe('star');
    }
  });
});

describe('pickPassengerShape', () => {
  it('only targets shapes that exist on the map, never the origin shape', () => {
    const state = createGameState(105);
    const origin = makeStation(1, 100, 100, 'circle');
    state.stations.push(origin, makeStation(2, 300, 100, 'triangle'));
    for (let i = 0; i < 100; i++) {
      expect(pickPassengerShape(state, origin)).toBe('triangle');
    }
  });

  it('returns null when no other shape exists', () => {
    const state = createGameState(106);
    const origin = makeStation(1, 100, 100, 'circle');
    state.stations.push(origin, makeStation(2, 300, 100, 'circle'));
    expect(pickPassengerShape(state, origin)).toBeNull();
  });
});

describe('spawnPassenger', () => {
  it('queues a passenger and counts it', () => {
    const state = createGameState(107);
    const origin = makeStation(1, 100, 100, 'circle');
    state.stations.push(origin, makeStation(2, 300, 100, 'square'));
    spawnPassenger(state, origin);
    expect(origin.waiting).toHaveLength(1);
    expect(origin.waiting[0].shape).toBe('square');
    expect(state.spawnedPassengers).toBe(1);
  });
});

describe('initialStations', () => {
  it('creates the four starters: two circles, a triangle, a square', () => {
    const state = createGameState(108);
    initialStations(state);
    const shapes = state.stations.map((s) => s.shape).sort();
    expect(shapes).toEqual(['circle', 'circle', 'square', 'triangle']);
    for (const st of state.stations) {
      expect(isInRiver(st.pos)).toBe(false);
      expect(st.pos.x).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(st.pos.x).toBeLessThanOrEqual(WORLD.w - EDGE_MARGIN);
    }
  });
});
