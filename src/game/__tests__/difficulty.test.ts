import { describe, expect, it } from 'vitest';
import { CITIES } from '../cities';
import { DAY_SECONDS, MAX_LINES, STATION_CAP, passengerSpawnInterval, stationSpawnInterval } from '../constants';
import { mulberry32 } from '../rng';
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

  it('auto-unlocks a line every week while below five slots', () => {
    const state = runToDay(7);
    expect(state.pendingReward?.unlockedLine).toBe(true);
    expect(state.lineSlots).toBe(4);
  });

  it('slows to even weeks only once five slots are reached', () => {
    const odd = createGameState(68);
    odd.stations.push(makeStation(1, 200, 200, 'circle'), makeStation(2, 400, 200, 'triangle'));
    odd.nextStationIn = 999999;
    odd.lineSlots = 5;
    odd.time = 21 * DAY_SECONDS - 0.1; // week 3
    stepGame(odd, 0.2);
    expect(odd.pendingReward?.unlockedLine).toBe(false);
    expect(odd.lineSlots).toBe(5);

    const even = createGameState(69);
    even.stations.push(makeStation(1, 200, 200, 'circle'), makeStation(2, 400, 200, 'triangle'));
    even.nextStationIn = 999999;
    even.lineSlots = 5;
    even.time = 14 * DAY_SECONDS - 0.1; // week 2
    stepGame(even, 0.2);
    expect(even.pendingReward?.unlockedLine).toBe(true);
    expect(even.lineSlots).toBe(6);
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

describe('spawn interval bounds (tougher-spawn-balance: GD-37, WLD-05, WLD-12)', () => {
  it('passenger interval min is 7 s at pace=1, day=0, pressureFactor=1', () => {
    const interval = passengerSpawnInterval(() => 0, 0, 1, 0.975, 1);
    expect(interval).toBeCloseTo(7, 5);
  });

  it('passenger interval max is 14 s at pace=1, day=0, pressureFactor=1', () => {
    const interval = passengerSpawnInterval(() => 1, 0, 1, 0.975, 1);
    expect(interval).toBeCloseTo(14, 5);
  });

  it('station interval min is 20 s at pace=1, day=0', () => {
    const interval = stationSpawnInterval(() => 0, 0, 1, 0.97);
    expect(interval).toBeCloseTo(20, 5);
  });

  it('station interval max is 32 s at pace=1, day=0', () => {
    const interval = stationSpawnInterval(() => 1, 0, 1, 0.97);
    expect(interval).toBeCloseTo(32, 5);
  });

  it('per-city pace multipliers preserve relative difficulty ordering', () => {
    const londonStationInterval = stationSpawnInterval(() => 0.5, 0, CITIES[0].pace.station, 0.97);
    const tokyoStationInterval = stationSpawnInterval(() => 0.5, 0, CITIES[2].pace.station, 0.97);
    expect(londonStationInterval).not.toBeCloseTo(tokyoStationInterval, 1);
  });
});

describe('per-city grace period (WLD-19)', () => {
  it('at day 0, London effective passenger interval is >= Tokyo * 1.30', () => {
    const london = CITIES[0]; // graceFactor 1.40
    const tokyo = CITIES[2];  // graceFactor 1.00
    const rngL = mulberry32(200);
    const rngT = mulberry32(200);

    let sumL = 0, sumT = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      sumL += passengerSpawnInterval(rngL, 0, london.pace.passenger, london.rampPerDay, 1, london.graceFactor);
      sumT += passengerSpawnInterval(rngT, 0, tokyo.pace.passenger, tokyo.rampPerDay, 1, tokyo.graceFactor);
    }
    expect(sumL / N).toBeGreaterThanOrEqual((sumT / N) * 1.30);
  });

  it('at day 4, grace contribution has decayed (intervals within natural pace ratio)', () => {
    const london = CITIES[0];
    const tokyo = CITIES[2];
    const rngL = mulberry32(201);
    const rngT = mulberry32(201);

    let sumL = 0, sumT = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      sumL += passengerSpawnInterval(rngL, 4, london.pace.passenger, london.rampPerDay, 1, london.graceFactor);
      sumT += passengerSpawnInterval(rngT, 4, tokyo.pace.passenger, tokyo.rampPerDay, 1, tokyo.graceFactor);
    }
    const ratio = sumL / sumT;
    expect(ratio).toBeGreaterThan(1.0);
    expect(ratio).toBeLessThan(1.55);
  });
});
