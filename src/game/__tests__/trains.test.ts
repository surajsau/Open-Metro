import { describe, expect, it } from 'vitest';
import { polylineLength } from '../geometry';
import { createLine } from '../lines';
import { createGameState } from '../state';
import { addCarriageToLine, addTrainToLine, updateTrain } from '../trains';
import type { GameState } from '../types';
import { makeStation } from './helpers';

function run(state: GameState, seconds: number, each?: (s: GameState) => void): void {
  const dt = 1 / 30;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    state.time += dt;
    for (const train of [...state.trains]) updateTrain(state, train, dt);
    each?.(state);
  }
}

describe('delivery on a single line', () => {
  it('delivers a triangle passenger from A to C', () => {
    const state = createGameState(11);
    state.stations.push(
      makeStation(1, 0, 0, 'circle'),
      makeStation(2, 200, 0, 'circle'),
      makeStation(3, 400, 0, 'triangle'),
    );
    expect(createLine(state, [1, 2, 3]).ok).toBe(true);
    const a = state.stations[0];
    a.waiting.push({ id: 100, shape: 'triangle', bornAt: 0 });
    run(state, 60);
    expect(state.score).toBe(1);
    expect(a.waiting).toHaveLength(0);
    expect(state.trains[0].passengers).toHaveLength(0);
  });

  it('never boards passengers whose shape is unreachable', () => {
    const state = createGameState(12);
    state.stations.push(makeStation(1, 0, 0, 'circle'), makeStation(2, 200, 0, 'circle'));
    expect(createLine(state, [1, 2]).ok).toBe(true);
    state.stations[0].waiting.push({ id: 100, shape: 'star', bornAt: 0 });
    run(state, 30, (s) => {
      expect(s.trains[0].passengers).toHaveLength(0);
    });
    expect(state.stations[0].waiting).toHaveLength(1);
  });
});

describe('capacity', () => {
  it('boards at most six on a bare locomotive and clears the queue over trips', () => {
    const state = createGameState(13);
    state.stations.push(makeStation(1, 200, 0, 'square'), makeStation(2, 0, 0, 'circle'));
    expect(createLine(state, [1, 2]).ok).toBe(true); // train starts at the square station
    const circleStation = state.stations[1];
    for (let i = 0; i < 8; i++) circleStation.waiting.push({ id: 200 + i, shape: 'square', bornAt: 0 });
    let maxOnboard = 0;
    run(state, 40, (s) => {
      maxOnboard = Math.max(maxOnboard, s.trains[0].passengers.length);
    });
    expect(maxOnboard).toBe(6);
    expect(state.score).toBe(8);
    expect(circleStation.waiting).toHaveLength(0);
  });
});

describe('movement patterns', () => {
  it('reverses at termini and stays in bounds', () => {
    const state = createGameState(14);
    state.stations.push(makeStation(1, 0, 0, 'circle'), makeStation(2, 300, 0, 'circle'));
    expect(createLine(state, [1, 2]).ok).toBe(true);
    const total = polylineLength(state.lines[0].path);
    const dirs = new Set<number>();
    run(state, 20, (s) => {
      dirs.add(s.trains[0].dir);
      expect(s.trains[0].s).toBeGreaterThanOrEqual(0);
      expect(s.trains[0].s).toBeLessThanOrEqual(total + 1e-6);
    });
    expect(dirs).toEqual(new Set([1, -1]));
  });

  it('never reverses on a loop', () => {
    const state = createGameState(15);
    state.stations.push(
      makeStation(1, 0, 0, 'circle'),
      makeStation(2, 200, 0, 'circle'),
      makeStation(3, 200, 200, 'circle'),
      makeStation(4, 0, 200, 'circle'),
    );
    expect(createLine(state, [1, 2, 3, 4], true).ok).toBe(true);
    run(state, 30, (s) => {
      expect(s.trains[0].dir).toBe(1);
    });
  });
});

describe('transfers', () => {
  it('delivers across two lines through a shared hub', () => {
    const state = createGameState(16);
    state.stations.push(
      makeStation(1, 0, 0, 'circle'), // A
      makeStation(2, 200, 0, 'circle'), // hub H
      makeStation(3, 200, 200, 'square'), // D
    );
    expect(createLine(state, [1, 2]).ok).toBe(true);
    expect(createLine(state, [2, 3]).ok).toBe(true);
    state.stations[0].waiting.push({ id: 300, shape: 'square', bornAt: 0 });
    run(state, 60);
    expect(state.score).toBe(1);
  });
});

describe('interchange exchange speed', () => {
  it('finishes boarding sooner at an interchange', () => {
    const timeToLoadSix = (interchange: boolean): number => {
      const state = createGameState(17);
      state.stations.push(makeStation(1, 200, 0, 'square'), makeStation(2, 0, 0, 'circle'));
      state.stations[1].isInterchange = interchange;
      expect(createLine(state, [1, 2]).ok).toBe(true);
      for (let i = 0; i < 6; i++) state.stations[1].waiting.push({ id: 400 + i, shape: 'square', bornAt: 0 });
      let t = Infinity;
      run(state, 20, (s) => {
        if (s.trains[0].passengers.length === 6 && t === Infinity) t = s.time;
      });
      return t;
    };
    const normal = timeToLoadSix(false);
    const fast = timeToLoadSix(true);
    expect(fast).toBeLessThan(normal);
  });
});

describe('inventory deployment', () => {
  it('adds a train at the nearest path point heading to the farther end', () => {
    const state = createGameState(18);
    state.stations.push(makeStation(1, 0, 0, 'circle'), makeStation(2, 400, 0, 'circle'));
    expect(createLine(state, [1, 2]).ok).toBe(true);
    const res = addTrainToLine(state, state.lines[0].id, { x: 300, y: 10 });
    expect(res.ok).toBe(true);
    expect(state.trains).toHaveLength(2);
    const t = state.trains[1];
    expect(t.s).toBeCloseTo(300, 4);
    expect(t.dir).toBe(-1);
    expect(state.inventory.locomotives).toBe(1);
  });

  it('fails without locomotive stock', () => {
    const state = createGameState(19);
    state.stations.push(makeStation(1, 0, 0, 'circle'), makeStation(2, 400, 0, 'circle'));
    expect(createLine(state, [1, 2]).ok).toBe(true);
    state.inventory.locomotives = 0;
    expect(addTrainToLine(state, state.lines[0].id).ok).toBe(false);
  });

  it('attaches carriages to the emptiest train up to the cap', () => {
    const state = createGameState(20);
    state.stations.push(makeStation(1, 0, 0, 'circle'), makeStation(2, 400, 0, 'circle'));
    expect(createLine(state, [1, 2]).ok).toBe(true);
    addTrainToLine(state, state.lines[0].id);
    state.inventory.carriages = 10;
    expect(addCarriageToLine(state, state.lines[0].id).ok).toBe(true);
    expect(addCarriageToLine(state, state.lines[0].id).ok).toBe(true);
    const counts = state.trains.map((t) => t.carriages).sort();
    expect(counts).toEqual([1, 1]); // spread across trains
    for (let i = 0; i < 6; i++) addCarriageToLine(state, state.lines[0].id);
    expect(state.trains.every((t) => t.carriages === 4)).toBe(true);
    expect(addCarriageToLine(state, state.lines[0].id).ok).toBe(false); // both maxed
  });
});
