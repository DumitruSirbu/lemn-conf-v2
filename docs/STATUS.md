# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn fast where the project stands, without reading eight phase plans.

Last updated: 2026-09-04. **Currently in progress: M6**, on branch `m6-price-and-global-settings`.
**M5 wave 5E — the browser/mobile gate — remains open and unverified**; it does not block M6 and M6
started ahead of it by the owner's decision. Everything else through M5B, M5 waves 5G/5H, and the
adversarial-review remediation is shipped; find any phase's detail in the table below, then follow
its **Read** column.

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
| M2 — Void engine, picking, persistence | **Done** (closed 2026-08-25) | No — `milestones/done/` |
| M3 — Insert, remove, swap, client write path | **Done** (closed 2026-08-26) | No — `milestones/done/` |
| M4 — Editor panel and shell | **Done** (closed 2026-08-26 — one criterion unmet by design, ADR 0024) | No — `milestones/done/` |
| M5 — Width editing, and depth as a derived quantity | **In progress — 5E is the only wave open.** 5A–5D2c, 5F, 5G, 5H all shipped | Yes — `milestones/M5-*.md`, and ADRs 0028–0041, 0052, 0053 |
| M6 — Price bar and global settings (incl. cabinet depth control) | **In progress — 13 of 24 tracked waves DONE.** On branch `m6-price-and-global-settings`: 6A (`6c1f830`), 6H (`4afda06`), 6A3 and 6B2 (`eb9ba03`) shipped 2026-09-03; 6C (`194405b`) and 6D (`a5e161f`) shipped 2026-09-03 but only received their DONE marker this pass — a documentation gap, not new work; 6E (`b558e28`), 6G (`3e546d1`), 6I2 and 6M (merged at `ce77171`) shipped 2026-09-03/04; 6S (`280daa4`, `a2bff48`), 6J (`c8ba3af` 6J-a, `a68482d` 6J-b) and 6P (`38268b5`) shipped 2026-09-04. Open: 6K, 6Q, 6R, 6T. Shipped-but-uncertified: 6A2, 6A4, 6B, 6I, 6L. Not started: 6N. 6F is superseded by ADR 0071's 6P–6R | Yes — `milestones/M6-*.md`, and ADRs 0055–0072 |
| M7 — Step 1, room and presets | Planned | Yes, when starting |
| M8 — Review, contact, success | Planned | Yes, when starting |
| Adversarial review remediation | **Every finding closed or gated.** SEC-001 (High) deferred to M8 by owner decision, gated. Everything else — SCENE-001/002, WEB-001–004, DOM-001–003, SEC-002–004, DB-001/002/004 — is implemented and reviewed | Yes — `milestones/adversarial-review-remediation.md`, `milestones/dom-003-set-width-split.md` |
| M5B — Manual UX remediation (branch `ux-manual-fixes`, merged) | **Done, 2026-09-02** — all eleven waves shipped | No — `milestones/done/M5B-manual-ux-remediation.md`, ADRs 0043–0051 |

## Closed work — pointers only

Each item below is fully recorded at its target. Do not re-derive or re-summarise it here; open the
target if you need the detail.

**Adversarial review remediation** (`milestones/adversarial-review-remediation.md`, branch
`adversarial-review-reports`, merged to `main`). SCENE-001, WEB-001, DOM-001+SEC-002, SEC-003+SEC-004
and DB-001–003 closed by 2026-08-31 (waves S1–S6). **Correction found this pass:** the milestone
file's own status banner still lists WEB-002, WEB-003, WEB-004, SCENE-002, DOM-002, DOM-003 and DB-004
as open — that is stale. Waves S7–S12, recorded later in the same file (plus
`milestones/dom-003-set-width-split.md` for DOM-003), close all seven; confirmed against the tree,
not just the prose — `packages/persistence/src/migration-ledger.ts` and
`packages/persistence/src/migrations/0004_add_design_revision.sql` (DB-004/WEB-003) and the nine-module
`set-width.ts` split (DOM-003) all exist on `main`. The banner should be corrected the next time that
file is touched; until then, treat waves S7–S12 as the live record over the banner. **SEC-001** (the
one remaining High — unbounded mint endpoint) is deferred to M8 by the owner's 2026-08-31 decision and
gated; see *ADR 0019* below. WEB-003's fix (revision-based optimistic concurrency) added migration
`0004_add_design_revision.sql`, whose deploy note is load-bearing: **it must be applied to an
environment before the web code that reads it reaches that environment**, or every load and save 500s
there. ADR 0054 confirms `0004` is applied on `lemn-conf-v2-preview` (2026-09-02); **production
(`lemn-conf-v2`)'s migration state has not been re-confirmed since 0004 shipped** — check
`schema_migrations` there (ADR 0020's rule: read the schema back, never trust the runner's exit code)
before this branch's web code deploys.

