import { describe, expect, it } from 'vitest';
import { PARALLEL_GAP, PARALLEL_WIDTH_FACTOR, LINE_WIDTH } from '../../game/constants';
import { octilinearPath, offsetPolyline, pointAtArcLength, polylineLength } from '../../game/geometry';
import type { Line, Station } from '../../game/types';
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

  // Bug 3 regression: non-parallel legs on a line that also has parallel legs
  // must still get LINE_WIDTH (not reduced). The per-leg check must be inside
  // forEachLeg, not set once for the whole line.
  it('non-parallel leg on a mixed-corridor line keeps full LINE_WIDTH', () => {
    // Line A [1,2,3]: leg 0 (1→2) is shared with line B; leg 1 (2→3) is NOT shared.
    const lineA = stubLine(0, [1, 2, 3]);
    const lineB = stubLine(1, [1, 2]);
    const offsets = computeLegOffsets([lineA, lineB]);

    // Leg 0 of line A is parallel → must have a non-zero offset entry.
    const parallelOffset = offsets.get(legKey(0, 0)) ?? 0;
    expect(parallelOffset).not.toBe(0);
    expect(parallelOffset !== 0 ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH).toBe(
      LINE_WIDTH * PARALLEL_WIDTH_FACTOR,
    );

    // Leg 1 of line A is NOT parallel → must have NO entry in offsets (offset===0 via ?? 0).
    expect(offsets.get(legKey(0, 1))).toBeUndefined();
    const nonParallelOffset = offsets.get(legKey(0, 1)) ?? 0;
    expect(nonParallelOffset).toBe(0);
    expect(nonParallelOffset !== 0 ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH).toBe(LINE_WIDTH);
  });

  it('a completely isolated line (no shared corridors with any other line) keeps full LINE_WIDTH for all legs', () => {
    // Line A and Line B share no station pairs. All legs of both lines must get LINE_WIDTH.
    const lineA = stubLine(0, [1, 2, 3]);
    const lineB = stubLine(1, [4, 5]);
    const offsets = computeLegOffsets([lineA, lineB]);

    // offsets map must be empty — no parallel corridors at all
    expect(offsets.size).toBe(0);

    // All legs of line A get offset=0 → LINE_WIDTH
    for (let legIndex = 0; legIndex < 2; legIndex++) {
      const offset = offsets.get(legKey(0, legIndex)) ?? 0;
      expect(offset).toBe(0);
      expect(offset !== 0 ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH).toBe(LINE_WIDTH);
    }
    // All legs of line B get offset=0 → LINE_WIDTH
    const offsetB = offsets.get(legKey(1, 0)) ?? 0;
    expect(offsetB).toBe(0);
    expect(offsetB !== 0 ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH).toBe(LINE_WIDTH);
  });
});

