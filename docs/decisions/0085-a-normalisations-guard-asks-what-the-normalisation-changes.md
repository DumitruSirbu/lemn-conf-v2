# ADR 0085 — A normalisation's guard asks what the normalisation changes, never whether the document is valid

Status: Accepted (extends [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)
decisions 5 and 5b; corrects a claim in [ADR 0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md)
decision 2 and one wave 6Q-b criterion)
Date: 2026-09-05
Type: Finding + Decision
Milestone: M6 — adjudicates wave 6Q-b's QA finding; binds 6N-0 and every later wave that adds a
`DesignValidationCode`

## Context

Wave 6Q-b added `PLACEMENT_WEARS_UNOFFERED_FINISH: "refusal"` to `DESIGN_ISSUE_SEVERITY_BY_CODE`
(`packages/configurator-domain/src/validate-design.ts`), correctly, under ADR 0069 decision 2's
membership rule. Its safety argument, ADR 0078 decision 2, is an ordering argument: the load seam
resolves before it validates, so *"the refusal is unreachable on the load path by construction"*.

**That argument is about one reader of the severity table. There are two.**
`assertDesignValidForCatalog` is the reader the argument covers. The other is
`correctPreCorrectionRoom` (`packages/configurator-domain/src/migrate-design.ts:245`), which asks
`hasFatalIssues(corrected, catalog)` and **declines the 2026-09-03 room correction** when the
corrected document carries any fatal finding. It runs at schema version ≤ 2, inside `carryForward`,
**before** `resolveFinishesTheMaterialDoesNotOffer` — which is unconditional and runs at the end of
`migrateDesign`. So the new code's **fatality** is consumed on the load path one arm before the
resolution that was supposed to make it moot.

**The finding, measured by wave 6Q-b's adversarial QA and left red** at
`packages/configurator-domain/tests/qa-6q-b-load-seam.adversarial.test.ts`, attack 6. On a version 2
document with `room: {3600, 2400}`, `settings.materialTierId: "material.veneer"` and one placement
wearing `pal.antracit`:

| Document | `loaded.room.widthMm` |
| --- | --- |
| the same document wearing no finish | **3560** — corrected |
| the same document wearing `pal.antracit` | **3600** — the correction silently declines |

A companion green test pins the mechanism: under the corrected room the fatal set is exactly
`["PLACEMENT_WEARS_UNOFFERED_FINISH"]`. Re-measured for this record against
`packages/configurator-domain/dist` on 2026-09-05, at **both** `2830` and 6N-0's `2920`:

```
pal.antracit on veneer, corrected {3560, 2830}
  before: ["placements.0.body.finish:PLACEMENT_WEARS_UNOFFERED_FINISH"]
  after:  ["placements.0.body.finish:PLACEMENT_WEARS_UNOFFERED_FINISH"]
  created: []
```

The finding is **carried, not created**. `findUnofferedFinishIssues` reads `design.settings` and
`design.placements` and nothing else — it does not mention `design.room` — so it is identical under
both rooms by construction, and it is being read as an answer to a question about a wall.

**Reachability is latent today and it is not what settles this.** `settings.materialTierId` was not
written at schema version ≤ 2, and `replaceLegacyEnumFinishes` maps every legacy enum finish to a
decor PAL offers or to `DEFAULT_FINISH`, so no row believed to be in the database is in this class.
It is still in-contract: the load seam's contract is *every document `LegacyDesignSchema` admits at a
supported version*, and QA's fixture is one. **Classified as a contract gap, not an implementation
defect and not a test-fidelity problem** — nothing was written down saying the severity table has a
second reader that asks a different question, so the code that added a member to it could not have
been expected to check. QA was right to leave it red.

**Left as it stands, the coupling arms itself.** M7 gives a customer a room control; a future
migration arm keyed below 2 goes *at the front* of `NORMALISATIONS_BY_VERSION_OWING_THEM` by that
map's own head comment; any wave may add a fatal code. Each of those independently converts a latent
coupling into a dead room.

## Decision

### 1. The rule, stated so the next fatal code lands on the right side of it without re-litigation

> **A normalisation's guard is a question about the normalisation, never a question about the
> document. The only admissible validity question a load-path arm may ask is what its own rewrite
> *changes*: a finding the document carries either way is not caused by the rewrite and can never be
> a reason to decline it. Whether the document is executable at all is
> `assertDesignValidForCatalog`'s question, it is asked unconditionally at the end of every load, and
> an arm that re-asks it locally is answering a question that already has an owner — with whatever
> the severity table happened to say on the day.**

