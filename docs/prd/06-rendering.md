---
id: PRD-06
title: Rendering — Canvas Draw Pass & Visual Language
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [src/render/renderer.ts, src/render/legOffsets.ts, src/render/shapes.ts, src/game/constants.ts]
related: [01-game-design.md, 07-interaction.md, 08-ui-shell.md]
---

# Rendering — Canvas Draw Pass & Visual Language

A single Canvas 2D draw pass per animation frame: `renderer.ts` (viewport + all draw
functions), `legOffsets.ts` (parallel-line spreading, shared with hit-testing), `shapes.ts`
(the seven glyph paths). All art is drawn in code; there are no image assets in gameplay.

## Architectural requirements

| ID | Requirement |
|----|-------------|
| RDR-01 | `renderFrame(ctx, state, drag, viewport, dpr)` is a pure function of its arguments: it redraws the entire frame from `GameState` + `DragState` every rAF, holds no retained scene graph, and never reads React state. |
| RDR-02 | Render code must never mutate game state. Animation cues come from state timestamps (`station.bornAt`, `effect.start`) evaluated against `state.time`, so visual animation freezes with the sim clock (pause freezes pop-ins and pulses — accepted behavior). |
| RDR-03 | **Viewport:** world 1600×1000 is uniformly scaled to fit the canvas and centered (letterboxed), `scale = min(cw/1600, ch/1000)`. The canvas backing store is sized in device pixels (`devicePixelRatio`-aware); `toWorld` inverts client coordinates for input. |

## Visual constants

The palette and metrics live in `src/game/constants.ts`:

| Token | Value | Use |
|-------|-------|-----|
| `BG` | `#F7F6F1` | paper background |
| `INK` | `#35342F` | outlines, passengers, text |
| `WATER` | `#C3DDEA` | river bands |
| `INVALID_COLOR` | `#D63A3A` | rejected drag previews |
| `LINE_COLORS` | red `#E32017`, blue `#0070C0`, yellow `#EFB800`, green `#00843D`, purple `#92278F`, brown `#8A5A2B`, cyan `#00A3C8` | the 7 line slots, by palette index |
| `LINE_WIDTH` / `PARALLEL_GAP` | 8 / 12 | stroke width / parallel strand spacing (> width ⇒ daylight between strands) |
| `STATION_R` / `STATION_HIT_R` | 11 / 22 | visual radius / pointer hit radius |
| `TAIL_LEN` | 22 | terminus tail stub length |

## Draw order

Back to front, per frame: background fill → **rivers** → **lines** (+ tails) → **drag
preview** → **trains** → **stations** (+ gauges + waiting queues) → **effects**.

| ID | Requirement |
|----|-------------|
| RDR-04 | **Rivers:** each polyline is stroked 56 wide (2×`RIVER_HALF_W`) with round caps/joins, smoothed by quadratic curves through segment midpoints. The smoothing is presentation-only; gameplay water queries use the raw polyline ([NET-17](04-network-editing.md#tunnel-accounting)) — the ≤ a-few-units divergence on tight bends is accepted. |
| RDR-05 | <a name="metro-lines"></a>**Lines:** every leg is its octilinear path stroked 8 wide, round caps/joins, in `LINE_COLORS[line.id]`. |
| RDR-06 | **Parallel legs:** legs sharing the same unordered station pair are spread perpendicular by 12 units per strand, centered around the true path, ordered by (lineId, legIndex), with the offset sign flipped for legs traversed in reverse so both directions land on consistent geometric sides; elbows are mitered (`offsetPolyline`). Single legs get no offset. |
| RDR-07 | **Selection halo:** the selected line's legs get an underlay stroke in the line color, width+8 at 30% alpha. |
| RDR-08 | **Tails:** non-loop lines extend a 22-unit stub past each terminus continuing the last segment direction, ending in a filled 6-radius cap dot — the grab handles for extension ([INP-05](07-interaction.md#pointer-down-priority)). Loops have no tails. |
| RDR-09 | **Drag previews:** committed chain segments draw solid; the speculative part (rubber band to cursor, loop-closing leg, insert detour, removal healing leg) draws dashed 13/9 in the line color when valid, `INVALID_COLOR` when not — the red preview is the *only* budget-violation feedback during a drag ([GD-22](01-game-design.md#lines)). Inventory drags draw a ghost icon at the cursor (alpha 0.95 over a target, 0.45 otherwise). |
| RDR-10 | **Trains:** locomotive 32×16, carriages 26×13 rounded rects in the line color, coupled 3 apart, each centered at its own arc-length offset behind the locomotive (wrapping on loops) and rotated to the local path angle. Up to 6 rider shapes per unit render white in a 3×2 grid; riders beyond visual capacity are simply not drawn. |
| RDR-11 | **Stations:** white fill, ink outline 3.5, radius 11. Interchanges render the shape at radius 17 with a 4.5 outline plus an inner 8-radius outline ring. New stations pop in over 0.4 s with an ease-out-back scale. |
| RDR-12 | **Overcrowding gauge:** while `gauge > 0`, a pie sector sweeps clockwise from 12 o'clock at radius 27 — translucent ink fill (16%) with a 50% arc outline ([GD-14](01-game-design.md#stations--overcrowding)). |
| RDR-13 | **Waiting queue:** each waiting passenger is its target-shape glyph, ink-filled at radius 4.5, laid out in rows of 8 up-right of the station (start +20,−16; pitch 11 ×, 12 ↓). The queue *is* the crowding display — no numeric counter. |
| RDR-16 | **Stranded passenger tint:** a waiting passenger is considered *stranded* when `distFields[shape][stationId] === Infinity` for every line in the current network (i.e., no reachable station of the passenger's shape exists). Stranded passengers render in a desaturated amber tint (`STRANDED_COLOR = '#C8A43A'`) instead of ink, so a disconnected shape is visually distinct at a glance. The tint is derived purely from `state.distFields` at render time — it is a read-only view of existing routing state and adds no new stored data. Passengers on an entirely unconnected map (no lines yet) are not tinted because the network is not yet built, not broken. |
| RDR-14 | **Delivery pulse:** an expanding ring in the line's color at the delivery station, radius 13→47 with alpha fading 0.55→0 over 1 s of sim time. |

## Shape glyphs

| ID | Requirement |
|----|-------------|
| RDR-15 | `shapePath(kind, r)` returns a `Path2D` centered at the origin for all seven shapes; every glyph use (stations, waiting passengers, riders, interchange rings) goes through it so silhouettes stay identical at every scale. |

## Verification

Canvas output is intentionally **not** unit-tested (no DOM/canvas mocks — see
[QA-03](09-engineering-standards.md#testing-strategy)); `legOffsets.test.ts` covers the one
pure-math module (grouping, centering, reversed-leg sign). Everything else is verified by
running the app and headless screenshots:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --screenshot=/tmp/x.png "http://localhost:5173/?demo&seed=1&ff=60"
```
