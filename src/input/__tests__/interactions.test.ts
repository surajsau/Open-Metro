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
