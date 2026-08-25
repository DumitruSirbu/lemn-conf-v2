# ADR 0017 — A catalogue entry may declare a minimum width; `base-sink`'s is 560 mm

Status: Accepted
Date: 2026-08-25
Type: Finding + Decision
Milestone: M3 Wave 3B — found by adversarial QA, fixed in the domain

## Context

`DEVELOPMENT-SPEC.md` §7 gives `base-sink` (*Corp spălător*) `w: 'fit'` and the standard width chip
set `[400, 600, 800]`. Wave 3B's probe made it measurable for the first time, and it does not build
at those widths.

`make.baseCabinet(w, { sink: true })` splits its worktop around a **fixed 560 mm sink aperture**
(`kitchen-parts.ts`, `ax = 0.28`). The two `countertop_side` fillers are `w / 2 − 0.28` wide, which
goes negative below 560 mm; a negative-width box inverts outward instead of vanishing. Measured
through `measureBuiltBody` at a requested height of 860 mm:

| requested | carcass w | carcass h |
| --- | --- | --- |
| 400 mm | **523.0 mm** | **913.3 mm** |
| 450 mm | 534.6 mm | 896.7 mm |
| 500 mm | 546.1 mm | 880.0 mm |
| 540 mm | 555.4 mm | 866.7 mm |
| 560 mm | 560.0 mm | 860.0 mm |
| 600, 800 mm | exact | exact |

The carcass gets **taller** as it gets narrower, because the inverted fillers escape the worktop
plane. Wave 3A's `refuseBuiltSize` catches this and refuses with `BUILT_SIZE_MISMATCH` — the guard
works. The problem is the other end: `base-sink` is `widthFlex: 'fit'`, and the only floor
`resolveWidth` applies is `MIN_WIDTH_M` (300 mm), so **`offersFor` offers a sink into any base
opening from 300 mm up and the engine then refuses it**, and `sizesMm` lists 400 as a width chip M4
will render.

That violates the cross-cutting rule in `docs/milestones/README.md` — "Never offer what cannot be
satisfied. Disabled-with-reason beats warn-after-click" — and it is the third route this project has
found to the "a row is offered and then silently does nothing" failure §5.3 and M3's Risks section
name.

There is a subtler reason not to lean on the existing guard. At 550 mm the inverted fillers put the
measured carcass at 560 mm — 10 mm from the request, **inside** `FIT_TOLERANCE_M` (12 mm). So the
built-size gate *accepts* a body whose worktop geometry is inverted. Manufacturing slack was never
meant to forgive broken geometry, and a threshold that depends on the tolerance happening to be
wider than the error is not a threshold.

## Decision

1. **`BodyDefinition` gains an optional `minWidthMm`** — the narrowest width this body's builder can
   actually produce. Absent means `MIN_WIDTH_M` (§2's 300 mm) governs, which is every other entry.
2. **`base-sink` declares `minWidthMm: 560`**, the aperture's own width, and its `sizesMm` becomes
   `[600, 800]`. 400 is removed: it is not a width this body has.
3. **Both ends read it.** `resolveWidth` refuses below it with the millimetres in `params`, and
   §9's offer filter drops the entry for openings under it. One fact, two callers — the same shape
   §5.2 and §9 already share through `evaluateInsertFit`, and the reason the fit evaluation was
   split out in Wave 3A in the first place.

560 rather than 550: 560 is the width at which the geometry is *correct*, not merely within
tolerance.

## Alternatives considered

1. **Parameterise the sink aperture in `kitchen-parts.ts`** so the insert scales with the carcass.
   This is the root-cause fix and would keep §7's chip set true. Rejected for now: §7 itself defers
   this ("Not yet parameterised (production work)"), M3's Risks section forbids faking it by scaling
   a finished group, and it is geometry work on M1's ported kit, whose fidelity is one of the two
   items the milestone plan marks exempt from being reduced. Recorded here as the better long-term
   fix, owned by whichever phase parameterises the hob and the corners.
2. **Leave it and let M4 disable the row.** Rejected: §12's "no product logic in components" puts
   the rule in the engine, and a rule the panel owns alone is a rule a second caller forgets — which
   is the reasoning already written into `insert-fit.ts`'s `refuseShortOpening`.
3. **Rely on `refuseBuiltSize` alone.** Rejected: it accepts the inverted 550 mm case, and a refusal
   the customer sees after choosing is the behaviour the cross-cutting rule exists to prevent.

## Consequences

- Wave 3A's shipped domain is reopened for a narrow, additive change. It gets its own adversarial QA
  and review round; it is not folded into Wave 3B's.
- `base-sink` is no longer offered for base openings of 300–559 mm. Those openings offer the other
  five base bodies, all of which build correctly at 400 mm.
- The general mechanism is now available for any future entry whose builder has a floor. It must not
  become a dumping ground for builder limitations that ought to be fixed: an entry that declares a
  `minWidthMm` is admitting its builder is not parameterised, and alternative 1 stays the real fix.
- §7's chip set for `base-sink` and this record now disagree. The spec is the behavioural contract
  and this is a dated decision, so per `docs/decisions/README.md` the decision governs; §7's table
  should be annotated when it is next revised.
