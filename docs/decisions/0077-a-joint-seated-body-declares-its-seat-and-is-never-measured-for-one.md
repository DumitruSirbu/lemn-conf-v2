# ADR 0077 — A recorded seat is a measurement of one quantity taken at one setting, and reading it without either qualifier is one defect in two places

Status: Accepted
Date: 2026-09-05
Type: Finding + Decision
Milestone: M6 — new waves 6K-h and 6K-g, **in that order**; closes the exclusion [ADR 0075](0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md)'s amendment clause 4 reported and could not rule on

## Context

**Read the Addendum of 2026-09-05 with this record.** The body below rules on one clause; a second
defect reported the same day proved to be the same principle asked of the *opening* rather than of the
body, and is ruled in the Addendum. Nothing below is revised by it.

Wave 6K-d gave `createBodyProbe` the scene's own dispatch (`build-any-body.ts`), so the probe can now
build the four seeded decomposition ids it used to throw
`No catalog builder registered` for. That fix is right and is not in question. What it exposed is
that `set-cabinet-depth.ts`'s `reseat` arm — the one path those four bodies travel — **persists a
measurement of a bounding box as a seat, for a body whose seat is not a property of its bounding
box.**

ADR 0075's amendment closed with *"that the real probe cannot measure them at all is larger than this
record and is reported separately."* This is that separate report, and the answer is not the one that
record anticipated: the probe can measure them now, and for one of the four the measurement is the
wrong quantity.

### The defect, measured

`cornerBaseX()` takes **no arguments** (`packages/three-adapter/src/kitchen-parts.ts:1784`). It reads
`cabinetDepthM` off the kit's closure, so the `depthM` `reseat` hands `probe.measure` reaches nothing
in this body. `reseat` then writes `2 × measurement.seatOffsetM`
(`packages/configurator-domain/src/commands/set-cabinet-depth.ts:242`) over the joint seat the entry
declares.

Run headless in `packages/three-adapter` against a real `createBodyProbe` over a real kit and the
room it built, 2026-09-05:

```
600  base-corner-x-900            declared 560  measured 600
600  base-corner-return-320       declared 580  measured 580
600  wall-corner-return-570       declared 291  measured 291
600  wall-corner-return-570-top   declared 291  measured 291
700  base-corner-x-900            declared 660  measured 700
700  base-corner-return-320       declared 680  measured 680
700  wall-corner-return-570       declared 361  measured 361
700  wall-corner-return-570-top   declared 361  measured 361
```

The 40 mm is [ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md)'s deliberate 20 mm inset,
doubled by [ADR 0018](0018-frame-depth-is-rear-overhang.md)'s rear-overhang encoding. A full round
trip on `KITCHEN_L_DESIGN` through `setCabinetDepth` with that probe:

```
p25 seatDepthMm  start/700/600:  (none) → 700 → 600
p26 seatDepthMm  start/700/600:  (none) → 680 → 580
p25 frame.z      0.28  →  0.30
```

**It does not return, and it ends flush.** It also does not compound: because the builder ignores the
recorded seat, every later change writes the same 600. The harm is a fixed 20 mm, not a growing one,
and saying so is what sizes the fix.

### What the 20 mm costs, measured rather than argued

Carcass meshes only, both legs built at their derived transforms, at 600:

```
fixture              p25 carcass z [-0.020, 0.580]   p26 carcass z [0.580, 0.900]
                     intersection 0 × 0 × 0                       volume 0

after 600→700→600    p25 carcass z [ 0.000, 0.600]   p26 carcass z [0.580, 0.900]
                     intersection 0.580 × 0.720 × 0.020           volume 0.00835 m³
```

That is ADR 0025's own sentence as a number: *"seating it flush at z = 0.30 would push its carcass
front to 0.60 and drive it 20 mm into the return leg: two solid volumes intersecting, which the 3D
contract calls out by name as the thing that produces z-fighting."* The command now does exactly
that.

**The reach is bounded and stated.** `base-corner-x-900`'s `occupiedDepth` is a `wall-plane`
declaration, so `Column.d`, the void map and every opening are untouched; nothing about fit, width or
price moves. What moves is the **drawn body**, the **picking target** that follows it, and the
**stored document**, which now carries `seatDepthMm: 600` on `p25` for every design saved after a
depth change.

### Why no gate saw it, and why two of them said it could not happen

Before wave 6K-d the probe threw for every decomposition id, so `setCabinetDepth` crashed rather than
mis-seating (`docs/BACKLOG.md` entry 31). Fixing the crash converted a loud failure into a silent
one. That alone would be ordinary. What is not ordinary is that the wave's own evidence excluded the
family, in two files, on two justifications — one that has become false and one that was false when
it was written:

- **`packages/three-adapter/tests/qa-6k-d-real-probe-round-trip.test.ts:42-52`** filters the four
  structural ids out of its fixture because *"`createBodyProbe` has no builder for them — it
  throws."* That was true when written and 6K-d's own `buildAnyBody` made it false in the same wave.
  The filter outlived its reason.
