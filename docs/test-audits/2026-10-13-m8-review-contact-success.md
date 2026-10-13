# Test audit, 2026-10-13 — M8 (review, contact, success), the first audit run with the skill

Files changed by this audit: **this report only.** No test and no production file was edited in the main checkout. Three scratch
git worktrees under the agent's scratchpad (`…/scratchpad/wt`, `wt2`, `wt3`, detached at `d61bfd6d`) hold every mutant; each was
restored after each run and checked (`cmp` for the byte copies, `git status --porcelain` empty of tracked changes at the end, all
three). The worktrees are left in place for the coordinator to remove (`git worktree remove`). Vitest also wrote its cache under
the main checkout's gitignored `node_modules/.vite*` (the worktrees link to it).

The skill says the procedure is unproven, and it was: see *How it was run* for what had to change.

## Gate number, stated plainly

**"Cannot fail" findings: 3 rows (measured), all in `apps/web`: C1, C3, C4.** By ADR 0152 Amendment A they must be fixed before M8
is marked Done. **Only C4 rests on a ruled requirement** (ADR 0161 decision 3: a page outside the family list is `other`); C1 and C3
name a figure or a tolerance that no dated decision records. If the coordinator reads the gate as "a requirement nothing guards",
C1 and C3 drop to notes and C4 alone stands; I counted them because each title names the behaviour a surviving mutant breaks.
A fourth candidate, C2, was moved out of the count after a second mutant (see *Held notes*). One further item is not a "cannot
fail" but blocks a push: **a test that is red at HEAD** (row R1). Duplicate 0, obsolete 0, useless 0 proven. 7 unguarded-behaviour
notes, 1 held note and 1 flake observation are not findings and are listed apart.

## Range and population

- Branch `m8-review-contact-success`, **HEAD `d61bfd6d`**; range **`437022f3` (merge-base with `main`) .. `d61bfd6d`**, 395 commits.
  The skill's own baseline ("the commit that closes the tests review, on or after `35a3974`") could not be applied literally: `35a3974`
  is an ancestor of HEAD (`git merge-base --is-ancestor`, true) but nobody ruled the exact closing commit, and the owner then widened the
  scope to everything changed since `main`. This audit therefore also re-covers the tests-review fix-up's tests. **The next audit's
  baseline is `d61bfd6d`.**
- Population: `git diff --name-only --diff-filter=AM main...HEAD`, strict filter `/tests/` or `*.test.*` / `*.spec.*`: **668 test files,
  102 K changed lines.** Four test files were deleted on the branch and are not auditable (`design-owner-gate.desktop`,
  `qa-7e3b-s6-two-tab-convergence.adversarial.desktop`, `visitor-identity.desktop` e2e specs; `room/metres-text.test.ts`). The
  first count of 746 in the dispatch included docs, deleted files and non-test source.
- By package: `apps/web` unit/dom/source-scan 311, `apps/web` e2e specs 71, `apps/web/tests/e2e/support/*.test.ts` 7,
  `configurator-domain` 161, `persistence` 77, `three-adapter` 39, `scripts/gates` 2.

## How it was run

1. **Setup trap (cost an hour).** A worktree that symlinks the main checkout's `node_modules` makes web tests read the main checkout's
   `packages/*/dist`, so a package mutant never lands, and it loads two copies of `@lemnaria/configurator-domain` (an `InvalidDesignError`
   `instanceof` failure in three `real-repository` tests). Fixed by giving `apps/web`, `persistence` and `three-adapter` real
   `node_modules` directories that link `@lemnaria/*` to the **worktree's** packages, building each `dist` there, and proving it with
   two canaries before any result counted: a web mutant (`MINT_DAILY_FIGURE` 20 to 21: 31 tests red) and a domain mutant, rebuilt
   (`MIN_WIDTH_M` 0.3 to 0.31: 17 web tests red). The unmutated web suite in the final setup: **482 files, 9,973 tests, green.**
   Matrix results taken before the fix were checked: no mutant was killed only by the three affected files.
2. **Static triage by script** over all 8,331 test cases of the 668 files (no assertion, weak matchers, skips, `readFileSync` of
   source, conditional assertions, try/catch, trivial matchers). Result: 0 cases without an assertion outside the e2e specs; the weak
   matcher cases (74) are `not.toHaveBeenCalled()` negatives, checked below; 28 `test.skip` are all `process.env.CI === undefined`
   (the `CI=1` specs), no `fixme`. The script is noisy for e2e specs (helpers carry the assertions) and was not used to judge them.
3. **A kill matrix**: line-level mutants (comparison flip, `&&`/`||`, `true`/`false`, integer +1, `if (!` removal) in production
   files, each run against the tests vitest `related` finds (the transitive importers). 352 mutants over 127 `apps/web` source files,
   9 over `configurator-domain` contact files, recording every red test. A survivor was re-run against the **whole web suite**.
4. **Exhaustive subject-against-its-tests mutation**: every mutable line of 29 modules (the contact model, answers and identity,
   the CSP report reduction and log, the contact server side, the whole rate-limit family) against the named test files: **342 mutants**.
   Every survivor was re-run against the whole web suite (below).
5. **Title-directed mutants** by reading: 126 distinct mutants (hand count from the run logs), plus 27 survivor re-runs against the whole suite.
6. **Sabotage runs of the gates**: `boundary.sh` four mutants, `e2e-shard-budget` run unmutated.

Not done, by constraint or time: no Playwright, no persistence suite, no dev server, no `ci:local`; nothing near a database was
mutated (ADR 0155): `e2e-rate-limit-run.ts`, `contact-run.ts`, `minted-designs.ts` and `global-teardown.ts` reach the test database's
cleanup and were **read, not mutated**.

## Verdict table

| Category | Rows | Measured | Read |
| --- | --- | --- | --- |
| **Cannot fail** | **3** | 3 | 0 |
| Red at HEAD (not a category of the skill; blocks the push gate) | 1 | 1 | 0 |
| Near-duplicate | 0 | | |
| Obsolete | 0 | | |
| Useless | 0 | | |

## Cannot fail (3), fix before M8 is Done

Row numbers keep the order of discovery; C2 was moved out (H1 below), so the numbers are C1, C3, C4.

Each row: the mutant is the behaviour the **title** names broken; "whole suite" means the full `apps/web` vitest run (482 files,
9,973 tests) stayed green with the mutant applied, so no test is a witness; a green run proves the mutant landed only because the
same mutant family was shown red elsewhere in the same file (the canaries).

