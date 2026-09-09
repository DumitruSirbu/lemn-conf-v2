# ADR 0028 — Wall and top carcass depth is derived from one declared worktop depth

Status: Accepted (naming superseded) (decision 5's consequence clause struck 2026-09-07 -> [0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md); the rule itself is confirmed)
Date: 2026-08-27
Type: Decision + Finding
Milestone: M5 wave 5A — the worktop → wall depth map

> **Superseded in part by [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md).**
> `WORKTOP_DEPTH_MM`, and the map read as a carcass depth, are wrong names — ADR 0036 restates the
> setting as *cabinet* depth. The mechanism here (a declaration, not a computation) is untouched.

## Context

A defect was reported from a real handset: delete a top-row cabinet in the shipped kitchen, insert
one back, and it returns **400 mm** deep against neighbours that are **330 mm**. The protrusion is
visible on the device.

The seeded kitchen was not wrong. Nine wall and top rows in `fixtures/kitchen-l-design.ts` record
`frameDepthMm: 330`, and three more are deliberately not 330 — `hood-600` at 500, and
`wall-2door-600-deep-top` and `wall-2door-700-over-fridge` at 600, the deep cabinets over the
columns. What was wrong was that **two independent constants happened to agree at 400**:

- `catalog.ts`'s `WALL_DEPTH_MM`, the `nominalDepthMm` of every §7 wall entry, and therefore the
  `frameDepthMm` fallback a placement with no measured `seatDepthMm` reads (`void-engine.ts`).
- `insert-fit.ts`'s `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`, §5.2's head-clearance cap, which is
  what `resolveDepthM` actually caps against and therefore what decides the built carcass.

`resolveDepthM` returns `min(opening.d, cap)` and never reads `nominalDepthMm` at all. `opening.d`
is `Column.d`, §3.2's MAX over the run — 580 over a base run — so `min(0.58, 0.4) = 0.4`, and 400 mm
is what got built. Per ADR 0018 the depth argument reaches a real carcass: `wallCabinet` and
`openShelf` are the builders that consume it.

**The unlinked pair is the root cause, not the number.** No gate compared the nominal, the cap and
the fixture, which is precisely how the seeded design could be authored at 330 with every suite
green. Two precisions that a fix must not blur: changing `WALL_DEPTH_MM` alone fixes nothing, since
`resolveDepthM` does not read it; and changing the cap alone does fix the visible symptom. The
single source is therefore justified by **drift prevention**, which is the actual defect, not by the
symptom needing both numbers moved.

This is the unfinished half of backlog entry 5. Its earlier wave shipped the design-dependent half
of the rule — the cap is lifted over a full-height column, `Column.hasFullHeightUnder` re-answered
on every derivation — and did not link the cap to anything.

## Decision

**One declared worktop depth, and wall/top carcass depth derived from it through a map.**

1. `WORKTOP_DEPTH_MM = 600` is a single exported constant in `worktop-depth.ts`, at the top level as
   configurable data. Nothing persists it and nothing sets it: `DesignSchema` gains no field, no
   version bump, no migration, no store action, no command signature, no control. M5 therefore never
   holds two worktop depths at once, and never meets the question of what happens when one changes.
2. Wall and top depth follows the worktop through an **extensible map**: `600 -> 330`, `700 -> 400`.
   A third size is one row. `800 -> 500` is named as a plausible future row and is **not** a
   commitment, so it is not written down.
3. **The map is the single source for both numbers.** `WALL_DEPTH_MM` and
   `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M` both read the same row, so they cannot drift apart again.
   The falsifiable form: there is exactly one 330 in the source, and a test reads the map and asserts
   both equal `map[WORKTOP_DEPTH_MM]`.
4. **The map is a declaration, not a computation.** No interpolation, no rounding, no nearest-row
   fallback, no silent default. A worktop depth with no row throws `UnknownWorktopDepthError`, naming
   the value it was given.
5. **The map governs the head-clearance rule and nothing else.** `hasFullHeightUnder: true` still
   lifts the cap, ~~which is what keeps the two deep top cabinets at 600 over their columns~~. The hood
   is untouched at 500, and whether a hood follows the worktop stays open.

   **The struck clause is superseded 2026-09-07 —
   [ADR 0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md)
   decision 5.** The rule itself is confirmed and is untouched: the lift stands, and it is the
   mechanism the deep tops' fix uses. What is false is the consequence — the lifted arm returns the
   **cabinet-depth line**, which is 700 at a 700 mm kitchen, and it is [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md)'s
   **pin**, not this lift, that holds those cabinets at 600. True when written, when 600 was the only
   cabinet depth the product had. `cabinet-depth-rule.ts`'s comment above `columnBuildDepthMm` quotes
   this clause verbatim and is a work item of the wave ADR 0101 rules.

### Why a map and not a formula

`600 -> 330` and `700 -> 400` sits almost on a line, and the next reader will be tempted to write
`worktop × 0.55` or to interpolate a missing row. Wall cabinets come in **manufactured sizes**
(300 / 330 / 350 / 400) and the owner's own numbers are non-linear: 100 mm of worktop buys 70 mm of
wall. A formula would invent a 372 mm cabinet nobody makes. This is why an unknown worktop depth
fails rather than computing something.

Base carcass depth is the opposite case and is a **formula** — worktop depth minus a fixed overhang —
because it scales continuously. It is deliberately not in this wave: it is the only part of M5 that
changes a builder and so the only part that can reach M1's 1e-6 m fidelity gate.

## The two depth fields must agree — a finding this wave met twice

`insertableBody` stamps `frameDepthMm` from the shape's `nominalDepthMm`. An entry built by
spreading a helper and then overriding **only** the nominal leaves `frameDepthMm` behind at the
helper's number. Two entries had this shape:

- **`hood`** spreads `wallCabinet(...)`, so its `frameDepthMm` was the map-governed `WALL_DEPTH_MM`
  while its nominal said 500. The two had always disagreed (400 against 500) and this wave silently
  moved the inherited field to 330 — touching the hood, which the wave was explicitly told not to do.
  Found by adversarial QA. The wave's own "leaves the hood's 500 mm alone" assertion checked
  `nominalDepthMm` and so could not see it.
- **`fridge-free`** spreads `fullHeightUnit(...)`, so its `frameDepthMm` was `COLUMN_DEPTH_MM` (560)
  against a 680 nominal — a 120 mm disagreement, latent and unrelated to the map. Found by logic
  review.

It matters because `void-engine.ts` takes `frameDepthMm` as the fallback for a placement with no
measured `seatDepthMm` — optional in `DesignSchema`, so such a design validates — and a frame depth
that is not the body's own depth seats its back face off the wall plane (§11 row 19). Both were
inert through the UI, because `insertBody` always records a measured seat. **That is exactly what let
both survive**, and why neither was caught by a behavioural test.

Both entries now declare `frameDepthMm` explicitly, and the class is closed by a catalogue-wide gate:
every insertable entry's `frameDepthMm` equals its own `nominalDepthMm`, swept across the whole
catalogue so a third instance cannot be introduced by the same spread-and-override shape.

## Alternatives considered

- **Move the cap alone to 330.** Fixes the reported symptom and leaves the root cause in place: two
  constants, nothing comparing them, free to drift again. Rejected — the defect is the unlinked pair.
- **Move `WALL_DEPTH_MM` alone.** Fixes nothing. `resolveDepthM` does not read it.
- **A formula instead of a map.** Rejected on the owner's numbers; see above.
- **Apply the map to every wall body.** Rejected: it flattens the two deliberately deep top cabinets
  to 330 and reintroduces backlog 5's defect in the opposite direction.
- **Fix the shared root cause in `insertableBody`** rather than declaring the field on the two
  entries. Rejected: it would move `fridge-free`'s fallback depth as a side effect of a refactor,
  which is a product change nobody had decided. The per-entry declaration plus the class-wide gate
  gets the same protection without one.
- **Export the map lookup from the package barrel.** Rejected on review: a public
  `wallDepthMmForWorktop` invites a second caller to derive a wall depth from a worktop that is not
  `WORKTOP_DEPTH_MM` — a fresh way for two numbers to disagree, which is the defect this closes.
  Only `WORKTOP_DEPTH_MM` and the error type are exported.

## Consequences

- **The fix is not retroactive, by design.** `seatDepthMm` is persisted and this wave adds no
  migration, so a body inserted before it reloads at its saved 400 mm. The owner's saved kitchen
  still shows the protrusion until that body is deleted and re-inserted. Every new insert and every
  swap is correct. "Fixed" must not be read as "the saved kitchen repairs itself".
- **The seeded fixture is a third copy of 330, and is now checked — against the right authority.**
  The fixture reproduces `buildKitchen()`'s hardcoded placement (ADR 0025) and is already gated
  against the vendored reference room by `kitchen-parts.decomposition.parity.test.ts` at 1e-6 m.
  Asserting that those rows follow the *map* would put the fixture under two authorities that
  contradict each other the moment the worktop moves. The rows are asserted against the reference
  room's own depth, and the coincidence between that and the map's 600 row is asserted once,
  separately.
- **Depth assertions must run against the real builders and the real `BodyProbe`.** Backlog entry 9:
  a fake probe reports back the depth it was handed, so a domain test with a fake probe cannot see a
  depth defect at all. The reproduction of the reported defect lives in `packages/three-adapter`
  for this reason.
- **M6's swap is one line**, and the M5/M6 seam holds: M5 owns the geometry, M6 owns the *Setări
  globale* control. When that control lands, the load-time throw stops being unreachable — the
  setting must be validated and refused at its boundary, with a `RejectionDetail`, rather than
  throwing during module evaluation and taking the panel, the offers list and the scene down
  together. Recorded here because it is M6's to answer, along with the migration question a persisted
  worktop depth raises.
- **Backlog entry 10 is unchanged and still open**: delete-then-insert and swap still diverge over a
  **column** (600 against 680), where the cap is lifted. This wave closes the same divergence over a
  base run only.
- Source prose that stated the rule as `min(d, 0.4)` now states it by name rather than by value, so
  amending the map does not leave comments asserting a stale number.
