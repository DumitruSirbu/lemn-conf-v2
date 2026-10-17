# ADR 0037 — Adjacent empty columns merge into one space, and 800 mm still caps every cabinet

Status: Accepted; built in wave 5D2b; **WITHDRAWN 2026-08-30**; **revived under a cap 2026-09-01**
Date: 2026-08-28
Type: Decision
Milestone: M5 — built in wave 5D2b and **withdrawn**; **revived under a cap 2026-09-01 by [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)**; backlog 2 stays open

> **Built, then withdrawn 2026-08-30, then revived under a cap 2026-09-01 by
> [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md).**
> The merge stranded 800 mm on the first insert into a merged span; ADR 0046 supplies the missing
> insert-time column split and caps the merge at 800 mm. Everything measured here stays true.

## Revived under a cap, 2026-09-01

**[ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)
supersedes this record.** The owner has decided the merge returns with an **800 mm cap** — adjacent
empty columns merge when their total is at most 800, and a longer chain merges the widest contiguous
run at or under 800 — and that the missing half this record was withdrawn over is built first, as an
**insert-time column split**.

Read the withdrawal section below before ADR 0046, not instead of it: everything it measured is still
true. The cap alone does **not** cure the stranding — insert a 400 into a merged 600 and 200 mm still
strands, because §4 still subtracts height and never width. What cures it is the split, and ADR 0046
ships that first, alone, gated on reproducing this record's own withdrawal scenario.

