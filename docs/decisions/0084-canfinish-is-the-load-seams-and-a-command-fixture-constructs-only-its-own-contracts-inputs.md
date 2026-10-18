# ADR 0084 — `canFinish` is the load seam's, and a command's fixture constructs only its own contract's inputs

Status: Accepted
Date: 2026-09-05
Type: Finding + Decision
Milestone: M6 — corrects wave 6Q-b's veneer-fixture criterion; binds 6Q-c and every later wave that
asks the same question

## Context

Wave 6Q-b's plan states the destructive-path fixture as **five things at once**
(`docs/milestones/done/M6-price-and-global-settings.md`, *"The veneer fixture, so the destructive path is
measured rather than assumed"*). Two of the five cannot both hold as written:

> **One `canFinish: false` body — the hood — carrying a stored finish**, which the strip removes and
> the resolution must not re-add.

> Asserted as **one** result, with the effect's count naming exactly the two free-colour bodies: not
> five … not three, which would mean the hood was counted.

The implementer reported the conflict and worked around it: in
`packages/configurator-domain/tests/support/mdf-kitchen-wearing-chosen-colours.ts` the hood (`p13`)
wears `veneer.nuc` — a finish veneer **does** offer — so the MDF → veneer switch does not count it
and the effect's count is 2.

The conflict is real. `setMaterialTier` takes `WholeKitchenTierInput`, which carries no
`BodyCatalog`; `resolveFinishesTheTierDoesNotOffer` therefore filters on
`placement.body.finish !== undefined && !materialOffersFinish(material, finish)` and cannot tell a
frontless body from a finishable one. A hood wearing something veneer refuses is counted, and the
count is 3.

This record rules the conflict, the workaround, the catalogue question underneath both, and the
duplicated fixture — because the same question arrives again in 6Q-c and again in 6R, and because
the criterion's number was reasoned and must be seen to move rather than be quietly rewritten.

## Decision

### 1. Finding, measured: nothing puts a `canFinish: false` body wearing a finish in front of `setMaterialTier`

Every route by which a `Design` reaches that command was walked. There are two sources and four
writers, and all six close:

| Route | What it does with a finish on a frontless body |
| --- | --- |
| `neonConfigurationRepository.load` → `migrateDesign` (`neon-configuration-repository.ts:231`) | `dropFinishFromBodiesThatCannotWearOne` strips it, unconditionally and at every version, **before** `resolveFinishesTheMaterialDoesNotOffer` runs. A loaded document's hood carries nothing. |
| `ConfiguratorStoreOptions.design` — the seeded `KITCHEN_L_DESIGN` | Carries no `finish` on any placement at all (verified 2026-09-05, and already recorded twice in the milestone). |
| `setFinish` | Refuses with `FINISH_NOT_SUPPORTED` on `!record.canFinish` (`set-appearance.ts:92`). |
| `insertBody` → `carriedAppearance` | Drops the finish where `body.definition.canFinish` is false (`insert-body.ts:326`). |
| `rebuildResizedBodies` | Calls the same `carriedAppearance` (`rebuild-resized-bodies.ts:135`), which is why it was extracted. |
| `setCabinetDepth`, `applyColumnMoves`, `splitColumn`, `removePlacement`, `setWidth` | Never write `body.finish`; a placement's body is spread through unchanged. |

`setMaterialTier` has exactly one production caller — `configurator-store.ts:498` — and the store's
`design` comes from those two sources and no other: `hydrate` is called once, from
`apps/web/src/app/d/[id]/hydrate-and-configure.tsx:33`, with the document the server already
migrated. `canFinish` is depth-invariant in the catalogue, so the two-depth `catalogAt` factory
cannot flip a body into or out of the strip's reach.

**So the count is 3 only in a state the product cannot produce, and the implementer's constraint is
real but its consequence is not.** Give the fixture's hood no finish and the count is 2 *because the
hood carries nothing*, which is the state every loaded design presents — not because the hood was
given a finish chosen to slip past the filter.

### 2. The criterion conflated three seams. It is restated across them, and the number moves with a reason

**a. The hood-carrying-a-stored-finish case belongs to the load seam, where the strip actually
runs.** It is already asserted there, and better than the criterion asked: at
`tests/finish-resolution-at-the-load-seam.test.ts` a hood stored wearing `pal.alb` on a **veneer**
kitchen loads carrying no finish at all — a finish veneer *refuses*, so "the strip removed it" and
"the resolution never reached it" are both live, and a second test sweeps all three materials. The
criterion's fifth item is discharged there in full.

**b. The command's fixture holds a hood wearing *nothing*.** That is what a loaded design presents,
and it exercises the rule `setMaterialTier` actually owns: *absence stays absence* (ADR 0078
decision 5), including on a body that could never have worn one. The count is then 2 for a reason.

**c. "Never counted" names `resolvedFinishCount`, not the sheet's figure.** The criterion says
*"never counted **in the 'applies to N bodies' figure the sheet already renders**"* and 6Q-b's own
*What it must not do* says the opposite and is right: *"that count is the material's reach and the
material reaches a frontless carcass like any other"* — [ADR 0016](0016-hood-chimney-is-carcass.md),
and `describeGlobalSettings` counts every body in the priced groups
(`global-settings-model.ts:190`). The two counts are different numbers, which is the same trap
[ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md) decision 4
names between the query's count and the effect's. **`appliesTo` counts the hood and must keep
counting it; `resolvedFinishCount` must not.**

**d. "Never refused" is scoped to the load path, and the write seam's behaviour is accepted as it
stands.** `findUnofferedFinishIssues` is document-level and catalogue-blind by design, so a payload
arriving at `PUT /api/designs/[id]` with an unoffered finish on a frontless body **is** refused —
`fatalDesignValidationIssues` at `route.ts:238`, with no strip in front of it. That is correct and
must not be "fixed": no command in this product produces such a document, nothing stored is refused
(the load resolves and strips before `assertDesignValidForCatalog`), and exempting it would make the
write seam *accept* a document the product cannot write while putting a third authority on
`canFinish` beside the two that exist. The criterion's *never refused* was about the dead-link cost
([ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)), and that cost is only ever paid on
the load path.

### 3. The workaround is replaced, not kept — it does not hold even in its own file

A hood wearing `veneer.nuc` is not the test the criterion asked for, and it is not a smaller version
of it either. Three reasons, in descending order of force:

- **It fails in the same file, four tests later.** `material-finish-reset.test.ts`'s *"resolves
  against the tier being applied even when it is the tier already stored"* applies **MDF** to the
  same fixture and asserts `count === 3`, with a comment naming the third: *"the two woods and the
  hood's wood are what move."* MDF's `ral-picker` offers no palette entry, so that assertion pins
  the command **resetting a frontless body to `#eceeeb` and counting it**. The workaround hides the
  behaviour in one direction of a fixture that is read in both, and the direction it does not hide
  is committed, green and commented as if it were correct.
- **It buys nothing the load seam does not already own.** The `veneer.nuc`-not-`veneer.stejar`
  argument in the fixture's head comment — *"so 'the strip removed it' is distinguishable from 'the
  resolution re-added it'"* — is a load-seam distinction, and the load-seam test makes it more
  sharply with a PAL decor on a veneer kitchen.
- **It states an artefact as a design fact.** The head comment explains the hood's wood as a
  property of the fixture; it is a property of a command limitation. A reader arriving in 6R has no
  way to tell which.

**What is lost, stated plainly, because something is.** With the hood bare, the MDF → MDF direction
resolves 2 (`p4`, `p5`) and the MDF → veneer direction resolves 2 (`p0`, `p1`) — so **the count
alone stops distinguishing "resolved against the tier being applied" from "resolved against the tier
already stored".** That discrimination does not go away; it moves to where it was always stronger:
the existing assertions that `p0`/`p1` hold veneer's declared default and that `p4`/`p5` come back
as **the same placement objects** (`toBe`, not `toEqual`). A count can be right by accident; object
identity on the untouched half cannot. The fixture's *"not five, not three"* gloss is withdrawn with
the hood row that made it true, and both directions must name **which** placements moved.

### 4. `setMaterialTier` and `setHardwareTier` take no `BodyCatalog` — not in 6Q-b, and not later

Stated to settle it, since the next wave will ask again.

- **It is a decision about the pair, not one command.** `WholeKitchenTierInput` is deliberately one
  shape for both (`set-whole-kitchen-settings.ts:44`), because the two are the settings that are
  never per cabinet and the sheet applies them together. A `catalog` field would be read by one
  command and inert in the other: a parameter that lies about what it is for, which is the flag
  argument that module's head comment already refused once.
- **It would be a third authority on `canFinish`.** There are exactly two, and both are recorded:
  `dropFinishFromBodiesThatCannotWearOne` at the load seam and `carriedAppearance`/`setFinish` at the
  write seam. 6Q-c's plan already forbids the third in the same words for
  `countCabinetsWearingAChosenFinish` — *"a catalogue argument would put a second authority on
  `canFinish` beside those two"* — and this is the same prohibition one wave earlier. Two authorities
  that agree today are one rename from disagreeing silently.
- **The branch it would add is unreachable** (decision 1). It would be dead code guarded by a test
  that can only construct its own premise, which is the fixture problem this record exists to close,
  re-entering through production.
- **The residue is bounded and self-healing.** In the impossible state the command would repaint one
  frontless body and over-count by one in an effect that
  [is deliberately never rendered](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md);
  the next load strips it. There is nothing to recover from.

This is **not** a general rule that commands take no catalogue — `insertBody`, `removePlacement`,
`setFinish`, `setWidth` and `setCabinetDepth` all take one or a factory for one, and rightly. The
rule is narrower and is the whole of it: **a whole-kitchen setting is defined over the document and
its declaration, and asks the catalogue nothing.**

### 5. A fixture may construct any input the command's own contract is defined over, and may not construct one to borrow another module's guarantee

This is the line the hood row crossed, and it is what makes the rest of the fixture legitimate.

`setMaterialTier` is a pure function of `(design, tierId)` whose contract is *"rewrite every carried
finish the applied material does not offer"*. `p0`/`p1` (two different free colours), `p4`/`p5` (two
woods) and `p6` (nothing) are all just *a placement carrying finish X* — squarely inside that
contract — so constructing them in memory is ordinary, even though the assembled document is not one
the product produces. **The hood row is different in kind:** `canFinish` is not in this command's
contract at any point, so the row is not an input to the rule under test — it is another module's
guarantee dressed as this one's, and the count it produced was an artefact of the disguise.

