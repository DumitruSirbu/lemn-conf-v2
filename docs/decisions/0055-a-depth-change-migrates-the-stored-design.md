# ADR 0055 — A cabinet-depth change migrates the stored design, it is not re-derived on load

Status: Accepted (its 2026-09-03 amendment was withdrawn the same day — see the end)
Date: 2026-09-02
Type: Decision
Milestone: M6 — gates wave 6J, resolves the mechanism
[ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 handed forward

## Context

[ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 already decided the
**outcome** of a cabinet-depth change, in the owner's own words: *"we need to adapt all the depths of
the cabinets — the base, the middle, and the top ones. We need to compensate this 100 millimetres. So
automatically, we will make them deeper."* Every body adapts, with no confirmation step and nothing
left behind. Of the three shapes recorded against M5's *Not established* question 4 — migrate,
re-derive on load, refuse — **refuse was ruled out there**.

That ADR explicitly left **which mechanism delivers it** to M6, and named the tension the mechanism
has to resolve: [ADR 0018](0018-frame-depth-is-rear-overhang.md)'s *"the body's own measured seat"*.

M5 held one cabinet depth by construction, so nothing in that phase could meet the question. M6's
*Setări globale* control is the first thing in the product that can move it.

## Decision

**A depth change migrates the stored design at the moment the control moves. Depth is never
re-derived on load.**

1. The rewrite runs **through the normal command path**, not as a bespoke transform over the
   document. Every fit rule, every band gate and every width guard therefore fires on the rebuilt
   bodies exactly as it does for any other mutation, and the result is written by the ordinary save
   coalescer.
2. It carries a **schema version bump**. Unlike `emptyColumns` (ADR 0044) and `columnExtents`
   ([ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md)), whose absence is a valid
   unchanged state, a document written at one depth and read under another is not merely missing a
   field — it disagrees with the setting it carries.
3. `seatDepthMm` stays what ADR 0018 says it is: a number a probe measured on a body that was
   actually built. After a migration it is measured again, on the body rebuilt at the new depth.

### The reasoning the owner decided on, not only the outcome

Recorded because the question the owner asked was *what the actual challenge is*, and the answer is
the load-bearing part of this record:

- **Stored `seatDepthMm` is a fact, not a cache** (ADR 0018). It is `2 ×` a body's measured rear
  overhang, an encoding that exists so `deriveCabinetWorldTransform` can land any bounding box on the
  wall plane (§11 row 19).
- **Depth resolution is not one arithmetic rule.** It is at least three: a formula for a base
  carcass (wave 5F), the declared map for a capped wall carcass
  ([ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)), and the column itself over a
  full-height member. A load path that re-derived depth would have to re-run all three, in the right
  order, on every document it opened.
- **Re-derive-on-load would put a second depth authority beside `occupiedDepthM`** — precisely the
  arrangement [ADR 0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md) collapsed into
  one conversion, and the same class of defect ADR 0028 exists to prevent: two places answering one
  question and agreeing only by luck.

### An accepted consequence, recorded so it is not later read as an oversight

**600 → 700 → 600 is not guaranteed to return the exact original document.** If a body was resized
while the design stood at 700, the return trip rebuilds it from where it is then, not from where it
was before the first change. This is accepted: the alternative is retaining a pre-migration copy of
every document, which is a second source of truth for the same design and a larger problem than the
one it solves.

## Alternatives considered

- **Re-derive on load** — store only the setting and compute every depth when the document is
  opened. Rejected for the three reasons above. Its real attraction was avoiding a version bump and
  an irreversible rewrite, and both of those costs are ones this project already pays elsewhere: the
  version-keyed lookup in `migrate-design.ts` and the `schema_version` column on `designs` exist and
  are exercised.
- **Refuse the change while placements exist.** Already ruled out by ADR 0036 decision 5, and not
  reopened here.
- **Migrate lazily, on the next load after a change.** A hybrid, and the worst of both: the document
  is inconsistent with its own settings in the window between the two, which is exactly the state a
  `/d/{id}` share link would hand to a second person.

## Consequences

- Wave 6J owns the implementation and must land **after** wave 6I2, because a migration that writes
  depths derived from an arm nobody has decided is right would persist that arm's answers.
- A stored document is always self-consistent with its own settings, so a share link renders for the
  second reader exactly what the first saw.
- The migration is not reversible in the strict sense described above, and the M6 plan's depth-control
  criteria say so rather than implying a clean round trip.
- Pinned catalogue entries are excluded from the rewrite by construction — see
  [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md).

## Amendment — 2026-09-03: a depth change may remove a body when no other give remains — WITHDRAWN THE SAME DAY

> **Withdrawn on 2026-09-03, hours after it was drafted, by
> [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md).** The owner replaced the
> question rather than answering it: a body whose extent passes the end of its wall is **marked and
> warned about**, not removed and not narrowed. **So this ADR is _not_ amended — "every body adapts,
> nothing is left behind" remains literally true, because a marked body is still there** — and the
> "which body gets removed" decision this amendment deferred is not needed at all.
>
> **The text below is left visible and must not be implemented.** It is kept because the constraint
> it was written under was real, and because a future session proposing removal should be able to see
> that it was drafted, accepted for a few hours, and superseded by a better answer.

**This amends "nothing left behind", which the decision above states without qualification. Nothing
before this section is edited**, so the promise as originally made stays visible — it is what a
customer was going to be told, and the amendment is the price of a case that decision could not
have known about.

**Why it is needed.** A deeper kitchen consumes more wall at the corner, so a run lengthens. Where
the run would exceed the wall it stands on, the depth change cannot simply adapt every body: the
wall is a hard bound and something has to come out. M6 wave 6I surfaced it, and measurement then
found the shipped kitchen already overruns wall B by 400 mm at 600 mm — so the case is live, not
hypothetical.

**The decision, owner, 2026-09-03.** In order:

1. **Absorb it structurally first.** The corner return takes the delta — its left edge moves with the
   deeper run and its right edge holds, so its width falls out as `320 − delta`. **Nothing a customer
   chose is lost**: a corner return is structural
   ([ADR 0021](0021-corner-returns-are-structural-in-data.md)), carries no width chips and cannot be
   resized. This is the whole reason it is first.
2. **When that runs out, a body is removed** — and the customer is **told which body and why**, in
   the same interaction. Not silently, and not as a footnote to a number changing.
3. **Refusing the depth change is not the answer.** [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md)
   decision 5 ruled refusal out, and this amendment does not reopen it.

**What is deliberately not decided here: which body is removed.** That is a further decision and
inventing it would be exactly the silent product change this process exists to stop. Until it is
taken, no wave may implement removal by picking a body on its own reasoning.

**Two things this does not weaken.** The migration still runs through the normal command path, so
every fit rule fires (decision 1 above); and a removal is still a *migration* outcome, not a new
kind of refusal — the design after it is self-consistent with its own settings, which is what
decision 2 above is for.

**Interaction with [ADR 0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md).**
Two declared depths mean one 100 mm delta to absorb. **A third, deeper row would exhaust the
structural give sooner** — the return has 320 mm to spend and a deeper row spends more of it per
step — so adding one is no longer only a data row plus a wall depth: it also moves how often step 2
fires. ADR 0056's "build for n" stands; its cost estimate does not, and this is the amendment that
says so.
