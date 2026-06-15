import { describe, expect, it } from 'vitest';
import { CITIES } from '../cities';
import { MAX_LINES } from '../constants';
import { applyReward, generateRewardOptions } from '../rewards';
import { createGameState } from '../state';

describe('generateRewardOptions', () => {
  it('never offers duplicate kinds', () => {
    const state = createGameState(41);
    for (let i = 0; i < 200; i++) {
      const [a, b] = generateRewardOptions(state);
      expect(a).not.toBe(b);
    }
  });

  it('drops the line option once slots are maxed', () => {
    const state = createGameState(42);
    state.lineSlots = MAX_LINES;
    for (let i = 0; i < 200; i++) {
      expect(generateRewardOptions(state)).not.toContain('line');
    }
  });
});

describe('applyReward', () => {
  it('grants each reward kind and clears the modal', () => {
    const state = createGameState(43);
    state.pendingReward = { week: 1, options: ['line', 'tunnels'], unlockedLine: false };
    applyReward(state, 'line');
    expect(state.lineSlots).toBe(4);
    expect(state.pendingReward).toBeNull();

    applyReward(state, 'tunnels');
    expect(state.inventory.tunnels).toBe(6); // London's 4 starting + 2

    applyReward(state, 'carriage');
    expect(state.inventory.carriages).toBe(1);

    applyReward(state, 'interchange');
    expect(state.inventory.interchanges).toBe(1);
  });
});

describe('per-city tunnel reward amounts (WLD-20)', () => {
  it('grants +2 tunnels on London', () => {
    const london = CITIES[0]; // tunnelRewardAmount: 2
    const state = createGameState(44, london);
    const before = state.inventory.tunnels;
    applyReward(state, 'tunnels');
    expect(state.inventory.tunnels).toBe(before + 2);
  });

  it('grants +3 tunnels on Tokyo', () => {
    const tokyo = CITIES[2]; // tunnelRewardAmount: 3
    const state = createGameState(45, tokyo);
    const before = state.inventory.tunnels;
    applyReward(state, 'tunnels');
    expect(state.inventory.tunnels).toBe(before + 3);
  });
});
