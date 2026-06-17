---
id: PRD-03
title: World Generation & Difficulty
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [src/game/cities.ts, src/game/spawn.ts, src/game/sim.ts, src/game/rewards.ts, src/game/constants.ts]
related: [01-game-design.md, 02-game-engine.md, 04-network-editing.md]
---

# World Generation & Difficulty

How the city, stations, passengers, and pressure come into being: `cities.ts` (maps),
`spawn.ts` (placement and shape selection), the spawn scheduling and `pressureFactor` in
`sim.ts`, and the reward pool in `rewards.ts`.

## Cities

A `City` defines: `rivers` (one or more water polylines), `startTunnels`, `pace`
(station/passenger interval multipliers — *lower is faster is harder*), and `rampPerDay`
(daily interval decay factor). Shipped maps:

| City | Difficulty | Water | Inspired by | Start tunnels | Pace (station / passenger) | Ramp/day |
|------|-----------|-------|-------------|---------------|---------------------------|----------|
| London | 1 | 1 river (Thames) | Single river flowing broadly west→east across the lower third of the map, with a gentle S-curve | 4 | 1.15 / 1.15 | 0.985 |
| Mumbai | 2 | coast + harbour inlet (2 polylines) | Western coastline (Arabian Sea) running roughly north-south on the left edge; Thane Creek inlet curving in from the south-east | 3 | 1.00 / 0.98 | 0.978 |
| Tokyo | 3 | 2 rivers (3 strips) | Arakawa/Tama corridor on the left half; Sumida/Edo corridor on the right half — both flowing broadly north-to-south, splitting the map into three playable strips | 3 | 0.95 / 0.90 | 0.975 |

| ID | Requirement |
|----|-------------|
| WLD-01 | Water is always a list of polylines (`rivers: Vec[][]`); every water query (placement clearance, tunnel counting, rendering) must handle any number of bands. Each band is the polyline swept to half-width 28 (`RIVER_HALF_W`). |
| WLD-02 | Unknown city ids fall back to London (`cityById`). |
| WLD-03 | City polylines extend beyond the 1600×1000 world so bands visually bleed off-screen. |
| WLD-18 | Water polylines for each city are inspired by real-world geography. The shapes must be recognisable to someone who knows the city, but may be distorted to fit the 1600×1000 canvas and to produce gameplay-interesting topology (tunnel cost opportunities). Pure aesthetic curvature with no crossing-count effect is not a goal — every bend should either reflect real geography or create a useful crossing point. |

## Initial map

| ID | Requirement |
|----|-------------|
| WLD-04 | Every run opens with 4 starter stations — circle, circle, triangle, square — near fixed anchors around the world center, each jittered (growing radius, up to 40 attempts) until it lands on a valid position. They receive ids 1–4 in that order (the `?demo` script depends on this). |

## Station spawning

| ID | Requirement |
|----|-------------|
| WLD-05 | The first non-starter station spawns at t = 14 s (`STATION_SPAWN_FIRST`); thereafter the interval is `(20 + rng·12) × city.pace.station × max(0.6, rampPerDay^day)` seconds — base 20–32 s shrinking daily toward a 0.6× floor. (Previously 24–38 s; tightened to increase early pressure without changing the ramp floor or per-city pace multipliers.) |
| WLD-06 | Hard cap: 38 stations (`STATION_LIMIT`). At the cap, or when no valid position is found within the attempt budget, the spawn is skipped but the timer still resets — the growing placement ellipse (WLD-07) can open space for later attempts, so the scheduler must never stall. |
| WLD-07 | Placement is rejection sampling, ≤60 attempts, uniform over an ellipse centered at (800, 470) whose radii are `740×430 × growthFactor(day)` with `growthFactor = min(1, 0.42 + 0.018·day)` — the city grows outward over the first ~32 days. |
| WLD-08 | A valid position is ≥60 units from every world edge (`EDGE_MARGIN`), ≥70 from every existing station (`MIN_STATION_DIST`), and ≥43 from water (band half-width 28 + station radius 11 + 4 breathing room). |
| WLD-09 | New stations spawn with an empty queue, zero gauge, and their first passenger scheduled 6–14 s out (`PASSENGER_FIRST_DELAY`). A successful spawn triggers `recomputeRouting` (the new station is a potential destination). |
| WLD-18 | The four **starter stations** stagger their first-passenger timers so they do not all fire simultaneously at t ≈ 6–14 s. Each starter station adds an independent offset drawn from the RNG at `createGameState` time, spreading first arrivals across a window of at least 8 s. The total spread must remain within the range 6–22 s from t = 0 so the opening seconds feel organic without delaying meaningful demand past the point a player can act. |

