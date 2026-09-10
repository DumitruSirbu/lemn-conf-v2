# ADR 0086 — The confirmation counts chosen colours, is composed before any command, and only a different **declared** material owes one

Status: Accepted (decision 3's criterion amended 2026-09-07 -> [0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decision 7; decisions 1-2 stand)
Date: 2026-09-05
Type: Decision + Finding
Milestone: M6 — implements [ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md);
**corrects wave 6Q-c's presence condition and the scope of ADR 0081 decision 4's inequality**; binds
wave 6Q-c

## Context

[ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md) (2026-09-05)
rules the confirmation itself on the owner's words: a material change confirms **only when a chosen
colour would be lost**, the criterion is a per-cabinet comparison against the material's declared
default, and the count in the copy is the query's rather than the effect's. Wave 6Q-c's plan carries
that ruling into a dispatch.

Three things in it cannot be dispatched as written, and each was found by measurement rather than by
reading:

- **The presence condition is stated over id strings** — *"present iff a pending material is chosen,
  it differs from the applied one, and the count is above zero"* (6Q-c item 2). `applied.materialTierId`
  is legitimately `undefined` on a design that has never had a material applied, and `pending` is a
  book id the customer tapped. So *"differs"* is true for the pair `(undefined, "material.melamine")`,
  which is not a material change at all — and the confirmation would announce a loss the command
  then does not produce.
- **ADR 0081 decision 4's inequality is true only under preconditions nobody wrote down**, and the
  wave's own criterion generalises it past all of them: *"for every design satisfying the load seam's
  invariant and every declared target material, `chosenCount ≤ resolvedCount`"*. It is false on three
  reachable inputs, measured below — including on the **exact fixture the same criterion instructs
  the wave to reuse**.
- **"The count on screen is the query's, not the effect's" has no call site to guard.**
  `resolvedFinishCount` does not appear anywhere in `apps/web` (grepped 2026-09-05, `apps/web/src`:
  no match) and cannot: `setMaterialTier`'s effect is consumed inside `apply-command-result.ts` for
  the selection and the column map, the store's `setMaterialTier` returns `void`, and the
  confirmation is composed **before** any command runs, so the effect does not exist yet. The number
  that *is* in scope beside the chosen count, in the same function, is `appliesTo`'s body count —
  ~~14~~ **26** on the seeded kitchen (corrected 2026-09-05 — `KITCHEN_L_DESIGN` has 26 placements
  and `countBodies` sums every displayed entry across every group). That is the confusion this
  criterion should have been about.

This record rules the three, plus four smaller things 6Q-c needs an answer to before an implementer
can start: how the question is asked without applying anything, what a cancel writes, what the
confirm step does with the head and the figure, and which token sweep the new copy has to survive.

## The measurement

Run against `packages/configurator-domain/dist` on 2026-09-05, at `59f8669`.

**On the fixture 6Q-c is told to reuse** (`tests/support/mdf-kitchen-wearing-chosen-colours.ts` and
its web twin) — an MDF kitchen where `p0`/`p1` wear free colours and `p4`/`p5` wear the two veneer
woods:

```
chosenCount (against MDF's default #eceeeb) = 4
resolvedFinishCount (MDF → veneer)          = 2
resolvedFinishCount (MDF → MDF)             = 2
```

`4 ≤ 2` is false. The fixture does not satisfy the load seam's invariant and says so in its own head
comment — *"the product holds no such document"* — so this is not a defect in the fixture. It is a
criterion applied to an input its precondition excludes, on the one input the criterion names.

**On a load-seam-valid PAL kitchen** with a single cabinet deliberately set to *Antracit*, a decor
PAL offers:

```
chosenCount (against PAL's default pal.alb)  = 1
resolvedFinishCount (PAL → PAL)              = 0
```

`1 ≤ 0` is false. `material.melamine` is a declared target material and `setMaterialTier` deliberately
does not skip when the target equals the stored tier — *"setting the tier that is already set is not
a refusal"* and must not become a silent skip either.

**On a design carrying an undeclared tier** (`material.gone`), one cabinet wearing `pal.alb`, target
PAL:

```
chosenCount (ADR 0081 decision 1b: every carried finish) = 1
resolvedFinishCount (undeclared → PAL)                   = 0
```

`1 ≤ 0` is false, and this document **does** satisfy the load seam's invariant:
`findUnofferedFinishIssues` returns `[]` for an undeclared material (`validate-design.ts:138`,
ADR 0078 decision 3), so the invariant holds vacuously while the inequality does not.

## Decision

### 1. The inequality's preconditions are stated, and the criterion is replaced by one that can be run

ADR 0081 decision 4's relation is **true and useful**, and it holds exactly here:

> For a design **D** whose `materialTierId` resolves to a **declared** material **M**, where every
> finish D carries is one **M** offers, and for a **declared** target material **T ≠ M**:
>
> ```
> chosenCount(D) ≤ resolvedFinishCount(setMaterialTier(D, T))
> resolvedFinishCount − chosenCount = the number of cabinets sitting exactly at M's declared default
> ```

The proof is one line and it is worth stating, because it is what a fourth material would break:
ADR 0078 decision 1 makes the three materials' offers **disjoint**, so under `T ≠ M` no finish D
carries is offered by T, so `resolvedFinishCount` is the total count of finish-carrying placements,
and `chosenCount` is that same total minus the cabinets at M's default.

**Each precondition earns its place, and dropping any one of the three produces a measured
counterexample above:** M declared (the third measurement), every carried finish offered by M (the
first), and `T ≠ M` (the second).

**The wave's criterion is withdrawn as stated and replaced by two.** This is the same move
[ADR 0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) decision 6 made for
6Q-b's ordering criterion, for the mirror reason: that one could not fail, this one fails for a
correct implementation.

1. **The inequality, over the generated pair space, with its preconditions as the generator's
   constraints** — not as a filter applied afterwards, so a generator that stopped producing
   qualifying designs is visible. Both arms non-empty, and a **floor per arm**: at least one design
   where the difference is zero (nothing sits at the default) and at least one where it is positive.
2. **A literal, on the reused fixture, naming all three numbers.** `chosenCount = 4`,
   `resolvedFinishCount(MDF → veneer) = 2`, displayed body count ~~`= 14`~~ **`= 26`** — pinned as
   literals in one place, with a comment saying the fixture is deliberately outside the inequality's
   preconditions. A derived expectation agrees with whatever the implementation did; three
   pairwise-distinct literals are what makes "the copy used the wrong number" a failure.

   > **Correction — 2026-09-05.** The displayed body count is **26**, not 14: `KITCHEN_L_DESIGN` has
   > 26 placements and the projection carries all of them. This record exists precisely to pin three
   > pairwise-distinct literals against a mix-up, and it pinned a wrong one — the fact it was written
   > to guard against. Also corrects this record's other two mentions of the same figure (Context, and
   > "The confusable number is `appliesTo`'s" below — both corrected in place, same date), the
   > three-numbers table in `docs/milestones/M6-price-and-global-settings.md`'s 6Q-c section, this
   > file's own index row in `docs/decisions/README.md`, and the third illustrative mention in the
   > milestone file (*"tuturor celor 14 corpuri"*). **Not corrected here: the two source comments
   > citing it**, which are a developer's, not a scribe's, to fix.

