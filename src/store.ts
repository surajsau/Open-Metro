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
import type { City, EditResult, GameState, RewardKind, Speed, Toast, Vec } from './game/types';

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
  cityId: string;
  cityName: string;
  best: number;
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

  constructor(seed?: number) {
    this.state = this.freshState(seed, CITIES[0]);
    this.snapshot = this.buildSnapshot();
  }

  private freshState(seed: number | undefined, city: City): GameState {
    const state = createGameState(seed, city);
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
      cityId: s.city.id,
      cityName: s.city.name,
      best: bestScoreFor(s.city.id),
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
      prev.toasts !== next.toasts ||
      prev.cityId !== next.cityId ||
      prev.best !== next.best;
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
    if (this.state.gameOver && !this.bestRecorded) {
      this.bestRecorded = true;
      recordBestScore(this.state.city.id, this.state.score);
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
    this.state = this.freshState(seed, this.state.city);
    this.state.started = true;
    this.lastTs = null;
    this.notify();
  }

  startCity(cityId: string): void {
    this.state = this.freshState(undefined, cityById(cityId));
    this.state.started = true;
    this.lastTs = null;
    this.notify();
  }

  toMenu(): void {
    this.state = this.freshState(undefined, this.state.city);
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

  commitRemoveStation(lineId: number, stationId: number): boolean {
    return this.reportResult(removeStation(this.state, lineId, stationId));
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
