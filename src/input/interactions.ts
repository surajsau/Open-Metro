import { STATION_HIT_R } from '../game/constants';
import { dist, nearestPointOnPolyline, octilinearPath } from '../game/geometry';
import { freePaletteId, validateChain } from '../game/lines';
import { countRiverCrossings } from '../game/river';
import { tunnelsUsed } from '../game/lines';
import type { Station, Vec } from '../game/types';
import { tailEnds, toWorld, type Viewport } from '../render/renderer';
import { forEachLeg } from '../render/legOffsets';
import type { GameStore } from '../store';
import type { DragState, InventoryItem } from './dragState';

const TAIL_HIT_R = 16;
const LEG_HIT_R = 11;
const SNAP_R = 26;
const DROP_R = 30;

export class Interactions {
  private drag: DragState | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private windowCleanup: (() => void) | null = null;

  constructor(
    private store: GameStore,
    private getViewport: () => Viewport,
  ) {}

  getDrag = (): DragState | null => this.drag;

  // ---- coordinate + hit helpers -------------------------------------------

  private worldPos(e: { clientX: number; clientY: number }): Vec {
    const rect = this.canvas!.getBoundingClientRect();
    return toWorld(this.getViewport(), e.clientX - rect.left, e.clientY - rect.top);
  }

  private hitStation(p: Vec, radius = STATION_HIT_R): Station | null {
    let best: Station | null = null;
    let bestD = radius;
    for (const st of this.store.state.stations) {
      const d = dist(st.pos, p);
      if (d <= bestD) {
        best = st;
        bestD = d;
      }
    }
    return best;
  }

  private hitTailCap(p: Vec): { lineId: number; end: 'head' | 'tail' } | null {
    for (const line of this.store.state.lines) {
      const ends = tailEnds(line);
      if (!ends) continue;
      if (dist(p, ends.head) <= TAIL_HIT_R) return { lineId: line.id, end: 'head' };
      if (dist(p, ends.tail) <= TAIL_HIT_R) return { lineId: line.id, end: 'tail' };
    }
    return null;
  }

  private hitLeg(p: Vec): { lineId: number; legIndex: number } | null {
    const state = this.store.state;
    const stations = new Map(state.stations.map((s) => [s.id, s]));
    let best: { lineId: number; legIndex: number } | null = null;
    let bestD = LEG_HIT_R;
    for (const line of state.lines) {
      forEachLeg(line, (aId, bId, legIndex) => {
        const a = stations.get(aId);
        const b = stations.get(bId);
        if (!a || !b) return;
        const d = nearestPointOnPolyline(octilinearPath(a.pos, b.pos), p).dist;
        if (d <= bestD) {
          best = { lineId: line.id, legIndex };
          bestD = d;
        }
      });
    }
    return best;
  }

  private nearestLine(p: Vec): number | null {
    let best: number | null = null;
    let bestD = DROP_R;
    for (const line of this.store.state.lines) {
      if (line.path.length < 2) continue;
      const d = nearestPointOnPolyline(line.path, p).dist;
      if (d <= bestD) {
        best = line.id;
        bestD = d;
      }
    }
    return best;
  }

  // ---- drag lifecycle -------------------------------------------------------