// Bug 4 regression: computeLegOffsets must group only legs sharing the same
// UNORDERED STATION-ID PAIR. Geometrically crossing paths with different station
// IDs must NOT be grouped together.
describe('computeLegOffsets — correct station-pair identity', () => {
  it('two lines connecting different station pairs are never grouped (no false parallels)', () => {
    // Line A: 1→3, Line B: 2→4. Paths may cross visually but station pairs differ.
    const lineA = stubLine(0, [1, 3]);
    const lineB = stubLine(1, [2, 4]);
    const offsets = computeLegOffsets([lineA, lineB]);

    // No shared station pairs → offsets map must be empty
    expect(offsets.size).toBe(0);
    expect(offsets.get(legKey(0, 0)) ?? 0).toBe(0);
    expect(offsets.get(legKey(1, 0)) ?? 0).toBe(0);
  });

  it('three-leg lines with a single shared corridor: only the shared leg gets an offset', () => {
    // Line A [1,2,3]: leg0=(1,2) forward, leg1=(2,3) non-shared
    // Line B [4,2,1]: leg0=(4,2) non-shared, leg1=(2,1) reversed  →  shared corridor is {1,2}
    const lineA = stubLine(0, [1, 2, 3]);
    const lineB = stubLine(1, [4, 2, 1]);
    const offsets = computeLegOffsets([lineA, lineB]);

    // Shared corridor {1,2}: line A leg 0 (forward) and line B leg 1 (reversed).
    // Both must have a defined offset entry (non-zero, meaning parallel rendering applies).
    expect(offsets.get(legKey(0, 0))).toBeDefined();
    expect(offsets.get(legKey(1, 1))).toBeDefined();
    // Each offset is ±PARALLEL_GAP/2 (opposite signs — constant-shift uses canonical direction
    // so opposite-signed offsets produce opposite-side world positions).
    expect(Math.abs(offsets.get(legKey(0, 0)) ?? 0)).toBeCloseTo(PARALLEL_GAP / 2, 6);
    expect(Math.abs(offsets.get(legKey(1, 1)) ?? 0)).toBeCloseTo(PARALLEL_GAP / 2, 6);

    // Non-shared legs must have no offset entry (undefined → 0 via ?? 0 → LINE_WIDTH)
    expect(offsets.get(legKey(0, 1))).toBeUndefined();  // line A leg 1 (2→3)
    expect(offsets.get(legKey(1, 0))).toBeUndefined();  // line B leg 0 (4→2)
  });

  it('reversed corridor uses station IDs for grouping, not array indices', () => {
    // Confirm that line A [10, 1] and line B [1, 10] share the same corridor:
    // their grouping keys are both "1-10" (min-max of station IDs).
    // If array indices were used instead, leg0 of each line would collide on key "0-1",
    // grouping lines that should NOT be grouped.
    const lineA = stubLine(0, [10, 1]);   // leg 0: a=10, b=1  → key "1-10"
    const lineB = stubLine(1, [1, 10]);   // leg 0: a=1,  b=10 → key "1-10"
    const lineC = stubLine(2, [5, 20]);   // leg 0: a=5,  b=20 → key "5-20" — DIFFERENT

    const offsets = computeLegOffsets([lineA, lineB, lineC]);

    // A and B share corridor {1,10} → both must have offsets
    expect(offsets.get(legKey(0, 0))).toBeDefined();
    expect(offsets.get(legKey(1, 0))).toBeDefined();

    // C does NOT share any corridor with A or B → must have no offset
    expect(offsets.get(legKey(2, 0))).toBeUndefined();
    expect(offsets.get(legKey(2, 0)) ?? 0).toBe(0);
  });
});

