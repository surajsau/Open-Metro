import { describe, expect, it } from 'vitest';
import { PARALLEL_GAP } from '../../game/constants';
import { offsetPolyline } from '../../game/geometry';
import type { Line, Station } from '../../game/types';
import { computeLegOffsets, computeShiftedTermini, legKey } from '../legOffsets';

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

function stubStation(id: number, x: number, y: number): Station {
  return { id, pos: { x, y }, shape: 'circle', isInterchange: false, waiting: [], gauge: 0, spawnTimer: 0, bornAt: 0 };
}

describe('computeShiftedTermini', () => {
  it('returns null for a loop line (loops have no tails)', () => {
    const loop = stubLine(0, [1, 2, 3], true);
    const stations = new Map([
      [1, stubStation(1, 0, 0)],
      [2, stubStation(2, 100, 0)],
      [3, stubStation(3, 50, 100)],
    ]);
    const offsets = computeLegOffsets([loop]);
    expect(computeShiftedTermini(loop, offsets, stations)).toBeNull();
  });

  it('returns centered termini when a line has no shared corridor (offset=0)', () => {
    const line = stubLine(0, [1, 2]);
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 100, 0);
    const stations = new Map([[1, stA], [2, stB]]);
    const offsets = computeLegOffsets([line]); // lone line, all offsets stay unset (??0)
    const t = computeShiftedTermini(line, offsets, stations)!;
    expect(t).not.toBeNull();
    // Offset 0 → start points coincide with the actual station positions
    expect(t.headStart.x).toBeCloseTo(0, 6);
    expect(t.headStart.y).toBeCloseTo(0, 6);
    expect(t.tailStart.x).toBeCloseTo(100, 6);
    expect(t.tailStart.y).toBeCloseTo(0, 6);
  });

  it('returns different head/tail start points for two parallel lines', () => {
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 100, 0);
    const stations = new Map([[1, stA], [2, stB]]);
    const offsets = computeLegOffsets([line0, line1]);

    const t0 = computeShiftedTermini(line0, offsets, stations)!;
    const t1 = computeShiftedTermini(line1, offsets, stations)!;

    expect(t0).not.toBeNull();
    expect(t1).not.toBeNull();

    // Head starts must be on opposite perpendicular sides of x=0, y=0
    // (corridor is horizontal, so perpendicular is vertical)
    expect(t0.headStart.x).toBeCloseTo(0, 6);
    expect(t1.headStart.x).toBeCloseTo(0, 6);
    // They must be separated by PARALLEL_GAP in y
    expect(Math.abs(t0.headStart.y - t1.headStart.y)).toBeCloseTo(PARALLEL_GAP, 6);
    expect(t0.headStart.y + t1.headStart.y).toBeCloseTo(0, 6); // centered

    // Tail starts similarly separated
    expect(Math.abs(t0.tailStart.y - t1.tailStart.y)).toBeCloseTo(PARALLEL_GAP, 6);
    expect(t0.tailStart.y + t1.tailStart.y).toBeCloseTo(0, 6);
  });

  it('reversed parallel lines have head starts on opposite sides in world space', () => {
    // Line 0: A→B (forward), Line 1: B→A (reversed)
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [2, 1]);
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 100, 0);
    const stations = new Map([[1, stA], [2, stB]]);
    const offsets = computeLegOffsets([line0, line1]);

    const t0 = computeShiftedTermini(line0, offsets, stations)!;
    const t1 = computeShiftedTermini(line1, offsets, stations)!;

    // line0 head = station 1 (A) shifted by headOffset
    // line1 head = station 2 (B) shifted by headOffset (reversed line)
    // Both should be shifted perpendicular by PARALLEL_GAP/2 but on the SAME geometric side
    // since reversed legs flip the sign to land on consistent world-space sides
    const ys0 = t0.headStart.y; // line0 head at A
    const ys1 = t1.headStart.y; // line1 head at B (reversed, so this is also an endpoint)
    expect(Math.abs(ys0)).toBeCloseTo(PARALLEL_GAP / 2, 6);
    expect(Math.abs(ys1)).toBeCloseTo(PARALLEL_GAP / 2, 6);
    // The two lines should land on opposite geometric sides
    expect(ys0 * ys1).toBeLessThan(0); // opposite signs
  });
});
