# M10 — C4 sheet message rework (waves C4a and C4b)

**Status:** planned 2026-11-10 by the architect; **built and closed 2026-11-10** (C4a `ac81cdad`, C4b `21eb9c7a`, review round `097c9989`, merged locally; evidence and residuals in the parent milestone's *C4 wave merged and CLOSED* block). The text below is the plan as written. Parent milestone:
[`M10-price-dashboard.md`](done/M10-price-dashboard.md), branch `m10-price-dashboard`.

**Evidence tiers.** This plan uses three labels:

- **[src]** is source-verified at the line quoted, read at the working tree of 2026-11-10 (HEAD `7f5f8580` plus
  uncommitted docs).
- **[doc]** is doc-quoted.
- **[inf]** is inference.

The architect ran no gate and no test.

## 1. Goal

Bring the dashboard's forced-replacement sheet (C4) to the **owner ruling of 2026-11-10**:

> In the replacement sheet (C4), when a forced replacement of a switched-off or vanished material happens, the sheet
> **only says that the material and its colours are not available and that the customer must choose another**. There is
> **no** "Culoarea a revenit la …" line (C4C) and **no** confirmation before the change. The settings sheet keeps ADR 0081
> whole.

The source is ADR 0081, *Amendment 2026-11-10* [doc]. It is uncommitted in the working tree.

Q5b was built to the superseded proposal of 2026-11-09, so this plan reworks it. The plan also carries one unrelated copy
change from the same ruling batch: the Russian settings pill "Выбери материал" becomes "Материал" (M10 *Owner rulings of
2026-11-10*, item 3 [doc]).

## 2. Scope

**In scope**

- Remove the reset announcement from C4. That covers both the C4C line and the row-value form described in §4 D2.
- Add the one sentence the ruling asks for, while a material row is owed.
- Delete the copy and plumbing the reset line leaves dead.
- Change the Russian pill leaf.

**Out of scope**

These are not folded in, under scope discipline (`WORKFLOW.md`, *Scope discipline*):

- **Q5d's dead `announcement` / `unavailableAria`.** It has its own pin: `qa-m10-q5d-unread-announcement.test.ts`.
- **The `withoutPriceSentence` cut.** That is a T-lane follow-up.
- **The C4BD rail and the other frame deviations.** The owner accepted them as built.
- **OQ-11g and OQ-11h approvals.**
- **Any change to the settings sheet.**

## 3. Sweep of the records, before deciding

| Record | What it says | Settled how |
| --- | --- | --- |
| ADR 0081 d2, d3 (2026-09-05) | A material change that would discard a chosen colour confirms first, blocking. | **Narrowed for C4 only** by the 2026-11-10 amendment: no confirmation in C4. The settings sheet keeps them. Unchanged by this plan. |
| ADR 0081 d6 | The consequence is never shown as a note after the apply. | **Restored for C4.** The 2026-11-09 proposal narrowed d6 and is superseded. The C4C reset line goes, and so does its row-value form (D2). |
| ADR 0081, Amendment 2026-11-09 | Proposed an after-the-fact "Culoarea a revenit la …" line. | **Superseded** by the 2026-11-10 amendment [doc, ADR 0081:266-270]. |
| ADR 0178 A-16 (2026-10-26) | "announced ("Culoarea a revenit la …", C4C)". | **Pointer written** (uncommitted; ADR 0178:616-622 [doc]). The rest of A-16 stands: one row, replaced at every level, no ADR 0086 confirmation. |
| ADR 0057 d3 | The consequence is stated **before** the apply. | **Served** by the new sentence (D1). It is stated before any choice and needs no confirmation. |
| ADR 0081 *A consequence…*, owner-confirmed 2026-09-05 | A kitchen with no stored colour repaints silently. | **Kept.** The new sentence is static, so nothing is announced after the apply. |
| M10 plan, *Q5 split* ruling 2 and ruling 4's "names the colour it reverted to"; Q5b acceptance bullets "ruling 2" and "Q5-a in the browser: C4C's reset line" | The announcement and its trigger. | **Superseded** by this plan. The scribe marks them (§9). |
| ADR 0095 d2, layer 4 | Russian is an agent draft and is never pinned by literal. | Obeyed. RU leaves are not added to the copy lock. |
| ADR 0104 d3 | Frame 2A's 150 px pill cap is the owner's rung-4 floor. | **Untouched.** The Russian fix shortens the string; it does not change the cap. |

Nothing found contradicts the ruling.

## 4. Architect decisions

Each decision below is **[inf]** until the coordinator accepts it, and the owner may overturn any of them.

### D1 — The sentence is a single static note in the sheet, shown exactly while a material row is unresolved

**The rule.** A new view field, `materialNote: string | undefined`, is set when `live` holds a `material` item, and is
`undefined` otherwise. It is drawn as its own `<p>` inside the dialog, directly after the lead paragraph
(`replacement-body`) and before the rows. Its test id is `replacement-material-note`.

**What it does not depend on.**

- It is not conditional on a stored colour. The owner's sentence is unconditional, and ADR 0078 d1 makes every declared
  palette disjoint: a material's colours go with it.
- It is not tied to whether the material can be named. A vanished tier gets the same sentence.

**Why a note, and not the material row's status text.** A vanished tier's row has no status text: the generic line takes
its place (`replacement-sheet-model.ts:310-311` [src]). So a row-level wording would be missing exactly on the vanished
path.

**Why not an `infoLines` entry.** That list is the accessories' removal lines. Three tests read
`replacement-info` as a single element [src: `q3d-replacement-sheet.dom.test.ts:190`, `qa-m10-q3d-settling…:721`,
`qa-m10-q3d-gate-and-modal…:567`].

**Alternatives rejected.**

- Make the note conditional on ADR 0081's chosen-colour predicate. That would bring back a trigger the owner removed.
- Name the material in the sentence. That cannot be done for a vanished tier, and the row already names it.

**Side effect [inf, falsified by the visual pass].** The note also gives the waiting colour row its missing reason. That
row has had no text since Q5b (M10 *Q3d, e2e rewrite…* block, "copy gap" [doc]).

### D2 — A colour row cleared by the material's reset is drawn resolved with no value

**The problem.** `nameNowApplying` names a resolved colour row through `nameOfColourInPlaceOf`. Its fallback branch is
`defaultColourOfMaterial(design) ?? design.settings?.finish` (`replacement-sheet-model.ts:469-472` [src]). That branch
names the colour the material returned the kitchen to: "Alb", "Stejar", or MDF's hex "#eceeeb". This is the reset
announcement in row form. Deleting only `colourReverted` would leave it standing.

**The ruling.** A resolved colour row's value is one of three things, and nothing else:

1. **the customer's own choice**, through `chosenName`; or
2. **the row's own colour, named as it was**, while the design still stores it (availability came back; the first branch,
   kept); or
