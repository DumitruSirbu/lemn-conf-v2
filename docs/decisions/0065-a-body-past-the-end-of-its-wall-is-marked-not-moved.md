# ADR 0065 — A body past the end of its wall is marked, not moved

Status: Accepted
Date: 2026-09-03
Type: Decision
Milestone: M6 — supersedes the M6 plan's owner decision 8 in its earlier forms; reaches M7 and M8
Supersedes: nothing shipped. It replaces a draft amendment to
[ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) that was never written.

## Context

A deeper kitchen consumes more wall at the corner, so a run lengthens: wall B's run ends at 2900 mm
at a 700 mm cabinet depth against 2800 at 600. M6 wave 6I surfaced it and asked what gives.

Four answers were worked out and put to the owner — extend the run, shrink the structural corner
return, narrow a customer cabinet, drop a body — and the last two required amending ADR 0055's
*"nothing left behind"*. The owner replaced the question instead:

> *"what if we not resize the corner just adapt the depth and if the last cabinets go off the wall to
> highlight it with red and show a warning that this cabinets can not fit?"*

**What it has to mark, measured.** The reference's wall-coverage panel gives **Perete A 3520 /
3560 mm** and **Perete B 2800 / 2830 mm**, and both figures corroborate against the tree: wall A's
3520 is the measured 3500 of placements plus the 18 mm run-end panel and its 1 mm gap — the sum
`kitchen-shell.ts` names as *"3.5189999"* — and wall B's 2800 is the measured far end exactly. So
**the seeded kitchen fits at 600 with 30 mm to spare**, and at 700 its wall B run ends at 2900
against 2830 and **overruns by 70 mm**. This rule becomes live when the depth control ships, not on
the default design's first load.

**The seeded document's own room is wrong on both axes** — `widthMm: 3600` should be 3560 and
`depthMm: 2400` should be 2830 — and correcting it is a prerequisite for detecting any of this. An
earlier reading of `docs/BACKLOG.md` entry 21 took 2400 as authoritative and concluded the shipped
kitchen already overran by 400 mm; the coverage panel supersedes it.

## Decision

**1. Nothing gives. A body whose extent passes the end of its wall is marked and warned about, and
is otherwise left exactly where it is.** Depths adapt, the run extends wherever it extends, no
cabinet is narrowed, none is removed, and the depth change is not refused. The customer resolves it
themselves — narrow something, remove something, or go back to the shallower depth.

**2. `ADR 0055` stays intact and unamended.** *"Every body adapts, nothing is left behind"* remains
literally true: a marked body is still there. The give-way rule is not needed, and neither is the
"which body gets dropped" decision that was deliberately not invented.

**3. It is this project's existing posture, not a new one.** Never silently change what the customer
chose; show the reason instead. The same shape as
[ADR 0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md)'s
disabled-with-reason and [ADR 0024](0024-the-rejection-banner-has-no-reachable-path.md)'s rejection
banner.

**4. The fit constraint is one-sided.** A run **must not exceed** its wall; leaving bare wall at the
end is **normal and is not a defect**. Cabinets do not have to fill the space. The rule is
`run end ≤ wall length`, never equality, and under-filling is a valid state rather than something to
correct or warn about.

> **Strengthened by [ADR 0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md)
> (2026-09-03): a remainder is not merely permitted, it is what almost always happens.** Real walls
> are not round — 2444 mm is typical — and the manufacturer closes the remainder with filler at the
> real measurement, outside this product. Read as a *tolerance*, this clause invites a gate, a filler
> rule or a snap-to-wall behaviour nobody asked for. **A remainder is the product working.**

**5. The bound is each wall's own run** — wall A the room's width, wall B its depth (§2) — and
explicitly **not** `longestWallRunMm`'s `max(width, depth)`, whose slack is what has been hiding the
overrun. `validate-design.ts`'s own comment names *"the 400 mm slack that forced the along-wall rule
to take the longer run"*, and that 400 mm is exactly this defect.

**6. An overflowing design is priced, and the total is flagged.** The breakdown lists **every** body,
including the ones that do not fit, and the total carries the same warning the scene does.

- **Rejected: excluding non-fitting bodies from the total.** The price would silently drop and read
  as the kitchen getting *cheaper* at the moment part of it became unbuildable.
- **Rejected: showing no price at all.** The customer loses the running total exactly when they need
  it to decide what to change.

