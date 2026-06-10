---
id: PRD-08
title: UI Shell & App State — Store, HUD, Modals, Persistence
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [src/store.ts, src/App.tsx, src/main.tsx, src/ui/Hud.tsx, src/ui/Modals.tsx, src/ui/InventoryBar.tsx, src/ui/LineChips.tsx, src/ui/Icons.tsx]
related: [02-game-engine.md, 06-rendering.md, 07-interaction.md, 09-engineering-standards.md]
---

# UI Shell & App State — Store, HUD, Modals, Persistence

The glue between the pure core and the screen: `store.ts` (`GameStore` — owns the state and
the frame loop), `App.tsx` (canvas + rAF wiring + error boundary), `main.tsx` (boot + dev URL
params), and `src/ui/` (React HUD and modals, all icons inline SVG).

## GameStore

| ID | Requirement |
|----|-------------|
| UI-01 | `GameStore` owns the single `GameState` and is the only mutation gateway for the shell: speed, start/restart/city changes, reward choice, line selection, toasts, and the `commit*`/`drop*` edit wrappers that surface core `EditResult.reason` strings as toasts. |
| UI-02 | **Frame loop:** `tick(ts)` computes real dt, clamps it to 50 ms (tab-switch protection), multiplies by `speed` (0/1/2), and calls `stepGame` only after the run has started. The rAF loop in `App.tsx` always runs: `store.tick(ts)` then `renderFrame(...)` — rendering continues while paused or in menus. |
| UI-03 | **React subscription:** React subscribes via `useSyncExternalStore` to a `Snapshot` of HUD-relevant fields only (score, clock, speed, slots, lines in use, selection, inventory counts, free tunnels, pending reward, toasts, city, best, mode). A new snapshot is published only when a field actually changed — canvas-only changes (train positions, gauges) never re-render React. |
| UI-04 | The snapshot's `dayFrac` is quantized to 1/50 of a day so the clock hand re-renders at a bounded rate instead of every frame. `tunnelsFree` is derived as owned − used ([NET-15](04-network-editing.md#tunnel-accounting)). |

## Run lifecycle & modes

| ID | Requirement |
|----|-------------|
| UI-05 | Lifecycle actions: `start()` (begin current city), `startCity(id, mode)`, `restart(seed?)` (same city + mode, fresh map), `toMenu()` (back to start screen, mode resets to normal), `endRun()` (manual game over — Endless's exit). Every path that ends a run records the best score first. |
| UI-06 | **Endless mode** is chosen by a toggle on the start screen and carried in `state.mode`: overcrowding never ends the run ([ENG-17](02-game-engine.md#overcrowding--game-over)); the HUD shows an "∞ endless" badge with an **End run** button; the game-over panel reads "Run complete" instead of "Your metro closed". |
| UI-07 | **Persistence:** best score per city in `localStorage` under `mm-best-<cityId>`, written once per run at any end (game over, End run, restart, change city), read defensively (missing storage/private mode ⇒ 0, never an error). The key carries no mode: Normal and Endless runs share one per-city best. No other state persists. |

## Screens & HUD

| ID | Requirement |
|----|-------------|
| UI-08 | **Start screen:** title, "unofficial fan remake — local play only" tagline, 5-line how-to, the Endless toggle, and one card per city (name, difficulty dots ●○○, blurb, best score when > 0). Clicking a card starts that city. |
| UI-09 | <a name="line-chips"></a>**Line chips (bottom-right):** 7 chips in palette order — *used* (solid color; click selects/deselects, selection shows an ⨯ delete button and drives the canvas halo and removal gesture), *available* (colored ring; the first `lineSlots − used` free palette ids), *locked* (dim; until slots unlock). |
| UI-10 | **HUD:** top-left score with passenger glyph; top-right analog day clock (one revolution/day), day name, week number, and pause/1×/2× buttons reflecting the live speed. |
| UI-11 | **Inventory bar (bottom-left):** locomotive, carriage, and interchange as drag-source buttons with ×count (disabled at 0, pointer-down starts the window-level drag, [INP-14](07-interaction.md#inventory-drags)); tunnels as a passive `free/owned` display. |
| UI-12 | **Reward modal:** "Week N complete", the always-granted locomotive, "New line unlocked!" when applicable, and two upgrade cards; choosing applies the reward and unfreezes the sim ([WLD-17](03-world-generation.md#weekly-reward-pool)). |
| UI-13 | **Game-over overlay:** headline by mode, final score, "passengers carried · N weeks survived", per-city best when set, and the **Play again** / **Change city** pair ([GD-41](01-game-design.md#scoring--meta)). |
| UI-14 | **Toasts:** bottom-center stack fed by edit failures and advisories; each lives 2.6 s of real time (readable while paused). |
| UI-15 | A React error boundary wraps the app: any uncaught render/runtime error shows "Something derailed" with a Reload button instead of a white screen. |

## Boot & dev URL params (`main.tsx`)

| ID | Requirement |
|----|-------------|
| UI-16 | Boot evaluates URL params in order: `?city=london\|mumbai\|tokyo` and/or `?endless` start that configuration immediately; `?seed=N` (N > 0) restarts with the deterministic seed; `?autostart` / `?demo` skip the start screen; `?demo` additionally connects the four starter stations into two lines (a train is visible immediately); `?ff=S` synchronously fast-forwards S sim-seconds in 1/30 s steps before first paint. Params are combinable; all are dev/test affordances, not player features. |

## Verification

`store.test.ts` covers snapshot versioning, tick clamping/scaling, lifecycle/best-score
recording, and the edit wrappers. Visual layout and modals are screenshot-verified
([QA-03](09-engineering-standards.md#testing-strategy)); `?ff` + `?seed` make every screen
reachable deterministically (e.g. game over via an unserved map, rewards via `?ff=145`).
