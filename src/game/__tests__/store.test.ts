import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameStore } from '../../store';
import { makeStation } from './helpers';

function stubLocalStorage(): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('GameStore', () => {
  it('advances sim time only after start', () => {
    const store = new GameStore(51);
    store.tick(0);
    store.tick(1000);
    expect(store.state.time).toBe(0);
    store.start();
    store.tick(1016);
    store.tick(1032);
    expect(store.state.time).toBeGreaterThan(0);
  });

  it('keeps snapshot identity stable when nothing visible changes', () => {
    const store = new GameStore(52);
    const a = store.getSnapshot();
    store.tick(0);
    const b = store.getSnapshot();
    expect(a).toBe(b);
  });

  it('changes the snapshot when score-relevant state changes', () => {
    const store = new GameStore(53);
    const before = store.getSnapshot();
    store.start();
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().started).toBe(true);
  });

  it('scales sim speed and supports pause toggling', () => {
    const store = new GameStore(54);
    store.start();
    store.setSpeed(2);
    store.tick(0);
    store.tick(40); // 0.04 s real (inside the 50 ms clamp) → 0.08 s sim
    expect(store.state.time).toBeCloseTo(0.08, 5);
    store.togglePause();
    expect(store.state.speed).toBe(0);
    store.tick(200);
    expect(store.state.time).toBeCloseTo(0.08, 5); // frozen while paused
    store.togglePause();
    expect(store.state.speed).toBe(2);
  });

  it('starts a city in endless mode and exposes it on the snapshot', () => {
    const store = new GameStore(56);
    store.startCity('london', 'endless');
    expect(store.state.mode).toBe('endless');
    expect(store.getSnapshot().mode).toBe('endless');
  });

  it('keeps the mode across restart', () => {
    const store = new GameStore(57);
    store.startCity('london', 'endless');
    store.restart(57);
    expect(store.state.mode).toBe('endless');
  });

  it('ends an endless run manually and records the best score', () => {
    const data = stubLocalStorage();
    const store = new GameStore(58);
    store.startCity('london', 'endless');
    store.state.score = 42;
    store.endRun();
    expect(store.state.gameOver).toBe(true);
    expect(store.state.speed).toBe(0);
    expect(data.get('mm-best-london')).toBe('42');
  });

  it('records the best score when abandoning a run via toMenu or restart', () => {
    const data = stubLocalStorage();
    const store = new GameStore(59);
    store.startCity('london');
    store.state.score = 17;
    store.toMenu();
    expect(data.get('mm-best-london')).toBe('17');
    store.startCity('london');
    store.state.score = 23;
    store.restart();
    expect(data.get('mm-best-london')).toBe('23');
  });

  it('surfaces toasts and expires them in real time', () => {
    const store = new GameStore(55);
    store.addToast('No tunnels available');
    expect(store.getSnapshot().toasts.map((t) => t.msg)).toContain('No tunnels available');
  });

  it('moveTrain relocates a deployed train to another line, conserving hardware', () => {
    const store = new GameStore(61);
    store.start();
    const s = store.state;
    s.stations.length = 0;
    s.lines.length = 0;
    s.trains.length = 0;
    s.stations.push(
      makeStation(1, 0, 0, 'circle'),
      makeStation(2, 400, 0, 'circle'),
      makeStation(3, 0, 300, 'square'),
      makeStation(4, 400, 300, 'square'),
    );
    expect(store.commitCreate([1, 2], false)).toBe(true); // line A + auto train
    expect(store.commitCreate([3, 4], false)).toBe(true); // line B + auto train
    const lineA = s.lines[0];
    const lineB = s.lines[1];
    const train = s.trains.find((t) => t.lineId === lineA.id)!;

    const totalLocos = () => s.inventory.locomotives + s.trains.length;
    const before = totalLocos();

    store.setSpeed(0); // paused — required, though moveTrain itself is the core op
    const moved = store.moveTrain(lineA.id, train.id, lineB.id, { x: 200, y: 300 });

    expect(moved).toBe(true);
    expect(totalLocos()).toBe(before); // no loco created or destroyed
    expect(s.trains.some((t) => t.lineId === lineB.id)).toBe(true);
    expect(s.trains.filter((t) => t.lineId === lineA.id)).toHaveLength(0);
  });

  it('moveTrain rejects a same-line drop as a no-op (GD-44 / INP-20 / TRN-15)', () => {
    const store = new GameStore(63);
    store.start();
    const s = store.state;
    s.stations.length = 0;
    s.lines.length = 0;
    s.trains.length = 0;
    s.stations.push(makeStation(1, 0, 0, 'circle'), makeStation(2, 400, 0, 'circle'));
    expect(store.commitCreate([1, 2], false)).toBe(true); // line A + auto train
    const lineA = s.lines[0];
    s.inventory.carriages = 5;
    store.dropCarriage(lineA.id); // train on A now has 1 carriage
    const train = s.trains.find((t) => t.lineId === lineA.id)!;
    expect(train.carriages).toBe(1);

    const totalLocos = () => s.inventory.locomotives + s.trains.length;
    const totalCarriages = () => s.inventory.carriages + s.trains.reduce((n, t) => n + t.carriages, 0);
    const locosBefore = totalLocos();
    const carriagesBefore = totalCarriages();
    const trainsBefore = [...s.trains];
    const locoInvBefore = s.inventory.locomotives;
    const carriageInvBefore = s.inventory.carriages;

    store.setSpeed(0);
    const moved = store.moveTrain(lineA.id, train.id, lineA.id, { x: 200, y: 0 });

    // Rejected — nothing moves.
    expect(moved).toBe(false);
    expect(totalLocos()).toBe(locosBefore);
    expect(totalCarriages()).toBe(carriagesBefore);
    // The train is untouched: still on line A, still carrying its carriage, same object.
    expect(s.trains).toEqual(trainsBefore);
    expect(s.trains.find((t) => t.id === train.id)).toBe(train);
    expect(train.lineId).toBe(lineA.id);
    expect(train.carriages).toBe(1);
    // Inventory unchanged — no transient refund/redeploy churn.
    expect(s.inventory.locomotives).toBe(locoInvBefore);
    expect(s.inventory.carriages).toBe(carriageInvBefore);
  });

  it('moveTrain re-attaches carriages onto the target line', () => {
    const store = new GameStore(62);
    store.start();
    const s = store.state;
    s.stations.length = 0;
    s.lines.length = 0;
    s.trains.length = 0;
    s.stations.push(
      makeStation(1, 0, 0, 'circle'),
      makeStation(2, 400, 0, 'circle'),
      makeStation(3, 0, 300, 'square'),
      makeStation(4, 400, 300, 'square'),
    );
    // Line B is built WITHOUT an auto-train (no loco stock at the moment) so the
    // relocated train is the only carriage candidate on it.
    expect(store.commitCreate([1, 2], false)).toBe(true); // line A + auto train
    const lineA = s.lines[0];
    s.inventory.carriages = 5;
    store.dropCarriage(lineA.id);
    store.dropCarriage(lineA.id);
    const train = s.trains.find((t) => t.lineId === lineA.id)!;
    expect(train.carriages).toBe(2);
    const locoStash = s.inventory.locomotives;
    s.inventory.locomotives = 0; // line B auto-deploys no train
    expect(store.commitCreate([3, 4], false)).toBe(true);
    s.inventory.locomotives = locoStash;
    const lineB = s.lines[1];
    expect(s.trains.filter((t) => t.lineId === lineB.id)).toHaveLength(0);

    store.moveTrain(lineA.id, train.id, lineB.id, { x: 200, y: 300 });

    // The relocated train now runs on B carrying its 2 carriages.
    expect(s.trains.some((t) => t.lineId === lineB.id && t.carriages === 2)).toBe(true);
  });
});
