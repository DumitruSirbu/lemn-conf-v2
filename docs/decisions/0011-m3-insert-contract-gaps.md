# ADR 0011 — Five contract gaps between M3's insert/remove sketch and the shipped M2 code

Status: Accepted
Date: 2026-08-25
Type: Finding + Decision
Milestone: M3 — Insert, remove, swap, client write path

Found while turning `docs/milestones/M3-mutations.md` from a phase sketch into a dispatchable plan,
by reading the M2 code that actually landed rather than the model the sketch was written against.
Each gap below is a place where `DEVELOPMENT-SPEC.md` §5.1–§5.3 cannot be implemented on top of
what M2 shipped without a decision. None of them is an implementation defect in M2 — every one is a
contract the earlier phase had no reason to settle, because M2 has no mutation.

Classification for all five: **contract gap**, not implementation defect and not test fidelity.

---

## Gap A — two different things are called "the catalogue"

**What exists.** `KITCHEN_L_BODY_CATALOG`
(`packages/configurator-domain/src/fixtures/kitchen-l-design.ts`) is a table of **20 concrete
instances** keyed by ids like `wall-2door-600-top` and `base-sink-800`. Each entry carries a fixed
`frameDepthMm`, an optional fixed `frameHeightMm`, and capability flags. It exists so
`derivePlacementRecords` can reproduce M1's whole-scene coordinates exactly, and
`buildDecomposedBody` (`packages/three-adapter/src/decomposed-bodies.ts`) has one hardcoded
`switch` arm per id.

**What §7 specifies.** The catalogue is **14 parameterised entries** — `base-2door`, `wall-2door`,
`hood`, `fridge-free`, … — each with a band, a width flex (`'fit'` or a fixed set), a height flex,
a label, a width chip set, and a builder taking `(w, h, d)`. `insert(buildId)` (§5.2) is written
entirely against that shape: `w = b.w === 'fit' ? void.w : b.w`, `h = b.hFlex ? … : b.h`,
`g = b.mk(w, h, void.d)`.

**The gap.** M2's table cannot answer any of those questions, and §7's table cannot reproduce M1's
seeded scene. They are not the same object and neither one alone supports M3.

**Decision.** One `BodyDefinition` type, one map, two populations, distinguished by an `insertable`
flag:

- The 20 seeded entries stay exactly as they are, with `insertable: false`. Nothing about M1's
  fidelity, M2's decomposition-parity suite, or the seeded `Design` changes.
- The 14 §7 entries are added with `insertable: true` plus the fields insert needs — `label`,
  `widthFlex`, `heightFlex`, `nominalHeightMm`, `nominalDepthMm`, `sizesMm`.
- Only `insertable` entries are ever offered or accepted by `insert(buildId)`. A seeded id passed
  to `insert` is refused with `NOT_INSERTABLE`.

**Alternatives considered.**

1. *Replace the 20 with the 14 and re-express the seeded design against them.* Rejected: it
   rewrites the fixture that M1's parity gate and M2's decomposition-parity proof are anchored to,
   for no behavioural gain in M3. The re-anchoring cost lands on the two suites that exist
   specifically to catch silent fidelity loss.
2. *Two separate maps (a "seed catalogue" and an "insert catalogue").* Rejected: `derivePlacementRecords`
   would need both, and a placement created by `insert` must resolve through the same lookup as a
   seeded one or `UnknownBodyError` becomes reachable at load. One map, one flag.

**Consequence worth naming.** §5.4's `buildIdOf(placement)` — mapping an original body to a
catalogue entry by inspecting its mesh tree — is unnecessary in this codebase. Every placement,
seeded or inserted, already carries an explicit `buildId`. §6.3's rule ("never infer identity from
geometry when the user's choice is in hand") is satisfied by construction, and Row 23 becomes hard
to fail rather than a thing to remember. M5 must not reintroduce mesh-tree inference for its donor
lookup.

---

## Gap B — an inserted body's wall-normal offset cannot be looked up

**What exists.** `deriveFrame` computes a placement's world position from
`deriveCabinetWorldTransform({wall, alongM, y0M, depthM})`, where `depthM` comes from the
catalogue's `frameDepthMm`, and the transform places the body's centre at `depthM / 2` from the
wall plane. The fixture's own doc comment states what that number really is: "`2 ×` the wall-normal
offset that its §6.2 wall-seating helper derives — the body's own **measured** half-depth, not a
claim about a body's physical depth". `docs/decisions/0005-m2-row19-m1-wall-gap-finding.md`
confirms it: the six corrected values were recomputed from measured bounding boxes.

