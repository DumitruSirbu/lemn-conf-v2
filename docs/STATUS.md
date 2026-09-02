# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn where the project stands without reading eight phase plans.

Last updated: 2026-09-02. **M5B — Manual UX remediation is complete.** All eleven waves shipped,
closing with wave 5B4b (the capped merge) on 2026-09-02. See *M5B — Manual UX remediation, complete
2026-09-02* below for the close-out, and `docs/milestones/done/M5B-manual-ux-remediation.md` for the
criterion-by-criterion record. **M5 wave 5G shipped 2026-09-02**, closing Q5 — see *M5 wave 5G —
800 mm is the ceiling on any empty column, complete 2026-09-02* below. **M5 wave 5H shipped
2026-09-02**, closing `docs/BACKLOG.md` entry 22 — see *M5 wave 5H — the frozen map is recorded
whole, complete 2026-09-02* below. **5E is M5's only wave still open** — it was held back
specifically so it would not photograph a width surface still changing, and 5G was the last such
change.

**Adversarial review remediation is complete for the security scope** on
branch `adversarial-review-reports`. SCENE-001 and WEB-001 were fixed by an earlier session and have
now been independently verified; DOM-001, SEC-002, SEC-003, SEC-004, DB-001, DB-002 and DB-003 are
closed on this branch. **SEC-001 — the one remaining High — is deferred to M8 by the
owner's decision and gated**; see the launch gate below. So "complete for the security scope" means
every High closed **except** that one deliberate, gated deferral. What remains besides SEC-001 is
Medium and Low, and all of it is listed under *What is open right now*.

**M5 waves 5D2c and 5F shipped on 2026-08-30**; 5E is the only M5 wave still open. That correction is
this close-out's own subject: the earlier text said 5D2c and 5F remained while the branch already
carried them, which is exactly the contradiction that can dispatch work against shipped behaviour.

## How to use this file

Find the phase you are asked to work on in the table below, then follow its **Read** column.

- **Done** → do not open the milestone document. Its plan is spent. What survives is in the ADRs and
  in the code; the archived plan is history, not instruction.
- **In progress** → read the milestone document. Its status header names exactly what is still open.
- **Planned** → read the milestone document when you start it, not before.

Business logic lives in **`docs/decisions/`**. Those records are the knowledge base — the durable
"why" behind the code. A milestone plan describes an intention at a point in time and goes stale the
moment it ships; a decision record does not. When the two disagree, the dated decision wins.

## Where the project stands

| Phase | Status | Read |
| --- | --- | --- |
| M0 — Foundations | **Done** (closed 2026-08-24, partially superseded) | No — `milestones/done/` |
| M1 — Scene port and fidelity gate | **Done** (closed 2026-08-25) | No — `milestones/done/` |
| M2 — Void engine, picking, persistence | **Done** (closed 2026-08-25 — its last gate, the unwired client write path, was closed by M3 Wave 3C-2b) | No — `milestones/done/` |
| M3 — Insert, remove, swap, client write path | **Done** (closed 2026-08-26) | No — `milestones/done/` |
| M4 — Editor panel and shell | **Done** (closed 2026-08-26 — one criterion unmet by design, ADR 0024) | No — `milestones/done/` |
| M5 — Width editing, and depth as a derived quantity | **In progress** — 5A–5D, 5D2a, 5D2b, 5D2c and 5F shipped 2026-08-30; **5G and 5H shipped 2026-09-02** (close Q5 and backlog 22); **5E open** | Yes — `milestones/M5-*.md`, **and ADRs 0028–0041, 0052, 0053**, which supersede large parts of it |
| M6 — Price bar and global settings (**incl. the worktop depth control**, 2026-08-27) | Planned | Yes, when starting |
| M7 — Step 1, room and presets | Planned | Yes, when starting |
| M8 — Review, contact, success | Planned | Yes, when starting |
| Adversarial review remediation | **Complete for the security scope** — SCENE-001, WEB-001, DOM-001, SEC-002, SEC-003, SEC-004, DB-001, DB-002, DB-003 closed; SEC-001 deferred to M8, gated; Medium/Low residuals open | Yes — `milestones/adversarial-review-remediation.md` and `testing-reports/` |
| **M5B — Manual UX remediation** (branch `ux-manual-fixes`) | **Done, 2026-09-02** — all eleven waves shipped; wave 5B4b (the capped merge) closed the milestone | No for the plan itself — its knowledge now lives in ADRs 0043–0051 and in the code. Not yet moved to `milestones/done/` (this session has no file-move tool); still at `milestones/done/M5B-manual-ux-remediation.md`, marked complete at its head |

## Adversarial review remediation — complete for the security scope, 2026-08-31

The reports are in `testing-reports/` (untracked). The wave record is
`milestones/adversarial-review-remediation.md`. What landed on `adversarial-review-reports`:

- **SCENE-001** — commit `db9c402` (`fix(scene): make kitchen shell state independent`). The fixed
  adapter-owned shell cannot reconstruct a deleted placement, and placement sync is the sole owner
  of customer bodies. Adversarial QA and both Full-tier reviews reported no findings, and an
  independent adversarial verification pass on 2026-08-31 reported none either.
- **WEB-001** — commit `b0400ac` (`fix(web): bind save jobs to design identity`). Save work now
  carries immutable design identity/content/generation; persisted identities share ordered save
  lanes, stale callbacks cannot mutate another hydrated design, and separate provisional designs
  receive separate mint identities. QA found and verified Q2.1; Full review found and verified
  R1.1–R1.3, including the A → B → A retry/refusal cases and the production mint cache. The
  2026-08-31 verification pass confirmed the fix and left **three Low residuals**, listed under
  *What is open right now*.
- **DOM-001 and SEC-002** — commit `47e2552` (`fix(domain): reject designs the domain cannot
  execute, at both seams`). The placement schema is bounded and `validateDesignForCatalog` runs at
  both the API write seam and the migration/load seam, so a document the executable domain cannot
  handle is refused rather than stored or loaded. ADR 0038 carries the dated correction that made
  this finding possible to see at all.
- **SEC-003 and SEC-004** — commit `96293c5` (`fix(web): bound the capture route and version the
  browser policy`), recorded in
  [ADR 0041](decisions/0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md).
- **DB-001, DB-002 and DB-003** — commit `e666d96` (`fix(persistence): make the destructive guard
  and the backup honest`).
- **A continuity review round** over those fixes — commit `c5df227`.

**SEC-001 is deferred to M8 by the owner's decision, and the deferral is gated** — commit `f342752`,
[ADR 0019](decisions/0019-security-baseline-writes-throttling-retention.md)'s 2026-08-31 correction,
and the *Launch gate* section of `milestones/M8-review-contact-success.md`. It is a scheduled
decision, not an oversight; the consequence it leaves live is the first item under *What is open
right now*.

**Still open from the review, all Medium or Low:** WEB-002, WEB-003, WEB-004, SCENE-002, DOM-002,
DOM-003, DB-004. None is a reproduced High, and each is described in its report under
`testing-reports/`.

The coordinator's `pnpm check` on 2026-08-31 at commit `c5df227` exited 0 over formatting, lint,
typecheck and **2,415 package tests**: domain 995, persistence 98 (live Neon test database), Three
adapter 708, and web 614 with 4 pre-existing skips. **The Playwright e2e suite was not run in this
session** — the last counted figure is 20 e2e tests plus one `test.skip` on 2026-08-26. (Rerun on
2026-09-02 at M5B's close-out, where it was found red for a stale catalogue id and fixed: 21 passed,
1 skipped. See that section and backlog 24.) Nothing was pushed. The separate untracked runbook was not touched.

## What is actually built

