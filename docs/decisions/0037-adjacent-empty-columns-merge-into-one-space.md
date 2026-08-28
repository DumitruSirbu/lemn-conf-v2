# ADR 0037 — Adjacent empty columns merge into one space, and 800 mm still caps every cabinet

Status: Accepted
Date: 2026-08-28
Type: Decision
Milestone: M5 — completes backlog 2's re-split half

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

## Consequences

- **Backlog 2's re-split half closes.** The narrow-bottle-cabinet half already shipped; this is the
  remainder. §12's "designed, not built" line can be retired with it.
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
- **Wave assignment is open.** It is not required by 5D2, 5E or 5F, and it is large enough to be its
  own wave. Whether it lands in M5 or after is the owner's call on scope.