3. **nothing**: no `replacement-row-value` node.

It is **never** the new material's default colour.

**Precedent.** Q5b's recorded departure: a resolved handle row the design no longer stores shows no value (M10 *Q5b, Q5d,
R4c1 merged* block [doc]).

**Alternative.** Do not draw a reset-cleared row at all. This is not chosen now: it changes `rememberRows`, which
deliberately keeps a row drawn once shown, and the no-dead-end property. The owner may pick it at the visual pass; it would
be its own wave.

### D3 — C4C keeps the customer's own change lines

**What stays.** `changedMaterial`, `changedHardware`, `changedColour` and `changedHandle` keep their order. The price
sentence is still said once, on the last line. Accessory lines and `alsoUpdated` follow, as now.

**Why.** The ruling names the reset line only. "Only says" is read as replacing the announcement, not as removing the
confirmation of a choice the customer made. **[inf: the reading of "only"]** If the owner meant no C4C at all, that is a
new ruling.

### D4 — `replacementSheet.changedColour` (T5, OQ-11h) is not dead copy

`CHANGED_LEAF.finish` reads it (`replacement-sheet-model.ts:111` [src]) for a lone switched-off colour row the customer
chooses. That is a choice, not a reset, and the ruling does not touch it. It stays, and OQ-11h stays open for approval.

