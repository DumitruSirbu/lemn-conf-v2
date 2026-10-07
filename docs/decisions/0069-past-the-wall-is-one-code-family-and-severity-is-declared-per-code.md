# ADR 0069 — "Past the wall" is one code family, and severity is declared per code

Status: Accepted — **the wall-end clip's seam amended 2026-09-06 by [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) Amendment B.** The owner ruling below — nothing past the wall is ever offered — is unchanged; what moved is that the cap no longer rewrites the stored document.
Date: 2026-09-03
Type: Decision
Milestone: M6 — wave 6A3. Extends [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)
decision 7; amends [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md)'s refusal-code
list; leaves [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md)'s nine refusals
intact in meaning.

**Pointer, 2026-10-01.** The corner sweep's reach for a recorded column that holds members is banded by
the body it is compared with ([ADR 0110 Amendment O](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-o--2026-10-01-a-fixed-corner-wall-unit-stands-over-every-generated-corner-the-top-row-the-validators-banded-reach-and-the-fridge-gap-absorb),
O5). It can only remove a finding. No code is added and no severity is changed by it [per the plan, C2 S2
item 6; not re-read in `validate-design.ts` by the scribe]. Nothing here is struck.

## Context

Wave 6A3 demoted **one** validation code — `PLACEMENT_PAST_WALL_END` — out of the findings that
refuse a load or a write, so that ADR 0065 decision 7 ("saves and resumes with the warning intact")
would become true. Adversarial QA measured it and it is not true. Two findings, both reproduced
through the real derivation chain rather than by hand-built documents.

**The demotion is one code wide; the store writes the other two.** `apply-command-result.ts` rewrites
the frozen map on **every** command, and `projectFrozenMap` emits a `columnExtents` entry for every
column holding a member — including the column holding a body that reaches past the wall. Built
through `derivePlacementRecords` → `deriveColumns` → `projectFrozenMap` on the seeded kitchen with
its last wall-A column moved 100 mm along, whole column, all bands:

```
before freezing → fatal codes []
after freezing  → fatal codes ['COLUMN_EXTENT_OUTSIDE_ROOM']
column emptied  → fatal codes ['EMPTY_COLUMN_PAST_WALL_END']
```

So an overflowing design saves **once** and stops saving the moment its owner touches anything else
in the kitchen, and a stored row that already carries the frozen map answers 500 on load. Decision 7
is met only for a design nobody has edited since — which is not a design anyone has.

**The room correction declines on exactly the rows it exists for.** `correctPreCorrectionRoom`
(`migrate-design.ts`) asks two questions of complete, unfiltered validity:

```ts
if (isValidForCatalog(design, catalog)) return design;      // does this need repair at all?
if (!isValidForCatalog(corrected, catalog)) return design;  // does the corrected room repair it?
```

The second still counts an overflow as a failure. A version 1 or 2 row plus **one** body a customer
dragged past wall B — legal when written, since the old bound was `max(w, d)` = 3600 — therefore
keeps the uncorrected `{3600, 2400}` room, and the overflow query then reports three bodies where one
moved: the phantom `p7` and `p24` overrun at 600 that ADR 0065's own consequences section says does
not exist. One customer edit vetoes the measurement correction for the twenty-five bodies that did
not move, and because every save stamps `CURRENT_SCHEMA_VERSION = 3` the wrong 2400 mm depth is
locked in permanently and the arm never runs again.

**The shape of the mistake is what this record is really about.** A filter written as
`code !== "PLACEMENT_PAST_WALL_END"` cannot be wrong about a code it was never shown. Both findings
are the same failure — a *forgotten* member — arriving at two seams.

## Decision

### 1. "Reaches past the end of its own wall" is a code **family**, and the whole family is demoted

The demoted set is exactly the findings whose sole assertion is `alongEndMm > wallLengthMm(wall,
room)`, on whichever of the three arrays the run is recorded in:

