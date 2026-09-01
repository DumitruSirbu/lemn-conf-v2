# ADR 0046 — Adjacent empty columns merge under an 800 mm cap, and an insert splits the column it does not fill

Status: Accepted
Date: 2026-09-01
Type: Decision
Milestone: M5B — Manual UX remediation, waves 5B4a and 5B4b; revives [ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md) under a cap; requires [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md)

## Context

Report items 4 and 5 (`testing-reports/09-manual-ux-issues.md`) are backlog 2's original defect,
reported again by hand: adjacent empty spaces do not merge, so a customer who cleared two 300 mm
cabinets is offered only the four bodies that fit 300 mm, where a merged 600 mm space would offer
most of the catalogue.

[ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md) decided that merge on 2026-08-28,
built it in wave 5D2b, and **withdrew it on 2026-08-30**. The withdrawal is the reason this record
exists and is written the way it is.

**What ADR 0037 measured.** `recomputeVoids`
(`packages/configurator-domain/src/void-engine.ts:733-753`) derives a column's free spans from its
members' `[y0, y0+h]` intervals and the column's `top`. **Width is never subtracted.** Harmless while
a column was never wider than its members; a merged column always is. Measured: clear `A|1.30` and
`A|2.00`, get the promised 1400 mm space, insert a 600 mm cabinet — *"the whole level closes,
stranding 800 mm of wall with no void, no column and no second insert"*. A `widthFlex: 'fit'` body
was refused outright for trying to fill 1400 against §7's 800 mm ceiling.

That function's own doc comment carries the correction the withdrawal earned: the gap is **not** the
merge's doing. It predates M5 and is reachable in four taps with no resize and no merge — clear
`A|2.60`, insert a 300 mm bottle cargo into the 600 mm opening, and 300 mm of wall is gone. What the
merge did was make it unbounded and ordinary, on the very path backlog 2 was reported from.

## Owner decisions, 2026-09-01

**The merge returns, capped at 800 mm.** If the sum of adjacent empty columns on the same wall and
row is at most 800 mm they merge; if not they stay separate. A 600 and a 400 each take their own
cabinet — *"and this is a solution"*. A chain longer than 800 merges **the widest contiguous run
that stays at or under 800**: three adjacent 300s become a 600 and a 300.

The purpose is stated in the owner's own words and is worth keeping, because "merge two openings"
sounds like it should produce a bigger cabinet and it does not: merging exists *"to unblock the
selection of the cabinets that can fit this empty space. Because if you keep only three hundred
millimetres, you can choose only three cabinets. But if you have six hundred you are able to choose
majority of the cabinets."*

600 mm is an acceptable fallback cap if 800 proves hard. 800 is preferred.

**A manual merge control is rejected.** Offered a *merge left / merge right* button, the owner:
*"It's a additional click for the user that I really want to avoid."*

**The merge happens at derivation, not at insert time.** The owner was offered the alternative — leave
two 300 mm gaps on screen and merely widen the offer list — and rejected it on UX grounds: a customer
who sees two 300 mm gaps and is offered a 600 mm cabinet is looking at a picture that disagrees with
the offer. **The merged space must be visible as one space.**

**An empty gap of any width is legal** ([ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md),
same day). That is what makes the second half of this record buildable at all.

## Decision, part 1 — an insert splits the column it does not fill

**When a body is inserted into a column wider than itself, the column becomes two: the occupied part
at the body's own width, and the remainder as a new empty column.** When the body fills the column
exactly, nothing is created — the same exact-to-zero case ADR 0031 rule 6 already has for a resize.

This is §4's missing horizontal half, and it is what the withdrawal said was needed. It is stated
first, and it **ships first, in its own wave, with no merge in the tree**, because it is valuable
alone: it cures the four-tap bottle-cargo case that predates every merge. Proving it there is the
gate on shipping the merge at all.

### The body must be seated at an edge, and this is not a detail