ADR 0081's amendment flagged it as "may be dead copy". The scribe closes that flag (§9).

## 5. Copy

### New leaf: `replacementSheet.materialAndColoursUnavailable` (wave C4a)

| Locale | Text | Status |
| --- | --- | --- |
| ro | `Materialul și culorile lui nu mai sunt disponibile. Alege alt material.` | Drafted from the owner's words, **not approved**. Copy lock entry marked `Drafted` under **OQ-11i** (new; verified unused 2026-11-10 by `grep -rn "OQ-11i" docs`, no hit). |
| ru | `Материал и его цвета больше недоступны. Выбери другой материал.` | **Agent draft**, unapproved (ADR 0095 d2). Never pinned by literal. |

The leaf obeys the M10 copy sweeps:

- no digit, no "inclus", no plural (`tests/i18n/m10-copy-rules.test.ts`, `m10-copy-grammar-and-lifecycle.adversarial.test.ts`
  sweep the whole `replacementSheet` namespace [src]);
- the informal "Alege", like the rest of the sheet.

### Removed leaf: `replacementSheet.colourReverted` (wave C4b, in the same commit as its last reader)

It is removed from all four places that hold it:

- `ro.json:1933`
- `ru.json:1933`
- `ro.d.json.ts:1936`
- the copy lock, `tests/support/approved-romanian-messages.ts:2576` [src]

No golden-output hash or count moves: the leaf is read through `resolveReplacementSheetCopy`, not `content.ts`, and
`golden-output-hashes.ts` holds no entry for it [src: grep, no hit].

### Changed leaf: `replacementSheet.headerMaterialToChoose` in `ru.json:1923` only (wave C4a)

- **Change:** "Выбери материал" → "Материал". This is the owner's own wording, as relayed.
- **Romanian:** "Material de ales" is unchanged.
- **Tests:** nothing pins the Russian literal. The three Russian tests read the leaf from `ruMessages`
  [src: `qa-m10-q5c-pill-material-owed.adversarial.dom.test.ts:356`, `settings/qa-m10-q5c-pill-material-owed.adversarial.test.ts:396-401`].
  Golden hashes are Romanian-rendered, so none moves.
- **Known semantic loss [inf]:** the owed pill no longer says "to choose" in Russian. The resolved pill renders the bare
  tier name (`globalSettings.pillMaterial` is `{tierName}` in `ru.json:344` [src]), so the two states stay distinct. The
  difference is "Материал" against a tier name. This is the owner's call, and is recorded rather than blocked on.

### How copy moves in lockstep with the copy lock

- `romanian-copy-lock.test.ts` deep-equals `ro.json` against the lock. So **the implementer edits the lock in the same
  commit as `ro.json`**. That is T5's precedent: the lock is the wording corpus, not a behaviour pin.
- `ro.d.json.ts` is regenerated by next-intl, or edited to match, in the same commit.
- `catalogue-parity` must stay green, so ro and ru keys move together.

## 6. Waves and slices

**Order:**

1. C4a, then C4b. The new leaf lands before any code reads it, and the old leaf goes in the same commit as its last
   reader. **No intermediate commit is red on `romanian-copy-lock` or `catalogue-parity`.**
2. Both waves branch from the tip **after** the coordinator's running `ci:local` and the staging clean-up finish. That
   freezes the tree (`agent-coordination.md`).