A pnpm monorepo on Node 24: an I/O-free domain package, a Three.js adapter, a persistence package
that is the only place a Postgres driver appears, and a Next.js App Router app. The latest executed
`pnpm check`, run by the coordinator on **2026-08-31 at commit `c5df227`**, exited 0 over **2,415
package tests** (domain 995, Three adapter 708, web 614, persistence 98 against the live Neon test
database) with 4 pre-existing web skips. The repository also carried **20 Playwright e2e tests** and
one `test.skip` when that suite was last counted on 2026-08-26, so that figure is a 2026-08-26 count
and not a current one. (Next rerun: 2026-09-02, M5B's close-out — 21 passed, 1 skipped, after fixing
two ids ADR 0033's row merge had left stale since 2026-08-27.)

Persistence jumped from 30 to 83 without a line of test code being written: **45 of its tests had
been silently skipping** on every previous run because the `qa_owner` credential in
`.env.test.local` was invalid. Those are the live-database assertions — the ADR 0008 least-privilege
role checks, the backup/restore round trip, the Neon repository suite. They were reporting green by
sitting out. A working `TEST_DATABASE_URL` (now `lemn-conf-v2-staging`, distinct from the
application database, so ADR 0006 holds) was supplied on 2026-08-26 and all of them pass — 83 then,
98 at the 2026-08-31 run after the DB-001/DB-002/DB-003 regressions landed.

That is worth remembering as a pattern, not just an incident: a skipped test and a passing test look
identical in a summary line.
Each package owns its tests in its own `tests/` directory and must stay liftable into its own
repository — see `docs/best-practices/engineering-conventions.md`.

**The toolchain is enforced, not merely documented.** `.npmrc` sets `engine-strict=true`, so every
pnpm command in this repository hard-fails on any Node outside `>=24 <25`; `scripts/local-ci.sh`
additionally pins pnpm to the exact `packageManager` version CI installs. This exists because a full
local gate run passed on Node 20 while CI runs 24 — pnpm reported the mismatch as one WARN in a long
log. Details: `docs/best-practices/ci-and-local-gates.md`.

Decisions and findings live in `docs/decisions/` as numbered ADRs with an index at
`docs/decisions/README.md`. The product's behavioural rules are **not** duplicated there: they stay
in `docs/design/DEVELOPMENT-SPEC.md`, cited by section and row.

**M0 — Foundations.** The workspace, the domain package, validation, and the persistence/versioning
conventions. A substantial part still stands; the placement model it originally shipped was replaced
in M2 and its retired modules were deleted rather than left beside the new ones.

**M1 — Scene port.** The supplier's kitchen geometry ported into `packages/three-adapter`, rendered
through an R3F canvas with camera presets. Closed on a fidelity gate requiring two independent kinds
of evidence. A structural parity suite diffs the port against vendored reference geometry at 1e-6 m,
and is the guarantee that later phases have not silently degraded the model.

**M3 — Insert, remove, swap (closed 2026-08-26).** The domain command layer: `insertBody`, `insertFit`,
`removePlacement`, the `{ok}`/`{ok:false, reason}` result contract, the §7 insertable catalogue,
band and accessory rules, and a `BodyProbe` port. Wave 3A is the first wave to run the complete
`docs/WORKFLOW.md` cycle — plan → implement → adversarial QA → review → verify → commit — and the
cycle earned its cost twice. QA found 15 failures against 135 green tests, including an
`insertBody` that would build a **288 mm carcass** where §2's narrowest cabinet is 300, because
`FIT_TOLERANCE_M` (manufacturing slack on a *fit*) was lowering the body's own minimum. Clean-code
review then found that fixing it had made that fix's own test vacuous — the early return now fires
before the assertion. Both survived all eight gates. See
`docs/decisions/0015-min-span-is-exclusive.md`, which also records that the independent logic
reviewer was dispatched and never reported, so the coordinator verified instead — weaker, and worth
re-running. **That gap did not repeat: Wave 3B's logic reviewer delivered**, and its findings are
below.

**M3 Wave 3B — the adapter.** `buildCatalogBody` for §7's fifteen parameterised entries,
`measureBuiltBody` implementing the `BodyProbe` port, and `scene-sync.ts` — a keyed, disposing
mount/unmount that replaced `kitchen-stage.tsx`'s build-once `useMemo`. Two rounds of adversarial QA
and a full review tier produced four ADRs, and three of the findings are worth knowing:

- **The hood could never have been inserted** (ADR 0016). The milestone's carcass mesh pattern
  matched only `hood_canopy`, 130 mm, while §7 fixes the hood at 710 — so every hood insert would
  have failed `BUILT_SIZE_MISMATCH` while §9 kept offering it.
- **`base-sink` was offered into openings it cannot build** (ADR 0017). Its worktop splits around a
  fixed 560 mm aperture and inverts below that; at 400 mm the carcass measures 523 × 913. The
  engine refused correctly, but the offer list still offered it down to 300 mm. Catalogue entries
  may now declare a `minWidthMm`, read by the guard and the offer list from one evaluation. Note the
  550 mm case: the built carcass is inside `FIT_TOLERANCE_M` on both axes, so the built-size
  re-check would have **accepted an inverted worktop** — which is why the floor is declared rather
  than measured.
- **`wall-lift` shipped as a hinged single door**, byte-identical to `wall-1door` — two catalogue
  rows, one body, with §6.5's bottom-edge handle on neither. Caused by the coordinator's own
  dispatch wording, missed by the coordinator's diff review and by two adversarial QA rounds,
  because every test asserted the entry passes the *size* gate and a lift flap is not a carcass
  mesh. Found by logic review. There is now a general property test — no two catalogue ids may build
  the same body, compared by structural signature rather than measurement.

**§11 row 19 is proven for inserted bodies, and it generalises by construction**: `seatOffsetM` is
the origin-to-back-face distance, so placing at that offset cancels the same bounding box that
produced it, whatever its asymmetry. §6.2's two recorded failures came from deriving the plane from
the *previous occupant*, which let one body's asymmetry reach another's placement; nothing here has
a cross-body path. Measured within 3.6e-9 m on both walls for seven bodies.

**M2 — Void engine, picking, persistence.** Both waves are implemented. The `Design` schema, the
placement/column/void derivation with all four earned rules of `DEVELOPMENT-SPEC.md` §4, void mesh
rendering, picking, and the store. Then `ConfigurationRepository` over Neon Postgres storing one
`jsonb` document per design, opaque identifiers, a canonical serialiser, a coalesced write path, a
least-privilege database role verified by live assertions, and a daily backup cron to Vercel Blob.

**M4 — Editor panel and shell (closed 2026-08-26).** §9's customer-facing editor, in four waves.
The panel's rules live as a **pure projection** — `describePanel` in `apps/web/src/panel/panel-model.ts`
turns `meta` plus the offer list plus the last refusal into §9's ordered sections, already resolved —
so §12's "no product logic in components" is enforced by a value rather than by review. Both
reviewers confirmed nothing leaked either way.

**Desktop and mobile are one implementation and the branch is CSS only.** A single
`min-width: 900px` block in `editor-panel.module.css` swaps four spacing tokens (rows 82/66 px,
chips 44/52 px) and nothing else. `matchMedia`, `innerWidth`, `userAgent` and `ontouchstart` appear
nowhere in `apps/web/src`, so §10.1 holds by construction. No rule differs between the shells.

Four findings from this phase are worth knowing, because each was a rule stated in prose that the
data or the wiring did not implement — the same shape as ADRs 0016 and 0017:

- **The Finisaj section was decoration.** `finishKey` was read nowhere in the adapter and `signBody`
  omitted it, so a finish change did not even re-sign the body. Tapping a swatch marked the chip,
  wrote the design and scheduled a save while the scene stayed pixel-identical. `finishes.ts` had
  said in writing "do not build the editor's finish section on top of this module without revisiting
  it"; it was built by copy, without revisiting.
- **§9's ACTUAL badge was unreachable.** Measured: 22 bodies offer a swap list, 0 badges, because
  ADR 0011 Gap A gives every seeded placement a non-insertable `buildId`. Now declared, never
  inferred (ADR 0022).
- **§13.1's "corners are structural" was prose only**, so the panel offered a swap list and a delete
  on a structural corner. Fixing it made §11 row 20 unreachable in production, which ADR 0021
  records rather than lets slide.
- **A tap on the scene was also pressing the sheet** (ADR 0023). Synthesised compatibility mouse
  events are hit-tested when dispatched, by which time the sheet covers the bottom ~78 dvh — so one
  tap selected a body *and* inserted a cabinet or applied a finish nobody chose, minting and writing
  a design each time. §10's "the sheet never steals or leaks pointer events into the canvas" runs in
  both directions. Found only by writing the touch test.

**Read is split from write in the UI too.** `GET /api/designs/{id}` returns a `canWrite` boolean
beside the design, so the panel never discovers it may not edit by attempting an edit. Security
review traced every consumer and confirmed it terminates in `isDisabled` flags — it is advisory and
never the authorisation decision, so ADR 0019's check-then-write prohibition holds. The `/d/{id}`
page cannot answer it (the cookie is `Path=/api/designs/{id}`), so it hydrates `"unknown"` and a
client probe asks the one route the cookie reaches, at the cost of a second GET per shared-link open.

## M5B — Manual UX remediation, complete 2026-09-02

All eleven waves shipped on branch `ux-manual-fixes` (uncommitted). The last, **5B4b — adjacent
empty columns merge under an 800 mm cap** — closed the milestone. Full criterion-by-criterion record:
`docs/milestones/done/M5B-manual-ux-remediation.md`. Decisions: ADRs **0043–0051**.

**5B4b shipped.** Adjacent empty columns merge under an 800 mm cap (ADR 0046 rule 1, reviving
ADR 0037's withdrawn merge). New `packages/configurator-domain/src/merge-empty-columns.ts`
(`MERGE_CAP_MM = 800` at the time — **retired 2026-09-02 by wave 5G into the shared
`MAX_EMPTY_COLUMN_WIDTH_MM`; `MERGE_CAP_MM` no longer exists in the tree, see ADR 0052**) and
`src/module-grid.ts` — a new dependency-free leaf owning `LEVELS`,
`LEVEL_SNAP_M`, `deriveColumnKeyAt`, `alongWallPosition` and `alongWallCoordinate`, which
`void-engine.ts` re-exports so no caller moved. The merge is called from `deriveColumns` (load) and
`resolveColumns` (every branch). Verified: domain **1375**, web **757** (+4 skipped);
`pnpm ci:local` all nine gates PASS. Gates: adversarial QA (two rounds, 24+ mutants), clean-code,
logic, security (scoped) and visual — all green.

**ADR 0037's withdrawal cause is genuinely gone, and the cap was never the cure.** 0037's machinery
was correct; it was withdrawn because `recomputeVoids` subtracts height and never width, so a merged
column was wider than its members and an insert closed the whole level. **5B4a's split is the cure**
— no column is ever wider than its members when `recomputeVoids` runs. Logic review verified
independently: an empty column's voids carry the `spanY0`/`spanH` of the whole free span, so
`dividesWholeColumn` is always true for a merged column and every insert into one splits. The cap
only cures the `'fit'` refusal and bounds the residual.

**Post-merge projection, decided against ADR 0046's own leaning.** Voids carry `col` and
`COLUMN_MISMATCH`/`refuseColumnDrift` hold an insert to that key, so a pre-merge map could only ever
be a shadow — and it cannot survive a command, since an 800 split by a 400 insert leaves a 200
remainder with no pre-merge decomposition. The stored-derived-fact objection is answered by
**ADR 0038** (no stored designs to strand), not by the fixpoint argument, which review showed is
narrower than claimed: `min(top)`/`min(d)` change the agreement predicate, so a second pass can merge
what the first refused. Recorded as a dated note on ADR 0046.

**The wave's defining incident.** A module cycle (`void-engine` ↔ the merge) made `LEVEL_SNAP_M`
read as `NaN`, so **the merge silently never fired while every test passed.** The developer found it.
QA then proved the tests would now catch a reintroduction (both packages red in both), and the cycle
was removed structurally via `module-grid.ts` — verified at **0 cycles across all 43 `dist` modules**.
A new test, `packages/configurator-domain/tests/dist-module-graph.test.ts`, pins acyclicity and
staleness and names the offending cycle when it fails, with the incident in its head comment. An
`import/no-cycle` lint rule was declined on cost (a new dev dependency, lockfile churn, a slow rule)
in favour of the ~100-line dist test.

**Four test gaps QA closed, each of which would have shipped silently.** Maximality — the whole of
ADR 0046 rule 1 — was unasserted (a mutant capping a block at two members passed the entire domain
suite); criterion 9's own named mutant survived against its own fixture, a fixpoint; the load-seam
merge was unasserted at the store; and §5.1's selection-fallback three properties (`col`-first
ordering, strict containment, wall comparison) were all unasserted.

**A MAJOR regression found in review and fixed in-wave.** A delete that triggered a merge left the
selection `null`, violating §5.1 — the merge deletes the vacated key and writes the merged one, so no
void carried it. Existing §5.1 tests stayed green because seeded deletes never trigger a merge. Fixed
by carrying `wall`/`alongM` on `VacatedOpening` and falling back to the void whose along-wall span
strictly contains the vacated centre.

**Security finding, fixed.** The conservative envelope could invert (`max(floor)` with `min(top)`)
for members shorter than `LEVEL_SNAP_M`, producing `EMPTY_COLUMN_INVERTED` on save — the exact bypass
5B2a's guard exists to prevent, since an inverted interval overlaps nothing. Declined by
`hasPositiveHeight`.

**Visual — the owner's own question answered on screen.** Two ghost boxes with a divider at the
1700 mm edge became one undivided box with no seam; all 27 taps across the range return the same id;
`openWMm = 800`; an 800 mm `base-cabinet` then inserts into it and succeeds. The cap refuses without
truncating (600+600 and 300+600 both stay two columns at original edges). Survives reload. All at
390×844. **Not verified: the desktop rail, wall B, and chains longer than two columns.**

~~**Q5 is untouched, not widened a fifth time.** The cap can only ever produce a column ≤800 mm and a
>800 mm column is unmergeable by arithmetic. The owner's open question is now sharply framed: *is
800 mm the ceiling on any empty column, or only on a merge?* If the former, `MERGE_CAP_MM` and the
bound wall B's shrink release needs are one constant, and Q5 closes. See *What is open right now*
below.~~ **Closed 2026-09-02 by wave 5G.** The owner answered: 800 mm is the ceiling on any empty
column. See *M5 wave 5G — 800 mm is the ceiling on any empty column, complete 2026-09-02* below and
[ADR 0052](decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md).

**Documentation owed at close-out — done.** ADR 0046 carries two new dated notes (2026-09-02): the
post-merge projection decision with its reasoning above, and rule 2's agreement predicate gaining `d`
as a third condition beside `top` and floor — conservative envelope `min(top)`/`max(floor)`/`min(d)`,
so 580 vs 600 merge and publish **580** (losing 20 mm rather than inventing an opening over ground
that was never that deep). ADR 0046 also now names two traps it had not named before: `d`
disagreement, and that adjacency must be geometric (`standsIn`-style, overlap plus vertical-interval
intersection) rather than touching-edges, per ADR 0011's own 2026-08-26 correction — the seeded
kitchen has overlapping column spans (`A|0.45`'s 900 mm corner base spans both its neighbours) that a
touching-edges test would miss.

**The Playwright e2e suite was rerun for this close-out, and it was red.** It had not run since
2026-08-26. §10's signature flow at 390x844 failed on `getByTestId("offer-base-2door")` — expected 1,
received 0 — because the panel builds its test id as `offer-${row.buildId}` and commit `3cc3ed3`
(2026-08-27, M5 waves 5C2+5C3) merged `base-2door` and `base-1door` into one `base-cabinet` row under
ADR 0033. The spec was last touched 2026-08-26, the day before. `wall-2door` -> `wall-cabinet` was
stale in the same file for the same reason.

**Not a regression from any M5B wave, and every other gate stayed green throughout** — the rename was
consistent everywhere the unit suites look, and no unit test asserts a DOM test id. Both ids were
corrected and the suite now reports **21 passed, 1 skipped, 0 failed**. §10's flow passing is real
evidence for this milestone rather than an unrelated green: it deletes the fridge, deletes the unit
above it, and asserts the two openings merge into one 700 x 2600 column.

The gap itself — `ci:local` does not run Playwright, so nothing but somebody remembering stands
between a broken e2e suite and a milestone close-out — is **backlog 24**. It surfaced only because
the scribe closing this wave declined to certify a run it had not been told about.

## M5 wave 5G — 800 mm is the ceiling on any empty column, complete 2026-09-02

Plan: `docs/milestones/M5-frozen-map.md`. Decision: [ADR 0052](decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md).
Closes **Q5**, M5's own open question, widened four times during M5B.

**What shipped.** `MAX_EMPTY_COLUMN_WIDTH_MM = 800` (`module-grid.ts`) now bounds every empty column,
not only the result of a merge (`MERGE_CAP_MM` is retired). A shrink that would free more than the
ceiling splits the freed span into two columns — the near one against the resized run, up to 800; the
overflow beyond it — through the same `splitEmptySpanAtCap` arithmetic the merge and the migration both
use. Schema version bumped to **2**: a v1 document holding an oversized `emptyColumns` entry is
normalised on load into the columns the new rule allows; a v2 document holding one is refused with the
tenth refusal code, `EMPTY_COLUMN_WIDER_THAN_CAP`, at both the load seam and the API write seam. An
odd-width oversized v1 entry (unreachable from any command — every catalogue width is even) is refused
rather than split, forced by the shared cap-filling function always taking the (even) 800 mm ceiling
first.

**Verified:** domain **1396**, web **769 (+4 skipped)**, persistence **177**; `pnpm ci:local` — all
gates PASS.

**Gates.** Adversarial QA (18 tests) found criterion 5G-4's write half vacuous (the v2-refusal
assertion was not exercised) and it was closed in-wave. Clean-code review found one stale citation and
it was fixed. Logic review: minor concerns, no blocker — and it corrected the wave's own plan, finding
that a refused shrink (the option the plan considered and rejected) does not fail the way the plan
first described: `fundingScan` falls through to `vacatedEmptySpace`, which mints a strip on a key
distinct from the refusing neighbour's, so `refuseKeyCollision` passes and the map ends with **two
overlapping empty columns that no validator refuses** — a silently invalid map, not the
`COLUMN_KEY_COLLISION` first predicted. ADR 0052 records the corrected argument. Security review: safe
to commit — amplification bounded at **13x** (`MAX_DESIGN_DIMENSION_MM / 800`), the array's own bound
re-asserted after normalising grows it, termination proven from the loop. Visual review: all seven
criteria PASS at 390×844 — two ghost boxes (800 and 100) with a visible seam, each holding its own id
across a tap sweep, the wide one accepting an 800 mm cabinet, the narrow one showing the "may be left
as it is" sentence; the pair rejoining into one undivided 800 mm box with no seam once `p6` is grown
back to 500 mm; survives reload.

**Not load-bearing, and the record says so plainly.** The map-level `splitOversizedEmptyColumns` guard
was reasoned into existence on the premise that a delete could leave a member-less column wider than
800 mm with no command able to split it. QA measured that premise false: `deriveColumns` takes a
column's width as the `Math.min` over its members' frames, the widest deletable body in the catalogue
is 800 mm, and both seams already hold a stored entry to the ceiling. Confirmed by removing the call —
both suites stayed green but for a test built on a hand-constructed map. It is kept as a DOM-001
defence-in-depth guard against a future producer this wave did not anticipate; the original
delete-is-a-producer justification is retracted as false, in place, in the module's own header comment.

**Measured database state before dispatch, 2026-09-02:** 5 `designs` rows, all `schema_version` 1,
0 carrying `emptyColumns`, 0 over 800 mm. A comfort, not a licence — the window for the migration this
wave adds opens the moment it ships. Corrects ADR 0038's premise ("no design has ever been stored") a
second time; see ADR 0052's sweep table.

**5H shipped 2026-09-02, closing backlog 22. 5E (the browser/mobile gate) remains open.**

## M5 wave 5H — the frozen map is recorded whole, complete 2026-09-02

Plan: `docs/milestones/M5-frozen-map.md`. Decision: [ADR 0053](decisions/0053-the-design-document-records-the-whole-frozen-map.md).
Closes `docs/BACKLOG.md` entry 22.

**What shipped.** A second array, `columnExtents`, alongside ADR 0044's `emptyColumns`: the frozen
extent of a column that still holds a member. `emptyColumns` covers only columns with no member at
all, so a partial delete or a clear-then-refill lost the extent on reload — the second route was the
one that mattered, costing 1740 mm of a full-height column on three ordinary taps. A stored extent
now wins by precedence over the derived column on `wall`/`x`/`z`/`w`/`d`/`top`/`regions`, restored
after grouping and before the merge and `withCurrentFullHeightMembers`, exactly as ADR 0046 restores
`emptyColumns`. No schema version bump — additive and optional.

**Verified:** domain **1433** (twice, identical), web **786-788 (+4 skipped)**, persistence **177**;
`pnpm ci:local` — all nine gates PASS.

**Gates.** Adversarial QA (two rounds), clean-code review (one actionable finding, fixed), logic
review (one blocker, fixed), security review (one Medium, fixed).

**The blocker was found by three agents independently, and the dangerous part was not the missing
rule — it was that the code's own stated justification for not needing it was false.** ADR 0053's
safety argument rests on monotone vertical containment: a stored extent's floor is a MIN and its top
a MAX over its own members, so restoring it can only widen a column and never lose the space a member
stands in. That is a **per-key** proof and says nothing across keys, because `recomputeVoids` builds
what a column publishes from that column's own members alone. An extent whose declared footprint
reached into a neighbouring column's key passed every containment check while publishing openings
straight through that neighbour's bodies — reproduced independently by adversarial QA, the logic
reviewer and the security reviewer, each with a concrete input; QA's: an extent for `A|2.00`
declaring `widthMm: 3200` inside the 3600 mm wall published openings spanning 0.4–3.6 m of wall A
through eight real placements, and an insert into one then made the design's own document
unsaveable on the very next command. The plan's working assumption — "the room bounds every extent,
so nothing can reach far enough to cause harm" — was false by four orders of magnitude on that case,
and had been believed and repeated before it was measured. `findWallOverlaps` closes it: a sweep of
all three span kinds (placements, `emptyColumns`, `columnExtents`) per wall, exempting an extent only
against placements filed under its own key, adding `COLUMN_EXTENT_OVERLAPS_PLACEMENT`,
`_EMPTY_COLUMN` and `_COLUMN_EXTENT` to the four per-entry refusal codes the plan already named.

**Two of the plan's own dropped clauses were re-examined, and both stand for corrected reasons.** The
depth clause was dropped because it refuses documents the product itself writes: 400 swept command
sequences against the seeded kitchen produced 10 legitimate extents narrower in depth than a member
they still correctly hold (shrinking the pantry leaves `B|1.77` frozen at 600 mm holding a top box
that occupies 639 mm). The along-wall clause's original justification was corrected in place: the
seeded `A|1.30` first cited to justify dropping it was measured wrong — it holds three 800 mm members
at 800 mm width, not one 600 mm member at 500 mm — and a re-sweep of the same 400 sequences found the
clause would have refused **zero** of them.

**A consequence worth knowing.** `columnExtents` is populated for every occupied column on the
resolved map, not only the ones a triggering command touched, so the *next* save of any legacy
document — of any kind, unrelated to width or free space — is no longer a wire no-op. ADR 0002's
round-trip invariant (load, validate, re-serialise, compare with no command run) is unaffected;
what changes is what the next save writes. ADR 0044's premise that no design has ever been stored is
already corrected (ADR 0052: 5 rows exist, `schema_version` 1) — none of those five carries
`columnExtents` yet, and the window for this consequence opens the moment a save runs against one.

## What is open right now

**M5B — Manual UX remediation is complete, 2026-09-02** — see the section immediately above for the
close-out. Everything below this line that references M5B as open is historical detail from the
wave-by-wave record, kept for what each wave actually delivered. It sat between M5 and M6: after M5 because every record it reopens is M5's and because 5E would otherwise gate a surface M5B is changing, before M6 because M6 prices a document M5B is adding a field to. Eleven findings from a manual
session on 2026-08-31 (`testing-reports/09-manual-ux-issues.md`) plus three owner decisions of
2026-09-01. The plan is `milestones/done/M5B-manual-ux-remediation.md`; the decisions are ADRs **0043** (a gap of
any width is legal), **0044** (empty columns are persisted), **0045** (the run-end panel follows),
**0046** (the capped merge and the insert-time split, reviving ADR 0037), **0047** (open-shelf
compartments follow clearance), **0048** (the pantry column is resizable) and **0049** (a fixed-width cabinet shows its width section disabled).

**The owner answered four of the phase's five open questions on 2026-09-01**: wave 5B5 shows the disabled section with its reason, an inserted cabinet sits against the **left** edge of a wider span, a 400 mm pantry keeps the 600's height and shelf pitch, and report item 6 was **measured** to be a reload defect owned by 5B2 rather than 5B1. **Q5, inherited from M5 and sharpened four times during M5B, closed 2026-09-02 by M5 wave 5G** — whether a shrink may widen an empty column past 800 mm: no, 800 mm is the ceiling on any empty column. See *M5 wave 5G* below. **5B4b — the merge, the phase's
highest risk — shipped last, as the owner asked, and closed the milestone.**

### Where each M5B wave stands (historical, wave by wave)

Nothing in this phase is committed yet; all of it is uncommitted work on `ux-manual-fixes`.

| Wave | State |
| --- | --- |
| **5B1** — the growth-side remainder floor, and the sentence that named it | **Complete.** Implemented, adversarial QA (findings Q1–Q4), clean-code review (R1.1–R1.9) and product-logic review (R2.1–R2.4) all applied. Domain 1094 / web 684 / adapter 899 / persistence 177, lint and typecheck clean. |
| **5B6** — the hob+oven cavity | **Complete.** QA finding Q6 answered by the owner 2026-09-01 (make the filler a finishable front) and applied: the filler mesh renamed `oven_filler_front` → `oven_filler_door_front`, `base-hob-oven` gains `canFinish: true`, `canHandle` stays `false`. ADR 0050 records it and strikes ADR 0027's now-false ground. `catalog-capability-parity.test.ts`, `hob-base.adversarial.test.ts` (domain and web) re-pointed, not weakened. M1 parity and `occupiedDepth` unchanged. |
| **5B7** — open-shelf compartments follow clearance | **Complete.** QA finding Q2 was Q7 in the milestone file's open questions; the owner answered it 2026-09-01 (fix the wording, keep the geometry) and ADR 0047 and the acceptance criterion are corrected. `qa-5b6-5b7.adversarial.test.ts` no longer asserts the old *equal clear height* reading — it was replaced by two stronger tests (even board centres measured off built geometry, and every interior board strictly between `shelf_bottom` and `shelf_top`), and the height sweep widened from `[400, 501, 700]` to `[300, 400, 499, 500, 501, 600, 700]`. Adapter suite green: 35 files / 934 tests. |
| **5B3** — the run-end panel follows the run it closes | **Complete.** Implemented, adversarial QA green, clean-code and product-logic review applied, and visual verification run against the running app. Acceptance criterion 5 corrected: the panel is never *selected* and never carries a `placementId`, but a tap on it falls through to the cabinet behind it — pre-existing §6.1 raycast behaviour, now recorded as expected rather than a defect. Visual verification measured the authored 1 mm gap holding at exactly 1.000 mm at every position tested (seeded 3.510; −50 mm → 3.460; −100 mm → 3.410; the four re-seats down the run at 2.910/2.310/1.710/0.910; Y span `[0, 0.820]` unchanged throughout), and verified the owner's veto rule live: inserting `tall-pantry-600` at the run end hides the panel with no rendered box and no oak found across 15 pixel probes at five heights. Two caveats recorded: the hide-on-last-cabinet state is unreachable through the UI in the seeded design (the last wall-A base body is the corner unit, whose panel renders no remove control) and was verified through save/hydrate instead; and `setWidth` resizes the whole column, so the state that actually discriminates the x-only-veto bug is deleting `p4` alone, leaving `p14`/`p20` spanning the new seat in x while hanging above it in y — that passed. |
| **5B5** — a fixed-width cabinet says why it has no width control | **Complete.** Implemented, adversarial QA green, clean-code and product-logic review applied. A `fixedWidth` body now publishes one width carrying the engine's own `NOT_RESIZABLE` sentence, rendered as a single disabled chip through the existing `renderRejection` path; `meta.canWidth` is gone from `collectOfferedSections`, so the domain's published width options are the sole author of whether the section exists. `resolveResizableBody` now publishes `cause: "fixed" | "unresolvable"`, with `unresolvable` winning when a row is both, so a row that is both fixed-width and missing its width data cannot leak an internal `kind` string to the customer. |
| **5B10** — the dishwasher niche wears a decor door | **Complete.** Implemented, adversarial QA green, clean-code review applied. `base-dishwasher`/`base-dishwasher-600` build their own `door_front` (`doorSlab`, flush with every neighbouring base front by construction) and the appliance inside a housing is built fully integrated (`dw_body` only) — the only `handle` group left is the door's. Neither flag changed; `RECORDED_CAPABILITY_GAPS` is now empty. Occupied depth followed the geometry down 632 → 620 mm, the 580 mm seat unchanged, `DISHWASHER_BASE_FINISHED_DEPTH_MM` deleted. **The only M5B wave to move seeded geometry**: M1's structural-parity gate was re-baselined per ADR 0036's rule (declared, not relaxed) — ADR 0051 adds a `DeclaredStructuralChange` form to the ledger, and adversarial QA then found and closed a hole in that form itself (see ADR 0051's 2026-09-01 amendment): declaring one node both `added` and `removed` erased it from comparison, letting a 25 mm `back_panel` move pass 71/71 green; `refuseTwoDeclarationsOnOneNode` now refuses any repeated `(parent, node)` key. Verified state: domain 1139, persistence 177, adapter 1038, web 715 (4 pre-existing skips), M1 parity 71/71 green with the re-baseline, format/lint/typecheck clean. Closes backlog entry 11; its `tall-oven-tower` tail is re-recorded as backlog entry 18, and a new floor the wave exposed is backlog entry 19. |
| **5B8** — the pantry column is the one resizable column | **Complete.** Implemented, adversarial QA (all four actionable findings fixed), clean-code review (no actionable defects; one non-blocking DRY note carried forward — the `doors===1/doors===2` leaf pattern now appears three times, `kitchen-parts.ts:750`, `:1411`, `:1772`, up from two before this wave) and product-logic review (matches intent, minor concerns, no blocker — every census delta independently re-derived and reconciled exactly; its two findings were already fixed by the time review closed) all applied. `tall-pantry` is now `cabinetryWidths({ minMm: 400, maxMm: 800 })`, `fixedWidth: false`, `doorCountFollowsWidth: true`, built by a width-parameterised `make.tallPantry`; the seeded `Builders["tall-pantry"]()` call is unchanged at 600 mm / 2 doors. Verified: domain 1214, persistence 177, three-adapter 1208, web 714 (+4 skipped); `pnpm ci:local` passed every gate; M1 structural parity 73 + 31 = 104 at 1e-6 m. Visual verification (`docs/best-practices/browser-and-visual-qa.md`) passed all six criteria: the door-count flip was observed live at exactly 500 mm, the door shadow gap held constant at 1 px across 500/550/600 mm and the plinth band stayed 13 px tall at identical y across all four widths tested (fittings unstretched), and the mobile 390×844 gate passed (buttons 132×44). **Two things were not rendered, and the reviewer made no claim about either — both are pinned by unit test instead:** (a) 700/800 mm pantry geometry is unreachable in the seeded kitchen — wall B has no free space on either side and an emptied column stays a 600 mm column — so only 400–600 mm was seen live; (b) the back inset is not visible from any camera preset. |
| **5B2a** — the document contract | **Complete.** `emptyColumns` is now an optional, capped field on `DesignSchema` per ADR 0044 (`design.ts`); the cap is `MAX_EMPTY_COLUMNS = 1262`, derived in `design-bounds.ts` from column-key granularity — `deriveColumnKeyAt` renders a metre value with `toFixed(2)`, so keys are 10 mm apart, giving `(6300/10 + 1) × 2 = 1262`. The earlier 684 derivation (wall runs ÷ `WIDTH_STEP_MM` × three module bands) refused legal documents — ADR 0043 leaves an empty column no width floor, so `WIDTH_STEP_MM` bounds nothing — proven by 631 one-millimetre strips 10 mm apart, all schema-valid. `MAX_DESIGN_BYTES` follows at 248 576 B (168 × 512 + 1262 × 128 + 1024). `deriveColumns` (`void-engine.ts`) now takes `deriveColumns(records, emptyColumns = [])` and adds the stored entries after grouping placements; `validate-design.ts` gained nine refusal codes (`EMPTY_COLUMN_INVERTED`, `EMPTY_COLUMN_BEFORE_WALL_START`, `EMPTY_COLUMN_PAST_WALL_END`, `EMPTY_COLUMN_ABOVE_ROOM`, `EMPTY_COLUMN_DEEPER_THAN_ROOM`, `EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`, `EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN`, `EMPTY_COLUMN_OVERLAPS_PLACEMENT`, `EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN`). Tests: `empty-columns.test.ts`, `qa-5b2a.adversarial.test.ts`. Domain suite 1276 passed, deterministic across repeated runs; `pnpm ci:local` all gates PASS. Gates: QA (every mutant killed, none survived), clean-code (no actionable defects), logic (minor concerns, no blocker), security (safe to commit, reconfirmed after the cap changed). **No visual verification** — the wave is confined to `configurator-domain`, which has no rendering surface; that belongs to 5B2b. A shared `findContainmentBreaches` helper exposed that the placement path had only refusal tests and no acceptance boundary — loosening `>` to `>=` would have gone red for empty columns and stayed green for bodies — closed by six new sweeps against a pre-existing gap in a shipped rule. `MAX_DESIGN_BYTES` (248 576 B per row, 2.85× the original 87 040) does not move M8's gate parameter, but M8's retention sizing should use this figure. |
| **5B2b** — the write seam, closing wave 5B2 | **Complete, 2026-09-01. Wave 5B2 (5B2a + 5B2b) is now fully closed.** `projectEmptyColumns` (pure, `void-engine.ts`) and `withEmptyColumns` (`apps/web/src/store/apply-command-result.ts`), wired into `configurator-store.ts:262` as `design.emptyColumns`. Verified: domain 1304, web 746 (+4 skipped); `pnpm ci:local` all gates PASS. Gates: adversarial QA (found and reproduced a blocker — see below — 12+ mutants, all killed), clean-code (no actionable defects), logic (matches intent, no blocker), visual (all six criteria PASS). **The blocker QA found and the developer fixed is this wave's real lesson.** `void-engine.ts` claimed `UnprojectableColumnError` was unreachable because `refuseFractionalCentres` refused any non-integral member centre — but the guard inspected only the *members'* centres, not the empty column's own. The two expressions decouple whenever `resolveColumnExtent`'s width is odd (reachable from the shipped fixture: `p26` at 320 mm, `p9`/`p21` at 570 mm), and two 600 mm bodies at `alongMm` 1000/1001 pass schema and `validateDesignForCatalog` but threw `UnprojectableColumnError` uncaught from `setWidth(600)`. Fixed by extending the guard to every centre a move writes (members plus both frozen moves), refusing `NON_INTEGER_MILLIMETRES` with `field: "centreMm"`. QA then swept `top`, `d`, `y0`, `w` and found them structurally unreachable as fractional values — only `alongMm`/`widthMm` were ever exposed — and a swept assertion now checks all five fields on every column. Visual: §10's signature flow reverified with `topMm: 2600` read from the **stored** document (neighbours top at 2200, so it could not be inferred), at 390×844 under real touch; the desktop rail, wall-A columns, and insert-after-reload snapping were **not** verified. |
| **5B4a** — an insert splits the column it does not fill | **Complete, 2026-09-01.** Implemented, adversarial QA (14 mutants, all killed; adjudicated the developer's narrowing), clean-code review (no actionable defects), logic review (matches intent, minor concerns, no blocker), security review (scoped to two questions, safe to commit, no findings) and visual review (all six criteria PASS) all applied. Files: `commands/insert-fit.ts` (`InsertPlan.alongMm`/`remainderMm`, `seatAlongColumn`, `dividesWholeColumn`, `seatableMillimetres`, `centredInOpening`), new `commands/split-column.ts`, `command-result.ts` (`BodyInsertedEffect.columns`), `commands/insert-body.ts`, `apps/web/src/store/apply-command-result.ts`, plus a comment-only pointer in `void-engine.ts`. Tests: `split-column.test.ts`, `insert-splits-column.test.ts`, `qa-5b4a.adversarial.test.ts`. Verified: domain 1332 (twice, identical), web 749 (+4 skipped) against a freshly rebuilt domain package; `pnpm ci:local` all nine gates PASS. **The split has a forced precondition, ADR 0046's 2026-09-01 amendment: a column is divided only by an opening running its whole height — no member left standing in it.** Splitting under a surviving member re-keys the occupied half while that member keeps deriving the old key (ADR 0011 Gap D's phantom column), reproduced by QA as two `EMPTY_COLUMN_OVERLAPS_PLACEMENT` refusals on save. Curing it is backlog 2's re-split, out of this phase by name. **Consequence: nothing splits on the seeded kitchen** — `base-dishwasher` still centres in the 700 mm `B|2.45` (the over-fridge cabinet keeps it indivisible), and no seeded base cabinet sits in a column one delete makes splittable. So the wave delivers the mechanism and gates 5B4b; the seeded *outcome* waits on backlog 2. Both reviewers independently verified the precondition is minimal-equivalent. **The ADR 0037 gate PASSES**, which is what unlocks 5B4b: both of criterion 4's scenarios assert a **second insert succeeding**, not merely a void existing — verified non-vacuous (revert the split and the test throws before its assertion) and confirmed live in visual review (a 300 mm leftover, tapped, offering "4 corpuri intră", second insert succeeded). Visual evidence: conservation exact (occupied left = original left 1500, remainder right = original right 2100, shared boundary 1800), flush seating showing a zero-pixel gap on one side and a 46-px selectable gap on the other, split surviving a reload byte-identically, all at 390×844 under real touch. **The verifier had to rebuild the domain package first** — `dist/commands/split-column.js` did not exist, so the code under test was not live at the start of verification; recorded as evidence-integrity practice in `docs/best-practices/ci-and-local-gates.md`. |
| **5B4b** — adjacent empty columns merge, capped at 800 mm | **Complete, 2026-09-02 — closes M5B.** See *M5B — Manual UX remediation, complete 2026-09-02* above for the full close-out: the merge, the module-cycle incident, the MAJOR selection regression fixed in-wave, the security fix, and the visual evidence. Domain 1375, web 757 (+4 skipped); `pnpm ci:local` all nine gates PASS. |

**5B1's real lesson, and it is a process one.** The owner's standing instruction — *check whether an
earlier record said the opposite before implementing* — caught **five** statements of the rule ADR
0043 removed, found one at a time and each by a different gate: the implementer's sweep found ADR
0031's Consequences restating its own bullet; clean-code review found the definition site of
`MIN_WIDTH_M` in `void-engine.ts` still teaching it; product-logic review found `M5-width.md`
stating it twice, in a directory **the sweep never covered**. ADR 0043's own sweep table claimed
ADR 0031 was "the only record that states the rule"; that claim was false and is now recorded as a
correction rather than quietly reworded. **A decision sweep must cover `docs/milestones/`, not only
`docs/decisions/`, the spec and the backlog.**

Two tests in that wave were also found to be **vacuous rather than merely weak**: the stepper/chip
agreement sweep measured `CHECKED=0` — neither the shipped kitchen nor a single cleared column
contains a body that can grow, so every iteration hit a `continue` — and the reworded shrink
sentence was covered by a row that called the renderer directly, on a branch no command can reach.
Both are fixed; the sweep now runs five worlds against a pinned floor.

### The M5B items that needed the owner (historical — the phase is closed)

Both of this phase's QA-raised owner questions are answered as of 2026-09-01. **Q6** (wave 5B6's
filler panel) is answered — make it a finishable front — and closed in
[ADR 0050](decisions/0050-the-hob-oven-filler-is-a-finishable-front.md); wave 5B6 is complete. **Q7**
(the open-shelf spacing question) was answered the same day — fix the wording, keep the geometry —
and is folded into ADR 0047 and the milestone file's *Answered* table; wave 5B7 is complete, with
the QA test re-pointed to the corrected criterion.

**The mint endpoint is unbounded at the application layer.** `POST /api/designs` has no application
rate limiter and no active retention, which is SEC-001. The owner deferred it to **M8** on
2026-08-31 and the deferral is gated: `milestones/M8-review-contact-success.md`'s *Launch gate* must
be checked off before the endpoint sees real traffic, and ADR 0019's 2026-08-31 correction records
the decision. Deferred and gated is not the same as closed — until that gate is met, this is the one
security consequence the branch knowingly carries.

**Seven adversarial-review findings are still open**, all Medium or Low: **WEB-002, WEB-003,
WEB-004, SCENE-002, DOM-002, DOM-003, DB-004**. Their only descriptions are in `testing-reports/`,
which is **untracked and not in the repository** — so for anyone without that folder these survive
here as bare identifiers and nothing more. Whoever picks one up either needs the reports from the
owner or has to reproduce the finding from scratch. That is a real cost of keeping the reports
untracked, recorded rather than discovered later.

**Reported issues that are not scheduled live in `docs/BACKLOG.md`.** The first of the two found in
the first handset pass is now closed: the induction hob **can** be restored, because ADR 0027 made it
part of the cabinet body and added two hob-bearing catalogue entries. The second — clearing two
adjacent cabinets yields two openings rather than one, the run re-split §12 lists as "Not built,
designed" — was **decided on 2026-08-28 by [ADR 0037](decisions/0037-adjacent-empty-columns-merge-into-one-space.md)**,
**built in 5D2b on 2026-08-29 and withdrawn on 2026-08-30** because §4 had no horizontal half. **The
mechanism is now shipped, under [ADR 0046](decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md),
by wave 5B4b on 2026-09-02** — §4 gained its horizontal half in 5B4a, so the merge no longer strands
a level, and adjacent empty columns totalling at most 800 mm merge into one column and one visible
opening. **This is only a partial close, and backlog entry 2 stays open**: the merge does not fire
from a plain double delete on the *seeded* kitchen (every seeded neighbouring pair totals more than
800 mm), so the report's original gesture is still two openings there, and backlog 2's second half —
offering a run's total as valid module combinations (`800+600`, `600+400+400`) — is not built. 800 mm
still caps every cabinet, so what the merge buys is freedom over the *number and position* of
cabinets in a span rather than a bigger one.

**A third handset report, 2026-08-27, is now scheduled rather than backlog.** Re-inserting a deleted
top-row cabinet builds it 400 mm deep beside 330 mm neighbours. Diagnosed as backlog 5's unfinished
half — the depth cap and the catalogue nominal are unlinked constants — and folded into M5 as wave
5A. **Eight depth questions are recorded and undecided**, in `docs/milestones/M5-width.md` under
*Not established — Depth*, each tagged with the milestone that needs it: the hood, whether an 800
worktop is real, whether a 700 worktop moves wall cabinet height as well as depth, what happens to a
design saved at 600 when the setting changes, the two deliberately-deep top cabinets, whether the
map's value is the carcass or the carcass plus its door, whether the shipped worktop is 600 or 620,
and backlog 10's surviving divergence. **Only two gate an M5 wave** — the carcass-versus-door
question (5A) and the 600-versus-620 question (5F). **Four travel to M6 with the control** and are
repeated in that plan's open questions so they are not lost at the seam; the design-saved-at-600
question blocks M6's control.

**The deletion ADR 0027 owed is done.** The standalone accessory machinery is gone — §6.1's host
resolution, §5.1's cascade, `ACCESSORY_MAX_HEIGHT_M`, `PlacementRecord.accessory`,
`cascadedAccessoryIds` and the `cooktop-600` entry — authorised by
[ADR 0038](decisions/0038-pre-release-no-stored-designs-no-migrations.md) on the owner's confirmation
that nothing has ever been stored. Product-logic review established the deletion is behaviour-free
with more margin than expected: the reachable frame-height floor is **400 mm**, enforced by
`refuseShortOpening`'s `HEIGHT_FLEX_MIN_OPENING_MM`, not 300 by a coincidence of constants. §11
row 15 survives, restated — the hob is a child mesh of its cabinet's group, so a click climbs to the
cabinet with no resolution pass.

**[ADR 0038](decisions/0038-pre-release-no-stored-designs-no-migrations.md) expires at first release,
and this is the line that must survive until then.** M7 or M8 must re-read it before launch and
decide the first stored schema.

**Corrected 2026-08-31.** That record's named obligation — `DesignPlacementSchema` accepting
`heightMm` with no lower bound — was filed as future work because the ADR believed the state was
*"unreachable today — there is no deserialisation surface"*. **That premise was false when it was
written.** The branch has a public `PUT`/`PATCH /api/designs/{id}` deserialisation surface and a
Postgres load/migration surface, and the adversarial review proved both accepted the invalid
document (DOM-001, AV-3). The schema is now bounded and `validateDesignForCatalog` runs at both
seams (commit `47e2552`), so the 40 mm case is refused by `MIN_BODY_HEIGHT_MM`. ADR 0038 carries the
dated correction. The durable lesson is the shape of the mistake, not the constant: a stale
"unreachable" premise concealed an executable validation defect for as long as nobody re-checked it.


**M4 closed with one acceptance criterion unmet, on purpose (ADR 0024).** Its Verification section
asks for browser tests of the rejection state's three simultaneous requirements. There is no
reachable path to a refusal through §9's panel: the replace list is fit-filtered through the same
evaluation `insertBody` runs, the probe case is pre-empted on the row, finish/handle/remove are
gated on the flags the commands check, and read-only disables everything. Writing that test would
mean first building a list that offers what the engine refuses — manufacturing the defect the rule
exists to prevent. The banner stays covered by model tests, the suite asserts the *absence* of
refusals across the whole signature flow, and the third requirement ("the total does not move")
is **carried to M6**, which is where a total first exists.

**The panel's render half is thinly covered, and it is worth knowing where.** `apps/web/tests/panel/`
is model-only. The browser proves the §10 loop, the sheet geometry, the read-only path and the
desktop rail — but the §9 sections for a corner return, an unknown kind (§11 row 24) and a
zero-result list are reached by no seeded selection, so they remain model-tested only. The width
section has **never rendered in any browser run**, because no seeded entry has `sizesMm` (below).

**M4's `sizesMm` gap is closed, and the arrangement behind it survived two waves.** Wave 5B gave the
seeded entries their sets and wave 5D moved the chip row to the column (ADR 0034), so the width
section renders across the shipped kitchen. What did **not** change is the reason it can still be
absent: `canWidth` stays §9's literal rule — selected, not empty, not `fixedWidth` — and a body that
resolves no set gets no section rather than a one-chip one. An earlier M4 fix folded "has widths to
offer" into `canWidth` itself; logic review overturned it, because that would have made missing data
fail *silently* instead of loudly. It is still the arrangement, now enforced in the domain as well:
`columnWidthChoices` returns nothing rather than conjuring a set out of the current width.

**Deferred review findings, named so they are not lost.** From M4's clean-code round: the four-way
panel test-file split has become redundant coverage with duplicated helpers; `advancePast` lets three
domain tests open a span no command path can produce; several small items (named-object parameters,
a `must<T>` helper, `.grabber` on a sheet that cannot be dragged). From the 4C logic round: the
save-failed notice unmounts and remounts on every retry, jumping ~50 px of offer list under the
customer's finger; two hard-coded hex values duplicate the rejection tone. From 4C security: the
write-access probe fetches and parses the whole design for one boolean, so **M8 must size its rate
limits against a doubled read rate**; `GET`'s 404 reflects the caller-supplied id and its 500 returns
a Zod tree over the stored document, where the write path deliberately returns neither.

**Three Low residuals on WEB-001's fix, found by the 2026-08-31 verification pass** and not present
in the original reports. They are recorded here rather than in `docs/BACKLOG.md`, which is for
product behaviour a user observed; these are engineering deferrals from a review round, which that
file's own preamble sends here.

- The store takes its design id from the **server response** rather than from the captured save job,
  so a route answering with a different id would move the store to it.
- **Generation churn resets an identity's outage backoff**, so repeated A → B → A navigation during a
  total server outage issues requests with no backoff at all.
- **The refusal maps are never pruned**, so a design refused once stays refused for the tab's
  lifetime.

**M2's restore drill, unchanged:** Path 2 of the restore drill has not been re-run from an export
actually downloaded from Blob, and Path 1 (Neon PITR) has never been drilled. Note the restore path
changed this wave — `write_token_hash` is now exported and restored, without which every restored
design would have been permanently unwritable.

**Infrastructure state — live as of 2026-09-02.** Repository `DumitruSirbu/lemn-conf-v2` (private),
CI green on **ten** gates — `install`, `format`, `lint`, `typecheck`, `test`, **`e2e`**, `build`,
`boundary`, `lockfile`, `sca` — and `.githooks/pre-push` runs the same gate set locally so a red
build never reaches GitHub. The `e2e` gate was added 2026-09-02 to both the workflow and
`scripts/local-ci.sh` at once; before that **nothing anywhere ran Playwright**, which is how a red
signature-flow spec sat unnoticed for six days (backlog 24, now closed). Vercel is connected to the repository and deploys `main` to production
automatically; Root Directory `apps/web`, Next.js preset, Node 24. The backup cron
`/api/cron/backup-designs` is registered on `0 3 * * *` and has produced its first export.

Verified live: `/configurator/configure` serves 200, and the cron endpoint returns 401 to an
unauthenticated caller and to a wrong bearer token — it fails closed.

## The security decision is made — ADR 0019

**ADR 0014 is superseded.** The unauthenticated write surface (S1), the unauthenticated mint (S3)
and the absence of rate limiting (S4) are all decided in
`docs/decisions/0019-security-baseline-writes-throttling-retention.md`, on the owner's direction of
2026-08-25 that security is the priority. Nothing here is implemented yet — the record is the
decision, and **Wave 3C builds the write path with authorisation from the start rather than
retrofitting it.**

What was decided, in brief:

- **Read is split from write.** Minting sets an `HttpOnly` cookie holding a per-design write token;
  `PUT`/`PATCH` require it. A shared link stays readable by anyone and can no longer destroy the
  design it points at.
- **Vercel is the firewall; the application does the rate limiting.** The edge drops what is never
  legitimate, challenges what is unlikely to be, and absorbs volume for free; it holds no
  per-endpoint policy. Every recognisable limit is application code over the existing Postgres. No
  Redis, on the owner's direction not to add maintenance surface. The reason to keep an edge layer
  at all is narrow and worth remembering: **an application limiter has to run a function and touch
  the database in order to say no**, so under a flood on free tiers it becomes the denial of
  service it exists to prevent.
- **Identity is several independent buckets**, most restrictive winning — IP aggregated to /24 and
  /64, session cookie, email address, and a global cap. Never IP+session fused into one key, which
  is weaker than either alone.
- **Geography is a first-class signal**, because the tool is expected to be used rarely and
  essentially only from Moldova. Non-MD traffic is challenged and tightly limited, never denied —
  the diaspora, roaming and VPNs all geolocate unpredictably, and a country deny fails silently.
- **Abandoned designs are deleted after 30 days**, which also closes the retention question this
  file has carried as open since 2026-08-25.
- **Cross-device editing uses an emailed link, not a password.** Storing credentials for people who
  never made an account was considered and rejected.
- **No external proxy in front of Vercel** (Cloudflare orange-cloud specifically). DNS-only is fine.

**Implementation is deferred; the decisions are not.** On the owner's direction of 2026-08-25 —
the project is nowhere near done — the firewall is **not** being set up now. The rules were staged
once to prove they stage cleanly, then discarded; the project has **zero** custom rules today, and
`docs/runbooks/firewall-setup.md` holds the exact commands and the plan constraints so re-creating
them later is a copy-paste. ADR 0019 decision 10 assigns every part to a phase:

| Part | Phase |
| --- | --- |
| Write-token cookie / read–write split | **M3 Wave 3C** — the one part that gets *more* expensive by waiting |
| Save-coalescer minimum interval | **M3 Wave 3C** — a write-path defect, not a security control |
| Application rate limiting, retention cron, emailed edit link, BotID/honeypot | **M8**, with the contact form |
| WAF rules | **Pre-launch, after M7** — no value against zero traffic |

One plan constraint worth knowing before that work starts: **this plan permits exactly one WAF
`rate_limit` rule.** A second returns "Rate limiting is not available for this plan (401)", which is
misleading — the first stages fine. So the edge cannot express per-endpoint policy, and every
per-endpoint limit is enforced in the application layer.

**A defect found while sizing the limits, not yet fixed:** the save coalescer has no minimum
interval — `scheduleSave` runs immediately unless a save is in flight, so its sustained output is
bounded by network round-trip time rather than by a timer. During active editing that is roughly
one write per RTT, and M5's width dragging makes it continuous. ADR 0019 decision 6 adds a 1 000 ms
floor; until it lands, no update rate limit can be sized honestly.

## What to do next

**M5B — Manual UX remediation is complete, 2026-09-02.** All eleven waves shipped; the last, 5B4b
(the capped merge), closed the milestone — see *M5B — Manual UX remediation, complete 2026-09-02*
above. Final verified state: domain 1375, web 757 (+4 skipped), `pnpm ci:local` all nine gates PASS.
The Playwright e2e suite was rerun for the close-out: **21 passed, 1 skipped, 0 failed**, after
fixing two catalogue ids that ADR 0033's row merge had left stale in `signature-flow.e2e.spec.ts`
since 2026-08-27. See the close-out section's last paragraph, and backlog 24 for the reporting gap
that let a red suite sit unnoticed for six days.

The plan is archived at `docs/milestones/done/M5B-manual-ux-remediation.md`. Per that directory's own
README, **do not read it** — it is a closed intention, and what is live from the phase is this file
plus ADRs 0043–0051 (with 0033 and 0046 amended at close). Open it only for a historical question.

**Next: M5 wave 5E — the browser and mobile gate.** It was the only M5 wave still open, and it was
deliberately held back while M5B was changing the width surface it photographs; that condition is now
gone. 5D2c (the panel
stepper) and 5F (base carcass depth as a formula) **both shipped on 2026-08-30**; see the commit list
below. 5E photographs the width surface, and the surface it photographs is now the stepper rather
than the chip row, so read ADR **0035** before writing a single assertion. ADR 0024's reachable
rejection banner is also 5E's.

Shipped in 5D2c: `08a01c6`, `a157cc5`, `a2a4da7`, `c3ab574`, `77a90d2`. Shipped in 5F: `d7a1d94`,
`71661d6`, `c1f3aa3`. All eight are ancestors of the current `HEAD`.

**What 5D2c built, kept here because 5E has to verify it** (ADRs **0035**, **0032** for the
disabled-with-reason rule, **0034** for the seam 5D2a and 5D2b kept):

- **Two controls, chosen by the shape of `widthRangesMm`, never by `fixedWidth`** — that flag is
  `false` on both discrete rows, the dishwasher included, and ADR 0035 decision 3 carries the
  correction. A range with `minMm < maxMm` gets the `+50` / `−50` stepper; every range a single
  width gets a plain choice.
- **A button at a bound is disabled carrying its reason**, never absent (ADR 0032). The floors that
  now exist: the entry's own, §2's default, and — new in 5D2b — **the hood's width**, which is what
  the `−50` greys out at on a column holding one.
- **Two new sentences.** A span wider than 800 mm fits no cabinet and **may simply be left empty**
  (ADR 0037, owner 2026-08-28) — §9's "say what to clear" advice inverts there, because clearing
  makes it wider. And the hood floor needs its own reason on the greyed-out `−50`.
- **Retire 5D's chip row** and its pinned counts; rewrite the property test in the stronger form:
  at every reachable width, each button is enabled if and only if the step it offers succeeds.


**5F is done, not next.** Base carcass depth is a formula the model derives — the only wave that
touched a builder and the only one that could reach M1's 1e-6 m parity gate. Shipped 2026-08-30
across `d7a1d94`, `71661d6` and `c1f3aa3`, with ADRs **0039** and **0040** recording the hood's depth
and the recorded-seat conversion.

**Both of these were answered on 2026-08-28 and are recorded in ADR 0035 — a column is one width at every level and a mixed column is squared up rather than refused, and shrinking does create empty space.** The original framing, kept because it records what was uncertain and why: whether a column holding mixed
widths should be squared up rather than refused (`COLUMN_MEMBERS_UNALIGNED`, 13 lockouts — **both
answered on 2026-08-28 and shipped in wave 5D2b; the refusal code is deleted**), and whether
*shrinking* a column should create empty space — which would make the kitchen resizable without a
delete first, and which 5D's measurement makes the more pressing of the two. ADR 0031 records that
the "not representable" argument against it was **wrong**; the machinery exists.


**M5 — editing a cabinet's size (§5.4's resize as a boundary move, §11 rows 9–14; plus depth, §5.2
and §7).** M4 built the width section and every chip in it is `blocked`, because no resize command
exists. Read `docs/milestones/M5-width.md` when you start it.

