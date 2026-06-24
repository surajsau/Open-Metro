---
id: PRD-07
title: Interaction — Pointer State Machine
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [src/input/interactions.ts, src/input/dragState.ts]
related: [01-game-design.md, 04-network-editing.md, 06-rendering.md, 08-ui-shell.md]
---

# Interaction — Pointer State Machine

All canvas gestures live in one pointer state machine (`interactions.ts`) owning a transient
`DragState` (`dragState.ts`). The input layer **proposes**; the game core **decides**: every
gesture validates through core functions while dragging and commits through store actions on
release, so no rule logic exists in this layer.

## Drag modes

`DragState` is a tagged union — exactly one drag exists at a time:

| Mode | Started by | Commits as |
|------|-----------|------------|
| `newLine` | pointer-down on a station | `createLine` |
| `extend` | pointer-down on a terminus tail cap | `applyChain` (extend, retract, loop, or delete) |
| `insert` | pointer-down on a line leg | `insertStation` |
| `removeStation` | pointer-down on a mid-line station of the *selected* line | `removeStation` |
| `inventory` | pointer-down on an inventory bar button (DOM) | `addTrainToLine` / `addCarriageToLine` / `applyInterchange` |
| `pickUpTrain` | pointer-down on a deployed train sprite on the canvas (paused only) | `pickUpTrain` then `addTrainToLine` (+ re-attach carriages) on a line drop |

## Hit-testing

