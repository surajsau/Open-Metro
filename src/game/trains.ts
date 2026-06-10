import { DWELL_BASE, EXCHANGE_TIME, LINE_COLORS, MAX_CARRIAGES, TRAIN_BASE_CAP, TRAIN_SPEED } from './constants';
import { nearestPointOnPolyline, polylineLength } from './geometry';
import { lineById, makeTrain, stationById } from './lines';
import { distTo } from './routing';
import type { EditResult, GameState, Line, Passenger, Station, Train, Vec } from './types';

const EPS = 1e-6;

export function trainCapacity(train: Train): number {
  return TRAIN_BASE_CAP * (1 + train.carriages);
}

export function addTrainToLine(state: GameState, lineId: number, nearPos?: Vec): EditResult {
  if (state.inventory.locomotives <= 0) return { ok: false, reason: 'No locomotives available' };
  const line = lineById(state, lineId);
  if (!line || line.path.length < 2) return { ok: false, reason: 'Unknown line' };
  const total = polylineLength(line.path);
  const s = nearPos ? nearestPointOnPolyline(line.path, nearPos).s : 0;
  state.inventory.locomotives--;
  const train = makeTrain(state, line);
  train.s = s;
  train.dir = line.isLoop ? 1 : total - s > s ? 1 : -1;
  return { ok: true };
}

export function addCarriageToLine(state: GameState, lineId: number): EditResult {
  if (state.inventory.carriages <= 0) return { ok: false, reason: 'No carriages available' };
  const trains = state.trains.filter((t) => t.lineId === lineId);
  if (trains.length === 0) return { ok: false, reason: 'Line has no train' };
  const target = trains.reduce((a, b) => (b.carriages < a.carriages ? b : a));
  if (target.carriages >= MAX_CARRIAGES) return { ok: false, reason: 'Carriages maxed' };
  target.carriages++;
  state.inventory.carriages--;
  return { ok: true };
}

export function wantsToBoard(state: GameState, p: Passenger, curId: number, nextId: number): boolean {
  return distTo(state, p.shape, nextId) < distTo(state, p.shape, curId);
}

export function wantsToAlight(state: GameState, p: Passenger, cur: Station, nextId: number): boolean {
  if (cur.shape === p.shape) return true;
  return distTo(state, p.shape, nextId) >= distTo(state, p.shape, cur.id);
}

// Station index the train will visit after the one it is at / heading to.
function stepIndex(line: Line, idx: number, dir: 1 | -1): number {
  const n = line.stations.length;
  if (line.isLoop) return (idx + dir + n) % n;
  return Math.max(0, Math.min(n - 1, idx + dir));
}

// Next node ahead of a moving train, with arc distance to it.
function nextNodeAhead(line: Line, train: Train): { node: number; distance: number } {
  const total = polylineLength(line.path);
  const n = line.stations.length;
  if (train.dir === 1) {
    for (let i = 0; i < n; i++) {
      if (line.nodeS[i] > train.s + EPS) return { node: i, distance: line.nodeS[i] - train.s };
    }
    // Past the last node: loops wrap to node 0, otherwise clamp to the far end.
    if (line.isLoop) return { node: 0, distance: total - train.s };
    return { node: n - 1, distance: Math.max(0, line.nodeS[n - 1] - train.s) };
  }
  for (let i = n - 1; i >= 0; i--) {
    if (line.nodeS[i] < train.s - EPS) return { node: i, distance: train.s - line.nodeS[i] };
  }
  if (line.isLoop) return { node: n - 1, distance: train.s + (total - line.nodeS[n - 1]) };
  return { node: 0, distance: Math.max(0, train.s) };
}

function arrive(line: Line, train: Train, node: number): void {
  train.s = line.nodeS[node];
  train.state = 'dwell';
  train.atNode = node;
  train.dwellLeft = DWELL_BASE;
  train.exchangeTimer = 0;
  if (!line.isLoop) {
    if (node === line.stations.length - 1) train.dir = -1;
    else if (node === 0) train.dir = 1;
  }
}

function exchangeOne(state: GameState, line: Line, train: Train, station: Station): boolean {
  const nextId = line.stations[stepIndex(line, train.atNode, train.dir)];

  for (let i = 0; i < train.passengers.length; i++) {
    const p = train.passengers[i];
    if (wantsToAlight(state, p, station, nextId)) {
      train.passengers.splice(i, 1);
      if (station.shape === p.shape) {
        state.score++;
        state.effects.push({ kind: 'pulse', pos: { ...station.pos }, start: state.time, color: LINE_COLORS[line.id] });
      } else {
        station.waiting.push(p); // transfer
      }
      return true;
    }
  }

  if (train.passengers.length < trainCapacity(train)) {
    const idx = station.waiting.findIndex((p) => wantsToBoard(state, p, station.id, nextId));
    if (idx >= 0) {
      train.passengers.push(station.waiting.splice(idx, 1)[0]);
      return true;
    }
  }
  return false;
}

export function updateTrain(state: GameState, train: Train, dt: number): void {
  const line = lineById(state, train.lineId);
  if (!line || line.path.length < 2 || line.stations.length < 2) return;
  const total = polylineLength(line.path);

  if (train.state === 'moving') {
    const { node, distance } = nextNodeAhead(line, train);
    const step = TRAIN_SPEED * dt;
    if (step >= distance) {
      arrive(line, train, node);
    } else {
      train.s += train.dir * step;
      if (line.isLoop) {
        if (train.s >= total) train.s -= total;
        if (train.s < 0) train.s += total;
      } else {
        train.s = Math.max(0, Math.min(total, train.s));
      }
    }
    return;
  }

  // Dwelling: one passenger exchange per timer tick; actions extend the stay.
  const station = stationById(state, line.stations[train.atNode]);
  if (!station) {
    train.state = 'moving';
    train.atNode = -1;
    return;
  }
  train.dwellLeft -= dt;
  train.exchangeTimer -= dt;
  if (train.exchangeTimer <= 0) {
    const interval = station.isInterchange ? EXCHANGE_TIME / 2 : EXCHANGE_TIME;
    if (exchangeOne(state, line, train, station)) {
      train.exchangeTimer = interval;
      train.dwellLeft = Math.max(train.dwellLeft, interval);
    } else if (train.dwellLeft <= 0) {
      train.state = 'moving';
      train.atNode = -1;
    }
  }
}
