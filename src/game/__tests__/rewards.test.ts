import { describe, expect, it } from 'vitest';
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
    state.pendingReward = { week: 1, options: ['line', 'tunnels'] };
    applyReward(state, 'line');
    expect(state.lineSlots).toBe(4);
    expect(state.pendingReward).toBeNull();

    applyReward(state, 'tunnels');
    expect(state.inventory.tunnels).toBe(5);

    applyReward(state, 'carriage');
    expect(state.inventory.carriages).toBe(1);

    applyReward(state, 'interchange');
    expect(state.inventory.interchanges).toBe(1);
  });
});