| # | File:line | Title | Cases | Proof (measured) | Why | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | `apps/web/tests/e2e/support/pixels.test.ts:156` | "counts a colour within its tolerance" | 1 | `tests/e2e/support/pixels.ts` `if (distanceSquared <= test.tolerance ** 2)` to `<= 0` (tolerance ignored, exact equality only): the file's 7 tests green; **whole web suite green** (482 files, 9,973 tests). | A self-test of a test-support instrument, so ADR 0152 rule (a) applies: it is kept only as a control that feeds one input the detector must flag and one it must pass, and is deleted when no edit to the instrument could redden it. The tolerance arm has **neither**: the fixture is three exact colours (`RED`, `BLUE`, `GREY`) at distance 0, so no input is within tolerance but not equal, and no edit of the tolerance can redden the title. The helper's own doc says why it matters ("never equality: the renderer antialiases"). The e2e callers (`pixel-counter-witness*`, `overflow-mark`) may catch it; Playwright was not run, so that witness is unknown. No dated decision records the tolerance. | |
| C3 | `apps/web/tests/lib/server/csp/csp-report.test.ts:152` | "writes `other` for an origin longer than 255 characters" | 1 | `csp-report.ts:88` `LONGEST_ORIGIN_LENGTH = 255` to `256`, and `url.origin.length > …` to `>=` (line 288): file green, **whole web suite green**. The same holds for `LONGEST_CHUNK_PATH_LENGTH` (255 to 256, `<=` to `<`, lines 108 and 297): whole suite green. **Control:** removing the length clause outright (`if (url === undefined)`) reds exactly this test, so it does guard "a long origin is `other`" and the 266-character origin does reach the clause; the row stands only on the bound, the 255 the title names. | The case uses a 266-character origin, and the property test copies the literal `255` into its own oracle (`text.length <= 255`) over text that never lands on 255 or 256, so the bound the title names is never probed (ADR 0152 decision 1.4: a constant that is a rule keeps one literal pin). No dated decision records 255 (ADR 0161 decision 3 says only that an origin is a closed value); the code comment calls it "no host of any real page". | |
| C4 | `apps/web/tests/lib/server/csp/csp-report.test.ts:386` | "writes `other` for every path outside the list, whatever its segments hold" | 1 property | `csp-report.ts:313` `if (rest.length > 0) return OTHER` to `> 1`: file green, **whole web suite green**. **Non-equivalence shown** with a throwaway probe in the worktree (deleted): `reduceCspReport` on `https://shop.test/ro/d/x/review/extra` answers `page: "other"` at HEAD and `page: "/[locale]/d/[id]/review"` under the mutant. | The sweep has no case for one extra segment after a listed step: its generator makes two (`…/review/{step}/{extra}`) or first-segment shapes. A population arm with no floor (ADR 0152 decision 1.5). **Rests on a ruled requirement:** ADR 0161 decision 3, the page is a family template "else `other`". ADR 0162 (new, untracked, after this audit's HEAD) reworks the CSP sink, so 8Q2 may overtake this row; it counts today. | |

Provenance: all three measured by the auditor in a scratch worktree at `d61bfd6d`, 2026-10-13. C1's file under mutation is the
test-support module `tests/e2e/support/pixels.ts`, not `src`. Companion survivors in `pixels.ts` (noise floor `> floorSquared` to
`> 0`; `redTint`'s `Math.min(red - green, red - blue)` to `red - blue`) left the file's 7 tests green at file level only and were
**not** run against the whole suite: notes, not proof.

### Held notes (not in the count)

| # | File:line | Title | Measured | Why held |
| --- | --- | --- | --- | --- |
| H1 | `apps/web/tests/contact/contact-answer.test.ts:336-350` | "reads %j as %i seconds" (the nine unreadable rows) | `contact-answer.ts:84` `UNREADABLE_CONTACT_WAIT_SECONDS = 60` to `61`: whole web suite green. But the mapping is guarded: returning `1` for an unreadable header reds 7 tests, returning the longest window for an over-long one reds 2. | Same-source shape for the value 60 only (the expected side is the exported constant). The function's doc says "the fixed minute", but no dated decision in ADR 0157 or 0159 or the M8 plan fixes 60 s as the unreadable wait, so no ruled requirement is unguarded. If the coordinator wants the constant pinned (ADR 0152 decision 1.4), this becomes a fourth row. |

## Red at HEAD (1)

| # | File:line | Title | Proof (measured) | Why | Status |
| --- | --- | --- | --- | --- | --- |
| R1 | `scripts/gates/e2e-shard-budget.test.mjs:104-117` | "a workflow whose total or shard list drifts from the configured counts is reported" | `node --test scripts/gates/e2e-shard-budget.test.mjs scripts/gates/boundary.test.mjs` in an unmutated worktree: 44 pass, **1 fail**: the regex pins `expected \[8\]`; the guard now says `[9]` (`fbeed28b` made nine mobile shards). | A literal left behind by a configuration change. It runs in `pnpm ci:local` (`scripts/local-ci.sh:130`) and the CI job `e2e-shard-budget` (`ci.yml:724`), so the push gate is red at HEAD. The commit message of `fbeed28b` says "the gate passes", which is the budget script, not this test. | |

## Near-duplicate (0), obsolete (0), useless (0)

None proven. Obsolete: every test file in scope imports and runs (the web, domain and three-adapter suites are green), so no file's
subject is missing; the e2e specs were not run. No duplicate pair was found that a mutation could not separate; the pairs examined
are in the appendix. A file with no row is **not** proven clean.

## Unguarded behaviour noticed (not test findings: no test title names it)

Verified against the **whole web suite**, which stayed green; each is a production line nothing reddens. For the coordinator's choice.

| Where | Mutant | Note |
| --- | --- | --- |
| `lib/server/contact/prepare-submission.ts:88` | `NO_CABINET` branch inverted | A design with no cabinet is meant to be refused as "not current" (409); no web unit test reaches it. Also `:90` (`PRICING_VERSION_MISMATCH` mapped to the wrong cause): the guard before it (`requireTheBooksVersion`) makes it unreachable in the tests. |
| `lib/server/contact/submit-contact.ts:303` | `channel === "email" && email !== undefined` to `\|\|` | |
| `lib/server/contact/contact-log.ts:54,195,196` | HTTP status bounds 100 and 599 made exclusive | "leaves out a provider status of %s, which is no HTTP status" pins 0, 99, 600 and never a kept 100 or 599. |
| `lib/server/rate-limit/chisinau-day.ts:13,66,109`, `enforce-rate-limit.ts:138-139`, `prune-rate-limits.ts:130` | second offset-correction pass; the unreadable-clock-part guard; the timer-deadline bounds; the prune's day step | |
| `contact/retry-when-online.ts:63`, `contact/contact-form.tsx:510`, `review/*prefetch={false}` (3 files), `review/review-scene.tsx:20`, `i18n/content.ts:345`, `app/configurator/configure/use-back-guard.ts:38`, `store/apply-command-result.ts:140` | the server snapshot of `useIsOnline`; the form's `data-ready`; "never prefetched" on the review's links (ADR 0156 reasons, only the contact and done directories are scanned); `ssr:false` on the review scene; a width range of a single width; a four-segment editor path; the selection through a global-finish change | Related-run survivors (373 to 4,538 tests ran) not re-run against the whole suite. |
| `lib/server/rate-limit/client-network.ts` `LONGEST_ADDRESS_TEXT` (45, 46), the head of a compressed address, `isTextOfBlockKind`'s `typeof` guard | | The length guard is dead code (no text above 45 characters can parse); the other two are cases the truth table lacks. |
| `scripts/gates/boundary.sh` | a `git grep` failure (exit above 1) treated as clean | `boundary.test.mjs` (35 tests, 3 other mutants killed) never makes `git grep` fail. |

**Flake observation, not measured further:** under three concurrent vitest runs one `P1 and P3 … holds over any order` property test
(`contact/use-contact-submission.properties.dom.test.ts`) and one `qa-7f4b-handoff.adversarial.test.ts` case each went red once with
an unrelated mutant applied, and were green on re-run (the property file six times solo, under load). Possible timing sensitivity; the
coordinator may want a seed or a repeat run. **Probable cause of the load:** three vitest workers orphaned by two infinite-loop
mutants (`client-network.ts:120`, `backup-designs.ts:257`, killed on timeout) spun at 100 % CPU from 19:40 until I found and killed them
at the end (they were in my worktree `wt`); the flake is therefore weak evidence either way.

## Appendix: candidates raised and cleared

- **Source scans (rule b).** `contact-screen-sources`, `done-screen-sources`: they read source and CSS, say so in their header, are
  never the sole guard (DOM tests and `qa-8m-geometry` own the behaviour), and each can fail: clip-path to `none` and `max-width` 640 to
  641 turned the named tests red (measured). `csp-sink-source`, `qa-8q-mode-pin-scan` (matchers self-tested, floors of 200 and 50 files),
  `no-csp-bypass`, `pixels.test.ts`'s `fetch` scan (separable from the stubbed-fetch behaviour: a `fetch` in `capturePatch` is only
  seen by the scan): kept, licensed by ADR 0161 criteria. Not mutated: `qa-8m-navigation-sources`, `send-on-whatsapp-sources`,
  `contact-source-names-no-browser-storage`, `no-persistence-fake-in-source`, `no-test-only-reach-in-source` (read: titled as scans).
- **Self-tests of an instrument (rule a).** `csp-violations.test.ts`: six mutants of the instrument red; the one survivor (a header
  name hard-coded to the live mode) is equal to the live mode today and is only separable by flipping the mode (the 8Q rollback), not
  by a permitted mutation. `fake-mail-environment.test.ts`, `minted-designs.test.ts`, `contact-run.test.ts`: read; they compare the
  support's keys with the server's, two sources.
- **`send-contact-request`**: "stays outstanding for two days" and "carries no abort signal" are separable (a `Promise.race` timer
  reds the first and the scan; a signal reds the second): both kept.
- **`sent-request-memory.test.ts`**: ten mutants, nine red; the survivor is a production line (`contactValue === undefined`).
- **`client-network.test.ts`**: sixteen mutants, nine red at once; survivors are the unguarded notes above, none named by a title.
- **`security-headers.test.ts` and `proxy.test.ts`**: 26 mutants of every directive and header, all red. Five directives (style, media,
  manifest, frame, font) are pinned by one test only (`proxy.test.ts`, "emits the exact production policy"): not a finding (ADR 0152
  consequences: "one test" is not a finding).
- **`content.ts` contact copy**: seven leaf swaps, all red (by `contact-form.dom`, `contact-outcome.dom`, `contact-copy`).
- **`qa-8m-done-door-real-repository`** ("the contact store is not read"): a direct contact-table query in the refused branch reds it
  (16 tests); my first mutant did not reach the store and is not evidence.
- **`done-page-gate` source-order test vs the behavioural test**: the two are separable (see above), not duplicates.
- **Weak-matcher cases** (74, e.g. `void-mesh.test.ts:60` `toBeDefined`): the one mutated (`computeLineDistances` removed) reds.
- **Skips** are the 28 `CI=1` gates, no `fixme`: they run only under CI by design (`RUN_UNDER_CI`).

## Coverage

| Bucket | Files | Mutated | Judged by reading only | Skipped |
| --- | --- | --- | --- | --- |
| `apps/web` unit/dom/source-scan | 311 | **223** (group A of the appendix): seen red under a matrix mutant, or paired with one of the 29 exhaustively mutated modules, or targeted | the rest of **88** (group B), notably the source scans, `price/`, `room/`, `settings/`, `scene/` and `store/` tests whose subject files the matrix did not reach | none skipped outright |
| `apps/web` e2e specs | 71 | 0 | 71, by reading the header, titles and the `RUN_UNDER_CI` skips; unit-level mutants of the code they name stand in | Playwright and any DB-near run |
| e2e support `*.test.ts` | 7 | `csp-violations` (9), `pixels` (3) | `no-csp-bypass`, `fake-mail-environment`, `minted-designs`, `contact-run`, `e2e-rate-limit-run` | their subjects reach DB cleanup: ADR 0155 |
| `configurator-domain` | 161 | 11 contact-file mutants (4 files seen red) | the rest | not audited in depth: each related run takes about 100 s (the suite is 71 s whole), so the budget went to `apps/web`, which holds 8L, 8M and 8Q; the domain tests were also reworked in the tests-review fix-up [inference, not measured] |
| `three-adapter` | 39 | 1 | 38 | |
| `persistence` | 77 | 0 | 0 | all: the suite is not to be run, its subjects are the database |
| `scripts/gates` | 2 | `boundary.sh` 4, `e2e-shard-budget` run | | |

## Limits

A file with no row is **not** proven clean. Reading was wrong about one "cannot fail" claim in five on the first pass; I read
broadly and **measured** only what is above. The exhaustive mutation covered 29 modules, not the 311 web unit files: the contact
form screens, the done and review screens, `room/`, `price/`, `settings/`, `scene/` and `store/` have no title-directed pass. The
matrix's line-level mutants are crude (type lines and equivalent mutants survive); each survivor was either re-run or listed as
related-run only. Whole-suite results taken while another vitest run was in progress were repeated when a file-level failure
appeared (two such failures were load artefacts). `tests/e2e/*.spec.ts` were never run.

## Appendix: every test file in scope, by what was done to it

Paths are repository-relative. `persistence` paths are given by directory, since none was run or mutated.

### A. `apps/web` unit/dom/source-scan, mutated (seen red under a matrix mutant, or paired/targeted) (223)
```
apps/web/tests/app/api/contact-submissions/qa-8k-bodies-and-guard.adversarial.test.ts
apps/web/tests/app/api/contact-submissions/qa-8k-identity-and-lines.adversarial.test.ts
apps/web/tests/app/api/contact-submissions/qa-8k-order-and-counts.adversarial.test.ts
apps/web/tests/app/api/contact-submissions/route-through-the-orchestration.test.ts
apps/web/tests/app/api/contact-submissions/route.test.ts
apps/web/tests/app/api/cron/prune-rate-limits/qa-8g-prune-mixed-windows.adversarial.test.ts
apps/web/tests/app/api/cron/prune-rate-limits/route.test.ts
apps/web/tests/app/api/csp-reports/route.test.ts
apps/web/tests/app/api/designs/mint-failure-log.test.ts
apps/web/tests/app/api/designs/mint-limiter.test.ts
apps/web/tests/app/api/designs/qa-7e3a-visitor.adversarial.test.ts
apps/web/tests/app/api/designs/qa-8f-refused-mint-through-the-route.adversarial.test.ts
apps/web/tests/app/api/designs/qa-8g-save-limit.adversarial.test.ts
apps/web/tests/app/api/designs/qa-8g-share-and-read-limits.adversarial.test.ts
apps/web/tests/app/api/designs/read-and-share-limiter.test.ts
apps/web/tests/app/api/designs/share-link-route.test.ts
apps/web/tests/app/api/designs/visitor-identity.test.ts
apps/web/tests/app/api/designs/write-authorization.adversarial.test.ts
apps/web/tests/app/api/designs/write-authorization.test.ts
apps/web/tests/app/callback-contact-page.test.ts
apps/web/tests/app/configurator/configure/back-confirmation.dom.test.ts
apps/web/tests/app/configurator/configure/top-bar-fit.test.ts
apps/web/tests/app/configurator/configure/use-back-guard.review.dom.test.ts
apps/web/tests/app/configure-screen-arrival.dom.test.ts
apps/web/tests/app/configure-screen-review-link.dom.test.ts
apps/web/tests/app/configure-screen-wiring.dom.test.ts
apps/web/tests/app/contact-page-gate.test.ts
apps/web/tests/app/done-page-gate.test.ts
apps/web/tests/app/home-navigation.test.ts
apps/web/tests/app/hydrate-and-configure-stored-copy.dom.test.ts
apps/web/tests/app/hydrate-and-contact.dom.test.ts
apps/web/tests/app/hydrate-and-contact.server.test.ts
apps/web/tests/app/hydrate-and-done.dom.test.ts
apps/web/tests/app/hydrate-and-done.server.test.ts
apps/web/tests/app/hydrate-and-review.dom.test.ts
apps/web/tests/app/hydrate-and-review.server.test.ts
apps/web/tests/app/internal/mirror-shot/page.test.ts
apps/web/tests/app/internal/scene-shot/page.test.ts
apps/web/tests/app/locale-layout.test.ts
apps/web/tests/app/qa-7e3b-design-page-gate.adversarial.test.ts
apps/web/tests/app/qa-7j-camera-row.adversarial.test.ts
apps/web/tests/app/qa-8d-revision-order.adversarial.test.ts
apps/web/tests/app/qa-8d-two-doors-real-repository.adversarial.test.ts
apps/web/tests/app/qa-8g-review-paused.adversarial.dom.test.ts
apps/web/tests/app/qa-8k2-stored-copy-consumers.adversarial.dom.test.ts
apps/web/tests/app/qa-8l-contact-door-real-repository.adversarial.test.ts
apps/web/tests/app/qa-8m-done-door-real-repository.adversarial.test.ts
apps/web/tests/app/qa-u7s0-snapshot-store.adversarial.dom.test.ts
apps/web/tests/app/review-arrival.dom.test.ts
apps/web/tests/app/review-page-gate.adversarial.test.ts
apps/web/tests/app/review-replacement-asks-nothing.dom.test.ts
apps/web/tests/app/review-screen.dom.test.ts
apps/web/tests/app/shared-design-page.test.ts
apps/web/tests/app/shared-design-route.test.ts
apps/web/tests/contact/callback-contact-screen.dom.test.ts
apps/web/tests/contact/contact-answer.test.ts
apps/web/tests/contact/contact-form-model.test.ts
apps/web/tests/contact/contact-form.dom.test.ts
apps/web/tests/contact/contact-outcome.dom.test.ts
apps/web/tests/contact/contact-request-identity.test.ts
apps/web/tests/contact/contact-screen-sources.test.ts
apps/web/tests/contact/contact-screen.dom.test.ts
apps/web/tests/contact/outcome-to-show.test.ts
apps/web/tests/contact/qa-8l-contact-screen.adversarial.dom.test.ts
apps/web/tests/contact/qa-8m-p1-p4-with-the-connection.adversarial.dom.test.ts
apps/web/tests/contact/send-contact-request.test.ts
apps/web/tests/contact/submission-failure.dom.test.ts
apps/web/tests/contact/use-contact-submission.dom.test.ts
apps/web/tests/contact/use-contact-submission.online-retry.dom.test.ts
apps/web/tests/contact/use-contact-submission.online-retry.properties.dom.test.ts
apps/web/tests/contact/use-contact-submission.properties.dom.test.ts
apps/web/tests/contact/use-contact-submission.unsendable.dom.test.ts
apps/web/tests/done/done-screen-sources.test.ts
apps/web/tests/done/done-screen.dom.test.ts
apps/web/tests/done/result-to-show.test.ts
apps/web/tests/done/send-on-whatsapp.dom.test.ts
apps/web/tests/done/sent-reference-card.dom.test.ts
apps/web/tests/done/sent-request-memory.test.ts
apps/web/tests/done/use-replace-with-done.dom.test.ts
apps/web/tests/i18n/clock-time.test.ts
apps/web/tests/i18n/contact-copy.test.ts
apps/web/tests/i18n/content.test.ts
apps/web/tests/i18n/cross-on-screen.projection.test.ts
apps/web/tests/i18n/golden-output.test.ts
apps/web/tests/i18n/locale-menu.dom.test.ts
apps/web/tests/i18n/pseudo-locale.test.ts
apps/web/tests/lib/security-headers.test.ts
apps/web/tests/lib/server/contact/contact-availability.test.ts
apps/web/tests/lib/server/contact/contact-log.test.ts
apps/web/tests/lib/server/contact/contact-production-ports-translator.test.ts
apps/web/tests/lib/server/contact/contact-production-ports.test.ts
apps/web/tests/lib/server/contact/contact-refusal.test.ts
apps/web/tests/lib/server/contact/contact-responses.test.ts
apps/web/tests/lib/server/contact/contact-submission-store-instance.test.ts
apps/web/tests/lib/server/contact/judge-contact-request.test.ts
apps/web/tests/lib/server/contact/parse-contact-request.test.ts
apps/web/tests/lib/server/contact/sent-reference.test.ts
apps/web/tests/lib/server/contact/submit-contact-regions.test.ts
apps/web/tests/lib/server/contact/submit-contact.test.ts
apps/web/tests/lib/server/csp/csp-report.test.ts
apps/web/tests/lib/server/design-failure-log-e2e-notice.test.ts
apps/web/tests/lib/server/design-failure-log.test.ts
apps/web/tests/lib/server/digest/digest-secret.test.ts
apps/web/tests/lib/server/digest/keyed-digest.test.ts
apps/web/tests/lib/server/load-owned-design.test.ts
apps/web/tests/lib/server/mail/create-mail-sender.test.ts
apps/web/tests/lib/server/mail/fake-mail-sender.test.ts
apps/web/tests/lib/server/mail/lead-notification.test.ts
apps/web/tests/lib/server/mail/mail-configuration.test.ts
apps/web/tests/lib/server/mail/mail-sender.test.ts
apps/web/tests/lib/server/mail/qa-8j-environment.adversarial.test.ts
apps/web/tests/lib/server/mail/qa-8j-notice-customer-text.adversarial.test.ts
apps/web/tests/lib/server/mail/qa-8j-notice-kitchen.adversarial.test.ts
apps/web/tests/lib/server/mail/qa-8j-provider-answers.adversarial.test.ts
apps/web/tests/lib/server/mail/qa-8j-request-and-predicate.adversarial.test.ts
apps/web/tests/lib/server/mail/resend-mail-sender.test.ts
apps/web/tests/lib/server/mail/select-mail-sender.test.ts
apps/web/tests/lib/server/rate-limit/bucket-subject.test.ts
apps/web/tests/lib/server/rate-limit/chisinau-day.test.ts
apps/web/tests/lib/server/rate-limit/client-network.test.ts
apps/web/tests/lib/server/rate-limit/contact-limit-answers.test.ts
apps/web/tests/lib/server/rate-limit/contact-policies.test.ts
apps/web/tests/lib/server/rate-limit/e2e-notice-across-judges.test.ts
apps/web/tests/lib/server/rate-limit/enforce-rate-limit.test.ts
apps/web/tests/lib/server/rate-limit/enforce-rate-limit.window-rules.test.ts
apps/web/tests/lib/server/rate-limit/judge-block-bucket.test.ts
apps/web/tests/lib/server/rate-limit/judge-mint-request.test.ts
apps/web/tests/lib/server/rate-limit/judge-read-request.test.ts
apps/web/tests/lib/server/rate-limit/judge-save-request.test.ts
apps/web/tests/lib/server/rate-limit/judge-share-write.test.ts
apps/web/tests/lib/server/rate-limit/limit-policy.test.ts
apps/web/tests/lib/server/rate-limit/network-source.test.ts
apps/web/tests/lib/server/rate-limit/page-limit-response.test.ts
apps/web/tests/lib/server/rate-limit/prune-rate-limits.test.ts
apps/web/tests/lib/server/rate-limit/qa-8g-read-fails-open.adversarial.test.ts
apps/web/tests/lib/server/rate-limit/qa-8g-refused-page-words.adversarial.test.ts
apps/web/tests/lib/server/rate-limit/rate-limit-store-instance.test.ts
apps/web/tests/lib/server/rate-limit/rate-limited-response.test.ts
apps/web/tests/lib/server/rate-limit/refusal-of-write-limit.test.ts
apps/web/tests/lib/server/rate-limit/save-limit-client-agreement.test.ts
apps/web/tests/lib/server/rate-limit/utc-window.test.ts
apps/web/tests/lib/server/read-body-with-limit.test.ts
apps/web/tests/lib/server/share-token.test.ts
apps/web/tests/lib/server/shipped-price-book.test.ts
apps/web/tests/lib/server/visitor.test.ts
apps/web/tests/lib/server/write-token.test.ts
apps/web/tests/panel/editor-panel-wiring.dom.test.ts
apps/web/tests/panel/panel-model.read-only.test.ts
apps/web/tests/panel/panel-model.save-paused.test.ts
apps/web/tests/panel/panel-model.seeded.qa.test.ts
apps/web/tests/panel/panel-model.test.ts
apps/web/tests/panel/qa-5b5-fixed-width.adversarial.test.ts
apps/web/tests/panel/qa-6r-control-shape.adversarial.test.ts
apps/web/tests/panel/width-stepper.qa.test.ts
apps/web/tests/persistence/client-write-generation.test.ts
apps/web/tests/persistence/client-write-path.adversarial.test.ts
apps/web/tests/persistence/client-write-path.test.ts
apps/web/tests/persistence/create-design-lock.test.ts
apps/web/tests/persistence/fetch-configuration-repository.adversarial.test.ts
apps/web/tests/persistence/fetch-configuration-repository.test.ts
apps/web/tests/persistence/mint-limit-reached.test.ts
apps/web/tests/persistence/qa-8f-mint-limit-code.adversarial.test.ts
apps/web/tests/persistence/qa-8g-return-while-waiting.adversarial.test.ts
apps/web/tests/persistence/qa-8g-save-wait.adversarial.test.ts
apps/web/tests/persistence/qa-8k2-failure-told.adversarial.test.ts
apps/web/tests/persistence/qa-8k2-order-of-answers.adversarial.test.ts
apps/web/tests/persistence/qa-8k2-round-trip.adversarial.test.ts
apps/web/tests/persistence/save-coalescer.adversarial.test.ts
apps/web/tests/persistence/save-coalescer.held-write.test.ts
apps/web/tests/persistence/save-coalescer.limit.test.ts
apps/web/tests/persistence/save-coalescer.return.test.ts
apps/web/tests/persistence/save-coalescer.test.ts
apps/web/tests/persistence/save-held-write-store.test.ts
apps/web/tests/persistence/save-limit-reached.test.ts
apps/web/tests/persistence/save-limit-store.test.ts
apps/web/tests/persistence/saved-design-bookkeeping.test.ts
apps/web/tests/persistence/share-link-client.test.ts
apps/web/tests/price/price-bar-layout.test.ts
apps/web/tests/proxy-escaped-locale.test.ts
apps/web/tests/proxy-page-read.test.ts
apps/web/tests/proxy.test.ts
apps/web/tests/qa-8g-interceptor-sweep.adversarial.test.ts
apps/web/tests/review/design-hrefs.test.ts
apps/web/tests/review/kitchen-picture.dom.test.ts
apps/web/tests/review/qa-8c-fit-is-the-querys-answer.adversarial.test.ts
apps/web/tests/review/qa-8c-inputs-are-one-designs.adversarial.test.ts
apps/web/tests/review/qa-8c-parity-with-the-price-surfaces.adversarial.test.ts
apps/web/tests/review/qa-8c-refusal-order.adversarial.test.ts
apps/web/tests/review/qa-8c-room-line-and-copy.adversarial.test.ts
apps/web/tests/review/qa-8c-submit-eligibility.adversarial.test.ts
apps/web/tests/review/qa-8d2-row-second-line.adversarial.test.ts
apps/web/tests/review/qa-8h-pricing-failure-stays-unseen.adversarial.test.ts
apps/web/tests/review/qa-8h-snapshot-parity.adversarial.test.ts
apps/web/tests/review/review-input-divergence.test.ts
apps/web/tests/review/review-model.test.ts
apps/web/tests/review/review-row-detail.test.ts
apps/web/tests/review/review-scene.dom.test.ts
apps/web/tests/review/review-submit-eligibility.test.ts
apps/web/tests/review/review-submit-precedence.test.ts
apps/web/tests/review/use-review.dom.test.ts
apps/web/tests/review/use-save-wait.dom.test.ts
apps/web/tests/room/qa-7f1-url-seam.adversarial.test.ts
apps/web/tests/room/qa-7f4b-handoff.adversarial.test.ts
apps/web/tests/room/qa-7l-suggestion-card-is-the-chip.adversarial.dom.test.ts
apps/web/tests/room/room-composition.dom.test.ts
apps/web/tests/room/room-handoff.dom.test.ts
apps/web/tests/room/room-screen.dom.test.ts
apps/web/tests/room/room-unreadable-on-blur.dom.test.ts
apps/web/tests/room/room-url-round-trip.dom.test.ts
apps/web/tests/scene/overflow-warning-layout.test.ts
apps/web/tests/scene/overflow-warning-loading.test.ts
apps/web/tests/settings/global-colour-group.test.ts
apps/web/tests/settings/global-settings-inert.dom.test.ts
apps/web/tests/settings/pending-choice-invariant.test.ts
apps/web/tests/settings/qa-0099-global-colour.adversarial.test.ts
apps/web/tests/settings/qa-w2-opening-choice.adversarial.test.ts
apps/web/tests/store/apply-write-access-stored-copy.test.ts
apps/web/tests/store/configurator-store.commands.test.ts
apps/web/tests/store/configurator-store.test.ts
apps/web/tests/store/newest-copy.test.ts
apps/web/tests/store/qa-8k2-revision-boundaries.adversarial.test.ts
apps/web/tests/store/qa-w2-editability-extraction.adversarial.test.ts
apps/web/tests/store/whole-kitchen-settings.qa.test.ts
```

### B. `apps/web` unit/dom/source-scan, read only (never seen red, not paired) (88)
```
apps/web/tests/app/configurator/configure/qa-w4-top-bar.adversarial.test.ts
apps/web/tests/app/configurator/configure/top-bar-box.test.ts
apps/web/tests/app/ink-faint-contrast.test.ts
apps/web/tests/app/review-stylesheet-classes.test.ts
apps/web/tests/contact/contact-source-names-no-browser-storage.test.ts
apps/web/tests/done/qa-8m-navigation-sources.adversarial.test.ts
apps/web/tests/done/send-on-whatsapp-sources.test.ts
apps/web/tests/i18n/navigation.test.ts
apps/web/tests/i18n/price-book-text.test.ts
apps/web/tests/i18n/webgl-witness.test.ts
apps/web/tests/lib/qa-8q-mode-pin-scan.adversarial.test.ts
apps/web/tests/lib/server/csp/csp-sink-source.test.ts
apps/web/tests/lib/server/design-errors.test.ts
apps/web/tests/lib/server/rate-limit/no-persistence-fake-in-source.test.ts
apps/web/tests/lib/server/rate-limit/no-test-only-reach-in-source.test.ts
apps/web/tests/lib/use-after-press.dom.test.ts
apps/web/tests/lint/room-example-dimensions.test.ts
apps/web/tests/panel/finish-swatch-colors.test.ts
apps/web/tests/panel/panel-model.adversarial.test.ts
apps/web/tests/panel/qa-6q-a-refusal-surface.adversarial.test.ts
apps/web/tests/persistence/report-overwrite-read-failure.test.ts
apps/web/tests/price/amount-with-currency-seam.test.ts
apps/web/tests/price/holds-nothing-lemnaria-supplies.test.ts
apps/web/tests/price/price-bar-model.test.ts
apps/web/tests/price/price-bar-states.adversarial.test.ts
apps/web/tests/price/price-bar-viewport.test.ts
apps/web/tests/price/price-breakdown-copy.test.ts
apps/web/tests/price/price-breakdown-model.test.ts
apps/web/tests/price/price-wiring.adversarial.test.ts
apps/web/tests/price/qa-6bg-money-seam.adversarial.test.ts
apps/web/tests/price/qa-6t2-accessory-rows.adversarial.test.ts
apps/web/tests/price/starting-price.adversarial.test.ts
apps/web/tests/price/starting-price.test.ts
apps/web/tests/proxy-matcher.test.ts
apps/web/tests/review/qa-8c-model-purity.adversarial.test.ts
apps/web/tests/review/qa-8h-one-caller-of-the-rule.adversarial.test.ts
apps/web/tests/review/review-body-count.test.ts
apps/web/tests/review/review-parity.test.ts
apps/web/tests/room/composition-bundle.test.ts
apps/web/tests/room/dimensions-form.dom.test.ts
apps/web/tests/room/generation-steps.dom.test.ts
apps/web/tests/room/parse-metres.adversarial.test.ts
apps/web/tests/room/parse-millimetres.test.ts
apps/web/tests/room/plan-preview-model-marking.test.ts
apps/web/tests/room/plan-preview-model.facing-labels.test.ts
apps/web/tests/room/plan-preview.dom.test.ts
apps/web/tests/room/qa-7f1-copy-and-conversions.adversarial.test.ts
apps/web/tests/room/qa-7f2-s1-issue-model.adversarial.test.ts
apps/web/tests/room/qa-7f2-s1b-millimetres.adversarial.test.ts
apps/web/tests/room/qa-7f2-s2-red-wall.adversarial.test.ts
apps/web/tests/room/qa-7f2-s5-incomplete-plan.adversarial.test.ts
apps/web/tests/room/qa-7f2-s5b-unreadable.adversarial.test.ts
apps/web/tests/room/room-issue-model.test.ts
apps/web/tests/room/room-query-sync.test.ts
apps/web/tests/room/room-url-state.test.ts
apps/web/tests/room/step-one-desktop-footer-centring.test.ts
apps/web/tests/scene/kitchen-canvas-view-only.test.ts
apps/web/tests/scene/kitchen-stage-disposal.test.ts
apps/web/tests/scene/kitchen-stage-no-controls.test.ts
apps/web/tests/scene/kitchen-stage-view-only.test.ts
apps/web/tests/scene/overflow-mark.test.ts
apps/web/tests/scene/overflow-warning-viewport.test.ts
apps/web/tests/scene/overflow-warning.test.ts
apps/web/tests/scene/qa-6m-criteria.adversarial.test.ts
apps/web/tests/scene/qa-6m-overflow-source.adversarial.test.ts
apps/web/tests/scene/view-of-wall.test.ts
apps/web/tests/scene/webgl-support-hook.dom.test.ts
apps/web/tests/settings/cabinet-depth-control.test.ts
apps/web/tests/settings/global-settings-modal-centring.test.ts
apps/web/tests/settings/global-settings-model.test.ts
apps/web/tests/settings/global-settings-seams.test.ts
apps/web/tests/settings/global-settings.adversarial.test.ts
apps/web/tests/settings/material-reset-confirm.adversarial.test.ts
apps/web/tests/settings/qa-0104-the-pill-at-every-rung.adversarial.test.ts
apps/web/tests/settings/qa-6t-negative-delta.adversarial.test.ts
apps/web/tests/settings/qa-6w-below-default-tier.adversarial.test.ts
apps/web/tests/settings/qa-w2-depth-group-fallback.adversarial.test.ts
apps/web/tests/settings/qa-w2-popover-viewport-clamp.adversarial.test.ts
apps/web/tests/share/absolute-share-address.dom.test.ts
apps/web/tests/store/cabinet-depth-legacy-fallback.test.ts
apps/web/tests/store/configurator-store.adversarial.test.ts
apps/web/tests/store/empty-columns-reload.test.ts
apps/web/tests/store/has-unsaved-edit.test.ts
apps/web/tests/store/qa-5b2b.adversarial.test.ts
apps/web/tests/store/qa-6k-a-cabinet-depth.adversarial.test.ts
apps/web/tests/store/qa-6k-d-second-deepening.adversarial.test.ts
apps/web/tests/store/qa-aud-005-recorded-map-offer-parity.adversarial.test.ts
apps/web/tests/store/whole-kitchen-settings.test.ts
```

### C. `apps/web` e2e specs (read only; Playwright not run) (71)
```
apps/web/tests/e2e/configure-route.e2e.spec.ts
apps/web/tests/e2e/contact-pages-per-request.e2e.spec.ts
apps/web/tests/e2e/contact-requests.e2e.spec.ts
apps/web/tests/e2e/contact-submission-route.e2e.spec.ts
apps/web/tests/e2e/contact-unavailable.e2e.spec.ts
apps/web/tests/e2e/csp-every-page.e2e.spec.ts
apps/web/tests/e2e/design-return-held-write.e2e.spec.ts
apps/web/tests/e2e/design-return-requests.e2e.spec.ts
apps/web/tests/e2e/design-return-stored-copy.e2e.spec.ts
apps/web/tests/e2e/design-write-path.e2e.spec.ts
apps/web/tests/e2e/global-colour.e2e.spec.ts
apps/web/tests/e2e/global-settings-apply.e2e.spec.ts
apps/web/tests/e2e/global-settings.e2e.spec.ts
apps/web/tests/e2e/kitchen-stage.e2e.spec.ts
apps/web/tests/e2e/locale-routing.qa.e2e.spec.ts
apps/web/tests/e2e/mint-limit-production-policy.e2e.spec.ts
apps/web/tests/e2e/mint-limit-step-one.e2e.spec.ts
apps/web/tests/e2e/overflow-mark.e2e.spec.ts
apps/web/tests/e2e/page-read-limit-proof.e2e.spec.ts
apps/web/tests/e2e/page-read-refused.e2e.spec.ts
apps/web/tests/e2e/pixel-counter-witness.adversarial.desktop.e2e.spec.ts
apps/web/tests/e2e/pixel-counter-witness.desktop.e2e.spec.ts
apps/web/tests/e2e/price-breakdown.desktop.e2e.spec.ts
apps/web/tests/e2e/qa-7e3b-owner-gate.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-7e3b-s6-lock.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-7e3c-share.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-7f2-s5b-unreadable.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8d-review-arrival.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8d-review-door.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8d-review-history.adversarial.desktop.e2e.spec.ts
apps/web/tests/e2e/qa-8d-review-history.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8d-review-save-wait.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8d-review-scene.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8d-review-screen.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8d2-review-frames.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8f-refused-mint-live.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8g-escaped-locale.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8g-leave-while-waiting.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8k-contact-live.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8k2-design-return.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8l-contact-doors.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8l-contact-limited-day.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8l-contact-no-js.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8l-contact-phone.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8m-after-sent.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8m-done-door.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8m-failure-screens.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8m-geometry.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8m-leaving.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8m-lost-answer.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8m-whatsapp.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8q-csp-enforced.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8q-csp-share-report.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8q-csp-sink.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8q-failed-render.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8q-no-js-form-enforced.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8q-tour-ru.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-8q-unmatched-sweep.adversarial.e2e.spec.ts
apps/web/tests/e2e/qa-m7c-c1-footer-centring.adversarial.desktop.e2e.spec.ts
apps/web/tests/e2e/qa-m7c-c1-s3-back.adversarial.e2e.spec.ts
apps/web/tests/e2e/room-desktop-line.criteria-03.desktop.e2e.spec.ts
apps/web/tests/e2e/room-desktop-line.criteria-04-10.desktop.e2e.spec.ts
apps/web/tests/e2e/room-desktop-line.criteria-12-17.desktop.e2e.spec.ts
apps/web/tests/e2e/room-to-editor.qa.e2e.spec.ts
apps/web/tests/e2e/save-limit-paused.e2e.spec.ts
apps/web/tests/e2e/shared-design-locale-identity.e2e.spec.ts
apps/web/tests/e2e/top-bar-back.qa-m7c-c1-s3.adversarial.desktop.e2e.spec.ts
apps/web/tests/e2e/u-gate.e2e.spec.ts
apps/web/tests/e2e/unmatched-addresses.e2e.spec.ts
apps/web/tests/e2e/visitor-identity.e2e.spec.ts
apps/web/tests/e2e/webgl-unavailable-i18n.e2e.spec.ts
```

### D. e2e support `*.test.ts` (7)
```
apps/web/tests/e2e/support/contact-run.test.ts
apps/web/tests/e2e/support/csp-violations.test.ts
apps/web/tests/e2e/support/e2e-rate-limit-run.test.ts
apps/web/tests/e2e/support/fake-mail-environment.test.ts
apps/web/tests/e2e/support/minted-designs.test.ts
apps/web/tests/e2e/support/no-csp-bypass.test.ts
apps/web/tests/e2e/support/pixels.test.ts
```

### E. `configurator-domain` tests not seen red under any mutant (read only) (157)
```
packages/configurator-domain/tests/backlog-50-the-corner-the-validator-cannot-see.test.ts
packages/configurator-domain/tests/backlog-51-chain-homogeneity-is-unreachable.test.ts
packages/configurator-domain/tests/body-label.test.ts
packages/configurator-domain/tests/build-depth.test.ts
packages/configurator-domain/tests/cabinet-depth-parameter.test.ts
packages/configurator-domain/tests/cabinet-handles.adversarial.test.ts
packages/configurator-domain/tests/cabinet-handles.test.ts
packages/configurator-domain/tests/catalog.test.ts
packages/configurator-domain/tests/catalogue-assembly-refusals.test.ts
packages/configurator-domain/tests/chosen-finishes.test.ts
packages/configurator-domain/tests/clip-empty-columns-at-wall-end.test.ts
packages/configurator-domain/tests/clip-empty-columns-to-free-ground.test.ts
packages/configurator-domain/tests/column-extents.test.ts
packages/configurator-domain/tests/commands/bottle-cargo-width-floor.test.ts
packages/configurator-domain/tests/commands/degenerate-inputs.test.ts
packages/configurator-domain/tests/commands/insert-body.boundaries.test.ts
packages/configurator-domain/tests/commands/insert-body.probe-contract.test.ts
packages/configurator-domain/tests/commands/insert-resize-width-agreement.test.ts
packages/configurator-domain/tests/commands/minimum-width.test.ts
packages/configurator-domain/tests/commands/qa-5b4a.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-5b8-pantry.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-5d2b.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-6q-a-set-finish.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-6x-slide-witness.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-c2s2-corner-unit.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-c4s2-corner-joint.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-w5b1.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-w5c.adversarial.test.ts
packages/configurator-domain/tests/commands/qa-w5c.enumeration.test.ts
packages/configurator-domain/tests/commands/qa-waves-ac.adversarial.test.ts
packages/configurator-domain/tests/commands/rejection-totality.test.ts
packages/configurator-domain/tests/commands/remove-placement.test.ts
packages/configurator-domain/tests/commands/replan-dependent-members.test.ts
packages/configurator-domain/tests/commands/set-appearance.test.ts
packages/configurator-domain/tests/commands/set-cabinet-depth.along-wall-chain.test.ts
packages/configurator-domain/tests/commands/set-whole-kitchen-settings.test.ts
packages/configurator-domain/tests/commands/set-width.creates-space.test.ts
packages/configurator-domain/tests/commands/set-width.hood.test.ts
packages/configurator-domain/tests/commands/set-width.test.ts
packages/configurator-domain/tests/commands/void-rules-via-mutation.test.ts
packages/configurator-domain/tests/contact/contact-fields.test.ts
packages/configurator-domain/tests/contact/contact-submission.test.ts
packages/configurator-domain/tests/contact/counted-form-of-address.test.ts
packages/configurator-domain/tests/contact/payload-digest.test.ts
packages/configurator-domain/tests/contact/phone-number.test.ts
packages/configurator-domain/tests/contact/qa-8h-contact-fields.adversarial.test.ts
packages/configurator-domain/tests/contact/qa-8h-contact-submission.adversarial.test.ts
packages/configurator-domain/tests/contact/qa-8h-package-purity.adversarial.test.ts
packages/configurator-domain/tests/contact/qa-8h-phone.adversarial.test.ts
packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts
packages/configurator-domain/tests/contact/submission-eligibility.test.ts
packages/configurator-domain/tests/contact/submission-snapshot.test.ts
packages/configurator-domain/tests/corner-assembly-size.right-corner.test.ts
packages/configurator-domain/tests/corner-assembly-size.test.ts
packages/configurator-domain/tests/design-bounds.test.ts
packages/configurator-domain/tests/design-identifiers.test.ts
packages/configurator-domain/tests/design-material.offer.test.ts
packages/configurator-domain/tests/design.test.ts
packages/configurator-domain/tests/empty-columns.test.ts
packages/configurator-domain/tests/failure-text.test.ts
packages/configurator-domain/tests/fixtures/demo-room-envelope.test.ts
packages/configurator-domain/tests/fixtures/seeded-body-names.adversarial.test.ts
packages/configurator-domain/tests/fixtures/wall-corner-return-kinds.test.ts
packages/configurator-domain/tests/frozen-map-declared-witnesses.test.ts
packages/configurator-domain/tests/generation/body-choice.test.ts
packages/configurator-domain/tests/generation/dishwasher-beside-the-sink.test.ts
packages/configurator-domain/tests/generation/fridge-end-leftover.test.ts
packages/configurator-domain/tests/generation/qa-7d3-upper-suppression.adversarial.test.ts
packages/configurator-domain/tests/generation/qa-7d4-composed-bodies.adversarial.test.ts
packages/configurator-domain/tests/generation/qa-7d5-pre-width-recorded.test.ts
packages/configurator-domain/tests/generation/qa-7d5b-s0-pre-state-census.adversarial.test.ts
packages/configurator-domain/tests/generation/qa-7d5b-s0-pre-state-witnesses.test.ts
packages/configurator-domain/tests/generation/qa-7d7-sized-shell.test.ts
packages/configurator-domain/tests/generation/qa-u3b-generating-a-u.adversarial.test.ts
packages/configurator-domain/tests/generation/shell-design.adversarial.test.ts
packages/configurator-domain/tests/generation/shell-design.linear.test.ts
packages/configurator-domain/tests/generation/shell-design.property.test.ts
packages/configurator-domain/tests/generation/shell-design.test.ts
packages/configurator-domain/tests/generation/shell-design.u.test.ts
packages/configurator-domain/tests/generation/tall-end-block.test.ts
packages/configurator-domain/tests/generation/tall-end-rule.test.ts
packages/configurator-domain/tests/generation/u-composition.drawer-split.test.ts
packages/configurator-domain/tests/generation/u-composition.property.test.ts
packages/configurator-domain/tests/generation/u-composition.s3.test.ts
packages/configurator-domain/tests/generation/u-composition.test.ts
packages/configurator-domain/tests/generation/u-composition.wall-a-remainder.test.ts
packages/configurator-domain/tests/legacy-finish-migration.test.ts
packages/configurator-domain/tests/millimetres.test.ts
packages/configurator-domain/tests/module-grid.test.ts
packages/configurator-domain/tests/pricing/finish-never-prices.test.ts
packages/configurator-domain/tests/pricing/hardware-tier-reconciliation.test.ts
packages/configurator-domain/tests/pricing/material-tiers.test.ts
packages/configurator-domain/tests/pricing/parse-price-book.test.ts
packages/configurator-domain/tests/pricing/price-design.test.ts
packages/configurator-domain/tests/pricing/pricing-seams.test.ts
packages/configurator-domain/tests/pricing/qa-6b-pricing.adversarial.test.ts
packages/configurator-domain/tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts
packages/configurator-domain/tests/pricing/qa-6b2-tier-amounts.adversarial.test.ts
packages/configurator-domain/tests/pricing/qa-6t-hardware-basis.adversarial.test.ts
packages/configurator-domain/tests/pricing/qa-6t2-sink-extras.adversarial.test.ts
packages/configurator-domain/tests/pricing/qa-m6-wave-b-parse-boundary.adversarial.test.ts
packages/configurator-domain/tests/pricing/qa-m6-wave-b-regate.adversarial.test.ts
packages/configurator-domain/tests/pricing/sink-extras.test.ts
packages/configurator-domain/tests/project-empty-columns.test.ts
packages/configurator-domain/tests/qa-0099-global-colour.adversarial.test.ts
packages/configurator-domain/tests/qa-5b2a.adversarial.test.ts
packages/configurator-domain/tests/qa-5b2b.adversarial.test.ts
packages/configurator-domain/tests/qa-5h.adversarial.test.ts
packages/configurator-domain/tests/qa-6a4.adversarial.test.ts
packages/configurator-domain/tests/qa-6k-c-frozen-source.adversarial.test.ts
packages/configurator-domain/tests/qa-6n-a-run-end-panel.adversarial.test.ts
packages/configurator-domain/tests/qa-6p.adversarial.test.ts
packages/configurator-domain/tests/qa-6q-a-load-seam.adversarial.test.ts
packages/configurator-domain/tests/qa-6q-a-offer.adversarial.test.ts
packages/configurator-domain/tests/qa-6q-b-command.adversarial.test.ts
packages/configurator-domain/tests/qa-6t-a-push-to-open.adversarial.test.ts
packages/configurator-domain/tests/qa-7d6-corner-literal-sweep-scope.adversarial.test.ts
packages/configurator-domain/tests/qa-8h-design-identifiers.adversarial.test.ts
packages/configurator-domain/tests/qa-accessory-deletion.qa.test.ts
packages/configurator-domain/tests/qa-room-correction.adversarial.test.ts
packages/configurator-domain/tests/qa-room-migration.adversarial.test.ts
packages/configurator-domain/tests/queries/describe-selection.qa.test.ts
packages/configurator-domain/tests/queries/describe-selection.test.ts
packages/configurator-domain/tests/queries/design-projection.test.ts
packages/configurator-domain/tests/queries/hob-base.adversarial.test.ts
packages/configurator-domain/tests/queries/offers.test.ts
packages/configurator-domain/tests/queries/pantry-resizable.test.ts
packages/configurator-domain/tests/queries/qa-6t2-rack-host.adversarial.test.ts
packages/configurator-domain/tests/queries/sink-accessories.test.ts
packages/configurator-domain/tests/queries/vacated-void.adversarial.test.ts
packages/configurator-domain/tests/queries/vacated-void.test.ts
packages/configurator-domain/tests/queries/width-options.qa.test.ts
packages/configurator-domain/tests/queries/width-options.test.ts
packages/configurator-domain/tests/queries/width-resolution.adversarial.test.ts
packages/configurator-domain/tests/repository.test.ts
packages/configurator-domain/tests/resolved-finish.test.ts
packages/configurator-domain/tests/room/carries-corner-direction.test.ts
packages/configurator-domain/tests/room/corner-direction.test.ts
packages/configurator-domain/tests/room/is-shape-buildable.test.ts
packages/configurator-domain/tests/room/minimum-kitchen.test.ts
packages/configurator-domain/tests/room/qa-7a3-the-6000mm-boundaries.adversarial.test.ts
packages/configurator-domain/tests/room/qa-7i-corner-direction.adversarial.test.ts
packages/configurator-domain/tests/room/qa-7j-straight-room.adversarial.test.ts
packages/configurator-domain/tests/room/u-minimum-kitchen.test.ts
packages/configurator-domain/tests/room/validate-room.property.test.ts
packages/configurator-domain/tests/room/validate-room.test.ts
packages/configurator-domain/tests/run-end-panel.test.ts
packages/configurator-domain/tests/structural-cabinetry-follows-the-kitchens-colour.test.ts
packages/configurator-domain/tests/the-corner-wears-a-colour.test.ts
packages/configurator-domain/tests/validate-design.test.ts
packages/configurator-domain/tests/void-engine-span-overlap.test.ts
packages/configurator-domain/tests/void-engine.boundaries.test.ts
packages/configurator-domain/tests/void-engine.corner-record.test.ts
packages/configurator-domain/tests/void-engine.test.ts
packages/configurator-domain/tests/worktop-depth.qa.test.ts
packages/configurator-domain/tests/worktop-depth.test.ts
packages/configurator-domain/tests/zod-without-eval.test.ts
```

### F. `configurator-domain` tests seen red (4)
```
packages/configurator-domain/tests/along-wall-chain-shift.test.ts
packages/configurator-domain/tests/commands/6x-a-slide-direction.test.ts
packages/configurator-domain/tests/commands/qa-6x-a-slide-direction.adversarial.test.ts
packages/configurator-domain/tests/commands/set-cabinet-depth.frozen-map.test.ts
```

### G. `three-adapter` (one file mutated) (39)
```
packages/three-adapter/tests/cabinet-depth-source.test.ts
packages/three-adapter/tests/catalog-bodies.adversarial.test.ts
packages/three-adapter/tests/catalog-bodies.test.ts
packages/three-adapter/tests/catalog-capability-parity.test.ts
packages/three-adapter/tests/finishes.test.ts
packages/three-adapter/tests/hob-base.test.ts
packages/three-adapter/tests/hob-front-clearance.parity.test.ts
packages/three-adapter/tests/insert-depth.test.ts
packages/three-adapter/tests/kitchen-parts.contract.test.ts
packages/three-adapter/tests/kitchen-shell.characterisation.test.ts
packages/three-adapter/tests/kitchen-shell.room-shaped.test.ts
packages/three-adapter/tests/kitchen-shell.u.test.ts
packages/three-adapter/tests/measure-built-body.adversarial.test.ts
packages/three-adapter/tests/measure-built-body.test.ts
packages/three-adapter/tests/overflow-mark.test.ts
packages/three-adapter/tests/pantry-resize.test.ts
packages/three-adapter/tests/perete-a-framing.test.ts
packages/three-adapter/tests/picking.test.ts
packages/three-adapter/tests/push-to-open-seam.parity.test.ts
packages/three-adapter/tests/qa-0099c-each-unchoosing-body-by-name.adversarial.test.ts
packages/three-adapter/tests/qa-6k-d-real-probe-round-trip.test.ts
packages/three-adapter/tests/qa-6k-de-repeated-real-probe.adversarial.test.ts
packages/three-adapter/tests/qa-6m-mark-composite.adversarial.test.ts
packages/three-adapter/tests/qa-6t-a-scene-price-seam.adversarial.test.ts
packages/three-adapter/tests/qa-7d1b-panel-wall-end-veto.adversarial.test.ts
packages/three-adapter/tests/qa-7h-preset-stands-clear.adversarial.test.ts
packages/three-adapter/tests/qa-7j-straight-room.adversarial.test.ts
packages/three-adapter/tests/qa-item8-deep-top-geometry.adversarial.test.ts
packages/three-adapter/tests/qa-w5-sink-centring.adversarial.test.ts
packages/three-adapter/tests/right-corner-wrapper.wall-guard.test.ts
packages/three-adapter/tests/scene-sync.appearance.test.ts
packages/three-adapter/tests/scene-sync.test.ts
packages/three-adapter/tests/sink-declaration.parity.test.ts
packages/three-adapter/tests/stage.test.ts
packages/three-adapter/tests/stage.u-cameras.test.ts
packages/three-adapter/tests/swap-depth.test.ts
packages/three-adapter/tests/the-corner-wears-a-colour.test.ts
packages/three-adapter/tests/void-mesh.test.ts
packages/three-adapter/tests/wall-corner-x.test.ts
```

### H. `persistence` (skipped: the suite is not to be run, subjects touch the database) (77)
- `packages/persistence/tests`: 77 files

### I. `scripts/gates` (2)
```
scripts/gates/boundary.test.mjs
scripts/gates/e2e-shard-budget.test.mjs
```
