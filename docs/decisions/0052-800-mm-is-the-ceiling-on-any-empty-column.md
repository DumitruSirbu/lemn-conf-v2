# ADR 0052 — 800 mm is the ceiling on any empty column, not only on a merge

Status: Accepted
Date: 2026-09-02
Type: Decision
Milestone: M5 wave 5G — closes **Q5**, open since M5 and widened four times during M5B

## Context

`MERGE_CAP_MM = 800` (ADR 0046) bounds only the two columns a *merge* produces. A **shrink** hands
width back to a neighbouring empty column with no ceiling at all — measured at 900 mm in nine taps,
and reachable in two since wave 5B8 made the pantry resizable (clear `B|2.45`, then shrink `p6` to
400). Since wave 5B2 (ADR 0044) that oversized column **survives a reload**, and it publishes an
opening every `widthFlex: 'fit'` body refuses as `WIDTH_NOT_SUPPORTED`.

This is Q5, M5's own open question (`docs/milestones/M5-width.md`, ADR 0035 decision 7), widened four
times during M5B without being closed. Owner, 2026-09-02: **"lets make 800 the maximum of any empty
column."**

## Decision

**`MAX_EMPTY_COLUMN_WIDTH_MM = 800` is the ceiling on *any* empty column, not only on the result of a
merge.** It lives in one place, `module-grid.ts`, and every producer of an empty column — the merge,
a shrink's release, and a v1 document's normalisation — is held to it. `MERGE_CAP_MM` is gone; the
merge reads the same constant. Q5 is closed.