| Slice | Must-fix items (≤ 5) | Production files | Tier | Reading |
| --- | --- | --- | --- | --- |
| **C4a** copy | (1) Add `replacementSheet.materialAndColoursUnavailable`: RO as §5, RU as §5 marked as an agent draft. (2) Copy lock: add the RO leaf with a `// Drafted, not approved: … (plan m10-c4-sheet-message-plan; OQ-11i). The Russian is an agent draft.` comment. (3) `ru.json` `replacementSheet.headerMaterialToChoose` → "Материал". (4) Regenerate `ro.d.json.ts`. | `apps/web/src/messages/ro.json`, `ru.json`, `ro.d.json.ts`; copy lock (wording corpus). **Three** | **Light** (a visible ru string): QA, then one combined reviewer, who is the visual reviewer of the ru pill at 390 × 844. T5's "Light, copy only" precedent applies to the unread leaf. | This plan §1, §5; ADR 0081 Amendment 2026-11-10; ADR 0095 d2; ADR 0104 d3; the copy-lock header (`approved-romanian-messages.ts:1-6`) and its `replacementSheet` block (`:2540-2585`); `tests/i18n/m10-copy-rules.test.ts`; `catalogue-parity.test.ts` |
| **C4b** code | (1) Remove the reset line: delete `colourRevertedBy`, `isAnyStoredColourDifferent`, `isSameStoredColour` and `copy.colourReverted`; `describeConfirmationLines` loses `revertedColour`. (2) Remove the `revertedColour` plumbing from `replacement-sheet.tsx` (`commitChoice`, `AppliedChoice`, `recordChoice`, the import) and `use-price-notice.ts` (`AwaitedReplacement`, `ReplacementOutcome`, `:328`). Correct every comment that still describes the reset line, using the stepdown and comment rules. (3) D2: `nameOfColourInPlaceOf` keeps its first branch and answers `undefined` otherwise. Delete `defaultColourOfMaterial` and the `lookUpMaterial` import if no reader remains. (4) D1: `materialNote` on `ReplacementSheetView`, drawn after `replacement-body`, reading the new leaf. Reuse an existing sheet style class if one fits; add a class only if none does. (5) Delete the `colourReverted` leaf from ro, ru, `ro.d.json.ts` and the copy lock. | `price/replacement-sheet-model.ts`, `price/replacement-sheet.tsx`, `price/use-price-notice.ts`, `price/replacement-sheet.module.css` (only if needed), messages ×3; copy lock. **Four code files plus messages**, stated | **Full** (logic and clean-code) **+ visual**. It carries A-16 and ADR 0081 in both directions, which is Q5b's recorded upgrade reason. | This plan (all); ADR 0081 whole, with both amendments; ADR 0178 A-16 and its 2026-11-10 pointer; ADR 0057 d3; M10 plan *Q5 split* rulings 1, 2, 4 and 7, and the Q5b acceptance (§9 marks which are superseded); `replacement-sheet-model.ts:108-178, :213-320, :452-527, :790-840`; `replacement-sheet.tsx:180-420, :540-570`; `use-price-notice.ts:60-100, :300-335`; `replacement-sheet-colour-handle*.test.ts` (read only, to see what flips) |

**What the implementer does not do.** The C4b implementer does **not** edit the behaviour tests in §7. They go red, or
fail to compile, by design, and QA flips them.

**The implementer's own gate:**

- `tsc` over `apps/web/src` is clean;
- `eslint` is clean over `apps/web/src`;
- `vitest` is green **except** the files listed in §7.1, which the implementer reports by name with their red counts.

The coordinator does **not** bounce C4b for those reds alone.

**The C4b implementer's commit uses `--no-verify`, and says so.** Lint is type-aware over the tests too. The root
`eslint.config.mjs` applies `strictTypeChecked` with `projectService: true` to `**/*.ts`, `**/*.tsx` (`:390-398` [src]).
So the §7.1 files, which import the deleted `colourRevertedBy` and read `copyRo.colourReverted`, fail `pnpm lint`. The
pre-commit hook runs that, and a lint error aborts the commit (`WORKFLOW.md` step 6).

- WORKFLOW permits `--no-verify` on an intermediate commit, and requires it to be named. The implementer's report names
  that commit as one whose lint state was not observed.
- **The implementer must never make the hook pass by editing a §7.1 test.**
- QA's flip commit is the first commit that runs the hook green. The wave's closing commit never skips it.

## 7. Tests that pin the old behaviour (QA flips them; the implementer does not edit them)

All references are **[src]**, and the line numbers are the `it`/`describe` title lines at the working tree of 2026-11-10.

