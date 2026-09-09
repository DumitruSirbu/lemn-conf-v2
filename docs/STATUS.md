# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn fast where the project stands, without reading eight phase plans.

Last updated: 2026-09-07. **Currently in progress: M6**, ~~now on branch
`wave/6r-control-shapes-and-strip-row`~~ ~~**now on branch `wave/6t-finish`**~~ **back on `main` at
`bdef351` — every M6 wave branch is merged**. ~~**Five M6 waves
remain: 6T, 6T2, 6W, 6V, 6X**~~ ~~**Corrected later the same day: six remain — 6T, 6T-a, 6T2, 6W, 6V,
6X.**~~ ~~**Corrected 2026-09-07: three remain — 6T2, 6V, 6X.**~~ **Corrected again 2026-09-07, at the
end of the day: none remain. All seven of the last M6 waves are merged to `main`** — 6T, 6T-a and 6W
at `857a29e`; **6T2** at `825ba43`; **6X and 6X-a** at `9f5a4f6`; **6V** at `c7c9743`; with two fixes
after, `88f06ba` (6V's two false criterion sentences) and `bdef351` (6X-a's unmeetable criterion).
**No open wave is not the same as a closed milestone**: what M6 still owes before it can be called
closed is listed in the M6 row below and under *What to do next*. **The next phase is M6B —
Internationalization**, and its **Gate O1 is in progress**: the owner is reviewing
`apps/web/src/messages/ro.json` now.
[ADR 0092](decisions/0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md)
**Amendment C** opened a new wave **6T-a — one push-to-open predicate** on the owner's ruling that
push-to-open is a manufacturer cost and must be priced. ~~see *What to do next*, which also records
what a partially-implemented 6T is sitting in an unmerged worktree.~~ ~~**6T is now implemented,
adversarially QA'd and reviewed on `wave/6t-finish` — and still not merged to `main`**~~ ~~**Superseded
2026-09-07: 6T, 6T-a and 6W are all three implemented, adversarially QA'd and reviewed on
`wave/6t-finish`, which is green on all ten `ci:local` gates at `ca35b96` and is **ready to merge,
not merged** — the three reach `main` together per ADR 0092 decision 12**~~ **Superseded again the
same day: the three merged to `main` at `857a29e`, as one merge, exactly as decision 12 required**;
see *What to do next*.
**M5 wave 5E — the browser/mobile gate — remains open and unverified**; it does not block M6 and M6
started ahead of it by the owner's decision. **A new phase, M6B — internationalization — runs
immediately after M6 and before M7** (owner ruling, 2026-09-06); it is in the table below. Everything
else through M5B, M5 waves 5G/5H, and the adversarial-review remediation is shipped; find any phase's
detail in the table below, then follow its **Read** column.

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
| M6 — Price bar and global settings (incl. cabinet depth control) | **In progress —** ~~13 of 25 tracked waves DONE~~ ~~corrected 2026-09-05: 13 of 36 wave-table rows are DONE, counted directly~~ ~~corrected again 2026-09-05: 23 of 38 wave-table rows are DONE, counted directly~~ ~~corrected again 2026-09-06: 24 of 38, wave 6U closed~~ **corrected again 2026-09-06: 27 of 38, waves 6J-c, 6J-d and 6N-0 closed** — two rows added for 6K-g and 6K-h (real waves with full plans and shipped commits that had never had a table row) and ten more rows reconciled against `git log`: 6K, 6K-c, 6K-d, 6K-e, 6K-f, 6K-g, 6K-h, 6K-j, 6Q and 6Q-c, all closing 2026-09-05 (see *What to do next* below for the full recount and its arithmetic). On branch `m6-price-and-global-settings`: 6A (`6c1f830`), 6H (`4afda06`), 6A3 and 6B2 (`eb9ba03`) shipped 2026-09-03; 6C (`194405b`) and 6D (`a5e161f`) shipped 2026-09-03 but only received their DONE marker this pass — a documentation gap, not new work; 6E (`b558e28`), 6G (`3e546d1`), 6I2 and 6M (merged at `ce77171`) shipped 2026-09-03/04; 6S (`280daa4`, `a2bff48`), 6J (`c8ba3af` 6J-a, `a68482d` 6J-b) and 6P (`38268b5`) shipped 2026-09-04. **6K's whole family closed 2026-09-05**: 6K-a and 6K-b (`30c3bcb`/`4dc08e0`/`30d419b`/`e664e33`, 2026-09-04), 6K-c (`56b6815`), 6K-d and 6K-e (one commit, `d4e58a4`), 6K-f (`827e1e1`), 6K-h (`e90ccc8`), 6K-g (`52e3c70`), 6K-j (`151429f`) — which also closes 6Q, via 6Q-a (`9e9d54e`), 6Q-b (`59f8669`) and 6Q-c (`14cef90`). **6U closed 2026-09-06, `38d5cad`** — ADR 0087's hob-seat fix (the front clearance is now derived, not a literal); ADR 0087 carries a 2026-09-06 amendment recording the hob's own 510 mm geometric floor, found by 6U's QA and unreachable today because `requireDeclaredCabinetDepthMm` refuses below 520. **6J-c, 6J-d and 6N-0 closed 2026-09-06** — `2bdd923` (6J-c), `cf53e8e` (6J-d + 6N-0), `b4d93c7` (6J-d's D1 fix), merged to `main` at `e7eba07`; see *What to do next* below for what these waves cost. ~~Open: 6K-i (ADR 0079's finding, unadjudicated), 6N-a, 6R, 6T.~~ **Corrected 2026-09-06: 6K-i, 6N-a, 6R and the new 6R-b are all DONE — see the recount at the end of this cell. Open: 6T, 6T2, 6W, 6V, 6X.** **Certified 2026-09-05** (`59f8669`): 6A4, 6B (CERTIFIED); 6A2, 6L, 6I
(CERTIFIED WITH FINDINGS) — see *Where the project stands*'s certification note below. 6F is superseded by ADR 0071's 6P–6R; 6N-b and 6N-c are dropped, 2026-09-05, owner ruling. **Corrected again 2026-09-06: 31 of 44 wave-table rows are DONE, counted directly — and the denominator moved as well as the numerator.** The table is **44 rows**, not the 38 counted 2026-09-05: six were added since by ADRs 0090–0094 (6J-d, 6R-b, 6T2, 6W, 6V, 6X), each citing its own record in the row. The four closing this pass, all on branch `wave/6r-control-shapes-and-strip-row`: **6R and 6R-b** (`aa6ad9e`, one commit — three control shapes, six decors, the adapter's total finish table, and ADR 0094's own full-width settings row on desktop), **6K-i** (`deb237f`) and **6N-a** (`7ad15e1`), the last two implemented in agent worktrees a day earlier and merged here, with four review findings closed at `1116ae9` (all test-strength, no production change). Arithmetic, so it can be checked rather than trusted: 31 DONE + 5 CERTIFIED (6A2, 6A4, 6B, 6I, 6L) + 3 not-shipping (6F superseded, 6N-b and 6N-c dropped) + 5 open (6T, 6T2, 6W, 6V, 6X) = 44. **Two of those rows were materially wrong in this file until this pass** — 6K-i was called *"genuinely unstarted — no commit, no plan section"* when it had both, and 6N-a was listed as simply open when it was finished; see *What to do next* for the cause. **Corrected again 2026-09-06, later the same day: the wave table is 45 rows, not 44, and six waves are open, not five.** ADR 0092 **Amendment C** opened **6T-a — one push-to-open predicate** (tier Full, gated on 6T), counted directly in the milestone file's table at rows 6T-a and its neighbours. The parts of the arithmetic are otherwise unmoved: 31 DONE + 5 CERTIFIED (6A2, 6A4, 6B, 6I, 6L) + 3 not-shipping (6F superseded, 6N-b and 6N-c dropped) + **6** open (6T, **6T-a**, 6T2, 6W, 6V, 6X) = **45**. ~~**6T itself is neither DONE nor open**: it is implemented, adversarially QA'd and reviewed on branch `wave/6t-finish`, and that branch has not reached `main` — recorded as **implemented-and-unmerged**, which is the state this file's own *Keeping this file honest* rule requires for a commit that exists outside `main`~~ **Corrected 2026-09-07: 34 of 45 rows are DONE, and the denominator did not move.** The three closing this pass are **6T** (`0d0ee61`, QA `88f85e2`, `e9ab7b2`), **6T-a** (`0a9ce1a`, QA `fb127b8`) and **6W** (`1d6fc7e`, QA `ca35b96`), all on branch **`wave/6t-finish`**, gated together at `ca35b96` and **ready to merge rather than merged** — the three reach `main` as one merge per ADR 0092 decision 12, so until that merge they remain **implemented-and-unmerged** under this file's own rule. Arithmetic, so it can be checked rather than trusted: 34 DONE + 5 CERTIFIED (6A2, 6A4, 6B, 6I, 6L) + 3 not-shipping (6F superseded, 6N-b and 6N-c dropped) + **3** open (**6T2, 6V, 6X**) = 45. Their close-outs — what shipped, the verification actually performed, the two owner inputs they promoted and 6W's unmet criterion 4 — are in `milestones/M6-price-and-global-settings.md`'s own sections for the three waves; read them there. **Corrected again 2026-09-07, at the end of the day: 38 of 46 rows are DONE, no row is open, and the denominator moved by one — ADR 0093 Amendment A §6 added the 6X-a row after the 45 was counted.** The four closing this pass, each merged to `main` in its own merge: **6T2** (`825ba43`), **6X and 6X-a** (`9f5a4f6`), **6V** (`c7c9743`); and 6T, 6T-a and 6W stopped being implemented-and-unmerged at `857a29e`. Arithmetic, so it can be checked rather than trusted: 38 DONE + 5 CERTIFIED (6A2, 6A4, 6B, 6I, 6L) + 3 not-shipping (6F superseded, 6N-b and 6N-c dropped) + **0** open = 46. **M6 is not therefore closed, and the difference is the point of this row:** three things are outstanding — **6V's CI runner artefact** (its last criterion asks for runner evidence and every figure on record is a local run), **six open owner inputs** (below, under *What to do next*), and **6W's criterion 4**, met in code under an architect's interim and not with the owner's words. Each wave's close-out in `milestones/M6-price-and-global-settings.md` carries what shipped and the verification actually performed; read them there rather than through this cell | Yes — `milestones/M6-*.md`, and ADRs 0055–0094 |
| M6B — Internationalization (Romanian is the source, other locales are translations) | ~~**Planned — runs immediately after M6 and before M7**~~ **Next, and started at its first owner stop: Gate O1 is in progress 2026-09-07 — the owner is reviewing `apps/web/src/messages/ro.json`.** The gate is a hard stop by design: nothing translates until the owner's corrected Romanian exists, so O1 running is the phase running. (owner ruling, 2026-09-06). ~~No milestone document yet~~ **Planned 2026-09-06: [`milestones/M6B-internationalization.md`](milestones/M6B-internationalization.md), ten waves (6B-a … 6B-j) plus **two hard owner stops — Gate O1 (the owner corrects the collected Romanian) and Gate O2 (the owner checks the Russian)** — which pin the copy path to an ordered chain: extract, owner corrects, agent translates **from the corrected Romanian**, owner checks. Agent-led translation is owner-authorised (*"you can lead the translation"* — they read Russian and review it themselves), so there is no translator dependency and no empty Russian slot; M8's launch gate keeps a backstop re-sign, but **O2 is the real review**. With [ADR 0095](decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md) carrying its rulings.** **Two owner rulings, 2026-09-06, widened it after the first plan and are both in it:** *"need to add in code also the internalization, meaning implementing i18n"* — so routing, negotiation, `Intl` formatting and a complete `ru.json` are in, and **ADR 0001 decision 5 closes with M6B rather than staying owed**, leaving only the owner's sign-off on the drafted Russian wording as a review line on M8's launch gate; and *"every hardcoded string even in tests should be replaced"* — so no test carries a Romanian literal, and wave 6D's pinning rule moves into **one whole-file copy lock** that must be an inline literal table and **never `toMatchSnapshot`**, because `vitest -u` would let the one guard on approved copy rubber-stamp its own replacement. **Two further owner rulings, same day:** *"one is plural, it's needed to be used instead of '0 de corpuri' => '0 corpuri'"* — **CLDR wins on the zero-count plural**, and the fix is three parts, since `apps/web/src/content/ro.ts:4-7` and `:15-19` assert the wrong rule as settled fact (*"is the truth about an empty kitchen"*) and are what would restore it; and *"next milestones will require to implement all the strings … in the same way"* — so M6B extends **`docs/best-practices/engineering-conventions.md`** with the rule M7 and M8 author against, landing with the lint gate rather than buried in a plan that goes stale at phase close. The scope it is drawn from is `docs/BACKLOG.md` entry 53, *"Russian is a supported locale — decided on day one, no milestone owns it"*. The driver is [ADR 0001](decisions/0001-initial-product-and-stack.md) decision 5 — *"Launch with Romanian as the default locale and Russian as a supported locale"* — **Accepted 2026-08-20, never superseded, and owned by no milestone until this row**. Named M6B on M5B's precedent for a phase inserted between two numbered ones. ~~**It cannot start until M6 closes**: wave 6B-g reformats every money string and 6B-f moves catalogue labels out of the domain, both reading surfaces M6's open 6T is still writing.~~ **Refined 2026-09-07: that constraint binds the *code* waves and not the owner gate, and its stated cause is discharged — 6T, 6T-a, 6T2 and 6W are all on `main`, so the money and catalogue-label surfaces have stopped moving. Gate O1 is running now; 6B-g and 6B-f still wait on M6 being called closed.** **Two things the planning pass found that entry 53 did not have**: the phase is *not* confined to `apps/web/src/content/ro.ts` — `packages/configurator-domain/src` renders customer-facing Romanian too (`commands/rejection.ts`, **34 refusal codes** and ~40 sentences, eagerly rendered into every command result at `commands/command-result.ts:198`; `catalog.ts`'s 17-entry `KIND_LABELS_RO` and its `ușă`/`uși` door count; `bands.ts`; `queries/describe-selection.ts`) — and of the test assertions at stake, **81 are `expect(x).toBe(ro.some.key)` tautologies that protect no copy at all**, against 39 real Romanian literal pins in 32 files. **One live divergence is on record and needs an owner copy call**: an empty kitchen reads *"0 de corpuri"* today, while CLDR's `ro` plural rule selects `few` at zero and would read *"0 corpuri"* — the plan's open question 1, which blocks no wave | Yes, when starting — `milestones/M6B-internationalization.md`, then ADR 0095 and ADR 0001 |
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

