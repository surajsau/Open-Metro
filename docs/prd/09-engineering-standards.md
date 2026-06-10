---
id: PRD-09
title: Engineering Standards — Testing, Tooling & Conventions
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [package.json, CLAUDE.md, src/game/__tests__/, src/render/__tests__/]
related: [00-product-overview.md, 02-game-engine.md]
---

# Engineering Standards — Testing, Tooling & Conventions

How the project is built, tested, and changed. These are working agreements; CI does not
exist yet, so the gates below are run locally.

## Stack & commands

| | |
|---|---|
| **Runtime deps** | `react`, `react-dom` (v19) — nothing else ships |
| **Toolchain** | TypeScript 6 (strict, zero `any`), Vite 8, Vitest 4 |
| `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm test` | `vitest run` — the full core suite |
| `npm run build` | `tsc --noEmit` then `vite build` — types must be clean to ship |
| `npm run preview` | serve the production bundle |

## Testing strategy

| ID | Requirement |
|----|-------------|
| QA-01 | **Game-core changes are test-first.** Any behavior change in `src/game/` lands with Vitest coverage in `src/**/__tests__/`, written before the implementation (TDD). The core's purity ([ENG-01](02-game-engine.md#architecture-requirements)) is what makes this cheap — keep it that way. |
| QA-02 | Tests construct states directly (`createGameState` + seeded RNG + `helpers.ts`) and call `stepGame`/edit functions with fixed dt — no timers, no rAF, no flakiness. Determinism ([ENG-13](02-game-engine.md#determinism--rng)) is a test requirement, not just a feature. |
| QA-03 | **Canvas, input, and React UI are verified by running the app — never by DOM/canvas mocks.** Do not add jsdom/canvas-mocking dependencies; the pixel output has negligible unit-test signal. This is a documented, deliberate deviation from strict TDD. |
| QA-04 | At least one integration test runs a scripted network for several sim-minutes and asserts system invariants: deliveries occur, passengers are conserved, no NaN anywhere, gauges stay in [0, 1], and flooding an isolated station ends the game. Extend it when adding systemic behavior. |

### Suite map

| Suite | Covers (PRD) |
|-------|--------------|
| `geometry.test.ts`, `river.test.ts` | [04 Network Editing](04-network-editing.md) — paths, arc math, crossings |
| `lines.test.ts` | [04](04-network-editing.md) — edits, tunnels, refunds |
| `trains.test.ts`, `routing.test.ts` | [05 Transit Simulation](05-transit-simulation.md) |
| `spawn.test.ts`, `cities.test.ts`, `difficulty.test.ts`, `rewards.test.ts` | [03 World Generation](03-world-generation.md) |
| `sim.test.ts`, `rng.test.ts` | [02 Game Engine](02-game-engine.md) + integration invariants |
| `store.test.ts` | [08 UI Shell](08-ui-shell.md) — snapshots, lifecycle |
| `render/__tests__/legOffsets.test.ts` | [06 Rendering](06-rendering.md) — the one pure render module |

## Visual verification workflow

| ID | Requirement |
|----|-------------|
| QA-05 | Any rendering or UI change is checked against a live run, normally headless: start `npm run dev`, then `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=/tmp/x.png "http://localhost:5173/?demo&seed=1&ff=60"`. Use `?seed` for comparable before/after shots and `?ff` to reach the state under test. |
| QA-06 | The dev URL params (`?autostart`, `?demo`, `?seed=N`, `?ff=S`, `?city=…`, `?endless` — [UI-16](08-ui-shell.md#boot--dev-url-params-maintsx)) are part of the engineering contract: keep them working, they are how this project is exercised by humans and agents alike. |

## Code conventions

| ID | Requirement |
|----|-------------|
| QA-07 | Layer boundaries are law: `game/` imports nothing from the shell; `render/` and `input/` read state but mutate only via the store; React renders only from `Snapshot`. New code that needs to cross a boundary gets a store action, not an import. |
| QA-08 | Tuning values live in `src/game/constants.ts` (or `cities.ts` for per-city pacing) — never inline magic numbers in logic. A rebalance is a constants diff plus an update to the affected PRD rows. |
| QA-09 | World units everywhere in gameplay code; client pixels exist only at the `toWorld` boundary ([RDR-03](06-rendering.md#architectural-requirements)). |
| QA-10 | All gameplay randomness through `state.rng` ([ENG-13](02-game-engine.md#determinism--rng)); `Math.random` in `src/game/` fails review. |

## Change workflow

| ID | Requirement |
|----|-------------|
| QA-11 | Behavior changes update the matching PRD (requirement rows + frontmatter `verified` date) in the same change. New features start as a `draft` PRD in `docs/prd/` before implementation. The design history snapshot lives in `docs/superpowers/` (local-only — gitignored) and is not retro-edited. |
