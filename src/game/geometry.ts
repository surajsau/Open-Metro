import type { Vec } from './types';

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (v: Vec, k: number): Vec => ({ x: v.x * k, y: v.y * k });
export const len = (v: Vec): number => Math.hypot(v.x, v.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (v: Vec): Vec => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
};

// Mini-Metro look: every leg is a 45° diagonal followed by an axis-aligned run.
export function octilinearPath(a: Vec, b: Vec): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
    return [{ ...a }, { ...b }];
  }
  const d = Math.min(Math.abs(dx), Math.abs(dy));
  const elbow = { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d };
  return [{ ...a }, elbow, { ...b }];
}

export function polylineLength(pts: Vec[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

export function pointAtArcLength(pts: Vec[], s: number): { point: Vec; angle: number } {
  let firstAngle = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = dist(a, b);
    if (segLen === 0) continue;
    firstAngle = Math.atan2(b.y - a.y, b.x - a.x);
    break;
  }
  if (s <= 0) return { point: { ...pts[0] }, angle: firstAngle };

  let acc = 0;
  let angle = firstAngle;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = dist(a, b);
    if (segLen === 0) continue;
    angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (acc + segLen >= s) {
      const t = (s - acc) / segLen;
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle };
    }
    acc += segLen;
  }
  return { point: { ...pts[pts.length - 1] }, angle };
}

export function distPointToSegment(p: Vec, a: Vec, b: Vec): number {
  return dist(p, projectOnSegment(p, a, b).point);
}

function projectOnSegment(p: Vec, a: Vec, b: Vec): { point: Vec; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return { point: { ...a }, t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return { point: { x: a.x + abx * t, y: a.y + aby * t }, t };
}

export function nearestPointOnPolyline(pts: Vec[], p: Vec): { point: Vec; s: number; dist: number } {
  let best = { point: { ...pts[0] }, s: 0, dist: dist(p, pts[0]) };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = dist(a, b);
    if (segLen === 0) continue;
    const { point, t } = projectOnSegment(p, a, b);
    const d = dist(p, point);
    if (d < best.dist) best = { point, s: acc + t * segLen, dist: d };
    acc += segLen;
  }
  return best;
}

// Shift a polyline sideways; interior vertices are mitered so parallel lines
// stay parallel through 45° elbows.
export function offsetPolyline(pts: Vec[], offset: number): Vec[] {
  if (pts.length < 2 || offset === 0) return pts.map((p) => ({ ...p }));

  const normals: Vec[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = norm(sub(pts[i], pts[i - 1]));
    normals.push({ x: -d.y, y: d.x });
  }

  const out: Vec[] = [];
  out.push(add(pts[0], scale(normals[0], offset)));
  for (let i = 1; i < pts.length - 1; i++) {
    const q1 = add(pts[i - 1], scale(normals[i - 1], offset));
    const d1 = sub(pts[i], pts[i - 1]);
    const q2 = add(pts[i], scale(normals[i], offset));
    const d2 = sub(pts[i + 1], pts[i]);
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cross) < 1e-9) {
      out.push(add(pts[i], scale(normals[i], offset)));
    } else {
      const t = ((q2.x - q1.x) * d2.y - (q2.y - q1.y) * d2.x) / cross;
      out.push({ x: q1.x + d1.x * t, y: q1.y + d1.y * t });
    }
  }
  out.push(add(pts[pts.length - 1], scale(normals[normals.length - 1], offset)));
  return out;
}