- **M6's remaining work is verification and two owner rulings — as of 2026-09-08 (evening).** Every
  wave row but 6Y is DONE and the branch `fix/m6-remediation` is green: domain **3653**,
  three-adapter **2970**, web **1997 and no skips**, persistence **282**, typecheck / lint /
  `format:check` clean, at `eeedf85`. What is owed before M6 can be called closed:
  - **~~No browser has seen any of 2026-09-08's work.~~ DRIVEN 2026-09-09**, evidence in
    `testing-reports/vis6z-2026-09-09/` (20 captures, gitignored). Both waves render correctly.
    ADR 0099: the cabinets repaint on a global colour, a per-cabinet override changes only that
    cabinet and survives a second global change, and *Culoarea bucătăriei* clears the override —
    price unchanged at `101 000 MDL` throughout. ADR 0103, by pixel diff over the top-row band at
    both settings: delete re-plans nothing (0 px), a regular base beneath makes the top recede
    (493 px at 600, 784 px at 700), a full-height body deepens it, and the round trip is exact
    (0 px). The worst-case 400-over-700 discontinuity was inspected close up — worktop continuous
    into the corner, plinth on the floor, no tear, no intersection, no floating body. **Zero console
    errors**; the only warning is the known `THREE.Clock` deprecation. `pnpm --filter web build`
    passes on current HEAD.

    Two process notes. **The tree was not frozen** — this session landed `eeedf85` and a `dist`
    rebuild mid-run, against its own standing rule; the agent detected the 8-commit drift, re-ran the
    whole 6Z check against the current build and reports byte-identical results, which is what makes
    the evidence usable. And **a screenshot written anywhere Turbopack watches resets the running
    design**: it produced a false "the kitchen reverted to white", caught by the agent from
    `[Fast Refresh] rebuilding` / `Context Lost` in the console rather than filed as a defect. The
    MCP screenshot tool can only write inside the repo, so every future visual run needs a path
    outside the watched root and a per-step readout guard.

    **Still owed here**: a CI runner pass. Local rendering says nothing about runner timing.
  - **The former browser obligation, verbatim:** Wave 6Z's own tier calls for visual
    verification and it was not run; the scene-colour wave's on-screen claim is proved through the
    real record builder in tests but never rendered. The owner has said they will do the manual pass
    themselves after a production deploy, so this is a **CI Playwright** obligation, not a manual one.
    A green local 3D e2e run proves nothing about runner timing.
  - **~~Independent QA on wave 6Z~~ RAN 2026-09-08 and found a real defect, now fixed
    (`b699cfa`, `86770ac`, `eeedf85`).** `affectedColumnKeys` read ADR 0103 decision 3's set as the
    occupied key, the keys the split created, and the keys whose `hasFullHeightUnder` **flipped** —
    so an **ordinary** body inserted into a slot that overhangs a neighbouring column was missed by
    all three, and the overhung top kept a lifted depth nothing under it justified. That is the
    owner's **S1**, and it is exactly why decision 3 rejects the flip-triggered design; the rejection
    had been applied to the column-membership route and not to the overlap route. Fixed with a third
    clause over `overlapsAlongWall`, exported from `void-engine.ts` rather than copied.

    **The same-wall guard on that clause is load-bearing, and its absence was caught by the wave's
    own offer sweep.** Both walls originate at the same corner, so without `placed.wall ===
    column.wall` the clause compared two coordinates that mean different places and re-planned a body
    across the room: the sweep read **79 re-plans where 24 were pinned**. With the guard it is 786/24
    again. **The pin being exact rather than a floor is what caught it.**

    **Why the count is unchanged is not "the clause never fires here"** — QA corrected that reading
    and pinned the correction. Wall A's column extents overlap each other (`A|0.45` spans 0..900
    across `A|0.30` at 0..600 and `A|0.75` at 600..900), so an ordinary insert on that wall reaches
    two neighbouring keys one tap from load. The clause fires; the bodies it reaches already stand at
    the depth their column decides, so `replanOne` passes them through by identity. It changes
    *which* members are asked, never the answer — and the pin exists so a later wave cannot read the
    unchanged count as a dead clause and delete it.

    QA's 19 other store cases held: the §5.3 swap reaches the re-plan at both settings, three
    insert/delete rounds accumulate nothing and replay byte-identically, an insert that re-plans
    nothing adds exactly one object, a re-planned top still follows `setCabinetDepth` both ways, the
    `finish` key stays absent under a whole-kitchen colour, and the frozen map is identical across
    the swap.
  - **Independent QA on the scene-colour wave** — still owed. Both were gated
    by their own authors' tests, which is not the same thing. The one independent round that did run
    this day found an insert building a 600 mm sink base through a wall, against a ruling the owner
    had given in one word, while its author's commit message claimed the opposite.
  - **The clean-code and logic review pair** on the 2026-09-08 waves. The pair covering the evening's
    audit-remediation commits (`b1185dd..d426c5d`) was dispatched 2026-09-08; the pair covering wave
    6Z and the scene-colour wave has not been.
  - **Two owner rulings, and they are the only things here that are not work.** **M6-AUD-013**: the
    desktop price surface is pointer-modal and keyboard-nonmodal, and the three coherent resolutions
    are materially different products — remove the desktop scrim, make desktop genuinely modal, or
    keep the dim and let the page stay reachable. **M6-AUD-014**: a zero-placement design prices
    successfully and reads *De la 0 MDL*; the audit is explicit that the sentence must not be
    invented in code, and that this gates M7 rather than M6. Neither blocks a deploy.
  - **The severity for backlog 50 and 51, which is one ruling and not two.** Both are the load seam:
    a new refusal code can make a stored document unloadable (ADR 0052's dead link), and severity is
    declared per code (ADR 0069). Reachability is now measured — see the entry below — so what is
    left is only what the gate should *say*.
  - **~~`setWidth` does not raise the mark ADR 0065 requires.~~ WITHDRAWN 2026-09-08 — there is no
    defect here, and this entry was wrong twice before it was right.** Re-measured end to end: on
    wall B at 700, recorded `B|2.72` is 600 wide and published is 500; `setWidth(800)` is accepted
    with `lastRejection === null` and the body ends at **3020** on a **2920 mm** wall — and
    `validateDesignForCatalog` then reports **`PLACEMENT_PAST_WALL_END`** and
    `COLUMN_EXTENT_PAST_WALL_END`. That is precisely what ADR 0065 decision 1 rules (marked, warned,
    not moved, not refused) and what ADR 0069's amendment names as the deliberately untouched
    width-resize consequence.

    Kept as a struck entry rather than deleted, because the way it went wrong is the lesson. An
    implementer reported *"`validateDesignForCatalog` returns `[]`"*; that sentence was about the
    **fixture at load**, before the resize. It was read as being about the **result**, and the
    misreading was then written into this file and reported to the owner as an outstanding defect —
    twice, once as an open product decision and once as a missing mark. **A quoted measurement is
    about the state its author measured, not the state you are asking about.**
  - **Wave 6Y** — the only open wave row. Does not block: the defect predates all of this on `main`,
    and its witness is pinned positively.
  - **The M6 close-out sections ADR 0098 and ADR 0101 each ask for.** ADR 0098's is largely
    discharged: the sink's 600 mm parity re-baseline is recorded in `docs/backlog/open.md` entry 41
    and carried by its own commit (`0ff3faa`). ADR 0101 decision 2 was executed on 2026-09-08.

- **The 2026-09-08 audit-remediation round — what it closed, measured rather than asserted.**
  - **M6-AUD-006** needs no work: the shape is ruled and the owner deferred it twice (ADR 0100).
    What was unenforced was decision 5 — copy and coefficient move together — and
    `apps/web/tests/price/aud-006-depth-note-and-price-move-together.test.ts` now couples them,
    deepening the kitchen through the real `setCabinetDepth` and demanding identical totals line for
    line beside the shipped sentence. Proved red by adding one bani at 700.
  - **M6-AUD-008 is measured on both halves.** Backlog 51: a mixed-chain column is **unreachable
    through the offer list** — 400 offer rows over 29 targets on the seeded and fully emptied
    kitchen at both depths name no `wall-map` body, the two that exist refuse insert, replace and
    delete, and their column opens no void. Backlog 50: the corner blindness is pinned as a witness,
    with the same recorded space reported on wall A and silent on wall B inside the 560 mm the corner
    body reaches. The witness also records something wider than the backlog states — the sweep
    returns early when a document carries neither `emptyColumns` nor `columnExtents`, so two
    placements in one span are never compared on either wall.
  - **M6-AUD-009 is closed.** The four skipped width-reachability cases were un-skipped on
    2026-09-08 (the ratchet had been fixed by later waves and nobody returned to them), and
    `happy-dom` is now declared **per file** so focus logic has a DOM without moving 1,900 node tests
    onto one. Two suites: the breakdown's focus-in / Escape-after-focus-left / focus-restored, and
    the settings sheet's `inert` screen — the half of "modal" a scrim cannot do.
  - **M6-AUD-011 is diagnosed and needs nothing here** — `docs/backlog/open.md` entry 58.
    `three@0.184.0` deprecated `Clock` at r183; `@react-three/fiber@9.7.0` constructs one in its own
    store. No change to this repository can silence it.
  - **The remaining skipped test in the tree is deliberate**: `kitchen-stage.e2e.spec.ts`'s mobile
    highlight case, whose patch of scene is behind §9's sheet at 390 x 844. It is asserted on desktop
    instead, and the file says so.

- **Engineering obligations left by the 2026-09-08 QA round.** Recorded here rather than in
  `docs/backlog/open.md`, which is for product behaviour observed in use and says so in its own head.
  - **~~ADR 0101 decision 2 was ruled and never executed.~~ DONE 2026-09-08 (`a4c41f0`).**
    `neverMigrated` is now `neverMigratedByAResize`, and its comment records what a depth change
    actually does, **measured rather than restated from the ADR**: the row's entry goes
    `frameDepthMm` 561 -> 661 and declares `follows: "cabinet-depth"`, so a depth change reaches and
    rebuilds it — but its `buildId` is the same at both settings, which is the only sense of
    "migrated" that test measures. The ADR says *reach*; writing *migrate* here would have been
    wrong in the file's own vocabulary.
  - **~~Two shipped tests can pass for the wrong reason.~~ BOTH FIXED 2026-09-08 (`15a59e2`,
    `d426c5d`).** `cabinet-depth-source.test.ts` now builds a wall carcass at an **off-map** 555 mm,
    which is the only input no lookup can invent — with the map lookup restored inside the adapter
    the two "builds a wall carcass at the N mm row" cases stay green and the new one fails — and it
    measures **both** deep-top rows rather than one. `sink-front-clearance.parity.test.ts` criterion
    3 now records what it measured and demands the ruled depth still be declared, so pointing the
    constant at an undeclared 650 turns it red instead of asserting nothing. The original text
    follows.

    **Two shipped tests can pass for the wrong reason.** `cabinet-depth-source.test.ts` builds only
    the declared `(cabinetDepthMm, wallDepthMm)` pairs, so a builder that re-derived the number
    through ADR 0028's map inverted would reproduce both rows and pass; it also measures only one of
    the two deep tops and only the decomposed body. `sink-front-clearance.parity.test.ts` criterion 3
    loops the declared depths and `continue`s at every one but 600, so it asserts nothing the day 600
    leaves the declared map (ADR 0093 decision 1). Both are **covered** by the QA files added
    2026-09-08; the weakness is in the owning files, which still claim to be the gate.
  - **~~`sink-front-clearance.parity.test.ts` never measures `countertop_side`.~~ FIXED 2026-09-08
    (`15a59e2`).** A sixth criterion states the three slabs tiling the stone with no gap: the side
    pieces start where the back one ends and end where the front one begins. The span really moves
    (`[-180, 220]` at 600, `[-130, 270]` at 700), and seating the side slabs at the old offset turns
    **only** this case red — which is what makes the hole real. The original text follows.

    **`sink-front-clearance.parity.test.ts` never measures `countertop_side`.** Freezing the two
    flanking slabs while the aperture moves would leave a visible slot in the worktop and that file
    would pass. Caught elsewhere by M1 parity and `room-composition.parity.test.ts`, so it is a hole
    in the file rather than in the suite.
  - **`ro.ts` and `ro.json` drifted inside W3.** `f6bf6c4` added three `globalSettings` colour keys to
    both; `44fe8cd` added `ro.panel.finishFollowsKitchen` to `ro.ts` only. Not a live defect —
    nothing in `apps/web/src` reads `messages/ro.json` yet. **Information for the M6B session, not
    work for this one**: M6B and Gate O1 are the owner's own work on `m6b-internationalization`.

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

**2026-09-08, and this is the first thing to read this morning: `fix/m6-remediation` does not merge to
`main` yet, and the block is three edits in one test-support file.**
[ADR 0102](decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
adjudicates the finding the item 8 implementer raised and refused to treat as settled.

- **The finding is confirmed and is genuinely pre-existing.** Re-measured end-to-end at `ed12804`:
  `resolveDepthM`'s lifted arm (wave 6I2, on `main` since 2026-09-04) builds a wall body over a
  full-height column to a depth its entry does not declare, while `restoredColumns` records that entry
  as the column's source. Reproduces in **three ordinary commands** on declarations ADR 0101 never
  touched. **ADR 0101's wave is a regression in *reach*, not the cause** — but it does move the shipped
  kitchen's `B|1.80` extent from 599 mm to **330 mm** after four ordinary commands. Recorded as
  `docs/BACKLOG.md` **entry 56**, and it opens wave **6Y** against `restoredColumns` in
  `void-engine.ts`.
- **ADR 0079 decision 10 point 2 is confirmed unchanged and unnarrowed.** It is the precondition of
  `frozenDepthAtThisSetting`, not a test convention, so it is an invariant and is not re-quantified to
  fit the code breaking it (ADR 0090 decision 7; ADR 0091 decision 1, whose Q1 answers *invariant* and
  whose Q2 fails).
- **What blocked the merge is discharged, 2026-09-08.** ADR 0102 decision 3's three limbs landed;
  the net diff is four test files and **zero production files**. `sourceExplainsTheDepth` is gone —
  it is now `isExplainedOrIsTheKnownLiftedColumnDefect`, keyed on the member actually standing in the
  column and its recorded seat rather than on a depth coincidence. The breach is pinned positively by
  `apps/web/tests/store/qa-6y-lifted-column-source.witness.test.ts`, which was **proved red-capable**
  by simulating 6Y: all six tests fail and the extent becomes 0.7, ADR 0102 decision 4's own
  prediction for that shape. The old helper was shown laundering the same mutation the new one
  catches — twelve columns inspected, nothing reported. `reAnswersOneBody`'s extension across ADR
  0022's swap **stands**, untouched. Note for whoever plans 6Y: the record says the blast radius is
  three suites; the witness makes it **four**.
- ~~**One question is for the owner and is deliberately not decided.** Post-ADR-0101, deleting the
  full-height column beneath a deep top and then changing the depth rebuilds that top from 600 mm
  finished to 400 mm (`p23`'s seat 561 -> 361, measured). The rule producing it is ADR 0028 decision 5's
  and is correct; whether it is the product the owner wants has never been asked. Nothing in 6Y turns
  on the answer.~~ **ANSWERED 2026-09-08 — the owner accepted the 400, and this is no longer open.**
  Their reason, in their own words: with the whole column emptied, the design should not count on
  cabinets that used to be there, and ordinary non-full-height cabinets are what you would expect
  below. ADR 0028 decision 5 is **confirmed** by the ruling rather than overturned by it. Recorded in
  [ADR 0103](decisions/0103-a-standing-body-is-re-planned-when-something-is-inserted-beneath-it-and-a-delete-leaves-it-alone.md)
  decision 1, with amendments appended to ADR 0102 and ADR 0101. **Do not carry it forward as open.**

**And the same ruling opened a second one, which is wave 6Z** — planned 2026-09-08 in
`milestones/M6-price-and-global-settings.md`, ruled by ADR 0103, tier **Full + visual**, **not yet
implemented**. The owner stated the rule positively — *"if below is the [full-height] cabinet, the top
cabinet should have the same depth of the [kitchen]"* — and asked for one gap closed: **nothing ever
re-plans a body that is already standing.**

- **The insert path is already correct for the body being inserted**, measured at `ed6c545` through
  the ordinary store: a `wall-cabinet` inserted over a standing `tall-pantry` at 700 is written at
  **661**. So the three reported symptoms are **one defect with three faces** and must be framed that
  way: delete the pantry and insert a *base* cabinet and the deep top stays at 561 where 291 belongs
  (600 mm) or 661 where 361 belongs (700 mm); insert a *pantry* under a 361 top and it stays at 361
  where 661 belongs; and in an emptied column, insert the top first and then the pantry and the top
  stays at 361.
- **The delete side is deliberately out of scope, permanently** — owner ruling, with a product reason:
  a delete is usually the first half of a replacement, so re-planning there does the work twice and
  makes the scene jump. The interim deep-top-over-nothing state is accepted as transient. **No mirror
  wave. Anyone reading the asymmetry as an oversight is reading against a dated ruling.**
- **6Z and 6Y are independent and may land in either order.** 6Y moves recorded sources, 6Z moves
  member seats; 6Z edits neither `restoredColumns` nor `frozen-source-invariant.ts`, and the 6Y
  witness performs no insert so it stays byte-identical. **Whichever lands second re-runs the other's
  suites.**
- **6Y itself now has a row in the M6 wave table**, which it did not before this pass — ADR 0102
  opened it on 2026-09-08 and the table never gained it. The table is **48 rows with 2 open (6Y, 6Z)**;
  the 2026-09-07 sentence *"every row is resolved"* was true of the table and false of the product.
- **One new backlog entry, 57**: an ordinary `setCabinetDepth(700)` turns `p13` from `hood-600` into
  `hood` and flips `fixedWidth` **true → false**, handing the customer a width control on an extractor
  hood. Measured, pre-existing, reachable with no insert at all, and it is product-logic review R3.2's
  own defect arriving through the depth command instead of the resize. **It is not 6Z's**, and 6Z
  carries a criterion that the hood's `fixedWidth` stays `true`.


**Next: M6, ~~now on branch `wave/6r-control-shapes-and-strip-row`~~** (that is the branch 6R, 6R-b,
6K-i and 6N-a landed on, 2026-09-06) — ~~**work moved the same day to `wave/6t-finish`, which carries 6T
and is where 6T-a is being implemented now**~~ **superseded 2026-09-07: every M6 wave branch is merged
and work is on `main` at `bdef351`; the next phase is M6B, whose Gate O1 is running now**. Read
`milestones/M6-price-and-global-settings.md`, ~~now a 25-wave breakdown (6P–6T added 2026-09-04 on
ADRs 0070 and 0071, superseding 6F; 6K-c added the same day on ADR 0073)~~ ~~now a 36-row wave table,
counted directly 2026-09-05~~ ~~now a 38-row wave table, counted directly 2026-09-05~~ ~~**now a 44-row
wave table, counted directly 2026-09-06**~~ (six rows added since the 38, by ADRs 0090–0094 — 6J-d,
6R-b, 6T2, 6W, 6V and 6X, each naming its own record in its row) — **now a 45-row wave table, counted
directly later on 2026-09-06: ADR 0092 Amendment C added the 6T-a row**. The 36 above
grew by two, not thirteen: **6K-g and 6K-h were found to be real waves with full plans and shipped
commits (`52e3c70`, `e90ccc8`) that had never had a table row at all**, discovered only by
cross-checking `git log` against the table (`docs/WORKFLOW.md`'s new *"the scribe runs after the
commit"* section records why this kept happening). All seven original owner decisions are closed.

**Twenty-three waves are DONE**, ten more than the last count: the original thirteen — 6A, 6H, 6A3,
6B2 (2026-09-03); 6C, 6D (shipped 2026-09-03, DONE marker added that pass — a pre-existing
documentation gap, not new work); 6E, 6G, 6I2, 6M (2026-09-03/04, merged at `ce77171`); 6S
(`280daa4`, `a2bff48`), 6J (`c8ba3af`, `a68482d`) and 6P (`38268b5`), all 2026-09-04 — plus ten rows
this pass reconciled against `git log` rather than left unmarked: **6K's whole family**, all closing
2026-09-05 — 6K-a and 6K-b (`30c3bcb`/`4dc08e0`/`30d419b`/`e664e33`, 2026-09-04), 6K-c (`56b6815`),
6K-d and 6K-e (one commit, `d4e58a4` — the hash exists, it simply had no `(6K-d)`/`(6K-e)` tag in its
subject and fell through the first pass's grep), 6K-f (`827e1e1`), 6K-h (`e90ccc8`), 6K-g (`52e3c70`),
6K-j (`151429f`) — and **6Q**, via 6Q-a (`9e9d54e`), 6Q-b (`59f8669`) and 6Q-c (`14cef90`, closed this
pass with its own gate run and visual verification — see its section for the focus-trap defect found
and fixed). ~~13 + 10 = 23, of 38.~~ ~~Corrected 2026-09-06: 24 of 38 — 6U closed~~, `38d5cad`,
ADR 0087's hob-seat fix, gates all green (see its own wave section for the full evidence). Five
shipped commits bundled inside
`93e9bc3`/`75668b8`/`dfa6198` — **6A2, 6A4, 6B, 6I, 6L** — now carry a recorded
certification verdict from the 2026-09-05 audit below (three CERTIFIED WITH FINDINGS, two CERTIFIED;
none NOT CERTIFIED) — check each wave's own section for the finding it carries before reading it as
fully closed. ~~**6R and 6T remain open**, and **6K-i remains genuinely unstarted** — no commit, no
plan section, only the header-block mention and its "unadjudicated" row; it begins with an ADR 0079
adjudication rather than a fix.~~ **Struck 2026-09-06, and both halves of that sentence about 6K-i were
false when written**: 6K-i had a full 179-line plan section in the milestone file *and* a finished
implementation at `deb237f`, in an agent worktree, the whole time. 6R closed the same day. See the
2026-09-06 recount below. **6N is no longer fully unstarted**: two of its four sub-waves are
dropped — the owner descoped the wall-coverage bars 2026-09-05 ("skip it in general for now... not
critical and on mobile it will take a lot of place"), which drops **6N-c** (the bars) and **6N-b**
(the coverage query 6N-c was its only reader for) — and **6N-0 closed 2026-09-06** (below). ~~**6N-a**
alone remains open.~~ **6N-a closed 2026-09-06 as well, `7ad15e1`** — it too was finished in an agent
worktree before this file said so. The whole 6N chain is now closed: two waves delivered, two dropped.

**Corrected again 2026-09-06: 27 of 38 — 6J-c, 6J-d and 6N-0 closed**, on one branch
(`wave/6j-cd-along-wall-chain`) and one merge to `main` at `e7eba07`: `2bdd923` (6J-c), `cf53e8e`
(6J-d and 6N-0 together), `b4d93c7` (a fix Amendment B owes 6J-d, below). **6J-c** gave
`alongWallPositionFollows` a production reader — `setCabinetDepth` now shifts each wall-B placement
along its wall by the chain its catalogue entry declares, closing a composition defect where
`base-corner-return-320` overlapped wall A's corner by 80 mm and the wall corner return overlapped it
by 31 mm, invisible to `validateDesignForCatalog` because that validator never compares a wall-A
coordinate against a wall-B one (recorded, not fixed, as `docs/BACKLOG.md` entry 50). **6J-c exposed a
second defect it did not fix**: `Design.emptyColumns` and `Design.columnExtents` stayed at the
coordinates the slid placements had just vacated, so at 700 mm on the seeded kitchen four standing
wall-B runs were recorded as free space, `voids` went 3 → 12, and `validateDesignForCatalog` returned
five `EMPTY_COLUMN_OVERLAPS_PLACEMENT` refusals at the `PUT` seam — **a 700 mm kitchen could not be
saved at all.** [ADR 0090](decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
adjudicated this the same day, ruled the two waves land together on one branch, and opened **6J-d** to
close it. **6N-0** shipped in the same commit as 6J-d, resizing the seeded room to `3560 × 2920` —
needed because the far-end-of-wall defect Amendment B found below is invisible in the pre-6N-0 2830 mm
room. Full measurement, the two rulings ADR 0090 overturned against its own tests before either
reached `main`, the residue this branch introduces, and the merged-tree gate numbers are all in
`milestones/M6-price-and-global-settings.md`'s own close-out sections for these three waves — read
them there rather than through this summary. **ADR 0090 also amends ADR 0088 decision 1** — so
**6K-i's plan changed before it was written** and 6K-i is now sequenced after 6J-d (same file; do not
dispatch both into one tree).

**Corrected again 2026-09-06: 31 of ~~44~~ 45 — 6R, 6R-b, 6K-i and 6N-a closed** (the denominator
moved later the same day, not the numerator: ADR 0092 Amendment C added the 6T-a row), all on branch
`wave/6r-control-shapes-and-strip-row`, with the gates run on the merged tree by the coordinating
session rather than accepted from an agent. **6R and 6R-b shipped in one commit, `aa6ad9e`**: 6R is the
three control shapes (a six-decor list for PAL, a RAL picker for MDF, two swatches for veneer), the six
decors the 3D approximates, and the adapter's finish table made **total** over the domain's declared
palette by type annotation; 6R-b is [ADR 0094](decisions/0094-the-strip-gets-its-own-row-and-containment-is-measured-against-its-own-band.md)'s
own wave, opened the same day — on desktop the settings strip takes **its own full-width grid row**,
because 6R's shipped two chips were cut to 28 px on a flagged design at every desktop width below
1150 px and the settings trigger stood 39.06 × 44.00 px over the price bar, with all ten gates green
over it. **6R-b's cost is stated rather than absorbed**: about **44 px of desktop canvas at every
width** (the measured band is 45 px — 44 of content and the band's own 1 px rule; the canvas box goes
from y 55, 1440 × 845 to y 100, 1440 × 800), and a narrow departure from frame D2E, which
[ADR 0082](decisions/0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md) decision 6
already permits — a frame does not answer *"may a control leave the screen"*. **6K-i shipped at
`deb237f`** and **6N-a at `7ad15e1`**, both implemented in agent worktrees on 2026-09-06 and merged
onto this branch; **`1116ae9` closes four review findings across the two, all test-strength, with no
production change**. **One item inside 6K-i is a recorded disagreement rather than a defect, and the
reviewer asked for it in the close-out**: the merge receives the whole recorded map, so every
*occupied* column's vertical axis and `w` are carried from the pre-command derivation and not only from
the document's stored entries — wider than ADR 0088 decision 1's literal words, value-identical in
practice, and what makes the key space work. Read it at the wave's own close-out in
`milestones/M6-price-and-global-settings.md`, not here. **Gate numbers, merged tree, coordinator's own
run:** `pnpm ci:local` PASSED, all ten gates — domain **2996**, persistence **177**, three-adapter
**2328**, web **1643 passed + 4 skipped**, e2e **99 passed + 1 skipped**. The 2996/2328 figures are the
tree after `1116ae9`; the full ten-gate run was at 2993/2327, before those four test additions.

**The process failure this pass exposed, recorded because this project records what its process costs.**
**Two finished waves sat invisible in agent worktrees for a day while this file called one of them
unstarted.** 6K-i was written here as *"genuinely unstarted — no commit, no plan section"* when it had a
179-line plan section and a working implementation at `deb237f`; 6N-a was listed as simply open with its
commit already written at `7ad15e1`. The consequence was not a lost commit but a lost *bearing*: **M6
looked further from done than it was**, and a wave that was ready for review was described as one that
had not begun. The cause the owner named is worth writing down plainly — **sessions hitting the 5-hour
context limit mid-wave and never reaching a merge**. Work finished in a worktree stops existing for
every later reader the moment the session that made it ends, because nothing but that session's memory
connected the branch to the tracker. The mitigation this file can carry is the same rule `WORKFLOW.md`
already learned once (*"the scribe runs after the commit"*), extended one step: **a wave is not recorded
as open once its commit exists — it is recorded as implemented-and-unmerged, with the commit hash and
the worktree, before the session that built it can end.** Until that is habitual, a `git log` sweep of
every worktree branch is the only thing standing between finished work and a tracker that denies it.

~~**M6's remaining work, stated exactly: 6T, 6T2, 6W, 6V, 6X — five waves, and both gates just
cleared.**~~ ~~**Corrected 2026-09-06, later the same day: six waves — 6T, 6T-a, 6T2, 6W, 6V, 6X.**~~
~~**Corrected again 2026-09-07: three waves — 6T2, 6V, 6X.** 6T, 6T-a and 6W are done and sit on
`wave/6t-finish`, ready to merge; the paragraph two below carries their close-out.~~ **Corrected
again 2026-09-07, at the end of the day: no wave remains. 6T2, 6X, 6X-a and 6V all closed and merged
— see the close-out paragraphs below**, and note that the count grew a row on the way: ADR 0093
Amendment A §6 opened **6X-a** after 6X's QA, so the table is 46 rows.
6T (hardware priced per mechanism, ADR 0092) lands on one branch with **6W** (a tier that prices below
the default); **6T2** (the two sink extras) follows 6T in the same files, never in parallel and never
beside 6P. **6V** (a selection counted by what changed, not by what colour it is, ADR 0091 decision 6)
was gated on 6R and is now unblocked; **6X** (the slide is witnessed by an assertion, ADR 0093) was
gated on 6K-i and is now unblocked. ~~**6T is already partially implemented, and it must not be lost:**
**8 uncommitted files** sit in the agent worktree `agent-ac47cf4d0050600d5`, based on current `main` — a
new `packages/configurator-domain/src/hardware-mechanisms.ts`, two test files, and edits across the
pricing modules. It is **unreviewed and uncommitted**; whoever picks 6T up starts by reading that
worktree rather than by writing the module again. This is the same failure mode the paragraph above
describes, caught while it is still recoverable.~~ **Superseded the same day: that work was not lost.**
It is committed, reviewed, and on a branch — the two paragraphs below say exactly where.

**Superseded 2026-09-07 by the close-out three paragraphs below — 6T is DONE, with 6T-a and 6W
beside it, and the branch is ready to merge. The figures in this paragraph are a wave out of date
and are kept for the dated record.** **6T is implemented, adversarially QA'd and reviewed — and it
is not merged.** It sits on branch
**`wave/6t-finish`**, which has **not** reached `main`, so 6T is neither DONE nor open: it is
**implemented-and-unmerged**, the state this file's own closing rule requires for a commit outside
`main`. Five commits, in order: `b93f8a5` (work in progress), `0d0ee61` (the wave), `88f85e2` (**53
tests added by QA**), `e9ab7b2` (the stale per-handle vocabulary retired) and `bf2ba61` (ADR 0092's
Amendment C). Both reviews ran — logic and clean-code. **Provenance of every number in this paragraph:
the coordinating session that ran the gates reported them, and no dated record inside `docs/` carries
them yet** — the milestone file's own 6T close-out is still owed and is where they belong. As
reported: **ten `ci:local` gates green at `0d0ee61`**, and the suites at `e9ab7b2` stand at domain
**3099**, persistence **177**, three-adapter **2328**, web **1650 passed + 4 skipped**.

**A sixth wave now exists — 6T-a, one push-to-open predicate — and it changes the branch grouping.**
Opened by [ADR 0092](decisions/0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md)
**Amendment C**, on the owner's ruling of 2026-09-06 that push-to-open is a manufacturer cost and must
be priced; specified in full in `milestones/M6-price-and-global-settings.md`'s *Wave 6T-a* section.
Tier **Full**, gate **6T**, and it is being implemented now. What it repairs is **6T's own quantity
basis**: 6T counts a latch only where a placement **records** `handle: "push"`, so the shipped demo's
16 top-row latches bill at **zero**, while a recorded `push` on a body whose definition declares
`canHandle: false` keeps its handle bars in the scene and is billed a latch anyway — one rule decided
twice, once in the domain and once in the adapter. Read the wave section and Amendment C for the
detail rather than this summary. **The grouping ADR 0092 decision 12 set has grown by one: 6T + 6T-a +
6W reach `main` together on one branch, green under `pnpm ci:local`, in the order 6T → 6T-a → 6W
within the branch.** None of the three runs beside another, nor beside 6P or 6T2 — all four edit
`sample-price-book.ts`. **6T2 remains independent and may land on its own branch.**

**Closed 2026-09-07: 6T, 6T-a and 6W — 34 of 45 — on branch `wave/6t-finish`, ready to merge and
not merged.** Commits in order: `0d0ee61` (6T), `88f85e2` (its adversarial QA), `e9ab7b2` (the
per-handle vocabulary retired), `bf2ba61` (ADR 0092 Amendment C), `0a9ce1a` (6T-a, plus ADR 0092
decision 16), `fb127b8` (6T-a's QA), `1d6fc7e` (6W), `ca35b96` (6W's QA). **What the three did**, in
one line each: 6T moved hardware billing from per-cabinet-handle to **per mechanism** — hinges (2
per leaf, 3 above 900 mm), drawer runners, push latches — making the seeded kitchen's basis **74
hinges + 5 drawers**; **6T-a** fixed what 6T inherited, that pricing read the *recorded* handle mode
while the product decides push-to-open by whether the bar is hidden, so the demo's nine top-row
placements carried **16 latches billed at zero while the panel told the customer they were
push-to-open** — one predicate (`isPushToOpen`) is now published by the domain and called by both
the scene and the price; and **6W** stopped `NegativeTierDeltaError` reaching the settings sheet for
a hardware tier that legitimately prices below the default, **with the material refusal intact**.

**Verification actually performed, recorded because the repository carried no dated evidence of it
until this pass** — an earlier scribe pass flagged that gap and this closes it. 6T: adversarial QA
(53 tests), logic review (Full), clean-code review (Full). 6T-a: adversarial QA (49 tests), logic
review (Full). 6W: adversarial QA (39 tests), logic review (Full). **Final state at `ca35b96`, run
by the coordinating session itself: all ten `pnpm ci:local` gates PASS; `pnpm test` 7 387 passed / 4
skipped across 334 files; e2e 99 passed / 1 skipped.** That single run is the gate evidence for all
three waves; the intermediate figures this file carries for `0d0ee61` and `e9ab7b2` are superseded
by it.

**Closed 2026-09-07, later the same day: 6T2, 6X, 6X-a and 6V — 38 of 46 — and every M6 wave branch
is now merged to `main`.** The merges, in order: **`825ba43`** (6T2), **`9f5a4f6`** (6X and 6X-a
together), **`c7c9743`** (6V), each following `857a29e`, which took 6T, 6T-a and 6W off the
implemented-and-unmerged list. Two fixes come after the merges and are part of the record rather than
tidying: **`88f06ba`** corrects two of 6V's criterion sentences that were written against cases that
do not exist, and **`bdef351`** closes the two documentation findings 6X-a's late review raised.

**What the four waves did**, one line each, with the detail at each wave's own close-out in
`milestones/M6-price-and-global-settings.md`. **6T2** — a sink is a **declared** catalogue fact, the
dish rack's host is **derived** (the lowest wall-band body, same wall, at least one door leaf,
strictly overlapping), and both extras are priced per sink at **20 000** / **40 000** minor with
neither drawn. **6X** — ADR 0090 decision 6 finally has an assertion that goes red when the slide is
removed, after QA had measured that removing it was **byte-identical over 284 trails** and green
across all **4 554** tests. **6X-a** — the slide's *direction* is witnessed: swapping the depth
operands moves a member-less extent **100 mm the wrong way**, which needed a declared design with two
columns exactly **200 mm** apart, because the shipped kitchen has no such pair — which is why the tree
stayed green. **6V** — the selection outline is drawn in **two passes** (a near-black casing `0x101010`
under the red core), so a front cannot equal both: swept over the 24-bit cube, the nearest any colour
gets to both is **121.4** against the instrument's **60-unit** tolerance, and the pixel counters now
measure a **difference** rather than a colour, with the positives **tripled** — the sink patch reads
**10 722** where the retired counter read **3 603**.

**Verification actually performed, recorded here because only the session that ran it holds it.**
**6T2:** adversarial QA (**289 tests**) and a **logic review (Full)**. **6X:** adversarial QA and a
**logic review (Full)**. **6X-a:** adversarial QA and a **logic review (Full)** — **and the review ran
*after* the merge**, a sequencing error by the coordinator, stated rather than smoothed over. It found
**no blocker**; the two documentation findings it did raise are fixed at `bdef351`. **The reviewer
also could not execute** — the tree it was given was on another branch — so **its confirmations of the
red sets are re-derived by reading, not re-run**. **6V:** adversarial QA (**4 tests added**,
`bba4b1b`) and **no separate logic review**; the QA pass was adversarial and thorough, and that is the
whole of the review this wave received. **Final state at 6V's merge, run by the coordinating session
itself: all ten `pnpm ci:local` gates PASS**, `pnpm test` **7 971 passed / 4 skipped**, **e2e 110
passed / 1 skipped**.

**Five things from these waves that are recorded rather than summarised, because a summary loses
exactly what makes them useful.**

1. **Two of 6V's criteria were written against cases that do not exist, and were corrected rather
   than satisfied** (`88f06ba`). **`veneer.nuc` does not break `redTint`** on the tone-mapped render:
   its brightest pixels measure **49, 47 and 50** against a threshold of **50** — unsatisfiable by one
   unit, where the 6M guard's 137 is model arithmetic tone mapping never spends. **And the mark cannot
   be differenced:** the flagged total moves the canvas box (`y 100 h 800` → `y 114.19 h 785.81`), so
   **19–43 % of every rectangle moves** and differencing would measure layout. **`redTint` and
   `blueTint` therefore survive under work item 3** — colour-keyed, each declaring the fixture property
   that makes it valid.
2. **A selection outline was itself being counted as a mark** — **6 454 pixels** of red excess on an
   **unmarked** body against a threshold of **50**, and nothing asserted otherwise. Now pinned.
3. **Nothing witnessed the casing pass on screen, and the differencing counter cannot see it.** Its
   count is indifferent to the front colour — **10 104 / 10 102 / 10 720 / 10 722** across four fronts
   — so the casing was measured directly instead: near-black at tolerance **40** reads **1 923** pixels
   selected against **0** unselected. QA closed this.
4. **The inspection half of 6V's criterion was performed**, and it is recorded because a criterion
   asking for an inspected render is not discharged by a count. On `#ff2d2d` and `#cc2222` the
   near-black casing traces the carcass, both door divisions and the sink rim, and **the red core is
   invisible — the rim does all the work**; on `veneer.nuc` the core dominates with the casing as a
   thin rim.
5. **Still owed: the CI runner artefact.** 6V's last criterion asks for **runner** evidence and every
   figure above is a **local** run. It is owed, not done.

**6T2's QA found two criteria passing on implementations that did not satisfy them**, which earns its
own line because both survived the whole suite: a hard-coded **`entry.wall === "A"`** in the host
resolution survived all **3 225** domain tests — the shipped kitchen's sink is on wall A, so a literal
naming the wall reads identically to a comparison that derives it — and reverting **`isUnplacedLine`**
(`apps/web/src/price/price-breakdown-model.ts:263`, the predicate ADR 0092 decision 11 planned as
`isWholeKitchenLine`) to its old negation survived all **1 673** web tests, which is the exact trap
that criterion was written for.

**What M6 still owes before it can be called closed.** Three things, and none of them is a wave:
**6V's CI runner artefact**; **6W's criterion 4**, met in code under an architect's interim and not
with the owner's words; and the **six open owner inputs** below. **M6B — Internationalization is the
next phase, and its Gate O1 is in progress** — the owner is reviewing `apps/web/src/messages/ro.json`
now. The gate is a hard owner stop by design: nothing is translated until the corrected Romanian
exists.

**Open owner inputs carried out of M6, all unresolved.**

- **The three drafted push-to-open rates (40 / 120 / 100 MDL)**, which currently invert the tier
  ordering — Hettich above Blum. ADR 0092 open input 1.
- **Whether an out-of-bounds sink still bills its rack** — worth **40 000 minor** per sink, and a gap
  in ADR 0092 decision 10's contract rather than a defect against it. **ADR 0092 open input 7**, added
  at 6T2's close-out.
- **The settings sheet's blank badge for a below-default tier** — `inclus` / *(blank)* / `de la +…`
  down the three rows, where a blank between two figures reads as *"price unavailable"* rather than
  *"cheaper"*. ADR 0092 open input 4.
- **The *De la* interim** — 6W left the claim true rather than qualified under an architect's interim,
  where the criterion asks for the owner's words. ADR 0092 open input 4.
- **The two drafted accessory names**, and the breakdown's category word for them. ADR 0092 open
  input 3.
- ~~**`docs/BACKLOG.md` entry 54** — cabinet depth changes material and not price — which needs the
  owner's own manufacturer to answer.~~ **Half answered 2026-09-07 —
  [ADR 0100](decisions/0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md).**
  The owner ruled the **shape**: one depth coefficient multiplying the 600 mm base, owned as a
  dashboard-editable setting, chosen over a per-cabinet 600/700 mapping. *"Like fifteen percent"* is a
  working figure and not a committed rate, and the owner explicitly postponed the implementation. **It
  is no longer an open question to put to them** — what remains is the manufacturer's rate, which is
  the owner's to obtain when they return to it. Do not plan a wave.

**Two things these waves hand the owner, and both are now load-bearing rather than pending.**
**First, the three drafted push-to-open rates (40 / 120 / 100 MDL).** They were safe to draft only
while nothing depended on them and Amendment C ended that: measured on the shipped demo, the
hardware line rises **+640 / +1 920 / +1 600 MDL** per tier, and at 16 latches **Hettich (11 340
MDL) overtakes Blum (11 335)** — an ordering **ADR 0070's own totals contradict**. Nothing refuses
and no document is corrupted, and no expectation is pinned to the magnitudes (assertions compute
`count × the book's own rate`), but the most expensive tier a customer sees is currently decided by
a number with no supplier source. ADR 0092 open input 1. **Second, 6W's criterion 4 — the *De la*
claim — is met in code and not in the record.** It asks that the claim be either true or qualified
and that the choice be recorded **with the owner's words**; the wave left it **true, not qualified**,
under an architect's interim marked pending owner review, and **the owner has not ruled**. The
interim's reasoning is that the disclaimer scopes the figure to this kitchen pre-measurement rather
than claiming a cross-tier floor, and that the figure re-derives when a tier is chosen. **The
constraint on the owner's options, found by 6W's review: `exactDelta` discards the magnitude, so any
copy naming how much cheaper a tier is needs domain re-plumbing, not a string change.** A related
copy call is open on the same surface — a below-default tier makes the sheet read `inclus` /
*(blank)* / `de la +…`, and a blank between two figures reads as *"price unavailable"* rather than
*"cheaper"*. Both are ADR 0092 open input 4.

**One premise inside ADR 0092 Amendment C was wrong and is corrected.** It claimed
`TOP_ROW_Y0_M * 1000` evaluates to `2200.0000000000002`; it is exactly `2200`, and the
millimetre-literal rule stands on readability instead. `docs/milestones/M6-price-and-global-settings.md`
already carries the correction at the criterion; **checked this pass, ADR 0092 itself never asserted
the float claim**, so there is nothing to unwind in the decision record.

**The residue these waves leave is not closed by them, and it is introduced by them, not
inherited.** `setCabinetDepth` obeys ADR 0090 Amendment B's rule that a room-derived cap may bound
what the map publishes and may never rewrite what the document records. `setWidth` and `insertBody` do
not: `CommandContext.columns` hands them the **published** map and their `effect.columns` replaces the
record whole, so an unrelated resize on a wall the capped space has nothing to do with — wall A,
while the capped space sits on wall B — still takes a recorded far-end space from 600 mm to 500 mm,
permanently and silently. **At `e28ab25`, before this branch, the depth command slid no extent at
all, so a far-end space was never pushed past its wall and was never capped — there was no loss on
this path on `main`, in either direction.** This is the branch's own residue, not a pre-existing one
inherited from before it. Direction is already ruled, not merely observed: the wall-end cap should
preserve the column's key, and `setWidth`/`insertBody` should then be handed the recorded map rather
than the published one. Recorded as `docs/BACKLOG.md` entry 52, unscheduled.

**Two rulings inside ADR 0090 were overturned by the wave's own tests before landing, and both
wrong answers are kept in the record rather than erased.** The first — a member-less space with no
recorded source keeps its coordinate — measured wrong in seven of eight legacy scenarios and was
overturned by a four-rung information ladder the same day (Amendment A). The ladder's own claim that
"no space is lost" was then itself found wrong by adversarial QA on the branch: a space at the far end
of a wall lost 100 mm permanently through the room-derived cap, a case neither prior measurement had
reached (Amendment B). **Six tests were declared invariants before either ruling was made, and neither
wrong ruling was allowed to edit them to pass** — two of the six could not go green under the first
wrong ruling and the implementer escalated rather than weakening them, which is what surfaced the
ruling as the error rather than the tests. All six now pass with only their anchors moved, every
expected value and generator range unchanged. This is the strongest evidence this project has that its
invariant discipline works: two wrong rulings were tried against the same six tests in one wave, and
the tests were never what gave way.

**The gates were run twice against a tree still being written this pass**, producing numbers a wave
out of date before the final merged-tree run superseded them — the same freeze this project already
requires of QA and review applies to whoever runs the gates. The number below is the final run, at
`e7eba07`: `pnpm ci:local` PASSED, all ten gates. Domain 2929 passed, three-adapter 2204 passed,
persistence 177 passed, web 1601 passed / 4 skipped.

**Certification audit closed 2026-09-05, run at `59f8669` — all five shipped-but-uncertified M6 waves
now have a recorded verdict.** 6A4 CERTIFIED (6/6 mutations killed). 6B CERTIFIED (10/10). 6A2
CERTIFIED WITH FINDINGS (4/6 killed by 6A2's own files, 6/6 by the full suite). 6L CERTIFIED WITH
FINDINGS (8/9). 6I CERTIFIED WITH FINDINGS (7/7). None NOT CERTIFIED, and all five still hold at
`59f8669` — no wave was silently broken by a later one. **Worth recording once, not five times: in 3
of 5, the wave's own guarantee is covered by ANOTHER wave's literals, not its own** — 6A2's name
through wave 5B8's, 6L's declaration through 6B2's price step, 6I's dishwasher floor through the
domain test while the adapter test named for it is inert. Each chain was closed 2026-09-05, and each
runs through a file its own wave does not own. See each wave's own section in
`docs/milestones/M6-price-and-global-settings.md` for the wave-specific detail; `docs/BACKLOG.md`
entries 42-47 queue the code-level findings the same audit turned up.

**Closed 2026-09-05 — verified against the tree, not just the milestone prose.** ~~Two call sites
still hard-code the pre-6J cabinet depth, and this is the largest open thing wave 6K carries.~~ Found
2026-09-04 while ruling on
[ADR 0073](decisions/0073-a-frozen-extent-records-the-body-its-depth-came-from.md) and recorded as
that ADR's finding; fixed by wave 6K-b (`4dc08e0`, `30d419b`). Confirmed 2026-09-05:
`packages/configurator-domain/src/commands/insert-fit.ts` (`resolveDepthM`) now reads "the design's
own setting, not a module constant (wave 6K-b)" in its own doc comment, and
`apps/web/src/scene/kitchen-stage.tsx` no longer imports `WORKTOP_DEPTH_MM` at all — it reads
`state.design.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM` and passes
`wallDepthMm: wallCarcassDepthMm(cabinetDepthMm)` beside it, exactly as 6K-b's acceptance criteria
required. Classified as an implementation defect against ADR 0055 decision 1, **not** a contract
gap — both were wave 6K-b's, and the second is what gated its *"changing it visibly changes the
model"* criterion, now met.

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
- **A commit in a worktree is work this file must already know about.** Added 2026-09-06, after this
  file called wave 6K-i *"genuinely unstarted — no commit, no plan section"* while both existed, and
  listed 6N-a as open with its commit written. An unmerged branch is invisible to every reader who was
  not in the session that made it, and sessions end mid-wave at the 5-hour context limit. Record a wave
  as **implemented-and-unmerged, with its commit and its worktree**, the moment the commit exists —
  never as open. ~~The live instance of the same hazard is the partially-implemented 6T in
  `agent-ac47cf4d0050600d5`, named above so it cannot go the same way.~~ **Closed the same day, and
  the rule did its job: that 6T work was committed, QA'd and reviewed onto `wave/6t-finish` rather
  than stranded.** 6T is now recorded above in exactly the shape this rule asks for —
  implemented-and-unmerged, with its commits and its branch — and **`wave/6t-finish` is the live
  instance to watch**: ~~it holds 6T and is where 6T-a is being written~~ **updated 2026-09-07: it
  holds all three of 6T, 6T-a and 6W, each closed out with its commits, and it is green on all ten
  gates at `ca35b96` and ready to merge**, and nothing on it has reached `main`. ~~**The rule's own
  test is whether that sentence stays true until the merge**~~ **The rule passed its test, 2026-09-07:
  the three merged at `857a29e` while still recorded as DONE-and-unmerged, and no reader in between
  could have mistaken them for unstarted work.** **There is no live instance left to watch** — every
  M6 wave branch is merged and `main` is at `bdef351`. The next branch to carry unmerged work inherits
  the rule.
