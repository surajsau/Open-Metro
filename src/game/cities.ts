import type { City } from './types';

export type { City };

// Geography-inspired map layouts. Polylines bleed off-screen so water bands
// render flush to canvas edges. Pace multiplies spawn intervals (lower = faster
// = harder); rampPerDay is the daily interval decay.
export const CITIES: City[] = [
  {
    id: 'london',
    name: 'London',
    // Thames curves through the south. Room to breathe at first.
    blurb: 'The Thames curves through the south. Room to breathe at first.',
    difficulty: 1,
    rivers: [
      // Thames: single west-to-east band across the lower third of the map.
      // Gentle S-curve: dips south near the centre (the Isle of Dogs bend),
      // rises slightly east of centre (Canary Wharf reach).
      [
        { x: -60,  y: 640 },
        { x: 220,  y: 610 },
        { x: 480,  y: 635 },
        { x: 700,  y: 680 },
        { x: 880,  y: 710 },
        { x: 1060, y: 685 },
        { x: 1260, y: 650 },
        { x: 1480, y: 620 },
        { x: 1700, y: 605 },
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
    blurb: 'Arabian Sea hugs the west. Thane Creek cuts inland from the south-east.',
    difficulty: 2,
    rivers: [
      // Arabian Sea coastline: hugs the LEFT edge, runs north-to-south.
      // Bleeds off the top and bottom so the coast is always visible.
      [
        { x: 120,  y: -50  },
        { x: 100,  y: 180  },
        { x: 85,   y: 420  },
        { x: 90,   y: 650  },
        { x: 110,  y: 860  },
        { x: 130,  y: 1060 },
      ],
      // Thane Creek / harbour inlet: enters from the BOTTOM-RIGHT and cuts
      // diagonally north-west inland, representing the creek that separates
      // the peninsula from the mainland.
      [
        { x: 1100, y: 1020 },
        { x: 980,  y: 800  },
        { x: 880,  y: 580  },
        { x: 820,  y: 360  },
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
    // Two rivers slice the city into three columns. Fast and unforgiving.
    blurb: 'Two rivers slice the city into three columns. Fast and unforgiving.',
    difficulty: 3,
    rivers: [
      // Arakawa / Tama corridor — LEFT third of the map, broadly north-to-south.
      // Slight drift eastward as it approaches the bay in the south.
      [
        { x: 430,  y: -60  },
        { x: 420,  y: 200  },
        { x: 440,  y: 450  },
        { x: 460,  y: 700  },
        { x: 490,  y: 920  },
        { x: 510,  y: 1060 },
      ],
      // Sumida / Edo corridor — RIGHT third of the map, broadly north-to-south.
      // Slight drift westward toward the centre as it nears Tokyo Bay.
      [
        { x: 1140, y: -60  },
        { x: 1150, y: 200  },
        { x: 1130, y: 450  },
        { x: 1110, y: 700  },
        { x: 1080, y: 920  },
        { x: 1060, y: 1060 },
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