**What is actually built** (`milestones/done/`, ADRs 0011, 0015–0024, 0028–0041). A pnpm monorepo on
Node 24: an I/O-free domain package, a Three.js adapter, a persistence package (the only place a
Postgres driver appears), and a Next.js App Router app. M0–M4 are closed; each closed phase's findings
worth knowing live in its own ADR — the hood carcass pattern mismatch (ADR 0016), `base-sink`'s
missing `minWidthMm` floor (ADR 0017), the ACTUAL badge being unreachable for 22 seeded bodies until
declared rather than inferred (ADR 0022), corner returns needing to be declared structural in data
(ADR 0021), and touch-compatibility clicks reaching the sheet (ADR 0023). **One finding has no ADR
home and is recorded here because nowhere else holds it:** M4's Finisaj section was decoration —
`finishKey` was read nowhere in the adapter and `signBody` omitted it, so tapping a swatch marked the
chip and scheduled a save while the scene stayed pixel-identical; fixed within M4, no dedicated
record. The toolchain is enforced, not merely documented: `.npmrc` sets `engine-strict=true` and
`scripts/local-ci.sh` pins the exact `packageManager` pnpm version CI installs — see
`docs/best-practices/ci-and-local-gates.md`.

**M5B — Manual UX remediation** (`milestones/done/M5B-manual-ux-remediation.md`, ADRs 0043–0051). All
eleven waves shipped, closing with 5B4b (the capped merge, ADR 0046 reviving ADR 0037's withdrawn
merge). The wave-by-wave criterion record, gate results and visual evidence all live in that file —
it is longer and more detailed than any summary that belongs here. The one item that file does **not**
own is the Playwright rerun this close-out triggered: the suite had not run since 2026-08-26 and was
found red on two catalogue ids ADR 0033's row merge left stale (`offer-base-2door`, `wall-2door`);
fixed, now 21 passed / 1 skipped. The reporting gap this exposed — `ci:local` never ran Playwright, so
nothing but memory stood between a broken e2e suite and a milestone close — is `docs/BACKLOG.md` entry
24, **closed 2026-09-02**: CI's `e2e` gate and `scripts/local-ci.sh` both now run it.

**M5 wave 5G — 800 mm is the ceiling on any empty column** (ADR 0052, closes Q5). **M5 wave 5H — the
frozen map is recorded whole** (ADR 0053, closes `docs/BACKLOG.md` entry 22). Both ADRs carry full
verification evidence, gate results and a swept table of every record checked before deciding — read
them directly rather than through a summary. Latest verified counts, dated 2026-09-02 in ADR 0053:
domain **1433**, web **786–788** (+4 skipped), persistence **177**; `pnpm ci:local` all nine gates
PASS.

## What is open right now

- **M5 wave 5E — the browser/mobile gate. Still open and still unverified.** The owner confirmed on
  2026-09-02 that their manual testing was **desktop-browser only**, which does not close a handset
  gate: a real touch digitiser, a mobile GPU and device pixel ratio, and iOS Safari all remain
  verified under emulation alone. M6 started ahead of it by the owner's decision — 5E blocks nothing
  in M6 — but it must be run before release. Read ADR 0035 (the stepper replaced the chip row)
  before writing an assertion.
- **~~A pre-release check on the `designs` table~~ — closed by the owner, 2026-09-03: there is no
  real user data.** The app is in development and no stored row belongs to a customer, so the
  migration window this entry described does not need counting and no row is worth rescuing. Kept as
  a struck entry rather than deleted, because the *mechanism* is still true and will matter the first
  time real rows exist: wave 6A3 deleted `correctPreCorrectionRoom`'s first guard, so from `eb9ba03`
  a row at `schema_version <= 2` carrying `{3600, 2400}` is corrected to `{3560, 2830}` on load —
  **going forward only**, because every save stamps `CURRENT_SCHEMA_VERSION = 3` and a row that
  leaves the set leaves permanently uncorrected. If this project ever migrates a room again, that is
  the shape of the problem.
