# ADR 0055 — A cabinet-depth change migrates the stored design, it is not re-derived on load

Status: Accepted
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
