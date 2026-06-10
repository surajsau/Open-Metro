---
id: PRD-02
title: Game Engine — State, Loop & Determinism
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [src/game/types.ts, src/game/state.ts, src/game/sim.ts, src/game/rng.ts, src/game/constants.ts]
related: [03-world-generation.md, 04-network-editing.md, 05-transit-simulation.md, 08-ui-shell.md]
---

# Game Engine — State, Loop & Determinism

The engine is the pure-TypeScript core in `src/game/`. It owns every gameplay rule and is the
only layer allowed to mutate `GameState`. Everything else (store, renderer, input, UI) is a
shell.

## Architecture requirements

| ID | Requirement |
|----|-------------|
| ENG-01 | `src/game/` must not import from React, the DOM, `src/render/`, `src/input/`, `src/ui/`, or `src/store.ts`. It must run headless under Node (Vitest) unmodified. |
| ENG-02 | All gameplay state lives in a single mutable `GameState` object (`types.ts`). Mutation in place is the convention; there is no immutable/redux layer inside the core. |
| ENG-03 | `stepGame(state, dt)` (`sim.ts`) is the single entry point that advances the world. One call advances time, weekly rewards, station spawns, passenger spawns, every train, overcrowding gauges, and effect expiry — in that order. |
| ENG-04 | All player edits go through typed core functions (`lines.ts`, `trains.ts`, `rewards.ts`) returning `EditResult = { ok: true } | { ok: false; reason: string }`. The core never throws for invalid player input; `reason` is user-presentable toast text. |
| ENG-05 | Failed edits must leave state untouched (validate-then-commit). |

## State model

`GameState` fields and their owners — see `src/game/types.ts` for the full interfaces:

| Field group | Contents | Written by |
|-------------|----------|-----------|
| Identity | `rng`, `city`, `mode` | `createGameState` only |
| Clock | `time` (sim seconds), `speed` (0/1/2), `prevSpeed` | `stepGame`, store speed actions |
| Flow | `started`, `gameOver`, `pendingReward`, `lastRewardDay` | store / `stepGame` / `rewards.ts` |
| World | `stations`, `lines`, `trains` | `spawn.ts`, `lines.ts`, `trains.ts` |
| Economy | `inventory` (locomotives, carriages, tunnels, interchanges), `lineSlots` | `lines.ts`, `trains.ts`, `rewards.ts`, `stepGame` |
| Scoring | `score`, `spawnedPassengers` | `trains.ts`, `spawn.ts` |
| Routing cache | `distFields` | `routing.ts` (`recomputeRouting`) |
| Presentation-adjacent | `selectedLine`, `toasts`, `effects` | store, `trains.ts`, `stepGame` |
| Bookkeeping | `idCounter`, `nextStationIn` | various core modules |

| ID | Requirement |
|----|-------------|
| ENG-06 | `idCounter` is the single id source shared by stations, passengers, trains, and toasts; ids are unique across all entity kinds within a run. It starts at 1 (starter stations get ids 1–4). |
| ENG-07 | Derived data must not be stored when it can drift: tunnel *usage* is always recomputed from the live network (see [NET-15](04-network-editing.md#tunnel-accounting)); `distFields` is a cache invalidated by explicit `recomputeRouting` calls on every topology change. |
| ENG-08 | `createGameState(seed = Date.now(), city = London, mode = 'normal')` produces a fresh state: speed 1, 3 line slots (`START_LINE_SLOTS`), 4 locomotives (`START_LOCOMOTIVES`), tunnels from the city, first station spawn scheduled at 14 s (`STATION_SPAWN_FIRST`). |

## Time & clock

| ID | Requirement |
|----|-------------|
| ENG-09 | Sim time is in seconds; `DAY_SECONDS = 20`. Helpers: `dayOf = floor(time/20)`, `dayFracOf`, `weekOf = floor(day/7)+1`. Day names cycle MON..SUN (`DAY_NAMES`). |
| ENG-10 | `dt` arrives at `stepGame` pre-scaled by game speed (the store multiplies real dt by `speed`). `stepGame` returns immediately when `dt ≤ 0`, when `gameOver`, or while `pendingReward` is open — pause, modal freeze, and game-over freeze all fall out of this guard. |
| ENG-11 | The engine assumes small steps (the store clamps real dt to 50 ms; fast-forward scripts step at 1/30 s). Core math must stay NaN-free under any positive dt; trains clamp/wrap arc positions every step. |

## Weekly reward tick

| ID | Requirement |
|----|-------------|
| ENG-12 | When a step crosses into a day that is a multiple of 7 (`day > prevDay && day % 7 === 0 && day !== lastRewardDay`): grant +1 locomotive unconditionally; auto-unlock a line slot if `lineSlots < 5` or the week number is even (cap 7, `FREE_LINE_UNLOCK_UNTIL = 5`); then set `pendingReward = { week: day/7, options, unlockedLine }` with two distinct weighted options (see [WLD-16](03-world-generation.md#weekly-reward-pool)). Setting `pendingReward` freezes the sim until the player chooses (ENG-10). |

## Determinism & RNG

| ID | Requirement |
|----|-------------|
| ENG-13 | All randomness flows through `state.rng`, a `mulberry32(seed)` PRNG (`rng.ts`). Identical seed + identical inputs ⇒ identical runs. Nothing in the core may call `Math.random`. |
| ENG-14 | `Date.now()` is allowed only for non-sim concerns (default seed, toast expiry); sim logic must depend on `state.time` exclusively. |
| ENG-15 | Helpers `randRange(rng, min, max)` and `pickWeighted(rng, [item, weight][])` are the only sanctioned sampling utilities. |

## Overcrowding & game over

| ID | Requirement |
|----|-------------|
| ENG-16 | After trains move each step: a station with `waiting.length >` capacity (6, or 12 for interchanges) fills its gauge by `dt / 55` (`GAUGE_FILL_TIME`); otherwise it drains by `dt / 22` (`GAUGE_DRAIN_TIME`), both clamped to [0, 1]. |
| ENG-17 | In Normal mode, a gauge reaching 1 sets `gameOver = true` and `speed = 0`. In Endless mode the gauge saturates at 1 with no game over. |

## Effects & toasts

| ID | Requirement |
|----|-------------|
| ENG-18 | `effects` are fire-and-forget render hints (currently the delivery `pulse`), timestamped in *sim* time and pruned by `stepGame` after 1 s of sim time. |
| ENG-19 | `toasts` live in *real* time (epoch-ms expiry, 2.6 s lifetime) so they remain readable while paused; the store prunes them each frame. |

## Error model

| ID | Requirement |
|----|-------------|
| ENG-20 | Validation failures are data (`EditResult.reason`), not exceptions. Exceptions escaping the core are bugs; the React error boundary ("Something derailed" + Reload) is the last-resort net, never a control-flow mechanism. |
| ENG-21 | The core must tolerate concurrent-feeling edits during simulation: trains are defensively remapped when paths change beneath them ([NET-13](04-network-editing.md#path-cache--train-remapping)), and a dwelling train whose station vanishes resumes moving. |

## Verification

Engine behavior is covered by `src/game/__tests__/`: `sim.test.ts` (clock, rewards cadence,
gauges, pressure, a multi-minute headless integration run with invariants — passenger
conservation, no NaN, gauge bounds), `rng.test.ts` (determinism), plus the per-module suites
referenced from PRDs 03–05. Run `npm test`.
