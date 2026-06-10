---
id: PRD-04
title: Network Editing — Lines, Geometry & Tunnels
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [src/game/lines.ts, src/game/geometry.ts, src/game/river.ts, src/game/constants.ts]
related: [01-game-design.md, 05-transit-simulation.md, 07-interaction.md]
---

# Network Editing — Lines, Geometry & Tunnels

The line model and every legal mutation of the network: `lines.ts` (edit operations and
validation), `geometry.ts` (octilinear paths and arc-length math), `river.ts` (water queries
and tunnel-cost counting).

## Line model

| ID | Requirement |
|----|-------------|
| NET-01 | A `Line` is `{ id, stations, isLoop, path, nodeS }`: `id` is its palette index 0–6 (also its color, [RDR-05](06-rendering.md#metro-lines)); `stations` is an ordered list of ≥2 distinct station ids; `path` is the cached octilinear polyline including the loop-closing leg; `nodeS[i]` is the arc-length of station *i* along `path`, with `nodeS[0] = 0`. |
| NET-02 | Line ids are recycled: a new line takes the lowest palette id not currently in use (`freePaletteId`), so a deleted color becomes available again. |
| NET-03 | At most 7 lines exist (`MAX_LINES`); creation is further capped by the run's unlocked `lineSlots`. |

## Octilinear geometry

| ID | Requirement |
|----|-------------|
| NET-04 | Every leg between consecutive stations is rendered and measured as `octilinearPath(a, b)`: a 45° diagonal first, then an axis-aligned run — deterministic, no alternative elbows. Already-aligned pairs (`dx = 0`, `dy = 0`, or `|dx| = |dy|`) are a single straight segment. |
| NET-05 | Arc-length utilities (`polylineLength`, `pointAtArcLength`, `nearestPointOnPolyline`) are the shared currency between lines, trains, hit-testing, and rendering. `pointAtArcLength` clamps to endpoints and reports the segment angle (train orientation). |
| NET-06 | `offsetPolyline(pts, offset)` shifts a polyline sideways with mitered interior vertices so parallel lines stay parallel through 45° elbows (used by rendering, [RDR-06](06-rendering.md#metro-lines)). |

## Validation

| ID | Requirement |
|----|-------------|
| NET-07 | `validateChain(state, chain, isLoop, excludeLineId?)` is the single gate for every chain-shaped edit. It rejects, in order: fewer than 2 stations ("Need two stations"); duplicate stations ("Already on this line"); loops with fewer than 3 stations ("Loop needs three stations"); unknown station ids; and tunnel budget violations ("No tunnels available"). |
| NET-08 | Budget check: `tunnelsUsed(state, excludeLineId) + crossings(chain) ≤ inventory.tunnels`. `excludeLineId` exempts the line being edited so its own current usage doesn't double-count. |
| NET-09 | Edits are atomic: validation happens before any state change; a failing edit leaves lines, trains, and routing untouched ([ENG-05](02-game-engine.md#architecture-requirements)). |

## Edit operations

All operations return `EditResult` and, on success, rebuild the path cache, remap trains, and
`recomputeRouting`.

| ID | Requirement |
|----|-------------|
| NET-10 | `createLine(chain, isLoop)`: requires a free slot (`lines.length < lineSlots`, else "No lines available") and a valid chain; takes the lowest free palette id; auto-deploys one locomotive if `inventory.locomotives > 0` (a line *may* legally exist trainless). |
| NET-11 | `applyChain(lineId, chain, isLoop)` replaces a line's station list (used by extend/retract gestures). A chain of length ≤1 is not an error — it deletes the line (NET-14). |
| NET-12 | `insertStation(lineId, legIndex, stationId)` splices the station after position `legIndex`; `removeStation(lineId, stationId)` filters it out, and a loop dropping below 3 stations is automatically broken open (`isLoop = false`). Both delegate to `applyChain`, so a 2-station line losing a station collapses into deletion with full refunds. |
| NET-13 | <a name="path-cache--train-remapping"></a>`rebuildLinePath` recomputes `path`/`nodeS` from the chain (loop legs included; `nodeS` is truncated to one entry per station). After any rebuild, every train on the line is remapped: its old world position is projected onto the new path (`nearestPointOnPolyline`), and a dwelling train snaps to the nearest station node so `atNode` stays consistent. |
| NET-14 | `deleteLine(lineId)`: refunds one locomotive per train plus all attached carriages to inventory; passengers aboard are offloaded into the `waiting` queue of the nearest station of the old route (measured from the train's last position); the selection is cleared if it pointed at this line; routing is recomputed. The slot itself frees implicitly (slots are a count, usage is `lines.length`). |

## Tunnel accounting

| ID | Requirement |
|----|-------------|
| NET-15 | Tunnel *usage is derived, never stored*: `tunnelsUsed` re-walks every line's legs on demand. Retract/delete refunds are therefore automatic and cannot drift. |
| NET-16 | A leg's cost = number of *contiguous water spans* its octilinear path enters, counted per river band: the path is sampled every 5 units (`SAMPLE_STEP`), `inside` is tracked per band, and each false→true transition costs 1. Touching two bands costs 2; running lengthwise inside one band costs 1. |
| NET-17 | A point is "in water" when within 28 units (`RIVER_HALF_W`) of any river polyline — consistent with rendering width (56) and station clearance ([WLD-08](03-world-generation.md#station-spawning)). |

## Interchange application

| ID | Requirement |
|----|-------------|
| NET-18 | `applyInterchange(stationId)` consumes one inventory interchange and sets the flag permanently; it rejects with a reasoned `EditResult` when stock is 0, the station is unknown, or it is already an interchange. No routing recompute is needed (topology is unchanged — only capacity and exchange speed, [TRN-08](05-transit-simulation.md#dwell--passenger-exchange)/[ENG-16](02-game-engine.md#overcrowding--game-over)). |

## Verification

`lines.test.ts` (create/extend/insert/remove/retract/delete, loop rules, tunnel accounting
with refunds, hardware refunds, passenger offloading), `geometry.test.ts` (octilinear shapes,
arc-length walking, point–segment distance, miter offsets), `river.test.ts` (crossing counts:
multi-band, lengthwise, edge cases). Manual: draw across water with `?city=tokyo` and watch
the `free/owned` tunnel counter.