- **`packages/three-adapter/tests/declared-frame-depth-sweep.test.ts:95`** lists `base-corner-x-900`
  in a hand-written exception set and asserts the mismatch is not reachable, because the row *"is
  re-seated by `reseat` from its **declared** frame depth rather than from a measurement of its
  bounding box."* **That was never true.** `reseat` passes the declaration as the probe's `depthM`
  *argument* and persists the *measurement*. The sentence conflates the two roles the declaration
  could play — what the body is built to, and what is recorded — and for this body the first role is
  vacuous, because the builder takes no arguments.

A retraction of the reviewer's finding was accepted earlier on 2026-09-05 on the strength of that
second sentence. **The retraction rested on a false premise and is withdrawn**; the finding stands,
and this record is its ruling. Recorded rather than quietly reversed, because a retraction that
leaves no trace is indistinguishable from a finding that was never raised.

### The property that is load-bearing in three places and declared in none

"Does this body's back face sit on the wall plane" is currently stated three times, in three shapes,
none of them the catalogue — which is where every other depth fact is declared
([ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md),
[ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md),
[ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md)):

| Where | Shape | Members |
| --- | --- | --- |
| `packages/three-adapter/src/measure-built-body.ts` — `FRONT_ALIGNED_BUILD_IDS` | build id → boolean, **production code in the adapter** | `hood` |
| `packages/three-adapter/tests/kitchen-parts.decomposition.parity.test.ts:345` — `KNOWN_WALL_GAP_M` | placement id → signed metres | `p25 → −0.02`, `p13 → +0.1` |
| `packages/three-adapter/tests/declared-frame-depth-sweep.test.ts:96` — `NOT_SEATED_ON_THE_WALL_PLANE` | build id → boolean | `base-corner-x-900`, `hood-600` |

