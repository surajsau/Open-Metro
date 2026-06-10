import { MAX_LINES } from './constants';
import { pickWeighted } from './rng';
import type { GameState, RewardKind } from './types';

export function generateRewardOptions(state: GameState): [RewardKind, RewardKind] {
  const pool: [RewardKind, number][] = [];
  if (state.lineSlots < MAX_LINES) pool.push(['line', 3]);
  pool.push(['tunnels', 3], ['carriage', 2], ['interchange', 2]);
  const first = pickWeighted(state.rng, pool);
  const second = pickWeighted(
    state.rng,
    pool.filter(([kind]) => kind !== first),
  );
  return [first, second];
}

export function applyReward(state: GameState, kind: RewardKind): void {
  switch (kind) {
    case 'line':
      state.lineSlots = Math.min(MAX_LINES, state.lineSlots + 1);
      break;
    case 'tunnels':
      state.inventory.tunnels += 2;
      break;
    case 'carriage':
      state.inventory.carriages += 1;
      break;
    case 'interchange':
      state.inventory.interchanges += 1;
      break;
  }
  state.pendingReward = null;
}
