# Mini Metro Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable local Mini Metro clone: draw metro lines between spawning shape-stations, trains carry shape-passengers with transfers, overcrowding ends the game, weekly rewards.

**Architecture:** Pure-TS mutable game core (`src/game/`) stepped by `stepGame(state, dt)`; Canvas 2D renderer reading state each rAF; pointer state machine translating gestures to core ops; React only for HUD/modals via `useSyncExternalStore` on a version-counter store. Fixed 1600×1000 world, letterboxed.

**Tech Stack:** Vite, React (latest), TypeScript (strict), Vitest. No other runtime deps.

**Spec:** `docs/superpowers/specs/2026-06-10-mini-metro-clone-design.md` — all rule constants live there; constants below restate the load-bearing ones.

---

## Core types (locked — all tasks use these exact names)

```ts
// src/game/types.ts
export type Vec = { x: number; y: number };
export type ShapeKind = 'circle'|'triangle'|'square'|'cross'|'diamond'|'pentagon'|'star';
export type RewardKind = 'line'|'tunnels'|'carriage'|'interchange';
export type Speed = 0|1|2;

export interface Passenger { id: number; shape: ShapeKind; bornAt: number }
export interface Station {
  id: number; pos: Vec; shape: ShapeKind; isInterchange: boolean;
  waiting: Passenger[]; gauge: number; spawnTimer: number; bornAt: number;
}
export interface Line {
  id: number;            // palette index 0..6, unique among active lines
  stations: number[];    // ordered, distinct station ids, length >= 2
  isLoop: boolean;
  path: Vec[];           // cached polyline incl. 45° elbows (+ closing leg when loop)
  nodeS: number[];       // arc length of each station along path; nodeS[0] === 0
}
export interface Train {
  id: number; lineId: number; s: number; dir: 1|-1; carriages: number;
  passengers: Passenger[]; state: 'moving'|'dwell';
  dwellLeft: number; exchangeTimer: number; atNode: number; // station index while dwelling, else -1
}
export interface Inventory { locomotives: number; carriages: number; tunnels: number; interchanges: number }
export interface Effect { kind: 'pulse'; pos: Vec; start: number; color: string }
export interface Toast { id: number; msg: string; expiresAt: number } // epoch ms
export interface GameState {
  rng: () => number; time: number; speed: Speed; prevSpeed: 1|2;
  started: boolean; gameOver: boolean;
  stations: Station[]; lines: Line[]; trains: Train[];
  inventory: Inventory; lineSlots: number; // unlocked slots, 3..7
  score: number; spawnedPassengers: number;
  nextStationIn: number; lastRewardDay: number;
  idCounter: number; // shared id source for stations/passengers/trains
  distFields: Map<ShapeKind, Map<number, number>>;
  pendingReward: { week: number; options: [RewardKind, RewardKind] } | null;
  selectedLine: number | null; toasts: Toast[]; effects: Effect[];
}
export type EditResult = { ok: true } | { ok: false; reason: string };
```

Derived (functions, not fields): `day = floor(time/DAY_SECONDS)`, `dayFrac`, `week = floor(day/7)+1`, `tunnelsUsed(state)`.

## Key constants (`src/game/constants.ts`)

`WORLD = {w:1600, h:1000}` · `DAY_SECONDS = 20` · `TRAIN_SPEED = 75` · `TRAIN_BASE_CAP = 6` · `MAX_CARRIAGES = 4` · `DWELL_BASE = 0.5` · `EXCHANGE_TIME = 0.35` (×0.5 interchange) · `STATION_CAP = 6` / `INTERCHANGE_CAP = 12` · `GAUGE_FILL = 1/45` / `GAUGE_DRAIN = 1/30` · `MAX_LINES = 7` · `START = {lines:3, locomotives:3, tunnels:3}` · `STATION_LIMIT = 38` · `MIN_STATION_DIST = 70` · `EDGE_MARGIN = 60` · `RIVER_HALF_W = 28` · `LINE_WIDTH = 8` · `PARALLEL_GAP = 7` · `TAIL_LEN = 22` · palette + ink/bg/water colors per spec · spawn-interval + difficulty-scale functions per spec · shape weight tables per spec.