### 7.1 Expected red after C4b, the exact list for the QA dispatch

**`apps/web/tests/support/replacement-confirmation-lines.ts`**

- `reverted()` (`:25-31`) reads the deleted leaf. Delete it, and any import of it.

**`apps/web/tests/price/replacement-sheet-colour-handle-model.test.ts`**

- `:22`, the import of `colourRevertedBy`.
- `:105` "names the colour a material change returned the kitchen to, for a row the reset cleared". **Flip** to D2: the row
  is resolved and `valueText` is `undefined`.
- `:313` describe "the colour a material change reset" (`:325`, `:340`, `:360`, `:372`). **Delete**: the function is gone.
  Replace it with the D2 must-not property (§8, C4b-3).
- `:433` "runs in the mockup's order: material, the colour it reset, …". **Rewrite** without the reset line.

**`apps/web/tests/price/replacement-sheet-colour-handle-model.adversarial.test.ts`**

- `:28`, the import.
- `:196` property "the price sentence is said once". **Drop** the `revertedColour` arbitrary (`:213-242`).
- `:270` "puts the reset line straight after the material line…". **Delete**, or flip to "no reset line in any order".
- `:367` describe "the colour a material change reset, through the MDF default" (`:379`, `:402`, `:417`). **Delete**. The
  MDF arm moves into D2's must-not: no row ever reads `#eceeeb` after a material reset.

**`apps/web/tests/price/replacement-sheet-colour-handle.dom.test.ts`**

- `:240` "shows the colour row resolved by the material change, naming the colour it returned to, and announces the reset
  after the material line". **Flip**: the row is resolved, has no value node and no control, and C4C reads exactly
  `[stem(changedMaterial), …]` with no reset line.

**`apps/web/tests/price/replacement-sheet-colour-handle.adversarial.dom.test.ts`**

- `:382` "turns the colour row … into a resolved row naming where it went". **Flip** to D2.
- `:426` describe "the reset line, arm by arm":
  - `:472`, `:484`, `:527` and `:540` assert the line. **Flip** each to "no reset line", and keep each arm's fixture: global
    colour only, cabinet colour only, MDF, and with hardware.
  - `:444` (no question before the apply) stays and must stay green.
  - `:498` and `:509` stay green; retitle them, because "silent" is now true of every arm.
- `:625` "keeps the line that the colour went back after a later press that resets nothing". **Delete**: its premise is
  gone.

### 7.2 Must stay green, untouched (the ADR 0081 other direction and the unaffected arms)

**The settings sheet still confirms:**

- `tests/settings/material-change-in-settings-still-asks-before-resetting-colour.dom.test.ts`
- `material-reset-confirm.test.ts`
- `material-reset-confirm.adversarial.test.ts`
- `global-settings*.test.ts`
- `tests/e2e/global-settings-apply.e2e.spec.ts`
- `global-settings.e2e.spec.ts`

**Availability came back (D2 branch 2):**

- `replacement-sheet-colour-handle-model.adversarial.test.ts:313`
- `replacement-sheet-colour-handle.adversarial.dom.test.ts:780`

**The rest:**

- The handle arms: `…model.adversarial.test.ts:329-363`.
- The colour chosen by the customer: `…model.test.ts:132`, `…dom.test.ts:306`, `:341`.
- The no-dead-end and waiting properties: `…model.test.ts:481`, `…model.adversarial.test.ts:678`.
- The Q3d tier-row tests.
- `qa-m10-q5d-*`.

### 7.3 C4a

**Expected red: none.** The ru literal is not pinned. If any test goes red on "Материал", it is a **test-fidelity
finding**: a literal was pinned against ADR 0095. Report it; do not flip it silently.

## 8. Acceptance criteria

### C4a

1. `ro.replacementSheet.materialAndColoursUnavailable` equals the §5 RO text. The lock holds it under a `Drafted …
   OQ-11i` comment, and `romanian-copy-lock.test.ts` is green.