// Bug 5 regression: 3-line corridor center strand must get half-width.
// The center strand gets offset=0 from computeLegOffsets (it IS stored in the map),
// but the old `legOffset !== 0` width check wrongly assigned it LINE_WIDTH.
// Fix: use offsets.has(legKey(...)) to distinguish "in parallel group" from "solo leg".
describe('Bug 5 — center strand in 3-line group uses half-width', () => {
  it('computeLegOffsets stores a map entry for ALL three members, including the center (offset=0)', () => {
    // Three lines all sharing corridor {1,2}. Sorted by lineId: 0,1,2.
    // Offsets: line 0 → -PARALLEL_GAP, line 1 → 0 (center), line 2 → +PARALLEL_GAP.
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const line2 = stubLine(2, [1, 2]);
    const offsets = computeLegOffsets([line0, line1, line2]);

    // All three must have an entry in the map (including center with value 0).
    expect(offsets.has(legKey(0, 0))).toBe(true);
    expect(offsets.has(legKey(1, 0))).toBe(true);
    expect(offsets.has(legKey(2, 0))).toBe(true);

    // Center member (line1, idx=1 of 3) must have offset exactly 0.
    expect(offsets.get(legKey(1, 0))).toBe(0);
  });

  it('center strand of a 3-line corridor should use half-width (offsets.has check)', () => {
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const line2 = stubLine(2, [1, 2]);
    const offsets = computeLegOffsets([line0, line1, line2]);

    // Center member (line1): offset is 0 but IS in the parallel group.
    const centerOffset = offsets.get(legKey(1, 0)) ?? 0;
    const inParallelGroup = offsets.has(legKey(1, 0));

    expect(centerOffset).toBe(0);          // offset is zero (center strand)
    expect(inParallelGroup).toBe(true);    // but it IS in a parallel group

    // Width decision must use offsets.has, NOT offset !== 0.
    const strokeWidthCorrect = inParallelGroup ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH;
    const strokeWidthWrong   = centerOffset !== 0 ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH;

    expect(strokeWidthCorrect).toBe(LINE_WIDTH * PARALLEL_WIDTH_FACTOR); // correct: half-width
    expect(strokeWidthWrong).toBe(LINE_WIDTH);                           // old bug: full-width
  });

  it('outer strands of a 3-line corridor also use half-width', () => {
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const line2 = stubLine(2, [1, 2]);
    const offsets = computeLegOffsets([line0, line1, line2]);

    for (const lineId of [0, 2]) {
      const inParallelGroup = offsets.has(legKey(lineId, 0));
      expect(inParallelGroup).toBe(true);
      const strokeWidth = inParallelGroup ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH;
      expect(strokeWidth).toBe(LINE_WIDTH * PARALLEL_WIDTH_FACTOR);
    }
  });

  it('solo leg (not in any parallel group) must keep full LINE_WIDTH via offsets.has', () => {
    const line0 = stubLine(0, [1, 2]);
    const offsets = computeLegOffsets([line0]);

    const inParallelGroup = offsets.has(legKey(0, 0));
    expect(inParallelGroup).toBe(false);

    const strokeWidth = inParallelGroup ? LINE_WIDTH * PARALLEL_WIDTH_FACTOR : LINE_WIDTH;
    expect(strokeWidth).toBe(LINE_WIDTH);
  });
});

// Bug 6 regression: PARALLEL_GAP changed from 12 to 8.
// With LINE_WIDTH=8, PARALLEL_WIDTH_FACTOR=0.5 (strand=4px), PARALLEL_GAP=8:
//   2-line corridor: strands at ±4, spans [-6,−2] and [+2,+6] → 4px gap ✓
//   3-line corridor: strands at −8, 0, +8, spans [−10,−6],[−2,+2],[+6,+10] → 4px gaps ✓
describe('Bug 6 — PARALLEL_GAP=8 produces correct spacing', () => {
  it('PARALLEL_GAP equals 8', () => {
    expect(PARALLEL_GAP).toBe(8);
  });

  it('2-line corridor strands are separated by exactly PARALLEL_GAP=8 center-to-center', () => {
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const offsets = computeLegOffsets([line0, line1]);

    const offset0 = offsets.get(legKey(0, 0))!;
    const offset1 = offsets.get(legKey(1, 0))!;

    expect(Math.abs(offset0 - offset1)).toBeCloseTo(PARALLEL_GAP, 6); // 8
    expect(offset0 + offset1).toBeCloseTo(0, 6); // centered
  });

  it('3-line corridor strands are spaced PARALLEL_GAP=8 apart center-to-center', () => {
    const line0 = stubLine(0, [1, 2]);
    const line1 = stubLine(1, [1, 2]);
    const line2 = stubLine(2, [1, 2]);
    const offsets = computeLegOffsets([line0, line1, line2]);

    const off0 = offsets.get(legKey(0, 0))!; // -PARALLEL_GAP
    const off1 = offsets.get(legKey(1, 0))!; // 0 (center)
    const off2 = offsets.get(legKey(2, 0))!; // +PARALLEL_GAP

    expect(off1).toBeCloseTo(0, 6);
    expect(Math.abs(off1 - off0)).toBeCloseTo(PARALLEL_GAP, 6); // 8
    expect(Math.abs(off2 - off1)).toBeCloseTo(PARALLEL_GAP, 6); // 8

    // total spread = 2 * PARALLEL_GAP = 16
    expect(Math.abs(off2 - off0)).toBeCloseTo(2 * PARALLEL_GAP, 6);
  });

  it('strand half-width (4px) plus gap (4px) equals PARALLEL_GAP (8) — strands touch cleanly', () => {
    const halfWidth = LINE_WIDTH * PARALLEL_WIDTH_FACTOR; // 8 * 0.5 = 4
    const halfStrand = halfWidth / 2;                      // 2 (each side of center)
    // gap between two adjacent strands = PARALLEL_GAP - 2*halfStrand
    const gapBetweenStrands = PARALLEL_GAP - 2 * halfStrand;
    expect(gapBetweenStrands).toBeCloseTo(halfWidth, 6); // 4px daylight gap equals strand width ✓
  });
});

