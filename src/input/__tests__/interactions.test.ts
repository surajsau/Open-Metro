import { describe, expect, it, vi } from 'vitest';
import { GameStore } from '../../store';
import { Interactions } from '../interactions';
import type { Viewport } from '../../render/renderer';

// Minimal stub for the canvas — only the fields that beginInventoryDrag
// (or the code paths it exercises) actually access.
function makeStubCanvas() {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
    setPointerCapture: vi.fn(),
    style: { cursor: '' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;
}

// Fixed viewport — maps screen 1:1 to world for simplicity.
function makeViewport(): Viewport {
  return {
    scale: 1,
    ox: 0,
    oy: 0,
    cw: 1600,
    ch: 1000,
  };
}

// Stub window.addEventListener / removeEventListener so beginInventoryDrag
// can register window-level listeners without crashing in the node test env.
function stubWindowListeners() {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function makeStartedStore(): GameStore {
  const store = new GameStore(99);
  store.start();
  return store;
}

describe('Interactions.beginInventoryDrag — pause gate', () => {
  it('does NOT start a locomotive drag and fires toast when game is running', () => {
    stubWindowListeners();
    const store = makeStartedStore();
    store.setSpeed(1); // game is running

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();

    const addToastSpy = vi.spyOn(store, 'addToast');

    interactions.beginInventoryDrag('locomotive', { clientX: 400, clientY: 250 });

    expect(addToastSpy).toHaveBeenCalledWith('Pause the game to deploy trains');
    expect(interactions.getDrag()).toBeNull();
  });

  it('does NOT start a carriage drag and fires toast when game is running', () => {
    stubWindowListeners();
    const store = makeStartedStore();
    store.setSpeed(1); // game is running

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();

    const addToastSpy = vi.spyOn(store, 'addToast');

    interactions.beginInventoryDrag('carriage', { clientX: 400, clientY: 250 });

    expect(addToastSpy).toHaveBeenCalledWith('Pause the game to deploy trains');
    expect(interactions.getDrag()).toBeNull();
  });

  it('allows locomotive drag when game is paused (speed = 0)', () => {
    stubWindowListeners();
    const store = makeStartedStore();
    store.setSpeed(0); // paused

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();

    const addToastSpy = vi.spyOn(store, 'addToast');

    interactions.beginInventoryDrag('locomotive', { clientX: 400, clientY: 250 });

    expect(addToastSpy).not.toHaveBeenCalled();
    expect(interactions.getDrag()).not.toBeNull();
    expect(interactions.getDrag()?.mode).toBe('inventory');
  });

  it('allows carriage drag when game is paused (speed = 0)', () => {
    stubWindowListeners();
    const store = makeStartedStore();
    store.setSpeed(0); // paused

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();

    const addToastSpy = vi.spyOn(store, 'addToast');

    interactions.beginInventoryDrag('carriage', { clientX: 400, clientY: 250 });

    expect(addToastSpy).not.toHaveBeenCalled();
    expect(interactions.getDrag()).not.toBeNull();
    expect(interactions.getDrag()?.mode).toBe('inventory');
  });

  it('EXEMPTS interchange drag from the pause gate — runs even at speed > 0', () => {
    stubWindowListeners();
    const store = makeStartedStore();
    store.setSpeed(1); // game is running

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();

    const addToastSpy = vi.spyOn(store, 'addToast');

    // Give the store at least one interchange so the inventory is non-zero,
    // but beginInventoryDrag doesn't check count — InventoryBar does.
    interactions.beginInventoryDrag('interchange', { clientX: 400, clientY: 250 });

    expect(addToastSpy).not.toHaveBeenCalled();
    expect(interactions.getDrag()).not.toBeNull();
    expect(interactions.getDrag()?.mode).toBe('inventory');
  });

  it('does not fire toast at speed 2 for locomotive (running fast)', () => {
    stubWindowListeners();
    const store = makeStartedStore();
    store.setSpeed(2); // fast

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();

    const addToastSpy = vi.spyOn(store, 'addToast');

    interactions.beginInventoryDrag('locomotive', { clientX: 400, clientY: 250 });

    expect(addToastSpy).toHaveBeenCalledWith('Pause the game to deploy trains');
    expect(interactions.getDrag()).toBeNull();
  });
});

// Build a started store with two horizontal lines, each carrying a train, so a
// deployed train sprite sits at a known world position for hit-testing.
function makeTwoLineStore(): { store: GameStore; trainPos: { x: number; y: number }; trainId: number; lineAId: number; lineBId: number } {
  const store = new GameStore(77);
  store.start();
  const s = store.state;
  s.stations.length = 0; // drop the auto-spawned starter stations; use our own ids/positions
  s.lines.length = 0;
  s.trains.length = 0;
  s.stations.push(
    { id: 1, pos: { x: 100, y: 100 }, shape: 'circle', isInterchange: false, waiting: [], gauge: 0, spawnTimer: 999, bornAt: 0 },
    { id: 2, pos: { x: 500, y: 100 }, shape: 'circle', isInterchange: false, waiting: [], gauge: 0, spawnTimer: 999, bornAt: 0 },
    { id: 3, pos: { x: 100, y: 400 }, shape: 'square', isInterchange: false, waiting: [], gauge: 0, spawnTimer: 999, bornAt: 0 },
    { id: 4, pos: { x: 500, y: 400 }, shape: 'square', isInterchange: false, waiting: [], gauge: 0, spawnTimer: 999, bornAt: 0 },
  );
  store.commitCreate([1, 2], false); // line A, train auto-deploys at s=0 → station 1
  store.commitCreate([3, 4], false); // line B
  const lineA = s.lines[0];
  const lineB = s.lines[1];
  const train = s.trains.find((t) => t.lineId === lineA.id)!;
  // Train auto-deploys at s=0 (path start = station 1 at (100,100)).
  return { store, trainPos: { x: 100, y: 100 }, trainId: train.id, lineAId: lineA.id, lineBId: lineB.id };
}

describe('Interactions — deployed-train pick-up (INP-18/INP-19)', () => {
  it('starts a pickUpTrain drag when pressing a train while paused', () => {
    stubWindowListeners();
    const { store, trainPos, trainId, lineAId } = makeTwoLineStore();
    store.setSpeed(0); // paused

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();

    const e = { button: 0, clientX: trainPos.x, clientY: trainPos.y, pointerId: 1 } as unknown as PointerEvent;
    (interactions as any).onPointerDown(e);

    const drag = interactions.getDrag();
    expect(drag).not.toBeNull();
    expect(drag?.mode).toBe('pickUpTrain');
    expect((drag as any).trainId).toBe(trainId);
    expect((drag as any).fromLineId).toBe(lineAId);
  });

  it('does NOT pick up a train at speed > 0 — fires the pause toast and falls through', () => {
    stubWindowListeners();
    const { store, trainPos } = makeTwoLineStore();
    store.setSpeed(1); // running

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();
    const addToastSpy = vi.spyOn(store, 'addToast');

    const e = { button: 0, clientX: trainPos.x, clientY: trainPos.y, pointerId: 1 } as unknown as PointerEvent;
    (interactions as any).onPointerDown(e);

    expect(addToastSpy).toHaveBeenCalledWith('Pause the game to deploy trains');
    // No pickUpTrain drag began; the press fell through (a station sits under the
    // train, so a newLine drag may start instead — but never a pickUpTrain).
    expect(interactions.getDrag()?.mode).not.toBe('pickUpTrain');
  });

  it('commits a move when the pick-up is released on a different line', () => {
    stubWindowListeners();
    const { store, trainPos, trainId, lineAId, lineBId } = makeTwoLineStore();
    store.setSpeed(0);

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();
    const moveSpy = vi.spyOn(store, 'moveTrain');

    const down = { button: 0, clientX: trainPos.x, clientY: trainPos.y, pointerId: 1 } as unknown as PointerEvent;
    (interactions as any).onPointerDown(down);
    // Drag over line B (around y=400 between stations 3 and 4).
    const move = { clientX: 300, clientY: 400, pointerId: 1 } as unknown as PointerEvent;
    (interactions as any).onPointerMove(move);
    const up = { clientX: 300, clientY: 400, pointerId: 1 } as unknown as PointerEvent;
    (interactions as any).onPointerUp(up);

    expect(moveSpy).toHaveBeenCalled();
    const [fromLine, tId, toLine] = moveSpy.mock.calls[0];
    expect(fromLine).toBe(lineAId);
    expect(tId).toBe(trainId);
    expect(toLine).toBe(lineBId);
    expect(interactions.getDrag()).toBeNull();
  });

  it('cancels harmlessly when released on empty canvas — moveTrain not called', () => {
    stubWindowListeners();
    const { store, trainPos } = makeTwoLineStore();
    store.setSpeed(0);

    const interactions = new Interactions(store, makeViewport);
    (interactions as any).canvas = makeStubCanvas();
    const moveSpy = vi.spyOn(store, 'moveTrain');

    const down = { button: 0, clientX: trainPos.x, clientY: trainPos.y, pointerId: 1 } as unknown as PointerEvent;
    (interactions as any).onPointerDown(down);
    // Release far from any line.
    const up = { clientX: 900, clientY: 800, pointerId: 1 } as unknown as PointerEvent;
    (interactions as any).onPointerUp(up);

    expect(moveSpy).not.toHaveBeenCalled();
    expect(interactions.getDrag()).toBeNull();
  });
});