---

### Task 0: Scaffold

**Files:** Create `package.json`, `vite.config.ts` (react plugin + `test: { environment: 'node' }`), `tsconfig.json` (strict, ES2022, bundler resolution, react-jsx), `index.html`, `src/main.tsx`, `src/App.tsx` (placeholder div), `src/styles.css`, `.gitignore`.

- [ ] Write config files by hand (no interactive scaffolder; dir is non-empty)
- [ ] `npm install react react-dom` + dev deps `typescript vite @vitejs/plugin-react vitest @types/react @types/react-dom`
- [ ] Verify: `npm run build` passes; `npm run dev` serves HTTP 200
- [ ] Commit `chore: scaffold vite react-ts app`

### Task 1: RNG + types + constants

**Files:** `src/game/types.ts` (above), `src/game/constants.ts`, `src/game/rng.ts` (`mulberry32(seed)`, `randRange(rng,a,b)`, `pickWeighted<T>(rng, items: [T,number][]): T`), test `src/game/__tests__/rng.test.ts`.

- [ ] Test: same seed → same first 5 values; `pickWeighted` with weights [['a',1],['b',0]] always 'a'
- [ ] Implement; tests pass; commit `feat: game types, constants, seeded rng`

### Task 2: Geometry

**Files:** `src/game/geometry.ts`, test `src/game/__tests__/geometry.test.ts`.

Exact API:
```ts
add/sub/scale/len/dist/norm(v)…                       // trivial vec helpers
octilinearPath(a: Vec, b: Vec): Vec[]                  // [a,b] if axis/45°-aligned else [a, elbow, b], diagonal-first:
                                                       // d=min(|dx|,|dy|); elbow = a + (sign(dx)*d, sign(dy)*d)
polylineLength(pts: Vec[]): number
pointAtArcLength(pts: Vec[], s: number): { point: Vec; angle: number }   // s clamped
nearestPointOnPolyline(pts: Vec[], p: Vec): { point: Vec; s: number; dist: number }
distPointToSegment(p: Vec, a: Vec, b: Vec): number
offsetPolyline(pts: Vec[], offset: number): Vec[]      // shift each segment along its left normal;
                                                       // interior vertices = miter (intersection of adjacent offset lines,
                                                       // fallback to simple shift when near-parallel); endpoints simple shift
```

- [ ] Tests (concrete numbers): octilinear of (0,0)→(100,40) = [(0,0),(40,40),(100,40)]; straight/diagonal cases 2 points; arc-length walk on L-path; nearestPoint on elbow path; offset of right-angle path by 7 has miter vertex (±7,±7-ish) — assert exact via intersection math; offset of straight line = parallel shift
- [ ] Implement; pass; commit `feat: geometry (octilinear, arc-length, offsets)`

### Task 3: River

**Files:** `src/game/river.ts`, test `src/game/__tests__/river.test.ts`.

`RIVER_POINTS: Vec[]` fixed meander through lower-middle of world; `isInRiver(p)` = dist to polyline < `RIVER_HALF_W`; `countRiverCrossings(path: Vec[]): number` = sample path every 5 units along arc length, count contiguous inside-runs.

- [ ] Tests: vertical path crossing band once → 1; path far above → 0; path entering+exiting twice → 2; path along the river inside → 1
- [ ] Implement; pass; commit `feat: river band and crossing counter`

### Task 4: Spawning

**Files:** `src/game/spawn.ts`, test `src/game/__tests__/spawn.test.ts`.

```ts
pickStationShape(state): ShapeKind        // common weights 5/3/2; day>4 → 12% rare (uniform among rares with <2 stations)
pickStationPosition(state): Vec | null    // ≤60 rejection samples in growth ellipse; constraints per spec
spawnStation(state): Station | null       // assembles + pushes + initial spawnTimer rand 4..10s; null if no spot/limit
pickPassengerShape(state, origin: Station): ShapeKind | null  // weighted, only shapes existing as stations, ≠ origin.shape
spawnPassenger(state, station): void      // push to waiting, count spawnedPassengers
initialStations(state): void              // 4 fixed-ish starters: 2 circle, 1 triangle, 1 square, jittered, river-safe
```

