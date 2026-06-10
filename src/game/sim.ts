import {
  GAUGE_DRAIN_TIME,
  GAUGE_FILL_TIME,
  INTERCHANGE_CAP,
  passengerSpawnInterval,
  STATION_CAP,
  stationSpawnInterval,
} from './constants';
import { generateRewardOptions } from './rewards';
import { recomputeRouting } from './routing';
import { spawnPassenger, spawnStation } from './spawn';
import { dayOf } from './state';
import { updateTrain } from './trains';
import type { GameState } from './types';

const EFFECT_LIFETIME = 1; // sim seconds

// dt arrives pre-scaled by game speed. The sim freezes (without losing the
// frame loop) while a reward modal is open or after game over.
export function stepGame(state: GameState, dt: number): void {
  if (dt <= 0 || state.gameOver || state.pendingReward) return;

  const prevDay = dayOf(state);
  state.time += dt;
  const day = dayOf(state);

  if (day > prevDay && day % 7 === 0 && day !== state.lastRewardDay) {
    state.lastRewardDay = day;
    state.inventory.locomotives++; // weekly locomotive is always granted
    state.pendingReward = { week: day / 7, options: generateRewardOptions(state) };
  }

  state.nextStationIn -= dt;
  if (state.nextStationIn <= 0) {
    if (spawnStation(state)) recomputeRouting(state);
    state.nextStationIn = stationSpawnInterval(state.rng, day);
  }

  for (const station of state.stations) {
    station.spawnTimer -= dt;
    if (station.spawnTimer <= 0) {
      spawnPassenger(state, station);
      station.spawnTimer = passengerSpawnInterval(state.rng, day);
    }
  }

  for (const train of [...state.trains]) updateTrain(state, train, dt);

  for (const station of state.stations) {
    const cap = station.isInterchange ? INTERCHANGE_CAP : STATION_CAP;
    if (station.waiting.length > cap) {
      station.gauge = Math.min(1, station.gauge + dt / GAUGE_FILL_TIME);
      if (station.gauge >= 1) {
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
