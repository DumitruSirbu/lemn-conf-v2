# Test audit, 2026-11-11: M10 close (price dashboard), wave Z2

Files changed by this audit: **this report only.** No test and no production file was edited in the main checkout, and nothing was
committed. Every mutant was applied in one of three scratch git worktrees under the auditor's scratchpad (`…/scratchpad/wt`, `wt2`,
`wt3`), all detached at `d3cb086b`. Each mutant was made from a byte copy of the one file, restored from that copy, and checked
with `cmp`. At the end, `*.auditbak` files were searched for and none found, and `git status --porcelain --untracked-files=no` was
empty in all three worktrees. The worktrees are left in place for the coordinator to remove (`git worktree remove`). Vitest
wrote its caches into the main checkout's gitignored `node_modules/.vite*`, because the worktrees link to them.

## Gate number, stated plainly

**"Cannot fail" findings: 3 rows, all measured: C1, C2 and C3.** By ADR 0152 Amendment A they are fixed before M10 is marked Done.

- **C1** is a deferred `it.fails` promise that was kept under a different HTTP method. It is green with the route present and green
  with the route removed, so it can never go red.
- **C2** and **C3** are "a fixture that does not isolate the rule": each title states a rule in general, and a reachable mutant
  breaks that rule outside the one case the fixture builds. For both:
  - nothing in the domain suite (13,701 tests) or the web suite (30,357 tests) goes red;
  - a throwaway probe proved the mutant reachable through the same public function;
  - each rests on a recorded acceptance line in `docs/milestones/done/M10-price-dashboard.md` (cited in the row).

Under the same mutant, C2's draft is still refused, by the candidate judgement and not by the code the title names. The coordinator
may weigh that.

Other findings: near-duplicate 1 row (measured), obsolete 4 rows (read), useless 0. These may be deferred.

## Range and population

- Branch `m10-price-dashboard`, **HEAD `d3cb086b`**. Range **`0910dc06..d3cb086b`**, as the dispatch named it; `0910dc06` is the
  merge of PR #14, login-register.
- **Coverage gap.** The newest report before this one (`2026-10-13-m8-review-contact-success.md`) audited up to `d61bfd6d` and named
  it as the next baseline. `d61bfd6d` is an ancestor of `0910dc06` (`git merge-base --is-ancestor`, true). So the test files changed
  in **`d61bfd6d..0910dc06`** are covered by neither report. **The next audit's baseline is `d3cb086b`**, so that gap needs either an
  owner ruling or an audit of its own.
- Population: `git diff --name-only --diff-filter=AM 0910dc06..d3cb086b -- '*test*'` gives **1,162 files**:

  | Package | Files |
  | --- | --- |
  | `apps/web` | 811 (45 of them e2e specs) |
  | `packages/configurator-domain` | 214 |
  | `packages/persistence` | 101 |
  | `packages/three-adapter` | 34 |
  | `scripts/gates` | 1 |

  The diff has 265 K lines added. Of the 1,162 files, 970 are `*.test.*`; the rest are support modules, fixtures and specs. One test
  file was deleted in the range and cannot be audited: `apps/web/tests/lib/server/shipped-price-book.test.ts`.
- **Run as baselines in the worktree, unmutated:**
  - domain: 467 files, 13,697 tests, green once `dist` was built;
  - web: 1,228 files, 30,357 tests, green;
  - domain without `tests/dist-module-graph.test.ts`: 466 files, 13,701 tests, green.

  Each of the last two is the baseline of the full-suite witness runs below.

## How it was run

1. **Setup.** A worktree that links the main checkout's `node_modules` would make web tests read the main checkout's `dist`, as
   the M8 report records. So `apps/web`, `persistence` and `three-adapter` were given real `node_modules` directories whose
   `@lemnaria/*` links resolve to the worktree's own packages, and each `dist` was built there.
   - **Canary:** a domain mutant in `pricing/price-change-notice.ts` (`!==` to `===` in `differInSomeLine`), with `dist` rebuilt,
     turned a web test red (`price-notice-judgement.test.ts`, 1 of 23).
   - **Run outside witness runs:** `tests/dist-module-graph.test.ts`. It compares the mtimes of `src` and `dist`, so it goes red
     under any mutant and would pose as a witness.