**M5 gained depth on 2026-08-27 and is now six waves, and the first one is a defect fix.** A handset
report — delete a top-row cabinet, insert one back, it returns 400 mm deep against 330 mm neighbours
— turned out to be the unfinished half of backlog 5. The cap
(`WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`, `insert-fit.ts:56`) and the catalogue nominal
(`WALL_DEPTH_MM`, `catalog.ts:72`) are **independent constants that happen to agree at 400**, and
`resolveDepthM` caps against `Column.d` (580 over a base run) without ever reading the nominal. The
owner decided on 2026-08-27 that wall depth follows worktop depth through an extensible map, that the
map is the single source for both numbers, that base carcass depth is a formula, and that worktop
depth becomes a whole-kitchen setting.

**Wave 5A ships the map alone** — it is the customer-visible fix, it is live on the owner's device,
and it must land before `setWidth`, because a resize rebuilds through the catalogue equivalent and
would otherwise be written against 400. **Wave 5F** carries the base carcass formula. The wave
letters were reassigned when depth joined; the plan carries the old→new mapping.

**M5 owns the geometry; M6 owns the control (owner, 2026-08-27).** Worktop depth is a **single
declared constant at 600 mm** in M5 — no user-facing control, no schema field, no settings UI, no
version bump. `docs/milestones/M6-price-and-global-settings.md` **work item 4** adds worktop depth as
a fourth control in *Setări globale* beside the material and hardware tiers it already builds;
because M5 did the mechanics, that is one more control in a panel M6 is building anyway. Both plans
name each other so neither can assume the other built it. Every question about a worktop depth that
*changes* travels with the control to M6 — M5 never holds two.