2. `ru.replacementSheet.materialAndColoursUnavailable` exists and is not the RO text. **Must-not:** the RU text appears in
   the copy lock or in any test as a literal.
3. `ru.replacementSheet.headerMaterialToChoose === "Материал"`. **Must-not:** the RO leaf changes; the 150 px cap or any
   pill CSS changes.
4. **Visual check of the ru pill.** It runs at 390 × 844 on a kitchen whose material is owed: the vanished-tier path under
   `CI=1`, `/ru` (§10).
   - **Pass:** the pill label's `scrollWidth ≤ clientWidth`, with the counter drawn.
   - **Fail:** "Материал" still clips.
5. `catalogue-parity`, `m10-copy-rules` and `m10-copy-grammar…` are green, and the golden-output hash file is
   byte-identical to its base. Check with `rtk proxy git diff --exit-code` on it.

### C4b

1. **No reset line, anywhere.**
   - `rtk proxy git grep -n -e colourReverted -e revertedColour -e colourRevertedBy -- apps/web/src apps/web/tests`
     returns nothing.
   - `colourReverted` is absent from `ro.json`, `ru.json`, `ro.d.json.ts` and the lock.
2. **D2, as a property** (fast-check, over generated kitchens and each declared material as the replacement):
   after a material row is resolved by the sheet's own material choice, none of the following contains the new
   material's default colour name, nor `#eceeeb`:
   - (a) the `replacement-row-value` node of any resolved colour row that no customer colour choice in this sheet
     resolved and whose colour the design no longer stores;
   - (b) any C4C line other than a `changedColour` line for a colour the customer chose in this sheet.

   **Scope is deliberately narrow.** The colour chooser's options, an owed colour row's own name, and tier descriptions
   may legitimately contain "Alb". The undeclared-old-material arm ends on PAL with a colour row still owed, whose chooser
   offers PAL entries. So the property must not read the whole sheet's text.

   - **Sabotage:** restore the fallback branch at `:469-472`, and the property goes red on the MDF and PAL arms.
3. **D2 row shape.** A reset-cleared colour row has `data-resolved="true"`, no `replacement-row-value` node, and no
   control. A colour row resolved because availability came back still names its own colour.
4. **D1 shown exactly while a material row is unresolved.** `replacement-material-note` shows the leaf exactly when `live`
   holds a material item. The cases:
   - a named switched-off tier;
   - a vanished, unnamed tier;
   - a kitchen with no stored colour;
   - with and without a waiting colour row.

   The note sits inside the dialog, after `replacement-body` and before the first row, as readable text (not
   `aria-hidden`).

   **Must-not:** the note shows for a lone colour row, a lone handle row, a hardware-only or accessory-only sheet, or after
   the material row resolves while other rows remain. Write it as a property over owed sets: the note is present if and
   only if an unresolved `material` item is in `live`.
5. **No confirmation in C4.** One press on "Aplică" for a material makes exactly one store commit and opens no second step,
   dialog or `global-settings-confirm`. The existing `:444` and `…dom.test.ts:286` tests prove it.
6. **The settings sheet keeps ADR 0081.**
   - A voluntary material change that would discard a chosen colour still confirms before it.
   - After it, no line names the reset.
   - §7.2's settings pins are green, unedited. Show this with `rtk proxy git diff --stat <base>..` over
     `apps/web/tests/settings`, which lists none of them.
7. **C4C otherwise unchanged (D3).**
   - The lines run in this order: material, hardware, colour, handle, accessories, then `alsoUpdated`.
   - The price sentence appears once, on the last change line.
   - Two colours give two lines.
   - A single change is the approved leaf whole.
8. **e2e, with no new test** (the shard budget is fixed at eight desktop shards, `4f39d97f`). QA adds assertions inside the
   existing `tests/e2e/support/replacement-sheet-journey.ts` journey:
   - the note is visible while the vanished material row is owed;
   - after the choice, `replacement-confirmation` contains the material change line and no other line about a colour.
     That holds whatever the seeded world does with `alsoUpdated` or accessories.

   **Must-not:** `e2e-shard-budget` changes.