The rule, the predicate (*empty at every level*) and *"800 mm still caps every cabinet"* are carried
forward from here verbatim. What ADR 0046 adds is the cap, the split, a sorted greedy scan (a capped
merge is order-dependent where this record's uncapped one was not) and a refusal to merge columns
whose `top` disagrees.

**Generalised further 2026-09-02 by [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md):**
the 800 mm ceiling ADR 0046 gave the merge alone now binds *any* empty column, including one a shrink
creates or widens with no merge involved (`MERGE_CAP_MM` is retired into the shared
`MAX_EMPTY_COLUMN_WIDTH_MM`). This record's own *"a span wider than 800 mm may simply stay empty"*
below is unchanged by that — it is still true of the *span*; what changed is that no single *column*
may now carry more than 800 mm regardless of how it came to be empty.

## Context

Backlog 2 recorded the defect from a handset: clearing two adjacent cabinets gives **two separate
openings** (800 and 600), never one 1400. §4 merges openings *vertically* within a column; columns
are frozen at load and never merge *horizontally*. The consequence is that the number and position
of columns is permanent — a customer can never turn two cabinets into three.

The owner chose **module re-split** on 2026-08-26 (option B: a run's total offered as valid module
combinations) over both the boundary-move-only option A — *"otherwise we stick to not a custom
furniture but to like IKEA"* — and free-form width, option C. §12 lists re-split as designed but not
built.

It matters more now than when it was reported. ADR 0035 decided that **shrinking a column creates
adjacent empty space**, so a customer can now produce two neighbouring empty spaces deliberately and
in the ordinary course of resizing, not only by deleting twice.

## Decision

**Adjacent empty columns merge into one space.** Owner, 2026-08-28: *"if you delete the entire
column and after that the near one also, you create like a big space, and you are not limited —
you can select any maximum width cabinets."*

**The merge is at column granularity, and the column must be empty at every level.** This is the
same predicate ADR 0031 already funds a resize from — an adjacent column that is empty at *every*
level — so the rule reuses a notion the engine has rather than inventing a second kind of emptiness.
Deleting one cabinet at one level does not merge anything; its space stays inside its own column,
because the levels above and below are still occupied.

**Merging the space does not lift the ceiling. 800 mm caps every cabinet, always.** Owner: *"the
maximum width it's always 800, so nothing should exceed this 800 millimetres."* A merged 1400 mm
space is filled with cabinets up to 800 — one 800 and one 600, or 600 + 400 + 400, or any other
combination the space admits. The space is what became free; it is not a cabinet, and it never
becomes one.

This is the point of the merge, and it is worth stating plainly because "merge two openings" sounds
like it should produce a bigger cabinet. It does not. What it produces is **freedom over the number
and position of cabinets in that span** — which is exactly what backlog 2 said was permanently
impossible, and exactly the intent option B was chosen to express.

## A span wider than 800 mm may simply stay empty (owner, 2026-08-28)

ADR 0035's 800 mm ceiling makes an opening wider than 800 unfillable by any single cabinet, and
5D2a's QA measured a reachable 950 mm one. Put to the owner as a product question — fill it with a
combination, leave it, or refuse the move that made it — the answer was: **"ok to have empty space
left."**

So an opening no cabinet fits is **not a defect and not a dead end**. It is a legitimate state of a
design, and nothing is obliged to close it. What this decision's merge buys stands unchanged —
freedom over the *number and position* of cabinets in a span — but filling a span completely was
never the obligation it might have looked like.

**This corrects §9's zero-results rule where it meets a too-wide opening.** §9 says *"zero results →
a sentence saying what to clear, never a bare 0."* That advice inverts here: clearing more makes the
opening **wider**, not more fillable. The sentence for this case should say the space is wider than
any cabinet and may be left as it is — copy that belongs to wave 5D2c, recorded here because this is
where the reason for it lives.

## Built in wave 5D2b and withdrawn the same day (2026-08-29/30)

The merge was implemented, and every structural attack on it passed: a chain of five abutting empty
columns collapsed to one 3000 mm space, order-independently; a union whose key would land on an
occupied column left the pair alone; a sweep of every delete on the shipped kitchen found no drift.
The machinery was correct.

**It was withdrawn because §4 has no horizontal half — a gap it did not create, but made
unbounded.** `recomputeVoids` derives a column's free
spans from its members' `y0`/`h` and the column's `top`; nothing subtracts the **width** a member
occupies from the width the column has. That was harmless while a column was never wider than its
members — and a merged column always is.

Measured: clear `A|1.30` and `A|2.00`, get the promised 1400 mm space, then insert a 600 mm cabinet
into it. **The whole level closes**, stranding 800 mm of wall with no void, no column and no second
insert. A `widthFlex: 'fit'` cabinet is refused outright, because it tries to fill 1400 against this
decision's own 800 mm ceiling. Before the merge, those two clears left an 800 and a 600 and both took
a cabinet.

So shipping this decision's first half **costs the customer the opening it was meant to give them**.
It needs backlog 2's **re-split** — one span yielding several openings — which §12 lists as designed
and not built, and which `findTouchedColumnKeys` already names. This record is not retracted: it is
right, and it is unbuildable alone.

**What the wave was actually asked for did not depend on it.** The owner's *"merge the gaps"* was
about six presses of `−50` freeing six 50 mm slivers instead of one 300 mm space. That was
`remainder_below_floor` firing on shrinks, fixed separately, and six presses free one space with the
merge disabled — measured.

## Consequences

- ~~**Backlog 2's re-split half closes.**~~ **It does not — the merge was withdrawn.** The narrow-bottle-cabinet half already shipped; this is the
  remainder. §13.3 item 2's "designed, not built" line stands.
- **`deriveColumns`' horizontal freeze gains an exception, and it is the first one.** ADR 0011's
  correction established that a column's *extent* is frozen while its live predicates are re-answered
  on every derivation. A merge changes an extent, so it is a genuinely new kind of write and needs
  the same care ADR 0031's column update took: the four column-identity regressions in M5's
  Verification section are the ones that catch it going wrong.
- **It interacts with ADR 0035's stepper in both directions.** Shrinking creates the empty space;
  merging makes two such spaces one; stepping up consumes it again. The three have to be measured
  together on the shipped kitchen, not separately, because the shipped kitchen has no empty column
  at load and every one of these paths starts from a delete.
- **It does not reopen free-form width.** Backlog 2 rejected option C, and ADR 0035's 50 mm stepper
  is option B at a finer module — discrete steps against a fixed ceiling, not a numeric field. A
  merged space is bounded by the same 800 as everything else.
- ~~**Wave assignment is open.**~~ **Assigned to wave 5D2b and shipped there, 2026-08-29** (owner:
  *"merge the gaps"*). It stopped being optional the moment ADR 0035 decision 7 landed: six presses
  of `−50` on an ordinary 600 mm cabinet freed 300 mm of wall as **six separate 50 mm columns**,
  because each shrink created a new strip rather than widening the one before it. "Shrinking creates
  space" is only true with this decision, so the two shipped together.

  **Two things were built and only one survived; see the withdrawal section above.**

  `evaluateEmptySpace` stopped applying `MIN_W` to a **shrink**, and that stands. ~~The floor guards
  *making* a sliver~~ — **amended 2026-09-01 by
  [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md): the floor is gone on a growth
  too, because the owner has decided that a gap of any width is a legal state, so there is no longer
  anything for it to guard.** The waiver recorded in this paragraph is unchanged; only its stated
  reason narrowed. Returning space to a strip can only unmake one, so enforcing it there was
  what sent every press to `vacatedEmptySpace` for a fresh strip (product-logic review R3.10 had
  called the pair incoherent: the floor enforced where it did harm and waived where it made the
  sliver). This is what delivers the stepper half of this decision — six presses free one 300 mm
  space — and it does so **without any merge**, which is how the withdrawal was shown to be safe.

  `mergeAdjacentEmptyColumns` was the other, and it is **gone**. It united abutting empty columns
  correctly and still cost the customer an opening, because §4 subtracts height and never width.
  The delete path this decision was reported from therefore still gives two openings, not one:
  **backlog 2 remains open**, and closes with the re-split rather than with this half alone.

## Dated note — 2026-10-17: the uncapped rule returns (ADR 0166)

[ADR 0166](0166-adjacent-empty-spaces-merge-whatever-their-total-and-800-mm-caps-the-cabinet-not-the-space.md)
(wave 8U, the owner's Q-8U-1 = (b), relayed) revives this record's original rule: adjacent agreeing member-less
columns merge **whatever their total**, and *"800 still caps every cabinet"*. It returns under the two conditions this
record's withdrawal named: the insert splits its column first (ADR 0046 part 1), and a `'fit'` cabinet put into an
opening wider than its maximum is built at its maximum, flush left, with one remainder (ADR 0166 decision 2). Backlog 2's
combination-offer half stays open. Nothing above this note is edited.