**7. Save yes, submit no.** The design **saves and resumes with the warning intact**, so no work is
lost. The review/contact step **refuses while any body does not fit**, so no unbuildable kitchen
reaches the owner as an enquiry.

**7b. The two strings, ruled by the owner on 2026-09-03. Verbatim.**

The scene warning, beside the marked bodies:

> ~~**Corpurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un corp.**~~
>
> **Superseded 2026-09-03, same day, by the owner.** The wording below replaces it. The original is
> struck rather than removed because the pair is the record of *why* the vocabulary settled where it
> did, and a later reader finding only the replacement cannot tell that the alternative was held and
> dropped rather than never considered.
>
> **Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap.**
>
> **What changed and why.** The warning said *corpuri* while the flagged total below says
> *dulapuri* — the trade term beside the everyday one, for the same cabinets, on one screen. Asked
> to reconcile them, the owner chose *dulapuri* in both places. Note this narrows, but does not
> retract, the paragraph that follows: the two strings still say different things and are still not
> interchangeable. Only the noun is now shared.

The flagged total:

> **Prețul include și dulapuri ce depășesc mărimea peretelui și necesită ajustări**

**They are not interchangeable and neither restates the other**, which is why *"reuse the same text
in both places"* was not taken: **the scene warning says what is wrong and what to do about it; the
total's flag says what the number contains and that it is not final.**

**The rejected option, recorded because it is the one that will be re-proposed after reading
[ADR 0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md):** a softer *"will be
adjusted at final measurement"* framing. It would look consistent with that ADR — the manufacturer
does close the leftover at real measurement — and it is **wrong here**. A **remainder** is closed at
measurement; an **overrun** is not. Telling a customer that cabinets past the end of the wall will be
sorted out later promises something nobody can deliver, and it blurs precisely the line ADR 0067's
*"what this does not weaken"* section exists to keep sharp. A minimal form was also rejected; the
owner chose the direct one.

**The second string is the owner's own phrasing, not a choice from a menu. Record it verbatim and do
not tidy it** — including its punctuation. A wave "improving" the grammar of a string the owner wrote
is making a product change.

**One open question, flagged rather than resolved: it says _dulapuri_ where the scene warning says
_corpuri_.** That may be deliberate register or it may be incidental. **It must not be silently
normalised to match its neighbour** by a wave, a reviewer or a copy pass; if the two should agree,
that is the owner's ruling to make.

> **DECISION 7 IS NOT MET BY THE CODE TODAY — recorded 2026-09-03, found by the room correction's
> QA.** Stated here rather than left to be discovered, per `docs/WORKFLOW.md`'s rule to *record what
> is not met, at the criterion*: **an overflowing design does not save-and-resume. It does not load
> at all.**
>
> `PLACEMENT_PAST_WALL_END` is **fatal on load**: `assertDesignValidForCatalog` raises it,
> `migrateDesign` throws `InvalidDesignError`, the API answers **500 `DESIGN_UNREADABLE`**, and
> `/d/{id}` renders the invalid state. *"Saves and resumes with the warning intact"* describes the
> behaviour this ADR requires, **not the behaviour that ships**.
>
> **What is wrong is the fatality, not the bound.** Tightening the along-wall bound to each wall's
> own run refuses documents that were legal under the loose one — a 40 mm band on wall A
> (3560–3600) and a **770 mm** band on wall B (2830–3600), the latter wide because wall B was never
> bounded by its own run. **There is no fix available inside `migrate-design.ts`**: a body standing
> at 3200 on wall B is past the real wall, no room value the migration could write would make that
> true, and inventing one is exactly the "rescued into a room they never entered" failure the
> migration's own guard 3 exists to prevent.
>
> **Wave 6A3 dissolves it**, with no change to the migration: once a non-fitting body is a *mark*
> rather than a *refusal*, the document loads and decision 7 becomes true. Until then this ADR
> describes intended behaviour on this point.
>
> **Reachability, which sets the severity.** Every coordinate in both bands **was reachable through
> ordinary editing** — an insert, a width resize, or a freed strip anywhere up to 3600 on either wall
> passed the write seam, because the write seam enforced the same loose bound. This is a
> customer-facing exposure, not a restore-only one. Whether any of the five live rows sits in either
> band is not knowable without database access; it is recorded as a pre-release check in
> `docs/milestones/M8-review-contact-success.md`'s launch gate.

