# ADR 0037 — Adjacent empty columns merge into one space, and 800 mm still caps every cabinet

Status: Accepted
Date: 2026-08-28
Type: Decision
Milestone: M5 — built in wave 5D2b and **withdrawn**; backlog 2 stays open

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

  `evaluateEmptySpace` stopped applying `MIN_W` to a **shrink**, and that stands. The floor guards
  *making* a sliver, and returning space to a strip can only unmake one, so enforcing it there was
  what sent every press to `vacatedEmptySpace` for a fresh strip (product-logic review R3.10 had
  called the pair incoherent: the floor enforced where it did harm and waived where it made the
  sliver). This is what delivers the stepper half of this decision — six presses free one 300 mm
  space — and it does so **without any merge**, which is how the withdrawal was shown to be safe.

  `mergeAdjacentEmptyColumns` was the other, and it is **gone**. It united abutting empty columns
  correctly and still cost the customer an opening, because §4 subtracts height and never width.
  The delete path this decision was reported from therefore still gives two openings, not one:
  **backlog 2 remains open**, and closes with the re-split rather than with this half alone.