| Code | Recorded on | Why it is a mark |
| --- | --- | --- |
| `PLACEMENT_PAST_WALL_END` | `placements` | ADR 0065's original. The customer's body stays where they put it. |
| `EMPTY_COLUMN_PAST_WALL_END` | `emptyColumns` | The same run after its bodies were removed. ADR 0065 tells the customer to *"remove something"*; refusing this refuses precisely that remedy. |
| `COLUMN_EXTENT_PAST_WALL_END` | `columnExtents` | The frozen extent of the column holding a marked body, written by the store on every command. Refusing it is refusing the second save. |

`COLUMN_EXTENT_PAST_WALL_END` does not exist yet; decision 3 creates it.

### 2. The rule that decides membership, so a later code is classified by rule and not by taste

> **A validation finding is a mark if and only if the single fact it asserts is that a run reaches
> past the end of the wall it stands on. Every other finding is a refusal. A finding that asserts
> that fact _together with_ any other fact is a refusal until it is split into codes that each assert
> one fact.**

The second sentence is load-bearing and is what forces decision 3. The reasoning behind the first:

- **Every other code says the document contradicts itself, the catalogue, or a bound that is not the
  wall-end bound.** An overlap, a key collision, an extent that excludes its own member, a body the
  catalogue has not got, a duplicate id, an inverted interval — in each of those the derivation
  produces a kitchen the document does not describe, or throws. Marking one would put a wrong scene
  on screen and price it. The past-the-wall family is the only one where the derivation is exactly
  right and the *result* is unbuildable, which is the whole content of ADR 0065.
- **It is reachable through ordinary editing and the others are not.** ADR 0065's reachability
  paragraph already established that every coordinate in both correction bands passed the write seam.
  No command in this product produces an overlap or a key collision.
- **It is one-sided, and deliberately.** `PLACEMENT_BEFORE_WALL_START`,
  `EMPTY_COLUMN_BEFORE_WALL_START` and `COLUMN_EXTENT_BEFORE_WALL_START` are **fatal**, and they are
  the codes most likely to be swept into the family by a reader who reads "wall bound" for "wall
  end". ADR 0065 decision 4 and ADR 0067's table are about the wall's **end**; a negative along-wall
  coordinate puts a run behind the origin corner, in the other wall's space, and is not something a
  customer can reach.
- **Height and depth are different bounds and stay fatal.** `*_ABOVE_ROOM` is a body through the
  ceiling and `*_DEEPER_THAN_ROOM` is a space out through the shell — review finding F2's defect,
  named as such in `validate-design.ts`'s own commentary.

### 3. `COLUMN_EXTENT_OUTSIDE_ROOM` is split into four codes, one per edge

It is one code covering four breaches — before the wall start, past the wall end, above the room, and
across the wall — distinguished today only by the issue **path**. Under decision 2 it therefore
cannot be demoted as it stands, and demoting it whole would demote "reaches through the ceiling" and
"reaches out through the shell" with it. It is replaced by the four names the `emptyColumns` half has
carried since ADR 0044:

| Replaces | New code | Severity |
| --- | --- | --- |
| `COLUMN_EXTENT_OUTSIDE_ROOM` at `.alongMm`, start side | `COLUMN_EXTENT_BEFORE_WALL_START` | fatal |
| `COLUMN_EXTENT_OUTSIDE_ROOM` at `.alongMm`, end side | `COLUMN_EXTENT_PAST_WALL_END` | **mark** |
| `COLUMN_EXTENT_OUTSIDE_ROOM` at `.topMm` | `COLUMN_EXTENT_ABOVE_ROOM` | fatal |
| `COLUMN_EXTENT_OUTSIDE_ROOM` at `.depthMm` | `COLUMN_EXTENT_DEEPER_THAN_ROOM` | fatal |