`insertBody` takes the placement's `alongMm` from **the target opening's own along-wall
coordinate** (`packages/configurator-domain/src/commands/insert-body.ts:227-229`), and
`refuseColumnDrift` (`insert-body.ts:330-343`) requires it to, so that the derived key is the
target's — ADR 0011 Gap D's phantom-column guard. The opening's coordinate is the column's centre.

So a 400 mm body inserted into a 600 mm column is **centred, with 100 mm on each side**. A split that
respected that would produce **two** remainders, on opposite sides of the new body, which can never
be merged back because they are not adjacent. Under an 800 mm cap and ADR 0035's 50 mm stepper that
is the ordinary case, not a corner case — and it would be worse for the customer than the state the
merge is meant to fix.

**Therefore a body inserted into a column wider than itself is seated flush against one end of the
span.** The whole remainder is then one contiguous column.

**Which end: the LEFT edge of the span — the lower along-wall coordinate — always.** Owner,
2026-09-01, answering the question this record put to them. One usable gap forms on the right rather
than two slivers either side.

Left unconditionally, rather than the *"whichever end abuts an occupied column"* rule that was
proposed. The owner's answer is the simpler one and it is better for the reason the simpler rule
usually is here: it has no predicate to get wrong, no tie to break, and it gives the customer the
same result from the same picture every time. A conditional rule would have made the gap appear on
the left in some runs and the right in others, for a reason the customer cannot see.

**`refuseColumnDrift` is restated, never deleted.** Its invariant becomes *the placed body's derived
key is the key the split planned for it* rather than *the target opening's key*. Deleting it
re-opens Gap D.

### A shipped behaviour ends here, and the owner accepted the cost by name

`resolveFixedSetWidth` centres a narrower discrete body in a wider opening — *"exactly as
`base-dishwasher` has always put a 600 in a 700"* (`commands/insert-fit.ts:367`). **After this record
`base-dishwasher` no longer centres in a 700 mm opening.** It is seated at the left edge and the
100 mm becomes a real, selectable opening on the right instead of vanishing into a column nothing can
reach.

This was put to the owner as the named cost of the left-edge rule on 2026-09-01 and **accepted**. It
is recorded as a decision rather than a side effect because it is the one change here a person can
see without looking for it, and because the vanishing 100 mm was never a feature — it is the same
stranding this record exists to end, arriving through the discrete-width path instead of the merge.

**It is a test expectation of wave 5B4a, not something a reviewer discovers.** The wave asserts that
inserting `base-dishwasher` into a 700 mm opening leaves a 600 mm body flush left and a 100 mm empty
column on the right, with the 100 mm publishing an opening. A test that still asserts centring is
asserting the defect.

**The insert command owns the resulting column map.** `resolveColumns`
(`apps/web/src/store/apply-command-result.ts:104-112`) replaces the map only for `body_resized`, and
its comment gives the reason a store must not re-derive globally: §10's delete would then produce no
openings at all. So the `body_inserted` effect gains a column map the way `body_resized` has one.

## Decision, part 2 — adjacent empty columns merge, capped at 800 mm

**Adjacent empty columns on the same wall and row merge into one, when the run's total is at most
800 mm; otherwise the widest contiguous run at or under 800 merges and the rest stays separate.**
The predicate for "empty" is unchanged from ADR 0037 and is deliberately the one ADR 0031 already
funds a resize from: the column has no member at **any** level. Deleting one cabinet at one level
merges nothing.

**800 mm still caps every cabinet.** Nothing about this lifts §7's ceiling. What the merge produces
is freedom over the **number and position** of cabinets in a span, which is what backlog 2 said was
permanently impossible.

The seams are the ones ADR 0037 used and they are still there — `resolveColumns` after every command,
`moveFrozenColumns` (`commands/apply-column-moves.ts:186-206`, whose comment still marks the
removal) — plus, newly possible because of [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md),
`deriveColumns` at load.

### Three rules the cap forces, none of them in ADR 0037