9. `tsc`, `eslint`, the whole `apps/web` vitest, and `pnpm format:check` whole-tree all pass on the merged tree, quoted
   under `rtk proxy` (R9).

## 9. Records the scribe writes (after C4b's merge, not before)

### ADR 0178 A-16 pointer

It is **already written**, uncommitted (ADR 0178:616-622 [doc]). The scribe only checks that it lands in the docs commit,
and adds no further text.

### ADR 0081 — append a dated closing note under the 2026-11-10 amendment

The exact text, with the hashes filled in:

> **How the ruling is built (2026-11-10, later; architect plan `m10-c4-sheet-message-plan.md`, waves C4a and C4b,
> merge `<hash>`).**
>
> - The C4C line `replacementSheet.colourReverted` and its trigger are deleted.
> - A colour row the reset cleared is drawn resolved with no value. It never names the colour the material returned the
>   kitchen to; a row whose colour availability gave back still names it.
> - While a material row is owed, the sheet shows one static sentence, `replacementSheet.materialAndColoursUnavailable`
>   ("Materialul și culorile lui nu mai sunt disponibile. Alege alt material.", drafted, OQ-11i). It is not conditional
>   on a stored colour, so decision 6 holds again for C4: nothing about the colour is said after the apply.
> - Decisions 2 and 3 stay narrowed for C4 only. No confirmation step exists in C4.
> - **`replacementSheet.changedColour` is not dead copy:** it confirms a colour the customer chose in the sheet
>   (`CHANGED_LEAF.finish`). T5 and OQ-11h stay live, awaiting approval.
> - C4C keeps the customer's own change lines. That reads "only" as replacing the announcement, which is the architect's
>   reading [inf]; the owner may rule otherwise.

### M10 plan: dated "superseded 2026-11-10" marks, without deleting text

- *Q5 split* ruling 2, whole.
- Ruling 4's clause "names its reverted colour" and "Such a row is then drawn resolved, naming the colour it reverted to".
- The Q5 row's "'Culoarea a revenit la Alb' when a material change resets it".
- The Q5b acceptance bullets "ruling 2", and the "C4C's reset line" in "Q5-a in the browser".
- Point 8's "`colourReverted` exist and are unread".
- The Q5b verification line "`CI=1` browser specs: Q5b's reset line".

Then add a C4a and C4b record block when they merge.

### OQ-11i

Add it to the M10 owner questions: "approve `replacementSheet.materialAndColoursUnavailable` as drafted".

### STATUS

- Section 1, *Open M10 items* 1 and 2: mark them done at the merges, and quote the merge hashes.
- Record the copy-gap item ("a waiting colour row has no text") as closed **only if** the visual pass confirms D1 reads
  as its reason.

## 10. Verification

- **C4a**
  - The coordinator checks the leaf against the lock.
  - QA runs the i18n suites (§8 C4a-5) and confirms §7.3.
  - The combined reviewer measures the ru pill at 390 × 844 under `CI=1`. The path is a stored design naming a vanished
    material tier (`replacement-sheet-journey.ts`'s `material.created-and-since-deleted`; no publish, no availability
    write), opened under `/ru`. `tests/e2e/top-bar-pill-containment.e2e.spec.ts` is the existing containment probe to
    reuse.
- **C4b**
  - QA flips §7.1, adds the §8 properties with sabotage proofs, and runs the whole `apps/web` vitest. Reviewers start
    only when it is green.
  - The visual review runs at **390 × 844 and 1440 × 900** on the vanished-material path under `CI=1`, with a stored
    palette colour, and captures:
    - C4A with the note;
    - the waiting colour row, if the fixture produces one;
    - C4D with the material resolved and the reset-cleared colour row valueless;
    - C4C with no reset line.
  - A switched-off-material variant needs an availability write, so it runs only on the visual agent's own `next dev`
    server (never port 4320; `agent-coordination.md`), or not at all. If it does not run, that is the recorded residual,
    as Q5b's was.
- **Before any push:** `pnpm ci:local`, quoted.

