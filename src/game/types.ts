export type Vec = { x: number; y: number };
export type ShapeKind = 'circle' | 'triangle' | 'square' | 'cross' | 'diamond' | 'pentagon' | 'star';
export type RewardKind = 'line' | 'tunnels' | 'carriage' | 'interchange';
export type Speed = 0 | 1 | 2;

export interface Passenger {
  id: number;
  shape: ShapeKind; // target shape
  bornAt: number;
}

export interface Station {
  id: number;
  pos: Vec;
  shape: ShapeKind;
  isInterchange: boolean;
  waiting: Passenger[];
  gauge: number; // 0..1 overcrowd meter
  spawnTimer: number; // seconds until next passenger
  bornAt: number;
}

export interface Line {
  id: number; // palette index 0..6, unique among active lines
  stations: number[]; // ordered, distinct station ids, length >= 2
  isLoop: boolean;
  path: Vec[]; // cached polyline incl. 45° elbows (+ closing leg when loop)
  nodeS: number[]; // arc length of each station along path; nodeS[0] === 0
}

export interface Train {
  id: number;
  lineId: number;
  s: number; // arc-length position along line path
  dir: 1 | -1;
  carriages: number;
  passengers: Passenger[];
  state: 'moving' | 'dwell';
  dwellLeft: number;
  exchangeTimer: number;
  atNode: number; // station index in line.stations while dwelling, else -1
}

export interface Inventory {
  locomotives: number;
  carriages: number;
  tunnels: number;
  interchanges: number;
}

export interface Effect {
  kind: 'pulse';
  pos: Vec;
  start: number;
  color: string;
}

export interface Toast {
  id: number;
  msg: string;
  expiresAt: number; // epoch ms — toasts live in real time, not sim time
}

export interface GameState {
  rng: () => number;
  time: number; // sim seconds
  speed: Speed;
  prevSpeed: 1 | 2;
  started: boolean;
  gameOver: boolean;
  stations: Station[];
  lines: Line[];
  trains: Train[];
  inventory: Inventory;
  lineSlots: number; // unlocked slots, 3..7
  score: number;
  spawnedPassengers: number;
  nextStationIn: number;
  lastRewardDay: number;
  idCounter: number; // shared id source for stations/passengers/trains
  distFields: Map<ShapeKind, Map<number, number>>;
  pendingReward: { week: number; options: [RewardKind, RewardKind] } | null;
  selectedLine: number | null;
  toasts: Toast[];
  effects: Effect[];
}

export type EditResult = { ok: true } | { ok: false; reason: string };