1. **The scan is greedy, left to right, over the run sorted by along-wall coordinate.** ADR 0037
   measured order-independence — a chain of five collapsed to one 3000 mm space whatever the order —
   and under a cap that property is **gone by construction**: 300 + 500 + 300 gives 800 + 300
   scanning from the left and 300 + 800 scanning from the right. `columns` is a `Map` and iterates in
   insertion order, so a greedy scan over the map would make the geometry depend on the order the
   customer's commands happened to run in. Sorting first is what makes one design one picture.
2. **Only columns whose floor and `top` agree merge.** `deriveFreeSpans`
   (`void-engine.ts:692-705`) reads `min(regions[].start)` and `column.top`. A base-run column
   (`top` 0.86) merged with a cleared full-height one (`top` 2.6) would, under a naive `max`, publish
   wall-level and top-level openings over ground that never had any. §4 rule 1 exists for precisely
   this — *"deleting the wall unit at x = 0.30 offered a 2200 mm opening down to the floor, where the
   corner base actually stands. Overlapping columns."* Agreement is judged within `LEVEL_SNAP_M`.
   This is what the owner's *"same row"* means in the engine's terms, and ADR 0037 does not discuss
   it because the shipped kitchen's deletable columns happen to agree.
3. **The merged extent and its key come from one number.** `deriveColumnKeyAt` rounds to 10 mm, so a
   run from 1.30 to 1.85 has centre 1.575 and keys as `1.58`. `frozenColumnKey`
   (`apply-column-moves.ts:227-229`) already derives both from one value and this must do the same;
   `refuseKeyCollision` catches a clash but is blind to drift.

## Why the cap plus the split is sufficient, and where it is not

The lead's brief asked for this to be verified rather than inherited. It was, by reading the code
named above, and the answer is in three parts.

- **The `'fit'` refusal is cured by the cap alone.** No merged span exceeds 800, so no `widthFlex:
  'fit'` body is ever asked to build past §7's ceiling. `resolveFitWidth`
  (`insert-fit.ts:341-354`) refuses on `acceptsWidthMm` against the entry's declared range, and the
  range's upper bound is 800.
- **The stranding is *not* cured by the cap.** Insert a 400 mm body into a merged 600 and 200 mm
  still strands, for the identical reason ADR 0037 withdrew over: `recomputeVoids` subtracts height
  and never width. The cap bounds how much can strand — to just under 800 — and prevents nothing.
  Anyone reading the cap as the fix is reading it wrong.
- **The stranding is cured by part 1, and by nothing else.** Which is why part 1 ships first, alone,
  and why its gate is ADR 0037's *own* withdrawal scenario plus the four-tap case that predates it.
  The merge is dispatched only once that is green in the tree.

**One residual this record does not close.** ADR 0035 decision 7 lets a shrink widen an empty column
with no ceiling: `void-engine.ts:744-751` records nine taps producing a **900 mm** empty column,
where every `'fit'` cabinet is refused. The 800 mm merge cap does not bound that path — it is one
column growing, not two merging — and it remains the open product question recorded in
`docs/milestones/M5-width.md`. A reviewer will meet a >800 mm empty column while testing this and
must not read it as this record's regression.

## What this is and is not, against backlog 2

Backlog 2 chose **option B**, *"a run's total offered as valid module combinations
(`800+600`, `600+400+400`, `600+600+200`)"*, on 2026-08-26, over boundary-move-only (option A,
*"otherwise we stick to not a custom furniture but to like IKEA"*) and free-form width (option C,
rejected).

This record delivers option B's **mechanism** and not its product half. One span yielding several
columns is exactly what §12 lists as designed-and-not-built, and what `findTouchedColumnKeys`
already anticipates — *"one body becoming two (backlog 2's re-split) is the same question as one body
moving"* (`void-engine.ts:466-471`). What it does **not** deliver is the offer: nothing shows the
customer `800+600` versus `600+400+400` for a run and lets them pick.

So this is a narrow slice of backlog 2, not the whole of it. **Backlog 2 stays open**, with its
remaining half named as the combination offer. It does not drag the full re-split in, and the split
here is reachable without it because an insert already chooses one body at one width.