**The gap.** `frameDepthMm` is a **measurement of one specific built body**. An inserted body is
built at a width, height and depth chosen at insert time, and §6.2 is explicit that the seat cannot
be predicted — bodies are asymmetric about their group origin (recessed plinths, proud appliance
doors), and deriving the plane from the previous occupant failed twice. A per-`buildId` constant
therefore cannot seat a parameterised body, and Row 19 ("back face exactly on the wall plane,
0.000") is unachievable for inserts through the current path.

**Decision.** Two parts.

1. **A `BodyProbe` port, declared in the domain, implemented in the adapter.** The domain declares
   an interface — given `{buildId, widthM, heightM, depthM}`, return the built body's carcass width
   and height, its full extent height, and its **seat offset**: the distance from the group origin
   to the back face along the wall normal, measured from the bounding box after construction. The
   adapter implements it with Three.js. Commands take the probe as an argument. The domain imports
   nothing new; `eslint.config.mjs`'s `no-restricted-imports` block stays satisfied because an
   interface is not an import of Three.js.
2. **`CabinetBody` gains an optional `seatDepthMm`.** Insert persists `2 × seatOffset` in it, and
   `deriveFrame` prefers `placement.body.seatDepthMm` over `definition.frameDepthMm`. The field is
   optional, so every stored design written before M3 still validates — no schema version bump, no
   new `migrateDesign` arm.

**Why the field is named for seating and not depth.** It is not the body's physical depth and must
never be read as one. The existing `frameDepthMm` already carries this wart (the hob's 700 and the
hood's 500 are seating numbers, not depths); naming the new field `seatDepthMm` stops the wart
spreading silently rather than pretending it isn't there.

**Alternatives considered.**

1. *Have the adapter seat the body at mount time and leave the domain's frame unseated.* Rejected:
   the domain's `frame.x/z` **is** the mount position today (`kitchen-stage.tsx` sets
   `body.position` from `record.frame`), and picking, highlighting and void geometry all key off
   it. Letting the rendered position drift from the derived frame reintroduces exactly the class of
   bug §6.2 records.
2. *Derive depth as `min(nominalDepth, column.d)` and accept the resulting gap.* Rejected: it
   restates the "predict the seat" approach that failed twice, and it fails Row 19 by construction
   for any body that is asymmetric about its origin.
3. *Re-probe on every load instead of persisting.* Rejected: it makes load depend on a Three.js
   probe, so the domain's load path stops being pure and a headless round-trip test would need a
   renderer. Persisting a measured integer keeps load a pure function of the document.

**Obligation this creates.** The probe must be deterministic: the same `(buildId, w, h, d)` must
produce the same seat offset on every run, or a reload will not reproduce the design. That is an
acceptance criterion of the phase, not an assumption.

---

## Gap C — `band: 'top'` is refused from the top slot by §5.2's own gate

**What exists.** Six seeded entries carry `band: "top"`, via the shared `topCarcass` spread —
`wall-2door-600-top`, `wall-1door-300-top`, `wall-2door-800-top`, `wall-corner-return-570-top`,
`wall-2door-600-deep-top`, `wall-2door-700-over-fridge`. `Band` is
`"base" | "wall" | "top" | "column"`.

**What §5.2 computes.** `target = void.h >= 1.9 ? 'column' : void.y0 < 0.2 ? 'base' : 'wall'`. It
**never yields `top`**. The gate then refuses when `b.band !== target`.

**The gap.** A `top`-band body is refused from every opening in the product, including the 2.2–2.6
slot it was built for, and including its own frame on a swap in place. §7's catalogue confirms the
intent: it has no `top` entries at all — `wall-2door` is height-flexible and builds to 400 mm in a
400 mm slot. `top` in M2's table is a decomposition artefact recording "this instance is a top-row
cabinet", not a catalogue band.

**Decision.** `top` is a **row**, not a catalogue band.

- The band gate compares *normalised* bands, where `top` normalises to `wall`. The seeded entries
  keep `band: "top"` — nothing in M2 is edited — and the normalisation lives in one named domain
  function that the gate and the offer list both use.
- Push-to-open-by-default (§6.5, §11 row 13) is decided by the **slot**, not the body: a body
  placed with `y0 >= 2.2` and no recorded `handleMode` ships with its handles built and hidden.
  This is what §6.5 actually says ("built and hidden, not omitted") and it keeps `canHandle` true.

**Alternatives considered.** *Extend the target derivation to yield `top` for slots at 2.2 and up.*
Rejected: it would then refuse `wall-2door` — a `wall`-band body — from the top row, which is the
only thing §7 has to offer there. The band set would need a compatibility matrix, which is the
"cross-band compatibility maths that never terminates cleanly" §13.1 rejected.

---

## Gap D — the store recomputes columns on every derivation

**What exists.** `deriveGeometry` in `apps/web/src/store/configurator-store.ts` calls
`derivePlacementRecords` → `deriveColumns` → `recomputeVoids` together, and `hydrate` calls it
again.

**What is recorded.** §3.2, the supersession record §1, and M2's own work item 3: "Columns are
computed **once at load** and never change afterwards." `deriveColumns`'s doc comment says the same.
The store's own header comment explains why the current shape is safe: "placements are fixed at
store creation… there is nothing yet that could invalidate it."

**The gap.** The moment a mutation exists, recomputing columns from the mutated records is wrong,
and wrong in a way that silently deletes the feature:

- Deleting the top unit of a column recomputes `top` down to the deleted body's bottom, so the
  400 mm that was just freed produces **no void at all**.
- Deleting a column's last member drops the column from the map entirely, so the cleared run is
  invisible. The signature flow of §10 — delete the fridge, delete the unit above it, get one
  700 × 2600 opening — cannot happen.

**Decision.** Columns become **frozen load-time state** held on the store beside `design`. Store
creation and `hydrate` derive them; no command recomputes them. After a command the store derives
records from the new design and calls `recomputeVoids(records, frozenColumns)`. This is the
already-recorded contract; M3 is simply the first phase that can violate it.

**Consequence.** Every mutation must preserve column membership. Insert derives its `alongMm` from
the target void's own along-wall coordinate so the new placement's derived `col` equals the target
void's `col`. A mismatch means a phantom column, so it is a rejection (`COLUMN_MISMATCH`), not a
placement — asserted, not assumed.

---

## Gap E — deleting a host orphans its accessory, and picking then throws

**What exists.** `resolveHostPlacementId` (`packages/three-adapter/src/picking.ts`) resolves a
worktop accessory to "the tallest non-accessory member of the same column whose top sits at or
below the accessory's own bottom", and **throws** when it finds none. Accessories are excluded from
`groupByColumn`, so they contribute nothing to columns or voids.

**The gap.** §5.1 refuses to delete an accessory but says nothing about deleting the cabinet an
accessory sits on. In the seeded design, `p3` (`cooktop-600`, the hob) sits at 0.86 in column
`A|2.60` on top of `p2` (`base-drawer2-600`, 0–0.82). `remove(p2)` is legal by every rule in §5.1.
Afterwards the hob has no host: it hangs in the air over a void that ignores it, and the first tap
on it throws out of the picking path. A column body inserted into the freed span would be built
straight through it.

**Decision.** `remove` **cascades to accessories hosted by the target**. Removing a body removes,
in the same command and the same result, every accessory whose host resolves to it. This follows
directly from §3.1 and §6.1 — an accessory "belongs to its host", has no swap set, and cannot be
selected or deleted on its own; a thing that cannot exist independently must not survive the thing
it depends on.

Two supporting changes:

- Host resolution moves into the domain (it is placement logic, not Three.js logic; the adapter
  keeps its `PlacementRecord`-shaped call and delegates).
- It stops throwing on an orphan and returns "no host", which the picking layer treats as "select
  the accessory itself". A thrown exception in a pointer handler is not an acceptable outcome for
  a data state the engine can reach.

**Alternatives considered.**

1. *Refuse to delete a host while it carries an accessory.* Rejected: the customer's only route to
   removing a hob is to remove the cabinet under it, and §5.1's refusal list is closed ("void
   selected · accessory · `!canDelete`") — adding a fourth refusal invents a rule the reference does
   not have, and it makes the hob column permanently unclearable, which breaks the §10 flow's
   "clear all three".
2. *Leave the accessory and let it float.* Rejected: it is the phantom-geometry class of defect §3.1
   and §4 exist to prevent, and it makes a thrown exception reachable from a tap.

---

## Correction, 2026-08-25 (M3 Wave 3B)

**Gap A's count is wrong: §7's catalogue has 15 parameterised entries, not 14.** Everywhere this
record says "the 14 §7 entries", read fifteen. The decision itself is unaffected — one
`BodyDefinition` type, one map, two populations split by `insertable` — and nothing was missing from
the implementation: Wave 3A shipped all fifteen, and
`INSERTABLE_BODY_DEFINITIONS.length === 15` was verified directly.

Counted from §7's own table: six base (`base-2door`, `base-1door`, `base-3drawer`, `base-panbank`,
`base-sink`, `base-dishwasher`), five wall (`wall-2door`, `wall-1door`, `wall-lift`, `open-shelf`,
`hood`), four column (`tall-pantry`, `tall-oven-tower`, `tall-fridge-housing`, `fridge-free`).

The slip propagated into `docs/milestones/M3-mutations.md` (four places, now corrected) and into
Wave 3B's dispatch. It surfaced when a Wave 3B test asserting `toHaveLength(14)` failed; the shipped
test asserts set equality between the adapter's builder table and this catalogue in both directions
instead, which is the stronger assertion and would have caught a genuinely missing entry that a
count never could.

Left in place above rather than rewritten, per `docs/decisions/README.md`: a later correction is
appended, never edited away.