- [ ] Tests (seeded rng, 200-iteration property style): positions respect min-dist/margins/river; rare shapes never exceed 2 stations; passenger shape ≠ origin shape and always exists on map; returns null when map saturated
- [ ] Implement; pass; commit `feat: station and passenger spawning`

### Task 5: Routing

**Files:** `src/game/routing.ts`, test `src/game/__tests__/routing.test.ts`.

`recomputeRouting(state)`: adjacency from every line's consecutive pairs (+ last↔first when loop); for each shape with ≥1 station: multi-source BFS → `distFields`. Helper `distTo(state, shape, stationId): number` (Infinity when absent).

- [ ] Tests: line A–B–C (triangle at C): dist triangle = [2,1,0]; two crossing lines transfer at hub gives finite dist across lines; loop A–B–C–D wraps (A to D = 1); station on no line → Infinity from elsewhere
- [ ] Implement; pass; commit `feat: shape distance fields (BFS routing)`

### Task 6: Line operations

**Files:** `src/game/lines.ts`, test `src/game/__tests__/lines.test.ts`.

```ts
rebuildLinePath(state, line): void                       // path from octilinear legs (+ closing), nodeS; then remapTrains
tunnelsUsed(state): number                               // Σ over all lines' legs of countRiverCrossings(leg path)
validateChain(state, stations: number[], isLoop): EditResult   // distinct ids, ≥2, tunnel budget (whole-network recompute)
createLine(state, chain: number[], isLoop = false): EditResult // needs free slot (< lineSlots) + free palette id; auto-deploy locomotive if available
applyChain(state, lineId, chain: number[], isLoop): EditResult // extend/retract/loop commit; chain len 1 → deleteLine
insertStation(state, lineId, legIndex, stationId): EditResult
deleteLine(state, lineId): void                          // refund locomotives+carriages, dump train passengers at nearest old-line station, clear selection
remapTrainsToPath(state, line, oldPath): void            // nearest-point remap, keep dir; dwelling trains: re-find node by station id else 'moving'
```
All mutating ops end with `recomputeRouting(state)`.

- [ ] Tests: create with 2 stations deploys locomotive (inventory 3→2); duplicate station rejected; create crossing river twice with tunnels:1 rejected, with 2 ok; retract that removes a crossing then re-add succeeds (refund works — `tunnelsUsed` derived); applyChain to length-1 deletes + refunds hardware to inventory; insertStation splices and re-paths; loop chain validates only ≥3; remap keeps `s` within [0, length]
- [ ] Implement; pass; commit `feat: line create/extend/insert/delete with tunnel budget`

### Task 7: Trains & passenger exchange

**Files:** `src/game/trains.ts`, test `src/game/__tests__/trains.test.ts`.

```ts
addTrainToLine(state, lineId, nearPos?: Vec): EditResult  // consume locomotive; s = nearest point (default 0); dir toward farther terminus
addCarriageToLine(state, lineId): EditResult              // train with fewest carriages; cap MAX_CARRIAGES; requires a train
trainCapacity(t): number                                  // 6*(1+carriages)
nextStop(state, train): { node: number; dir: 1|-1 }       // loop wraps, terminus flips
wantsToBoard(state, p, curId, nextId): boolean            // dist(next) < dist(cur)
wantsToAlight(state, p, curStation, nextId): boolean      // arrived || dist(next) >= dist(cur)
updateTrain(state, train, dt): void                       // FSM:
//  moving: s += dir*TRAIN_SPEED*dt; on reaching next node arc-length → snap, state=dwell,
//          atNode set, terminus flip BEFORE exchange decisions, dwellLeft=DWELL_BASE, exchangeTimer=0
//  dwell:  dwellLeft-=dt; exchangeTimer-=dt; when exchangeTimer<=0 process ONE action
//          (alight first: arrived → score+effect+delete; transfer → push to waiting; else board FIFO one)
//          each action resets exchangeTimer to EXCHANGE_TIME (×0.5 at interchange) and floors dwellLeft ≥ exchangeTimer;
//          depart when dwellLeft<=0 and no action pending
```

