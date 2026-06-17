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

// -----------------------------------------------------------------------
// WLD-18  Geography fidelity tests
// -----------------------------------------------------------------------

describe('London geography (Thames)', () => {
  const london = CITIES.find((c) => c.id === 'london')!;

  it('has exactly one river', () => {
    expect(london.rivers).toHaveLength(1);
  });

  it('flows west-to-east: x values increase from first to last point', () => {
    const pts = london.rivers[0];
    expect(pts[pts.length - 1].x).toBeGreaterThan(pts[0].x);
  });

  it('stays in the lower third of the map (y between 550 and 750)', () => {
    for (const p of london.rivers[0]) {
      // Skip off-screen bleed points (x < 0 or x > WORLD.w)
      if (p.x < 0 || p.x > WORLD.w) continue;
      expect(p.y).toBeGreaterThanOrEqual(550);
      expect(p.y).toBeLessThanOrEqual(750);
    }
  });

  it('bleeds off both left and right edges', () => {
    const pts = london.rivers[0];
    expect(pts[0].x).toBeLessThan(0);
    expect(pts[pts.length - 1].x).toBeGreaterThan(WORLD.w);
  });

  it('has an updated blurb mentioning the Thames', () => {
    expect(london.blurb.toLowerCase()).toMatch(/thames/);
  });
});

describe('Mumbai geography (coast + inlet)', () => {
  const mumbai = CITIES.find((c) => c.id === 'mumbai')!;

  it('has exactly two polylines (coast and inlet)', () => {
    expect(mumbai.rivers).toHaveLength(2);
  });

  it('coast polyline (index 0) hugs the left edge (all on-screen x <= 200)', () => {
    const coast = mumbai.rivers[0];
    for (const p of coast) {
      if (p.y < 0 || p.y > WORLD.h) continue; // allow bleed off top/bottom
      expect(p.x).toBeLessThanOrEqual(200);
    }
  });

  it('coast runs roughly north-to-south (y range spans at least 600 units)', () => {
    const coast = mumbai.rivers[0];
    const ys = coast.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(600);
  });

  it('inlet polyline (index 1) enters from the bottom-right and cuts northwest', () => {
    const inlet = mumbai.rivers[1];
    // First point should be in the bottom-right quadrant (x > 800, y > 700)
    expect(inlet[0].x).toBeGreaterThan(800);
    expect(inlet[0].y).toBeGreaterThan(700);
    // Last point should be northwest of the first point
    const last = inlet[inlet.length - 1];
    expect(last.x).toBeLessThan(inlet[0].x);
    expect(last.y).toBeLessThan(inlet[0].y);
  });
});

describe('Tokyo geography (two north-south rivers)', () => {
  const tokyo = CITIES.find((c) => c.id === 'tokyo')!;

  it('has exactly two rivers', () => {
    expect(tokyo.rivers).toHaveLength(2);
  });

  it('left river sits in the left third (all on-screen x <= 600)', () => {
    const leftRiver = tokyo.rivers[0];
    for (const p of leftRiver) {
      if (p.y < 0 || p.y > WORLD.h) continue;
      expect(p.x).toBeLessThanOrEqual(600);
    }
  });

  it('right river sits in the right third (all on-screen x >= 900)', () => {
    const rightRiver = tokyo.rivers[1];
    for (const p of rightRiver) {
      if (p.y < 0 || p.y > WORLD.h) continue;
      expect(p.x).toBeGreaterThanOrEqual(900);
    }
  });

  it('left and right rivers are in separate horizontal zones (no x overlap)', () => {
    const leftXs = tokyo.rivers[0].map((p) => p.x);
    const rightXs = tokyo.rivers[1].map((p) => p.x);
    expect(Math.max(...leftXs)).toBeLessThan(Math.min(...rightXs));
  });

  it('rivers run north-to-south: y range spans at least 700 units per river', () => {
    for (const river of tokyo.rivers) {
      const ys = river.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(700);
    }
  });

  it('rivers bleed off top and bottom edges', () => {
    for (const river of tokyo.rivers) {
      const ys = river.map((p) => p.y);
      expect(Math.min(...ys)).toBeLessThan(0);
      expect(Math.max(...ys)).toBeGreaterThan(WORLD.h);
    }
  });

  it('has a blurb mentioning three columns or strips', () => {
    expect(tokyo.blurb.toLowerCase()).toMatch(/three|column|strip/);
  });
});
