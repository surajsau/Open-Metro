import { describe, expect, it } from 'vitest';
import { CITIES, type City } from '../cities';
import { WORLD } from '../constants';

describe('CITIES', () => {
  it('offers three cities in ascending difficulty', () => {
    expect(CITIES).toHaveLength(3);
    expect(new Set(CITIES.map((c) => c.name)).size).toBe(3);
    expect(CITIES.map((c) => c.difficulty)).toEqual([1, 2, 3]);
  });

  it('gives every city water, tunnels, and sane pacing', () => {
    for (const city of CITIES) {
      expect(city.rivers.length).toBeGreaterThanOrEqual(1);
      for (const river of city.rivers) {
        expect(river.length).toBeGreaterThanOrEqual(2);
        for (const p of river) {
          expect(p.x).toBeGreaterThanOrEqual(-200);
          expect(p.x).toBeLessThanOrEqual(WORLD.w + 200);
        }
      }
      expect(city.startTunnels).toBeGreaterThanOrEqual(2);
      expect(city.pace.station).toBeGreaterThan(0.5);
      expect(city.pace.passenger).toBeGreaterThan(0.5);
    }
  });

  it('makes harder cities spawn passengers faster', () => {
    const byDifficulty = [...CITIES].sort((a: City, b: City) => a.difficulty - b.difficulty);
    expect(byDifficulty[0].pace.passenger).toBeGreaterThan(byDifficulty[2].pace.passenger);
  });

  it('gives Tokyo two rivers', () => {
    const tokyo = CITIES.find((c) => c.name === 'Tokyo')!;
    expect(tokyo.rivers).toHaveLength(2);
  });
});