- **The owner question ADR 0069 hands on — should the product _offer_ an insertion opening that
  lies past the end of a wall — is closed, 2026-09-04.** Distinct from marking a body the customer
  already placed, which is ruled (ADR 0065, ADR 0069). It covers both a remnant the product itself
  creates and a fabricated empty-column entry — one decision governs both. Wave 6M shipped 2026-09-03/04
  without touching it (confirmed at its close-out); the owner then confirmed **never**, on the same
  reasoning wave 6A3 already established for demo/proposed designs. **The behaviour turns out to have
  already shipped**: `packages/configurator-domain/src/clip-empty-columns-at-wall-end.ts`, wired into
  `deriveColumns` in `void-engine.ts`, clips every member-less column to its wall's own length before
  any command or load can offer it as an insertable opening. Neither wave 6M's section nor ADR 0069
  connected the shipped clip to the reserved question until this ruling; see
  [ADR 0069's amendment](decisions/0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md#amendment--2026-09-04-the-reserved-question-is-closed-and-it-was-already-answered-in-code)
  and wave 6M's close-out for the full record.
- **A gate is owed on the rejection banner's newly-found route, and nobody has written it.** Wave 6C's
  visual verification disproved [ADR 0024](decisions/0024-the-rejection-banner-has-no-reachable-path.md)'s
  "no refusal is reachable by construction": **a double-tap on `Șterge corpul` reaches the banner** —
  the first click deletes, the second lands on the now-void selection and refuses, both before React
  re-renders. It was captured on both shells with a controlled single-versus-double comparison (the
  total held at `91 000 MDL` while the label read `De la neschimbat`), and the ADR is amended. **But
  there is no automated gate on it**, and 6C's implementer could not reproduce it through Playwright:
  neither `dblclick()` nor `mouse.click(..., { clickCount: 2, delay: 0 })` reaches the banner — both
  yield `panel-rejection` count 0. **That negative result is worth keeping**: whatever reaches the
  refusal is not a synthetic click pair, which points at real timing or a touch gesture. Ten minutes
  once someone names the exact gesture. It belongs with **wave 5E**, which owns the handset pass.

- **One mutation is owed on 6B2's coverage, and it is a verification task rather than a defect.** The
  comparator-key swap in `packages/configurator-domain/src/queries/design-projection.ts` was never
  run, because that file carried concurrent uncommitted edits during 6B2's QA; a literal pin of the
  seeded kitchen's 26-placement line order stands in its place. The tree has since settled, so the
  mutation can now be run.
- **Five engineering items deferred out of M6 waves 6A3 and 6B2**, each named with the wave it was
  deferred out of. **None has a future wave assigned**, and each claim below was read off the tree at
  `eb9ba03`:
  - **`describeDeclared` is duplicated inside one package — the DRY threshold is passed.** *Out of
    6B2.* **Four** byte-identical copies: `pricing/price-book.ts:389`, `cabinet-depth-rule.ts:76`,
    `cabinet-handles.ts:128`, `occupied-depth.ts:91`, each
    `declared === undefined ? "nothing" : JSON.stringify(declared)`. They serve four different
    refusal messages, which is why they were written separately and why nothing failed.
  - **`priceOnePlacement` is long.** *Out of 6B2.* `pricing/price-design.ts:295-351` — **57 lines**
    against the ≤20-line convention. A chain of guarded refusals, so it splits cleanly; nothing about
    it is wrong, only long.
  - **`findExtentRoomIssues` and `findUncontainedEmptyColumns` are structurally identical.** *Out of
    6A3.* `validate-design.ts:341` and `:470` — the same four edges through the same
    `findContainmentBreaches` and `reachesPastRoomAcrossWall`, differing only in the code prefix and
    the path. **The cost is specific: a fifth edge gets added to one and not the other**, which is the
    forgotten-member failure ADR 0069 was written about, one seam over.
  - **Two validity questions whose names do not say which validity each asks.** *Out of 6A3.*
    `assertDesignValidForCatalog` / `validateDesignForCatalog` ask **complete** validity;
    `fatalDesignValidationIssues`, and `migrate-design.ts:156`'s `hasFatalIssues` over it, ask
    **fatal-only**. Since ADR 0069 the two answers genuinely differ and the names do not carry the
    distinction. **The rename was deferred as the one item here that can move the tree**, so it wants
    its own wave rather than a ride. ADR 0069's code blocks name an `isValidForCatalog` guard: that is
    the ADR's shorthand for `migrate-design.ts`'s **deleted** guard 1 and was never a symbol in the
    tree, so finding nothing by that name does not make this entry stale.
  - **A span's `kind` misdescribes what it holds.** *Out of 6A3, and it predates that diff.*
    `findExtentRoomIssues` builds its span with `toEmptyColumnSpan(extent, index)`
    (`validate-design.ts:348`) rather than `toColumnExtentSpan`, so a column extent is carried in a
    span labelled as an empty column. Harmless today because only `wall`, `along` and `top` are read
    off it — which is exactly the kind of "true by luck" the next reader of `kind` breaks.
- **SEC-001, deferred to M8 and gated.** `POST /api/designs` has no application rate limiter and no
  active retention. `milestones/M8-review-contact-success.md`'s *Launch gate* must be checked off
  before the endpoint sees real traffic. ADR 0019's 2026-08-31 correction records the decision.
- **Production's migration state for `0004_add_design_revision.sql` is unconfirmed** — see the note
  above under *Adversarial review remediation*. Check before deploying web code that expects the
  `revision` column.
- **Three Low residuals on WEB-001's fix**, found by the 2026-08-31 verification pass and recorded
  here because `docs/BACKLOG.md`'s own preamble sends engineering deferrals from a review round to
  this file, not there:
  - The store takes its design id from the **server response** rather than the captured save job, so
    a route answering with a different id would move the store to it.
  - Generation churn resets an identity's outage backoff, so repeated A → B → A navigation during a
    total server outage issues requests with no backoff at all.
  - The refusal maps are never pruned, so a design refused once stays refused for the tab's lifetime.
- **M2's restore drill, unchanged.** Path 2 (an export actually downloaded from Blob and restored) has
  not been re-run since the drill last ran; Path 1 (Neon PITR) has never been drilled.
- **Preview is not covered by any migration process.** ADR 0054's 2026-09-02 amendment: production is
  migrated deliberately (ADR 0020, ADR 0042), preview is migrated only when someone notices it is
  stale, as happened this session. The next migration recreates the same breakage on preview deploys
  and local dev alike unless a migration step is added to that process first.
- **The firewall is deferred to pre-launch**, ADR 0019 decision 10. Vercel currently has **zero**
  custom rules; the exact commands are in `docs/runbooks/firewall-setup.md`.
- **Application rate limiting, retention, BotID/honeypot and the emailed edit link are M8**, with the
  contact form — see the phase table in ADR 0019 below.
- **Two things M4 handed M5 that are still open** (`milestones/M5-width.md`): the rejection banner's
  third requirement — "the total does not move" — waits for M6's total; and §13.3 question 1 (whether
  `insertBody`'s permissiveness versus `offersFor`'s swap-band scoping is a problem) is open and
  visible, not a rule violation.
