# ADR 0050 — The hob+oven filler panel is a finishable front

Status: Accepted
Date: 2026-09-01
Type: Decision
Milestone: M5B — Manual UX remediation, wave 5B6

## Context

QA raised **Q6** against wave 5B6, which added a fixed facade panel across the 125 mm band between
the oven's top face and the worktop, closing the gap `hobBaseWithOven` left open
(`packages/three-adapter/src/kitchen-parts.ts:839-848`). The panel was built in the door material,
`M.door`, named `oven_filler_front`, on `base-hob-oven` — an entry declaring `canFinish: false`.

Two live consequences, both measured:

- The panel stayed **default white** beside neighbours the customer can set to sage, clay or
  graphite. The owner had asked for the cavity filled *"with the same material/color as the rest of
  the run"*, and the default door material is only the same colour as a chosen finish by coincidence.
- Flipping `canFinish` to `true` alone would not have fixed it. `finishes.ts`'s `FRONT_MESH_NAME` is
  `/door_front|drawer_front/`, which `oven_filler_front` does not match, so `collectFronts` returned
  `[]` regardless of the flag.

It also **falsified the recorded justification** at `catalog.ts:465` (see *Records swept before
deciding*): `base-hob-oven` turned finishing off on the stated ground that the body *"is deliberately
open-front — the oven **is** the front — so it owns no `door_front`"*. That was true when
[ADR 0027](0027-the-hob-is-part-of-the-cabinet.md) recorded it, because the body had no fixed panel at
all. Wave 5B6 built one. The ground no longer holds, and this record is the one that says so and
replaces it.

## Decision

**The filler panel is a finishable front.** `base-hob-oven` owns exactly one finishable mesh — the
fixed panel across the hob band — and a recorded finish recolours it the same way it recolours a door
elsewhere in the run.

1. **The mesh is renamed** `oven_filler_front` → `oven_filler_door_front`
   (`kitchen-parts.ts:873`, `catalog-bodies.ts`), which is what makes `finishes.ts`'s
   `FRONT_MESH_NAME = /door_front|drawer_front/` reach it. Widening the pattern instead was rejected —
   see *Alternatives considered*.
2. **`base-hob-oven` declares `canFinish: true`** (`catalog.ts`). `collectFronts` on
   `hobBaseWithOven(0.6)` now returns exactly `["oven_filler_door_front"]`, and each of the four solid
   finishes changes that mesh's material and colour.
3. **`canHandle` stays `false`.** The filler is a facade, not a leaf — nothing behind it opens — and
   the body's only bar belongs to the **oven**, so a cabinet-hardware handle chip would mutate an
   appliance. This half of ADR 0027's reasoning is untouched; only the front half is overturned.
4. **The catalogue comment is rewritten**, not silently reworded: it now states that the body owns
   one finishable front, names the mesh, and records that the ground changed because the panel now
   exists, rather than restating the old "oven is the front" claim as if it still applied.

## Alternatives considered

**Build the filler in the carcass material, so it is deliberately not a front.** This was the
"accept the current rule, change the geometry" option: the panel would visually close the cavity
without ever pretending to be a door. Rejected because it does not satisfy the owner's actual request
— *"same material/color as the rest of the run"* names the **door** material and colour, which a
carcass-coloured panel cannot give regardless of which finish the customer picks. It would also leave
`base-hob-oven` permanently mismatched against a customer who sets every other front in the kitchen to
sage or graphite: this one panel would stay carcass-toned forever.

**Accept the permanent default-white panel and close Q6 with no code change.** Rejected for the same
reason: it is not what was asked, and it directly contradicts the owner's stated request rather than
merely falling short of it. The finding that raised Q6 exists precisely because "default white by
coincidence" is not "the same colour as the run."

**Widen `FRONT_MESH_NAME` instead of renaming the mesh.** Considered as the mechanical alternative to
item 1. Rejected: `FRONT_MESH_NAME` is read everywhere `finishes.ts` collects fronts across the whole
catalogue, so loosening the pattern to catch `oven_filler_front` risks matching some future
non-front mesh with a similar name elsewhere in the port. Renaming one mesh to match an existing,
already-audited pattern is the narrower change and needs no new coverage of the pattern itself.

## Records swept before deciding, and how each is settled

