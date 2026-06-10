import { describe, expect, it } from 'vitest';
import { PARALLEL_GAP } from '../../game/constants';
import { offsetPolyline } from '../../game/geometry';
import type { Line } from '../../game/types';
import { computeLegOffsets, legKey } from '../legOffsets';

function stubLine(id: number, stations: number[], isLoop = false): Line {
  return { id, stations, isLoop, path: [], nodeS: [] };
}

describe('computeLegOffsets', () => {
  it('gives a lone line zero offset', () => {
    const offsets = computeLegOffsets([stubLine(0, [1, 2, 3])]);
    expect(offsets.get(legKey(0, 0)) ?? 0).toBe(0);
    expect(offsets.get(legKey(0, 1)) ?? 0).toBe(0);
  });

  it('spreads two lines sharing a station pair by the parallel gap', () => {
    const offsets = computeLegOffsets([stubLine(0, [1, 2]), stubLine(1, [1, 2])]);
    const a = offsets.get(legKey(0, 0))!;
    const b = offsets.get(legKey(1, 0))!;
    expect(Math.abs(a - b)).toBeCloseTo(PARALLEL_GAP, 6);
    expect(a + b).toBeCloseTo(0, 6);
  });

  it('keeps reversed legs on opposite geometric sides in world space', () => {
    // Line 0 runs A→B, line 1 runs B→A over the same corridor along y=0.
    const offsets = computeLegOffsets([stubLine(0, [1, 2]), stubLine(1, [2, 1])]);
    const A = { x: 0, y: 0 };
    const B = { x: 100, y: 0 };
    const w0 = offsetPolyline([A, B], offsets.get(legKey(0, 0))!);
    const w1 = offsetPolyline([B, A], offsets.get(legKey(1, 0))!);
    const ys = [w0[0].y, w1[0].y].sort((p, q) => p - q);
    expect(ys[0]).toBeCloseTo(-PARALLEL_GAP / 2, 6);
    expect(ys[1]).toBeCloseTo(PARALLEL_GAP / 2, 6);
  });

  it('includes the closing leg of loops', () => {
    const loop = stubLine(0, [1, 2, 3], true);
    const other = stubLine(1, [3, 1]); // shares the closing pair 3–1
    const offsets = computeLegOffsets([loop, other]);
    // closing leg of the loop is legIndex 2 (from station 3 back to station 1)
    expect(offsets.get(legKey(0, 2))).toBeDefined();
    expect(Math.abs(offsets.get(legKey(0, 2))! - offsets.get(legKey(1, 0))!)).toBeCloseTo(PARALLEL_GAP, 6);
  });
});
