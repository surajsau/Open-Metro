# Open Metro — Product Requirements Documents

This directory is the **spec of record** for Open Metro (the `mini-metro` repo): a local-only,
original fan remake of the Mini Metro game loop, built with React + TypeScript + Vite and a
Canvas 2D renderer.

These PRDs are **as-built**: they were written against the shipped v1 code and verified against
the sources on **2026-06-11**. From here on, behavior changes should land as a PRD edit first
(or alongside the code change), so the documents stay authoritative.

## Document map

| # | Document | ID prefix | Covers | Primary sources |
|---|----------|-----------|--------|-----------------|
| 00 | [Product Overview](00-product-overview.md) | `PRD` | Vision, pillars, constraints, success criteria, roadmap | — |
| 01 | [Game Design](01-game-design.md) | `GD` | The complete player-facing ruleset, code-agnostic | design history (local `docs/superpowers/`, untracked) |
| 02 | [Game Engine](02-game-engine.md) | `ENG` | State model, sim loop, time, determinism, error model | `src/game/state.ts`, `src/game/sim.ts`, `src/game/rng.ts`, `src/game/types.ts` |
| 03 | [World Generation & Difficulty](03-world-generation.md) | `WLD` | Cities, station/passenger spawning, adaptive pressure | `src/game/cities.ts`, `src/game/spawn.ts`, `src/game/sim.ts` |
| 04 | [Network Editing](04-network-editing.md) | `NET` | Lines, octilinear geometry, edits, tunnel accounting | `src/game/lines.ts`, `src/game/geometry.ts`, `src/game/river.ts` |
| 05 | [Transit Simulation](05-transit-simulation.md) | `TRN` | Trains, dwell/exchange FSM, routing, boarding rules | `src/game/trains.ts`, `src/game/routing.ts` |
| 06 | [Rendering](06-rendering.md) | `RDR` | Viewport, draw pass, visual constants, effects | `src/render/` |
| 07 | [Interaction](07-interaction.md) | `INP` | Pointer state machine, hit-testing, drag gestures | `src/input/` |
| 08 | [UI Shell & App State](08-ui-shell.md) | `UI` | Store/snapshot, HUD, modals, persistence, game modes | `src/store.ts`, `src/ui/`, `src/App.tsx`, `src/main.tsx` |
| 09 | [Engineering Standards](09-engineering-standards.md) | `QA` | Testing strategy, dev URL params, build, conventions | `src/**/__tests__/`, `package.json` |

Reading order for newcomers: **00 → 01**, then whichever component you are touching.
01 describes *what the game is*; 02–08 describe *how each component must behave*; 09 describes
*how we work on it*.

## Format and conventions

- **Markdown + YAML frontmatter.** Each PRD is a Markdown file with a YAML frontmatter block
  (`id`, `status`, `sources`, `related`, `verified`). GitHub renders the frontmatter as a
  metadata table and the body as a normal document, which keeps the PRDs readable both in the
  repo and from wiki links. Pure-YAML specs were rejected because GitHub renders them as code,
  not documents.
- **Requirement IDs.** Every normative statement has a stable ID like `GD-12` or `ENG-04`,
  unique within its document and never reused after deletion (retire IDs, don't renumber).
  Cite them as `GD-12` in issues, commits, wiki pages, and code comments.
- **RFC-2119-ish language.** "Must" = implemented, load-bearing behavior. "Should" = intended
  but tolerant. Numbers in requirement text are the shipped tuning values; the matching
  constant name from `src/game/constants.ts` is given where one exists.
- **Code is ground truth.** If a PRD and the code disagree, the code wins until the PRD is
  corrected — file the discrepancy rather than silently trusting either.

## Linking from the GitHub wiki

Wiki pages live in a separate Git repo, so **relative links into `docs/` do not work from the
wiki** — always use absolute repo URLs:

```
https://github.com/surajsau/Open-Metro/blob/main/docs/prd/01-game-design.md
https://github.com/surajsau/Open-Metro/blob/main/docs/prd/01-game-design.md#tunnels--water
https://github.com/surajsau/Open-Metro/blob/main/docs/prd/05-transit-simulation.md#boarding-and-alighting
```

Anchor rule: GitHub slugifies headings — lowercase, spaces become `-`, punctuation is dropped
(`### Tunnels & water` → `#tunnels--water`). Heading text in these PRDs is therefore treated as
a stable API: prefer adding new headings over renaming existing ones.

Links **between PRDs** (inside this directory) are relative (`[Game Engine](02-game-engine.md)`)
so they work in repo browsing, IDE previews, and clones.

These pages are also mirrored to the [project wiki](https://github.com/surajsau/Open-Metro/wiki)
automatically: on every push to `main` touching `docs/prd/`,
[`wiki-sync.yml`](https://github.com/surajsau/Open-Metro/blob/main/.github/workflows/wiki-sync.yml)
regenerates the wiki from this directory via
[`scripts/sync-wiki.mjs`](https://github.com/surajsau/Open-Metro/blob/main/scripts/sync-wiki.mjs).
Edits made directly in the wiki are overwritten on the next sync.

## Status board

| Document | Status |
|----------|--------|
| 00 Product Overview | shipped-v1 |
| 01 Game Design | shipped-v1 |
| 02 Game Engine | shipped-v1 |
| 03 World Generation & Difficulty | shipped-v1 |
| 04 Network Editing | shipped-v1 |
| 05 Transit Simulation | shipped-v1 |
| 06 Rendering | shipped-v1 |
| 07 Interaction | shipped-v1 |
| 08 UI Shell & App State | shipped-v1 |
| 09 Engineering Standards | shipped-v1 |

`shipped-v1` = describes behavior present in the current build. A future feature PRD enters as
`draft`, becomes `accepted` when agreed, and `shipped-vN` once merged and verified.
