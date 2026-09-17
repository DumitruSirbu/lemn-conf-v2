# ADR 0124 — The two horizontal wire bounds move together, as one number, not two

Status: Accepted (coordinator adjudication, 2026-09-17, under the owner's 6000 mm ruling — ADR 0120
Amendment B2. Answers the M7 7A3 plan's Q-7A3-3, which named this option its own recommendation.)
Date: 2026-09-17
Type: Decision (adjudication, wire-bound arithmetic) + Finding (a would-be silent refusal)
Milestone: M7 — wave 7A3 slice S0. Code lands in slice S2, not by this record.

**Every citation below is read from `docs/milestones/M7-room-and-presets.md`'s 7A3 plan section
(2026-09-17) and from `packages/configurator-domain/src/design-bounds.ts` at HEAD `b80ab97`.** The
plan's own evidence tiers are carried forward unchanged: **[measured]** — executed against a build of
`packages/configurator-domain/src`, figures printed; **[computed]** — arithmetic on a measured value,
shown; **[inference]** — reasoned, and marked so it can be argued with. **The after-figures in this
record's cost table are to be asserted as literals by slice S2**, not re-derived by a later reader.

## Context

[ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
Amendment B2 carries the owner's ruling, verbatim: *"lets stick to 6 now for each of the wall"* —
**6000 mm per wall**, both wall A and wall B. Amendment B2's own words: *"The owner separately ruled
**6000 mm per wall**, and that ruling stands."* (B2's *"this narrows no bound"* is about Amendment B's
4-metre optimisation target, not about the 6000 mm ruling — which **does** narrow wall A, from 6300.)

`packages/configurator-domain/src/room/approved-room-policy.ts` carries the owner-approved product
maxima as literals (ADR 0108 Amendment B decision B1): wall A 6300, wall B 5100. Applying the 6000 mm
ruling to this file alone is not a two-literal edit, because a second file bounds it first.

`design-bounds.ts:56-58` derives two wire bounds from the seeded scene shell (restated from
`packages/three-adapter/src/kitchen-parts.ts` rather than imported, per that file's own head
comment): `MAX_ROOM_WIDTH_MM = 4200 × 1.5 = 6300` and `MAX_ROOM_DEPTH_MM = 3400 × 1.5 = 5100`. These
become `DesignRoomSchema`'s bounds (`design.ts:146-148`) and `ENGINE_ROOM_LIMITS`' maxima
(`room-policy.ts:105-106`). Raising the approved wall-B maximum to 6000 without moving
`MAX_ROOM_DEPTH_MM` produces exactly the failure `approved-room-policy.test.ts:83`'s guard exists to
catch: simulated against the proposed policy, `validateRoomInput` **accepts** a 6000 × 6000 L room,
and `DesignRoomSchema.safeParse` of that same accepted object is **refused** —
`depthMm: Too big: expected number to be <=5100` [measured, 7A3 plan]. A customer would clear Step 1
and the mint would silently refuse their design.

**Confirmed at HEAD: `approved-room-policy.ts:16` is `6300` and `:20` is `5100`** — the ruling is
recorded and unbuilt, exactly as ADR 0120 Amendment C1 says: *"the ruled 6000 mm per wall is not yet
applied to the policy literals."*

## Why the asymmetry existed, and why it no longer does

The 4200/3400 split is not a product number. `design-bounds.ts`'s own head comment names it as **the
seeded room shell**, *"the one L-shape the reference builder knows"* — restated from
`three-adapter/src/kitchen-parts.ts`'s `RW = 4.2, RD = 3.4`. That file's comment records, in its own
words, that these "**stopped being 'the room shell the scene actually builds' in M7 wave 7H**, which
made the drawn shell a function of the room the customer entered. The wording moved; the values must
not." The asymmetry between 4200 and 3400 was never a fact about kitchens — it was two measurements
of one fixture, the reference builder's L-shaped mock, ported into a formula because nothing else was
available at the time `design-bounds.ts` was written.

ADR 0120 decision 1 removes the remaining reason to keep the two axes apart. Its D1 — read through
Amendment C's C1, *"the entered number is the run the customer wants furnished, not their wall"* —
makes wall A and wall B **the same kind of quantity**: a run the customer asked to furnish, not two
different physical measurements. Once both walls are the same kind of quantity, a wire bound that
treats them asymmetrically is carrying forward a distinction — the scene shell's own proportions —
that no longer describes anything the product does.

## Decision

**The two horizontal wire bounds in `design-bounds.ts` become one number: `4200 × 1.5 = 6300`,
applied to both `MAX_ROOM_WIDTH_MM` and `MAX_ROOM_DEPTH_MM`.**

`MAX_ROOM_WIDTH_MM` is unchanged at 6300. `MAX_ROOM_DEPTH_MM` moves from 5100 to 6300 — the longer of
the two seeded sides, times the existing `ROOM_HEADROOM_FACTOR`, rather than a new factor or a third
number. This is the smallest change that clears the owner's 6000 mm ruling on both walls while
leaving `ROOM_HEADROOM_FACTOR` itself untouched.

**The bound must not be derived from `APPROVED_ROOM_POLICY`.** Doing so would make
`approved-room-policy.test.ts:83`'s guard — `expect(approved.maxMm).toBeLessThanOrEqual(engine.maxMm)`
— vacuous: `approved ≤ engine` cannot fail when `engine` is computed from `approved`. That guard is
the one that just caught the silent-refusal defect above; deriving the bound from what it checks
deletes the check by construction. `design-bounds.ts`'s own head comment already refuses the mirror
image of this move: *"Deriving the shell from `MAX_ROOM_*` would close the circle the other way
round."*

## Alternatives considered

- **Raise `ROOM_HEADROOM_FACTOR` to 2.** Clears 6000 on every axis and keeps the derivation's shape,
  but inflates the width ceiling to 8400 and the depth to 6800 for no product reason —
  `MAX_PLACEMENTS` would move 168 → 228 and `MAX_EMPTY_COLUMNS` 1262 → 1682. **Rejected**: this would
  *shrink* wall A's product maximum to 6000 while *doubling* its wire ceiling, which is backwards —
  the wire bound should track the product bound's growth, not outrun it.
- **Pick the bounds outright, as a chosen pair of literals.** Rejected: `design-bounds.ts`'s stated
  convention is that each bound is derived from a catalogue or spec constant rather than chosen, and
  nothing about this change forces an exception to that convention.
- **Leave wall B's wire bound at 5100 and apply the owner's 6000 mm ruling to wall A only.** Rejected:
  the owner's words were *"6 meters per wall … for each of the wall"* — both walls, explicitly — and a
  half-applied ruling recorded as complete is worse than a ruling correctly deferred.

## Cost — every figure measured or computed, HEAD `8b73439` before, all after-figures asserted as literals by slice S2

| constant | at HEAD | after | why |
| --- | ---: | ---: | --- |
| `MAX_ROOM_WIDTH_MM` | 6300 | 6300 | unchanged |
| `MAX_ROOM_DEPTH_MM` | 5100 | 6300 | the axis that moves |
| headroom over the approved 6000 | A: 300, B: **−900** | A: 300, B: 300 | symmetric, and the approved-≤-engine guard stays a real check rather than a vacuous one |
| `MAX_EMPTY_COLUMNS` | 1262 | **1262**, unchanged | `(max(runs)/10 + 1) × 2` — the max of the pair was already 6300, so this bound does not move |
| `MAX_PLACEMENTS` | 168 | **186** | `(⌊6300/200⌋ + ⌊6300/200⌋) × 3` **[computed]** |
| `MAX_COLUMN_EXTENTS` | 168 | **186** | `= MAX_PLACEMENTS`, by definition |
| `MAX_DESIGN_BYTES` | **337 290** | **349 656** | +12 366 bytes, **+3.67 %** **[measured at HEAD; computed after]** |

**`MAX_DESIGN_BYTES` is a SEC-002 request-cap change**, on `PUT /api/designs/[id]`
(`apps/web/src/app/api/designs/[id]/route.ts:198`). A 3.67 % widening of the request-body ceiling a
save endpoint accepts is the whole security cost of this decision. It is stated here rather than left
for review to discover, and it is an honest cost rather than slack left in a formula: wall B really
can now carry as many placements, empty columns and bytes as wall A can, because the two are being
made the same kind of quantity.

## The product consequence, sized

**Swept at 25 mm through `planKitchenComposition` at a 2600 mm ceiling [measured, 7A3 plan]:**

- **Withdrawn band, wall A 6001–6300 mm: 1 980 rooms, 100 % of which build correctly today.** Moving
  `MAX_ROOM_DEPTH_MM` this way, in step with the approved policy's own maximum falling to 6000 on wall
  A, takes these rooms away. **This is an owner product decision, not a defect fix** — nothing in
  these 1 980 rooms is broken; they simply stop being reachable because the owner ruled the ceiling
  at 6000 rather than 6300.
- **Admitted band, wall B 5101–6000 mm: 7 380 rooms, all of which compose successfully and none of
  which drop a cabinet.** Wall B's approved maximum rising from 5100 to 6000 opens this band, and it
  is the band this decision exists to make reachable at all — without `MAX_ROOM_DEPTH_MM` moving to
  6300, every one of these 7 380 rooms would validate against the approved policy and then be refused
  at the storage boundary, exactly as the 6000 × 6000 simulation above shows.

## Consequences

- `design-bounds.ts`'s two horizontal maxima stop being two measurements of one fixture and become
  one number applied on both axes — the code change this record licenses, landing in wave 7A3 slice
  S2, not here.
- `approved-room-policy.test.ts:83`'s approved-≤-engine guard stays a real, non-vacuous check after
  the approved policy literals move to 6000/6000 in slice S2.
- The withdrawn and admitted bands above are the owner's to have chosen, sized and named, not
  discovered later as a support ticket.
- `MAX_DESIGN_BYTES`'s SEC-002 request cap rises 3.67 %, recorded here as a known, sized, deliberate
  cost.

## Decision-record sweep

| Record | What it says | How it relates |
| --- | --- | --- |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) Amendment B2 | The owner ruled 6000 mm per wall, and B1's market framing narrows no bound. | **The ruling this record exists to apply without a silent refusal.** This record moves the wire bound the product bound depends on; it does not revisit B2 itself. |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) Amendment C, D1 | Wall A and wall B are the same kind of quantity — a run the customer asked to furnish. | **Why the two wire bounds may now be one number.** The asymmetry the seeded shell carried had no remaining product referent once both walls became the same kind of quantity. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment B, decision B1 | The owner approved wall A 900–6300, wall B 1000–5100, ceiling 2200–3900, as literals pinned by a test. | **The guard this record protects from becoming vacuous.** `approved-room-policy.test.ts:83` is exactly the mechanism B1 built; deriving the wire bound from what it checks would delete it by construction. |
| M7 7A3 plan, `docs/milestones/M7-room-and-presets.md` | *"How `MAX_ROOM_DEPTH_MM` moves — adjudicated, with the alternatives"*; recommends this record as its own ADR at Q-7A3-3. | **The source of every measured and computed figure in this record**, and the plan this record discharges slice S0 of. |
