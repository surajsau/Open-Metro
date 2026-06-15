---
id: PRD-01
title: Game Design — Rules of Play
status: shipped-v1
owner: surajsau
verified: 2026-06-11
sources: [docs/superpowers/specs/2026-06-10-mini-metro-clone-design.md]
related: [02-game-engine.md, 03-world-generation.md, 04-network-editing.md, 05-transit-simulation.md]
---

# Game Design — Rules of Play

This is the player-facing ruleset, written code-agnostically. Component PRDs (02–08) restate
these rules as implementation requirements; where a number appears here, the authoritative
constant is named in the component PRD.

## Core loop

Connect stations into lines → trains automatically carry passengers toward stations matching
their shape → demand grows faster than your network → spend weekly rewards and redesign lines
to keep every station below its overcrowding limit. Score = passengers delivered.

| ID | Rule |
|----|------|
| GD-01 | A run starts with 4 stations (2 circles, 1 triangle, 1 square) near the map center, 3 unlocked line slots, 4 locomotives, 0 carriages, 0 interchanges, and the city's starting tunnels. |
| GD-02 | The run ends (Normal mode) when any station's overcrowding gauge fills completely. Final score is total passengers delivered; weeks survived are shown alongside. |
| GD-03 | In Endless mode the gauge still fills and saturates for visual pressure, but never ends the run; the player ends it manually with **End run**. |

## Time

| ID | Rule |
|----|------|
| GD-04 | One in-game day lasts 20 real seconds at 1× speed. Weeks run MON→SUN; the HUD clock hand makes one revolution per day. |
| GD-05 | Speed controls: pause / 1× / 2×. Unpausing restores the last non-zero speed. |
| GD-06 | While paused, the sim clock freezes but line editing remains fully available ("plan calmly while paused"). |
| GD-07 | The sim also freezes while a weekly reward modal is open and after game over. |

## Shapes

| ID | Rule |
|----|------|
| GD-08 | Seven shapes exist. Common: circle, triangle, square. Rare: cross, diamond, pentagon, star. |
| GD-09 | New stations draw from the common shapes with weights circle 5 / triangle 3 / square 2, damped for shapes already plentiful on the map so no shape dominates. |
| GD-10 | From day 4 onward, each station spawn has a 12% chance to be a rare shape instead, chosen uniformly among rare shapes with fewer than 2 stations on the map. |
| GD-11 | A passenger's destination shape is drawn from weights circle 4 / triangle 3 / square 2.5 / each rare 1.25, restricted to shapes that exist as at least one station, excluding the origin station's own shape. |

## Stations & overcrowding

| ID | Rule |
|----|------|
| GD-12 | Station capacity is 6 waiting passengers; an interchange holds 12. |
| GD-13 | While waiting count *exceeds* capacity, the station's gauge fills linearly over 55 s; at or under capacity it drains over 22 s. A full gauge ends a Normal run. |
| GD-14 | The gauge renders as a clockwise pie sweep around the station starting at 12 o'clock — the only "timer" UI in the game. |
| GD-15 | An interchange is created by dragging the interchange inventory item onto any non-interchange station. It doubles capacity and halves per-passenger exchange time. The upgrade is permanent for the run. |

## Lines

| ID | Rule |
|----|------|
| GD-16 | Seven line slots exist, identified by a fixed color palette (red, blue, yellow, green, purple, brown, cyan). A run starts with 3 unlocked. |
| GD-17 | A line is an ordered chain of ≥2 distinct stations, drawn octilinearly (45° diagonal then axis-aligned run per leg). It may close into a loop if it has ≥3 stations. |
| GD-18 | Player edits: create (drag station→station(s)); extend from either terminus (multi-station per drag; hovering back over the previous station undoes the last addition); retract a terminus back along the line; insert a station by grabbing a mid-line leg and dropping it on an unused station; remove a mid-line station by selecting the line (via its chip) and dragging the station off the path; delete via the selected chip's ⨯ button. |
| GD-19 | Retracting or removing a line down to fewer than 2 stations deletes the line and refunds its slot and hardware. |
| GD-20 | A loop is formed by dragging one terminus onto the other (≥3 stations). Removing a station from a 3-station loop breaks it into an open 2-station line. Otherwise loops are reshaped only by deletion (v1 limitation). |
| GD-21 | Deleting a line returns its locomotives and carriages to inventory and offloads onboard passengers at the nearest station of the old route (they rejoin waiting crowds and count toward crowding). |
| GD-22 | Invalid edits never partially apply: the preview turns red during the drag, releasing does not commit, and a toast states the reason (e.g. "No tunnels available", "No lines available"). |

