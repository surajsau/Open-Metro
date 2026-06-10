import { CITIES } from './cities';
import { DAY_SECONDS, START_LINE_SLOTS, START_LOCOMOTIVES, STATION_SPAWN_FIRST } from './constants';
import { mulberry32 } from './rng';
import type { City, GameMode, GameState } from './types';

export function createGameState(seed: number = Date.now(), city: City = CITIES[0], mode: GameMode = 'normal'): GameState {
  return {
    rng: mulberry32(seed),
    city,
    mode,
    time: 0,
    speed: 1,
    prevSpeed: 1,
    started: false,
    gameOver: false,
    stations: [],
    lines: [],
    trains: [],
    inventory: { locomotives: START_LOCOMOTIVES, carriages: 0, tunnels: city.startTunnels, interchanges: 0 },
    lineSlots: START_LINE_SLOTS,
    score: 0,
    spawnedPassengers: 0,
    nextStationIn: STATION_SPAWN_FIRST,
    lastRewardDay: 0,
    idCounter: 1,
    distFields: new Map(),
    pendingReward: null,
    selectedLine: null,
    toasts: [],
    effects: [],
  };
}

export const dayOf = (state: GameState): number => Math.floor(state.time / DAY_SECONDS);
export const dayFracOf = (state: GameState): number => (state.time % DAY_SECONDS) / DAY_SECONDS;
export const weekOf = (state: GameState): number => Math.floor(dayOf(state) / 7) + 1;