Three independent statements of one product fact, keyed two different ways, which must agree and
which nothing forces to. That is [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision
4's subject in its purest form, and it is the contract gap behind the defect: the sweep's own comment
already says so — *"this set is hand-written because the property is not declarable today, and that
is the defect behind it"* — and defers it.

**The deferral is overtaken by events.** It was a reasonable call on 2026-09-05 when the property was
only a test's problem. It stopped being one when `reseat` began branching on the same property
implicitly, in a command, and getting it wrong.

## Classification

Three defects, classified separately so that none is fixed by another — ADR 0075's own method.

1. **Contract gap, and the primary one.** No entry declares which plane seats it. Every reader that
   needs the answer invents its own copy.
2. **Implementation defect, reachable in production.** `reseat` persists a measured rear overhang as
   the seat of a joint-seated body, drives 0.00835 m³ of one shipped carcass into another, and
   writes the result into the stored document. Against ADR 0025 decision 2, which this code predates
   by nine days.
3. **Test-fidelity problem, in two files.** One exclusion outlived its reason; one asserted the
   defect was unreachable using a justification that was false when written. The second is the worse
   of the two: it is a false statement about a command's behaviour, written into a gate.

## Decision

### 1. When a persisted seat may come from a measurement

**A persisted seat may come from a measurement exactly when the measurement is of the same quantity
the seat encodes.**

`seatDepthMm` is `2 ×` the distance from a body's group origin to **the plane its wall-normal
position is fixed against** (ADR 0025 decision 2). A probe measures a bounding box. Those are the
same number only for a body whose position is fixed by its own back face landing on the wall plane.
Three cases, and they are exhaustive over the shipped model:

- **Fixed by the wall plane** — the seat is measured, and **must** be. This is §11 row 19 and it is
  not weakened by anything here: §6.2 records two failed attempts at *predicting* a seat, which left
  inserts floating 135 mm off the wall and then buried 10–31 mm inside it. Every base, wall, top,
  full-height and appliance body is this case.
- **Fixed by a plane the body owns that is not the wall plane** — the front-hung hood
  ([ADR 0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md) decision 2), whose front face
  lands on the cabinet-depth line. The seat is **still measured**, to that plane instead. The
  measured face changes; the encoding does not.
- **Fixed by another body** — a joint. The seat is **not a property of this body's mesh at all**, and
  no measurement of this body can produce it. It comes from the entry's declaration, and the
  declaration is authoritative. `base-corner-x-900` is the whole of this set today.

**Which of the three a body is, is declared per entry and never inferred** — not from its kind, not
from its band, not from whether it is seeded or insertable, and above all **not from whether a
measurement happens to agree with the declaration.**

That last clause is the one this record exists for. The rule must **not** be written as *"take the
declaration where it disagrees with the measurement."* That is the same defect wearing the opposite
sign: it makes the agreement an *input*, so a joint-seated body that happened to be flush would take
the measured path and be silently right until the day its neighbour moved. The rule's only input is
the declaration. That `base-corner-return-320`, `wall-corner-return-570` and
`wall-corner-return-570-top` agree with their measurements to the millimetre at both declared depths
is then a **consequence to be gated**, not a premise to rest on — decision 5 is where it is gated.

### 2. `seatRule` becomes a real catalogue field now, with no default

Yes, now, and not deferred a second time. It is a catalogue-shape change, which is why it was put
off; it is also the only thing that makes decision 1 checkable, and it retires three hand-written
copies of one fact rather than adding a fourth.

**Shape**, in the domain, beside `OccupiedDepthRule` and for the same reasons:

```ts
export type SeatRule =
  | { readonly seatedOn: "wall-plane" }
  | { readonly seatedOn: "cabinet-front-line" }
  | { readonly seatedOn: "joint" };
```

with the three constructors `seatsOnTheWallPlane()`, `seatsOnTheCabinetFrontLine()` and
`seatsOnAJoint()`, written as functions rather than as bare literals so an entry states a product
fact rather than a discriminant string.

**Three arms and not a boolean.** The question is not *"is it on the wall"* — it is *"what plane is
it on, and can this body's own mesh answer"*. A boolean collapses the hood and the corner leg into
one bucket, and they need opposite treatment: the hood is measured (against another plane) and the
corner leg is not measured at all. A boolean is also what the existing `NOT_SEATED_ON_THE_WALL_PLANE`
set is, and it is why that set has to be hand-written.

**No payload on the `joint` arm.** A `meetsBuildId` naming the neighbour was considered and is
refused under ADR 0073 decision 1's own argument: it is a second statement of a relationship the
room's geometry already carries, free to drift from it, and *which* body a joint-seated body meets is
a **design** fact rather than a catalogue one. Decision 5's gate is a non-intersection assertion over
the whole room, which needs no id and is stronger than a per-pair check.

**Default: none, anywhere.** No `?? seatsOnTheWallPlane()`, at any call site. The field follows the
exact precedent of `occupiedDepth`, `cabinetHandles`, `fronts` and `depthRule`:

- **Required on `BodyShape`**, so a §7 row that says nothing is a compile error.
- **Optional on `BodyDefinition`**, for the one reason those four are — the case that must fail
  loudly is a definition arriving through the `BodyCatalog` port from outside TypeScript, which a
  required field cannot reach.
- **Refused at catalogue assembly** by a `refuseUndeclaredSeatRules` sweep over both populations in
  `buildKitchenLBodyCatalog`, mirroring `refuseUndeclaredDepthRules` line for line, and applied by a
  domain function that throws `UndeclaredSeatRuleError` naming the `buildId`.

A silent default is precisely how this defect got in. `occupied-depth.ts` already records the same
lesson from DOM-002 in its own header: the catch-all it replaced *"was wrong for every body it
caught"* and nothing failed.

**What each shipped entry declares**, and this is the whole population:

| Entries | Declares |
| --- | --- |
| `base-corner-x-900` | `joint` |
| `hood`, `hood-600` | `cabinet-front-line` |
| every other entry, both populations | `wall-plane` |

`wall-plane` is spelled once in each of the four shared shapes (`baseCarcass`, `wallCarcass`,
`topCarcass`, `columnCarcass`) and once in each §7 helper, with two overrides after the spread. That
is what makes "no default" affordable rather than a thirty-line chore.

### 3. The adapter is told the rule; it stops keeping its own list

`BodyProbeRequest` gains the seat rule, and `FRONT_ALIGNED_BUILD_IDS` and `isFrontAligned` are
**deleted** from `measure-built-body.ts`. The probe branches on what the domain told it: back face to
the wall plane, or front face to `kit.depths.cabinetDepthM`.

**This extends ADR 0039 decision 3's mechanism rather than overturning it, and the distinction is
recorded because the standing instruction requires it.** That record's stated reason for keying on
the build id was that front-hanging *"is a product decision about hoods and not a fact about
canopies"* — the argument is against reading it off a mesh name, and it is fully honoured here: the
answer is still per entry, and it now lives where the project's other per-entry product decisions
live. Nothing about the hood's geometry, its 100 mm gap or its named row-19 exception changes.

**The request cannot carry the `joint` arm.** `BodyProbeRequest`'s field is the two-member union
`"wall-plane" | "cabinet-front-line"`, so *asking the probe to measure a joint-seated body does not
typecheck*. This is wave 6K-f's own idiom — make the wrong call site impossible to write rather than
merely wrong — and it is the mechanism that stops decision 4 being undone by a future edit.

### 4. `reseat` takes the declaration for a joint-seated body, and `deriveFrame` refuses a stored one

Both sides, because each closes a case the other does not.

**Write side.** `reseat` reads the entry's `seatRule`. For `wall-plane` and `cabinet-front-line` it
measures, exactly as today, and the persisted seat is the measurement — three of the four structural
bodies are unchanged in behaviour and in value. For `joint` it does **not** call the probe at all,
and it writes **no** `seatDepthMm`: it returns the placement with any existing `seatDepthMm` removed.
Leaving the declaration's number there instead would put two authors on one quantity again, which is
the shape being retired.

`rebuiltCount` still counts a joint-seated body. Its seat genuinely did change with the setting —
560 → 660 — just from the declaration rather than from a measurement. Pinned here so the effect's
number is not quietly redefined by the fix.

**Read side.** `deriveFrame` resolves a joint-seated placement's frame depth from
`definition.frameDepthMm` **and ignores any `seatDepthMm` the document carries.**

This is a deliberate narrowing of [ADR 0011](0011-m3-insert-contract-gaps.md) Gap B's
`seatDepthMm ?? frameDepthMm`, recorded as such and listed in the index's Supersessions. Gap B's rule
is *"a placement's own measured seat is preferred, the catalogue is the fallback"*; for a joint-seated
body there is no measured seat that means anything, so the preference has nothing to prefer. The
narrowing is bounded by a declaration to exactly one entry today and cannot spread by accident.

**It is also the only thing that reaches a document already written.** Every design saved since the
defect landed carries `p25.seatDepthMm: 600`. The write-side fix alone leaves those drawn
intersecting until someone changes the depth again. The read-side rule makes them correct on load,
with nothing rewritten and nothing refused (ADR 0052: a load that refuses is a dead link).

**No schema change and no version bump.** `CURRENT_SCHEMA_VERSION` stays where it is.
`seatDepthMm` is already optional, both shapes parse today, and after the read-side rule the two read
identically — so this lands on ADR 0073 decision 6's side of the line drawn in `migrate-design.ts`:
absent-field-absence owes no bump, and no stored value is rewritten on load. The stale field is
dropped on the next depth change, which is a command writing a document, not a migration reading one.

### 5. What stops the next body doing this silently

Five mechanisms, layered, each failing for a different defect. ADR 0028 decision 4's standard —
*two numbers must not agree by luck* — is the bar, and the point of the layering is that **no
assertion anywhere passes because the declaration and the measurement happen to coincide.**

1. **A new entry that declares nothing does not load.** `refuseUndeclaredSeatRules` throws as the
   catalogue is assembled, naming the `buildId`, for both populations. §7 rows fail earlier still, at
   compile time.
2. **A joint-seated body cannot be sent to the probe.** Decision 3's two-member request union. The
   defect's exact expression — hand a declaration to `measure` and persist what comes back — does not
   compile.
3. **The sweep loses its exception set entirely.** `declared-frame-depth-sweep.test.ts` asserts, for
   **every** entry at **every** declared depth, that `frameDepthMm` equals what the probe measures
   *under that entry's own declared seat rule*. `hood-600` joins the sweep instead of being listed —
   under `cabinet-front-line` its declared 700 becomes measurable, which also closes the latent
   defect that it currently declares 700 and measures 500 and is saved only by resolving away through
   its `catalogEquivalentId`. **There is no list left to add a row to.** This is what proves the three
   agreeing structural entries agree *because they are flush*, rather than being trusted to.
4. **The joint arm gets a gate that is not weaker than the sweep it is excused from.** No two
   placements' carcasses may occupy the same space: over the seeded design, at every declared depth,
   and — the case that would have caught this — over the design a 600 → 700 → 600 round trip
   produces, every pair of placement carcass boxes has **zero** intersection volume, and the two
   corner legs **touch** on their seam plane to 1e-6. It asserts what must not happen, in the words
   ADR 0025 used, and it needs no per-entry payload.
5. **`KNOWN_WALL_GAP_M` stays pinned by value.** ADR 0025 decision 3 and ADR 0039 decision 3 both
   chose a pinned literal so that a gap changing, growing, or *"silently fixing itself"* fails
   loudly. Nothing here relaxes it into a derivation from the new field — that would make the
   declaration check itself. It stays a third, independent statement, and that is now its job rather
   than its accident.

### 6. Both false justifications are corrected in place, never deleted

`docs/WORKFLOW.md`'s rule for an expected failure applies to a false comment for the same reason: a
deleted justification is indistinguishable from one that was never written, and the next reader will
re-derive the same wrong conclusion.

**`packages/three-adapter/tests/declared-frame-depth-sweep.test.ts`.** The exception set and its
block comment go, and what replaces them says what was actually true:

- that the sentence *"`base-corner-x-900` is re-seated by `reseat` from its declared frame depth
  rather than from a measurement of its bounding box"* was **false when written**, and why — the
  declaration is the probe's `depthM` argument, the persisted value is `2 × seatOffsetM`, and
  `cornerBaseX()` takes no arguments so the argument reaches nothing;
- that the property the set stood in for is now declared, with a pointer to this record;
- the assertion itself, over every entry with no exception, plus a **non-vacuity** assertion that at
  least one entry declares each of the three arms — so the sweep cannot start passing because an arm
  quietly lost its last member.

**`packages/three-adapter/tests/qa-6k-d-real-probe-round-trip.test.ts`.** The `STRUCTURAL_BUILD_IDS`
filter is kept for the wall-column assertions, because those are about the wall band and about the
question ADR 0075 settled — but its justification is rewritten, since *"`createBodyProbe` has no
builder for them"* has been false since 6K-d's own `buildAnyBody`. It must say that it isolates the
wall band, and note that the exclusion is why this defect survived the wave.

A second block is **added**, over the unfiltered `KITCHEN_L_DESIGN`, asserting what the filter hid:
after 600 → 700 → 600 every structural placement's seat is what the catalogue declares at 600 —
`p25` = 560, not 600 — and at the deeper leg `p25` = 660, not 700.

### 7. Own record, not an amendment

An amendment to ADR 0025 or ADR 0075 was considered and refused. This creates a catalogue field, a
domain module and a port change, which is a shape neither record is about; it rules on `reseat`,
which postdates both; and it corrects two artefacts produced by ADR 0075's own wave, which is a new
dated fact rather than a revision of that record's reasoning. ADR 0025 decision 2 is **extended, not
overturned** — it narrowed what `frameDepthMm` means and this supplies the declaration that makes the
narrowing checkable and enforced.

## Alternatives considered

- **Write `declaredFrameDepthMm` straight through in `reseat` and stop there.** The reviewer's first
  direction, and it fixes the shipped defect in one line. Refused as the whole answer: it hard-codes
  decision 1's third case into one command, leaves the property undeclared in three other places,
  leaves `deriveFrame` reading the stale seat out of documents already stored, and leaves the sweep's
  exception set hand-written. It is a correct sub-step of decision 4 and is included there, not as a
  substitute for decision 2.
- **A boolean `seatsOnTheWallPlane` field.** Cheaper by one arm. Refused: it puts the hood and the
  corner leg in one bucket when they need opposite handling — measured against another plane versus
  not measured at all — so the adapter would still need its own list to tell them apart, and the
  third copy of the fact would survive.
- **Give the `joint` arm a `meetsBuildId`.** Attractive: it makes a per-pair coplanarity gate
  mechanical. Refused under ADR 0073 decision 1 — a second statement of a relationship the geometry
  already carries — and because the neighbour is a design fact, not a catalogue one. Decision 5's
  whole-room non-intersection gate is stronger and needs no payload. **If a joint-seated body ever
  becomes insertable, this is the alternative to revisit first**, because at that point the neighbour
  really does vary per placement.
- **Derive the seat rule from `occupiedDepth.measuredFrom`.** No new field at all. Refused on the
  sweep's own measured objection, restated: `wall-plane` says the *occupied* depth is measured
  forward from the wall plane, which is true of the corner leg and of the hood alike, and says
  nothing about whether the body's own back face touches it. It would also derive one declaration
  from another, which is ADR 0028 decision 4's subject and the ground ADR 0075 refused the analogous
  `insertableBody` shortcut on.
- **Make `cornerBaseX()` take a depth argument, so the measurement becomes honest.** Refused, and it
  is worth being explicit: no argument makes the measurement right, because the quantity is wrong.
  The X-leg's back face is 20 mm behind the wall no matter what it is built to; its seat is fixed by
  the return leg's front plane, which is not in this body's bounding box. It would also put a depth
  parameter on a builder ADR 0018 clause 4 warns about, for no gain.
- **Keep the deferral and fix only `reseat`.** Refused on the record's own terms: the deferral was
  taken while the property was a test's problem, and the same day a command began branching on it
  implicitly and wrongly. Deferring again means the next reader writes a fourth copy.
- **Leave the stored `seatDepthMm: 600` and let it self-correct on the next depth change.** Refused.
  A customer who never changes the depth again keeps an intersecting corner forever, and the document
  is already on the wire. The read-side rule costs one branch and no migration.

## Records swept before deciding, and how each is settled

Per the owner's standing instruction, checked before ruling.

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0018](0018-frame-depth-is-rear-overhang.md) | `frame.d` is twice a body's **rear overhang**; *"a body's measured seat is not a licence to infer its depth."* | **Extended in the direction it already pointed.** That record's rule runs seat → depth; this one runs the other way — a body's *depth*, or its bounding box, is not a licence to infer its **seat** — and ADR 0025 already recorded the X-leg as its counter-example in both directions. |
| [ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) decisions 2 and 3 | `frameDepthMm` is `2 ×` the **wall-normal seat offset**; for a body seated by a joint that is not the rear overhang, and 560 on a 600-deep carcass is the honest record of it. `KNOWN_WALL_GAP_M` carries `p25 → −0.02`, pinned by value. | **The governing record, obeyed rather than revised.** Decision 2 stated the rule and nothing enforced it; decision 2 here is that enforcement. Decision 3's pinned literal is kept as an independent third statement (decision 5, clause 5) and deliberately not derived from the new field. |
| [ADR 0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md) decisions 2 and 3 | The hood hangs from the front on the cabinet-depth line; row 19's second named exception, declared and measured, never a tolerance. | **Extended, not overturned**, and stated as such in decision 3. The per-entry keying its comment argues for is preserved; only the file it lives in changes. The gap, the pinned `p13 → +0.1` and the geometry are untouched. |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap B | `deriveFrame` resolves `placement.body.seatDepthMm ?? definition.frameDepthMm`. | **Narrowed, declared, and listed in Supersessions** (decision 4). The `??` stands for every body whose seat is a property of its own mesh; for a joint-seated body the left operand is meaningless and is not read. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 4 | A declaration, never a computation; two numbers must not agree by luck. | **The standard the whole record is measured against.** Cited against the three copies of the property, against deriving the seat rule from `occupiedDepth`, and — decision 1's last clause — against writing the rule so that the measurement's *agreement* is an input to it. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md), [ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md), [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A depth fact is declared per entry, never inferred from a kind or from geometry; an entry that declares nothing throws. | **The stance taken, and the precedent copied field for field**, down to required-on-`BodyShape` / optional-on-`BodyDefinition` / refused-at-assembly. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decision 1 | A `buildId` rather than a chain enum: never a second statement of arithmetic the catalogue already owns. | **The reason the `joint` arm carries no `meetsBuildId`.** |
| [ADR 0075](0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md) decision 3 and amendment clause 4 | Never edit a declaration to make a probe assertion green; the structural family is excluded from the round trip and *"that the real probe cannot measure them at all is larger than this record and is reported separately."* | **This is that separate report.** Decision 3's stance is obeyed in the inverse direction: the declaration is kept and the **command** stops overwriting it. The exclusion is corrected, not deleted (decision 6). |
| [ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md) | A finding owes a confirming measurement, not only a reading. | **Discharged before writing**: the two tables in *Context* are runs, not readings. |
| [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | A load that refuses is a dead link. | **Decision 4.** A document carrying the stale seat loads and is corrected on read; nothing is refused and nothing is rewritten. |
| [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) | A seeded entry declares the catalogue entry it is equivalent to. | **Unchanged, and it is why the reach is what it is**: only the four rows with no equivalent travel `reseat`. `hood-600` resolves away, which is why its own declared/measured mismatch is latent rather than live. |
| `docs/BACKLOG.md` entry 31 | A store action that throws leaves no trace on any surface; the `reseat` crash itself is fixed. | **No conflict, and the connection is named**: fixing that crash is what turned this from a loud failure into a silent one. Entry 31's own subject — the stranded sheet — is untouched and stays unscheduled. |

Nothing found in the sweep contradicts this decision. No earlier record rules on where the
seated-plane property is declared; ADR 0025 and ADR 0039 each state one case and neither generalises.

## Consequences

- **Wave 6K-g implements this**, sequenced **after 6K-f**. Both waves edit
  `commands/set-cabinet-depth.ts` — 6K-f replaces its `try/finally` with `use`, this one rewrites
  `reseat` — and 6K-f is in flight. If the order has to invert, the cost is one rebase of 6K-f and
  nothing conceptual; it is a merge-surface choice, not a dependency.
- **The shipped scene does not move** for any design that has never had its depth changed. `p25`
  carries no `seatDepthMm` in the fixture and falls back to the same 560 it does today. M1's fidelity
  gate, the decomposition-parity partition and the row-19 assertions are all unchanged on the
  fixture.
- **A design that *has* had its depth changed moves 20 mm on load, and that is the correction.** Its
  `p25` stops intersecting `p26`. This is the one place the change is visible, and it is a correction
  rather than a migration — nothing stored is rewritten.
- **Every catalogue entry gains a line.** Roughly thirty rows across two populations, most of them
  inherited from four shared shapes. The compiler drives the §7 half; `refuseUndeclaredSeatRules`
  drives the seeded half.
- **Three hand-written sets are retired and one is deliberately kept.** `FRONT_ALIGNED_BUILD_IDS` and
  `NOT_SEATED_ON_THE_WALL_PLANE` are deleted. `KNOWN_WALL_GAP_M` stays, pinned by value, as the
  independent check on the declaration.
- **A residual, stated out loud.** The `joint` arm has one member, so decision 5's gates are proved
  against a population of one. A second joint-seated body would be the first real test of clause 4's
  non-intersection gate. This is accepted rather than solved: the alternative is inventing a second
  member, and a catalogue entry that exists to exercise a test is worse than a gate proved once.
- **A second residual.** If a joint-seated body ever becomes insertable, the neighbour becomes a
  per-placement fact and the `meetsBuildId` alternative has to be revisited. Nothing today can reach
  it: `base-corner-x-900` is `insertable: false` and `canDelete: false`.

## Addendum, 2026-09-05 — the same principle asked of the opening; nothing above is revised

A second confirmed defect was reported hours after the ruling above. It is **the same question one
level up**, and this record answers both rather than splitting them — with the caveat that they are
one *principle* in two *clauses*, not one clause applied twice. Saying which, exactly, is the first
thing this addendum owes.

### The second defect, measured

Reproduced headless against the real adapter probe on the unfiltered seeded kitchen, 2026-09-05.
Wall-cabinet seats and the columns they publish:

```
600 (seatless fixture) → 700     p8/p10/p15/p16 = 361     A|0.30=400  A|0.75=400  B|0.61=400
600 (seatless fixture) → 600     p8/p10/p15/p16 = 291     A|0.30=330  A|0.75=330  B|0.61=330
600 → 600 → 700                  p8/p10/p15/p16 = 291     A|0.30=330  A|0.75=330  B|0.61=400
600 → 700 → 600 → 700            p8/p10/p15/p16 = 291     A|0.30=330  A|0.75=330  B|0.61=400
600 → 700 → 600                  p8/p10/p15/p16 = 291     A|0.30=330  A|0.75=330  B|0.61=330
```

Four `wall-cabinet` bodies come back carrying the **600 mm shell** in a 700 mm kitchen, and their
columns publish **330 against the map's 400**. It survives a save, a reload and a further change. It
is not drift and it does not compound — a straight run of three round trips is stable, and both
idempotency checks pass.

**`B|0.61` is the fingerprint, and it is decisive.** That column publishes the correct 400 in the
broken runs, and the reason is not a tolerance or an accident: its only members are `p9` and `p21`,
`wall-corner-return-570` and `-570-top`, which travel `reseat` rather than `rebuild`. `reseat` asks
the catalogue at the new depth and never looks at an opening, so it is re-seated to 361 while every
`wall-cabinet` beside it stays at 291. **The one column that is right is right because its members
bypass the opening entirely.**

### The mechanism, and why the direction is asymmetric

1. `rebuildEveryBodyAt` derives its records from the design through
   `derivePlacementRecords(design, catalog@new)`. Each `frame.d` comes from the **stored**
   `seatDepthMm` under ADR 0011 Gap B's `??`.
2. `deriveColumns(records, {}, room)` takes §3.2's MAX over those records, so `Column.d` is a fact
   about the depth the kitchen is *leaving*. The `{}` already discards the frozen extents for exactly
   this reason — *"re-deriving is the point"* — but the records it re-derives from are themselves
   stale, so the discard buys nothing.
3. `rebuild` plans against that column, and `resolveDepthM`'s capped arm returns
   `shallowerBuildDepthM(declaredM, buildToTheClearanceM(column.d))` — `min(400, 330) = 330`.
4. The probe builds a 330 mm wall cabinet, measures 291, and 291 is persisted. Stable, and wrong.

**Deepening is broken and shallowing is not, and the asymmetry is entirely in that `min`.** Going
600 → 700 the stale clearance (330) is *shallower* than the declared row (400), so it wins the `min`
and caps the rebuild below the map. Going 700 → 600 the stale clearance (400) is *deeper* than the
declared row (330), the declaration wins, and the result is correct. Nothing protects the deepening
direction; the shallowing direction is protected by arithmetic rather than by a rule, which is
[ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 4's subject once more.

The floor's own comment states the purpose it was given: *"a column shallower than the declared depth
keeps its own depth, so a body can never be built past the space that actually exists."* That is
right for an **insert**, where the run standing there is a fixed premise. At a **depth change** the
bodies that produced `column.d` are the very bodies being replaced, so "the space that actually
exists" is a statement about a kitchen that is being dismantled. The floor is circular there, and
`rebuild`'s own doc comment says so without meaning to: *"the depth is the opening this body already
stands in, because a resize changes a width and nothing else."* A depth change changes exactly that.

### Are they one question? One principle, two clauses — and each arm of this command has one

They are not the same clause, and pretending otherwise would produce a rule that is true of neither.

> **A recorded seat carries two qualifiers that the number itself does not: which quantity it
> measures, and which setting it was taken at. Reading a seat without either is the defect.**
>
> - **Clause 1 — quantity.** A seat may come from a measurement only where the measurement is of the
>   quantity the seat encodes. Decision 1 above; `base-corner-x-900` is the case.
> - **Clause 2 — setting.** A recorded seat is authoritative for the design at the setting it was
>   taken at, and for nothing else. **The command that changes the setting must therefore not read a
>   stored seat as an input to what it builds** — not directly, and not through a column, an opening
>   or a void derived from one.

The two clauses are independent: neither implies the other, and each has its own defect. What makes
them one record is that **each arm of `setCabinetDepth` satisfies exactly one of them**, and the two
arms fail in opposite directions:

| Arm | Clause 1 — quantity | Clause 2 — setting |
| --- | --- | --- |
| `reseat` | **fails** — persists a measured rear overhang as a joint seat (`base-corner-x-900`) | **holds** — asks the catalogue at the new depth, reads no opening (`B\|0.61` is correct because of it) |
| `rebuild` | holds — every body it writes is wall-plane- or front-line-seated | **fails** — plans against an opening derived from stored seats |

One command, two arms, two clauses, and each arm carries exactly the protection the other lacks.
That is why this is one record and why fixing either alone leaves a live defect.

### Decision 8 — a depth change plans against the catalogue, not against the seats it is about to replace

`rebuildEveryBodyAt` derives the records and columns it plans against from the design **with the
recorded seat cleared on every placement whose entry declares that its depth follows the setting**,
and hands that same design to `rebuild`. `frame.d` then falls back to `definition.frameDepthMm` at
the **new** depth, which is the number the first deepening from a seatless fixture already gets right.

**The exclusion is a declaration and not a list.** `depthFollowsSetting` — the predicate
`movesWithTheSetting` already asks one branch over — is the only question asked. A body that declares
`manufactured-size` or one of [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md)'s pins keeps
its stored seat and its full contribution to §3.2's MAX, because **its seat is not a fact about the
setting**: it is a fact about a manufactured object, and clearing it would be the mirror of this
defect. Measured — `B|2.45` publishes 742 in every run above and in every run below, before and after.

**This is the move the command already makes, extended one level.** It passes `{}` for the frozen
extents because ADR 0011 Gap D's freeze records the depth the session opened at and this command
changes exactly that. The same sentence is true of a recorded seat. Discarding the extents while
re-deriving from stale seats discards the copy and keeps the original.

Simulated on the shipped fixture with a real probe before ruling — the fix applied, every other
column compared:

```
BROKEN  settled → 700     A|0.30=330 A|0.75=330 | B|0.61=400 B|2.45=742 B|1.20=738 B|1.80=699 A|1.30=720
FIXED   settled → 700     A|0.30=400 A|0.75=400 | B|0.61=400 B|2.45=742 B|1.20=738 B|1.80=699 A|1.30=720
FIXED   600→700→600→700   A|0.30=400 A|0.75=400 | B|0.61=400 B|2.45=742 B|1.20=738 B|1.80=699 A|1.30=720
FIXED   600→700→600       A|0.30=330 A|0.75=330 | B|0.61=330 B|2.45=742 B|1.20=638 B|1.80=600 A|1.30=620
```

Only the two broken columns move, and they move to the values the straight path already produces.
Every other column is byte-identical to the broken run, in both directions.

### What happens to ADR 0011 Gap B, stated exactly

Gap B exists because *"`frameDepthMm` is a measurement of one specific seeded body and cannot seat a
parameterised one"* — a `wall-cabinet` built 600 deep over a full-height column records 561, and no
catalogue number states that. **That protection is not weakened anywhere it applies.**

- **Gap B is untouched on every read path.** Load, `derivePlacementRecords` outside this command,
  scene sync, picking, the panel, pricing and validation all read `seatDepthMm ?? frameDepthMm`
  exactly as today. Decision 8 changes what **one command plans against**, not what a seat means.
- **The suspension is bounded by a declaration.** Only inside `setCabinetDepth`, only for entries
  that declare `depthFollowsSetting`, only for deriving the openings the rebuild plans against.
- **And the case Gap B protects is re-derived rather than lost, which is why this is safe.** The
  deep wall cabinet's 561 is not an independent fact — it is a *consequence* of standing over a
  full-height column. `resolveDepthM` re-answers it from `column.hasFullHeightUnder`, whose lifted arm
  is `cabinetDepthLineMm(cabinetDepthMm)` and **never reads `column.d` at all**; and
  `hasFullHeightUnder` is derived from which members are present, which clearing a seat cannot change.
  So that body is rebuilt to the cabinet-depth line at the new setting and re-measures its own 561 or
  661. **The information is recovered from the column, which is where it lives.**

Contrast this with decision 4's read-side rule, which *is* a narrowing of Gap B and is recorded as
one: there, a joint-seated body's stored seat is ignored on **every** path, because it records a
quantity the body does not own. Clause 2 suspends nothing outside one command. The two are listed
separately in the index's Supersessions for that reason.

### What is not claimed

- **Not reversibility.** [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) and
  [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) both decline byte-equal
  round trips and this does not overturn them. What decision 8 buys is narrower and is the property
  actually wanted: **arrival at a depth is independent of the seats the design was carrying when it
  got there.** ADR 0073's own residues — a member-less column's frozen extent, a merged extent whose
  source was lost — are untouched, are about extents rather than seats, and remain 6K-c's.
- **Not a change to `resolveDepthM`.** The floor stays exactly where ADR 0060 decision 3 put it, and
  the capped arm keeps reading the column rather than the opening. It was given a stale column; it
  is now given a current one.
- **Not a fix for clause 1.** Decision 8 leaves `base-corner-x-900` mis-seated, and decisions 1–7
  leave the wall run shallow. Neither closes the other.

### The trigger, named correctly, and the criterion it forces

**The trigger is "the wall cabinets in a column already carry a seat written at a shallower
setting", reached however — not a change count.** "Second deepening" is the wrong name: it is merely
the commonest route.

Reachable routes, all of them ordinary:

- **a depth change to the same value** — pressing *Aplică* on 600 in a 600 mm kitchen rebuilds every
  body and writes every seat, and the next deepening is then wrong;
- **the return leg of any round trip**, which is the same thing;
- **a `setWidth` on that wall column**, which rebuilds every member of the column
  ([ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md)) and seats them all.

The seatless state is the pristine fixture and nothing else. It does not survive the first command
that rebuilds the run, which is why `600 → 700` from `KITCHEN_L_DESIGN` looks clean and proves
nothing.

**And it takes the whole column, which is what will make a naive test pass.** `Column.d` is a MAX, so
one stale member is rescued by any deeper sibling. Measured on `A|0.30`, which holds `p8` and `p15`:

```
seat p8 only          → A|0.30 = 400   (correct — the MAX takes p15's declared 400)
seat p8 and p15       → A|0.30 = 330   (broken)
seat all four bodies  → A|0.30 = 330, A|0.75 = 330
```

So a test that seats one body and deepens **passes while the defect stands**, and so does a test that
changes the depth once from the fixture. The criterion has to name the *state* — a column whose every
depth-following member carries a seat written at another setting — and reach it by at least two
different routes.

### Sequencing

**Wave 6K-h implements decision 8, and it runs before 6K-g.** Clause 2 is reachable by any customer
who uses the depth control twice and shows as wall cabinets standing 70 mm out of line — ADR 0073's
own words for the same symptom, *"[ADR 0028]'s reported defect in mirror image"*. Its fix is one
helper in one function. Clause 1's fix is a catalogue-wide field, a port change and roughly thirty
declarations. Shipping the small visible fix first is the ordering that leaves the least broken
kitchen in between, and the two touch different parts of `set-cabinet-depth.ts`.