- **Eight depth questions, recorded in `milestones/M5-width.md`** under *Not established — Depth*.
  Two gated M5 waves (carcass-vs-door, 5A; 600-vs-620, 5F) — both closed. Four travel to M6 with the
  worktop-depth control and are repeated in that plan so they are not lost at the seam; read them
  there, not here.
- **ADR 0038 expires at first release** and this is the line that must survive until then — M7 or M8
  must re-read it before launch and decide the first stored schema. Its "nothing has ever been
  stored" premise is already corrected twice by measurement (ADR 0052: 5 rows exist, `schema_version`
  1) — the record to trust is the ADR's own dated corrections, not the original premise.
- **Infrastructure state, live as of 2026-09-02.** CI green on ten gates including `e2e` (added
  2026-09-02); `.githooks/pre-push` runs the same set locally. Confirmed green on a runner, run
  `33627120272`. Vercel deploys `main` to production automatically. The backup cron
  `/api/cron/backup-designs` is registered and has produced its first export. Local development now
  has a working database — see ADR 0054 for the target (`lemn-conf-v2-preview`) and why.

## The security decision — ADR 0019

The full decision is in `docs/decisions/0019-security-baseline-writes-throttling-retention.md`; do not
restate its content here. It supersedes ADR 0014 on the owner's 2026-08-25 direction that security is
the priority.

Implementation is deliberately staged across phases, per decision 10:

| Part | Phase | Status |
| --- | --- | --- |
| Write-token cookie / read–write split (decision 1) | M3 Wave 3C | **Done** |
| Save-coalescer minimum interval (decision 6) | M3 Wave 3C | **Done** — `MIN_SAVE_INTERVAL_MS = 1000` in `apps/web/src/persistence/save-coalescer.ts`, confirmed in the current tree. STATUS previously carried this as an open defect; that was stale |
| Application rate limiting, retention cron, emailed edit link, BotID/honeypot | M8 | Open, with the contact form |
| WAF rules | Pre-launch, after M7 | Open — zero custom rules today |

One plan constraint worth keeping here rather than only in the ADR: **this Vercel plan permits exactly
one WAF `rate_limit` rule.** A second returns a misleading 401; the edge cannot express per-endpoint
policy, so every per-endpoint limit is application code.

## What to do next

**Next: M6, on branch `m6-price-and-global-settings`.** Read
`milestones/M6-price-and-global-settings.md`, now a 24-wave breakdown (6P–6T added 2026-09-04 on
ADRs 0070 and 0071, superseding 6F), and ADRs 0055–0072 for the decisions behind it. All seven
original owner decisions are closed. **Thirteen waves are DONE**: 6A, 6H, 6A3, 6B2 (2026-09-03); 6C, 6D
(shipped 2026-09-03, DONE marker added this pass — a pre-existing documentation gap, not new work);
6E, 6G, 6I2, 6M (2026-09-03/04, merged at `ce77171`); 6S (`280daa4`, `a2bff48`), 6J (`c8ba3af`,
`a68482d`) and 6P (`38268b5`), all 2026-09-04. **6K, 6Q, 6R and 6T remain open.** Five have shipped
commits but no recorded criteria check — **6A2, 6A4, 6B, 6I, 6L**, bundled inside
`93e9bc3`/`75668b8`/`dfa6198` — do not read these as either closed or blocked without checking their
own section. **6N has not started.**

**Two review debts were incurred on 2026-09-04 and are owed rather than skipped.** 6P never received
a logic review — the reviewer was lost to a spend limit mid-run; its adversarial QA did run in full
and both findings were fixed and mutation-verified. **6J-b has had no adversarial pass at all.** Both
shipped on the coordinator's own gate run rather than on a completed review pair.

**Measured on the merged tree at `38268b5`, by the coordinating session running the gates itself:**
format, lint, typecheck and boundary all 0; domain **2440**, three-adapter **2077**, web **1329
passed + 4 skipped**, persistence **177/177**, **e2e 57 passed**. Persistence and e2e are the two
gates neither parallel worktree could run — `.env.*.local` exists only in the main checkout, so the
worktree's persistence "green" was 86 skipped tests. Both are genuinely run at this commit. Parallel
worktrees were torn down at the owner's instruction on 2026-09-04; development continues on one
sequential line.

**Superseded by the paragraph above; kept for the dated record. Measured at `ce77171`** — the coordinating session ran the gates itself rather than accepting an agent's report,
which `WORKFLOW.md`'s closing step requires: nine of ten `pnpm ci:local` gates green (format, lint, typecheck, test,
e2e, build, boundary, lockfile). Domain 102 files / 2044 tests, persistence 15/177, three-adapter
48/1767, web 84 files / 1280 passed + 4 skipped, **e2e 57 passed**. `sca` failed the whole session on
`ERR_SOCKET_TIMEOUT` reaching `registry.npmjs.org` — environmental, not caused by any diff in this
branch.

