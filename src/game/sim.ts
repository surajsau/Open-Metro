import {
  FREE_LINE_UNLOCK_UNTIL,
  GAUGE_DRAIN_TIME,
  GAUGE_FILL_TIME,
  INTERCHANGE_CAP,
  MAX_LINES,
  passengerSpawnInterval,
  STATION_CAP,
  stationSpawnInterval,
} from './constants';
import { generateRewardOptions } from './rewards';
import { recomputeRouting } from './routing';
import { spawnPassenger, spawnStation } from './spawn';
import { dayOf } from './state';
import { updateTrain } from './trains';
import type { GameState, Station } from './types';

const EFFECT_LIFETIME = 1; // sim seconds

const capacityOf = (st: Station): number => (st.isInterchange ? INTERCHANGE_CAP : STATION_CAP);

// Adaptive difficulty: when the network is drowning, passenger spawn
// intervals stretch (mercy); when it's cruising, they tighten (pressure).
export function pressureFactor(state: GameState): number {
  if (state.stations.length === 0) return 1;
  let load = 0;
  for (const st of state.stations) {
    load += Math.min(1.5, st.waiting.length / capacityOf(st));
  }
  load /= state.stations.length;
  return Math.min(1.75, Math.max(0.75, 0.75 + load * 0.9));
}

// dt arrives pre-scaled by game speed. The sim freezes (without losing the
// frame loop) while a reward modal is open or after game over.
export function stepGame(state: GameState, dt: number): void {
  if (dt <= 0 || state.gameOver || state.pendingReward) return;

  const prevDay = dayOf(state);
  state.time += dt;
  const day = dayOf(state);

  if (day > prevDay && day % 7 === 0 && day !== state.lastRewardDay) {
    state.lastRewardDay = day;
    const week = day / 7;
    state.inventory.locomotives++; // weekly locomotive is always granted
    // Lines grow for free weekly until five slots, then every other week,
    // so the network keeps up with the city without depending on reward luck.
    const unlockedLine =
      state.lineSlots < MAX_LINES && (state.lineSlots < FREE_LINE_UNLOCK_UNTIL || week % 2 === 0);
    if (unlockedLine) state.lineSlots++;
    state.pendingReward = { week, options: generateRewardOptions(state), unlockedLine };
  }

  state.nextStationIn -= dt;
  if (state.nextStationIn <= 0) {
    if (spawnStation(state)) recomputeRouting(state);
    state.nextStationIn = stationSpawnInterval(state.rng, day, state.city.pace.station, state.city.rampPerDay);
  }

  const pressure = pressureFactor(state);
  for (const station of state.stations) {
    station.spawnTimer -= dt;
    if (station.spawnTimer <= 0) {
      spawnPassenger(state, station);
      station.spawnTimer = passengerSpawnInterval(
        state.rng,
        day,
        state.city.pace.passenger,
        state.city.rampPerDay,
        pressure,
      );
    }
  }

  for (const train of [...state.trains]) updateTrain(state, train, dt);

  for (const station of state.stations) {
    if (station.waiting.length > capacityOf(station)) {
      station.gauge = Math.min(1, station.gauge + dt / GAUGE_FILL_TIME);
      // Endless mode: the gauge still maxes out for visual pressure, but never closes the metro.
      if (station.gauge >= 1 && state.mode !== 'endless') {
        state.gameOver = true;
        state.speed = 0;
      }
    } else {
      station.gauge = Math.max(0, station.gauge - dt / GAUGE_DRAIN_TIME);
    }
  }

  if (state.effects.length > 0) {
    state.effects = state.effects.filter((e) => state.time - e.start < EFFECT_LIFETIME);
  }
}