  attach(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas;
    const down = (e: PointerEvent) => this.onPointerDown(e);
    const move = (e: PointerEvent) => this.onPointerMove(e);
    const up = (e: PointerEvent) => this.onPointerUp(e);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.cancel();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => this.cancel());
    window.addEventListener('keydown', key);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
      this.windowCleanup?.();
    };
  }

  private get interactive(): boolean {
    const s = this.store.state;
    return s.started && !s.gameOver && !s.pendingReward;
  }

  private cancel(): void {
    this.drag = null;
    this.windowCleanup?.();
    this.windowCleanup = null;
    if (this.canvas) this.canvas.style.cursor = 'default';
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.interactive || this.drag) return;
    const p = this.worldPos(e);
    const state = this.store.state;

    const tail = this.hitTailCap(p);
    if (tail) {
      const line = state.lines.find((l) => l.id === tail.lineId)!;
      const chain = tail.end === 'tail' ? [...line.stations] : [...line.stations].reverse();
      this.drag = { mode: 'extend', lineId: tail.lineId, grabbedEnd: tail.end, chain, isLoop: false, cursor: p, valid: true };
      this.canvas!.setPointerCapture(e.pointerId);
      return;
    }

    const station = this.hitStation(p);
    if (station) {
      if (state.lines.length >= state.lineSlots) {
        this.store.addToast('No lines available');
        return;
      }
      this.drag = { mode: 'newLine', colorId: freePaletteId(state), chain: [station.id], isLoop: false, cursor: p, valid: true };
      this.canvas!.setPointerCapture(e.pointerId);
      return;
    }

    const leg = this.hitLeg(p);
    if (leg) {
      this.drag = { mode: 'insert', lineId: leg.lineId, legIndex: leg.legIndex, hoverStation: null, cursor: p, valid: false };
      this.canvas!.setPointerCapture(e.pointerId);
      return;
    }

    this.store.selectLine(null);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.canvas) return;
    const p = this.worldPos(e);
    if (!this.drag) {
      this.updateHoverCursor(p);
      return;
    }
    this.canvas.style.cursor = 'grabbing';
    this.drag.cursor = p;

    if (this.drag.mode === 'newLine' || this.drag.mode === 'extend') this.moveChain(p);
    else if (this.drag.mode === 'insert') this.moveInsert(p);
    else if (this.drag.mode === 'inventory') this.moveInventory(p);
  }

  private moveChain(p: Vec): void {
    const drag = this.drag as DragState & { mode: 'newLine' | 'extend' };
    const state = this.store.state;
    const excludeLine = drag.mode === 'extend' ? drag.lineId : undefined;
    const hover = this.hitStation(p, SNAP_R);

    drag.isLoop = false;
    if (hover) {
      const chain = drag.chain;
      if (chain.length >= 2 && hover.id === chain[chain.length - 2]) {
        chain.pop(); // backing over the previous station retracts
        drag.valid = true;
        return;
      }
      if (hover.id === chain[0] && chain.length >= 3) {
        drag.isLoop = validateChain(state, chain, true, excludeLine).ok;
        drag.valid = drag.isLoop;
        return;
      }
      if (!chain.includes(hover.id)) {
        const candidate = [...chain, hover.id];
        if (validateChain(state, candidate, false, excludeLine).ok) {
          chain.push(hover.id);
          drag.valid = true;
        } else {
          drag.valid = false;
        }
        return;
      }
      return;
    }

    // No station under the cursor: live tunnel feedback for the rubber band.
    const last = state.stations.find((s) => s.id === drag.chain[drag.chain.length - 1]);
    if (last) {
      const crossings = countRiverCrossings(octilinearPath(last.pos, p));
      // The drag chain re-counts its own crossings, so the edited line's
      // committed usage is excluded from the network total.
      drag.valid = tunnelsUsed(state, excludeLine) + this.chainCrossingsOf(drag.chain) + crossings <= state.inventory.tunnels;
    }
  }

  private chainCrossingsOf(chain: number[]): number {
    const state = this.store.state;
    const stations = new Map(state.stations.map((s) => [s.id, s]));
    let sum = 0;
    for (let i = 1; i < chain.length; i++) {
      const a = stations.get(chain[i - 1]);
      const b = stations.get(chain[i]);
      if (a && b) sum += countRiverCrossings(octilinearPath(a.pos, b.pos));
    }
    return sum;
  }

  private moveInsert(p: Vec): void {
    const drag = this.drag as DragState & { mode: 'insert' };
    const state = this.store.state;
    const line = state.lines.find((l) => l.id === drag.lineId);
    if (!line) return;
    const hover = this.hitStation(p, SNAP_R);
    if (hover && !line.stations.includes(hover.id)) {
      const chain = [...line.stations];
      chain.splice(drag.legIndex + 1, 0, hover.id);
      drag.hoverStation = hover.id;
      drag.valid = validateChain(state, chain, line.isLoop, line.id).ok;
    } else {
      drag.hoverStation = null;
      drag.valid = false;
    }
  }

  private moveInventory(p: Vec): void {
    const drag = this.drag as DragState & { mode: 'inventory' };
    if (drag.item === 'interchange') {
      const st = this.hitStation(p, DROP_R);
      drag.target = st && !st.isInterchange ? { kind: 'station', stationId: st.id } : null;
    } else {
      const lineId = this.nearestLine(p);
      drag.target = lineId !== null ? { kind: 'line', lineId } : null;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.canvas!.style.cursor = 'default';
    const p = this.worldPos(e);

    if (drag.mode === 'newLine') {
      if (drag.chain.length >= 2) this.store.commitCreate(drag.chain, drag.isLoop);
    } else if (drag.mode === 'extend') {
      const oriented = drag.grabbedEnd === 'head' ? [...drag.chain].reverse() : drag.chain;
      this.store.commitChain(drag.lineId, oriented, drag.isLoop);
    } else if (drag.mode === 'insert') {
      if (drag.hoverStation !== null && drag.valid) {
        this.store.commitInsert(drag.lineId, drag.legIndex, drag.hoverStation);
      }
    } else if (drag.mode === 'inventory') {
      this.dropInventory(drag, p);
    }
  }

  private dropInventory(drag: DragState & { mode: 'inventory' }, p: Vec): void {
    if (!drag.target) return;
    if (drag.target.kind === 'line') {
      if (drag.item === 'locomotive') this.store.dropLocomotive(drag.target.lineId, p);
      else if (drag.item === 'carriage') this.store.dropCarriage(drag.target.lineId);
    } else if (drag.item === 'interchange') {
      this.store.dropInterchange(drag.target.stationId);
    }
  }

  // Inventory drags start on DOM buttons; track the pointer at window level
  // until release so the drop can land anywhere on the canvas.
  beginInventoryDrag(item: InventoryItem, e: { clientX: number; clientY: number }): void {
    if (!this.interactive || this.drag || !this.canvas) return;
    this.drag = { mode: 'inventory', item, cursor: this.worldPos(e), target: null };
    const move = (ev: PointerEvent) => {
      if (this.drag?.mode === 'inventory') {
        this.drag.cursor = this.worldPos(ev);
        this.moveInventory(this.drag.cursor);
      }
    };
    const up = (ev: PointerEvent) => {
      this.windowCleanup?.();
      this.windowCleanup = null;
      const drag = this.drag;
      this.drag = null;
      if (drag?.mode === 'inventory') this.dropInventory(drag, this.worldPos(ev));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.windowCleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  private updateHoverCursor(p: Vec): void {
    if (!this.canvas) return;
    if (!this.interactive) {
      this.canvas.style.cursor = 'default';
      return;
    }
    if (this.hitTailCap(p)) this.canvas.style.cursor = 'grab';
    else if (this.hitStation(p)) this.canvas.style.cursor = 'crosshair';
    else if (this.hitLeg(p)) this.canvas.style.cursor = 'grab';
    else this.canvas.style.cursor = 'default';
  }
}