**This overturns a recorded choice and says so.** `findExtentRoomIssues`'s own comment reads *"one
refusal reads as 'this extent is not inside the room', and which edge it crossed is a detail for the
reader of the path"*, and ADR 0053's refusal list names the single code. That was defensible while
all four edges carried the same severity. They no longer do, so the edge is load-bearing and belongs
in the code rather than in the path. The three arrays now name their bounds identically, which is
what they should have done from the start.

An extent that breaches two edges at once emits two findings, one of which may be fatal. That is
correct: the fatal one refuses it, and the mark is still true.

### 4. Severity is **declared per code**, in a total map, not filtered by a list of exceptions

`fatalDesignValidationIssues` reads a `Record<DesignValidationCode, DesignIssueSeverity>` and keeps
the `"refusal"` entries. The map is total, so **adding a member to `DesignValidationCode` without
classifying it fails to compile**.

- **Rejected: a list of demoted codes** (`code !== X`, or `!DEMOTED.has(code)`). It is the shape that
  just failed. A list is silent about a code it has never been shown, and both of this record's
  defects are a code the list was never shown. It also gets the default backwards for the *other*
  risk: a filter list defaults a new code to fatal, which is the safe direction, but the failure that
  actually happened was a code that should have been demoted and was silently not.
- **Rejected: inferring severity from the code's name** — a `endsWith("PAST_WALL_END")` test. It
  would classify all three of today's family correctly and is exactly the inference this project
  refuses elsewhere: ADR 0061's *"declared per entry, never inferred from a kind"*, the same argument
  as `cabinet-handles.ts` and `occupied-depth.ts`. A name is a label, not a rule, and the next code
  that means "past the wall" may not be spelled that way.
- **Rejected: a `severity` field on `DesignValidationIssue` itself**, set where the issue is raised.
  It puts the classification at twenty-six call sites instead of one table, so the exhaustive read —
  *which codes are marks?* — stops being answerable by looking at one place, and a reviewer cannot
  check the family is complete.

The map carries a one-line reason per demoted entry and nothing per refusal; the refusals are the
default in meaning even though the type makes them explicit in code.

### 5. The room correction's second guard asks **fatal** validity; its first guard stays unfiltered

```ts
if (isValidForCatalog(design, catalog)) return design;              // unfiltered — unchanged
if (hasFatalIssues(corrected, catalog)) return design;              // fatal-only — the fix
```

**Guard 1 must stay unfiltered, and this is not an oversight.** An overflow under the uncorrected
room is the *symptom of the mis-measured room* — it is how the arm recognises a document that needs
repairing at all. Filtering it turns the arm off on exactly the documents it was written for; QA
established this by mutation (seven tests, including *"corrects the room when the entry is absent"*).

**Guard 2 conflated two different things and only one of them was real.**

| What guard 2 was protecting | Still load-bearing? |
| --- | --- |
| *The corrected room is not the answer to this document's problems* — it is malformed, names an unknown body, overlaps itself — so leave it alone and let it fail on its own terms with its own issues. | **Yes.** Preserved exactly, because those findings are all fatal and the fatal-only guard still sees them. |
| *One body still reaches past the end of a wall after the correction.* | **No.** Since ADR 0065 that is not a failure, so "the corrected room does not rescue it" is false: the corrected room *does* rescue it, into a document that loads, saves and carries its mark. |

**"Corrects a mis-measured room" and "makes an overflowing body fit" are different things, and the
distinction survives.** What makes the correction safe is not that the result validates — it is that
the corrected room is a **constant**, `{3560, 2830}`, reached only at version ≤ 2 from the exact
pre-correction pair `{3600, 2400}`. No room value is ever derived from the document's own placements.
A body at 3000 on wall B is still past the wall after the correction and is still marked; nothing has
been rescued, and the migration's *"a room they never entered"* guard is untouched. The correction
writes the seeded kitchen's measured truth; it has never been, and still is not, a function of where
the bodies stand.

### 5b. Amended 2026-09-03, same day, from the logic review: guard 1 is **deleted**, not kept

