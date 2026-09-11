# ADR 0090 — A frozen space slides with the run it belongs to, and follows the body it recorded

Status: Accepted — **decision 4a overturned by this record's own amendment of 2026-09-06** (see *Amendment A*), and **decision 4b's seam corrected by *Amendment B***, both at the end. Decisions 1, 2, 3 and 5–8 stand.
Date: 2026-09-06
Type: Decision (adjudication of the seam wave 6J-c exposed) + Finding
Milestone: M6 — opens wave 6J-d; **amends [ADR 0088](0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md)
decision 1**, which is recorded and not yet implemented (wave 6K-i)

## What was asked

Wave 6J-c implemented [ADR 0089](0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md):
`setCabinetDepth` slides each wall-B placement along its wall by the chain its catalogue entry
declares. The wave's implementer met every criterion in its plan and then found that
`Design.emptyColumns` and `Design.columnExtents` are **positioned** facts — `wall`, `alongMm`,
`widthMm` — that the command does not move, and asked one question it could not answer for itself:

> Which chain does a member-less wall-B empty space follow, and what happens when it declares no
> source?

That question is real and this record answers it. It is also **the tail of the defect and not its
head**, which the measurement below establishes before anything is ruled: four of the five wall-B
entries that appear as "member-less spaces" at 700 mm are not spaces at all. They are **occupied
columns whose members walked out from under them**, and a ruling that reached only the member-less
case would have left the shipped kitchen unsaveable.

## Sweep of the decision records, before deciding

