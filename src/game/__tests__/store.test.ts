import { describe, expect, it } from 'vitest';
import { GameStore } from '../../store';

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

  it('surfaces toasts and expires them in real time', () => {
    const store = new GameStore(55);
    store.addToast('No tunnels available');
    expect(store.getSnapshot().toasts.map((t) => t.msg)).toContain('No tunnels available');
  });
});
