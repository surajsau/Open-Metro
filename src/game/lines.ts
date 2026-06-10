import { MAX_LINES } from './constants';
import { nearestPointOnPolyline, octilinearPath, pointAtArcLength, polylineLength } from './geometry';
import { countRiverCrossings } from './river';
import { recomputeRouting } from './routing';
import type { EditResult, GameState, Line, Train, Vec } from './types';

export function lineById(state: GameState, id: number): Line | undefined {
  return state.lines.find((l) => l.id === id);
}

export function stationById(state: GameState, id: number) {
  return state.stations.find((s) => s.id === id);
}

function legPathsOfChain(state: GameState, chain: number[], isLoop: boolean): Vec[][] {
  const pts = chain.map((id) => stationById(state, id)!.pos);
  const legs: Vec[][] = [];
  for (let i = 1; i < pts.length; i++) legs.push(octilinearPath(pts[i - 1], pts[i]));
  if (isLoop && pts.length >= 3) legs.push(octilinearPath(pts[pts.length - 1], pts[0]));
  return legs;
}

function chainCrossings(state: GameState, chain: number[], isLoop: boolean): number {
  return legPathsOfChain(state, chain, isLoop).reduce((sum, leg) => sum + countRiverCrossings(leg), 0);
}

// Tunnel stock is owned in inventory; usage is always derived from the current
// network so retractions/deletions refund automatically.
export function tunnelsUsed(state: GameState, excludeLineId?: number): number {
  return state.lines
    .filter((l) => l.id !== excludeLineId)
    .reduce((sum, l) => sum + chainCrossings(state, l.stations, l.isLoop), 0);
}

export function validateChain(state: GameState, chain: number[], isLoop: boolean, excludeLineId?: number): EditResult {
  if (chain.length < 2) return { ok: false, reason: 'Need two stations' };
  if (new Set(chain).size !== chain.length) return { ok: false, reason: 'Already on this line' };
  if (isLoop && chain.length < 3) return { ok: false, reason: 'Loop needs three stations' };
  if (chain.some((id) => !stationById(state, id))) return { ok: false, reason: 'Unknown station' };
  const used = tunnelsUsed(state, excludeLineId) + chainCrossings(state, chain, isLoop);
  if (used > state.inventory.tunnels) return { ok: false, reason: 'No tunnels available' };
  return { ok: true };
}

export function rebuildLinePath(state: GameState, line: Line): void {
  const oldPath = line.path;
  const legs = legPathsOfChain(state, line.stations, line.isLoop);
  const path: Vec[] = [];
  const nodeS: number[] = [0];
  for (const leg of legs) {
    if (path.length === 0) path.push(...leg);
    else path.push(...leg.slice(1));
    nodeS.push(nodeS[nodeS.length - 1] + polylineLength(leg));
  }
  // nodeS gains one entry per leg; for a loop the last entry is the closing
  // arrival back at station 0 — drop it so nodeS aligns with stations.
  line.path = path.length > 0 ? path : line.stations.map((id) => ({ ...stationById(state, id)!.pos }));
  line.nodeS = nodeS.slice(0, line.stations.length);
  remapTrainsToPath(state, line, oldPath);
}

export function remapTrainsToPath(state: GameState, line: Line, oldPath: Vec[]): void {
  const total = polylineLength(line.path);
  for (const train of state.trains) {
    if (train.lineId !== line.id) continue;
    const oldPos = oldPath.length >= 2 ? pointAtArcLength(oldPath, train.s).point : line.path[0];
    train.s = Math.max(0, Math.min(total, nearestPointOnPolyline(line.path, oldPos).s));
    if (train.state === 'dwell') {
      // Snap to the nearest node of the new path; indices may have shifted.
      let best = 0;
      for (let i = 1; i < line.nodeS.length; i++) {
        if (Math.abs(line.nodeS[i] - train.s) < Math.abs(line.nodeS[best] - train.s)) best = i;
      }
      train.atNode = best;
      train.s = line.nodeS[best];
    }
  }
}