2. **Static triage by script** over every case in scope: no assertion, weak matchers only, early return, a loop with no stated
   floor, a self-comparison, a source read, and `it.fails`/`skip`/`only`.
   - Results: 52 no-assert hits, 5 weak-only, 251 early-return, 1,456 loop-no-floor and 41 source-read.
   - Every no-assert hit in the domain and web unit files was checked. Each turned out to be a false positive: the assertion sits
     in a helper, a `throw` or a template-literal title.
   - The early-return and loop hits were only sampled in the M10 domain QA files (see the appendix). They are too noisy to settle
     one by one.
3. **Every `it.fails` in scope was flipped in a scratch copy** (a new file, deleted after the run) to read why its inner body fails
   today. Eleven fail by assertion for the reason their title names. One, C1, does not.
4. **A kill matrix** of line-level mutants. The operators were: comparison flips, `&&`/`||`, `??` to `||`, `some`/`every`,
   `true`/`false`, `!` removal, `+`/`-`, and integer +1.
   - Each mutant was run against the test files that import the module's exports. Domain files were matched by export name; web
     files by import path.
   - The matrix finished **30 domain modules and 9 web modules**, with 2 more partly run: **1,131 mutants** in all. They are
     listed in Appendix B.
   - It was stopped partway through the domain batch, after `price-dashboard/priced-row.ts`, and the web batch, during
     `price-dashboard/publish-model.ts` (18 of 74 mutants run).
   - No kill was a timeout; the matrix checked for that. One `created-ids` mutant hung instead (Appendix B).
   - A survivor is a lead, not a finding. It became a row only where a test's **title** names the behaviour the mutant breaks.
     Those were re-run against the **whole** domain and web suites.
5. **Title-directed mutants** by hand:
   - `pricesChangedBetween` comparing totals instead of lines: killed by
     `price-change-notice.test.ts` "gives true when two lines move in opposite directions and the total does not".
   - `draft-structure.ts:127` `&&` to `||`: no domain test went red, but nine web tests did (route and plan tests on taking a
     deletion back), so it was cleared.
6. **Reachability probes** for C2 and C3: one throwaway test each, run on the original and on the mutant, then deleted.

Not run, by constraint:
- the persistence suite and Playwright, so the 101 persistence files and the 45 e2e specs were neither run nor read;
- the three-adapter suite, so its 34 files were not looked at;
- no dev server and no `ci:local`;
- nothing that writes to a database was mutated.

## Verdict table

| Category | Rows | Measured | Read |
| --- | --- | --- | --- |
| **Cannot fail** | **3** | 3 | 0 |
| Near-duplicate | 1 | 1 | 0 |
| Obsolete | 4 | 0 | 4 |
| Useless | 0 | | |

## Cannot fail (3), fix before M10 is Done

"Whole suites" means that, with the mutant applied (and the domain `dist` rebuilt for a domain mutant), the full domain run
(466 files, 13,701 tests, without `dist-module-graph`) and the full web run (1,228 files, 30,357 tests) stayed green. No test is a
witness there. Persistence and three-adapter were not run, and `grep` found no use of the mutated functions in `packages/persistence`
or in the e2e specs.