- [ ] Tests (drive with fixed dt loops, seeded states built by hand): A(circle)–B(circle)–C(triangle), triangle passenger at A → delivered at C within simulated 60 s, score 1; passenger for unreachable shape never boards; capacity: 7 wanting passengers, only 6 board; terminus reversal returns train; loop line never reverses (dir stays 1 over full lap); transfer scenario: two lines sharing hub H — passenger from A (line 1) to D (line 2) alights at H then delivered via second train; interchange exchange twice as fast (count exchanges after fixed time)
- [ ] Implement; pass; commit `feat: trains, dwell exchange, board/alight rules`

### Task 8: Sim orchestration, rewards, store

**Files:** `src/game/sim.ts`, `src/game/rewards.ts`, `src/store.ts`, tests `src/game/__tests__/sim.test.ts`, `src/game/__tests__/rewards.test.ts`.

`stepGame(state, dt)` (dt pre-scaled by speed; no-op when `gameOver||pendingReward`): time+=dt → if day rolled over a multiple of 7 (and ≠ lastRewardDay) → `pendingReward = {week, options: generateRewardOptions(state)}` + `inventory.locomotives++`; station spawn timer (respect limit/placement-null); per-station passenger timers; trains; gauges (fill 1/45 over-cap else drain 1/30, clamp [0,1], ≥1 → gameOver, speed=0); age out effects (>1 s) and toasts.

`rewards.ts`: `generateRewardOptions(state): [RewardKind,RewardKind]` weighted draw w/o replacement (line:3 iff lineSlots<MAX_LINES, tunnels:3, carriage:2, interchange:2); `applyReward(state, kind)` then clear `pendingReward`, restore `prevSpeed`.

`store.ts` — `class GameStore`: `state`, `newGame(seed=Date.now())` (init stations, inventory, routing), rAF loop (`dtReal` clamp 0.05 s; `stepGame(state, dtReal*speed)`), `subscribe/getSnapshot` for `useSyncExternalStore` — snapshot object `{score, dayName, week, dayFrac2dp, speed, started, gameOver, weeks, inventory counts, linesInUse: number[], lineSlots, selectedLine, pendingReward, toasts, tunnelsFree}` rebuilt each step, version bumped only on shallow-≠. Actions: `start`, `setSpeed`, `togglePause`, `chooseReward`, `selectLine`, `deleteLine`, `restart`, `addToast`, plus passthroughs used by input layer.

- [ ] Sim tests: scripted 2-line network run 180 sim-seconds at dt=1/30 → deliveries > 0, passenger conservation (spawned = waiting+riding+delivered each step), all train `s` finite within bounds, gauges ∈[0,1]; isolated station with forced spawns → gameOver; reward fires exactly once at day 7 and pauses; `applyReward('line')` raises lineSlots; options never duplicate; 'line' absent when slots maxed
- [ ] Implement; pass; commit `feat: sim loop, weekly rewards, game store`

### Task 9: Renderer (no unit tests except leg offsets)

**Files:** `src/render/shapes.ts` (Path2D builders per ShapeKind, unit-sized, scaled at draw), `src/render/legOffsets.ts` + test, `src/render/renderer.ts`.

`computeLegOffsets(lines): Map<'a-b' (minId-maxId), Array<{lineId, legIndex}>>` → offset for a leg = `(idx-(n-1)/2)*PARALLEL_GAP`, sign corrected for leg direction so both orientations land on the same geometric side (test this pure module).

`renderFrame(ctx, state, drag: DragState|null, nowMs)` draws in order: bg → river (band stroke along RIVER_POINTS, width 56, rounded) → line legs (offset polylines, round joins; selected line +2 width & glow) → terminus tails + grab caps → drag previews (chain solid, cursor leg dashed; red when invalid; insert preview dims original leg) → trains (+carriages behind along path, white passenger grid 3×2, rotate to path angle; roundRect) → stations (pop-in easeOutBack 0.4 s, white fill, ink outline, interchange 1.65× double ring, overcrowd pie sweep r=20 + waiting passengers rows of 6 at offset (16,-4), 5-unit ink shapes) → effects (expanding fading rings) → inventory drag ghost. Letterbox transform: `setupViewport(canvas) → {scale, offsetX, offsetY}` and `toWorld(clientX, clientY)`.

