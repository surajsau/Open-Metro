import { describe, expect, it } from 'vitest';
import { PARALLEL_GAP, PARALLEL_WIDTH_FACTOR, LINE_WIDTH } from '../../game/constants';
import type { Line } from '../../game/types';
import { computeLegOffsets, legKey } from '../legOffsets';

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
    // The offsets are EQUAL in magnitude and sign for a reversed pair — the geometric
    // separation comes from the opposing travel directions (existing test in legOffsets.test.ts
    // verifies world-space separation via offsetPolyline). Each offset is ±PARALLEL_GAP/2.
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