> **EXTENDED BY [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)
> (2026-09-03), after wave 6A3's adversarial QA.** Decision 7 named a behaviour and not a code set,
> and 6A3 implemented it by demoting exactly one validation code. That is not enough: the store
> rewrites the frozen map on **every** command, so the same overrun re-enters validation as
> `COLUMN_EXTENT_OUTSIDE_ROOM`, and as `EMPTY_COLUMN_PAST_WALL_END` once the column is emptied. An
> overflowing design saved once and then stopped saving.
>
> **"Reaches past the end of its own wall" is a code family, and the family is demoted together** —
> on placements, on empty columns and on frozen extents alike. ADR 0069 states the rule that decides
> membership, splits `COLUMN_EXTENT_OUTSIDE_ROOM` into one code per edge so the wall-end edge can be
> classified on its own, and moves severity into a total per-code declaration so a code added later
> cannot be silently forgotten. Decision 7 is unchanged in what it requires.

**8. A marked body is not a rejected edit.** The two must not share a surface: §9's rejection banner
says *an edit did not happen*, and this says *an edit happened and its result does not fit*. Keeping
them distinct is what stops "a rejected edit does not move the total" and "an overflowing total moves
and is flagged" from reading as a contradiction on screen.

## Alternatives considered

All four were live options, and the last three were superseded rather than refuted.

- **Extend the run and say nothing** — what wave 6I built. Correct geometry, and it is what this
  decision keeps; what it lacked was any way for the customer to learn the run no longer fits.
- **Shrink the structural corner return.** The elegant one, and **recorded here in full so it is not
  re-proposed as though it were new**: the return's left edge moves with the deeper run while its
  right edge holds, so its width falls out exactly as `320 − delta` — 320 → 220 mm at 700, holding
  the whole downstream chain fixed. It costs no cabinet and no width a customer chose, because a
  corner return is structural ([ADR 0021](0021-corner-returns-are-structural-in-data.md)) with no
  chips and no resize. **Why it lost: it changes a part of the kitchen without telling anyone.**
  Marking tells the customer and changes nothing. It also needed a manufacturability answer for a
  220 mm return that nobody had, and it runs out — the return has 320 mm to spend and a third,
  deeper depth row would spend it faster.
- **Narrow a customer cabinet.** Needs a give-way rule nobody has written, against ADR 0017/0026
  floors and ADR 0031's funding rules, and it overwrites a width the customer set through ADR 0035's
  stepper.
- **Drop a body.** Requires amending ADR 0055 materially, and requires a further decision — which
  body — that was deliberately never invented.
- **Refuse the depth change.** Ruled out by [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md)
  decision 5 and not reopened.

## Consequences

- **The seeded kitchen marks nothing at 600 and two bodies at 700** — `p7` and `p24` — once its room
  dimensions are corrected to 3560 × 2830. Against the uncorrected document it would mark two bodies
  on first load, which is a reason to land the fixture correction with the detection rather than
  after it.
- **`validate-design.ts`'s "400 mm slack" comment is wrong at its source.** The along-wall bound
  takes `max(width, depth)` and the comment explains it as *"a fact about along-wall coordinates"*.
  It is not — it was compensating for a bad room dimension, and with 2830 the wall B run fits its own
  wall. Worth correcting where it is written, not only here.
- **The coverage figures above are a contiguous-case shorthand, not a formula.** 2800 of 2830 was
  derived as a chain sum because wall B's run *is* contiguous at 600. **At 700 it is not** — a 30 mm
  gap opens in the top row, since the corner return's top follows the wall depth map (+70 mm) while
  the deep tops follow the base formula (+100 mm) ([ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md)).
  A sum of placement widths would then read 30 mm short of the true extent. **Detection must compute
  the furthest along-wall extent, never a sum**, or it under-reports exactly where it matters most.
- **Detection is a domain fact and belongs below every surface** — the scene, the breakdown, the
  price bar and M8's review must all read one answer, or the same design will be marked in one place
  and not another.
- **M8 inherits decision 7's second half**: the review/contact step refuses while any body does not
  fit. Recorded in that milestone with this origin.
- ADR 0056's "build for n" is unaffected by this record. The amendment it took on 2026-09-03 — that a
  third depth row exhausts the structural give sooner — was written for the corner-return approach
  and no longer applies; a third row now changes only how often a body is *marked*.