## Tunnels & water

| ID | Rule |
|----|------|
| GD-23 | Each city has water (rivers/coast/inlets). A leg's tunnel cost equals the number of separate water bands it passes through — one crossing, one tunnel, per contiguous water span. |
| GD-24 | Total tunnel usage across all lines must never exceed tunnels owned. Usage is recomputed from the live network on every edit, so shortening or deleting lines refunds tunnels automatically. |
| GD-25 | The inventory bar shows tunnels as `free/owned`. |

## Trains & carriages

| ID | Rule |
|----|------|
| GD-26 | Creating a line auto-deploys one locomotive if any are in stock. More locomotives can be drag-dropped onto a line, entering service near the drop point heading toward the longer remaining stretch. |
| GD-27 | A train holds 6 passengers, +6 per attached carriage, max 4 carriages. A dropped carriage attaches to the target line's train with the fewest carriages. |
| GD-28 | Trains run at constant speed (75 world-units/s), dwell at stations to exchange passengers one at a time (alighting before boarding), reverse at the termini of open lines, and circulate endlessly around loops. |
| GD-29 | Hardware is never destroyed: line deletion refunds locomotives and carriages to inventory. Moving a deployed train between lines directly is out of scope for v1. |

## Passengers & routing

| ID | Rule |
|----|------|
| GD-30 | Passengers spawn at stations over time and want to reach *any* station of their shape. |
| GD-31 | A passenger boards a train only if the train's next stop strictly reduces their network distance (in stops) to the nearest station of their shape. Waiting passengers board FIFO among those who want the train. |
| GD-32 | A passenger alights when the current station matches their shape (scoring +1, with a colored pulse effect) or when staying aboard would stop making progress — which is how transfers happen naturally at junction stations. Transferring passengers rejoin the waiting crowd and count toward overcrowding. |
| GD-33 | Passengers with no useful connection wait indefinitely and keep crowding their station — disconnected demand is the core threat. |

## Rewards & progression

| ID | Rule |
|----|------|
| GD-34 | At the end of every Sunday the game pauses and a reward modal opens: **+1 locomotive always**, plus a choice of one of two distinct upgrades drawn from a weighted pool — New line ×2 (only while slots < 7), +2 tunnels ×3, carriage ×2, interchange ×2. |
| GD-35 | Independently of reward choices, a new line slot unlocks for free at the end of every week until 5 slots are open, then at the end of every *even-numbered* week, capped at 7. The modal announces it ("New line unlocked!"). |

## Difficulty

| ID | Rule |
|----|------|
| GD-36 | Three cities set the stage: **London** (1 river, 4 starting tunnels, gentlest pacing — difficulty ●○○), **Mumbai** (coast + harbour inlet, 3 tunnels — ●●○), **Tokyo** (2 rivers cutting 3 strips, 3 tunnels, fastest pacing — ●●●). |
| GD-37 | Station and passenger spawn intervals shrink day by day per the city's ramp, toward a floor. The playable area also grows outward from the center over the first weeks. Station base interval is 20–32 s; passenger base interval is 7–14 s — both tighter than in earlier builds to increase pressure for experienced players while remaining solvable through good topology. |
| GD-38 | Adaptive pressure: when stations are drowning, passenger spawns slow by up to 1.75×; when the network is cruising, they tighten to 0.75× — the run stays tense without becoming unwinnable luck. |

## Scoring & meta

| ID | Rule |
|----|------|
| GD-39 | Score = passengers delivered to a matching station. Nothing else scores. |
| GD-40 | The best score per city persists across sessions (localStorage) and shows on the city cards and the game-over screen. Any way a run ends — overcrowding, End run, restarting, or leaving to the menu — counts toward best. Normal and Endless runs compete on the same per-city best. |
| GD-41 | Game over offers **Play again** (same city and mode, fresh map) and **Change city** (back to the start screen). |

## Controls summary

| Gesture | Effect |
|---------|--------|
| Drag station → station(s) | Create a line (chain multiple stations in one drag) |
| Drag a line's tail cap | Extend or retract that end; drop on the far terminus to close a loop |
| Drag a mid-line leg onto a free station | Insert the station into that leg |
| Click a line chip, then drag one of its mid-line stations off the path | Remove the station (line heals around it) |
| Selected chip's ⨯ | Delete the line |
| Drag from inventory bar | Locomotive/carriage → onto a line; interchange → onto a station |
| Esc | Cancel the current drag |
| Click empty canvas | Clear line selection |
| HUD buttons | Pause / 1× / 2× |

Full gesture mechanics: [Interaction PRD](07-interaction.md).