## 11. Risks and residuals

- **The note can overstate.** Under an undeclared old material wearing a PAL colour, replaced by PAL, the colour survives
  (Q5b ruling 2's "no reset" arm), yet the note said its colours were unavailable. This is reachable only out of band
  (Q5 split point 5 [doc]). It is an **accepted residual [inf]**.
- **The reading of "only" (D3).** If the owner meant the sheet says nothing after a choice, C4C goes too, and that is a
  new wave.
- **QA weakening while flipping.** About fifteen titles flip or are deleted. The reviewer checks that every deleted test is
  replaced by a §8 must-not or property of at least the same reach, the MDF arm included. The reach is judged against
  §8 C4b-2's narrowed scope: resolved colour row values and non-choice C4C lines, not the whole sheet's text. Deletions
  are listed in QA's report with their replacements.
- **The C4b implementer's tree is knowingly red** on §7.1 until QA lands, on vitest and on type-aware lint alike. That is
  the reason the list is exact and the commit is `--no-verify` (§6). Any red outside the list is a real finding.
- **Shared resources.** The ru visual and C4b's visual both use the `CI=1` stored-design path, which writes designs to
  the e2e database. Clean them up in `afterEach` (the stray-design history, M10 Z gate [doc]).

## 12. Dispatch readings for QA and reviewers

- **QA (C4a):** this plan §5, §7.3 and §8 C4a; the copy lock header and its `replacementSheet` block;
  `tests/i18n/{m10-copy-rules,m10-copy-grammar-and-lifecycle.adversarial,catalogue-parity,golden-output}.test.ts`;
  ADR 0095 d2.
- **Combined reviewer (C4a):**
  - the diff;
  - this plan §5;
  - ADR 0104 d3;
  - `browser-and-visual-qa.md`;
  - the ru pill measurement in §10.
- **QA (C4b):**
  - this plan §4, §7 and §8 C4b;
  - the four `replacement-sheet-colour-handle*` test files and `tests/support/replacement-confirmation-lines.ts`;
  - `tests/e2e/support/replacement-sheet-journey.ts`;
  - the §7.2 settings files (read only);
  - `engineering-conventions.md`, *Coverage an adversarial pass owes*;
  - ADR 0081 whole.
- **Logic review (C4b):**
  - this plan §3, §4 and §8;
  - ADR 0081 whole, with both amendments;
  - ADR 0178 A-16 and its pointer;
  - ADR 0057 d3;
  - M10 *Q5 split* rulings 1, 2 and 4;
  - the diff of `replacement-sheet-model.ts`, `replacement-sheet.tsx` and `use-price-notice.ts`.
- **Clean-code review (C4b):**
  - the diff;
  - `engineering-conventions.md`;
  - specifically, dead helpers left behind (`defaultColourOfMaterial`, `isSameStoredColour`, `lookUpMaterial`) and
    comments still describing the reset.
- **Visual review (C4b):** §10's frames; frames C4A, C4C and C4D [mock L792-811] in
  `docs/design/mockups/`; `browser-and-visual-qa.md`.

## 13. Punch list

**C4a (one dispatch, 3 items)**

1. Add `replacementSheet.materialAndColoursUnavailable`, RO and RU (§5), and regenerate `ro.d.json.ts`.
2. Add it to the copy lock as `Drafted`, OQ-11i.
3. Change ru `headerMaterialToChoose` to "Материал".

**C4b (one dispatch, 5 items)**

1. Delete the reset line's model: `colourRevertedBy`, its helpers, `copy.colourReverted`, and `revertedColour` in
   `describeConfirmationLines`.
2. Delete the `revertedColour` plumbing in `replacement-sheet.tsx` and `use-price-notice.ts`, and fix the comments.
3. D2: a reset-cleared colour row has no value. Remove `defaultColourOfMaterial` if it is left dead.
4. D1: `materialNote` in the view, drawn after the lead, reading the new leaf.
5. Delete the `colourReverted` leaf from ro, ru, `ro.d.json.ts` and the lock, in the same commit as item 1.