The corollary is the thing to check, and it is checkable by reading one function:

> **No entry in `DESIGN_ISSUE_SEVERITY_BY_CODE` may change whether a room correction fires.** After
> decision 2 that is true by construction rather than by maintenance: a code can only reach the guard
> if its findings *differ* between two documents that differ only in `design.room`.

This is the same shape as `normaliseOversizedEmptyColumnEntries`' own head comment — *"What this does
not do is decide the document is valid"* — promoted from one arm's commentary to the rule all of them
follow. The two normalisations wave 6Q-b and wave 6P added already comply: neither the `canFinish`
strip nor the finish resolution asks a validity question at all.

### 2. `correctPreCorrectionRoom`'s guard becomes a comparison

The guard declines the correction **if and only if the corrected document carries a fatal finding the
uncorrected document does not**. Compared by the `(code, path)` pair, not by count and not by code
alone: the same code at a different path is a different finding, and a correction that removes one
fatal finding while creating another must still decline.

**This preserves 100% of what ADR 0069 decision 5's table says guard 2 was protecting, and drops
exactly the part that table already says is not load-bearing.**

| What guard 2 protects | Under the comparison |
| --- | --- |
| *The corrected room is not the answer to this document's problems — it is malformed, names an unknown body, overlaps itself.* | **Kept.** Those findings are room-invariant, so they are present before and after, and the document still fails on its own terms at `assertDesignValidForCatalog` with its own findings and its own paths. The room it fails *with* is now the corrected one; the findings it fails *on* are identical. |
| *A `/d/{id}` link that loaded before the correction must not stop loading because of it* ([ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)). | **Kept, and this is the half that was doing real work.** The correction narrows wall A by 40 mm, so it genuinely can create a fatal finding. Measured witness, on the seeded design plus one wall-B `emptyColumns` entry of `depthMm: 3580` — legal against `widthMm` 3600, fatal against 3560 (`reachesPastRoomAcrossWall`, `validate-design.ts:567`): `created: ["emptyColumns.0.depthMm:EMPTY_COLUMN_DEEPER_THAN_ROOM"]` at both 2830 and 2920. The guard declines, correctly. |
| *One body still reaches past the end of a wall after the correction.* | **Still dropped**, unchanged from decision 5 — that is a mark, not a failure ([ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)). |
| *The document happens to be fatally invalid for a reason the room has no bearing on.* | **Dropped, and this record is that change.** It is decision 5b's own objection to guard 1 — *"a guard keyed on an irrelevant fact protects the case that is fine and fails the case that is not"* — arriving at guard 2 through a code nobody had written when 5b was decided. |

**What makes the correction safe is unchanged and is not this guard.** The corrected room is a
constant, reached only at schema version ≤ 2 from the exact pre-correction pair `{3600, 2400}`, and
no room value is ever derived from the document's own placements (ADR 0069 decision 5, ADR 0083
decision 9). Nothing is rescued into a room nobody entered.

### 3. "Room-relevant" is **observed, never declared** — option (a) is rejected by name

The adjudication was offered a filtered `hasFatalIssues` whose filter names the room-relevant codes.
**Rejected**, in both the forms it can take:

- **A hand-listed enumeration of room-relevant codes.** This is precisely the shape ADR 0069 decision
  4 already rejected one seam over: *"a list is silent about a code it has never been shown, and both
  of this record's defects are a code the list was never shown."* Adding
  `PLACEMENT_WEARS_UNOFFERED_FINISH` to such a list is the same wave's same omission with a second
  chance to happen.
- **A second total map, `Record<DesignValidationCode, boolean>`, so an unclassified member does not
  compile.** Rejected on a stronger ground than staleness: **it would be a declaration of something
  that is not a fact about the code.** ADR 0028's rule applies where there is no ground truth to
  compute from — a wall depth, a severity, a pin. Here there is one, and it is the validator itself.
  A maintainer asked *"is `COLUMN_EXTENT_OVERLAPS_PLACEMENT` room-relevant?"* would be guessing at
  something the code already answers exactly; the answer is not even a property of the code alone,
  since it depends on which two rooms are compared. Declaring a computable fact beside the
  computation is the two-lists-that-agree-by-luck failure ADR 0028 exists to prevent, not an
  application of it.