**Two consequences, and both are punch-list items rather than prose.**

- The fixture must **say** it is an in-memory construction, and say why that is legitimate here.
  Left unsaid, a later reader takes it for a document the product holds — and it is not: on an MDF
  kitchen, `p4`/`p5` wearing woods is refused by `validateDesignForCatalog` at `PUT` and rewritten to
  white by the load seam, so this document can be neither stored nor loaded intact.
- **The reachability objection is discharged once, in the suite, not in a document.** There *is* one
  reachable route to a document mixing finishes a target material offers with finishes it refuses:
  a design whose stored `materialTierId` names no declared material — ADR 0072's state, which
  [ADR 0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md)
  decision 3 and 6G's recovery path require to keep loading. On it the load seam resolves nothing,
  `setFinish` offers everything (`designOffersFinish` returns true on the undeclared arm), and the
  hood is still bare because the strip does not consult the material. One test applies veneer to
  such a design and asserts the same answer: two resolved, the woods untouched, the bare bodies
  bare. It costs about fifteen lines and it retires the argument permanently.

  > **Annotated 2026-10-08 (ADR 0152; the sentence above is kept): "offers everything" means every *finish*, not every
  > object.** The architect's ruling [relayed]. Any schema-valid finish still succeeds on an undeclared material; a value
  > `FinishSchema` refuses is refused by `setFinish` and `setGlobalFinish` on any material with `FINISH_NOT_OFFERED`, and
  > the design is unchanged. `designOffersFinish` is now one function in `design-material.ts` shared by both commands
  > (`6eef46c`); before that the two finish commands could succeed with a finish their own schema refuses. **The
  > architect's caveat, exactly: no record says a command's successful result always parses; this ruling is for finishes
  > only.** Not reachable by a customer (the panel draws no finish control on an undeclared material); an undeclared
  > material tier is reachable in a stored design [relayed]. The discharge test described above still stands.

