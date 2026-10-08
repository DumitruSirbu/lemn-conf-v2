# Tests review — which tests give no real protection

**Date:** 2026-10-08 · **Audited commit:** `fd2c958` (branch `m8-review-contact-success`) · **Status:** report only,
no test or production file was changed.

The owner's question: how many tests only simulate a check, exist to be green, repeat another test with a
trivial change, are obsolete, or are useless — and why. This file is the list and the argument for each.

## Verdict

**674 entries covering about 1,255 test cases are flagged, out of roughly 9,980 cases in 917 test files — about
one case in eight.** Two thirds of that is redundancy rather than falsehood: the suite is mostly honest, but it
carries a lot of duplicated weight, and it contains a hard core of about 280 cases that are proven unable to
fail.

| Category | Entries | Cases | How it was established |
| --- | --- | --- | --- |
| **Cannot fail — proven** | 157 | 277 | 103 entries (204 cases): production behaviour was broken in an isolated worktree and the test stayed green while another test went red. 54 entries (73 cases): no production value reaches the assertion at all |
| Cannot fail — mutation survived, no witness | 38 | 59 | The test stayed green under the mutation and so did its neighbours; may be an equivalent mutant |
| Cannot fail — by reading only | 7 | 7 | Playwright and persistence suites, which were not run |
| **Near-duplicate** | 406 | 835 | Independent second read of both tests and the production path |
| Obsolete | 11 | 11 | Second read plus a search for the subject |
| Useless | 55 | 66 | Second read |
| **Total** | **674** | **1,255** | |

Of the "cannot fail" group, 171 entries (288 cases) are **fake-checks** and 31 entries (55 cases) are
**green-only**.

| Package | Entries | Cases |
| --- | --- | --- |
| `packages/configurator-domain` | 317 | 584 |
| `apps/web` | 259 | 476 |
| `packages/three-adapter` | 64 | 139 |
| `packages/persistence` | 33 | 51 |
| `scripts/gates` | 1 | 5 |

**What to do with each group is different.** A near-duplicate can be deleted, keeping the test named in its
**Keep** note. A fake-check usually should **not** be deleted: its title names a real requirement that nothing
is checking, so the fix is to make the assertion real. Three duplicate entries are marked **Pair** — each
names the other as the one to keep, so remove one of the two, never both.

## What the bad tests look like

Six shapes account for almost every "cannot fail" entry. Each example below is in the tables with its proof.

1. **The test asserts on values it declared itself.** `share-link-route.test.ts:364` checks that a matrix has
   `cases × methods` rows, where the matrix is the `flatMap` of those same two arrays three lines above.
   `top-bar-fit.test.ts:277` subtracts two literals written in the test file. `repository.test.ts:33` runs
   three cases against an in-memory repository class defined inside the test.
2. **A regex over source text stands in for behaviour.** `price-bar-layout.test.ts:195` looks for the string
   `"--price-bar-height": …` in `price-bar.tsx`. With the published value changed to `0px` and the original
   literal left in an unused constant, the test passed — and so did all 290 tests under `tests/price`
   (reproduced by the coordinator).
3. **Both sides of the comparison come from the same source.** `content.test.ts:463` compares resolved copy
   with a translation of the same catalogue key, so any wording of a plural branch passes.
   `qa-7f2-s5b-unreadable.adversarial.test.ts:92` computes its expected value by calling the parser under test.
4. **The fixture does not isolate the rule.** `write-authorization.test.ts:466` claims to witness the 800 mm
   empty-column ceiling, but its column also overlaps a placement, so a different refusal answers. Deleting the
   ceiling check left it green. `picking.test.ts:162` is titled "a void never swallows a click" and passes an
   empty void group.
5. **The assertion is too loose to notice.** `qa-w5b1.adversarial.test.ts:531` is titled "publishes a known
   reason for each side" and only asserts one specific reason is absent. Replacing a real reason with `"bogus"`
   left it green while two other tests in the same file went red (reproduced by the coordinator).
6. **A loop or early return runs zero assertions.** A sweep in `qa-7j-straight-room` returns early when the
   seat is `undefined`, so a function that always returns `undefined` passes all 13 rows.

**Near-duplicates have one dominant cause:** the delivery cycle adds an adversarial `qa-*` file per wave, and
that file re-states cases the original `*.test.ts` already had (or the later sweep fully contains the earlier
hand-picked example). Several pairs are byte-equivalent, for example `write-authorization.test.ts:496` and
`write-authorization.adversarial.test.ts:242`.

## How this was produced

1. **Static triage of every case.** A TypeScript-AST script over all 917 files flagged cases with no
   assertion, self-comparisons, weak-only matchers, mock-only assertions and identical bodies. It found little
   (14 no-assertion cases, 38 identical-body pairs), which showed the problem is semantic and needs reading.
2. **Full read.** The suite was split into 41 slices and each was read completely by a read-only auditor,
   checking candidates against the production code. All 917 files were read; 945 candidates were raised.
3. **Verification of every candidate**, because a reader's claim is a lead and not a proof:
   - 243 "cannot fail" claims in runnable suites went to mutation: the production behaviour named in the
     test's title was broken in a private worktree, the candidate test was run alone, and for survivors the
     neighbouring tests were run to prove the mutation had landed. Baseline before mutation was green
     (domain 7,857, three-adapter 4,391, web 6,227 tests). All eight worktrees were byte-restored and are clean.
   - 702 duplicate, obsolete, useless and non-runnable claims went to a second, independent reader instructed
     to defend each test and confirm only what survived.
4. **271 candidates were cleared** — 47 because a mutation turned the test red, 221 on the second read, 3 left
   unresolved. They are listed in the appendix so they are not raised again.

## Evidence tiers and limits

- **Mutation survived** and **No production input** are measured or directly quotable. Two of the surviving
  mutations were re-run by the coordinator and reproduced exactly; the rest are the verifiers' recorded runs.
- **Near-duplicate, obsolete and useless verdicts are inference from reading**, not a coverage measurement.
  Before deleting one, run the kept test against a mutation of the shared code path.
- **"Mutation survived, no witness"** is weaker: nothing else went red, so the mutation may be equivalent.
- **Not run:** Playwright e2e and live-database persistence suites. Their entries rest on reading.
- **A file with no entry is not proven clean.** Recall of the first read is unknown; the list is a floor.
- **Case counts are approximate.** A flagged `it.each` group is counted by its rows where the reader counted
  them, and the total of ~9,980 is the readers' count of cases as written, not the runtime test count.
- **Line numbers are those of commit `fd2c958`.** The branch has moved since; re-locate by test title.
- One reader also reported that `write-token-schema.adversarial.test.ts` skips in CI without announcing it.
  That was not verified here.

## 1. Tests that cannot fail for the reason they were written (fake-check and green-only)

### 1a. Proven — a real mutation survived, or no production value reaches the assertion

#### `apps/web` — 53 entries, 78 cases

**`tests/app/api/designs/qa-7e3a-visitor.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 346 | ignores a case-variant prefix `__host-lemnaria_visitor` | 1 | **Mutation survived**. Mutation: apps/web/src/lib/server/visitor.ts readVisitorValue — also reads cookie `__host-lemnaria_visitor` as a fallback. Went red instead: apps/web/tests/app/api/designs/qa-7e3b-owner-gate.adversarial.test.ts:314 property 'criterion 2 — one refusal across every refusal case (GET)' went red (passes on baseline, EXIT=0) | Test only asserts minted value != KNOWN_VALUE; under H1 every mint is fresh so adopting the wrong-case name still passes. No visitor-identity/qa-7e3a-visitor test went red. | **W1-A strengthened** — red under mutation |

**`tests/app/api/designs/share-link-route.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 364 | covers every case × method combination (${MATRIX_CASES.length} total) | 1 | **No production input** (static) | share-link-route.test.ts:365 `expect(MATRIX_CASES.length).toBe(ALL_REFUSAL_CASES.length * ALL_METHODS.length)`; MATRIX_CASES is the flatMap of those same two file-local arrays (lines 328, 348, 356-361). No production symbol feeds either side. | **W1-A strengthened** — red under mutation |

**`tests/app/api/designs/write-authorization.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 361 | is absent from the mint response body and from the GET response | 1 | **Mutation survived**. Mutation: apps/web/src/app/api/designs/route.ts:~66 body { id, revision } -> { id, revision, token: writeToken.token }. Went red instead: apps/web/tests/app/api/designs/write-authorization.test.ts 'POST /api/designs > never puts the token in the response body, where script could read it' went red | mintedBody comes from a second POST whose token differs from the first mint's `token`, so the not.toContain can never fail; GET half is real. | **W1-A strengthened** — red under mutation |

**`tests/app/api/designs/write-authorization.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 466 | refuses an empty column wider than the ceiling, and stores nothing | 1 | **Mutation survived**. Mutation: packages/configurator-domain/src/validate-design.ts:236 deleted `...findOversizedEmptyColumns(emptyColumns),` (domain rebuilt, restored, rebuilt). Went red instead: apps/web/tests/app/api/designs/qa-5g.adversarial.test.ts:188 'refuses a space one millimetre over the ceiling, and stores nothing' went red | Fixture also overlaps seeded placements so the overlap refusal alone yields 400 DESIGN_INVALID; the single-fault twin in qa-5g is the real witness. | **W1-A removed** — redundant; a named sibling went red under the same mutation |

**`tests/app/configurator/configure/qa-w4-top-bar.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 249 | starts the canvas where the stylesheets put it / accounts for every pixel of the viewport it was measured at / puts every tap inside the canvas box the spec declares | 1 | **No production input** (static). Mutation: configure.module.css:596 desktop row 76px -> 80px (to settle the other two cases) | Group split. Only 'puts every tap inside the canvas box the spec declares' is static: `expect(Number(y)).toBeGreaterThan(originY)` compares tests/e2e/support/desktop-scene-points.ts against numbers parsed from prose in the e2e spec; no production symbol feeds it. The other two are tied to the stylesheet's 76px (DESKTOP_HEADER_HEIGHT_PX) and went red, so they are killed. | **W1-A strengthened** — red under mutation |

**`tests/app/configurator/configure/top-bar-box.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 468 | is a button that opens a list of links, one per configured locale / is named by a sentence rather than by the two letters it draws / keeps the sentence as the pill's accessible name | 3 | **Mutation survived**. Mutation: locale-menu.tsx: aria-haspopup="true" and (separately) aria-label={content.configure.localeMenu} turned into attribute-position /* comments */; configure-screen.tsx:148 aria-label={content.configure.step} likewise. Went red instead: tests/i18n/locale-menu.dom.test.ts 'gives ro/ru a trigger that says what it opens...' (haspopup) and 'names ro's/ru's trigger with a sentence...' (aria-label) went red | Source-text toContain passes while the attribute is gone from the rendered element. The pill's aria-label mutation (case 3) is survived-unwitnessed: the whole tests/app/configurator/configure dir (214 tests) stayed green. | **W1-A part** — two cases removed as redundant (siblings red); the pill's accessible name strengthened and moved to `locale-menu.dom` |
| 522 | draws the caret the frames draw, and hides it from a screen reader | 1 | **Mutation survived**. Mutation: locale-menu.tsx:123 removed aria-hidden="true" from the localeCaret span. Went red instead: tests/i18n/locale-menu.dom.test.ts 'hides the caret from the accessibility tree, and draws it for everyone else' went red | Case asserts only the '▾' text and a non-empty .localeCaret rule; nothing about hiding it from a screen reader. | **W1-A removed** — redundant; a named sibling went red under the same mutation |

**`tests/app/configurator/configure/top-bar-fit.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 277 | returns 105 px to the pill when it does, composed from the two frames' own gaps | 1 | **No production input** (static) | top-bar-fit.test.ts:277 `expect(DEMAND_PX.asDrawn - DEMAND_PX.gapsClosed).toBeCloseTo(105, 2)`; DEMAND_PX is the file-local object at line 42 with literals asDrawn: 918.55 and gapsClosed: 813.55 (918.55-813.55=105). D2A_SPACING/FRAME_2A_SPACING are not read by either operand. | **W1-A strengthened** — red under mutation |

**`tests/app/ink-faint-contrast.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 99 | is darker than the value the mockups drew, which is why this file exists | 1 | **Mutation survived**. Mutation: apps/web/src/app/globals.css:17 --ink-faint #6b6860 -> #8a877f (a lighter grey than the mockups' #7d7a72). Went red instead: same file, the four 'clears 4.5:1 on ...' cases went red | The production-facing half is only `expect(inkFaint).not.toBe('#7d7a72')`; the contrast line uses a literal and --paper, not --ink-faint. Reverting the token to exactly #7d7a72 does turn the case red (EXIT=1), but any other failing grey leaves it green, so the 'darker than' title is not what it checks. | **W1-A strengthened** — red under mutation |

**`tests/app/shared-design-page.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 55 | hashes a well-formed token and looks it up | 1 | **Mutation survived**. Mutation: apps/web/src/lib/server/sha256-hex.ts:19 sha256Hex returns its input unchanged. Went red instead: tests/lib/server/visitor.test.ts 'readVisitorHash > returns the SHA-256 digest of a well-formed cookie value' (and 5 more, incl. share-link-route.test.ts 'POST issues a link...') went red | Expected value is sha256Hex(token) from the same module the page calls, so the case proves only pass-through. Hash correctness is witnessed in other files. | **W1-A strengthened** — red under mutation |

**`tests/i18n/content.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 143 | keeps catalogue key and public argument checking in the TypeScript contract | 1 | **No production input** (static) | content.test.ts:144-145 `expect(CONTENT_TRANSLATOR_REJECTS_UNKNOWN_KEY).toBe(true)` is a file-local const typed `"panel.clsoe" extends ContentKey ? false : true = true` (line 33-35), and `CONTENT_SIGNATURE_WITNESSES` is toEqual-ed against an identical literal written in the same file (lines 58-70 vs 145-151). The contract lives in tsc, not in this runtime assertion; no production value feeds either side. | **W1-A unchanged** — a `tsc` guard, not a Vitest one: a deliberate type violation fails the typecheck |
| 463 | selects the %s CLDR category at %i | 7 | **Mutation survived**. Mutation: apps/web/src/messages/ro.json:158 panel.countForBody `few {# dulapuri}` -> `few {# dulapur}`. Went red instead: tests/i18n/golden-output.test.ts 'matches the checked-in fixture-id to SHA-256 manifest' and tests/i18n/romanian-copy-lock.test.ts 'holds ro.json to the locked corpus leaf for leaf' went red | Both sides come from the same catalogue (resolved content vs translate('panel.countForBody')), so any wording of any plural branch passes; only Intl.PluralRules is compared to a literal. Copy lock and golden hashes are the real witnesses. | **W1-A strengthened** — red under mutation |

**`tests/i18n/price-book-text.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 273 | recognises each of the three claims the owner trimmed / recognises the same claim in Russian / lets a ruled leaf through | 3 | **No production input** (static) | price-book-text.test.ts:273-330: assertions are `INCLUSION_WORDS.ro.test(claim)`, `INCLUSION_WORDS.ru.test(claim)` and `unruledInclusionClaimsIn(leaves, ...)` over string/array literals in the case; INCLUSION_WORDS (line 214) and unruledInclusionClaimsIn (line 236) are declared in the same file. No catalogue or production symbol feeds the asserted expressions; they are positive controls for the sweep's own detector (their stated purpose). | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |
| 332 | records a reason for every exemption it holds | 1 | **No production input** (static) | price-book-text.test.ts:332 `for (const entry of RULED_TO_STATE_INCLUSION)` iterates the file-local `const RULED_TO_STATE_INCLUSION: readonly RuledInclusionClaim[] = [];` (line 235), so zero expectations run. It becomes live only if someone adds an entry; no production edit can fail it. | **W1-A strengthened** — red under mutation |

**`tests/lib/persistence-imports.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 106 | recognises a value import as one, so the sweep above is not vacuous | 1 | **No production input** (static) | persistence-imports.test.ts:106-132 feeds template-string literals to importsTypesOnly and persistenceImportsIn, both declared in the same file (lines 51-72); PERSISTENCE_PACKAGE is a file-local const. No production module is read. It is a self-test of the sweep's matcher, which is its stated purpose. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/lib/server/qa-7e3b-shared-repository-type.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 28 | declares its shape as the write port with load omitted, plus the gated read | 1 | **Mutation survived**. Mutation: apps/web/src/lib/server/repository.ts:24 SharedRepository = AuthorizedConfigurationRepository & ... (Omit removed), with the Omit text kept in a // comment. Went red instead: not a vitest test: `tsc --project tsconfig.json --noEmit` (tests/ is in the include) reports tests/lib/server/qa-7e3b-shared-repository-type.test.ts(17,1): error TS2578 Unused '@ts-expect-error' directive. tests/lib/server (127 vitest tests) stayed green. | The runtime case is a regex over source text and passes with the Omit in a comment while `load` is reachable. The real guard is the typecheck gate, which the mutation does trip. | **W1-A unchanged** — a `tsc` guard, not a Vitest one: a deliberate type violation fails the typecheck |

**`tests/lib/server/write-token.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 65 | calls no non-cryptographic random source anywhere in the module | 1 | **Mutation survived**. Mutation: apps/web/src/lib/server/write-token.ts:31 randomBytes(WRITE_TOKEN_BYTES) replaced by Buffer.from(Array.from({length}, () => Math["random"]() * 256)). Went red instead: tests/lib/server/write-token.test.ts 'mintWriteToken > draws its token from the platform CSPRNG, at 256 bits' went red | Source regex misses Math["random"](); the behavioural spy test is the real guard here (unlike share-token, where a dummy randomBytes call also defeats the spy, see s06.3). | **W1-A strengthened** — red under mutation |

**`tests/lib/use-after-press.dom.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 234 | an element's own blur leaves the action waiting | 1 | **Mutation survived**. Mutation: apps/web/src/lib/use-after-press.ts:~99 blur listener: removed the isOwnEventOf(event) guard so every window blur calls interrupted(). Went red instead: tests/lib/use-after-press.dom.test.ts 'what does not interrupt a press held down (review R1.1) > a synthetic blur that bubbles from an element leaves the action waiting' (line ~246) went red | A non-bubbling blur dispatched on the element never reaches the window's bubble-phase listener, so runs() is 0 whether or not the guard exists; the bubbling-blur case is the real guard. | **W1-A removed** — redundant; a named sibling went red under the same mutation |

**`tests/panel/qa-5b5-fixed-width.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 211 | gives no width section to any void in %s | 1 | **Mutation survived**. Mutation: apps/web/src/panel/panel-model.ts:~816 — deleted the `if (options.length === 0) return undefined;` gate in describeWidthSection so empty-option targets (voids) get a width section. Went red instead: same file:211 rows 'a kitchen with an emptied column' and 'a kitchen already resized once' went red | Shipped-kitchen row has zero voids, so the loop never runs and the closing `toBeGreaterThanOrEqual(0)` is always true; the mutation landed (two sibling rows red) yet that row stayed green. Reader is right for that row only. | **W1-A strengthened** — red under mutation |

**`tests/panel/qa-6q-a-refusal-surface.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 165 | names every declared material exactly once, and three distinct shapes | 1 | **No production input** (static) | `expect(new Set(Object.values(CONTROL_BY_MATERIAL)).size).toBe(3)` is over CONTROL_BY_MATERIAL, a table the test file declares itself. Only the other assertion in the case (`Object.keys(CONTROL_BY_MATERIAL)` equals `MATERIALS.map(...)`) reads production; I did not mutate that half, so the case as a whole is not vacuous. | **W1-A strengthened** — red under mutation |

**`tests/persistence/client-write-path.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 185 | keeps the id stable across every write after the mint | 1 | **Mutation survived**. Mutation: apps/web/src/persistence/save-coalescer.ts:161 — scheduleSave returns early when the identity already has a design id (no PUT after the mint). Went red instead: tests/persistence/client-write-path.adversarial.test.ts:166 'writes the last design of a burst that spans the interval window' went red | With no PUT ever sent, the `for (const write of writesOf())` loop runs zero times and the case passes; no non-empty guard. Reader is right. | **W1-A strengthened** — red under mutation |

**`tests/price/amount-with-currency-seam.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 132 | changes no minor-unit value when the locale changes | 1 | **Mutation survived**. Mutation: packages/configurator-domain/src/pricing/price-design.ts:103 — totalMinor gains +1 when Intl default locale is en-US (domain rebuilt). Went red instead: packages/configurator-domain/tests/pricing/price-design.test.ts 'returns the exact sum of its lines in minor units' and 'prices an empty design as its two whole-kitchen lines' went red | priceSeededKitchen() takes no locale, so both arms run identical code in one process and always agree; an ambient-locale dependence in priceDesign is invisible. Reader is right: it is a determinism check. price-bar-model.test.ts also green. | **W1-A strengthened** — red under mutation |

**`tests/price/price-bar-states.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 441 | is a real occlusion, not a hypothetical: the sheet's box contains the bar's | 1 | **Mutation survived**. Mutation: apps/web/src/price/price-bar-layout.ts:20 — PRICE_BAR_RESERVED_HEIGHT_PX 92 -> 700. Went red instead: tests/price/price-bar-viewport.test.ts 'keeps every body tappable with a 48 px header and a 700 px bar' (and many sibling rows) went red; tests/scene/overflow-warning-viewport.test.ts also red | The closing arithmetic uses literals (844, 0.78, 92) the test wrote, so changing the real constant is invisible; the CSS regexes check .shell text only. Reader is right. | **W1-A strengthened** — red under mutation |

**`tests/price/price-wiring.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 440 | would stop being load-bearing at a zero reserve, which is what makes it a counterfactual | 1 | **Mutation survived**. Mutation: apps/web/src/price/price-bar-layout.ts:20 — PRICE_BAR_RESERVED_HEIGHT_PX 92 -> 0. Went red instead: same file, 'keeps the counterfactual load-bearing at the height the bar actually reserves' went red | The case never reads the constant: it compares projected bottoms to the 844 viewport height with a 64 px header, a pure framing property. The sibling case that does read the constant is the one that notices a zero reserve (the in-test comment says as much). | **W1-A strengthened** — red under mutation |

**`tests/price/starting-price.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 308 | kills digit and sum-claim mutations authored inside ICU branches | 1 | **No production input** (static) | Inputs are string literals the test wrote (`<strong>Total 3 items</strong>`, a plural message) fed to authoredLiteralsIn from tests/support/icu-authored-literals; SUM_CLAIM_PATTERN is declared in the test file. Asserted lines: `expect(taggedLiterals).toEqual(["Total 3 items"])` and the regex matches on it. It is non-vacuity for a support helper, as the reader said. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/proxy.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 488 | applies the exact static header set to every route | 1 | **Mutation survived**. Mutation: apps/web/src/lib/security-headers.ts:69 — X-DNS-Prefetch-Control value "off" -> "on". Went red instead: tests/lib/security-headers.test.ts 'STATIC_SECURITY_HEADERS > is exactly the versioned set every response must carry' went red | Expected side is `[...STATIC_SECURITY_HEADERS]` from the same module next.config spreads, so a changed value stays equal on both sides; the sibling :495 pins only four keys. The value is pinned elsewhere (security-headers.test.ts), so the property is guarded, just not by this case. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/review/qa-8c-room-line-and-copy.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 189 | are swept in every category the language has: one, few and other | 1 | **No production input** (static) | `reached = BODY_COUNT_WORDS.ro.map(([bodyCount]) => romanian.select(bodyCount))` where BODY_COUNT_WORDS is a const table declared at qa-8c-room-line-and-copy.adversarial.test.ts:57 and `romanian` is `new Intl.PluralRules("ro")` (Node ICU). The asserts count categories; no apps/web or domain symbol is involved. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/review/qa-8h-one-caller-of-the-rule.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 189 | hands the rule no list but the fit query's answer for the design under review | 1 | **Mutation survived**. Mutation: apps/web/src/review/review-model.ts:~197 — judgeFor passes `overflowingPlacementIds.filter(() => false)` to the rule (ignores the list, keeps every searched source string). Went red instead: tests/review/qa-8c-fit-is-the-querys-answer.adversarial.test.ts 'refuses a kitchen that fits, naming the bodies the query reports' (3 red) and review-submit-eligibility.test.ts (15+ red) | Caveat: the literal `overflowingPlacementIds: []` DID turn this case red, via its `not.toMatch(/overflowingPlacementIds\s*:\s*\[/)` clause, so it is not blind to that edit; only a behavioural change spelled differently passes. The text pin is a guard, and the behaviour is guarded by the sibling suites. | **W1-A removed** — redundant; a named sibling went red under the same mutation |

**`tests/room/attempt-construction-sites.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 67 | counts a second call site, including one the compiler would accept | 1 | **No production input** (static) | `expect(callSitesIn(twoSites)).toBe(2)` and `expect(callSitesIn("export function createDesignCreationAttempt({ design }) {")).toBe(0)`: callSitesIn is a regex helper declared at attempt-construction-sites.test.ts:21 and the inputs are two string literals in the case. Matcher self-check, as the reader said; the real guards are the cases at :54 and :61. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/room/composition-bundle.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 113 | crosses a frame with both calls, not just a timer or just an animation frame | 1 | **Mutation survived**. Mutation: apps/web/src/room/use-generation.ts:388-393 — theNextPaint calls requestAnimationFrame(noop) and setTimeout(noop) but resolves immediately. Went red instead: tests/room/qa-7f4a-composition-run.adversarial.test.ts 'balances the ledger when a second run starts before the first has settled' and 'never paints the abandoned run's outcome...' went red | The case regex-extracts the function text and checks it contains both call names, so a body that resolves in the same tick still passes. Reader is right. generation-steps.dom and room-composition.dom stayed green. | **W1-A strengthened** — red under mutation |

**`tests/room/dimensions-form.dom.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 684 | would catch $pattern, which matches $sample | 9 | **No production input** (static) | `expect(sample).toMatch(pattern)` iterates BOUND_WORDS, a const table declared at dimensions-form.dom.test.ts:411 holding both pattern and sample (10 `sample:` entries counted by grep, 9 pattern rows per the batch). Neither side reads ro.json or the form; the real check is the sibling at :672. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/room/parse-metres.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 312 | reads %j as nothing, or as exactly %i mm | 4 | **Mutation survived**. Mutation: apps/web/src/room/parse-metres.ts:21 — METRES_PATTERN /^(\d+)(?:[.,](\d+))?$/ -> /^(\d*)(?:[.,](\d*))?$/ (empty whole or fraction part accepted). Went red instead: same file: 'agrees with an integer-only reading of the rule' (property test), 'refuses ","' and 'refuses "."' went red | expectRefusedOrExactly accepts a refusal or the exact value, and under the mutation '3,', '3.', ',5', '.45' read as exactly 3000/3000/500/450, so all four pass. Reader is right: the cases cannot fail for the shapes they name unless the parser yields a wrong positive value. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |
| 410 | multiplies nothing and uses no float, rounding or locale machinery | 1 | **Mutation survived**. Mutation: apps/web/src/room/parse-metres.ts:51 — `Number(whole + millimetreDigits)` replaced by `(Number(whole + "." + millimetreDigits) / 0.001) \| 0` (float division, no `*`, `Math.` or banned name). Went red instead: parse-metres.adversarial.test.ts 'reads back every value from 1 to 99 999 mm written with a decimal point' and the oracle property tests (8 red); parse-metres.test.ts 'reads back every value from 1 to 99 999 mm written with a decimal comma' red | The case regexes the comment-stripped source for `*\|parseFloat\|Math.\|toFixed\|toPrecision\|Intl\|toLocale`; a float path spelled with `/ 0.001 \| 0` slips through. Conversely the earlier regex edit (`\d*` in the pattern) turned it red by accident, since the character `*` is banned. Behaviour is guarded by the oracle/sweeps, not by this case. | **W1-A strengthened** — red under mutation |

**`tests/room/parse-metres.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 89 | renders the sweep's two spellings the way a person would write them | 1 | **No production input** (static) | Asserts `[metresWithTrailingZeros(4100), metresWithoutTrailingZeros(4100)]` equals `["4,100", "4,1"]` (and two more literal pairs); both helpers are declared at parse-metres.test.ts:17 and :24. parseMetresToMillimetres is not called in this case. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/room/plan-preview-model.facing-labels.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 442 | agrees with QA's whole-string measurement of the widest reason, to a hundredth of an em | 1 | **No production input** (static) | Asserts `summedAdvanceEm("B слишком короткая")` against `116.59 / 11`. summedAdvanceEm is declared in the test file (:397) and reads REASON_GLYPH_ADVANCE_EM from tests/support/plan-reason-glyphs; the string is a literal. PLAN_LABEL_REASON_MAX_EM and the catalogue are not in the expression. | **W1-A strengthened** — red under mutation |

**`tests/room/qa-7f1-url-seam.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 448 | asks no module under src/room to name a shape to decide it | 1 | **Mutation survived**. Mutation: apps/web/src/room/one-c-surfaces.ts:129 — `isShapeBuildable(draft.shape, policy)` replaced by `draft.shape !== "U"`. Went red instead: apps/web/tests/room/qa-7f1-url-seam.adversarial.test.ts > 'fills a U's three walls from the URL and carries them back into it' went red (1 failed, 27 passed in the file) | The title case greps comment-stripped sources for `buildableShapes[.[]` and for `isShapeBuildable(` in room-screen.tsx, so a hardcoded shape letter in another module passes. Mutation landed: the file's behavioural cases catch it, this one does not. | **W1-A strengthened** — red under mutation |

**`tests/room/qa-7f2-s1b-millimetres.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 360 | names the metre formatter nowhere under src, and keeps the wire's formatter on the URL modules | 1 | **Mutation survived**. Mutation: apps/web/src/room/dimensions-form.tsx:341 — unit span rendered through new local `toMetresLabel(1000)` ("1 m") instead of room.unitMillimetres. Went red instead: apps/web/tests/room/qa-7f2-s1b-millimetres.adversarial.dom.test.ts — 'Step 1 shows no metre anywhere…' (7 cases incl. 'prints the millimetre unit in every field's box, in ro') went red | Test greps for two retired identifiers (which exist nowhere in src) and a fixed list of metresTextForUrl( callers; a new metre helper under another name passes. The rendered-screen DOM sweep is the real guard. | **W1-A removed** — redundant; a named sibling went red under the same mutation |

**`tests/room/qa-7f2-s5b-unreadable.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 92 | equals the definition for any shape and any texts, settled (and mid-burst at 104) | 2 | **Mutation survived**. Mutation: apps/web/src/room/parse-millimetres.ts:~31 — refuse a multi-char text starting with '0' as notDigits. Went red instead: apps/web/tests/room/room-issue-model.test.ts > 'does not report a leading zero as unreadable: it is one reading of a digit string'; apps/web/tests/room/qa-7f2-s5b-unreadable.adversarial.dom.test.ts > 'shows it on every field of a U after "0003600" is left only when the parser refuses it (readable: true)' | Oracle expectedUnreadable re-calls parseMillimetres and requiredFieldsFor, so a parser change moves both sides; both property cases (settled and mid-burst) stayed green. It still guards the filter/pass-through, not the parser's verdicts. | **W1-A strengthened** — red under mutation |

**`tests/room/room-url-round-trip.dom.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 311 | keeps a second store out of the whole room directory; keeps the native history write out of the whole room directory | 2 | **Mutation survived**. Mutation: A: apps/web/src/room/room-screen.tsx:78 — `window["local" + "Storage"].setItem("room", liveQuery)` in RoomScreen; B: same place — `window["hist" + "ory"].replaceState(null, "", pathname + "?" + liveQuery + "&x=1")`. Went red instead: B only: apps/web/tests/room/qa-7f1-url-seam.adversarial.test.ts (20 failures, e.g. 'settles in at most one write, and asks for none on the settle after that'). A: 117 tests across round-trip, room-screen.dom and url-seam stay green. | Both cases regex the source for literal API names; string-concatenated bracket access passes. The history case is witnessed by other tests (the write really lands); the storage case is survived-unwitnessed, since nothing behavioural reads storage. | **W1-A strengthened** — red under mutation |

**`tests/room/step-one-carries-a-u.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 196 | would notice a comparison if one were added | 1 | **No production input** (static) | step-one-carries-a-u.test.ts:197-199 `expect('if (shape === "U") return;').toMatch(COMPARES_TO_U)` (and two more): the subject is a string literal written in the test, the pattern is the test-local const COMPARES_TO_U (line 178). No production symbol feeds either side; it is a regex self-check guarding the it.each scan above it. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/scene/overflow-warning-viewport.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 246 | composes the measured chrome from two measured halves | 1 | **No production input** (static) | overflow-warning-viewport.test.ts:246 `expect(MEASURED_HEADER_PX + SETTINGS_ROW_PX).toBeCloseTo(MEASURED_CHROME_ABOVE_CANVAS_PX, 4)`: all three operands are consts declared in the test file (55, 43.9375, 98.9375); no production symbol is read. Stays green when the production constant changes. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |
| 340 | leaves the strip identical at every band height, with a ${settingsRowPx} px settings row | 2 | **No production input** (static) | overflow-warning-viewport.test.ts:340-346: `BAND_HEIGHTS_PX.map(() => stripAboveTheSheetPx(MEASURED_HEADER_PX, settingsRowPx))` ignores its argument and the helper is test-local with no band parameter, so Set size is 1 by construction (both settings-row cases). The production constant only seeds the unused band-height array. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/scene/qa-6m-criteria.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 172 | keeps the flagged total's sentence out of the scene warning's surface | 1 | **Mutation survived**. Mutation: apps/web/src/scene/overflow-warning.tsx:~43 — destructure `const { overflowingTotalWarning } = content.price;` and render it instead of content.configure.overflowWarning. Went red instead: apps/web/tests/scene/overflow-warning.test.ts > 'renders the sentence while a body reaches past the end of its wall' (and 'says it as soon as the scene is mounted…'); qa-6m-criteria.adversarial.test.ts > 'still reports the same body once it has been through the wire…' and 'does say something one millimetre the other side…' | The test only checks four sources for the literal dotted key `price.overflowingTotalWarning`; a destructured read passes. The render tests catch the wrong sentence on screen, so the text check adds nothing on its own. | **W1-A strengthened** — red under mutation |

**`tests/settings/cabinet-depth-control.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 121 | falls back to the default depth when the design carries none | 1 | **Mutation survived**. Mutation: apps/web/src/settings/global-settings-model.ts:~496 toDepthGroupView — fallback selects the first offered depth that is not DEFAULT_CABINET_DEPTH_MM. Went red instead: apps/web/tests/settings/qa-w2-depth-group-fallback.adversarial.test.ts > 'leaves an unnamed depth unnamed while displaying the default it is built at' (and 'checks the depth the design is actually built at…') | The candidate asserts only `selected` has length 1, so a wrong default passes. The sibling that shares the fixture asserts the value and goes red. | **W1-A strengthened** — red under mutation |
| 199 | is not refused, and does move the document - so the guard is the only thing stopping it | 2 | **Mutation survived**. Mutation: apps/web/src/store/whole-kitchen-apply.ts:~118,~143 — isTierChange and isDepthChange return `requested !== undefined` (no compare against what is stored); this is where the no-op guard actually lives, not global-settings.tsx:210. Went red instead: apps/web/tests/store/whole-kitchen-apply.test.ts > 'a press that asks for nothing new > writes nothing, so an untouched sheet cannot move updatedAt'; tests/store/qa-w2-apply-atomicity.adversarial.test.ts > 'writes one document, because the second asks for nothing the first did not already store' | Both cases call store.setCabinetDepth directly and never reach the apply path, so removing the guard cannot turn them red; they pin domain behaviour (no de-dup, fresh placements reference). Other store tests guard the real no-op. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/settings/global-settings-shell.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 523 | is because the command underneath does not de-duplicate: a redundant set still moves updatedAt | 1 | **Mutation survived**. Mutation: apps/web/src/store/whole-kitchen-apply.ts:~118,~143 — isTierChange and isDepthChange stop comparing against the stored value. Went red instead: apps/web/tests/store/whole-kitchen-apply.test.ts > 'writes nothing, so an untouched sheet cannot move updatedAt'; tests/store/qa-w2-apply-atomicity.adversarial.test.ts (2 cases) | The guard is in store/whole-kitchen-apply.ts, not global-settings.tsx:210. The test calls setMaterialTier twice and checks updatedAt moved, so deleting the guard cannot affect it; it would go red only if the domain command started de-duplicating. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/settings/global-settings.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 710 | would fail the markup assertion if it were hidden rather than omitted | 1 | **No production input** (static) | global-settings.adversarial.test.ts:710-720: `for (const markup of hidden) expect(markup).toMatch(/finisaj/i)` where `hidden` is three HTML string literals declared inside the test, each containing 'finisaje per corp'. No production symbol feeds either side; the real guard is the case at :687 (markup of the real sheet not matching /finisaj/). | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/settings/qa-6w-below-default-tier.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 516 | absorbs a hardware tier that is cheaper on all three rates, and no runtime rule reports it | 1 | **No production input** (static) | Second half only (the first, offerOf(...)/offeredDeltaFor, is real and was not mutated): qa-6w-below-default-tier.adversarial.test.ts:545-556 `expect(cheapestAtSeeded?.tierId).toBe(INVERTING_TIER_ID)`, where cheapestAtSeeded sorts the test-local hardwareAmountFor (:86) over `dominated`, a book the test builds with bookWithHardwareRates lowering INVERTING_TIER_ID's rates by 1. The only non-test input is the sample price book used as fixture data; no pricing or offer code runs. | **W1-A strengthened** — red under mutation |

**`tests/settings/qa-w2-depth-group-fallback.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 147 | is that the sheet offers fewer depths than the schema accepts, and today it offers all of them | 1 | **Mutation survived**. Mutation: apps/web/src/settings/global-settings-model.ts:484 offeredCabinetDepthsMm — appended .slice(0, -1) (drops the last depth). Went red instead: apps/web/tests/settings/cabinet-depth-control.test.ts: 'offers exactly the depths the map declares, in the map's own order' (+2 more) went red | The test re-implements the filter inline over declaredCabinetDepthsMm() and MIN_CABINET_DEPTH_MM and never calls offeredCabinetDepthsMm or settingsView, so the title's claim about the sheet is unguarded by this test; the mutation is caught only by a sibling file. | **W1-A strengthened** — red under mutation |

**`tests/settings/qa-w2-opening-choice.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 375 | leaves the document byte-identical when it ends in cancel, whatever it opened on | 1 | **Mutation survived**. Mutation: apps/web/src/settings/global-settings.tsx:142 close() (the onCancel handler) — made it throw before doing anything. Went red instead: apps/web/tests/settings/global-settings-inert.dom.test.ts: 'the settings sheet and the screen behind it > gives the screen back when it closes' went red | storeFor() builds a store that is never passed to pressesFrom(), which is a pure reducer over (design, presses); the equality compares the store's serialisation to itself. Cancel is never exercised, so a close() that wrote would not be seen. | **W1-A strengthened** — red under mutation |

**`tests/store/qa-5b2b.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 198 | never excludes a member-less column, which is all this wave stores | 1 | **Mutation survived**. Mutation: packages/configurator-domain/src/void-engine.ts:~647 projectFrozenMap — pushes every column into columnExtents as well as emptyColumns; domain rebuilt. Went red instead: apps/web/tests/store/qa-5b2b.adversarial.test.ts: 'the seam writes one document per state... > writes no entry at a key a placement is filed under' went red | keysThePlacementsCannotAnswer only visits keys that deriveColumns(records, {}) emits, i.e. keys of occupied columns, so the intersection with member-less keys is empty by construction; the test cannot see the projection. | **W1-A unchanged** — control of a test-local detector, test-local measurement, or the review was wrong (see the wave report) |

**`tests/store/qa-6k-d-second-deepening.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 219 | sweeps both terminal depths | 1 | **No production input** (static) | expect(SEQUENCES).toHaveLength(16) and the filter counts of 8 run over SEQUENCES, built at line 211 by flatMap over the literal [600,700]. Only DEFAULT_CABINET_DEPTH_MM is a production symbol, used as a filter key; no production edit that leaves the file loadable changes the result. | **W1-A strengthened** — red under mutation |

**`tests/store/qa-w2-editability-extraction.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 127 | sweeps every pair the two unions can form, so neither list is short | 1 | **No production input** (static) | expect(everyAccessPair().length).toBe(EVERY_WRITE_ACCESS.length * EVERY_SAVE_STATUS.length): both lists are literals declared at lines 32-46 of the test (typed readonly WriteAccess[]/SaveStatus[], which TS does not check for exhaustiveness) and everyAccessPair is a local flatMap; no production symbol feeds it. | **W1-A strengthened** — the review was right that TypeScript did not check exhaustiveness; both lists rebuilt from `Record`s over the unions, a new member now fails `tsc` |

#### `packages/configurator-domain` — 86 entries, 169 cases

**`tests/along-wall-chain-shift.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 77 | is read by a module in src/ other than the one that declares it / branches on both of the two chains outside that module | 2 | **Mutation survived**. Mutation: packages/configurator-domain/src/along-wall-chain-shift.ts:~69 cornerReachAlongWallMm — wall-map arm returns baseCarcassDepthMm(d) - 269 (same delta as base-formula). Went red instead: tests/along-wall-chain-shift.test.ts: 'the two chains > carry different deltas between the two declared depths' (+3 more) went red | Both structural cases only readFileSync src/*.ts and test for the substrings 'alongWallPositionFollows', '"base-formula"', '"wall-map"'; a collapsed switch keeps those strings. The behavioural cases in the same file catch it, so the pair is redundant rather than harmful. | **D1-A removed** — redundant; siblings "carry different deltas", "reach the distances", "reports each column's own delta" went red under the mutation |

**`tests/backlog-50-the-corner-the-validator-cannot-see.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 124 | really puts the space inside the body, on the body's own wall | 1 | **No production input** (static) | expect(overlapMm).toBe(space.widthMm): overlapMmOf and spanOf are file-local arithmetic helpers, INSIDE_THE_CORNER_BODY_MM/WIDTH_OF_A_TEST_SPACE_MM are file constants, and cornerBodySpanOnWallA reads placement data from the KITCHEN_L_DESIGN fixture. No validator or command runs; only a fixture-data edit can turn it red. | **D1-A strengthened** — red under mutation |
| 236 | really does put two bodies in one span, on one wall | 1 | **No production input** (static) | expect(overlapMm).toBe(moved.body.widthMm) and expect(moved.wall).toBe(cornerBody().wall): spans from the fixture placement rewritten by the test's own movedOntoTheCornerBody and the file-local overlapMmOf; no validator is called. | **D1-A strengthened** — red under mutation |

**`tests/backlog-51-chain-homogeneity-is-unreachable.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 298 | the detector the sweeps above rely on (reports a body arriving on the other chain / stays quiet where the column is already on that chain, or has no members) | 2 | **No production input** (static) | Both cases assert wouldMixColumn(...), a three-line helper declared at line 96 of the same test file; the file's imports play no part in the asserted expressions. | **D1-A strengthened** — red under mutation |

**`tests/body-label.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 53 | wraps only the rows declaring doorCountFollowsWidth, at every offered width | 1 | **Mutation survived**. Mutation: packages/configurator-domain/src/door-count.ts:~19 deriveDoorCount — threshold widthMm >= TWO_DOOR_MIN_WIDTH_MM + 50. Went red instead: tests/body-label.test.ts: 'ADR 0033 on the offer list: a refused row states no door count > counts a 500 mm opening's offered cabinet as 2 doors' went red | Expected and actual both call deriveDoorCount, so a wrong threshold moves both sides; the case independently pins only which rows wrap. Literal door counts are pinned by a sibling test. | **D1-A strengthened** — red under mutation |

**`tests/catalog.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 170 | gives the two entries different ids, so the picker can tell them apart | 1 | **No production input** (static) | expect(twoDrawer).not.toBe(oven) over HOB_ENTRIES = ['base-hob-2drawer','base-hob-oven'] as const, declared in the test file at line 147; the catalogue is never read. | **D1-A strengthened** — red under mutation |

**`tests/catalogue-assembly-refusals.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 77 | does not accept a refusal that is only written about | 1 | **No production input** (static) | Builds a string literal in the test, runs the file-local withoutCommentsOrStrings (declared at line 122) and asserts the result lacks the text; no src module is imported by the asserted expression. | **D1-A strengthened** — red under mutation |

**`tests/chosen-finishes.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 109 | are pairwise distinct, so wiring the wrong one into the copy fails | 1 | **No production input** (static) | new Set([DISPLAYED_BODY_COUNT=26, CHOSEN_COLOURS_ON_THE_MDF_FIXTURE=4, FINISHES_RESOLVED_BY_VENEER=2]).size: three literals, two declared in the test and one a literal in tests/support/mdf-kitchen-wearing-chosen-colours.ts:87. No production symbol. | **D1-A strengthened** — red under mutation |

**`tests/commands/6x-a-slide-direction.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 597 | declares two columns exactly one mis-slide apart, which the shipped kitchen does not offer | 1 | **No production input** (static) | Math.max(...alongMm) - Math.min(...) over DECLARED_WALL_B_COLUMNS (literals 1000, 1000, 1200 at line 433) compared with DECLARED_COLUMN_PITCH_MM = 200 (line 427): both sides are literals in the test file. | **D1-A strengthened** — red under mutation |

**`tests/commands/6x-slide-witness.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 416 | strands every one of those extents on the coordinate the run is leaving when the slide is removed / plans the arriving keys from the records rather than from the document when the slide is removed | 2 | **Mutation survived**. Mutation: packages/configurator-domain/src/commands/set-cabinet-depth.ts:~143 rebuildEveryBodyAt — passed held.frozen instead of frozenExtentsSlidAlongTheWall({...}). Went red instead: tests/commands/6x-slide-witness.test.ts: 'the consequence, on a wall-B column this file declares > refuses the rebuild against the un-slid planning map and fits it at 860 against the slid one' (+1) went red | The two cases build both maps themselves through planningMapsOf from deriveColumnsOverFrozenExtents/frozenExtentsSlidAlongTheWall, never through setCabinetDepth, so the command's wiring is invisible to them. Pinning the library functions is real but not the claim in the title. | **D1-A unchanged** — review wrong: already red under a mutation of the function it calls |

**`tests/commands/qa-5b4a.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 229 | admits the split for exactly the columns that hold no member | 1 | **Mutation survived**. Mutation: packages/configurator-domain/src/commands/insert-fit.ts:~634 dividesWholeColumn — returns true unconditionally, so a split is admitted for a column that still holds members. Went red instead: tests/commands/qa-5b4a.adversarial.test.ts: 'the failure the whole-height precondition avoids is real > splitting a column that still holds a member makes the document unsaveable' (+2) went red | The case checks only that an emptied column publishes an opening reaching floor and top and that no record sits in it; it attempts no split and contrasts no occupied column. It would still catch a recomputeVoids change to an empty column's opening, but not the precondition itself. | **D1-A strengthened** — red under mutation |

**`tests/commands/qa-6k-e-probe-lease.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 273 | builds a different catalogue per declared depth / ignores the depth it is asked for when a catalogue is passed | 2 | **Mutation survived**. Mutation: packages/configurator-domain/src/commands/set-cabinet-depth.ts:~72 — probeAt(cabinetDepthMmOf(design)) instead of probeAt(input.cabinetDepthMm). Went red instead: tests/commands/qa-6k-e-probe-lease.adversarial.test.ts: 'the probe lease a depth change takes > is taken at 700 mm and at no other depth' went red | Both cases drive createFakeProbeFactory from tests/support/fake-probe.ts directly; case 2 asserts a known flaw of the double ('observed behaviour, not endorsed'). They protect the instrument, not set-cabinet-depth. Case 1 would still react to buildKitchenLBodyCatalog ceasing to vary by depth, which I did not mutate. | **D1-A unchanged** — case 1 already red under mutation (review wrong); case 2 tests a `tests/support` instrument, nothing in production to aim at |

**`tests/commands/qa-6k-i-planning-map.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 252 | planning-map model cases: carries the stored floor / wall A unmoved / member-less arm (lines 252, 323, 360, 382) | 6 | **Mutation survived**. Mutation: packages/configurator-domain/src/commands/set-cabinet-depth.ts:~143 rebuildEveryBodyAt — passed held.frozen instead of frozenExtentsSlidAlongTheWall({...}). Went red instead: tests/commands/6x-a-slide-direction.test.ts: 'the consequence at the command boundary... > changes the kitchen's depth and rebuilds the surviving base to the worktop line' (+2); tests/commands/6x-slide-witness.test.ts 2 cases | The file rebuilds the planning map in the test (plannedMapOf/plannedMapBeforeTheSlideOf) from the two library functions, so the command's wiring is not exercised; whole file green under the mutation, which covers all six cases in the group. | **D1-A unchanged** — review wrong: already red under mutation |

**`tests/commands/qa-6x-a-slide-direction.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 339 | abuts its neighbour and overlaps no wall-B body at ground level, interval by interval | 1 | **No production input** (static) | Arithmetic alongMm +/- widthMm/2 over withDeclaredColumns(KITCHEN_L_DESIGN, DECLARED_DEEPENING_COLUMNS) (a test helper spreading fixture placements and test literals) compared with literal intervals; no derive, validate or command function is called. | **D1-A strengthened** — red under mutation |

**`tests/commands/qa-6x-slide-witness.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 289 | declares a column of two bodies the seed already carries at the same sizes on wall A | 1 | **No production input** (static) | expect(DECLARED_WALL_B_COLUMN[0]?.body).toStrictEqual(seeded.get('p1')?.body): left is the test's own literal, right is fixture placement data from KITCHEN_L_DESIGN; no production logic runs. | **D1-A strengthened** — red under mutation |

**`tests/commands/qa-c2s2-corner-unit.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 331 | is a document the schema accepts and the serialiser round-trips, with or without empty columns | 6 | **Mutation survived**. Mutation: packages/configurator-domain/src/serialize-design.ts:17 canonicalSerializeDesign — drops emptyColumns and columnExtents before stringifying. Went red instead: packages/configurator-domain/tests/empty-columns.test.ts: 'DesignSchema.emptyColumns > round-trips an entry through the wire unchanged' went red | Only .success of DesignSchema.safeParse is asserted and the parsed value is never compared to the input, so loss of optional fields passes. It does fail if the serialiser corrupts a required field, but the title's round-trip claim is not checked. | **D1-A strengthened** — red under mutation, 6/6 |

**`tests/commands/qa-w5b1.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 404 | refuses the second mover once the first has taken the whole gap | 1 | **Mutation survived**. Mutation: src/commands/plan-width-funding.ts:160 — removed the `remainderMm < 0` too_narrow refusal so a growth can borrow space that does not exist. Went red instead: qa-w5b1.adversarial.test.ts 'neither 300 mm constant moved > still refuses a growth larger than the space that is there' and 'the empty-space refusal descriptor > is the descriptor a real refused growth actually produces' went red | The 1000 call is refused by the 800 ceiling and the final call retries a width the body already has (WIDTH_UNCHANGED), so no-space logic is never reached; the reader was right. | **D1-A strengthened** — split into two tests, each red under its mutation |
| 531 | publishes a known reason for each side the sweep reaches | 1 | **Mutation survived**. Mutation: src/commands/plan-width-funding.ts:160 — too_narrow side reason replaced with 'bogus'. Went red instead: qa-w5b1.adversarial.test.ts 'still refuses a growth larger than the space that is there' and 'is the descriptor a real refused growth actually produces' went red | Only assertion on content is not.toContain('remainder_below_floor'); an unknown reason string passes. | **D1-A strengthened** — red under mutation; the sweep now reaches `too_narrow` |

**`tests/commands/rejection-totality.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 644 | covers both verdicts, so neither branch of the invariant is untested | 1 | **No production input** (static) | rejection-totality.test.ts:644 asserts `buildCases().filter(SCAN_CODES.includes(sweep.code)).map(sweep.code)` equals the two strings; `code:` is a literal label written on each row in the test (e.g. :213-245) and sweep.run() is never called there. | **D1-A strengthened** — red under mutation |

**`tests/commands/replan-dependent-members.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 244 | admits a population the shipped catalogue actually has / admits the wall and top carcasses and excludes everything the decision names | 2 | **Mutation survived**. Mutation: src/commands/replan-dependent-members.ts:~225 — columnDecidesItsDepth: recorded-shell clause replaced with `true`. Went red instead: replan-dependent-members.test.ts:193 'a standing hood is never re-planned > writes the hood through by identity, keeping its fixed width' | Candidates apply a test-local copy of the predicate to the catalogue and never call the production one. Dropping the wall clause is unwitnessed anywhere in the three files run. | **D1-A, D1-C strengthened** — "admits" red under mutation; "count 16" now compares the exported predicate's population over the catalogue with a hand-restated list, red under mutation |

**`tests/commands/set-width.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 564 | does not change any member's module line or height | 1 | **Mutation survived**. Mutation: src/commands/rebuild-resized-bodies.ts:~113 — resized body written with heightMm + 10. Went red instead: qa-w5b1.adversarial.test.ts 'the stepper is reversible over a long chain > returns the design and the column map after six shrinks and six growths'; qa-w5c.adversarial.test.ts 'Q2 — conservation and the inverse > p10 400 then 300 restores every span...' | Loop asserts frame.y0 only; height is never compared, so the reader was right. | **D1-B strengthened** — the D1-A assertion was wrong (architect: test-fidelity; a resize rebuilds through the §7 equivalent, 820 → 860, pinned by `qa-w5c` Q11). Renamed, asserts 820 before and 860 after; red under mutation |

**`tests/corner-assembly-size.right-corner.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 310 | never compares against another placement — it takes none | 1 | **Mutation survived**. Mutation: src/corner-of.ts:~36 — cornerOf keeps module-level lastUAnswer and answers 'right' for a U placement whenever the previous call answered 'right' (still 3 params). Went red instead: qa-m7b-u2.adversarial.test.ts 'AC1 ... files four structural pieces under each corner by cornerOf'; generation/corner-wall-unit.test.ts 'a generated U > files every unit under its corner by cornerOf, left or right' | Asserts cornerOf.length === 3 (arity of the production function); any three-parameter implementation passes, even a stateful one. Not a static test, but it pins only the signature. | **D1-A strengthened** — red under mutation |

**`tests/fixtures/seeded-body-names.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 363 | changes no seeded body's kind, band or width capability | 1 | **Mutation survived**. Mutation: src/fixtures/kitchen-l-design.ts:250 — topCarcass band changed from 'top' to 'base'. Went red instead: wall-corner-return-kinds.test.ts 'keeps both returns in the wall group — a new kind does not re-band a body'; replan-dependent-members.test.ts 're-plans the top standing over the overhung column' | Only insertable===false (the selection filter) and sizesMm===undefined are asserted; kind and band are never read. | **D1-A strengthened** — red under mutation |
| 419 | gives no seeded row an id an insertable entry already uses | 1 | **Mutation survived**. Mutation: src/fixtures/kitchen-l-design.ts:323 — seeded row id 'base-drawer2-600' renamed to 'base-cabinet' (collides with an insertable id). Went red instead: seeded-body-names.adversarial.test.ts 'includes at least one row the seeded design does not place' (expects unplaced to equal ['base-drawer2-600']) | The Map spread lets the insertable row overwrite the seeded one, so seededRows (filtered insertable===false) never contains it and shadowed is empty by construction. Only an unrelated assertion noticed the loss. | **D1-A strengthened** — red under mutation |

**`tests/front-population.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 105 | sweeps every width an insertable row declares, not one row per entry | 1 | **Mutation survived**. Mutation: src/front-population.ts:358 — doorLeafCount multiplies its result by 0. Went red instead: front-population.test.ts 'the split preserves every entry's handle count > base-sink-800@0 ... declared leaves plus drawers reproduce the declared handles' (and others) | Asserts only on GATED_BODIES built in the test from the catalogue; no front-population function is called. It can fail only if catalogue data changes. | **D1-A unchanged** — review wrong: already red under mutation |

**`tests/generation/body-choice.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 74 | leaves the pan drawer outside the pair, so no storage slot can take it in this wave | 1 | **Mutation survived**. Mutation: src/generation/generation-priorities.ts:354 — the post-hob storage slot takes PAN_DRAWER_BASE_BUILD_ID instead of THREE_DRAWER_BASE_BUILD_ID (import added). Went red instead: body-choice.test.ts 'criterion 22 ... answers true for every module the storage run composed and false for every block column'; drawer-rows.test.ts is the reader's other suspected witness (not needed) | The array asserted on is declared in the test from two imported constants; the composer's actual slot body is never read, so the title's claim is untested by this case. | **D1-A strengthened** — red under mutation |
| 498 | writes nothing matching %s in any generation module's code (4 regex rows) | 4 | **Mutation survived**. Mutation: src/generation/generation-priorities.ts:~352 — storagePriorities gives odd-indexed slots (when a drawer slot exists) the drawer body via `(index & 1) === 1`. Went red instead: drawer-rows.test.ts 'D15.7 — the slot after the hob is found in the reading order... gives the drawer to the slot the run reaches first after the hob' and 'criterion 1 ... makes the preparation cabinet and the post-hob slot drawers at 6300 x 4700' | Four regexes over comment-stripped source; an alternating proportion written as a bit test matches none. The file itself declares this limit. | **D1-A strengthened** — four cases now one sweep, red under mutation |

**`tests/generation/qa-7d5-pre-width-recorded.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 405 | rejects unrelated %s corruption in the bottle arm | 7 | **Mutation survived**. Mutation: src/generation/generation-priorities.ts:~247 — plan.dropped gains an extra role so the live plan differs from the recording in an unrelated way. Went red instead: qa-7d5-pre-width-recorded.test.ts 'keeps the exact pre-S1 plan for every room where S1 omits the bottle' and the pan-drawer/N5b rejection cases went red | Each row throws because the already-wrong plan differs from the recording, not because of the named corruption; toThrow() takes any error. (A first mutation, STORAGE_BODY_WIDTH_MM 650, made the candidate red only through an upstream planTallEndBlock throw, so it was discarded as unrepresentative.) The assertions exercise tests/support classifier. | **D1-A strengthened** — red under mutation 6/7; the "dropped" row is rightly green |

**`tests/generation/qa-7d5b-post-tower-recorded.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 420 | the dishwasher classifier refuses every change beyond S1's (admits/refuses cases) | 20 | **Mutation survived**. Mutation: src/generation/dishwasher-beside-the-sink.ts:39 — DISHWASHER_ID 'dishwasher' changed to 'dishwasher2'. Went red instead: qa-7d5b-post-tower-recorded.test.ts 'differs from S1's planner in 277 drawn rooms, each by one of S1's changes alone...' and 'differs live from S1's plan in 56 drawn rooms...' | Cases are string edits of recorded plans fed to the test-support dishwasherChangeBetween; the only production inputs are lShellFloorRuns (corner ends) and isComposedStorageSlot. Mutating the S1 leaf cannot reach them. Group of 20 tests in that describe (batch said 25). | **D1-A unchanged** — tests a `tests/support` instrument with an honest title |

**`tests/generation/qa-7d5b-pre-tower-recorded.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 297 | the tower-over-bottle classifier refuses every change beyond M11's (admits + 9 refusals) | 10 | **Mutation survived**. Mutation: src/generation/optional-run-items.ts:~157 — isTheOvenTowerKeptOverTheBottle forced false. Went red instead: qa-7d5b-pre-tower-recorded.test.ts 'S0b changes exactly ten drawn rooms, each by M11's change alone, and keeps the other 470 exactly' (+2 more) | Both operands are recordings run through test-support towerOverBottleChangeBetween; the file header says so. Group is 10 tests (admits + 9 refusals), not 11. | **D1-A unchanged** — tests a `tests/support` instrument with an honest title |

**`tests/generation/shell-design.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 778 | names removePlacement and clipEmptyColumnsAtWallEnd nowhere in its code, under any alias / loads no module at run time by a route the scan above cannot see | 2 | **Mutation survived**. Mutation: src/generation/shell-design.ts:~52 — (a) namespace import of ../commands/remove-placement.js read through ['remove'+'Placement']; (b) never-called new Function('p','return imp'+'ort(p)'). Went red instead: (a) only: shell-design.adversarial.test.ts 'imports no module that hands it removePlacement, a probe or a price book — through a re-export or the barrel included'. (b): whole file green, no witness | Reader's alias proposal would actually be caught (the import specifier still spells removePlacement); a namespace import with a computed key is not. Both cases are regexes over source text. Case (b) survived-unwitnessed. | **D1-D narrowed** — the lint rule (`1b162cc`, `84fccd7`) now carries the identifier, import and `require` forms; each scan is narrowed and retitled to what lint cannot read (a reserved name or module path inside a string, computed access, `eval`, a method named `import`), red on each such form |

**`tests/generation/shell-design.linear.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 139 | refuses an L room with ROOM_NOT_LINEAR / refuses a straight room outside the engine's linear bounds / throws LShellInputError (ROOM_NOT_L) | 3 | **Mutation survived**. Mutation: src/generation/shell-design.ts — ROOM_NOT_LINEAR->ROOM_OUTSIDE_ENGINE_LIMITS, ROOM_OUTSIDE_ENGINE_LIMITS->INVALID_OCCURRED_AT (linear), ROOM_NOT_L->ROOM_OUTSIDE_ENGINE_LIMITS (L). Went red instead: shell-design.test.ts 'buildLShellDesign — the document it writes > refuses a room that is not an L, by code'; shell-design.u.test.ts 'refuses a valid U room as ROOM_NOT_L, and touches no L behaviour' | All three cases assert only the thrown class. No test in the package checks the two linear refusal codes (survived-unwitnessed for those); the L code is witnessed elsewhere. | **D1-A strengthened** — red under mutation, 3/3 |

**`tests/generation/shell-design.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 785 | never calls removePlacement / calls clipEmptyColumnsAtWallEnd / imports a probe / imports a price book | 5 | **Mutation survived**. Mutation: src/generation/shell-design.ts:~52 — namespace import of ../index.js read through ['remove'+'Placement'] in an exported function. Went red instead: shell-design.adversarial.test.ts 'imports no module that hands it removePlacement, a probe or a price book — through a re-export or the barrel included' | Text regexes (including the remove-placement.js path) are bypassed by importing through the barrel; the adversarial runtime-reach test is what catches it. A direct import of ../commands/remove-placement.js would be caught here. | **D1-A, D1-D removed** — three regex rows removed in D1-A as redundant; the clip row and its premise deleted in D1-D once lint caught every code form (the module path in a string moved into the narrowed scan of row 564) |

**`tests/generation/tall-end-block.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 564 | names each of the three bodies in exactly one module / writes no size of a column as a literal, and never mentions symmetry | 2 | **Mutation survived**. Mutation: src/generation/tall-end-rule.ts:125 — column-height check written as `roomHeightMm >= 1100 * 2 + 1` instead of declared.columnHeightMm. Went red instead: tall-end-block.test.ts 'the ceiling clause (criterion 14) > stands a column in a room exactly as tall as it is, with nothing reported above the room' | A hard-coded column size spelled as an expression slips past the literal regex; only the behavioural boundary test notices, because of the +1. A behaviour-neutral spelling (1100 * 2) would be unwitnessed by design. | **D1-A strengthened; kept** — "no literal size" red under mutation; "names bodies" kept as an accepted guard (architect: red under its own mutation, and pins which module holds the authority) |

**`tests/generation/u-composition.property.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 154 | holds over the boundaries N3r 3 names, plus B = C | 1 | **Mutation survived**. Mutation: src/generation/u-fridge-wall.ts:58 — fridge wall tie rule `wallLengthMm('B') >= wallLengthMm('C')` changed to `>` (B = C goes to wall C). Went red instead: u-composition.property.test.ts 'the sink is the first body in reading order on wall A, whenever the plan composes' (random seed -1853841875; a fast-check sweep, so detection is by chance, not by the boundary case) | The boundary case asserts toBeDefined and that two calls serialise identically; neither depends on any N3r rule. The B = C tie it names is not checked there. | **D1-A strengthened** — red under mutation |

**`tests/generation/u-composition.s3.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 36 | never counts base-hob-2drawer as a drawer unit (RQ15) | 1 | **Mutation survived**. Mutation: src/generation/u-drawer-units.ts:62 — extrasOwedFor subtracts one more drawer unit. Went red instead: u-composition.drawer-split.test.ts 'sweeps rooms with 4 and with 5 drawer cabinets...' and '6000 / 6000 / 6000, which gets 5 drawer cabinets...'; u-composition.n11.property.test.ts (3 failures) | The final assertion filters bases to base-3drawer/base-panbank then expects the hob (base-hob-2drawer) not in it; true by construction. The drawer target is never observed. | **D1-A strengthened** — red under mutation; room moved to 6000/2400/2200 so it reaches the target |
| 71 | yields when the room has too few slots to reach the target (RQ6) | 1 | **Mutation survived**. Mutation: src/generation/u-drawer-units.ts:62 — extrasOwedFor subtracts one more drawer unit (same mutation as s27.2). Went red instead: u-composition.drawer-split.test.ts and u-composition.n11.property.test.ts (see s27.2) | drawerCount >= 0 is always true; only minimumMet === true has content. A change to how many drawers a small U gets does not move it. | **D1-A strengthened** — red under mutation |

**`tests/pricing/finish-never-prices.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 93 | repaints bodies that cannot wear a finish too, and still prices them the same | 1 | **Mutation survived**. Mutation: src/pricing/price-design.ts:~106 — total gains +1 per placement that carries a finish while its catalogue entry has canFinish === false. Went red instead: finish-never-prices.test.ts 'returns a byte-identical PricedDesign for any legal finish on every body' (same file, line ~80) and 'has no module under pricing/ naming a finish, a decor or a palette entry' | priceDesign is never called in the candidate; it asserts unfinishable.length > 0, a fixture precondition. The repaint-and-compare lives in the sibling property test. | **D1-B strengthened** — red under mutation |

**`tests/pricing/parse-price-book.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 321 | still reproduces the witness in plain JavaScript, so the fix is not guarding a phantom | 1 | **No production input** (static) | parse-price-book.test.ts:321-331: `naive = CANCELLING.baseMinor + CANCELLING.perWidthMillimetreMinor*BODY.widthMm + ...` where CANCELLING and BODY are consts declared in the test; asserts toBe(0) and Number.isSafeInteger. No production symbol feeds it (amountForBody is only called in the next case). | **D1-B unchanged** — fixture witness, no production behaviour to aim at |

**`tests/pricing/price-design.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 399 | lists placements in the one display order and nothing of its own | 1 | **Mutation survived**. Mutation: src/queries/design-projection.ts:91-92 swapped the alongMm and y0Mm comparator keys. Went red instead: tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts:1002 'lists the seeded kitchen in one literal order, so a swapped comparator key is red' went red (EXIT=1) | Expected is projectDesignForDisplay(KITCHEN_L_DESIGN) and actual is priceDesign built from the same projection, so a comparator change moves both. Only the literal pin catches it. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |

**`tests/pricing/pricing-seams.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 194 | evaluates a formula from every constructor the module exports | 1 | **Mutation survived**. Mutation: src/pricing/price-book.ts:310 the linear-in-width-and-door-leaves arm drops the door-leaf term. Went red instead: tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts 'a second door costs more, and costs exactly what the book says it costs > prices base-cabinet higher with two doors than with one, at one width' (and 'bills base-cabinet's hinges and its door step off the same count') went red (EXIT=1) | Candidate asserts only expect.any(Number) per constructor, so a wrong arm returning a number passes; it catches only a missing arm (undefined). | **D1-B strengthened** — red under mutation |
| 395 | recognises that suffix when it is there, and only that suffix | 1 | **No production input** (static) | pricing-seams.test.ts:395-410: `expect(ROMANIAN_SUFFIXED_IDENTIFIER.test(gone), gone).toBe(true)` where the regex is declared in the test file (line ~349) and the strings are literals in the loop. No src symbol involved. | **D1-B unchanged** — self-test of a test-local or `tests/support` helper; no production behaviour named |
| 421 | tells a Romanian comment from a Romanian string | 1 | **No production input** (static) | pricing-seams.test.ts:421-440: codeLinesOf and ROMANIAN_LETTER are declared in the test file and are applied to a five-line `module` string literal built in the test; asserts result toEqual([4]). No src file is read. | **D1-B unchanged** — self-test of a test-local or `tests/support` helper; no production behaviour named |

**`tests/pricing/qa-6b-pricing.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 735 | publishes exactly the ids the published overflow query answers | 1 | **Mutation survived**. Mutation: src/queries/overflowing-placements.ts:24 findOverflowingPlacementIds returns [] (.slice(0,0)). Went red instead: qa-6b-pricing.adversarial.test.ts 'an overflowing design loses nothing... > prices every body when every body overflows' and price-design.test.ts 'flags the total and names the placements the design itself overflows' went red (EXIT=1) | Expected and actual both call findOverflowingPlacementIds on the same design; breaking the query moves both to [] and the test stays green. | **D1-B strengthened** — red under mutation |

**`tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 984 | lists cabinet lines in exactly the projection's order and never sorts its own | 1 | **Mutation survived**. Mutation: src/queries/design-projection.ts:91-92 swapped the alongMm and y0Mm comparator keys. Went red instead: same file :1002 'lists the seeded kitchen in one literal order, so a swapped comparator key is red' went red (EXIT=1) | Expected order is projectDesignForDisplay on the same shuffled design priceDesign projects; the test's own comment concedes the literal pin is the real guard. It still guards 'pricing sorts nothing of its own' but not the projection's order. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |

**`tests/pricing/qa-6bf2-text-key-boundary.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 61 | states the bound this file sweeps | 1 | **No production input** (static) | qa-6bf2-text-key-boundary.adversarial.test.ts:61-64: `expect(keyOfLength(MAX_TEXT_KEY_LENGTH)).toHaveLength(80)`; MAX_TEXT_KEY_LENGTH is a const declared in the test at :26 (src's is unexported at parse-price-book.ts:54) and keyOfLength is the test's own helper at :52. | **D1-B unchanged** — self-test of a test-local or `tests/support` helper; no production behaviour named |

**`tests/pricing/qa-6t2-sink-extras.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 394 | is the seeded sink that is moved, derived rather than assumed | 1 | **Mutation survived**. Mutation: src/pricing/price-design.ts:628-630 dishDryingRack quantity = sinks.length (bill the rack regardless of host). Went red instead: same file: 'a sink pushed past its wall keeps its cover and loses its rack > still bills the cover, and no longer bills the rack' and 'the count is the number of sinks...' went red (EXIT=1 for the file) | Candidate only asserts KITCHEN_L_DESIGN p0.body.buildId === 'base-sink-800' (a fixture read, no pricing). It is a precondition guard; pricing regressions are caught by its neighbours. | **D1-B strengthened** — red under mutation (rack never billed); the review's mutation is caught by its sibling |

**`tests/pricing/qa-m6-wave-b-parse-boundary.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 299 | publishes an exact hardware amount for every rate inside the bound | 1 | **Mutation survived**. Mutation: src/pricing/price-design.ts:458-461 hardwareUnitAmount sums terms with a plain reduce instead of checkedAmountOfTerms/exactAmountOfTerms. Went red instead: tests/pricing/qa-m6-wave-b-regate.adversarial.test.ts 'each closed finding is refused by its own guard, not by the backstop > names the rate and the count for an arithmetic that cannot be done exactly' and 'the amount sweep reaches what a reader reaches > still publishes no figure for the rate it missed, because the arithmetic checks it' went red (EXIT=1) | Candidate multiplies MAX_PRICE_COEFFICIENT_MINOR by seeded counts and compares to MAX_SAFE_INTEGER; no pricing function is called. The whole parse-boundary file, including its sibling 'never publishes a hardware amount the integers disagree with', stayed green under the mutation (the rate bound refuses first). | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |

**`tests/qa-0099-global-colour.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 674 | has a fixture whose cabinets differ from the material's own default | 1 | **Mutation survived**. Mutation: src/chosen-finishes.ts:50 wearsAChosenFinish returns true for any cabinet with a finish (counts every cabinet). Went red instead: same file 'ADR 0099 acceptance 6 > owes nothing for the cabinets — the amended base counts zero' (and decision 5 'is a distinction countCabinetsWearingAChosenFinish deliberately cannot see') went red (EXIT=1) | Candidate asserts only that PAL_ANTRACIT differs from the material's default (materialById/sameFinish) and that the fixture's placements carry PAL_ANTRACIT: a fixture precondition, no counting behaviour. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |
| 928 | refuses a whole-kitchen colour the material does not offer | 1 | **Mutation survived**. Mutation: src/validate-design.ts:122 emitted code changed from SETTINGS_WEAR_UNOFFERED_FINISH to PLACEMENT_WEARS_UNOFFERED_FINISH. Went red instead: tests/qa-0099c-the-offer-is-the-same-at-both-levels.adversarial.test.ts 'gives the same answer at both levels and at both seams, for every declared palette entry' (and '...over the free-colour range') went red (EXIT=1) | Candidate asserts only issues.length > 0 plus materialOffersFinish(...)===false, so a wrong issue code satisfies it; the code is pinned only in qa-0099c. | **D1-B strengthened** — red under mutation |

**`tests/qa-0099c-a-material-change-rewrites-values-not-keys.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 147 | holds a cabinet that chose, a cabinet that follows, and a body that cannot wear a colour | 1 | **Mutation survived**. Mutation: src/commands/set-whole-kitchen-settings.ts:112 setMaterialTier stamps the default finish onto every placement body lacking one. Went red instead: same file 'a material change leaves a document its own write seam accepts > restores the invariant at both levels, for every ordered pair and every colour' and '> leaves a reset cabinet overriding, so the next kitchen colour moves the followers only' went red (EXIT=1) | Candidate inspects the fixture documentOn(...) it builds (counts of chosen/following/unfinishable placements) and never calls setMaterialTier; the sweep does. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |

**`tests/qa-0099d-a-corners-colour-survives-the-seams.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 199 | spends two different colours the seeded material offers | 1 | **Mutation survived**. Mutation: src/migrate-design.ts:363 wearsAFinishItCannotWear returns true for any body with a finish (load strips every corner's finish). Went red instead: same file 'a corner's own colour survives being stored and re-opened > <corner> comes back off the load still wearing what the customer chose' (3 corners) went red (EXIT=1) | Candidate checks sameFinish(ANTRACIT, NUC_WARMIA)===false and that PAL offers both; it is a precondition on the test's palette constants and exercises no corner or load behaviour. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |

**`tests/qa-5b2b.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 507 | accepts at least one insert per level start, so the sweep has content | 1 | **Mutation survived**. Mutation: src/commands/insert-fit.ts:556 evaluateInsertFit rejects unless opening.y0 === 1.5 (accepts only one level start). Went red instead: tests/empty-column-ceiling.test.ts, tests/merge-empty-columns.test.ts, tests/qa-item8-lifted-column-depth.adversarial.test.ts and tests/queries/width-resolution.adversarial.test.ts all went red (EXIT=1) | Assertion is accepted.length > 0, so one accepting level start satisfies it; the whole qa-5b2b file, including the property tests that return early on refusals, stayed green. Wrong title claim ('per level start') confirmed. | **D1-B strengthened** — red under mutation |

**`tests/qa-5h.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 487 | returns the same two arrays as the single-pass projection | 1 | **Mutation survived**. Mutation: src/void-engine.ts:647 projectFrozenMap partition inverted (`if (!occupiedKeys.has(key)) columnExtents.push(entry)`). Went red instead: tests/column-extents.test.ts 'the projection partitions the frozen map > records the occupied columns the empty projection skips' (also merge-empty-columns, qa-5g) went red | projectEmptyColumns/projectColumnExtents are wrappers over projectFrozenMap, so both sides of the equality come from one function and move together. The rest of qa-5h (disjoint, union = all keys) is also invariant under swapping the two halves. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |

**`tests/qa-6a3.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 127 | was legal under the bound in force when it was written | 1 | **No production input** (static) | qa-6a3.adversarial.test.ts:127-137: `expect(placement.alongMm + placement.body.widthMm/2).toBeLessThanOrEqual(bound)` with bound = Math.max(PRE_CORRECTION_ROOM.widthMm, .depthMm). PRE_CORRECTION_ROOM (:42), bodyEndingAt (:16) and the row are built in the test; the only src input is the seed data KITCHEN_L_DESIGN.placements (a fixture, no logic). migrateDesign is not called. | **D1-B unchanged** — restates a deleted rule |

**`tests/qa-6p.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 403 | accepts exactly what the declared pattern accepts, over any string at all | 1 | **Mutation survived**. Mutation: src/materials.ts:104 FREE_COLOUR_PATTERN loosened to /^#[0-9a-fA-F]{3,6}$/. Went red instead: same file 'the free colour bound is one gate and both seams reach it > refuses "#abc" at the schema' (and "#ABC", migrateDesign v1) went red (EXIT=1) | Oracle is the imported FREE_COLOUR_PATTERN.test(value) and FinishSchema is built from the same constant, so the equality is self-consistent under any pattern change; fc.string() also rarely generates an accepted value. The explicit tables pin the pattern. | **D1-B strengthened** — red under mutation |
| 604 | generates designs actually holding more than one distinct finish | 1 | **Mutation survived**. Mutation: src/pricing/price-design.ts:103 priceDesign adds the count of distinct placement finishes to totalMinor. Went red instead: same file 'returns a byte-identical PricedDesign whatever mix of finishes a design wears' and 'a legacy document is billed at PAL...' went red (EXIT=1) | Candidate samples the test's own fc arbitrary (oneFinishPerBody) and counts distinct JSON strings; priceDesign is never called, only PALETTE_ENTRIES/paletteFinish/freeColourFinish build inputs. It is a non-vacuity guard for the generator, as its comment says. | **D1-B unchanged** — generator non-vacuity check |

**`tests/qa-6q-a-load-seam.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 299 | reaches the offer from both load-seam modules... / resolves a design's material through the total lookup... / keeps FINISH_NOT_OFFERED reachable from the command and from nowhere else | 3 | **Mutation survived**. Mutation: src/design-material.ts materialOfDesign throws on an undeclared material (still calls lookUpMaterial, never spells materialById). Went red instead: same file 'an undeclared material id at every seam a stored one reaches > loads, at the current version and at every legacy one' (and 'recolours rather than refusing', 'prices without throwing') went red (EXIT=1) | All three cases are readFileSync + toContain/not.toContain over src text, so a behavioural regression that keeps the identifiers passes them; the behavioural claim is guarded only by the migrateDesign sweeps. They are a structural lint, not a check of the load seam. | **D1-B part** — two source scans removed as redundant (siblings red under the mutation); one case unchanged |

**`tests/qa-6q-a-offer.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 143 | offers an entry if and only if that entry is one the material declares | 1 | **Mutation survived**. Mutation: src/materials.ts:233 paletteEntriesOf returns entries.slice(1) (drops each palette material's first entry). Went red instead: same file 'offers exactly the entry ids this file names, material by material' and 'splits twenty-four pairs eight/sixteen' went red (EXIT=1) | Expected value is paletteEntriesOf(material).some(...) and the query reads the same helper, so a change inside paletteEntriesOf moves both. (A different mutation, paletteEntriesOf returning every material's entries, did turn this test red, because the RAL branch of the query bypasses the helper.) Only the hand tables pin the content. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |
| 348 | answers true only for finishes the schema itself admits | 1 | **Mutation survived**. Mutation: src/materials.ts materialOffersFinish body replaced by `return true`. Went red instead: same file 'offers exactly the entry ids this file names, material by material', 'splits twenty-four pairs eight/sixteen' and 'offers an entry if and only if...' went red (EXIT=1) | Every finish fed in comes from everyPaletteFinish() or freeColourFinish('#000000'), all schema-valid, so FinishSchema.safeParse(finish).success is true whatever materialOffersFinish answers; the offer result only gates a `continue`. | **D1-B open** — contract question: a malformed free colour built around the constructors is answered `true` |

**`tests/qa-6t-a-push-to-open.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 201 | stamps a mode only where the definition permits one | 1 | **No production input** (static) | qa-6t-a-push-to-open.adversarial.test.ts:197-206: STAMPED = SEEDED_CENSUS.map(body => body.canHandle ? {...body, recordedHandle:'push'} : body), then filters STAMPED for `recordedHandle !== undefined && !canHandle` and expects []. SEEDED_CENSUS (:94) is built in the test; canHandle and the seeded placements' handle come from catalog/fixture data, and kitchen-l-design.ts records no `handle` on any placement, so the filter is empty by construction. countHardwareMechanisms is not called. Only editing the fixture to record handles on non-handleable bodies could turn it red. | **D1-B strengthened** — red under mutation |

**`tests/qa-7d6-corner-literal-sweep-scope.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 57 | recurses, shown against src/ where subdirectories do exist | 1 | **No production input** (static) | qa-7d6-corner-literal-sweep-scope.adversarial.test.ts:57-63: asserts the test-local typeScriptFilesUnder('.') (:~36) contains './commands/set-cabinet-depth.ts' and './fixtures/kitchen-l-design.ts' and is longer than the test-local sweptFilesIn('.'). Only a directory listing of src/ feeds it; no src code is executed, so no code mutation can change it (only renaming those two files or flattening src/ could). | **D1-B unchanged** — self-test of a test-local or `tests/support` helper; no production behaviour named |

**`tests/qa-m7b-u1-mirror-equivariance.property.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 294 | the mirror is an involution on the stored document | 1 | **Mutation survived**. Mutation: src/module-grid.ts:46 deriveColumnKeyAt shifts the key by +0.01 m (the only src symbol the test's helper tests/support/mirror-u-design.ts imports at runtime). Went red instead: tests/qa-5g.adversarial.test.ts went red (EXIT=1) with the same mutation | The property asserts mirrorUDesign(mirrorUDesign(d)) equals d, with mirrorUDesign defined in tests/support and not referenced from src. Its single runtime src dependency, deriveColumnKeyAt, is used only in mirroredColumnKey (void records), which the stored-document involution does not reach, so no production change affects it. | **D1-B unchanged** — self-test of a test-local or `tests/support` helper; no production behaviour named |

**`tests/qa-m7b-u1-wall-c.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 709 | reads room.cornerDirection on exactly one code line / reads no other spelling of the field in code | 2 | **Mutation survived**. Mutation: src/design.ts:151 refusal predicate made unsatisfiable (`isU && room.cornerDirection === "right" && Math.abs(0) > 1`), line text still matching the regex. Went red instead: same file 'AC3 — DesignRoomSchema refuses every hostile wallCMm on a U > reports both faults of a U with no wallCMm that also claims a right-hand corner' went red (EXIT=1) | Both cases are regexes over design.ts source lines (one reader of room.cornerDirection, no destructuring/bracket spelling); they assert a structural rule and say nothing about whether the refusal still fires. | **D1-B open** — structural rule, needs a decision |
| 733 | mirrorUDesign — a hand-worked reflection (swaps B and C... / refuses to mirror a document that is not a U) | 2 | **No production input** (static) | Both cases call only mirrorUDesign from tests/support/mirror-u-design.ts and compare to literals in the test (e.g. [["a","A",3150],["b","C",740]]); the single src symbol it imports (deriveColumnKeyAt) is used only by mirroredColumnKey for void records, which these cases never touch. | **D1-B unchanged** — self-test of a test-local or `tests/support` helper; no production behaviour named |

**`tests/qa-room-correction.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 244 | still loads through the migration seam | 1 | **Mutation survived**. Mutation: src/migrate-design.ts migrateDesign: after refuseUnsupportedVersion, `if (schemaVersion === 2) throw new Error("boom")`. Went red instead: tests/qa-room-migration.adversarial.test.ts:195 'corrects the room without moving or unmarking the overflow at version 2' (and ~11 more, EXIT=1) | not.toThrow(InvalidDesignError) accepts a plain Error, so a broken v2 load stays green; the whole qa-room-correction file stays green too, other files catch it. | **D1-B strengthened** — red under mutation |

**`tests/qa-room-migration.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 91 | is the shape version 1 was invented for, legal under the rule that wrote it (also 157 and 177: was legal under the rule that wrote it / was legal on wall B too) | 3 | **No production input** (static) | expect(wasLegalWhenWritten(FIXTURE)).toBe(true) at lines 92, 158, 178: wasLegalWhenWritten is declared at qa-room-migration.adversarial.test.ts:42 ('restated rather than imported, since the production function is deleted') and the fixtures are file-local; no production symbol feeds the asserted expression. | **D1-B unchanged** — restates a deleted rule |
| 161 | still loads after wave 6A3 makes placement overflow non-fatal | 1 | **Mutation survived**. Mutation: src/migrate-design.ts migrateDesign: `if (schemaVersion === 2) throw new Error("boom")` after refuseUnsupportedVersion. Went red instead: tests/qa-room-migration.adversarial.test.ts:195 'corrects the room without moving or unmarking the overflow at version 2' red, same file EXIT=1 | Only not.toThrow(InvalidDesignError); a plain Error passes. Same-file value-checking cases catch the mutation. | **D1-B strengthened** — red under mutation |

**`tests/queries/describe-selection.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 138 | carries the catalogue's own size set for an insertable body | 1 | **Mutation survived**. Mutation: src/queries/describe-selection.ts:168 describeSelection returns `sizesMm: []` instead of the resolved set. Went red instead: tests/queries/describe-selection.test.ts 'the width set a seeded body resolves through its declared equivalent > gives every seeded placement the set its catalogue equivalent declares' (+4 more) red, file EXIT=1 | The case never calls describeSelection; it reads world.catalog.get(id).sizesMm (production catalogue data) against literals, so it guards the catalogue rows, not the selection's chips. Title overclaims. | **D1-B strengthened** — red under mutation |

**`tests/queries/design-projection.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 135 | derives every label through describeBodyLabelAt | 1 | **Mutation survived**. Mutation: src/catalog.ts describeBodyLabelAt: door count forced to 1 (`labelWithDoors(name, 1 + 0 * deriveDoorCount(widthMm))`). Went red instead: tests/queries/design-projection.test.ts 'projectDesignForDisplay labels > reads a resized hinged cabinet at the width it now has, as the panel header does' red | Expected value is describeBodyLabelAt itself, so a defect inside it moves both sides; only the call-through is checked, which the 2-door literal in the sibling case covers. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |
| 210 | is what the projection itself reaches | 1 | **Mutation survived**. Mutation: src/queries/design-projection.ts:92 compareDisplayOrder along-wall term reversed (`right.alongMm - left.alongMm`). Went red instead: tests/queries/design-projection.test.ts 'projectDesignForDisplay grouping > orders each group along its wall, from the corner outwards' red (+1), file EXIT=1 | The case regexes the source text for `.sort(compareDisplayOrder)`; it checks the call-site spelling only, not the comparator's behaviour. It does catch removal of the comparator from the projection, which is its stated purpose. | **D1-B strengthened** — red under mutation |

**`tests/queries/offers.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 185 | spans the narrowest floor and the widest ceiling in the catalogue | 1 | **Mutation survived**. Mutation: src/catalog.ts:922 resolveWidthRangesMm declared-ranges branch maxMm reduced by 100. Went red instead: tests/queries/offers.test.ts 'offersFor — a void > publishes a range per size for an appliance, and one bound for a cabinetry row' (+2) red, file EXIT=1 | Expected span is recomputed from the same listInsertableBodies/resolveWidthRangesMm the implementation uses, so a defect in the range helper moves both sides; only min/max wiring is independent. | **D1-B strengthened** — red under mutation |

**`tests/queries/pantry-resizable.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 112 | wraps exactly what `deriveDoorCount` answers, over the whole bound | 1 | **Mutation survived**. Mutation: src/door-count.ts deriveDoorCount threshold `>= TWO_DOOR_MIN_WIDTH_MM + 100`. Went red instead: tests/queries/pantry-resizable.test.ts 'criterion 1 ... makes a 500 mm pantry with 2 door(s)' and 'counts a 500 mm pantry's doors as 2' red | Expected doors come from the same deriveDoorCount the label calls, so a shifted threshold moves both sides; the literal table at 96 is what pins it. (Earlier forcing doors=1 inside describeBodyLabelAt did kill this case: the call-through is checked.) | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |

**`tests/queries/sink-accessories.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 133 | resolves one host although two bodies stand over the sink | 1 | **Mutation survived**. Mutation: src/queries/sink-accessories.ts:185 isBetterRackHost prefers the higher y0 (`<` to `>`). Went red instead: tests/queries/sink-accessories.test.ts 'the rack's host on the seeded design > hangs the rack in the wall cabinet directly above the sink' and 'takes the lower of the two and not the higher' red | The only production assertion is toHaveLength(1) (one record per sink); the p11/p17 assertion filters KITCHEN_L_DESIGN in the test. Which host is chosen is pinned by the two sibling cases, not this one. | **D1-B strengthened** — red under mutation |

**`tests/queries/vacated-void.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 100 | a body standing exactly at %s is found there, not below it | 4 | **Mutation survived**. Mutation: src/queries/vacated-void.ts findVacatedVoid returns undefined unconditionally (after the covering filter). Went red instead: tests/queries/vacated-void.adversarial.test.ts 'never returns a slot that merely ends where the body started' (+9 others, e.g. 'selects [2.20, 2.60] when the top unit is deleted...') red, file EXIT=1 | Each row returns before any expect when nothing is selected, so a findVacatedVoid that finds nothing passes all 4 rows; the 'asserted below' promise is not met by the cases that follow. | **D1-B strengthened** — red under mutation |

**`tests/repository.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 33 | ConfigurationRepository (mints a new id on save / updates the existing row / rejects load with DesignNotFoundError) | 3 | **Mutation survived**. Mutation: src/repository.ts:36 DesignNotFoundError message built without boundedFailureReason (`No design found for id "${id}"`); domain rebuilt. Went red instead: apps/web/tests/lib/server/qa-aud-005-design-route-seam.adversarial.test.ts 'the response gains none of it > bounds the one message it does put in a response' red (EXIT=1) | The three cases run an InMemoryConfigurationRepository declared in the test file; production contributes only the DesignNotFoundError class, which toThrow(Class) matches by instanceof. Message and name changes (even to constants) leave them green; the fake and Neon repository suites are the real coverage. | **D1-B part** — new behavioural case added, red under mutation; three in-test fake-repository cases unchanged |

**`tests/resolved-finish.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 427 | is the case for MDF's white, which PAL does not offer | 1 | **Mutation survived**. Mutation: src/commands/set-whole-kitchen-settings.ts:~196 resolveGlobalFinishTheTierDoesNotOffer never resets (condition `\|\| finish !== undefined`). Went red instead: tests/qa-0099-global-colour.adversarial.test.ts 'ADR 0099 acceptance 5 — a material change re-resolves both levels, once > resets settings.finish to the new material's default...' (+3) and tests/qa-0099c-a-material-change-rewrites-values-not-keys.adversarial.test.ts (+2) red | The case never runs setMaterialTier; it checks resolvedDefaultFinishOf returns the stored global and that two catalogue constants differ, so the title's 'material change re-resolves' is not exercised. Whole resolved-finish.test.ts also stays green. | **D1-B strengthened** — red under mutation |

**`tests/room/approved-room-policy.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 297 | reddens for a policy whose %s maximum is one millimetre past the engine's ceiling | 7 | **Mutation survived**. Mutation: src/room/room-policy.ts ENGINE_ROOM_LIMITS: all seven ceilings lowered by 100 (3x MAX_ROOM_WIDTH_MM, 3x MAX_ROOM_DEPTH_MM, MAX_ROOM_HEIGHT_MM). Went red instead: tests/room/room-policy.test.ts 'ENGINE_ROOM_LIMITS — every bound is the constant it is derived from > wall A's maximum is the widest room a design can store' (+4) red; approved-room-policy.test.ts 'keeps height inside the engine's floor and ceiling...' red | The ceiling is read from ENGINE_ROOM_LIMITS on both sides and the policies are fabricated in the test, so the cases prove only that the test-local expectHeldInsideEngine can fail; they hold for any engine ceiling. | **D1-B unchanged** — self-test of a test-local or `tests/support` helper; no production behaviour named |

**`tests/room/carries-corner-direction.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 39 | is exactly whether a room of that shape can be right-hand, by cornerDirectionOf | 3 | **Mutation survived**. Mutation: src/room/corner-direction.ts:14 SHAPES_WITH_A_CHOSEN_DIRECTION gains "linear". Went red instead: tests/room/carries-corner-direction.test.ts:58-63 'the shapes that do and do not > is true for an L and false for a straight room and for a U' (+1 more) red, file EXIT=1 | Both sides of the comparison read the same set (carriesCornerDirection and cornerDirectionOf), so any set content satisfies it; the literal-pin cases protect the set. | **D1-B unchanged** — review wrong: already red under a correctly aimed mutation |
| 47 | linear: is never false for a shape the schema lets a right-hand room through as anything but ignored | 1 | **Mutation survived**. Mutation: src/room/corner-direction.ts:14 SHAPES_WITH_A_CHOSEN_DIRECTION gains "linear". Went red instead: tests/room/carries-corner-direction.test.ts 'the shapes that do and do not > is true for an L and false for a straight room and for a U' red | For linear carries is false and the schema accepts, so on the unmutated code both guarded expects are skipped (zero assertions, by reading the guards and the test's own comment); with the mutation the first guard runs and still passes, since the schema accepts. Only a combined schema+set change could fail it. | **D1-B strengthened** — red under mutation |

**`tests/room/qa-7i-corner-direction.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 159 | keeps room + presetId + both timestamps inside the 1024-byte envelope with the key present | 1 | **Mutation survived**. Mutation: src/design-bounds.ts:169 DESIGN_ENVELOPE_BYTES 1024 -> 100. Went red instead: tests/room/qa-7i-corner-direction.adversarial.test.ts 'does not move MAX_DESIGN_BYTES beyond qa-5h's pinned value' red (file EXIT=1) | The case builds its own JSON envelope with a hand-typed 1024 and measures it; production feeds only the MAX_ROOM_* digit counts, so the real allowance and serialisation are never read. The MAX_DESIGN_BYTES literal pin in the next case is what catches the change. | **D1-B open** — `DESIGN_ENVELOPE_BYTES` is private, needs a decision |

**`tests/room/qa-7j-straight-room.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 120 | never states 6300 as a value in the approved policy's code | 1 | **Mutation survived**. Mutation: src/room/approved-room-policy.ts:38 APPROVED_LINEAR_WALL_A_MAX_MM = 6000 + 300 (the regression, spelled so the text never contains 6300). Went red instead: same file 'the approved straight wall is 1200-6000 mm > refuses 6001 mm on wall A alone' (+2) and approved-room-policy.test.ts 'pins the straight kitchen's wall A at 1200-6000 mm' red | Regex over comment-stripped source text; an expression evaluating to 6300 passes it. The numeric pins elsewhere catch the value. | **D1-B removed** — redundant; siblings "refuses 6001 mm…" and "pins the straight kitchen's wall A…" red under the mutation |

**`tests/structural-cabinetry-follows-the-kitchens-colour.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 209 | $buildId keeps its finish key absent | 1 | **No production input** (static) | Asserts `"finish" in bodyOf(design, row.placementId)` is false (structural-cabinetry...test.ts:209-215); design = withKitchenColour(onMaterial(PAL_ID), ANTRACIT), where onMaterial deletes `finish` from every placement and withKitchenColour touches only settings, both test-local; bodyOf is a test-local lookup. No command (setGlobalFinish) runs. | **D1-B strengthened** — red under mutation |
| 340 | $buildId keeps its finish key absent | 2 | **No production input** (static) | Same shape as s33.1 for the APPLIANCES rows (hood-600, fridge-free-700): `"finish" in bodyOf(withKitchenColour(onMaterial(PAL_ID), ANTRACIT), id)` over a test-built design from which onMaterial already deleted every finish key; no production function feeds the expression. | **D1-B strengthened** — red under mutation |

**`tests/the-corner-wears-a-colour.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 202 | $buildId keeps its finish key absent while following | 4 | **No production input** (static) | the-corner-wears-a-colour.test.ts:202-212: for each of the four CORNERS, `"finish" in bodyOf(withKitchenColour(onMaterial(PAL_ID), ANTRACIT), id)` is false because the test-local onMaterial deletes every body's finish and withKitchenColour edits settings only; no production function runs before the assertion. | **D1-B strengthened** — red under mutation |

**`tests/void-engine.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 380 | row 18: a wall-only column invents no floor space beneath it | 1 | **Mutation survived**. Mutation: src/void-engine.ts:930 recomputeVoids skips every column whose first region starts above the floor (`if ((column.regions[0]?.[0] ?? 0) > 0) continue;`). Went red instead: tests/qa-5f-column-extent.adversarial.test.ts "§6.1's rendered void box lies in the run it belongs to > puts the void back on the wall after deleting 'a fronted wall cabinet on wall A'" red (EXIT=1) | Both assertions are universally quantified over the returned voids (every y0>=1.5, none <1.5), so an empty array satisfies them; the case never asserts a void exists. column-extents, merge-empty-columns, empty-column-ceiling and void-engine files stayed green under the same mutation. | **D1-B strengthened** — red under mutation |

#### `packages/three-adapter` — 18 entries, 30 cases

**`tests/catalog-capability-parity.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 154 | covers the whole catalogue, with the recorded gaps named rather than dropped | 1 | **No production input** (static) | catalog-capability-parity.test.ts:155 `expect([...GATED_BUILD_IDS, ...RECORDED_CAPABILITY_GAPS].sort()).toEqual([...ALL_BUILD_IDS].sort())`: RECORDED_CAPABILITY_GAPS is the file-local `[]` (line 58) and GATED_BUILD_IDS is ALL_BUILD_IDS.filter(not in RECORDED) (line 60), so left side equals ALL by construction for whatever the catalogue holds; ALL feeds both sides. | **T1 strengthened** — red under mutation |
| 162 | has no recorded gaps: every entry in both populations is gated | 1 | **No production input** (static) | Lines 163-164: `expect([...RECORDED_CAPABILITY_GAPS]).toEqual([])` compares the file's own constant `[]` to `[]`, and `expect(GATED_BUILD_IDS).toEqual(ALL_BUILD_IDS)` compares ALL.filter(x => ![].includes(x)) to ALL. Only editing the test file can turn it red. | **T1 unchanged** — reads a test-local list or self-tests a test-local instrument; no production behaviour named |
| 200 | holds each recorded gap to still declaring a capability its geometry lacks | 1 | **No production input** (static) | The body is `for (const buildId of RECORDED_CAPABILITY_GAPS) { ... expect ... }` and RECORDED_CAPABILITY_GAPS is the file-local `readonly string[] = []` (line 58), so no iteration and no assertion ever runs; the file's own comment says the list is empty. | **T1 unchanged** — reads a test-local list or self-tests a test-local instrument; no production behaviour named |

**`tests/finishes.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 151 | publishes isWood beside the hex rather than a second colour | 1 | **Mutation survived**. Mutation: packages/three-adapter/src/finishes.ts:87 swatchOf returns `isWood: !definition.isOak`. Went red instead: tests/finishes.test.ts "a wood is one texture at several tints... > draws pal.alb on the kit's one oak map" (+9 more, incl. 'publishes that same value as the swatch, and calls it no wood') red, file EXIT=1 | Only the key set ['color','isWood'] is asserted, never the isWood values, so inverted values pass; the WOODS/FLATS cases and the free-colour case catch them. | **T1 strengthened** — red under mutation |

**`tests/insert-depth.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 352 | keeps the hood out of the map, and hangs it at the front instead | 1 | **Mutation survived**. Mutation: configurator-domain/src/commands/insert-fit.ts:~672 resolveDepthM lifted arm returns 0.33 m instead of declaredM (domain rebuilt). Went red instead: packages/three-adapter/tests/insert-depth.test.ts 'p22 keeps its 600 mm ... where the cap is lifted' and 'p24 ...' (also two entry-10 cases) went red | The case only reads recorded seatDepthMm of seeded p13 via derivePlacementRecords and never calls insertBody, so the depth map is not exercised; flattening the map leaves it green. | **T1 strengthened** — red under mutation |

**`tests/kitchen-parts.parity.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 1076 | refuses a node declared both added and removed | 1 | **No production input** (static) | openLedger (kitchen-parts.parity.test.ts:614) and BOTH_WAYS fixture are declared in the test file; the asserted throw comes from the test-local refuseTwoDeclarationsOnOneNode. No production symbol feeds it. | **T1 unchanged** — reads a test-local list or self-tests a test-local instrument; no production behaviour named |
| 1082 | opens on every declaration this file actually makes | 1 | **No production input** (static) | Calls test-local openLedger on test-local DECLARED_STRUCTURAL_CHANGES / DECLARED_DIVERGENCES / DECLARED_MESH_RENAMES and asserts not.toThrow; no production code runs. | **T1 unchanged** — reads a test-local list or self-tests a test-local instrument; no production behaviour named |

**`tests/kitchen-shell.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 200 | mutation control: a current-record-derived shell restores p7 and duplicates the hob | 1 | **Mutation survived**. Mutation: three-adapter/src/kitchen-shell.ts:54 discarded = [] (shell keeps every customer body). Went red instead: packages/three-adapter/tests/kitchen-shell.test.ts 'contains exactly the five documented room children' (+ 'mounts only the shell when ... zero placements', 'does not restore p0..' ) went red | The shell under assertion comes from test-local buildForbiddenRecordDerivedShell over kit.builders['kitchen-l']; buildKitchenShell is never called. | **T1 unchanged** — reads a test-local list or self-tests a test-local instrument; no production behaviour named |

**`tests/measure-built-body.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 218 | gives the hood the declared 100 mm and every other body none | 1 | **No production input** (static) | Asserts Object.keys(ROW_19_DECLARED_WALL_GAP_M) equals ['hood'] and ROW_19_DECLARED_WALL_GAP_M['hood'] closeTo 0.6-0.5; the const is declared at measure-built-body.adversarial.test.ts:183 in the same file. No production symbol is read. | **T1 strengthened** — red under mutation |

**`tests/picking.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 162 | a void never swallows a click aimed at a different cabinet standing elsewhere | 1 | **Mutation survived**. Mutation: three-adapter/src/picking.ts pick(): void hit wins over solid hit. Went red instead: packages/three-adapter/tests/picking.test.ts 'row 22: a solid cabinet is selected even when a void lies along the same ray' went red | The voids group passed is empty, so no void is ever on the ray; the test only checks nearest-of-two solids. | **T1 strengthened** — red under mutation |

**`tests/qa-0099c-each-unchoosing-body-by-name.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 316 | names both appliances | 1 | **No production input** (static) | APPLIANCES = UNCHOOSING.filter(family==='appliance') where UNCHOOSING is a literal table at qa-0099c-...adversarial.test.ts:71; expected ['fridge-free-700','hood-600'] is another literal. No production call. | **T1 strengthened** — red under mutation |
| 372 | names it | 1 | **No production input** (static) | REPAINTED_STRUCTURAL filters the same test-local UNCHOOSING table (line 71) and is compared to ['open-shelf-600'] literal. | **T1 strengthened** — red under mutation |
| 399 | has no structural body left with nothing for the colour to reach | 1 | **No production input** (static) | Filters the test-local UNCHOOSING table for structural rows with paintedSurfaceCount 0 and expects []; second expect asserts the table lacks 'base-corner-return-320'. Both sides are the file's own table. | **T1 strengthened** — red under mutation |

**`tests/qa-7h-resize-in-place.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 92 | reports a replaced geometry that nobody freed | 1 | **Mutation survived**. Mutation: three-adapter/src/kitchen-shell.ts:264 replaceGeometry no longer calls previous.dispose(). Went red instead: packages/three-adapter/tests/qa-7h-resize-in-place.adversarial.test.ts 'leaves nothing attached disposed and nothing replaced alive, over 100 corrections' went red | The test swaps floor.geometry itself and asks its own ResourceLedger; the shell is only a fixture. Harness self-test, as labelled. | **T1 unchanged** — reads a test-local list or self-tests a test-local instrument; no production behaviour named |

**`tests/qa-7j-straight-room.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 151 | never seats a panel at x ≤ 0 or past wall A's end at %i mm | 13 | **Mutation survived**. Mutation: configurator-domain/src/run-end-panel.ts:81 runEndPanelSeatM always returns undefined (domain rebuilt). Went red instead: packages/three-adapter/tests/kitchen-shell.run-end-panel.test.ts 'stands at the reference room's 3.51 m' (and domain tests/run-end-panel.test.ts 'seats the seeded panel on M1's parity number') went red | Both assertions sit behind `if (seatM === undefined) return;`, so a function that never seats a panel passes all 13 rows with zero assertions. | **T1 strengthened** — red under mutation |

**`tests/qa-c2s1-corner-wall-unit.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 311 | is measured at both corners of a U, in both rows, at all three depth states | 1 | **No production input** (static) | everyPlacedUnit().length = 3*(4*2+1+2*4) is fixed by the test's ROOMS list and sceneOf's own rows/corners (design.room.heightMm, shape==='U'); units are built by the test via kit.make.wallCornerX. Production only matters in that generateKitchen/setCabinetDepth must not throw. No mutation attempted. | **T1 unchanged** — reads a test-local list or self-tests a test-local instrument; no production behaviour named |

**`tests/stage.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 192 | would lose the row to a camera pulled back to hold the longest approved wall | 1 | **Mutation survived**. Mutation: three-adapter/src/stage.ts:276 PRESET_DISTANCE_M * 3 (preset pulled back). Went red instead: packages/three-adapter/tests/stage.test.ts 'the ceiling row stays tappable > overview/wallA/wallB projects the 2.20-2.60 row taller than a tap target' went red | The camera is hand-built with z=15.385 and only wallA.target is read from production; it is a falsification control for thinnestBandPx. | **T1 unchanged** — reads a test-local list or self-tests a test-local instrument; no production behaviour named |

**`tests/the-corner-wears-a-colour.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 226 | paints the carcass of every one of the four corners | 1 | **No production input** (static) | CORNERS is a literal table at the-corner-wears-a-colour.test.ts:57 and CARCASS_MESH_NAMES a literal Set; both assertions filter and compare these. No kit or production symbol is touched. | **T1 strengthened** — red under mutation |

### 1b. Mutation survived, but nothing else went red either

The test stayed green with the behaviour broken, and so did every neighbouring test that was run. Either the
mutation is equivalent on shipped data, or the behaviour is unguarded everywhere. Treat as strong suspects.

#### `apps/web` — 30 entries, 48 cases

**`tests/app/api/designs/visitor-identity.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 191 | appears in exactly one production module, which imports server-only / has no environment conditional on Secure | 1 | Mutation survived, no witness. Mutation: visitor.ts VISITOR_COOKIE_ATTRIBUTES secure: true -> !Reflect.has(globalThis,'location') (an environment conditional with no `process.env`) | Case 'has no environment conditional on Secure' is only not.toMatch(/process\.env/) over source text, so a conditional spelled otherwise passes. Mutation is true under the node test env so no behavioural test can see it; the other case (server-only import / name literal) is a genuine spelling pin and was not weakened. The reader's own proposed mutation would in fact turn the line-225 secure===true test red. | **W1-B strengthened** — red under mutation |

**`tests/app/configurator/configure/use-back-guard.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 243 | the wiring no harness can stand in for (has the configure screen ask for the owner's variant only...; records Step 1's hand-over before the push...) | 2 | Mutation survived, no witness. Mutation: configure-screen.tsx:73 `isOwner: variant === "owner"` -> `... \|\| true` (guard for shared variant); use-generation.ts:301 `recordEditorOpenedFromStepOne(id)` -> `if (id === "") recordEditorOpenedFromStepOne(id)` | Both source-text cases stay green while behaviour changes. No other test went red: tests/app/configurator (221), configure-screen-shared-variant, shared-design-view, and the room/use-back-guard dom suites (115) all passed under the mutations, so the wiring is unguarded elsewhere (e2e not run). | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/app/internal/mirror-shot/page.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 34 | renders on a production server that set the flag | 1 | Mutation survived, no witness. Mutation: apps/web/src/app/internal/mirror-shot/page.tsx:16 `return <MirrorShot />` -> `return <div />` | Only toBeDefined on the returned element, with MirrorShot mocked to null. tests/app/internal (29 tests) all stayed green; the only other file naming mirror-shot is that test, so the area is unguarded outside Playwright (not run). | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/app/internal/scene-shot/page.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 38 | renders on a production server that set the flag | 1 | Mutation survived, no witness. Mutation: apps/web/src/app/internal/scene-shot/page.tsx: returned <div data-w={request.width} /> instead of <SceneShot ... /> with its parsed props | resolves.toBeDefined passes for any element. tests/app/internal, room-page and locale-layout (43 tests) stayed green; shot-request.test.ts covers the parser but nothing asserts the page hands it to SceneShot. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/app/review-screen.dom.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 589 | what the stylesheet declares (the layout itself is the visual pass's) | 5 | Mutation survived, no witness. Mutation: review.module.css: appended later rules .bottom{position:static}, .buyRow{flex-wrap:wrap}, .picture{height:300px}, .cta{min-height:20px} | ruleBody() takes the first matching rule, so a later override defeats the cases for .bottom sticky, .picture 158px (twice), .buyRow no-wrap and .cta 52px; I did not mutate the other selectors. review-screen.dom.test and review-stylesheet-classes.test (53 tests) stayed green; layout is only seen in Playwright (not run). | **W1-B strengthened** — red under mutation |

**`tests/lib/server/share-token.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 67 | calls no non-cryptographic random source anywhere in the module | 1 | Mutation survived, no witness. Mutation: apps/web/src/lib/server/share-token.ts:44 default drawBytes -> a function that calls randomBytes(count) and discards it, returning Uint8Array.from({length}, () => Math["random"]() * 256) | Regex /Math\s*\.\s*random\s*\(/ misses Math["random"](). The 'draws its bytes from the platform CSPRNG by default' spy test stays green too (the dummy randomBytes call satisfies it); share-token, write-token and share-link-route suites (68) all passed. Weak entropy is only guarded by spelling. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/panel/finish-swatch-colors.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 33 | publishes the chip's own colour as the one custom property / paints the swatch from that property / derives a wood's grain from the same property | 3 | Mutation survived, no witness. Mutation: apps/web/src/panel/editor-panel.module.css:end — appended `.swatchColor { background: #ff00ff !important; }` (swatches paint magenta) | The three cases only call toContain on the CSS/TSX source text; the appended override leaves every searched substring in place. Sibling files qa-6p-finish-dom, qa-6r-control-shape, follow-the-kitchen-colour also stayed green (EXIT=0), so nothing in these suites witnesses the painted colour. | **W1-B strengthened** — red under mutation |

**`tests/panel/follow-the-kitchen-colour.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 186 | wires the store's clearFinish, which is the press no node runtime can drive | 1 | Mutation survived, no witness. Mutation: apps/web/src/panel/editor-panel.tsx:280 — replaced `onFollow={clearFinish}` with `onFollow={() => undefined}` plus a comment line `// onFollow={clearFinish}` | Test regex-matches editor-panel.tsx source; the commented-out text satisfies both regexes while the Follow press is a no-op. Whole file, settings/qa-0099-global-colour, settings/qa-w2-locked-surface-reach and store/backlog-51 all stayed green. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/panel/panel-store-seam.qa.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 333 | reads the reflected width note on a right-hand room | 1 | Mutation survived, no witness. Mutation: apps/web/src/panel/use-panel-view.ts:~59 — passed `direction: "left"` to describePanel instead of the selected direction | The test builds its own panelFromStore mirror (which derives direction itself), so the real hook is never run. Whole file plus width-stepper.qa, width-stepper.wall-c and i18n/qa-7i-side-words all green under the mutation; only the e2e capture (not runnable here) guards the hook. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/persistence/save-coalescer.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 151 | returns synchronously without ever handing the caller a promise to await | 1 | Mutation survived, no witness. Mutation: apps/web/src/persistence/save-coalescer.ts:161 — made scheduleSave `async ... Promise<void>` | The only assertion is `not.toThrow()`; the return value is never inspected. Whole file and save-coalescer.adversarial, .conflict, client-write-generation all stayed green, so the guarantee rests on the TypeScript type alone (test's own comment concedes it). | **W1-B strengthened** — red under mutation |

**`tests/persistence/share-link-client.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 90 | turns a refusal into one ShareLinkRequestFailedError, carrying no status or body (%s) | 3 | Mutation survived, no witness. Mutation: apps/web/src/persistence/share-link-client.ts:~74 — request() now throws ShareLinkRequestFailedError carrying `${method} ${status} ${body text}` on any non-ok response | Case asserts only `rejects.toThrow(ShareLinkRequestFailedError)` (class), never the message, so an error carrying status and body passes for issue/revoke/status. Whole file and tests/share/share-design.dom.test.ts also green; e2e specs not runnable here. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/price/price-bar-layout.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 195 | is published as a custom property by the component | 1 | Mutation survived, no witness. Mutation: apps/web/src/price/price-bar.tsx:16 — the published PRICE_BAR_METRICS is `{"--price-bar-height": "0px"}`; the original literal kept in a dead UNUSED_METRICS const | Test is toContain on price-bar.tsx source, so a dead constant satisfies it while the bar publishes 0px. aud-014, price-wiring.adversarial and qa-6bg-money-seam also green; no test renders PriceBar's style attribute. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/price/price-bar-model.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 114 | leaves the figure byte-identical, because the model never sees the refusal | 1 | Mutation survived, no witness. Mutation: apps/web/src/price/price-bar-model.ts:56 — describePriceBar returns the unpriced bar whenever an extra `rejection` input is present (no caller supplies one) | Case compares pricedBarFor(KITCHEN_L_DESIGN) with a second identical call; no refusal is ever supplied. A refusal-sensitive model survives. A call-counter mutation (odd calls +10,000,000 minor units; +1 was rounded away) turns it red, so it is only a determinism check. No other test goes red under the refusal mutation, so landing is unwitnessed. | **W1-B strengthened** — red under mutation |
| 121 | cannot be handed to this model at all | 1 | Mutation survived, no witness. Mutation: apps/web/src/price/price-bar-model.ts:56 — describePriceBar honours an extra optional `rejection` input (same mutation as s09.1) | Asserts Object.keys of an object literal the test built (`{ pricing: ... }`); describePriceBar and DescribePriceBarInput are never involved. Quote: `expect(Object.keys({ pricing: priceOf(KITCHEN_L_DESIGN) })).toEqual(["pricing"])`. Effectively static-proved, mutation confirmed it cannot see an added input. | **W1-B strengthened** — as a `tsc` guard (TS2578 under the mutation) |

**`tests/price/qa-m6-wave-b-tier-deltas.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 99 | names the two groups' deltas apart even where both offer the same amounts | 1 | Mutation survived, no witness. Mutation: apps/web/src/price/whole-kitchen-tiers.ts:101-105 — offerWholeKitchenTiers hands both groups one merged delta map (material and hardware flattened, keyed by bare tierId) | Body only checks the two id sets are disjoint and tierIds equal the book lists; no delta is compared. With disjoint ids a flattened map is behaviourally equivalent, and parsePriceBook refuses colliding ids, so the mutation is probably equivalent; whole-kitchen-tier-group-keys and three settings suites also green. | **W1-B unchanged** — equivalent mutant by reading only; the parser's refusal of colliding ids was not verified |
| 170 | never shows a material tier an amount measured for a hardware one | 1 | Mutation survived, no witness. Mutation: apps/web/src/price/whole-kitchen-tiers.ts:101-105 — offerWholeKitchenTiers hands both groups one merged delta map (material and hardware flattened, keyed by bare tierId) | Collided book is refused by the parser, so deltas are undefined and `hardwareAmounts.has(undefined)` over a set of defined numbers is satisfied by absence. The flattening mutation is unreachable for any book that parses (likely equivalent), so nothing in these suites can witness it. | **W1-B unchanged** — equivalent mutant by reading only; the parser's refusal of colliding ids was not verified |

**`tests/room/plan-preview.dom.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 270 | draws the border and sets the label's type from those published figures | 1 | Mutation survived, no witness. Mutation: apps/web/src/room/room.module.css:EOF — appended `.planBox { border: 0; }` | Test only toContain()s the declaration string; a later override that removes the border leaves it green. plan-preview.dom, qa-7f2-s2-red-wall, dimensions-form.dom, facing-labels (156 tests) all stay green, so the area is unguarded for computed effect. | **W1-B strengthened** — red under mutation |
| 437 | declares the frame's red once, on the plan box, for the bar and its label to share | 1 | Mutation survived, no witness. Mutation: apps/web/src/room/room.module.css:EOF — appended `.planWallLabel[data-marked="true"] { color: inherit !important; }` | Asserts source spelling of --refusal and the rule regex; override defeating the red passes, and 156 tests across 4 sibling files stay green. Bar fill red is covered separately, label colour effect is not. | **W1-B strengthened** — red under mutation |

**`tests/room/room-screen.dom.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 254 | composes the pill from the approved leaves and never from the numbers | 1 | Mutation survived, no witness. Mutation: apps/web/src/room/room-screen.tsx:143 — pill rendered as `(translate('configure.stepPill', ...), `${String(1)}/${String(4)}`)` | Source-text check passes for an aliased hardcoded pill; all 57 tests in room-screen.dom.test.ts stay green because ro and ru both define stepPill as '{step}/{totalSteps}', so the render is identical. The mutation is observably equivalent under current catalogues, so no behavioural test could witness it. | **W1-B strengthened** — red under mutation |

**`tests/room/step-one-desktop-footer-centring.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 33 | the desktop Step 1 footers (3 cases) | 3 | Mutation survived, no witness. Mutation: apps/web/src/room/room.module.css:EOF — appended later @media (min-width: 900px) rule setting .footer/.dimensionsFooter/.composeFooter to align-items: flex-start; height: 40px | The tests regex the first matching desktop rule body, so a later override of both the centring and the 88px height leaves all 3 green; 116 tests across 4 room CSS-reading siblings also stay green. The file header concedes this; computed layout is left to an e2e spec (not run here). | **W1-B strengthened** — red under mutation |

**`tests/scene/camera-preset-survives-a-locale-switch.dom.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 79 | is still where they left it after the subtree remounts | 1 | Mutation survived, no witness. Mutation: apps/web/src/app/configurator/configure/configure-screen.tsx:65-66 — presetId/standAt taken from local `useState(storedPresetId)` instead of the store (store hook still called) | The test mounts a test-local CameraReadout against the real zustand store, never ConfigureScreen, so it cannot see how the screen holds the camera. 22 tests (url-seam siblings: qa-7j-camera-row, single-mount, scene-view) plus 72 more across 6 other ConfigureScreen suites all stay green: no test anywhere guards the remount behaviour of the screen. | **W1-B strengthened** — **previously unguarded**; red under mutation |
| 95 | takes the preset from the store rather than holding it in state | 1 | Mutation survived, no witness. Mutation: apps/web/src/app/configurator/configure/configure-screen.tsx:65-66 — same local-state mutation, keeping `useCameraPreset` text, untyped `useState(...)`, no `setPresetId` | Three string checks on configure-screen.tsx source; any state holder under a different type/setter name passes while the store import stays. Nothing else in the suite fails either, so the wiring is guarded only by this text check. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/scene/kitchen-stage-disposal.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 214 | hands the teardown the kit, room, ground, blob and lights it mounted | 1 | Mutation survived, no witness. Mutation: apps/web/src/scene/kitchen-stage.tsx:248-249 — stage built with `ground: createContactBlob(), blob: createShadowGround()` (swapped) | Ground and blob are only checked toBeInstanceOf(Object3D) and both mocks return a Group, so swapping them is invisible. 37 tests in 6 sibling kitchen-stage/review-scene suites also stay green; only an omitted field would be detected. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/scene/overflow-warning-layout.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 93 | the warning is an overlay on the scene, taking none of its height (7 cases, from 'stands inside the viewport...') | 5 | Mutation survived, no witness. Mutation: configure.module.css:EOF — later `.sceneFooter { position: static; bottom: auto; pointer-events: auto; flex-direction: row }` and `.viewport { position: static; display: grid; grid-template: auto 1fr / auto }`; overflow-warning.module.css:EOF — later `.warning { background: transparent }` and `.warning::after { content : "x" }` | 5 of the 7 cases are defeated by later CSS overrides (they regex the first matching block); 141 tests across overflow-warning, -viewport, price-bar-viewport and single-mount siblings stay green. The two markup cases ('stands inside the viewport', 'stacks below the orbit hint') were not mutated, so they are not covered by this verdict. | **W1-B strengthened** — red under mutation |

**`tests/settings/global-colour-group.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 311 | wires the production sheet's own handler, which no node runtime can open the sheet to prove | 1 | Mutation survived, no witness. Mutation: apps/web/src/settings/global-settings.tsx:188 — chooseFinish body replaced by `void finish;` (JSX prop text unchanged) | Regex only sees `onChooseFinish={chooseFinish}` in the source. 64 tests across global-colour-group, global-settings-inert.dom, global-settings-shell, qa-0099-global-colour and withdrawn-tier-recovery stay green with a dead handler, so no unit/DOM test presses a colour swatch through the real sheet (an e2e spec exists, not run here). | **W1-B strengthened** — **previously unguarded**; red under mutation |
| 532 | leaves the stored document byte-identical to the one the sheet opened on | 1 | Mutation survived, no witness. Mutation: apps/web/src/settings/global-settings.tsx:338 — onCancel={close} replaced by `() => { applyPending(); close(); }` | The property reduces presses through chooseTierIn/chooseDepthIn/chooseFinishIn and never touches the store with them, so a cancel that applies pending cannot affect it. 79 tests across 6 settings suites stay green; only the e2e apply spec (not run) could catch it. | **W1-B removed** — redundant; W1-A's "writes nothing to the document when the customer cancels" went red |

**`tests/settings/pending-choice-invariant.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 135 | leaves the stored document byte-identical to the one the sheet opened on | 1 | Mutation survived, no witness. Mutation: apps/web/src/settings/global-settings.tsx:338 — onCancel={close} replaced by `() => { applyPending(); close(); }` | Same shape as s15.3: pendingAfter(presses) is a pure reducer fold, the store is built and compared but never passed to anything. Cancel applying the pending choice leaves it and 78 other settings tests green. | **W1-B removed** — redundant; W1-A's "writes nothing to the document when the customer cancels" went red |

**`tests/settings/qa-0104-the-pill-at-every-rung.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 234 | draws at least one label and exactly one swatch at %i drawn, on both designs | 4 | Mutation survived, no witness. Mutation: apps/web/src/settings/global-settings.tsx:273-284 — removed the `<span className={styles.swatch} aria-hidden="true" …/>` from the pill (diff confirmed) | The swatch assertion is `countOf(markup,'aria-hidden="true"') > 0`, satisfied by separators and the caret. 167 tests across the pill file, global-settings-shell/adversarial/model, qa-0099, qa-6p-finish-dom and starting-price stay green with no swatch drawn. | **W1-B strengthened** — **previously unguarded**; red under mutation |

**`tests/settings/qa-w2-locked-surface-reach.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 234 | guards the commit itself, on every handler that can reach it | 1 | Mutation survived, no witness. Mutation: apps/web/src/settings/global-settings.tsx:211 applyPending — replaced 'if (editability.isReadOnly) return;' with the comment '// editability.isReadOnly' | The regex only checks the substring 'editability.isReadOnly' occurs inside the applyPending body, so a comment satisfies it. Whole file (8) and read-only-global-settings.test.ts (10) stayed green too; no unit test reacts, so the removed guard is unguarded outside e2e. | **W1-B strengthened** — the review's mutation is equivalent on the rendered sheet (the button is disabled); a DOM test now holds the guard and the disabled door together |

**`tests/settings/share-design-mounted.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 12 | is imported and rendered exactly once, inside the choosing step's body | 1 | Mutation survived, no witness. Mutation: apps/web/src/settings/global-settings.tsx:531 — replaced '{shareControl}' with '{null}' (control never rendered; import and line 331 intact) | Text-only assertions on global-settings.tsx. Whole file, tests/share/share-design.dom.test.ts (16), global-settings-seams (9) and read-only-global-settings (10) all stayed green; only the e2e spec tests/e2e/share-design.e2e.spec.ts would see it and cannot run here. | **W1-B strengthened** — **previously unguarded**; red under mutation |

#### `packages/configurator-domain` — 7 entries, 10 cases

**`tests/catalogue-assembly-refusals.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 56 | the catalogue assembler runs every refusal it is supposed to (calls %s on the assembled entries x2, found a body to read) | 3 | Mutation survived, no witness. Mutation: packages/configurator-domain/src/fixtures/kitchen-l-design.ts:~691 buildKitchenLBodyCatalog — 'if (entries.length < 0) refuseUndeclaredDepthRules(entries);' (call text kept, never runs) | Text match on the comment-stripped function body; a dead guarded call still contains 'refuseUndeclaredDepthRules(entries)'. cabinet-depth-parameter.test.ts (120) and catalog.test.ts (91) stayed green too: no shipped row triggers the refusal, so nothing else witnesses the call going dead. The file's header admits this limit. | **D1-B settled** — not equivalent; guarded since D1-A's behavioural test. Regex rows kept: they pin that each refusal is handed the whole `entries` list |

**`tests/commands/replan-dependent-members.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 310 | adds no caller of resolvedFinishOf and no second writer of body.finish / takes no probe lease in the insert path | 2 | Mutation survived, no witness. Mutation: src/commands/replan-dependent-members.ts:~190 — rebuilt placement body gains a `['fin'+'ish']: 'mutant'` key | Substring scan of source text passes a computed key. No other test in replan-dependent-members, qa-6z, insert-body, insert-depth, qa-item8, qa-0099c went red, so nothing asserts the colour is not written behaviourally here (the file says the store suite does). Landing not proven. | **D1-B part** — not equivalent, **previously unguarded**: case 1 now a real test, red under mutation; case 2 **open**, needs a decision |

**`tests/commands/set-cabinet-depth.frozen-map.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 289 | reads no band or level from any file that resolves a chain | 1 | Mutation survived, no witness. Mutation: src/along-wall-chain-shift.ts:~256 — chainOfRecordedSource infers the chain from definition['band'] instead of the declared rule | Bracket access dodges the '.band' substring scan. Whole frozen-map file, set-cabinet-depth, along-wall-chain-shift, qa-6j-cd, backlog-50 stayed green: band inference equals the declared chain on shipped data, so only the text scan guards it, and it is bypassable. | **D1-B strengthened** — not equivalent, **previously unguarded**; the review's claim is false on shipped data (two `top` rows slide to 1300 and 1270) |

**`tests/contact/qa-8h-contact-fields.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 706 | stores the member itself, never the text that was sent | 1 | Mutation survived, no witness. Mutation: src/contact/contact-fields.ts:~210 — judgeConsentTextVersion accepts raw.trim() instead of raw | Equivalent mutant: matching is exact against a one-element set, so the sent text and the member are always the same string; stored value cannot be told apart. Whole qa-8h file, contact-fields and contact-submission tests green. The test only compares the stored set to CONSENT_TEXT_VERSIONS. | **D1-B unchanged** — equivalent mutant |

**`tests/corner-assembly-size.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 757 | returns types that are not each other's, so the swap is a compile error | 1 | Mutation survived, no witness. Mutation: src/corner-assembly-size.ts:211 — narrowestCornerReachMm return type widened to any. Went red instead: Not a vitest test: `tsc --project tsconfig.json --noEmit` in packages/configurator-domain exits 2 with TS2578 unused @ts-expect-error at corner-assembly-size.test.ts:766 and :768 | Under vitest the assertion is a 2-element length check and cannot fail. The real guard is the package typecheck gate (tests are in tsconfig.json include), which does catch the mutation. | **D1-B unchanged** — review wrong: the guard is the typecheck (`tsc` exits 2 under the mutation) |

**`tests/generation/qa-7d3-upper-suppression.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 198 | treats a body finishing flush with a row's floor as leaving that row free | 1 | Mutation survived, no witness. Mutation: src/generation/upper-policy.ts:88 — risesIntoWallRow `declaredTopMm > WALL_ROW_Y0_MM` changed to `>=` | The test counts flush pairs in the shell's own corner-return stacking and never reaches risesIntoWallRow. Whole qa-7d3 file, generate-kitchen.linear and generate-kitchen.u.uppers stayed green: no generated body declares a top of exactly 1500, so the mutant is likely equivalent on shipped data and the boundary is unpinned. | **D1-B strengthened** — not equivalent, **previously unguarded**; red under mutation |

**`tests/pricing/price-design.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 294 | does not step a row whose front population is fixed at every width | 1 | Mutation survived, no witness. Mutation: src/cabinet-handles.ts:152 declared-count arm returns deriveDoorCount(widthMm) for every width except 800 | Candidate checks only width 800 (+ formula shape string). With the mutation, full price-design.test.ts, qa-6b2 door-step, qa-6b-pricing, cabinet-handles.test.ts and qa-7d5b-s0 all stayed green (EXIT=0): base-sink's linear-in-width formula ignores leaf count, so price tests cannot see it and cabinet-handles.test.ts:260 also only uses 800. The 'every width' claim is unguarded anywhere. | **D1-B strengthened** — not equivalent, **previously unguarded**; red under mutation |

#### `packages/three-adapter` — 1 entries, 1 cases

**`tests/kitchen-shell.domain-seat.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 141 | resolves every slab constant through the domain module | 1 | Mutation survived, no witness. Mutation: three-adapter/src/kitchen-parts.ts: removed the 4 domain imports/re-export, declared local export const copies with identical values | toBe on numbers cannot tell a re-export from a same-value copy; the mutation is behaviourally equivalent, so nothing anywhere went red. The file's source-scan test inspects kitchen-shell.ts, not kitchen-parts.ts. | **T1 unchanged** — equivalent mutant (by reading; no differing-value mutation run) |

### 1c. Judged by reading only (Playwright and persistence suites, not run)

#### `apps/web` — 1 entries, 1 cases

**`tests/e2e/price-breakdown.desktop.e2e.spec.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 148 | leaves the page behind it reachable to the pointer, as it already was to Tab | 1 | Second read | Fake check, to be strengthened rather than deleted. 'price-breakdown-scrim' exists nowhere in apps/ or packages/ except this line, so not.toBe can only fail on a literal revert. A full-viewport overlay under any other (or no) test id — the reintroduction the comment claims to catch — passes. Assert what IS at (40,400), e.g. the stage/canvas, instead. |

#### `packages/persistence` — 6 entries, 6 cases

**`tests/migrate.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 376 | is enforced by there being no update or delete against it anywhere in src/ | 1 | Second read | The title says 'anywhere in src/' and the body reads two files, migration-ledger.ts and migrate.ts. A 'delete from schema_migrations' added to migrate-status.ts (which already queries the ledger) or any other src file is exactly what the title promises to catch and is never read. The check is sound for the two files it reads; the remedy is to read every file under src, not to delete it. | **P1 strengthened** — now scans every `.ts` and `.sql` under `src`; red under mutation |
| 488 | the migrate CLI (prints the database name, never the connection string it was given / catches a failed run...) | 1 | Second read, partial | Confirmed for 'prints the database name, never the connection string': the regexes pin the opening of the call at migrate.ts:273-278, so appending connectionUrl to the second argument still matches all four and the log leaks. Not confirmed for 'catches a failed run': it promises only that the catch exists and prints once through describeMigrationFailure, which is what its regexes see (removing the try/catch reddens it). Neither is useless; the first overclaims. | **P1 part** — first test strengthened (the whole print expression pinned), red under mutation; second unchanged, review wrong: already red |

**`tests/neon-configuration-repository.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 332 | leaves no row behind once its own cleanup has run | 1 | Second read | The test deletes its own row with raw SQL (:343) and then asserts load() misses, which is the miss path :321 already asserts. No production behaviour called 'cleanup' exists; that a minted row is deletable by a bare delete is exercised by afterEach (:113-:118) after every test in the file. | **P1 removed** — redundant; sibling "throws DesignNotFoundError for a random nonexistent id" red under the mutation |

**`tests/qa-7t-s2b-lock.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 120 | passes the 60 s hook timeout to the afterAll / passes the 210 s hook timeout to the beforeAll | 1 | Second read, partial | Not fake checks: a hook registered without its timeout argument fails the regex, and no runtime test can observe a hook timeout. But the afterAll case (:120) is the same regex, character for character, as tests/test-schema-lock.test.ts:101-:103. The beforeAll case (:126) is the only pin of the 210 s hook being passed and stays. | **P1 part** — review wrong, both regex tests go red; the afterAll case removed as redundant, the beforeAll case stays |

**`tests/qa-7t-s3-schema-status.adversarial.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 208 | puts the synthesised version above every real one, so it can never collide with a ledger row | 1 | Second read | Both sides are test fixtures: tests/support/synthesised-migration-file.ts against readMigrationFiles(); no production verdict is involved. The collision it guards against already shows at :182 and :197, which expect 'behind' and 'behind by 1 migration' for the synthesised file; a colliding version would not give that outcome. | **P1 unchanged** — review wrong: goes red under mutation; a helper self-test |

**`tests/retry-on-transient-failure.test.ts`**

| Line | Test | Cases | Proof | Why | Status |
| --- | --- | --- | --- | --- | --- |
| 567 | a repeat past a lost acknowledgement resolves with the same revision, rather than raising a duplicate-key rejection (Amendment H1: the insert takes on conflict (id) do nothing) | 1 | Second read | The title promises to catch the loss of 'on conflict (id) do nothing', but the fetch stub answers a canned 200 whose row is hard-coded to revision '1' and nothing reads the SQL text, so deleting the clause leaves it green. requests.toHaveLength(2) repeats :540. The property itself is observable only against a database (retried-writes-leave-no-trace.test.ts). | **P1 strengthened** — reads the conflict clause off both attempts' insert; red under mutation |

## 2. Near-duplicates

#### `apps/web` — 152 entries, 321 cases

**`tests/app/api/designs/mint-failure-log.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 132 | calls mint something other than save, so a log filter can tell them apart | 1 | Same failing-mint fixture; :120 toEqual's the whole logged line including operation:'mint', so any change to the operation name reddens both. Strict subset. **Keep:** `apps/web/tests/app/api/designs/mint-failure-log.test.ts:120` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/api/designs/qa-7e3a-visitor.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 371 | a mint the repository refuses sets no cookie at all (it throws before any response exists) | 1 | Only assertion is rejects.toThrow('connection reset'); the 'no cookie' half of the title is unasserted. The rethrow in api/designs/route.ts:34-37 is already pinned by mint-failure-log.test.ts:112 (and a plain Error at :192). **Keep:** `apps/web/tests/app/api/designs/mint-failure-log.test.ts:112` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/api/designs/write-authorization.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 223 | answers 400 for $name (truncated JSON / not JSON at all / an empty body) | 3 | Same three bodies, same PUT, same headers (requestWith and rawBodyRequest are identical); the twin asserts 400, stored-unchanged AND the exact DESIGN_INVALID body. Strict subset. **Keep:** `apps/web/tests/app/api/designs/write-authorization.test.ts:436` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 434 | refuses a pre-ADR-0019 row outright — no credential can read or write it (Amendment H2) | 1 | Same seedTokenlessRow fixture, same GET 404 / PUT 403; the twin additionally asserts the stored design is unchanged. **Keep:** `apps/web/tests/app/api/designs/write-authorization.test.ts:321` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 459 | refuses a cookie-less read outright, rather than answering canWrite: false (Amendment H2) | 1 | Cookie-less GET of a minted design asserting 404; write-authorization.test.ts:567 is the same request (readRequest with no cookie) and the same single assertion. **Keep:** `apps/web/tests/app/api/designs/write-authorization.test.ts:567` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/api/designs/write-authorization.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 345 | returns byte-identical refusals for a wrong token and an unknown id / names no design id in the refusal body | 2 | adversarial:277 compares wrong-token vs unknown-id on status, raw body text and all headers (plus a missing cookie); adversarial:306 asserts the body holds no id, 'token' or 'credential'. Both candidates assert a subset on the same route branch (writeForbiddenResponse). **Keep:** `apps/web/tests/app/api/designs/write-authorization.adversarial.test.ts:277` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 385 | re-issues the write cookie / re-issues the same token rather than rotating it | 1 | :385 (name, Max-Age=2592000, HttpOnly, Secure) is a subset of adversarial:638. :400 is kept: it asserts the cookie pair EQUALS name=sentToken, where :638 only toContain's that prefix, so a re-issue that appended to the token passes :638 and fails :400. Marginal; could be folded into :638 instead. **Keep:** `apps/web/tests/app/api/designs/write-authorization.adversarial.test.ts:638` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 418 | issues no cookie on a refused write | 1 | Identical to the 'no cookie at all' row of the adversarial it.each: cookie '', expects 403 and set-cookie null. **Keep:** `apps/web/tests/app/api/designs/write-authorization.adversarial.test.ts:656` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 496 | still refuses an unauthorised caller before the parser sees the body | 1 | Byte-equivalent request (body 'definitely-not-json', cookie '', same headers) and the same single 403 assertion. Keep one of the pair, not neither. **Keep:** `apps/web/tests/app/api/designs/write-authorization.adversarial.test.ts:242` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 557 | reports canWrite: false to the owning browser that sends no write-token cookie — a 200, never a 401 or 403 | 1 | Same mint, same GET with only the visitor cookie; :543 toEqual's the whole body {id, revision, design, canWrite:false} and the 200, which implies all three assertions here. **Keep:** `apps/web/tests/app/api/designs/write-authorization.test.ts:543` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/configurator/configure/top-bar-box.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 294 | costs the desktop canvas exactly the 21 px the ruling accepted, and no more | 1 | declaredDesktopBandHeight() - 55 === 21 with two test-local constants (top-bar-box.test.ts:46,52) is band === 76 restated; :269 asserts exactly that against RULED_DESKTOP_HEIGHT_PX = 76. Same single production change reddens both. **Keep:** `apps/web/tests/app/configurator/configure/top-bar-box.test.ts:269` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/configurator/configure/use-back-guard.review.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 227 | is not what a landing on another page is | 1 | ARMED here {designId, guardedPathname: EDITOR, isBeingAnswered:false} is exactly GUARDED in use-back-guard.test.ts:35; both land on STEP_ONE with isLandedEntryAGuard false and expect 'forget-origin' (decidePopstate's !isEditorPathnameOf branch). The twin also covers the being-answered origin. **Keep:** `apps/web/tests/app/configurator/configure/use-back-guard.test.ts:174` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/home-navigation.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 74 | a matching cookie: 307 to the resumed design / well-formed, matching nothing / malformed | 1 | The 'found' case (:74) is a subset of qa-7e3a-resume:88 (status, location, no Set-Cookie, plus cache-control, body and hash). The other two are kept: they assert status 307 on the clear-and-redirect branches, which the adversarial 'matching nothing' and 'malformed' cases never do (they assert location and the clear only). **Keep:** `apps/web/tests/app/qa-7e3a-resume.adversarial.test.ts:88` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/qa-7j-camera-row.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 131 | renders a straight design with a stale wallB in the store without throwing | 1 | Same call presetButtonsFor(STRAIGHT_DESIGN, 'wallB'); :137 fails on a throw too and also asserts which button is pressed. **Keep:** `apps/web/tests/app/qa-7j-camera-row.adversarial.test.ts:137` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/qa-8d-two-doors-real-repository.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 380 | is the invalid page on both doors when it names a body the catalogue does not hold, and nothing is thrown | 1 | designNamingAnUnknownBody is row 1 of STORED_ROWS_THE_SEAM_MAY_REFUSE (:318); the table asserts review equals editor and reason 'invalid' (refusalOf throws on a thrown answer). The extra hydrateAndReview not.toHaveBeenCalled is vacuous: the page returns an element and never calls the component. **Keep:** `apps/web/tests/app/qa-8d-two-doors-real-repository.adversarial.test.ts:394` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/app/review-page-gate.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 222 | editor / {ro,ru} / {case}: renders exactly { reason: "unavailable" } | 18 | Nine of the ten editor rows x two locales are the same cookie, id and assertions as qa-7e3b's table on the same DesignPage; the editor's answer is also re-derived by this file's own 'two doors answer the same element' loop. Left out: the two 'foreign, unknown body' editor cases, which are not rows of the twin (though the mock answers 'none' for them just as for 'foreign'). **Keep:** `apps/web/tests/app/qa-7e3b-design-page-gate.adversarial.test.ts:176` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/e2e/design-owner-gate.desktop.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 18 | a foreign visitor's /d/{id} answers the unavailable refusal, with no probe and an untouched jar; a cookie-less context's /d/{id} answers the unavailable refusal, with no probe and no cookie ever set | 2 | Bodies identical to the mobile file. Every assertion is server-decided (the refusal element's text, canvas count 0, cookie-jar equality, no probe request); design-load-error.module.css has no @media branch and the page is a server component. No viewport-specific production change can separate the two. **Keep:** `apps/web/tests/e2e/design-owner-gate.e2e.spec.ts:17` |

**`tests/e2e/global-settings.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 216 | cancels on Escape after focus has left the controls, and returns focus to the trigger | 1 | Open, one Tab, Escape, then surface gone and focus on the trigger: this is exactly stop = 1 of the sweep at :327 (stops 0..4), with the same two assertions. **Keep:** `apps/web/tests/e2e/global-settings.e2e.spec.ts:327` |

**`tests/e2e/pixel-counter-witness.desktop.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 271 | the outline is still counted over a front wearing the highlight's own hex | 1 | Only the '#ff2d2d' row: :291 runs the same store/verify/open/capture sequence on the same finish and ends with the identical expectTheDifferencingCounterIsUnmoved call. The '#cc2222' and walnut rows are new inputs and stay. **Keep:** `apps/web/tests/e2e/pixel-counter-witness.desktop.e2e.spec.ts:291` |

**`tests/e2e/qa-7e3b-s6-two-tab-convergence.adversarial.desktop.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 20 | round N/3: two tabs of one context converge on the lock, and every design stays reachable | 3 | Same runOneTwoTabRound helper and the same failureReason === null assertion as the mobile file (10 rounds); the Web Lock race is client-JS and server behaviour with no viewport branch, as the file's own header says. Costs three more samples of a probabilistic race, nothing structural. **Keep:** `apps/web/tests/e2e/qa-7e3b-s6-two-tab-convergence.adversarial.e2e.spec.ts:20` |

**`tests/e2e/qa-7f2-s5b-unreadable.adversarial.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 86 | a tap on wall B's help, made while wall A holds unreadable text, still opens it, in ${locale} | 2 | Same URL, same fill of '3,6', same two assertions (wall A reason count 1, help aria-expanded true) as the 'a mouse click' row at :275, which also asserts the sentence enters after the click. Only locator.click() vs mouse.click(x,y) at the button's centre differs. **Keep:** `apps/web/tests/e2e/qa-7f2-s5b-unreadable.adversarial.e2e.spec.ts:275` |
| 102 | a touch tap on wall B's help, made while wall A holds unreadable text, still opens it, in ${locale} | 2 | Touch counterpart: the 'a touch tap' row at :275 uses the same setup and the same two assertions plus the press-order check. Only locator.tap() vs touchscreen.tap(x,y) differs. **Keep:** `apps/web/tests/e2e/qa-7f2-s5b-unreadable.adversarial.e2e.spec.ts:275` |

**`tests/e2e/visitor-identity.desktop.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 26 | mints exactly one __Host- visitor cookie with the required attributes, over http://localhost | 1 | Cookie attributes read from the context jar and the /ro 307 resume: all server-decided, nothing rendered is asserted. Both projects are Chromium against the same webServer; the file's own header says nothing here is viewport-dependent. **Keep:** `apps/web/tests/e2e/visitor-identity.e2e.spec.ts:23` |

**`tests/i18n/content.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 378 | wall %s, direction %s crosses on screen: %s | 4 | All four pairs are in the projection test's tables (MEASURED_PAIRS :53 has A/B left; REFLECTED_PAIRS :60 has A/B right), asserted against the real camera and as the negation of the left rows. The comment calling the projection 'one package over' is stale: this twin lives in apps/web and imports crossesOnScreen directly. **Keep:** `apps/web/tests/i18n/cross-on-screen.projection.test.ts:140` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/i18n/cross-on-screen.projection.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 158 | never crosses on wall C in a U, which has one hand and is always left | 1 | MEASURED_PAIRS (:53-57) contains ['C','left'] and the camera oracle is fixed test geometry, so any change to crossesOnScreen('C','left') (content.ts:259) reddens :140 as well. Only a coordinated camera+function change would separate them, and that would be a correct change. **Keep:** `apps/web/tests/i18n/cross-on-screen.projection.test.ts:140` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/i18n/locale-menu.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 240 | keeps a shared design's own link from %s to %s | 2 | describeLocaleMenu passes pathname through untouched (use-locale-menu.ts:45-56); no branch reads the id. :228 is the stronger of the two: its path id (qa-design) differs from the store's designId (shared-kitchen, :103), so it also catches an href built from the store; :240 uses matching ids and catches strictly less. **Keep:** `apps/web/tests/i18n/locale-menu.dom.test.ts:228` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 393 | leaves the announced name the endonym and nothing beside it | 1 | Same render ('ro', /ro/d/qa-design), same anchors, same textContent === endonymOf assertion as the 'ro' row of :214, which checks the full ordered list. A flag leaking text into the option would redden :214 too. **Keep:** `apps/web/tests/i18n/locale-menu.dom.test.ts:214` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/i18n/pseudo-locale.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 132 | is absent from the routing table, so it is not a route and not in the switcher | 1 | expect(routing.locales).toEqual(['ro','ru']) is byte-identical to request.test.ts:40; the not.toContain('pseudo') line is implied by it. No production change separates them. **Keep:** `apps/web/tests/i18n/request.test.ts:39` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/lib/server/design-errors.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 11 | rejects with 400 | 1 | Row 'a rejected payload' (:136-141) calls invalidBodyResponse and pins status 400 and the same exact body; the reason argument never reaches the response (design-errors.ts invalidBodyResponse). **Keep:** `apps/web/tests/lib/server/qa-aud-005-design-route-seam.adversarial.test.ts:165` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/lib/server/design-failure-log.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 71 | distinguishes a failed load from a failed save | 1 | aud-005 :67-78 loops load/mint/save through designErrorResponse(operation, driverError) and asserts line.operation each time, including 'load'. Same call, same field. **Keep:** `apps/web/tests/lib/server/qa-aud-005-design-route-seam.adversarial.test.ts:67` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 181 | still answers the same body, which says only that the design could not be loaded | 1 | Row 'a stored row that would not read back' (:157-162) makes the same designErrorResponse('load', new InvalidDesignError(..)) call and pins 500 plus the exact body; toEqual on the body already excludes 'invalid_type'. **Keep:** `apps/web/tests/lib/server/qa-aud-005-design-route-seam.adversarial.test.ts:165` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 265 | answers the same 409 body whether or not anything was logged | 1 | Row 'a revision conflict' (:118-126) pins the identical writeConflictResponse() body plus status 409. The candidate varies no logging despite its title. **Keep:** `apps/web/tests/lib/server/qa-aud-005-design-route-seam.adversarial.test.ts:165` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 272 | answers the same 400 body whether or not anything was logged | 1 | Row 'a save with no revision' (:127-135) pins the identical revisionRequiredResponse() body plus status 400. **Keep:** `apps/web/tests/lib/server/qa-aud-005-design-route-seam.adversarial.test.ts:165` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/lib/server/read-body-with-limit.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 119 | distinguishes a stream failure from an oversized body | 1 | Body is byte-for-byte :56 (countingStream(['123456']), limit 5, expects too-large); it never produces stream-failed. The distinction its title names is held by :102 and :128. **Keep:** `apps/web/tests/lib/server/read-body-with-limit.test.ts:56` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/lib/server/visitor.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 52 | never returns the raw cookie value, only its digest | 1 | Same input as :25, which asserts the result equals the 64-hex sha256 of the value; that cannot equal the 43-character raw cookie, so not.toBe(raw) can never fail alone. **Keep:** `apps/web/tests/lib/server/visitor.test.ts:25` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/lib/server/write-token.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 116 | never returns the raw token, only its digest | 1 | Same input as :105 (read toBe hash). The only way :105 passes while the raw token is returned is hash===token, and :58 ('pairs the token with its SHA-256 digest') already forbids that. **Keep:** `apps/web/tests/lib/server/write-token.test.ts:105` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/lint/room-example-dimensions.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 93 | errors on a drawn example dimension written as a number | 1 | Both lint `export const x = 3600;` at a .tsx path under apps/web/src/room with the shipped config and assert length 1, contains '3600', contains 'M7 criterion 16'. BANNED_DIMENSIONS (:28) includes 3600. Remove only the `it`; the beforeAll feeds its neighbours. **Keep:** `apps/web/tests/lint/qa-7f1-constant-ban.adversarial.test.ts:75` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/panel/panel-model.qa.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 176 | offers exactly what offersFor returned, for every selectable thing in the kitchen | 1 | Real location panel-model.adversarial.test.ts:176. Same rows===offerBuildIds(offersFor) assertion over every body and slot; describeReplaceSection maps input.offers 1:1 with no world-dependent branch (panel-model.ts:565), so the different cleared set (p7,p24 vs +p1,p12) reaches no other code. seeded:501 also requires both bodies and slots swept. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.seeded.qa.test.ts:501` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 205 | never renders a count line and an empty line at the same time | 1 | Real location panel-model.adversarial.test.ts:205. The two exclusivity assertions are identical to seeded:535-536, which adds the bare-0 check; the rule is one branch on rows.length (panel-model.ts:575). panel-model.qa.test.ts:251 sweeps it again. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.seeded.qa.test.ts:526` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/panel/panel-model.read-only.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 543 | keeps the offer size on the secondary line | 1 | Writable, probe attached, one offered row: the same third arm of describeOfferSecondaryLine (panel-model.ts:631) that :345 pins with offerSize plus isDisabled false. The function does not branch on occupied vs slot. Read-only precedence is held separately at read-only :344. **Keep:** `apps/web/tests/panel/panel-model.test.ts:345` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/panel/panel-model.seeded.qa.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 570 | renders no replace section for the corner leg | 1 | Same file, same panelAt: :380 asserts the exact kind list ['structural','finish'] for every corner of the shipped design (p25 included), which implies no 'replace'. panel-model.adversarial.test.ts:131 (cited as qa:131) repeats it a third time. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.seeded.qa.test.ts:380` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/panel/panel-model.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 93 | renders rejection, replace, finish, handle and width in that order | 1 | Identical input to the all-flags-true, rejected row of the 32-combination sweep (occupiedMeta, offers(3), REFUSAL, noWidthIsFree) with the same exact ordered list. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:107` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 117 | renders no banner when nothing was refused | 1 | Identical to the all-flags-true iteration of qa:179 (occupiedMeta, offers(2), rejection null, default widths), same absence-of-rejection assertion. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:179` **Pair:** the kept test is itself listed here (`panel-model.qa.test.ts:176`) — remove one of the two, not both | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 172 | hides finish, handle and width on an empty slot | 1 | qa:188 asserts kinds === ['replace'] on slotMeta() for 0, 1 and 12 offers; nothing in collectSections branches on the count beyond zero, so 10 is the same case. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:188` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 177 | drops each section as its own flag goes false, and no others with it | 1 | Each of the three single-flag-off cases (other flags true, default widths) is an iteration of qa:107, which asserts the exact ordered kind list - strictly stronger than not.toContain + length 3. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:107` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 206 | renders no replace section at all for an unknown kind, even with offers | 1 | qa:206 runs the same occupiedMeta({kind:'mystery_unit'}) with offers(6) as the first entry of its unknown-kind list and makes the same assertion. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:206` **Pair:** the kept test is itself listed here (`panel-model.qa.test.ts:205`) — remove one of the two, not both | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 214 | still renders the list for an empty slot, whose kind is never a catalogue kind | 1 | qa:286 asserts rows length === count on slotMeta() for every count 0..25 (10 included); qa:222 covers the void kind explicitly. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:286` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 233 | derives the count line from the rows it actually rendered | 1 | Rows length and count are swept 0..25 at qa:286; the slot dimensions are pinned exactly at qa:399 (countLine === countForSlot(5,700,860)) and adversarial:165 on a real slot; the rendered wording is pinned by golden-output (panel.countForSlot hashes). Keep qa:286 and qa:399 together. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:286` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 243 | counts an occupied body's set by band and width, per §9's example | 1 | qa:298 asserts the identical expression countForBody(count, base.many, 600) on occupiedMeta for every count 1..25, 5 included. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:298` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 293 | uses the singular for one offer | 1 | Identical to the lineFor(1) assertion at :279 in the same file (occupiedMeta, offers(1), countForBody(1, base.one, 600)); qa:298 covers count 1 again. **Keep:** `apps/web/tests/panel/panel-model.test.ts:273` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 331 | shows each row the size it would build to in this opening | 1 | Same slotMeta and same single offer as :345, which asserts the same field against offerSize(700,1850) plus isDisabled. The literal adds only the rendered wording, which golden-output pins (panel.offerSize fixture, golden-output-fixtures.ts:237) along with the copy lock. **Keep:** `apps/web/tests/panel/panel-model.test.ts:345` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 357 | disables every row with a reason while the body probe is unattached | 1 | qa:378 asserts [true, probeUnavailable] on every row for both occupiedMeta and slotMeta with the probe detached; row count 4 vs 5 reaches no branch. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:378` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 463 | marks nothing as chosen when no finish was applied | 1 | The closing assertion of qa:523 (:535-539) is the same call and the same expectation: no active chip on occupiedMeta() with no finish. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:523` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 574 | renders no width section at all when the engine offers no options | 1 | qa:449 is the same call (occupiedMeta, widthOptions []) asserting the width section is undefined; panel-model.test.ts:194 asserts not.toContain('width') on the same input. NOTE: the first pass swapped two filenames; the 32-combination/count sweeps cited as panel-model.adversarial.test.ts are really in panel-model.qa.test.ts (and vice versa). **Keep:** `apps/web/tests/panel/panel-model.qa.test.ts:449` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/panel/qa-5b5-fixed-width.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 395 | refuses %s on the hob base and changes nothing, whichever width reached it | 1 | Only the 600 row duplicates :409's p2 row (p2's own width is 600, width-stepper.test.ts:451). The other four widths are the point of the title: a fixed-width guard that refused only the no-op width (widthMm === record.widthMm) passes :409 and fails 550/650/800/300 here. Keep those four. **Keep:** `apps/web/tests/panel/qa-5b5-fixed-width.adversarial.test.ts:409` | **W2-A part** — only the 600 row deleted (kept test red) |

**`tests/panel/qa-6q-a-refusal-surface.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 188 | gives PAL a list and veneer swatches, though PAL could hold two entries one day | 1 | editor-panel.tsx:362 emits data-finish-control={section.control} verbatim, and :175 asserts that markup for the same panelFor(storeOn(withMaterial(..))) on melamine and veneer against a literal table. The 'two entries' scenario of the title is not built here (qa-6r does that, :228). **Keep:** `apps/web/tests/panel/qa-6q-a-refusal-surface.adversarial.test.ts:175` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/panel/qa-6r-control-shape.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 325 | is not vacuous: the same materials do offer a control on the same body | 1 | Loop body is identical to :298 (same three materials, same FINISHABLE target, same toContain('data-finish-control')). As an anti-vacuity partner it is fully served by :298 in the same file. **Keep:** `apps/web/tests/panel/qa-6r-control-shape.adversarial.test.ts:298` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/panel/width-stepper.qa.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 358 | renders every refusal through the one localized resolver | 1 | width-stepper.test.ts:331-338 asserts the same step.reason === ro.rejection(result.reason,'left',record.wall) for every stepper button of the seeded kitchen, plus undefined on the enabled ones; its counts (30 buttons, 12 enabled) imply the 18 refusals counted here. **Keep:** `apps/web/tests/panel/width-stepper.test.ts:306` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/persistence/client-write-path.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 144 | goes read-only rather than retrying forever when this browser holds no write credential | 1 | Same 403-on-PUT stub and flow. The twin is stronger on every point: exactly one PUT across an hour (covers the 0-120 s window), status 'unauthorized', hasPersistedSuccessfully false, designId null, the removed record still gone; :336 adds no request after later edits. **Keep:** `apps/web/tests/persistence/client-write-path.adversarial.test.ts:315` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/persistence/create-design-lock.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 136 | propagates an error the locked run throws, rather than swallowing or retrying it | 1 | Same rejects.toBe(failure) on the same call, there against Node's real LockManager plus a release check; the LockedRunFailure unwrap (create-design-lock.ts) behaves identically under the fake. Neither counts invocations, so 'retrying' is untested in both. **Keep:** `apps/web/tests/persistence/qa-7e3b-create-design-lock-real-locks.adversarial.test.ts:100` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/persistence/fetch-configuration-repository.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 124 | rejects a save that answers %i | 9 | All nine statuses are rows of CLASSIFICATION (:432-443), whose test makes the same save({id:'existing-id'}) call and asserts instanceof DesignRequestFailedError plus the retryable/credential split. **Keep:** `apps/web/tests/persistence/fetch-configuration-repository.adversarial.test.ts:446` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/persistence/fetch-configuration-repository.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 266 | mints again after a mint that failed, rather than caching the rejection forever | 1 | Same scenario and assertions (first mint fails, second save resolves to {id, revision}, two POSTs); only 503 vs 500, which fall in the same retryable class (CLASSIFICATION :440-442) and reach no different mint branch. **Keep:** `apps/web/tests/persistence/fetch-configuration-repository.adversarial.test.ts:268` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 332 | rejects rather than resolving when a save answers ${status} (400, 404, 409, 500) | 4 | 400, 404, 409 and 500 are all rows of CLASSIFICATION (and of the :124 sweep), same save call on an existing id, same instanceof DesignRequestFailedError. **Keep:** `apps/web/tests/persistence/fetch-configuration-repository.adversarial.test.ts:446` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 348 | rejects a save refused with ${status} as a credential failure, not a retryable one (401, 403) | 2 | adversarial:398 runs the same 401/403 saves and asserts the same two instanceof checks plus the status in the message; CLASSIFICATION covers them a third time. **Keep:** `apps/web/tests/persistence/fetch-configuration-repository.adversarial.test.ts:398` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 505 | rejects a loaded payload that is not a valid design rather than handing it to the store | 1 | Both feed loadWithAccess a payload that fails the one DesignSchema.safeParse (src/persistence/fetch-configuration-repository.ts:353-356) and expect InvalidDesignError; {presetId:7} and {nope:true} both fail on missing required keys, so no schema change separates them. **Keep:** `apps/web/tests/persistence/fetch-configuration-repository.adversarial.test.ts:207` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 520 | percent-encodes the id it puts in the path | 1 | Single encodeURIComponent call at fetch-configuration-repository.ts:294; the twin's id '../../admin?x=1' contains '/' as well and asserts the exact URL, so any encoding change that breaks 'a/b' breaks the twin. **Keep:** `apps/web/tests/persistence/fetch-configuration-repository.adversarial.test.ts:248` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/persistence/save-coalescer.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 111 | writes a save scheduled inside the interval window once the window expires | 1 | Twin pins the interval at 999/1000 ms and the second design; the candidate only waits a loose 200+1000 ms, so it cannot see a timer armed for the full interval instead of the remainder. No mutation of millisecondsUntilNextSaveAllowed/requestSave found that reddens it alone. **Keep:** `apps/web/tests/persistence/save-coalescer.test.ts:395` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 223 | retries the failed state when nothing newer arrived | 1 | Same provisional-id retry of the failed snapshot (handleSaveFailure `pending ??= failedJob`); test.ts:199 already fails twice and requires exactly one onSaved, test.ts:221 that every call carries the one design. **Keep:** `apps/web/tests/persistence/save-coalescer.test.ts:221` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 308 | ignores further edits once the credential has been refused, without another request | 1 | The candidate refuses a persisted id where the cited twin refuses a null id, but the persisted branch of refusalStatus with later edits is covered in the twin's file at save-coalescer.test.ts:795-830 (and in its own file at adversarial:386). **Keep:** `apps/web/tests/persistence/save-coalescer.test.ts:281` | **W2-A deleted** — the Keep named above is wrong (it covers only the null-id branch); the behaviour is held by `save-coalescer.adversarial.test.ts` "stays terminal for the life of the coalescer…" (logic review: sound) |
| 333 | keeps retrying after $name (500, 502, 503 rows) | 2 | The coalescer branches on instanceof only (save-coalescer.ts:357, 405-409) and never reads the message, so the 500/502/503 rows are one input three times. Keep one 5xx row beside 429 and the TypeError; the other two are redundant. **Keep:** `apps/web/tests/persistence/save-coalescer.adversarial.test.ts:333` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 366 | recovers normally when a retryable failure is followed by success | 1 | Retry-then-success ending idle is test.ts:199 plus :210; handleSaveFailure is shared by persisted and provisional queues, and persisted-id retries are exercised at test.ts:563-705. **Keep:** `apps/web/tests/persistence/save-coalescer.test.ts:199` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 557 | does not delay the genuine first write | 1 | Same null-id first save at advance(0) with the same assertion; only the repository double differs. **Keep:** `apps/web/tests/persistence/save-coalescer.test.ts:437` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 617 | writes an edit that arrives in the last moments before the retry fires | 1 | Identical to the offsetMs=499 row of the it.each at :667 (same repository, one failure, edit at 499 ms, saved equals the newest only). **Keep:** `apps/web/tests/persistence/save-coalescer.adversarial.test.ts:667` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 771 | writes design Y after design X was refused | 1 | Same refusedPersisted-by-id branch: X refused, store moves to Y, Y is written. The extra id assertion is covered by test.ts:705 'without retargeting either call'. **Keep:** `apps/web/tests/persistence/save-coalescer.test.ts:374` | **W2-A deleted** — a kept test went red under a mutation; review follow-up applied: the kept test asserts the status returns to `idle` |

**`tests/persistence/save-coalescer.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 233 | a rejected save never invokes onSaved, so the caller's model is left unchanged | 1 | Strict subset: reject then succeed, savedIds has length 1. test.ts:199 asserts the same with two rejections; the title's 'never invokes onSaved' is seen only through that same count. **Keep:** `apps/web/tests/persistence/save-coalescer.test.ts:199` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/price/price-bar-model.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 151 | still renders nothing when an edit has been refused as well | 1 | Byte-identical call and assertion to :143; DescribePriceBarInput takes no refusal (src/price/price-bar-model.ts:47-51). **Keep:** `apps/web/tests/price/price-bar-model.test.ts:143` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/price/price-bar-states.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 425 | flags the total and says nothing about any refusal, which is now the only pairing | 1 | Same call on an overflowing design and the same two assertions as model:188; the extra not-contain 'neschimbat' is implied by toBe(the leaf), which the copy lock pins. **Keep:** `apps/web/tests/price/price-bar-model.test.ts:188` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/price/price-bar-viewport.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 186 | frames every body with a ${header} px header and a ${bar} px bar (7 headers x 3 bars) | 20 | Vertical projection is aspect-independent, so every header/bar pair reduces to normalised bottom <= 1 and top >= 0 (file head comment). 20 of 21 repeat one fact; keep one, because it is the only place the top bound is asserted (wiring:381 checks the bottom only). **Keep:** `apps/web/tests/price/price-bar-viewport.test.ts:186` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/price/price-breakdown-copy.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 173 | names all three exclusions, so a copy edit cannot quietly drop one | 1 | Strict subset: :161 asserts the disclaimer toBe the full sentence containing all three words, and tests/i18n/romanian-copy-lock.test.ts:17 deep-equals the whole catalogue. **Keep:** `apps/web/tests/price/price-breakdown-copy.test.ts:161` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/price/price-breakdown-model.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 284 | renders no row whose category word is missing | 1 | Same shippedBreakdown(); :261 asserts the four exact labels with defined category words, so a label holding 'undefined' fails there first. **Keep:** `apps/web/tests/price/price-breakdown-model.test.ts:261` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/price/price-wiring.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 381 | frames the whole seeded kitchen at the preset the screen mounts with | 1 | Normalised bottom <= 1 for every body at overview is what the viewport sweep asserts, which also checks the top bound. **Keep:** `apps/web/tests/price/price-bar-viewport.test.ts:186` **Pair:** the kept test is itself listed here (`price-bar-viewport.test.ts:186`) — remove one of the two, not both | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 413 | keeps the counterfactual load-bearing at the height the bar actually reserves | 1 | The reserved-height row is viewport:206 (header 64, overlaid scene); the +24 and +48 rows only lower barTop, so they are implied by it. **Keep:** `apps/web/tests/price/price-bar-viewport.test.ts:206` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/price/qa-6t2-accessory-rows.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 254 | renders no row reading inclus for the rack it is not billing | 1 | Same breakdownFor([SINK]); :242 asserts no row's label includes the rack name, so no rack row can read inclus. A zero-amount rack line fails :242 too. **Keep:** `apps/web/tests/price/qa-6t2-accessory-rows.adversarial.test.ts:242` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 277 | renders the accessories after both tier rows | 1 | model:261 pins hardware, material, accessory, accessory with exact labels on the seeded kitchen, which also holds a sink under a wall cabinet; same ordering code, no other branch. **Keep:** `apps/web/tests/price/price-breakdown-model.test.ts:261` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/price/starting-price.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 83 | never charges a further thousand for an amount already on the step / moves one whole thousand across each side of a step | 2 | roundUpToThousandMdl is one Math.ceil with no magnitude branch (src/price/starting-price.ts:77-82). Exact multiples are covered on every run by the property at :246; step-1/step/step+1 are pinned at 1 and 43 steps in qa-6bg-money-seam.adversarial:136. **Keep:** `apps/web/tests/price/starting-price.adversarial.test.ts:246` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 104 | rounds one ban up to a whole thousand | 1 | amountTextFor(1) === '1 000 MDL' is asserted at starting-price.test.ts:67 and goes through roundUpToThousandMdl, so it implies the first assertion. **Keep:** `apps/web/tests/price/starting-price.test.ts:67` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 172 | rounds every line the catalogue can produce without leaving the step | 1 | Both assertions are the first two of the whole-domain property at :233; every seeded line is also rounded at :279-285, so a line the formatter refuses still fails in this file. **Keep:** `apps/web/tests/price/starting-price.adversarial.test.ts:233` | **W2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/review/qa-8c-model-purity.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 155 | is no store, route, component, hook or client module, however deep | 1 | isRead returns true for every specifier under 'named at all' (purity:48-50), so the run-time closure is a subset of the named one; any file that trips :155 trips :178 with the same two assertions. **Keep:** `apps/web/tests/review/qa-8c-model-purity.adversarial.test.ts:178` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/review/review-body-count.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 43 | reads %i as the room line's last words | 15 | 15 of the 18 rows are the same reviewRoomLine call and the same words as qa-8c's table. Unique here: 0 in both locales (an ICU =0 branch would show only here) and ru 101. Caution: the category-completeness test at review-body-count.test.ts:58 reads this same table. **Keep:** `apps/web/tests/review/qa-8c-room-line-and-copy.adversarial.test.ts:168` |

**`tests/review/review-model.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 117 | is the priced total rounded up as the price bar rounds it (kitchen %i) | 4 | The figure is describeStartingPrice(totalMinor) with no kitchen-dependent branch; qa-8c:368 checks it against the raw catalogue, the bar and the breakdown in both locales, and :588/:613 pin the boundaries. **Keep:** `apps/web/tests/review/qa-8c-parity-with-the-price-surfaces.adversarial.test.ts:368` | **W2-B deleted** — a kept test went red under a mutation |
| 198 | names one length for a straight room... / names two lengths for an L... / names three lengths for a U... / states the corner side for an L... / states no corner side for a straight room or a U | 7 | qa-8c:277 asserts lengths-then-count for every arm and :291 the corner side in both locales, including a left L with cornerDirection absent (tests/support/varied-kitchens.ts:52-63) and a right-hand L. The three fixed rooms reach no other branch. **Keep:** `apps/web/tests/review/qa-8c-room-line-and-copy.adversarial.test.ts:277` | **W2-B part** — four titles deleted (kept tests red); "states no corner side for a straight room or a U" **open**: no signal from either test |
| 271 | takes its title from the review's own leaf / labels the estimate a starting price, rounded up... / returns the not-included slot from the approved breakdown disclaimer alone | 3 | Title, figure label, disclaimer and not-included slot are asserted at qa-8c:334-353 in both locales against the raw JSON; here the expected side is the same resolver the model calls. **Keep:** `apps/web/tests/review/qa-8c-room-line-and-copy.adversarial.test.ts:334` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/review/review-parity.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 184 | prints the group keys, row keys, labels and amounts ... / equals the breakdown's groups and rows, in order / reads wall A, then B, then C ... / lists every body once / is a group in the review, with at least one body | 4 | Four cases repeat qa-8c:327, :352, :512 and the wall C block over kitchens from the same generateKitchen. Not redundant: review-parity:205, the only place the projection's row-major order inside a group (ADR 0063) and one-group-per-wall are asserted. **Keep:** `apps/web/tests/review/qa-8c-parity-with-the-price-surfaces.adversarial.test.ts:327` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/review/review-pricing-failure-stays-unseen.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 36 | refuses with the code and no bodies, as it always did / holds nothing of the failure anywhere in what it publishes | 2 | qa-8h asserts the exact PRICING_FAILED view and no marker, code or failure key for all eight codes, 40+ designs and both locales. Note: this file has uncommitted edits in the working tree. **Keep:** `apps/web/tests/review/qa-8h-pricing-failure-stays-unseen.adversarial.test.ts:125` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/review/review-row-detail.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 112 | states each body's width, and its own finish and handle exactly when it carries them (+ one detail per body, three rows spelled out, name+width = label, never aggregates) | 9 | qa-8d2 repeats each claim over more kitchens with a hand-written word table, every finish and free colours, in both locales (:208 facts and keys, :288 name+width, :305 one row per body). Dressing through the store reaches no other review-model branch. **Keep:** `apps/web/tests/review/qa-8d2-row-second-line.adversarial.test.ts:208` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/review/review-submit-eligibility.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 221 | carry the review's row label in %s | 2 | Refusal labels come from one describePlacementLabel call (src/review/review-model.ts:337-340); qa-8c:152 checks them against the rows and the breakdown in both locales, and review-submit-precedence.test.ts:226 again. **Keep:** `apps/web/tests/review/qa-8c-submit-eligibility.adversarial.test.ts:152` | **W2-B deleted** — a kept test went red under a mutation |
| 273 | is a refusal of the submission and not of the review: an overflowing kitchen still shows its figure | 1 | qa-8c:129 asserts kind 'available' with BODIES_PAST_WALL over every overflow maker and arm; one seeded kitchen adds no branch. **Keep:** `apps/web/tests/review/qa-8c-submit-eligibility.adversarial.test.ts:129` | **W2-B deleted** — a kept test went red under a mutation |
| 314 | is refused loudly rather than naming fewer bodies than the query reports | 1 | The cited twin path is stale: the stray-body cases are at review-input-divergence.test.ts:52 (priced, same /stray-body/ throw) and :110 (unpriced, overflowing stray). No single removed check reddens this and leaves both green. **Keep:** `apps/web/tests/review/review-input-divergence.test.ts:52` | **W2-B open** — not a duplicate but a fake check: it stays green with both checks it names removed |

**`tests/room/dimensions-form.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 562 | does not give wall A of a %s room the straight room's reading | 2 | For L and U, :548 already asserts wall A reads cornerText (test-local explanationFor, :374-381). The only extra is cornerText != text, both pinned by the copy lock; move that guard into :548 if the case is deleted. **Keep:** `apps/web/tests/room/dimensions-form.dom.test.ts:548` |

**`tests/room/generation-steps.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 643 | does not print wall B's number in wall C's place: the two differ on screen | 1 | The property at :616 asserts the whole summary string with B before C for independent random lengths in both locales; a B/C swap fails every sample where they differ. **Keep:** `apps/web/tests/room/generation-steps.dom.test.ts:616` |

**`tests/room/metres-text.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 40 | carries no comma and reads back exactly, over every approved length of %s | 3 | Same two assertions over 1..9,000,000. metresTextForUrl has no magnitude branch (src/room/metres-text.ts:24-38), so the pad/strip faults this hunts show in any range; approved rooms also round-trip in qa-7e2-room-href's sweep. **Keep:** `apps/web/tests/room/qa-7f1-copy-and-conversions.adversarial.test.ts:147` | **W2-B deleted** — a kept test went red under a mutation |
| 57 | spells %i mm as %s | 5 | The same five values are pinned through roomHrefFromDesignRoom, which calls metresTextForUrl (room-query-sync.ts:414); the function is also pinned directly at qa-7f1:177 with the same pad/strip classes. **Keep:** `apps/web/tests/room/qa-7e2-room-href.adversarial.test.ts:85` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/room/parse-metres.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 223 | reads back every value from 1 to 99 999 mm written with a decimal point | 1 | METRES_PATTERN takes [.,] as one class (src/room/parse-metres.ts:23) and the separator never reaches the digit arithmetic; the comma sweep covers every value and adversarial:187 runs the point on every sample. **Keep:** `apps/web/tests/room/parse-metres.test.ts:74` | **W2-B deleted** — a kept test went red under a mutation; the review's named Keep cannot see the mutation, the guards are two other tests |

**`tests/room/plan-preview-model-marking.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 497 | marks the same wall ids in both directions, for %s | 8 | :410 asserts both directions equal the arm's fixed expectedMarks over the same rooms, which implies left equals right. **Keep:** `apps/web/tests/room/plan-preview-model-marking.test.ts:410` |

**`tests/room/qa-7f1-copy-and-conversions.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 162 | never writes a group separator into a field | 1 | Same refill expression over a sub-range (1,000,000..9,000,000) of :132's 1..9,000,000, and :132 asserts toBe(String(mm)), which can never hold for a grouped string. A grouping refill turns :132 red on 8/9 of its own samples; no change reddens :162 alone. **Keep:** `apps/web/tests/room/qa-7f1-copy-and-conversions.adversarial.test.ts:132` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/room/qa-7f1-url-seam.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 480 | leaves the parser marking an absent direction for an L, rather than reading it as left | 1 | parseRoomUrlState({shape:'L'}).markedFields toContain 'direction' is a strict subset of room-url-state.test.ts:313, which toStrictEquals the whole state including markedFields ['wallA','wallB','height','direction']. No screen is rendered. **Keep:** `apps/web/tests/room/room-url-state.test.ts:313` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/room/qa-7f2-s1-issue-model.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 572 | is present in both catalogues | 1 | :474 forces every leaf under room.issue into SECTION_5_KEYS, so orChooseLinear is in the tables that :486 and :495 compare verbatim against the approved ro and ru sentences. Verbatim equality with a non-empty sentence implies not ''. **Keep:** `apps/web/tests/room/qa-7f2-s1-issue-model.adversarial.test.ts:486` |

**`tests/room/qa-7f2-s2-red-wall.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 440 | marks exactly the walls the domain refuses on a U, wall C included | 1 | Same generator (anyTypedRoom), same oracle (expectedMarksFor), same expression. :399 draws shape from ['linear','L','U'] over 1000 runs (about 333 U rooms) against this case's 200 U rooms, so it is a smaller sample of the same population. **Keep:** `apps/web/tests/room/qa-7f2-s2-red-wall.adversarial.test.ts:399` |

**`tests/room/qa-7f2-s5-incomplete-plan.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 236 | carries every length a field reads across the metre wire and back unchanged, up to 2^53 - 1 | 1 | The cited twin is wrong (metres-text.test.ts:45 sweeps approved bounds only), but the redundancy holds elsewhere: room-url-state.test.ts:100 round-trips 1, 999, 1000, 1001, MAX-1 and MAX_SAFE_INTEGER, and :82-88 any safe integer, through the same two functions (room-url-state.ts:152 and :292), and qa-7f2-s1b-millimetres.adversarial.test.ts:235 sweeps 1..MAX_SAFE_INTEGER through the refill. It also sits in a describe about the plan and asserts nothing about a plan. **Keep:** `apps/web/tests/room/room-url-state.test.ts:100` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/room/qa-7f4b-handoff.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 782 | carries saveFailed and retry in Romanian and in Russian, key-identical and non-empty | 1 | catalogue-parity.test.ts:49 asserts the same ordered key set for every leaf in ro and ru and that no leaf is blank, which contains both properties for room.compose. The two keys' presence in ro is held by the rendered assertions at :693 and :737 and by the copy lock. **Keep:** `apps/web/tests/i18n/catalogue-parity.test.ts:49` |

**`tests/room/room-handoff.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 419 | issues no second POST when a retry follows a failed write | 1 | Same flow and counts (POST 1, PUT 2) as qa-7f4b :456 under the same plain render, and again under StrictMode at :488; the one extra, the second PUT's url equal to the first, is asserted at qa-7f4b :657. No retry-mint change reddens this alone. **Keep:** `apps/web/tests/room/qa-7f4b-handoff.adversarial.test.ts:456` |
| 519 | writes to the already-minted row and opens it when the retry succeeds | 1 | Its single assertion, editorPushes equals the one editor href after a failed write and a retry, is asserted in the same flow at qa-7f4b :469 and :501 (EDITOR_HREF is the same string, :76), together with the request counts. **Keep:** `apps/web/tests/room/qa-7f4b-handoff.adversarial.test.ts:456` |

**`tests/room/room-issue-model.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 593 | accepts a straight kitchen at 1D with the same fields that used to refuse it | 1 | Same draft as :671, which asserts the 1D substate; its other expect, isShapeRefused false for a linear with exactly these four texts, is the 'linear / every field typed' row of :517 plus the literal at :534. Nothing reddens it without reddening one of those. **Keep:** `apps/web/tests/room/room-issue-model.test.ts:671` |
| 837 | covers all six reachable codes | 1 | Both key sets are held total and excess-free by the compiler against the same type: ROOM_ISSUE_MESSAGE_KEYS satisfies Record<ReachableRoomIssueCode, string> (room-issue-model.ts:43-50) and REACHABLE_CODES satisfies Record<ReachableRoomIssueCode, true> (:60-70). It touches no catalogue, so the ro and ru runs under describe.each are the same assertion twice. **Keep:** `apps/web/tests/room/room-issue-model.test.ts:60` |

**`tests/room/room-query-sync.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 207 | writes a canonical query that reading and writing again reproduces exactly | 1 | Body identical to d45 :211. Its three generator extras reach no branch of their own: utm_source is never read by roomDraftFromQuery (room-query-sync.ts:427-439), and '3,560.00' and '99999999999999999999' fall in the notANumber and unsafe-integer refusals (parse-metres.ts:33, :55) that d45's fc.string and '9007199254740.992' already hit. Delete this one only; s12.3 is the one that stays. **Keep:** `apps/web/tests/room/qa-7f1-d45-convergence.adversarial.test.ts:211` |

**`tests/room/room-screen.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 355 | continues once the L is chosen | 1 | Strict subset of :388 in the same describe: that case chooses L, clicks Continue and expects the push, and a disabled button's click() dispatches nothing, so a disabled CTA after choosing L already fails there. **Keep:** `apps/web/tests/room/room-screen.dom.test.ts:388` |

**`tests/room/room-url-round-trip.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 673 | leaves the parser's reading of an absent direction exactly as it was | 1 | The identical call and the identical toStrictEqual as room-url-state.test.ts:313-319, and its own comment says so. No screen is involved. **Keep:** `apps/web/tests/room/room-url-state.test.ts:313` | **W2-B deleted** — a kept test went red under a mutation |
| 683 | keeps a stored room's absent direction meaning left | 1 | toContain('direction=left') on a direction-less stored L is a subset of room-url-state.test.ts:181-191, which asserts the whole href for the same kind of room, ending in direction=left. The different wall lengths reach no other branch. **Keep:** `apps/web/tests/room/room-url-state.test.ts:181` | **W2-B deleted** — a kept test went red under a mutation |

**`tests/room/room-url-state.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 222 | omits document, locale, and revision state | 1 | :181 asserts the complete href string for a stored L, which fixes the key list exactly; the forbidden-key loop then follows from the key list. The only difference is the height literal, 2500 against 2600, and 2500 is round-tripped at :207. **Keep:** `apps/web/tests/room/room-url-state.test.ts:181` |

**`tests/scene/kitchen-stage-view-only.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 232 | leaves an empty selection empty after a tap | 1 | :215 proves the view-only stage registers no pointer listener, so tapTheCanvas() calls nothing and this reduces to 'mounting leaves a null selection null'. :221 covers a tap over a standing selection with pick not called. Only a stage that selected something on mount without any listener could redden this alone. **Keep:** `apps/web/tests/scene/kitchen-stage-view-only.test.ts:215` |

**`tests/scene/overflow-mark.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 345 | builds no mark on the next pass once nothing overflows | 1 | The react mock (:42-58) gives a fresh useRef and useMemo on every KitchenStage call and mountWith replaces the store state, so nothing carries from the first mount to the second: after mockClear it is :254's mount and :254's assertion. The mark leaving on cleanup, which is the defect the comment names, is asserted at :332-343. **Keep:** `apps/web/tests/scene/overflow-mark.test.ts:254` |

**`tests/scene/overflow-warning-loading.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 126 | says nothing about an overflow on a design that has none either | 1 | The static render is always in the loading state, so the gate is closed for both designs; any implementation that passes :112 (silent with overflowing bodies) passes this unless it warns more for a design with no overflow. It does not do what its comment claims, since nothing in this file ever renders the sentence; that counterfactual lives in overflow-warning.test.ts:99 and :106. **Keep:** `apps/web/tests/scene/overflow-warning-loading.test.ts:112` |

**`tests/scene/overflow-warning-viewport.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 303 | is nowhere near the strip a selection can see: header ${headerHeightPx} px, settings row ${settingsRowPx} px, band ${bandHeightPx} px | 54 | Both sides are test-local arithmetic (sceneHeightFor :173, stripAboveTheSheetPx :185); header and settings row cancel, leaving 844*0.78 - 125.6875 - band > 0, so there are 3 distinct inequalities, not 54. The only production input is OVERFLOW_WARNING_RESERVED_HEIGHT_PX, which :323 pins to within half a pixel (margin 477), and that implies all three (461 and 445 at +16 and +32). **Keep:** `apps/web/tests/scene/overflow-warning-viewport.test.ts:323` |

**`tests/scene/overflow-warning.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 92 | carries the noun the owner settled on, and not the wording it replaced | 1 | The file's own header (:73-76) says the wording is byte-pinned by the copy lock and deliberately not spelled again; this case spells part of it again. romanian-copy-lock.test.ts:16 holds the whole sentence, and qa-6m-criteria.adversarial.test.ts:210 already asserts the noun. **Keep:** `apps/web/tests/i18n/romanian-copy-lock.test.ts:16` |
| 145 | says it as soon as the scene is mounted, on the same design | 1 | Its two expects are exactly :134 (loading, overflowing, sentence absent) and :102 (mounted, overflowing, sentence present), on the same fixture through the same two helpers. Those two cases together are the counterfactual it describes. **Keep:** `apps/web/tests/scene/overflow-warning.test.ts:99` |

**`tests/scene/qa-6m-overflow-source.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 349 | are all released when a design change replaces them | 1 | Mount, run the cleanups once, disposeOverflowMark called once: that is the first half of :335 (afterFirstTeardown toBe 1) and of overflow-mark.test.ts:332. No design change happens in the body, so the title's claim is not what it tests. **Keep:** `apps/web/tests/scene/qa-6m-overflow-source.adversarial.test.ts:335` |

**`tests/settings/global-colour-group.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 474 | clears the pending colour rather than committing it and resetting it after | 3 | :474 (PAL to veneer drops PAL_GRI) and :487 (PAL to PAL keeps it) are single cells of the sweep at qa-0099 :424, which runs every ordered material pair, the same-material pair included, over every offered colour with the same chooseFinishIn/chooseTierIn calls. :499 (veneer's default is marked) is the first expect of qa-0099 :474. **Keep:** `apps/web/tests/settings/qa-0099-global-colour.adversarial.test.ts:424` |

**`tests/settings/global-settings-modal-centring.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 179 | leaves the settings modal at least the safe gap under it at any height | 1 | POPOVER_TOP + SAFE_GAP - TOP >= SAFE_GAP is POPOVER_TOP >= TOP with SAFE_GAP on both sides, which is the settings-modal row of the it.each at :149-153. Same three numbers, same pass/fail. **Keep:** `apps/web/tests/settings/global-settings-modal-centring.test.ts:149` |

**`tests/settings/global-settings-model.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 480 | calls the total what every other surface calls it, since there is one name left | 1 | Its first expect is the same assertion as :477 on the same view, and the second (not containing 'neschimbat') follows from toBe. Its own comment says the ruling it was written for is withdrawn. **Keep:** `apps/web/tests/settings/global-settings-model.test.ts:471` |
| 548 | still hands apply the ids the 6E commands accept | 1 | :528 (in this same file, not the shell file the finding names) asserts tierIds toEqual the book's full tier list for both groups; that the default is among them is then a fact about SAMPLE_PRICE_BOOK, not about this surface. **Keep:** `apps/web/tests/settings/global-settings-model.test.ts:528` |

**`tests/settings/global-settings-shell.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 268 | is genuinely unpriceable, so this is the case it is named for | 1 | A fixture witness on the domain pricer, the same assertion as global-settings-model.test.ts:524 on the same withdrawn tier. A pricer that began accepting a withdrawn tier reddens both; the only thing it sees alone is this file's own designCarrying helper, which is test code. **Keep:** `apps/web/tests/settings/global-settings-model.test.ts:524` |

**`tests/settings/global-settings.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 515 | pins both spellings by literal, so the composition cannot change either silently | 1 | tierDelta('+9 000') is one sample of the property directly above it (any string gives 'de la ' + it) and is also pinned at global-settings-model.test.ts:406; 'De la' is held by romanian-copy-lock.test.ts:16 and :444; the third expect is the first two composed. **Keep:** `apps/web/tests/settings/global-settings.adversarial.test.ts:506` |

**`tests/settings/material-reset-confirm.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 196 | never asks about a press that would run no material command | 1 | The 25 pairs at the fixture's four chosen colours are 25 of :172's 75 cells, built by the same viewFor, and the table already answers false on every absent-pending and same-id cell. No implementation reddens this while :172 is green. **Keep:** `apps/web/tests/settings/material-reset-confirm.adversarial.test.ts:172` |
| 468 | is composed about the stored document, not about the seeded kitchen | 1 | viewFor is called without a design, so it uses the same MDF fixture as the table: this is exactly :172's 'mdf → veneer, 0 chosen' cell. The seeded kitchen reaching the model through its own count is asserted in material-reset-confirm.test.ts:263-271. **Keep:** `apps/web/tests/settings/material-reset-confirm.adversarial.test.ts:172` |

**`tests/settings/qa-0104-the-pill-at-every-rung.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 289 | draws no divider around the colour it does not write | 1 | Implied by two cases in the same file: :170 pins MDF at EVERY_SETTING to 3 labels, and :269 (EVERY_RUNG = [1,2,3,4], both designs) pins separators === labels - 1 at rung 4. 3 labels and 2 separators cannot fail without one of those failing. **Keep:** `apps/web/tests/settings/qa-0104-the-pill-at-every-rung.adversarial.test.ts:269` |

**`tests/settings/qa-6t-negative-delta.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 253 | puts the pinned witness 4 200 minor below the default, and still offers it every tier | 1 | Same solo base-drawer3-600 design as row 1 of :217 (tierIds, inverting delta undefined, shortfall derived). Its only extra, the -4_200 literal, is pinned on the same design and arithmetic at global-settings.adversarial.test.ts:598-601 and again as a total at qa-6w :578; tiers-vs-tierIds on that witness is covered at global-settings.adversarial.test.ts:612-614. **Keep:** `apps/web/tests/settings/qa-6t-negative-delta.adversarial.test.ts:217` |
| 271 | keeps refusing a material book whose default is not its cheapest tier, on the very design the hardware rule spares | 1 | qa-6w :446 runs the identical call (DRAWERS_ONLY = solo base-drawer3-600, material defaultTierId set to material.veneer) and asserts the exact error object and sentence, which is strictly stronger than toThrow(NegativeTierDeltaError). The better twin is :446, not the property at :484, which does not guarantee sampling this population. **Keep:** `apps/web/tests/settings/qa-6w-below-default-tier.adversarial.test.ts:446` |

**`tests/settings/qa-w2-popover-viewport-clamp.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 131 | keeps the centred modal's own top above the constant the clamp assumes | 1 | Same four tokens, same formula, same 90.5 (centring :137) and same <= --popover-top (centring :149-153). Only residual: this one reads the tokens from the last .surface block rather than the first match in the file, which matters only if a token were declared twice with different values. **Keep:** `apps/web/tests/settings/global-settings-modal-centring.test.ts:137` |
| 192 | positions the settings modal against the viewport and centres it there | 1 | The same six declarations on the same last .surface block of global-settings.module.css. The twin uses exact strings (centring :195-200), this one whitespace-tolerant regexes, so the twin is at least as strict on every line. **Keep:** `apps/web/tests/settings/global-settings-modal-centring.test.ts:190` |

**`tests/store/cabinet-depth-legacy-fallback.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 209 | keeps an unresolvable source on a surplus and drops it on a ceiling answer | 1 | Same columns and members (BASE_KEY A\|2.00 / p1,p12,p18 is frozen-source's DISHWASHER_KEY; WALL_KEY A\|0.30 / p8,p15), same source id, same 700 step. frozen-source :579 and :603 assert both outcomes plus the depths and the stored entry; this case asserts only the two depthFromBuildId reads. **Keep:** `apps/web/tests/store/cabinet-depth-frozen-source.test.ts:579` |

**`tests/store/configurator-store.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 460 | publishes the store-owned refusal as a locale-free descriptor | 1 | Both build a store with no probeAt, select a placement, insert, and assert lastRejection toEqual { code: 'BODY_PROBE_UNAVAILABLE', params: {} }; commands :226 additionally asserts the store is unchanged. The selected id and build id differ but the guard refuses before reading either. **Keep:** `apps/web/tests/store/configurator-store.commands.test.ts:226` |
| 472 | fails on the selection first, exactly as remove, setFinish and setHandle do | 1 | commands :259 asserts TARGET_NOT_FOUND for the same no-probe, nothing-selected insert('base-cabinet'), and for the with-probe store too. The deselect() here is a no-op on a fresh store. **Keep:** `apps/web/tests/store/configurator-store.commands.test.ts:259` |

**`tests/store/configurator-store.commands.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 168 | takes the hob away with the cabinet it is built into | 1 | Identical steps and identical two assertions on HOB_HOST_ID (removeById is select + remove, commands :55); adversarial :423 adds expectStoreInvariants. **Keep:** `apps/web/tests/store/configurator-store.adversarial.test.ts:423` |
| 581 | keeps every column's extent identical across every kind of command | 1 | adversarial :104 runs remove, insert, setFinish, setHandle and refusals, comparing columnExtents and the key set after every step; this compares once at the end over a subset of those command kinds. I found no command arm it reaches that the sweep does not. **Keep:** `apps/web/tests/store/configurator-store.adversarial.test.ts:104` |
| 656 | calls onDesignChanged after the store has applied the edit, with the new design | 1 | onDesignChanged has one call site for every command (configurator-store.ts:393), so 'called after the store applied, with the store's design' is the same fact for remove as for setFinish/setHandle at adversarial :342; the call count for remove is at :318-336. **Keep:** `apps/web/tests/store/configurator-store.adversarial.test.ts:342` |

**`tests/store/empty-columns-reload.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 167 | writes no emptyColumns key at all when a command leaves nothing empty | 1 | Identical steps (select p0, setFinish oak) and the identical not.toHaveProperty('emptyColumns'); qa-5b2b :339 adds canonical-byte equality and the columnExtents count. **Keep:** `apps/web/tests/store/qa-5b2b.adversarial.test.ts:339` |

**`tests/store/qa-5b2b.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 305 | shrinks 601 → 600 without throwing out of the command | 1 | :317 runs the same setWidth(600) on the same fixture and rethrows if it throws, then also checks integer centres, so it fails whenever this does. Caveat for the kept test: its integer loop is vacuous if emptyColumns is empty. **Keep:** `apps/web/tests/store/qa-5b2b.adversarial.test.ts:317` |

**`tests/store/qa-6k-a-cabinet-depth.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 162 | returns every column the swap does not re-declare the depth of | 1 | :179 asserts the whole columnDepthsM map toEqual the starting map after the same 600-700-600 trip, which implies every toBeCloseTo here. The only extra is a >= 6 floor on a test-local partition helper. **Keep:** `apps/web/tests/store/qa-6k-a-cabinet-depth.adversarial.test.ts:179` |

**`tests/store/qa-aud-005-recorded-map-offer-parity.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 178 | places nothing past the end of the wall when the capped opening is filled | 1 | Same fixture (FAR_END, p7/p24 removed, 700 mm) and the same every-record-inside-the-wall assertion; the twin runs it for every offered row, and base-cabinet is one (twin :116 inserts it without refusal). If base-cabinet left the list, twin :152 would require the tap to be refused. **Keep:** `apps/web/tests/store/the-opening-a-command-fills-is-the-published-one.test.ts:176` |

**`tests/store/qa-w2-editability-extraction.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 213 | carries the reason onto the remove action exactly where the rule says it is locked | 1 | Same 4 x 6 product, same openPanelAt fixtures, the same two footer assertions; editability.test.ts:112 also asserts the loop ran 24 times. The stronger whole-view case at :184 in this file is untouched. **Keep:** `apps/web/tests/store/editability.test.ts:112` |

**`tests/store/whole-kitchen-settings.qa.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 115 | keeps a selected placement, and its identity | 1 | Same fresh store, same select p0, same setMaterialTier, same selection assertion; only the tier id differs (veneer vs painted-mdf), and KITCHEN_L_DESIGN carries no finish for either to reset. The dangling-selection cases below it in the QA file are the real addition. **Keep:** `apps/web/tests/store/whole-kitchen-settings.test.ts:124` |

**`tests/store/whole-kitchen-settings.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 175 | notifies the save path exactly once however many finishes the change resets | 1 | qa-6q-b :103 asserts one onDesignChanged call carrying the store's design for every material id on the same fixture, :74 asserts exactly p0 and p1 move with length FINISHES_RESOLVED_BY_VENEER, and :119 adds a single store publication. Assumes MATERIAL_IDS includes veneer (imported, not opened). **Keep:** `apps/web/tests/store/qa-6q-b-cascade.adversarial.test.ts:103` |

#### `packages/configurator-domain` — 191 entries, 369 cases

**`tests/backlog-50-the-corner-the-validator-cannot-see.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 263 | declares the code a mark, per code, as ADR 0069 requires | 1 | DesignIssueSeverity is only 'mark' \| 'refusal' (validate-design.ts:159) and fatalDesignValidationIssues filters on 'refusal' (:216), so the only way to fail this is to declare 'refusal', which fails :269 with the finding present. **Keep:** `packages/configurator-domain/tests/backlog-50-the-corner-the-validator-cannot-see.test.ts:269` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/build-depth.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 385 | declares 700 over a full-height column at a 700 mm kitchen, not the pinned 600 | 1 | columnBuildDepthMm({ 700, hasFullHeightUnder: true }) toBe(700) is already :137-139; not.toBe(600) follows from it. **Keep:** `packages/configurator-domain/tests/build-depth.test.ts:133` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 396 | still declares 600 at a 600 mm kitchen, where the pin and the line coincide | 1 | columnBuildDepthMm({ 600, hasFullHeightUnder: true }) toBe(600) is the first assertion of :133-136, same call and literal. **Keep:** `packages/configurator-domain/tests/build-depth.test.ts:133` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/cabinet-depth-parameter.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 138 | caps a wall carcass at the same map row it always did | 1 | Same call and literal as build-depth.test.ts:125-127; in its own file :161 ties the same arm to wall-cabinet's nominal, which :149 pins at 330. **Keep:** `packages/configurator-domain/tests/build-depth.test.ts:124` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 287 | %s declares whether its depth follows the setting | 15 | :534 runs the same cabinetDepthRuleOf not-toThrow over every key of KITCHEN_L_BODY_CATALOG, which buildKitchenLBodyCatalog builds from the seeded and the insertable definitions (kitchen-l-design.ts:691-702), so every insertable id is already an iteration. **Keep:** `packages/configurator-domain/tests/cabinet-depth-parameter.test.ts:534` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 435 | never gives the hood the wall map's depth, at either declared depth | 1 | :429 pins the hood's nominal to HOOD_BODY_DEPTH_MM at both depths and :149-153 pin the wall map's rows at 330 and 400, so the inequality cannot fail without one of those failing first. **Keep:** `packages/configurator-domain/tests/cabinet-depth-parameter.test.ts:421` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/cabinet-handles.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 77 | never answers %s with a non-number | 2 | The same two rule shapes are required to throw UndeclaredCabinetHandleCountError at :63 and :69; 'threw or a safe integer' is strictly weaker on the same inputs. **Keep:** `packages/configurator-domain/tests/cabinet-handles.adversarial.test.ts:63` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/cabinet-handles.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 55 | follows the door count across the two-door threshold, and only there | 1 | The perDoor = 1 row of :135 uses the same rule, asserts 1 at threshold - 1 and 2 at threshold, and that the only step in 2..2000 is at the threshold, which gives threshold + 1 = 2. **Keep:** `packages/configurator-domain/tests/cabinet-handles.adversarial.test.ts:135` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 185 | refuses a rule it does not recognise rather than reading a number off it | 1 | The identical literal { countedFrom: 'mesh-count', handles: 4 } is a row of adversarial :38 (lines 44-47), with the same error class and the build id also checked. **Keep:** `packages/configurator-domain/tests/cabinet-handles.adversarial.test.ts:38` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/catalog.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 139 | reports an unknown kind as unknown | 1 | isKnownKind is a Set lookup (catalog.ts:842); 'teleporter' takes the same miss as 'mystery_unit' at catalog.qa.test.ts:29. **Keep:** `packages/configurator-domain/tests/catalog.qa.test.ts:28` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/chosen-finishes.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 227 | counts #ECEEEB on an MDF kitchen, which is the deliberate over-warn | 1 | adversarial :155 sweeps all 64 case spellings on an MDF design and requires exactly the declared lower-case one to be silent, which contains both assertions here. **Keep:** `packages/configurator-domain/tests/chosen-finishes.adversarial.test.ts:155` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 245 | counts every carried finish rather than throwing | 1 | adversarial :217 expects all 26 Alb cabinets counted under the undeclared tier, and :255 in this file covers the mixed population where bare placements must not be counted. Keep both; the single-cabinet case reaches no arm they miss. **Keep:** `packages/configurator-domain/tests/chosen-finishes.adversarial.test.ts:217` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 272 | never counts a placement carrying no finish key | 1 | Its two assertions are verbatim :199 (KITCHEN_L_DESIGN gives 0) and :207-212 (one Antracit cabinet gives 1) in the same file. The load-seam case under the same describe is the part that carries the title's claim. **Keep:** `packages/configurator-domain/tests/chosen-finishes.test.ts:196` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/clip-empty-columns-at-wall-end.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 119 | keeps one identity for the column, in the map slot and in the extent alike | 1 | Same input. :105-107 already assert the map's only slot is 'A\|3.30' and that the column in it has key 'A\|3.30', which is slot === column.key for the one entry. **Keep:** `packages/configurator-domain/tests/clip-empty-columns-at-wall-end.test.ts:95` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/clip-empty-columns-to-free-ground.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 123 | ignores a body standing under it at another level | 1 | :194 is the same configuration (wall column with regions [[1.5, 2.2]], a 0-0.82 body under it on another key, map returned by identity) and :195 adds the contrasting drop. Full versus partial along-wall coincidence reaches no different branch that I could find. **Keep:** `packages/configurator-domain/tests/clip-empty-columns-to-free-ground.test.ts:182` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/column-extents.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 292 | refuses a 3200 mm extent spanning most of wall A | 1 | Same call shape and the same toContain('COLUMN_EXTENT_OVERLAPS_PLACEMENT'); both extents lie across neighbouring wall-A columns at y0 0 to 2600. I found no arm of the overlap sweep the 3200 mm document reaches that the 2000 mm one does not. **Keep:** `packages/configurator-domain/tests/column-extents.test.ts:277` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/bottle-cargo-width-floor.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 204 | offers only the entries that declare a floor below the default | 1 | :244-246 pin the offered list at 200, 250 and 299 to exactly ['base-cabinet', cargo] and :251 pins subDefaultBaseBuildIds() to the same two ids, so 'offered is a subset of the sub-default ids' cannot fail while both hold. **Keep:** `packages/configurator-domain/tests/commands/bottle-cargo-width-floor.test.ts:236` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/degenerate-inputs.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 91 | invents no floor space under it (§11 row 18) | 1 | :85-88 pin the same column's openings to exactly [[1.5, 0.7], [2.2, 0.4]], which excludes any opening below 1.5. If removed, move the '§11 row 18' citation onto :77. **Keep:** `packages/configurator-domain/tests/commands/degenerate-inputs.test.ts:77` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/insert-body.probe-contract.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 167 | is called exactly once per successful insert | 1 | Same world, target, buildId and fake probe as :129, which asserts probe.requests toEqual a one-element array; toHaveLength(1) at :176 is strictly implied. **Keep:** `packages/configurator-domain/tests/commands/insert-body.probe-contract.test.ts:129` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/insert-resize-width-agreement.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 372 | has every member's entry accept 450, the wall cabinet included | 1 | setWidth refuses unless every column member passes acceptsWidthMm (src/commands/resolve-column-width.ts:65), and the it.each at :344 taps 450 from all three of p1/p12/p18 and requires all three to land on 450. A cap reinstated on any one row already fails :344 from every tap, which is the only mutation the candidate's comment claims. **Keep:** `packages/configurator-domain/tests/commands/insert-resize-width-agreement.test.ts:344` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/minimum-width.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 134 | leaves §2's MIN_WIDTH_M governing an entry that declares no minimum | 1 | base-3drawer at 299 (WIDTH_NOT_SUPPORTED) and 300 (ok) through insertInto on a cleared base void is asserted identically at insert-body.boundaries.test.ts:128/:134 (300 also checks the built width) and inside the 199..301 table at bottle-cargo-width-floor.test.ts:96. Same branch, same values. **Keep:** `packages/configurator-domain/tests/commands/insert-body.boundaries.test.ts:128` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 145 | does not offer the sink base for a 400 mm or a 500 mm opening / offers the sink base for a 600 mm opening | 2 | The sweep at :166 visits 300..800 step 10 (400, 500, 600 included) on the same world/target and asserts offersSink toBe(width >= 560), an exact equality that covers both directions. The only extra here is offered.length > 0 at 400/500, which :505 repeats at 400 — so keep :505 (see s19.11) alongside :166. **Keep:** `packages/configurator-domain/tests/commands/minimum-width.test.ts:166` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 315 | takes the narrower listed size when the entry declares no floor | 1 | Floor-less set takes the 450 member: adversarial:321 is the same control ([400,450,600], no floor, 460 -> 450), and the fixed-set sweep at adversarial:340 runs the shipped floor-less [450,600] dishwasher at every 10 mm from 300, including the exact-fit 450 opening this case uses. Same evaluateInsertFit branch. **Keep:** `packages/configurator-domain/tests/commands/minimum-width.adversarial.test.ts:321` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 322 | refuses rather than selecting a listed size below the floor | 1 | [450,600] with floor 500 refusing WIDTH_TOO_LARGE is asserted with params at :330 (opening 480) in the same file and at adversarial:273 (opening 460). 450/460/480 are all in the same class (below 600, at or above the filtered 450); this case asserts the code only. **Keep:** `packages/configurator-domain/tests/commands/minimum-width.test.ts:330` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 349 | refuses a set whose every member is below the floor, even in a wide opening | 1 | adversarial:295 runs [450] under a 500 floor through evaluateInsertFit at 300, 460 and 800 and asserts WIDTH_TOO_SMALL with requiredMm 500 plus availableMm. The candidate is the 800 row with a weaker params check, and its toMatchObject is pasted twice (:353 and :357). **Keep:** `packages/configurator-domain/tests/commands/minimum-width.adversarial.test.ts:295` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 371 | ships no millimetre set a floor of its own would narrow | 1 | The identical expect(buildableSizes(definition.minWidthMm, sizesMm)).toEqual(sizesMm) runs per fixed-set entry at adversarial:354 over the same INSERTABLE_BODY_DEFINITIONS population (widthFlex not 'fit'). **Keep:** `packages/configurator-domain/tests/commands/minimum-width.adversarial.test.ts:340` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 492 | leaves base-sink's chips stepped from its aperture | 1 | :468 asserts offer.sizesMm equals the catalogue row's sizesMm for every offer at 300..800 (base-sink included from 560, 800 is a row) and :207 asserts that row equals SINK_CHIPS_MM. A filter that eats the sink's chips fails :468 at every width >= 560. **Keep:** `packages/configurator-domain/tests/commands/minimum-width.test.ts:468` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/qa-5b8-pantry.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 80 | does not fall back to 600 in a 700 mm opening | 1 | 700 is a row of the it.each at :67, which asserts the built width toBe(700) through the same insertPantryInto call; not.toBe(600) is strictly weaker. **Keep:** `packages/configurator-domain/tests/commands/qa-5b8-pantry.adversarial.test.ts:67` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 166 | fills a 650 mm opening with a pantry where a tower keeps its 600 | 1 | Pantry at 650 -> 650 is the 650 row of :67; tall-oven-tower at 650 -> 600 is the 650 step of the 400..800/50 sweep at :132, both through the same openingOf/insertInto path. The contrast adds no branch; also keep :132. **Keep:** `packages/configurator-domain/tests/commands/qa-5b8-pantry.adversarial.test.ts:67` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/qa-5d2b.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 190 | conserves the along-wall total, by refusing the move that would not | 1 | Same world and call as :174. It asserts ok === false and that totalOn(world.columns) equals itself around a refused command that returns no columns, so it can only fail if setWidth mutates its input map in place; :174 asserts the code and the neighbour's extent on that same input map, and :201 keeps the same total check on the growth route. Residual: an in-place delete of only the resized key would be seen here alone. **Keep:** `packages/configurator-domain/tests/commands/qa-5d2b.adversarial.test.ts:174` | **D2-A deleted** — a kept test went red under a mutation; review follow-up applied: the Keep now also asserts the column map's keys after a refused shrink |
| 280 | refuses the shrink that would push it there | 1 | Same world, same COLUMN_HOOD_FLOOR code as :290 at 550, which is the tap nearest the 600 floor and so dominates 300 for any threshold change. The geometric harm at 300 (hood through the neighbour) is separately caught by the STEPS sweep at :301, which includes 300. **Keep:** `packages/configurator-domain/tests/commands/qa-5d2b.adversarial.test.ts:290` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/qa-6q-a-set-finish.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 215 | writes PAL's own decor through %s | 2 | :195 already requires the three silent designs to answer identically for every finish, pal.antracit included, so two of the three rows are implied by any one. Keep one row: :204 counts six oks without naming which, and :229 only asserts agreement with materialOffersFinish, so one row is the sole command-level statement that PAL's own decor is accepted. **Keep:** `packages/configurator-domain/tests/commands/qa-6q-a-set-finish.adversarial.test.ts:215` | **D2-A part** — 2 of 3 rows deleted (kept test red); the "PAL named explicitly" case stays |

**`tests/commands/qa-6x-a-slide-direction.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 522 | displaces the member-less extent by exactly one chain shift each way, measured from the frozen map, at $label | 2 | 6x-a-slide-direction.test.ts:279 pins, for both directions and both operand orders, where the member-less extent leaves from (emptyColumns alongMm) and the key and absolute coordinate it arrives at; :333 ties that 100 mm to alongWallShiftMm. Arrival minus departure equal to +/-CHAIN_SHIFT_MM is arithmetic on those pinned values through the same frozenExtentsSlidAlongTheWall call. **Keep:** `packages/configurator-domain/tests/commands/6x-a-slide-direction.test.ts:279` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/qa-w5c.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 206 | gains only moves in the columns adjacent to the clear / loses two load taps to RESIZE_OPENS_GAP, and none to anything else | 1 | The loss case (:277) is a subset: its lost taps are drawn from the load list and enumeration's lostToGap rows pin the same per-clear losses on the finer grid. The gains case (:206) is not: acceptedTaps tries ALL_WIDTHS_MM (:59, including 900) on every body regardless of that body's own chips, e.g. the dishwasher p1 at 700/800 beside a cleared A\|1.30, which enumeration's chipsFor never taps. A resize that stopped checking the tapped body's own acceptance shows only there. **Keep:** `packages/configurator-domain/tests/commands/qa-w5c.enumeration.test.ts:401` | **D2-A part** — the loss case only deleted (kept enumeration row red) |
| 427 | allows an empty column to be consumed exactly to zero and removes its key | 1 | Exact consumption is the remainder-0 row at qa-w5b1.adversarial.test.ts:157 (emptyColumnWidthMm 0) plus :178 (no zero-width column, no void left), through the same resizeTo path on an equivalent pair world. Residual: the spansMm check that both column members land on 400..1200 is not in w5b1; the held edge on a growth is at set-width.test.ts:198. **Keep:** `packages/configurator-domain/tests/commands/qa-w5b1.adversarial.test.ts:178` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 451 | accepts a remainder between zero and MIN_W (ADR 0043) | 1 | A remainder strictly between 0 and MIN_W is accepted at 2, 50 and 298 in the table at qa-w5b1.adversarial.test.ts:156 with the same emptyColumnWidthMm assertion; 100 is the same class with no boundary of its own. Same spans residual as s20.12. **Keep:** `packages/configurator-domain/tests/commands/qa-w5b1.adversarial.test.ts:156` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/qa-w5c.enumeration.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 158 | still accepts nothing at all in the two columns an appliance freezes | 1 | The toEqual at :86 fixes the complete accepted list from the same census(kitchen()) call and it contains no p2, p13, p19, p5 or p7 tap, so their absence is strictly implied. **Keep:** `packages/configurator-domain/tests/commands/qa-w5c.enumeration.test.ts:77` | **D2-A kept, no signal** — three independent guards hold the frozen columns, so no single mutation reddens either test |
| 420 | accepts 546 taps across the nine deletable columns | 1 | Each row of :401 fixes the cleared world's accepted set exactly (gained equal, losses on surviving bodies equal, the load list fixed at :86), so the sum over the nine rows is determined; the test's own comment gives the arithmetic. The number 546 is also asserted from an independent sweep at qa-w5b1.adversarial.test.ts:677. **Keep:** `packages/configurator-domain/tests/commands/qa-w5c.enumeration.test.ts:401` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/qa-waves-ac.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 165 | crosses a real transition for both entries that have one | 1 | The 195..305 sweep at :139 compares codeAt at every millimetre, 199/200/299/300 included, with the same expected codes for base-3drawer and the cargo, and additionally asserts two distinct outcomes per row. The four spot checks are rows of it. **Keep:** `packages/configurator-domain/tests/commands/qa-waves-ac.adversarial.test.ts:139` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/remove-placement.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 155 | returns the exact original design and changes nothing (void selected / missing target) | 2 | rejection-totality.test.ts:213 and :218 run removePlacement on the seeded design with a void target and with 'p999', and :574/:587 assert the same identity, unchanged JSON and no effect, plus the code. The third row (p25 structural) is not part of this finding and stays. **Keep:** `packages/configurator-domain/tests/commands/rejection-totality.test.ts:574` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/set-appearance.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 173 | refuses a body with no handle meshes | 1 | rejection-totality.test.ts:453 calls setHandle with p12, 'black' and KITCHEN_L_BODY_CATALOG on the same design; :574 and :587 assert the HANDLE_NOT_SUPPORTED code, design identity and unchanged JSON, a superset of the two assertions here. **Keep:** `packages/configurator-domain/tests/commands/rejection-totality.test.ts:453` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/set-cabinet-depth.along-wall-chain.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 189 | measures two arms that are genuinely different distances | 1 | The it.each at :168 asserts the deep headroom is exactly 20 for base-formula and exactly 39 for wall-map from the same cornerHeadroomMm(changeTo(.., 700), 700) call; 20 !== 39 follows. **Keep:** `packages/configurator-domain/tests/commands/set-cabinet-depth.along-wall-chain.test.ts:168` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 199 | puts no wall-B body inside wall A's corner reach at 700 | 1 | cornerHeadroomMm (:98) is the minimum over every wall-B placement of spanStart minus cornerReachMm for its chain, with the member count. :168 pins that minimum at 20 and 39 at 700 and the counts per chain, so every member is above its reach; this case recomputes the same expression per member with the same helpers. **Keep:** `packages/configurator-domain/tests/commands/set-cabinet-depth.along-wall-chain.test.ts:168` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/set-whole-kitchen-settings.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 108 | succeeds on the tier that is already set | 1 | qa:146 makes the same two calls and asserts ok, a new object, the moved updatedAt and settings toEqual including materialTierId; the candidate's ok plus materialTierId is a strict subset. **Keep:** `packages/configurator-domain/tests/commands/set-whole-kitchen-settings.qa.test.ts:146` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 144 | refuses an empty offer list rather than accepting anything | 1 | The 'an empty list' row of NEAR_MISSES (qa:39) calls setMaterialTier with availableTierIds [] and asserts UNKNOWN_MATERIAL_TIER plus the untouched design. Only the asked-for id literal differs, and membership in an empty list does not depend on it. **Keep:** `packages/configurator-domain/tests/commands/set-whole-kitchen-settings.qa.test.ts:49` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 291 | names neither tier id | 1 | Identical call to :263, whose toEqual({code:'UNKNOWN_MATERIAL_TIER', params:{}}) on the whole reason already fixes params to {}. **Keep:** `packages/configurator-domain/tests/commands/set-whole-kitchen-settings.test.ts:263` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/set-width.creates-space.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 43 | is accepted on a kitchen nobody has edited | 1 | :49 makes the identical resizeTo(kitchen(), 'p4', 500) call, asserts ok first and then widths, positions and extents. **Keep:** `packages/configurator-domain/tests/commands/set-width.creates-space.test.ts:49` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 188 | refuses on a kitchen at load, naming both sides absent | 1 | set-width.test.ts:366 makes the same call (p10 to 350 on the seeded kitchen) and asserts NO_EMPTY_SPACE, the same two-entry sides array, and deltaMm 50 in addition. **Keep:** `packages/configurator-domain/tests/commands/set-width.test.ts:366` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/set-width.hood.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 174 | does not make its column 'unaligned' by standing at a different width | 1 | :191 grows a run to 750 under a 700 hood and asserts run-base 750 and hood 700, plus the top member and the shared centre. No guard separates the two-member column here from the mixed column there; the only loss is a simpler witness when :191 fails. **Keep:** `packages/configurator-domain/tests/commands/set-width.hood.test.ts:191` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/set-width.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 326 | is not narrowed by a `widthFlex: 'fit'` member above its floor | 1 | :212 makes the identical resizeTo(pairWithEmptyRight(), 'L-base', 400) call and asserts ok plus the span, the empty column's width and its key. **Keep:** `packages/configurator-domain/tests/commands/set-width.test.ts:212` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 382 | accepts growth that leaves the empty column under MIN_W (ADR 0043) | 1 | A growth leaving a sub-MIN_W remainder is asserted at 2, 50 and 298 (and 300) by the table at set-width.creates-space.test.ts:322 with the same ok plus emptyColumnWidthMm shape, and again at qa-w5b1.adversarial.test.ts:156. A 200 mm remainder is the same class. **Keep:** `packages/configurator-domain/tests/commands/set-width.creates-space.test.ts:322` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 393 | refuses growth larger than the empty column | 1 | set-width.creates-space.test.ts:340 asserts NO_EMPTY_SPACE with sides[0] {right, too_narrow} for a growth larger than the empty column; qa-w5b1.adversarial.test.ts:104 asserts both sides. Only the fixture widths differ (400/300 against 600/100), both on the remainder < 0 branch. **Keep:** `packages/configurator-domain/tests/commands/set-width.creates-space.test.ts:340` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/commands/void-rules-via-mutation.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 64 | emits nothing for the 40 mm stub below 0.86, which is under MIN_SPAN | 1 | :58 asserts the hob column's complete slot list on the same world equals one slot at y0 1.5, so no slot below 0.86 in that column is strictly implied. **Keep:** `packages/configurator-domain/tests/commands/void-rules-via-mutation.test.ts:58` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 87 | offers nothing at floor level in that column, even after a full clear | 1 | :81 asserts the wall-only column's complete slot list on the same world equals the two slots at 1.5 and 2.2, so no slot below 1.5 is strictly implied. **Keep:** `packages/configurator-domain/tests/commands/void-rules-via-mutation.test.ts:81` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/contact/contact-fields.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 587 | validateContactFields: only what the sender's object holds itself is read | 7 | qa-8h-contact-submission.adversarial.test.ts:917 calls validateContactFields alone for all seven contact fields with the field left out and a valid enumerable value planted on Object.prototype, and requires the whole result to equal the unpolluted one (itself pinned at :954 and by the required-field cases). That covers the five required rows, locality and the e-mail row. Both files have uncommitted edits; re-check before deleting. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-contact-submission.adversarial.test.ts:917` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/contact/contact-submission.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 144 | refuses a request-level %s / refuses a %s inside the contact fields / inside the design reference | 15 | price, total, totalMinor, lines and pricingVersion at all three levels (15 rows) are repeated key for key at qa-8h:157 with the same single-UNKNOWN_FIELD assertion. bookVersion, currency and extra (9 rows) are not in the QA list, and the property tests at :195/:206 do not cover the design level; they are the only cases that go red if one of those names is added to an allowlist. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-contact-submission.adversarial.test.ts:157` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 227 | never reads a property inherited from a polluted Object.prototype | 1 | qa-8h:884 runs request.design through describe.each(FIELDS): the body without design must answer the same with an enumerable value planted on Object.prototype as without, and :894 adds the getter variant. The candidate plants a non-enumerable value, which any reader the enumerable plant catches also catches; the unpolluted answer is pinned by 'refuses neither' at contact-submission.test.ts:258. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-contact-submission.adversarial.test.ts:884` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 414 | throws on an empty list, whatever it is given: %s | 2 | validateAgainstLocales is an import alias of validateContactSubmission (contact-submission.test.ts:7). Both rows (valid request, null) with [] and toThrow(RangeError) are rows of the qa table, which adds a refused request and a message pin. Strict subset of the single guard at contact-submission.ts:124. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-contact-submission.adversarial.test.ts:445` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 439 | the honeypot is carried as a yes or no (absent/empty, filled, %j filled) | 5 | Absent, empty, ' ', 'x' (a word), '\n' and the filled-text no-leak case are all rows of the qa criterion-23 table / the 'carries a filled honeypot as a yes' test, with equal or stricter assertions. Keep the lone "\u0000" row: no qa row hands a honeypot that is only NUL, so a change that strips NUL before the `raw !== ""` test (contact-submission.ts:287; plausible, Postgres text cannot hold NUL) turns only it red. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-contact-submission.adversarial.test.ts:1056` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 482 | accepts %d ms / refuses %j as MALFORMED (elapsedMs tables) | 17 | isElapsedMs is one predicate (number && isSafeInteger && >= 0). qa pins 0, a day, a day+1 ms and MAX_SAFE_INTEGER by table and every safe natural by property; its refused table holds -1, MAX_SAFE+1, a fraction, NaN, Infinity, numeric text, null and true. 1, 4999, 1e12, 1e21 and MIN_SAFE_INTEGER have no literal row there but cross no boundary the qa rows do not; I found no single change to the predicate that fails one of them and passes qa. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-contact-submission.adversarial.test.ts:543` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |
| 513 | requires the elapsed time | 1 | Same omission of elapsedMs from an equivalent valid request, same single REQUIRED issue (judgeElapsedMs, contact-submission.ts:291). The two differ only in the helper that formats the issue list. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-contact-submission.adversarial.test.ts:576` | **D2-A deleted** — a kept test went red under a mutation; logic review: sound |

**`tests/contact/phone-number.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 145 | normalisePhoneNumber: every space separator is grouping | 18 | qa sweeps every Zs code point (whole code space, not just the BMP) at every position of 069123456 and +37369123456, plus a run of three at every position, and asserts the same normal form; its count check (>= 17) is at qa:80. The unit sweep's two separated occurrences add nothing a first-occurrence-only removal would not already fail in the run-of-three test. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-phone.adversarial.test.ts:95` | **D2-B deleted** — a kept test went red under a mutation |
| 204 | normalisePhoneNumber: any dash is grouping | 22 | Every Pd at every position is swept at qa:539 with the count check at qa:525. The minus-sign case is not weaker in qa as the finding feared: qa:253 hands '069\u2212123456' and asserts toEqual {ok:false, code: PHONE_FORMAT_UNRECOGNISED}, the same code this file asserts. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-phone.adversarial.test.ts:539` | **D2-B deleted** — a kept test went red under a mutation |
| 252 | refuses the national prefix alone as incomplete | 1 | normalisePhoneNumber("0") -> PHONE_MOLDOVAN_INCOMPLETE is the first expect of 'is not what a number with nothing after the prefix is told' in the same file, character for character. **Keep:** `packages/configurator-domain/tests/contact/phone-number.test.ts:194` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/contact/qa-8h-contact-fields.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 754 | requires one: empty text and none at all are the same refusal | 1 | consentTextVersion "" and undefined -> REQUIRED is asserted with the same two inputs in the unit 'still requires one' table and again in the required-fields table (contact-fields.test.ts:120-121). Same branch of judgeConsentTextVersion, no stricter assertion here. **Keep:** `packages/configurator-domain/tests/contact/contact-fields.test.ts:573` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/contact/qa-8h-phone.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 350 | leaves the prefix alone as incomplete: nothing has been typed that cannot be completed | 2 | "0" and "+373" alone -> PHONE_MOLDOVAN_INCOMPLETE are both expects of phone-number.test.ts:194, and the qa digit-count sweep (SWEPT_DIGIT_COUNTS starts at 0, qa:130) asserts the same code for both prefixes with no digits. **Keep:** `packages/configurator-domain/tests/contact/phone-number.test.ts:194` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/contact/qa-8h-submission-snapshot.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 482 | always yields a document that parses again, for every generated kitchen and variant | 1 | Same CASES, same snapshotOf(design).document; :241 runs DesignSchema.parse (throws where safeParse would report failure) and additionally asserts the bytes and the parsed value. Nothing can fail the safeParse sweep without failing :241 for the same case. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:241` | **D2-B deleted** — a kept test went red under a mutation |
| 1025 | allows only what the price itself found to fit: every allowed judgement carries an unflagged price | 1 | Same call (seeded design, no ids, the seeded design's own price) and a toMatchObject subset of what the unit test asserts with toEqual on the whole allowed result. The title's 'every allowed judgement' is one judgement. **Keep:** `packages/configurator-domain/tests/contact/submission-eligibility.test.ts:209` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/contact/submission-eligibility.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 165 | carries the pricing failure as priceDesign returned it, the same object | 1 | Both hand a failed PricingResult for the seeded design with no ids and assert the refusal's failure is the same object by identity. Only the failure literal differs. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:849` | **D2-B deleted** — a kept test went red under a mutation |
| 350 | throws on a list that names a body the design does not hold, priced or not | 1 | Same design, same id "no-such-body", one priced and one failed result, same SubmissionFactsContradictionError. qa's `fitting` (qa:906) is the same priceDesign call as PRICED_SEEDED (submission-eligibility.test.ts:19). **Keep:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:937` | **D2-B deleted** — a kept test went red under a mutation |
| 373 | accepts the same bodies in another order: sets are compared, not sequences | 1 | qa hands the price's ids reversed and repeated and asserts the whole refusal with toEqual, after asserting more than one id. That is strictly harder than the unit's reversed pair: a sequence compare fails both, a sorted-without-dedup compare fails only qa. No mutant found that fails the unit case alone. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:980` | **D2-B deleted** — a kept test went red under a mutation |
| 380 | cannot be made to forge a line by a separator in an id | 1 | qa puts every Cc/Cf/Zl/Zp character (U+2028 asserted present at qa:1126) in a caller-handed placement id through the same throw and asserts the blanked text and no line break. The unit case differs only in handing a failed price, and the unheld-id throw is pinned 'priced or not' at qa:937. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:1142` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/contact/submission-snapshot.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 80 | is the same bytes however the design's keys were ordered | 1 | The qa property reorders keys at every depth by a random ranking for every generated kitchen (the seeded L among them) and asserts the same document equality. A reversal is one such ranking; any key-order sensitivity shows on essentially every draw. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:266` | **D2-B deleted** — a kept test went red under a mutation |
| 300 | the snapshot's refusals (past-wall per wall, all three walls, NO_CABINET, PRICING_FAILED, ordering x2, no snapshot) | 5 | Redundant: NO_CABINET (qa 'no body, priced or not'), PRICING_FAILED on a version mismatch (qa UNPRICEABLE), both ordering cases and 'no snapshot with a refusal' (qa:882, stricter). Keep four: the three per-wall cases also assert placementIds is exactly [placementIdOnWall(...)], an oracle independent of findOverflowingPlacementIds, where qa compares only against the fit query itself; and all three walls at once has no twin (qa:980 pushes A and B only). **Keep:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:738` | **D2-B part** — 5 of 9 deleted (kept tests red) |
| 442 | throws for %s, and does not refuse it / names the shape of what failed and no value / stores the serialisation of the parsed design | 7 | The six throws and the parses-again case are covered by qa's NOT_DESIGNS table and qa:241 / the inherited-fields tests. Keep 'names the shape of what failed and no value': it asserts the message contains "room", the failing path. qa only matches the prefix /^The submission's design is not a design: \d+ issue\(s\): / and the absence of values, so a message that stops naming paths stays green there. **Keep:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:383` | **D2-B part** — 7 of 8 deleted (kept tests red) |

**`tests/corner-assembly-size.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 565 | still starts both floor runs at 900 mm in %o | 4 | Criterion 6's it.each runs lShellFloorRuns over [REFERENCE_ROOM, SMALLEST_APPROVED_ROOM, ...THRESHOLD_TABLE_ROOMS] and asserts startMm 900 on both walls plus the grid; criterion 8 runs the same function over THRESHOLD_TABLE_ROOMS alone with the same two 900 assertions. Strict subset. **Keep:** `packages/configurator-domain/tests/corner-assembly-size.test.ts:427` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/design.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 66 | accepts a null presetId | 1 | Both tests run DesignSchema.safeParse(design) on the same fixture, whose presetId is already null (design.test.ts:26), and assert success. Nothing is varied. **Keep:** `packages/configurator-domain/tests/design.test.ts:56` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/empty-columns.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 122 | caps the array at the distinct column keys the wire shape's walls can present | 1 | (6300 / 10 + 1) * 3 is 1893; design-bounds.test.ts:40-42 asserts MAX_EMPTY_COLUMNS against both the derivation and the literal 1893. Same constant, same value, weaker spelling here. **Keep:** `packages/configurator-domain/tests/design-bounds.test.ts:40` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/fixtures/demo-room-envelope.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 89 | is a deliberate divergence from the reference rather than a move toward it | 1 | depthMm > 2830 is implied twice over in the same describe: :68 pins depthMm to exactly 2920 and :80 pins it to 2920..2950 (2900 + 20..50). No value of the fixture passes either of those and fails this. **Keep:** `packages/configurator-domain/tests/fixtures/demo-room-envelope.test.ts:80` | **D2-B deleted** — a kept test went red under a mutation |
| 357 | is a fixed point at version %i | 5 | `corrected` is the demo with its pre-correction room put back and migrated, and :304-314 already assert that room is KITCHEN_L_DESIGN.room; nothing else in the document was changed. Loading it at versions 1-5 and expecting the room unmoved is the same load, same versions, same assertion as :266 on the fixture itself. I found no change to migrateDesign that separates the two inputs. **Keep:** `packages/configurator-domain/tests/fixtures/demo-room-envelope.test.ts:266` | **D2-B deleted** — could not be made red at versions 3–5; the Keep covers versions 1–5 on an identical document |

**`tests/fixtures/seeded-body-names.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 226 | agrees with its equivalent at every integer width from 100 to 1200 mm | 1 | Same 100..1200 mm sweep of describeBodyLabelAt against the equivalent. :403 iterates every catalogue row with a catalogEquivalentId, placed or not; :226 iterates the placed ones, which are a subset (the one extra row at :403 is base-drawer2-600, asserted at :395). **Keep:** `packages/configurator-domain/tests/fixtures/seeded-body-names.adversarial.test.ts:403` | **D2-B deleted** — a kept test went red under a mutation |
| 302 | names itself by an entry that exists, with its door-count flag | 1 | All three assertions are held elsewhere in the file: the pointer's target exists (:434, over the whole catalogue), the label at 600 mm (the :403 sweep), and the flag, because describeBodyLabelAt returns the bare name unless doorCountFollowsWidth is true (catalog.ts:836), so a drifted flag disagrees at every width of the :403 sweep. **Keep:** `packages/configurator-domain/tests/fixtures/seeded-body-names.adversarial.test.ts:403` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/fixtures/wall-corner-return-kinds.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 130 | names both returns in the kind set, so neither falls through to the unknown label | 1 | The two helpers are line-for-line the same (namesSomethingTheCatalogueHolds at wall-corner-return-kinds.test.ts:81 vs namesSomethingTheCatalogueKnows at seeded-body-names.test.ts:40; both read describeSelection(...).label). The twin runs the same loop over the same seeded world and again after a resize round trip. The test's own comment says it is re-asserted rather than inherited. **Keep:** `packages/configurator-domain/tests/fixtures/seeded-body-names.test.ts:176` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/frozen-map-declared-witnesses.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 99 | keeps a legacy 620 that the 6K-c rule would keep, under a full-height member | 1 | publishedMm(memberLessLegacyColumn(620, true), DEEP_MM, SHALLOW_MM) is the it.each row {frozenMm: 620, publishedAtShallowMm: 620}, whose literal expectation is stricter than this test's Math.max(620, ceiling) formula. **Keep:** `packages/configurator-domain/tests/frozen-map-declared-witnesses.test.ts:110` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/generation/dishwasher-beside-the-sink.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 263 | gets its dishwasher live from S2's (c), still never from the lone 3-drawer (4650 x 1000) | 1 | Same live plan of 4650 x 1000 and the same six wall-A strings; the twin also asserts wall B empty and nothing dropped. **Keep:** `packages/configurator-domain/tests/generation/dishwasher-trades.test.ts:93` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/generation/fridge-end-leftover.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 190 | takes only what the ceiling leaves a neighbour that is already wide / grows a %i mm cabinet in whole steps (4 cases) | 4 | The four (neighbour, leftover, taken) tuples are literal rows of the rule's own test (750/250/50 at :63, 601/625/651 at :80). The leaf passes cabinet.widthMm and the wall's remainder straight to that rule (fridge-end-leftover.ts:71-74); its plumbing at widths other than 600 is held by the property at fridge-end-leftover.test.ts:338 (widths 200..800, leftovers 0..599, both walls). Caveat: after deletion the leaf has no deterministic case at a neighbour width other than 600 or 800, only the property. **Keep:** `packages/configurator-domain/tests/generation/leftover-absorbed-beside-a-fixed-body.test.ts:80` | **D2-B deleted** — a kept test went red under a mutation |
| 318 | does the same on wall B as on wall A | 1 | The property draws the fridge wall from A and B and asserts the cabinet width, the remainder, the floor widths and contiguous spans on that wall, so the fridge's start on B is pinned on about half of every run; :308 pins the wall-B cabinet at 750 deterministically. The leaf has no wall branch (fridge-end-leftover.ts:57-76). **Keep:** `packages/configurator-domain/tests/generation/fridge-end-leftover.test.ts:338` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/generation/qa-7d4-composed-bodies.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 603 | declares exactly two required roles, and they are the sink and the hob | 1 | The identical filter-by-required expectation ["sink", "hob"] is the first expect of tall-end-composition.test.ts:638-642, and the whole table is pinned as a literal at generation-priorities.test.ts:90. **Keep:** `packages/configurator-domain/tests/generation/tall-end-composition.test.ts:640` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/generation/qa-7d5b-s0-pre-state-witnesses.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 149 | 3560 x 2920 after S0b: hob-2drawer, the oven tower [2700, 3300] and 260 mm bare | 1 | Note the cited twin plans with S1 switched off while this one is live, so the pair is not identical on its face. The live wall is still pinned: tower-over-bottle 'with S2, live' asserts the live wall A equals the one at :140, and generation-priorities.test.ts:56-83 pins the live reference room's core spans, the tower [2700, 3300] and remainder A 260. **Keep:** `packages/configurator-domain/tests/generation/tower-over-bottle.test.ts:140` | **D2-B deleted** — a kept test went red under a mutation |
| 174 | 900 x 4100 after S0b: hob-2drawer and the oven tower, with nothing bare | 1 | Same beforeS1 plan of 900 x 4100; the twin asserts the whole of wall B, of which these are the last two modules, and the same remainder 0. **Keep:** `packages/configurator-domain/tests/generation/tower-over-bottle.test.ts:153` | **D2-B deleted** — a kept test went red under a mutation |
| 198 | 900 x 4100 with S2, live: (c) — the dishwasher after the sink, the tower gone, the hob carrying the oven | 1 | Same live plan of 900 x 4100, the same five modules and spans and remainder 0; the twin's strings also carry each body's id and role. **Keep:** `packages/configurator-domain/tests/generation/tower-over-bottle.test.ts:226` | **D2-B deleted** — a kept test went red under a mutation |
| 421 | makes an M1 conversion -76 000 minor | 1 | 320 000 - 396 000 from the two amounts the it.each directly above pins to those literals. It cannot fail unless one of those rows has. **Keep:** `packages/configurator-domain/tests/generation/qa-7d5b-s0-pre-state-witnesses.test.ts:411` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/generation/qa-7d7-sized-shell.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 114 | returns a typed minimum failure, rather than throwing, for %o | 2 | BOUNDARY_ROOMS is [room(870, 870), room(871, 871)] at 2600 mm (qa-7d7-sized-shell.test.ts:26); the sweep's it.each generates room(wall, wall) for 870 and 871 with the same helper and the same three assertions. **Keep:** `packages/configurator-domain/tests/generation/qa-7d7-s3a-room-sweep.adversarial.test.ts:194` | **D2-B deleted** — a kept test went red under a mutation |
| 129 | still refuses an outside-engine wall at the shell boundary by its typed input error | 1 | room(869, 870) through buildLShellDesign, LShellInputError with ROOM_OUTSIDE_ENGINE_LIMITS, is the first row of the sweep's it.each, which adds the wall-B side. **Keep:** `packages/configurator-domain/tests/generation/qa-7d7-s3a-room-sweep.adversarial.test.ts:224` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/generation/shell-design.property.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 122 | has no validation finding of either severity (criterion 1) | 1 | adversarial :320-337 asserts findingsOf(shell, SHELL_CABINET_DEPTH_MM) is [] over the same approved-L arbitrary (200 runs) plus every edge room, with the same catalogue (SHELL_CATALOG is buildKitchenLBodyCatalog(SHELL_CABINET_DEPTH_MM), support/shell-design.ts:49). The property test's only extra is a ceiling-arm tally of its own generator. **Keep:** `packages/configurator-domain/tests/generation/shell-design.adversarial.test.ts:320` |
| 183 | records every tile against base-cabinet or wall-cabinet at that source's declared depth (criterion 8) | 1 | adversarial :355 checks the same two tile fields at every declared depth incl. the shell's own, after setCabinetDepth (which republishes the map even at the same depth). A wrong as-built depthMm/depthFromBuildId that the republish repaired would still go red at adversarial :339 (map after there-and-back must equal the as-built map byte for byte); one it preserved goes red at :355. Expected sources are the same test-local literals in both files (adversarial :93). **Keep:** `packages/configurator-domain/tests/generation/shell-design.adversarial.test.ts:355` |
| 220 | reports nothing past wall B's end after a change to any declared depth (criterion 9) | 1 | The candidate asserts two issue codes are absent after a move to each declared depth; adversarial :320-337 asserts no finding of any code as built, at every other declared depth, and back at the shell's depth, over the same arbitrary plus edge rooms. Strict subset. **Keep:** `packages/configurator-domain/tests/generation/shell-design.adversarial.test.ts:320` |
| 310 | keeps the run-end panel inside wall A when the corner alone closes the run (<width>) | 19 | adversarial :865 sweeps every wall A 900-2000 including the bare shell (closings[0]) and requires the panel hidden whenever less than the 19 mm footprint is free, which is stricter than 'absent or <= wall'. The only input difference is wall B (min vs 2000), which runEndPanelSeatM cannot read: it uses wallLengthMm('A', room) and wall-A records only (src/run-end-panel.ts:78-124). **Keep:** `packages/configurator-domain/tests/generation/shell-design.adversarial.test.ts:865` |

**`tests/generation/tall-end-rule.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 238 | HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID is still the block's own hob id | 1 | planTallEndBlock returns the constant itself (src/generation/tall-end-rule.ts:114), so the second expect compares a value with its source and the first is :76's assertion (plan.hobBuildId is 'base-hob-2drawer') read off the export instead of the plan. **Keep:** `packages/configurator-domain/tests/generation/tall-end-rule.test.ts:76` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/generation/u-composition.drawer-split.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 171 | named-room drawer-split rows: 3000/4500/4500, 5000/4000/3000, 6000/6000/6000 | 2 | 5000/4000/3000 and 6000/6000/6000 are strict subsets: witnesses :127-157 and :159-206 pin all three walls with roles, which fixes every count asserted. 3000/4500/4500 stays: its witness (:210-227) pins walls A and C only, so a drawer unit appearing on wall B changes the whole-plan count at drawer-split :175-176 while the witness and the sweep (4 cabinets -> 2 pan drawers is legal) stay green. **Keep:** `packages/configurator-domain/tests/generation/u-composition.witnesses.test.ts:127` | **D2-B part** — 2 of 3 deleted (kept witnesses red) |

**`tests/generation/u-composition.wall-a-remainder.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 244 | 2800 / 1600 / 1600: a 400 mm remainder takes a 400 mm door base (and 2900 / 1600 / 1600 at line 256) | 2 | Both rooms are on the 100 mm grid at 2600, so the grid digest (:100-105) pins their walls as buildId@start-end exactly, and the census pins 6 804 fills at 400 and 6 804 at 500, each flush at wall A's high end with remainder 0 (:174, :195-200). Same 300-599 arm as the 300 mm witness at :219; no boundary crossed. **Keep:** `packages/configurator-domain/tests/generation/u-composition.wall-a-remainder.test.ts:219` | **D2-B deleted** — a kept test went red under a mutation; the review's named Keep is wrong (it stays green): the guards are the census and the grid digest |

**`tests/legacy-finish-migration.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 121 | rescues a document wearing %s rather than refusing it | 5 | :89-104 migrates the same document per name and requires the finish to equal a specific Finish object (the declared palette entry or DEFAULT_FINISH), which already means not the stored string and, since paletteFinish takes a typed PaletteEntryId (src/materials.ts:128), schema-valid. The DEFAULT_FINISH line repeats materials.test.ts:53 five times. **Keep:** `packages/configurator-domain/tests/legacy-finish-migration.test.ts:89` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/millimetres.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 12 | refuses a value that is genuinely off the millimetre grid | 1 | toExactMillimetres(0.6005) toBeUndefined is the first line of millimetres.boundaries.test.ts:26, which adds -0.6005. **Keep:** `packages/configurator-domain/tests/millimetres.boundaries.test.ts:25` | **D2-B deleted** — a kept test went red under a mutation |
| 22 | rounds a measurement that never lands on a whole millimetre | 1 | toMillimetres(0.6005) toBe(601) is byte-for-byte millimetres.boundaries.test.ts:52. **Keep:** `packages/configurator-domain/tests/millimetres.boundaries.test.ts:51` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/module-grid.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 23 | never collides a wall-C key with wall A's or wall B's at the same along value (AC8) | 1 | The property at :32-43 draws both walls from all three and the same float range and requires equal keys iff equal walls, which is pairwise distinctness of the three keys; :17-21 pins the literal prefixes. No key function passes :32 and fails :23. **Keep:** `packages/configurator-domain/tests/module-grid.test.ts:32` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/hardware-tier-reconciliation.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 79 | counts 74 hinges, 5 drawers and 16 push-to-open | 1 | Same call on the same projection (SEEDED_ENTRIES is projectDesignForDisplay(KITCHEN_L_DESIGN) in both: reconciliation :24, hardware-mechanisms :42) with the same {74, 5, 16}. Keep the SEEDED_MECHANISM_COUNTS constant at :76; the later tests use it. **Keep:** `packages/configurator-domain/tests/hardware-mechanisms.test.ts:141` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/material-tiers.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 53 | fails when a material has no tier | 1 | Same throw branch of materialById (src/materials.ts:265-269) for an undeclared id; materials.test.ts:65-69 already requires UnknownMaterialError. The extras here are a message regex on a developer-facing error and a not.toContain on a made-up id. **Keep:** `packages/configurator-domain/tests/materials.test.ts:65` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/parse-price-book.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 499 | refuses rather than raising, at any list the book carries | 1 | :485-497 calls parsePriceBook uncaught through parseDetailOf (:467-470) over the same paths with the same raising proxy, so any raise this test would report already fails :485 as an uncaught error. **Keep:** `packages/configurator-domain/tests/pricing/parse-price-book.test.ts:485` | **D2-B kept, no signal** — the flagged test fails only if a raise escapes both the per-read guards and the backstop |

**`tests/pricing/price-design.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 204 | prices a 575 mm body, which no width row in any book covers | 1 | The next test loops widthMm 200..800 in 1 mm steps with the identical expression (wall-cabinet, height 700, expectedAmountFor), so 575 is one of its 601 iterations. **Keep:** `packages/configurator-domain/tests/pricing/price-design.test.ts:210` | **D2-B deleted** — a kept test went red under a mutation |
| 409 | lists wall A's hanging row before its top row (ADR 0063), not each column in turn | 1 | The twelve ids p8..p20 in this order are a contiguous run of the 26-id literal order at qa-6b2 :1007-1034, taken from the same seeded priceDesign call. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts:1002` | **D2-B deleted** — a kept test went red under a mutation |
| 446 | prices the same design identically however its placements are stored | 1 | qa-6b :585-603 ('over shuffles and not rotations') asserts the same cabinet-line order for random full permutations of the seeded placements, a superset of the 25 rotations; qa-6b2 :974 adds the reversal on the whole priced value. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b-pricing.adversarial.test.ts:585` | **D2-B deleted** — a kept test went red under a mutation |
| 980 | gains no price field on the design document | 1 | qa-6b :754-760 makes the same DesignSchema.safeParse refusal for totalMinor and for priceMinor and price as well. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b-pricing.adversarial.test.ts:754` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/qa-6b-pricing.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 356 | refuses a book whose currency is not the one every book is in | 1 | Same refusal (INVALID_PRICE_BOOK from a currency other than the book currency) asserted by the REFUSALS row at :641-644, :669-672 with 'USD'; 'EUR' reaches no other branch. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b-pricing.adversarial.test.ts:641` | **D2-B deleted** — a kept test went red under a mutation |
| 426 | gives the same total however the placements are stored | 1 | The cover is qa-6b2 :974-978 (the whole priced value, total included, equal for a reversed placements array), not the cited :215, together with qa-6b :459-463 (total equals the lines summed in reverse). A total that depended on stored order would fail those. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts:974` | **D2-B deleted** — a kept test went red under a mutation |
| 499 | prices a hinged wall cabinet from its coefficients at every width it can be built to | 1 | Random widths 200..800 for wall-cabinet at 700 against the same derivation (book coefficients plus widthDerivedDoorLeafCount, :523-533); price-design.test.ts:210-216 checks all 601 widths with expectedAmountFor, which is that formula (:168-189). **Keep:** `packages/configurator-domain/tests/pricing/price-design.test.ts:210` | **D2-B deleted** — a kept test went red under a mutation |
| 720 | does not let the overflow change the hardware quantity | 1 | :713 requires overflowing.lines toEqual fitting.lines, hardware line and its quantity included; the candidate differs only by selecting the premium tier, which no overflow code reads. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b-pricing.adversarial.test.ts:708` | **D2-B deleted** — a kept test went red under a mutation |
| 748 | exports the sample book itself, as an estimate whose amounts are provisional | 1 | BOOK.status 'estimate' and amountsProvisional true are pinned at pricing-seams :480-482 (and price-design.test.ts:954); the priced status is carried per price-design.test.ts:941-946 and qa-6b2 :936-940. **Keep:** `packages/configurator-domain/tests/pricing/pricing-seams.test.ts:478` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 387 | never publishes a line or a total that is not an exact integer, on the shipped book | 1 | Same per-line checks as qa-6b :445-464. The default-tier lines it adds are pinned as exact integers elsewhere (hardware-tier-reconciliation :106-123, qa-6b2-tier-amounts :261-266 and :283) and a safe-integer total at price-design.test.ts:932. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b-pricing.adversarial.test.ts:445` | **D2-B deleted** — a kept test went red under a mutation |
| 645 | finds the height-flexible population wider than the two rows the owner named | 1 | HEIGHT_FLEX_ROWS is INSERTABLE_BODY_DEFINITIONS filtered on heightFlex === true (qa-6b2 :178-188), the same expression pricing-seams :229-234 holds to exactly ['wall-cabinet','wall-lift','open-shelf']; contains-three and length >= 3 follow. **Keep:** `packages/configurator-domain/tests/pricing/pricing-seams.test.ts:228` | **D2-B deleted** — a kept test went red under a mutation |
| 731 | finds every row whose door count follows its width priced by a shape that steps | 1 | The row list and its shape are held exactly at pricing-seams :242-250. The positive coefficient is not implied by :760 as the reader said (that equality holds at zero) but by :741-758, where the real book must price above a book with perDoorLeafMinor 0. Confirmed only while the :741 group (s28.33) stays. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts:741` | **D2-B deleted** — a kept test went red under a mutation |
| 926 | carries the book's status and provisional flag into the priced result | 1 | Status and pricingVersion carry-through are price-design.test.ts:941-946 (which also pins currency); the book literals are pricing-seams :480-482; :936-940 just below proves the carry for both status values. **Keep:** `packages/configurator-domain/tests/pricing/price-design.test.ts:941` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/qa-6b2-tier-amounts.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 253 | never publishes a zero material line for an amount that was never declared | 1 | MALFORMED_AMOUNTS holds ['null', null] (:62) and :207-218 runs it through the same bookWithMaterialAmount, requiring INVALID_AMOUNT, the field name and the rule id, which is stronger than result.ok === false. **Keep:** `packages/configurator-domain/tests/pricing/qa-6b2-tier-amounts.adversarial.test.ts:207` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/qa-6t-hardware-basis.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 210 | puts the only third hinges in the kitchen on the pantry's two 1290 mm leaves | 1 | The census row ['p6', 10, 0, 0] (:168) asserts the pantry's 10 hinges through the same mechanismsIn(designOf([placement])); the 64 for the rest is the other rows' sum, which :189-205 ties to the whole design. **Keep:** `packages/configurator-domain/tests/pricing/qa-6t-hardware-basis.adversarial.test.ts:173` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/qa-6t2-sink-extras.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 211 | publishes no accessory line for a kitchen holding no sink | 1 | Identical placement (base-drawer3-600 on wall A at 1300, 600 x 820; sink-extras.test.ts:90-95) and identical assertion, accessoryLinesOf(...) toEqual [], with the same filter on kind (:50-54 vs qa-6t2 :54-58). **Keep:** `packages/configurator-domain/tests/pricing/sink-extras.test.ts:150` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/qa-m6-wave-b-parse-boundary.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 444 | answers the exact integer sum for the widest shape, over a swept range of coefficients | 1 | regate :452-494 uses the same arbitraries, the same PROPERTY_SEED (20_260_907 in both files, :54) and the same BigInt oracle, and checks all four shapes including pricedByWidthHeightAndDoorLeaves; the candidate is that one shape with more runs. **Keep:** `packages/configurator-domain/tests/pricing/qa-m6-wave-b-regate.adversarial.test.ts:463` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/qa-m6-wave-b-regate.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 584 | keeps every partial sum a book at the bound can form inside the exact range | 1 | 4 x MAX_PRICE_COEFFICIENT_MINOR x MAX_DESIGN_DIMENSION_MM <= MAX_SAFE_INTEGER with a literal 4 and no production call; parse-boundary :388-400 asserts it with the 4 derived from the constructors, so it fails whenever this does. **Keep:** `packages/configurator-domain/tests/pricing/qa-m6-wave-b-parse-boundary.adversarial.test.ts:388` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/pricing/sink-extras.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 186 | publishes neither line for a kitchen with no sink | 1 | Same design (NO_SINK_AT_ALL) and same claim as :150-154: 'no line of kind accessory' is accessoryLinesOf(...) toEqual [] spelled the other way (:50-54). **Keep:** `packages/configurator-domain/tests/pricing/sink-extras.test.ts:150` | **D2-B deleted** — a kept test went red under a mutation |

**`tests/project-empty-columns.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 157 | refuses rather than emitting two entries that share one restored key | 1 | Both columns carry non-whole-mm centres, so toEmptyColumn throws in exactMillimetresOf (src/void-engine.ts, 'is not a whole millimetre') on the first one; no key-sharing path runs. Every rounding/tolerance mutant I tried (round, ceil, 0.2 mm tolerance) also reddens :143, which stops throwing. The only unique content is the message regex. **Keep:** `packages/configurator-domain/tests/project-empty-columns.test.ts:143` |

**`tests/qa-0099-global-colour.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 268 | is a distinction countCabinetsWearingAChosenFinish deliberately cannot see | 1 | countCabinetsWearingAChosenFinish (src/chosen-finishes.ts:39) returns 0 for an override equal to the kitchen colour at :684 (two cabinets wearing PAL_ANTRACIT under a PAL_ANTRACIT kitchen, non-default per :675) and wouldDiscardTheGlobalFinish(.., VENEER) is true at :688. :268 repeats both on pal.gri-havanna with one cabinet; the extra `following` arm is the `finish === undefined` early return. No branch differs. **Keep:** `packages/configurator-domain/tests/qa-0099-global-colour.adversarial.test.ts:684` |

**`tests/qa-5b2a.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 613 | answers a body and a space standing in the same place the same way | 1 | The property cases at :531 and :571 pin example [1] (endMm = WALL_RUN_MM + 1) with the identical strip and SINK fixtures and expect exactly ['EMPTY_COLUMN_PAST_WALL_END'] and ['PLACEMENT_PAST_WALL_END']. :613 asserts those same two arrays (lines 625-626) and never compares the two answers to each other. **Keep:** `packages/configurator-domain/tests/qa-5b2a.adversarial.test.ts:531` |

**`tests/qa-6a4.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 278 | bites: the same sweep the wave runs fails on a misspelt kind | 1 | The mutated half runs isKnownKind over a catalogue the test misspelt itself, which :253 already asserts (isKnownKind(typo) false). The unmutated half is the seeded-kind sweep at tests/fixtures/wall-corner-return-kinds.test.ts:139-141 restated. It exercises the test's own predicate, not a production branch. **Keep:** `packages/configurator-domain/tests/qa-6a4.adversarial.test.ts:236` |

**`tests/qa-6k-c-frozen-source.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 375 | holds every identifier length the schema admits | 1 | entryBytes grows by exactly one byte per added 'x', so only the last iteration (length MAX_IDENTIFIER_LENGTH) can overflow, and that entry is LONGEST_LEGAL_ENTRY asserted at :333. There is no transition to find. Only incidental extra: it would throw if identifierSchema gained a minimum length above 1. **Keep:** `packages/configurator-domain/tests/qa-6k-c-frozen-source.adversarial.test.ts:333` |

**`tests/qa-6n-a-run-end-panel.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 202 | hides the panel behind a column exactly the panel's own height / one millimetre taller than it | 2 | The sweep at :231 builds columnFromTheFloor(h/1000) for every h in 1..1640 and expects the seat blocked; 820 (the panel height) and 821 are two of its iterations with the same helper and expectation, and its failure output lists the offending heights. The tolerance boundaries are the separate cases at :214 and :222. **Keep:** `packages/configurator-domain/tests/qa-6n-a-run-end-panel.adversarial.test.ts:231` |
| 301 | seats the panel on a lone base placement | 1 | The next case builds the identical soleBase (leftEdge 1, width 0.6, SEEDED_ROOM) and asserts the identical line, runEndPanelSeatM([soleBase], SEEDED_ROOM) toBe 1.6 + RUN_END_PANEL_EDGE_OFFSET_M, as its non-vacuity precondition (:339-341). The property at :269 covers the general rule. **Keep:** `packages/configurator-domain/tests/qa-6n-a-run-end-panel.adversarial.test.ts:320` |

**`tests/qa-6q-a-offer.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 235 | never offers a free colour to a material that declares any entry at all | 1 | Same calls on a subset of :159's (material, colour) pairs with the same expected false: the materials with entries are exactly the decor-list and wood-swatches ones, and a ral-picker control has no entries field (:277). The shape-versus-entry-count distinction is carried by the synthetics from :252 on. **Keep:** `packages/configurator-domain/tests/qa-6q-a-offer.adversarial.test.ts:159` |

**`tests/qa-6q-b-command.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 410 | into %s, no width, seat depth, position or extent moves | 3 | neutralisedDocument (:334) spreads the whole design and masks only updatedAt, settings.materialTierId and body.finish, so :373's toEqual already covers every field listed here (placement id/wall/alongMm/y0Mm/width/height/seatDepth/buildId, emptyColumns, columnExtents, room, createdAt). The case calls itself 'a second reading of the same claim'. **Keep:** `packages/configurator-domain/tests/qa-6q-b-command.adversarial.test.ts:373` |

**`tests/qa-6t-a-push-to-open.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 354 | declares a cabinet handle on every row that declares something that opens | 1 | Filter `openingFronts > 0 && cabinetHandles === 0` is :347's `cabinetHandles === 0 && openingFronts > 0` with the operands swapped, over the same EVERY_ROW_AT_EVERY_LEGAL_SIZE, expecting []. The 'contrapositive' is the same set. **Keep:** `packages/configurator-domain/tests/qa-6t-a-push-to-open.adversarial.test.ts:346` |

**`tests/qa-7d6-corner-literal-sweep-scope.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 65 | finds nothing under src/%s that the shipped one-level sweep would skip | 2 | The recursive and one-level listings can differ only when a subdirectory holds a .ts file, and :74 asserts the stronger fact that src/generation and src/room have no subdirectory at all. Anything that reddens :65 reddens :74. **Keep:** `packages/configurator-domain/tests/qa-7d6-corner-literal-sweep-scope.adversarial.test.ts:74` |

**`tests/qa-8h-design-identifiers.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 104 | refuses a revision with anything before or after it | 1 | :88 tries every UTF-16 unit before '7' and :96 every unit after it, expecting only digits to pass; this repeats that with '42' for the non-digit units. Every leniency I tried (trim, Number(), a dropped anchor, an optional sign) is caught by :88 or :96 first; unlike the design-id case, the swept position here is the prefix/suffix itself. **Keep:** `packages/configurator-domain/tests/qa-8h-design-identifiers.adversarial.test.ts:88` |

**`tests/qa-room-migration.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 181 | still loads from wall B after wave 6A3 | 1 | The it.each at :194 loads the same EDITED_PAST_WALL_B at versions 1 and 2 and asserts the room, the placements and the overflow id, so any throw fails it. :181 is the version-2 arm with only not.toThrow. **Keep:** `packages/configurator-domain/tests/qa-room-migration.adversarial.test.ts:194` |
| 241 | names only the body the customer moved on a whole seeded row at version %i | 2 | Same document (seeded row, pre-correction room, one 800 mm wall-B body centred at 3200), same versions [1,2], same findOverflowingPlacementIds toStrictEqual ['edited'] as qa-6a3:166. Its fixture at :227 is used by nothing else in this file. Delete this copy only; s30.2 is the one to keep. **Keep:** `packages/configurator-domain/tests/qa-6a3.adversarial.test.ts:166` |

**`tests/queries/describe-selection.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 236 | never offers 1000 mm anywhere in the kitchen | 1 | width-resolution :463 collects the same meta.sizesMm over every seeded record plus every catalogue sizesMm and asserts the exact list 200..800 (and `has(1000)` false). The candidate's set is a subset of that one with a weaker assertion. **Keep:** `packages/configurator-domain/tests/queries/width-resolution.adversarial.test.ts:463` |
| 269 | gives an empty set when the declared equivalent is not in the catalogue | 1 | Identical edit (wall-2door-600 pointed at 'no-such-entry'), placement (p8), entry point (describeSelection) and assertions (sizesMm [], canWidth true) as width-resolution :510. **Keep:** `packages/configurator-domain/tests/queries/width-resolution.adversarial.test.ts:510` |
| 302 | applies the equivalent's own width floor to the equivalent's own set | 1 | Same edit (wall-cabinet minWidthMm 700), same placement p8 through describeSelection, same expected [700, 750, 800] as width-resolution :269. **Keep:** `packages/configurator-domain/tests/queries/width-resolution.adversarial.test.ts:269` |
| 332 | is true for a movable-width body even when the catalogue gives it no widths | 1 | Same broken pointer on wall-2door-600 and same p8 answers (canWidth true, sizesMm []) as width-resolution :510, and as s31.14 in this file. The extra fixedWidth:false is the fixture's own value, tied to canWidth for every seeded body at width-resolution :482. **Keep:** `packages/configurator-domain/tests/queries/width-resolution.adversarial.test.ts:510` |
| 371 | is false for every fixed-width body | 1 | describe-selection.qa :34 asserts canWidth === !record.fixedWidth for every seeded record with both populations required non-empty (width-resolution :482 repeats it). This is the fixed half of that equality over the same world. **Keep:** `packages/configurator-domain/tests/queries/describe-selection.qa.test.ts:34` |
| 396 | carries no finish or handle until one is chosen | 1 | describe-selection.qa :179 asserts finish and handle undefined on every untouched seeded body through the same describeSelection call; p0 is one of them. **Keep:** `packages/configurator-domain/tests/queries/describe-selection.qa.test.ts:179` |

**`tests/queries/design-projection.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 175 | orders two placements the same way whichever side they arrive on | 1 | The adversarial property asserts the same strict two-way comparison (plus reflexivity) over generated documents that collide on every key, which the seeded fixture never does. On the seeded design a comparator returning 0 or an inconsistent sign for a pair already breaks the permutation-invariance property at :165 in the same describe. **Keep:** `packages/configurator-domain/tests/queries/design-projection.adversarial.test.ts:352` |

**`tests/queries/hob-base.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 211 | does not let the hob body lift §7's head-clearance cap | 1 | after.columns.get(HOB_COLUMN)?.hasFullHeightUnder toBe(false) is asserted verbatim at :202 on the same `after`; :211 is that line alone. **Keep:** `packages/configurator-domain/tests/queries/hob-base.adversarial.test.ts:193` |

**`tests/queries/offers.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 115 | offers nothing that the insert command would then refuse / refuses everything it leaves out, at every height in the column | 1 | Keep :115: it requires a non-empty offer list at each of the three heights, so a shared fit regression that refuses everything in the B\|2.45 top slot at both ends reddens it while affordance-gates stays consistent and green. :133 (the converse) adds no per-slot claim and is contained in affordance-gates' 'refuses every entry it left out' over a world clearing p7, p24 and p2 (p2 is on wall A at 2600). **Keep:** `packages/configurator-domain/tests/queries/offers.test.ts:115` |

**`tests/queries/pantry-resizable.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 81 | accepts %s mm: %s | 6 | The sweep at :196 calls acceptsWidthMm(insertableOf(PANTRY_ID), w) for every w in 200..900 expecting `w >= 400 && w <= 800`, which contains 399, 400, 499, 500, 800 and 801 with the same expected values and names the failing width. **Keep:** `packages/configurator-domain/tests/queries/pantry-resizable.test.ts:196` |

**`tests/queries/qa-6t2-rack-host.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 112 | hangs a wall-B sink's rack in the wall-B cabinet above it / does not hang a wall-B sink's rack in a wall-A cabinet at the same coordinate | 2 | The it.each at :133 has the rows ['B','B','host'] and ['B','A',undefined] with the same sinkOn(wall) and the same wall-2door-800 host at 1300/1500/800/700; the two named cases differ only in the host's id string. **Keep:** `packages/configurator-domain/tests/queries/qa-6t2-rack-host.adversarial.test.ts:133` |
| 262 | resolves the one the projection orders first, whichever way the array holds them | 1 | The property at :275 shuffles the same three placements (sink, aaa-twin, zzz-twin) through all six orders and expects 'aaa-twin'; the two orders here are among them. Sampled rather than enumerated, but six permutations over the default run count leaves no realistic gap. **Keep:** `packages/configurator-domain/tests/queries/qa-6t2-rack-host.adversarial.test.ts:275` |

**`tests/queries/sink-accessories.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 72 | finds the seeded kitchen's one sink and no other body | 1 | :117 makes the same findSinkAccessories call on the seeded design and asserts toEqual([{ sinkPlacementId: 'p0', rackHostPlacementId: 'p11' }]), which fixes both the single record and its sink id. **Keep:** `packages/configurator-domain/tests/queries/sink-accessories.test.ts:117` |
| 228 | finds no host in a cabinet that begins exactly where the sink ends / ends exactly where the sink begins / overlapping by a single millimetre | 3 | Centres 2000, 600 and 1999 for a 600 mm wall-2door-600 at y0 1500 over the 900-1700 sink are FIRST_TOUCHING_MM (600), LAST_TOUCHING_MM (2000) and LAST_TOUCHING_MM - 1 in qa-6t2 :233, same build id and sink, plus the swept property at :216. 'A sink with no host is still listed' stays covered by :272. **Keep:** `packages/configurator-domain/tests/queries/qa-6t2-rack-host.adversarial.test.ts:233` |
| 314 | does not hang a rack on the other wall, whatever its along-wall coordinate | 1 | Same fixture to the millimetre (sink base-sink-800 at 1300/0/800/820 on A; wall-2door-800 on B at 1300/1500/800/700) through the same projectDesignForDisplay + findSinkAccessories path; the it.each row [A,B,undefined] asserts one sink with no host. Dropping the wall clause at sink-accessories.ts:121 reddens both; no change reddens only this one. **Keep:** `packages/configurator-domain/tests/queries/qa-6t2-rack-host.adversarial.test.ts:133` |

**`tests/queries/vacated-void.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 53 | gives the boundary to the slot above it, not to the one that ends there | 1 | The sweep at adversarial :119 builds an ends-here/starts-here pair at every LEVELS boundary including 2.2 (lower slot y0 2.2-0.7, h 0.7, top computes to exactly 2.2, the same float as 1.5+0.7) with the lower slot first in the array, and asserts the starting slot wins. Restoring FIT_TOLERANCE_M at the top bound of vacated-void.ts:41 reddens both; the candidate's only extra is the spec-shaped ids. **Keep:** `packages/configurator-domain/tests/queries/vacated-void.adversarial.test.ts:119` |

**`tests/queries/width-options.qa.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 137 | never calls a width available that the command refuses | 1 | Identical world (clearBodies(kitchen(), p1/p12/p18)), identical loop skipping current and fixed, identical comparison of chip status with setWidth(...).ok; helpers optionsFor/commandAccepts are textually the same in both files. width-options.test.ts:109 additionally maps the status to exactly available/refused and guards compared > 20, so it is the stronger of the pair. **Keep:** `packages/configurator-domain/tests/queries/width-options.test.ts:109` |
| 360 | still publishes nothing for a fixedWidth body whose floor empties its set | 1 | qa-5b5 row 'the resolved entry's floor is above the only width it lists' applies minWidthMm 900 to base-hob-2drawer on KITCHEN_L_DESIGN and asserts optionsFor(world,'p2') toEqual [] plus columnWidthChoices and widthStepsFor undefined and the fixedWidth flag still true; the 550-650 sweep at :126 also brackets the edge. Strict subset. **Keep:** `packages/configurator-domain/tests/queries/qa-5b5-fixed-width.adversarial.test.ts:103` |
| 370 | publishes the chip for the same body when the floor is left alone | 1 | expect(optionsFor(kitchen(),'p2')).toHaveLength(1) on the unedited shipped kitchen is asserted verbatim at qa-5b5 :120 and again at :217. It is only a non-vacuity anchor for s31.45; if that case goes, this goes with it. **Keep:** `packages/configurator-domain/tests/queries/qa-5b5-fixed-width.adversarial.test.ts:120` |

**`tests/queries/width-options.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 365 | returns nothing for a target that no longer resolves | 1 | The qa it.each runs optionsFor(kitchen(), id) toEqual [] for ['', 'p8 ', 'P8', 'no-such-placement']; the candidate is the fourth row exactly, same helper, same world. **Keep:** `packages/configurator-domain/tests/queries/width-options.qa.test.ts:382` |
| 382 | carries the command's own refusal, code and parameters alike | 1 | qa :422 walks every record of the same shipped kitchen (p8 included), re-runs setWidth for every refused chip and compares the whole reason (code and params), pinning 86 refusals; the candidate compares code and params for p8's first refused chip only. Strict subset. **Keep:** `packages/configurator-domain/tests/queries/width-options.qa.test.ts:422` |

**`tests/queries/width-resolution.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 139 | treats an empty-string pointer... / terminates on a self-referential pointer / terminates on a two-row cycle | 3 | resolveCatalogEquivalent (catalog.ts:948-960) is one hop: catalog.get(pointer) then insertable !== true returns undefined. '' misses the map exactly as 'no-such-entry' does (:127); a self pointer and a two-row cycle land on a non-insertable row exactly as :164 does. Any implementation that starts following pointers (recursion or loop) already reddens :164, because wall-2door-800 carries catalogEquivalentId 'wall-cabinet' (kitchen-l-design.ts:472-481) and would yield a set. No change found that reddens only these three. **Keep:** `packages/configurator-domain/tests/queries/width-resolution.adversarial.test.ts:127 and :164` |
| 482 | is the negation of fixedWidth and nothing else, over the whole population | 1 | Same seeded world, same loop, same expect([id, canWidth]) toEqual [id, !record.fixedWidth] through describeSelection; the qa twin adds both-answers-present and the willing count. Strict subset. **Keep:** `packages/configurator-domain/tests/queries/describe-selection.qa.test.ts:34` |

**`tests/resolved-finish.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 378 | carries no finish and therefore renders the global colour, not the material's default | 1 | Same call as :94: a placementWearing(0, undefined) on a melamine design with global PAL_GRI, resolvedFinishOf toEqual PAL_GRI. The extra not.toEqual(material default) is implied by the equality (PAL_GRI differs from the default or the line could not pass). insertBody is never called, so ADR 0099 acceptance 4 is modelled, not exercised. **Keep:** `packages/configurator-domain/tests/resolved-finish.test.ts:94` |

**`tests/room/corner-direction.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 118 | answers left for a straight room with no cornerDirection key | 1 | cornerDirectionOf (corner-direction.ts:34-37) returns 'left' for an absent key on either side of the carries guard, so this input cannot tell the guard from its absence; the stored-key rows at :129 are what exercise the linear arm and the absent-key default is pinned on the L just above. No change found that reddens only this case. **Keep:** `packages/configurator-domain/tests/room/corner-direction.test.ts:129` |
| 148 | answers left for a U with no cornerDirection key | 1 | Absent key on a U answers 'left' with or without the guard. Adding U to SHAPES_WITH_A_CHOSEN_DIRECTION leaves this green and reddens only carries-corner-direction.test.ts:60-75 (carriesCornerDirection('U') false; right-hand U reads left). **Keep:** `packages/configurator-domain/tests/room/carries-corner-direction.test.ts:72` |
| 160 | answers left for a U even if a stored document carries left explicitly | 1 | An explicit 'left' on a U returns 'left' through either arm of corner-direction.ts:35-36; no line of the function can be changed to redden this without also reddening the L 'reads an explicit left' row or the right-hand-U case. **Keep:** `packages/configurator-domain/tests/room/carries-corner-direction.test.ts:72` |

**`tests/room/is-shape-buildable.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 84 | is already buildable for linear, under the real approved policy, with no cast | 1 | isShapeBuildable('linear', APPROVED_ROOM_POLICY) === true is asserted by :52 (buildable shapes toEqual the hand-written ['linear','L','U']) and by the it.each at :62. The 'with no cast' in the title is wave history, not a behaviour. **Keep:** `packages/configurator-domain/tests/room/is-shape-buildable.test.ts:52` |

**`tests/room/minimum-kitchen.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 38 | refuses %i × %i with the exact room-level issue / accepts %i × %i at the matching one-millimetre boundary | 7 | Six of the seven pairs (900x2199, 2099x1000, 1500x1599 refused; 900x2200, 2100x1000, 1500x1600 accepted) are rows of qa-7a3 'judges %s' with the same toStrictEqual refusal or accepted room under APPROVED_ROOM_POLICY, through the same validateRoomInput. 900x2160 is refused in adversarial :227 at both directions and both height edges; its exact issue shape is the one qa-7a3 pins on its neighbours. Only the height literal differs. **Keep:** `packages/configurator-domain/tests/room/qa-7a3-the-6000mm-boundaries.adversarial.test.ts:165 and packages/configurator-domain/tests/room/minimum-kitchen.adversarial.test.ts:227` |

**`tests/room/qa-7i-corner-direction.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 178 | does not move MAX_DESIGN_BYTES beyond qa-5h's pinned value | 1 | expect(MAX_DESIGN_BYTES).toBe(523_972) appears verbatim at design-bounds.test.ts:50 and qa-5h.adversarial.test.ts:569; this third copy exercises nothing about cornerDirection and its own title defers to qa-5h. **Keep:** `packages/configurator-domain/tests/design-bounds.test.ts:50` |

**`tests/room/qa-7j-straight-room.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 98 | holds one maximum for every wall of every approved shape (Q-7J-1) | 1 | approved-room-policy.test.ts:257-272 collects the same L and linear wall maxima plus the U's three and asserts the Set equals {6000}; this is the same read with three fewer walls. Strict subset. **Keep:** `packages/configurator-domain/tests/room/approved-room-policy.test.ts:257` |
| 111 | sits inside the engine's own straight wall | 1 | The it.each at :288 runs expectHeldInsideEngine (:131-146) for the field named 'linear wall A' (:95): approved.minMm >= engine.minMm and approved.maxMm <= engine.maxMm, the two assertions here, plus min < max. **Keep:** `packages/configurator-domain/tests/room/approved-room-policy.test.ts:288` |

**`tests/room/u-minimum-kitchen.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 44 | %s: wall A 2999 is refused and 3000 accepted / A %i, B 6000: wall C 1599 is refused and 1600 accepted / reads the narrower side wall as the far wall | 5 | Every refusal and acceptance here is a row of H3_PAIRS (2999/3000 at B=C=1000 and 1599; C 1599/1600 at A 2999 and 2700 with B 6000; the B/C mirror at 2999) asserted with the same strict TOO_SMALL or .ok through validateRoomInput under APPROVED_ROOM_POLICY at the same 2600 height. The one room not literally in the table, 2999/1600/1600 accepted, is dominated by the table's 2700/1600/1600 accepted. **Keep:** `packages/configurator-domain/tests/room/qa-m7b-u6-switch.adversarial.test.ts:163` |
| 76 | returns the refusal on the room-level field with no number, as the L does | 1 | 2999/1000/1000 is H3_PAIRS' first row, asserted toStrictEqual the room-level TOO_SMALL object; strict equality to an object holding no digit already implies the JSON no-digit check, which approved-u-bounds.test.ts:83 also makes on 2700/1000/1000. **Keep:** `packages/configurator-domain/tests/room/qa-m7b-u6-switch.adversarial.test.ts:163` |
| 83 | judges a field before the kitchen: a wall below its bound is that wall's issue alone | 1 | Identical input (2699/1000/1000, height 2600, approved policy) and identical toStrictEqual lone wallA WALL_TOO_SHORT as u6 :202. **Keep:** `packages/configurator-domain/tests/room/qa-m7b-u6-switch.adversarial.test.ts:202` |
| 105 | states the U under the approved policy, whose gate is the one every pair above ran under | 1 | isShapeBuildable('U', APPROVED) true is is-shape-buildable.test.ts:80; uWallBoundsOf(APPROVED).minimumKitchen.isRequired true is approved-room-policy.test.ts:246-252 and the full pin at :235. Two restated facts, no new one. **Keep:** `packages/configurator-domain/tests/room/approved-room-policy.test.ts:246` |

**`tests/room/validate-room.property.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 293 | is a room DesignRoomSchema parses unchanged | 1 | The test at :304 draws oneof(validLRoomInput, anyLRoomInput) and for every accepted room asserts DesignRoomSchema.parse(result.room) toStrictEqual result.room (:321), plus the exact room; half its draws are this test's arbitrary. Superset, same policy default. **Keep:** `packages/configurator-domain/tests/room/validate-room.property.test.ts:304` |

**`tests/room/validate-room.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 62 | refuses a U as its shape alone under a policy that states no U bounds | 1 | Same policy construction (ENGINE_ROOM_LIMITS with only L) and same SHAPE_ALONE result as the property, whose anyURoomInput draws undefined, integers and doubles per field; any change that judges a U's fields before its shape reddens the property on essentially every draw. **Keep:** `packages/configurator-domain/tests/room/validate-room.property.test.ts:203` |
| 130 | refuses a straight kitchen as its shape alone under a policy that states no linear bounds | 1 | As s32.25 for linear: identical policy and expected SHAPE_NOT_BUILDABLE; anyLinearRoomInput includes the all-undefined input class this example uses. **Keep:** `packages/configurator-domain/tests/room/validate-room.property.test.ts:187` |
| 280 | hands the fit gate back the walls that were entered | 1 | The property asserts wallLengthMm('A'/'B', acceptedRoom(input)) equals the entered walls for every draw of validLRoomInput (bounds-inclusive integers), plus height and shape; the example is one point of it and a mapping bug fails on every draw. **Keep:** `packages/configurator-domain/tests/room/validate-room.property.test.ts:279` |
| 326 | hands the fit gate back the wall A that was entered, and a wall B of 0 (D4) | 1 | The property at :390 asserts wall A as entered and wall B === 0 for every valid linear draw; the example is one point of it. **Keep:** `packages/configurator-domain/tests/room/validate-room.property.test.ts:390` |

**`tests/run-end-panel.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 88 | seats the seeded panel on M1's parity number | 1 | runEndPanelSeatM(SEEDED_RECORDS, SEEDED_ROOM) toBeCloseTo(3.51, 9) is repeated at :198, which also asserts equality with the independently transcribed shipped rule; same call, same records, same room. **Keep:** `packages/configurator-domain/tests/run-end-panel.test.ts:194` |

**`tests/validate-design.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 346 | is a refusal and not a mark, which ADR 0069 decision 2 leaves no discretion about | 1 | FATAL_VALIDATION_CODES and MARK_VALIDATION_CODES are both derived in the test from DESIGN_ISSUE_SEVERITY_BY_CODE (:39-40), whose values are typed 'mark' \| 'refusal'. :479 pins the mark set to exactly four named codes, so PLACEMENT_WEARS_UNOFFERED_FINISH becoming a mark already reddens it. **Keep:** `packages/configurator-domain/tests/validate-design.test.ts:479` |
| 490 | keeps all three before-wall-start codes fatal | 1 | Same reasoning as s33.5: with a two-valued, type-enforced severity and the mark set pinned to exactly four codes at :479, any of the three before-wall-start codes becoming a mark reddens :479. **Keep:** `packages/configurator-domain/tests/validate-design.test.ts:479` |

**`tests/void-engine-span-overlap.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 81 | reads an exact abutment as no overlap and a 1 mm overlap as one, unequal widths, either order (wall %s) | 4 | The seam property at :50 runs 500 draws over every wall with offsets -1/0/+1 on either side and widths 50-1200, each draw a full abut-or-overlap check; the 700/600 example is one point of it and the centre-as-start defect fails it on almost every draw. The narrow-over-wide example at :118 is likewise one draw class of the 1000-run oracle property at :36. **Keep:** `packages/configurator-domain/tests/void-engine-span-overlap.test.ts:36 and :50` |

**`tests/void-engine.corner-record.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 159 | over the approved L | 1 | Same helper and builder as :137 over a room box contained in the engine's L box, with a strictly weaker assertion (no toContain('left')). derivePlacementRecords has no policy-dependent branch for the approved sub-box to reach. **Keep:** `packages/configurator-domain/tests/void-engine.corner-record.test.ts:137` |

**`tests/void-engine.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 446 | subdivides by module lines, not the column's original member history | 1 | Byte-identical fixture to :428 (regions [0,1.85],[1.85,2.6], top 2.6, no bodies). :428 asserts the exact [y0, y0+h] pairs with toEqual, which fixes count and heights; this re-asserts length 3 and the heights by toBeCloseTo. **Keep:** `packages/configurator-domain/tests/void-engine.test.ts:428` |

**`tests/worktop-depth.qa.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 149 | puts the shipped worktop's row on the depth the reference room builds | 1 | wallDepthMmForWorktop(600) toBe 330 is the first DECLARED_ROWS row at worktop-depth.test.ts:43 and is asserted again at worktop-depth.qa.test.ts:225; here only the name of the literal differs. **Keep:** `packages/configurator-domain/tests/worktop-depth.test.ts:43` |

**`tests/worktop-depth.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 58 | refuses %p rather than interpolating, rounding or defaulting / names the value it was given, so the refusal is diagnosable | 7 | All six inputs (650, 800, 0, -600, 599.9, NaN) are rows of the qa sweep at :182, which asserts instanceOf UnknownWorktopDepthError, the '<input> mm' text (so '650 mm') and the declared rows, and adds -0, 600.0000001, both infinities and MAX_SAFE_INTEGER. Strict subset. **Keep:** `packages/configurator-domain/tests/worktop-depth.qa.test.ts:182` |
| 107 | moves both numbers to 330 at the shipped worktop, and neither to 400 | 1 | expectedWallDepthMm is wallDepthMmForWorktop(WORKTOP_DEPTH_MM) with 600 pinned at :51 and 600->330 at :43; the three nominal depths equal it at :84; columnBuildDepthMm equals it at :94, which implies not 400. Every assertion here is the conjunction of those. **Keep:** `packages/configurator-domain/tests/worktop-depth.test.ts:84` |

#### `packages/persistence` — 25 entries, 43 cases

**`tests/connection-url-sites.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 139 | names DATABASE_URL when the value was read from it, and no variable when the caller handed the value in | 3 | The case stubs DATABASE_URL to the first REFUSED_VALUE per runtime site and asserts variableName === 'DATABASE_URL', which :73-84 asserts for every refused value at every site along with the error class and markers. The 'handed in' half of the title is asserted only by the describe at :152. **Keep:** `packages/persistence/tests/connection-url-sites.test.ts:73` | **P1 deleted** — a kept test went red under a mutation |

**`tests/design-row-source.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 128 | exports a hash, never a token a leaked backup could be replayed with | 1 | Both mint with the same 'e' x 64 hash through mintTrackingId; :117 asserts the exported write_token_hash toBe that exact string, which implies the /^[0-9a-f]{64}$/ match here. No raw token exists in this test for 'never a token' to be about. **Keep:** `packages/persistence/tests/design-row-source.test.ts:117` | **P1 deleted** — a kept test went red under a mutation |

**`tests/generate-design-id-shape.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 18 | is held to a predicate that refuses an id one character off | 1 | Both assertions are about the domain's isDesignId on a 20- and a 22-character string; design-identifiers.test.ts refuses exactly 'twenty characters' and 'twenty-two characters' (plus five more shapes) against the same regex at repository.ts:9. generateDesignId only supplies the input. **Keep:** `packages/configurator-domain/tests/design-identifiers.test.ts:24` | **P1 not done** — settling it needs a mutation outside the wave's limits (another package, a migration, or different DML) |

**`tests/migration-status.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 292 | treats only level as deployable | 1 | The two reports here (absent ledger; present ledger with nothing applied) are the 'outside-the-ledger' and 'behind' entries of the adversarial map at :264, which also covers diverged and columns-missing through the same describeDeployedSchemaStatus and isDeployedSchemaLevel (migration-status.ts:115). Strict subset. **Keep:** `packages/persistence/tests/migration-status.adversarial.test.ts:264` | **P1 deleted** — a kept test went red under a mutation |

**`tests/migration-target.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 254 | names the environment that claims a mismatched, ad-hoc-labelled database | 1 | Same call (environment and databaseName both 'lemn-conf-v2') and same assertion toThrow(/production/) as :117; both reach refuseUnlistedMismatch's claimedBy arm (migration-target.ts:161). No input or assertion differs. **Keep:** `packages/persistence/tests/migration-target.test.ts:117` | **P1 deleted** — a kept test went red under a mutation |

**`tests/neon-configuration-repository.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 273 | still mints on a real digest, so the guard rejects nothing legitimate | 1 | Mints a 64-hex digest and compares the canonical serialisation of load(id) to KITCHEN_L_DESIGN, exactly the round trip at test.ts:120; only the digest letter differs ('c' vs 'a', same class). A guard that over-rejected real digests would also fail every other case in the adversarial file that goes through mintTrackingId (:89). **Keep:** `packages/persistence/tests/neon-configuration-repository.test.ts:120` | **P1 deleted** — a kept test went red under a mutation |

**`tests/neon-configuration-repository.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 196 | refuses a save carrying another design's write-token hash, and writes nothing | 1 | Adversarial :374 mints two designs with different digests, saves each with the other's digest, expects DesignWriteForbiddenError both ways and compares the whole row (document and updated_at) before and after (:402-:403). The candidate is one of those two directions with a weaker unchanged-check (document only). **Keep:** `packages/persistence/tests/neon-configuration-repository.adversarial.test.ts:374` | **P1 deleted** — a kept test went red under a mutation (only the refusal half was mutated; "writes nothing" would need a changed UPDATE) |
| 394 | still accepts a null hash, so pre-ADR-0019 rows survive the constraint | 1 | Same raw insert of a NULL write_token_hash; the adversarial case asserts it resolves (:354-:359) and additionally that a save against that row fails closed. The candidate asserts nothing beyond the insert not throwing. **Keep:** `packages/persistence/tests/neon-configuration-repository.adversarial.test.ts:348` | **P1 not done** — settling it needs a mutation outside the wave's limits (another package, a migration, or different DML) |
| 585 | answers an unknown id with the forbidden refusal, never the conflict one | 1 | Same call (id 'does-not-exist-00000000', CORRECT_TOKEN_HASH, FIRST_REVISION, absent visitor) and same assertion rejects.toThrow(DesignWriteForbiddenError) as the first expectation at :233-:241. 'Never the conflict one' adds no assertion. **Keep:** `packages/persistence/tests/neon-configuration-repository.test.ts:226` | **P1 deleted** — a kept test went red under a mutation |

**`tests/open-database.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 614 | accepts %s through both entry points | 5 | The five BOTH_ACCEPT rows (trailing LF, Latin-1 letter, tab, space, DEL) are the same character classes, both entry points and the same not-refused assertion as qa-8b-opener-sweep :311-:321, which adds trailing CRLF. The neighbouring HEADER_REFUSES and SESSION_REFUSES tables in open-database.test.ts are not part of this finding and stay. **Keep:** `packages/persistence/tests/qa-8b-opener-sweep.adversarial.test.ts:311` | **P1 deleted** — a kept test went red under a mutation |

**`tests/qa-7t-s2b-lock.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 190 | lets the first registration through | 1 | Every row of the it.each at :170 calls registerFirst() unguarded (:182), two of them with holdExclusiveTestSchemaLock, so a first registration that throws already fails those rows. **Keep:** `packages/persistence/tests/qa-7t-s2b-lock.adversarial.test.ts:170` | **P1 deleted** — a kept test went red under a mutation |

**`tests/qa-7t-s3-schema-status.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 99 | reports a complete ledger over a designs table missing %s as columns-missing / reports %s under the wrong nullability as columns-misshapen | 2 | Same function, same per-column mutation, same outcomes as the properties at migration-status.adversarial.test.ts:339 and :358, which also assert the detail names the column. The verdict for a level ledger does not depend on whether the ledger came from real or synthetic files. Caveat: the twins sample 50 runs over the eight REQUIRED_DESIGN_COLUMNS rather than enumerating; turn them into it.each if these go. The wrong-type sweep at :133 is new and stays. **Keep:** `packages/persistence/tests/migration-status.adversarial.test.ts:339` | **P1 merged then deleted** — the Keep properties became an `it.each` over all eight columns first |

**`tests/qa-ce-s4-retry.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 646 | does not retry (rows: a plain Error with the empty-reply message, a string carrying it, undefined, null) | 4 | The four rows (new Error(EMPTY_REPLY_MESSAGE), the message as a string, undefined, null) are the same inputs with the same toBe(false) as rows of the table at retry-on-transient-failure.test.ts:630-:641. The other rows of the adversarial table are distinct and stay. **Keep:** `packages/persistence/tests/retry-on-transient-failure.test.ts:617` | **P1 deleted** — a kept test went red under a mutation |
| 693 | tells the first attempt it is not a retry and every later attempt that it is | 1 | Same loop, same three attempts failing with the empty-reply SyntaxError, same assertion seen == [false, true, true] as retry-on-transient-failure.test.ts:709-:724. Only names and the timer-advance call differ. **Keep:** `packages/persistence/tests/retry-on-transient-failure.test.ts:709` | **P1 deleted** — a kept test went red under a mutation |

**`tests/rate-limit-store.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 190 | refuses an empty request before any statement is sent | 1 | Same recordHits([]) on the same mocked driver; qa-8e :483-:492 asserts the same /lists no bucket/ message and zero statements, and additionally that the refusal is not a RateLimitStoreError. **Keep:** `packages/persistence/tests/qa-8e-rate-limit-driver-failures.adversarial.test.ts:483` | **P1 deleted** — a kept test went red under a mutation |
| 247 | does not take another check constraint's refusal for a conflicting window end | 1 | Identical failure (code 23514, constraint rate_limit_counters_hits_is_positive, built at rate-limit-store.test.ts:73) to the first row of the qa-8e table, which asserts RateLimitStoreError and also not RateLimitWindowConflictError (:375-:376). **Keep:** `packages/persistence/tests/qa-8e-rate-limit-driver-failures.adversarial.test.ts:339` | **P1 deleted** — a kept test went red under a mutation |

**`tests/retry-on-transient-failure.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 217 | runs the query exactly three times however long it is left to keep trying | 1 | Any change that allows a fourth attempt also fails :232: after the third failure it would schedule another backoff, so 'await thrown' never settles under fake timers and getTimerCount() is not 0. :203 already pins the last error by identity. The candidate only fails more readably. **Keep:** `packages/persistence/tests/retry-on-transient-failure.test.ts:232` | **P1 kept** — the Keep catches a fourth attempt only by a 30 s timeout; this test fails by assertion |
| 654 | an empty reply: is retried once / is retried at most three times / is followed by a non-transient answer | 2 | The loop consults one predicate (src/retry-on-transient-failure.ts:67). 'Is retried once' (:662) is subsumed by :709, which needs two empty-reply retries before a value; 'is followed by a non-transient answer' (:685) is the branch :327 covers. 'Is retried at most three times, then reaches the caller unchanged' (:672) stays: it is the only case that exhausts the loop on empty replies and checks the last error by identity. **Keep:** `packages/persistence/tests/retry-on-transient-failure.test.ts:709` | **P1 deleted** — a kept test went red under a mutation |

**`tests/share-link-repository.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 265 | returns none for a revoked token | 1 | Issue, revoke, loadShared == {kind: 'none'}: the same three calls and the same assertion as :171-:181, which also asserts the 'revoked' outcome and status inactive. **Keep:** `packages/persistence/tests/share-link-repository.test.ts:171` | **P1 deleted** — a kept test went red under a mutation |
| 521 | a share read after sharing leaves resume's ordering on the most recently saved design | 1 | :289 snapshots document, revision and updated_at around issue, status, loadShared and revoke and requires them unchanged. The candidate's ordering query can only change if updated_at moves under issue, loadShared or status, a subset of those operations. **Keep:** `packages/persistence/tests/share-link-repository.test.ts:289` | **P1 not done** — settling it needs a mutation outside the wave's limits (another package, a migration, or different DML) |

**`tests/table-privileges.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 21 | table-privilege helper (live test database): all three cases | 2 | Cases 1 and 2 are weaker forms of qa-8e live :1217 (exact, sorted list by a second road) and :1249 (exactly SELECT, plus MAINTAIN by membership). Case 3 stays: it is the only read of isSuperuser, isSchemaOwnerOrMemberOfIt and canCreateInSchema off a real connection; qa-8e :1365 compares four other fields, so a mis-aliased column for those three flags (undefined, not boolean) shows only here. **Keep:** `packages/persistence/tests/qa-8e-rate-limit-live.adversarial.test.ts:1217` | **P1 part** — cases 1 and 2 deleted (kept tests red under mutation); case 3 stays |

**`tests/test-database-connection-errors.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 279 | %s refuses a password with a line break, and nothing of the value is in the refusal | 2 | Both entry points over a line feed in the password are in qa-8b: assertSafeTestDatabaseUrl at :181 and resolveTestDatabaseUrl at :197, each over more characters, with the same class, message and no-marker assertions plus variableName. Both files set an application DATABASE_URL beside the test one (qa-8b :31-:34). **Keep:** `packages/persistence/tests/qa-8b-test-database-guard.adversarial.test.ts:181` | **P1 deleted** — a kept test went red under a mutation |
| 302 | names TEST_DATABASE_URL for a value read from it, and DATABASE_URL for one derived from it | 1 | TEST_DATABASE_URL for an override with a line break is asserted at qa-8b :203-:207; DATABASE_URL for a URL derived from it, refused for sslrootcert, at :263-:274. Same two branches of resolveTestDatabaseUrl (src/test-database-url.ts:140-:144) with the same kinds of input. **Keep:** `packages/persistence/tests/qa-8b-test-database-guard.adversarial.test.ts:263` | **P1 deleted** — a kept test went red under a mutation |
| 355 | still allows a real-shaped URL: %s | 3 | Pooled endpoint with channel binding, direct endpoint and endpoint option are the first three rows of the qa-8b table (:212-:223), which also has a percent-encoded password row and asserts the resolved value exactly rather than only 'no error'. **Keep:** `packages/persistence/tests/qa-8b-test-database-guard.adversarial.test.ts:211` | **P1 deleted** — a kept test went red under a mutation |

**`tests/test-database-url.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 89 | refuses a URL reaching the application database under a second role's credentials / a URL differing only in the case of its host / the direct endpoint of the pooled one / the same name through any other host | 4 | All four pass on one branch, and not the one their titles describe: their database names (neondb, lemn-conf-v2) are not in ALLOWED_TEST_DATABASE_NAMES, so refuseUnlessNamedAsATestDatabase (src/test-database-url.ts:102) throws first and the loose /Refusing to run live database tests/ matches its message. None reaches refuseTheApplicationDatabaseName; host and credentials are never read. That branch is pinned at :127, the real same-name refusal at :68 and qa-8b :251. Rewriting one with an allowlisted name would test what the titles say. **Keep:** `packages/persistence/tests/test-database-url.test.ts:127` | **P1 deleted** — a kept test went red under a mutation (the four went red only with both checks removed; each check keeps its own guard) |

#### `packages/three-adapter` — 37 entries, 97 cases

**`tests/cabinet-depth-source.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 243 | keeps the worktop's overhang a constant at every depth | 1 | The it.each at :211 asserts carcass 560/660/760 and worktop 620/720/820 with toBe at the same three depths on the same builder call, so each difference is 60 by arithmetic. The candidate cannot fail while those rows pass. **Keep:** `packages/three-adapter/tests/cabinet-depth-source.test.ts:211` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/catalog-bodies.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 578 | a height-flexible body builds its carcass at the 400 mm minimum opening | 1 | The whole case, not only its repeated 'wall-cabinet' entry: SIZE_CASES builds wall-cabinet, wall-lift and open-shelf at 0.6 x TOP_SLOT_HEIGHT_M (0.4) and checks carcass height within FIT_TOLERANCE_M (catalog-bodies.test.ts:129-:138, :210-:212), which is what passesBuiltSizeGate computes (adversarial :86-:90). Only the requested depth differs (400 vs 330 mm), which does not enter the height. **Keep:** `packages/three-adapter/tests/catalog-bodies.test.ts:129` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/catalog-bodies.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 90 | SIZE_CASES rows built from BASE_BUILD_IDS/WALL_BUILD_IDS listing the same id twice | 16 | BASE_BUILD_IDS lists 'base-cabinet' twice (:91-:92) and WALL_BUILD_IDS lists 'wall-cabinet' twice (:97-:98), so the flatMaps at :105 and :129 emit identical cases twice: 4 base (4 widths) and 12 wall (4 widths x 3 size variants). Removing one entry from each list removes exactly the 16 repeats. **Keep:** `packages/three-adapter/tests/catalog-bodies.test.ts:105` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |
| 198 | covers exactly the catalogue's insertable entries, in both directions | 1 | Set equality of CATALOG_BUILD_IDS and the insertable definitions' ids; the adversarial file asserts each inclusion separately (:167 no missing builder, :175 no orphaned builder) and names the offending ids on failure. Keep either the single case or the pair, not both. **Keep:** `packages/three-adapter/tests/catalog-bodies.adversarial.test.ts:167` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/hob-base.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 160 | base-hob-oven carries an oven and base-hob-2drawer does not | 1 | Same two builds at the same size (600 x 860 x 580 mm; HOB_BASE_SIZE at adversarial :44) and the same pair of assertions on 'oven_cavity' as hob-base.adversarial.test.ts:144-:151. **Keep:** `packages/three-adapter/tests/hob-base.adversarial.test.ts:144` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/hob-front-clearance.parity.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 216 | grows that gap by exactly what the setting grows by | 1 | SHALLOWEST and DEEPEST are this file's own literals 600 and 700 (:26-:27), and the rows at :201 pin the same expression at 90 and 190 with toBe, so the difference is 100 by arithmetic. The comment's promise that a third declared depth would extend it does not hold: the depths are local constants, not read from production. **Keep:** `packages/three-adapter/tests/hob-front-clearance.parity.test.ts:201` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/kitchen-parts.contract.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 375 | is not a reference builder: the builders keep exactly the reference's keys | 1 | kitchen-parts.parity.test.ts:1097-:1100 requires the ported kit's builder keys to equal the reference's exactly, so any extra key, 'wall-corner-x' included, already fails there. The candidate checks one absent key of that set. **Keep:** `packages/three-adapter/tests/kitchen-parts.parity.test.ts:1097` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/kitchen-shell.room-shaped.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 427 | still frees the material and map it cloned on the previous resize | 1 | Same fresh shellFor(SEEDED_ROOM), same resize to 5000x4000x3000, same dispose-once spies on the floor's material and map; :326 does that for floor plus backsplash_wall_a. Strict subset; despite the title no 'previous resize' is staged. **Keep:** `packages/three-adapter/tests/kitchen-shell.room-shaped.test.ts:326` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/kitchen-shell.u.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 277 | keeps an L's and a straight room's floor at depthMm plus the overhang | 1 | Cited twin (linear:85) is not the subsumer, but kitchen-shell.u.test.ts:430 strict-equals the floor's geometry size, position and rotation for the same L_ROOM and LINEAR_ROOM (3700x3400), which fixes max z. Only an unrecorded mesh scale could separate them, and scale on a fresh build is caught by the characterisation file. **Keep:** `packages/three-adapter/tests/kitchen-shell.u.test.ts:430` | **T2 merged then deleted** — the Keep test missed a stretched floor; a no-scale assertion (children and the shell group) was added first |
| 481 | leaves an L's floor no different whether or not wall C is in the shell | 1 | Same L->U->L trip; :452 strict-equals the floor's size, position and rotation to the recorded L, which implies an unchanged z extent. Caveat: recordedFactsOf (u.test:404) drops scale, so a floor left scaled (not rebuilt) after the return trip is seen only here; add scale to that record if deleting. **Keep:** `packages/three-adapter/tests/kitchen-shell.u.test.ts:452` | **T2 merged then deleted** — the Keep test missed a stretched floor; a no-scale assertion (children and the shell group) was added first |

**`tests/measure-built-body.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 123 | leaves the room with the same children in the same order | 1 | measureBuiltBody's add/remove (src/measure-built-body.ts:71-82) is not build-id dependent; the twin checks length plus identity per index over three measurements, stronger than this deep toEqual over two. **Keep:** `packages/three-adapter/tests/measure-built-body.adversarial.test.ts:283` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |
| 189 | row 19: seats $name on wall A / on wall B (3 bodies each) | 6 | Adversarial :192/:204 seat the same sink/wall-cabinet/pantry (plus four more) on both walls against the same plane, and :223 pins the seat as a whole millimetre, so the rounding in the twin cannot hide an error the raw-float path would show. Only the wall cabinet's 0.33 vs 0.56 m depth differs; the measurement is geometric, no depth branch. **Keep:** `packages/three-adapter/tests/measure-built-body.adversarial.test.ts:192` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/overflow-mark.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 69 | is a different value from the selection highlight | 1 | Inequality of the two constants is strictly implied by the next case's distance > tolerance and round(distance) == 90. **Keep:** `packages/three-adapter/tests/overflow-mark.test.ts:73` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/pantry-resize.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 156 | builds three different trees at the three widths, so nothing is being scaled | 1 | The it.each at :115 pins carcass_shell's span to exactly widthM and forbids any wider mesh at 0.4/0.6/0.8, so the widest span is 0.4, 0.6, 0.8: three distinct values follow. The title's anti-scaling claim is not what it asserts; :169 onward carries that. **Keep:** `packages/three-adapter/tests/pantry-resize.test.ts:115` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/perete-a-framing.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 128 | sits further out than the reference preset did, which is the cost of the ruling | 1 | Same panelUnderPereteA(SEEDED_ROOM).nearestEdgePx; :115 holds it to 596.2 +/- 0.05, which implies > 514.9. It records a cost, not a requirement; no production change reddens it alone. **Keep:** `packages/three-adapter/tests/perete-a-framing.test.ts:115` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/picking.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 73 | never leaves three.js's 1 m default in place | 1 | threshold toBe(constant) and constant toBe(0.008) at :69-70 imply it is not three's default 1. Holds only while the 0.008 literal at :70 stays (see s38.2, refuted). **Keep:** `packages/three-adapter/tests/picking.test.ts:67` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |
| 127 | row 22: a solid cabinet is selected even when a void lies along the same ray | 1 | pick() (src/picking.ts:97) tries solids first; here the cabinet is also the nearer hit, so even a nearest-hit-wins regression stays green. The cutaway case puts a synced void on the same ray and asserts the same id; the kind 'placement' label is asserted at picking.test.ts:177. **Keep:** `packages/three-adapter/tests/picking.cutaway.test.ts:164` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/push-to-open-seam.parity.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 255 | answers the same for every seeded placement / answers the same when every placement records %s | 4 | Both files compare the same sceneHidesBarsOn over the same seeded records in the same four handle states (undefined/push/steel/black). The parity oracle at push-to-open-seam.parity.test.ts:248 is built from production's own record.canHandle and isPushOpenByDefault, so it moves with a defect; qa-6t-a's oracle (:99) reads the document, the catalogue row and a literal 2200, so anything reddening the parity cases reddens it too. **Keep:** `packages/three-adapter/tests/qa-6t-a-scene-price-seam.adversarial.test.ts:143` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/qa-6k-d-real-probe-round-trip.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 108 | returns every wall column to the depth it started at | 1 | Same 600->700->600 trip with the real probe; qa-6k-de:152 compares every column (A\|0.30 and A\|0.75 included) on the unfiltered design and :163-186 adds per-placement seats, so a member hidden under a column MAX is still seen. The structural-body filter here is the workaround wave 6K-d removed. Column depths derive from integer millimetres, so the tighter tolerance adds nothing. **Keep:** `packages/three-adapter/tests/qa-6k-de-repeated-real-probe.adversarial.test.ts:152` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/qa-6k-de-repeated-real-probe.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 148 | changes depth without throwing on the unfiltered design | 1 | changeTo(KITCHEN_L_DESIGN, DEEPER_MM) is the first call inside :152 (and of every later case); a throw fails those identically. No assertion of its own beyond not.toThrow. **Keep:** `packages/three-adapter/tests/qa-6k-de-repeated-real-probe.adversarial.test.ts:152` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/qa-6t-a-scene-price-seam.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 216 | keeps the bars on at 2199 and takes them off at 2200 | 1 | The it.each at :242 asserts the same scene answer at 2199 and 2200 on the same solo body plus the latch count, and :226 requires a single flip at 2200. The extra built > 0 check is already enforced by sceneHidesBarsOn throwing (:90). **Keep:** `packages/three-adapter/tests/qa-6t-a-scene-price-seam.adversarial.test.ts:242` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/qa-7d1b-panel-wall-end-veto.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 189 | re-syncs on a room change alone, with the records untouched | 1 | STEPS 1->2 and 4->5 at :121-150 are the same two room-only transitions with the identical SEEDED_RECORDS array, asserting the same panel.visible false then true (plus identity and seat). No input or assertion here that :153 lacks. **Keep:** `packages/three-adapter/tests/qa-7d1b-panel-wall-end-veto.adversarial.test.ts:153` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/qa-7h-preset-stands-clear.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 118 | $id puts no wall between the eye and its target at $widthMm x $depthMm x $heightMm | 33 | Over the identical presetsAcross(SAMPLED_ROOMS) table, expectStandsInTheRoom (:226) already holds the eye's x and z strictly > 0 (:85) and :103 holds the target's x and z >= 0 and <= the room. This case re-asserts the weaker >= 0 on the same four numbers. Keep :85 and :103. **Keep:** `packages/three-adapter/tests/qa-7h-preset-stands-clear.adversarial.test.ts:85` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/qa-item8-deep-top-geometry.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 160 | builds both deep tops to the cabinet-depth line at %i mm | 2 | pairedKitAt (:89) is kitAt with the declared wall row; same buildDecomposedBody, same two deep-top ids, same expected cabinetDepth - 39 at 600 and 700 as :135, which already separates the two sources by crossing them. The trailing not.toBe at :178 compares two test-side constants. **Keep:** `packages/three-adapter/tests/qa-item8-deep-top-geometry.adversarial.test.ts:135` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/qa-w5-sink-centring.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 224 | keeps 600 in the declared map, which is what makes the centring case assert anything | 1 | The identical expect(declaredCabinetDepthsMm()).toContain(DEPTH_THE_CENTRING_IS_RULED_AT_MM) already sits inside the shipped centring case it exists to keep honest (:210), beside a stronger measured.length check at :213. **Keep:** `packages/three-adapter/tests/sink-front-clearance.parity.test.ts:210` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/right-corner-wrapper.wall-guard.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 108 | wraps wall A's right X-leg and not its left one, by their records' corners | 1 | Same rightIdsOf(shellRecords()); :63 strict-equals the wrapped set to [right-p21, right-p25, right-p26, right-p9], which contains right-p25 and excludes p25. **Keep:** `packages/three-adapter/tests/right-corner-wrapper.wall-guard.test.ts:63` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/scene-sync.appearance.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 307 | keeps a black handle hidden when the mode is push | 1 | Records handleMode 'push' on a default wall-row record and checks no handle mesh is visible; scene-sync.test.ts:302-312 does exactly that (id 'push') and scene-sync.adversarial.test.ts:359 repeats it at a low slot. Nothing black is recorded despite the title, and the loop is vacuous if no handle is built. **Keep:** `packages/three-adapter/tests/scene-sync.test.ts:302` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/scene-sync.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 285 | push-to-open by slot (3 cases: top-row hides, wall-row shows, recorded mode over slot default) | 1 | Only :294 (wall-row default shows) is subsumed, by the adversarial 'just below the top row' row. :285 is the only one asserting countHandles > 0, without which 'hidden' is satisfied by building no handle; :302 records 'steel' on the top row, while the adversarial case at :347-351 actually records 'black'. **Keep:** `packages/three-adapter/tests/scene-sync.adversarial.test.ts:337` | **T2 part** — only the wall-row case was redundant and deleted; the other two stay |

**`tests/stage.u-cameras.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 95 | offers a U [overview, wallA, wallB, wallC], in that order | 1 | Which presets a room offers depends on shape alone; the twin asserts the identical four-id list on eight Us spanning the engine minimum and maximum (support/u-scene.ts:179), three of which are this case's rooms. **Keep:** `packages/three-adapter/tests/qa-u4-u-cameras.adversarial.test.ts:71` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |
| 122 | %s U: position and target are wallB's, at C, with x replaced by W − x | 3 | Minimum, middle and maximum U are rows of SWEPT_US, where qa-u4:83 asserts the same reflection on all six coordinates and :110 ties a U's wallB to the L's, so the U stand-in adds nothing. The 2700x1600x1600 and 3000x3000x3000 rooms (AC4 (c)'s) are not in SWEPT_US; those two rows are not shown redundant. **Keep:** `packages/three-adapter/tests/qa-u4-u-cameras.adversarial.test.ts:83` | **T2 part** — 3 of 5 rows deleted (they are in the swept set); 2 stay |
| 189 | %s U: looks at the middle of the drawn floor, depth max(B, C) / 2 | 3 | qa-u4:144 asserts the same target x and z (plus y) for the minimum, middle and maximum U. The 2700x1600x1600 and 3000x3000x3000 rows are not in SWEPT_US (support/u-scene.ts:179) and stay. **Keep:** `packages/three-adapter/tests/qa-u4-u-cameras.adversarial.test.ts:144` | **T2 part** — 3 of 5 rows deleted (they are in the swept set); 2 stay |
| 255 | leaves wallA and wallB where they were: neither reads C | 1 | qa-u4:110 holds wallA and wallB of each of eight Us (C both longer and shorter than B, the 4500x3000 middle included) equal to the same room as an L, which has no C at all; independence from C follows. No branch of its own. **Keep:** `packages/three-adapter/tests/qa-u4-u-cameras.adversarial.test.ts:110` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/swap-depth.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 216 | keeps a deep replacement stable when it is swapped a second time | 1 | qa-waves-ac:146 swaps the same p22 ten times across wall-cabinet, open-shelf and wall-lift with the same occupied-depth measure and expects 600 every time; the first hop here (seeded -> open-shelf = 600) is also swap-depth.test.ts:190. Only the open-shelf -> wall-lift ordering is not literally in the rotation, and the built depth comes from the opening, not from the body replaced. **Keep:** `packages/three-adapter/tests/qa-waves-ac.adversarial.test.ts:146` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/the-corner-wears-a-colour.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 302 | paints its carcass and its door in the kitchen's colour | 1 | The CORNERS row for base-corner-x-900 (p25, painted [carcass, door_front], :57-61) runs the identical following(HALIFAX) scene and the identical coloursOf equality at :240-247, plus a scene-was-painted witness. **Keep:** `packages/three-adapter/tests/the-corner-wears-a-colour.test.ts:240` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |
| 313 | paints them in a colour chosen for that corner, over the kitchen's | 1 | Identical to the p25 row of the it.each at :342-352: same wearingOn(following(HALIFAX), p25, NUC_WARMIA), same two meshes, same hex, and the sweep adds the kitchen-still-Halifax witness. **Keep:** `packages/three-adapter/tests/the-corner-wears-a-colour.test.ts:342` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/void-mesh.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 61 | tags the group root with the void id for picking to climb to | 1 | void-mesh.ts:73 is the only line that writes userData.voidId and syncVoidMeshes mounts buildVoidMesh's group unchanged, so scene-sync.test.ts:326 fails on any change to that tag; the picking cutaway cases depend on it too. **Keep:** `packages/three-adapter/tests/scene-sync.test.ts:318` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/wall-corner-x.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 463 | is worn by the carcass shell, the closure, the stile and the leaf, and by nothing inside the box | 1 | wall-corner-x-mounted.test.ts:130 asserts the identical sorted four-name list from collectPaintedSurfaces for both mounted rows (p27 and p28) of the same builder; nothing on the mount path marks surfaces, so a builder regression fails there too. **Keep:** `packages/three-adapter/tests/wall-corner-x-mounted.test.ts:130` | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

#### `scripts/gates` — 1 entries, 5 cases

**`boundary.test.mjs`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 86 | refuses <form> of the scoped driver outside the persistence package (8 rows) | 5 | boundary.sh:67 refuses the scoped name as any quoted string, so the wrapped, re-export, bare, dynamic and require rows are indistinguishable from the one-line row, and their keyword forms are proven by the plain-driver rows through the shared alternation at :16/:66. Keep three scoped rows: one-line (base), single-quoted (only row on the quote class of :67) and subpath (only row on its subpath group); they become the sole cover the day the scoped name is dropped from :16. **Keep:** `scripts/gates/boundary.test.mjs:86` |

## 3. Obsolete

#### `apps/web` — 9 entries, 9 cases

**`tests/app/configurator/configure/top-bar-box.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 345 | renders no progress segments and declares no rule for them | 1 | styles.progress / styles.headerRow appear nowhere in configure-screen.tsx or configure.module.css (grep empty). A reintroduced top-bar class is already caught by qa-w4-top-bar.adversarial.test.ts:121, which toEqual's the exact list of className={styles.*} before the stage; the remaining half only forbids a dead CSS rule by two historical names. |

**`tests/app/locale-layout.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 20 | owns only the five customer entrypoints beneath [locale] / leaves configure and shared-design support at stable alias paths | 1 | Case 1 is kept: a route file is imported by nothing, so deleting [locale]/configurator/contact/page.tsx or re-adding an unlocalised app/page.tsx breaks no import and only this test notices (its title's 'five' is stale — d/[id]/review exists — but the assertions are live). Case 2 is redundant: configure-screen.tsx and hydrate-and-configure.tsx are imported by dozens of tests, so existsSync adds nothing. |

**`tests/e2e/global-settings-apply.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 214 | commits nothing and stays open when one half of the press is refused | 1 | test.fixme with an empty body: it never runs and asserts nothing, so deleting it removes no protection. The commit-nothing half is asserted at store/whole-kitchen-apply.test.ts:79. It is a deliberate gap marker (the sheet staying open in a browser is unasserted) — move that note to docs/BACKLOG.md rather than lose it. |

**`tests/e2e/kitchen-stage.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 105 | a selected body renders a visible highlight distinct from no selection | 1 | test.skip, unconditionally: it never runs. Its own comment says 'Skipped, not owed' (the sheet covers the patch at 390x844); HIGHLIGHT_REGION (:31) is used nowhere else. The highlight is asserted at editor-rail.desktop.e2e.spec.ts:215. |

**`tests/price/price-bar-states.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 253 | shows the same figure it showed before, and says nothing about the refusal | 1 | Same describePriceBar call on the seeded design; :86 asserts label === startingPrefix === 'De la', which already excludes 'neschimbat'. No refusal is passed, so the title's second half is not exercised. |

**`tests/price/starting-price.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 184 | renders an included tier's zero as a bare zero, which wave 6D must not ship as an amount | 1 | Wave 6D shipped: describeRowAmount maps zero to inclus (src/price/price-breakdown-model.ts:249-252). amountTextFor(0) === '0 MDL' is starting-price.test.ts:72; the rest pins a fixture fact and the absence of a key nothing reads. |
| 392 | offers no surface a choice of prefix to compose | 1 | describeStartingLabel exists nowhere under apps/web/src or packages/configurator-domain/src (grep -rn: no hit). A prefix chooser under any other name passes; the behaviour is held by the label assertions at starting-price.test.ts:28-34. |

**`tests/price/starting-price.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 37 | is the only prefix a figure can carry, since the owner removed the other | 1 | Second 'neschimbat' sweep over the same price section as adversarial:381, which reads the raw catalogue and the removed key; the label assertion repeats :28-34. Keep the adversarial one. |

**`tests/scene/overflow-warning-viewport.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 363 | was survivable before 6G's row, which is why the first placement was defensible | 1 | It computes a layout that no longer exists on either count (a flow band and no settings row) from test-local arithmetic. Its one production input, the reserved height, is pinned by :351 (30.74) and :323 (477), so no production change reddens it alone; it records why an abandoned placement was once defensible. |

#### `packages/configurator-domain` — 2 entries, 2 cases

**`tests/generation/qa-7d5b-s0-pre-state-census.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 275 | E1 head column / E2 (x5) / E4 / E6 (x2) / E7 HEAD-figure census tests | 1 | Only 'E1 — HEAD's column' is a figure of a planner that no longer ships: every number in it is the post-S0b column (:291) shifted by the 5 260 rooms pinned live at :484. The other eight are not obsolete. They run the shipped planner with the leaves switched and pin preconditions the shipped S1 leaf relies on: no room has a free door cabinet on both sides of the sink (the leaf has no ranking), every converted cabinet is on the narrower wall, the (e) rooms' shape, the free-end remainder never wider than 200 mm, and M11's 5 260 / 11 240 split. |

**`tests/generation/shell-design.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 1150 | computes the run-end panel for every band room without throwing | 1 | No it.fails remains for the band (rtk proxy grep 'it\.fails' tests/generation finds only comments; property.test.ts:286 records the flip). The same 19 rooms (wall A 900-918, wallB.min, 2600) run the same runEndPanelSeatM call through runEndPanelOuterFaceMm at property.test.ts:310-321 with a real assertion, so a throw fails there too; the count of 19 is pinned by the premise at property.test.ts:295. Do not delete this and s26.9's group without keeping adversarial :865. |

## 4. Useless

#### `apps/web` — 14 entries, 19 cases

**`tests/app/configurator/configure/back-confirmation.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 286 | is exactly the owner's wording in %s | 1 | The ro row is redundant: romanian-copy-lock.test.ts:16 holds all of ro.json to APPROVED_ROMANIAN_MESSAGES leaf for leaf. The ru row is kept: 'Изменения будут потеряны' is owner-approved wording (2026-10-01) and no other unit test pins ru.json's leaf; golden-output hashes render ro.json only, the other literal is e2e support (tests/e2e/support/qa-m7c-c1-s3-back.ts:24). |

**`tests/e2e/overflow-mark.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 194 | the mark's colour cannot be counted as the selection highlight | 1 | Touches no page: it computes the RGB distance between two production constants. packages/three-adapter/tests/overflow-mark.test.ts:76-82 already asserts that distance exceeds the selection tolerance and rounds to 90, in a unit test; the operational half is the next e2e case. |

**`tests/e2e/pixel-counter-witness.adversarial.desktop.e2e.spec.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 330 | the retired threshold of 50 reports a mark on an unmarked oak kitchen, and 80 does not | 1 | Its unique assertion counts pixels against a test-local retired threshold (50), which documents the instrument and guards no product rule. Its other assertion (MARK <= MAX_ABSENT_MARK_PIXELS on whole-oak, every preset) is the oak row of the loop at :285, which also asserts oak is warm up to excess 72. |

**`tests/i18n/content.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 493 | matches the prior 1–200 bands and identifies zero as the sole 0–200 divergence | 1 | Calls no production code: compares Intl.PluralRules('ro') with a test-local priorCategory (content.test.ts:495); grep finds no such legacy function left in apps/web/src/i18n. The CLDR bands production relies on are pinned by the it.each at content.test.ts:463. |

**`tests/i18n/golden-output.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 324 | records Gate O1's 12 semantic corrections distinctly | 1 | GATE_O1_SEMANTIC_CORRECTION_KEYS is declared in the test file (golden-output.test.ts:31) and its only other reader (:310) is vacuous now that STAGED_... is [] (:48). Length/Set size test the literal itself; key-existence in ro.json is already enforced by the copy lock (isRomanianCopyApproved, :252). |

**`tests/price/price-wiring.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 362 | projects to the same normalised bounds whatever height the bar takes | 1 | Builds its own THREE.PerspectiveCamera (wiring:316-334) and compares its projection at two aspects; no project code but the preset constants is involved, identical on both sides. It tests three's projection maths. |

**`tests/price/qa-6bg-money-seam.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 222 | carries the ruled key rather than a second spelling of it | 1 | Compares tests/support/ruled-price-copy.ts:70 to its own literal; reads no production code. The real pin is starting-price.adversarial:586, which discovers the leaves carrying the currency. |

**`tests/price/qa-6t2-accessory-rows.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 216 | has a word for every kind the section is meant to list | 1 | copy:226 asserts wholeKitchenCategories toEqual the full three-key object, which fixes the key set; the copy lock pins it again. |

**`tests/review/qa-8c-room-line-and-copy.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 363 | calls it a starting price, rounded up / says it is no commercial offer and waits on measurement | 2 | Matches three ro.json leaves against literals with no review code; the copy lock deep-equals the catalogue to approved-romanian-messages.ts (startingPrefix :286, note :297, roundedUpNote :318), which pins them exactly. |

**`tests/room/room-issue-model.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 498 | publishes the unreadable leaf the copy lock holds (and its three siblings at 605, 681, 727) | 3 | Three are redundant: rendered text is compared against the literal leaf for the shape refusal (room-screen.dom.test.ts:703, qa-7f2-s4 dom :163), the suggestion (qa-m7b-u6-switch dom :171, qa-7f2-s4 dom :607) and the note (room-one-c.dom.test.ts:825), so :605, :681 and :727 add nothing. Keep :498: every other test reads the unreadable sentence through UNREADABLE_LENGTH_MESSAGE_KEY itself (room-unreadable-on-blur.dom.test.ts:181, qa-7f2-s5b :188), so repointing the constant at another existing leaf is caught only by the literal. |

**`tests/room/room-unreadable-on-blur.dom.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 310 | names the entry unit in words in Romanian, which ADR 0126 allows | 1 | The Romanian sentence is pinned whole, twice: qa-7f2-s1 :445/:486 compares room.issue.unreadable verbatim ('Scrie valoarea în milimetri, doar cu cifre.') and romanian-copy-lock.test.ts:16 holds ro.json leaf for leaf. Which leaf the constant names is pinned at room-issue-model.test.ts:498. This depends on :498 staying (see s13.1). |

**`tests/settings/global-settings.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 68 | detects digits and sum claims nested inside ICU branches | 1 | It exercises only tests/support/icu-authored-literals.ts and a test-side regex on strings built in the test. The same witness, digit and sum-claim mutants inside ICU branches, is at starting-price.adversarial.test.ts:308-327. Its one extra is descent into a select branch; if that matters, add a select mutant to :308. |

**`tests/settings/material-reset-confirm.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 429 | keeps `materialWarning` itself untouched, which is a different string entirely | 1 | It compares catalogue strings with each other and builds no view; all of them are fixed by romanian-copy-lock.test.ts:16. The behaviour it is about, that the confirm step does not carry materialWarning and the choosing step does, is asserted on markup at :405-427. |

**`tests/settings/qa-0099-global-colour.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 575 | declares every new key as a non-empty string | 3 | Read as :575 (non-empty), :586 (no English) and :412 (two sentences differ); the finding does not name its third case. All three are properties of Romanian strings fixed by romanian-copy-lock.test.ts:16; blank leaves are refused catalogue-wide at catalogue-parity.test.ts:49; the strings reaching the page is asserted at :597 and :611, and :611's negative control already fails if the two sentences were equal. |

#### `packages/configurator-domain` — 31 entries, 34 cases

**`tests/backlog-50-the-corner-the-validator-cannot-see.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 384 | reproduces the base return's 70 mm off the reach the gate reads / reproduces the wall return's 31 mm off the same reach, one band up | 1 | seatOf is a test helper reading catalogue frameDepthMm, so neither case sees the validator's reach. Base case confirmed: base-corner-x-900's seat is pinned as D - 50 at commands/qa-c4s2-corner-joint.adversarial.test.ts:135 and 480 is test-local. Wall case kept: I found no other test pinning wall-2door-600's 291 mm seat (grep over tests). |

**`tests/body-label.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 118 | keeps the empty slot its own case rather than a body with no name | 1 | It restates catalog.ts:798. The BodyLabel union constrains the value, and apps/web/tests/i18n/body-label.test.ts:99-106 (and qa-6bf :292) pin by behaviour that EMPTY_SLOT_LABEL resolves to catalog.emptySlot and to no body's name. |

**`tests/commands/bottle-cargo-width-floor.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 109 | leaves §2's MIN_W at 300 mm | 1 | The 299 and 300 rows of :96 already pin the floor by behaviour through insert-fit.ts:418 (opening.w < MIN_WIDTH_M): any edit to MIN_WIDTH_M of a millimetre or more flips one of them. The right-hand side here is a test-local 300. |

**`tests/commands/insert-body.boundaries.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 43 | is the value the spec's tolerance table states | 1 | The same describe pins the constant behaviourally to [12.0, 12.1) mm: 688 accepted (:47), 687 refused (:58), 687.9 refused (:69). Any move of FIT_TOLERANCE_M (void-engine.ts:50) of 0.1 mm or more turns one of those red, so the literal 0.012 check adds nothing. |

**`tests/commands/minimum-width.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 200 | declares the aperture as its minimum | 1 | The toEqual at :229 lists ['base-sink', SINK_MIN_WIDTH_MM] among the declared floors, so sink.minWidthMm === 560 is pinned there with the same literal; :89/:100 pin it behaviourally at 559/560. |

**`tests/commands/qa-c4s2-corner-joint.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 230 | states the engine floor on every corner-taking wall, and the approved minima unchanged | 1 | Every value is pinned elsewhere: the approved minima as literals at tests/room/approved-room-policy.test.ts:171-172 (L 900/1000) and :229-231 (U 1000/1000); the 870 engine floor behaviourally by the sweep at :260 (L wall A, L wall B, U side wall), with U wallC tied to wallB at tests/room/room-policy.test.ts:272-273. The sweep at :296 also holds 900/1000 at their boundaries. |

**`tests/commands/qa-w5b1.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 80 | keeps MIN_WIDTH_M at 300 mm and MIN_SPAN_M at 300 mm | 1 | Both literals are pinned elsewhere: MIN_SPAN_M toBe(0.3) at tests/void-engine.boundaries.test.ts:54 and MIN_WIDTH_M * 1000 toBe(300) at tests/commands/bottle-cargo-width-floor.test.ts:110, each independently, so lowering both together still fails. |
| 553 | keeps its declared floor at 200 mm | 1 | The cargo's 200 mm floor is pinned as a literal at bottle-cargo-width-floor.test.ts:199, queries/width-resolution.adversarial.test.ts:555 and in the declared-floors list at minimum-width.test.ts:229, and behaviourally at 199/200 by the sweep at qa-waves-ac.adversarial.test.ts:139. |

**`tests/contact/qa-8h-submission-snapshot.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 638 | still states the rows this sum is made from | 1 | It reads SAMPLE_PRICE_BOOK rows back against test-local constants. The two hand-summed tests after it price four widths (600, 400, 500, 499) to exact line amounts, so any change to base, per-mm, per-leaf, per-hinge or the melamine amount already fails them; this test adds only a clearer message. Deleting it leaves BASE/PER_* unused, so remove them with it. |

**`tests/corner-assembly-size.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 512 | is read from the bound rather than typed, and is 900 × 1000 × 2200 while the bound is unmoved | 1 | It compares a test-local room built from the policy's minima with the literals 900/1000/2200. Those three bounds are pinned as literals in approved-room-policy.test.ts:163-175, and 1000 again in the test directly above (corner-assembly-size.test.ts:507-510). No production logic runs; only the test's own roomAtApprovedWalls helper. |

**`tests/design-bounds.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 45 | keeps MAX_COLUMN_EXTENTS equal to MAX_PLACEMENTS, never a separately chosen cap | 1 | The identical expect(MAX_COLUMN_EXTENTS).toBe(MAX_PLACEMENTS) stands at column-extents.test.ts:397 and at qa-5h.adversarial.test.ts:533, the latter with the literal 279 beside it. A separately chosen cap also moves MAX_DESIGN_BYTES (design-bounds.ts:180-184), pinned to 523_972 two lines below. The finding covers only the line-45 test. |

**`tests/generation/qa-7d4-composed-bodies.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 613 | leaves the preparation cabinet optional now that it carries a drawer body | 1 | The preparation row's buildId, required flag and width are a toMatchObject subset of the literal toEqual at generation-priorities.test.ts:96-108 (base-3drawer, 600, required false). No behaviour runs here. |

**`tests/generation/qa-7d5-pre-width-recorded.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 439 | identifies the exact committed pre-S1 source and records every sampled plan whole | 1 | It reads the recording's own metadata back (source string, seed, 480, line shape) and calls no production code. The count is not left unguarded without it: the sweep's arms are literals summing to 480 and asserted equal to RECORDING.runs (:244-263), and every line is parsed by the sweep. What goes is the provenance string only; keep it if the owner wants the fixture's origin asserted rather than documented. |

**`tests/generation/qa-7d5b-post-tower-recorded.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 194 | identifies the exact source, the draw and the witnesses / draws the pre-tower recording's rooms and witnesses, in the same order / decodes every recorded plan through the shared parser | 3 | All three read fixtures and test support only. The count is held by toHaveLength(496) at :230, a missing pre-tower room throws in recordedChanges (:176-178), and every recorded plan is parsed and its key turned back into a room by the byte-for-byte test at :221, which fails if either step is wrong. No production change can turn these three red. Provenance string and seed are the only content lost. |

**`tests/generation/qa-7d5b-pre-tower-recorded.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 173 | identifies the exact committed source, the draw and the witnesses / decodes every recorded plan through the shared parser | 2 | Fixture metadata and a parser round trip, no production call. The room and witness counts are pinned by the tests below as literals (470 + 10 at :211, 14 + 2 at :232), which also parse every recorded plan. What is lost is the provenance string, the seed and the names of the fourteen unchanged witness rooms. |

**`tests/generation/qa-u3b-generating-a-u.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 164 | runs its gate under an approved policy that states the U | 1 | expect(isShapeBuildable('U', APPROVED_ROOM_POLICY)).toBe(true) restates policy content that approved-room-policy.test.ts:282 already pins (approved shapes sorted equal ['L','U','linear']); no generation code runs in it. |

**`tests/generation/u-composition.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 23 | is the owner's 10 m threshold | 1 | u-composition.test.ts:27-41 holds both sides of the threshold through isLargeU (4000+3000+3000 large, 3999+3000+3000 not), which fixes LARGE_U_TOTAL_MM at exactly 10 000; the literal check at :24 can only fail when :27 does. |

**`tests/pricing/hardware-tier-reconciliation.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 267 | keeps Hettich's drawer rate understated against both complete-box tiers | 1 | :87-101 pins each tier's perDrawerMinor x 5 to ADR 0070's literal drawer column with no allowance (3 200 / 3 130 / 4 185 lei), which fixes all three rates exactly; the ordering at :267-274 cannot fail while that is green and runs no production code. |

**`tests/pricing/parse-price-book.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 352 | bounds coefficients so that every term and every partial sum stays exact | 1 | Restates the bound's inequality with the literals 4 and 10_000; parse-boundary :388-400 asserts the same inequality with the term count read off the constructors and MAX_DESIGN_DIMENSION_MM, so it fails whenever this does and also when either factor moves. Of the three copies (this, parse-boundary :388, regate :584) keep :388. |

**`tests/qa-0099-global-colour.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 904 | is refused by a strict settings schema that does not declare the key | 1 | The decisive assertion runs on DesignSettingsSchema.omit({finish:true}), a schema the test builds itself, so it shows zod's strictObject+omit behaviour for a hypothetical rolled-back build. The one production fact underneath (the settings container is strict) is pinned at the load path by design-settings.qa.test.ts:146 'refuses an undeclared setting'; that the real schema accepts `finish` is exercised throughout the same file. |

**`tests/qa-5b2a.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 131 | is derived from the key resolution, not from a width or a band count | 1 | (6300/10+1)*3 is 1893, and qa-5h:542 pins MAX_EMPTY_COLUMNS 1893 and MAX_PLACEMENTS 279 as literals, which also implies the `> MAX_PLACEMENTS` line. Nothing here runs a derivation; any change to the constant reddens :542 identically. Valid only while :542 is kept (see s29.3). |

**`tests/qa-5h.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 532 | bounds the occupied half by the placements, not by the wall's keys | 1 | :542 pins MAX_PLACEMENTS and MAX_COLUMN_EXTENTS both at 279, which implies both assertions here (equal to each other, equal to 279). No change to src/design-bounds.ts:146 reddens :532 without reddening :542. |
| 564 | raises the byte cap by exactly the allowance both frozen-map arrays share | 1 | perEntryBytes is arithmetic over the four constants :542 already pins plus the literals 512 and 1024 typed in the test: (523972 - 279*512 - 1024) / (1893 + 279) = 175. It cannot fail while :542 passes, and its other assertion repeats 523_972. No parse or serialise path runs. |

**`tests/qa-6k-c-frozen-source.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 198 | is one ULP away from having one | 1 | Asserts only that a floating-point near-miss (gap < 1e-9 m) exists in today's catalogue. If depth arithmetic changes so those pairs become exact ties that part, :194 (TIES_THAT_PART is []) goes red; if they become harmless, this reddens with no rule broken. Non-vacuity of the tie set is :151's job. |
| 342 | costs the same bytes in every key order the wire can present | 1 | JSON.stringify of the same keys and values has the same byte length in any key order, so `sizes.size === 1` cannot fail for any production change. The remaining `<= PER_ENTRY_BYTES` is :333's assertion on the same LONGEST_LEGAL_ENTRY. |

**`tests/qa-6q-a-offer.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 97 | carries three materials and eight entry ids, so a shrunken declaration fails loudly | 1 | Three materials is implied by :103 (OFFERED_ENTRY_IDS keys equal MATERIALS ids) and eight entry ids by :131's `answers` toHaveLength(24) with :117's exact sets. A shrunken or grown declaration already reddens one of those. Valid only while :131 is kept (see s30.19). |

**`tests/qa-accessory-deletion.qa.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 118 | no opening can be shorter than the retired accessory threshold | 1 | RETIRED_ACCESSORY_MAX_HEIGHT_M is a test-local 0.3 (:39), so the assertion is MIN_SPAN_M toBe 0.3, which void-engine.boundaries.test.ts:54 states against the spec's tolerance table. The 'no body lands under it' claim is the sweeps at :78 and :125. |

**`tests/queries/width-resolution.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 594 | names every entry in the catalogue declaring a floor under the default | 1 | The census is a legitimate ADR 0026 tripwire, not useless in itself, but it is a restatement: qa-waves-ac.adversarial.test.ts:272-289 runs the identical filter over INSERTABLE_BODY_DEFINITIONS (minWidthMm < 300) and pins the identical three-id list in the same order. A fourth declaring row reddens both. |

**`tests/repository.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 63 | can be thrown and caught as a distinct error type | 1 | The test constructs and throws the error itself and asserts toThrow(InvalidDesignError): it exercises throw/instanceof, not repository.ts:43-48. Renaming this.name, dropping boundedFailureReason or changing the message prefix all leave it green; the class's behaviour is asserted through real producers elsewhere. |

**`tests/validate-design.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 208 | wall $wall's run ends at $runEndMm, inside its own bound / declares the two runs the demo room is built to clear | 1 | Confirmed for 'declares the two runs' only: the room literal {3560, 2920} is pinned whole at demo-room-envelope.test.ts:69 and restated in qa-6a3 :37-38. The two run-end rows stay: wall B's seeded run ending at 2800 (and A's at 3500) is the ADR 0083 measurement the 2920 clearance is reasoned from, and I found no other test pinning 2800; 'accepts the shipped design' at :84 only shows the run is inside the bound, not where it ends. |

**`tests/void-engine.boundaries.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 53 | is the value the spec's tolerance table states | 1 | The cases at :64 and :69 use the literal 300 mm one micron either side (no void below, a void above, in both levels), which fixes MIN_SPAN_M to within a micron through behaviour; the bare literal adds nothing they do not catch. |

#### `packages/persistence` — 2 entries, 2 cases

**`tests/migration-target.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 39 | DATABASE_NAMES_BY_ENVIRONMENT: is exactly three entries / names production's and preview's one database each / has no staging key | 1 | 'has no staging key' (:64) is subsumed by 'is exactly three entries' (:40), whose sorted key list already excludes staging, and by :135. The other two stay: only :40 catches a fourth environment key or a Map replaced by an object literal, and only :48 catches production/preview being widened to a second database name (the :80 pass rows and the property test at :101 read the table itself, so they stay green). | **P1 deleted** — a kept test went red under a mutation |

**`tests/neon-configuration-repository.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 287 | has exactly one value equal to the empty hash, which is why refusing '' is enough | 1 | The five equality expressions compare untyped SQL literals (adversarial :289-:294), never the designs column, so they assert Postgres's own text semantics and no project code. The one project fact, data_type = 'text' (:311), is already asserted at neon-configuration-repository.test.ts:373. | **P1 kept, no signal** — only a migration mutation would show the named twin catching its `data_type` assertion |

#### `packages/three-adapter` — 8 entries, 11 cases

**`tests/kitchen-shell.characterisation.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 241 | takes the room, so no caller can build a shell without naming one | 1 | toHaveLength(2) reads the function's declared arity, which the compiler enforces at every call site. It stays green if the room parameter is ignored (the five characterisation rows at :232 catch that) and cannot detect a caller omitting it. | **T2 kept** — review wrong: the only test of this behaviour, and the compiler does not enforce it once the parameter has a default |
| 317 | declares these three, under these ids, in this order / $id stands where HEAD puts it | 4 | The triples are a live specified value (viewingDirectionOf reads them, src/stage.ts:404), but another test already pins them: qa-7h-preset-stands-clear.adversarial.test.ts:208-:223 asserts id, order, position and target of all three with one toEqual. The four cases here restate that. | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |
| 347 | is measuring the seeded room the presets were framed on | 1 | Restates KITCHEN_L_DESIGN.room's three numbers; no adapter code runs. A moved seed room already turns kitchen-shell.characterisation.test.ts:229 red (floor 3.86 x 3.22 and wall heights are recorded per child) and :339 (514.9 px). Diagnostic value only. | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/overflow-mark.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 85 | stays red rather than drifting into the void meshes' blue | 1 | A mark turned blue is already caught, more strictly, by qa-6m-mark-composite 'a washed pixel is never counted as a void's blue fill' (:260-262), which blends OVERFLOW_MARK_COLOR at production opacity over every fixture base and brightness. This case reads the bare constant only. | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/perete-a-framing.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 94 | puts the seeded room inside that band, but only just | 1 | Compares fixture/test-local constants only. A seeded room outside the band already fails :115 (panel.isVisible) and an empty band makes fc.integer throw in the property at :104; the 41 mm literal re-pins the 3560 seed width (and contradicts the comment's 40). | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/qa-6m-mark-composite.adversarial.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 368 | is counted as a mark by the mark's own threshold, which is why that gate counts nothing selected | 1 | Arithmetic on SELECTION_HIGHLIGHT_COLOR alone (red excess 210 > 50); no code path runs and nothing depends on the selection being red-dominant, the comment at :357-362 says the gate is sound for another reason. A moved selection colour is already caught by overflow-mark.test.ts:82 (distance 90) and this file's :376 (242.49). | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/sink-declaration.parity.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 184 | is not a kind test, because the sink rows share their kind with rows that hold none | 1 | declaresASink(base-3drawer) false is already the base-3drawer row of the iff sweep at :126 (a kind-based declaresASink fails there). The kind literals are catalogue data, pinned for the same stated premise in configurator-domain/tests/queries/sink-accessories.test.ts:85-88. | **T2 deleted** — the Keep test went red under a mutation; logic review: sound |

**`tests/stage.test.ts`**

| Line | Test | Cases | Why | Status |
| --- | --- | --- | --- | --- |
| 370 | does not reproduce the reference triples at the seeded room | 1 | The [1.9, 2.1, 5.6] literal is pinned with all three reference triples at kitchen-shell.characterisation.test.ts:311-330. The negative half only fails if the seeded room returns the reference targets again, which stage.non-u-presets.test.ts:296 (seeded-room row, toEqual) and perete-a-framing.test.ts:119 (596.2 px) already catch. | **T2 deleted** — Keep test red under mutation. The Keep reference above is stale (that block went under row 3210); the camera triples are pinned by `qa-7h-preset-stands-clear.adversarial.test.ts` "leaves the recorded reference triples exactly where they were" |

## Appendix — candidates that were raised and then cleared

Listed so nobody re-flags them. `killed` means a mutation turned the test red: it is an honest test.

| Test | Raised as | Outcome | Why it stays |
| --- | --- | --- | --- |
| `apps/web/tests/app/api/designs/visitor-identity.test.ts:241` | near-duplicate | refuted | Mints twice with NO cookie carried (two fresh contexts). The property at :257 carries the previous cookie from the 2nd mint on and resets seenValues per run, so a cookie-less mint drawing a constant/seeded value (visitor.ts:62) passes the property and fails on |
| `apps/web/tests/app/api/designs/visitor-identity.test.ts:353` | near-duplicate | refuted | Every cell of qa-7e3a's D6 matrix sends a visitor cookie (qa-7e3a-visitor.adversarial.test.ts:232). These six send none, which is the real attack shape (a cross-site POST carries no SameSite=Lax cookie). Gating isCrossSiteRequest on 'a visitor cookie is presen |
| `apps/web/tests/app/configurator/configure/back-confirmation.dom.test.ts:251` | fake-check | killed | The test is a self-declared declaration pin and fails when the declaration changes; it does not (and says it does not) measure layout. Only a differently-spelled but equivalent declaration (place-content) would trip it, which is brittleness, not a hollow check |
| `apps/web/tests/app/configurator/configure/back-confirmation.dom.test.ts:306` | fake-check | killed | Both source-text cases go red when the real wiring is removed or loosened. Residual weakness (not tested by mutation): the regex would still match if the real handler were deleted and the text left in a JSX comment. |
| `apps/web/tests/app/configurator/configure/qa-0104-the-stacking-table.adversarial.test.ts:115` | fake-check | killed | Both source-text nesting checks go red when the child is genuinely moved out of its cell. They are regex brittle (a nested div before the child would make them miss) but not hollow. |
| `apps/web/tests/app/configurator/configure/qa-w4-top-bar.adversarial.test.ts:143` | near-duplicate | refuted | Two of three assertions repeat top-bar-box.test.ts:269, but the count `stylesheet.match(/grid-template-rows:\s*76px/g)).toHaveLength(1)` is unique: a second 76px row track declared in another rule or breakpoint of configure.module.css reddens only this. If the |
| `apps/web/tests/app/configurator/configure/qa-w4-top-bar.adversarial.test.ts:179` | fake-check | killed | Both go red on the behaviour changes their titles name (sentence returns to the bar; sentence no longer mounted on the scene). The '#fdf6ec' literal is incidental extra pinning. |
| `apps/web/tests/app/configurator/configure/selection-debug-availability.test.ts:37` | useless | refuted | Renaming BOTH the constant and selection-debug.tsx:25's literal to an un-prefixed name keeps every vitest green (qa-7h tests stubEnv through the constant; Node's process.env is real) while the browser bundle reads undefined. This is the only unit-level pin of  |
| `apps/web/tests/app/configurator/configure/top-bar-box.test.ts:300` | fake-check | killed | The arithmetic line `STRIP_BAND_AT_BASE_COMMIT_PX - RULED_CANVAS_COST_PX` (45 - 21) is static (two file-local constants), as the reader said, but the case's first assertion `declarationsOf(stylesheet,'settingsRow')).toBe('')` reads the production stylesheet an |
| `apps/web/tests/app/configurator/configure/top-bar-fit.test.ts:281` | useless | refuted | Its one production input is FRAME_2A_SPACING.navGapPx (top-bar-fit.ts:17, a reference value from frame 2A). No test pins that 9 literally; this is the only assertion tying it to the browser-measured 698.98, and it is the declared non-vacuity check for the deri |
| `apps/web/tests/app/configurator/configure/use-back-guard.review.dom.test.ts:179` | near-duplicate | refuted | Different origin state: here the kitchen was never edited, so no guard is recorded (guardedPathname null); the twin calls edit() first. Making forgetOriginIfTheEditorHasBeenLeft (use-back-guard.ts:336) forget only when a guard was pushed reddens this and leave |
| `apps/web/tests/app/configure-screen-arrival.dom.test.ts:427` | near-duplicate | refuted | With nothing selected, deselect() changes no store state; only the captured pointer gesture can cancel the arrival. Detecting cancellation by a selection change instead of the pointerdown/up listeners (use-honour-arrival.ts:216) leaves :438 green (it selects O |
| `apps/web/tests/app/configure-screen-review-link.dom.test.ts:119` | near-duplicate | refuted | Sets store.designId, so the owner variant would take the <a href> arm (configure-screen.tsx:265). The twin's store has no designId (shared-variant.test.ts:9-15), so it only exercises the <span> arm. Gating just the span arm on variant==='owner' reddens this an |
| `apps/web/tests/app/configure-screen-shared-variant.test.ts:81` | near-duplicate | refuted | It is the positive control for :64's three not.toContain test-id assertions in the same file. configure-room-navigation.test.ts:61 never asserts data-testid="top-bar-back" or "bottom-bar-back" (only hrefs and labels), so renaming either id reddens only this —  |
| `apps/web/tests/app/review-arrival.dom.test.ts:222` | near-duplicate | refuted | Different store state: an unsaved edit is pending (hasBeenEdited true). A review screen that flushed or re-triggered the pending save on arrival would fetch here and not in :142's clean arrival; that is the plausible defect this state exists to catch. |
| `apps/web/tests/app/review-screen.dom.test.ts:154` | useless | refuted | The DOM-order tests compare the screen to REVIEW_READING_ORDER itself, so only a literal pin can see the constant being reordered. review-model.test.ts:290 pins only notIncluded before callToAction; disclaimer < overflowWarning < refusal < figure is pinned her |
| `apps/web/tests/app/review-stylesheet-classes.test.ts:74` | fake-check | killed | The case is a counterfactual on the test's own helpers (renames .groups in the stylesheet text, then diffs against what review-screen.tsx names), so it is red only when the screen stops using styles.groups; mutating any other class leaves it green. It checks t |
| `apps/web/tests/app/review-stylesheet-classes.test.ts:102` | useless | refuted | The 15/10 px gaps and the column direction are frame 3A's spacing, added after a shipped defect where the groups stood 0 px apart; nothing else pins them. ruleBody taking the first rule is a weakness of the check (a later override escapes it), not evidence it  |
| `apps/web/tests/app/room-page.test.ts:90` | obsolete | refuted | Not obsolete: the subjects exist. The first three assertions do duplicate configure-screen-single-mount.test.ts:43, but the rest pin the live readiness-probe URLs in playwright.config.ts and scripts/capture-fidelity.mjs and forbid a /configurator/configure rou |
| `apps/web/tests/app/shared-design-page.test.ts:71` | fake-check | killed | The page-level equality does catch a response that depends on the token. Reader is right only that 'revoked' is the same mocked { kind: "none" } as 'unknown', so whether the repository returns none for revoked is not exercised here. |
| `apps/web/tests/app/shared-design-view.dom.test.ts:106` | near-duplicate | refuted | beforeEach puts the very same KITCHEN_L_DESIGN object in the store with canWrite:true, so here hydrateSessionStoreInBrowser's guard (shared-design-view.tsx: session.design === design) SKIPS hydration; :90 passes a clone and hydrates. Deriving the variant from  |
| `apps/web/tests/e2e/linear-flow.desktop.e2e.spec.ts:21` | near-duplicate | refuted | runLinearFlow uses click() and toBeVisible() on Step 1's controls and the editor (support/linear-flow.ts:83-110,134), so each step asserts actionability in the 1440 px layout. A desktop-breakpoint rule that hides or covers room-continue, a shape card or room-c |
| `apps/web/tests/e2e/pixel-counter-witness.desktop.e2e.spec.ts:348` | near-duplicate | unsure | Same MARK threshold, limit and presets as adversarial:285, but a different document: this file's own storeAKitchenWearing leaves walnut fronts over oak structural bodies (comment at :381), while the adversarial rows are whole-walnut and whole-oak. A mixed scen |
| `apps/web/tests/e2e/price-breakdown.desktop.e2e.spec.ts:110` | near-duplicate | refuted | The desktop shell is a different surface: a popover anchored in the top-bar price cell, opened by a mouse click, under the stylesheet's desktop branch. These are the only 1440 px checks that focus enters and returns and that the popover carries the model; a de |
| `apps/web/tests/e2e/qa-7j-straight-captures.desktop.e2e.spec.ts:16` | green-only | refuted | Not green-only for what it claims. It produces the desktop-* capture files (a distinct artefact for visual review, A17) and asserts that the straight flow at 1200, 3700 and 6000 mm reaches the editor at 1440 px, that depth 700 applies, and that no pageerror fi |
| `apps/web/tests/e2e/qa-7j-straight-captures.e2e.spec.ts:18` | green-only | refuted | The title promises a capture set, not a layout check, and the spec is a capture producer (A17) with real assertions: Step 1 accepts 1200/3700/6000 mm, the editor opens, depth 700 applies, both presets stand, and expect(errors).toEqual([]). A throw while compos |
| `apps/web/tests/e2e/qa-m7c-c1-s3-back.adversarial.e2e.spec.ts:165` | near-duplicate | refuted | Mutually flagged with s05.1; confirming both deletes all coverage. The assertions are measured layout (computed justify-content, stay.left against the footer's padding, the gap) and global-settings.module.css has a desktop branch from :541, so a rule in the ba |
| `apps/web/tests/e2e/room-late-echo.e2e.spec.ts:54` | fake-check | refuted | Not fake: on local next dev each kept gap, 415 and 430 ms included, was measured red against the old rule 3 of 3 (file header, KEYSTROKE_GAPS_MS comment). On CI they remain true behavioural assertions (the typed digit and the settled URL); they are merely not  |
| `apps/web/tests/e2e/seeded-design.qa.e2e.spec.ts:21` | green-only | refuted | Load-bearing in a serial chain: it pushes the first id that :27 (toHaveLength(1), not the same id) and the teardown observer (three ids, all gone) depend on. The finding's mutation — a fixture returning a constant id — reddens :27. Removing this case breaks th |
| `apps/web/tests/e2e/top-bar-back.qa-m7c-c1-s3.adversarial.desktop.e2e.spec.ts:215` | near-duplicate | refuted | Mutually flagged with s04.5. Layout is measured in the 1440 px shell, where global-settings.module.css's @media (min-width: 900px) branch (:541) applies; a desktop rule centring the footer or changing its padding reddens only this run. |
| `apps/web/tests/e2e/top-bar-pill-containment.e2e.spec.ts:415` | green-only | refuted | The title overstates (30 px is not asserted here; top-bar-box.test.ts pins it from the CSS), but the check does its stated job: it is the non-vacuity guard for the touch-target case above it. Meeting the 44 px target by giving the pill min-height: 44px (the ch |
| `apps/web/tests/e2e/top-bar.desktop.e2e.spec.ts:224` | fake-check | refuted | Not a fake check: the first half measures the partition (header + canvas = viewport) and canvasTop = 76, which catch a second band returning. Only the trailing arithmetic restates viewport - 76 from constants; that tail could be trimmed, the case cannot. |
| `apps/web/tests/e2e/top-bar.e2e.spec.ts:190` | near-duplicate | refuted | Given the partition at :175, this reduces to 'the price bar is 92 px at 844' — which :175 does not assert. A price bar that grows (a second line) keeps the partition true by shrinking the canvas: :175 stays green and this goes red, which is the canvas loss the |
| `apps/web/tests/e2e/u-flow.desktop.e2e.spec.ts:20` | near-duplicate | refuted | As s03.8: runUFlow clicks and awaits visibility of Step 1's controls and the editor at 1440 px (support/u-steps.ts:31-63). A desktop-breakpoint regression hiding or covering one of them reddens only this run. |
| `apps/web/tests/lib/security-headers.test.ts:51` | near-duplicate | refuted | Not a strict subset in what it protects: :30 is a whole-list snapshot that any deliberate header edit must rewrite in the same commit, at which point it accepts '; preload', a shorter max-age or a dropped camera=(). :51/:61 are the only assertions that still o |
| `apps/web/tests/panel/cabinet-thumbnails.test.ts:111` | near-duplicate | refuted | Different failure mode: :45 uses existsSync, which on the default case-insensitive macOS filesystem accepts a wrong-case filename (and any non-.svg path); :111 compares against readdirSync names exactly. A table entry 'Wall-1-door.svg' is green at :45 locally  |
| `apps/web/tests/panel/panel-model.adversarial.test.ts:137` | near-duplicate | refuted | Real location panel-model.qa.test.ts:137. Not the same inputs as :107: here widthOptions stay non-empty when canWidth is false (default at :54), whereas :107 passes [] (:120-122). Those 16 combinations (width section present on a canWidth:false body, ADR 0049) |
| `apps/web/tests/panel/panel-model.adversarial.test.ts:179` | near-duplicate | refuted | Real location panel-model.qa.test.ts:179. Same input-class difference as s07.19: with canWidth false it keeps non-empty width options, which :107 never renders. A change surfacing a fixed-width body's reason as a 'rejection' banner with no refusal fails only h |
| `apps/web/tests/panel/panel-model.read-only.test.ts:149` | useless | refuted | Line 288 is not copy-only: it asserts saveStatus 'error' yields notice.kind 'save-failed' with saveFailedNotice. The negative claims (:154-156, :298) are deliberate 6B-j allow-listed constraints (no way back that does not exist, ADR 0115; no reload advice); th |
| `apps/web/tests/panel/panel-model.test.ts:317` | near-duplicate | refuted | Different input class from qa:364: two offers share buildId 'base-cabinet' and only one is current (a merged cabinet's two door counts, ADR 0033). A panel that derived isCurrent by matching buildId, or keyed rows by buildId, badges both rows - red here, green  |
| `apps/web/tests/panel/qa-6p-finish-dom.adversarial.test.ts:325` | near-duplicate | refuted | Different input: clickSwatch runs on KITCHEN_L_DESIGN with no materialTierId (:272, comment :322), i.e. the default-material path through materialOfDesign and setFinish; qa-6q-a:230 sets the tier explicitly via withMaterial. A change to the absent-tier default |
| `apps/web/tests/panel/qa-6q-a-refusal-surface.adversarial.test.ts:270` | obsolete | refuted | Not obsolete: the five names are still live in the domain as the legacy-key migration table (packages/configurator-domain/src/materials.ts:301-322), and test ids are finish-${chip.value} (editor-panel.tsx:397). It is the only literal guard that those keys neve |
| `apps/web/tests/panel/qa-6r-control-shape.adversarial.test.ts:258` | useless | refuted | The hexes are ADR 0091 owner-ruled product values, and this is the only test pinning them through swatchOf (what the panel swatch publishes). three-adapter's qa-0099b DRAWN table holds the same hexes but for what the scene draws; :266's anti-vacuity guard depe |
| `apps/web/tests/panel/width-stepper.qa.test.ts:391` | near-duplicate | refuted | Different boundary and entry point from empty-line-wiring:142 (synthetic one-body design, hook): this drives the shipped kitchen, presses p4's -50 step and needs the engine to derive a selectable 50 mm void, then asserts no rows, no count line and the too-narr |
| `apps/web/tests/panel/width-stepper.qa.test.ts:463` | useless | refuted | Same class as s07.22: deliberate 6B-j allow-listed constraints on owner-approved wording (no unavailability disclaimer, no universal 300 floor, no appliance claim for a bottle cargo - ADR 0026). The copy lock pins the current text, not the rule, so a re-approv |
| `apps/web/tests/panel/width-stepper.test.ts:448` | near-duplicate | refuted | Stricter oracle than :412: the expected label is the literal entryLabel('base-hob-2drawer') and width 600, whereas :412 derives both through production code (describeWidthLabelOf uses resolveCatalogEquivalent/toInsertableBody, :498). A resolver that mapped the |
| `apps/web/tests/panel/width-stepper.test.ts:462` | near-duplicate | refuted | Stricter assertion than either cited twin: it requires the domain command to refuse with code NOT_RESIZABLE; qa-5b5:395 only requires lastRejection non-null through the store, and :412 checks the chip, not the command. setWidth refusing p2@600 for a different  |
| `apps/web/tests/persistence/client-write-path.test.ts:91` | near-duplicate | refuted | Different race window: both commands land in the same tick, before any mint request has been issued; adversarial:110 only adds commands after the POST is observed in flight (:117-118). A dedup that records the in-flight mint a microtask late double-POSTs here  |
| `apps/web/tests/persistence/client-write-path.test.ts:106` | near-duplicate | refuted | Near-identical sequence, but it asserts the refusal code (VOID_SELECTED) where adversarial:216 accepts any non-null rejection. A void command refusing for a different reason is red here only. Marginal: the unique part is one assertion. |
| `apps/web/tests/persistence/create-design-lock.test.ts:145` | fake-check | killed | Honest but narrow: the release itself is FakeLockManager's `finally`, so the case only fails if production leaves the callback unsettled. That mutation also reddens the 'propagates' neighbour, so the case is not independently discriminating. I did not verify a |
| `apps/web/tests/persistence/fetch-configuration-repository.adversarial.test.ts:359` | near-duplicate | refuted | Not the union of :58 and :92: :58 asserts only the POST count for overlapping saves, while this requires three PUTs, i.e. both overlapping saves still wrote. Collapsing overlapping saves into one write passes :58 and :92 and fails here. Overlaps fetch-configur |
| `apps/web/tests/persistence/fetch-configuration-repository.test.ts:158` | near-duplicate | refuted | Asserts two PUTs as well as one POST for the overlapping pair (:183-185); the cited twin adversarial:58 checks the POST count only. A repository that deduplicated the whole overlapping save drops a write and fails here, not at :58. Overlaps adversarial:359 (s0 |
| `apps/web/tests/price/price-bar-model.test.ts:188` | near-duplicate | refuted | Only case in the model suite that pins the label on an OVERFLOWING design; :89 pins it on the fitting one and :172 only the warning. A change in describePriceBar that relabels a flagged total reddens this and leaves both green. Its duplicate is states.adversar |
| `apps/web/tests/price/price-bar-states.adversarial.test.ts:279` | near-duplicate | refuted | barMarkup puts lastRejection into the mocked useConfiguratorStore (states.adversarial:51-61). If PriceBar started reading the store and drew a refusal line while unpriced, this goes red and :274 stays green; it is the rendered guard for the owner's 2026-09-09  |
| `apps/web/tests/price/price-breakdown-copy.test.ts:149` | obsolete | refuted | Both mockups still draw the caret (grep '⌃' in docs/design/mockups: Desktop 2, Mobil 1), and the owner ruling supersedes them. An implementer following frame 2A who re-adds the glyph to price-breakdown.tsx is caught only here. The DISCLOSURE_GLYPH and .chevron |
| `apps/web/tests/price/price-breakdown-model.test.ts:186` | near-duplicate | refuted | withLines(SHIPPED_PRICING, []) keeps a non-zero totalMinor with no lines; aud-014:102 prices a real empty design (total 0). Deciding 'nothing to break down' by totalMinor === 0 instead of 'no cabinet line' reddens this and leaves aud-014 green. |
| `apps/web/tests/price/qa-m6-wave-b-tier-deltas.adversarial.test.ts:158` | near-duplicate | refuted | Only assertion that the HARDWARE tier list survives the collided book (the collision edits a hardware tier); group-keys:107 checks material only. De-duplicating or dropping hardware tiers when the book is refused reddens this alone. |
| `apps/web/tests/price/starting-price.adversarial.test.ts:381` | obsolete | refuted | Both mockups still print 'neschimbat' (grep docs/design/mockups: 1 hit each), so the tombstone guards a live owner ruling. Reads the raw catalogue, so it sees every ICU branch; starting-price.test.ts:37 renders with one argument. Of the pair, keep this one. |
| `apps/web/tests/price/starting-price.adversarial.test.ts:411` | near-duplicate | refuted | price-bar-layout:436 checks the label's base cascade holds lowercase and the container holds no text-transform. An @media override setting the label to uppercase leaves it green and reddens this file-wide not-contain. |
| `apps/web/tests/proxy.test.ts:70` | near-duplicate | refuted | Runs with NODE_ENV=test, so isDevelopment is true (src/proxy.ts:32); :40 stubs production. It is the only case holding frame-ancestors, object-src, base-uri and strict-dynamic on the development branch of the policy builder. |
| `apps/web/tests/review/qa-8c-room-line-and-copy.adversarial.test.ts:315` | fake-check | killed | Not static: the kitchens come from the domain's generateKitchen via tests/support/varied-kitchens, so the case does fail if the generator stops varying body counts. It guards the fixture's reach, not the review model's copy, which matches the reader's own desc |
| `apps/web/tests/review/review-parity.test.ts:242` | fake-check | killed | The group fed to `expect(readsInAdr0063Order([group])).toBe(true)` comes from generatePricedKitchen -> domain projectDesignForDisplay, so it is production-fed; the reader's 'only a fixture' reading is wrong. The second assertion (transposed copy is false) is t |
| `apps/web/tests/review/review-submit-eligibility.test.ts:269` | fake-check | killed | The case calls the real domain query on EMPTY.design, so it fails when that query misbehaves. It does not exercise review-model.ts, as the reader said, so an apps/web edit cannot turn it red; the claim 'fake-check' is too strong for a test that pins the domain |
| `apps/web/tests/review/review-submit-precedence.test.ts:192` | near-duplicate | refuted | Asserts per row the view kind and the exact submission, named bodies and labels included; qa-8c's table checks the code and bodies.length > 0 only. A refusal naming one body too few, or a wrong view kind for nothing-sold, reddens this alone. |
| `apps/web/tests/room/plan-preview-model.pre-7l.test.ts:137` | obsolete | refuted | Still a live differential oracle: it sweeps every approved L and straight length against a swept preview box. A scaling or rounding change at a box size outside the 11 literal plans in l-and-straight-pins reddens only this. That wave 7L is done does not retire |
| `apps/web/tests/room/qa-7f1-copy-and-conversions.adversarial.test.ts:74` | useless | refuted | It is the only anti-vacuity guard for it.each(ROOM_KEYS) at :91: if the namespace or catalogueLeaves moved, ROOM_KEYS would be empty and both later checks would pass on nothing. The exact 72 could be relaxed to > 0, which the copy lock makes safe. |
| `apps/web/tests/room/qa-7f1-d45-convergence.adversarial.test.ts:211` | near-duplicate | refuted | It is a true pair with room-query-sync.test.ts:207 (finding s14.26), but this is the one to keep: its generator is the superset on every arm the parser branches on (comma decimal '3,56', trimmed ' 3.56 ', zero-padded '0003.56', the largest safe value 900719925 |
| `apps/web/tests/room/qa-7f1-d45-convergence.adversarial.test.ts:293` | near-duplicate | refuted | The property at :263 compares after re-parsing the href through URLSearchParams(...).toString(), which normalises encoding; this case compares the raw href string, and deterministically for a full six-key U (the random generator reaches a fully parsed U in wel |
| `apps/web/tests/room/qa-7f1-d45-convergence.adversarial.test.ts:953` | near-duplicate | refuted | The twin (s4 dom :402) and room-one-c.dom.test.ts:713 assert Continue disabled on the first frame only; this asserts it after settle(), i.e. after the convergence loop has rewritten the U link (it drops direction) and the screen re-derived. The s4 dom sequence |
| `apps/web/tests/room/qa-7f1-url-seam.adversarial.test.ts:505` | near-duplicate | refuted | Its last two expects are unique: the corner control carries no aria-invalid and room-corner no error class while the parser marks direction. A screen that derived the toggle's invalid state from parseRoomUrlState's markedFields turns this red and leaves :470 ( |
| `apps/web/tests/room/qa-7f2-s1b-millimetres.adversarial.test.ts:112` | near-duplicate | refuted | The two rows are not the same string: xxd shows line 104 is '3 600' with U+0020 and line 112 is '3\u00a0600' with a no-break space (bytes c2 a0), the form a pasted formatted number carries. A parser that trimmed or normalised ordinary whitespace but not NBSP ( |
| `apps/web/tests/room/qa-7f2-s4-shape-refusal.adversarial.test.ts:75` | obsolete | refuted | The header's premise is stale (the domain now accepts straight rooms; so is the comment at room-issue-model.ts:187-188), but the group still guards live behaviour: that the gate is the domain's answer and not a bound read locally. Replace validateRoomInput in  |
| `apps/web/tests/room/qa-7f2-s4-shape-refusal.adversarial.test.ts:126` | near-duplicate | refuted | Different entry point: this goes through presentOneC with isLinearSuggested derived by the real model; one-c-surfaces.test.ts:172 calls stillShowing directly on a view with the flag forced true. A presentOneC that dropped or overrode the suggestion mid-burst,  |
| `apps/web/tests/room/qa-7f2-s4-shape-refusal.adversarial.test.ts:140` | near-duplicate | refuted | Same reason as s12.11: presentOneC plus the real model's flag against stillShowing with a forced flag (one-c-surfaces.test.ts:156). A presentOneC that passed now.isLinearSuggested through unfiltered mid-burst is caught only here; it also asserts roomReasons [] |
| `apps/web/tests/room/qa-7f2-s5-incomplete-plan.adversarial.test.ts:353` | near-duplicate | refuted | :213 relates the plan to the parser only; that a 1C surface implies 1C is a fact about deriveRoomIssueView, which is what this asserts. A model that showed the note or a reason at 1B with a wall missing turns this red and leaves :213 green. The reader's point  |
| `apps/web/tests/room/qa-7f4a-row-honesty.adversarial.test.ts:193` | fake-check | killed | Second expect is not strictly satisfied by construction: it goes red (deep-equal on the extents arrays) once pending rows diverge from resolved ones. But any change to resolved extents alone is already caught by the first expect, so the second adds little; a c |
| `apps/web/tests/room/qa-7f4b-handoff.adversarial.test.ts:793` | useless | refuted | Only the Romanian expect is covered elsewhere (DOM :737-744, and romanian-copy-lock.test.ts:16). The two Russian expects are not: there is no Russian copy lock, the golden hashes are Romanian only, and the DOM cases render ro. A Russian saveFailed left equal t |
| `apps/web/tests/room/qa-7j-straight-room-url.adversarial.test.ts:79` | near-duplicate | refuted | The DOM twin (:344) asserts the substate only. On the two 1C rows this asserts markedFields equals ['wallA'], the title's 'naming only wall A'. A parser that also marked height or shape for an out-of-range straight wall reddens these and leaves the twin green; |
| `apps/web/tests/room/qa-u5-marked-labels.adversarial.test.ts:111` | near-duplicate | refuted | A deterministic pin of the known counterexample (both ru labels on one row at 2700 x 850 x 850). The sweep at :75 can draw it but samples 2000 points from a space of about 3300 x 3700 x 3700, so it does not hold this point on any given run. |
| `apps/web/tests/room/room-draft.test.ts:123` | fake-check | killed | Breaking the delegation turns it red, but only when fast-check happens to draw a digit-only string (1 of 3 runs missed), so detection is probabilistic. A leading-zero strip before parsing was an equivalent mutation and survived. A parser change moves both side |
| `apps/web/tests/room/room-handoff.dom.test.ts:532` | near-duplicate | refuted | The twin (:642) only sees a re-composition if the second design differs, which rests on createdAt moving between two real-clock calls. This asserts the call count directly, so a retry that re-composed with the same stamp, or within the same millisecond, turns  |
| `apps/web/tests/room/room-issue-model.test.ts:534` | near-duplicate | refuted | The it.each at :517 uses a derived oracle, !isShapeBuildable(shape, APPROVED_ROOM_POLICY), so it agrees with whatever the policy says. This is the literal statement that the approved policy refuses none of the three: drop a shape from APPROVED_ROOM_POLICY and  |
| `apps/web/tests/room/room-one-c.dom.test.ts:676` | fake-check | killed | The 'A long' and 'B long' arms went red: the screen's Continue does not follow parseRoomUrlState alone, so the oracle is not a pure tautology. The other 8 arms are unaffected by this mutation (not independently proved). The sibling group at :837 ('shows exactl |
| `apps/web/tests/room/room-one-c.dom.test.ts:725` | near-duplicate | refuted | Against the cited twin (:704, a U) it is a different input class: a straight room asks for wall A and the height only. A continue gate that still required wall B, or an approved policy that lost linear, reddens this and leaves the U case and the rest of this f |
| `apps/web/tests/room/room-screen.dom.test.ts:388` | near-duplicate | refuted | The only case that pushes from an L, and the one that subsumes :355 (s14.28). An approved policy that lost L, or a push that mishandled a shape carrying a corner, reddens this and leaves the U case at :372 green. |
| `apps/web/tests/room/room-url-state.test.ts:139` | near-duplicate | refuted | Weak, but not a subset: :90 pins the key list for one fixed input per shape (a left-turning L), and the round-trip properties ignore extra keys. This runs over ANY_PARSED_INPUT, so a serialiser that emitted a forbidden key conditionally on a value (for a right |
| `apps/web/tests/room/room-url-state.test.ts:463` | near-duplicate | refuted | It asserts markedFields: ['shape'], which step-one-carries-a-u.test.ts:163-166 does not (substate and issues only). A parser that marked nothing, or marked the lengths, under a shape refusal reddens this and leaves the twin green. |
| `apps/web/tests/scene/overflow-warning-viewport.test.ts:351` | fake-check | killed | The test reads the real reserved-height constant and --touch-target from globals.css, so it is not static and goes red when the constant changes. As the reader said, it never looks at whether the real band is in flow: flipping .sceneFooter to static leaves it  |
| `apps/web/tests/scene/qa-6m-criteria.adversarial.test.ts:155` | fake-check | not-runnable | The claimed purpose (guard overflow-mark.test.ts's LARGE_REMAINDER_DESIGN) cannot be mutation-tested without editing a test file, which the rules forbid. Static reading agrees with the reader: the test builds its own inline filter at :159 and asserts on that c |
| `apps/web/tests/settings/global-settings-model.test.ts:153` | near-duplicate | refuted | Low stakes, but it is the only view built over exactly one body, the singular boundary between the cases at 0 (:161) and 2 (:135). A model that mishandled a single-entry projection is caught only here; the grammar itself is the catalogue's and is not what this |
| `apps/web/tests/settings/global-settings-seams.test.ts:189` | near-duplicate | refuted | This is the case that tells 'the store's design' from 'a fixed list'. A GlobalSettings that projected KITCHEN_L_DESIGN instead of the design in the store passes :179, which uses the seeded design, and fails here on the wall-B-only one. |
| `apps/web/tests/settings/material-reset-confirm.adversarial.test.ts:181` | near-duplicate | refuted | The 22/53 split is arithmetic once :172 holds, but the pin on MATERIAL_CHANGES_IN_THE_SQUARE (11) lives only here and is the one guard on the hand-written oracle: an implementation comparing id strings (24) with the table edited to match stays green at :172 an |
| `apps/web/tests/settings/material-reset-confirm.adversarial.test.ts:341` | near-duplicate | refuted | It is the broadest of the cedilla checks, not a copy of them: it sweeps every leaf under roMessages.globalSettings, where global-settings-model.test.ts:430 covers the two anchors, material-reset-confirm.test.ts:346 a handful of named strings and starting-price |
| `apps/web/tests/settings/material-reset-confirm.test.ts:274` | near-duplicate | refuted | Not cells of the adversarial table. That table injects a count and always prices the one MDF fixture; this file's viewFor (:108-135) takes the count from countCabinetsWearingAChosenFinish(design) and prices each row's own design, including one whose stored mat |
| `apps/web/tests/settings/qa-0099-global-colour.adversarial.test.ts:492` | fake-check | killed | The oracle branches on materialOffersFinish, the predicate production uses, so a change to that predicate moves both. But the test does call resolveOpeningChoice and goes red when the drop is removed, so it is not a no-op check. |
| `apps/web/tests/settings/qa-6t-negative-delta.adversarial.test.ts:150` | near-duplicate | refuted | The delta half is duplicated (6w :327's invertsInIntegers is algebraically amount < 0), but :156 also asserts hardware.tiers ids equal the book's list, in order, for every population. A change that reorders or duplicates an offered tier on some population leav |
| `apps/web/tests/settings/qa-6w-below-default-tier.adversarial.test.ts:472` | near-duplicate | refuted | It asserts error.name === 'NegativeTierDeltaError' (whole-kitchen-tiers.ts:65), which :446 does not: toThrow(new Error(...)) and toThrow(string) compare the message (inference from vitest semantics, not run). Deleting `this.name = ...` turns only this case red |
| `apps/web/tests/settings/qa-w2-locked-surface-reach.adversarial.test.ts:126` | near-duplicate | refuted | It also asserts title="<disabledReason>" on the confirm button (:138). global-colour-group.test.ts:306 only matches `data-testid="global-settings-confirm"[^>]*disabled=""`. Removing the title spread at global-settings.tsx:573-574 turns this red and leaves the  |
| `apps/web/tests/settings/qa-w2-locked-surface-reach.adversarial.test.ts:218` | obsolete | refuted | The comment is stale (the prop is required at global-settings.tsx:376) but the guard is live: replacing `editability={editability}` at :330 with a hard-coded writable object type-checks and no unit test sees it. global-settings-inert.dom.test.ts opens the shee |
| `apps/web/tests/settings/qa-w2-popover-viewport-clamp.adversarial.test.ts:142` | near-duplicate | refuted | This one reads max-height from the desktop (last) .surface rule and anchors the whole value; centring :159 searches the entire stylesheet for the clamp expression anywhere. Moving the clamp off the desktop .surface (to .body, or to another rule) while the expr |
| `apps/web/tests/settings/qa-w2-popover-viewport-clamp.adversarial.test.ts:179` | near-duplicate | refuted | It asserts the breakdown's desktop surface hangs at top: 100% / calc(100% + Npx) (:185). Centring :206 asserts position: absolute, right: 24px, left: auto and no margin-inline, never `top`. Changing the popover to `top: 128px` (still absolute) is caught only h |
| `apps/web/tests/settings/settings-pill-fit.test.ts:229` | useless | refuted | It is the only test that fixes the margin's value (ADR 0104 decision 9). The oscillation case at :237 adds hysteresisMarginOf(DESKTOP_PILL) to the boundary itself, so it stays green if the function returns separator + gap + 1 or a constant; no other test refer |
| `apps/web/tests/store/cabinet-depth-legacy-fallback.test.ts:449` | fake-check | killed | The test reads columns the store derives on load from a source-stripped document, so a load path that re-stamps sources empties 'reached' and the test fails. It is an honest non-vacuity witness. |
| `apps/web/tests/store/command-result-reconciliation.test.ts:35` | fake-check | killed | The web call and the domain call are separate invocations with their own inputs, so wiring errors in the adapter diverge from the expected value. |
| `apps/web/tests/store/configurator-store.test.ts:323` | useless | refuted | Weak but not empty: it is the only runtime tripwire for 'derived state has no setter' and goes red on the conventional names (setRecords, setColumns, setVoids, setPlacements). The finding's own mutation turns it red; the type does not forbid adding such a memb |
| `apps/web/tests/store/empty-column-ceiling.test.ts:217` | near-duplicate | refuted | It pins the distribution [750, 100] at 450 and [800] at 500. qa-5g :216 asserts only the column count and the summed width, so a regrow that consumed the far column instead of the near one (700 + 150, or 800 + 50) passes the twin and fails here. |
| `apps/web/tests/store/empty-columns-reload.test.ts:444` | near-duplicate | refuted | Its reloaded-vs-session comparison goes through sortedVoids (empty-columns-reload.test.ts:91), which includes dMm, xMm, zMm, spanY0Mm, spanHMm, ry and wall. qa-5h :101 compares only id, w, h and y0, so a reload that restores the refilled column's openings with |
| `apps/web/tests/store/qa-5h.adversarial.test.ts:350` | near-duplicate | refuted | Different input class: qa-5h's applyMutation inserts from INSERTABLE (:223, including base-drawer3-600 and wall-1door-300) over sequences up to 20 long, while qa-5b2b :176 and empty-columns-reload :323 insert only base-cabinet. A reload divergence on a column  |
| `apps/web/tests/store/qa-6k-a-cabinet-depth.adversarial.test.ts:73` | useless | refuted | It is the file's non-vacuity guard. The round-trip cases at :162 and :179 call setCabinetDepth without checking lastRejection, so if 700 stopped being declared they would compare an unchanged map to itself and pass (inference: I did not trace the refusal path) |
| `apps/web/tests/store/qa-6k-e-probe-lease-leak.adversarial.test.ts:208` | fake-check | killed | The test asserts the escaped probe throws after use() returns; that relies on the production lease releasing, so the reader's store-side mutation was the wrong target but a lease-side one is caught. |
| `apps/web/tests/store/qa-6k-j-fallback-rule.adversarial.test.ts:187` | useless | refuted | It checks the premise frozen-map-at-cabinet-depth.ts:292 states: no whole millimetre lies inside the 1e-9 m band around a ceiling. If toMetres drifted (e.g. mm * 0.001, giving 0.7000000000000001) the gap becomes ~1e-16 and this goes red, while :171 and :204 st |
| `apps/web/tests/store/qa-6q-b-cascade.adversarial.test.ts:133` | green-only | killed | The test asserts updatedAt === OCCURRED_AT after a real setMaterialTier, so a stamp from any other clock fails it. The reader's mutation (withPlacements once per placement with the same occurredAt, via reduce) is output-identical and stayed green across the wh |
| `apps/web/tests/store/qa-aud-005-recorded-map-offer-parity.adversarial.test.ts:203` | near-duplicate | refuted | It asserts placed.buildId === offer.buildId (:219-222); twin :129 finds the added record by id and checks only widthMm. A tap that built a different body at the quoted width, which the file's own comment says a depth change makes easy to misread, passes the tw |
| `apps/web/tests/store/qa-aud-005-recorded-map-offer-parity.adversarial.test.ts:232` | near-duplicate | refuted | It names base-sink as absent from the capped opening's list (:238). Twin :152 only sweeps whatever the list omitted, so if the list and the command both started admitting a 560 mm-aperture sink into the 500 mm opening, the twin's correspondence still holds and |
| `apps/web/tests/store/wall-end-cap-and-the-recorded-map.test.ts:269` | near-duplicate | refuted | It also asserts the published width is back to 600 (:276). qa-6j-cd :225 compares only design.emptyColumns, the recorded face, so a store that restored the record but left the published column capped at 500 passes the twin and fails here. |
| `apps/web/tests/store/whole-kitchen-settings.test.ts:139` | near-duplicate | refuted | The cited twin reads the domain package's fixture; this reads the web copy (tests/support/mdf-kitchen-wearing-chosen-colours.ts), a deliberate duplicate (ADR 0084 decision 6). An edit to the web fixture or its FINISHES_RESOLVED_BY_VENEER cannot be seen by the  |
| `packages/configurator-domain/tests/column-extents.test.ts:396` | useless | refuted | It pins a relation, not a literal: the extents cap must equal the placements cap because an extent is legal only on a key a placement is filed under. Changing design-bounds.ts:146 to MAX_EMPTY_COLUMNS or a smaller number is caught only here; :383 is self-refer |
| `packages/configurator-domain/tests/commands/6x-slide-witness.test.ts:598` | near-duplicate | refuted | Different input class: this extent's recorded source is a seeded id (depthFromBuildId 'base-dishwasher-600', :556) while 6x-a's are the insertable 'base-cabinet' (:503, :513). A slide that resolved a source's along-wall rule only for insertable ids would leave |
| `packages/configurator-domain/tests/commands/bottle-cargo-width-floor.test.ts:193` | useless | refuted | sizesMm is what the panel lists as width chips, a different observable from fit. An added size below the floor or above what the swept openings reach (e.g. [150, 200, 300]) leaves :116-190 green and shows the customer a chip the product does not have; only thi |
| `packages/configurator-domain/tests/commands/material-finish-reset.test.ts:87` | fake-check | killed | Case 'wears two different free colours' calls production sameFinish(CHOSEN_CLAY, CHOSEN_SAGE) and went red, so the reader was wrong about that case. Case 'stands the declared finishes' compares finishOf (tests/support) with the fixture's own constants and stay |
| `packages/configurator-domain/tests/commands/material-finish-reset.test.ts:124` | near-duplicate | refuted | The twin runs over a different object: apps/web/tests/support/mdf-kitchen-wearing-chosen-colours (web copy), this one over the domain package's own fixture copy. Editing a finish in the domain fixture turns only this case red; that per-package drift guard is t |
| `packages/configurator-domain/tests/commands/minimum-width.test.ts:119` | near-duplicate | refuted | Not a subset of :89, which asserts the code only. This is the only case in the file pinning params {requiredMm:560, availableMm:400} for WIDTH_TOO_SMALL on an insert into a void; dropping or mis-filling availableMm leaves :89 green. adversarial:51 pins the par |
| `packages/configurator-domain/tests/commands/minimum-width.test.ts:215` | fake-check | killed | The first expect pins the catalogue's declared floors to a literal list and reacts to a production edit. The three direction expects (SINK_MIN_WIDTH_MM > 300, 200 < 300, 200 < 300) compare file constants and cannot fail from production, as the reader said, but |
| `packages/configurator-domain/tests/commands/minimum-width.test.ts:394` | near-duplicate | refuted | Different entry point and population: this reads offer.buildsToWidthMm from offersFor (src/queries/offers.ts) for every offered entry, 'fit' rows and wall openings included; adversarial:335 calls evaluateInsertFit directly for fixed-set entries only. A wrong b |
| `packages/configurator-domain/tests/commands/minimum-width.test.ts:505` | near-duplicate | refuted | It does repeat the 400 mm row of :145, but :145 is the one confirmed for removal (s19.10). This case then holds the only offers.length > 0 guard beside the absence; the sweep at :166 passes vacuously if the 400 mm list comes back empty. Keep this one of the pa |
| `packages/configurator-domain/tests/commands/qa-5b4a.adversarial.test.ts:359` | useless | refuted | The case is not useless: its second assertion (toExactMillimetres(toMetres(2450.0005)) === 2450) pins the projection's tolerance band, and the finding's own mutation turns it red. Only the first line (Number.isInteger) is a language premise; drop that line at  |
| `packages/configurator-domain/tests/commands/qa-5b8-pantry.adversarial.test.ts:179` | useless | refuted | Nothing else pins the exact set of rows carrying doorCountFollowsWidth. qa-6bf-body-label-totality.adversarial.test.ts:180 and body-label.test.ts:53 filter by the flag, so a fourth row acquiring it is swept as consistent and stays green; only this literal list |
| `packages/configurator-domain/tests/commands/qa-6k-i-planning-map.adversarial.test.ts:298` | fake-check | killed | The case calls recordsAt -> derivePlacementRecords and counts distinct frame widths per column, so it is not purely fixture arithmetic: a production change to record frames reddens it. Its real role is a tripwire on the fixture plus record derivation, not on s |
| `packages/configurator-domain/tests/commands/qa-6x-slide-witness.adversarial.test.ts:388` | near-duplicate | refuted | Not a subset of :362, which records only the first reason an if-ladder reaches. This case pins the second exclusions (p26/p9/p21 also 'no catalogue equivalent', p7 also 'rebuilds to the height it records'). A corner return gaining a catalogue equivalent via re |
| `packages/configurator-domain/tests/commands/qa-w5b1.adversarial.test.ts:584` | obsolete | refuted | Not obsolete: the old rule is re-implemented only as a classifier over the live engine's answers. If ADR 0043's allowance were withdrawn (the 0 < remainder < MIN_W floor reinstated in resolve-column-width.ts) the sixteen named growths at :635 vanish and :677's |
| `packages/configurator-domain/tests/commands/qa-w5c.adversarial.test.ts:570` | fake-check | killed | The test does call resolveBuildableSizes and asserts disjoint equals []; the band tautology is incidental. Honest, if weak. |
| `packages/configurator-domain/tests/commands/qa-w5c.adversarial.test.ts:888` | near-duplicate | refuted | :885 pins the literal 'A\|0.25'; this pins agreement with deriveColumnKeyAt('A', 0.25). If the key format changes in deriveColumnKeyAt (void-engine.ts) while set-width keeps composing the moved empty column's key by hand, :885 stays green and only this goes re |
| `packages/configurator-domain/tests/commands/qa-waves-ac.adversarial.test.ts:250` | green-only | killed | Title is stale but the absence of requiredMm is exactly what makes the web layer pick WIDTH_TOO_SMALL_UNKNOWN_FLOOR (ro.json:449), so the assertion is real. |
| `packages/configurator-domain/tests/commands/set-cabinet-depth.plans-against-the-frozen-extent.test.ts:435` | near-duplicate | refuted | The twin never calls production occupiedDepthOfEntryM: cabinet-depth-parameter.test.ts:471 recomputes the depth in a test-local function from the entry's fields. This case is the one that runs occupiedDepthOfEntryM (src/occupied-depth.ts) on the deep top at bo |
| `packages/configurator-domain/tests/commands/set-cabinet-depth.test.ts:49` | useless | refuted | A non-vacuity guard, not a constant restating itself: if DEFAULT_CABINET_DEPTH_MM moved to 700, every changeTo(DEEPER_MM) case in the file would become a no-change command and several would still pass. This is the case that says so. It reads production declare |
| `packages/configurator-domain/tests/commands/set-width.test.ts:321` | near-duplicate | refuted | 500 is its own boundary value, not a relabelled 450: it is the two-door threshold (deriveDoorCount flips at 500). A wall-cabinet bound that stopped below 500, or a refusal specific to the two-door build, leaves :315 green and turns this red. It is ok-only and  |
| `packages/configurator-domain/tests/commands/signature-flow.test.ts:108` | near-duplicate | refuted | Different input class from void-rules-via-mutation.test.ts:81: that clears a whole wall-only column (A\|0.30); this removes only the lowest member of A\|0.75 and leaves p16 standing. A derivation that re-reads a partly cleared column's floor from its remaining |
| `packages/configurator-domain/tests/commands/wall-depth-at-a-deeper-kitchen.test.ts:108` | useless | refuted | The finding has it backwards: if wallCarcassDepthMm declared the same row at 600 and 700, the two cases below (:114, :121) would both still pass with a constant depth, which is the defect the file exists for. This premise is the only case that goes red then. |
| `packages/configurator-domain/tests/contact/contact-fields.test.ts:460` | near-duplicate | refuted | Stricter and deterministic where the twin is not: these rows assert the whole issue list equals exactly one CONSENT_NOT_GIVEN, while qa-8h-contact-fields.adversarial.test.ts:619/:628 read only the consent field's code. false (the unticked box), null and 'on' r |
| `packages/configurator-domain/tests/contact/qa-8h-contact-fields.adversarial.test.ts:311` | useless | refuted | 100/100/254/32 are the contact bounds of ADR 0150 (contact-fields.ts:14-21) and reach an e-mail and a database row. Every other test in tests/contact derives its lengths from the imported constants; a grep for the literals across tests/contact finds no other p |
| `packages/configurator-domain/tests/contact/qa-8h-contact-fields.adversarial.test.ts:392` | near-duplicate | refuted | This is the stricter of the pair. contact-fields.test.ts:517 only asserts the decomposed locality equals the composed locality's stored form (relational), so a locality stored in NFD for both passes it; only this test pins locality to the composed text, and it |
| `packages/configurator-domain/tests/contact/submission-snapshot.test.ts:102` | near-duplicate | refuted | The finding's 'includes the design's default pair' does not hold: the kitchens' settings name no tier (kitchen-l-design.ts:862 is { cabinetDepthMm } only), and qa's PRICED_CASES always writes both tier ids explicitly (qa:510-517). This group is the only assert |
| `packages/configurator-domain/tests/corner-assembly-size.test.ts:183` | useless | refuted | Not a helper checked against itself: SHELL_CABINET_DEPTH_MM is cabinetDepthMmOf(KITCHEN_L_DESIGN) (tests/support/shell-design.ts:48), i.e. the production fixture's own setting, and 600 is typed on purpose (corner-assembly-size.test.ts:48-49). Changing the ship |
| `packages/configurator-domain/tests/corner-assembly-size.test.ts:746` | fake-check | killed | The room loop is decoration (function takes only a wall) but the call is production and 870 is asserted per wall, so the test fails when the bound moves. Redundant with the 870 pins elsewhere, not fake. |
| `packages/configurator-domain/tests/finish-resolution-at-the-load-seam.test.ts:194` | near-duplicate | refuted | The finish literal is the point, not noise. The it.each at :212 stores pal.alb, which is the PAL material's defaultFinish (materials.ts:209); this test stores pal.nuc-warmia, an offered non-default decor. A strip written as 'drop a frontless body's finish when |
| `packages/configurator-domain/tests/fixtures/demo-room-envelope.test.ts:68` | useless | refuted | 3560 x 2920 x 2600 is the pair ADR 0083 decision 1 declares, an owner-ruled product value. Elsewhere only the depth is pinned on the fixture (queries/overflowing-placements.test.ts:261); the other hits for 3560/2920 are test-local rooms or migration outputs, n |
| `packages/configurator-domain/tests/fixtures/demo-room-envelope.test.ts:93` | near-duplicate | refuted | Only a third of the loop repeats kitchen-l-design.test.ts:19. A grep for DesignSchema.(safeParse\|parse) of OVERFLOWING_KITCHEN_L_DESIGN or NARROWED_ROOM_OVERFLOWING_DESIGN across the domain and web tests finds no other parse of either overflow fixture, so a f |
| `packages/configurator-domain/tests/generation/dishwasher-beside-the-sink.test.ts:438` | near-duplicate | refuted | The cited twin is a different census: dishwasher-trades.test.ts:426 runs with S2's trades on and pins 196 621 dishwashers, this one runs with S2 off and the fridge-end leaf off and pins 165 421. The three ceilings are the minimum, an ordinary and the maximum a |
| `packages/configurator-domain/tests/generation/generate-kitchen.u.test.ts:162` | near-duplicate | refuted | Wall C is not the same path with another letter: floorRunOf answers a run that exists in a U alone (generate-kitchen.ts:800-802), and the wall-C side of a U is planned by its own part. A resize guard or a floorRunOf that handles B and not C leaves :155 green a |
| `packages/configurator-domain/tests/generation/generation-priorities.test.ts:90` | useless | refuted | GENERATION_PRIORITIES is the owner-ruled order and widths of ADR 0110 A1, and this is the only test that pins the whole table as a literal: fridge-free at 700, base-sink, base-hob-oven, and the order. The other tests read parts of it (required roles, the prepa |
| `packages/configurator-domain/tests/generation/qa-7d5-bottle-cargo.adversarial.test.ts:1044` | near-duplicate | refuted | The two rows assert something :1011 does not: exactly one body with id "bottle" in the plan. :1011 takes the first bottle with find and checks its span, so a plan that also stood a second bottle elsewhere passes it and fails here. The 'nowhere else' half of th |
| `packages/configurator-domain/tests/generation/qa-7d7-sized-shell.test.ts:202` | near-duplicate | refuted | The room-sweep property draws both walls uniformly from 870..6300, and a wall binds a corner piece only below 900 (30 values in 5431), so a run may never visit the region where the width is cut down. This table visits it deterministically at 870, 871, 880, 881 |
| `packages/configurator-domain/tests/generation/qa-7d8-the-re-keyed-half-recorded.test.ts:115` | fake-check | killed | Red on the test's own assertion ('2590x4605x3671 dishwasher identity: expected ... to match object'), not on a setup throw. The live planner is called and the dishwasher arm is checked, so the reader's doubt about the normaliser masking it did not hold for thi |
| `packages/configurator-domain/tests/generation/qa-c5s2-u-fridge-wall.adversarial.test.ts:758` | near-duplicate | refuted | The rooms are U rooms with a wallCMm and bodies on wall C; the L version stores neither. A migration or schema change that mishandles wallCMm, or a catalogue validation that refuses a 650-800 mm door cabinet on wall C, leaves qa-c5s1:836 green and fails here.  |
| `packages/configurator-domain/tests/generation/qa-u3a-u-plan.adversarial.test.ts:259` | near-duplicate | refuted | The row also asserts wall C holds exactly the oven tower, which the n11 test for this room does not (qa-u3a-n11.adversarial.test.ts:238-246 reads wall A only). It is also the upper half of the 5399/5400 boundary pair of the table; removing it leaves 5399 witho |
| `packages/configurator-domain/tests/generation/qa-u3a-u-plan.adversarial.test.ts:364` | obsolete | refuted | The chain is what stops :360's self-recorded digest being simply re-recorded: a future wave that moves an intended field plus an unintended one turns :360 red, the engineer restates DIGEST_AFTER_C5, and only the chain steps (qa-u3a-u-plan.adversarial.test.ts:3 |
| `packages/configurator-domain/tests/generation/tall-end-composition.test.ts:660` | near-duplicate | refuted | It is the only closed whole-object snapshot of APPROVED_ROOM_POLICY: adding a key (a new bound on a shape) or changing the approved linear depthMm 3400 fails here and nowhere in approved-room-policy.test.ts, which pins named fields individually and has no 3400 |
| `packages/configurator-domain/tests/generation/tall-end-rule.test.ts:245` | near-duplicate | refuted | The control at :66-77 checks only the columns' buildIds; :245 is the only test pinning all three columns' widthMm and the plan's closed shape for the plain qualifying input (:179 checks the last column only, in the merged case). blockOf giving the tower or an  |
| `packages/configurator-domain/tests/generation/tower-over-bottle.test.ts:226` | near-duplicate | refuted | tower-over-bottle.test.ts:229-235 pins each body's role ('preparation/base-3drawer', 'hob/base-hob-oven'); the witness at qa-7d5b-s0-pre-state-witnesses.test.ts:201-207 pins buildId and span only. A change that mislabels a role in the (c) trade (e.g. the 3-dra |
| `packages/configurator-domain/tests/generation/tower-over-bottle.test.ts:289` | near-duplicate | refuted | 2600 is the top-row ceiling and 3900 the approved maximum: different input classes from 2200. The rows are the only assertion that the tower-over-bottle census (5 260 changed, totals) is height-invariant above the column; any composition rule made to read the  |
| `packages/configurator-domain/tests/generation/u-composition.wall-a-remainder.test.ts:100` | obsolete | refuted | RECORDED_DIGESTS are the ADR's independently measured model (file header :7-9: 'a difference here is a rule change to adjudicate, never a figure to tune'); DIGESTS_AFTER_C5 are self-recorded from the implementation. With the leaf off the rest of the planner is |
| `packages/configurator-domain/tests/generation/u-composition.witnesses.test.ts:292` | near-duplicate | refuted | witnesses :300 is the only assertion of plan.remainderMm.C === 0 for 3600/2800/2800 (the N11.1 row at :326-339 pins wall B's remainder and wall C's positions, not C's remainder). A change to the far wall's remainder bookkeeping after the pantry fails only this |
| `packages/configurator-domain/tests/generation/u-tall-layout.property.test.ts:668` | obsolete | refuted | u-tall-layout.property.test.ts:668 is the only check of N11.1's recorded fridge-wall digest; :674 swaps that field for a self-recorded literal. With the C5 leaf off the fridge-wall rules N11.1 states (pantry at a 400 mm gap, free-end fridge) are live code, and |
| `packages/configurator-domain/tests/legacy-finish-migration.test.ts:108` | useless | refuted | The sweeps at :89 and :159 read their expectation from LEGACY_ENUM_FINISHES itself, so redeclaring `oak` (src/materials.ts:323) as a free colour makes an oak kitchen load white with both sweeps green; :181 only separates graphite from clay. The 3/2 count at :1 |
| `packages/configurator-domain/tests/migrate-design.test.ts:221` | near-duplicate | refuted | Narrow but real: :208-216 pins only room.depthMm for the document carrying both shapes; :221-225 compares the whole room, so a correction that with the oversized entry present moves depth 2400->2920 but leaves width at 3600 (not 3560) fails only here. It is th |
| `packages/configurator-domain/tests/pricing/hardware-tier-reconciliation.test.ts:186` | near-duplicate | refuted | Different entry point: the candidate stamps `handle: 'push'` on the Design's placements and counts what projectDesignForDisplay hands on (:173-193); the twin stamps the display entries directly (hardware-mechanisms.test.ts:290-294). A projection that drops or  |
| `packages/configurator-domain/tests/pricing/hardware-tier-reconciliation.test.ts:240` | near-duplicate | refuted | Same split as s28.6: the candidate records the push on a placement in a Design and goes through projectDesignForDisplay (:222-249); the twin builds the entry by hand with entryAt (hardware-mechanisms.test.ts:339-349). A projection change that loses the row (y0 |
| `packages/configurator-domain/tests/pricing/price-design.test.ts:941` | near-duplicate | refuted | The only assertion in these suites that the priced result carries currency 'MDL' (rtk proxy grep 'currency' over price-design, qa-6b and qa-6b2 tests finds no other read of priced.currency). It is the one to keep of the pair with qa-6b2 :926 (s28.34). |
| `packages/configurator-domain/tests/pricing/pricing-seams.test.ts:144` | near-duplicate | refuted | :123-142 compares formula keys with COEFFICIENTS_BY_SHAPE, a table this file tells you to extend when a shape is added (:126-127). A new shape whose coefficient is named `perMm600`, added to price-book.ts and to that table, leaves :123 green; :144-152 is the s |
| `packages/configurator-domain/tests/pricing/pricing-seams.test.ts:478` | near-duplicate | refuted | Kept as the survivor of a mutual pair with qa-6b :748 (s28.28): it is the sample book's own file and the only one of the copies that also holds the book's currency to PRICE_BOOK_CURRENCY (:483). |
| `packages/configurator-domain/tests/pricing/pricing-seams.test.ts:486` | useless | refuted | The reader's twin does not cover it: :49-59 filters on the hard-coded basename 'sample-price-book.ts' and matches specifiers containing that string, so after a rename with imports updated it passes with nothing to find. :486-493 is what goes red and keeps that |
| `packages/configurator-domain/tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts:702` | near-duplicate | refuted | Different row and a stricter claim: wall-lift's 1 mm width step must equal its declared perWidthMillimetreMinor at four heights (:702-716); price-design.test.ts:361-369 only compares open-shelf's 100 mm rise at two heights with itself. A wrong width coefficien |
| `packages/configurator-domain/tests/pricing/qa-6b2-door-step-and-height.adversarial.test.ts:741` | near-duplicate | refuted | :760-791 pins only the change across the threshold and holds with a zero coefficient or a leaf count off by a constant (e.g. charging leaves - 2). :741-758 is the behavioural check that a two-door body is actually charged for its doors, against a second book;  |
| `packages/configurator-domain/tests/pricing/qa-6b2-tier-amounts.adversarial.test.ts:271` | near-duplicate | refuted | The table row at :67 shares the book but :213-215 checks only the code, the field name and the rule id. :275 is the only assertion that the refusal echoes the value quoted ('"9000"'), which is what tells a reader the amount was a string and not the number 9000 |
| `packages/configurator-domain/tests/pricing/qa-6t-hardware-basis.adversarial.test.ts:189` | near-duplicate | refuted | Not the total again: :190-192 is the only check that the per-body census covers every seeded placement id (a 27th placement added without a row fails here), and :204 that the whole design counts to the sum of its bodies counted alone. hardware-mechanisms.test. |
| `packages/configurator-domain/tests/pricing/qa-m6-wave-b-parse-boundary.adversarial.test.ts:388` | useless | refuted | Kept as the survivor of three copies of the inequality (parse-price-book :352, regate :584): it alone reads the term count off the constructors and uses MAX_DESIGN_DIMENSION_MM. The behavioural neighbour at :377-386 reaches only base + 3 x bound x 10 000, so a |
| `packages/configurator-domain/tests/push-to-open.test.ts:83` | near-duplicate | refuted | Distinct cell of the 2x2 (recorded push, canHandle false, top row). Adding `if (recordedHandle === 'push' && canHandle !== true) return false` to isPushToOpen (src/push-to-open.ts:53, the 'no latch billed on a body that cannot take the mode' reading its doc co |
| `packages/configurator-domain/tests/qa-0099-global-colour.adversarial.test.ts:980` | fake-check | killed | The Object.keys(input) assertion is indeed static (the test's own literal), but the test also asserts setGlobalFinish(input).ok, which went red when the command required another field. It would not catch a command that merely tolerates extra fields, so 'exactl |
| `packages/configurator-domain/tests/qa-5b2a.adversarial.test.ts:791` | near-duplicate | refuted | Stricter and through another seam: it asserts the exact pieces toStrictEqual [2950/800, 3400/100] and that deriveColumns files them at A\|2.95 and A\|3.40 with A\|3.00 gone. A split filled right-to-left (800 on the right, array still [800,100]) keeps qa-5g:88  |
| `packages/configurator-domain/tests/qa-5b2a.adversarial.test.ts:807` | near-duplicate | refuted | Asserts the validator's answer is exactly ['EMPTY_COLUMN_WIDER_THAN_CAP'] (toStrictEqual) on a populated design. qa-5g:116 only checks the thrown message contains the code and :125 uses toContain, so a validator that starts emitting a second code for an oversi |
| `packages/configurator-domain/tests/qa-5h.adversarial.test.ts:542` | useless | refuted | This is the canonical pin of SEC-002's request cap and the three counts ADR 0132 sized. The first reader's own mutation (MAX_DESIGN_BYTES + 1000 in src/design-bounds.ts:180) survives every behavioural cap test, so a drifting byte budget is caught only by a lit |
| `packages/configurator-domain/tests/qa-6a3.adversarial.test.ts:166` | near-duplicate | refuted | The duplication with qa-room-migration:241 is real (same document shape, versions and ['edited'] assertion), but this is the copy to keep: its fixture also feeds the three sibling cases at :127-:164. Delete s31.11 instead; deleting both loses the phantom-pair  |
| `packages/configurator-domain/tests/qa-6a4.adversarial.test.ts:219` | useless | refuted | Setting WALL_CORNER_RETURN_KIND = WALL_CABINET_KIND in src/body-kinds.ts (the originally reported defect) leaves :126 and :403 green, because they only compare the two returns' lines with each other and those still differ. :221 is the direct comparison against |
| `packages/configurator-domain/tests/qa-6k-c-frozen-source.adversarial.test.ts:359` | near-duplicate | refuted | It measures the real catalogue's longest buildId, not 64 ASCII 'x's. src/design-bounds.ts (MAX_DESIGN_BYTES comment) states the cap is not guaranteed for non-ASCII identifiers; a catalogue row whose id contains multi-byte characters, or runs past MAX_IDENTIFIE |
| `packages/configurator-domain/tests/qa-6k-d-shell-declaration-pairing.adversarial.test.ts:169` | fake-check | killed | The predicate is the test's arithmetic, but the rows it feeds are read from buildKitchenLBodyCatalog (openShelf.frameDepthMm, fronted.frameDepthMm), so a catalogue edit that makes open-shelf share the fronted frame turns the 'must not equal' assertion red (fra |
| `packages/configurator-domain/tests/qa-6k-d-shell-declaration-pairing.adversarial.test.ts:204` | near-duplicate | refuted | shellRows() (:73) skips any row whose declaredFinishedDepthMm is undefined, so removing depthRule from a seeded wall corner return leaves :123 green. Here the same row is compared with toBe against that undefined and fails, and the case also pins that exactly  |
| `packages/configurator-domain/tests/qa-6p.adversarial.test.ts:307` | near-duplicate | unsure | The stated rationale is wrong: migrateDesign is deterministic over the reserialised input, so once==twice at CURRENT_SCHEMA_VERSION (:283) already excludes a period-two oscillation. But this is the only fixed-point case on a document mixing two legacy names (s |
| `packages/configurator-domain/tests/qa-6q-a-load-seam.adversarial.test.ts:270` | useless | refuted | The first reader's own mutation (PLACEMENT_WEARS_UNOFFERED_FINISH to 'mark' in src/validate-design.ts) is caught at :291. It also holds the deliberate tripwire that the finish-related codes are exactly two, which a third *FINISH*/*OFFER* code reddens; the coun |
| `packages/configurator-domain/tests/qa-6q-a-offer.adversarial.test.ts:131` | near-duplicate | refuted | Not implied by :117. Adding a ninth id to PALETTE_ENTRY_IDS that no material declares leaves :117 green (each material's offered set is unchanged) and turns this red (27 pairs, 19 refusals). It is the case that pins the size of the pair space, and it is what m |
| `packages/configurator-domain/tests/qa-6q-a-offer.adversarial.test.ts:190` | useless | refuted | It is the only exact pin on FREE_COLOUR_PATTERN's alphabet ('0123456789ABCDEFabcdef'). BOUNDARY_FREE_COLOURS (:73-84) contains no 6 or 7, so a character class that drops either digit, or admits an extra character other than the 'g' tried at :221, passes :159,  |
| `packages/configurator-domain/tests/qa-7d6-the-room-term-and-the-engine-window.adversarial.test.ts:453` | near-duplicate | refuted | `export { ENGINE_ROOM_LIMITS as ROOM_LIMITS } from './room/room-policy.js'` in src/index.ts publishes the engine window under another name: :442 stays green (Object.keys has no 'ENGINE_ROOM_LIMITS') and :453 goes red on the identifier. That alias is a real lea |
| `packages/configurator-domain/tests/qa-7d6-the-room-term-and-the-engine-window.adversarial.test.ts:477` | useless | refuted | The neighbouring cases exist to show this mutant is otherwise invisible: :485 compares only LEVELS floors and :495 shows the wall and top pieces share one far edge, so dropping 'wall' from BANDS_ABOVE_THE_WALL_ROW_FLOOR (the >= to > mutant) changes no computed |
| `packages/configurator-domain/tests/qa-8h-design-identifiers.adversarial.test.ts:47` | near-duplicate | refuted | A lenient `DESIGN_ID_SHAPE.test(value.trim())` in isDesignId (src/repository.ts:13) accepts ' ' + id and id + ' ', reddening only this case: :23 uses 'a' runs, :32 substitutes inside the 21 characters (leaving 20 after a trim), and :62's two-line string still  |
| `packages/configurator-domain/tests/qa-item8-lifted-column-depth.adversarial.test.ts:367` | fake-check | killed | First assertion calls production depthFollowsSetting and goes red. The second (`pinnedAtEightHundred.pinnedFinishedDepthMm` toBe 800) is static, as the reader said, and no pinned-depth consumer exists in src (pinnedFinishedDepthMm is only declared in cabinet-d |
| `packages/configurator-domain/tests/qa-m7b-u1-wall-c.adversarial.test.ts:238` | fake-check | killed | The first half (JSON round-trip of designIn(U_ROOM, []) has wallCMm 2000) is static, as the reader said, but the second half parses a linear room through production DesignRoomSchema and asserts Object.keys omits wallCMm, which the mutation breaks. Test is hone |
| `packages/configurator-domain/tests/qa-m7b-u1-wall-c.adversarial.test.ts:283` | near-duplicate | refuted | The table at :269 has wall B longer than wall C (2300 vs 1700); this case reverses the order (900 vs 6000). `Math.min(room.wallCMm, room.depthMm)` for wall C, or `Math.max(...)` for wall B, in wallLengthMm (src/queries/overflowing-placements.ts:44) passes the  |
| `packages/configurator-domain/tests/qa-room-correction.adversarial.test.ts:181` | useless | refuted | The cited twin is not one: overflowing-placements.test.ts:252 measures wall B only, at the deeper setting (2900 against 2920). I found no other test pinning the seeded run ends at the default depth (3500 on A, 2800 on B; tests/fixtures has neither literal, run |
| `packages/configurator-domain/tests/queries/describe-selection.test.ts:251` | near-duplicate | refuted | It also asserts meta.widthMm stays 600 after the repoint, which width-resolution :367 does not (that one adds the label instead). A describeSelection that read the body's width through the resolved entry (base-dishwasher's first size, 450) reddens only this. I |
| `packages/configurator-domain/tests/queries/describe-selection.test.ts:287` | near-duplicate | refuted | Different entry point. width-resolution :164 and :176 call resolveCatalogEquivalent/resolveBuildableSizes directly; this is the only case that reaches a present-but-non-insertable target through describeSelection. A describeSelection that read `catalog.get(equ |
| `packages/configurator-domain/tests/queries/hob-base.adversarial.test.ts:266` | useless | refuted | The catalogue is production data. This is the only case holding the two hob bases equal in every fitted and offered field while pinning the differences ADR 0061 and ADR 0070 specify (handle counts 2/0, drawer fronts vs fixed facade, canHandle true/false). Edit |
| `packages/configurator-domain/tests/queries/qa-5b5-fixed-width.adversarial.test.ts:253` | useless | refuted | It fixes the population the it.each below runs over. A catalogue row that silently loses fixedWidth (say tall-oven-tower) leaves that it.each green over the remaining four, and only this list fails; I found no other test naming the five insertable fixed-width  |
| `packages/configurator-domain/tests/queries/sink-accessories.test.ts:85` | useless | refuted | It pins production declarations, not test-local values: the insertable `base-sink` row and the seeded `base-sink-800` each declare their own sink and `base-3drawer` does not. Dropping the sink declaration from the §7 `base-sink` row passes every seeded-design  |
| `packages/configurator-domain/tests/queries/sink-accessories.test.ts:286` | near-duplicate | refuted | hood-600 and open-shelf-600 are separate catalogue rows with separate `fronts` declarations, and canHangARack's comment (src/queries/sink-accessories.ts) names both. A hood row that gained a door-leaf front, or was re-banded, would hang a rack in the hood: :28 |
| `packages/configurator-domain/tests/queries/width-options.test.ts:168` | near-duplicate | refuted | Only this case pins the count of bodies that render a width section (expect(bodies).toBe(22), width-options.test.ts:186); the qa twin's 'as shipped' row only requires sections > 0 (width-options.qa.test.ts:200). A change that makes one fixedWidth or resizable  |
| `packages/configurator-domain/tests/room/minimum-kitchen.test.ts:187` | near-duplicate | refuted | expectValidatorAndGeneratorAgree (minimum-kitchen.test.ts:164-185) requires an ok generation to contain a placement whose buildId is 'base-sink' and one in {base-hob-oven, base-hob-2drawer}. The adversarial twin identifies sink and hob only by log step id (pla |
| `packages/configurator-domain/tests/room/qa-7j-straight-room.adversarial.test.ts:64` | near-duplicate | refuted | The twin at :85 draws 1000 integers uniformly-ish from 0..10000; nothing guarantees it lands on 1200 or 6000 (fast-check biases to the generator's own 0 and 10000, not to the policy's edges). These two rows are the only deterministic acceptance at the linear b |
| `packages/configurator-domain/tests/room/room-policy.test.ts:384` | fake-check | killed | The case compares the fixture room's height (from KITCHEN_L_DESIGN corner placements) with ENGINE_ROOM_LIMITS.heightBounds, both production-sourced, so a changed engine bound turns it red. It does not exercise findOverflowingPlacementIds (the reader's mutation |
| `packages/configurator-domain/tests/room/u-minimum-kitchen.test.ts:192` | near-duplicate | refuted | generatorPlacesASinkAndAHob (u-minimum-kitchen.test.ts:27-37) requires both a placed 'sink' and a placed 'hob' step; the twin's 'the generator agrees at' (u6 :173) asserts only result.ok, and u6's placed-roles check lives in a random property (:330). A generat |
| `packages/configurator-domain/tests/room/validate-room.adversarial.test.ts:371` | fake-check | killed | Compares hand-typed NARROWER/WIDER fixtures against production ENGINE_ROOM_LIMITS, so it is red when an engine bound drifts to agree with a fixture. It is a tripwire for the engine side, not a test of validateRoomInput (the reader's mutation there would surviv |
| `packages/configurator-domain/tests/room/validate-room.test.ts:147` | near-duplicate | refuted | The adversarial twin draws its three dimensions from fc.anything() and a list of non-numbers (validate-room.adversarial.test.ts:365-368), so it practically never produces a field-valid L. This is the only case that hands a fully valid L to a policy that builds |
| `packages/configurator-domain/tests/run-end-panel.test.ts:64` | useless | refuted | 0.018, 0.001 and 0.82 are the reference room's shipped numbers and this is their only literal pin. The seat cases pin slab and gap only to 1e-9 through the constants themselves, and the height is seen one-sidedly: lowering RUN_END_PANEL_HEIGHT_M to 0.81 leaves |
| `packages/configurator-domain/tests/structural-cabinetry-follows-the-kitchens-colour.test.ts:412` | green-only | killed | not.toThrow is the right assertion for a fail-closed assembly: a catalogue entry that stops declaring its rule at the second depth makes the call throw. Module-load only builds at WORKTOP_DEPTH_MM, so depth 700 is genuinely exercised only here. |
| `packages/configurator-domain/tests/void-engine.test.ts:503` | useless | refuted | LEVELS (module-grid.ts:14) is the spec's level table, read by insert-fit, design-bounds and room-policy as well as the void engine. :416 sees it only through a column whose top is 2.6, where Math.min(span.hi, levelEnd) clips: raising the top level's end from 2 |
| `packages/configurator-domain/tests/worktop-depth.qa.test.ts:211` | green-only | killed | The loop calls the real wallDepthMmForWorktop for every declared row and fails if any throws, so a declared row the function refuses turns it red. The title's 'and only those' half is not checked here (the it.each above covers refusal), but the acceptance half |
| `packages/persistence/tests/backup-restore-round-trip.adversarial.test.ts:190` | fake-check | refuted | The title's promise is checked on production data: the row comes from createNeonDesignRowSource and the line must contain hashWriteToken(token), so a row source that stops selecting write_token_hash reddens it. Only the trailing endsWith('\n') is on the test's |
| `packages/persistence/tests/design-row-source.test.ts:186` | near-duplicate | refuted | Not the same restore. This one inserts the exported row's own schema_version, created_at and updated_at as the driver returned them and restores no visitor_hash (the older runbook insert); the adversarial twin goes through JSON, hard-codes schema_version 1 and |
| `packages/persistence/tests/generate-design-id.test.ts:17` | useless | refuted | The contract at generate-design-id.ts:3-5 is 'unguessable', and this is the only case sensitive to lost entropy: an id made of four random characters plus fixed padding passes the length/alphabet case (:10) and the non-sequential case (:26, six-character prefi |
| `packages/persistence/tests/migration-files.test.ts:20` | near-duplicate | refuted | This is the only assertion in either file on the parsed version numbers of the real migrations ([1..7]); migrate.test.ts:80 compares file names only and the synthetic-directory cases below never read .version. A readMigrationFiles that returns right names with |
| `packages/persistence/tests/migration-safety.adversarial.test.ts:30` | green-only | refuted | The titles promise refusal, and refusal is what is asserted on the direction that matters (migration-safety.ts states it may over-refuse). These fail the moment an evasion spelling is waved through, e.g. an ADDITIVE_STATEMENT_SHAPES entry loosened so 'alter ta |
| `packages/persistence/tests/migration-target-cli.test.ts:89` | fake-check | refuted | Both titles say 'by source order' and assert exactly that, so nothing is faked. The spawned cases at :62 and :115 infer the order from the absence of 'Could not connect' / 'Could not read the schema' against an unreachable URL; a reorder whose early connect or |
| `packages/persistence/tests/migration-target.adversarial.test.ts:76` | fake-check | refuted | Each row's first assertion is on production: databaseNameOf(url) must answer NO_AGREED_DATABASE_NAME for the three escaped/backslash URLs (migration-target.adversarial.test.ts:102). A databaseNameOf that started decoding %2D or returned the raw path turns thes |
| `packages/persistence/tests/neon-configuration-repository.adversarial.test.ts:471` | fake-check | refuted | Source-text checks, but each sees a change nothing else does: a second this.sql` statement added to saveAuthorized (count == 1, :481), a this.load( call or an application-side hash comparison (:492-:496), and sql.query( or string concatenation anywhere in the  |
| `packages/persistence/tests/neon-configuration-repository.test.ts:157` | fake-check | refuted | The title overclaims (the repository is only ever handed a hash, so 'never a token' is unobservable here), but the assertion is not vacuous: it is the only direct read that the column holds the caller's digest verbatim. A mint that transformed the value in SQL |
| `packages/persistence/tests/neon-configuration-repository.test.ts:349` | fake-check | refuted | Not a fake check: the title's failure (the live suite aimed at the application's own database) is exactly what the pathname comparison sees. It is the only assertion on the really resolved pair of URLs; tests/support/live-test-database.ts:46 reading TEST_DATAB |
| `packages/persistence/tests/neon-configuration-repository.test.ts:1173` | fake-check | refuted | TLS case (:1173): the only test that sees sslmode=disable or rejectUnauthorized:false added to read-database-url.ts or the repository; no live case can observe it. Update case (:1185): its regex requires the credential and revision predicates after 'update des |
| `packages/persistence/tests/open-database.query-through.test.ts:48` | near-duplicate | refuted | The twin iterates fc.sample of a seeded arbitrary (tests/support/qa-8b-swept-values.ts:183), so whether a DEL, a tab or a Latin-1 letter lands inside the password of an otherwise well-formed string is a property of the sample, not of the table; it cannot be sh |
| `packages/persistence/tests/qa-7t-s2b-lock.adversarial.test.ts:94` | useless | refuted | These are ruled values, and nothing else pins the literals: tests/test-schema-lock.test.ts:91-:99 only asserts hook > bound. The helper's own comment (tests/support/test-schema-lock.ts:40-:46) says the 180 s bound is deliberately not re-keyed until a ruling, a |
| `packages/persistence/tests/qa-8b-query-through.adversarial.test.ts:321` | useless | refuted | It is the positive control for the sweeps above it: they report 'fails only at the replaced socket', which is only evidence if the replaced socket still runs the runtime's header validation. If fetchWithoutASocket stopped constructing a Request, every sweep at |
| `packages/persistence/tests/qa-8e-rate-limit-live.adversarial.test.ts:315` | useless | refuted | No production target, but it pins an invariant two live suites depend on: pruneExpired deletes every row ended before its instant whoever wrote it (tests/support/rate-limit-test-eras.ts:1-8), so overlapping eras make one suite delete the other's rows and fail  |
| `packages/persistence/tests/qa-8e-rate-limit-live.adversarial.test.ts:1037` | near-duplicate | refuted | The it.each cannot go as a whole: :1052 filters NOT_A_DIGEST to storable text, so the rows for keys Postgres cannot store (the NUL key) are asserted only here, along with 'no row was stored'. The storable rows are subsumed by :1052; the table could be filtered |
| `packages/persistence/tests/rate-limit-store.test.ts:207` | near-duplicate | refuted | FAILURE_SHAPES (qa-8e driver-failures :126-:170) holds no plain Error whose own message carries the credentials: its leaking messages are on NeonDbError, a string, a plain object or a cause. A store that kept the message of a non-driver Error (for diagnosabili |
| `packages/persistence/tests/rate-limit-store.test.ts:236` | near-duplicate | refuted | The candidate asserts the conflict is not a RateLimitStoreError (:242); the twin at qa-8e driver-failures :305 does not. Making RateLimitWindowConflictError extend RateLimitStoreError (src/rate-limit-store.ts:56) turns the candidate red and leaves the twin gre |
| `packages/persistence/tests/retried-writes-leave-no-trace.test.ts:482` | near-duplicate | refuted | The candidate reads every design row of the visitor, including schema_version (designRowsOf(visitorHash), :478), and compares the whole set to a clean save. The qa-ce-s4 twins read one row by id and only document and revision (qa-ce-s4 :179-:187). A retried sa |
| `packages/persistence/tests/share-link-repository.test.ts:479` | near-duplicate | refuted | The four reads started before the revoke are still in flight when the later reads begin. A loadShared that de-duplicated or memoised reads per token hash at module level would hand the later reads the in-flight 'found' answer: red here, green at :171, where no |
| `packages/persistence/tests/test-database-connection-errors.test.ts:335` | near-duplicate | refuted | Different input class for the application-name arm: the candidate's value is one the opener refuses for its header (a line break in the password), the twin's (qa-8b :251) one it refuses for its shape (mysql://, no line break). A change that ran the header-carr |
| `packages/persistence/tests/test-schema-lock.test.ts:97` | fake-check | refuted | The first assertion (release hook timeout > release bound, :98) is the only statement of that relation; the adversarial file pins the two literals but not that one exceeds the other. The regex does see the promised change, an afterAll registered without the ti |
| `packages/persistence/tests/write-token-schema.adversarial.test.ts:22` | fake-check | refuted | Not a fake check: when DATABASE_URL is set each assertion reads the application database's catalogue and sees what the title says (constraint, column, grants). No test-database suite can see that state; that is the file's stated reason (:1-:12). The real weakn |
| `packages/three-adapter/tests/cabinet-depth-sweep.parity.test.ts:277` | green-only | killed | The case calls the real requireDeclaredCabinetDepthMm on 600 and 700, so a floor above 600 or a dropped declared depth turns it red. It builds no kit (title overclaims) but is not vacuous. |
| `packages/three-adapter/tests/cabinet-handle-count.parity.test.ts:114` | near-duplicate | refuted | GATED_BODIES is declared separately in each file (cabinet-handle-count.parity.test.ts:84, sink-declaration.parity.test.ts:83). The count pins repeat, but 'gatedIds equals CATALOG + SEEDED' (:119-:122) is about this file's own sweep: a builder id the handle swe |
| `packages/three-adapter/tests/catalog-bodies.adversarial.test.ts:517` | near-duplicate | refuted | Stricter assertion: countDoorsAbreast counts distinct world x centres of the doors (catalog-bodies.adversarial.test.ts:155-:162), the twin counts door_front meshes (catalog-bodies.test.ts:245). Two doors built at the same x, stacked or overlapping, give 2 mesh |
| `packages/three-adapter/tests/catalog-bodies.test.ts:219` | near-duplicate | refuted | Different assertion: the candidates require the refusal to name the offending id (/not-a-body/, /wall-2door-600-top/), the adversarial case only the fixed sentence /No catalog builder registered/ (:190, :197). Dropping the id from the message leaves the twin g |
| `packages/three-adapter/tests/catalog-capability-parity.test.ts:168` | near-duplicate | refuted | The two count pins repeat sink-declaration.parity.test.ts:114-:116, but this is the only case tying this file's own ALL_BUILD_IDS (catalog-capability-parity.test.ts:48) to both production maps. The two cases above it compare GATED and RECORDED with ALL itself, |
| `packages/three-adapter/tests/corner-direction.test.ts:611` | useless | refuted | These are the only cases for 7I-A14, the scenario that really occurs: the outline and mark are built once and not rebuilt when the direction flips (comment at :583-:590). They go red if applyCornerDirection stops mirroring the room group itself (src/corner-dir |
| `packages/three-adapter/tests/generated-kitchen.parity.test.ts:273` | fake-check | killed | The case first asserts intersectingBoxes(worktops) equals [] over production-generated slabs; overlapping slabs from production turn it red, so the pre-assertion is production-sensitive. The second half (helper detects a cloned box) is test-helper only. |
| `packages/three-adapter/tests/kitchen-shell.characterisation.test.ts:250` | fake-check | killed | Reader was wrong: each case compares the differing fields of a production-built shell against the recorded baseline and expects exactly one field, so any other production deviation in that child makes it red. All 4 cases confirmed killed by a production edit.  |
| `packages/three-adapter/tests/kitchen-shell.characterisation.test.ts:339` | obsolete | refuted | Its 'slice 5 falsification' purpose is spent, but the measurement is still in use: perete-a-framing.test.ts:129 compares the room-driven preset against the literal 514.9, and this is the only place that figure is reproduced from the meshes rather than transcri |
| `packages/three-adapter/tests/kitchen-shell.test.ts:223` | near-duplicate | refuted | expectOnlyCurrentPlacements (kitchen-shell.test.ts:120) only checks top-level placement ids/count and shell child names. Only this case searches the whole solids tree by mesh name: a builder that nests a 'fridge_freestanding' mesh inside another placement's bo |
| `packages/three-adapter/tests/narrow-widths.qa.test.ts:130` | fake-check | killed | It is arithmetic on the imported MIN_WIDTH_M and the catalogue's minWidthMm, so it is red only when the domain constant or a row floor moves; no builder is exercised. Honest but thin, and overlaps line 75's check. |
| `packages/three-adapter/tests/overflow-mark.test.ts:264` | fake-check | killed | The colour assertions read production-built wash and outline materials, so a wrong wash colour fails it. The room.children toContain check is vacuous (the test added them), and a genuine composition defect was not tried. |
| `packages/three-adapter/tests/picking.test.ts:67` | useless | refuted | 0.008 is a specified value (docs/design/DEVELOPMENT-SPEC.md:74 and :291, section 6.1) and this is the only test in the repo that names LINE_RAYCAST_THRESHOLD_M; changing picking.ts:14 to 0.08 or 1 is caught by nothing else, since the first expect compares the  |
| `packages/three-adapter/tests/push-to-open-seam.parity.test.ts:209` | fake-check | killed | It asserts a property of the shipped KITCHEN_L_DESIGN fixture, which is production data, so editing the fixture reddens it. It is a fixture sanity check, not behaviour. |
| `packages/three-adapter/tests/push-to-open-seam.parity.test.ts:288` | fake-check | killed | frame.y0 comes from production derivePlacementRecords over the seeded design, so lowering it reddens the case; only the ids and the 2.2 line are test literals. |
| `packages/three-adapter/tests/qa-0099-the-scene-does-not-resolve.adversarial.test.ts:142` | near-duplicate | refuted | qa-0099b trims every sweep to one body (onlyTheseBodies, :151); these three draw the whole seeded kitchen and read p1 among its neighbours. A finish-material cache keyed without the finish, or a paint loop that stops after the first record, leaves a lone body  |
| `packages/three-adapter/tests/qa-5b6-5b7.adversarial.test.ts:169` | obsolete | refuted | Not obsolete: the case's last line (qa-5b6-5b7.adversarial.test.ts:180) is the live rule that replaced the rejected criterion, the filler panel must not intersect the oven's box, and deleting the case deletes it. Only the first expect (:179) is a historical re |
| `packages/three-adapter/tests/qa-5b6-5b7.adversarial.test.ts:340` | near-duplicate | refuted | Different threshold with a real difference: a board laid coincident with shelf_bottom/shelf_top yields a compartment of float-residue height (about 1e-13 mm), which passes the '> 0' sweep at :330 and fails this '> 1 mm'. That is the coincident-board failure th |
| `packages/three-adapter/tests/qa-5b6-5b7.adversarial.test.ts:354` | fake-check | killed | Reader was wrong in effect: the round trip goes through production toMillimetres, so an off-by-one there flips the compartment count at the 500/501 threshold and the case goes red. |
| `packages/three-adapter/tests/qa-6p-bridge-values.adversarial.test.ts:81` | near-duplicate | refuted | The table at :41 is not literal: its expected values are built with production's own paletteFinish/freeColourFinish, so a defect in either constructor (wrong kind, mangled value or entryId) moves both sides of :53 together. :81/:144 read .kind, :109 reads .val |
| `packages/three-adapter/tests/qa-6r-free-colour-cache-bound.adversarial.test.ts:71` | fake-check | killed | Red only for the degenerate MAX_PLACEMENTS=0: for any positive value the Set size of the test's own generator and DRAG_LENGTH=3*MAX_PLACEMENTS > MAX_PLACEMENTS are identities. Verdict killed is technically true; practically a non-vacuity tautology. |
| `packages/three-adapter/tests/qa-6t2-rack-not-drawn.adversarial.test.ts:118` | fake-check | killed | The DEPTHS_MM.length > 1 assertion reads production; the keys-equal-to-input assertion is a tautology, but the case as a whole fails when the domain declares one depth. |
| `packages/three-adapter/tests/qa-7d4-generated-storage-bodies.parity.test.ts:579` | near-duplicate | refuted | Four of the five SAMPLE_ROOMS (6300x4700, 1500x3400, 1500x4600, 5200x5300; :64-93) are absent from qa-7d2's ROOMS (:43-55) and were picked because their plans stand the pan-drawer, dishwasher-only-slot, e-swap and threshold-drawer bodies, so a mis-seated or ov |
| `packages/three-adapter/tests/qa-7d7-s1-corner-widths.adversarial.test.ts:127` | near-duplicate | refuted | The property at :155 draws width at random from [ONE_DOOR_FLOOR_MM, 570] across depth and height; nothing guarantees it lands on the floor width for each depth at both 700 and 400. This case builds exactly that boundary deterministically, which is the width a  |
| `packages/three-adapter/tests/qa-c2s1-corner-wall-unit.adversarial.test.ts:315` | near-duplicate | refuted | Different entry point and population. qa-c2s1 hand-places kit.make.wallCornerX in seven rooms including the 4500/3000/3600 U (:77-91, 51 units at :312); qa-c2s2 only measures units the generator mounts and states it mounts none in a large U (:299). A generator |
| `packages/three-adapter/tests/qa-c4s2-corner-joint.adversarial.test.ts:386` | fake-check | killed | Reader was wrong: cornersOf filters by whether the production-generated, production-mounted X-leg body exists, so generation changes alter the count. |
| `packages/three-adapter/tests/qa-c4s2-corner-joint.adversarial.test.ts:784` | fake-check | killed | The stored widths are the generated return width minus 10; the generator must emit 330 for the three cases to read 320, so a change to production width makes all 3 red. |
| `packages/three-adapter/tests/resize-depth.test.ts:241` | near-duplicate | refuted | Different quantity. resize-depth.test.ts:120 reads occupiedDepthM(record) (shell plus front assembly, from the entry's depth rule); resize-reload.qa.test.ts:126 reads frame.d, the seat. A resize that re-records a member under an entry with a different depth ru |
| `packages/three-adapter/tests/scene-sync.adversarial.test.ts:317` | near-duplicate | refuted | Different flow: empty -> refill -> identical re-sync, ten times, ending mounted. scene-sync.test.ts:261 only alternates fill/empty and ends empty, and the nothing-changed case never passes through an empty sync. A signature entry that survives sync([]) (body s |
| `packages/three-adapter/tests/scene-sync.adversarial.test.ts:499` | near-duplicate | refuted | Identity versus count. scene-sync.test.ts:377 only counts Material.dispose calls; this case requires that the replaced void's own material objects are the ones disposed and nothing else. Disposing the newly built mesh's materials instead of the old one's (same |
| `packages/three-adapter/tests/stage.non-u-presets.test.ts:295` | obsolete | refuted | Not obsolete: U4 shipped, but these 13 rows are the only byte-level pins of cameraPresetsForRoom for L and straight rooms (seeded room, policy corners, right-hand L, two straight rooms). Any change to the L/linear stand-off, elevation or target reddens them; t |
| `packages/three-adapter/tests/swap-depth.test.ts:173` | near-duplicate | refuted | The sweep row for p24 (swap-depth.test.ts:163) takes both its expected depth and its equivalent id from production (occupiedDepthM of the seeded record, catalogEquivalentId; :133-138), so it is self-consistent under a drift. Only this case states the literals: |
| `packages/three-adapter/tests/the-run-end-panel-wears-the-kitchens-colour.test.ts:278` | near-duplicate | refuted | Different path: this is a first mount with the kitchen's colour already set (sync(held, ALB)), while :258 mounts with no colour and then changes only the colour, so bodies there are never built under a kitchen colour. A mount-time paint that reaches the shelf' |
| `scripts/gates/e2e-shard-budget.test.mjs:34` | useless | refuted | These two cases are the only tests of derivedBudget's Math.floor (66.7 must be 66; round gives 67) and of both arms of enforcedBudget (desktop's ratchet 70 over 66, mobile with no ratchet; e2e-shard-budget.mjs:79-85). 66/125/70 are the ceilings CI enforces, an |

## Progress — the fix-up of this review

Started 2026-10-08. Every entry row above carries a **Status** cell; an empty cell means not started. A status
is written only from a QA agent's report after the coordinator re-ran the suite. "Red under mutation" is the
QA agent's recorded run, not re-run by the coordinator.

| Wave | Scope | Entries | Result | Commit |
| --- | --- | --- | --- | --- |
| D1-A | `packages/configurator-domain`, section 1a, `along-wall-chain-shift` to `u-composition.s3` | 37 rows | 26 strengthened, 1 removed, 3 part, 6 unchanged, 1 open; 1 red on real code (`set-width`, line 514), ruled a wrong test and fixed in D1-B | `80b39cc` |
| D1-B | `packages/configurator-domain`, section 1a from `pricing/finish-never-prices` to `void-engine`, and section 1b | 56 rows | 24 strengthened, 1 removed, 3 part, 24 unchanged (12 review wrong, 1 equivalent mutant), 3 open, 1 settled; 4 requirements had no guard before. Domain suite 7857 passed, 0 failed | `4d44e45` |
| D1 structural | `eslint.config.mjs`, `replan-dependent-members.ts` | — | Developer change for the architect's rulings on rows 508, 564, 576: a lint rule for `shell-design.ts`, and `columnDecidesItsDepth` exported at module level. The tests that use them follow | `1b162cc` |
| T1 | `packages/three-adapter`, sections 1a and 1b | 19 rows | 10 strengthened, 9 unchanged (8 test-local, 1 equivalent mutant) | `e61c451` |
| T2 | `packages/three-adapter`, sections 2 and 4 | 45 rows | 39 deleted, 2 merged then deleted, 3 part, 1 kept; 107 cases removed. Logic review: sound, no restore; its one follow-up (R1.2) applied. Suite 4284 passed, re-run by the coordinator | `8038015`, `8419592` |
| W1-A | `apps/web`, section 1a | 53 rows | 29 strengthened, 5 removed, 1 part, 18 unchanged (2 are `tsc` guards) | `1b543d0`, `9a7af8e` |
| W1-B | `apps/web`, section 1b | 30 rows | 26 strengthened (14 previously unguarded), 2 removed, 2 equivalent mutants by reading. Suite 6237 passed, typecheck clean, re-run by the coordinator | `f090eb4` |
| D1-C | `replan-dependent-members.test.ts` | rows 508, 564, 576, 582 | Count-of-16 rewritten against the exported predicate. The three `shell-design` source scans were **not** deleted: QA tried the lint rule and it lets through `module.require(…)` and a local function of the same name. Domain suite 7857 passed | `f76529f` |
| D1-D | `shell-design.test.ts`, `shell-design.adversarial.test.ts`; lint rule extended in `84fccd7` | rows 564, 576 | Clip row and premise deleted; the two adversarial scans narrowed to the forms lint cannot read. Domain suite 7856 passed (−2 +1) | `bd98570` |
| P1 | `packages/persistence`, sections 1c, 2 and 4 (live test database) | 33 rows | 2 strengthened, 2 part, 1 removed, 1 unchanged (section 1c); 19 deleted, 1 merged then deleted, 1 part, 2 kept, 3 not done (sections 2 and 4); 42 cases removed. Suite 1755 passed, 1 skipped, re-run by the coordinator. Logic review pending | `61402d0` |
| D2-A | `packages/configurator-domain`, section 2, first 62 rows | 62 rows | 59 deleted, 2 part, 1 kept (no signal); 121 cases removed. Logic review: sound, no restore; its follow-up applied | `01dc474`, `4269fbe` |
| D2-B | `packages/configurator-domain`, section 2, doc lines 2047–2297 | 65 rows | 56 deleted, 3 part, 1 kept (no signal), 4 not done (2174–2177), 1 deleted without a red; 132 cases removed. Domain suite 7603 passed, re-run by the coordinator. Logic review pending | `c7caf58` |
| W2-A | `apps/web`, section 2, doc lines 1185–1513 | 75 rows | 67 deleted, 1 part, 7 Playwright rows not done; 138 cases removed. Logic review: sound, no restore; its follow-ups applied. A missing guard found and added: a failed locked run executes once | `3a0baa6`, `d85c27c`, `70134c0` |
| W2-B (partial) | `apps/web`, section 2, `tests/review` and eight `tests/room` rows | 18 rows | 16 deleted, 1 part, 1 open (a fake check filed as a duplicate); 68 cases removed. Web suite 6032 passed, re-run by the coordinator | `fc26bd6` |

No wave so far found a production defect.
