# ADR 0043 — An empty space of any width is a legal state, so a growth has no remainder floor

Status: Accepted
Date: 2026-09-01
Type: Decision
Milestone: M5B — wave 5B1; supersedes [ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md)'s remainder bullet

## Context

[ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md) funds a resize from an
adjacent empty column, and one of its coordinator details refused a growth that would leave that
column between 0 and `MIN_W`: *"An unusable sliver nothing can be inserted into is not a state to
create."* Consuming the space exactly to zero was allowed; leaving 50 mm of it was not.

The rule had already been waived on the other side. [ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md)
records that `evaluateEmptySpace` stopped applying `MIN_W` to a **shrink** — because a shrink can
only ever widen the strip it returns space to — and that enforcing it there had turned six presses
of `−50` into six unusable 50 mm strips instead of one 300 mm space. The floor survived on the
growth side alone, on the premise that *making* a sliver is what it guards.

What that leaves is a stepper that does not step back. A 600 mm column narrowed to 550 creates a
50 mm strip and can be grown back, because the growth consumes the strip exactly to zero. Narrowed
again to 500 it creates a 100 mm strip — and `+50` from there is **refused**, because it would leave
50 mm behind. Every rung below the first is a one-way trip.

## Decision

**An empty gap of any width is a legal state of a design.** Owner, 2026-09-01, verbatim:

> "I am not aware of such rule. Empty space can be even 100 mm or 50 mm, if somebody want to keep
> it. Such narrow empty space will force user to resize accordingly and not leave such spaces."

The reasoning in the second sentence is the part that decides it, and it inverts the premise ADR
0031 refused on. A narrow gap is not a trap the engine must prevent the customer from entering; it
is **self-correcting** — the customer sees it and resizes to close it. The floor was protecting
against a state that carries its own pressure to be fixed.

So the `remainder_below_floor` refusal is removed. A growth is legal for any `remainderMm >= 0`.
`remainderMm < 0` — asking for more space than the empty column has — is still `too_narrow`, and
that is the only arithmetic bound on a growth.

**The engine may now both create and remove a gap of any width, and the floor no longer applies to a
growth in either direction.** Symmetry with the shrink side, which ADR 0037 already established, is a
consequence rather than the argument: the argument is the owner's, that the state is legal.

## What is explicitly not changed