| ID | Requirement |
|----|-------------|
| INP-01 | All hit-testing happens in world coordinates (client → `toWorld`). Radii: station 22 (`STATION_HIT_R`), tail cap 16, line leg 11, hover-snap onto stations 26, drop targets 30. Nearest candidate wins within the radius. |
| INP-02 | Leg hit-testing measures distance to the leg's true octilinear path via the shared `forEachLeg` enumeration — identical geometry to what is rendered, including loop closing legs. |
| INP-03 | Idle hover communicates affordances via cursor: `grab` over tail caps, removal targets, and legs; `crosshair` over stations; `default` elsewhere and whenever interaction is disabled. While paused, hovering a deployed train sprite also shows `grab` (it is a pick-up target — see INP-18). |
| INP-18 | A deployed train sprite is a hit-test target with radius `TRAIN_HIT_R` (the train's drawn half-extent; use the rendered sprite footprint). Nearest train within the radius wins. Train hit-testing is resolved **only while paused** (see INP-19); at speed > 0 trains are not hit-test candidates and clicks fall through to the normal pointer-down order (INP-05). |

## Pointer-down priority

| ID | Requirement |
|----|-------------|
| INP-04 | Canvas gestures require the game to be interactive: started, not game-over, no reward modal open. Only button 0 starts a drag; pointer capture holds the gesture. Inventory drags (locomotive, carriage) carry an additional gate: the game must be paused (speed = 0) — see INP-17. |
| INP-05 | Pointer-down resolution order: **deployed train** (pick up — only when paused, INP-18/INP-19) → **tail cap** (extend) → **removal target** (selected line's station; on non-loops the two endpoints are excluded — they remain extend/retract territory) → **station** (new line) → **leg** (insert) → empty canvas (clear line selection). The train check sits at the front of the order because a train can sit on top of a leg; resolving it first lets a paused player grab the train rather than the leg under it. |
| INP-06 | Starting a new line with no free slot does not start a drag; it toasts "No lines available" immediately. Otherwise the pending line previews in the lowest free palette color ([NET-02](04-network-editing.md#line-model)). |

## Chain building (`newLine` and `extend`)

| ID | Requirement |
|----|-------------|
| INP-07 | An `extend` chain is oriented grabbed-end-last (grabbing the head reverses the list); on commit the original orientation is restored. Head and tail are fully symmetric. |
| INP-08 | Hovering a station within snap range: (a) the *previous* chain station → pop the last addition (live undo; on extend this continues into retraction below the original length); (b) the chain's *first* station with ≥3 in the chain → propose closing the loop; (c) any station not in the chain → append if `validateChain` accepts; rejected appends mark the drag invalid (red) but keep it alive. |
| INP-09 | With no station hovered, the rubber band re-validates the tunnel budget live: committed-chain crossings + cursor-leg crossings + rest-of-network usage (editing line excluded) against tunnels owned; over budget renders invalid ([RDR-09](06-rendering.md#draw-order)). |
| INP-10 | Release commits `newLine` only with ≥2 stations (a no-op click never creates); `extend` always commits its current chain — which may mean unchanged, extended, retracted, a closed loop, or (chain ≤1) line deletion ([NET-11](04-network-editing.md#edit-operations)). |

## Insert (`insert`)

| ID | Requirement |
|----|-------------|
| INP-11 | Grabbing a leg remembers `(lineId, legIndex)`. Hovering an unused station previews the detour both halves dashed; validity comes from `validateChain` on the spliced chain (tunnel budget included). Release commits only on a valid hovered station. |

## Mid-line removal (`removeStation`)

| ID | Requirement |
|----|-------------|
| INP-12 | Only stations of the currently *selected* line are removal targets (selection via line chips, [UI-09](08-ui-shell.md#line-chips)); on loops every station qualifies, on open lines only interior ones. Stations not on the selected line behave normally (e.g. start a new line). |
| INP-13 | The drop is valid once the cursor is ≥30 units off the station *and* the healed chain validates (or collapses to ≤1 station — deletion with refunds is always a legal outcome). The healing leg previews dashed; loops heal around the wrap. Invalid drops snap back silently. |

## Inventory drags

| ID | Requirement |
|----|-------------|
| INP-14 | Inventory drags begin on DOM buttons (`beginInventoryDrag`) and are tracked with window-level listeners so the drop can land anywhere on the canvas; the ghost follows the cursor ([RDR-09](06-rendering.md#draw-order)). |
| INP-15 | Targets resolve live: locomotive/carriage → nearest line path within 30 units; interchange → nearest non-interchange station within 30. Release on a target commits the matching store action; failures surface as toasts from the core's `EditResult.reason`. Release on nothing cancels silently. |
| INP-17 | **Pause gate for hardware drags.** When `beginInventoryDrag` is called for a locomotive or carriage item and the current game speed is > 0 (not paused), the drag must not begin: emit a toast "Pause the game to deploy trains" and return immediately. The interchange drag is exempt from this gate (placing an interchange does not affect moving trains and is safe at any speed). |
| INP-19 | **Pause gate for train pick-up.** A `pickUpTrain` drag may begin only when the game is paused (speed = 0). When the player presses on a deployed train while speed > 0, no drag begins and a toast "Pause the game to deploy trains" fires (same string as INP-17/GD-42); the press otherwise falls through to the normal pointer-down order (INP-05) so other gestures still work at speed. While the pick-up drag is live, a ghost of the train follows the cursor; targets resolve like a locomotive inventory drag — nearest line path within 30 units ([INP-15](#inventory-drags)) — **except that the train's own source line is excluded as a drop candidate** (the nearest-line resolution must skip `fromLineId`, otherwise the source line keeps winning because the train starts sitting on it). Release on a *different* line commits the re-deploy; release on nothing, on a non-line target, or where only the source line is in range cancels and the train is left untouched on its original line ([GD-44](01-game-design.md#trains--carriages)). Escape / `pointercancel` cancel with no state change (INP-16). |
| INP-20 | **Same-line re-deploy guard (core).** Independent of hit-testing, the commit path must reject a drop whose target line equals the source line: `moveTrain`/re-deploy is a no-op when `toLineId === fromLineId`, leaving hardware and the train untouched (defence-in-depth behind the INP-19 source-line exclusion, and the single invariant the core test pins). |

## Cancellation

| ID | Requirement |
|----|-------------|
| INP-16 | Escape cancels any in-flight drag with no state change; `pointercancel` does the same. Becoming non-interactive (game over, reward modal) blocks new gestures. |

## Verification

The input layer is verified by running the app (no DOM mocking, per
[QA-03](09-engineering-standards.md#testing-strategy)); its decision logic is deliberately
thin because validation lives in the tested core (`validateChain`, `tunnelsUsed` — see
[NET-07..09](04-network-editing.md#validation)). Manual pass: each row of the
[controls table](01-game-design.md#controls-summary) on `?demo&seed=1`.
