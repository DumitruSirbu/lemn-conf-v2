# ADR 0056 — Two cabinet depths are declared, and the control reads the map rather than hard-coding them

Status: Accepted
Date: 2026-09-02
Type: Decision
Milestone: M6 — unblocks waves 6J and 6K
Confirms [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 3

## Context

M5's *Not established* question 2, carried into M6 because it reaches the **control**: is an 800 mm
cabinet depth real? It is the difference between a two-way toggle and a list of three.

Two records already bear on it.
[ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 3 states the setting is
**cabinet** depth, with **two values, 600 and 700**.
[ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 2 names `800 -> 500` as a
plausible future map row and **explicitly declines to commit to it**, so it is not written in the
source.

The question put to the owner on 2026-09-02 was whether that had changed before the control was
built against it.

## Decision

**Two declared depths, 600 and 700 — and the control is built for n.**

1. ADR 0036 decision 3 is confirmed, not superseded. The map keeps exactly two rows.
2. **No 800 row is written.** ADR 0028's refusal stands: an uncommitted value is not written down,
   because the wall depth an 800 mm kitchen implies is a manufactured size only the owner can name,
   and a guessed one builds a cabinet nobody makes.
3. **The control reads its options from the declared map**, never from a hard-coded pair. Adding a
   third depth is then one data row plus the wall depth it implies — data, not a UI rewrite. This is
   the whole cost of taking the question off the critical path, and it is close to zero.
4. An undeclared depth still throws `UnknownWorktopDepthError` (ADR 0028 decision 4): no
   interpolation, no rounding, no nearest row, no silent default.

## Alternatives considered

- **Add 800 now**, so the list is complete. Rejected: it requires a wall-cabinet depth at 800 that
  nobody has supplied, and ADR 0028 refused to invent one for exactly this reason. Writing a
  speculative row is how a map that is trusted as a declaration becomes a map that is guessed at.
- **Hard-code a two-way toggle**, since two is the answer. Rejected as a false economy — it is the
  same amount of work to render from the map, and it is the difference between a future third row
  costing a data edit and costing a component rewrite.

## Consequences

- Wave 6K's control renders a toggle today and a list the day a third row lands, from one code path.
- `docs/BACKLOG.md` entry 19's 520 mm dishwasher floor stays unreachable: both declared depths are
  well above it, and the floor is only crossable **downward**. A third row above 700 would not reach
  it either. The floor itself is recorded separately, with the M6 plan's owner decision 6.
- The M6 plan's *Cabinet depth* section, which described this as undecided, is corrected in place.