### 2. The confusable number is `appliesTo`'s, and it is put out of scope rather than documented

**The effect's count is already unwriteable, by two independent constructions, and the wave's job is
to keep it that way rather than to add a device.** It is absent from `apps/web` altogether, and the
confirmation is composed before the command that would produce it exists. A criterion may assert
that; it may not assert it by a grep alone, which is the boundary check this project has shipped
twice while matching nothing (`docs/WORKFLOW.md`).

**The number that can actually be written by mistake is `countBodies(input.groups)`** — ~~14~~ **26**
(corrected 2026-09-05 — see the Context section's correction above) against the chosen count's 4,
both derivable inside `describeGlobalSettings`, both a number of cabinets, and a wave that reached for
the wrong one would still pass every other assertion in the suite.

So the confirm view is composed by a helper that **takes the count and not the input**:

```
toMaterialResetConfirm(chosenColourCount: number, …): MaterialResetConfirmView | undefined
```

`input.groups`, `input.pricing` and `input.rejection` are not identifiers inside it. This is
`toDepthGroupView(pendingDepthMm)`'s existing shape in the same file, applied for a stronger reason
than tidiness: the wrong number is not *discouraged* at the call site, it is **not in scope there**.

### 3. A confirmation is owed only when the material being applied is a **different declared material**

Not a different id string. Both sides resolve through `lookUpMaterial` (6Q-a's total lookup,
ADR 0078 decision 3), the applied side through `?? DEFAULT_MATERIAL_ID` — the same resolution
ADR 0081 decision 1 gives the query and `findUnofferedFinishIssues` gives the validator.

> ~~**`materialResetConfirm` is present if and only if** the pending choice names a **declared**
> material, that material is **not** the declared material the design is already on, and
> `chosenColourCount > 0`.~~

**Amended 2026-09-07 — [ADR 0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md)
decision 7.** The rule's shape is unchanged and the table below still holds row for row; two things
move once a **global** colour default exists. `chosenColourCount` is counted against the design's
**resolved** default — the global colour where one is set, `material.defaultFinish` where it is not —
because otherwise the confirmation fires for cabinets that merely match the kitchen's own colour,
which is the interruption this record exists to avoid. And a **second arm** is added: a confirmation
is also owed when `settings.finish` itself is set and the incoming material does not offer it, since
a design whose cabinets all follow the global colour has a chosen count of zero and would still lose
a colour somebody chose. Decisions 1 and 2 of this record are untouched.

| Applied | Pending | Confirms | Why |
| --- | --- | --- | --- |
| *(absent)* | *(absent)* | no | No material is being applied; `applyTierIfChanged` runs no command. |
| *(absent)* | `material.melamine` | **no** | `undefined` resolves to `DEFAULT_MATERIAL_ID`, which **is** melamine. The command runs and resolves nothing; a confirmation here announces a loss that does not happen. **This is the case the id-string comparison got wrong.** |
| `material.melamine` | `material.veneer` | yes, if the count is above zero | The ruled case. |
| `material.veneer` | `material.veneer` | no | Same material; `applyTierIfChanged` runs no command anyway, and this keeps the view honest independently of the component. |
| `material.gone` (undeclared) | `material.veneer` | yes, if the count is above zero | ADR 0081 decision 1b: every carried finish counts, and most of them will go. Over-warns in the corner where the target happens to offer one — the safe direction, decision 1's own argument. |
| anything | an id the book offers and the domain does not declare | **no** | The command's undeclared arm resolves nothing (ADR 0078 decision 3), so nothing is lost. Unreachable with today's book, whose three material tiers are exactly the three declared materials; ruled because ADR 0072 makes the book and the declaration free to part. |

**This asks `lookUpMaterial` and never `materialOffersFinish`.** The view decides *whether the
material changed*; the domain decides *what a chosen colour is*. The offer stays a single authority
(ADR 0078 decision 1) and the dialog re-derives none of it — the discipline ADR 0062 seam 1 imposes
on the price book, applied to the offer.

### 4. The question is a query. Not a dry run, not a speculative apply

`countCabinetsWearingAChosenFinish(design)` answers it (ADR 0081 decision 1). The two alternatives
are both rejected, and the second is the one an implementer will reach for because it looks like it
reuses shipped code:

- **A dry-run flag on `setMaterialTier`.** A boolean argument that decides whether a command commits
  is the flag argument `set-appearance.ts`'s head comment already refused once, and it makes one
  function both a command and a query — the split this repository's `CommandResult` shape exists to
  keep.
- **Calling `setMaterialTier` speculatively and reading the effect.** It is pure, so it would work,
  and it is still wrong three times over. It answers the **wrong question** — `resolvedFinishCount`
  counts every carried finish the target refuses, including the ones sitting at the current
  material's default, which is precisely the set the owner ruled is not worth interrupting for. It
  needs an `occurredAt` and an `availableTierIds` to ask a question that depends on neither, so a
  clock reading would be invented for a render. And it would tie the sentence on screen to the
  effect's number, which is the confusion ADR 0081 decision 4 exists to prevent, arriving through
  the door decision 2 above just bolted.

### 5. A cancel writes nothing, and that explicitly includes not clearing `lastRejection`

Stepping back from the confirm step — by the step-back action, by Escape, or by a scrim click —
leaves the pending choices intact and returns to the choosing step (ADR 0081 decisions 2 and 3). To
that, four fields, named because each is a thing an implementer could reasonably touch:

- **The stored document**: untouched. No command of any kind runs while the confirm step stands.
- **`selection`**: untouched. A whole-kitchen setting acts on no cabinet and carries the held
  selection through (`intendSelection`, `apply-command-result.ts:681`, wave 6E) — and here not even
  that runs, because there is no command.
- **`lastRejection`**: **untouched, and specifically not cleared.** It is cleared by a successful
  command and by moving the selection, and by nothing else (`configurator-store.ts:107`). A stale
  refusal is what makes the figure read *"De la neschimbat"* through `describeStartingLabel`, on the
  bar and on the sheet that covers it; clearing it from a dialog step would silently change a
  number's label because the customer opened and dismissed a confirmation. Cancel is not a refusal
  and is not routed through one either (ADR 0081 decision 7).
- **The sheet's open state**: on the confirm step, Escape and the scrim step **back**, one step, and
  do not close the sheet. Two presses of Escape leave it — each dismisses the topmost thing, which is
  the rule `price-breakdown.tsx` already records. The choosing step's *Renunță* still closes the
  sheet, unchanged.

### 6. The confirm step takes the head's title and drops `appliesTo`, the figure and the overflow warning

ADR 0081 decision 3 replaces the sheet's **body and footer** in place. That leaves the head, and the
head renders *"Se aplică tuturor celor 14 corpuri"* directly above a confirmation that says *4
corpuri*. **Two different counts of cabinets, on one screen, about one action** — decision 4 of
ADR 0081 in visual form.

So on the confirm step: the head's `<h2>` carries the confirmation's title, the `appliesTo` line is
not rendered, and the footer's figure and the overflow warning go with the footer they are part of.
`aria-labelledby` keeps pointing at the same heading element, so the dialog's accessible name follows
the step rather than staying *"Setări pentru toată bucătăria"* while the screen asks a destructive
question.

The estimate is not what this step is about, and a running total beside *Schimbă materialul* invites
the reading that the price is what changes.

### 7. The copy, drafted and **pending owner review**, and the two sweeps it must survive

Marked `// Ruled 2026-09-05, pending owner review.` — the standing direction of 2026-09-04 for a
string that carries its meaning now and has not been approved.

```
materialResetConfirm: {
  title:   "Culorile alese se pierd",
  body:    (chosenCount) =>
    `Ai ales alte culori pentru ${chosenCabinetPhrase(chosenCount)}. Fiecare material are
     propriile culori, așa că toate revin la culoarea implicită a materialului nou.`,
  confirm: "Schimbă materialul",
  back:    "Păstrează culorile",
}
```

**Neither action says *OK* and neither says *Anulează*.** Both name their outcome, which is what
makes a confirmation readable when it is dismissed by muscle memory: the destructive action names the
change, the safe one names what is kept.

**`chosenCabinetPhrase` is a module-level helper beside `everyBodyPhrase`, not an inline branch.**
ADR 0081 decision 4's last paragraph; `starting-price.adversarial.test.ts` sweeps a composing
template's **source body**, so `(n) => n === 1 ? … : …` fails on the `1` in its own condition. It
reuses `pluraliseBodies`, so a count of twenty and above takes *"de corpuri"* by the rule already
written. **Amended 2026-09-10 — the owner ruled *"without «de» on plural"*, so the `other` band now
takes the bare noun at every count and this sentence no longer describes the shipped copy.** The
helper's structure is unaffected; only the word it selects changed. See
`docs/i18n/ro-catalogue-notes.md`.

**Two sweeps, not one, and ADR 0081 names only the first.** Every leaf of `ro.globalSettings` is
swept for `/\d/` **and** for `SUM_CLAIM_PATTERN` — `total|sum[aăe]|adun|egal|+|=`, case-insensitive
(`apps/web/tests/support/ruled-price-copy.ts`). So a natural Romanian phrasing of this very
sentence — *"în total 4 corpuri"* — fails on both counts, and *"toate"* passes only because it is not
*"total"*. Recorded because the trap is invisible when reading the copy and obvious when the gate
runs.

**Comma-below diacritics** (U+0219 `ș`, U+021B `ț`), never the cedilla forms that render almost
identically, asserted the way `ro.price.overflowingTotalWarning` already is — with a positive
control, so the assertion cannot pass by finding nothing to judge.

### 8. What this does not change

- **ADR 0081 decisions 1, 2, 3, 5, 6, 7 and 8 are untouched.** The criterion, the blocking apply, the
  one-dialog-two-steps shape, `materialWarning` standing unchanged, the command staying a single
  command, the refusal channel staying out of it, and the depth control keeping no confirmation.
  Decision 4's *statement* is unchanged; what this record adds is the preconditions it is true under
  and the criterion that can be run.
- **ADR 0078 decisions 1 and 3–6, ADR 0084 and ADR 0085 are untouched.** No new authority on the
  offer, no `BodyCatalog` on any whole-kitchen input, no new `DesignValidationCode`, no normalisation
  and no guard.
- **No schema bump, no stored field, no migration.** Nothing here reaches persistence.
- **`docs/BACKLOG.md` entry 31 stays open and adjacent.** The confirm step adds a second action that
  can throw inside the sheet; the ruling that such a throw is not routed to `lastRejection` (2026-09-05)
  covers it, and closing the entry is not this wave's.

## Alternatives considered

- **Brand the count's type** (`ChosenColourCount = number & { … }`) so `countBodies`' answer will not
  compile into the confirmation. Rejected: it introduces nominal typing to a codebase that has none,
  it would have to spread to `ro`'s template parameter to bite at all, and decision 2's scope
  narrowing achieves the same thing with an existing convention from the same file. A brand also
  answers only the compile-time half; the pairwise-distinct literals answer both halves.
- **Keep the id-string comparison and accept the false confirmation on `(undefined, melamine)`.**
  Rejected: it is a modal announcing a loss that provably does not occur, which is the exact failure
  mode ADR 0081 rejected *"confirm on every material change"* to avoid — a dialog that is sometimes
  about nothing is a dialog that is always dismissed.
- **Make the presence condition ask what the target would refuse**, so the confirmation is exact even
  on an undeclared current material. Rejected: it puts a second reader of `materialOffersFinish`
  behind the dialog and makes the surface re-derive the offer, and the residual imprecision is an
  over-warn in a state ADR 0072 already treats as a recovery path rather than a normal one.
- **Keep `appliesTo` visible on the confirm step**, since it is true of the change being confirmed.
  Rejected on decision 6's measurement: two different cabinet counts on one screen, four lines apart,
  about the same button.
- **Clear `lastRejection` when the sheet's confirm step is dismissed**, on the reasoning that the
  customer has interacted since the refusal. Rejected: it is a write, cancel writes nothing, and it
  would move a price label as a side effect of dismissing an unrelated dialog.
- **Run the inequality as a property with the preconditions applied as a `filter` after generation.**
  Rejected as a shape rather than as a rule: a filter that rejects every generated case leaves a
  property that passes vacuously, which is the third instance of this project's own recorded failure
  mode. Constrain the generator and assert a floor per arm.

## Records swept before deciding, and how each is settled

Per the owner's standing instruction, checked before ruling.

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md) | The confirmation is conditional on a chosen colour; it blocks; one dialog, two steps; the count is the query's; `materialWarning` unchanged; no refusal channel; the depth control is untouched. | **Implemented, not amended.** Decision 4's inequality gains the preconditions it is true under (decision 1 here) and its "two counts must not be confused" gains a call-site shape (decision 2). Everything else stands verbatim. |
| [ADR 0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) | The offer is one query derived from the control's shape and the three offers are disjoint; an undeclared id resolves and refuses nothing; absence stays absence. | **All three used and none touched.** Disjointness is what makes decision 1's proof one line; decision 3 above is the undeclared rule applied to a *view* for the first time; absence is why an unfinished body and a hood never count. |
| [ADR 0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) decision 6 | A criterion no test can fail is not a criterion; withdraw it and replace it with falsifiable ones. | **Followed, in the mirror case.** 6Q-b's criterion could not fail; 6Q-c's fails for a correct implementation. Both are withdrawn explicitly and replaced rather than quietly reworded. |
| [ADR 0084](0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md) | `canFinish` belongs to the load seam and `carriedAppearance`; a whole-kitchen setting asks the catalogue nothing; the duplicated fixture stays duplicated. | **Obeyed.** The query takes the design and no catalogue, for decision 4's own reason — a third authority on `canFinish`. Both fixture copies are imported as they stand; neither is widened. |
| [ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md) decision 3, as amended | The warning precedes the apply, on **both** viewports, and is now conditional and blocking. | **Untouched, and it is why the visual gate is on both shells** rather than only at 390 × 844. |
| [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1 | The domain imports no price book; the store names none. | **Obeyed and extended by analogy in decision 3**: the dialog reads `lookUpMaterial` and never the offer, so the offer keeps one author. |
| [ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) | A stored tier the book no longer offers keeps loading; 6G's recovery path stands. | **Why decision 3's last two rows exist.** The book and the declaration are free to part, so a pending id the domain does not declare is ruled rather than assumed away. |
| [ADR 0082](0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md) decisions 1, 6 and 8 | Nothing may leave the viewport at any supported size; one containment rule for both shells; a tappable box is at least `var(--touch-target)`, 44 px. | **Inherited as the confirm step's visual criteria.** The step adds two new actions to a surface that record measured. |
| [ADR 0023](0023-touch-compatibility-clicks-reach-the-sheet.md) | A touch on the canvas was also pressing the sheet. | **A verification item**, as ADR 0081's own sweep already flagged: the confirm action is a new tappable target at 390 px over a live canvas. |
| [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 | Every body adapts to a depth change with no confirmation step. | **Untouched.** Named again in the wave's *must not do*, because a second confirmation added by symmetry is the obvious over-reach here. |
| `DEVELOPMENT-SPEC.md` §10.1 | One implementation for both viewports; the only permitted fork is layout, in CSS. | **Obeyed.** One model, one markup, one set of strings; the confirm step is a state of the existing dialog, not a second component per shell. |
| Wave 6Q-c's plan, items 1–5 and its criteria | The query, the composition, the one dialog, the gated apply, the copy. | **Items 1, 3, 4 and 5 stand.** Item 2's presence condition is corrected by decision 3; the inequality criterion is replaced by decision 1; the *"count on screen is the query's"* criterion is re-aimed by decision 2. |

Nothing found in the sweep contradicts this decision. The one criterion it overturns — 6Q-c's
inequality as generalised — is overturned here on three measurements rather than in a milestone edit.

## Consequences

- **Wave 6Q-c is dispatchable.** Its plan is updated in
  `docs/milestones/M6-price-and-global-settings.md` to carry decisions 1–7 as work items and
  criteria.
- **The three numbers are named once, in one test file, as literals**: 14 displayed bodies, 4 chosen
  colours, 2 finishes resolved by veneer. A later wave that changes the seeded kitchen moves all
  three and will be told so by name.
- **A fourth material breaks decision 1's proof, not its statement.** Disjointness is what makes
  `chosenCount ≤ resolvedCount` provable; a fourth material sharing a palette entry with a third
  would keep the inequality true only where the shared entry is not the default. The property is
  generated from `MATERIALS`, so such a material enters the sweep by being declared — which is where
  it should fail, loudly, rather than in the copy.
- **The copy is two strings and two labels more, pending owner review**, and the wave ships them
  drafted rather than blocking on approval.