Grepped `docs/decisions/` for `alongMm`, `emptyColumns`, `columnExtents`, `depthFromBuildId`,
`alongWallPositionFollows`, `Gap D` and `one document answers one way`.

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [ADR 0089](0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md) | `alongWallPositionFollows` is kept and its reader is the depth command; it selects between two behaviours per **catalogue entry**. | **Extended, not overturned.** It ruled who reads the field when there is an entry. This rules what reads it when there is no entry to read. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decision 1 | A frozen extent records `depthFromBuildId` — the body whose declaration produced its depth — because it is the one fact a member-less column could not otherwise keep. | **Its *reading* is extended to a second axis; its shape is unchanged.** No new field, no schema change. Decisions 2 and 3 are untouched. |
| [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decisions 1–2 | The pairing invariant: a depth and the body that produced it travel together or neither does. | **Widened by one member.** The along-wall coordinate joins the pair, for the same reason and by the same mechanism. |
| [ADR 0080](0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md) decisions 2, 4, 5 | A space **follows** the kitchen rather than **disappearing** from it; a sourceless extent is answered at read time from two fields of one document; the sourceless population is closed and is not migrated. | **The governing precedent for decision 4 below**, followed rather than overturned. |
| [ADR 0088](0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md) decision 1 | *"The planning map carries the frozen extent's vertical and **along-wall** axes, and re-derives the depth axis."* | **Amended by decision 6.** Written on 2026-09-06 against a command that moved nothing along the wall. It is recorded and **not implemented** — wave 6K-i is owed — so this is an amendment to a plan, not to shipped code. |
| ADR 0088 decision 2 | *"The axis split has one author"* — whichever seam writes it, a reader must find one statement, and the wave states which it chose and why. | **The rule that decides decision 5.** This record makes the choice ADR 0088 deliberately left open, and states the measurement behind it. |
| [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) decision 1 | Every body adapts, nothing is left behind, and the document need not round-trip. | **Load-bearing for decision 4.** It is what permits a legacy space to be lost rather than published overlapping. |
| [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | *"A load that refuses is a dead link"*; 5 stored rows at `schema_version` 1. | **Respected.** Nothing here refuses a load, and no new validation code is added. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md) decision 2, [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A depth question is *declared per entry, **never inferred from a band or a kind***. | **Upheld, and upgraded from a stance to a measurement** — decision 3 shows band inference is provably wrong on the shipped catalogue, not merely unfashionable. |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D, as narrowed 2026-08-26 | A column's extent is frozen so a delete frees space; its live predicates are not frozen; one document answers one way whatever route reached it. | **Enforced, not amended.** Decision 2 moves an extent's anchor and never re-derives its width, floor or top from what stands in it. |
| [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md), [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) | The clip → split → merge funnel over every published map, and the wall-end clip that opens it. | **Decision 4's new stage joins that family**, ahead of the split, on the same "a clip only ever shrinks" argument the funnel's own commentary makes. |
| [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) | A body past its wall's end is marked, never moved back. | **Untouched.** The two `PLACEMENT_PAST_WALL_END` marks in the measurement below are 6J-c working as its plan says. |

**Nothing found in the sweep contradicts this record.** One record is amended — ADR 0088 decision 1 —
and the amendment is stated explicitly in decision 6 rather than left to be inferred.

## The measurement

Run by this record at `e28ab25` **with wave 6J-c's uncommitted working tree**, driving
`createConfiguratorStore` over `KITCHEN_L_DESIGN` with the fake probe, `p5` and `p22` removed, through
`setCabinetDepth(700)` and back. Every number below is from that run.

### The published map keeps the coordinates the command just left

| | at 600 | **at 700** | back at 600 |
| --- | --- | --- | --- |
| `columns` keys | the 12 | **the same 12** | the same 12 |
| the wall-B keys the **records** are filed under | `B\|0.61 B\|0.74 B\|1.80 B\|2.45` | **`B\|0.69 B\|0.84 B\|1.90 B\|2.55`** | back to the 600 set |
| record columns holding no column in the map | none | **four — every wall-B body** | none |
| `design.emptyColumns` | 1 | **5** | 1 |
| `design.columnExtents` | 11 | **7** | 11 |
| `voids` | 3 | **12** | 3 |

The four are not spaces. They are `B|0.61`, `B|0.74`, `B|1.80` and `B|2.45` — the columns of
`wall-corner-return-570`/`-top`, `base-corner-return-320`, `tall-pantry-600`/`wall-2door-600-deep-top`
and `fridge-free-700`/`wall-2door-700-over-fridge`. `projectFrozenMap` partitions on
`occupiedKeys.has(key)` and the records moved to other keys, so **four standing runs are recorded as
free space at the coordinates the cabinets used to occupy**, and `recomputeVoids` publishes openings
through them: 3 → 12.

### The document the store then holds is one the product's own write seam refuses

`validateDesignForCatalog(state.design, buildKitchenLBodyCatalog(700))`:

```
PLACEMENT_PAST_WALL_END       placements.7.alongMm     mark     (ADR 0065 — 6J-c working as planned)
PLACEMENT_PAST_WALL_END       placements.23.alongMm    mark     (ADR 0065 — 6J-c working as planned)
EMPTY_COLUMN_OVERLAPS_PLACEMENT  emptyColumns.0        REFUSAL
EMPTY_COLUMN_OVERLAPS_PLACEMENT  emptyColumns.1        REFUSAL
EMPTY_COLUMN_OVERLAPS_PLACEMENT  emptyColumns.2        REFUSAL
EMPTY_COLUMN_OVERLAPS_PLACEMENT  emptyColumns.3        REFUSAL
EMPTY_COLUMN_OVERLAPS_PLACEMENT  emptyColumns.4        REFUSAL
```

`EMPTY_COLUMN_OVERLAPS_PLACEMENT` is declared `"refusal"` (`validate-design.ts:222`), and
`apps/web/src/app/api/designs/[id]/route.ts`'s `refuseUnexecutableDesign` runs
`fatalDesignValidationIssues` over exactly this validator at the write seam. **So a customer who
changes the shipped kitchen to 700 mm cannot save it: the PUT returns 400.** At 600 the same call
returns `[]`, before and after the round trip.

This is why the question could not be answered as posed. Answering only *"which chain does a
member-less space follow"* fixes at most one of the five entries and leaves four refusals standing.

### Where the domain result is already wrong, one package before the store

`setCabinetDepth` returns `{ ...design, placements: [...rebuilt] }`. `design.emptyColumns` and
`design.columnExtents` ride across **verbatim**, on a document whose placements the same expression
just moved. The command therefore returns a self-contradicting `Design` before
`applyCommandResult` is reached, and it is only because the store overwrites both arrays from its own
map that the contradiction takes the shape it does rather than a worse one. **No store arm can be the
defect here**; the store is downstream of a result that was already inconsistent.

### The gate

Run by this record, same tree: `@lemnaria/configurator-domain` **2 835 passed / 133 files, green**;
`@lemnaria/three-adapter` **2 204 passed / 59 files, green**; `@lemnaria/web` **8 failed, 1 530
passed, 4 skipped over 101 files (4 failed files)**.

## Classification

Three things were tangled in the report and they are three different kinds of problem.

- **The four phantom spaces and the five refusals: an implementation defect in wave 6J-c**, not a
  contract gap. Nothing new had to be decided for the returned document to be wrong — the rule it
  breaks, `EMPTY_COLUMN_OVERLAPS_PLACEMENT`, has been in `validate-design.ts` since ADR 0044 and is
  declared a refusal. The wave's *plan* did not foresee it, which is a gap in the plan; the tree is a
  defect.
- **The chain of a member-less space: a genuine contract gap.** No record says what a positioned fact
  with no member follows. Decisions 1–4 close it.
- **The eight red web tests: not a test-fidelity problem.** Six of them assert invariants that 6J-c
  broke — see decision 7. Two pin wall-B coordinates and are fixtures.

## Decision

### 1. A positioned fact in the frozen map moves with the run it belongs to, and the command that moves the run moves it

Stated as a rule, so the next one lands without re-litigation:

> **`Design.emptyColumns` and `Design.columnExtents` record where a column stands, not merely how deep
> and how tall it is. Any command that changes a placement's `alongMm` changes them in the same
> result. A command may not return a document whose recorded map contradicts its own placements.**

This is not new policy dressed up. It is [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md)'s
premise — the document records the whole frozen map — met by a command that until 6J-c had no
along-wall axis to move. `body_resized` and `body_inserted` already obey it, which is why
`publishedColumns` gives those two effects their own map; `cabinet_depth_set` is now the third
command in that class and stops being an exception to it.

### 2. A frozen extent slides on the chain the body it recorded declares — one rule for both halves of the map

> Let `source = extent.depthFromBuildId`. The extent's new along-wall coordinate is
> `alongMm + alongWallShiftMm({ from, to, chain: cabinetDepthRuleOf(source).alongWallPositionFollows })`,
> on wall B, and `alongMm` unchanged on wall A.

The same sentence governs `emptyColumns` and `columnExtents`. **There is deliberately not one rule for
a member-less space and another for an occupied one**, and the reason it can be one rule is structural
rather than convenient: `deriveColumns` records as `depthFromBuildId` the member that won §3.2's MAX,
so the recorded source *is a member of that column*, and by decision 3 every member of a column
declares the same chain. An occupied extent therefore lands exactly where its own members land — which
is an assertion the wave owes, not an assumption.

**This extends ADR 0073 decision 1's reading, not its shape.** That record put a `buildId` on a frozen
extent so a member-less column could keep the one fact it could not otherwise keep. The fact it kept
turns out to answer two axes, because the body that supplies a column's clearance is the deepest thing
standing in it, and how far the corner in front of a run reaches is itself a depth fact. No new field,
no `CURRENT_SCHEMA_VERSION` bump, no migration.

**Measured against the run the command actually produces.** Reading the chain off `depthFromBuildId`
reproduces every wall-B record coordinate in the 700 mm state above:

| stored entry | `depthFromBuildId` | chain | 600 → 700 | key |
| --- | --- | --- | --- | --- |
| `B\|0.61` | `wall-corner-return-570` | `wall-map` | 615 → 685 | `B\|0.69` ✓ |
| `B\|0.74` | `base-corner-return-320` | `base-formula` | 740 → 840 | `B\|0.84` ✓ |
| `B\|1.20` (the one true space) | `tall-oven-tower-600` | `base-formula` | 1200 → 1300 | `B\|1.30` ✓ |
| `B\|1.80` | `wall-2door-600-deep-top` | `base-formula` | 1800 → 1900 | `B\|1.90` ✓ |
| `B\|2.45` | `fridge-free-700` | `base-formula` | 2450 → 2550 | `B\|2.55` ✓ |

`B|1.30` is the key the red route-independence test names as expected, which is the independent
confirmation that this rule and the invariant tests agree.

**ADR 0079's pairing invariant gains a third member.** A depth, the body that produced it, and the
coordinate the column stands at now travel together or none of them does. That is the same argument
ADR 0079 decision 1 makes — a store that publishes a depth without saying where it came from should
not compile — carried to the axis 6J-c added.

### 3. The chain is a property of a column, and inferring it from a band is refused by measurement

`cabinet-depth-rule.ts`'s own head comment says the depth question is *"declared per entry, never
inferred from a band or a kind"* (ADR 0058 decision 2). For the along-wall chain that stance is not
merely house style — **it is provably wrong to infer**, on the shipped catalogue:

| entry | band | `alongWallPositionFollows` |
| --- | --- | --- |
| `wall-2door-600-deep-top` | `top` | **`base-formula`** (+100) |
| `wall-corner-return-570-top` | `top` | **`wall-map`** (+70) |

Two entries in the same band, at the same vertical interval, on different chains, 30 mm apart at 700.
So a rule that read `y0Mm`/`topMm` off a frozen extent would be wrong by 30 mm on the shipped fixture,
and 30 mm of wrong is an overlap and therefore a refused save. **Band inference is closed by
measurement, and the alternatives section records that it was tested rather than assumed.**

What the chain *is* a property of is the **column**: one vertical stack at one along-wall coordinate,
which must slide as one thing or tear. Measured on the seeded design at 600, every column is
chain-homogeneous — `B|0.61` is `wall-map` on both its members and every other column is
`base-formula` on all of its. **That homogeneity is an invariant this record names and the wave
asserts.** It is not currently enforced by any refusal, and that is recorded as a finding below rather
than fixed here.

### 4. An extent with no recorded source does not slide, and no published map may put free space where a body stands

Two halves, and the second is what makes the first safe.

**4a. ~~A sourceless extent keeps its coordinate.~~ OVERTURNED 2026-09-06 by this record's own
amendment — see *Amendment A* at the end. A sourceless extent moves, on the ladder stated there.** The
struck reasoning is kept in place rather than deleted, because it is the argument the amendment
refutes and the refutation is the more useful half:

> ~~`depthFromBuildId` is absent only on documents written before wave 6K-c — ADR 0080 decision 5
> measured that population closed — and there is nothing in such a document to read a chain from.
> Guessing one is decision 3's refused inference; declaring a default is worse, because a wrong
> default of 30 or 100 mm is not an inaccuracy but an overlap and therefore an unsaveable document.~~

**4b. The published map is held to a new invariant: a member-less column may not occupy ground a
placement occupies.** A fourth stage joins the clip → split → merge funnel, ahead of the split, on the
funnel's own recorded argument that a clip only ever shrinks and so is provably safe for the split
that follows it. A member-less column overlapping any placement on its wall — along-wall *and*
vertically, the same two-axis test `findWallOverlaps` already applies — is **dropped from the published
map**.

**Dropped whole, not cut back.** A partial cut invents a coordinate exactly as surely as a chain
default does, and an interior overlap would have to split one recorded space into two the customer
never made. ADR 0055 decision 1 permits the loss (*"nothing left behind"*, and the document need not
round-trip); ADR 0080 decision 2's *"following, not disappearing"* is not violated, because when a
cabinet is standing on that ground the space genuinely is gone.

**This is a guard, and the wave must prove it is not doing work.** It exists for 4a's legacy tail and
as the structural statement of *"the store never publishes a document the write seam refuses"* — the
same defence-in-depth stance `splitOversizedEmptyColumns` is already documented as taking for a
producer that does not yet exist. On current-schema documents decisions 1–3 make an overlap
unreachable, so the criterion is that it drops **nothing** across the existing store suites, with a
non-vacuity case proving it can drop.

### 5. `setCabinetDepth` owns the whole frozen-map answer, and `CabinetDepthSetEffect` publishes it

ADR 0088 decision 2 left the seam to the implementer and required that the wave state its choice and
why. **The choice is the domain command, and it is decided by the inputs rather than by taste.**

The store's `atCurrentCabinetDepth` answers the depth axis by comparing three maps: the frozen map,
`deriveColumns(records)` at the new setting, and `deriveColumns(previousRecords)` at the old one. It
looks all three up **by column key**. Once the run slides, the old-setting map is keyed at coordinates
the other two no longer use, so `explains` is false for every wall-B column and every one of them
falls into ADR 0080's surplus arm. Repairing that inside the store means keying the old-depth map at
the *new* coordinates — which requires the pre-command design, the catalogue at the depth being left,
and the shift itself. **`setCabinetDepth` holds all three natively** (`input.design`, `input.catalogAt`,
and the planning design it already builds); the store holds none of them and is handed
`previousRecords` and `previousCabinetDepthMm` precisely because it lacks what the command has for
free.

Two further facts point the same way and neither is decisive alone. `apply-command-result.ts`'s head
comment says *"No product rule lives here"*, and a chain is a product rule. And
`publishedColumns`' own comment states the criterion — *"a resize and an insert are the two commands
that move a frozen extent along the wall, so they are the two whose own answer replaces the map passed
in. A depth change is the third and it moves a different axis"* — a sentence 6J-c made false.

So: `CabinetDepthSetEffect` gains `columns`, `publishedColumns`' `cabinet_depth_set` arm becomes
`return effect.columns`, and `atCurrentCabinetDepth` with its two pre-command parameters moves into
the domain. The store keeps the funnel, the void recompute and the selection — it stops being a second
author for a map it cannot fully compute.

**The half-measure is named and refused.** Moving only the *position* axis to the domain and leaving
the depth axis in the store puts two authors on one map at one seam, which is the failure mode this
project has recorded three times (`findVacatedVoid`/`findVacatedSlot`, `deepestMember`'s two orders,
and F1's parted depth-and-source). ADR 0088 decision 2 exists to stop exactly that.

### 6. ADR 0088 decision 1 is amended: "carried" means "not re-derived from the members", and the along-wall axis is carried **after** the command's own shift

ADR 0088 decision 1 reads *"the planning map carries the frozen extent's vertical and along-wall axes,
and re-derives the depth axis."* It was written on 2026-09-06 against a command that moved nothing
along the wall, and it is **recorded and not yet implemented** — wave 6K-i is owed and gates nothing.

Read literally against a sliding run it is now wrong: it would restore the frozen extents at the
coordinates the run is leaving while the placements plan at the coordinates it is arriving at, putting
the same defect inside `evaluateInsertFit` one seam earlier than the measurement above found it.

**The amendment, stated so 6K-i needs no second author:**

> The frozen extent's along-wall axis is *carried* in the sense ADR 0088 decision 1 intended — it is
> **not re-derived from the members standing there**, because a partial delete's width is the
> customer's and nothing can re-derive it (Gap D). It is not immune to the command's own move.
> Wave 6K-i builds its planning map from the frozen extents **as decision 2 of this record moves
> them**, and 6J-d runs first.

ADR 0088 decisions 2, 3, 4 and 5 are untouched, and its decision 3's value-preservation on the depth
axis is unchanged: this record moves no depth.

### 7. Wave 6J-c does not reach `main` alone, and no red test is edited to make it

The tree at present publishes a document the product's own write seam refuses, on the shipped kitchen,
at a setting the customer can select from a control that already ships. That is not a half-wired
surface between waves — which this project accepts — it is a saveable kitchen made unsaveable, behind
a red gate.

- **6J-c is committed now, on a branch** (`wave/6j-cd` or equivalent), so the work is preserved, the
  tree is not frozen, and no implementer is blocked. 6J-d lands on the same branch. The branch reaches
  `main` only when `pnpm ci:local` is green.
- **In the meantime the eight red tests say exactly what they say today.** None is skipped, marked
  `it.fails`, or rewritten to describe the broken behaviour. Six of them —
  `qa-6k-j-fallback-rule.adversarial.test.ts`'s *"publishes one map for five routes"* and *"converges
  to a two-cycle keyed only on the setting"*, `qa-6k-j-closure.adversarial.test.ts`'s two, and
  `qa-6k-c-frozen-source.adversarial.test.ts`'s two Gap D assertions — are **invariants**, and an
  invariant edited to accommodate a defect is the defect laundered. They must go green **unchanged**;
  that is 6J-d's acceptance criterion, not a hope.
- **Two are fixture coordinates and may be updated**, with the reason named in a comment:
  `cabinet-depth-frozen-source.test.ts`'s golden `BEFORE_THIS_WAVE` map and its `PANTRY_KEY`
  non-vacuity guard, both of which name wall-B keys that this record moves. The guard's *assertion*
  survives; only the key it is anchored to becomes setting-dependent. Deleting it is not an option —
  it is the check that the test can fail at all.

### 8. Nothing else moves

No schema change and no `CURRENT_SCHEMA_VERSION` bump. No new validation code and no change to any
code's declared severity. No migration — ADR 0080 decision 5's population is answered at read time,
here as there. No change to any published **depth** on any document, at either setting: this record
moves an anchor and re-keys a map, and decision 3 of ADR 0088 stays true.

## Alternatives considered

| Option | Why not |
| --- | --- |
| **Infer the chain from a member-less space's `y0Mm`/`topMm`** — the band it sits in. | Refused **by measurement, not by preference**: `wall-2door-600-deep-top` and `wall-corner-return-570-top` are both `top` band and declare different chains (decision 3). It would be wrong by 30 mm on the shipped fixture, and 30 mm is an overlap and a refused save. Independently refused by ADR 0058 decision 2 and ADR 0061. |
| **Declare a default chain for a sourceless extent** — `wall-map`, to agree with ADR 0080 decision 4's `columnBuildDepthM` fallback, which speaks the wall map. | A sourceless *base* opening would then slide 70 where its neighbours slide 100 and overlap by 30 mm. ADR 0080's own fallback was merely imprecise when it guessed; this one is unsaveable. A blind default is not available on this axis. |
| **Refuse the depth change on a document holding a sourceless wall-B extent.** | Leaves ADR 0052's 5 legacy rows permanently unable to change depth, with no remedy the customer can reach — an empty column cannot be deleted. Trading a dead link for a dead control. |
| **Re-derive the whole frozen map from the records at the new setting** — i.e. treat the map as derived rather than positioned. | This is ADR 0011 Gap D destroyed on a third axis. A cleared 620 mm slot under a wall run would collapse to what the wall body measures, which is the exact defect Gap D exists to stop and which ADR 0073, ADR 0079 and ADR 0080 have each declined to reopen. |
| **Cut a sourceless space back to the free interval rather than dropping it (decision 4b).** | A partial cut invents a coordinate exactly as a chain default does, and an interior overlap would split one recorded space into two the customer never made. Dropping is total, is one predicate a reviewer can check, and is permitted by ADR 0055 decision 1. |
| **Keep `atCurrentCabinetDepth` in the store and re-key it there**, matching frozen entries to new records by placement id. | Two authors on one map — the position rule in the domain, the depth rule in the store — which ADR 0088 decision 2 exists to prevent. It also puts a product rule in a file whose head comment says none lives there, and it needs three inputs the store does not hold (decision 5). |
| **Move only the position axis to the domain and leave the depth axis in the store.** | The smaller diff, and the one the implementer proposed. It leaves the old-setting map keyed at coordinates the other two operands no longer use, so every wall-B column falls into ADR 0080's surplus arm — a wrong depth, quietly, on the arm the whole 6K-c/6K-j line was written to get right. |
| **Land 6J-c now and fix the map in a follow-on.** | Puts a kitchen the customer cannot save on `main` behind a red gate, and AGENTS.md rule 4 sends a wave with red tests back to its implementer. The branch in decision 7 gets the same preservation with none of the exposure. |

## Consequences

- **Wave 6J-d is opened**, planned in `docs/milestones/M6-price-and-global-settings.md`. It is larger
  than the single follow-on file the implementer proposed — six production files across two packages —
  and decision 5 is why. It lands with 6J-c.
- **Wave 6K-i's plan changes before it is written.** Decision 6 amends the record it is built on. 6K-i
  is sequenced **after** 6J-d, and both edit `set-cabinet-depth.ts`, so they must not be dispatched
  into one tree at once.
- **The store loses two parameters and a rule.** `ApplyCommandResultInput.previousRecords` and
  `previousCabinetDepthMm` exist only to feed `atCurrentCabinetDepth`; both go with it. Their doc
  blocks record why they were required rather than defaulted, and that reasoning transfers to the
  command's own inputs rather than being discarded.
- **The tests for ADR 0073, 0079 and 0080's depth rules move packages with the code they assert.**
  They are `apps/web/tests/store/`'s and become the domain's. Wave 6J-d's plan names this as work
  rather than letting it surface at dispatch: the invariants must survive the move **unchanged in what
  they assert**, and a moved test that got easier is a finding.
- **A `Column`'s key is now known to be a fact a command can change.** Any future reader that caches a
  column key across a command — the scene, the selection, a probe — meets decision 1. ADR 0074 already
  rebuilds the scene whole at a depth change, so no adapter change is owed here; this is recorded so
  that the next such reader is checked rather than assumed.

## Amendment A — 2026-09-06: decision 4a is overturned, and standing still is not abstention

**Raised by wave 6J-d's implementer**, who closed the measured defect exactly as decisions 1–3 rule
(orphan columns 4 → 0, `emptyColumns` 5 → 1 at `B|1300`, `columnExtents` 7 → 11, `voids` 12 → 3, five
refusals → none, `B|1.30` reproduced) and then found that **two of the six invariants decision 7 rules
must go green unchanged cannot go green under decision 4a**, and correctly refused to touch them
without a ruling. They were right to escalate, and the ruling is that **the invariants stand and 4a
goes.**

### The contradiction was inside this record from the start

Decision 4b's own acceptance criterion, as written in wave 6J-d's plan, is that
`clipEmptyColumnsToFreeGround` **drops nothing across the existing store suites**. Decision 4a makes it
drop a space in nearly every legacy scenario those suites build. **The two halves of decision 4
contradict each other**, and the wave found it. That is the tell that 4a was the error rather than the
tests.

### First measurement — where a member-less space lands

Run at `2bdd923` with wave 6J-d's working tree, over the legacy (source-stripped) scenarios
`qa-6k-j-fallback-rule.adversarial.test.ts` already builds, plus three multi-space ones. Each wall-B
member-less space is placed by 4a (no shift) and by a `base-formula` default (+100 mm), and swept
against every wall-B placement at 700 on both axes — the same two-axis test `findWallOverlaps` applies.

| legacy scenario | space at 600 | **4a — no shift** | **`base-formula` default — +100** |
| --- | --- | --- | --- |
| cleared appliance niche | `B\|2450` w700 | `[2100..2800]` — **overlaps `p6` `p23`** | `[2200..2900]` — **clear, abutting `p6` exactly** |
| cleared pantry | `B\|1800` w600 | `[1500..2100]` — **overlaps `p5` `p22`** | `[1600..2200]` — **clear, abutting `p5` and `p7`** |
| cleared oven tower | `B\|1200` w600 | `[900..1500]` — **overlaps `p26` `p9` `p21`** | `[1000..1600]` — **clear** |
| oven tower **and** pantry | two spaces | one overlaps three bodies | **both clear**, `[1000..1600]` `[1600..2200]` |
| oven tower **and** fridge | two spaces | **both overlap** | **both clear**, `[1000..1600]` `[2200..2900]` |
| cleared wall column, cleared base slot | — | no wall-B **space** — but see the second table | — |

**4a overlaps in five of the six wall-B cases and the default overlaps in none.** Where the default
lands it lands *exactly* — abutting the neighbour the space sat against, to the millimetre.

### Second measurement — the whole map, through the product's own validator

The first table places a member-less space by hand. This one moves the whole legacy map by each
candidate rule, puts the real 700 mm placements beside it, and runs
`validateDesignForCatalog(…, buildKitchenLBodyCatalog(700))` — because the first table cannot see an
**occupied** extent parting from its members, and that is the failure that corrects the amendment
itself. Refusal-class issues counted separately from the `…_PAST_WALL_END` marks.

| legacy scenario | **4a — nothing moves** | **rigid `FOLLOWS_CABINET_DEPTH` on every entry** | **the ladder** |
| --- | --- | --- | --- |
| cleared wall column (wall A) | **10** | 2 | **0** |
| cleared base slot (wall A) | **10** | 2 | **0** |
| cleared appliance niche | **9** | 2 | **0** |
| cleared pantry | **9** | 2 | **0** |
| cleared oven tower | **9** | 2 | **0** |
| oven tower and pantry | **7** | 2 | **0** |
| oven tower and fridge | **8** | 2 | **0** |
| untouched | 0 | 0 | 0 |

Three things this table says that the first one could not.

- **4a wrecks a legacy document even when the delete was on wall A.** `asLegacyDocument` strips the
  source from `columnExtents` as well as `emptyColumns`, so under 4a **no wall-B entry moves at all**
  while every wall-B placement does: the occupied half goes stale exactly as it did before this wave,
  and the two wall-A scenarios report ten refusals apiece —
  `COLUMN_EXTENT_OVERLAPS_PLACEMENT` × 5 and `COLUMN_EXTENT_HAS_NO_MEMBER` × 5. This corrects a claim
  made while ruling: those two scenarios were called *"unaffected either way"*, which is true of the
  first table and false of the document.
- **The rigid default fails, and always in the same one place.** Exactly two refusals in every
  scenario that carries a wall-B map, always `COLUMN_EXTENT_OVERLAPS_PLACEMENT` and
  `COLUMN_EXTENT_HAS_NO_MEMBER` on `B|615` — the `wall-corner-return-570`/`-top` column, the one
  column on wall B whose members follow `wall-map`. A default of +100 moves its extent while its
  members move +70, and 30 mm parts an extent from the column it records.
- **The ladder is clean everywhere.** Every issue that remains is a `mark` —
  `PLACEMENT_PAST_WALL_END`, `COLUMN_EXTENT_PAST_WALL_END`, `EMPTY_COLUMN_PAST_WALL_END` — and all of
  them are wall B being **2830** rather than ADR 0083's 2920, because wave 6N-0 has not started.
  ADR 0065's family, expected, and not this wave's. The untouched row is 0 under every rule for a
  duller reason: no command has run, so that document carries no frozen map to be stale.

This is the same experiment wave 6J-d's implementer ran with `clipEmptyColumnsToFreeGround` disabled
at both call sites, reported as 9 and 10 refusals on two legacy scenarios. The construction differs —
theirs disables the guard in the real pipeline, this one moves the arrays and validates — so the
counts are not expected to match to the unit, and they do not. **What both say is the same thing: the
pre-clip document is unsaveable under 4a and saveable under the ladder.** The guard was deleting the
evidence of a wrong rule, not doing work.

### Why the reasoning failed

**Not moving is not abstention. On a run that has moved, standing still is a positive claim — that
this column follows a third chain, one no catalogue entry declares and whose shift is zero.** It is
not the absence of a guess; it is the worst guess available, wrong by the full 100 mm on every
reachable entry, where the alternative it was chosen over is wrong by at most 30 mm and in one place
the ladder now covers exactly. The struck sentence *"a wrong default of 30 or 100 mm is not an
inaccuracy but an overlap"* is true and was aimed at the wrong option: **4a is the 100 mm error.**

This is ADR 0080 decision 3's own finding on the other axis — *"a depth kept in mind because of where
the kitchen used to be"* — and that record's answer was not to refuse to answer. It **declared a
fallback** (`columnBuildDepthM` at the current setting) and accepted a bounded error, on the ground
that *"a depth the fallback itself produced follows the setting like everything else."* The position
axis owes the same treatment and this record failed to give it.

### The replacement rule — an information ladder, four rungs

**Corrected once more, 2026-09-06, before any of it was implemented.** The amendment first said only
*"a sourceless extent slides on the chain `FOLLOWS_CABINET_DEPTH` declares"*, and the second
measurement above shows that sentence is right for a **member-less** extent and wrong for an
**occupied** one. So the rule is stated as a ladder ordered by how much the document actually knows —
the shape ADR 0080 decision 4 already uses on the depth axis:

> 1. **Wall A** — the coordinate is unchanged. Wall A is anchored at the corner and does not move.
> 2. **The column holds a member** — the extent moves by **the delta its own members moved**. Exact,
>    and it reads no chain and no source at all: the command has just computed where every member
>    stands, and an extent *is* the column those members are in.
> 3. **Member-less, with a recorded source** — the chain that source declares (decision 2, unchanged).
> 4. **Member-less and sourceless** — the chain **`FOLLOWS_CABINET_DEPTH`** declares, today
>    `base-formula`. Read from that constant, never written as the literal, so the fallback and the
>    catalogue's own default cannot part.

Rung 2 is not so much a new rule as decision 2's own claim made load-bearing: that decision already
says an occupied extent lands exactly where its members land, and asks the wave to assert it. Here
that agreement becomes the **derivation** rather than a coincidence to be checked — which is what
makes rung 4 safe to be a bare declaration, because by the time it is reached there is nothing left to
be exact about.

**Rung 4 is not a preference between two chains. On the shipped catalogue the other chain is
unreachable for a member-less column, and that is measured rather than argued.** The only two entries
that declare `wall-map` are `wall-corner-return-570` and `wall-corner-return-570-top`; both carry
`STRUCTURAL_CORNER` (`canDelete: false`, `canReplace: false`, `kitchen-l-design.ts:171`) and neither
appears in `catalog.ts`'s insertable rows. Deleting either returns **`NOT_DELETABLE`**, measured on
both. So **the `wall-map` column can never become member-less**, and every member-less wall-B column
the product can reach is a `base-formula` column. The default is the only *reachable* answer, not the
likelier of two.

`FOLLOWS_CABINET_DEPTH` is also the value the catalogue already gives an entry that says nothing
special — as do `IS_A_MANUFACTURED_SIZE` and both shipped `pinnedAtFinishedDepthMm` calls — so this
reads an existing declaration rather than minting a constant, which is what decision 3's *"declared,
never inferred"* asks for.

### What this restores

- **Both invariants go green unchanged, and are not touched.** Every rung is a pure function of the
  setting — rung 2's delta is itself a difference of two corner reaches — so 600 → 700 → 600 returns
  the coordinate exactly and a legacy map is again a function of the setting alone;
  `qa-6k-j-fallback-rule`'s two-cycle property holds. Nothing is dropped, so `qa-6k-j-closure`'s
  sourced-versus-legacy difference set is not widened.
- **Decision 7 is unamended, and is why this went the way it did.** *"An invariant edited to
  accommodate a defect is the defect laundered"* was written against an implementer weakening a test;
  it binds the architect who wrote the rule the invariant caught at least as hard. The escalation was
  correct and the record was wrong.
- **Decision 4b stands, and becomes the guard it was described as.** It drops nothing on any scenario
  in the suites — the criterion wave 6J-d's plan already states — and keeps the structural claim that
  no published map places free space on occupied ground. Its non-vacuity case can no longer be a
  legacy document, since none of them overlaps any more; the wave supplies a hand-built map instead.
- **The wave's *"drops nothing"* criterion is upheld, not withdrawn.** It is falsified only against
  the struck 4a and satisfied under the ladder, which is a criterion doing its job rather than one
  that has gone stale. It is deliberately **not** the case ADR 0085 decision 6 withdrew: that
  criterion was *unverifiable* — two normalisations that commute on every input — where this one
  verified something and returned a true answer.
- **The customer-facing guarantee is not qualified, and nothing is owed to the owner.** Under 4a a
  legacy document silently lost a space on a 600 → 700 → 600 round trip, and *"ADR 0055 permits the
  loss"* would have been a true sentence covering a defect. Permitting a loss and a customer silently
  losing a space they can see are different claims; under the ladder there is no loss to surface,
  because every space returns on every reachable document, legacy or current-schema.

### Consequences for the wave

Wave 6J-d's plan is updated in place: work item 1 becomes the ladder, the sourceless arm is asserted
by value, `NOT_DELETABLE` is pinned so a future catalogue change re-opens rung 4 deliberately, the
clip-disabled counterfactual becomes a standing assertion rather than a one-off measurement, and 4b's
non-vacuity case becomes a hand-built map. **No other criterion moves** — in particular the six
invariants and the value-preservation at 600 are unchanged.

## Amendment B — 2026-09-06: a cap derived from the room bounds what is published and never rewrites what is recorded

**Raised by adversarial QA on the branch at `cf53e8e`**, left red, and it contradicts Amendment A in
terms: that section says *"under the ladder there is no loss to surface, because every space returns
on every reachable document."* **It does not, and QA found the case.** The sentence was true of every
scenario measured and false as a general claim, and the difference is the far end of the wall — which
no measurement in either amendment reached.

### The measurement

Reproduced by this record at `cf53e8e`, in the shipped 2920 mm room, on a recorded space standing
flush to wall B's end on ground no body occupies:

```
emptyColumn  B|2620 w600   [2320..2920]   at 600
             B|2670 w500   [2420..2920]   at 700     slid +100, then clipped at the wall
             B|2570 w500   [2320..2820]   back at 600
```

**100 mm gone, and gone permanently.** `DesignSchema.safeParse` succeeds and
`validateDesignForCatalog` returns `[]` on the document that comes back, so the `PUT` seam stores it
and a later session opens a space 100 mm short with nothing anywhere saying so. QA measured the same
room at `e28ab25`: 600 mm at 600, at 700, and back. **The branch introduces it.**

**It is the case Amendment A's own distinction was written for** — *"permitting a loss and a customer
silently losing a space they can see are different claims"* — and it is the second of the two.

### Classification

**An implementation defect in wave 6J-d, sitting on a contract gap in [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)
that this amendment closes.** The slide is correct; the clip is correct *at 700*; what is wrong is
that the clipped width is written back into the document as the new recorded truth. Nothing had
decided whether a room-derived cap may rewrite a recorded fact, because until this wave no reversible
command could push a legitimate space past a wall.

### The rule

> **A pass that derives its answer from the room may bound what the map publishes and may not rewrite
> what the document records. A pass that derives its answer from the placements, or from a declared
> ceiling, does both.**
>
> `clipEmptyColumnsAtWallEnd` is the first kind. `clipEmptyColumnsToFreeGround` (decision 4b),
> `splitOversizedEmptyColumns` (ADR 0052's 800 mm ceiling) and `mergeAdjacentEmptyColumns`
> (ADR 0046) are the second: free ground is a fact about the bodies in the design, and the cap and
> the merge are declared rules about a column. None of them is undone by moving a setting back.

Applied to D1: the recorded extent slides exactly and keeps its width; the published column is capped
at the wall. `B|2620 w600` → recorded `B|2720 w600`, published `B|2670 w500` → recorded and published
`B|2620 w600` again. **The round trip returns.**

**A recorded extent that the slide puts past the wall is marked, not shortened** —
`EMPTY_COLUMN_PAST_WALL_END`, already declared a `mark` (`validate-design.ts:217`), so the write seam
accepts it. That is precisely what [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)
rules for a *placement* the same slide pushes past the same wall, and wave 6J-c's plan says so in as
many words. **The asymmetry was the defect**: one slide, two populations, and only the one that cannot
speak for itself was silently truncated.

### It reaches ADR 0069, and it does not overturn its owner ruling

The team lead asked whether the real question is ADR 0069's rather than 6J-d's. It is both, and the
distinction that keeps them apart is the seam rather than the rule.

ADR 0069's owner ruling — closed 2026-09-04, *"never"* — is about what the product **offers**: no
member-less column reaching past the end of its wall may be presented as an insertable opening. **That
is preserved exactly.** The cap still runs, the published map is still bounded by the wall, and no
opening past the wall is ever derived, drawn or offered. What changes is that the cap stops being
written back through `projectFrozenMap` into `emptyColumns`.

So ADR 0069 is **amended in its seam, not in its decision**, and the amendment is recorded on that
record as well as here. Its clip was written for a space that was *always* past the end — a fabricated
entry or a remnant — where truncating it and keeping the truncation is right, because nothing will
ever make the wall longer. A space a **reversible command** put there is a different input, and the
setting the customer can move back is exactly what makes it different.

### 6N-0 is currently hiding this, and the wave must not rely on it

QA measured the same failure pre-6N-0: in the 2830 mm room the ordinary *cleared appliance niche*
scenario reaches it, 700 → 630, not restored. It is invisible on `main` only because 6N-0 widened wall
B to 2920. **A wave whose correctness depends on another wave's room width has a coupling nobody
declared**, and reverting 6N-0 would return the defect silently.

So the criterion is written against **a room narrow enough to trigger the cap, declared in the test**,
not against whichever width the fixture happens to carry. That severs the coupling rather than
documenting it.

### The two lower-severity findings, ruled

**The clip-idle assertion was vacuous, and QA's replacement is a good criterion but a different one.**
`clipEmptyColumnsToFreeGround(state.columns, state.records)` returning its input proves idempotence,
not idleness — the pass only removes, and `state.columns` has already been through it, so
`clip(clip(m)) === clip(m)` holds whatever the first pass did. QA is right and the demonstration is
correct. But the replacement it offers — the population of recorded runs identical before, at 700 and
back — measures **no loss**, which is this amendment's own D1 gate and is owed on its own account.
Idleness is a separate claim and is asserted on the input the funnel actually hands the pass: the map
after the slide and after the wall-end cap, and *before* the free-ground clip. Both criteria are owed,
and neither discharges the other.

**Decision 7's *"none is edited"* is amended: an anchor may move and nothing else may.** The
prohibition was written before decision 2 made a wall-B column key a function of the setting, and as
written it forbids the single edit decision 2 makes unavoidable. It is narrowed rather than relaxed:

> An invariant test may have its **anchor** changed and nothing else. An anchor is a value naming
> *which* object the test inspects; an assertion is a value the test compares against. The diff may
> change only a key or id used in a lookup, or a key embedded in a snapshot row, and must leave every
> expected value, every tolerance, every generator range and every scenario in the list
> byte-identical. The new anchor is a **measured literal per setting**, never computed through the
> production reader under test. A derived read may select an object and may never appear inside an
> `expect`.
>
> **Anything else remains forbidden in full.** An edit that changes an expected value, widens a
> tolerance, narrows a generator or drops a case is not an anchor change, and decision 7 applies to it
> as written.

The three edits are checked against that and qualify. `qa-6k-j-closure`'s inline snapshot moves two
keys — `B|1.80` → `B|1.90`, `B|1.20` → `B|1.30` — and **every depth in it is byte-identical** (699 /
700, 738 / 638), the set is the same size, and the `@reload` rows are untouched.
`qa-6k-j-fallback-rule` wraps one lookup in `columnKeyAt` and leaves `toBeCloseTo(600, 6)` alone.
`qa-6k-c-frozen-source` does the same twice and reaches for the coordinate only to choose which
placement to delete, never inside an assertion.

**The record was wrong and the authorisation was right**, which is the order this needs to be said in:
the team lead approved these on the substance and asked for the criterion to be corrected rather than
defended, and that is what this paragraph is.

### What Amendment A said, corrected

Amendment A's *"there is no loss to surface, because every space returns on every reachable
document"* is **withdrawn as stated** and replaced by: *under the ladder no space is lost to a
neighbour's slide, and a space at the far end of the wall was lost to the room-derived cap until this
amendment.* The ladder is unaffected — D1 reproduces with the ladder implemented, at the far end of
the wall, on a fully sourced current-schema document. Nothing in Amendment A's rungs, measurements or
`NOT_DELETABLE` finding changes.

**And the owner question is answered the same way, for the same reason.** With Amendment B nothing is
lost, so there is nothing to surface. Had the fix been unavailable — had the wall genuinely been too
short to restore — the answer would have been the other one, because a customer losing 100 mm of a
space they can see is not a thing to record and move past.

### Consequences for the wave

The branch does not merge until D1 is green. Wave 6J-d's plan gains the criteria in its own section:
the round trip is asserted at the **far end of the wall** in a room declared by the test, the recorded
and published widths are asserted to differ at 700 and agree at 600, and the free-ground guard's
idleness is asserted on the input the funnel hands it. The stale prose in
`apps/web/src/store/apply-command-result.ts`'s funnel comment — which still describes decision 4a's
*"legacy tail on its own coordinate"* — is corrected in the same pass.

## Amendment B addendum — 2026-09-06: a second route survives, and one column may not have two keys

Raised by wave 6J-d's implementer after D1 was closed, and reproduced by this record at `cf53e8e`
plus the D1 fix. Both halves are ruled here in **direction**; neither is 6J-d's to build.

### The second route, measured

`CommandContext.columns` hands `setWidth` and `insertBody` the **published** map, and their
`effect.columns` replaces the map whole — so on those two commands the cap rides into the recorded
face. On a recorded space flush to wall B's end in the 2920 mm room:

```
at 600                     recorded B|2620 w600   published B|2.62 w600
after setCabinetDepth(700) recorded B|2720 w600   published B|2.67 w500   <- Amendment B working
after a delete on wall B   recorded B|2720 w600   published B|2.67 w500   <- fall-through arm, record survives
after resizing p0, wall A  recorded B|2670 w500   published B|2.67 w500   *** the record adopts the cap ***
```

An unrelated resize on the **other wall** takes the recorded entry's width *and* its centre from the
published face. It is the same loss D1 names, reached by a different command.

### The rule: the two faces differ in width and centre, and may not differ in key

The implementer asks whether *"one column, two keys"* is intended. **The width and centre divergence
is intended and is forced** — a cap holds the near edge and moves the far edge in, so the centre must
move. **The key divergence is not intended, was not foreseen when Amendment B was written, and is not
endorsed.** A column's key is its **identity across the two faces**; letting the cap re-derive it from
the moved centre turns one column into two, and that is precisely what makes the second route
expensive to close.

It is safe today — a void carries the published key and an insert matches against the same key, so
nothing resolves a void against the recorded map — so this is a **finding on the branch, not a defect
in it**. What makes it correctable rather than a standing contradiction is a fact
`clip-empty-columns-at-wall-end.ts` already states: *"An occupied column is never clipped."* A capped
column is therefore always member-less, no `record.col` is ever derived onto its key, and
`key = deriveColumnKeyAt(centre)` — mandatory for the recorded face and for every occupied column —
is **not** load-bearing for a capped published one.

### Direction for the wave, so it is not a coin flip between two costed options

**Neither option as posed.** Option 1's only stated cost — `insertBody` answering `COLUMN_MISMATCH`
because the void names `B|2.67` and the recorded map holds `B|2.72` — **is created by the key
divergence**. Remove the divergence and option 1 is clean:

> 1. **The wall-end cap preserves the column's key**, changing `w`, `x`/`z` and nothing else. One
>    column, one identity, two faces.
> 2. **`CommandContext.columns` hands `setWidth` and `insertBody` the recorded map**, as
>    `setCabinetDepth` is already handed what it needs.

**Option 2 is refused by name.** Reconciling in the store afterwards, by matching rather than lookup
because a resize moves keys, adds a product rule at the seam whose whole stated purpose is that it
states none (`apply-command-result.ts`'s head comment) — and a match that silently finds the wrong
partner is the failure shape this project has recorded three times.

**What the wave must measure, because this record has not.** Whether anything computes a column key
from a coordinate and looks it up in the **published** map — picking, `findVacatedVoid`, the adapter's
selection — since that is the one place `key = f(centre)` could still be load-bearing for a
member-less column. If it is, direction 1 needs a different shape and the wave says so with its
measurement rather than proceeding.

### Measured 2026-09-07, and direction 1 keeps its shape

**Nothing computes a column key from a coordinate and looks it up in the published map.** Swept
across `packages/*/src` and `apps/web/src`.

Two productions derive a key from a coordinate, and neither reaches a capped column.
`derivePlacementRecords` derives `record.col` from a placement's own frame — always an **occupied**
column, and this pass never clips one. `toColumnExtent` derives a restored entry's key from the
document's `alongMm`, which is the **recorded** centre — so the key it produces is exactly the key a
capped column now keeps, and `refuseUnreproducibleKey` goes on holding the projection to it.

Every consumption is by a key that was **carried**, never recomputed: `set-width.ts`,
`insert-fit.ts` and `rebuild-resized-bodies.ts` all look up `record.col` or a void's `col`, and
`recomputeVoids` stamps a void with `column.key` rather than re-deriving one from its centre.
`findVacatedVoid` compares `record.col === vacated.col` and otherwise asks a geometric question of
the void's own span. `mergeAdjacentEmptyColumns` decides adjacency on edges in millimetres and keys
the merged column from the merged centre, which is consistent again.

**Picking and selection name no column key at all.** `packages/three-adapter/src` contains no column
key, and `apps/web/src` reads no `col` field: a selection is a placement id or a void id, and
`resolveSelection` matches on ids.

Recorded here because the addendum asked for the measurement rather than the conclusion.

**It is ADR 0088 decision 2's question a third time** — which map does a map-publishing command
receive, and who owns the reconciliation — and it touches `setWidth` and `insertBody` rather than the
depth track, so it is its own wave. Recorded as `docs/BACKLOG.md` entry 52.

### The branch merges, and the residue is the branch's own, not inherited

**Correcting the framing it was offered under.** The reading that *"the branch is strictly better than
`main` on this path"* does not survive checking: at `e28ab25` the depth command slid no extent at all,
so a far-end space was never pushed past its wall and **never capped — there was no loss on this path
on `main`, in either direction.** QA measured exactly that. The residue is **introduced by this
branch**, not inherited from before it, and calling it otherwise is how a residue gets forgotten.

**It merges anyway, and the argument is a comparison rather than an absolution.** What the branch
closes is a 700 mm kitchen that cannot be saved at all — five `EMPTY_COLUMN_OVERLAPS_PLACEMENT`
refusals at the `PUT` seam, four standing runs recorded as free space, openings drawn through
cabinets. What it opens is 100 mm of one recorded space at the far end of one wall, reachable only by
a later unrelated resize or insert, silent but bounded and not compounding. Holding the branch does
not shrink the residue; it keeps the larger defect shipped.

**Two conditions on the close, and they are what make this honest rather than convenient.** The
residue is recorded with its measurement and a named wave before the merge, not after. And **wave
6J-d's criteria may not claim more than the wave delivers**: any criterion asserting that a recorded
width survives is scoped to the commands 6J-d owns — the depth change and the fall-through arm — so a
later reader meets the boundary in the plan rather than rediscovering it in the tree.

## Finding, recorded and NOT ruled: the validator is blind to a cross-wall corner intersection

Raised by wave 6J-c's coordinator, confirmed here, and **deliberately not scheduled**.

`validateDesignForCatalog` returned `[]` on the design whose `base-corner-return-320` overlapped wall
A's corner by 80 mm and whose wall corner return overlapped by 31 mm (ADR 0089 decision 3's
measurement, at `14cef90`). It would have returned `[]` had 6J-c's fix been wrong in the same
direction. The blindness is **declared rather than accidental**, and its declaration names the exact
reason it is only true away from the corner — `findWallOverlaps` groups spans by wall, and
`groupSpansByWall` carries the comment:

> *"Both walls originate at the same corner and walk their own axis (§2), so the same along-wall
> coordinate on wall A and on wall B are two different places and are never compared."*

True everywhere except at the corner, where a wall-A body's **depth** is measured along wall B — the
very fact ADR 0089 and `along-wall-chain-shift.ts` are built on. The same-wall case is covered and
fires correctly: the five `EMPTY_COLUMN_OVERLAPS_PLACEMENT` refusals in the measurement above are that
sweep working.

**It deserves a small wave, and not in M6's depth track.** Three reasons it is not scheduled here.
It is a **reporting** gap, not a geometry gap — the geometry it would have caught is what 6J-c and
6J-d make correct. A new code at the load seam can make an already-stored document unloadable, which
is ADR 0052's dead link and needs its own adjudication before a severity is chosen; the likely answer
is a **`mark`**, beside `PLACEMENT_PAST_WALL_END`, not a refusal. And widening 6J-d into it would
enlarge a wave that is already on the critical path. Recorded as `docs/BACKLOG.md` entry 50.

## Finding, recorded and NOT ruled: column chain-homogeneity is an invariant nothing enforces

Decision 3 names it and wave 6J-d asserts it on the seeded design at both settings. **No refusal
enforces it on an arbitrary document.** A column whose members declared two different chains would
tear by 30 mm at 700 — the frozen extent sliding on its recorded source's chain while a member slid on
its own — and every layer downstream would be internally consistent and wrong together.

Whether it is reachable was not measured: it needs an offer list that can place a `wall-map` entry into
a column already holding a `base-formula` one, and the two shipped `wall-map` entries are
`STRUCTURAL_CORNER`. Enforcing it means either a new refusal code (load seam, ADR 0052/ADR 0084) or a
catalogue-level sweep, and choosing between those is a decision this record does not make. Recorded as
`docs/BACKLOG.md` entry 51.

## Note — 2026-09-11: Amendment B does not govern authoring a new document for its room

Asked by M7 wave 7D1, whose composition shell is a new document written for a fixed room. **Amendment
B's rule is unchanged and does not reach it**: the rule protects a customer's *recorded* space from a
pass derived from the room, because a reversible setting could otherwise shorten that space for good.
A shell has no customer space and a room that never changes (ADR 0083 decision 2) — the *"always past
the end"* input this record already distinguishes. The shell does not use `clipEmptyColumnsAtWallEnd`
on its recorded face at all; it tiles each free run to its planned end
([ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
Amendment B).