Decision 5 above said *"guard 1 stays unfiltered"*. That is now overtaken and the reasoning is
recorded rather than quietly replaced.

**The review is right that guard 1's commentary is wrong.** It claims identity-preservation, and it
cannot do that job: `isPreCorrectionRoom` has already established that the stored room differs from
the corrected one, so the corrected object is never identical to the input. Its only remaining effect
is to **decline the correction when the document happens to be fully valid under the wrong room** —
which makes the arm fire as a function of where the bodies stand, the same class of thing decision 5
forbids for the room value itself.

**What it was actually protecting, and why that fails.** The migration's recorded third guard exists
to make *a wrong version stamp* survivable — an M7 customer who genuinely entered 3600 × 2400,
mis-stamped at version 2. It protects that customer only when their kitchen happens to fit; the one
whose kitchen overflows is corrected anyway, which is the case the guard was written for. And it
harms the seeded rows symmetrically: a version 2 row whose owner deleted `p7` and `p24` — the only
seeded bodies past 2400 on wall B — now fits under the wrong room, so the guard declines, and that
customer keeps a room 40 mm too wide and 430 mm too shallow **permanently**, because the next save
stamps version 3 and the arm never runs again. **A guard keyed on an irrelevant fact protects the
case that is fine and fails the case that is not, in both populations at once.**

**Provenance is what settles it.** Before M7 there is no room control, so at version ≤ 2 the pair
`{3600, 2400}` has exactly one origin: the seeded fixture's mis-measurement. The correction is
therefore **owed to every such row unconditionally**, and asking whether its bodies happen to fit is
asking a question with no bearing on whether the wall was measured correctly. The version gate is
what settles the M7 customer, exactly as the migration's own first guard already says — *"That alone
settles the customer case"*.

So the arm becomes: **pre-correction pair and version ≤ 2 → correct, unless the corrected room
carries a fatal finding.** Guard 2 (decision 5) is the only guard left and it is the one that was
doing real work.

**The consequence to state plainly, because it is customer-visible.** Wall A narrows 3560 from 3600,
so a corrected row may show a mark it did not show before. That mark is **true** — the wall is
3560 — and suppressing it is what ADR 0065 exists to forbid. Wall B only ever gains room. The
alternative is a kitchen manufactured against a measurement the product knows is wrong.

**QA's mutation result does not contradict this.** QA measured *filtering* guard 1 to fatal-only,
which turns 7 tests red because a valid-except-overflow document then returns by identity.
**Deleting** guard 1 is a different mutation and those 7 are expected to stay green; the one case
that changes is `SYNTHETIC_EMPTY_ROOM` at versions 1 and 2. The implementer measures this rather than
assuming it.

> **EXTENDED BY [ADR 0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md)
> (2026-09-05), after wave 6Q-b's adversarial QA. Guard 2's predicate becomes a comparison; nothing
> above is overturned.** Decisions 5 and 5b measure the corrected document *absolutely* — *"unless
> the corrected room carries a fatal finding"* — and wave 6Q-b added
> `PLACEMENT_WEARS_UNOFFERED_FINISH` to the severity table, a finding that is a function of
> `design.settings` and `design.placements` and of no room at all. So a document carrying it declined
> the room correction for a reason with no bearing on whether a wall was measured correctly:
> **measured, `room.widthMm` came back 3600 with the finish and 3560 without it.** That is 5b's own
> objection to guard 1 — *"a guard keyed on an irrelevant fact protects the case that is fine and
> fails the case that is not"* — arriving at guard 2 through a code that did not exist on 2026-09-03.
>
> The arm now reads: **pre-correction pair and version ≤ 2 → correct, unless the correction
> *creates* a fatal finding the uncorrected document did not carry**, compared by the `(code, path)`
> pair. Guard 1 stays deleted, guard 2 stays and stays fatal-only, and decision 5's table is what
> justifies the narrowing: its first row (*the corrected room is not the answer to this document's
> problems*) and the dead-`/d/{id}`-link cost are both preserved, because a correction that narrows
> wall A by 40 mm genuinely can create a fatal finding — measured witness, a wall-B `emptyColumns`
> entry of `depthMm: 3580`, fatal against 3560 and legal against 3600. Decision 4 is untouched and is
> what rules out fixing this with a second list of "room-relevant" codes.

