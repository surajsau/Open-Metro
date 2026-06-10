import { describe, expect, it } from 'vitest';
import { DAY_SECONDS } from '../constants';
import { polylineLength } from '../geometry';
import { createLine } from '../lines';
import { spawnPassenger } from '../spawn';
import { initialStations } from '../spawn';
import { createGameState } from '../state';
import { stepGame } from '../sim';
import type { GameState } from '../types';
import { makeStation } from './helpers';

function conserved(state: GameState): boolean {
  const waiting = state.stations.reduce((n, s) => n + s.waiting.length, 0);
  const riding = state.trains.reduce((n, t) => n + t.passengers.length, 0);
  return state.spawnedPassengers === state.score + waiting + riding;
}

describe('stepGame integration', () => {
  it('runs a connected network for 150 sim-seconds with invariants intact', () => {
    const state = createGameState(31);
    initialStations(state);
    expect(createLine(state, [1, 3, 2, 4]).ok).toBe(true);
    const dt = 1 / 30;
    for (let i = 0; i < 150 * 30; i++) {
      stepGame(state, dt);
      expect(conserved(state)).toBe(true);
      for (const t of state.trains) {
        const line = state.lines.find((l) => l.id === t.lineId)!;
        expect(Number.isFinite(t.s)).toBe(true);
        expect(t.s).toBeGreaterThanOrEqual(0);
        expect(t.s).toBeLessThanOrEqual(polylineLength(line.path) + 1e-6);
      }
      for (const s of state.stations) {
        expect(s.gauge).toBeGreaterThanOrEqual(0);
        expect(s.gauge).toBeLessThanOrEqual(1);
      }
      if (state.gameOver || state.pendingReward) break;
    }
    expect(state.score).toBeGreaterThan(0);
    expect(state.spawnedPassengers).toBeGreaterThan(state.score);
  });

  it('ends the game when an overcrowded station holds out too long', () => {
    const state = createGameState(32);
    state.stations.push(makeStation(1, 200, 200, 'circle'), makeStation(2, 400, 200, 'triangle'));
    state.nextStationIn = 99999;
    const station = state.stations[0];
    for (let i = 0; i < 7; i++) spawnPassenger(state, station);
    expect(station.waiting.length).toBeGreaterThan(6);
    const dt = 1 / 30;
    for (let i = 0; i < 60 * 30 && !state.gameOver; i++) stepGame(state, dt);
    expect(state.gameOver).toBe(true);
    expect(state.speed).toBe(0);
  });

  it('fires the weekly reward exactly once and freezes the sim', () => {
    const state = createGameState(33);
    state.stations.push(makeStation(1, 200, 200, 'circle'), makeStation(2, 400, 200, 'triangle'));
    state.nextStationIn = 99999;
    state.time = 7 * DAY_SECONDS - 0.1;
    stepGame(state, 0.2);
    expect(state.pendingReward).not.toBeNull();
    expect(state.pendingReward!.week).toBe(1);
    expect(state.inventory.locomotives).toBe(4); // 3 starting + 1 weekly
    const frozenAt = state.time;
    stepGame(state, 10);
    expect(state.time).toBe(frozenAt); // sim gated while the modal is open
    expect(state.lastRewardDay).toBe(7);
  });
});
