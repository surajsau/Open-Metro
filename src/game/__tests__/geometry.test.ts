import { describe, expect, it } from 'vitest';
import {
  distPointToSegment,
  nearestPointOnPolyline,
  octilinearPath,
  offsetPolyline,
  pointAtArcLength,
  polylineLength,
} from '../geometry';

const SQRT2 = Math.SQRT2;

describe('octilinearPath', () => {
  it('routes diagonal-first with an elbow for a general pair', () => {
    expect(octilinearPath({ x: 0, y: 0 }, { x: 100, y: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it('routes vertical-dominant pairs through a diagonal elbow', () => {
    expect(octilinearPath({ x: 0, y: 0 }, { x: 40, y: -100 })).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: -40 },
      { x: 40, y: -100 },
    ]);
  });

  it('returns two points for axis-aligned pairs', () => {
    expect(octilinearPath({ x: 0, y: 0 }, { x: 50, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
  });

  it('returns two points for perfect diagonals', () => {
    expect(octilinearPath({ x: 0, y: 0 }, { x: 30, y: 30 })).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 30 },
    ]);
  });
});

describe('polylineLength', () => {
  it('sums segment lengths', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 40, y: 40 },
      { x: 100, y: 40 },
    ];
    expect(polylineLength(pts)).toBeCloseTo(40 * SQRT2 + 60, 6);
  });
});

describe('pointAtArcLength', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 40, y: 40 },
    { x: 100, y: 40 },
  ];

  it('walks into the second segment', () => {
    const { point, angle } = pointAtArcLength(pts, 40 * SQRT2 + 10);
    expect(point.x).toBeCloseTo(50, 6);
    expect(point.y).toBeCloseTo(40, 6);
    expect(angle).toBeCloseTo(0, 6);
  });

  it('reports the first segment angle at s=0', () => {
    const { point, angle } = pointAtArcLength(pts, 0);
    expect(point).toEqual({ x: 0, y: 0 });
    expect(angle).toBeCloseTo(Math.PI / 4, 6);
  });

  it('clamps beyond the end', () => {
    const { point } = pointAtArcLength(pts, 9999);
    expect(point.x).toBeCloseTo(100, 6);
    expect(point.y).toBeCloseTo(40, 6);
  });
});

describe('nearestPointOnPolyline', () => {
  it('projects onto the closest segment with arc length', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 40, y: 40 },
      { x: 100, y: 40 },
    ];
    const res = nearestPointOnPolyline(pts, { x: 70, y: 50 });
    expect(res.point.x).toBeCloseTo(70, 6);
    expect(res.point.y).toBeCloseTo(40, 6);
    expect(res.dist).toBeCloseTo(10, 6);
    expect(res.s).toBeCloseTo(40 * SQRT2 + 30, 6);
  });
});

describe('distPointToSegment', () => {
  it('uses perpendicular distance inside the segment', () => {
    expect(distPointToSegment({ x: 0, y: 10 }, { x: -5, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(10, 6);
  });

  it('uses endpoint distance beyond the segment', () => {
    expect(distPointToSegment({ x: 10, y: 5 }, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(Math.sqrt(50), 6);
  });
});

describe('offsetPolyline', () => {
  it('shifts a straight line in parallel', () => {
    const out = offsetPolyline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      7,
    );
    expect(out[0].x).toBeCloseTo(0, 6);
    expect(out[0].y).toBeCloseTo(7, 6);
    expect(out[1].x).toBeCloseTo(100, 6);
    expect(out[1].y).toBeCloseTo(7, 6);
  });

  it('miters a right-angle elbow', () => {
    const out = offsetPolyline(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
      7,
    );
    expect(out).toHaveLength(3);
    expect(out[0].x).toBeCloseTo(0, 6);
    expect(out[0].y).toBeCloseTo(7, 6);
    expect(out[1].x).toBeCloseTo(43, 6);
    expect(out[1].y).toBeCloseTo(7, 6);
    expect(out[2].x).toBeCloseTo(43, 6);
    expect(out[2].y).toBeCloseTo(50, 6);
  });
});