The owner's standing instruction is to check whether an earlier record said the opposite or was
ambiguous before implementing a decision, and 5B1's lesson (`docs/STATUS.md`, *5B1's real lesson*) is
that the sweep must cover `docs/milestones/`, not only `docs/decisions/`, the spec and the backlog.
Swept: `docs/decisions/` (grep for `base-hob-oven`, `canFinish`, `oven_filler_front`, and the "oven is
the front" phrase), `docs/decisions/README.md`, `docs/milestones/`, `docs/BACKLOG.md`, and
`DEVELOPMENT-SPEC.md`.

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0027](0027-the-hob-is-part-of-the-cabinet.md), *"`base-hob-oven` declares `canFinish: false, canHandle: false`. It is open-front by design — the appliance *is* the front — so it owns no `door_front` and no cabinet handle."* | The body has no front to finish. | **Struck through in place, with a pointer to this record.** True when written — the body had no fixed panel. False now that wave 5B6 built one. The `canHandle: false` half of that sentence is unaffected and stands. |
| `catalog.ts:465` (pre-5B6 comment on `base-hob-oven`) | Restated ADR 0027's now-false ground verbatim. | **Rewritten by wave 5B6's implementation**, replaced with the Q6 finding and this record's decision. Verified by reading the current file — the comment no longer restates the false ground. |
| `packages/three-adapter/tests/catalog-capability-parity.test.ts` | Census asserted `base-hob-oven` at 0 fronts, `canFinish: false`. | **Re-pointed by 5B6's implementation** to 1 front, `canFinish: true` — a correction to a now-false recorded ground, not a weakening of the gate. |
| `packages/configurator-domain/tests/queries/hob-base.adversarial.test.ts:315` and `apps/web/tests/panel/hob-base.adversarial.test.ts` | Asserted no Finisaj section over `base-hob-oven`. | **Re-pointed** — the panel now renders a Finisaj section over the hob+oven variant. |
| `packages/three-adapter/tests/qa-5b6-5b7.adversarial.test.ts:205` (pre-correction) | Test comment quoted ADR 0027's "is deliberately open-front… owns no `door_front`" sentence as the ground for its own assertion. | **Corrected in this same pass** (now `:211-221`): the comment points at this record by number, states that ADR 0027's "deliberately open-front" ground was falsified and struck, and names the standing invariant the test enforces — any future body built in `M.door` while declaring `canFinish: false` lands in `offenders`. |
| `docs/BACKLOG.md` entry 11, *"the identical defect to `base-hob-oven`'s… before it was fixed in the same pass"* | Describes a **different**, earlier fix (the 2026-08-27 catalogue-capability-parity pass that corrected `fridge-free-700`, `open-shelf-600`, `hood-600`, `cooktop-600`), used as precedent for the still-open `base-dishwasher` decision. | **No correction needed.** It does not restate the "oven is the front" justification and does not claim `base-hob-oven` currently has `canFinish: false`; it is an accurate historical reference to a prior, unrelated fix. Checked and left as is. |
| `docs/decisions/README.md` | Index has no row for this decision; no Supersessions bullet for ADR 0027's front claim. | **Added** — index row for ADR 0050, and a Supersessions bullet pointing at ADR 0027's struck claim. |
| `docs/milestones/done/M5B-manual-ux-remediation.md`, `docs/STATUS.md` | Both describe Q6 as open and quote the mesh name `oven_filler_front` and the false justification while it was still unresolved. | **Corrected by the record maintainer** in the same pass as this ADR — Q6 moved to *Answered*, the wave marked complete, and both stale mesh-name references fixed. |
| `DEVELOPMENT-SPEC.md` | No mention of `base-hob-oven`, `oven_filler_front`, or a finish/front rule specific to this body found by grep. | **Nothing to correct.** The spec's general Finisaj/front rules (§9) are untouched by this record — they already say a body with a front shows the section; this decision only changes which mesh counts as that body's front. |
| `catalog.ts`'s `open-shelf` (~line 546) and `hood` (~line 556) entries — **missed by the original sweep, found afterwards by clean-code review.** Their `canFinish: false, canHandle: false` had no comment of their own; both leaned on `base-hob-oven`'s old comment closing with *"`open-shelf` and `hood` below declare the same two `false` for the same reason"*. When wave 5B6's implementer rewrote `base-hob-oven`'s justification for this record, that closing line was **deleted along with the paragraph it belonged to**, leaving both rows' flags bare — `open-shelf`'s neighbouring comment explains its *depth*, not its flags, and `hood` had no comment at all. | A dangling cross-reference, not a stale claim. | **Not a gap in this record's own decision — a gap in the sweep method.** The sweep grepped for phrases that would still be *true and present* if outdated (`canFinish`, `oven_filler_front`, "oven is the front"). A pointer that is deleted rather than falsified produces no such phrase to find; grepping the old ground's words cannot catch two rows whose only justification was "see the row above," once that row's justification changes shape. **Fixed in code, outside this record's scope**: `open-shelf` now says it is open by definition, with no fixed front to finish and no leaf to open, and notes wave 5B6 gave it no filler panel so ADR 0050 does not reach it; `hood` now says it is an appliance, not a cabinet, and that `handle: "push"` there would put cabinet hardware on an extractor. Domain suite 1094 green, lint clean. **The lesson, stated for the next sweep**: search for what a comment *points at*, not only for what it *says* — a rewrite that deletes the referent of "same as the row above" leaves no stale phrase behind, only a silence. |

No other hit outside the files named above was found by the sweep.

## Consequences

- `base-hob-oven`'s carcass owns one finishable front (`oven_filler_door_front`) and no handle. The
  panel now recolours with the rest of the run instead of standing permanently default white.
- M1's 1e-6 m structural-parity gate is unaffected: the seeded kitchen places `baseCabinet(0.6, {
  drawers: 2 })` under its hob, never `hobBaseWithOven`, so nothing seeded moves.
- `occupiedDepth` (`finishesAtMm(HOB_OVEN_BASE_FINISHED_DEPTH_MM)`, ADR 0040) is untouched — the panel
  is a finish surface, not a depth change, so 5B6's acceptance criterion 3 holds unmodified.
- `base-dishwasher`'s open-niche `canFinish`/`canHandle` question (`docs/BACKLOG.md` entry 11) is
  unaffected by this record: that body still has no fixed panel of any kind, so its situation is not
  analogous to `base-hob-oven`'s any more, and entry 11 stays open on its own terms.
