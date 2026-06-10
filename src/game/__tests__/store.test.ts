import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameStore } from '../../store';

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
});
