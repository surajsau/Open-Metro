---
id: PRD-05
title: Transit Simulation — Trains, Passengers & Routing
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [src/game/trains.ts, src/game/routing.ts, src/game/constants.ts]
related: [01-game-design.md, 02-game-engine.md, 04-network-editing.md]
---

# Transit Simulation — Trains, Passengers & Routing

How passengers decide and how trains move: `routing.ts` (per-shape distance fields) and
`trains.ts` (movement + dwell-exchange finite state machine, boarding/alighting policy,
hardware drops).

## Routing model

| ID | Requirement |
|----|-------------|
| TRN-01 | Routing is a per-shape **hop-distance field**: for every shape present on the map, a multi-source BFS from all stations of that shape, over an undirected graph whose edges are every line's consecutive station pairs plus the closing pair of loops (≥3 stations). `distFields[shape][stationId]` = stops to the nearest station of that shape; unreachable = absent = `Infinity` (`distTo`). |
| TRN-02 | `recomputeRouting` rebuilds all fields from scratch and must be called on every topology change: line create/apply/insert/remove/delete and station spawn. It is cheap by design (≤38 nodes); incremental updates are deliberately out of scope. |
| TRN-03 | Distances count *stops, not meters* — passengers prefer fewer stops regardless of geometric length, matching the original game's feel. |

## Boarding and alighting

The entire passenger brain is two predicates evaluated against the train's **next stop**:

| ID | Requirement |
|----|-------------|
| TRN-04 | **Board** (`wantsToBoard`): a waiting passenger boards iff `dist(shape, nextStop) < dist(shape, here)` — the ride must make strict progress. Waiters are scanned in queue order, so boarding is FIFO among willing passengers. Unreachable targets (`∞ < ∞` false) never board. |
| TRN-05 | **Alight** (`wantsToAlight`): a rider gets off iff the current station matches their shape (delivered: `score + 1`, a pulse effect in the line's color) or `dist(shape, nextStop) ≥ dist(shape, here)` — staying aboard would stop making progress. Non-delivered alighters rejoin `station.waiting` (a transfer) and count toward overcrowding. This single rule produces all transfer behavior; there is no explicit trip plan. |
| TRN-06 | A rider whose destination becomes unreachable mid-ride (network edit) alights at the next stop (`∞ ≥ ∞`) and waits there. |

## Train kinematics

| ID | Requirement |
|----|-------------|
| TRN-07 | Trains move along the line's cached path by arc length at 75 units/s (`TRAIN_SPEED`), state `moving` ⇄ `dwell`. Each step finds the next station node ahead (`nodeS`, direction-aware, epsilon 1e-6); if the step reaches it the train arrives (snaps exactly to the node), otherwise it advances and clamps (open lines) or wraps modulo path length (loops). |
| TRN-08 | <a name="dwell--passenger-exchange"></a>**Arrival and dwell:** arrival enters `dwell` with `dwellLeft = 0.5 s` (`DWELL_BASE`). While dwelling, one passenger is exchanged per exchange tick of 0.35 s (`EXCHANGE_TIME`), **halved at interchanges**. Alights are processed before boards (first willing alighter, else first willing boarder, one per tick); each exchange extends `dwellLeft` to at least one more tick. The train departs when the dwell expires with no exchange pending. |
| TRN-09 | At an open line's terminus, arrival reverses `dir`; loops never reverse. A dwelling train whose station was removed from the line resumes `moving` defensively. |
| TRN-10 | Capacity = `6 × (1 + carriages)` (`TRAIN_BASE_CAP`), max 4 carriages (`MAX_CARRIAGES`). Boarding is refused at capacity but alighting always proceeds. |

## Hardware deployment

| ID | Requirement |
|----|-------------|
| TRN-11 | Line creation auto-deploys one locomotive when stock permits, at the path start heading forward ([NET-10](04-network-editing.md#edit-operations)). |
| TRN-12 | `addTrainToLine(lineId, nearPos?)` (inventory drop): rejects without stock ("No locomotives available") or on an unknown/degenerate line; enters service at the nearest point of the path to the drop, heading toward the longer remaining side; on loops, always forward. |
| TRN-13 | `addCarriageToLine(lineId)`: attaches to that line's train with the *fewest* carriages (balancing multi-train lines); rejects when stock is 0, the line has no train, or the target is at 4 ("Carriages maxed"). |
| TRN-14 | Hardware conservation: locomotives and carriages exist either in inventory or on exactly one line; deletion refunds everything ([NET-14](04-network-editing.md#edit-operations)), and a picked-up train (TRN-15) likewise returns to inventory. Total hardware never decreases. |
| TRN-15 | `pickUpTrain(lineId, trainId)`: removes a deployed train from its line and returns its locomotive (+1) and all attached carriages (+N) to inventory; onboard passengers offload to the nearest station of the old route, exactly like line deletion ([NET-14](04-network-editing.md#edit-operations)). Routing is unaffected (a train carries no topology). The subsequent re-deploy reuses `addTrainToLine` ([TRN-12](#hardware-deployment)) for the locomotive and `addCarriageToLine` ([TRN-13](#hardware-deployment)) semantics for re-attaching carriages, so a re-deployed train behaves identically to a fresh inventory drop. Pickup is a paused-only player action ([GD-43](01-game-design.md#trains--carriages)) and performs no RNG, so it is fully deterministic. The re-deploy target must be a line **other than** the source: a same-line re-deploy is rejected as a no-op (no hardware moves, conservation untouched) — see [GD-44](01-game-design.md#trains--carriages) / [INP-20](07-interaction.md#inventory-drags). |

## Passenger lifecycle (cross-reference)

Spawn ([WLD-12](03-world-generation.md#passenger-spawning)) → wait FIFO → board (TRN-04) →
ride (possibly several legs with transfers, TRN-05) → delivered (+1 score) — or offloaded by a
line deletion ([NET-14](04-network-editing.md#edit-operations)) back into a waiting queue.
Passengers are never destroyed except by delivery; conservation is a test invariant.

## Verification

`trains.test.ts` (kinematics, terminus reversal, loop wrap, dwell/exchange ordering and
timing, capacity, carriage targeting, drop direction), `routing.test.ts` (BFS fields, loop
closure edges, transfers emerging from the two predicates, unreachable handling). The sim
integration test in `sim.test.ts` runs a scripted network for several sim-minutes and asserts
deliveries occur and passengers are conserved. Manual: `?demo&seed=1&ff=60` shows a working
two-line network with transfers at the shared station.