### 5c. Pricing derives the overflow fact; it does not accept it

`PriceDesignRequest.overflowingPlacementIds` is deleted and `priceDesign` calls
`findOverflowingPlacementIds(request.design)`. `refuseUnknownOverflowPlacement` becomes dead code and
goes with it.

The field's own comment says what it was: *"what this wave consumes from ADR 0065's overflow
detection, which wave 6A3 owns and **which does not exist yet**"*. It is a placeholder for an unbuilt
query, and the query is now built. Wave 6B's *"pricing neither detects this nor acts on it beyond
carrying it"* is a wave-boundary artefact of that same absence, and is amended here: **calling the
one published query is not detecting.** ADR 0065's consequence already requires that the scene, the
breakdown, the price bar and M8's review *"must all read one answer"* — reading it is the whole
instruction.

Making the field required was rejected. It closes the absent case and leaves the mismatched one: a
caller may pass a set computed off a different `Design`, or off the same one before a command
applied, and every such call type-checks while publishing a wrong flag. The existing guard is
one-directional by construction — it can only check ids it was shown, so an **omitted** overflow
publishes `totalIsFlagged: false` silently. That is decision 4's forgotten-member shape one seam
over, and deriving makes the class unrepresentable rather than guarded.

### 6. What this does not change

- **ADR 0065 decisions 1–6 and 8, and ADR 0067, are untouched.** Nothing is moved, narrowed, removed
  or refused; the fit constraint is still one-sided; a remainder is still the normal case and is
  still never reported.
- **ADR 0044's nine refusals keep their meaning.** One of the nine changes severity; none changes
  what it asserts.
- **The demo/proposed design is still held to the stricter rule.** The seeded fixture, a preset and
  M7's generation must not overflow at all (ADR 0065, milestone 6A3). A mark is an acceptable outcome
  of a customer's edit and of nothing else.
- **M8 still refuses to submit.** Marking is not permission; decision 7's second half stands.

## Consequences

- **An overflowing design now survives an unbounded number of further edits**, which is what decision
  7 always said and what it did not do. The frozen map, the empty column left behind by a delete, and
  the placement itself are all marked and none refuses.
- **`DesignValidationCode` gains three members and loses one.** The type is documented as *"stable,
  public"* and reaches a client in a 400 body, but it is value-free and nothing in `apps/` or in any
  browser test branches on `COLUMN_EXTENT_OUTSIDE_ROOM` — its only readers today are three domain
  test files. The rename is a domain-internal change and must be confirmed by grep, not assumed.
- **`validate-design.test.ts`'s `FATAL_VALIDATION_CODES` table becomes redundant.** It is a
  `satisfies Record<Exclude<DesignValidationCode, "PLACEMENT_PAST_WALL_END">, true>` — the same
  exhaustiveness device this record moves into production, maintained by hand in a test. It is
  rewritten to read the production map rather than to restate it, or the two will disagree.
- **The write seam accepts an insert whose body lands wholly past the end of a wall**, because the
  empty column it was inserted into is now itself only marked. That is consistent with what the seam
  already accepts from a width resize, and M8 still refuses to submit it. **Whether the product
  should _offer_ an opening beyond the end of a wall is a separate question and is not decided here**
  — it belongs to the insert command's own surface (wave 6M / M7) and is the owner's call.
- **The classification rule in decision 2 is the artefact to maintain**, not the table. A wave adding
  a validation code answers one question: *is the only thing this says that a run reaches past the
  end of its wall?*

## Amendment — 2026-09-04: the reserved question is closed, and it was already answered in code