If the milestone needs to be smaller, 5F is the clean cut, but note it moves rather than disappears:
M6's control needs the formula underneath it.

Four things M4 handed M5 directly. **The first and third are closed; the second and fourth are
open.**

1. ~~**Seeded catalogue entries have no `sizesMm`, so no seeded body can be resized.**~~ Closed by
   wave 5B, and the tripwire fired as designed: the seeded test asserting the section renders nothing
   failed the day the widths arrived.
2. **The rejection banner becomes reachable, and M4's unmet criterion becomes writable.** §5.4 has
   real failure modes (§11 row 10: a resize that would push a neighbour under 300 mm). M5 is the
   first phase where a §9 control can legitimately refuse, so ADR 0024 says to revisit it here. Two
   of 2C's three requirements can then be proven in a browser; the third still waits for M6's total.
   **Still open — it is wave 5E's**, and note that 5D put the reason at the point of *choosing*
   (a blocked chip carries the engine's sentence), which is the better place for it than a banner
   after the tap.
3. ~~**Width chips must stay honest about `free` versus `blocked`.**~~ Closed by wave 5D and
   ADR 0034: a chip is `free` if and only if `setWidth` at that width would succeed, answered by
   running the command. The three tests pinning "no chip is ever free" were turned over rather than
   deleted, and the shipped kitchen's own answer is still zero free chips — for a reason about empty
   space, not about a missing command.
4. **§13.3 question 1 is still open and still visible.** `insertBody` is deliberately more permissive
   than `offersFor` on a swap — §9 scopes a swap list to the outgoing body's band while §5.2 lets a
   `column` body into any slot. Not a rule violation, but the two are not interchangeable.

**Open, and not closed by M4:**

- **The mobile gate is verified under emulation, not on a handset.** M4 Wave 4D drives §10's full
  loop and the signature flow through §9's real panel by *synthesised* touch at 390 × 844, in real
  Chromium against a real WebGL canvas and the test database — 20 e2e tests. It does not exercise a
  touch digitiser (finger-sized contact areas, real drag-vs-tap slop), a mobile GPU, device pixel
  ratio, or iOS Safari. Per `docs/best-practices/browser-and-visual-qa.md`, tests alone do not prove
  a mobile claim. **A handset pass needs HTTPS or a tunnel** — over `http://<LAN-IP>` the `Secure`
  write-token cookie is silently dropped, and since M4 that now also renders the panel read-only via
  `canWrite`, which will look like a bug on a handset and is not one.
- **ADR 0023 gives the handset pass something specific to check.** Compatibility mouse events after a
  touch are exactly the kind of behaviour that differs between synthesised touch and a real
  digitiser, iOS Safari especially. The fix (cancelling `touchend` on the canvas) is verified under
  emulation only.
- **The mobile selection-highlight visual assertion no longer exists at 390 × 844.** M2 compared a
  patch of scene unselected versus selected; that patch is now behind the sheet, so the two captures
  would differ *because a sheet appeared* — an assertion that would pass with selection rendering
  entirely broken. It is the suite's one `test.skip`, carrying that reasoning, and the claim moved to
  desktop where both captures are taken with the panel open. Mobile keeps M2's gate proper: a real
  touch selects the intended body and the intended empty slot.
- **Preview's database has not been confirmed to carry migrations 0002 and 0003.** Until it does,
  minting on a Preview deployment 500s exactly as production would have. It cannot be checked
  locally — Preview's `DATABASE_URL` is a sensitive Vercel variable. Check the Neon console, or
  `POST /api/designs` against a Preview URL and look for 201 versus 500.
- **Path 2 of the restore drill has not been re-run** from an export actually downloaded from Blob,
  and **Path 1 (Neon PITR) has never been drilled**. The restore path changed in Wave 3C-2a:
  `write_token_hash` is now exported and restored, without which every restored design would have
  come back permanently unwritable.
- **The firewall is deferred to pre-launch** by ADR 0019 decision 10, with the exact commands in
  `docs/runbooks/firewall-setup.md`. Vercel currently has **zero** custom rules.
- **Application rate limiting, retention, BotID and the emailed edit link are M8**, with the contact
  form.

## Keeping this file honest

Update it when a phase changes state, not in a batch later. Two rules, both learned the hard way in
this project:

- **Copy quantitative claims from a command you ran.** Test counts here were wrong once because they
  were carried forward from a commit message instead of counted.
- **Record what is not met, at the criterion.** M2's status claimed its persistence criteria were met
  for several hours after a gap was found. An unmet gate that is written down is manageable; one that
  is quietly assumed to be met is not.