export function makeTrain(state: GameState, line: Line): Train {
  const train: Train = {
    id: state.idCounter++,
    lineId: line.id,
    s: 0,
    dir: 1,
    carriages: 0,
    passengers: [],
    state: 'moving',
    dwellLeft: 0,
    exchangeTimer: 0,
    atNode: -1,
  };
  state.trains.push(train);
  return train;
}

function freePaletteId(state: GameState): number {
  for (let id = 0; id < MAX_LINES; id++) {
    if (!state.lines.some((l) => l.id === id)) return id;
  }
  return -1;
}

export function createLine(state: GameState, chain: number[], isLoop = false): EditResult {
  if (state.lines.length >= state.lineSlots) return { ok: false, reason: 'No lines available' };
  const valid = validateChain(state, chain, isLoop);
  if (!valid.ok) return valid;
  const id = freePaletteId(state);
  const line: Line = { id, stations: [...chain], isLoop, path: [], nodeS: [] };
  state.lines.push(line);
  rebuildLinePath(state, line);
  if (state.inventory.locomotives > 0) {
    state.inventory.locomotives--;
    makeTrain(state, line);
  }
  recomputeRouting(state);
  return { ok: true };
}

export function applyChain(state: GameState, lineId: number, chain: number[], isLoop: boolean): EditResult {
  const line = lineById(state, lineId);
  if (!line) return { ok: false, reason: 'Unknown line' };
  if (chain.length <= 1) {
    deleteLine(state, lineId);
    return { ok: true };
  }
  const valid = validateChain(state, chain, isLoop, lineId);
  if (!valid.ok) return valid;
  line.stations = [...chain];
  line.isLoop = isLoop;
  rebuildLinePath(state, line);
  recomputeRouting(state);
  return { ok: true };
}

export function insertStation(state: GameState, lineId: number, legIndex: number, stationId: number): EditResult {
  const line = lineById(state, lineId);
  if (!line) return { ok: false, reason: 'Unknown line' };
  if (line.stations.includes(stationId)) return { ok: false, reason: 'Already on this line' };
  const chain = [...line.stations];
  chain.splice(legIndex + 1, 0, stationId);
  return applyChain(state, lineId, chain, line.isLoop);
}

export function applyInterchange(state: GameState, stationId: number): EditResult {
  if (state.inventory.interchanges <= 0) return { ok: false, reason: 'No interchanges available' };
  const station = stationById(state, stationId);
  if (!station) return { ok: false, reason: 'Unknown station' };
  if (station.isInterchange) return { ok: false, reason: 'Already an interchange' };
  state.inventory.interchanges--;
  station.isInterchange = true;
  return { ok: true };
}

export function deleteLine(state: GameState, lineId: number): void {
  const line = lineById(state, lineId);
  if (!line) return;
  const lineStations = line.stations.map((id) => stationById(state, id)!);
  for (const train of state.trains.filter((t) => t.lineId === lineId)) {
    state.inventory.locomotives++;
    state.inventory.carriages += train.carriages;
    if (train.passengers.length > 0 && lineStations.length > 0) {
      const pos = line.path.length >= 2 ? pointAtArcLength(line.path, train.s).point : lineStations[0].pos;
      let nearest = lineStations[0];
      for (const st of lineStations) {
        if (Math.hypot(st.pos.x - pos.x, st.pos.y - pos.y) < Math.hypot(nearest.pos.x - pos.x, nearest.pos.y - pos.y)) {
          nearest = st;
        }
      }
      nearest.waiting.push(...train.passengers);
    }
  }
  state.trains = state.trains.filter((t) => t.lineId !== lineId);
  state.lines = state.lines.filter((l) => l.id !== lineId);
  if (state.selectedLine === lineId) state.selectedLine = null;
  recomputeRouting(state);
}
