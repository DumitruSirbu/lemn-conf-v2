# ADR 0083 — The demo room clears its run at both depths, wall coverage is the run's extent, and an overrun is not a negative remainder

Status: Accepted
Date: 2026-09-05
Type: Decision (owner ruling) + Finding
Milestone: M6 — opens waves 6N-a, 6N-b, 6N-c and 6J-c; reaches M7's room control
Amends: the M6 plan's owner decision 8 (the *"satisfied at both depths"* index row) and
[ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)'s wall B figure of 2830

## The instruction, and its history in one day

The owner, 2026-09-05, first: *"if is required 2830 to fit current demo, then make this the demo room
size."* Then, on being told what 2830 costs at the deeper setting, reversing it: *"then for 700 deep
adapt and make 2900."* Then, on the clearance question: *"yes add clearance 20-50 mm."*

**So the demo room's wall B is long enough that the run fits at 700 as well as at 600, with real
clearance rather than a flush fit.** The first instruction — 2830, and a visible overflow marking on
the default design at 700 — is superseded by the owner the same day and is recorded here only so a
reader does not find it quoted elsewhere and think it stands.

## Decision

**1. The seeded design's room is `3560 × 2920`, and this is a deliberate divergence from the
measured kitchen rather than a correction toward it.** Wall A stays at the reference's **3560**;
measurement confirms wall B's length does not move it. Wall B goes **2830 → 2920** — the run's
intended 700 mm end at 2900, plus 20 mm.

**The direction matters and is the opposite of how this was first framed.** The fixture already *is*
the reference: `2830` is the wall-coverage panel's own figure, landed on 2026-09-03 and corroborated
against built geometry to the millimetre. So this does not bring the demo closer to the measured
room; it moves the demo **90 mm away from it**, on purpose.

- **The reason:** the demo must fit at both declared cabinet depths. At 2830 it fits at 600 with
  30 mm spare and overruns by 70 mm at 700, which would put ADR 0065's marking on the default design
  at the deeper setting.
- **The cost, stated to the owner before they chose and recorded here as accepted:** *the room is no
  longer the kitchen it was measured from, and the wall-coverage bars are dividing by an invented
  number.* Wave 6N-b pins that at the assertion, so no later reader takes the demo as a survey of a
  real room and "corrects" it back to 2830.
- **What is not affected:** wall A. Its 3560 is still the reference's, and the bar's two denominators
  are therefore **not the same kind of number** — one measured, one chosen. That asymmetry is
  deliberate and is worth a comment wherever both appear.

**The owner's clearance range is 20–50 mm**, recorded beside the number so that a later wave needing
2930 or 2950 is making a **fixture adjustment inside a ruled range**, not a new decision to go and
ask about. Below 20 or above 50 is a new question.

**Measured, for this change rather than inferred from the last one.** `2830 → 2920` on the seeded
design leaves **every derived artefact byte-identical**: `derivePlacementRecords` (26 records),
`deriveColumns` (12 columns), `validateDesignForCatalog` (no issues), `findOverflowingPlacementIds`
(empty), and `DesignSchema` parses at both. **No body, no column, no extent and no void moves.** It
is purely the validation envelope, and that is now a measurement rather than an inference from
`75668b8`.

**The envelope is nonetheless observable, so "nothing changes" would be too strong.** A member-less
column spanning 2600–2900 on wall B raises `EMPTY_COLUMN_PAST_WALL_END` at 2830 and **not** at 2920.
Nothing in the seeded design occupies that band, so no shipped state differs — but any document
that puts something between 2830 and 2920 is judged differently, and that is what the six test files
below are actually asserting.

**2. The room is a fixed dimension and is never a function of the cabinet-depth setting.** *"For 700
deep adapt and make 2900"* is read as *choose a wall length that clears the run at 700*, not as *let
the room grow when the customer chooses 700*. Three reasons, and the third is decisive:

- A room is a physical constraint the customer measures. [ADR 0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md)
  is explicit that the manufacturer meets the real wall at the real measurement.
- `docs/milestones/M7-room-and-presets.md` owns wall lengths as **customer input**. A setting that
  silently rewrote one would be overwriting what the customer typed.
- **A room that grows with the setting makes ADR 0065's fit gate vacuous** — the run could never
  pass the end of its wall, so the marking could never fire on any design, not merely on the demo.
  That deletes a shipped feature rather than declining to demonstrate it.

