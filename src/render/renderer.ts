import {
  BG,
  INK,
  INVALID_COLOR,
  LINE_COLORS,
  LINE_WIDTH,
  RIVER_HALF_W,
  STRANDED_COLOR,
  TAIL_LEN,
  WATER,
  WORLD,
} from '../game/constants';
import { norm, octilinearPath, offsetPolyline, pointAtArcLength, polylineLength, sub } from '../game/geometry';
import type { GameState, Line, ShapeKind, Station, Vec } from '../game/types';
import type { DragState } from '../input/dragState';
import { computeLegOffsets, forEachLeg, legKey } from './legOffsets';
import { shapePath } from './shapes';

export interface Viewport {
  scale: number;
  ox: number;
  oy: number;
  cw: number;
  ch: number;
}

export function computeViewport(cw: number, ch: number): Viewport {
  const scale = Math.min(cw / WORLD.w, ch / WORLD.h);
  return { scale, ox: (cw - WORLD.w * scale) / 2, oy: (ch - WORLD.h * scale) / 2, cw, ch };
}

export function toWorld(vp: Viewport, clientX: number, clientY: number): Vec {
  return { x: (clientX - vp.ox) / vp.scale, y: (clientY - vp.oy) / vp.scale };
}

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
};

function strokePolyline(ctx: CanvasRenderingContext2D, pts: Vec[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  kind: ShapeKind,
  pos: Vec,
  r: number,
  opts: { fill?: string; stroke?: string; lineWidth?: number; scale?: number },
): void {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  if (opts.scale !== undefined && opts.scale !== 1) ctx.scale(opts.scale, opts.scale);
  const path = shapePath(kind, r);
  if (opts.fill) {
    ctx.fillStyle = opts.fill;
    ctx.fill(path);
  }
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = opts.lineWidth ?? 3;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }
  ctx.restore();
}

function drawRiver(ctx: CanvasRenderingContext2D, rivers: Vec[][]): void {
  ctx.strokeStyle = WATER;
  ctx.lineWidth = RIVER_HALF_W * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Smooth meander: quadratic curves through segment midpoints.
  for (const pts of rivers) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }
}

function legPoints(stations: Map<number, Station>, aId: number, bId: number, offset: number): Vec[] | null {
  const a = stations.get(aId);
  const b = stations.get(bId);
  if (!a || !b) return null;
  const base = octilinearPath(a.pos, b.pos);
  return offset === 0 ? base : offsetPolyline(base, offset);
}

function drawLines(ctx: CanvasRenderingContext2D, state: GameState, stations: Map<number, Station>): void {
  const offsets = computeLegOffsets(state.lines);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of state.lines) {
    const color = LINE_COLORS[line.id];
    const selected = state.selectedLine === line.id;
    forEachLeg(line, (aId, bId, legIndex) => {
      const pts = legPoints(stations, aId, bId, offsets.get(legKey(line.id, legIndex)) ?? 0);
      if (!pts) return;
      if (selected) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = LINE_WIDTH + 8;
        strokePolyline(ctx, pts);
        ctx.restore();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = LINE_WIDTH;
      strokePolyline(ctx, pts);
    });
    drawTails(ctx, line, color);
  }
}

// Grabbable stubs that extend past each terminus of a non-loop line.
export function tailEnds(line: Line): { head: Vec; tail: Vec; headDir: Vec; tailDir: Vec } | null {
  if (line.isLoop || line.path.length < 2) return null;
  const p = line.path;
  const headDir = norm(sub(p[0], p[1]));
  const tailDir = norm(sub(p[p.length - 1], p[p.length - 2]));
  return {
    head: { x: p[0].x + headDir.x * TAIL_LEN, y: p[0].y + headDir.y * TAIL_LEN },
    tail: { x: p[p.length - 1].x + tailDir.x * TAIL_LEN, y: p[p.length - 1].y + tailDir.y * TAIL_LEN },
    headDir,
    tailDir,
  };
}

