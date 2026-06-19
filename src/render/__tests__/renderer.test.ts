import { describe, expect, it } from 'vitest';
import { PARALLEL_GAP, PARALLEL_WIDTH_FACTOR, LINE_WIDTH } from '../../game/constants';
import type { Line } from '../../game/types';
import { computeLegOffsets, legIndexAtArcLength, legKey } from '../legOffsets';

function stubLine(id: number, stations: number[], isLoop = false): Line {
  return { id, stations, isLoop, path: [], nodeS: [] };
}

describe('PARALLEL_WIDTH_FACTOR constant', () => {
  it('is defined and equals 0.5', () => {
    expect(PARALLEL_WIDTH_FACTOR).toBe(0.5);
  });

  it('gives a narrower stroke than LINE_WIDTH when applied', () => {
    expect(LINE_WIDTH * PARALLEL_WIDTH_FACTOR).toBeLessThan(LINE_WIDTH);
  });

  it('PARALLEL_GAP is still wider than the halved line width so daylight shows', () => {
    expect(PARALLEL_GAP).toBeGreaterThan(LINE_WIDTH * PARALLEL_WIDTH_FACTOR);
  });
});

describe('legIndexAtArcLength', () => {
  // nodeS = [0, 100, 200] means 3 stations: leg 0 spans [0,100], leg 1 spans [100,200]
  it('returns 0 for s at the start of the first leg', () => {
    expect(legIndexAtArcLength([0, 100, 200], 0, false)).toBe(0);
  });

  it('returns 0 for s in the middle of the first leg', () => {
    expect(legIndexAtArcLength([0, 100, 200], 50, false)).toBe(0);
  });

  it('returns 1 when s is exactly at the second station', () => {
    // At the junction, round to next leg (dwells at a station belong to the leg ahead)
    expect(legIndexAtArcLength([0, 100, 200], 100, false)).toBe(1);
  });

  it('returns 1 for s in the middle of the second leg', () => {
    expect(legIndexAtArcLength([0, 100, 200], 150, false)).toBe(1);
  });

  it('clamps to last valid leg for s at/beyond the end (non-loop)', () => {
    expect(legIndexAtArcLength([0, 100, 200], 200, false)).toBe(1);
    expect(legIndexAtArcLength([0, 100, 200], 250, false)).toBe(1);
  });

  it('handles single-leg line (2 stations)', () => {
    expect(legIndexAtArcLength([0, 100], 60, false)).toBe(0);
  });

  it('for a loop, closing leg index is stations.length-1', () => {
    // 3-station loop: nodeS=[0,100,200], total=300 (closing leg 200→300)
    // leg 0: [0,100], leg 1: [100,200], leg 2 (closing): [200,300]
    expect(legIndexAtArcLength([0, 100, 200], 250, true, 300)).toBe(2);
  });

  it('for a loop, s at start wraps to closing leg index range correctly', () => {
    // s=0..100 is still leg 0
    expect(legIndexAtArcLength([0, 100, 200], 50, true, 300)).toBe(0);
  });
});

describe('parallel leg width selection logic', () => {
  it('a leg with non-zero offset should use reduced width', () => {
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const offsets = computeLegOffsets([line0, line1]);
    const offset0 = offsets.get(legKey(0, 0)) ?? 0;
    // parallel leg: offset !== 0, so we apply PARALLEL_WIDTH_FACTOR
    expect(offset0).not.toBe(0);
    const strokeWidth = offset0 !== 0 ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH;
    expect(strokeWidth).toBe(LINE_WIDTH * PARALLEL_WIDTH_FACTOR);
  });

  it('a lone leg with zero offset keeps full LINE_WIDTH', () => {
    const line = stubLine(0, [1, 2]);
    const offsets = computeLegOffsets([line]);
    const offset = offsets.get(legKey(0, 0)) ?? 0;
    // lone leg: offset === 0
    expect(offset).toBe(0);
    const strokeWidth = offset !== 0 ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH;
    expect(strokeWidth).toBe(LINE_WIDTH);
  });
});
