import { DAY_NAMES } from './game/constants';
import { applyChain, applyInterchange, createLine, deleteLine, insertStation } from './game/lines';
import { applyReward } from './game/rewards';
import { recomputeRouting } from './game/routing';
import { initialStations } from './game/spawn';
import { createGameState, dayFracOf, dayOf } from './game/state';
import { stepGame } from './game/sim';
import { tunnelsUsed } from './game/lines';
import { addCarriageToLine, addTrainToLine } from './game/trains';
import type { EditResult, GameState, RewardKind, Speed, Toast, Vec } from './game/types';

export interface Snapshot {
  started: boolean;
  gameOver: boolean;
  score: number;
  week: number;
  dayName: string;
  dayFrac: number; // rounded; drives the clock hand at ~5 updates/s
  speed: Speed;
  lineSlots: number;
  linesInUse: number[];
  selectedLine: number | null;
  locomotives: number;
  carriages: number;
  tunnels: number;
  tunnelsFree: number;
  interchanges: number;
  pendingReward: GameState['pendingReward'];
  toasts: Toast[];
}

const TOAST_LIFETIME_MS = 2600;

export class GameStore {
  state: GameState;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;
  private lastTs: number | null = null;

  constructor(seed?: number) {
    this.state = this.freshState(seed);
    this.snapshot = this.buildSnapshot();
  }

  private freshState(seed?: number): GameState {
    const state = createGameState(seed);
    initialStations(state);
    recomputeRouting(state);
    return state;
  }

  // ---- React wiring -------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private buildSnapshot(): Snapshot {
    const s = this.state;
    const day = dayOf(s);
    return {
      started: s.started,
      gameOver: s.gameOver,
      score: s.score,
      week: Math.floor(day / 7) + 1,
      dayName: DAY_NAMES[day % 7],
      dayFrac: Math.round(dayFracOf(s) * 50) / 50,
      speed: s.speed,
      lineSlots: s.lineSlots,
      linesInUse: s.lines.map((l) => l.id).sort((a, b) => a - b),
      selectedLine: s.selectedLine,
      locomotives: s.inventory.locomotives,
      carriages: s.inventory.carriages,
      tunnels: s.inventory.tunnels,
      tunnelsFree: s.inventory.tunnels - tunnelsUsed(s),
      interchanges: s.inventory.interchanges,
      pendingReward: s.pendingReward,
      toasts: s.toasts,
    };
  }

  private notify(): void {
    const next = this.buildSnapshot();
    const prev = this.snapshot;
    const changed =
      prev.started !== next.started ||
      prev.gameOver !== next.gameOver ||
      prev.score !== next.score ||
      prev.week !== next.week ||
      prev.dayName !== next.dayName ||
      prev.dayFrac !== next.dayFrac ||
      prev.speed !== next.speed ||
      prev.lineSlots !== next.lineSlots ||
      prev.linesInUse.join() !== next.linesInUse.join() ||
      prev.selectedLine !== next.selectedLine ||
      prev.locomotives !== next.locomotives ||
      prev.carriages !== next.carriages ||
      prev.tunnels !== next.tunnels ||
      prev.tunnelsFree !== next.tunnelsFree ||
      prev.interchanges !== next.interchanges ||
      prev.pendingReward !== next.pendingReward ||
      prev.toasts !== next.toasts;
    if (changed) {
      this.snapshot = next;
      for (const l of this.listeners) l();
    }
  }

  // ---- frame loop ----------------------------------------------------------

  tick(ts: number): void {
    const dtReal = this.lastTs === null ? 0 : Math.min(0.05, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    if (this.state.started) {
      stepGame(this.state, dtReal * this.state.speed);
    }
    this.pruneToasts();
    this.notify();
  }

  private pruneToasts(): void {
    const now = Date.now();
    if (this.state.toasts.some((t) => t.expiresAt <= now)) {
      this.state.toasts = this.state.toasts.filter((t) => t.expiresAt > now);
    }
  }

  // ---- actions -------------------------------------------------------------

  start(): void {
    this.state.started = true;
    this.notify();
  }

  restart(seed?: number): void {
    this.state = this.freshState(seed);
    this.state.started = true;
    this.lastTs = null;
    this.notify();
  }

  setSpeed(speed: Speed): void {
    this.state.speed = speed;
    if (speed !== 0) this.state.prevSpeed = speed;
    this.notify();
  }

  togglePause(): void {
    this.setSpeed(this.state.speed === 0 ? this.state.prevSpeed : 0);
  }

  chooseReward(kind: RewardKind): void {
    if (!this.state.pendingReward) return;
    applyReward(this.state, kind);
    this.notify();
  }

  selectLine(id: number | null): void {
    this.state.selectedLine = id;
    this.notify();
  }

  addToast(msg: string): void {
    this.state.toasts = [...this.state.toasts, { id: this.state.idCounter++, msg, expiresAt: Date.now() + TOAST_LIFETIME_MS }];
    this.notify();
  }

  // Edit ops used by the pointer layer; failures surface as toasts.
  private reportResult(res: EditResult): boolean {
    if (!res.ok) this.addToast(res.reason);
    this.notify();
    return res.ok;
  }

  commitCreate(chain: number[], isLoop: boolean): boolean {
    return this.reportResult(createLine(this.state, chain, isLoop));
  }

  commitChain(lineId: number, chain: number[], isLoop: boolean): boolean {
    return this.reportResult(applyChain(this.state, lineId, chain, isLoop));
  }

  commitInsert(lineId: number, legIndex: number, stationId: number): boolean {
    return this.reportResult(insertStation(this.state, lineId, legIndex, stationId));
  }

  removeLine(lineId: number): void {
    deleteLine(this.state, lineId);
    this.notify();
  }

  dropLocomotive(lineId: number, nearPos?: Vec): boolean {
    return this.reportResult(addTrainToLine(this.state, lineId, nearPos));
  }

  dropCarriage(lineId: number): boolean {
    return this.reportResult(addCarriageToLine(this.state, lineId));
  }

  dropInterchange(stationId: number): boolean {
    return this.reportResult(applyInterchange(this.state, stationId));
  }
}

export const store = new GameStore();