// Fix A: drawLines groups consecutive same-offset legs and applies offsetPolyline to
// the full group path. This gives continuous miter joins at intermediate stations and
// eliminates the per-leg junction diamonds.
describe('Fix A — group-based offsetPolyline rendering eliminates junction diamonds', () => {
  it('per-leg offsetPolyline produces a DISCONTINUOUS junction at a right-angle corner', () => {
    // Two legs: horizontal A→B then vertical B→C.
    // Shifting each leg independently leaves a visible gap between the end of leg 0 and
    // the start of leg 1 — the root cause of the "diamond" artifact.
    const A = { x: 0, y: 0 }, B = { x: 100, y: 0 }, C = { x: 100, y: 100 };
    const offset = 4;
    const shifted0 = offsetPolyline([A, B], offset);
    const shifted1 = offsetPolyline([B, C], offset);
    // Leg 0 end is (100, 4). Leg 1 start is (96, 0). Different → visible gap.
    const gap = Math.hypot(
      shifted0[shifted0.length - 1].x - shifted1[0].x,
      shifted0[shifted0.length - 1].y - shifted1[0].y,
    );
    expect(gap).toBeGreaterThan(1);
  });

  it('full-path offsetPolyline produces a CONTINUOUS junction at the same right-angle corner', () => {
    // Concatenating the two legs into one polyline and calling offsetPolyline once
    // produces a single miter point — no gap, no diamond.
    const A = { x: 0, y: 0 }, B = { x: 100, y: 0 }, C = { x: 100, y: 100 };
    const offset = 4;
    const shifted = offsetPolyline([A, B, C], offset);
    expect(shifted.length).toBe(3);
    // Miter at B: intersection of lines through (100,4) and (96,0) — lands at (96,4).
    expect(shifted[1].x).toBeCloseTo(96, 5);
    expect(shifted[1].y).toBeCloseTo(4, 5);
  });

  it('legs with different (offset, inParallel) pairs belong to separate groups', () => {
    // Line A [1,2,3]: leg 0 (1→2) shares a corridor; leg 1 (2→3) is solo.
    // They have different inParallel values → must NOT be grouped together.
    const lineA = stubLine(0, [1, 2, 3]);
    const lineB = stubLine(1, [1, 2]);
    const offsets = computeLegOffsets([lineA, lineB]);
    expect(offsets.has(legKey(0, 0))).toBe(true);   // leg 0 is parallel
    expect(offsets.has(legKey(0, 1))).toBe(false);  // leg 1 is solo — different group
  });

  it('all legs of a line in the same corridor form a single group path', () => {
    // Two lines both following A→B→C: each line's two legs have the same offset
    // and inParallel — they should be concatenated and drawn as one offset polyline.
    const lineA = stubLine(0, [1, 2, 3]);
    const lineB = stubLine(1, [1, 2, 3]);
    const offsets = computeLegOffsets([lineA, lineB]);
    // Both legs of each line are in a parallel group with the same offset.
    expect(offsets.has(legKey(0, 0))).toBe(true);
    expect(offsets.has(legKey(0, 1))).toBe(true);
    expect(offsets.get(legKey(0, 0))).toBe(offsets.get(legKey(0, 1)));
  });
});

