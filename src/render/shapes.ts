import type { ShapeKind } from '../game/types';

// Unit-ish shapes centered at the origin, sized by r. Cached because the same
// few (kind, r) pairs are drawn hundreds of times per frame; animation uses
// ctx transforms so the cache stays small.
const cache = new Map<string, Path2D>();

function polygonPath(points: number, r: number, startAngle = -Math.PI / 2): Path2D {
  const p = new Path2D();
  for (let i = 0; i < points; i++) {
    const a = startAngle + (i * 2 * Math.PI) / points;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

function starPath(r: number): Path2D {
  const p = new Path2D();
  const outer = r * 1.35;
  const inner = r * 0.58;
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

function crossPath(r: number): Path2D {
  const arm = r * 1.05;
  const half = r * 0.42;
  const p = new Path2D();
  p.moveTo(-half, -arm);
  p.lineTo(half, -arm);
  p.lineTo(half, -half);
  p.lineTo(arm, -half);
  p.lineTo(arm, half);
  p.lineTo(half, half);
  p.lineTo(half, arm);
  p.lineTo(-half, arm);
  p.lineTo(-half, half);
  p.lineTo(-arm, half);
  p.lineTo(-arm, -half);
  p.lineTo(-half, -half);
  p.closePath();
  return p;
}

function build(kind: ShapeKind, r: number): Path2D {
  switch (kind) {
    case 'circle': {
      const p = new Path2D();
      p.arc(0, 0, r, 0, Math.PI * 2);
      return p;
    }
    case 'triangle':
      return polygonPath(3, r * 1.25);
    case 'square': {
      const p = new Path2D();
      const s = r * 0.92;
      p.rect(-s, -s, s * 2, s * 2);
      return p;
    }
    case 'cross':
      return crossPath(r);
    case 'diamond':
      return polygonPath(4, r * 1.2);
    case 'pentagon':
      return polygonPath(5, r * 1.18);
    case 'star':
      return starPath(r);
  }
}

export function shapePath(kind: ShapeKind, r: number): Path2D {
  const key = `${kind}:${r}`;
  let p = cache.get(key);
  if (!p) {
    p = build(kind, r);
    cache.set(key, p);
  }
  return p;
}