### 6. The duplicated fixture stands, and drift is made loud inside each copy

`docs/best-practices/engineering-conventions.md` is explicit and predates this wave: *"no test
importing across a package boundary except through the target package's public entry point… A helper
needed by two packages either belongs to one of them and is imported publicly, or is duplicated."*
A domain package's `tests/support/` is not a public entry point, and publishing a test-only fixture
from `src/` to avoid the duplication would put test infrastructure in what ships — which the same
convention forbids two paragraphs earlier. `KITCHEN_L_DESIGN` is not a precedent for that: it is the
seeded design the application boots on, production code that tests happen to use.

**So: duplicate, and make the drift the owner is worried about fail loudly rather than pass
quietly.** Two literal `2`s that can part are the real risk, and the fix is not to share them — it is
to make each copy check *its own* against something public:

- Each copy asserts, in its own package's suite, that **exactly `FINISHES_RESOLVED_BY_VENEER` of its
  own placements wear a finish `materialOffersFinish(veneer, ·)` refuses.** That is not circular with
  `setMaterialTier` — the offer query is 6Q-a's, pinned separately by its own independently written
  expected-miss table — so a finish table that drifts in either copy fails in that copy's package,
  with no cross-package coupling.
- The pointer is made **symmetric**: the domain copy names the web copy the way the web copy already
  names the domain one. A one-directional pointer is how the second copy gets forgotten.