| # | File:line | Title | Cases | Proof (measured) | Why | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | `apps/web/tests/app/api/staff/material-wire.test.ts:203` | `it.fails` "has a route that takes it, so a confirmed switch can be written outside a sample" | 1 | **Route present:** the file is green (6/6), because the `it.fails` passes when its body fails. **Mutant, the route removed** (`export async function POST(` renamed in `src/app/api/staff/prices/availability/route.ts`): still green (6/6). **Witness for the route:** `price-dashboard-availability-route.test.ts`, 66 of 66 red under the same mutant. | R4a shipped the availability write as **`POST`**: the route exports `POST`, and the fetching lifecycle client sends `POST` (`fetching-item-lifecycle-client.ts:30-35`). The promise looks up `route.PUT`, which is `undefined`, answers its own 404, and so "fails" for ever. It cannot turn red when the promise is kept, which is the one thing an `it.fails` promise is for, and it stays green with no route at all. It is also obsolete: R4a is merged, and the plan's flip list (`M10-price-dashboard.md:4361`) flipped the deletion's promise but never this one. **The fix must come in one change with O1 to O4:** `qa-m10-u4b-wire.adversarial.test.ts:25` requires at least one `it.fails` in this file, so deleting C1 alone turns it red. | |
| C2 | `packages/configurator-domain/tests/price-dashboard/qa-m4-apply.adversarial.test.ts:141` | "names every class that owes rates, at its own index, and no other change" | 1 | **Mutant:** `src/price-dashboard/draft-structure.ts:275`, `ratesSetOn`'s `address["kind"] === "hardware" && address["tierId"] === tierId` changed `&&` to `\|\|`, so a rate set on **any** class counts for every class. The test stays green (as do all 108 tests of the file), and the whole suites stay green. **Reachable:** a probe `applyChanges(BASE, [createTier("hw.a"), ...tierDraft("hw.b")])` gives `0:CREATED_TIER_RATES_MISSING` on the original and `candidate-refused` under the mutant. | The fixture sets one rate on `hw.b`, and a full class needs five, so the mutant can never complete `hw.a` from it: the fixture does not isolate "a class owes **its own** rates". The rule is recorded: "every rate is owed" (`M10-price-dashboard.md:2805`), and `applyChanges` refuses "a short rate set as `CREATED_TIER_RATES_MISSING`" (`:1517`). Under the mutant the draft is still refused, by the candidate judgement, but no longer names the class or the code the title promises. A fix adds a case where another class's rates are complete. | |
| C3 | `apps/web/tests/lib/server/price-dashboard/deletion-facts.test.ts:310` | "never starts the walk: a probe that would read every design is thrown" | 1 | **Mutant:** `src/lib/server/price-dashboard/deletion-facts.ts:235`, `probes.some(({ via }) => via === "migrated-design")` changed to `every`. The test stays green and the whole web suite stays green. **Reachable:** a probe deleting the built-in accessory beside an ordinary material rejects with `WalkedDeletionProbeError` on the original. Under the mutant it **resolves**, and the counts include a `migrated-design` probe, so the walk over every design starts. | The fixture deletes one item, where `some` and `every` agree. The title's rule ("a probe that would read every design is thrown") is the plan's acceptance: "publish ... never starts the walk. A test fails if a `migrated-design` probe reaches the reader at publish" (`M10-price-dashboard.md:2683-2684`). No test fails when that probe sits beside another. A fix adds a second, ordinary item to the deleted list. | |

## Near-duplicate (1), may be deferred

| # | File:line | Title | Cases | Proof | Keep | Status |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | `apps/web/tests/app/api/staff/qa-m10-u4a-wire.adversarial.test.ts:261` and `apps/web/tests/app/api/staff/qa-m10-u4c-wire.adversarial.test.ts:218` | "is declared by the browser's client, so the page offers the rename at all" (the same title in both files) | 1 + 1 | **Measured.** Both bodies are the same single assertion, `expect(FETCHING_PRICE_DRAFT_CLIENT.acceptsCreatedRowText).toBe(true)`. The mutant `acceptsCreatedRowText: true` to `false` in `src/price-dashboard/price-draft-client.ts` turns both red. It also turns red two tests of `tests/price-dashboard/qa-m10-p6b-rename.adversarial.dom.test.ts` (the `:317` assertion, and "is the one a screen mounted without a client is given: the name is a field for a created class"). | **Keep** `qa-m10-p6b-rename.adversarial.dom.test.ts`'s production-client tests, which went red and also check what the flag does on screen. Both wire rows are implied by them: delete either one, or both. The kept tests went red under the mutant. | |

## Obsolete (4), may be deferred, but must go with C1

