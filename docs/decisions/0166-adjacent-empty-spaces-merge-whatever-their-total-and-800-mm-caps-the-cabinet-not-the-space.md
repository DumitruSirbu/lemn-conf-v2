# ADR 0166 — Adjacent empty spaces merge whatever their total, and 800 mm caps the cabinet, not the space

Status: **Accepted — 2026-10-17**, at wave 8U's documentation close (drafted 2026-10-16 in the 8U plan, §9). Built and
reviewed on branch `m8-mail-and-empty-space-merge`, not deployed. **Slice S5 (retire the 800 mm cuts inside the
commands) is not built** (backlog 255). Decision 8 is accepted on the owner's Q-8U-3 ruling, **not** on S4b's census
(see *Correction* under decision 8).
Date: 2026-10-17
Type: Decision
Milestone: M8, wave 8U (plan: [`milestones/8U-merge-adjacent-empty-spaces.md`](../milestones/8U-merge-adjacent-empty-spaces.md))

**Supersedes:** [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) for **spaces** (800 mm stays the
ceiling on every cabinet), and [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)'s
cap **in the editor**.
**Amends:** [ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md) (its uncapped rule returns, under the
conditions its withdrawal named) and [ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
decision 2's *"the same published openings"*, for composition's intermediate states only.
**Leaves open:** [ADR 0122](0122-a-wall-cabinet-may-widen-over-floor-nothing-records-and-the-column-model-is-why.md)
decision 4 (per-level columns).

**Evidence tiers.** *[doc]* quoted from this repository; *[src]* read by the scribe on 2026-10-17; *[commit]* a commit
subject on this branch; *[plan]* a figure the 8U plan quotes from a census or run (the plan names who ran it);
*[relayed]* the coordinator's word; *[inf]* inference, with its falsifier. The scribe ran nothing.

## Context

The owner reported that spaces merge "only from edges" (2026-10-16) and asked that adjacent empty spaces merge
anywhere, on all levels, even between standing cabinets [doc: plan §1]. Measured: **no positional rule exists**. Two
cleared 600s never merged because 1200 > 800 (ADR 0052); narrow edge leftovers did [plan §2.4–§2.5]. The four things
that keep two adjacent columns apart are B1 (a member at any level), B2 (the 800 cap), B3 (floor, top and depth agree
within 20 mm) and B4 (guards: off-grid centre, inverted envelope, a run enclosing a placement, a taken key) [plan
§2.3]. Lifting the cap everywhere made generation throw in 86 706 of 86 706 composed U rooms and 2 954 of 2 990 L rooms
[plan §6.1, S0's census], because the shell's planned tiles became one span and the left-edge seat put bodies off their
planned starts.

**Owner answers [relayed]:** **Q-8U-1 = (b)** (2026-10-16): a space may exceed 800 mm; 800 stays the cap on every
cabinet; the whole-column principle stays (per-level merge, reading I3, declined); nothing moves a placement.
**Q-8U-2 = (a)**: the 800 + 100 spaces above a U corner stay two in every U kitchen. **Q-8U-3 = (a)**: always one
space when the run is a tolerance chain — **ruled, not built** (decision 8).

## Decisions

1. **The rule.** Two member-less columns on one wall whose edges meet and whose floor, top and depth agree within
   `LEVEL_SNAP_M` (20 mm) are one column, whatever their total width. The merge joins any number of them, iterated to a
   fixpoint. It never moves, resizes or re-keys a placement; its outer edges are its members' outer edges. It declines
   only for B4's reasons and decision 6's. B1 and B3 are unchanged [plan §5; commit `a70c974b`].
2. **A `'fit'` insert into an opening wider than its maximum builds at its maximum, flush left**, with the remainder
   one member-less column on its right. Fixed-set rows are unchanged [commit `62fee695`].
3. **`EMPTY_COLUMN_WIDER_THAN_CAP` is retired at both write seams.** The v1 migration arm is unchanged; no schema bump
   [commit `1e2621e2`].
4. **The merge takes its width limit as a value.** The editor passes none. Composition passes the cabinet ceiling,
   `CABINETRY_MAX_WIDTH_MM` (800), at every merge it runs (shell construction, the first load, after each command,
   replay), and finishes with one pass of the editor's uncapped recorded-map derivation before the design is checked
   and returned [commit `0f85ed23`].
   - Generation still writes only through `insertBody` and `setWidth`, seated at the left edge; no command gains a
     parameter (ADR 0110 alternative D and U3b AC5 hold).
   - **Amended:** mid-composition, generation inserts into openings the editor would show merged. This extends ADR
     0110 *D revised* item 5's *"composition's private intermediate"* to the rule that keeps the planned tiles apart.
   - Generated placements, steps and commands are byte-identical to the previous head [commit `0f85ed23`: *"behaviour-
     free at HEAD (91,570 rooms byte-identical)"*; commit `a70c974b`: *"generation keeps its 800 limit (output
     byte-identical)"*].
5. **Per-level merging under standing bodies is not decided here.** It remains ADR 0122 decision 4's trigger.
6. **F2: one known exception, defined by geometry.** The merge declines a run whose merged span stands over the same
   stretch of wall as another column: each outer edge within one key bucket (10 mm, read from the key grid's constant)
   of that column's edges, on the same wall. The key test (`isKeyTaken`, `EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`)
   stays as the map-slot guard [commit `de0a0171`]. In a generated U this is the upper row above each corner, at any
   width — Q-8U-2 (a). Off S0's grid the key test alone had let 786 of 6 132 odd-width U rooms merge it [plan §4.2].
   **Built-in cost, recorded:** the review fix pass made the editor's merge subquadratic by a screen that **restates
   four of `planBlock`'s guards**; its comment says to change both places [relayed; commit `2b2b0511`: *"the uncapped
   merge no longer costs cubic time on a crafted 1893-entry document (2619 ms to 2 ms, 8,848,020 comparisons against
   the old search, 0 mismatches)"*]. A guard changed in one place and not the other is a defect class to watch.
7. **An odd-width opening is a known limit** (plan §6.2, R13). Only a stored document can hold one; there the offer
   list lists rows that the insert refuses with `NON_INTEGER_MILLIMETRES` (already true before 8U for fixed-set rows at
   701 and 799). The merge never creates such an opening; it can lengthen one. Premise as a property: no state reached
   without a crafted document holds a half-mm edge (criterion 3a). **Remedy, with its trigger:** move the seat's whole-mm
   check into `evaluateInsertFit`, so the offer list and the command share one judge (backlog 245).
8. **Tolerance chains (plan §6.3, R14).** Agreement is judged between neighbours, on current extents, within 20 mm,
   and is not transitive; a merge forgets its members. So a run whose neighbours agree but whose spread exceeds 20 mm
   (for example depths 620 / 600 / 580, or tops 2600 / 2580 / 2560) may end as one column or two depending on the
   clear order, and a member may lose more than 20 mm. Within a 20 mm spread in each dimension, the clear order cannot
   matter (criterion 5). ADR 0046 Part 2's 20 mm on a pair is unchanged.
   - **The owner ruled Q-8U-3 = (a), "always one space"** [relayed]. **It is not built:** the production change in
     S4b was comments only [commit `e5fe5223`: *"production diff is comments only"*], and (a) needs each merged column
     to carry its member interval (plan §6.3); a grep of `design.ts` finds no interval field [src]. Until it is built, the order-dependence is a
     **recorded known limit**, pinned by per-order tests and two `it.fails`.
   - **Correction, 2026-10-17.** The plan made this decision's acceptance conditional on S4b's census finding nothing,
     and S4b's commit reported *"census 0 on generated, offered and sequence data"* [commit `e5fe5223`]. **A reviewer
     found that the census never drove `setCabinetDepth`, and that a customer can reach a stepped chain through it**
     [relayed]. The "a customer cannot reach it" reading is withdrawn. The decision is accepted on the owner's ruling,
     not on the census. Backlog 246 carries the trigger and the remedy; backlog 243 records the depth round-trip drift
     that makes such chains reachable.

## Alternatives refused

- (a) Re-tile at 800, so two spaces remain; (c) no change (Q-8U-1).
- Per-level merge (I3): the model cannot express it (ADR 0011 Gap D; ADR 0122 d4).
- Sliding cabinets together (DEVELOPMENT-SPEC §13.2).
- Merging only in the offer list (rejected by the owner, ADR 0046).
- For generation: an along-wall insert order with a step-down after each insert (ids and log change); a non-left seat
  or a requested width (alternative D); merging only columns a user emptied (contradicts *"anywhere"*; needs stored
  provenance); no merge inside composition (changes *D revised* 4's log) [plan §6.1].
- For decision 8: exact agreement or fixed buckets now (overturns ADR 0046 Part 2); carrying the member interval now
  (a type and schema change, ruled for later by Q-8U-3 (a)); a spread limit on current values; dropping the fixpoint
  loop; storing the pre-merge columns [plan §6.3].

## Consequences

- **The 800 figure today has three meanings, not two.** The cabinet ceiling (DEVELOPMENT-SPEC §7), which is also
  composition's limit; the v1 migration arm's normalisation; **and, until S5 is built, the cuts inside the commands**:
  `insertBody`'s remainder split and `setWidth`'s shrink overflow still cut at 800, and the reconcile's uncapped merge
  rejoins the pieces. The plan's sentence *"after S5 the 800 figure survives with exactly two meanings"* describes the
  state after S5, which has not shipped (backlog 255).
- A stored document re-derives at load; adjacent agreeing empty columns the cap kept apart now merge.
- Pricing, picking ids, selection and undo are unaffected [plan §6].

## Acceptance criteria, as numbered in the plan

Kept here so code comments that cite *"8U criterion n"* can repoint to *"ADR 0166, criterion n"*. Full text: plan §10.

| # | Criterion |
| --- | --- |
| 1 | Maximal: no two abutting agreeing member-less columns stay apart except by a B4 or F2 decline |
| 2 | Idempotent: `merge(merge(m))` equals `merge(m)` |
| 3 | Length conserved per wall and band |
| 3a | On whole millimetres: no reached state holds a half-mm edge (decision 7's premise) |
| 4 | No cabinet moves; price unchanged |
| 5 | Order-independent within a 20 mm spread (decision 8) |
| 6 | The owner's case: L 4100 × 3300 × 2600, clearing `A|1.80` and `A|2.40` gives one 1200 column |
| 7 | Must not merge: (a) bases under standing uppers; (b) a disagreeing pair with no bridge; (c) across walls or the corner |
| 8 | A `'fit'` body in a wider opening builds at its maximum, flush left, one remainder (judged after the reconcile until S5) |
| 9 | Fixed-set rows unchanged at every width |
| 10 | The offer list for a void over 800 equals what the insert accepts, on whole-mm edges (decision 7) |
| 11 | A shrink beside an empty column gives one column of the summed width |
| 12 | After a delete that merges, the merged void is selected; one id per tap |
| 13 | Round trip at both seams; no other refusal weakened |
| 14 | Old documents load; a v1 1600 entry equals a v5 1600 entry |
| 15, 15a | Generation byte-identical in both worlds; the delivered design is the editor's canonical form |
| 16 | Generation writes only through the commands; the limit is the only funnel difference |
| 17 | Composition's limit and the leftover headroom read one constant |
| 18 | Visual captures at 390 × 844 and 1440 × 900 |
| 19 | Sabotage both ways (R6) |

## Evidence

Commits [commit]: plan `fcf6b419`; S0 `6d2e1ec0`; S3 `0f85ed23`; plan revision `8c17410d`; S1 `1e2621e2`; S2
`62fee695`; S3b `de0a0171`; S4 `a70c974b`; round A `c15dc6e5` (*"28 domain + 19 web tests flipped, repointed or
restated"*); plan revision `4190b2a7`; S4b and round B part 1 `e5fe5223`; round B part 2 `9c69f1c0`; review fix pass
`2b2b0511`. QA rounds A and B and the review ran [relayed]; the scribe did not read their reports, and quotes no gate
figure that a commit subject does not carry.

## Dated note — 2026-10-17: decision 4 may be amended by M8C's wave F1a (ADR 0167, Proposed); nothing here is struck

[ADR 0167](0167-generation-fills-every-free-wall-run-end-that-the-narrowest-catalogue-cabinet-fits-at-every-level-its-column-carries-and-a-narrower-end-stays-bare.md)
D6 proposes a generation fill whose tile must not merge with a neighbouring planned tile (the hazard is a remainder of
exactly 200 mm, in two arms). Decision 4 says the merge *"takes its width limit as a value"*; D6 would add a second value,
the **planned boundaries** the shell tiled, so that composition's merge declines to join two planned tiles. The editor
passes none.
- **If wave F1a's S0 counts zero planned-pair merges at HEAD [inf; the count is F1a S0's to measure]:** M-1 is taken, this
  decision is amended by it, F1a is behaviour-free (the census byte-identical), and decision 6's four restated guards in
  the editor's fast screen must be checked to agree.
- **Otherwise:** F1a is withdrawn, this decision is not amended, and M-2 is built in F1b (the inboard `'fit'` body is
  planned 200 wider in the two arms).
- Decision 4's *"generated placements, steps and commands are byte-identical"* describes the 8U change at its commits; it
  does not describe F1b, which changes what is generated by owner ruling.