**When a shrink would free more than the ceiling allows, the freed span splits into two columns.**
The near column — the one facing the run the customer just resized — takes width up to the ceiling;
the overflow becomes a new empty column beyond it. This is ADR 0046 part 1's own mechanism
(`splitColumn`'s occupied-part-plus-remainder) applied at a second seam, where both parts are empty
rather than one occupied and one empty.

## Why not refuse the shrink instead

Three answers were available for a shrink that would free more than 800 mm. Refusing it was rejected,
and not on cost — it contradicts a live ruling. ADR 0037's *"a span wider than 800 mm may simply stay
empty"* put exactly three options to the owner on 2026-08-28 — fill it with a combination, leave it,
or **refuse the move that made it** — and the answer was *"ok to have empty space left."* Refusing
here is that rejected third option arriving by another route.

**And the measured symptom is worse than a mere one-way stepper, which is what makes the argument
hold a fortiori.** Corrected during the 5G logic review: with both sides refusing, `fundColumnResize`'s
`fundingScan` falls through to `vacatedEmptySpace`, which mints a strip of the column's own. That strip
does **not** land on the refusing neighbour's key. Measured on 5G-1's own route (a 700 mm gap right of
`p6`, shrink by 200): the minted strip is `[edge, edge + 200]`, keyed at `edge + 100`, while the
refusing neighbour keys at `edge + 350` — different 10 mm buckets, so `refuseKeyCollision`
(`apply-column-moves.ts`) passes and the map ends with **two overlapping empty columns covering the
same wall, which no validator refuses.** This is not the `COLUMN_KEY_COLLISION` an earlier draft of
this argument predicted. A wrong refusal the customer can read is a bad outcome; a silently invalid
map that no gate catches is a worse one, and it is the actual failure mode a refuse-the-shrink rule
would ship. That is the argument's teeth, and it is why refusal was never seriously on the table
alongside splitting.

Capping the shrink and stranding the remainder was rejected too, and for the reason ADR 0046 already
gave by name: it makes a void no column owns, and every consumer — `COLUMN_MISMATCH`,
`deriveColumnKeyAt`, the frozen map, ADR 0031's funding scan — is written against the rule that an
opening belongs to a column.

## This does not overturn ADR 0037's "a span wider than 800 may stay empty"

The two sentences — *"a span may be wider than 800 and stay empty"* and *"no empty column may be
wider than 800"* — sound opposed and are not, and a future reader will trip on exactly this unless it
is said plainly here: they answer different questions, span versus column.

Verified in review: nothing in this record refuses two *adjacent* empty columns from standing side by
side — an 800 and a 100 next to each other is two columns, each legal, and their combined span is
900 mm of empty wall with no cabinet that fits it as one piece. What is refused is a single *entry*
recording more than 800 mm as one column. And the merge already breaks a run apart as soon as joining
it would exceed the ceiling (ADR 0046 rule 1's greedy scan), so an 800 and a 100 sitting adjacent are
*stable* — pushed together from either direction, the merge takes the widest contiguous run at or
under the cap and leaves the rest, so it does not re-fuse them into a 900. A span may still be, and
often is, wider than any one column within it.

## The anti-ratchet property

A `+50` sequence must recoalesce rather than accumulate columns, or the stepper becomes one-way again
at the top of its range exactly as ADR 0043 fixed at the bottom. Four facts make it hold:

1. **Split fires only above 800, which the merge can never produce.** The merge's own ceiling means
   its output is never itself a split candidate.
2. **The merge is maximal.** ADR 0046 rule 1's greedy left-to-right scan takes the widest contiguous
   run at or under the cap, so nothing under the cap is left unmerged that could be.
3. **Total width is conserved edge to edge.** `splitEmptySpanAtCap`'s outermost two pieces are the
   edges passed in; no millimetre is stranded.
4. **The overflow lands at the freed span's far edge**, against the run the customer is actively
   resizing, so a subsequent growth from that run consumes the near piece first and the merge in
   `resolveColumns` folds the pair back into one column the moment their sum drops back under 800.

**Verified on screen, 390×844:** two ghost boxes — 800 and 100 — with a visible seam, each returning
its own id across a tap sweep, rejoin into one undivided 800 mm box with no seam once `p6` is grown
back to 500 mm. The seam appears and disappears at the same boundary every time.

## Migration: schema version 2, normalise at load, refuse at write

`CURRENT_SCHEMA_VERSION` becomes **2**. `migrateDesign`'s version-keyed lookup — built in the original
migration wave and never used until now — finally has two real entries:

- **`migrateFromV1`** splits any `emptyColumns` entry wider than the ceiling into ceiling-sized pieces,
  using the same `splitEmptySpanAtCap` arithmetic the shrink command uses, **before**
  `assertDesignValidForCatalog` runs. A v1 document is a legal document under a rule this wave
  supersedes — it renders correctly and only refuses `'fit'` inserts — so it is normalised rather than
  refused: refusing it would brick a `/d/{id}` share link to close a bug that costs the customer
  nothing today.
- **`migrateFromV2`** validates without normalising. An oversized entry in a v2 document was written
  under this rule, so it is refused with `EMPTY_COLUMN_WIDER_THAN_CAP` — at the load seam and at the
  API write seam both, DOM-001's rule that both seams refuse together.

**Correction from the 5G logic review: an odd-width oversized v1 entry is refused, not split, and this
is forced by the shared cap-filling rule, not by the wire format.** A document's `alongMm` (centre) and
`widthMm` are both whole millimetres, so an entry of odd width has a half-integer left edge —
`alongMm − widthMm / 2`. `splitEmptySpanAtCap` always fills the near end at the cap first: for any
span over 800, its leading piece is exactly 800 mm, which is **even**. Adding an even-width piece to a
half-integer edge cannot land the next cut on a whole millimetre, so the split is declined whole
(`landsOnWholeMillimetres` fails) and the entry is left for `assertDesignValidForCatalog` to refuse.

This is not a defect in the arithmetic; it is a property of *which* partition the shared function
produces. **801 mm as three 267 mm pieces lands on whole centres perfectly well** — each piece is odd,
and two half-millimetre offsets cancel at every boundary, so 267 + 267 + 267 keys cleanly. But that is
not the partition `splitEmptySpanAtCap` computes, because a cap-*filling* split always takes the
ceiling first wherever the remaining span allows it, and the ceiling is even. A two-piece cap-filling
split of an odd total needs one piece at 800 (even) and a remainder that is odd — there is no way to
write an odd total as two odd pieces, since odd + odd is always even. Diverging the migration's
arithmetic from the shrink's to rescue a document no producer can mint would cost the one guarantee a
shared function buys: that the frozen key and the projected key cannot come apart (wave 5B2b's own
near-miss, recorded in `split-empty-span.ts`'s header comment). No command in this product can produce
an odd-width `emptyColumns` entry — every width in §7's catalogue is even — so the case is reachable
only from a hand-edited or hostile v1 document, and refusing it is DOM-001's rule working as intended
rather than a gap in the migration.

**The migration re-asserts the schema's own array bound after normalising**, because the array can
only grow: a hostile v1 document of `MAX_EMPTY_COLUMNS` entries at the widest a room may present, each
one splitting into as many pieces as the ceiling allows, must not be handed on as a document the write
seam would reject anyway.

## Measured database state, 2026-09-02, before dispatch

| | |
| --- | --- |
| `designs` rows | **5**, all `schema_version` **1** |
| rows carrying an `emptyColumns` key | **0** |
| `emptyColumns` entries wider than 800 mm | **0** |

A comfort, not a licence. `emptyColumns` is written only by a command that produces one, and every
stored row predates the field or never exercised it. **The window opens the moment this ships**: any
shrink freeing more than 800 mm from here on mints exactly the row this migration exists to carry, and
a shared `/d/{id}` link is the one artefact this project hands to someone who cannot be asked to
reload it.

## Security

**Amplification from the migration is bounded at 13x.** `MAX_DESIGN_DIMENSION_MM / MAX_EMPTY_COLUMN_WIDTH_MM`
= 10 000 / 800 = 12.5, so a single oversized entry splits into at most 13 pieces. The schema's
`MAX_EMPTY_COLUMNS` bound is **re-asserted after the array grows** (see Migration, above), not only at
parse time, so a hostile v1 document carrying the maximum entry count at the widest a room may present
cannot escape the array's own cap through normalisation. **Termination is proven from the loop**:
`splitEmptySpanAtCap` strictly decreases `leftToPlaceMm` by at least one millimetre on every iteration
(`Math.min(leftToPlaceMm, MAX_EMPTY_COLUMN_WIDTH_MM)` is always positive while `leftToPlaceMm > 0`), so
it terminates in at most `ceil(totalMm / 800)` steps for any finite input, with no recursion and no
unbounded external state.

## Alternatives considered

**Refuse the shrink.** Rejected; see above.

**Cap the shrink and strand the remainder.** Rejected; see above.

**Grandfather an oversized v1 entry rather than normalising it.** Rejected — it leaves the invariant
this record establishes unenforceable for exactly the documents old enough to need it enforced.

**Clamp an oversized v1 entry by dropping the overflow.** Rejected — it silently deletes wall a
customer's own design holds.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0037](0037-adjacent-empty-columns-merge-into-one-space.md), *"a span wider than 800 mm may simply stay empty"* | An unfillable opening is a legitimate state, and refusing the move that made it was rejected. | **Governs the shrink-overflow question directly**, and is why refusing a >800 mm shrink was never a live option here. Untouched — a span may still exceed 800 mm; only a column may not. |
| [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md) | A gap of any width, including a growth's remainder, is legal — no floor. | **No conflict; a dependency.** The overflow piece this record's split produces can be any width down to the smallest the arithmetic yields, and ADR 0043 is what makes that a legal state to create. |
| [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md) | The merge caps at 800 (`MERGE_CAP_MM`); an insert splits the column it does not fill; ADR 0037's "opening belongs to a column" rule is why stranding is rejected. | **`MERGE_CAP_MM` is retired into `MAX_EMPTY_COLUMN_WIDTH_MM`, the same constant this record generalises.** The merge is now one of three producers held to one ceiling rather than the ceiling's only source. Rule 1's greedy maximal scan and the "an opening belongs to a column" argument are both reused verbatim for the shrink-split and the migration-split. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 7 | A shrink creates the empty column it needs, with no ceiling named. | **Amended in place.** The created column is now held to `MAX_EMPTY_COLUMN_WIDTH_MM` exactly as every other empty column is; Q5, opened by this decision, is closed here. |
| [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md) | `emptyColumns` is free of migration cost under ADR 0038's pre-release licence; "this record's cheapness expires with ADR 0038, at first release." | **Its expiry premise is corrected, dated here.** This wave's own measurement — 5 rows, all schema_version 1 — is the first time anyone re-checked ADR 0038's "nothing has ever been stored" claim since ADR 0038's own 2026-08-31 correction, and rows *do* exist (empty of the field in question, but real). The field's free ride is not "expiring at first release" as an event still to come; this wave is the first to actually pay a migration cost for a change adjacent to it, and the next reader should not assume ADR 0038's licence is still untested. |
| [ADR 0038](0038-pre-release-no-stored-designs-no-migrations.md) | No design has ever been stored; corrected 2026-08-31 that the "no deserialisation surface" premise was false when written. | **Its core premise — "no design has ever been stored" — is also false, measured here rather than argued.** Five rows exist, at `schema_version` 1. The decision's operative rules (no migration was owed *until now*, dead code kept only to read an older shape may be deleted) stood correctly for those five rows, because none carries the field this wave changes — but the premise itself should be read as retired by measurement, not merely "not yet tested," the same shape of correction ADR 0038 already applied to itself once. |
| `docs/STATUS.md:236` | Names `MERGE_CAP_MM` as a live constant. | **Stale; corrected in this wave's STATUS.md update** — the merge now reads `MAX_EMPTY_COLUMN_WIDTH_MM`, and no second 800 exists in the tree. |
| `docs/STATUS.md:291-294` | Records Q5 as open and frames 800 as undecided. | **Corrected in this wave's STATUS.md update** to record the closure above. |
| `docs/milestones/M5-width.md` | Q5 recorded as M5's open question. | **Closed in place with a dated pointer to this record.** |
| [ADR 0020](0020-a-migration-file-is-not-an-applied-migration.md) | `APPLICATION /lemn-conf-v2 rows: 0`, a dated measurement corrected by ADR 0038. | **Given a dated pointer to this wave's 2026-09-02 measurement** (5 rows, schema_version 1), since it is an observation rather than a ruling and the premise it recorded has now been re-measured a second time. |

## Consequences

- **`MAX_EMPTY_COLUMN_WIDTH_MM` becomes the single ceiling on an empty column**, read by the merge,
  the shrink split, and the v1 migration split — one constant, three producers.
- **The shrink command becomes a two-column writer in the oversized case.** `apply-column-moves.ts`
  writes the near piece and any overflow pieces as separate frozen entries, each keyed per ADR 0046
  rule 3 from a single millimetre value.
- **A tenth refusal code**, `EMPTY_COLUMN_WIDER_THAN_CAP`, joins the nine ADR 0044 established, at
  both seams.
- **Schema version 2.** A v1 document is not refused; it is normalised on load and written back
  normalised on the next save. A v2 document holding an oversized entry is refused outright.
- **No new customer-facing copy.** The shrink still succeeds; the narrow overflow column shows ADR
  0037's existing "may be left as it is" sentence.
- **`splitOversizedEmptyColumns` at map level is a guard, not a load-bearing producer.** It was
  reasoned into existence on the premise that a delete could leave a member-less column wider than the
  ceiling with no command able to split it; QA measured that premise false — `deriveColumns` takes a
  column's width as `Math.min` over its members' frames, the widest deletable body a document may
  carry is 800 mm, and both seams already hold a stored entry to the ceiling — and confirmed by
  removing the call: both suites stayed green but for a test built on a hand-constructed map. It is
  kept as a DOM-001 defence-in-depth guard against a future producer this wave did not anticipate, and
  the delete-is-a-producer justification that motivated writing it is retracted as false, in place, in
  its own header comment.
- **Q5 is closed.** It cannot be widened a fifth time: 800 mm now bounds every empty column, from
  every producer, at every seam.

## Dated note — 2026-10-17: superseded for spaces (ADR 0166)

The owner's ruling of 2026-09-02, *"lets make 800 the maximum of any empty column"*, is replaced by the owner's Q-8U-1
= (b) (2026-10-16, relayed): **a space may exceed 800 mm; 800 stays the cap on every cabinet.** Recorded in
[ADR 0166](0166-adjacent-empty-spaces-merge-whatever-their-total-and-800-mm-caps-the-cabinet-not-the-space.md).

- `EMPTY_COLUMN_WIDER_THAN_CAP` is retired at both write seams (8U S1, `1e2621e2`).
- **What still cuts at 800 today:** the v1 migration arm (unchanged by design), and — **until 8U S5 is built** — the
  commands' own cuts: `insertBody`'s remainder split and `setWidth`'s shrink overflow. The reconcile's uncapped merge
  rejoins their pieces after every command, so no customer sees a seam (backlog 255).
- *"A span wider than 800 may stay empty"* still holds. Nothing above this note is edited.
