import { CITIES, cityById } from './game/cities';
import { DAY_NAMES } from './game/constants';
import { applyChain, applyInterchange, createLine, deleteLine, insertStation, removeStation } from './game/lines';
import { applyReward } from './game/rewards';
import { recomputeRouting } from './game/routing';
import { initialStations } from './game/spawn';
import { createGameState, dayFracOf, dayOf } from './game/state';
import { stepGame } from './game/sim';
import { tunnelsUsed } from './game/lines';
import { addCarriageToLine, addTrainToLine } from './game/trains';
import type { City, EditResult, GameMode, GameState, RewardKind, Speed, Toast, Vec } from './game/types';

export interface Snapshot {
  started: boolean;
  gameOver: boolean;
  mode: GameMode;
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
  cityId: string;
  cityName: string;
  best: number;
  runStartBest: number; // best score at run start — does not update mid-run (UI-19)
}

const TOAST_LIFETIME_MS = 2600;

// Best scores persist per city; storage may be absent in tests.
export function bestScoreFor(cityId: string): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem(`mm-best-${cityId}`) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function recordBestScore(cityId: string, score: number): void {
  try {
    if (typeof localStorage !== 'undefined' && score > bestScoreFor(cityId)) {
      localStorage.setItem(`mm-best-${cityId}`, String(score));
    }
  } catch {
    // Private mode etc. — best score is a nicety, never an error.
  }
}

export class GameStore {
  state: GameState;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;
  private lastTs: number | null = null;
  private bestRecorded = false;
  // Cache tunnelsFree so tunnelsUsed() is not recomputed every rAF tick.
  // Invalidated on every line edit operation (NET-15: derived, never stored on state).
  private _tunnelsFree: number = 0;
  // Best score at the moment the current run started; does not update mid-run (UI-19).
  private _runStartBest: number = 0;

  constructor(seed?: number) {
    this.state = this.freshState(seed, CITIES[0]);
    this._tunnelsFree = this.computeTunnelsFree();
    this._runStartBest = bestScoreFor(this.state.city.id);
    this.snapshot = this.buildSnapshot();
  }

  private computeTunnelsFree(): number {
    return this.state.inventory.tunnels - tunnelsUsed(this.state);
  }

  private invalidateTunnels(): void {
    this._tunnelsFree = this.computeTunnelsFree();
  }

  // Called by the ff loop in main.tsx after direct state mutations to sync
  // any derived caches the store maintains (e.g., tunnelsFree).
  syncDerivedCache(): void {
    this.invalidateTunnels();
  }

  private freshState(seed: number | undefined, city: City, mode: GameMode = 'normal'): GameState {
    const state = createGameState(seed, city, mode);
    initialStations(state);
    recomputeRouting(state);
    this.bestRecorded = false;
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
      mode: s.mode,
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
      tunnelsFree: this._tunnelsFree,
      interchanges: s.inventory.interchanges,
      pendingReward: s.pendingReward,
      toasts: s.toasts,
      cityId: s.city.id,
      cityName: s.city.name,
      best: bestScoreFor(s.city.id),
      runStartBest: this._runStartBest,
    };
  }

  private notify(): void {
    const next = this.buildSnapshot();
    const prev = this.snapshot;
    const changed =
      prev.started !== next.started ||
      prev.gameOver !== next.gameOver ||
      prev.mode !== next.mode ||
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
      prev.toasts !== next.toasts ||
      prev.cityId !== next.cityId ||
      prev.best !== next.best ||
      prev.runStartBest !== next.runStartBest;
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
    if (this.state.gameOver) this.recordRunBest();
    this.pruneToasts();
    this.notify();
  }

  private pruneToasts(): void {
    const now = Date.now();
    if (this.state.toasts.some((t) => t.expiresAt <= now)) {
      this.state.toasts = this.state.toasts.filter((t) => t.expiresAt > now);
    }
  }

  // Any way a run ends — overcrowding, End run, abandoning to menu/restart —
  // counts toward the city's best score. Recorded once per run.
  private recordRunBest(): void {
    if (this.bestRecorded || !this.state.started) return;
    this.bestRecorded = true;
    recordBestScore(this.state.city.id, this.state.score);
  }

  // ---- actions -------------------------------------------------------------

  start(): void {
    this.state.started = true;
    this.notify();
  }

  restart(seed?: number): void {
    this.recordRunBest();
    this.state = this.freshState(seed, this.state.city, this.state.mode);
    this._runStartBest = bestScoreFor(this.state.city.id);
    this.state.started = true;
    this.lastTs = null;
    this.invalidateTunnels();
    this.notify();
  }

  startCity(cityId: string, mode: GameMode = 'normal'): void {
    this.recordRunBest();
    this.state = this.freshState(undefined, cityById(cityId), mode);
    this._runStartBest = bestScoreFor(this.state.city.id);
    this.state.started = true;
    this.lastTs = null;
    this.invalidateTunnels();
    this.notify();
  }

  toMenu(): void {
    this.recordRunBest();
    this.state = this.freshState(undefined, this.state.city);
    this._runStartBest = 0; // back on menu, no active run
    this.lastTs = null;
    this.invalidateTunnels();
    this.notify();
  }

  // Endless mode has no overcrowding game over; this is the manual end.
  endRun(): void {
    this.state.gameOver = true;
    this.state.speed = 0;
    this.recordRunBest();
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
    // Tunnel reward changes inventory.tunnels — recompute free count.
    if (kind === 'tunnels') this.invalidateTunnels();
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
    const res = createLine(this.state, chain, isLoop);
    if (res.ok) this.invalidateTunnels();
    return this.reportResult(res);
  }

  commitChain(lineId: number, chain: number[], isLoop: boolean): boolean {
    const res = applyChain(this.state, lineId, chain, isLoop);
    if (res.ok) this.invalidateTunnels();
    return this.reportResult(res);
  }

  commitInsert(lineId: number, legIndex: number, stationId: number): boolean {
    const res = insertStation(this.state, lineId, legIndex, stationId);
    if (res.ok) this.invalidateTunnels();
    return this.reportResult(res);
  }

  commitRemoveStation(lineId: number, stationId: number): boolean {
    const res = removeStation(this.state, lineId, stationId);
    if (res.ok) this.invalidateTunnels();
    return this.reportResult(res);
  }

  removeLine(lineId: number): void {
    deleteLine(this.state, lineId);
    this.invalidateTunnels();
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
