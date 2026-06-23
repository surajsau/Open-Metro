import type { ShapeKind, Vec } from './types';

export const WORLD = { w: 1600, h: 1000 } as const;
export const WORLD_CENTER: Vec = { x: 800, y: 470 };

export const DAY_SECONDS = 20;
export const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export const TRAIN_SPEED = 75; // world units / s
export const TRAIN_BASE_CAP = 6;
export const MAX_CARRIAGES = 4;
export const DWELL_BASE = 0.5; // s
export const EXCHANGE_TIME = 0.35; // s per passenger (halved at interchanges)

export const STATION_CAP = 6;
export const INTERCHANGE_CAP = 12;
export const GAUGE_FILL_TIME = 55; // s over capacity until game over
export const GAUGE_DRAIN_TIME = 22; // s to fully recover

export const MAX_LINES = 7;
export const START_LINE_SLOTS = 3;
export const FREE_LINE_UNLOCK_UNTIL = 5; // weekly auto-unlock up to here, then biweekly
export const START_LOCOMOTIVES = 4; // one spare beyond the starting lines

export const STATION_LIMIT = 38;
export const MIN_STATION_DIST = 70;
export const EDGE_MARGIN = 60;
export const RIVER_HALF_W = 28;

export const LINE_WIDTH = 8;
export const PARALLEL_GAP = 8; // strand center spacing; > LINE_WIDTH * PARALLEL_WIDTH_FACTOR so parallel lines show daylight
export const PARALLEL_WIDTH_FACTOR = 0.5; // stroke multiplier for legs shared by 2+ lines
export const TAIL_LEN = 22;
export const STATION_R = 11;
export const STATION_HIT_R = 22;
// Pick-up hit radius for a deployed train sprite (INP-18). The locomotive draws
// 32 long × 16 high; its rendered half-extent along the long axis is 16, so 18
// gives a forgiving grab footprint without overlapping neighbouring stations.
export const TRAIN_HIT_R = 18;

export const LINE_COLORS = ['#E32017', '#0070C0', '#EFB800', '#00843D', '#92278F', '#8A5A2B', '#00A3C8'] as const;
export const INK = '#35342F';
export const BG = '#F7F6F1';
export const WATER = '#C3DDEA';
export const INVALID_COLOR = '#D63A3A';

export const COMMON_SHAPES: ShapeKind[] = ['circle', 'triangle', 'square'];
export const RARE_SHAPES: ShapeKind[] = ['cross', 'diamond', 'pentagon', 'star'];
export const STATION_SHAPE_WEIGHTS: [ShapeKind, number][] = [
  ['circle', 5],
  ['triangle', 3],
  ['square', 2],
];
export const PASSENGER_SHAPE_WEIGHTS: Record<ShapeKind, number> = {
  circle: 4,
  triangle: 3,
  square: 2.5,
  cross: 1.25,
  diamond: 1.25,
  pentagon: 1.25,
  star: 1.25,
};
export const RARE_STATION_CHANCE = 0.12;
export const RARE_UNLOCK_DAY = 4;
export const MAX_RARE_PER_SHAPE = 2;

export const STATION_SPAWN_FIRST = 14; // s until first spawned station
export const PASSENGER_FIRST_DELAY: [number, number] = [6, 22]; // stagger window for starter timers (WLD-18)

export const GRACE_DECAY_DAYS = 3; // grace period fully decays at this day (WLD-19)

export const STRANDED_COLOR = '#C8A43A'; // amber tint for unreachable passengers (RDR-16)

export const STATION_SPAWN_BASE_MIN = 20; // s; additive base before rng·spread
export const STATION_SPAWN_BASE_SPREAD = 12; // s; rng multiplier

export const PASSENGER_SPAWN_BASE_MIN = 7; // s; additive base before rng·spread
export const PASSENGER_SPAWN_BASE_SPREAD = 7; // s; rng multiplier

export function stationSpawnInterval(rng: () => number, day: number, pace = 1, ramp = 0.97): number {
  return (STATION_SPAWN_BASE_MIN + rng() * STATION_SPAWN_BASE_SPREAD) * pace * Math.max(0.6, Math.pow(ramp, day));
}

export function passengerSpawnInterval(
  rng: () => number,
  day: number,
  pace = 1,
  ramp = 0.975,
  pressure = 1,
  graceFactor = 1,
): number {
  const graceDecay = Math.max(0, 1 - day / GRACE_DECAY_DAYS);
  const grace = Math.max(1, graceFactor * graceDecay);
  return (PASSENGER_SPAWN_BASE_MIN + rng() * PASSENGER_SPAWN_BASE_SPREAD) * pace * Math.max(0.45, Math.pow(ramp, day)) * pressure * grace;
}

// Station placement ellipse grows from the center over the first weeks.
export const GROWTH_MAX_RX = 740;
export const GROWTH_MAX_RY = 430;
export function growthFactor(day: number): number {
  return Math.min(1, 0.42 + 0.018 * day);
}
