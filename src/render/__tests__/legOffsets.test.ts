import { describe, expect, it } from 'vitest';
import { PARALLEL_GAP } from '../../game/constants';
import { norm, octilinearPath, offsetPolyline, sub } from '../../game/geometry';
import type { Line, Station, Vec } from '../../game/types';
import { computeLegOffsets, computeShiftedTermini, legIndexAtArcLength, legKey } from '../legOffsets';

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

  it('keeps reversed legs on opposite geometric sides in world space (constant-shift)', () => {
    // Line 0 runs A→B [stations 1,2], line 1 runs B→A [stations 2,1] — same corridor.
    // With constant-shift using canonical direction (1→2 = right), perpendicular = (0,1).
    // line0 offset = -PARALLEL_GAP/2 → headStart at A + (0,1)*(-PARALLEL_GAP/2) = (0, -PARALLEL_GAP/2).
    // line1 offset = +PARALLEL_GAP/2 → headStart at B + (0,1)*(+PARALLEL_GAP/2) = (100, +PARALLEL_GAP/2).
    // Both terminus points are on OPPOSITE geometric sides of the center y=0 line — correct.
    const offsets = computeLegOffsets([stubLine(0, [1, 2]), stubLine(1, [2, 1])]);
    const A = { x: 0, y: 0 };
    const B = { x: 100, y: 0 };
    // Canonical dir for corridor {1,2}: norm(B-A)=(1,0). perp=(0,1).
    const perp = { x: 0, y: 1 };
    const off0 = offsets.get(legKey(0, 0))!;
    const off1 = offsets.get(legKey(1, 0))!;
    // Constant-shift: add perp*offset to the start point.
    const y0 = A.y + perp.y * off0; // line0 head at A
    const y1 = B.y + perp.y * off1; // line1 head at B
    const ys = [y0, y1].sort((p, q) => p - q);
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

  it('reversed parallel lines have head starts on opposite geometric sides (constant-shift, no reversed negation)', () => {
    // Line 0: A→B (forward) [stations 1,2], Line 1: B→A (reversed) [stations 2,1].
    // computeLegOffsets (no reversed negation): line0 offset=-PARALLEL_GAP/2, line1 offset=+PARALLEL_GAP/2.
    // constant-shift uses canonical dir (1→2 = right), perp = (0,1) for both.
    // line0 headStart = A.pos + (0,1)*(-PARALLEL_GAP/2) = (0,-PARALLEL_GAP/2) → y = -4
    // line1 headStart = B.pos + (0,1)*(+PARALLEL_GAP/2) = (100,+PARALLEL_GAP/2) → y = +4
    // They're on OPPOSITE geometric sides — correct parallel rendering.
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [2, 1]);
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 100, 0);
    const stations = new Map([[1, stA], [2, stB]]);
    const offsets = computeLegOffsets([line0, line1]);

    const t0 = computeShiftedTermini(line0, offsets, stations)!;
    const t1 = computeShiftedTermini(line1, offsets, stations)!;

    const ys0 = t0.headStart.y; // line0 head at A
    const ys1 = t1.headStart.y; // line1 head at B

    // Both PARALLEL_GAP/2 away from center but on opposite sides.
    expect(Math.abs(ys0)).toBeCloseTo(PARALLEL_GAP / 2, 6);
    expect(Math.abs(ys1)).toBeCloseTo(PARALLEL_GAP / 2, 6);
    expect(ys0 * ys1).toBeLessThan(0); // opposite signs = opposite geometric sides
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

// Fix B: computeShiftedTermini must use constant lateral shift (not offsetPolyline miter).
// For a bent (L-shaped) path, offsetPolyline miters the corner and shifts the first/last
// point in different directions depending on which segment they're on. The constant-shift
// approach shifts every point by the same perpendicular derived from the CANONICAL A→B
// direction (min station ID → max station ID), so the offset is translation-only.
describe('computeShiftedTermini — constant lateral shift (Fix B)', () => {
  function stubStation(id: number, x: number, y: number): Station {
    return { id, pos: { x, y }, shape: 'circle', isInterchange: false, waiting: [], gauge: 0, spawnTimer: 0, bornAt: 0 };
  }

  it('headStart is a pure perpendicular translation of station A pos for a horizontal corridor', () => {
    // Line 0 [1,2] horizontal: A=(0,0), B=(100,0). Canonical dir = right (1,0). perp = (0,1).
    // headOffset = offsets.get(legKey(0,0)) = -PARALLEL_GAP/2 (line 0 of 2, sorted first).
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 100, 0);
    const stations = new Map([[1, stA], [2, stB]]);
    const offsets = computeLegOffsets([line0, line1]);
    const headOffset = offsets.get(legKey(0, 0))!;

    const t = computeShiftedTermini(line0, offsets, stations)!;

    // Constant shift: headStart = A.pos + perp * headOffset.
    // Corridor 1→2: aId=1 < bId=2, canonical dir = norm(B-A) = (1,0), perp = (0,1).
    // headStart.x must equal A.pos.x = 0 (no x shift for vertical perp).
    // headStart.y must equal headOffset.
    expect(t.headStart.x).toBeCloseTo(stA.pos.x, 6);
    expect(t.headStart.y).toBeCloseTo(headOffset, 6);
  });

  it('tailStart is a pure perpendicular translation of station B pos for a horizontal corridor', () => {
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 100, 0);
    const stations = new Map([[1, stA], [2, stB]]);
    const offsets = computeLegOffsets([line0, line1]);
    const tailOffset = offsets.get(legKey(0, 0))!; // only 1 leg, so headOffset = tailOffset

    const t = computeShiftedTermini(line0, offsets, stations)!;

    expect(t.tailStart.x).toBeCloseTo(stB.pos.x, 6);
    expect(t.tailStart.y).toBeCloseTo(tailOffset, 6);
  });

  it('headStart and tailStart have the SAME perpendicular shift for a bent (L-shaped) corridor', () => {
    // Bent corridor: A=(0,0) → B=(50,50) → C=(150,50). Line 0 [1,3] (uses octilinearPath).
    // The first leg is 1→2. With a constant shift, BOTH headStart and tailStart get the
    // same perpendicular displacement relative to their respective station positions.
    // Key invariant: headStart.y === tailStart.y for a corridor whose canonical perp is vertical.
    // (offsetPolyline would give different y values because the elbow miter would displace
    // the corner point sideways, but the constant-shift approach does NOT do that.)
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    // Diagonal corridor (45°): A=(0,0), B=(100,100). Canonical dir = (1,1)/sqrt(2).
    // perp (left-normal) = (-1,1)/sqrt(2). headOffset = -PARALLEL_GAP/2.
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 100, 100);
    const stations = new Map([[1, stA], [2, stB]]);
    const offsets = computeLegOffsets([line0, line1]);
    const headOffset = offsets.get(legKey(0, 0))!;

    const t = computeShiftedTermini(line0, offsets, stations)!;

    // Canonical dir for 1→2: norm(B-A) = norm((100,100)) = (1/√2, 1/√2).
    // Perp: (-1/√2, 1/√2).
    // headStart = A.pos + perp * headOffset = (0 + (-1/√2)*headOffset, 0 + (1/√2)*headOffset).
    // tailStart = B.pos + perp * headOffset = (100 + (-1/√2)*headOffset, 100 + (1/√2)*headOffset).
    const inv_sqrt2 = 1 / Math.sqrt(2);
    expect(t.headStart.x).toBeCloseTo(stA.pos.x - inv_sqrt2 * headOffset, 5);
    expect(t.headStart.y).toBeCloseTo(stA.pos.y + inv_sqrt2 * headOffset, 5);
    expect(t.tailStart.x).toBeCloseTo(stB.pos.x - inv_sqrt2 * headOffset, 5);
    expect(t.tailStart.y).toBeCloseTo(stB.pos.y + inv_sqrt2 * headOffset, 5);
  });

  it('constant-shift headStart differs from offsetPolyline headStart for a bent path (demonstrates the fix)', () => {
    // A bent path: A=(0,0), elbow=(50,0), B=(100,50). This exercises the miter at the elbow.
    // offsetPolyline miters the corner — the first point is shifted by the FIRST segment's perp.
    // The constant-shift approach shifts by the CANONICAL corridor perp (A→B direction).
    // These differ when the corridor has a bend.
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    // Use station positions that will produce a bent octilinearPath.
    // A=(0,0), B=(100,50): dx=100, dy=50. min(|dx|,|dy|)=50.
    // elbow = (50, 50) → path is [(0,0),(50,50),(100,50)] — diagonal then horizontal.
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 100, 50);
    const stations = new Map([[1, stA], [2, stB]]);
    const offsets = computeLegOffsets([line0, line1]);
    const headOffset = offsets.get(legKey(0, 0))!;

    const basePath = octilinearPath(stA.pos, stB.pos);

    // What offsetPolyline gives (old behavior):
    const oldHeadStart = offsetPolyline(basePath, headOffset)[0];

    // What constant-shift gives (new behavior):
    // Canonical dir 1→2: aId=1 < bId=2, dir = norm(B-A) = norm((100,50)).
    const canonDir = norm(sub(stB.pos, stA.pos));
    const perp: Vec = { x: -canonDir.y, y: canonDir.x };
    const newHeadStart: Vec = { x: basePath[0].x + perp.x * headOffset, y: basePath[0].y + perp.y * headOffset };

    // They should NOT be equal (demonstrates the miter vs constant-shift difference).
    // The constant-shift should differ in at least one coordinate.
    const epsX = Math.abs(oldHeadStart.x - newHeadStart.x);
    const epsY = Math.abs(oldHeadStart.y - newHeadStart.y);
    expect(epsX + epsY).toBeGreaterThan(0.001); // They differ for a bent path

    // After Fix B, computeShiftedTermini must produce the constant-shift result.
    const t = computeShiftedTermini(line0, offsets, stations)!;
    expect(t.headStart.x).toBeCloseTo(newHeadStart.x, 5);
    expect(t.headStart.y).toBeCloseTo(newHeadStart.y, 5);
  });
});