**3. A run ending exactly on its wall FITS, and this is a fact about the gate rather than about this
fixture.** Recorded because the next person choosing a wall length should not have to re-derive it.

`placementExtendsPastOwnWall` compares `alongMm + widthMm / 2 > wallLengthMm(...)` — **strict**, so
equality passes. ADR 0065 decision 4 states it (*"Equality fits"*), and
`tests/queries/overflowing-placements.test.ts` already asserts it in both directions on both walls,
including the half-millimetre boundary an odd buildable width produces.

**There is no float noise on this path.** `DesignSchema` holds `alongMm` and `widthMm` to `.int()`;
the frame depths the chain shift is derived from are whole millimetres (560/660 base, 291/361 wall
map), so the deltas are exactly 100 and 70; the run's end at 700 is exactly **2900**
(`Number.isInteger` confirmed on the computed value). Integers and half-integers compare exactly in
IEEE 754.

**So 2900 would have been safe, and [ADR 0015](0015-min-span-is-exclusive.md) does not reach this
comparison** — its exclusive rule is about a *span minimum*, a different bound. **2920 is therefore
headroom the owner asked for, not a defensive rounding**, and this record says so explicitly so it
is not later "simplified" back to 2900 as a tidy-up.

**4. A wall's occupied width is the furthest along-wall reach of anything standing on it, measured
from the wall's own origin — never a sum of body widths, and never a union of their spans.**

