import { describe, expect, it } from 'vitest';
import type { Vec } from '../types';
import { countRiverCrossings, isInRiver } from '../river';

// Synthetic horizontal river along y=100 (half-width 28) keeps assertions exact.
const river: Vec[] = [
  { x: 0, y: 100 },
  { x: 200, y: 100 },
];
const rivers = [river];

describe('isInRiver', () => {
  it('detects points inside the band', () => {
    expect(isInRiver({ x: 50, y: 100 }, rivers)).toBe(true);
    expect(isInRiver({ x: 50, y: 120 }, rivers)).toBe(true);
  });

  it('rejects points outside the band', () => {
    expect(isInRiver({ x: 50, y: 130 }, rivers)).toBe(false);
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
        rivers,
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
        rivers,
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
        rivers,
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
        rivers,
      ),
    ).toBe(1);
  });

  it('counts crossings of separate rivers independently', () => {
    const second: Vec[] = [
      { x: 0, y: 300 },
      { x: 200, y: 300 },
    ];
    const path = [
      { x: 100, y: 0 },
      { x: 100, y: 400 }, // crosses both bands once each
    ];
    expect(countRiverCrossings(path, [river, second])).toBe(2);
  });
});
