import { describe, expect, it } from 'vitest';
import { WORLD } from '../constants';
import type { Vec } from '../types';
import { countRiverCrossings, isInRiver, RIVER_POINTS } from '../river';

// Synthetic horizontal river along y=100 (half-width 28) keeps assertions exact.
const river: Vec[] = [
  { x: 0, y: 100 },
  { x: 200, y: 100 },
];

describe('isInRiver', () => {
  it('detects points inside the band', () => {
    expect(isInRiver({ x: 50, y: 100 }, river)).toBe(true);
    expect(isInRiver({ x: 50, y: 120 }, river)).toBe(true);
  });

  it('rejects points outside the band', () => {
    expect(isInRiver({ x: 50, y: 130 }, river)).toBe(false);
  });
});

describe('countRiverCrossings', () => {
  it('counts a single perpendicular crossing', () => {
    expect(
      countRiverCrossings(
        [
          { x: 50, y: 0 },
          { x: 50, y: 200 },
        ],
        river,
      ),
    ).toBe(1);
  });

  it('counts zero for a path far away', () => {
    expect(
      countRiverCrossings(
        [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
        river,
      ),
    ).toBe(0);
  });

  it('counts two separate in-and-out crossings', () => {
    expect(
      countRiverCrossings(
        [
          { x: 20, y: 0 },
          { x: 20, y: 200 },
          { x: 80, y: 200 },
          { x: 80, y: 0 },
        ],
        river,
      ),
    ).toBe(2);
  });

  it('counts a path running along inside the river as one crossing', () => {
    expect(
      countRiverCrossings(
        [
          { x: 10, y: 100 },
          { x: 190, y: 100 },
        ],
        river,
      ),
    ).toBe(1);
  });
});

describe('RIVER_POINTS', () => {
  it('spans the whole world horizontally', () => {
    expect(RIVER_POINTS[0].x).toBeLessThan(0);
    expect(RIVER_POINTS[RIVER_POINTS.length - 1].x).toBeGreaterThan(WORLD.w);
  });
});