- [ ] legOffsets test: two lines sharing pair (A,B) get ±3.5; single line gets 0; reversed leg same geometric side
- [ ] Implement renderer; visually verified in Task 11; commit `feat: canvas renderer`

### Task 10: Input

**Files:** `src/input/interactions.ts`.

`DragState =`
```ts
| { mode:'newLine'; chain: number[]; cursor: Vec; valid: boolean }
| { mode:'extend'; lineId: number; grabbedEnd: 'head'|'tail'; chain: number[]; isLoop: boolean; cursor: Vec; valid: boolean }
| { mode:'insert'; lineId: number; legIndex: number; hoverStation: number|null; cursor: Vec; valid: boolean }
| { mode:'inventory'; item: 'locomotive'|'carriage'|'interchange'; cursor: Vec }
```
`attachInteractions(canvas, store, getViewport): { getDrag(): DragState|null, beginInventoryDrag(item) }`. Hit priority on pointerdown: terminus cap (≤16) → station (≤22; needs free slot for newLine else toast) → leg (≤10). Chain mechanics: hover station ≤24 → push if `validateChain` ok (tunnel check per-candidate → `valid` flag for red preview); hover `chain[len-2]` → pop; hover `chain[0]` with len≥3 → loop preview. Release: commit via `createLine`/`applyChain`/`insertStation`; len-1 extend chain → `deleteLine`. ESC cancels. Window-level move/up during inventory drag; drop: locomotive/carriage → nearest line path ≤26, interchange → nearest non-interchange station ≤26; fail → toast + no consume.

- [ ] Implement; manual checklist (create, multi-extend, hover-back undo, retract-to-delete, loop close, insert, tunnel-reject red preview, inventory drops); commit `feat: pointer interactions`

### Task 11: React UI

**Files:** `src/ui/Icons.tsx` (inline SVG: passenger, locomotive, carriage, tunnel, interchange, shapes for reward cards), `src/ui/Hud.tsx` (score top-left; clock top-right: SVG circle + rotating hand from dayFrac, day name, week, speed buttons ⏸/▶/▶▶), `src/ui/InventoryBar.tsx` (pointerdown → beginInventoryDrag; counts; disabled at 0), `src/ui/LineChips.tsx` (7 chips: solid in-use → click selects, ⨯ deletes; ring available; dim locked), `src/ui/RewardModal.tsx`, `src/ui/GameOverOverlay.tsx`, `src/ui/StartScreen.tsx`, `src/ui/Toasts.tsx`, rewrite `src/App.tsx` (canvas + rAF wiring + ErrorBoundary + screen switching), `src/styles.css`.

- [ ] Implement; `npm run build` clean; manual run-through; commit `feat: HUD, modals, inventory, line chips`

### Task 12: Polish & tuning

- [ ] Pop-in/pulse/overcrowd-pulse animations verified; cursors (grab/grabbing/crosshair); dashed previews; title/favicon (original SVG); difficulty feel pass (adjust constants only)
- [ ] Commit `polish: animation, cursors, tuning`

### Task 13: Verification & docs

- [ ] `npx vitest run` all green; `npm run build` clean
- [ ] Dev server boot + HTTP 200; headless Chrome screenshot if available (`"Google Chrome.app" --headless --screenshot` against dev server) — inspect for blank canvas
- [ ] Write project `CLAUDE.md` (commands, architecture map); final commit

## Self-review (done)

Spec coverage: every spec section maps to a task (rules→4–8, visuals→9/11/12, edits/tunnels→3/6/10, errors→6/10/11, testing→throughout). No placeholders; type/API names consistent across tasks (checked: `applyChain`, `recomputeRouting`, `distFields`, `EditResult` usage).
