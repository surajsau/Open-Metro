import type { City } from './types';

export type { City };

// Original map layouts. Pace multiplies spawn intervals (lower = faster =
// harder); rampPerDay is the daily interval decay.
export const CITIES: City[] = [
  {
    id: 'london',
    name: 'London',
    blurb: 'One gentle river. A kind place to learn the ropes.',
    difficulty: 1,
    rivers: [
      [
        { x: -60, y: 640 },
        { x: 250, y: 590 },
        { x: 560, y: 640 },
        { x: 880, y: 720 },
        { x: 1180, y: 660 },
        { x: 1420, y: 580 },
        { x: 1700, y: 560 },
      ],
    ],
    startTunnels: 4,
    pace: { station: 1.15, passenger: 1.15 },
    rampPerDay: 0.985,
    graceFactor: 1.40,
    tunnelRewardAmount: 2,
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    blurb: 'A busy coast and a harbour inlet cutting inland.',
    difficulty: 2,
    rivers: [
      [
        { x: -100, y: 905 },
        { x: 400, y: 860 },
        { x: 800, y: 885 },
        { x: 1200, y: 845 },
        { x: 1700, y: 870 },
      ],
      [
        { x: 1040, y: 1010 },
        { x: 990, y: 760 },
        { x: 930, y: 545 },
      ],
    ],
    startTunnels: 3,
    pace: { station: 1.0, passenger: 0.98 },
    rampPerDay: 0.978,
    graceFactor: 1.20,
    tunnelRewardAmount: 2,
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    blurb: 'Two rivers slice the city into three demanding strips.',
    difficulty: 3,
    rivers: [
      [
        { x: -100, y: 330 },
        { x: 400, y: 295 },
        { x: 900, y: 360 },
        { x: 1700, y: 315 },
      ],
      [
        { x: -100, y: 705 },
        { x: 500, y: 745 },
        { x: 1000, y: 680 },
        { x: 1700, y: 725 },
      ],
    ],
    startTunnels: 3,
    pace: { station: 0.95, passenger: 0.9 },
    rampPerDay: 0.975,
    graceFactor: 1.00,
    tunnelRewardAmount: 3,
  },
];

export const cityById = (id: string): City => CITIES.find((c) => c.id === id) ?? CITIES[0];
