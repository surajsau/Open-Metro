import { describe, expect, it } from 'vitest';
import { CITIES } from '../cities';
import { DAY_SECONDS, MAX_LINES, STATION_CAP } from '../constants';
import { pickStationShape } from '../spawn';
import { createGameState } from '../state';
import { pressureFactor, stepGame } from '../sim';
import { makeStation } from './helpers';

describe('weekly line cadence', () => {
  function runToDay(day: number) {
    const state = createGameState(61);
    state.stations.push(makeStation(1, 200, 200, 'circle'), makeStation(2, 400, 200, 'triangle'));
    state.nextStationIn = 999999;
    state.time = day * DAY_SECONDS - 0.1;
    stepGame(state, 0.2);
    return state;
  }

  it('does not auto-unlock a line on odd weeks', () => {
    const state = runToDay(7);
    expect(state.pendingReward?.unlockedLine).toBe(false);
    expect(state.lineSlots).toBe(3);
  });

  it('auto-unlocks a line slot on even weeks', () => {
    const state = runToDay(14);
    expect(state.pendingReward?.unlockedLine).toBe(true);
    expect(state.lineSlots).toBe(4);
  });

  it('stops auto-unlocking at the line cap', () => {
    const state = createGameState(62);
    state.stations.push(makeStation(1, 200, 200, 'circle'), makeStation(2, 400, 200, 'triangle'));
    state.nextStationIn = 999999;
    state.lineSlots = MAX_LINES;
    state.time = 14 * DAY_SECONDS - 0.1;
    stepGame(state, 0.2);
    expect(state.pendingReward?.unlockedLine).toBe(false);
    expect(state.lineSlots).toBe(MAX_LINES);
  });
});

describe('pressureFactor (adaptive difficulty)', () => {
  it('tightens spawns when the network is cruising', () => {
    const state = createGameState(63);
    state.stations.push(makeStation(1, 0, 0, 'circle'), makeStation(2, 100, 0, 'triangle'));
    expect(pressureFactor(state)).toBeLessThan(1); // empty stations → more pressure
  });

  it('eases spawns when stations are drowning', () => {
    const state = createGameState(64);
    const st = makeStation(1, 0, 0, 'circle');
    for (let i = 0; i < STATION_CAP * 2; i++) st.waiting.push({ id: i, shape: 'triangle', bornAt: 0 });
    state.stations.push(st);
    expect(pressureFactor(state)).toBeGreaterThan(1.3);
  });
});

describe('demand-aware station shapes', () => {
  it('avoids piling onto an overrepresented shape', () => {
    const state = createGameState(65);
    for (let i = 0; i < 12; i++) state.stations.push(makeStation(100 + i, i * 80, 100, 'circle'));
    let circles = 0;
    for (let i = 0; i < 300; i++) {
      if (pickStationShape(state) === 'circle') circles++;
    }
    // Raw weights would give circles 50%; the demand damping must pull it well below.
    expect(circles / 300).toBeLessThan(0.3);
  });
});

describe('city difficulty wiring', () => {
  it('harder cities start with fewer tunnels', () => {
    const tokyo = createGameState(66, CITIES[2]);
    expect(tokyo.inventory.tunnels).toBe(CITIES[2].startTunnels);
    expect(tokyo.inventory.tunnels).toBeLessThan(createGameState(67, CITIES[0]).inventory.tunnels);
  });
});