It does not reopen free-form width either. ADR 0035's 50 mm stepper is option B at a finer module —
discrete steps against a fixed ceiling — and a merged space is bounded by the same 800 as everything
else.

## Alternatives considered

**Merge only in the offer list, leaving two gaps on screen.** Put to the owner and rejected: the
picture would disagree with the offer.

**A manual merge-left / merge-right control.** Put to the owner and rejected: an extra click.

**Cap at 600 instead of 800.** The owner's own stated fallback. Not taken, because 800 is preferred
and nothing in the code makes 800 harder than 600 — the cap is one constant and the arithmetic is the
same.

**Seat the inserted body against whichever end abuts an occupied column.** Proposed by this plan and
**rejected by the owner** in favour of an unconditional left edge. It would keep a run contiguous in
more cases, and it would put the gap on a different side depending on a predicate the customer cannot
see. Determinism a person can predict beat local tidiness.

**Ship the merge and the split as one wave.** Rejected. The two are separable in the direction that
matters: the split is safe and valuable alone, and the merge is safe only after it. Shipping them
together would put the phase's whole risk on one review round, on the item the owner has already been
burned by once.

**Subtract width inside `recomputeVoids` instead of splitting the column.** Considered and rejected.
It would make a void that no column owns, and every consumer — `insertBody`'s `COLUMN_MISMATCH`
guard, `deriveColumnKeyAt`, the frozen map, ADR 0031's funding scan — is written against the rule
that an opening belongs to a column. Splitting keeps that rule; subtracting breaks it everywhere at
once.

## Records swept before deciding, and how each is settled

| Record | Date | What it says | Settled how |
| --- | --- | --- | --- |
| [ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md) | 2026-08-28, withdrawn 08-30 | Adjacent empty columns merge, uncapped; withdrawn because §4 has no horizontal half. | **Revived under a cap and superseded by this record.** Its rule, its predicate and its *"800 still caps every cabinet"* are carried forward verbatim. Its withdrawal stands as the reason part 1 exists and ships first. Amended in place with a dated pointer here. |
| [ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md), *A span wider than 800 mm may simply stay empty* | 2026-08-28 | Owner: an opening no cabinet fits is *"ok to have empty space left"*. | **Unchanged and load-bearing.** It is why a 400 or a 300 left over after a merge is a legal state rather than a defect, and why the >800 shrink residual above is tolerable. |
| [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md) | 2026-09-01 | An empty gap of any width is legal; a growth has no remainder floor. | **Prerequisite, and it is what makes part 1 legal.** A split leaves a remainder of any width, and under ADR 0031's floor most such remainders were illegal states to create. No conflict; a dependency. |
| [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md) | 2026-09-01 | Empty columns are persisted. | **Hard prerequisite.** A merged or split column that vanishes on reload is worth nothing. |
| [ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md) | 2026-08-27 | A resize moves a whole column funded by an adjacent empty column; outer edges hold; rule 6 removes a column consumed to zero. | **No conflict; reused.** The split's arithmetic is ADR 0031's — two edges hold, the boundary between them is where the new body's edge lands — and the exact-to-zero case is rule 6 applied to an insert. |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D | — | A column's extent is frozen; only a command that moved a body may re-derive its keys; `refuseColumnDrift` refuses a phantom column. | **Honoured, and it constrains part 1.** The split is a command-owned write to the frozen map, exactly as a resize is; the drift guard is restated rather than removed. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decisions 1 and 7 | 2026-08-28 | Every cabinetry row has an 800 mm ceiling; a shrink creates the empty space it needs. | **No conflict.** Decision 1 is the cap this record borrows. Decision 7's uncapped empty column is the residual named above, and is untouched. |
| [ADR 0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md) | — | An entry that does not fit is shown disabled with its reason, never removed. | **Corroborates.** A 200 mm remainder column publishes its opening and its rows are disabled with a reason — `recomputeVoids`' own note (`void-engine.ts:735-741`) already settled that a column narrower than any cabinet still publishes. |
| `DEVELOPMENT-SPEC.md` §4, *"§4 has no horizontal half"* | — | The algorithm subtracts height only; backlog 2's re-split is the missing piece. | **Superseded by part 1**, and §4 is amended with a dated pointer. The pseudocode is unchanged — what changes is that a column is split before `recomputeVoids` runs, so no column is ever wider than its members. |
| `DEVELOPMENT-SPEC.md` §13.1, *"nothing can move horizontally any more, so column identity is permanently stable"* | — | Given as the reason the void model stays honest. | **Superseded in its reasoning, not in its rule.** ADR 0031 already moved columns horizontally on a resize; this adds a second mover. Column identity is stable *within a command*, which is what the void model actually needs. Amended with a pointer. |
| `DEVELOPMENT-SPEC.md` §13.3 item 2, *"Run re-split — the last piece of the width story"* | — | Open question. | **Half closed.** The mechanism ships; the combination offer does not. Amended with a pointer, and it stays open. |
| `docs/BACKLOG.md` entry 2 | 2026-08-26/28/30 | Option B chosen; ADR 0037's mechanism right and withdrawn; *"clearing two adjacent cabinets still gives two openings"*. | **Amended with a dated pointer here.** Its banner is updated to say the mechanism is being built under a cap, with the split first, and that the entry stays open for the combination offer. |
| `docs/BACKLOG.md` entry 2's amendment | 2026-08-26 | `MIN_WIDTH_M` stays 300; the near-miss of lowering the wrong constant. | **Honoured. Neither constant moves.** `MIN_WIDTH_M` and `MIN_SPAN_M` are untouched by this record; the 800 mm cap is a merge bound, not a floor. |