All four are in `apps/web/tests/app/api/staff/qa-m10-u4b-wire.adversarial.test.ts` and are **read**, not mutated: they read a test
file's text, so a production mutant cannot reach them.

| # | Line | Title | Why | Status |
| --- | --- | --- | --- | --- |
| O1 | 25 | "is there to be held, so that a file with none would show" | It requires at least one `it.fails` in `material-wire.test.ts`. The one left is C1, a promise that was kept, so this test now pins a stale promise in place: deleting C1 turns it red. | |
| O2 | 29 | "is headed, just above it, with the wave whose route it waits for" | Checks that each `it.fails` names "R4a". R4a is merged. | |
| O3 | 41 | "asserts the success the route will answer, so the promise goes red when it is kept" | It pins C1's body text (`expect(answer.status).not.toBe(404)`). The promise was kept and the test did not go red, because the route is a `POST` (C1), so the premise this test holds is false. | |
| O4 | 51 | "reaches a module of the tree by its alias through a variable, as the wire test does, so a route dropped in is found" | A control (ADR 0152 rule a) for C1's variable-path lookup instrument. It has no subject once C1 goes. | |

## Appendix A: candidates raised and cleared, so they are not raised again

**`it.fails` pins that fail for the reason their title names.** Each was flipped in a scratch copy, and the failure quoted is the
inner assertion. The record status is from `grep` over `docs/BACKLOG.md`, `docs/STATUS.md`, `docs/milestones/*.md` and
ADR 0177/0178; "none found" is not proof that none exists.

| File:line | Inner failure today | Recorded |
| --- | --- | --- |
| `apps/web/tests/app/api/staff/qa-m10-r4a4-creation-limits.adversarial.test.ts:94`, `:109` | `expected 409 to be 400` | yes: `M10-price-dashboard.md:2851`, "the 21st class or 51st accessory answers `409 candidate-refused`"; the `LIMIT_REACHED` wave is queued |
| `apps/web/tests/lib/server/price-dashboard/creation-after-deletions.property.test.ts:155` | `expected 'refused' to be 'write'` | none found |
| `apps/web/tests/price/replacement-sheet-colour-handle-model.adversarial.test.ts:187` | `expected 'Colour Oak (ex.' to be 'Colour Oak (ex. MDF).'` | none found; its comment says it is latent and no shipped leaf reaches it |
| `packages/configurator-domain/tests/queries/qa-q5a-replacements-required.adversarial.test.ts:186` | `expected false to be true` (`replaceColour` refuses an option the sheet offers) | **none confirmed**. `DEFAULT_MATERIAL_ID` is mentioned in the M10 plan, but not as this defect. **This is a known C4 replacement-sheet defect at milestone close:** for a design with no `materialTierId` under a book whose default material is not melamine, the colour row offers woods the command refuses. It is not a test finding, but the coordinator should see it. |
| `packages/configurator-domain/tests/pricing/anchored-price-book-parse.adversarial.test.ts:415`, `:430`, `:453`, `:462` | `expected true to be false`: a non-enumerable amount field is not refused | a "non-enumerable" mention exists in ADR 0178; not confirmed as this defect |
| `packages/configurator-domain/tests/merge-empty-columns.editor-sequences.property.test.ts:325` | `expected 5100 to be less than or equal to 5085` | none found (pre-M10 subject; the file was changed in range) |

**Matrix survivors cleared as equivalent or unreachable, by reading:**
- `??` to `\|\|` on numbers, ids or objects, where the left side is never `0` or `""`: `price-change-notice:112-113`,
  `replacements-required:114`, `item-usage:49,54`, `defaults-judgement:155`, `kitchen-handle:65-66`, `diff-books:87,138,255,266,287`,
  `cabinet-preview:195,333`, `apply-changes:242`, `item-lifecycle-model:87,96,121,151,180`, `restore-plan:124`, `draft-address:121`,
  `draft-structure:105`, `replacement-sheet-model:313-314`.
- **Comparator signs, unique-index bounds and tie handling:** `catalogue-availability:95`, `digest-model:122-123`,
  `draft-structure:54,81,267`.
