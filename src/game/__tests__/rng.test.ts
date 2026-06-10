import { describe, expect, it } from 'vitest';
import { mulberry32, pickWeighted, randRange } from '../rng';

describe('mulberry32', () => {
  it('produces a deterministic sequence for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a(), a(), a()]).toEqual([b(), b(), b(), b(), b()]);
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('randRange', () => {
  it('stays within [min, max)', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const v = randRange(r, 5, 9);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(9);
    }
  });
});

describe('pickWeighted', () => {
  it('never picks zero-weight items', () => {
    const r = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      expect(pickWeighted(r, [['a', 1], ['b', 0]])).toBe('a');
    }
  });

  it('picks roughly proportionally to weights', () => {
    const r = mulberry32(13);
    let a = 0;
    for (let i = 0; i < 3000; i++) {
      if (pickWeighted(r, [['a', 3], ['b', 1]]) === 'a') a++;
    }
    expect(a / 3000).toBeGreaterThan(0.7);
    expect(a / 3000).toBeLessThan(0.8);
  });
});
