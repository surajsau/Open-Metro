# mini-metro

An original, local-only fan remake of the Mini Metro game loop. React + TypeScript + Vite, Canvas 2D. No backend, no runtime deps beyond react/react-dom.

## Commands

```bash
npm run dev      # vite dev server (default http://localhost:5173)
npm test         # vitest run (game core is fully unit-tested)
npm run build    # tsc --noEmit && vite build
```

A `Makefile` wraps these plus extras — `make help` lists all targets. Notables: `make check` (tests + typecheck + build), `make test FILTER=routing` (narrow by filename), `make screenshot` (headless capture of a running dev server, `PARAMS=`/`OUT=` overridable).

## Dev URL params (combinable)

`?autostart` skip start screen · `?demo` autostart + connect the 4 starter stations · `?seed=N` deterministic map · `?ff=120` synchronously fast-forward 120 sim-seconds · `?city=london|mumbai|tokyo` · `?endless` endless mode (implies autostart)

Headless screenshot trick used for visual checks:
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=/tmp/x.png "http://localhost:5173/?demo&seed=1&ff=60"`

## Architecture

- `src/game/` — pure-TS mutable core, no DOM. `stepGame(state, dt)` advances everything. Key modules: `types.ts` (all interfaces), `cities.ts` (3 maps: water polylines + pacing), `geometry.ts` (octilinear 45° paths, arc-length walking, miter offsets), `river.ts` (multi-river crossing counter = tunnel costs), `routing.ts` (per-shape BFS distance fields; passengers board iff next stop strictly decreases distance), `lines.ts` (all edits; tunnel usage is *derived*, never stored), `trains.ts` (movement + dwell-exchange FSM), `sim.ts` (clock, spawns, rewards cadence, overcrowding, adaptive `pressureFactor`), `rewards.ts`, `spawn.ts`, `state.ts`.
- `src/store.ts` — `GameStore`: owns state + `tick(ts)`; React subscribes via `useSyncExternalStore` snapshot (version-compared, HUD fields only). Best scores in localStorage (`mm-best-<cityId>`).
- `src/render/renderer.ts` — full canvas draw pass each rAF; reads state directly, never React.
- `src/input/interactions.ts` — pointer state machine (new line / extend from tail caps / insert via leg grab / remove mid-line station by selecting the line then dragging the station off / inventory drops). `dragState.ts` holds the shared types.
- `src/ui/` — React HUD/modals only.

## Conventions

- Game-core changes are test-first (vitest, `src/**/__tests__/`). Canvas/UI verified by running + headless screenshots — do not add DOM/canvas mocking deps.
- World space is fixed 1600×1000, letterboxed; all game coords are world units.
- PRDs (spec of record, one per component, requirement IDs like `GD-12`) live in `docs/prd/` — update the matching PRD when changing behavior. The original design spec + implementation plan live in `docs/superpowers/` (historical, not retro-edited, gitignored — local only).