**The comparison needs no classification at all**, which is why it is the answer and not a tidier
list. It runs the one total validator twice and asks what moved. A code is room-relevant if and only
if its finding differs across the two rooms, which is the definition rather than a proxy for it.

### 4. Option (b) — resolve the finishes before asking — is rejected

Running `resolveFinishesTheMaterialDoesNotOffer` inside the room arm, or ahead of `carryForward`,
would silence this one code and nothing else. Four objections, in descending order of force:

1. **It is a patch on an instance of the rule, so the next fatal code reopens this record.** Any
   future document-level refusal — a hardware code, a handle code, an accessory code — lands in
   exactly the same place, and the fix would have to be re-derived each time by whoever hits it.
2. **It makes the guard measure a different document than the one being corrected**, which is how
   guard 1 got its false commentary in the first place (decision 5b).
3. **It couples two arms that are deliberately independent.** The room correction is version-keyed at
   2; the resolution is keyed to no version, on ADR 0078 decision 2's own reasoning. Reaching one
   into the other re-introduces the version keying by the back door.
4. **It contradicts `NORMALISATIONS_BY_VERSION_OWING_THEM`'s head comment**, which permits an arm to
   assume every **older** arm has run and forbids the reverse.

### 5. ADR 0069 decision 5b is **extended, not superseded**

Nothing 5b decided is overturned. Guard 1 stays deleted; the provenance argument that deleted it is
untouched and is in fact what this record applies a second time; guard 2 stays, still fatal-only,
still the only guard. What changes is guard 2's **predicate**, from an absolute measurement of the
corrected document to a comparison across the rewrite — a second narrowing in the same direction 5b
narrowed it, for the same reason. 5b's closing sentence, *"guard 2 is the only guard left and it is
the one that was doing real work"*, remains true and is now true of a guard that only does that work.

ADR 0069 carries a dated amendment pointing here.

### 6. Wave 6Q-b's load-seam ordering criterion is **withdrawn as stated** and replaced by two that can fail

The criterion reads: *"**Never reset**: the load seam's ordering (item 3) — the strip runs first, so
nothing frontless reaches the resolution."* QA swapped `dropFinishFromBodiesThatCannotWearOne` and
`resolveFinishesTheMaterialDoesNotOffer` and measured **zero** new failures.

**QA's result is correct and is not a gap in the suite. The two normalisations commute on every
input**, and the proof is two lines of the code:

- `resolveFinishesTheMaterialDoesNotOffer` only ever maps `wearing(placement, defaultFinish)` over
  placements whose `finish !== undefined`. It never adds a `finish` key and never removes one — ADR
  0078 decision 5, *absence stays absence*.
- `dropFinishFromBodiesThatCannotWearOne`'s predicate is `finish !== undefined && canFinish === false`
  and reads no finish **value**.

So the strip's predicate is invariant under the resolution, and the composition is order-independent
for every document — including the fixed-point case, where both orders return the input by identity
on exactly the same inputs. **No test can distinguish the orders, because there is nothing to
distinguish.** A criterion no test can fail is not a criterion.

What replaces it, and both are falsifiable:

1. **The product claim, asserted directly and already discharged.** A frontless body stored wearing a
   finish loads carrying **no finish at all** — `packages/configurator-domain/tests/finish-resolution-at-the-load-seam.test.ts`,
   a hood stored wearing `pal.alb` on a veneer kitchen, plus the sweep over all three materials.
   [ADR 0084](0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md)
   decision 2a already rules this the right home for it. It passes in either order, which is the
   point: the claim is about the output, and the output is what a customer sees.
2. **The invariant that makes the ordering immaterial, asserted as its own property.**
   `resolveFinishesTheMaterialDoesNotOffer` changes the **set of placements carrying a `finish` key**
   not at all: for every placement, `finish === undefined` before if and only if after. Swept over
   6Q-a's generated pair space, so a fourth material or a seventh decor enters it by existing. **This
   is the assertion that goes red if either normalisation grows a condition** — which is the outcome
   the ordering was written to defend against, now guarded by something that can fail.

**The ordering stays in the code**, as defence in depth and because reversing it would be a change
with no argument behind it. Its commentary does not stay: *"Running second is what makes that true by
construction"* is false as written — what makes it true is invariant 2 above — and a false comment at
a seam this delicate is a trap for the next reader. It is rewritten to say the ordering is not
load-bearing today, to name the invariant that makes it so, and to say that an arm which starts
reading a finish **value** or writing a finish **key** makes it load-bearing again.