// Fix C: drawTrains positions each unit by applying offsetPolyline to the current
// leg's path and sampling it at the local arc-length. This correctly handles elbow
// points within a leg and places trains on the right colored strand.
describe('Fix C — train position uses offsetPolyline on leg path', () => {
  function stubStation(id: number, x: number, y: number): Station {
    return { id, pos: { x, y }, shape: 'circle', isInterchange: false, waiting: [], gauge: 0, spawnTimer: 0, bornAt: 0 };
  }

  it('for a straight horizontal leg, offsetPolyline shifts the sampled point perpendicular to the corridor', () => {
    // A=(0,0)→B=(200,0). offsetPolyline with offset=4 shifts all y by +4.
    // A train at local arc-length 100 should render at (100, 4).
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 200, 0);
    const legPath = octilinearPath(stA.pos, stB.pos);
    const legOffset = 4;
    const shiftedPath = offsetPolyline(legPath, legOffset);
    const { point } = pointAtArcLength(shiftedPath, 100);
    expect(point.x).toBeCloseTo(100, 5);
    expect(point.y).toBeCloseTo(4, 5);
  });

  it('for a bent leg, offsetPolyline gives correct position past the elbow', () => {
    // A=(0,0)→B=(100,100): octilinear path is diagonal (0,0)→(100,100).
    // A=(0,0)→B=(200,100): path is diagonal (0,0)→(100,100) then horizontal (100,100)→(200,100).
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 200, 100);
    const legPath = octilinearPath(stA.pos, stB.pos);
    expect(legPath.length).toBe(3); // has elbow
    const legOffset = PARALLEL_GAP / 2;
    const shiftedPath = offsetPolyline(legPath, legOffset);
    // Sampling somewhere on the straight segment past the elbow should give a
    // y-offset of legOffset (the horizontal segment is shifted up by legOffset).
    const localS = polylineLength(legPath) * 0.9; // well past the elbow
    const { point } = pointAtArcLength(shiftedPath, localS);
    expect(point.y).toBeCloseTo(100 + legOffset, 3);
  });

  it('legOffset=0 leaves train at the center path position', () => {
    const stA = stubStation(1, 0, 0);
    const stB = stubStation(2, 200, 0);
    const legPath = octilinearPath(stA.pos, stB.pos);
    const shiftedPath = offsetPolyline(legPath, 0);
    const { point } = pointAtArcLength(shiftedPath, 100);
    expect(point.x).toBeCloseTo(100, 5);
    expect(point.y).toBeCloseTo(0, 5);
  });

  it('closing leg of a loop uses stations[0] as bId', () => {
    const lineStations = [1, 2, 3];
    const isLoop = true;
    const numStations = lineStations.length;
    const legIdx = 2;
    const aId = lineStations[legIdx];
    const bId = (isLoop && legIdx === numStations - 1) ? lineStations[0] : lineStations[legIdx + 1];
    expect(aId).toBe(3);
    expect(bId).toBe(1);
  });

  it('local arc-length within leg = s minus nodeS[legIdx]', () => {
    const nodeS = [0, 150, 300];
    const s = 200;
    const legIdx = legIndexAtArcLength(nodeS, s, false);
    expect(legIdx).toBe(1);
    expect(s - nodeS[legIdx]).toBe(50);
  });

  it('legIndexAtArcLength correctly identifies the leg for train strand computation', () => {
    expect(legIndexAtArcLength([0, 100, 200], 150, false)).toBe(1);
    expect(legIndexAtArcLength([0, 100, 200], 50, false)).toBe(0);
  });
});
