import { describe, expect, it } from 'vitest';
import { createLine, pickUpTrain } from '../lines';
import { createGameState } from '../state';
import { addCarriageToLine, addTrainToLine } from '../trains';
import type { GameState } from '../types';
import { makeStation } from './helpers';

// Two separate horizontal lines, each long enough to carry a train.
function twoLineState(): GameState {
  const state = createGameState(31);
  state.stations.push(
    makeStation(1, 0, 0, 'circle'), // line A
    makeStation(2, 400, 0, 'circle'),
    makeStation(3, 0, 300, 'square'), // line B
    makeStation(4, 400, 300, 'square'),
  );
  expect(createLine(state, [1, 2]).ok).toBe(true); // auto-deploys train on A
  expect(createLine(state, [3, 4]).ok).toBe(true); // auto-deploys train on B
  return state;
}

describe('pickUpTrain — core', () => {
  it('removes the train from its line and refunds the locomotive to inventory', () => {
    const state = twoLineState();
    const lineA = state.lines[0];
    const train = state.trains.find((t) => t.lineId === lineA.id)!;
    const locosBefore = state.inventory.locomotives;

    const res = pickUpTrain(state, lineA.id, train.id);

    expect(res.ok).toBe(true);
    expect(state.trains.find((t) => t.id === train.id)).toBeUndefined();
    expect(state.inventory.locomotives).toBe(locosBefore + 1);
  });

  it('refunds attached carriages to inventory', () => {
    const state = twoLineState();
    const lineA = state.lines[0];
    state.inventory.carriages = 5;
    addCarriageToLine(state, lineA.id);
    addCarriageToLine(state, lineA.id); // train on A now has 2 carriages
    const train = state.trains.find((t) => t.lineId === lineA.id)!;
    expect(train.carriages).toBe(2);
    const carriagesBefore = state.inventory.carriages;

    const res = pickUpTrain(state, lineA.id, train.id);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.carriages).toBe(2);
    expect(state.inventory.carriages).toBe(carriagesBefore + 2);
  });

  it('offloads onboard passengers to a station of the old route — nobody is destroyed', () => {
    const state = twoLineState();
    const lineA = state.lines[0];
    const train = state.trains.find((t) => t.lineId === lineA.id)!;
    // Put riders aboard the picked-up train manually.
    train.passengers.push(
      { id: 900, shape: 'triangle', bornAt: 0 },
      { id: 901, shape: 'triangle', bornAt: 0 },
    );
    const waitingBefore = state.stations.reduce((n, s) => n + s.waiting.length, 0);

    pickUpTrain(state, lineA.id, train.id);

    const waitingAfter = state.stations.reduce((n, s) => n + s.waiting.length, 0);
    expect(waitingAfter).toBe(waitingBefore + 2);
    // Offloaded onto a station belonging to the OLD route (A: stations 1 or 2).
    const offloadStation = state.stations.find((s) => s.waiting.some((p) => p.id === 900));
    expect(offloadStation && [1, 2]).toContain(offloadStation!.id);
  });

  it('leaves other lines and their trains untouched', () => {
    const state = twoLineState();
    const lineA = state.lines[0];
    const lineB = state.lines[1];
    const trainA = state.trains.find((t) => t.lineId === lineA.id)!;
    const trainB = state.trains.find((t) => t.lineId === lineB.id)!;

    pickUpTrain(state, lineA.id, trainA.id);

    // Line B and its train are exactly as before.
    expect(state.lines.find((l) => l.id === lineB.id)).toBeDefined();
    expect(state.trains.find((t) => t.id === trainB.id)).toBeDefined();
    expect(state.trains.find((t) => t.id === trainB.id)!.lineId).toBe(lineB.id);
  });

  it('does NOT delete the old line — only the train leaves', () => {
    const state = twoLineState();
    const lineA = state.lines[0];
    const train = state.trains.find((t) => t.lineId === lineA.id)!;

    pickUpTrain(state, lineA.id, train.id);

    expect(state.lines.find((l) => l.id === lineA.id)).toBeDefined();
  });

  it('fails cleanly for an unknown train id', () => {
    const state = twoLineState();
    const res = pickUpTrain(state, state.lines[0].id, 99999);
    expect(res.ok).toBe(false);
  });
});

describe('pick-up then re-deploy — conservation', () => {
  it('conserves total hardware across a full move between lines', () => {
    const state = twoLineState();
    const lineA = state.lines[0];
    const lineB = state.lines[1];
    state.inventory.carriages = 5;
    addCarriageToLine(state, lineA.id); // train on A: 1 carriage
    const train = state.trains.find((t) => t.lineId === lineA.id)!;

    const totalLocos = (s: GameState) => s.inventory.locomotives + s.trains.length;
    const totalCarriages = (s: GameState) =>
      s.inventory.carriages + s.trains.reduce((n, t) => n + t.carriages, 0);
    const locosBefore = totalLocos(state);
    const carriagesBefore = totalCarriages(state);

    // Move the train from A to B: pick up, then re-deploy loco + re-attach carriages.
    const picked = pickUpTrain(state, lineA.id, train.id);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    expect(addTrainToLine(state, lineB.id).ok).toBe(true);
    for (let i = 0; i < picked.carriages; i++) {
      expect(addCarriageToLine(state, lineB.id).ok).toBe(true);
    }

    expect(totalLocos(state)).toBe(locosBefore);
    expect(totalCarriages(state)).toBe(carriagesBefore);
    // The train now runs on line B.
    expect(state.trains.some((t) => t.lineId === lineB.id && t.carriages === 1)).toBe(true);
    // Line A has no train anymore (it only had the one).
    expect(state.trains.some((t) => t.lineId === lineA.id)).toBe(false);
  });
});