**Owner questions this pass surfaced — see the milestone file's own wave sections for the detail
rather than restating it here.** The price delta's **anchor was answered 2026-09-04**, accepted
pending the owner seeing the result on screen (wave 6G close-out); its **rounding direction is also
ruled 2026-09-04** — rounding stays up everywhere, the objection about "de la" promising "possibly
more" is overridden rather than dissolved (a *De la* figure must never quote under the true price),
and the amplification a delta gives that rounding is now an accepted cost, not an open defect (same
close-out). **A stored material/hardware tier the price book no longer offers is no longer open** —
ruled 2026-09-04 and deferred with a home, [ADR 0072](decisions/0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md):
versioning and stale-price handling belong to the manufacturer dashboard, M6 adds no field, version
or migration for it, and today's book edits migrate any affected stored design in the same commit.
**Five more owner rulings, 2026-09-04, close the rest of M6's *Added 2026-09-04 with waves 6P–6T*
open-input list**: each material's default finish (Alb/white/Stejar), the book's default material
tier (PAL for both the priced baseline and the delta basis), handle pricing (never — hardware prices
mechanisms only), a legacy `clay`/`sage` document's material (stays PAL, colour lost, against the
recommendation), Egger decor codes (never shown to the customer), a second sink base (two sinks, two
racks, never de-duplicated), and the four unruled strings (ship as drafted placeholders; all
customer-facing copy becomes dashboard-editable later, alongside ADR 0062's price-book seam — not M6
scope). **The scene warning hidden behind §9's sheet while it is open is also ruled — accept as
built, no change**, with the accepted trade recorded (the `role="status"` region still announces an
overflow to a screen reader while invisible behind the sheet). **The two remaining architect-recorded
questions are also ruled, 2026-09-04 — both accept as built.** The scene warning and the flagged
total sitting far apart on screen (55.5 px mobile / ~780 px desktop, wave 6M close-out) stand: the
owner saw the rendered screenshot and accepted it, on the reasoning that the two strings answer
different questions (ADR 0065 decision 7b) and are not the same-string-twice case the product
otherwise hides. And ADR 0069's own reserved question — should the product *offer* an insertion
opening that lies wholly past the end of a wall — is closed **never**, detailed above; it turned out
to already be shipped as `clip-empty-columns-at-wall-end.ts`, unconnected to the question until this
ruling. **`docs/milestones/M6-price-and-global-settings.md`'s *Open questions gating this phase* now
holds only two non-blocking content slots** (sample/commercial price amounts; what the estimate
includes) — no open decision remains. **A correction to ADR 0060 decision 4's wording is appended to
that ADR directly**, not restated here.

6L runs before both 6B and 6G; 6I2 lands before 6J. Do not start a wave without reading its section —
several carry criteria inherited from another wave, including two now owed by 6J: the command-path
assertion at 700 mm (6I2's close-out, in the milestone file) and the wall-map-versus-base-formula
catalogue fact (6A3's own punch list, item 3, in the milestone file — not separately listed here).

**M5 wave 5E is still owed** and is described above under *What is open right now*. It is not next
only because M6 does not depend on it. Before writing an assertion for it, read **ADR 0035** (stepper
mechanics), ADR 0032 (disabled-with-reason), ADR 0034 (the chip-row-to-column seam 5D2a/5D2b kept),
then `milestones/M5-width.md`'s own *What 5D2c built* section if more detail is needed. ADR 0024's
reachable rejection banner is also 5E's.

What 5E must verify, briefly: a real touch digitiser (not synthesised), a mobile GPU and device pixel
ratio, iOS Safari, and ADR 0023's compatibility-mouse-event fix under a real digitiser — all currently
verified under emulation only. A handset pass needs HTTPS or a tunnel: over plain HTTP the `Secure`
write-token cookie is silently dropped, which renders the panel read-only via `canWrite` and looks
like a bug but is not one. The mobile selection-highlight visual assertion no longer exists at
390×844 (superseded by the sheet covering that patch of scene) — it is the suite's one `test.skip`,
and mobile keeps M2's gate proper: a real touch selects the intended body and slot.

Everything M5 needed from M4 that is closed: `sizesMm` (wave 5B gave seeded entries their sets); width
chips staying honest about `free`/`blocked` (ADR 0034, `setWidth` is the sole authority). What is
still open is listed under *What is open right now* above.

**M6 owns the control; M5 owns the geometry (owner, 2026-08-27).** Worktop depth is a single declared
600 mm constant in M5 — no UI, no schema field. `milestones/M6-price-and-global-settings.md` work item
4 adds the control. Every question about a worktop depth that *changes* travels with the control to
M6.

## Keeping this file honest

Update it when a phase changes state, not in a batch later. Two rules, both learned the hard way in
this project:

- **Copy quantitative claims from a command you ran, or from a dated record that ran one.** Test
  counts here were wrong once because they were carried forward from a commit message instead of
  counted.
- **Record what is not met, at the criterion.** M2's status claimed its persistence criteria were met
  for several hours after a gap was found. An unmet gate that is written down is manageable; one that
  is quietly assumed to be met is not. The same discipline applies to this file's own claims about
  other documents: this pass found a stale "still open" list inside
  `milestones/adversarial-review-remediation.md`'s own status banner, and a stale "not yet fixed"
  claim about the save coalescer in this file — both are corrected above, at the record, not silently.