### 7. ADR 0078 decision 2's phrase is restated, not withdrawn

*"The refusal is unreachable on the load path by construction"* is **true of the refusal** —
`assertDesignValidForCatalog` never sees `PLACEMENT_WEARS_UNOFFERED_FINISH` on a load, because the
resolution runs immediately before it. It was read as *"the code has no effect on the load path"*,
which is a different and false statement. The sentence gains its scope: **the refusal is unreachable;
the code's severity has a second reader, and after decision 2 that reader cannot act on it.**

### 8. What this does not change

- **ADR 0069 decisions 1–4 and 5c are untouched.** The code family, the membership rule, the total
  map and the derived overflow set all stand. `PLACEMENT_WEARS_UNOFFERED_FINISH` stays a
  `"refusal"`; decision 2's membership rule leaves no discretion and this record does not ask for
  any.
- **ADR 0078 decisions 1 and 3–6, and ADR 0084, are untouched.**
- **`PUT /api/designs/[id]` is untouched.** It still refuses a payload wearing an unoffered finish,
  including on a frontless body (ADR 0084 decision 2d), and that is still accepted as it stands.
- **No schema version bump.** Nothing about the stored shape changes, and the arm is already keyed.
- **`CORRECTED_ROOM_MM` is not this record's business.** Its value is ADR 0083 decision 9's and wave
  6N-0's.

## Alternatives considered

- **Delete guard 2 entirely.** It is nearly harmless — a corrected document that is fatally invalid
  throws either way and the rewrite is never persisted — but not harmless: the wall-B `depthMm: 3580`
  witness above is a document that loads before the correction and would stop loading after it, which
  is the dead `/d/{id}` link ADR 0052 forbids. Rejected on that measurement.
- **Filter `hasFatalIssues` to room-relevant codes.** Decision 3.
- **Resolve the finishes before asking.** Decision 4.
- **Make `correctPreCorrectionRoom` ignore fatality and let the correction always fire.** Same
  rejection as deleting guard 2, plus it discards the diagnostic property 0069 decision 5 names.
- **Move `correctPreCorrectionRoom` to the end of `migrateDesign`, after both unconditional
  normalisations.** It would work for this code and breaks the version-keyed table's own contract: an
  arm keyed at 2 that runs after every unconditional arm is no longer *"every normalisation the
  stored version still owes, oldest first"*, and a v1 document's oversized-column arm would then run
  before a room correction that a v1 document also owes — the exact ordering defect that map's head
  comment records as already having happened once.

## Records swept before deciding, and how each is settled

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 5 | Guard 2 asks fatal validity of the corrected document | **Extended.** The predicate narrows from absolute to comparative; decision 5's own two-row table is what justifies it. |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 5b | Guard 1 is deleted; a guard keyed on an irrelevant fact protects the case that is fine | **Applied, not overturned.** This is the same objection reaching guard 2 through a code that did not exist on 2026-09-03. 5b's deletion of guard 1 stands. |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 4 | Severity is declared per code in a total map; a filter list is rejected because it is silent about a code it was never shown | **Honoured, and it is the argument against option (a).** This record adds no second list and no second map. |
| [0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) decision 2 | The load seam resolves before it validates; the refusal is unreachable on the load path | **Scope restated** (decision 7). The ordering claim is true of the refusal and was read as a claim about the code. |
| [0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) decision 5 | Absence is a legal state and stays absent | **Load-bearing here.** It is half the proof that the two normalisations commute (decision 6). |
| [0084](0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md) decision 2a | The hood-carrying-a-stored-finish case belongs to the load seam and is asserted there | **Confirmed and relied on.** It is replacement criterion 1 and needs no new test. |
| [0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) decision 9 | `CORRECTED_ROOM_MM` becomes `{3560, 2920}`, read from the fixture's room | **No collision.** Measured at both values; see *Consequences*. |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) | A body past the end of its wall is marked, not moved; the corrected room rescues nothing | **Untouched.** The corrected room is still a constant and still never derived from the placements. |
| [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | A load that refuses is a dead `/d/{id}` link; normalise rather than refuse | **The reason guard 2 survives at all**, in comparative form. |
| [0028](0028-wall-depth-is-derived-from-the-worktop.md) | Declare, do not compute; two lists that agree by luck is the failure | **Applied in the direction it points.** It governs facts with no ground truth; room-relevance has one, and declaring it beside the validator is the failure 0028 names, not the remedy. |
| [0055](0055-a-depth-change-migrates-the-stored-design.md) | A rewrite a version owes takes a bump | **Not engaged.** Nothing stored changes shape. |

## Consequences

- **A version ≤ 2 document that is fatally invalid for a room-invariant reason now loads with the
  corrected room in the error it raises rather than the mis-measured one.** The findings and paths in
  the `InvalidDesignError` are identical; only the room the document carried while failing differs,
  and it is not reported. Nothing is persisted either way.
- **The guard validates twice instead of once**, on documents whose room is exactly `{3600, 2400}` at
  schema version ≤ 2. That is the seeded rows and nothing else, once per load.
- **`hasFatalIssues` loses its only caller and is deleted with it.** Its comment — *"Fatal findings
  only: since ADR 0065 an overflow after the correction is a mark…"* — moves to the replacement,
  where it is still exactly right and is now one of two reasons rather than the whole of one.
- **No collision with wave 6N-0.** 6N-0 changes the *constant* `CORRECTED_ROOM_MM`; this changes the
  *guard*. Measured at both `{3560, 2830}` and `{3560, 2920}` on 2026-09-05: the created-finding set
  is `[]` on the seeded design, `[]` on QA's veneer fixture (so the correction fires, which is the
  fix), and `["emptyColumns.0.depthMm:EMPTY_COLUMN_DEEPER_THAN_ROOM"]` on the deep-wall-B witness (so
  the guard still declines). **Whichever wave lands second rebases onto the other with no re-ruling**,
  because wall A — the only dimension the correction narrows, and therefore the only one that can
  create a finding — is `3560` in both. **Order them by convenience, not by dependency.** The one
  thing neither wave may do is fold the other's change in: 6N-0's diff must not touch the guard, and
  this diff must not touch the constant.