Nothing in the sweep makes the owner's decision unimplementable. The one record that said the
opposite — ADR 0037's withdrawal — said it about an **uncapped merge with no split**, and both of
those conditions are changed here.

## Note for 5B4b, added by 5B2b, 2026-09-01

The milestone left open whether `projectEmptyColumns` (ADR 0044) runs pre- or post-merge — before
the merge decided here folds adjacent columns into one, or after. **This record does not force
either.** The seam is neutral by construction: `projectEmptyColumns` takes the resolved column map as
an argument, so whichever map is canonical at that point — merged or not — flows through it
unchanged, and 5B2's own criterion 3 (the deep round-trip) catches either choice equally, since the
merge is a fixpoint under the cap.

But the two choices are not equally good, and the reason is what gets **stored**. A merged column is
a *derived* fact — it exists because the 800 mm cap said so at the moment it was computed — and
persisting the merged extent stores that derivation's output rather than its inputs. If the cap ever
moves (600 mm was the owner's own stated fallback), a document written under the old cap would carry
a merged empty column no code can any longer reproduce from its own placements, and there is no
record of the pre-merge columns to re-derive it from. **Pre-merge is therefore the better default.**
5B4b must state which map it projects; this record does not decide it for them.

## Consequences

- **`deriveColumns`' horizontal freeze gains its exceptions, and they are now two:** a merge changes
  an extent, and so does a split. Both are writes of the kind ADR 0031's column update was, and M5's
  four column-identity regressions are what catch either going wrong.
- **An insert becomes a column-map-writing command.** Before this, only a resize was. `CommandEffect`
  changes shape, and every consumer of `body_inserted` has to be re-read.
- **A shipped centring behaviour ends** (`base-dishwasher` in a 700 mm opening), deliberately, with
  the owner's accepted cost recorded above and asserted in wave 5B4a.
- **Every insert into a wider span puts the gap on the right.** That is a rule a customer can learn,
  and it is the whole reason the unconditional edge was preferred to a conditional one.
- **Backlog 2 does not close.** Its combination-offer half stays open with an owner and no phase.
- **The >800 mm empty column from a shrink is untouched** and stays an open product question.
- **If the 800 mm cap ever moves to 600**, only the constant moves — every rule here is stated in
  terms of the cap rather than the number.
