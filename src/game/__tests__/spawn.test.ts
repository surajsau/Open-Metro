import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, EDGE_MARGIN, MIN_STATION_DIST, STATION_LIMIT, WORLD } from '../constants';
import { dist } from '../geometry';
import { isInRiver } from '../river';
import { cityById } from '../cities';
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
      expect(isInRiver(st.pos, state.city.rivers)).toBe(false);
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
      expect(isInRiver(st.pos, state.city.rivers)).toBe(false);
      expect(st.pos.x).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(st.pos.x).toBeLessThanOrEqual(WORLD.w - EDGE_MARGIN);
    }
  });

  it('assigns all four starters distinct nextPassengerIn timers staggered across [6,22]s window (WLD-18)', () => {
    // Run multiple seeds to check across RNG sequences
    for (const seed of [109, 200, 300, 400, 500]) {
      const state = createGameState(seed);
      initialStations(state);
      expect(state.stations).toHaveLength(4);
      const timers = state.stations.map((s) => s.spawnTimer);
      // All timers must be distinct
      const unique = new Set(timers);
      expect(unique.size).toBe(4);
      // All timers must be within the stagger window [6, 22]
      for (const t of timers) {
        expect(t).toBeGreaterThanOrEqual(6);
        expect(t).toBeLessThanOrEqual(22);
      }
      // At least one timer must exceed 14 (beyond the old PASSENGER_FIRST_DELAY[1])
      // proving the stagger extends past the old window
      const maxTimer = Math.max(...timers);
      expect(maxTimer).toBeGreaterThan(14);
    }
  });

  it('Tokyo starters cover all three vertical strips (left <467, middle 467-1103, right >1103)', () => {
    // Tokyo has rivers at x≈420-510 (left/Arakawa) and x≈1060-1150 (right/Sumida).
    // The three strips are: left (x<467), middle (467<x<1103), right (x>1103).
    // At least one initial station must land in each strip across multiple seeds.
    const tokyo = cityById('tokyo');
    const LEFT_BOUNDARY = 467;   // right edge of Arakawa river + clearance
    const RIGHT_BOUNDARY = 1103; // left edge of Sumida river - clearance

    const strips = { left: false, middle: false, right: false };

    // Test across several seeds to account for jitter variability
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGameState(seed, tokyo);
      initialStations(state);
      for (const st of state.stations) {
        if (st.pos.x < LEFT_BOUNDARY) strips.left = true;
        else if (st.pos.x > RIGHT_BOUNDARY) strips.right = true;
        else strips.middle = true;
      }
      if (strips.left && strips.middle && strips.right) break;
    }

    expect(strips.left).toBe(true);
    expect(strips.middle).toBe(true);
    expect(strips.right).toBe(true);
  });

  it('Tokyo starters with seed=1 land in all three strips', () => {
    // Deterministic check: with seed=1, all three strips must be represented.
    const tokyo = cityById('tokyo');
    const LEFT_BOUNDARY = 467;
    const RIGHT_BOUNDARY = 1103;
    const state = createGameState(1, tokyo);
    initialStations(state);

    const hasLeft = state.stations.some((s) => s.pos.x < LEFT_BOUNDARY);
    const hasMiddle = state.stations.some((s) => s.pos.x >= LEFT_BOUNDARY && s.pos.x <= RIGHT_BOUNDARY);
    const hasRight = state.stations.some((s) => s.pos.x > RIGHT_BOUNDARY);

    expect(hasLeft).toBe(true);
    expect(hasMiddle).toBe(true);
    expect(hasRight).toBe(true);
  });
});