- 6Q-c reuses the web copy for its confirmation step and writes no third, which its own plan already
  requires.

## Alternatives considered

- **Give `setMaterialTier` a `BodyCatalog` and count correctly.** Rejected — decision 4, on four
  grounds, of which the shared input shape and the third `canFinish` authority are the two that do
  not expire.
- **Keep the hood wearing `veneer.nuc` and note the limitation in a comment.** Rejected on
  measurement, not on taste: the same file's MDF direction already asserts the command repainting and
  counting that hood, so the comment would document a behaviour a green test contradicts three
  screens further down.
- **Delete the hood from the fixture entirely.** Rejected — it is worth a row, bare: it pins that a
  frontless body arrives carrying nothing and leaves carrying nothing, which is the command's own
  rule applied to the case a reader will ask about.
- **Rebuild the fixture on an undeclared material tier so the whole document is reachable.**
  Rejected as the *primary* fixture, kept as a test: it makes the wave's headline destructive path a
  recovery-state document, and the command never reads the stored tier anyway, so the reachability it
  buys is not reachability of anything the command does. Decision 5 keeps the evidence and drops the
  distortion.
- **Add a third free colour so the two directions resolve 3 and 2 and the counts discriminate
  again.** Rejected as unnecessary: object identity on the untouched half already discriminates
  strictly harder than any count, and a third colour would restate that guarantee more weakly.
- **Exempt frontless bodies in `validate-design.ts`, which does hold a catalogue.** Rejected —
  decision 2d. It would make the write seam accept a document the product cannot write, and add the
  third authority by another door.

## Records swept before deciding, and how each is settled