This repository has a recorded near-miss of lowering the wrong constant
(`docs/BACKLOG.md`, entry 2's amendment), so the two constants that are **untouched** are named here
rather than left to inference:

- **`MIN_WIDTH_M` (300 mm) — the narrowest *cabinet*.** Unchanged, and still the default width floor
  every entry that declares nothing is judged against ([ADR 0026](0026-the-width-floor-has-a-direction.md),
  [ADR 0017](0017-sink-base-minimum-width.md)). No cabinet becomes buildable at a width it was not
  buildable at before this record. What changes is only what may be left *empty* beside one.
- **`MIN_SPAN_M` (300 mm) — the shortest **vertical** free interval that becomes an opening**
  ([ADR 0015](0015-min-span-is-exclusive.md)). Untouched. A 200 mm-tall sliver still does not become
  a slot, and this record says nothing about §4's vertical arithmetic.

The distinction this record turns on is that a **gap** and a **cabinet** are different things with
different floors. `MIN_WIDTH_M` remains the cabinet's; the gap now has none.

## Records swept before deciding, and how each is settled

The owner's standing instruction of 2026-09-01 — *"when we take a decission need to check if earlier
it was opposite or ambiguious in another ADRs so we will avoid implementing based on outdated context
and knowledge!"* — was followed before any code changed. The sweep covered `docs/decisions/`,
`docs/design/DEVELOPMENT-SPEC.md`, `docs/BACKLOG.md` and — **added 2026-09-01 after review finding
R2.1** — `docs/milestones/`.

**The first version of this table was wrong, and the correction is kept rather than reworded.** It
said of ADR 0031's remainder bullet: *"It is the only record that states the rule."* It was not.
`docs/milestones/` was never swept, and `M5-width.md` states the floor **twice** — once as a live
re-reading of §11 row 10 under ADR 0031, and once as an acceptance criterion with a worked example
(*"600 → 800 beside a 400 mm neighbour must be refused, because 400 − 200 = 200 is under `MIN_W`"*).
Product-logic review found it by sweeping the directory the sweep had skipped. The lesson is the
owner's own instruction taken one step further: a sweep is only as good as the directories it names,
so this table now names them.

What the sweep found:

| Record | Date | What it says | Settled how |
| --- | --- | --- | --- |
| [ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md), *"A remainder below `MIN_W` refuses"* | 2026-08-27 | Growing so as to leave the empty column between 0 and 300 mm is refused; an unusable sliver is not a state to create. | **Superseded by this record**, and amended in place with a dated pointer here. **Not the only record that states the rule** — see the milestone row below, and the correction above it. |
| [ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md), Consequences, *"§11 rows 9–11 are re-read"* | 2026-08-27 | *"Row 10's floor still binds — the empty column may not be left under `MIN_W`."* | **Superseded by this record**, same amendment. Row 10 of §11's regression table is about a *donor* being pushed under 300 and was already superseded by ADR 0031 itself; nothing binds there now. |
| [ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md), *"A span wider than 800 mm may simply stay empty"* | 2026-08-28 | Owner: an opening no cabinet fits is *"ok to have empty space left"*, *"not a defect and not a dead end"*. | **Agrees, and is the earlier half of the same principle.** That record settled a gap that is too **wide** to fill; this one settles a gap that is too **narrow**. No conflict — it is corroboration, and it is why this decision is a supersession of one bullet rather than a reversal of a direction. |
| [ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md), Consequences on wave assignment | 2026-08-29 | `evaluateEmptySpace` stopped applying `MIN_W` to a **shrink**, *"and that stands"*; the floor *"guards making a sliver"*. | **Its rule stands; its stated reason narrows.** The waiver on shrinks is unchanged. What no longer holds is the residual justification for keeping the floor on growths — the owner has decided that making a narrow gap is not a state worth refusing either. Amended in place with a pointer here. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 7 | 2026-08-28 | Shrinking a column creates the empty space it needs; this is *"what makes the stepper usable at all"*. | **Depends on this record to be true in both directions.** Decision 7 is untouched and is the reason the defect matters: without this change the stepper steps down and cannot step back up. No amendment needed — nothing in it asserts a floor. |
| [ADR 0026](0026-the-width-floor-has-a-direction.md) | 2026-08-27 | §2's `MIN_W` is the **default** floor for a *cabinet*, not an absolute one; `MIN_SPAN_M` is explicitly not touched. | **No conflict.** It is entirely about the width a *cabinet* may be built at. Its own §5.4 donor note is moot under ADR 0031 (there is no donor). Left as it stands. |
| [ADR 0015](0015-min-span-is-exclusive.md) | 2026-08-25 | `MIN_SPAN_M` is exclusive: a free span of exactly 300 mm produces no void. | **No conflict, and named here so it is not mistaken for this record's subject.** Vertical, not horizontal. Untouched. |
| `DEVELOPMENT-SPEC.md` §2 tolerances, `MIN_W` row | — | *"narrowest cabinet; resize floor"*, already marked superseded by ADR 0035. | **No further change.** "Narrowest cabinet" is still true. The "resize floor" half was already superseded, and this record removes the last thing it was still describing. |
| `DEVELOPMENT-SPEC.md` §5.4 donor line, §11 rows 9–11 | — | Donor arithmetic against `MIN_W`. | **Already superseded by ADR 0031** (no donor exists). **Row 10 is marked here** (review finding R2.2): it was unmarked, and §11's preamble makes unmarked mean required behaviour. Its outcome survives — 1000 mm is above §7's 800 ceiling and in no chip set — but both of its stated reasons are false, one under ADR 0031 and one under this record. **Row 11** is marked at the same time and belongs to ADR 0035 decision 7, not to this record. |
| `docs/milestones/M5-width.md` — the §11 re-reading, and the *Acceptance criteria* row 10 | 2026-08-27 | *"Row 10's floor still binds, as the empty column may not be left under `MIN_W`"*, and a worked example requiring 600 → 800 beside a 400 mm neighbour to be **refused**. | **Superseded by this record; found late.** Both are struck through in place with a dated pointer here, and the worked example is inverted in the record — that resize is accepted now, and its 200 mm remainder is a legal gap. This is the row the first sweep missed. |
| `docs/BACKLOG.md` entry 2 and its amendment | 2026-08-26/27 | `MIN_WIDTH_M` stays at 300; the near-miss of dropping it to 200; `MIN_SPAN_M` unchanged. | **No conflict, and deliberately honoured.** See *What is explicitly not changed* — neither constant moves. |

Nothing found in the sweep — including the milestone rows found late — makes the owner's decision
unimplementable, and nothing contradicts it in a way the owner appears not to have known about. ADR 0037's *"ok to have empty space left"* shows the
opposite: the principle was already recorded once, for the too-wide case, and ADR 0031's bullet was
the last place the narrow case was decided the other way.

## Alternatives considered

**Keep the floor and let the chip row hide it.** Rejected. §9's promise is that *a chip is free if
and only if `setWidth` at that width would succeed* — `width-options.ts` and `width-steps.ts` both
judge by running the command — so a hidden refusal is not available. Suppressing the width in the
query would mean two judges, which is the defect class ADRs 0016, 0017, 0029 and 0032 each record.

**Round the growth up to consume the gap entirely.** Rejected: it makes a `+50` press change the
width by 50 sometimes and by 100 others, which is exactly the arithmetic ADR 0035's stepper exists to
keep out of the customer's head. It would also silently overrule a customer who wants the gap.

**Refuse only below some smaller floor (50 mm, say).** Rejected as re-deciding what the owner
decided: *"Empty space can be even 100 mm or 50 mm, if somebody want to keep it."* Any floor
reintroduces the one-way stepper somewhere, only further down.

## Consequences

- **The stepper is reversible at every rung.** A `−50` followed by `+50` returns the column to its
  previous width and consumes the strip it made to exactly zero. Before this record that held only
  from the first rung down.
- **`remainder_below_floor` is gone**, both as an `EmptySpaceRefusal` arm in
  `commands/rejection.ts` and as the guard in `commands/plan-width-funding.ts`. It was reachable only
  through this rule, so keeping the arm would have kept a Romanian sentence no command can produce —
  a refusal nothing can reach is a promise to the panel that is never kept, and the totality sweep
  in `rejection-totality.test.ts` enumerates rejection **codes**, not this per-side reason, so
  removing it costs that suite nothing.
- **A design can now hold a gap of any width, including one no cabinet fits.** §9's zero-results copy
  already had to handle this for the too-wide case (ADR 0037), and the same applies at the narrow
  end: the sentence should say the space may be left as it is, not demand it be filled.
- **Nothing about persistence changes.** A narrow gap is the absence of a placement, exactly as a
  wide one is; there is no new field and no stored state.
- **`NO_EMPTY_SPACE`'s sentence is reworded in the same wave**, for a defect the owner reported
  beside this one: it said *"coloana ar trebui să ocupe 50 mm"*, which reads as the column being
  50 mm **wide** rather than needing 50 mm more. It now names the space required — *"coloana ar mai
  avea nevoie de 50 mm"*. A copy fix, recorded here because it is the same sentence this decision
  changes the reachability of.
- **The sentence has one direction, and its shrink half is deleted with the floor.** The reword first
  carried a second clause, *"coloana ar elibera 50 mm"*, for a negative delta. **No command can
  produce one** (QA finding Q1, wave 5B1): on a shrink `evaluateEmptySpace` can fail only with
  `absent`, since `remainderMm` is the extent *plus* the width being returned and can never be
  negative; and when both sides answer `absent`, `fundingScan` appends `vacatedEmptySpace`, which is
  `undefined` on a growth alone. Every shrink therefore reaches the attempt loop with a fundable
  side, and what can still refuse it renders as `COLUMN_KEY_COLLISION` or `RESIZE_OPENS_GAP`.

  **The deadness is not this wave's doing** — [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md)
  decision 7 closed that path on 2026-08-28 by making every shrink self-funding; wave 5B1 is only
  where a sentence was written for it. It is deleted on this record's own standard: a refusal nothing
  can reach is a promise to the panel that is never kept, which is the same argument that deleted
  `remainder_below_floor` rather than keeping the arm. The anti-invariant is asserted by sweeping
  every reachable tap for a negative-delta `NO_EMPTY_SPACE` and finding none
  (`tests/commands/qa-w5b1.adversarial.test.ts`), rather than by rendering the params by hand — which
  is how the dead clause passed its own test in the first place.
- **`byFundingCapacity`'s widest-wins tie-break loses its original reason and keeps its behaviour**
  (QA finding Q3). It was justified two ways: the widest empty column is the one most likely to fund
  the move, and the one least likely to be *left* under `MIN_W` as an unusable sliver. The second
  reason is gone with the floor — both choices are legal now, so the tie-break decides **where the
  leftover gap ends up**, not whether the move is allowed. The behaviour is retained deliberately:
  the first reason still holds, and which side a resize spends is a product question for the owner
  rather than a consequence of removing a floor. Raised here rather than decided quietly.

## A residual worth naming

**The refusal sentence prints `deltaMm` raw, and only a test keeps that safe.** `renderNoEmptySpace`
renders the delta without taking its absolute value, on the strength of an argument about funding
order: a shrink always has `vacatedEmptySpace` to fall back on, so `NO_EMPTY_SPACE` is reachable on a
growth alone. Nothing in the type system says so — `EmptySpaceParams.deltaMm` is signed, and two
sibling codes carry it negative quite legitimately. A future change to the order in `fundingScan`,
or a shrink path that can fail before reaching the fallback, would turn the sentence into
*"coloana ar mai avea nevoie de -50 mm"* with no compiler complaint.

What guards it is the tap sweep in `tests/commands/qa-w5b1.adversarial.test.ts`, which fails if any
reachable resize produces a negative-delta `NO_EMPTY_SPACE`. Recorded rather than fixed: making it
unrepresentable means splitting the params type per code, which is a larger change than this decision
warrants, and the sweep is where a regression would surface first anyway.

## Amended 2026-09-02 — the no-floor rule now has a ceiling as well, on the other end

[ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) caps every empty column at 800 mm,
including the one a shrink creates. **No conflict with this record.** This decision removed the
*floor* — a remainder may be any width down to zero — and ADR 0052 adds a *ceiling* on the opposite
end, splitting a remainder over 800 mm into two columns rather than refusing or stranding it. A
remainder can still be any width **within [0, 800] per column**; a remainder wider than that no longer
fails to exist, it becomes two remainders. This record's "no floor" survives unchanged for each of them.

## Still open

- **An empty column does not survive a save and reload.** Reported by the owner in the same session
  and **not** fixed here — it is a separate wave (5B2) with its own dispatch, touching the design
  document and the void engine rather than the funding rule. It matters to this record because the
  gaps this decision makes legal are the gaps that reload has to carry.

  **Sharpened by QA on wave 5B1**: before this record a growth could not reach that state at all,
  because it had to consume the empty column exactly or be refused. The eight newly-accepted taps on
  the shipped kitchen are therefore the **first growths that produce state the reload cannot carry**
  — the placements come back, the gap beside them does not. `packages/three-adapter`'s
  `resize-reload.qa.test.ts` says every accepted resize survives a save and a reload, and for those
  eight that is now true of the placements only; a note there points at this section rather than at a
  fix, which belongs to 5B2.