This is [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decision 5's rule
reused, not restated: the bar's numerator and the overflow mark's bound must be **one quantity**, or
a design can be marked as overrunning while its bar reads under-full.

It needs a decision because the reference cannot settle it. The panel gives four numbers — *Perete A
3520 / 3560*, *Perete B 2800 / 2830* — and **two different rules reproduce all four**, because the
seeded run is contiguous on both walls:

| Rule | Wall A @ 600 | Wall B @ 600 | Diverges |
| --- | --- | --- | --- |
| **Furthest reach** (chosen) | 3500 | 2800 | — |
| Sum of body widths | 3500 | 2220 (base row) | Immediately — **refuted by the reference itself** |
| Union of body spans | 3500 | 2800 | On the first interior empty space |

The sum is refuted by measurement: wall B's base row sums to 2220 against the reference's 2800, and
wall B's run does not start at its origin — its first 580 mm is wall A's corner body turning the
corner. The union agrees on this kitchen and disagrees on a kitchen with a gap in it, which is one
delete away and a legal state ([ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md)).

**Accepted consequence:** a design with a 600 mm empty space mid-run reports the same occupied width
as one without it. The bar describes **how much wall the run spans**, not how much cabinetry stands
on it. Whether the heading *"LĂȚIME ACOPERITĂ"* can carry that is reserved to the owner below.

**5. The finished end panel is part of wall A's occupied width, and its seat is derived once.**
[ADR 0045](0045-the-run-end-panel-follows-the-run-it-closes.md) makes `end_panel_right` part of the
product model — a declared `layoutRole`, not scene dressing — and it stands in 19 of wall A's
60 remaining millimetres. A bar reporting 60 mm free at the right end is wrong on a screen that is
showing the panel.

**It may not be added as a second constant.** `RUN_END_PANEL_THICKNESS_M`, `RUN_END_PANEL_GAP_M` and
the seat rule that vetoes the panel when a full-height body already stands in its place live in
`packages/three-adapter/src/kitchen-shell.ts`, where the domain cannot read them. Two derivations of
one seat is [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)'s failure one seam over, and
worse than usual here: the two would agree on the shipped kitchen and part exactly on ADR 0045's
veto case, which is the case nobody screenshots. **The seat becomes a domain fact and the adapter
reads it** (wave 6N-a). The panel's *existence* stays a literal in the shell manifest — `db9c402`'s
boundary is not re-crossed.

**Wall B carries no finished end.** The reference kitchen has one panel and it closes wall A's base
run. A wave that gives wall B one is changing the product.

**The reference is one millimetre coarser than the derivation, and that is not a defect to fix.**
The panel says *3520 / 40 mm liberi*; the derivation gives **3519 / 41**, because the outer face is
`3500 + 1 mm gap + 18 mm slab` — the `3.5189999` `kitchen-shell.ts` names in its own comment. The
reference rounded. **No wave may recover 3520 by declaring a 20 mm constant**: that pins a rounding
and stops the finished end tracking the run it closes.

**6. An overrun is published as its own non-negative number beside a zero remainder. There is no
signed "free" field.** `remainderMm ≥ 0`, `overrunMm ≥ 0`, **at most one non-zero**, both zero when a
run ends exactly on its wall (decision 3's state, now a reachable one).

Not a formatting preference. ADR 0067 rules that a remainder is *the product working* and an overrun
is *the product being wrong*; one signed field makes those the same fact with a sign bit, and invites
the reader who writes `if (free < 100) warn(...)` and turns a normal 2444 mm wall into an error. Two
named fields make the wrong sentence not compile.

**7. The remainder is the tail of the run, always, and the reference's two phrasings describe one
place.** *"40 mm liberi la capătul din dreapta"* and *"30 mm liberi lângă frigider"* were read as two
derivations — one positional, one relative to a neighbour. **Measured, they are not.** `p7` is
`fridge-free-700` spanning 2100–2800, and 2800 *is* wall B's run end at 600: the fridge is named
because the fridge is the last body.

So the published fact is one query: `remainderMm`, plus the id of the placement whose far edge **is**
the run's far end. Which sentence the product speaks is copy, reserved below.

**`emptyColumns` is not a source, and the milestone prose saying so is wrong.** The seeded design
declares none; `clip-empty-columns-at-wall-end.ts` already clips every member-less column to its own
wall; nothing the product offers reaches past a run's end ([ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)'s
amendment). A wave that reads `emptyColumns` for the remainder finds nothing and concludes zero.

**8. Wave 6M's scene warning stays exactly where it is. 6N does not move, absorb or replace it.**
M6's 6N assessment argues a bar overflowing its track is the honest home for ADR 0065's marking and
that *"6M's warning has somewhere to live rather than floating over the scene"*. That reads as
licence to relocate it, and is not:

- ADR 0065 decision 7b **requires both strings to exist** and states neither restates the other. The
  scene warning says *what is wrong and what to do*; the flagged total says *what the price
  contains*. A coverage bar is a **third** thing — how much wall a run spans — and answers neither.
- The warning's placement was put to the owner and **accepted as built on 2026-09-04**, twice: the
  55.5 px / ~780 px separation from the flagged total, and its sitting under §9's sheet. Moving it
  overturns a dated ruling and needs the owner, not a wave's judgement.

What 6N *may* do, and what makes the bar honest without touching the warning: the bar **overflows its
own track** by the overrun rather than saturating at 100%, and the bodies in its list that
`findOverflowingPlacementIds` names carry the same mark the scene gives them — read from that one
query, never re-derived.

**9. The migration's corrected room follows the fixture, and the two are one declaration.**
`migrate-design.ts`'s `CORRECTED_ROOM_MM` becomes `{ 3560, 2920 }` and is **read from the fixture's
room rather than restated beside it**.

The arm exists to repair rows that *are copies of the demo*, written before 2026-09-03 while it
declared `3600 × 2400`; repairing them into a room the demo no longer has is the same
two-lists-that-agree-by-luck failure as decision 5, and it has a live consequence — a rescued row
whose customer then chooses 700 would overflow where the demo does not. The safety property wave
6A3 established is untouched: the corrected room is still **a constant, reached only at schema
version ≤ 2 from the exact pre-correction pair**, never a value derived from where the bodies stand.

There is nothing to weigh against it: the owner closed the stored-data question on 2026-09-03 — *the
app is in development and no stored row belongs to a customer.*

**10. ADR 0065's marking loses one assertion, not its demo — and the fixtures it keeps get
consolidated rather than multiplied.**

**Corrected from this record's first draft, which overstated the loss.** *"The marking would have no
demo at either depth"* is what decision 1 looked like before the tree was checked. Measured, it is
narrower and better:

- **What is genuinely lost: exactly one assertion.**
  `tests/queries/overflowing-placements.test.ts:247` — *"reports no seeded body at 600 and exactly
  `p7` and `p24` at 700"* — has no subject at 2920. It is the only place the marking is exercised
  **against the seeded kitchen's own geometry**.
- **What survives untouched, and why.** `OVERFLOWING_DESIGN` — the seeded kitchen plus one
  `dragged-past-wall-b` body — defines its position as `room.depthMm - 400 + 1`, **relative to the
  room rather than absolute**. At 2920 it lands at 2521 and still reaches 2921, one millimetre past
  the wall. So it follows the room automatically and keeps working. It is used across **six test
  files** plus `apps/web/tests/e2e/overflow-mark.e2e.spec.ts`, so the scene mark, the warning, the
  loading gate, the API seam and the end-to-end mint-and-resume path all keep their coverage on day
  one. Verified in the tree, not assumed.
- **What that exposes instead: the same fixture is hand-built six times.** Six copies that agree
  today because they were written together is decision 5's failure in the test tree, and it is a
  bigger exposure than the assertion being lost.

**Ruled:**

- **One declared overflow fixture beside `KITCHEN_L_DESIGN`, in `src/fixtures/`, with its
  overflowing population declared as data**, and the six hand-built copies plus the e2e spec's own
  `room.widthMm` shrink (3560 → 2800, inside the spec file) read it. Wave 6N-c's visual gate needs an
  overflowing bar to photograph and must read the same one.
- **The lost assertion is replaced, not deleted**: the seeded design reports **nothing overflowing at
  either declared depth**, asserted at both. That is a stronger claim than the one it replaces and is
  the owner's actual requirement — *the run fits the wall it stands on* — so the suite gains a
  criterion rather than losing one. A deleted assertion is indistinguishable from one that never
  existed.
- **`LARGE_REMAINDER_DESIGN` is promoted, not re-invented.** ADR 0067's large-remainder fixture
  **already exists** — defined twice, in `apps/web/tests/scene/overflow-mark.test.ts` and
  `overflow-warning.test.ts`, as wall A's run cut back to its first metre. Wave 6M's own QA already
  recorded that it *"asserts only `placements.length > 0`"*. So wave 6N-b's large-remainder criterion
  is **strengthen and single-source what is there**, not add a third copy.

## Finding — the along-wall chain has no production reader, so 2900 is a geometry the product does not build

**This is the load-bearing measurement of this record, and it changes what decision 1 buys.**

**Measured, by running the real `setCabinetDepth` command** against `KITCHEN_L_DESIGN` with the
domain's own fake probe (the built `dist`, not a model):

```
setCabinetDepth(700) ok=true rebuilt=22
  wall A: len=3560 far=3500 free=60
  wall B: len=2830 far=2800 free=30
  placements whose alongMm changed: 0
  placements whose widthMm changed: 0
  overflowing: []
```

**Zero placements move along their walls, and wall B's run still ends at 2800 at a 700 mm cabinet
depth.** `rebuild` writes `alongM: toMetres(plan.alongMm)` from `placement.alongMm`, and `reseat`
rewrites the seat and nothing else — by design, per its own commentary.

**Where 2900 comes from.** It is produced by `seededDesignAt`, a helper inside
`tests/queries/overflowing-placements.test.ts`, which shifts every wall-B `alongMm` by the frame-depth
delta of the chain the placement's entry declares. **Nothing in `src/` anywhere in the monorepo reads
`alongWallPositionFollows`** — grepped across `packages` and `apps`, excluding `dist`: the only
non-test occurrences are in `cabinet-depth-rule.ts`, which *declares* it.

**So M6 wave 6J-a's own acceptance criterion is unmet.** It says the chain becomes a declared
catalogue fact and *"this wave is where it gains a production reader, so it is where declaring it
stops being a rename."* The declaration shipped; the reader did not. Classified: **contract gap**
(6J-a named a behaviour and delivered a declaration) **with an implementation defect attached** (the
command that should read it does not), not a test-fidelity problem — the test's model is the
*correct* geometry.

**The chain is not optional, and the seeded design composes wrongly at 700 without it.** Measured
frame depths: wall A's `base-corner-x-900` goes 560 → 660 and the wall-map carcass 291 → 361, so at
700 the wall-A run reaches 100 mm (base) and 70 mm (wall band) further along wall B at the corner.
Wall B's `base-corner-return-320` starts at 580 and its `wall-corner-return-570` at 330 — 20 mm and
39 mm of headroom at 600, consumed and then some at 700. Wave 6I's review measured the same failure
independently and in built geometry: *"at 700 the reference room did not compose — carcasses through
walls, worktops intersecting, upper corner returns overlapping by 70 mm."*

**`validateDesignForCatalog` returns `[]` on the 700 design**, measured. It checks room containment
and column extents, not cross-wall corner intersection, so nothing today reports this.

**Consequence for decision 1, stated plainly rather than buried.** 2920 is the right wall length for
the product this project intends to ship and the wrong one for the tree as it stands today: until the
chain gains its reader, wall B's run ends at 2800 at **both** depths, so 2920 leaves **120 mm** of
bare wall instead of the reference's 30. That is a legal and unremarkable state under ADR 0067 — it
is neither marked, warned about, nor a defect — but a reader comparing the bar to the reference panel
will find 120 where the reference says 30, and should find this paragraph first.

**This does not reopen the owner's decision.** The owner ruled on the intended geometry, which is the
right thing to rule on; the gap is ours. **Wave 6J-c** below closes it.

## Reserved for the owner — two questions this record deliberately does not answer

**Q1. The reference panel itself is not in this repository.** Searched and not found: the three
tracked mockups (`docs/design/mockups/`), `DEVELOPMENT-SPEC.md`, `SPEC.md`, and the untracked
`design-source/Modern Kitchen Cabinets 3D (6)/` in full — no occurrence of *ACOPERIT*, *PLIN*,
*3520*, *2830* or *3560* in any of them. Every appearance of the panel's figures and copy in this
project is a **quotation inside our own prose**. So M6's claim that *"the reference already specifies
its copy and layout, so this is not a design task"* is **not supportable from the tree**. What is
missing is the artefact: which screen the panel belongs to, whether it is a section of frame 2D's
breakdown or its own surface, and the per-body list's format. **This blocks wave 6N-c and nothing
else.**

**Q2. The heading, the remainder sentence, and whether *"acoperită"* survives decision 4.** Already
reserved, unfilled, in M6 wave 6D's owner-ruled-strings table. This record adds a third clause to the
same question rather than opening a second: under decision 4, *acoperită* can be true of a run that
spans a wall with a gap in the middle of it. **A wave that words any of these is making a product
decision and must raise it.**

Neither may be answered by an implementer.

## Records swept before ruling

| Record | Bears on | Verdict |
| --- | --- | --- |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) | The bound, the extent rule, equality fits, the two strings | **Reused.** Decision 5 supplies the numerator; 7b forbids absorbing the warning. **Its Context's wall B figure of 2830 is superseded by decision 1**, and its 2900-at-700 measurement is the *intended* geometry — see the Finding |
| [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | A remainder is normal; names 6N as owing a large-remainder fixture | Honoured. It is also why 2920's 120 mm of bare wall is not a defect |
| [0015](0015-min-span-is-exclusive.md) | Exclusive spans | **Does not reach the fit gate** — it bounds a span minimum, not this comparison. Checked because a flush fit looked like its shape |
| [0045](0045-the-run-end-panel-follows-the-run-it-closes.md) | The panel follows the last base cabinet, hides on a veto | Extended in *where the rule lives*, unchanged in *what it says*. Membership stays a literal |
| [0028](0028-wall-depth-is-derived-from-the-worktop.md) | Two lists that agree by luck | The argument for decisions 5, 9 and 10 |
| [0055](0055-a-depth-change-migrates-the-stored-design.md) | Migrate on change; nothing left behind | Untouched. Decision 9 changes a constant's value, not the arm's shape or its version gate |
| [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | Normalise a stored document, never refuse it | The precedent decision 9 follows |
| [0043](0043-an-empty-space-of-any-width-is-a-legal-state.md), [0044](0044-an-empty-space-is-recorded-in-the-design-document.md) | An empty space is legal and recorded | Why extent-versus-union needs a decision at all |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) + amendment | The product never offers a slot past a wall's end; the clip ships | Why no empty column holds the tail remainder |
| [0058](0058-the-two-deep-top-cabinets-are-pinned.md), [0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A declaration nothing reads is the failure mode | The frame for the Finding: `alongWallPositionFollows` is exactly that today |
| [0063](0063-a-group-is-listed-row-major-height-before-position.md) | Row-major listing within a group | The per-wall body list is the projection's order, unchanged |
| [0080](0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md) | Empty spaces follow the setting | No interaction: decision 4 excludes empty space from the numerator by construction |
| [0053](0053-the-design-document-records-the-whole-frozen-map.md) | Schema versioning | No document field is added; no bump is owed by 6N. Decision 9 changes a value the existing v2 arm writes, at a version gate that already exists |
| [0001](0001-initial-product-and-stack.md) decision 4, [0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md) | *De la*; show the reason, never silently change | Untouched; the second is the posture decision 8 preserves |

**One record is amended and none is overturned**: ADR 0065's Context gives wall B as 2830, which
decision 1 replaces on the owner's ruling. Its *rules* — the bound, the one-sidedness, equality
fitting, mark-don't-move — are untouched, and decision 10 exists so that the feature they describe
keeps a demonstration.
