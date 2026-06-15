import {
  EDGE_MARGIN,
  GROWTH_MAX_RX,
  GROWTH_MAX_RY,
  growthFactor,
  MAX_RARE_PER_SHAPE,
  MIN_STATION_DIST,
  PASSENGER_FIRST_DELAY,
  PASSENGER_SHAPE_WEIGHTS,
  RARE_SHAPES,
  RARE_STATION_CHANCE,
  RARE_UNLOCK_DAY,
  STATION_LIMIT,
  STATION_R,
  STATION_SHAPE_WEIGHTS,
  WORLD,
  WORLD_CENTER,
} from './constants';
import { dist } from './geometry';
import { pickWeighted, randRange } from './rng';
import { distToWater } from './river';
import { dayOf } from './state';
import type { GameState, ShapeKind, Station, Vec } from './types';

const RIVER_CLEARANCE = 28 + STATION_R + 4; // band half-width + station radius + breathing room

export function isValidStationPos(state: GameState, p: Vec): boolean {
  if (p.x < EDGE_MARGIN || p.x > WORLD.w - EDGE_MARGIN) return false;
  if (p.y < EDGE_MARGIN || p.y > WORLD.h - EDGE_MARGIN) return false;
  if (distToWater(p, state.city.rivers) < RIVER_CLEARANCE) return false;
  return state.stations.every((s) => dist(s.pos, p) >= MIN_STATION_DIST);
}

export function pickStationShape(state: GameState): ShapeKind {
  if (dayOf(state) >= RARE_UNLOCK_DAY && state.rng() < RARE_STATION_CHANCE) {
    const candidates = RARE_SHAPES.filter(
      (shape) => state.stations.filter((s) => s.shape === shape).length < MAX_RARE_PER_SHAPE,
    );
    if (candidates.length > 0) {
      return candidates[Math.floor(state.rng() * candidates.length)];
    }
  }
  // Demand-aware: common shapes get less likely the more of them exist, so
  // maps stay varied instead of drowning in one shape.
  const counts = new Map<ShapeKind, number>();
  for (const s of state.stations) counts.set(s.shape, (counts.get(s.shape) ?? 0) + 1);
  const weighted: [ShapeKind, number][] = STATION_SHAPE_WEIGHTS.map(([shape, w]) => [
    shape,
    w / (1 + 0.35 * (counts.get(shape) ?? 0)),
  ]);
  return pickWeighted(state.rng, weighted);
}

export function pickStationPosition(state: GameState): Vec | null {
  const g = growthFactor(dayOf(state));
  const rx = GROWTH_MAX_RX * g;
  const ry = GROWTH_MAX_RY * g;
  for (let i = 0; i < 60; i++) {
    const angle = state.rng() * Math.PI * 2;
    const r = Math.sqrt(state.rng());
    const p = {
      x: WORLD_CENTER.x + Math.cos(angle) * rx * r,
      y: WORLD_CENTER.y + Math.sin(angle) * ry * r,
    };
    if (isValidStationPos(state, p)) return p;
  }
  return null;
}

export function spawnStation(state: GameState): Station | null {
  if (state.stations.length >= STATION_LIMIT) return null;
  const pos = pickStationPosition(state);
  if (!pos) return null;
  const station: Station = {
    id: state.idCounter++,
    pos,
    shape: pickStationShape(state),
    isInterchange: false,
    waiting: [],
    gauge: 0,
    spawnTimer: randRange(state.rng, PASSENGER_FIRST_DELAY[0], PASSENGER_FIRST_DELAY[1]),
    bornAt: state.time,
  };
  state.stations.push(station);
  return station;
}

export function pickPassengerShape(state: GameState, origin: Station): ShapeKind | null {
  const present = new Set(state.stations.map((s) => s.shape));
  present.delete(origin.shape);
  if (present.size === 0) return null;
  const items: [ShapeKind, number][] = [...present].map((shape) => [shape, PASSENGER_SHAPE_WEIGHTS[shape]]);
  return pickWeighted(state.rng, items);
}

export function spawnPassenger(state: GameState, station: Station): void {
  const shape = pickPassengerShape(state, station);
  if (!shape) return;
  station.waiting.push({ id: state.idCounter++, shape, bornAt: state.time });
  state.spawnedPassengers++;
}

// Four starters spread around the center; jitter grows until a legal spot is found.
const STARTERS: { shape: ShapeKind; anchor: Vec }[] = [
  { shape: 'circle', anchor: { x: 620, y: 360 } },
  { shape: 'circle', anchor: { x: 1010, y: 560 } },
  { shape: 'triangle', anchor: { x: 950, y: 330 } },
  { shape: 'square', anchor: { x: 680, y: 560 } },
];

// Stagger the four starter timers across [PASSENGER_FIRST_DELAY[0], PASSENGER_FIRST_DELAY[1]]
// so stations don't all overflow at the same time (WLD-18).
function starterTimers(rng: () => number): [number, number, number, number] {
  const [lo, hi] = PASSENGER_FIRST_DELAY;
  const range = hi - lo;
  const step = range / STARTERS.length;
  // Each starter gets its own random offset within its own sub-window.
  return [
    lo + 0 * step + rng() * step,
    lo + 1 * step + rng() * step,
    lo + 2 * step + rng() * step,
    lo + 3 * step + rng() * step,
  ] as [number, number, number, number];
}

export function initialStations(state: GameState): void {
  const timers = starterTimers(state.rng);
  for (let i = 0; i < STARTERS.length; i++) {
    const { shape, anchor } = STARTERS[i];
    let pos: Vec = anchor;
    for (let attempt = 0; attempt < 40; attempt++) {
      const jitter = 20 + attempt * 6;
      const candidate = {
        x: anchor.x + (state.rng() * 2 - 1) * jitter,
        y: anchor.y + (state.rng() * 2 - 1) * jitter,
      };
      if (isValidStationPos(state, candidate)) {
        pos = candidate;
        break;
      }
    }
    state.stations.push({
      id: state.idCounter++,
      pos,
      shape,
      isInterchange: false,
      waiting: [],
      gauge: 0,
      spawnTimer: timers[i],
      bornAt: state.time,
    });
  }
}