function drawTails(ctx: CanvasRenderingContext2D, line: Line, color: string): void {
  const ends = tailEnds(line);
  if (!ends) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  strokePolyline(ctx, [line.path[0], ends.head]);
  strokePolyline(ctx, [line.path[line.path.length - 1], ends.tail]);
  ctx.fillStyle = color;
  for (const cap of [ends.head, ends.tail]) {
    ctx.beginPath();
    ctx.arc(cap.x, cap.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawChainPreview(
  ctx: CanvasRenderingContext2D,
  stations: Map<number, Station>,
  chain: number[],
  isLoop: boolean,
  cursor: Vec,
  color: string,
  valid: boolean,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  for (let i = 1; i < chain.length; i++) {
    const pts = legPoints(stations, chain[i - 1], chain[i], 0);
    if (pts) strokePolyline(ctx, pts);
  }
  ctx.save();
  ctx.setLineDash([13, 9]);
  ctx.strokeStyle = valid ? color : INVALID_COLOR;
  const last = stations.get(chain[chain.length - 1]);
  if (last) {
    if (isLoop && chain.length >= 3) {
      const first = stations.get(chain[0]);
      if (first) strokePolyline(ctx, octilinearPath(last.pos, first.pos));
    } else {
      strokePolyline(ctx, octilinearPath(last.pos, cursor));
    }
  }
  ctx.restore();
}

function drawDragPreview(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  stations: Map<number, Station>,
  drag: DragState,
): void {
  if (drag.mode === 'newLine') {
    drawChainPreview(ctx, stations, drag.chain, drag.isLoop, drag.cursor, LINE_COLORS[drag.colorId], drag.valid);
  } else if (drag.mode === 'extend') {
    drawChainPreview(ctx, stations, drag.chain, drag.isLoop, drag.cursor, LINE_COLORS[drag.lineId], drag.valid);
  } else if (drag.mode === 'insert') {
    const line = state.lines.find((l) => l.id === drag.lineId);
    if (!line) return;
    const aId = line.stations[drag.legIndex];
    const bId = line.stations[(drag.legIndex + 1) % line.stations.length];
    const a = stations.get(aId);
    const b = stations.get(bId);
    if (!a || !b) return;
    const mid = drag.hoverStation !== null ? stations.get(drag.hoverStation)?.pos ?? drag.cursor : drag.cursor;
    ctx.save();
    ctx.setLineDash([13, 9]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = drag.valid ? LINE_COLORS[drag.lineId] : INVALID_COLOR;
    ctx.lineWidth = LINE_WIDTH;
    strokePolyline(ctx, octilinearPath(a.pos, mid));
    strokePolyline(ctx, octilinearPath(mid, b.pos));
    ctx.restore();
  } else if (drag.mode === 'removeStation') {
    const line = state.lines.find((l) => l.id === drag.lineId);
    if (!line) return;
    const idx = line.stations.indexOf(drag.stationId);
    if (idx === -1) return;
    const n = line.stations.length;
    // Healing leg joins the removed station's neighbours; loops wrap around.
    const prevId = idx > 0 ? line.stations[idx - 1] : line.isLoop ? line.stations[n - 1] : null;
    const nextId = idx < n - 1 ? line.stations[idx + 1] : line.isLoop ? line.stations[0] : null;
    const prev = prevId !== null ? stations.get(prevId) : null;
    const next = nextId !== null ? stations.get(nextId) : null;
    if (!prev || !next) return;
    ctx.save();
    ctx.setLineDash([13, 9]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = drag.valid ? LINE_COLORS[drag.lineId] : INVALID_COLOR;
    ctx.lineWidth = LINE_WIDTH;
    strokePolyline(ctx, octilinearPath(prev.pos, next.pos));
    ctx.restore();
  } else if (drag.mode === 'inventory') {
    drawInventoryGhost(ctx, drag);
  }
}

function drawInventoryGhost(ctx: CanvasRenderingContext2D, drag: DragState & { mode: 'inventory' }): void {
  ctx.save();
  ctx.translate(drag.cursor.x, drag.cursor.y);
  ctx.globalAlpha = drag.target ? 0.95 : 0.45;
  ctx.fillStyle = INK;
  if (drag.item === 'locomotive') {
    ctx.beginPath();
    ctx.roundRect(-17, -9, 34, 18, 5);
    ctx.fill();
  } else if (drag.item === 'carriage') {
    ctx.beginPath();
    ctx.roundRect(-14, -7, 28, 14, 4);
    ctx.fill();
  } else {
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = INK;
    ctx.stroke(shapePath('circle', 14));
    ctx.stroke(shapePath('circle', 6));
  }
  ctx.restore();
}

function drawTrainBody(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  angle: number,
  w: number,
  h: number,
  color: string,
  riders: ShapeKind[],
): void {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  riders.slice(0, 6).forEach((kind, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    ctx.save();
    ctx.translate(-9 + col * 9, -4 + row * 8);
    ctx.fill(shapePath(kind, 3.1));
    ctx.restore();
  });
  ctx.restore();
}

function drawTrains(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const train of state.trains) {
    const line = state.lines.find((l) => l.id === train.lineId);
    if (!line || line.path.length < 2) continue;
    const total = polylineLength(line.path);
    const color = LINE_COLORS[line.id];
    const riders = train.passengers.map((p) => p.shape);
    const units = 1 + train.carriages;
    const LOCO_LEN = 32;
    const CAR_LEN = 26;
    const COUPLING = 3;
    let back = 0; // arc-length from the locomotive's center to this unit's center
    for (let u = 0; u < units; u++) {
      if (u === 1) back += (LOCO_LEN + CAR_LEN) / 2 + COUPLING;
      else if (u > 1) back += CAR_LEN + COUPLING;
      let s = train.s - train.dir * back;
      if (line.isLoop) s = ((s % total) + total) % total;
      else s = Math.max(0, Math.min(total, s));
      const { point, angle } = pointAtArcLength(line.path, s);
      const unitRiders = riders.slice(u * 6, u * 6 + 6);
      if (u === 0) drawTrainBody(ctx, point, angle, LOCO_LEN, 16, color, unitRiders);
      else drawTrainBody(ctx, point, angle, CAR_LEN, 13, color, unitRiders);
    }
  }
}

function drawStations(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const st of state.stations) {
    // Overcrowding pie sweeps clockwise from 12 o'clock.
    if (st.gauge > 0) {
      const start = -Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(st.pos.x, st.pos.y);
      ctx.arc(st.pos.x, st.pos.y, 27, start, start + st.gauge * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(53,52,47,0.16)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(st.pos.x, st.pos.y, 27, start, start + st.gauge * Math.PI * 2);
      ctx.strokeStyle = 'rgba(53,52,47,0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const age = (state.time - st.bornAt) / 0.4;
    const pop = age >= 1 ? 1 : easeOutBack(Math.max(0, age));

    if (st.isInterchange) {
      drawGlyph(ctx, st.shape, st.pos, 17, { fill: '#FFFFFF', stroke: INK, lineWidth: 4.5, scale: pop });
      drawGlyph(ctx, st.shape, st.pos, 8, { stroke: INK, lineWidth: 3, scale: pop });
    } else {
      drawGlyph(ctx, st.shape, st.pos, 11, { fill: '#FFFFFF', stroke: INK, lineWidth: 3.5, scale: pop });
    }

    const hasLines = state.lines.length > 0;
    st.waiting.forEach((p, i) => {
      const col = i % 8;
      const row = Math.floor(i / 8);
      // Stranded tint: passenger's target shape has no reachable route (RDR-16).
      const distField = state.distFields.get(p.shape);
      const isStranded = hasLines && (distField === undefined || (distField.get(st.id) ?? Infinity) === Infinity);
      drawGlyph(ctx, p.shape, { x: st.pos.x + 20 + col * 11, y: st.pos.y - 16 - row * 12 }, 4.5, {
        fill: isStranded ? STRANDED_COLOR : INK,
      });
    });
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const e of state.effects) {
    const age = Math.max(0, Math.min(1, state.time - e.start));
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, 13 + age * 34, 0, Math.PI * 2);
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = (1 - age) * 0.55;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  drag: DragState | null,
  vp: Viewport,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, vp.cw, vp.ch);
  ctx.setTransform(dpr * vp.scale, 0, 0, dpr * vp.scale, dpr * vp.ox, dpr * vp.oy);

  const stations = new Map(state.stations.map((s) => [s.id, s]));

  drawRiver(ctx, state.city.rivers);
  drawLines(ctx, state, stations);
  if (drag) drawDragPreview(ctx, state, stations, drag);
  drawTrains(ctx, state);
  drawStations(ctx, state);
  drawEffects(ctx, state);
}