Per the owner's standing instruction, checked before ruling.

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) decision 2 | The load seam resolves, the write seam refuses, and the ordering — strip, then resolve, then assert — is what keeps both true. | **The reason decision 1 holds.** Nothing here reorders it or adds to it; the fixture is corrected to match the ordering rather than the ordering being bent to the fixture. |
| ADR 0078 decision 5 | Absence is a legal state and stays absent; neither seam writes a `finish` key onto a placement that has none. | **This is what the corrected hood row asserts** (decision 2b), applied to the one body that can only ever be absent. |
| ADR 0078 decision 3 | An undeclared material id resolves nothing and refuses nothing; the state must keep loading. | **Decision 5's reachability discharge stands on it**, and the discharge test is a second reader of the same rule rather than a new one. |
| ADR 0078 decision 6 + its 2026-09-05 correction | `setFinish` refuses a finish the design's material does not offer; ten of fifteen (material, chip) pairs refuse until 6R. | **Untouched.** It is also half of decision 1's proof: the refusal is why a customer cannot paint a mixed document on a declared material. |
| [ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md) | Reset to the new material's default; once; one result; no stored design holds a finish its material does not offer. | **Unchanged.** This record moves no rule — it corrects a test fixture and the criterion that described it. |
| [ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md) decisions 1 and 4 | The confirmation's query takes the design and not the catalogue; the query's count and the effect's count are different numbers. | **Followed and generalised.** Decision 4 here is the same prohibition one wave earlier, so 6Q-b and 6Q-c now answer the catalogue question the same way instead of by coincidence. Not overturned in any part. |
| [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 2 | Severity is declared per code and total; `"mark"` iff the fact asserted is "past the end of its wall". | **Untouched** — decision 2d changes no severity and adds no code. |
| [ADR 0016](0016-hood-chimney-is-carcass.md) | The hood's chimney is carcass. | **Why `appliesTo` counts the hood** and why the criterion's *"never counted in the applies-to figure"* is the half that is wrong. |
| [ADR 0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md), [ADR 0050](0050-the-hob-oven-filler-is-a-finishable-front.md) | The hood is front-hung and frontless; `base-hob-oven` gained a finishable filler and is `canFinish: true`. | **Checked for a contradicting ruling and none found.** `canFinish` is a declared per-entry fact that has moved once, by a recorded decision — which is exactly why a third authority on it is refused. |
| [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md), as cited by 6P and 6Q | A load that refuses is a dead link. | **Scopes decision 2d.** The dead-link cost is a load-path cost; the write seam pays none of it. |
| [ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) | A stale stored tier is a reachable state; 6G's recovery path stands. | **Decision 5's discharge test is that state, used rather than merely tolerated.** No reconciliation is added. |
| [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1 | The domain imports no price book. | **Untouched.** Nothing here asks whether a tier exists; `availableTierIds` stays the caller's. |
| `docs/best-practices/engineering-conventions.md` (packages stay liftable; test helpers live in `tests/support/`) | A helper needed by two packages is imported through a public entry point or duplicated; test infrastructure never goes in `src/`. | **Both halves used, in the direction each argues** — decision 6. Duplication is the sanctioned answer here, not a compromise. |
| Wave 6P's close-out and 6Q-b item 3 | An unconditional property of the loaded document is not version-keyed; keying the `canFinish` strip at a version was the measured defect. | **The reason decision 1's first row is a guarantee rather than an observation:** the strip runs on every load at every version, including the one this build writes. |

Nothing found in the sweep contradicts this decision, and nothing here overturns a recorded one.

## Consequences

- **Wave 6Q-b's fixture criterion changes, visibly.** The milestone's *"five things at once"* block is
  corrected in place with the reasoning that moved it; *"not three, which would mean the hood was
  counted"* is struck rather than edited, because the number was reasoned and a reader who met it
  needs to find out what replaced it.
- **6Q-b's punch list gains two items and loses none** — the fixture correction and the reachability
  test — and its production files are unchanged at four. No implementation file moves.
- **The catalogue question is closed for the pair of whole-kitchen commands**, so 6Q-c and 6R inherit
  an answer instead of the question. A wave that wants to reopen it owes a new dated record naming
  what changed, not a code comment.
- **One class of criterion is now known to be writable wrongly**, and it is the class this milestone
  writes most often: a criterion that names one fixture and one number while the guarantee it
  describes lives at a different seam. The general form — *a fixture may construct any input the unit
  under test's own contract is defined over, and may not construct one to borrow another module's
  guarantee* — is decision 5 and applies past this wave.