Consequences' second-to-last bullet left standing whether the product should **offer** an insertion
opening that reaches past the end of a wall, naming it "the owner's call". **The owner confirmed:
never — the product does not offer such a slot.** The reasoning that makes this a confirmation rather
than a fresh decision: during wave 6A3 the owner ruled that everything the product proposes *"should
always fit the existing walls, including demo"*. An offered insertion slot is exactly such a
proposal, the same class of thing that ruling already covers; marking a body the customer placed past
the wall is [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)'s business, and
the product *offering* to build into space that does not exist is a different act.

**It was already built, and neither this record nor wave 6M's own section connected the two until
now.** `packages/configurator-domain/src/clip-empty-columns-at-wall-end.ts` opens by naming this exact
question and answering it: an empty column "must never be *offered* as an insertable opening that
reaches past the end of its own wall," and clips the far edge to the wall's own length (dropping a
column that starts at or past it entirely) rather than refusing the document over it. It runs inside
`deriveColumns` in `void-engine.ts`, ahead of `mergeAdjacentEmptyColumns`, so no path that publishes
an insertable opening — command or load — can produce one past a wall's own length. Verified against
the tree on 2026-09-04: the module is imported and called, not merely written.

**What this does and does not change.** The write seam still accepts an insert whose body ends up
past the end of a wall through a route this clip does not see — the consequence above about a width
resize is untouched, and that body is still `PLACEMENT_PAST_WALL_END`'s mark, not a refusal. What
changes is narrower: a **member-less** column — an empty opening nothing occupies — is never itself
offered reaching past the wall. `EMPTY_COLUMN_PAST_WALL_END` stays exactly as it was, a
defence-in-depth mark for a stored document nobody wrote through a command (the same relationship
`EMPTY_COLUMN_WIDER_THAN_CAP` has with the 800 mm split): the clip makes that mark unreachable from
anything a command produces going forward, which does not make the mark meaningless — a hand-crafted
or pre-clip migrated document can still carry one, and it still reads as a mark rather than a refusal.

Not amending Consequences' wording above — it is dated and stands as written, per this project's rule
that a decision record accumulates rather than erases. A reader relying on "not decided here" for the
insertion-offer question should read this amendment first.

## Amendment — 2026-09-06: the wall-end cap bounds what is published and does not rewrite what is recorded

[ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) Amendment B,
raised by wave 6J-d's adversarial QA. **This record's decision is not changed. Its seam is.**

`clipEmptyColumnsAtWallEnd` was written for a member-less column that was *always* past the end of its
wall — a fabricated entry or a remnant — where truncating it and keeping the truncation is right,
because nothing will ever make the wall longer. Wave 6J-c introduced an input this record could not
have had in view: a **reversible command** that pushes a legitimate space past the wall, because a
deeper corner on wall A takes more of wall B. Measured at `cf53e8e` in the 2920 mm room, a space
flush to wall B's end went `[2320..2920]` at 600 → `[2420..2920]` clipped at 700 → `[2320..2820]` back
at 600: **100 mm lost permanently**, with `validateDesignForCatalog` silent and the document storing
cleanly.

The rule ADR 0090 Amendment B states: **a pass that derives its answer from the room may bound what
the map publishes and may not rewrite what the document records.** So the cap still runs on every
published map, and no opening past a wall is ever derived, drawn or offered — this record's owner
ruling of 2026-09-04, intact and unqualified. What stops is the clipped width being written back
through `projectFrozenMap` into `emptyColumns`. A recorded extent the slide puts past the wall is
**marked** instead, on `EMPTY_COLUMN_PAST_WALL_END`, which this record already declares a `mark` — the
same treatment [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) gives a
placement the same slide pushes past the same wall.

`clipEmptyColumnsToFreeGround`, `splitOversizedEmptyColumns` and `mergeAdjacentEmptyColumns` are on
the other side of that line and are unaffected: they derive from the placements or from a declared
ceiling, and no setting change undoes them.