- `draft-structure:233`: `created.kind` can only be `hardware` there.
- `pending-price-count:69`: `idOf` already answers `undefined` for an unknown kind.
- `replacement-sheet-model`:
  - `:131`: any negative sentinel works.
  - `:392`, `:712`, `:715`: a mismatched kind or an unknown palette id already ends in `undefined`.
- `judge-book`:
  - `:165`, `:181`, `:190`: defaults and dead branches.
  - `:275-279`: the per-size customer branch is reached only by a size `refusePrices` already refused.
  - `:454-455`, `:482-495`: the ranking is invariant under a constant shift, and only the `undefined` arms change.
- `bulk-change:89`: an amount of 1 bani is unreachable on a ten-lei grid.
- `diff-books:175,239`: a cabinet rule absent from the after book; a bulk that is the same per group.
- `item-lifecycle-model:202`: an `ok` verdict has no code.
- `kitchen-defaults-model:324`: no accessory in the defaults.
- `deletion-facts:247,259`.
- `created-ids:30,33,36,64,74,75`: retry and draw counts no title names, and `withBytesOf` stops at 21 characters on its own.
- `deepening-rows:37`.

**Cleared by a whole-suite witness:**
- `stored-draft.ts:149` (a stored bulk's `groupCode` dropped on read). Three web tests went red:
  - `qa-m10-m2-bulk-route.real-planner`;
  - `qa-m10-r2-dashboard-api` "over each price group mints the group's code ...";
  - `qa-m10-u2-cabinet-list-world`.

  `stored-draft.test.ts:172` "keeps a group and its bulk together" uses `scope: "all"` and would not see it, but its title does not
  name the group code.
- `draft-structure.ts:127`: nine web tests went red (method 5).

**Survived the whole suites, but no title names the behaviour.** These are unguarded behaviour, not findings; recorded for the
coordinator:
- `judge-book.ts:426` (`<=` to `<` against `MAX_CABINET_AMOUNT_MINOR`): survived both whole suites. The bound's own test,
  `qa-m2-bulk.adversarial.test.ts:426`, works on the greatest multiple of ten lei, and `MAX_CABINET_AMOUNT_MINOR` is not one. So an
  exact-bound price is untested, but no title claims it.
- `judge-book.ts:357` (the size-list sort comparator `left - right` changed to `left + right`): no title on size-list order. Not run
  on the whole suites.
- `structural-changes.ts:92` (`some` to `every`; reachable only by classes that state different optional rates, the shape
  `creation-after-deletions.property.test.ts:155` pins), `:120` (a created class starts at rate 1 instead of 0), and `:422`
  (`snapshotItem` accepts a malformed handle item). None is named by a title, and none was run on the whole suites.
- `dashboard-audit-action.ts:592` (`>` to `>=` in `copyEntriesUpToOnePast`): a fields list whose iterator yields more entries than
  its length is copied short and accepted. The doc comment states the guard, but no title does. Not run on the whole suites.
- `pending-price-count.ts:34`, `:49` (`changedRowsOf`, `changedRowOf`): survived the one domain file; web users not run.
- `parse-linked-accessories.ts:35` (`MAX_LINKED_ACCESSORIES` 50 to 51) was in this list until the whole suites ran. Several tests
  witness it, so it is cleared (Appendix C).

**Static triage rows read and cleared:**
- `packages/configurator-domain/tests/pricing/qa-p2-percentage-seam.adversarial.test.ts:337`: asserts by `throw` against an oracle
  inside the loops.
- `qa-x2-staff-audit-fold-in:79` and the persistence `%s` rows: the "title" was a template string, or the assertion sits in a
  helper.
- `availability-refusal.test.ts:406-424`: `expectTypeOf` and `@ts-expect-error`; held by `typecheck`, which includes `tests/**`.
- `book-field-address.coverage.test.ts`: a declared inventory of the mockup's fields (ADR 0152 rule b territory).
- The `.sabotage.test.ts` files: controls of an oracle instrument (rule a).
- `staff-navigation-groups.dom.test.ts:281`.
- The C4b "says no reset line" tests: exact `toEqual` of the whole list.
- The `qa-q5a-replace-appearance` sweeps: each has a floor (`rewrites > 100`).
- The `qa-m10-s2c-deleted-book-items` properties.

**Identical titles across files.** 125 were found by script; most are parallel tests of different routes and pages (the same
guarantee, a different subject) and are not duplicates. Only D1 was checked through to a row.

## Appendix B: the matrix

**Domain modules finished:**

| Module | Mutants | Survived |
| --- | --- | --- |
| `pricing/price-change-notice` | 4 | 2 |
| `price-dashboard/publish-deletions` | 11 | 0 |
| `queries/replacements-required` | 6 | 1 |
| `price-dashboard/pending-price-count` | 19 | 6 |
| `commands/replace-switched-off-appearance` | 18 | 0 |
| `price-dashboard/version-text` | 11 | 0 |
| `staff-changes/digest-eligibility` | 10 | 0 |
| `staff-changes/digest-model` | 16 | 4 |
| `price-dashboard/item-lifecycle` | 17 | 0 |
| `price-dashboard/item-usage` | 14 | 2 |
| `price-dashboard/restore` | 6 | 0 |
| `price-dashboard/defaults-judgement` | 12 | 1 |
| `staff-changes/chisinau-day` | 7 | 0 |
| `price-dashboard/link-target` | 4 | 0 |
| `pricing/earned-accessories` | 7 | 0 |
| `pricing/deepening-rows` | 4 | 1 |
| `price-dashboard/draft-structure` | 61 | 9 |
| `pricing/catalogue-availability` | 29 | 2 |
| `price-dashboard/judge-book` | 76 | 21 |
| `price-dashboard/structural-changes` | 83 | 3 |
| `price-dashboard/apply-changes` | 53 | 1 |
| `price-dashboard/diff-books` | 33 | 8 |
| `price-dashboard/bulk-change` | 33 | 1 |
| `price-dashboard/cabinet-preview` | 52 | 2 |
| `price-dashboard/created-row-text` | 12 | 0 |
| `pricing/percentage-lines` | 25 | 0 |
| `pricing/parse-linked-accessories` | 16 | 1 |
| `staff/dashboard-audit-action` | 129 | 2 |
| `kitchen-handle/kitchen-handle` | 8 | 2 |
| `commands/set-kitchen-handle` | 4 | 0 |

**Partly run:** `price-dashboard/priced-row`, 8 of 50, 1 survived.

**No direct test file found by export name:** `price-dashboard/percent-bounds`, `pricing/linked-accessories`.

**Web modules finished:**

| Module | Mutants | Survived |
| --- | --- | --- |
| `lib/server/price-notice` | 28 | 0 |
| `price/replacement-sheet-model` | 92 | 6 |
| `lib/server/price-dashboard/deletion-facts` | 29 | 3 |
| `lib/server/price-dashboard/restore-plan` | 16 | 2 |
| `lib/server/price-dashboard/draft-address` | 26 | 1 |
| `lib/server/price-dashboard/stored-draft` | 48 | 1 |
| `lib/server/price-dashboard/created-ids` | 13 of 23 run | 9 |

The 14th `created-ids` mutant hung past the 900 s limit. A hang is not counted as a kill, and it stopped that module, so the
remaining 9 mutants were not run.
| `price-dashboard/kitchen-defaults-model` | 44 | 3 |
| `price-dashboard/item-lifecycle-model` | 29 | 6 |

**Partly run:** `price-dashboard/publish-model`, 18 of 74, 0 survived.

**Not reached by the matrix:** among others, `pricing/price-design`, `pricing/parse-price-book`, `pricing/price-book`,
`price-dashboard/editable-fields`, `price-dashboard/priced-row` (beyond 8 mutants), `price-dashboard/row-diff`,
`generation/new-kitchen-settings`, `generation/shell-design`, the web `price-dashboard-service`, `draft-requests`, `draft-plans`,
`kitchen-defaults-save`, `use-price-notice`, `replacement-sheet.tsx`, and every screen component.

## Appendix C: the linked-accessory bound

`parse-linked-accessories.ts:35`, `MAX_LINKED_ACCESSORIES` changed from 50 to 51, with `dist` rebuilt. It survived the module's own
test file, because `p4b-linked-accessory-parse.test.ts:75` "holds the list to its bound at the boundary" reads the constant, so both
sides come from the same source. Its title names "its bound", not 50, so it is not a row.

The whole suites **witness** the figure, so it is cleared:
- domain: `qa-m4-apply.adversarial.test.ts` "a created linked accessory > can be created up to the book's bound of accessories and no
  further, without a throw";
- web: `price-dashboard-revert-deletion-past-cap.test.ts`, two tests;
- web: `qa-m10-r4a4-creation-limits.adversarial.test.ts` "takes accessories up to the fiftieth, and the one past it writes
  nothing".

## Limits

- **A file with no row is not proven clean.** Of the 1,162 files in scope:
  - the M10 domain price-dashboard, pricing and staff-changes tests, and the web price-notice, deletion, draft and
    replacement-sheet tests, were covered through the matrix and title-directed mutants of the modules listed in Appendix B;
  - everything else was covered only by static triage.
- **Not run, and not read:**
  - the 101 persistence files (constraint: no persistence suite, staging in use);
  - the 45 e2e specs and the Playwright support (no Playwright);
  - the 34 three-adapter files (time);
  - `scripts/gates/e2e-shard-budget.test.mjs`.

  Rows that need them can only be raised by reading, in the main checkout.
- **Lanes** H, K, M, P, Q, R, S, T, U, W, X and Z were reached only where their tests sit on the modules in Appendix B. The K
  (staff changes, digest) and P/Q/R/S (pricing, notice, availability, deletion) modules have the most coverage. The U lane (screens)
  and W were reached mostly through static triage.
- **Near-duplicates were not searched systematically.** One title-identity pass by script, one row.
- **The range leaves `d61bfd6d..0910dc06` unaudited** (see *Range and population*).
- **The procedure as run:**
  - One driver script was edited while a run was reading it, which aborted that run's web half. That run (`deletion-facts:235`) was
    repeated whole, and the repeat is the one quoted.
  - One run's restore trap lost its arguments and did not rebuild `dist`. The source was restored and checked with `cmp`, and `dist`
    was rebuilt by hand before the next run.
  - The matrix restored each file in the same Python step that ran the next check, rather than as a separate shell command, and
    checked it with `filecmp`.

## Resolved in `77fadd67` (appended 2026-11-11, after the audit; the audit text above is unchanged)

[Coordinator's brief, relayed; the commit subject is `test(m10): the three cannot-fail tests of the Z2 audit now fail under their
mutants; the obsolete u4b file and the duplicate rename assertion are gone`. The scribe ran nothing and had no shell; the proof by
mutation was run by the implementer and the coordinator, and is quoted here from the brief, not re-run.]

- **C1, C2 and C3 (cannot fail): fixed and proven by mutation.** Each test now goes red under the mutant this report names for it.
- **O1 to O4 (obsolete): gone.** `apps/web/tests/app/api/staff/qa-m10-u4b-wire.adversarial.test.ts` is deleted, in the same
  commit as C1, as the C1 row required.
- **D1 (near-duplicate): resolved** by removing the duplicate rename assertion (the commit subject's words).
- **Still true after the fix, and not changed by it:** the audit limits above. The 101 persistence files, the 45 e2e specs and
  the 34 three-adapter files were not run and not read; `d61bfd6d..0910dc06` stays unaudited; outside the 39 mutated modules
  the triage was static only. By ADR 0152 Amendment A no "cannot fail" finding remains open from this audit, so it no longer
  keeps M10 open; the limits are the owner's to weigh, not a finding.
- **Rows recorded in the backlog, not fixed here:** the `qa-q5a-replacements-required` `it.fails` at `:186` (a C4 replacement-sheet
  defect) and the `creation-after-deletions.property.test.ts:155` `it.fails` (see `docs/backlog/open.md`, entries 291 and 292).