### Station shape selection

| ID | Requirement |
|----|-------------|
| WLD-10 | From day 4 (`RARE_UNLOCK_DAY`), each spawn first rolls a 12% chance (`RARE_STATION_CHANCE`) for a rare shape, chosen uniformly among rares with fewer than 2 stations on the map (`MAX_RARE_PER_SHAPE`); if all rares are at cap the roll falls through to common. |
| WLD-11 | Common shapes are weighted circle 5 / triangle 3 / square 2, each damped by `w / (1 + 0.35 × countOnMap(shape))` — demand-aware spawning that keeps maps varied instead of drowning in circles. |

## Passenger spawning

| ID | Requirement |
|----|-------------|
| WLD-12 | Each station has an independent countdown; on expiry it spawns one passenger and resets to `(7 + rng·7) × city.pace.passenger × max(0.45, rampPerDay^day) × pressureFactor` seconds — base 7–14 s, daily ramp to a 0.45× floor, scaled by adaptive pressure. (Previously 9–17 s; tightened to increase passenger demand pressure while preserving the adaptive `pressureFactor` envelope 0.75–1.75× and the ramp floor.) |
| WLD-13 | The passenger's target shape follows [GD-11](01-game-design.md#shapes): weighted circle 4 / triangle 3 / square 2.5 / rares 1.25, over shapes currently present on the map, excluding the origin's shape. If no other shape exists yet, nothing spawns (the timer still resets). |
| WLD-14 | `spawnedPassengers` counts every spawn (used by tests for conservation invariants). |
| WLD-19 | **Per-city grace period:** the initial passenger spawn interval formula (WLD-12) is further multiplied by a per-city `graceFactor` that is > 1 only at day 0 and decays to 1 by day 3 (`GRACE_DECAY_DAYS = 3`). London: `graceFactor = 1.40` at day 0; Mumbai: `1.20`; Tokyo: `1.00` (no grace — hard start as designed). This gives London new players a few extra seconds before the first wave, consistent with its ●○○ difficulty contract. The decay must be smooth so the transition from grace to normal pacing is not a sudden spike. Constants: `CITY_GRACE_FACTOR` in `cities.ts`. |

## Adaptive difficulty

| ID | Requirement |
|----|-------------|
| WLD-15 | `pressureFactor(state)` = `clamp(0.75 + 0.9 × load, 0.75, 1.75)`, where `load` is the mean over stations of `min(1.5, waiting / capacity)`. Empty map ⇒ 1. It multiplies passenger spawn intervals (WLD-12): drowning networks get up to 1.75× breathing room (mercy), cruising networks get squeezed to 0.75× (pressure). It is evaluated once per step and applies to timers as they reset. |

## Weekly reward pool

| ID | Requirement |
|----|-------------|
| WLD-16 | Reward options are two *distinct* draws from the weighted pool: `line` ×2 (present only while `lineSlots < 7`), `tunnels` ×3, `carriage` ×2, `interchange` ×2. The first pick is removed from the pool before the second draw. |
| WLD-17 | Applying a reward: `line` → +1 slot (cap 7); `tunnels` → +city-specific tunnel grant (see below); `carriage` → +1 inventory; `interchange` → +1 inventory. Applying clears `pendingReward`, unfreezing the sim. The unconditional weekly locomotive and the free line unlock are granted *before* options are drawn ([ENG-12](02-game-engine.md#weekly-reward-tick)). |
| WLD-20 | **Per-city tunnel reward amounts:** the tunnels reward grants a city-defined `tunnelRewardAmount` rather than a fixed +2. Default values: London +2, Mumbai +2, Tokyo +3. Tokyo's higher river count (2 rivers, 3 strips) would reduce the tunnels reward to an unusable choice — +3 restores it as a real option while keeping tunnel budget tight enough to force topology decisions. The value is a `City` property (`tunnelRewardAmount`) in `cities.ts`. Tuning note: the grant must never make tunnels so abundant that players stop caring about crossing discipline; it must remain the choice that costs opportunity on the other option. |

## Tuning reference

All world-gen constants live in `src/game/constants.ts` (shapes, weights, intervals, growth)
and `src/game/cities.ts` (per-city pacing). When rebalancing, change constants — never inline
numbers — and update the affected requirement rows here.

## Verification

`spawn.test.ts` (placement validity, shape weighting, rare caps, starter layout),
`cities.test.ts` (map data sanity), `difficulty.test.ts` (ramps, pressure factor bounds and
monotonicity), `rewards.test.ts` (pool composition, distinctness, application),
`sim.test.ts` (spawn cadence, weekly grants). Manual check: `?seed=N` reproduces a map;
`?ff=240` fast-forwards growth.
