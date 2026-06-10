import { describe, expect, it } from 'vitest';
import { polylineLength } from '../geometry';
import { applyChain, createLine, deleteLine, insertStation, tunnelsUsed } from '../lines';
import { createGameState } from '../state';
import type { GameState } from '../types';
import { makeStation } from './helpers';

// Positions picked against RIVER_POINTS: y=400 is north of the river,
// y=900 south of it, so any north–south leg crosses exactly once.
function stateWithStations(): GameState {
  const state = createGameState(7);
  state.stations.push(
    makeStation(1, 400, 400, 'circle'), // A north
    makeStation(2, 700, 900, 'triangle'), // B south
    makeStation(3, 1000, 400, 'square'), // C north
    makeStation(4, 600, 400, 'circle'), // E north (same side as A)
    makeStation(5, 1200, 400, 'circle'), // C2 north
    makeStation(6, 1200, 900, 'square'), // D2 south
  );
  return state;
}

describe('createLine', () => {
  it('creates a line and auto-deploys a locomotive', () => {
    const state = stateWithStations();
    const res = createLine(state, [1, 4]);
    expect(res.ok).toBe(true);
    expect(state.lines).toHaveLength(1);
    expect(state.inventory.locomotives).toBe(2);
    expect(state.trains).toHaveLength(1);
    expect(state.trains[0].lineId).toBe(state.lines[0].id);
    expect(state.lines[0].path.length).toBeGreaterThanOrEqual(2);
    expect(state.lines[0].nodeS).toHaveLength(2);
  });

  it('rejects duplicate stations in a chain', () => {
    const state = stateWithStations();
    const res = createLine(state, [1, 4, 1]);
    expect(res.ok).toBe(false);
    expect(state.lines).toHaveLength(0);
  });

  it('rejects chains whose river crossings exceed the tunnel stock', () => {
    const state = stateWithStations();
    state.inventory.tunnels = 1;
    const res = createLine(state, [1, 2, 3]); // two crossings
    expect(res.ok).toBe(false);
    expect(state.lines).toHaveLength(0);
  });

  it('allows chains within the tunnel stock', () => {
    const state = stateWithStations();
    state.inventory.tunnels = 2;
    const res = createLine(state, [1, 2, 3]);
    expect(res.ok).toBe(true);
    expect(tunnelsUsed(state)).toBe(2);
  });

  it('rejects when no line slot is free', () => {
    const state = stateWithStations();
    state.lineSlots = 1;
    expect(createLine(state, [1, 4]).ok).toBe(true);
    expect(createLine(state, [3, 5]).ok).toBe(false);
  });
});

describe('tunnel refunds via derived usage', () => {
  it('frees tunnels when a crossing leg is retracted', () => {
    const state = stateWithStations();
    state.inventory.tunnels = 1;
    expect(createLine(state, [1, 2]).ok).toBe(true); // uses the only tunnel
    expect(createLine(state, [5, 6]).ok).toBe(false); // none left
    const lineId = state.lines[0].id;
    expect(applyChain(state, lineId, [1, 4], false).ok).toBe(true); // off the river
    expect(tunnelsUsed(state)).toBe(0);
    expect(createLine(state, [5, 6]).ok).toBe(true); // refunded tunnel available
  });
});

describe('applyChain', () => {
  it('deletes the line and refunds hardware when retracted to one station', () => {
    const state = stateWithStations();
    expect(createLine(state, [1, 4]).ok).toBe(true);
    const lineId = state.lines[0].id;
    state.trains[0].carriages = 2;
    expect(applyChain(state, lineId, [1], false).ok).toBe(true);
    expect(state.lines).toHaveLength(0);
    expect(state.trains).toHaveLength(0);
    expect(state.inventory.locomotives).toBe(3);
    expect(state.inventory.carriages).toBe(2);
  });

  it('only accepts loops of three or more stations', () => {
    const state = stateWithStations();
    expect(createLine(state, [1, 4]).ok).toBe(true);
    const lineId = state.lines[0].id;
    expect(applyChain(state, lineId, [1, 4], true).ok).toBe(false);
    expect(applyChain(state, lineId, [1, 4, 3], true).ok).toBe(true);
    expect(state.lines[0].isLoop).toBe(true);
  });

  it('keeps trains within the new path bounds after retraction', () => {
    const state = stateWithStations();
    expect(createLine(state, [1, 4, 3, 5]).ok).toBe(true);
    const line = state.lines[0];
    state.trains[0].s = polylineLength(line.path); // park at the far end
    expect(applyChain(state, line.id, [1, 4], false).ok).toBe(true);
    expect(state.trains[0].s).toBeLessThanOrEqual(polylineLength(state.lines[0].path));
    expect(state.trains[0].s).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(state.trains[0].s)).toBe(true);
  });
});

describe('insertStation', () => {
  it('splices a station into a leg and re-paths', () => {
    const state = stateWithStations();
    expect(createLine(state, [1, 3]).ok).toBe(true);
    const lineId = state.lines[0].id;
    expect(insertStation(state, lineId, 0, 4).ok).toBe(true);
    expect(state.lines[0].stations).toEqual([1, 4, 3]);
    expect(state.lines[0].nodeS).toHaveLength(3);
  });

  it('rejects stations already on the line', () => {
    const state = stateWithStations();
    expect(createLine(state, [1, 4, 3]).ok).toBe(true);
    expect(insertStation(state, state.lines[0].id, 0, 3).ok).toBe(false);
  });
});

describe('deleteLine', () => {
  it('dumps onboard passengers at the nearest station of the old line', () => {
    const state = stateWithStations();
    expect(createLine(state, [1, 4]).ok).toBe(true);
    const train = state.trains[0];
    train.s = 0; // sitting at station 1
    train.passengers.push({ id: 99, shape: 'triangle', bornAt: 0 });
    deleteLine(state, state.lines[0].id);
    const stationA = state.stations.find((s) => s.id === 1)!;
    expect(stationA.waiting.some((p) => p.id === 99)).toBe(true);
    expect(state.trains).toHaveLength(0);
  });
});
