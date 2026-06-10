# Mini Metro Clone — Design Spec

**Date:** 2026-06-10
**Status:** Approved (autonomous session — decisions made solo per user's "keep iterating until done" directive; review after the fact welcome)

## Purpose

A playable, local-only clone of the Mini Metro core game loop, built from scratch with original code and original (programmatically drawn) art. Runs in the browser via `npm run dev`. Single abstract city map, Normal mode. Desktop mouse-first.

**Success criteria:** a full session is playable end to end — stations spawn over time, the player draws/extends/retracts/deletes colored metro lines, trains carry shape-passengers (with transfers), a river forces tunnel usage, overcrowded stations end the game with a score, weekly rewards grant a locomotive plus a chosen upgrade, inventory items are drag-applied, pause/1×/2× speed controls work, and the game can be restarted. Vitest suite green, `tsc` clean.

## Architecture

**Stack:** Vite + React 18 + TypeScript. No backend, no state library, no game engine.

**Split:**
- `src/game/` — pure TypeScript game core. No React, no DOM (except types). Mutable `GameState` advanced by `step(state, dt)`. Fully unit-testable.
- `src/render/` — Canvas 2D renderer: pure function of `(ctx, state, dragState, timestamp)`. Draws river, lines (octilinear, parallel-offset), stations, passengers, trains, previews, effects.
- `src/input/` — pointer state machine on the canvas; hit-testing; translates gestures into game-core actions; owns transient `DragState`.
- `src/ui/` — React components: HUD (score, clock, speed), line chips, inventory bar, reward modal, game-over overlay, start screen, toasts. Subscribes to the store via `useSyncExternalStore` with a cheap version-counter snapshot (HUD-relevant fields only).
- `src/store.ts` — `GameStore`: holds `GameState`, runs the rAF loop (variable dt clamped to 50 ms, scaled by game speed), exposes actions + subscription.

**World space:** fixed 1600×1000 world units, uniformly scaled and centered to fit the window (letterboxed). All game coordinates are world units; input is inverse-transformed. Canvas is devicePixelRatio-aware.

**Determinism:** seeded RNG (mulberry32). Tests construct states directly and call `step` with fixed dt.

## Visual language (original art, drawn in code)

- Background `#F7F6F1`, ink (outlines/passengers/text) `#35342F`, water `#C3DDEA`, station fill white.
- Line palette (7): red `#E32017`, blue `#0070C0`, yellow `#EFB800`, green `#00843D`, purple `#92278F`, brown `#8A5A2B`, cyan `#00A3C8`.
- Lines: 8-unit thick, round caps/joins, **octilinear routing** — each leg between stations is a 45° diagonal followed by an axis-aligned run (diagonal-first, deterministic). Line termini get a 22-unit grabbable tail stub continuing the last segment.
- Legs sharing the same unordered station pair are drawn with perpendicular offsets (7 units apart, mitered elbows) so parallel lines read clearly.
- Stations: white fill, 3.5-unit ink outline, radius 11 (hit radius 22). Interchange: same shape scaled 1.65× with double outline.
- Passengers: 5-unit ink-filled shapes queued in rows beside their station; on trains, white shapes in a grid on the train body.
- Trains: rounded rect ~30×16 in line color, oriented along travel; carriages trail behind.
- River: a curved band (~56 units wide) across the map, defined by a fixed polyline; soft edges.

## Game rules

### Shapes
7 total. Common: circle, triangle, square. Rare: cross, diamond, pentagon, star.
- Station shape weights: circle 5, triangle 3, square 2. After day 4, each spawn has a 12% chance to be a rare shape (uniform among rares with fewer than 2 stations on the map).
- Passenger target shape: drawn from weights circle 4 / triangle 3 / square 2.5 / each rare 1.25, restricted to shapes that exist as at least one station, excluding the origin station's own shape.

### Timing (at 1× speed)
- 1 day = 20 s real time; week = 7 days starting Monday. Speeds: paused / 1× / 2×.
- Station spawns: first at t = 8 s, then every 14–24 s (uniform), scaled by `max(0.6, 0.97^day)`. Hard cap 38 stations. Initial map: 4 stations (2 circle, 1 triangle, 1 square) spread around center.
- Passenger spawns: per-station timer, every 7–15 s (uniform), scaled by `max(0.45, 0.975^day)`; first passenger 4–10 s after the station appears.
- Station placement: rejection sampling inside a center ellipse whose radii grow with time (`growth = min(1, 0.42 + 0.018·day)`, max radii 740×430), ≥70 units from other stations, ≥60 from edges, never inside the river band.

### Stations & overcrowding
- Capacity 6 (interchange 12). When waiting > capacity, an overcrowd gauge fills at `dt/45`; when at/under capacity it drains at `dt/30`. Gauge ≥ 1 → **game over**.
- Gauge rendered as a pie sweep around the station.

### Lines
- Max 7 line slots (palette order); start with 3 unlocked.
- A line is an ordered list of distinct stations (≥2), optionally a closed loop (loop requires ≥3 stations; formed by dragging one terminus onto the other).
- Edits: create (drag station→station(s)), extend from either terminus (multi-station per drag, hover-back to undo last), retract by dragging terminus back along the line (retract to 1 station = delete line), insert a station by dragging a mid-leg onto an unused station, delete via line chip ⨯ button.
- Deleting a line refunds its slot, returns its locomotives/carriages to inventory, and dumps onboard passengers at the train's nearest station on the old path.
- Loops are broken only by deleting the line (documented limitation).

### Tunnels
- A leg's tunnel cost = number of contiguous spans of its path inside the river band (sampled every 5 units). Total cost across all lines ≤ tunnels owned; usage is recomputed from scratch on every edit (refunds are automatic).
- An edit exceeding the budget is rejected: preview leg renders red, release does not commit, toast "No tunnels available".

### Trains
- Start inventory: 3 locomotives, 0 carriages, 3 tunnels, 0 interchanges.
- Creating a line auto-deploys a locomotive if inventory > 0. Locomotives/carriages/interchanges are drag-applied from the inventory bar (locomotive → line; carriage → line, attaches to that line's train with fewest carriages, max 4; interchange → any non-interchange station).
- Capacity 6 × (1 + carriages). Speed 75 units/s. Dwell: 0.5 s base + 0.35 s per passenger exchanged (0.175 s at interchanges); alights process before boards.
- Terminus: reverse direction; loops wrap around.
- On line edit, trains remap to the nearest point of the new path; on line delete, hardware returns to inventory.

### Passenger routing
- For each shape, a distance field over stations via multi-source BFS from all stations of that shape, edges = all line legs (incl. loop closure). Recomputed on any network change or station spawn.
- **Board** iff the train's next stop strictly decreases the passenger's distance to its target shape (and the train has room). FIFO among waiters.
- **Alight** when at a station of the target shape (delivered, +1 score, pulse effect) or when the train's next stop would not decrease distance (natural transfers). Transfers rejoin the waiting pool and count toward crowding.
- Unreachable passengers wait (and crowd) — same pressure as the real game.

### Rewards
- At the end of each Sunday: game pauses, modal grants +1 locomotive and offers a choice of 1 of 2 distinct options drawn from the weighted pool: New Line ×3 (only while slots < 7), +2 Tunnels ×3, Carriage ×2, Interchange ×2.

### Game flow
Start screen → playing → (reward modals weekly) → game over overlay (score, weeks survived, Restart with fresh seed). Pausing allows line editing; the sim clock freezes.

## UI layout
- Top-left: score with passenger glyph. Top-right: clock (rotating day hand, day name, week number) + pause/1×/2× buttons.
- Bottom-left: inventory bar with drag-source icons and counts (locomotive, carriage, tunnel, interchange).
- Bottom-right: 7 line chips — solid = in use (clickable to select; selected shows ⨯ delete), ring = available, dim = locked.
- Toasts bottom-center. All icons are inline SVG drawn from scratch.

## Error handling
- All edit validations (duplicate station on line, tunnel budget, line slot availability, loop rules) live in the game core and return typed results; the input layer renders invalid previews and toasts, never throws.
- The sim guards against NaN/Infinity (clamped dt, defensive remapping when paths change under trains).
- A React error boundary around the app shows a reload prompt rather than a white screen.

## Testing
- **Vitest on the game core only:** geometry (octilinear paths, arc-length walking, point–segment distance, parallel offsets, river-crossing counts), routing tables (transfers, loops, unreachable), line ops (create/extend/insert/retract/delete/loop with tunnel accounting and hardware refunds), train exchange rules, and a headless integration run (scripted network, several sim-minutes: deliveries occur, invariants hold — passenger conservation, no NaN, gauge bounds; flooding an isolated station triggers game over).
- **Rendering/UI/input:** verified by running the app (plus a headless-Chrome screenshot if available). Canvas pixel output is intentionally not unit-tested — documented deviation from strict TDD, as it would require heavy native dependencies for negligible signal.

## Out of scope (v1)
Audio, Endless/Extreme/daily modes, mobile touch ergonomics, moving deployed trains between lines, save/load, leaderboards/achievements.

## Phase 2 addendum (same day, per user feedback)

- **Cities:** three original maps in `src/game/cities.ts` — London (1 river, easy), Mumbai (coast + harbour inlet, medium), Tokyo (2 rivers, hard). Each sets water polylines, starting tunnels, pace multipliers, and daily ramp. Water became multi-polyline throughout (`rivers: Vec[][]`).
- **Line growth:** a line slot unlocks automatically at the end of every week until five slots, then every other week (cap 7), announced in the reward modal; 'New line' stays in the reward pool at reduced weight as an accelerator. (Balance pass, same day: 4 starting locomotives, +1 starting tunnel per city, slower station spawns, gentler pace/ramps, overcrowd fill 55 s / drain 22 s, adaptive mercy cap 1.75.)
- **Adaptive difficulty ("intelligent engine"):** `pressureFactor(state)` stretches passenger spawn intervals up to 1.6× when stations are drowning and tightens to 0.75× when the network is cruising. Station shapes are demand-aware — overrepresented shapes get damped weights.
- **Best scores:** per-city best persisted to localStorage; shown on the city cards and the game-over screen, which also gained a "Change city" button.
- Dev/test URL params: `?autostart`, `?demo`, `?seed=N`, `?ff=seconds`, `?city=id`.
- **Mid-line station removal:** with a line selected (via its chip), dragging one of that line's interior stations off the path (≥30 units) removes it; the core `removeStation` wrapper re-paths through the healing leg, auto-breaks a 3-station loop into a 2-station open line, and deletes+refunds a line that drops to one station. Endpoints stay extend/retract territory via the tail caps; stations off the selected line still start a new line.