- **A wave adding a `DesignValidationCode` answers one question, still**, and it is unchanged: *is
  the only thing this says that a run reaches past the end of its wall?* It no longer has to also ask
  what the room migration will make of it.

## Acceptance criteria

Falsifiable, and each names what must **not** happen.

1. **The correction fires on a document whose only fatal finding is room-invariant.** QA's red test at
   `qa-6q-b-load-seam.adversarial.test.ts` attack 6 goes green **unmodified** — the assertion is not
   relaxed, renamed or moved. `loaded.room.widthMm` is `3560`.
2. **The correction still declines when it creates a fatal finding.** The seeded design at
   `{3600, 2400}` plus one wall-B `emptyColumns` entry with `depthMm: 3580` loads carrying
   `room.widthMm === 3600`. This is the guard's non-vacuity proof and it is required: without it the
   change is indistinguishable from deleting guard 2.
3. **The comparison is by `(code, path)`, not by count.** A document whose correction removes one
   fatal finding and creates a different one declines. Constructing this needs both a room-invariant
   fatal finding and the wall-B deep column, and it must not be satisfied by a length comparison.
4. **The severity table cannot reach the guard.** Adding a hypothetical fatal code to
   `DESIGN_ISSUE_SEVERITY_BY_CODE` changes no room-correction outcome. Asserted as the general
   property rather than per code: for any document whose `room` is the pre-correction pair, the
   guard's answer is unchanged by any finding present under both rooms.
5. **Nothing else about the load path moves.** The seeded design at version 1, 2, 3, 4 and 5 loads to
   a byte-identical document before and after this change, and `migrateDesign` still returns by
   identity on every input where nothing is owed.
6. **The two normalisations still commute, and the suite now says so.** The finish-presence invariant
   of decision 6 is asserted over 6Q-a's generated pair space, with both branches non-empty — at
   least one placement whose finish is rewritten and at least one whose absence is preserved — and
   the count of placements carrying a `finish` key is pinned as a literal, so the sweep cannot pass
   over nothing.
7. **Anti-invariant: no second list.** `grep` finds no new `Record<DesignValidationCode, …>` and no
   `Set<DesignValidationCode>` in `migrate-design.ts`, and no `DesignValidationCode` **literal** used
   as a value in that file — read as a member of the severity table or compared against one, the
   shape decision 3 rejects. A code name is admissible in prose: `PLACEMENT_WEARS_UNOFFERED_FINISH`
   appears at `migrate-design.ts:529`, inside a doc comment explaining why the resolution sits where
   it does, which is commentary and not a list. If a `DesignValidationCode` literal appears in that
   file **as code** — a table key, a set member, an equality check — this record has been implemented
   wrongly.
