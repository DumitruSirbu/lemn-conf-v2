# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn fast where the project stands, without reading eight phase plans.

> ## M7 — Screen 1: room shape, dimensions, presets, bespoke fallback — CLOSED, 2026-09-29
>
> **M7's own acceptance criteria are met and the phase is closed.** The plan file is moved to
> `docs/milestones/done/M7-room-and-presets.md` (`git mv`, history preserved), with the stop-reading
> banner at its top. Its build sequence
> (`… → 7J → 7K → 7L`) is complete, Gate M7-C is withdrawn (ADR 0113), and the two decision records
> owed before close both exist:
> [ADR 0131](decisions/0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md)
> (the preset-path deferral past M8) and
> [ADR 0104 Amendment B](decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md#amendment-b-2026-09-29--q-7l-1-answered-d1bs-heading-on-site-note-and-plan-hint-are-not-drawn-and-a-desktop-frames-text-is-not-authority-on-its-own)
> (Q-7L-1's answer).
>
> **What M7 shipped, across its full lifetime:** `/configurator/room` and its six sub-states under one
> step ("Pasul 1 din 4"); the room schema and its validation (1C); straight, L and mirrored right-hand
> L kitchens entered through dimensions and carried through to bespoke generation (1F) via the same
> M2/M3 engine guards as manual editing, with no privileged path; the mobile gate (7K, full touch
> flow through all six states into the editor) and the separate desktop line (7L: D1A, D1B, D1C, D1F
> at `min-width: 900px`, sharing components, rules and copy with the phone); visitor identity and
> resume (the `__Host-` cookie, migration `0005`), a design opening only in its owning browser (7E3b),
> and the private share link (7E3c, `/[locale]/s/{token}`); the 3D shell, both wall planes, the
> backsplash, seats and camera presets deriving from the customer's own room instead of the seeded
> 4.2 × 3.4 m reference (7H); and, alongside the build, the migration/environment safety improvements
> that landed during the phase (migrations 1–6 and the `design_share_links` grant applied to
> production, the real preview branch and staging).
>
> **Deliberately deferred, not shipped:** the preset story (search, evaluation, application, the
> in-repo thumbnail rig) — 7P1, 7P2, 7G, 7B, 7C and 7F3 — moved past M8 by
> [ADR 0131](decisions/0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md);
> every buildable shape goes from its dimensions straight to 1F composition instead. U-shaped rooms
> are **M7B**, confirmed by the owner as its own milestone.
>
> **Verification evidence (7L's, the phase's last gate):** final `pnpm ci:local` — **ALL GATES
> GREEN** — domain 5018/5018, persistence 730/730, three-adapter 3642/3642, web 4756/4756, e2e 520
> passed, build/boundary/lockfile/SCA all PASS. Full wave-by-wave verification for every earlier wave
> is in the archived plan, `milestones/done/M7-room-and-presets.md`.
>
> **Live knowledge going forward:** the archived plan
> (`milestones/done/M7-room-and-presets.md`) for wave history and verification detail; the ADRs listed
> in the M7 table row below for durable "why"; `docs/decisions/0131-...md` for what a reviver of the
> preset story inherits. **Next milestone: read `milestones/README.md` for the phase sequence** before
> opening any plan.

> ## Gate O2 is CLOSED — approved by the owner, 2026-09-11
>
> In the owner's words: *"russian I checked looks ok, if in future I will found something to fix I
> will do this."* **All 235 leaves of `apps/web/src/messages/ru.json` are approved as drafted.**
> [`docs/i18n/gate-o2-russian-review.md`](i18n/gate-o2-russian-review.md) carries the closure banner
> and is the record; it is not restated here.
>
> **Two of the aid's flagged items were product questions, not wording, and were put to the owner
> separately — both left as drafted, and one is a standing re-open condition rather than a closed
> item.** **F4** (`configure.localeMenu`, whose Romanian never went through Gate O1) stands as
> shipped. **F6** (the eight translated decor names) is **not closed** — a customer or supplier
> matching a decor against a printed sample works from the manufacturer's own name, and nothing
> automatic catches a mismatch in the Russian. Re-open F6 if a supplier ever reads the Russian quote.
>
> **A seventh owner ruling closed a question the review round raised**, now
> [ADR 0107](decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)
> Decision 7: a cabinet named for an appliance names the *niche*, not the appliance.
> `cabinet.tall-oven-tower` and `cabinet.tall-fridge-housing` are joinery and keep their prices;
> `cabinet.hood` and `cabinet.fridge-free` are the appliance alone and are zeroed. *"Coloană cuptor +
> microunde"* beside the appliances-excluded disclaimer is **not** a contradiction and the label
> stands, unchanged. No string moved and no code changed — the price book already encoded it.
>
> **e2e ran to completion on this branch for the first time, 2026-09-11: 189 passed, 2 failed, 2
> skipped, 5.5 minutes**, across the `mobile` and `desktop` Playwright projects. Both failures were
> this milestone's own rulings meeting gates calibrated to geometry those rulings replaced, and both
> are fixed and re-verified passing at `cec60b7` — see the M6B row below for what each was.
>
> **After the gate, M6B owes only the push, and the owner has now explicitly authorised it.** The
> rebase rewrote the branch's history, so it can only be force-pushed.

> **RESUME HERE — 2026-09-29. M7 wave 7L ("the desktop line") is DONE — and it is M7's last build
> wave.** Step 1 now draws D1A, D1B, D1C and D1F at `min-width: 900px`, from the same components,
> rules and copy the phone uses, with the phone unmoved by a pixel. Full close-out:
> [`milestones/done/M7-room-and-presets.md`, *7L close-out —
> 2026-09-29*](milestones/done/M7-room-and-presets.md#7l-close-out--2026-09-29), directly after the 7L
> plan.
>
> **What shipped.** Commits, in order: plan `1e1bf6e` (this commit's diff also contains S0-S2's
> implementation — a labelling mismatch noted plainly in the close-out); S3-S6 + review fixes
> `86f6dc4`; R9 documentation `4962fa8` (HEAD). The measured, fill-mode large plan (S2); D1C's
> actionable suggestion reusing the *Liniară* chip's own handler and closing 7J's R1.4 live-region
> handover (S3); D1F's static plan aside (S4); a new 69-test desktop e2e spec,
> sabotage-verified (S5); a full visual pass at 1440×900 in both locales plus a byte-identical mobile
> control (S6).
>
> **QA and review found and fixed real defects, none blocking after fixes.** S5 found a Russian-locale
> help-button/input overlap and a plan-box border-sizing bug causing a spurious second measurement,
> both fixed. Review's logic pass found one BLOCKER — a room-level-only validation reason left the
> suggestion wired to no live region and no field, a real accessibility regression — fixed with a
> regression test pinning the reported room, plus six further fixes (a missing property test, the
> criterion-8 pre-hydration bound tightened to per-environment measured values, a mapping duplication
> consolidated, a visual regression from the RU fix corrected, and a CSS row-gap quirk investigated and
> correctly left as a documented known quirk). Clean-code review found no blockers, two non-blocking
> notes only.
>
> **R9, accepted by coordinator ruling:** a brief pre-hydration flash of phone-sized plan content at
> desktop before fill-mode measurement resolves, unavoidable without breaking the phone's SSR
> byte-identity guarantee. Bounded per-environment (dev ≤ 7, CI/production ≤ 4 paints over 20 runs),
> sabotage-verified. Trigger to revisit: a true zero-flash requirement (a server-side viewport hint, or
> the owner reporting it as jarring).
>
> **Final `pnpm ci:local`: ALL GATES GREEN** — domain 5018/5018, persistence 730/730, three-adapter
> 3642/3642, web 4756/4756, e2e 520 passed, build/boundary/lockfile/SCA all PASS.
>
> **M7's build sequence (`… → 7J → 7K → 7L`) is now complete, and Gate M7-C is withdrawn (ADR 0113) —
> but M7 itself is not yet closed.** ~~Two decision records the 7L plan names as owed "by M7's close" are
> still outstanding: (1) the preset-path deferral past M8 (7P1, 7P2, 7G, 7B, 7C, 7F3 — already
> deferred in practice by the 2026-09-15/2026-09-22 rulings, but with no ADR of its own yet), first
> recommended at 7K's close-out; (2) a dated amendment to ADR 0104 recording how Q-7L-1's answer
> (shipped at its interim, option (b) — none of D1B's extra heading/note/plan-hint text drawn, still
> open for the owner to override) settles DEVELOPMENT-SPEC §10's "same copy" against ADR 0104's
> "frames as specification." Neither is a coding task. **Do not declare M7 closed until both exist.**~~
> **Both decision records now exist (written 2026-09-29):**
>
> 1. **The preset deferral:**
>    [ADR 0131](decisions/0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md).
>    - **What moved past M8:** 7P1, 7P2, 7G, 7B, 7C and 7F3.
>    - **Who ruled it:** the owner's direction of 2026-09-15 (relayed); the coordinator's derivation
>      of 7B/7C the same day; the coordinator's 7F3 ruling of 2026-09-22.
>    - **What M7 shipped instead:** every buildable shape goes from its dimensions straight to 1F
>      composition, with no preset code under `apps/web/src`, re-grepped at `a989a85`.
>    - **What a reviver inherits:** among other things, the owner's copy-on-use ruling. That ruling is
>      not in ADR 0112, and an amendment to 0112 is owed when the work is revived.
> 2. **Q-7L-1's answer:**
>    [ADR 0104 Amendment B](decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md#amendment-b-2026-09-29--q-7l-1-answered-d1bs-heading-on-site-note-and-plan-hint-are-not-drawn-and-a-desktop-frames-text-is-not-authority-on-its-own).
>    - **The ruling:** the owner answered **(b), final** (relayed). D1B's heading, on-site note and
>      plan hint are never drawn, so desktop draws no text the phone's 1B does not.
>    - **Why decision 1 does not settle it:** ADR 0104 decision 1 does not answer the question either
>      way. Decision 7 does.
>    - **What the amendment narrows:** how decision 1's doctrine reaches Step 1's copy. ADR 0113
>      decision 5 carries a pointer.
>    - **Code:** no change; the shipped interim is the answer.
>
> What remains for M7's close is the phase outcome and the archival (`docs/WORKFLOW.md` step 7). It
> is not declared here.

Last updated: 2026-09-28 — **M7 wave 7J is DONE** (straight kitchens through composition, 1200–6000 mm
on one wall, no corner). See the [7J close-out](milestones/done/M7-room-and-presets.md#7j-close-out--2026-09-28)
and the M7 row below (the 7I entry directly below this one is superseded, kept for its detail).
~~**Next wave: 7K** (the mobile gate — full e2e touch flow through all six Step-1 states into the
editor), then 7L, then Gate M7-C, per the recorded order.~~ **7K is now DONE too — see the RESUME HERE
entry above.** Final `pnpm ci:local` at the review-fix
commit (`d00cfc0`): **ALL GATES GREEN** — domain 5018/5018, persistence 559/559, three-adapter
3642/3642, web 4719/4719, e2e 446 passed (2 skipped), build/boundary/lockfile/SCA all PASS. QA found
and fixed one camera button reading pressed after a stale wall-B view; review found and fixed four
minor findings (ADR/plan wording, the S0 census reconstruction, test-cast hygiene) — see the close-out
for detail. Two camera-framing follow-ups are on the record, not blockers: a 1200 mm straight kitchen
framed too tightly and a 6000 mm one cropped at both ends by the default presets (geometry confirmed
correct by interactive rotation; a preset-tuning task, not scoped to a wave).

**Owner actions needed before this branch deploys:** the migrations `0005`/`0006` and the
`design_share_links` grant, previously listed here as owed, are **done** — migrations 1-6 and the
grant are now applied on production (`lemn-conf-v2`), the real preview branch
(`lemn-conf-v2-preview`), and staging (confirmed already current). This happened out of its originally
planned "preview then production" order, during the 7J visual-verification pass, because
`MIGRATION_DATABASE_URL` in `.env.migration.local` pointed at production all along — the `preview`
argument to `migrate`/`migrate:status` is currently a display label only, not a database selector.
The owner was informed mid-session and approved proceeding; net effect matches what was already owed,
just completed without a fresh go-ahead for the production step specifically. **No**
`VISITOR_ROTATION_SECRET` is needed (the wave that would have required it was reverted the same day it
was added). **New, not yet scoped:** the owner asked for a cleanup pass on this project's `.env*.local`
file layout, which is confusing enough to have caused the above — a follow-up task, not started. The
runner's own CI verdict is still outstanding for 7T, 7F4b, 7E4, 7E3a, 7E3c, 7E3b, 7I and now 7J alike —
one owner-dispatched `workflow_dispatch` of `ci.yml` settles all eight.

Last updated: 2026-09-24 — **M7 wave 7I is DONE** (mirrored right-hand L; a mirror that works on one
group). See the RESUME HERE entry under *What to do next* (the 7E3b entry below it is superseded,
kept for its detail) and the M7 row below. ~~**Next wave: 7J** (straight kitchens), then 7K, 7L, per
the recorded order and the owner's Q-7J-1 answer (one maximum, 6000 mm, per kitchen shape unless
7J's planning shows a real need for 6300 mm on a straight wall).~~ The runner's own CI verdict is still
outstanding for 7T, 7F4b, 7E4, 7E3a, 7E3c, 7E3b and now 7I alike — one owner-dispatched
`workflow_dispatch` of `ci.yml` settles all seven. Review the new leaf `panel.widthStepNoteRight`
(ro/ru), and note that left-hand kitchens' wall-B side words and width-step note now read the other
way — a correctness fix found while building the mirror, not a regression from it.

Last updated: 2026-09-23, later than 7E3c below — **M7 wave 7E3b is DONE** (a design opens only in its
owning browser). See the RESUME HERE entry under *What to do next* (the 7E3c entry below it is
superseded, kept for its detail) and the M7 row below. ~~**Next wave: 7I** (mirrored right-hand L),
then 7J, 7K, 7L, per the recorded order.~~ The runner's own CI verdict is still outstanding for 7T,
7F4b, 7E4, 7E3a, 7E3c and now 7E3b alike — one owner-dispatched `workflow_dispatch` of `ci.yml`
settles all six. **Owner actions needed before this branch deploys:** migrations `0005` and `0006`
must be applied to `lemn-conf-v2-preview` then production, followed by the grant on
`design_share_links` — **no** `VISITOR_ROTATION_SECRET` is needed (the wave that would have required
it was reverted the same day it was added) — see the RESUME HERE entry for detail.

Last updated: 2026-09-23, later still — **M7 wave 7E3c is DONE** (the private share link: create,
revoke, re-issue; `/[locale]/s/{token}`). See the RESUME HERE entry under *What to do next* (superseded
above, kept for its detail) and the M7 row below. ~~**Next wave: 7E3b** (a design opens only in its
owning browser).~~ The runner's own CI
verdict is still outstanding for 7T, 7F4b, 7E4, 7E3a and now 7E3c alike — one owner-dispatched
`workflow_dispatch` of `ci.yml` settles all five. **Owner actions needed before this branch
deploys:** migrations `0005` and `0006` must be applied to `lemn-conf-v2-preview` then production,
followed by the grant on `design_share_links` — see the RESUME HERE entry for detail.

Last updated: 2026-09-23, later the same day — **M7 wave 7E3a is DONE** (visitor identity and
resume: the `__Host-` cookie, migration `0005`, mint/resume/clear); see the RESUME HERE entry under
*What to do next* (superseded above, kept for its detail) and the M7 row below. Earlier text below
is kept as history.

Last updated: 2026-09-23 — **M7 wave 7E4 is DONE** (e2e and tooling off `/configurator/configure`);
see the RESUME HERE entry under *What to do next* and the M7 row below. The runner's own CI verdict
is still outstanding for 7T, 7F4b and now 7E4 alike — one owner-dispatched `workflow_dispatch` of
`ci.yml` settles all three. Earlier text below is kept as history.

Last updated: 2026-09-21. **Corrected 2026-09-11, later the same day: M6B merged to `main` via PR
#8 (`995ad03`), and M7 — Step 1, room and presets — is now in progress on branch
`m7-room-and-presets`.** ~~Wave 7A shipped at `8df0d49`; see the M7 row below and the *What is open
right now* / *What to do next* sections for the six open owner questions and the next wave.~~
**Corrected again 2026-09-11, later still: waves 7A (`8df0d49`) and 7D1 (`f5b4cd9`) have both
shipped, the owner has answered every follow-up question (F1–F7), and M7B is confirmed. See the M7
row below and *What to do next* for the next wave, 7D1b.** **Corrected once more 2026-09-11:
7D1b is DONE in implementation commits `f61c361` and `85091cc`; 7D2 is next. The branch-wide
`pnpm ci:local` passed on the frozen tree; close-out commit `1e96104` and every local M7 commit
through it are pushed to `origin/m7-room-and-presets`.** **Updated 2026-09-12: wave 7D2 is DONE at
`4133cdc`; the generated kitchen now composes through the command path from a planned shell, and
~~wave 7A2 is next.~~ ADR 0110's 2026-09-12 clarification settles the storage/core sequence, while ADR
0108 Amendment E corrects 7A2's coupled-room boundaries to the generator's 600 mm sink plus 600 mm
hob. Close-out is `2126d52`; every M7 commit through it is pushed to
`origin/m7-room-and-presets`.** **Updated 2026-09-13: wave 7A2 is DONE at `f97d621`, closed at
`6cde5ef`; 7E1 is next.** The owner-approved policy now carries the generated minimum kitchen,
validation and generation agree across the approved L range, and the odd-millimetre shell defect
found during the wave is corrected under ADR 0110 without changing its 200 mm usable-remainder
rule. The branch-wide `pnpm ci:local` and the pre-push rerun both passed in full; every M7 commit
through `6cde5ef` is pushed to `origin/m7-room-and-presets`. **Updated again 2026-09-13: wave 7E1
is DONE at `57f1e94`, closed at `160983d`; 7E2 is next.** The exact localized room route, its
URL-state boundary, the proxy allow-list and `/` → Step 1 now exist. The final `pnpm ci:local` and
the pre-push rerun both passed in full; every M7 commit through `160983d` is pushed to
`origin/m7-room-and-presets`. **Updated 2026-09-14: wave 7E2 is DONE at `470e5c9`, closed at
`8434e76`; 7F1 is next.** `createDesignCreationAttempt` mints and writes once per deliberate
selection, and the editor's back links and start-over now lead to `/configurator/room` with the
design's room. **Recorded separately, once it landed:** `pnpm ci:local` and the pre-push rerun both
passed in full — format, lint, typecheck, test, e2e, build, boundary, lockfile and SCA all PASS; e2e
**191 passed, 2 skipped** (5.4 minutes), unit/integration **4,196, 282, 3,059 and 2,704** tests
across their suites, all passing. `41181d8..8434e76` is pushed to `origin/m7-room-and-presets`,
local and origin both at `8434e76`. **One unexplained transient, on the record rather than
softened:** the first `pnpm ci:local` run for this wave reported `LOCAL CI FAILED: e2e`, and did not
reproduce — an e2e run alone immediately after was 191 passed / 2 skipped / 0 failed, and a full
`ci:local` re-run and the pre-push rerun were both green, three consecutive green runs against the
identical commit. The cause is unknown and was not diagnosed, because the first run was piped
through `tail -60`, which discarded the e2e output before it reached the log; port 4320 was
confirmed free before the re-run. Not called a flaky test or resolved on retry — see the 7E2
close-out in `milestones/done/M7-room-and-presets.md` for the full statement.
**Updated again 2026-09-14: waves 7F1 and 7F1-D45 are both DONE — 7F1 at `5d2ff54`** (five slices,
with the visual gate's D1–D3 fixed at `852df10`) **and 7F1-D45 at `8437c95`** (review fold `6682d8e`),
**which is where 7F1's D4 and D5 are closed. 7F1 closes on what it actually verified and names D4/D5
as 7F1-D45's — two waves, two records.** Step 1's room screen now writes the URL through a debounced
`router.replace`, derives its live sub-state from `useSearchParams()`, and flushes a pending write
before *Continuă* or *Înapoi* leaves. Verification on 7F1-D45: **203 test files, 3,034 tests, 0
failed**; typecheck, lint and whole-tree `format:check` green; a production-build measurement gate
whose five checks all passed (caret, `history.length`, the D4 repro, the departure flush, neither
button dead); adversarial QA with **19 deliberate breaks, 18 of which reddened a test**; one combined
logic + clean-code review with no blocker; and a closing **390 × 844 visual gate in both locales with
zero defects filed**, which also re-confirmed D4 and D5 closed in a production build. **`pnpm
ci:local` PASSED** — the script's own verdict line, `LOCAL CI PASSED — all gates green, safe to
push`, with **193 e2e tests in 5.7 minutes**, the new traversal spec among them. Those e2e tests ran
against `next dev`, not a production build — `playwright.config.ts:15` gates the production server on
`process.env.CI`, which `scripts/local-ci.sh` does not set. **CI is the only run that satisfies
criterion 23.** ~~**7F4 is next.**~~
**Updated 2026-09-15: 7F4 is two waves, and 7F4a is DONE** at `bf6901b` + `37f1ecb` + `6113176` +
`52504d1`, on `m7-room-and-presets` at HEAD `1afd65c`. **The generation algorithm has its first
production caller:** a tap on *Continuă* at 1B dynamically imports `@lemnaria/three-adapter`, borrows
a transient kit through a lease, runs `generateKitchen` once synchronously and draws frame 1F's five
rows. **1F is a dead end by design** until 7F4b hands off to the editor — the primary control stays
disabled reading *Se compune…* after the rows settle, and that is expected rather than broken.
Verified: web **210 files / 3,173 tests**, `three-adapter` **78 / 3,071**; typecheck, lint and
whole-tree `format:check` green; **adversarial QA, 45 tests, 19 deliberate breaks, 18 of which
reddened a test**; one combined logic + clean-code review, no blocker, three findings folded; a
**production-build visual gate at 390 × 844 in both locales** — criterion 14 across 16 elements,
criterion 15 across five layout states, no `line-through` on a *nu poate fi inclus* row, five
*Înapoi* round trips with the draft intact, `history.length` never moving, and **tap-to-rows medians
of 24–26 ms** (n = 10 each). ~~**`pnpm ci:local` has NOT been run for this wave and nothing is pushed —
both are pending, and neither is to be written as passed.**~~ **Corrected 2026-09-17: `pnpm ci:local`
was never run for this wave specifically, but the push half was stale — these commits had reached
origin by an earlier push this file did not record; see *What to do next* for the `b80ab97` discovery.**
**7F4b is next**, and it inherits the
seam this wave armed: a departure armed by the primary tap resolving after the customer has left 1F.
The four defects, the three findings that must survive and the stated limits are in the 7F4a
close-out in `milestones/done/M7-room-and-presets.md`; the M7 row below carries the short form.
**Updated again 2026-09-15: wave 7D3 is DONE — S1 at `03c98dc`, S2 at `97a4913`.** Generation composes
**a block of one to three full-height columns at wall A's free end — one `tall-oven-tower` innermost, up
to two `tall-pantry` outboard** — and the hob's base follows it (`base-hob-2drawer` with a tower,
`base-hob-oven` without). No catalogue row and no price-book row was added. **Two of the wave's own
acceptance criteria were found wrong at close-out and are struck in place in the milestone — criteria 8
and 9** — both describing the pre-E12 order with the tower outermost; **ADR 0110 Amendment E governs and
the code follows it**, so the criteria were stale and the code was not. **A relayed correction was itself
wrong once on the way to the record** (`runEnd − 950` for what is `runEnd − 1000`), so the corrected
figure was re-derived from an asserted test literal rather than transcribed. **The defect the wave exists
to prevent is invisible to production:** `generate-kitchen.ts:444` compares the placed body's width
against the planned width, which a centred fixed-width tower passes, so
`qa-7d3-tall-end-block.adversarial.test.ts:371` is **a load-bearing assertion and not redundant with
production code**. **E12.2's order is held by `tall-end-block.test.ts:173-179` and
`qa-7d3-tall-end-block.adversarial.test.ts:338-344` — not by `tall-end-composition.test.ts:239`**,
which was cited for it, derives both sides from `plan.bases` and would pass an inversion; corrected
before the close-out was written, with the full analysis in wave 7D4's punch list. **`pnpm ci:local` and the push are not claimed for
this wave either** — the pending state recorded for 7F4a above is unchanged. The full close-out, the
seven findings and the ADR 0118 obligation (commissioned, unwritten, not to be built) are in
`milestones/done/M7-room-and-presets.md`.
**Updated 2026-09-16: wave 7H is DONE across eleven commits, `7072930` … `a70efc1`** — the hashes are
the coordinator's and **were not verified by this pass, which had no shell**; `7b1f92c` is
corroborated inside the milestone file and the other ten are reported. **The 3D shell was
`4.2 × 3.4 m` for every customer** whatever room they entered; it now follows the design's room —
floor, both wall planes, backsplash and every seat — with tile repeats **re-derived to hold world
density constant**, a standing stage updated **in place** with nothing disposed, and three camera
presets derived from the **kitchen's height** and the field of view with **no room term**, which is
why they survive a 3900 mm ceiling. **Four deferrals are recorded with their triggers in ADR 0118's
shape and none is built for:** Q7H-7 (a preset showing part of a long wall is correct behaviour),
Q7H-8 (a marked body framed off screen at mobile is accepted), backlog 67 (tapping the warning moves
the camera — *"great to have"*, unscheduled; **relayed as backlog 66 and renumbered — 66 is the
tall-body gap, cited by number in ADR 0110 and ADR 0117**), and the near-black premise behind
**`MAX_ABSENT_CASING_PIXELS = 50`, not 15**, whose slack is earned by `MIN_CASING_PIXELS` 300 against
a control of 14, **~21× separation**. **The wave's real output is eight structural findings**, three
of which carry obligations: a canvas constant is now **a function of (room, rail state)**; the **95
shell tests all built a fresh shell**, so a defect on the **second** resize — the customer path —
passed 95/95, closed by new tests with **no `src/` change**; and **a property whose generator cannot
reach its own case is not testing it**, M7's second instance of that class. **The wall maxima are
unblocked** — **ADR 0120's Q-B is answered** and the ruled 6000 mm per wall is a policy-literal edit,
**not made here**. ~~**`pnpm ci:local` and the push are not claimed for 7H either**~~ — **corrected
2026-09-17: `pnpm ci:local` was never run for this wave specifically, but the push half was stale;
these commits had reached origin by an earlier unrecorded push, see *What to do next*.** The eleven
hashes and every test count in this paragraph are **reported, not verified**. Full close-out in
`milestones/done/M7-room-and-presets.md`.
**Updated again 2026-09-16: wave 7D4 is DONE across eight commits, `00152b8` … `6456a3b`** — the
hashes are the coordinator's and **were not verified by this pass, which had no shell**; two of the
eight are corroborated from inside the tree (`9daf757` by `tests/support/composed-run-baseline.ts`,
`9258fa3` as ADR 0121's measurement commit). **What shipped is one sentence:** the **preparation**
cabinet and **the first storage slot after the hob in the reading order** take `base-3drawer`, and
**every other storage slot takes `base-cabinet`** — a slot reached **by what composed it** and never
by its role or its width, both of which look as though they can answer and are wrong on 32.8 % and
14.9 % of placed rooms respectively **against output that is correct**. Measured over **211 551
placed rooms: `nonBuildIdDiff: 0`** — no position, width, remainder, drop decision or cut moved
anywhere — with **261 162 body changes, all `base-cabinet → base-3drawer`**, 200 751 on preparation
and 60 411 on composed slots, **zero on a block column and zero on the hob**; the post-hob slot
stands on wall A in **53 751 rooms (25.41 %)** and wall B in **6 660 (3.148 %)**, `wrongEnd: 0`
*(the coordinator's figures, reproduced independently by the logic reviewer, **not re-run by this
pass**; the wall split is corroborated in the milestone at D15.7)*. **Do not read this as a clean
wave.** It was **re-planned mid-flight when the owner replaced its central ruling** — *"is not like
one with drawers one with door… is not like in chess"* — so the storage **cycle** it was built
around ceased to exist before a line of it shipped. **Five defects were then found in the plan
itself, every one the coordinator's own:** criterion 6's enumeration missed `{base-3drawer}`
(**394 of 3 547 rooms, 11.1 %**); criterion 15 demanded a parity sample containing `base-panbank`,
which criterion 6 forbids and generation places nowhere — **unsatisfiable by correct output**;
criterion 13's must-not **contradicted criteria 1, 6, 7 and its own preamble**, the plan saying three
times to make the post-hob slot a drawer and once not to touch the assertion that denies it;
`generation-priorities.ts` cited **"ADR 0110 G12"**, a section that does not exist in that ADR; and
risk 21 named re-measuring a figure but not **re-capturing the baseline artefact** that
re-measurement invalidates. **And three in the wave's own tests, which matter more than the code:**
the parity suite **passed 15/15 with the wave's central rule deleted outright** (it selected storage
bodies by build id, and the preparation module now carries the drawer's id — the same sabotage now
gives **4 failed / 12 passed**); **two QA guards passed under the sabotage they existed to catch**,
because each asked whether an id equalled the constant the sabotage moves — **found by QA in its own
work**; and **one NUL byte made a test file binary to git**, so a **229-line diff (93 insertions,
136 deletions) was reviewed by nobody** and the repo-wide convention greps used as gates **stepped
over it and reported success**. All three are one family, now **ADR 0121**. **What is NOT proved is
on the record too**, from S4's F6: criterion 13's four non-oven clauses have no assertion; criterion
12 ships as *"exactly two required roles"* rather than the byte-identity it words, with no sabotage
against `approved-room-policy.ts`; criterion 2's wall-cut clause rides on the digest; criterion 21's
refused-upper clause had no mutation aimed at it; and criterion 15's two-front arm is unreachable
until 7D5. **Four obligations carry forward, and two of them have no owner, which is recorded rather
than papered over:** the false comment reason at `run-end-panel.ts:94-98` under ADR 0120 Amendment
D's run reading, and the widened clause in `qa-7d3-tall-end-block.adversarial.test.ts` whose pointer
to `drawer-rows.test.ts` ADR 0091 Amendment A requires and which is **not there** — **both owed by
7D5's first slice**; and **unowned**, `chooseWallCut` keyed on wall identity rather than width
(ADR 0120 C2) and the *"Perete A"* field copy, which Amendment D makes **more** load-bearing.
~~**`pnpm ci:local` and the push are not claimed for 7D4 either** — the pending state recorded for
7F4a, 7D3 and 7H above is unchanged.~~ **Corrected 2026-09-17: `pnpm ci:local` was never run for this
wave specifically, but the push half was stale for all four — see *What to do next* for the `b80ab97`
discovery.** Full close-out in `milestones/done/M7-room-and-presets.md`.
~~Currently in progress: M6~~, ~~now on branch
`wave/6r-control-shapes-and-strip-row`~~ ~~**now on branch `wave/6t-finish`**~~ **back on `main` at
`bdef351` — every M6 wave branch is merged**. ~~**Five M6 waves
remain: 6T, 6T2, 6W, 6V, 6X**~~ ~~**Corrected later the same day: six remain — 6T, 6T-a, 6T2, 6W, 6V,
6X.**~~ ~~**Corrected 2026-09-07: three remain — 6T2, 6V, 6X.**~~ **Corrected again 2026-09-07, at the
end of the day: none remain. All seven of the last M6 waves are merged to `main`** — 6T, 6T-a and 6W
at `857a29e`; **6T2** at `825ba43`; **6X and 6X-a** at `9f5a4f6`; **6V** at `c7c9743`; with two fixes
after, `88f06ba` (6V's two false criterion sentences) and `bdef351` (6X-a's unmeetable criterion).
**No open wave is not the same as a closed milestone**: what M6 still owes before it can be called
closed is listed in the M6 row below and under *What to do next*. **M6B — Internationalization is
now in progress on `m6b-internationalization`. Gate O1 closed on 2026-09-07 with the owner's 13-line
Romanian edit set (12 changed values and one whitespace-only line); the owner directed the corrected catalogue to be translated next and the
remaining milestone waves to follow. Russian is an unapproved agent draft until Gate O2.** **M6B
wave 6B-a is complete at `924d3c6` (implementation checkpoint `06da284`); its cross-wave i18n
gates and server/client `webglUnavailable` witness are green. 6B-b is complete at `d4f39f7`
(routing core `cf16427`; review repairs `d4cedb2`). 6B-c is complete at `1c8ad46` (typed-key repair
`a7c796a`; Playwright fixture `1a7dd97`). 6B-d is complete at `1fbd780`; ~~6B-e is next.~~**
**Corrected 2026-09-10: both are done. 6B-e is complete at `8fff684` and 6B-f at `2301e4f`** — the
last body copy has left `packages/configurator-domain`, which now publishes a `BodyLabel`
descriptor, and **`apps/web/src/content/ro.ts` is deleted**. ~~**6B-f2 is next.**~~ **Corrected again
2026-09-10, later the same day: 6B-f2 is complete at `edf2fc0` (owner-ruled copy trim `ff8114c`) and
6B-g at `cb66896`. 6B-h1's 26-file scope has collapsed to one line in one test file and is folded
into 6B-h2, struck in place in the milestone; ~~6B-h2 is next.~~** **Corrected once more 2026-09-10:
6B-h2 — the test sweep — is complete at `9863f33`, and ~~6B-i is next~~.**
**FINAL CORRECTION 2026-09-10, and it is the one to read: `6B-i` is complete at `87429ca` and
`6B-j` at `aff9a2c` — both on branch `m6b-internationalization`, and whether that branch has
reached `main` is not recorded here, because nothing this pass read says so — so *every M6B wave
has shipped and M6B's build scope is complete*. The
milestone is now blocked on **Gate O2 — the owner reads the Russian — which is the owner's and which
no agent may pass.** What the owner has to do is one thing, and it is the first bullet under *What is
open right now*.**
**AND ONE MORE, 2026-09-11 — the owner reviewed the built product, and it changes three things in
this file.** Six rulings came out of that review and are
[ADR 0107](decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md):
a **language dropdown** built for N locales because English is coming; **appliances are drawn, not
sold** (the breakdown was charging 12 000 for a free-standing fridge under a disclaimer that excludes
appliances); **no greyed offers** (ADR 0032 superseded); the colour **reset leaves the carousel**; a
**thinner selection highlight**; and **one figure treatment**, prefix regular and only the amount
bold. What changes here: **(1) ADR 0105's e2e split has shipped** at `b60f298`, so the second bullet
under *What is open right now* is spent and **after Gate O2 nothing remains but the push** — which
needs the owner's word, because the rebase rewrote this branch's history. **(2) The review round that
followed the rulings is the QA/review/visual round 6B-i and 6B-j never had**, so the coverage gap
recorded below is closed. **(3) Five rows of the Gate O2 review aid are stale**, one of them the F4
key itself; the corrections are in the first bullet under *What is open right now* and tabled in the
milestone. Romanian literals in
`apps/web/tests` went **104 → ~~34~~ 33** outside the copy lock, ~~**33 → 10** files~~ **33 → 8
files** on a re-scan that counts regex literals, 26 converted; `src` is
untouched and the golden manifest holds **303** hashes, unmoved. **The plan's *"96
`expect(x).toBe(ro.k)` tautologies"* was wrong in kind rather than in degree** — 97 assertions of
that shape exist and **none is unfalsifiable** — and acting on it would have deleted 97 working
assertions; see the M6B row below.
**AND ONE MORE, 2026-09-11 — Gate O2 closed.** The owner approved all 235 leaves of `ru.json` as
drafted; F6 (the decor names) is a standing re-open condition and F4 (`configure.localeMenu`) stands
as shipped. See the banner at the top of this file. A seventh owner ruling, ADR 0107 Decision 7,
settled the oven-tower-label question with no code change. e2e ran to completion for the first time
on this branch: **189 passed, 2 failed, 2 skipped, 5.5 minutes**; both failures were this milestone's
own rulings meeting stale gates, fixed and re-verified at `cec60b7`. **Only the force-push remains,
and the owner has explicitly authorised it.**
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

**M6B sequencing correction, 2026-09-07.** The long M6B table entry below preserves the planning
history, but its statements that Gate O1 is running and code waits for M6's formal close are
superseded. Gate O1 is closed with the owner's 13-line edit set in `messages/ro.json` (12 semantic
value changes and one whitespace-only line). Translation of
that corrected catalogue runs first; 6B-a through 6B-h and the rest of 6B-i follow; ~~Gate O2 then
stops the phase before 6B-j and close-out~~. See ADR 0095 Amendment A and the milestone's *Owner
sequencing correction*.

**Sequencing deviation, recorded 2026-09-10 rather than smoothed over: 6B-j shipped before Gate O2,
not after it.** The sentence struck above, the wave table's row order and the milestone's own *Risks*
(*"Nothing is schedulable through O2"*) all place the gate ahead of 6B-j; the wave landed at
`aff9a2c` with the gate still open. The wave table's own **Depends on** column asks only for 6B-i,
which was met, and 6B-j changes no wording — so the deviation is against the ordering prose rather
than against a dependency.

**The authority is the owner's**, 2026-09-10: *"do everything that you can to finish the milestone
scope then i will check"*, and *"focus on developing more, then I will focus on testing"*. Building
6B-j ahead of O2 is that instruction carried out. **The engineering argument is the coordinator's
own and it is why the direction was safe, not the permission for it**: Gate O2 reviews Russian
*wording* and 6B-j contains none — three lint rules, a package-boundary test, a prose sweep and a
written convention, none of which depends on whether the Russian is approved. **Said plainly rather
than defensively:** the plan's sentence is stronger than *"nothing wording-dependent"*, and on its
letter this departed from it. **Gate O2 itself remains unpassed and untouched — no agent has ruled on
any Russian string and the milestone is still blocked on it.** A wave that ran early by direction is
not a gate that was bypassed, and this record must not read as the second.

What it costs is bounded and worth stating: 6B-j's acceptance criterion asks
for `pnpm lint` and `pnpm ci:local` green *"on the tree as it stands after 6B-i"*, and it is — but if
Gate O2 returns Romanian edits, the allow-list and the convention were paid against a tree that then
moves.

**A second, related gap, and it is a coverage gap by the same direction rather than an oversight:
6B-i and 6B-j shipped verified but not reviewed.** ~~It is open.~~ **Closed 2026-09-11, and left
standing rather than deleted because it was real for a day:** the owner's review round of
2026-09-10/11 ran adversarial QA, logic review, clean-code review and a visual pass over the built
product, and that round **is** the coverage these two waves were owed — it is what found the language
menu's Tab guard closing on `keydown`, `endonymOf`/`flagOf` failing open under `next dev`, and the
camera resetting on a language switch. The `/ru` visual pass named below as missing has happened; the
one thing still pinned by tests alone is that a shared `/d/{id}` link survives a language change.
From 6B-i onward the automatic gates were run —
typecheck, lint, whole-tree `format:check`, the full suite — and the **QA, review and visual agent
rounds were dropped**, on the owner's *"focus on developing more, then I will focus on testing"*. The
owner intends to test them. **What that leaves specifically unverified is worth naming, because it is
the first thing a person should try: the language switcher's click-through in a browser** — that it
changes language, keeps the design being edited, and survives a shared `/d/{id}` link. All three are
pinned by tests; none has been watched happen. There is **no `/ru` visual pass** for 6B-i.

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
| M6B — Internationalization (Romanian is the source, other locales are translations) | ~~**BLOCKED ON GATE O2, 2026-09-10 — every wave has shipped, the build scope is complete, and the milestone is waiting on the owner's Russian review. No agent may pass that gate.**~~ **GATE O2 CLOSED, 2026-09-11 — the owner approved all 235 leaves of `ru.json` as drafted** (*"russian I checked looks ok, if in future I will found something to fix I will do this."*); F6 (the eight translated decor names) is a standing re-open condition rather than a closed item, and F4 (`configure.localeMenu`) stands as shipped; **only the push remains, and the owner has explicitly authorised it. Read the first bullet under *What is open right now*.** **The owner reviewed the built product on 2026-09-10/11 and gave six rulings — [ADR 0107](decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md), with three of them recorded at the records they change ([ADR 0032](decisions/0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md)'s *Superseded*, ADR 0099 Amendment D, ADR 0104 Amendment A).** The round that followed found **ten items, all ten described** in the milestone's *The owner's review of the built product*, and **three were the coordinator's own**: the figure ruling reached **two of four** surfaces under a commit titled *"both surfaces"*, the desktop prefix rendered larger than the price, and **the test written to catch that drift used `RegExp.exec` — first match only — so a media-query override was invisible to it**. Two guards failed open and both were found by **mutation rather than by reading**: Tab closing the language menu on `keydown` instead of `focusout` left **510** tests green, and deleting `buildableWidthSpanMm` left all **2,445** web tests green while two informative sentences silently degraded — the second found **independently** by QA and by the logic reviewer. `endonymOf`/`flagOf` **failed open in `next dev`** — correct under `tsc` (`TS2741`), but the dev server erases types, so both returned `undefined` and drew a menu row with a right href, no flag and no label, which is verbatim what `locale-flags.tsx`'s own comment says it exists to prevent. Switching language **reset the camera**, because `presetId` was `useState` under `app/[locale]/…` and the segment change remounts the subtree; it has its own store now, deliberately not design state. **One reported defect was not one**: the language trigger measures 46 × 25, but that is the painted box and `getBoundingClientRect` never includes a pseudo-element — the 44 px hit area was already there and already asserted. Two more of the ten are documentation contradicting code: a warning repeated in **three** files claimed a zero-amount rule would mark the **melamine** row *nu este inclus* — it cannot, that row reaches `describeRowAmount` — while the real exposure, a zero-priced **manufacturer cabinet**, was found by mutation and is held by one case (`price-breakdown.adversarial.test.ts:447`) and by no row the shipped kitchen contains; and `ci.yml`'s `workers` paragraph still argued against parallelism *"one shared Neon database"* directly under the matrix that now runs two legs against it — **verified safe twice, independently** (no DDL, no global row count, cleanup by self-minted id), and the file now says so. **Process, recorded rather than smoothed:** the coordinator broke the tree-freeze rule twice in one hour, and the lesson — a visual verifier owns the tree exclusively, and a reviewer judges against `git show HEAD:` — is written into `best-practices/browser-and-visual-qa.md`. Verification at hand-off: HEAD `4f3c808`, tree clean, **9,565 tests green** (the coordinator's figure, not re-run by the documentation pass). **~~In progress~~ — Gate O1 closed; 6B-a DONE 2026-09-08 at `924d3c6` (implementation checkpoint `06da284`); 6B-b DONE 2026-09-09 at `d4f39f7` (routing core `cf16427`; review repairs `d4cedb2`); 6B-c DONE 2026-09-09 at `1c8ad46` (typed-key repair `a7c796a`; Playwright fixture `1a7dd97`); 6B-d DONE 2026-09-09 at `1fbd780`; ~~6B-e is next.~~** **Corrected 2026-09-10: 6B-e DONE at `8fff684` and 6B-f DONE at `2301e4f`; 6B-f2 is next — see the end of this cell.** next-intl 4.14.2 and parser 3.5.17 passed the compatibility gate behind a typed request/routing seam; a `webglUnavailable` namespace renders through both server and client paths. The copy-lock, catalogue-parity and golden-output gates are in place. The golden corpus has **282 fixtures: 95 static, 49 functions/17 families, 40 rejection/34 codes/37 keys, 98 catalogue/16 entries.** QA Q1.1 (P1) fixed the generated declaration false positive; post-fix logic (**3/3**) and clean-code (**P1**) re-review resolved their findings, and security review passed. Final `pnpm ci:local` evidence is recorded in 6B-a's milestone section: all gates green, including domain 3316, web 1702 passed/4 skipped, E2E 111 passed/1 skipped (112 total), Next build 6/6 static pages, and boundary/lockfile/SCA PASS. The initial sandboxed attempt was blocked only by bind `EPERM` and audit DNS; the unrestricted full run passed. 6B-b local evidence closed at **58 focused unit tests across 7 files**, coordinator production-mode Playwright **7/7** plus exact production nonce **1/1**, and green web typecheck/build/lint/pre-commit; independent QA before fixes recorded **55 passed** and browser **7/7**, and final logic, clean-code and security reviews were **PASS**. Its fixes removed private redirect overrides, added shared-design identity and strict case-variant CSP-404 regressions, corrected the SSG nonce environment assertion, clarified scene-shot development/production behavior, and cleaned up the WebGL helper, React element guard and route comments. No 6B-b CI or push evidence is claimed. 6B-c resolves all **94 static leaves** from the active locale. 6B-d moves `configure.step` and all **17 interpolated families** to typed ICU resolution through the active locale, deletes the legacy `content/ro` module, applies the owner-ruled Romanian CLDR zero form, and adds a shared ICU-AST authored-literal guard. Its initial QA and review findings were all repaired; final QA recorded web **1,760 passed / 4 skipped**, and final logic and quality review passed. Final unrestricted `pnpm ci:local` passed with domain **3,316**, persistence **122 passed / 86 skipped**, adapter **2,853**, web **1,760 passed / 4 skipped**, E2E **117 passed / 1 skipped**, Next build **9/9**, and format/lint/typecheck/boundary/lockfile/production SCA PASS. The approved Romanian and drafted Russian catalogues, generated declaration, copy lock and **282** golden hashes remained unchanged. Russian remains an unapproved agent draft until Gate O2. **6B-e DONE 2026-09-10 at `8fff684`**, replayed onto `main` with 6B-a…6B-d: the **35** refusal codes across 38 catalogue keys, with `resolveRejection` resolving the descriptor. **6B-f DONE 2026-09-10 at `2301e4f`** — the label descriptor. `packages/configurator-domain` publishes a `BodyLabel` (an `entry` arm carrying a catalogue entry id, a `bodyKind` arm, a `withDoors` wrapper — **16 entry arms, 13 kind arms**) and `resolveBodyLabel` / `resolveBandLabel` in `apps/web/src/i18n/content.ts` resolve it against `messages/ro.json` and `ru.json`; **`apps/web/src/content/ro.ts` is deleted**, the pre-Gate-O1 module that had diverged from the catalogue in **32 leaves** (*corp* against the owner-ruled *dulap*). **31 of the 300 golden hashes moved**, every one a rendered word rather than a key restructuring: the copy lock and both message files are byte-untouched, so each moved hash is the owner's Gate O1 ruling at `3564c7c` reaching the screen for the first time — the wave's *"no hash moves"* criterion was false and is struck in the milestone file. Verified at the commit: **9,323 tests green** (domain **3,752**, persistence **282**, three-adapter **3,031**, web **2,258**), with lint, typecheck and whole-tree `format:check` clean. The **282** golden figure above is 6B-a's corpus count and is superseded: the manifest holds **300** hashes as of `2301e4f`, read directly from `apps/web/tests/i18n/golden-output-hashes.ts`. **What the wave found is the reusable part and it is recorded in the milestone file, not here**: four gates were reporting success while measuring nothing, three of them behind comments asserting a protection that did not exist, and none was found by running tests. Russian remains an unapproved agent draft until Gate O2. **6B-f2 DONE 2026-09-10 at `edf2fc0`, with the owner-ruled copy trim at `ff8114c`** — the price book's prose and the palette's names. `TierIdentity` and `AccessoryRule` gained optional `nameKey`/`descriptionKey`; `name`/`description` **stay required and stay the fallback**, so a dashboard-authored row still renders. **14 keys, not the planned 16: 6 name and 8 description** — *Hettich* and *Blum* carry **no `nameKey`**, because they are brand names and [ADR 0106](decisions/0106-the-price-books-display-prose-publishes-descriptors-and-the-book-keeps-the-tier.md) decision 1's *"the key wins when present"* makes authoring no key the correct way to say a name must not be translated. The palette's **8** Gate O1 `finish.*` leaves, authored long ago and read by nothing, are now wired through `content.finishName` and **`PaletteEntry.name` is deleted**; there is no palette `nameKey`, because it would have been `finish.${entryId}` verbatim for all eight — a second identifier for one fact — and decision 2's fallback does not transfer to a closed union no dashboard authors. A **third** Romanian surface the plan did not name was found and fixed: `panel/panel-model.ts`'s per-cabinet finish chips. **What its QA caught is 6B-f's failure one layer up**: the wave's own tests swept the resolvers in isolation and never touched a surface, so reverting the three call sites put Romanian back on the `/ru` settings sheet, on ADR 0104's pill and in the breakdown **while all 2,275 web tests stayed green**; the replacement reads described surfaces under a Russian translator with expectations taken from `ru.json` rather than through the resolver. `ff8114c` trimmed three leaves that stated an amount or an earning rule in prose; **ADR 0106 Amendment A** carries the ruling, the three leaves and the enforcement gate it assigns to 6B-j — read it there. **6B-g DONE 2026-09-10 at `cb66896`** — the money seam, and **its title is misleading**: *"MDL stops being a literal suffix"* does not mean *use `Intl`*. Measured on this runtime, `Intl.NumberFormat("ro")` renders 143000 as `"143.000"`, `"ro-MD"` renders the currency as `"L"`, and `"ru"` groups with U+00A0 — all three contradict the shipped figure and the mockups. Only the **join** moved: `` `${amount} ${PRICE_BOOK_CURRENCY}` `` became `price.amountWithCurrency` = *"{amount} MDL"*, and the ASCII separator stays a product constant. The wave reports **300 golden hashes became 303 — added, none moved**, and the `ro` binding renamed at **18** sites (the plan said 17), deliberately skipping `tests/support/romanian-content.e2e.ts`, whose `ro` is Romanian-only by construction and therefore already truthful. **The hole reviewers found:** `RULED_CURRENCY_CODE` re-spells `"MDL"` rather than importing it — sound for the *negative* sweep, where a book-derived regex would chase a changed value and let a stale module literal through, but it had been over-generalised into skipping the *positive* check, so setting `PRICE_BOOK_CURRENCY` to `"EUR"` compiled, left every test green and rendered `43 000 MDL` for a EUR book. Both spellings now stand with the asymmetry written up, so a later reader does not make them consistent and restore the bug. **Three more gates claimed more than they held**, continuing 6B-f's theme: a fourth copy of the catalogue tree-walk had diverged from the two it came from (returning `[]` where they `throw`, so *"exactly one leaf carries the currency"* silently skipped array leaves); a guard named *"lets no module write the currency"* is line- and quote-scoped and misses a JSX text node and a CSS `content` declaration, so the **name** changed and the regex did not; and two files covered one seam with duplicated fixtures. **A citation was wrong in three places and is corrected**: nothing rules which module the currency constant lives in — ADR 0062 mentions neither the word nor the code, and [ADR 0001](decisions/0001-initial-product-and-stack.md) decision 4 is what makes the currency MDL. **Verified on the committed tree: 6B-f2 at `edf2fc0` (and unchanged at `ff8114c`) 9,374 passing** — domain 3,770, persistence 282, three-adapter 3,031, web 2,291 — **and 6B-g at `cb66896` 9,397 passing** — domain 3,770, persistence 282, three-adapter 3,031, web 2,314; lint, typecheck and whole-tree `format:check` clean at both. **6B-f2 left `golden-output-hashes.ts` byte-identical** (SHA-256 `7e3a863…b92adc`, still 300), measured rather than assumed, because 6B-f's plan asserted the same thing and was wrong by 31; 6B-g then added three fixtures for the new leaf and moved none. **The visual pass ran on both locales at 1440x900 and 390x844**, and its load-bearing evidence is a **codepoint census, not a screenshot**: `101 000 MDL` reads `49,48,49,32,48,48,48,32,77,68,76`, so both spaces are U+0020 and never U+00A0 — which is exactly what an `Intl` leak would produce and what no picture can distinguish. The currency appears exactly twice per page, no `L`, no raw placeholder; 30 breakdown rows carry no currency by design and the included rows read *inclus* / *включено*. **Declared not verified: the overflow warning**, unreachable on the default kitchen, which has no free space to widen into. **6B-h1 is struck and folded into 6B-h2, 2026-09-10** — the plan's *"26 files carrying Romanian literals"* was measured before 6B-f2 and 6B-g existed, and those waves plus 6B-e and 6B-f swept it as a side effect of moving the copy. Measured today, excluding comments: `configurator-domain/src` **1** file (`pricing/sample-price-book.ts`, 10 lines), `configurator-domain/tests` **1** file (`tests/commands/minimum-width.test.ts`, 1 line), `three-adapter` src and tests **0**. The 10 in the price book are **not debt** — they are the `name`/`description` fallbacks ADR 0106 decision 2 deliberately keeps required, and removing them would break the ADR. So 6B-h1's residue is one line, folded into 6B-h2, whose own 48/126/96 web figures are re-measured before that wave starts for the same reason. Russian remains an unapproved agent draft until Gate O2. **6B-h2 DONE 2026-09-10 at `9863f33`** — the test sweep. Romanian literals in `apps/web/tests` went **104 → 34** outside the copy lock, across **33 → 10** files, with **26 converted**; `apps/web/src` is untouched and the golden manifest holds **303** hashes, **unmoved**. Verified at the commit: **9,395 tests green** — domain **3,770**, persistence **282**, three-adapter **3,031**, web **2,312** — with lint, typecheck and whole-tree `format:check` clean. **The finding that matters most is a plan claim that was wrong in kind, not in degree.** The plan sent this wave to purge **96 `expect(x).toBe(ro.k)` tautologies**; measured, there are **97 assertions of that shape and none of them unfalsifiable** — **0** genuinely unfalsifiable, **49** weak but real (they pin the key, not the wording) and **48** discriminating through a `not.`, a parameterised key or a state-driven key selection. Settled **by mutation rather than by reading**: `content.panel.done` → `.remove` turns a test red, and repointing `configure.overflowWarning` → `configure.loading` turns **seven tests across five files** red. **Acting on the plan's word would have deleted 97 working assertions.** It is struck in place at the milestone's *Re-planning against the rebased tree* item 8, and it is **the sixth false claim recorded against this milestone's plan — the only one where the number held and the characterisation did not**. **The test-side `ro` rename has zero scope**, checked rather than assumed: every test binding is built from `ro.json` with `locale: "ro"` hardcoded, so none can hold a non-Romanian catalogue and the name is true where it stands; 6B-g's argument does not carry over. **8 assertions deleted, 7 added, two `it` blocks removed**, and QA verified no coverage was lost by walking the chain that replaces each deleted pin — production value = resolver leaf (`content.test.ts`, both locales, **not** behind the lock) → resolver leaf = `ro.json` leaf (the golden divergence check) → `ro.json` = the approved corpus (the copy lock) — **breaking each link in turn to confirm it fires**. **The copy lock is now the sole independent gate on Romanian wording**, and that is load-bearing enough to state plainly: the golden manifest sits **behind** `expectApprovedRomanianCopy`, so a reworded leaf trips the lock and the manifest never runs — a deliberateness checkpoint *downstream of approval*, not a second detector. Probed: the lock catches a changed value, a whitespace-only edit, an added key and a removed key; it does **not** catch a reordering, **which is correct**, because nothing renders from key order. **A comment that was false before this wave touched it**: `aud-006` claimed its case pinned that the note the depth control ships is *this* leaf — it never did, since mutating the model's leaf leaves that case green and fails `cabinet-depth-control.test.ts` instead. Rewritten to lead with what the case does **not** claim and to name the three places ADR 0100 decision 5's copy/coefficient coupling actually lives. **Two entries struck from 6B-j's allow-list before that wave inherits them**: a positive substring claim justified as though it were a negative one, and a metrics fixture that is not copy at all. **And 6B-j inherits a named requirement that came from this wave's own error: its lint rule must scan regex literals.** One of the 17 retained literals is Romanian inside a regex — `hardware-tier-reconciliation.test.ts`'s `/incluse? în preț/i` — and it was missed because this wave's tree scan read only `"…"` and `` `…` ``, which is how the plan's stale *"26 files"* came to be "corrected" to an equally wrong **2**. Whether 6B-j's two probed selectors already reach a regex literal is **unmeasured**; that wave's punch list now carries it as item 6. **What remains unswept, measured per file rather than left as a count**: ~~34 literals across 10 files, 17 of them deliberate~~ **33 literal lines across 8 files — 21 of them inside three whole-file exemptions** (`price/price-breakdown-copy.test.ts` 15, `i18n/golden-output-fixtures.ts` 4, `support/ruled-price-copy.ts` 2) **and 12 per-line annotations** across four test files plus the `top-bar` e2e metrics fixture. The re-scan counts regex literals, which is the whole of the 34-versus-33 difference, and the implementer's *"17 deliberate"* counted annotated **sites** and no whole-file exemption at all — the two figures were never meant to reconcile. **So the acceptance criterion's deviation is smaller than a bare count suggests: 21 of the 33 are structurally exempt rather than unswept.** **6B-j's allow-list must therefore support both shapes** — file-level and line-level — or fifteen bare `eslint-disable` comments land in the copy test alone. **6B-i DONE 2026-09-10 at `87429ca`** — the second locale. `/ru` already rendered end to end; what was missing was **the way in**. The `RO` chip was a static `<span>` with a decorative caret — a control that looked like one and did nothing — and it is now a **link to the other locale at the current locale-free path**. A link rather than a popover for three reasons, all recorded in the wave's section: the mockups draw the chip **closed in every frame** and never open one, so a menu would be chrome the reference does not declare; with two locales the entire choice is *"the other one"*; and a locale here **is** a URL, so an anchor gets focus, keyboard and no-JS activation without inventing any of the three. `use-locale-switch.ts` **throws rather than first-matching** when there is no single other locale, and a test pins `routing.locales` at two, so a third locale reopens the menu question loudly instead of silently picking one. One new leaf, `configure.localeSwitch`, in both catalogues and copy-locked. **The pseudo-locale is a transform over a real catalogue, not a third locale**: ~40% padding with accented look-alikes, deciding what is text by **ICU brace-depth parity** so an argument spec is never mangled; never in `routing.locales`, off in production with no opt-in, and **consumed** — by the price-bar and overflow-warning layout tests and by its own suite over all **235** leaves, which is recorded because a pseudo-locale nothing runs is decoration. **The defect this wave found is the milestone's worst.** All **five** Russian plural leaves declared Romanian's `one`/`few`/`other`; Russian CLDR needs **`many`**, so **every Russian count of five or more fell through to `other` and read wrong**. What makes it worse than an oversight: **the parity gate was requiring it** — it compared branch lists between locales and demanded they match, so **correct Russian would have failed the gate**. That is a category beyond the four dead gates already recorded against this milestone: not a gate that measured nothing, but one that **enforced the defect and would have rejected the fix**. It now asserts each locale's own CLDR categories and compares bodies only for the categories the two languages share; ADR 0095 **Amendment D** records the narrowing. The repair is **purely additive**, so no reachable sentence moved. Manifest **303 → 304, one added, none moved**. Verified at the commit: **9,427 tests green** — domain **3,770**, persistence **282**, three-adapter **3,031**, web **2,344** — lint, typecheck and whole-tree `format:check` clean. **A plan figure that measured false, again**: the plan says *"219 leaves"*; `ro.json` held **234** before this wave and **235** after. **6B-j DONE 2026-09-10 at `aff9a2c`** — the re-drift gate: **three lint rules**, a package-boundary test **extending** `pricing-seams.test.ts`'s existing sweep rather than adding a second walker, ADR 0106 Amendment A's inherited prose sweep, and the written convention in `docs/best-practices/engineering-conventions.md`. **Every rule was proved by landing a violation and observing the red** — the rule / violation / message table is in the commit body — and that is recorded because a rule described but not falsified would have been this milestone's **eighth** instance of prose outrunning code. **Two of the rules exist because a scan was wrong, and both errors have the same shape**: a stale plan number corrected with an incomplete new one. **Regex literals** — a Romanian string lives inside `/incluse? în preț/i` and the scan read only quoted strings and template literals. **Cedillas** — Romanian ș and ț have **two encodings**, U+0219/U+021B with comma below and U+015F/U+0163, the *Turkish* cedillas, in legacy text; the character class held only the first, so **19 characters across five files were invisible and the reported "33 remaining literals" was really 54** (21 file-level + 33 site-level). **The allow-list carries two shapes**: **5 file-level** entries, one of them **narrowed by syntactic position** rather than exempted so ADR 0106 decision 2's required fallbacks stay legal while the rest of the price book is still swept, plus a **5-entry decorative-glyph table**; and **25 site-level** entries across **13** files, whose reasons are wave 6B-h's in-place annotations carried over rather than written fresh. **Reach is recorded honestly, because the next reader will assume a rule's name is its reach**: `regex.pattern` reads the pattern *source*, so a `ș` written as an escape or a `new RegExp(x)` is invisible; `JSXText` is **not** a `Literal`, so a diacritic in JSX text is caught only by the positional rule and therefore only under `apps/web/src`; the domain test's reach is that package's `src`, with its siblings covered by lint; and **a stale site-level entry fails `--max-warnings 0` as an unused disable while a stale file-level entry does not**. **One scope decision against the plan's letter**: tests are in scope for the diacritic rule though the punch list says *"the two `src` trees"* — wave 6B-h swept the tests, the whole allow-list lives in tests, and M6B's Scope names test strings, so a rule guarding only `src` would let literals drift back into the place just swept. Verified at the commit: **9,439 tests green** — domain **3,776**, persistence **282**, three-adapter **3,031**, web **2,350** — lint, typecheck and whole-tree `format:check` clean, with the manifest at **304** and untouched. ~~**So M6B's build scope is complete and the milestone is blocked on Gate O2, which is the owner's.**~~ **Corrected 2026-09-11: M6B's build scope is complete and Gate O2 is closed. A seventh owner ruling ([ADR 0107](decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) Decision 7) settled the oven-tower label as no contradiction, no code change. e2e ran to completion for the first time: 189 passed, 2 failed, 2 skipped, 5.5 minutes; both failures were this milestone's own rulings meeting stale gates, fixed and re-verified at `cec60b7`. Only the force-push remains, now explicitly authorised by the owner.** | Yes — `milestones/M6B-internationalization.md`, then ADR 0095 and ADR 0001 |
| M7 — Step 1, room and presets | **Done, closed 2026-09-29** (ADR 0131, ADR 0104 Amendment B; see the STATUS banner above). Built on branch `m7-room-and-presets`. Wave **7A DONE** at `8df0d49`; wave **7D1 DONE** at `f5b4cd9`; wave **7D1b DONE** in `f61c361` + `85091cc`, closed at `1e96104`; wave **7D2 DONE** at `4133cdc`, closed at `2126d52`; wave **7A2 DONE** at `f97d621`, closed at `6cde5ef`. 7A2 puts the owner-approved generated minimum kitchen into policy, returns `ROOM_TOO_SMALL_FOR_KITCHEN` only after valid fields, holds the exact ADR 0108 Amendment E boundaries, and keeps manual 560 mm sinks legal. Its implementation finding also fixes ADR 0110's odd-millimetre usable-end calculation for shell tiling and floor runs. **Owner follow-up questions F1–F7 are all answered** (ADR 0108 Amendments C–E, ADR 0109 Amendments C/D, ADR 0110 Amendments C/D plus its 2026-09-12 clarification and 2026-09-13 correction, ADR 0114 Amendments A/B/C, ADR 0115) — nothing in M7 is blocked on the owner. ~~**Next wave: 7E1.**~~ Coordinator's complete elevated `pnpm check`, final `pnpm ci:local` and the pre-push rerun passed: domain **4,196**, persistence **282**, three-adapter **3,059**, web **2,588**, Playwright **191 passed + 2 expected skipped (193 total)**, plus build, boundaries, lockfile and SCA; 7A2's visual column is No. Every M7 commit through `6cde5ef` is on origin. **Updated 2026-09-13: wave 7E1 DONE** at `57f1e94`, closed at `160983d` — the exact localized `/configurator/room` route, its URL-state boundary and the proxy allow-list; the final `pnpm ci:local` and pre-push rerun both passed, domain **4,196**, persistence **282**, three-adapter **3,059**, web **2,667**, Playwright **191 passed + 2 expected skipped**; every commit through `160983d` is on origin. **Updated 2026-09-14: wave 7E2 DONE** at `470e5c9`, closed at `8434e76` — `createDesignCreationAttempt` mints once per deliberate selection and awaits its `PUT` before navigation; the editor's back links and the load-error start-over now lead to `/configurator/room` with the design's room. QA's final focused suite passed **22 files, 381 tests, 0 failed**; format, lint, typecheck and `git diff --check` are clean. **Recorded separately, once it landed:** `pnpm ci:local` and the pre-push rerun both passed in full — format, lint, typecheck, test, e2e, build, boundary, lockfile and SCA all PASS; e2e **191 passed, 2 skipped** (5.4 minutes), unit/integration **4,196, 282, 3,059 and 2,704** tests across their suites, all passing. `41181d8..8434e76` is pushed to `origin/m7-room-and-presets`, local and origin both at `8434e76`. **One unexplained transient, on the record rather than softened:** the first `pnpm ci:local` run for this wave reported `LOCAL CI FAILED: e2e`, and did not reproduce — an e2e run alone immediately after was 191 passed / 2 skipped / 0 failed, and a full `ci:local` re-run and the pre-push rerun were both green, three consecutive green runs against the identical commit. The cause is unknown and was not diagnosed, because the first run was piped through `tail -60`, which discarded the e2e output before it reached the log; port 4320 was confirmed free before the re-run. Not called a flaky test or resolved on retry. ~~**Next wave: 7F1.**~~ **Updated 2026-09-14: waves 7F1 and 7F1-D45 are both DONE — 7F1 at `5d2ff54`, D1–D3 fixed at `852df10`; 7F1-D45 at `8437c95`, review fold `6682d8e`.** Step 1's room screen ships its 1A cards and 1B fields, corner toggle and live plan, and **7F1's two remaining visual-gate defects — D4 (Back loses a typed room) and D5 (a traversal renders 1A under a 1B URL) — are closed by 7F1-D45**, which replaced `history.replaceState` with a debounced `router.replace`, made the client derive the live sub-state from `useSearchParams()`, and flushes a pending write before *Continuă* or *Înapoi* leaves (ruling R9). **7F1 closes on what it actually verified; D4/D5's evidence is 7F1-D45's, and the two records are deliberately kept apart.** 7F1-D45 verification: **203 test files, 3,034 tests, 0 failed**; typecheck, lint and whole-tree `format:check` green; a production-build gate whose **five** checks all passed; adversarial QA with **19 deliberate breaks, 18 reddening a test**; one combined review, no blocker; a closing **390 × 844 visual gate in both locales, zero defects**, re-confirming D4 and D5 closed in production. **`pnpm ci:local` PASSED** — `LOCAL CI PASSED — all gates green, safe to push`, with **193 e2e tests in 5.7 minutes**, read from the log rather than from an exit code. **Those e2e tests ran against `next dev`, not a production build** — `playwright.config.ts:15` gates the production server on `process.env.CI`, which `scripts/local-ci.sh` never sets — so **criterion 23 is satisfied by CI alone**. The production-build evidence for D4 and D5 is slice A's five-check gate and the closing visual gate, both of which built and served the app. **Stated limits carried forward:** a browser Back **gesture** within `URL_SETTLE_MS` (400 ms) of a keystroke leaves that keystroke out of the entry — bounded by one constant, never on a reload, and **strictly better than 7F1's baseline, where that gesture lost the whole room**; `wallC` is covered by property only and by no visual evidence (U is M7B); the locale menu is still imported across routes, knowingly, until ruling R5's own wave. **One defect the closing gate found that belongs to another wave:** selecting the **U** chip while `wallC` is empty leaves the plan preview drawing the **L** plan — 7F1-shipped behaviour, not a regression (7F1-D45's source diff is three files and touches neither `plan-preview.tsx` nor `dimensions-form.tsx`), **recorded against 7F2** in the milestone rather than in `docs/backlog/open.md`, which is for items with no owner and no phase. ~~**Next wave: 7F4.**~~ **Updated 2026-09-15: 7F4 was split into 7F4a and 7F4b (Q7F4-2), and wave 7F4a is DONE** at `bf6901b` + `37f1ecb` + `6113176` + `52504d1`, with HEAD at `1afd65c`. **This is the wave in which the generation algorithm got its first production caller** — foreseen by ADR 0110 decision 6, not discovered here. A tap on *Continuă* at 1B dynamically imports `@lemnaria/three-adapter`, borrows a transient kit through `createBodyProbeLease`, runs `generateKitchen` **once synchronously** and draws frame 1F's five rows; composition is a client sub-state over the same URL, with no query key, no path segment and no history entry (R13). **7F4b — the hand-off into the editor — is not in this wave, and 1F is a dead end by design**: the primary control stays disabled reading *Se compune…* after the rows settle. Verification actually performed: web **210 files / 3,173 tests** and `three-adapter` **78 files / 3,071 tests**; typecheck, lint and whole-tree `format:check` green; **adversarial QA with 45 tests and 19 deliberate breaks, 18 of which reddened a test** — the nineteenth is finding F2, the unguarded `.composeRow*` classes; **one combined logic + clean-code review, no blocker, three findings, all folded**; and a **production-build visual gate at 390 × 844 in both locales** — criterion 14 across **16 elements**, criterion 15 across **five layout states**, no `line-through` on a *nu poate fi inclus* row, **five *Înapoi* round trips with the draft intact**, `history.length` never moving, and **tap-to-rows medians of 24–26 ms (n = 10 each)**. **`pnpm ci:local` has NOT been run for this wave and nothing is pushed. Both are pending and must not be written as passed.** **Four defects found and fixed, and they are the record's substance:** (1) **a kit leaked whenever anything between `makeKit` and the lease threw** — the lease's `finally` covers `lease.use`'s body and not the factory — **measured `{ built: 1, disposed: 0 }`**, so a customer retrying stranded one kit per attempt for the page's lifetime; fixed with catch-release-rethrow at the allocating site rather than a second lease, because `body-probe.ts` declares itself the only `finally` in that seam, and with it the rule that **a `disposeKit` that fails must not discard a composition that succeeded**; (2) **a failed screen drew green *inclus* rows** — the second refusal arm returns over a log whose fridge is already placed, so the customer read *Compunerea nu s-a putut finaliza* above *Frigider — inclus* for a design that was discarded; the `failed` state now carries **no `rows` property at all**, making it a compile error rather than a forgotten branch; (3) **browser Back out of 1F did nothing**, because the entry behind 1F is the settle's `replace` of the same room query, now cleared by a `popstate` listener with nothing written to or read from the URL; (4) **a comment cited a test file that did not exist and nothing guarded the `.composeRow*` classes** — dropping one would have silently removed all of R10 with the suite green. **Three things that must survive:** the guard the coordinator specified **would have been vacuous** — Vitest processes no CSS, so a `.module.css` import fabricates a class name for any property and `styles.thisClassDoesNotExist` is a non-empty string; the implementer measured that and built the real guard (the token the row renders with, checked against `room.module.css` read by path), and **this is the fourth "green over something that never ran" in this milestone**. **Criterion 34's boundary list was mis-notated and the code was right** — one pair written `(wall B × wall A)` among neighbours written `(A × B)`, flattened out of ADR 0108 Amendment E's table whose middle row fixes wall B; `validateRoomInput` agreed with the screen on **all twelve rooms** the gate typed: **no code defect, no owner question**. **Criterion 38's measurement was taken after slice 3 rather than before its dispatch**, because the coordinator's correction arrived late — a number in a close-out rather than a gate; **the comfortable result is what made it harmless, not a justification**. **Owner rulings:** *așezat* → **inclus**, *nu încape* → **nu poate fi inclus**, and the dropped sentence must say the wall sizes did not leave enough space; the owner asked whether the algorithm could drop non-fitting cabinets by itself — **it already does, and has since 7D1** — and then ruled **the report stays**. **The Romanian is approved; the Russian is an agent translation and is not recorded as approved here** — [ADR 0113](decisions/0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md) decision 3 says otherwise for the *drafted* Step 1 copy, and the close-out records how the two reconcile and what overturning it would take. **Stated limits, not softened:** the 24–26 ms medians are **a laptop over localhost**, and the **399 kB** adapter chunk is paid on the customer's first tap at their own network speed — **the durable fact is the manifest one, that `three` is absent from the room route's first load**, not the millisecond number; **the list jumps up 18.1 px** when rows resolve as the notice band reflows (measured, repeatable, both locales, not filed); **opening composition drops focus to `<body>`** and nothing announces the run to a screen reader (recorded, not fixed); **a room the domain refuses still gives a silent dead tap**, and 1C's surface is **7F2's**; and **`ADR 0110 Amendment F` does not exist** — ADR 0110 carries Amendments A–E — while being cited by `generation-steps.tsx:232`, `room.module.css:723`, ADR 0117 and this milestone. **It is owed by wave 7D4's slice S0** (the dispatch brief said 7D3; the record and both code comments say 7D4) and stands as an **open obligation**. **7F4b is next**, and it inherits the seam this wave armed: **a departure armed by the primary tap resolves after the customer has left 1F**. **Updated 2026-09-15: wave 7D3 is DONE — S1 at `03c98dc`, S2 at `97a4913`** (dispatched out of the recommended order; **7F4b is still next**). Generation now composes **a block of one to three full-height columns at wall A's free end — one `tall-oven-tower` innermost, up to two `tall-pantry` outboard** — with the hob's base following it, an upper suppressed above any body whose declared top passes the wall row's floor (derived from the catalogue, not from a role list), and **no catalogue or price-book change**. **Two acceptance criteria were wrong and are struck in place, not deleted: criteria 8 and 9**, both written for the pre-E12 order with the tower outermost. **ADR 0110 Amendment E governs and the shipped code follows it** — criterion 8's tower centre is **`runEnd − 1000`**, not `runEnd − 300`, and wall A plans `[600, 600, 600, 600, 700]`; criterion 9's *"the block reduces by one column"* clause **contradicted criterion 22**, which was right, and is struck with its other two clauses kept. **Nothing reduces at two or three columns; at one leftover module the block is not reduced but not planned** — the measured shape is `1 → 0` and no other step down. **A relayed correction was itself wrong once on the way to this record** (`runEnd − 950`), so the figure was re-derived from the literal asserted at `tall-end-block.test.ts:225-231` rather than transcribed. **The findings are the substance:** the centred-tower defect is **invisible to production** (`generate-kitchen.ts:444` compares the placed width to the planned width, which a centred fixed-width tower passes), so `qa-7d3-tall-end-block.adversarial.test.ts:371` is **load-bearing and not redundant with production**, and E12.2's order is held by `tall-end-block.test.ts:173-179` and `qa-7d3-tall-end-block.adversarial.test.ts:338-344` — **not** by `tall-end-composition.test.ts:239`, which was cited for it, derives both sides from `plan.bases` and would pass an inversion (corrected before the close-out was written; the full analysis is in wave 7D4's punch list); the 800 mm merge boundary is aligned across `tall-end-rule.ts:149` and `merge-empty-columns.ts:278` **by equal strictness rather than a shared guard**, and a `>=` on either side would have centred the tower; **an over-broad relaxation of a correct assertion is a weakening even when the narrow relaxation was necessary**; **unreachable end-to-end is not unbindable**, and three clauses of the pure leaf are now bound by input literals per ADR 0093 decision 1; **a property's sample floor must come from the generator's observed behaviour, not from a uniform model** (`fc.integer` is boundary-biased — a floor of 20 taken from a 14.1 % uniform rate got 17 and shipped flaky); and **an arm-minimum guard is only as good as the diversity inside the arm** — a clause was deletable with the suite green *including* a property demanding ≥ 100 samples in that arm, because the discriminating sub-case is 234 rooms in 2.34 M. **`WORKFLOW.md`'s per-arm minimum was complied with exactly and proved nothing; an ADR amending it is commissioned and unwritten.** **One behaviour a later reader will misread as a regression:** **every block room loses wall A's run-end panel** — correct, owner-ruled 2026-09-01, implemented as `blocksSeat` at `run-end-panel.ts:76-98`, and it now affects roughly half of generated kitchens (a block stands in **110 591 of 211 551 placed rooms, 52.3 %**, per the milestone's re-measured G3.2). **One open obligation, recorded with its trigger and not built: ADR 0118** — `outermostColumnOf` returns **no block at all** when a merge is legal but the door column cannot be built that wide, unreachable today only because `tall-pantry`'s declared maximum and the empty-column ceiling are both 800 in two unrelated constants. **`pnpm ci:local` and the push are not claimed for 7D3 either.** **Updated 2026-09-16: wave 7H is DONE across eleven commits, `7072930`, `463abc1`, `3d9a243`, `b3d0c59`, `6ba2b51`, `729ca62`, `2a4428f`, `ab2ae17`, `b0ca1eb`, `7b1f92c`, `a70efc1`** (the hashes are the coordinator's and **this pass had no shell to verify them**; `7b1f92c` is corroborated inside the milestone file by wave 7D7's row and its source-verified *Ground truth* section, the other ten are reported). **The 3D shell was `4.2 × 3.4 m` for every customer** — the reference library's one room — **whatever room they entered**. The floor, both wall planes, the backsplash and every seat now derive from the design's room; the tile repeats **re-derive to hold world density constant** rather than stretching, because what must stay constant is the world size of one plank or one tile; a standing stage updates **in place** on a room change — same meshes, same geometries, same materials, nothing disposed; and the three camera presets derive from the room, with the distance taken from the **kitchen's height** and the field of view and **no room term at all** (`stage.ts:270-271`), which is why they survive a 3900 mm ceiling. **Four deferrals, each recorded with its trigger in ADR 0118's shape and none of them built for:** **Q7H-7** — the owner ruled that a preset showing part of a long wall is **correct behaviour** and the camera does not pull back for length (**trigger:** the owner has seen a 6 m kitchen on screen and wants the whole wall framed); **Q7H-8** — a body the document marks as overflowing is framed **off screen at mobile**, every pixel scanned and none of the six reachable, with the warning band still telling the customer and the body still editable as ADR 0065 decision 1 requires (**trigger:** backlog 67); **backlog 67** — tapping the overflow warning moves the camera to the marked body, which the owner called *"great to have"*, **wanted, unscheduled, not built** (**relayed as backlog 66 and renumbered at this close-out — 66 is the tall-body gap ruled 2026-09-14, cited by number in ADR 0110, ADR 0117 and the M7 milestone**); and **the near-black premise** — `MAX_ABSENT_CASING_PIXELS` is **50, not 15**, because the count is anti-aliasing-sensitive (a ~73 px line of which only **14** samples clear the ball), so 15 would be calibrated to one GPU, and the ratio that earns the slack is **`MIN_CASING_PIXELS` 300 against a control of 14, ~21× separation**. **Four things a later wave must not read as a bug:** a preset showing part of a long wall; a marked body off screen at mobile; the empty strip above the uppers (ADR 0110 E11, owner-confirmed); and **`MARKED_BODY_TAP` having no correct value** — struck with its old value left visible so a reader knows one was once reachable at **(330, 440)** and why it stopped being. **The eight structural findings are the wave's real output and are recorded in full in the milestone**; the three with standing obligations are: **a canvas constant is now a function of (room, rail state)**, so one measured against one document does not transfer to another — a narrowed-room document puts a different body under the same pixel; **the wave's 95 shell tests all built a fresh shell**, so a defect appearing only on the **second** resize — which is the customer path, correcting a wall length — passed 95/95, closed by new tests with **no `src/` change needed**; and **a property whose generator cannot reach the case it asserts about is not testing it**, M7's **second** instance of that class after 7D3's finding 6. **Two measurement hazards, both self-caught and both worth knowing before anyone measures this surface again:** clicking empty scene **deselects**, which closes the rail and re-widens the canvas **1020 → 1440 px mid-scan**, so every reading after such a click is in the other coordinate regime — caught only because a horizontal probe disagreed with a vertical one at the same point; and returning to rail-closed by clicking empty scene makes that click in whichever regime is current, so the rail never closes, and **a page reload per sample is the only reliable way back**. **`bowl_edge_back` is a deliberate shadow strip, not a defect**, and the spec's premise now names **both** near-black sources — it and `M.glassDark`, the hob's smoked glass, **just outside** the patch, a near miss rather than an absence. **`end_panel_right` is the one kit-owned shell geometry** and is deliberately never replaced. **The wall maxima are unblocked:** nothing in `packages/three-adapter/src` reads `MAX_ROOM_*`, `SCENE_SHELL_*` or any room ceiling, the shell is a linear function of the room plus one 300 mm construction constant, and `PRESET_DISTANCE_M` has no room term — so **ADR 0120's Q-B is answered** and the owner's ruled **6000 mm per wall** can be applied by editing the policy literals alone. **That change was not made in this wave**; it is its own edit with its own record. **Two flakes are named so they are not mistaken for regressions:** `top-bar-pill-containment` and `global-colour` each failed **once** under a loaded full-project run and each passed in isolation, **21/21** and **7/7**; neither is a spec this wave touched. **`pnpm ci:local` and the push are not claimed for 7H either** — the pending state recorded for 7F4a and 7D3 above is unchanged — and the eleven hashes, the 95, the 21/21 and the 7/7 are **reported, not verified by the pass that wrote this row**. **Updated 2026-09-16: wave 7D4 is DONE across eight commits, `00152b8` (S1b), `9daf757` (S2), `8be7d9a` (the criterion-13 adjudication and ADR 0091 Amendment A), `d89a3b6` (S4), `a51d6ef` (the NUL-byte fix), `9258fa3` (review fixes), `c444ef9` (ADR 0121), `6456a3b` (the cycle→composed rename)** — the hashes are the coordinator's and **this pass had no shell to verify them**; `9daf757` is corroborated inside the tree by `tests/support/composed-run-baseline.ts`, which names it as the tree S4's baseline was captured on, and `9258fa3` is the commit ADR 0121 is measured at. **What shipped:** the **preparation** cabinet and **the first storage slot after the hob in the reading order** take `base-3drawer`; **every other storage slot takes `base-cabinet`**. The rule is a new pure leaf, `src/generation/body-choice.ts`, which identifies a slot **by what composed it** — `isComposedStorageSlot`, over the `storage:` id convention — and never by its `role` or its width, either of which looks able to answer and is wrong on **32.8 %** and **14.9 %** of placed rooms **against 7D3's correct output**. `generation-priorities.ts` reads the leaf at exactly two points (the preparation priority's `buildId`, and `storagePriorities`' per-slot choice); **all four sites verified at HEAD by the pass that wrote this row**, as is the completeness of the rename (`isCycleStorageSlot` occurs nowhere under `packages/`). **Measured over 211 551 placed rooms: `nonBuildIdDiff: 0`** — no position, width, remainder, drop decision or cut moved anywhere — **261 162 body changes, every one `base-cabinet → base-3drawer`**, 200 751 on preparation and 60 411 on composed storage slots, **zero on a block column and zero on the hob**; the post-hob slot stands on **wall A in 53 751 rooms (25.41 %)** and **wall B in 6 660 (3.148 %)**, `wrongEnd: 0`. *(The coordinator's figures, independently reproduced by the wave's logic reviewer and **not re-run here**; the wall split is corroborated at the milestone's D15.7, which records 25.4 % / 3.1 % and the same 6 660. **The number 25.4 names three unrelated quantities in the milestone file** — this split, G3.3's *wall A keeps a cycle slot*, and ADR 0117's withdrawn lift share — and they must not be cited for one another.)* **This was a small wave in code and a large one in correction, and it is not written up as a clean one.** It was **re-planned mid-flight when the owner replaced its central ruling** (*"is not like one with drawers one with door… is not like in chess"* — D14, ADR 0110 Amendments G and H): the storage **cycle** the plan was built around ceased to exist before a line of it shipped, and what remains is a positional rule. **Five plan defects were found and fixed, every one the coordinator's own:** **(1)** criterion 6's enumeration omitted **`{base-3drawer}`** — a kitchen whose only composed slot *is* the post-hob one has no other slot left to hold a door, **394 of 3 547 placed rooms, 11.1 %**, witness 6229 × 1489 × 2641, **the composer right and the criterion wrong**; **(2)** criterion 15 demanded a parity sample containing `base-panbank`, which **criterion 6's own must-not forbids in a storage slot this wave** and which generation places nowhere — **unsatisfiable by correct output**; **(3)** criterion 13's must-not **contradicted criteria 1, 6, 7 and the same section's preamble**, the plan saying three times to put a drawer in the post-hob slot and once not to touch the 7D3 assertion that denies it — an implementer met it exactly as a contradiction is met, and the general rule it forced is **ADR 0091 Amendment A**: a product claim retired by a *later* dated ruling is retired by **moving** the invariant, never by widening a clause in place; **(4)** a production comment cited **"ADR 0110 G12"**, a section that does not exist in that ADR (G12 is a row of the milestone's own ground-truth table) — fixed and **verified at HEAD**; **(5)** risk 21 named re-measuring a figure and **not re-capturing the baseline artefact** that re-measurement invalidates — `tests/generation/7d3-composition-baseline.json` stops being valid for a wave that re-keys `chooseWallCut`, and must be re-captured against that wave's own pre-state. **Three defects in the wave's own tests, and they matter more than the code — all three one family, now [ADR 0121](decisions/0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md):** the parity suite **passed 15/15 with the wave's central rule deleted outright**, because it selected storage bodies **by build id** and the preparation module now carries `base-3drawer`, so every *"a drawer exists"* assertion was satisfied by preparation alone while the domain suite went 8 red — **the same sabotage now gives 4 failed / 12 passed**, both directions reproduced independently, and the reference room was **kept and re-justified as the counter-case** because it stands no drawer in a composed slot at all; **two QA guards passed under the sabotage they existed to catch**, each asking whether a body's id equalled `THREE_DRAWER_BASE_BUILD_ID` **while the sabotage moves that very constant**, so the filter matched every door cabinet — **found by QA in its own work and reported rather than buried in a clean table**, and the strengthened form turns **7 domain and 3 parity tests red where it turned none**; and **one NUL byte made a test file binary to git** — a literal NUL at line 260 of `qa-7d4-body-choice.adversarial.test.ts`, **pre-existing at `7816634`** — so `00152b8`'s **229-line change (93 insertions, 136 deletions) in that file was read by nobody**, not the implementer's reviewer and not the coordinator, and **the repo-wide convention greps this project uses as gates stepped over it and reported success**. That last one is the form of the family **nobody chose**: no author decided to identify source files by the absence of a NUL byte; a tool did, and every downstream gate inherited it. **What this wave does NOT prove is on the record too**, from S4's finding F6: **criterion 13's four non-oven clauses have no assertion at all**; **criterion 12 is asserted weaker than *byte-identical*** — shipped as *"declares exactly two required roles, and they are the sink and the hob"* (`qa-7d4-composed-bodies.adversarial.test.ts:439-444`, **verified at HEAD**), with no sabotage against `approved-room-policy.ts`; **criterion 2's wall-cut clause rides on the digest** with no sabotage isolating `chooseWallCut`; **criterion 21's refused-upper clause had no mutation aimed at it**; and **criterion 15's two-front arm is unreachable this wave** (**verified at HEAD** in the parity file's own header), because it needs `base-panbank` in a composed slot and that is 7D5's. **Four obligations carry forward, two owned and two not:** the comment at **`run-end-panel.ts:94-98`**, whose stated reason — *"a fitter closes that gap with a filler strip"* — is **false under ADR 0120 Amendment D's run reading** while the behaviour is correct, which is the more dangerous of the two states; and **`qa-7d3-tall-end-block.adversarial.test.ts`'s widened clause**, which ADR 0091 Amendment A admits **only** with a comment naming where the invariant went (`drawer-rows.test.ts:316-328`) and which **has no such pointer at HEAD** — **both owed by 7D5's first slice**. **Unowned, and no owner is invented here:** **`chooseWallCut` is keyed on wall identity, not on width**, contrary to the owner's *sink and hob on the wider wall, fridge on the narrower* — the fridge is on the narrower wall in **0.0 %** of the 2 760 B-wider rooms that have one (ADR 0120 C2, ADR 0121 instance 1); and **the *"Perete A"* field copy names the wrong quantity**, which ADR 0120 Amendment D makes **more** load-bearing, not less, since the label is the single place the customer is told what number to type. **Nothing in 7D4's scope is deferred** — the dishwasher and the bottle cargo were withdrawn by D11 and are 7D5's, which is what makes 7D4 contain **no width-changing commit at all** — and the wave owes no ADR: 0110 Amendments F, G and H, 0091 Amendment A and 0121 are all written. **`pnpm ci:local` and the push are not claimed for 7D4 either**, and every figure in this passage is **reported unless marked verified at HEAD**. **Updated 2026-09-17: wave 7D8 is DONE — the run follows the wider wall, `8ebff1f`…`b83e4f2` (full commit list and criterion-by-criterion close-out in the milestone file's 7D8 close-out section).** The sink/hob stand on the wider wall and the fridge on the narrower, keyed on the entered wall length; the tall block follows the run onto wall B by owner ruling (ADR 0110 Amendment I1.1, correcting *"nobody loses one"* to **74 kitchens**, witness 3300 × 3310); the mirrored reading direction in B-wider rooms is owner-accepted. **ADR 0123** records Finding B's ruling (a branch whose population empties keeps its branch and gets a declared witness, never a lowered floor); **ADR 0122** ships the wall-cabinet growth defect unrepaired by owner ruling; `24ca2bc` fixed the shrink half (4 413 kitchens). **Risk 7, named and unowned: 1 785 of 3 756 rooms (20.7%) lose the run-end panel** in the re-keyed layout — reported, not ruled, no wave assigned. ~~**`pnpm ci:local` and the push are not claimed for 7D8 either. 7A3 is next, unblocked.**~~ **Corrected 2026-09-17, later the same day: `pnpm ci:local` PASSED on `b80ab97`** — all gates green, format/lint/typecheck/test/e2e/build/boundary/lockfile/SCA — **and `8b73439..b80ab97` is pushed to `origin/m7-room-and-presets`**, pre-push gate green again, local and origin both at `b80ab97`. See *What to do next* for the full figures and for the correction that several earlier "nothing is pushed" statements in this row were themselves stale. ~~**7A3 wave S0 is DONE (ADR 0124); S1 is next.**~~ **Corrected 2026-09-17, later the same day: wave 7A3 is DONE, close-out at `6bc1b44`.** Commits: S0 (ADR 0124) `6c8a1bc`; S1 `71aae6d`; S2 `1fac007`; S2 QA `cbd04a8`; S2 review fixes `2898b14`; S3 `c0d74dc`; S3 fixes `b7b3941`; S3 D2 `6bc1b44`. Both owner rulings are applied — the wall maxima are **6000 mm on both walls**, and Step 1's length fields now carry an always-visible hint line plus a per-wall help control, owner-ruled placement (a) at the end of the label row so its 44 px target overlaps no input. **`MAX_ROOM_DEPTH_MM`, the `DesignRoomSchema` wire bound, moves from 5100 to 6300 in the same slice as the policy edit** (ADR 0124), which is why this is not a two-literal wave: `MAX_DESIGN_BYTES` (the SEC-002 request cap) moves **337,290 → 349,656 bytes**. **A product decision, stated plainly per the plan's own Verification requirement: the wave withdraws 1,980 rooms (wall A 6001–6300) that all compose correctly today, and admits 7,380 rooms (wall B 5101–6000) that all compose with none dropped and no `base-hob-oven`.** The wider-wall population share moves **38.86 % → 50.55 %** — the plan's own measured figures, carried forward and not re-measured by this wave. Full criterion-by-criterion close-out, the suite's own arm counts, and two dated owner rulings (the corner clause; help-button placement (a)) are in the milestone file's *7A3 close-out — 2026-09-17*. `pnpm ci:local` and the push are **pending at the time of writing; the coordinator records them separately.** ~~**7F4b is next.**~~ **Corrected 2026-09-17, reconciling a wave-table defect open since 2026-09-15: wave 7F4b is DONE, shipped 2026-09-15 across four commits — `9bb222b` (the hand-off: one attempt, one row, navigation after the write), `b91cb25` (adversarial QA, no defect found), `e2f24dc` (the save-failed notice becomes a live region; a false contract line corrected), `ef83393` (the run token detached from the mount's lifetime — a latent defect the review found and the implementer measured with React 19.2's `Activity`; `HandoffStatus` gains `saved`).** Reported gates at `ef83393`: web **214 files / 3,227 tests**, three-adapter **78 / 3,071**; lint and whole-tree `format:check` green. **The journey (criterion 44) PASSES a production-build visual gate run 2026-09-17 at 390 × 844, touch, both locales — its first run ever** — Step 1 → În L → typed room → *Continuă* → 1F → self-navigation to `/ro/d/{id}` showing the typed room, and back to Step 1 with the room refilled; also passes at 7A3's 6 × 6 maximum and in ru. **Criterion 44's "CI is the verdict" is NOT met**: no push to this branch has ever triggered `ci.yml`, and the owner has agreed to trigger it by hand from the Actions tab — see *What to do next* for the full close-out and what remains unverified (criterion 42, the stronger half of criterion 43). Full criterion-by-criterion record: the milestone file's *7F4b close-out — 2026-09-17*. **Updated
2026-09-18: wave 7D6 is DONE — the corner's along-wall reach is derived from the cabinet depth,
across four commits: `bf58f97` (S2, the derivation and its three readers), `dcb67ce` (S3, the margin
pin and the literal sweep), `9ae586c` (QA), `0d79ce9` (review fixes).** `ENGINE_ROOM_LIMITS` moved
900/1000 → 880/880; `APPROVED_ROOM_POLICY` stays 900/1000, ADR 0125's deliberate 20 mm / 120 mm
margin. Full criterion-by-criterion record, the reviewer's own containment argument, the two
failure-class markers (an inverted floor run, a bare-`Error` crash below the approved bound) and what
7D7 inherits: the milestone file's *7D6 close-out — 2026-09-18*. `pnpm ci:local` and the push are
recorded by the coordinator, separately. **Updated 2026-09-19: wave 7D7 is DONE** — plan `552cd74`,
S1 `f861306`, S2 `6311f65`, S3a `009ab05`, S3b `49627f9`, S4 `8618129`, gate-timeout follow-ups
`5c1cd33` and `a9bad6b`. Generation now records the four room-sized corner widths at 600 mm and the
scene renders
them; a later 700 mm depth command keeps those stored widths frozen under ADR 0089. The reference
room remains 900 / 320 / 570, the engine floor remains 880 / 880, and ADR 0125 keeps the approved
minima at 900 / 1000; S5 was cancelled. Final `pnpm check` passed with domain **4,570**,
persistence **282**, three-adapter **3,536** and web **3,316**. Final `pnpm ci:local` passed every
gate, including **208 passed / 2 skipped** E2E cases; push remains pending. The full evidence and visual limitation are in the milestone's *7D7 close-out —
2026-09-19*. **Updated 2026-09-21: wave 7D5 is DONE, close-out at [7D5 close-out](milestones/done/M7-room-and-presets.md#7d5-close-out--2026-09-21).** Commits: S1 `c67b4ee` (bottle cabinet), S2 `17df3f5` (pan-drawer cabinet), S3 `dd7a25b` (threshold drawer). Pushed; local and origin both at `dd7a25b`, source-verified with `git rev-parse` after `git fetch`. `pnpm check` passed — domain 221 files / 4,673 tests, persistence 20 / 282, three-adapter 92 / 3,546, web 218 / 3,316; `pnpm ci:local` printed `LOCAL CI PASSED — all gates green, safe to push`, e2e 208 passed / 2 skipped in 5.7 minutes. A six-witness-room visual gate on the production build passed with no defects filed; one open owner question on the reference room's 560 mm end gap is recorded, not fixed. The dishwasher (S5) is lifted to **wave 7D5b**. **A coordinator process error is on the record** (ADR 0110 L7): S1 and S2 were each committed after running only the domain suite, with three-adapter red at both (neither pushed). **Separately: wave 7T's slice 1 shipped at `5c1a6aa` on 2026-09-16 but was never recorded in this row or given a DONE marker — a documentation gap found while closing 7D5, left open here rather than resolved, since this pass did not verify `5c1a6aa` against `git log`.** **Updated 2026-09-21: wave 7D5b is DONE, close-out at [7D5b close-out](milestones/done/M7-room-and-presets.md#7d5b-close-out--2026-09-21).** Commits: plan + Amendment M `acb7b6f`; S0 `c0018ef`; S0b `4e88ae0`; S1 `f116b1c`; S2 `09cea46`; SW `f6e3730` (pushed, local/origin verified matching); the W7 fix committed just after and pushed with the close-out. `pnpm check` and `pnpm ci:local` both green at `f6e3730` (see the RESUME HERE entry above for the full figures). A dishwasher stands in 196,621 of 245,211 placed kitchens; every room keeps ≥ 1 oven. Owner and coordinator rulings are [ADR 0110 Amendment M](decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-m--2026-09-21-wave-7d5b-the-dishwasher-and-the-oven-principle) (M1–M16). **Wave 7F2 — 1C validation state, shape refusal, the red wall — is PLANNED, next**, all owner/coordinator questions answered; see [Wave 7F2 — the plan](milestones/done/M7-room-and-presets.md#wave-7f2--the-plan-2026-09-21). **Updated 2026-09-23: waves 7F2, 7T and 7E4 are all DONE since — see the RESUME HERE entries in *What to do next* for full figures.** 7E4 (S1 `64e8894` … review round 2 `1b512bb`) moves the e2e suite and its tooling off `/configurator/configure` onto a fixture that mints and opens a seeded `/d/{id}`; `pnpm ci:local` PASSED at `1b512bb` (e2e **365 passed, 2 skipped, 5.2 minutes**); the runner's own CI verdict remains outstanding, the same structural gap 7T and 7F4b left open. **Next wave: 7E3a is DONE, 2026-09-23** — the `__Host-` visitor cookie, the `0005` migration and server-side resume; see the RESUME HERE entry and the [7E3a close-out](milestones/done/M7-room-and-presets.md#7e3a-close-out--2026-09-23). **Updated 2026-09-23, later still: wave 7E3c is DONE** — the private share link (create, revoke, re-issue; `/[locale]/s/{token}`), commits plan+ADR `f59d79b` … screen notes `b39983d`; see the [7E3c close-out](milestones/done/M7-room-and-presets.md#7e3c-close-out--2026-09-23). **Updated 2026-09-23, later still: wave 7E3b is DONE** — a design opens only in its owning browser, with the visitor value rotating to a fresh random secret on every mint (backlog 81 closed) and the two-tab create race closed by a client-side Web Lock rather than the server-side HMAC the wave tried and reverted the same day (ADR 0114 H1, H4 struck, H6). Commits: plan + ADR H `239d87f` … review round 2 fixes `f1e4fc9`; `pnpm ci:local` PASSED at `f1e4fc9` — e2e 448 passed / 2 skipped, persistence 29 / 558 passed | 1 skipped, three-adapter 92 / 3,553, web 260 / 4,653; see the [7E3b close-out](milestones/done/M7-room-and-presets.md#7e3b-close-out--2026-09-23). **Updated 2026-09-24: wave 7I is DONE** — mirrored right-hand L, one primitive (`applyCornerDirection`) that reflects a group in its own local X, settable on the whole scene or on one structural corner group alone (for M7B's U shape). Commits: plan + ADR 0129 `4ff2d64`; S1 `95c5ad4`; S2 `e653efb`; S3 `bf3716a`; S4 `250efb7`; QA fixes + QA tests `a20085a`; review fixes `f653bdf`. `pnpm ci:local` PASSED at `f653bdf` — e2e **452 passed (7.0m), 2 skipped**, persistence **29 / 558 passed | 1 skipped**, three-adapter **95 / 3,609**, web **263 / 4,693**. QA found and fixed the selection outline invisible in a right-hand scene (a scoped `DoubleSide` exception on the outline material only, recorded as an ADR 0129 amendment), the contact blob not re-seated on an in-place flip, and mirrored capture-route lights. **A pre-existing defect was found and fixed as a side effect: wall-B's side words and width-step note were mirrored wrong on every left-hand kitchen** — ADR 0129 decision 8 is amended so the crossing condition is `(wall A and right) or (wall B and left)`; `panel.widthStepNoteRight` is the swapped note, not right-hand-only. Full record: [7I close-out](milestones/done/M7-room-and-presets.md#7i-close-out--2026-09-24). **Next wave: 7J**, then 7K, 7L, per the owner's Q-7J-1 answer (one 6000 mm maximum per shape, unless 7J shows a real need for 6300 mm on a straight wall). **M7 closed 2026-09-29 — all waves through 7L shipped, Gate M7-C withdrawn
(ADR 0113), preset story deferred past M8 (ADR 0131), Q-7L-1 answered (ADR 0104 Amendment B).** | No —
`milestones/done/M7-room-and-presets.md`, and ADRs
0108–0115, 0045 Amendment A, 0108 Amendment F, 0110 Amendment I1.1, 0118, 0120 Amendment E, 0122,
0123, 0124, 0125, 0129, 0131 |
| M7B — U-shaped rooms | **Planned, confirmed by the owner 2026-09-11** (*"Yeah let make separate"*) — sits between M7 and M8; ~~planned in its own file once M7's domain waves land~~ ~~plan written 2026-09-29: eight waves U0–U7, no wave dispatched; next wave U0 (census, measurements, ADR 0132, owner questions Q-U1–Q-U5, which gate U3 and U6 only)~~ **U0 is DONE (Light tier, one logic reviewer, no blockers): ADR 0132 Accepted; owner answers Q-U1–Q-U5 and RQ1–RQ17 recorded in ADR 0108 Amendment H, ADR 0110 Amendment N, ADR 0104 Amendment C; backlog 91. No wave now waits on an owner answer. Next wave U1** (the stored U and wall C; domain; Full tier plus security on S2). ~~**Update 2026-09-29: U0–U2 done; U3 re-cut into U3a and U3b. U3a is implemented through `3f53a62` (N10 fitting rule), in adversarial QA, then review; not closed. U3b next. See *What to do next*.**~~ ~~**Update 2026-09-29, later: U0–U2 and U3a are DONE (U3a closed at `38d6be7`; close-out in the milestone file). U3b S0 (test fixtures and the deferred clean-code minors) is in progress, then S1–S3. U4 is in review round 3, not closed. See *What to do next*.**~~ **Update 2026-09-29, latest: ~~U0–U2, U3a and U4 are DONE (U4 closed at `7f129fa`; close-out in the milestone file; U4's visual criteria and the D14 light rig moved to U5). U3b S1 is in progress (ADR 0110 N11.8–N11.9 plus generation), then S2–S3.~~ ~~2026-09-30: U0–U5 are DONE (U5 closed at `8a30dbb`; D14 decided: keep the rig, ADR 0132 Amendment B). Next: U6 (the switch), then U7 (the phase gate). Not pushed; `ci:local` not run.~~ 2026-09-30, latest: U0–U6 are DONE (U6 closed at `f06b7af`: S0 census `7d87c41`, S1 the switch `cb0bb0c`, QA `064c0e1`, review fixes `d5e933a`; a U is now buildable under `APPROVED_ROOM_POLICY` and the card is live). U7 (the phase gate) is in progress, starting with S0 (the reload flash, ADR 0133). Origin was last pushed at `0729c2f`; the local branch is ahead. See *What to do next*.** | Yes — `milestones/M7B-u-shaped-rooms.md` |
| M7C — M7 feedback fixes | **In progress** (2026-10-01; branch `m7c-m7-feedback-fixes`, cut from `main` at `2615b51`, not pushed). Done: C0; C1 S1 `8269440` and S2 `21c702b`; wave C4 (S1 `c4eeea6`, S2 `48bbc0c`); wave C2 (S1 `075529b`, S2 `0a1a69a`); C1 S3 `01c40be`. Open: C3 (in implementation), C5, C1 S4 (browser Back warning, planned), CE, C6 | Yes — `milestones/M7C-m7-feedback-fixes.md`; the feedback log `M7-FEEDBACK.md`; ADR 0113 (pointer), ADR 0135 |
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

- **M7 is closed (2026-09-29).** Nothing from M7 is open. Every M7 bullet below this one is history —
  kept for its detail, not because anything in it is still outstanding. The next milestone in the
  phase sequence is **M7B — U-shaped rooms** (confirmed by the owner, ~~plan not yet written~~
  ~~plan written 2026-09-29; waves U0 and U1 done, next wave U2~~ ~~waves U0–U2 done, next wave U3~~
  **waves U0–U2 done; U3 was re-cut 2026-09-29 into U3a (the U plan) and U3b (generating a U), each
  with its own QA and review, order now U2 → {U3a → U3b ∥ U4}, U6 depends on U3b.~~ ~~U3a's
  implementation is complete through `3f53a62` but not closed: the A8 stop was adjudicated and the
  owner's answers are recorded, and U3a's adversarial QA is running~~ **U3a is DONE (closed at
  `38d6be7`, 2026-09-29): QA green twice, logic review approved, clean-code review approved with
  minors.** ~~U3b S0 is in progress; U4 is in review round 3, not closed~~ **U4 is DONE (closed at
  `7f129fa`, 2026-09-29). U3b S1 is in progress (N11.8–N11.9 plus generation); U5 follows U3b
  and starts with S0** ~~U3b S1 is in progress~~ ~~2026-09-30: U0–U2, U3a, U3b and U4 are DONE. U5 is
  in progress: S0 merged at `664eee6`, S1 merged at `739f9e2`, S2 in progress. Next: U5 S2 → U5
  QA/review/visual (AC9–AC11; D14 lights owed before U6) → U6 → U7.~~ ~~**2026-09-30: U0–U5 are
  DONE (U5 closed at `8a30dbb`; the D14 gate is discharged, ADR 0132 Amendment B). Next: U6 → U7.
  Not pushed; `ci:local` not run.**~~ **2026-09-30, latest: U0–U6 are DONE (U6 closed at `f06b7af`).
  U7 S0 (the reload flash, ADR 0133) is in progress; then U7 S1 → S2 → S3 → S4. Origin was last pushed at
  `0729c2f`; the local branch is ahead.**
  See the RESUME HERE entry
  under *What to do next*; see `milestones/M7B-u-shaped-rooms.md`. Deferred past M8 by ADR 0131: the preset story (search, evaluation,
  application, the in-repo thumbnail rig — 7P1, 7P2, 7G, 7B, 7C, 7F3).
- ~~**M7 wave 7D7 is complete through documentation close-out `71e6ba3`…**~~ **SUPERSEDED — see the
  RESUME HERE entry under *What to do next* for the current state: 7D5, 7D5b and 7F2 have since all
  shipped and 7F2 is DONE as of 2026-09-22.** This bullet is kept only as history; do not act on it.
- ~~**M7 — six owner follow-up questions, F1–F6, open since 2026-09-11.**~~ **CLOSED 2026-09-11 — the
  owner answered F1–F7 the same day** (`milestones/done/M7-room-and-presets.md`, *Follow-up questions*),
  through a structured prompt, the option labels quoted verbatim in the milestone. F1 unblocked wave
  7J; F5 was answered, then twice revisited the same day — the final shape is *"own browser + a
  12-character revocable read-only share link"*, with customer profiles replacing a PIN and arriving
  in M8 ([ADR 0115](decisions/0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md)).
  F7 (the coordinator's own follow-up, wall B's 100 mm depth reserve) was answered too. **Nothing in
  M7 is blocked on the owner.** ~~Also open: M7B, proposed and not yet confirmed.~~ **M7B is
  confirmed** — see the M7B row above.
- ~~**THE OWNER'S TURN — Gate O2: read the Russian. This is the only thing between M6B and its close,
  and no agent may pass it.**~~ **CLOSED 2026-09-11 — the owner approved all 235 leaves as drafted.**
  In the owner's words: *"russian I checked looks ok, if in future I will found something to fix I
  will do this."* Every M6B wave has shipped (6B-i at `87429ca`, 6B-j at `aff9a2c`), the owner's
  review round has shipped its fixes (`4f3c808`), and **ADR 0105's e2e split has shipped**
  (`b60f298`) — so the milestone's **build scope is complete** and **after the gate the only thing
  left in M6B is the push**, now explicitly authorised.
  - **What was open:** [`docs/i18n/gate-o2-russian-review.md`](i18n/gate-o2-russian-review.md) — all
    **235** leaves of `ru.json` beside the Romanian they were translated from, grouped by namespace,
    in the catalogues' own key order. The file now carries its own closure banner; it is not
    restated here.
  - **Five of its rows are still stale against the message files — the closure banner does not
    correct the table rows.** `apps/web/src/messages/ro.json` and `ru.json` are the truth for these
    five; the aid is the owner's document and no agent edits it. **`configure.localeSwitch`** — the
    key no longer exists; the shipped leaf is **`configure.localeMenu`**,
    *"Limba interfeței: română. Schimbă limba"* / *"Язык интерфейса: русский. Сменить язык"*,
    confirmed present in both message files at key `localeMenu`. **`panel.finishFollowsKitchen`**,
    **`globalSettings.colourNote`**, **`globalSettings.colourWarning`** and
    **`rejection.WIDTH_NOT_SUPPORTED_COLUMN`** — carry the pre-edit Romanian and Russian; the owner
    edited those four leaves themselves during the session (and ruled the Russian
    `panel.finishFollowsKitchen` personally). All five are approved as-shipped, not as the aid shows
    them.
  - **Two of the six flagged items were product questions rather than translation checks, put to the
    owner separately, and both were left as drafted:**
    - **F6 — the eight decor names are translated**, e.g. `Stejar Bardolino Natur` →
      `Дуб Бардолино натуральный`. **This is not closed — it is a standing re-open condition.** A
      customer or supplier matching a decor against a printed sample works from the manufacturer's
      own printed name, and nothing automatic catches a mismatch in the Russian. **Re-open F6 if a
      supplier ever reads the Russian quote.**
    - **F4 — `configure.localeMenu` has never been through Gate O1.** Left as drafted; stands as
      shipped.
  - **A seventh owner ruling closed the question the review raised about the oven-tower label —
    [ADR 0107](decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)
    Decision 7, 2026-09-11.** `priceBreakdown.disclaimer` excludes *electrocasnice*; the breakdown
    prints **Coloană cuptor + microunde 9 000** beneath it. The owner's words: *"the cabinets
    represent the niche where this appliances are installed, and yes appliances are not included in
    price but the niche is."* A cabinet named for an appliance names the **niche**, not the
    appliance: `cabinet.tall-oven-tower` (900 000) and `cabinet.tall-fridge-housing` (700 000) are
    joinery and keep their prices; `cabinet.hood` and `cabinet.fridge-free` are the appliance alone
    and are zeroed via `drawnButNotSupplied()`. **No contradiction, the label stands, no string moves
    and no code changes** — the price book already encoded it.
  - **What a ruling still costs, for any future change:** a Russian change is a value edit and
    touches nothing else. **A Romanian change is an O1-class change** — copy lock updated in the same
    commit, the golden manifest re-baselined for exactly those keys with the key list in the commit
    message, and the affected Russian re-translated.
  - ~~**Two waves are verified but not reviewed, by the owner's own direction** (*"focus on developing
    more, then I will focus on testing"*): 6B-i and 6B-j ran the automatic gates and no QA, review or
    visual round.~~ **Closed 2026-09-11 — the owner's review round covered both**, and it found real
    defects in exactly that surface (the menu's Tab guard, `endonymOf`/`flagOf` failing open under
    `next dev`, the camera reset). **The one thing still pinned by tests and never watched happen is
    the shared link**: that a `/d/{id}` link survives a language change. The switcher itself has now
    been driven in a browser in both locales and on both shells.
  - **e2e ran to completion on this branch for the first time, 2026-09-11: 189 passed, 2 failed, 2
    skipped, 5.5 minutes**, across Playwright projects `mobile` and `desktop`. Both failures were
    this milestone's own rulings meeting gates calibrated to geometry those rulings replaced, both
    fixed at `cec60b7` and both re-verified passing individually:
    - `editor-panel.e2e.spec.ts` swept `[data-testid^="finish-"]` page-wide; ADR 0107 Decision 4
      deliberately places the follow-the-kitchen reset **outside** `colour-options`, so the sweep
      read that row as a wrapped chip. Now scoped to the carousel's declared container
      (`apps/web/tests/e2e/editor-panel.e2e.spec.ts:291-301`).
    - `MIN_CASING_PIXELS` went 900 → **300**, confirmed at
      `apps/web/tests/e2e/pixel-counter-witness.adversarial.desktop.e2e.spec.ts:99`. **A
      re-measurement, not a lowered bar**: the old floor was half of 1 923 measured 2026-09-07; ADR
      0107 Decision 5 halved the highlight, the casing is a sum
      (`SELECTION_OUTLINE_WIDTH_PX + 2`), so the visible near-black rim went 2 px → 1 px, and the
      count is now a deterministic **616** (measured twice, per the file's own doc comment at line
      86). The count fell **3.1x rather than 2x** because anti-aliasing at a 1 px rim blends the edge
      toward the front colour; **the rim is now at its resolution floor** — a further thinning has no
      pixels left to give.
  - ~~**After Gate O2, M6B still owes one thing**: ADR 0105's e2e project split, the next bullet.~~
    **After Gate O2, M6B owes nothing but the push, and the owner has now explicitly authorised it.**
    The e2e split shipped at `b60f298`. The rebase rewrote `m6b-internationalization`'s history, so
    it cannot be fast-forwarded and a force-push is the only route.
  - **Environment note for future e2e runs, not a product finding:** the first two e2e attempts of
    this session ran **zero tests**, because a peer session kept a `pnpm --filter @lemnaria/web dev`
    running in the same directory, and Next 16 refuses a second `next dev` there regardless of
    port — `E2E_PORT` (default 4320, per `apps/web/playwright.config.ts:17`) does not sidestep a
    blocker on `:3000`. It presents as a green-looking, test-free exit rather than a bind error, and
    cost two full cycles; see `docs/best-practices/ci-and-local-gates.md`.

- **~~Engineering deferral —~~ SHIPPED 2026-09-10 at `b60f298`: the `e2e` CI job splits by Playwright
  project.** ~~**As of 2026-09-10 this is the milestone's only remaining engineering work, and it waits
  on Gate O2 rather than on any wave.**~~ **It did not wait**: the split landed during the owner's
  review round, and with it **the ceiling came back down from 75 to 45 per leg**. ADR 0105 carries
  the implementation note and an in-place amendment to its decision 2 reasoning. **No CI run of the
  split legs is claimed here**, because none was reported to this pass. The paragraph below is kept
  as the record of why it was done. Owner ruling, 2026-09-10: *"do it just after you will finish the M6B milestone"*, and
  recorded in
  [ADR 0105](decisions/0105-the-e2e-job-splits-by-playwright-project-rather-than-raising-its-ceiling-again.md).
  Run 34407768425 was cancelled at test **161 of 186**, 49.4 minutes into the specs, with **every
  test that ran passing** — the suite is simply longer than its ceiling (~57 minutes of job against
  a 50-minute cap). The ceiling is raised to **75** at `4aa3e0a` to carry M6B, which adds a second
  locale and will grow the suite again; that is the **third** raise (25 → 45 → 50 → 75) and is
  explicitly the last. The replacement is a matrix over `--project`, splitting `mobile` (28.6 min,
  120 tests) from `desktop` (~27 min, 66 tests) along the seam `playwright.config.ts` already draws.
  **`workers` stays at 1** — two cores, three.js compiled on first paint, and one shared Neon
  database the suite writes to; ADR 0105 rejects that option on the merits rather than deferring it.
  ~~**Not started, and deliberately not started during M6B**: restructuring the gate that measures a
  milestone while that milestone is open makes a failure ambiguous between the split and the wave.~~
  **Superseded by what happened: it shipped while M6B was still open, on the gate rather than on a
  wave.** The argument above was about not confusing a wave's failure with the split's; every wave
  had already shipped when it landed, so there was no wave left for it to be ambiguous with.

- **The configure screen's chrome does not match the design reference, on either shell — owner
  rejection, 2026-09-09.** *"I wanted to be same as in reference, SAME, because this is the design I
  made and approve"*, and *"on mobile same shit, you done what you wanted not what is in reference"*.
  Ruled in [ADR 0104](decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md):
  the mockups are the specification for screen 2's chrome, **the settings strip's own row is
  withdrawn on both shells**, and the whole-kitchen settings become the single pill frames D2A and 2A
  draw — with frame 2A's own `+2` counter, which was never implemented and is the reason the project
  spent ADR 0082, ADR 0094 and two waves containing a row the design never asked for. ADR 0082
  decisions 2, 3, 4 and 8 and ADR 0094 decision 2 are amended **in place**, struck rather than
  deleted. The plan is
  [`milestones/chrome-parity-with-the-design-reference.md`](milestones/chrome-parity-with-the-design-reference.md)
  — ~~**not started**~~ **and this word is almost certainly stale, flagged 2026-09-11 rather than
  corrected, because this pass could not verify it.** `main`'s log carries `d1f3497` *"fix(chrome):
  two defects adversarial QA found, and the gates that name them"* and `b489f02` *"test(e2e):
  re-point nine assertions the chrome-parity wave made stale"*, which is not the shape of an
  unstarted wave. **What the wave shipped, what it verified and what it left open is not recorded
  anywhere this pass read** — the milestone plan still reads as a plan. The next session to touch
  this bullet should close the wave out against its own acceptance criteria rather than trusting
  either this sentence or these two commit subjects. **No owner question blocks it**; the four it
  carries all have defaults.
  **Four owner rulings of 2026-09-09 are in the record**, each with what it was chosen over.
  (1) *Narrowing is a ladder*: all labels whole with D2A's `│`; then as many whole labels as fit plus
  `+N`; then one whole label; then one **ellipsised** — so the swatch, one label and the counter are
  never given up. The count is a **measured fit**, so **no width threshold is introduced** and
  ADR 0094 criterion 4i is met as written. (2) The **`Lemnaria` wordmark drops between 900 and
  966 px** — ruled on the corrected premise that it is *not* needed to prevent overflow but buys a
  readable setting name against a `P…` stub, and chosen over both keeping the stub and letting
  frame 2A serve narrow widths. That discharges the reservation
  `apps/web/tests/e2e/top-bar.desktop.e2e.spec.ts:165–174` placed on the element. (3) **ADR 0065's
  flagged-total sentence leaves the top bar for the scene**, chosen over letting the desktop bar
  grow — so the header keeps frame D2A's shape at every width, flagged or not, and **`1cc86d8`'s
  9.28 px trade is retired rather than repaid**; the gate that asserts that growth is re-pointed to
  assert its absence. (4) **The kitchen's colour joins the pill** — *"if it fits, it should be
  displayed also"* — making four settings in the order
  [ADR 0099](decisions/0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decision 9
  already ruled. **The owner reviews the implementation in a browser before any QA is dispatched.**

- **M6's remaining work is verification and two owner rulings — as of 2026-09-08 (evening).** Every
  wave row but 6Y is DONE and the branch `fix/m6-remediation` is green: domain **3729**,
  three-adapter **3022**, web **2005 and no skips**, persistence **282**, typecheck / lint /
  `format:check` clean, **120 commits ahead of `main`** at `ca1310f`. What is owed before M6 can be called closed:
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
  - **~~Two owner rulings~~ ALL FOUR RULED AND SHIPPED, 2026-09-09.** The owner answered every open
    question in one round, and each answer is now in the tree with its regression:
    - **M6-AUD-013** — *remove the desktop dim* (`fca2ee8`). Both shells are genuinely non-modal, so
      `aria-modal`'s absence is true in every input mode rather than the weaker of two answers that
      disagreed. Click-outside-to-close on desktop went with it, deliberately; Escape and the close
      button remain. The e2e case that clicked the scrim is replaced by the assertion the change
      exists for — a pointer can reach the page behind the open popover — asked of
      `document.elementFromPoint` rather than a locator, so a fixed overlay under any class name
      fails it.
    - **M6-AUD-014** — *valid, but no price* (`c6610cf`). Zero placements stay loadable, shareable and
      refused at no seam, which is what M7 needs the day it produces an empty proposal. The bar
      carries the owner's own sentence where the figure would be, and the breakdown reports
      `unavailable` so no control opens it and no tier is rendered *inclus* over an empty kitchen.
      The breakdown requires **both** halves — no cabinet lines **and** no groups — because absent
      lines beside groups naming bodies is not emptiness, it is the divergence that surface refuses
      to render, and the first half alone swallowed that guard.
    - **Backlog 50** — *mark, never refuse* (`1a004ee`). See the entry below; every stored document
      still loads.
    - **Backlog 60** — *structural cabinetry follows the kitchen, appliances never do*, with open
      shelves inheriting by default (`fde1efc`, `8f08182`, ADR 0099 Amendment B in `ca1310f`).

- **What the 2026-09-09 waves landed, and the one thing each got right that is worth keeping.**
  - **Backlog 50's gate rediscovered its own defect.** The owner ruled `mark`; the *reach* was an
    engineering call and the coordinator's first instruction — measure from `occupiedDepth` — was
    **wrong**, because two worktop slabs meeting at an L-joint is what a corner is (ADR 0025), and
    that reach marked the shipped kitchen and broke twelve assertions on accepted documents across
    two packages. The carcass seat is the reach, which is what entry 50's own 80 mm and 31 mm
    figures had said all along. Then `qa-6x-slide-witness` at 700 mm turned out to be a **true
    positive**: its fixture swaps the setting and moves no placement, so the carcass goes 560 → 660
    against a return still at 580 and the wall band 291 → 361 against one still at 330 — **exactly
    the 80 and 31** the entry was opened on. The new code found the original defect in a fixture
    nobody built for it.
  - **Backlog 60 separated following from being visible.** `applyBodyFinish` paints declared surfaces,
    so a declaration flip alone can be a no-op on screen. Every body's rendered colour was measured
    off the built object before and after: three corner doors moved in the first wave, the shelf's
    six boards in the second, and `base-corner-return-320` moved nothing **and owes nothing** — its
    only cabinetry surface is the carcass interior every body shares. That is recorded as a
    conclusion, not a deferral.
  - **The wrong fix was measured rather than argued down.** Widening `FRONT_MESH_NAME` for the shelf
    would have changed which meshes count as a handle's parent and what a whole-room repaint touches;
    a census found `side_left`, `side_right` and `back_panel` are also built by the dishwasher, the
    800 sink and the oven tower. Applying it anyway turns **26 adapter tests red across five files**.
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
- **`main` has been red since the M6B merge, 2026-09-11, and no document recorded it until now.** The
  last CI run on `main` — `34580253814`, the push of `995ad03` — FAILED, on `e2e (desktop)` only, two
  specs red: `top-bar-pill-containment.desktop.e2e.spec.ts:793` and
  `top-bar.desktop.e2e.spec.ts:202` ("cuts none of the row's own copy" at 900 px,
  `expect(measured.clippedSpans).toEqual([])`). Every other job passed. **Found during M7 wave 7F4b's
  close-out, 2026-09-17.** Not scheduled for a fix here; note the overlap — these two spec names are
  the same two wave 7H reported as one-off flakes against a loaded local run (`top-bar-pill-containment`
  and `global-colour`/`top-bar`), so what was filed as a flake may be a genuine CI-only failure.
- **No push to `m7-room-and-presets` has ever triggered `ci.yml`.** `.github/workflows/ci.yml` runs on
  pull requests to `main`, pushes to `main`, and manual `workflow_dispatch` only —
  `gh run list --branch m7-room-and-presets` is empty against 36 runs overall. The coordinator's
  attempt to dispatch it by hand failed, HTTP 403, token not authorised. **The owner has agreed to
  trigger the `ci` workflow by hand from the Actions tab, 2026-09-17**; M7 wave 7F4b's criterion 44
  ("CI is the verdict") is outstanding until that run completes — see the RESUME HERE entry below.

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

> **RESUME HERE — 2026-10-02, latest. M7C (M7 feedback fixes): C1 S1, C1 S2, C1 S3, wave C4 and wave C2 are DONE.**
> Branch `m7c-m7-feedback-fixes`, cut from `main` at `2615b51`, **not pushed**. Plan:
> `milestones/M7C-m7-feedback-fixes.md`; log: `M7-FEEDBACK.md`. **M7B and `main`:** the reflog shows
> `main` fast-forwarded to `2615b51` and the branch `m7b-u-shaped-rooms` left for it, and the coordinator
> reports `2615b51` is "Merge pull request #9 … m7b-u-shaped-rooms" (not re-read by the scribe, which has no
> shell). So the M7B entries below, which stop at "U7 in progress" on 2026-09-30, are **stale in their
> state**: U7's own close-out and the archive of `milestones/M7B-u-shaped-rooms.md` (still headed
> *planned*) are not evidenced in this repository's files and are **not reconciled here**. A session
> that needs M7B's final state reads `git log` and that plan, not the entries below.
>
> **Commits** (each hash read from the branch's reflog): `8269440` C1 S1, the desktop Step 1 footer
> controls vertically centred (FB-007, FB-009); `21c702b` C1 S2, the L-shape corner question reworded in
> `ro` and `ru` (FB-008; ADR 0113 pointer); `c4eeea6` C4 S1, the base corner return stands on its
> neighbours' lines (FB-006; ADR 0135); `48bbc0c` C4 S2, the corner joint moves, so every corner seam reads
> 0 mm on worktop, front, carcass and plinth at 600 and 700 (FB-006; ADR 0135); `075529b` C2 S1, the
> corner wall unit's builder; `0a1a69a` C2 S2, generated L and U kitchens get the fixed corner wall unit
> on the back wall (FB-004, FB-011; ADR 0110 Amendment O and its pointers). QA's full census for C2 read
> L 245,211 and U 92,781 rooms with 0 findings; logic and clean-code review and a visual check were done.
> `01c40be` C1 S3, the back-to-room link shows on desktop and both back links ask before leaving
> (FB-001; ADR 0104 Amendment D). The browser's own Back button does **not** warn yet: the owner decided on
> 2026-10-01 that it will, as slice **C1 S4** (planned after C5; not built).
>
> **Next, in the plan's and the owner's order:** C3 (the generated top row; in implementation, decided
> and not yet built) → C5 (the fridge gap; decided, not built) → C1 S4 (the browser Back warning) → CE
> (the e2e shards, last by the owner's word, *"e2e do the last after all fixes"*) → C6 (the phase gate,
> then the push and the PR).
>
> **Not run on this branch:** `pnpm check` and `pnpm ci:local`. The full e2e suite has not run; only
> individual e2e specs, run locally by QA during C1 S1 and C1 S3 [relayed]. Nothing is pushed. `main`'s CI run
> 36841795476 has six of seven e2e shards red (M7-FB-012; the log names nine failing tests) and a re-run of
> it was refused for lack of token permission. The e2e specs the C1 and C4 slices added have not run on
> the runner.
>
> **Known consequence, accepted pre-release:** a design stored before ADR 0135 shows a permanent 10 mm
> slit in carcass and worktop at the corner; one depth-changed before C4 S1 stands 5 mm off the wall.
> Backlog 107. **New backlog entries:** 103 to 113 (see `BACKLOG.md`); 108 to 110 are C2's, 111 to 113 are C1 S3's. Backlog 63
> (the hood offered over the corner) is **narrowed, not closed**: it remains on the seeded kitchen, a U of
> 10 m or more, and designs stored before `0a1a69a`. The corner unit's names and prices are placeholders
> awaiting the owner (backlog 109).

> **RESUME HERE — 2026-09-30, superseded by the entry above. M7B waves U0–U6 are DONE — the switch: a U is buildable under
> `APPROVED_ROOM_POLICY` and the card is live, closed at `f06b7af`.** Branch `m7b-u-shaped-rooms`. Origin
> was last pushed at `0729c2f`; the local branch is ahead. Close-out:
> `milestones/M7B-u-shaped-rooms.md`, *U6 close-out — 2026-09-30, at `f06b7af`*.
>
> **U6 commits:** S0 census `7d87c41` (merge `0729c2f`); S1 the switch `cb0bb0c`; QA `064c0e1`; review
> fixes `d5e933a` (merge `f06b7af`). ADR 0133 landed inside `064c0e1` because of a commit race; its content
> is the architect's.
>
> **In progress: U7 S0** (the reload flash, backlog 98; ADR 0133; Full tier plus security). **Then U7 S1 →
> S2 → S3 → S4.** The review fixes' e2e specs (`d5e933a`) have **not yet run in a browser**; the coordinator
> runs them next, with U7 S0.
>
> **At S4 the owner dispatches the `ci` workflow from the Actions tab and opens the single combined PR for
> M7 and M7B himself** (Q-U7-3, verbatim: *"i will make the PR"*).
>
> **Owner answers recorded (relayed selections, 2026-09-30):** a too-short U also gets *"a straight
> kitchen would fit"* (census W23 and flag 1: "Yes, suggest straight (Recommended)"); `room.issue.roomTooSmall`
> keeps its singular "dulapul de colț" for a U ("Keep as is (Recommended)"); backlog 100's six rows stay
> ("Leave them", Q-U7-2). New backlog entries 101 and 102.

> **RESUME HERE — 2026-09-30, superseded by the entry above. M7B waves U0–U5 are DONE — the editor and Step 1 carry a U (behind
> a test witness policy), closed at `8a30dbb`.** Branch `m7b-u-shaped-rooms`, not pushed; `pnpm ci:local`
> has not been run, and the coordinator runs it before U6.
>
> **U5 commits:** S0 `7dfa6de` (merge `664eee6`); S1 `baeac9d`, `b4bfd8b` (merge `739f9e2`); S2 `9424831`
> (merge `2001c55`); QA `0166e7a` (e2e through a PUT-seeded U, Playwright `20 passed`); QA fixes `55aee23`
> (merge `93e2a2b`: marked facing labels, 4 stale U e2e tests restated per Q-U4 (b), the `linear-flow`
> chip-count race); review fixes `212b49a` (merge `8a30dbb`: label width guarded by a glyph-advance table,
> `carriesCornerDirection(shape)` in the domain, `policy` passed through Step 1, a 1A→1F U walk).
>
> **Verification.** Measured by the coordinator at `8a30dbb`: web 279 files / 4887 tests, domain 269 /
> 5542. Implementer-reported: three-adapter 4091; full e2e `540 passed, 2 skipped, 0 failed`. Logic review:
> minor concerns, no blocker, findings 1–4 fixed. Visual review: AC9, AC10 and AC7 (Step 1, 18
> screenshots pixel-identical to `dd9f63a`) PASS; the editor compared by inspection only.
>
> **D14 decided: keep the rig** (wall-C fronts about 3.6% darker than wall B's, RGB 212 against 220;
> `stage.ts` unchanged). The owner was informed and did not object. ADR 0132 Amendment B. The "U6 does
> not start without it" gate is discharged. Close-out: `milestones/M7B-u-shaped-rooms.md`, *U5 close-out
> — 2026-09-30, at `8a30dbb`*.
>
> **Next, in order:** U6 (the switch: approved U bounds with the H3 gate on; the card goes live; casts
> deleted), then U7 (mobile gate, desktop line, e2e, captures, the phase gate). U6 carries four dated
> lines from U5's logic review (S1 (1) `minimumKitchen.isRequired: true`; AC2's 2700/1000/1000,
> 3000/1000/1000, 2700/1600/1600 boundary cases; U7 AC3 "the smallest accepted U"; an e2e walking
> 1A→1D→1F). New backlog items: 98 (seeded-L flash on reload, with a latent cross-request store write),
> 99 (plan-preview label fit limits), 100 (six orphan test-database rows; the owner decides). The
> `crossesOnScreen (C, right)` arm is unreachable in the product; kept and documented.

> **RESUME HERE — 2026-09-30, superseded by the entry above. M7B waves U0–U2, U3a, U3b and U4 are DONE.
> U5 is in progress: S0 and S1 merged, S2 in progress.** Branch `m7b-u-shaped-rooms`, not pushed;
> `pnpm ci:local` has not been run.
>
> **U3b (generating a U), DONE 2026-09-30.** Commits: S0 `939a6ed` (shared U fixtures,
> `u-core-priorities.ts`, one `placedInSequence`, `WallAReadingDirection`, the `FridgeWallLayout` union,
> the `bottleWidthMm` pin), S1 `2e028ac` (`generateKitchen` composes a U; N11.8, N11.9), S2 `5bf8582`
> (uppers and hood, `upper-policy.ts`), S3 `b0cf2cc` (`UMinimumKitchen`, H3 gate in `validateURoom`), QA
> `8775b7c` (green, 0 production defects), and a comment fix commit (`5fb03ed`).
> Domain suite 268 files / 5533 tests (QA's run). Grid: 86,706 composed, 1,728 refused (= H3), spans
> match the plan on all three walls; 97,868 QA boundary rooms, gate ⇔ generator, 0 mismatches. Logic
> review approve (4 minors); clean-code approve (minors; findings 3–7 deferred to U6 as a test-support
> item). Four dated U3b plan corrections (one is the S0 deviation) and the U5 AC6 correction are in
> `milestones/M7B-u-shaped-rooms.md`, *U3b close-out — 2026-09-30*. Two new backlog items: 96 (the
> engine's minimum-kitchen figures omit the 100 mm reserve; latent) and 97 (generation below 2200
> throws; unreachable).
>
> **U5, not closed.** S0 merged at `664eee6`; S1 merged at `739f9e2` (commits `baeac9d`, `b4bfd8b`; web
> 273 files / 4824 tests, measured by the coordinator after the merge); S2 in progress in a worktree.
> U5 AC6 corrected to two leaves per locale. S1 visual-review items for the U5 visual pass: desktop
> 900–1180 px (plan box 190–474 px wide, the stacked fallback does the work, a box shorter than two
> label lines can still overlap) and marked-wall labels (up to about 117 px) not guaranteed apart.
>
> **Next steps, in order:** U5 S2 → U5 QA, review and visual (AC9–AC11; D14's lights are owed before
> U6) → U6 → U7. Not pushed; `ci:local` not run.

> **RESUME HERE — 2026-09-29, superseded by the entry above. M7B waves U3a (the U plan, closed at `38d6be7`) and U4 (drawing
> a U, adapter, closed at `7f129fa`) are DONE. U3b S1 is in progress (ADR 0110 N11.8–N11.9 plus
> generation).** Branch `m7b-u-shaped-rooms`, not pushed; `pnpm ci:local` has not been run.
>
> **U4.** Commits: S1 `a638f0a`, S2 `a090398`, S3 `b3c9e10`, merged at `7de0bd8`; QA round 1 `e223e44`
> (RED: the camera eye stood behind the opposite wall in narrow Us); adjudication `ab6d285` (ADR 0132
> Amendment A); fix `e752ac3`, merged at `df91e82`; QA round 2 `60d4875` (RED: wall A was not cut), fix
> `cde76ea`, merged at `9178de8`; adjudication `4eb5058` (ADR 0132 A8); round 3 `4a0d63c`, merged at
> `91ae4d3`; QA round 3 `9263a70` (RED: a U's recorded cut was re-applied to an L); round 4 `2a13d4f`,
> merged at `7f129fa`. **Coordinator's run at `7f129fa`:** three-adapter 112 files / 4090 tests green.
> **Implementer-reported, not re-run:** web 269 / 4760 green. Logic review round 3: "minor concerns", the
> round-2 blocker resolved (0 sight lines cross an uncut zone over 223,686 room-depth cases);
> clean-code approved with minors. Q-U4-cam "Hide them" (ADR 0132 A8.3). RQ26 answered "Two doors from
> 500 (Recommended)" (a relayed selection): the 400–499 fill cabinet keeps one door, ADR 0035 decision 4
> stands (ADR 0110 N11.9). **Deferred to U5, named in the milestone file's *U4 close-out* and ADR 0132
> A8.7:** S2 (5) widened to every camera change, `designRoom`/`cabinetDepthMm` change, new `stage` and
> overlay mount; `room: designRoom` at `kitchen-stage.tsx:359`; the S0 clean-up list; the visual
> items AC2, AC4 [visual], AC5 and the D14 light rig (U5 AC9–AC11, owed by U5's close; U6 depends on
> them). Known LOW limits (eye height, the W < 1.91 m band) are in A8.7.
>
> **U3a.** Commits, in order: S1 `d3db323`, S2 `9ca72bb`, S3 `e443ed2`; RQ18 fix `44ad180`; N9 fixes
> `711d3d0`; RQ19 (a) `84bab2e`; N10 `3f53a62`; QA `79f84ca` and its guard fix `6527ba3`; N11 fix
> `27e28da`; QA round 2 `76392f0`; B0 invariant `0b1ef7e`; clean-code refactor `38d6be7`. Architect
> docs: `10212fd`, `5055cf8`, `b0f6e83`, `458cbaa` (ADR 0110 N9, N10, N11). QA round 1 green at
> `79f84ca` and round 2 green at `76392f0`, 0 production defects in each. Logic review: round 1
> changes required (4 findings, all ruled in N11); round 2 approve, one test-coverage minor, fixed in
> `0b1ef7e`. Clean-code review: round 1 changes required; round 2 approve with minors. Full
> close-out: `milestones/M7B-u-shaped-rooms.md`, *U3a close-out — 2026-09-29*.
>
> **Measured by the coordinator at `38d6be7`:** domain 253 files / 5407 tests green; the L/straight
> digest `3ed0b98c…3fd1` unchanged (AC4); the plan digests byte-identical across the refactor; grid of
> 86,706 rooms composed, largest bare end 500/500/500, drawer histogram
> 4968/27118/13172/14572/9937/16939. **Implementer-reported, not re-run by the scribe:** three-adapter
> 108 / 4038 and web 269 / 4760 green.
>
> **Owner answers recorded:** RQ18–RQ23; the tall oven is always kept; wall A "Drawer cabinet wins";
> "Pantry wins"; RQ23 "Bottle + drawers".
>
> **U3b S0 (superseded: U3b is now at S1, per the head of this entry)** carried the clean-code round-2 minors: test fixtures, `u-core-priorities.ts`,
> one placement helper, the single run-direction fact, a `FridgeWallLayout` union, the `cornerOf`
> comment reflow, and the `bottleWidthMm` = 300 pin. **Still open as a minor and not in S0:** the
> literal `2700`/`1000` in `APPROVED_U_FLOOR_MM`, deferred to U6. **Owed by U3b S1 (N11.6):** in
> 30,450 rooms with the fridge on C, wall A's remainder sits at its low end; the plan carries only
> widths, so U3b's generated positions must equal the plan's (U3b AC1).
>
> ~~M7B U4 … Not closed: round 3, then QA and review.~~ **Superseded: U4 closed at `7f129fa`; see the
> U4 paragraph above.**
>
> **Next steps, in order:** (1) U3b S1 (N11.8–N11.9 plus generation), then S2 and S3, each with QA and
> review; (2) U5, S0 first; (3) U6, then U7. The branch is not pushed and `ci:local` has not been run.

> Also note (owner direction, 2026-09-29): agents must now run on the model their `.claude/agents/*.md`
> file declares, passed explicitly at dispatch. The developer for U1–U3a ran as a named teammate
> without an explicit model and may have run on the session's Opus model rather than its declared
> Sonnet; from now on the model is set explicitly. Detail: `docs/best-practices/agent-coordination.md`,
> *Dispatch on the model the role card declares, passed explicitly*.

> **RESUME HERE — 2026-09-29. M7B wave U1 is DONE — the stored U and wall C in the domain; no shape
> validates yet.** Branch `m7b-u-shaped-rooms` (wave base `0e6d332`), not pushed. Commits, in order,
> all with hooks: S1 schema and wall identity `f1d4813` (also pulls three `apps/web` data arms forward
> from U5 S1 so web stays green: `SHAPE_SHORT_MESSAGE_KEY.U`, `DESIGN_ROOM_LENGTHS.U`,
> `display-order-convergence`); S2 storage bounds `7e3b99d` (`MAX_PLACEMENTS` 186→279,
> `MAX_EMPTY_COLUMNS` 1262→1893, `MAX_COLUMN_EXTENTS` 186→279, `MAX_DESIGN_BYTES` 349,656→523,972; no
> migration arm owed, ADR 0053); S3 wall C's world geometry `54501bb` (α: origin `(W,0,0)`, +Z, front
> −X, yaw −π/2; column keys prefix the wall letter; room width threaded as a number, not `DesignRoom`);
> S4 validation and display `c25e5a4` (the A∩C corner sweep; B and C never corner partners;
> across-room bound `max(depth, wallC)`); QA tests `c45cbdb`; review round 1 fixes `836a4f3` (R1.1
> `widthM` → `roomWidthM`; C1.1 a shared `assertGeneratedOnTwoWalls` helper; R1.2 the one-reader scan
> allows `design.ts` exactly once). Tier **Full** plus security on S2. S3 touched 6 production files,
> over the 5-file limit, named in the plan and recorded in the dispatch.
>
> **QA green, no production defects.** AC1: 18,203 L/straight rooms compared base vs tip, 0 mismatches,
> `kitchen-parts.ts`/`reference/` diff empty. AC2: 13,628 old documents identical. AC6: a
> mirror-equivariance property, 1000 runs, reviewed `mirrorUDesign` utility, sabotage both ways
> confirmed. One `it.fails` pins that wall C does not slide on a depth change (D9), owed by **U2 S3**.
>
> **Reviews:** logic — approve (R1.1, R1.2 fixed; R1.3 notes AC6 ran on arbitrary U documents and a
> restated fixture, not generated U kitchens — re-run on real U shells in **U2-A2**; R1.4 is a
> disagreement, not a bug: the A∩C sweep also fires on L/straight documents where a stray wall-C span
> gets an extra mark-severity finding — AC2 is not at risk; gating on `wallsOf` is optional, recorded,
> not done). Clean-code — approve (C1.1 fixed). Security — pass, three Low/Info findings recorded
> below and in the backlog (91's neighbours, 92–95).
>
> **Coordinator verification at `836a4f3`:** domain 238 files / 5116 tests passed; three-adapter 98 /
> 3642; persistence 33 / 730; web 269 / 4760; `kitchen-parts`/`reference` diff against `0e6d332` is 0
> bytes. `pnpm ci:local` **not yet run** — it runs before the branch's first push.
>
> **Next wave: U2** — the right corner, the U shell, engine limits and depth change (plan § Wave U2).

> **RESUME HERE — 2026-09-29. M7B wave U2 is DONE — the right corner, the U shell, engine limits and
> depth change; still no shape validates in the product.** Branch `m7b-u-shaped-rooms` (wave base
> `8e3cf5c`), not pushed. Commits, in order, all with hooks: S1 the right corner (synthesized L room
> `(W, C)`; wall B relabelled to wall C; X-leg at `W − leftCentre`; `cornerOf`;
> `twoCornersWallAMinimumMm` = 1800) `c14abb4`; S2 the U shell and engine limits (`buildUShellDesign`;
> wall C reuses wall B's tiling plus F7's 100 mm reserve; `ENGINE_ROOM_LIMITS.U` derived;
> `validateRoomInput` gains a U arm; `generateKitchen` refuses a U; the implementer found and fixed a
> 1 mm mid-wall gap for an odd wall A) `065658f`; S3 depth change (`cornerTakingWallsOf`; wall C slides
> the way wall B does) `5e53682`; QA tests `7efbf2b`; review round-1 fixes `7140eee`. Tier **Full**.
>
> **QA green, no production defects.** Oracles: self-mirror through `mirrorUDesign`, 200 samples plus
> about 80 boundary rooms. AC6 byte identity: 18,203 compared, 0 mismatches; old documents 13,628
> identical. **Backlog 94 (R1.3 from U1) is discharged**: AC6's mirror property now runs on real
> `buildUShellDesign` outputs, zero findings, voids mirroring.
>
> **Reviews:** round 1, logic — changes required, all fixed in `7140eee`. **R1.1, High, a real defect
> QA missed:** `cornerOf` reported an approved L's only corner as "right" at wall A ≤ 900 mm, even
> length — customer-reachable (min 900) and U4 would have mirrored it; fixed so any non-U room answers
> "left", with a regression test at 880/900/901. R1.2: `isShapeBuildable` accepted prototype-named
> tags (predates U2), fixed with `Object.hasOwn`. R1.3: two sources of truth for corner-taking walls —
> `WALL_THE_CORNER_IS_TAKEN_FROM` retired from the exports, `ownsTheCorner` and `slideReserveMm` now
> read `cornerTakingWallsOf` (discharges ADR 0132 d7). R1.4: D11 is now an explicit `shape === "U"`
> guard in `runEndPanelSeatM`. R1.5: a comment fix. Clean-code, changes required, fixed in `7140eee`:
> C1.1 one shared `roomForTheRightCorner`; C1.2/C1.3 shorter shell functions; C1.4 one
> `apps/web/tests/support/fabricated-u-policy.ts`. **Round 2 logic review: approve, no findings** — one
> accepted gap, no direct `slideReserveMm` wall-C test because it is private and unreachable, **owed to
> U3** once its composer builds a wall-C run.
>
> **Coordinator verification at `7140eee`:** domain 243 files / 5238 tests (built fresh); three-adapter
> 98 / 3642; persistence 33 / 730; web 269 / 4760; the `kitchen-parts`/`reference` diff against
> `8e3cf5c` is 0 bytes. `pnpm ci:local` **not yet run** — it runs before the branch's first push.
>
> **Next wave: U3** — composing a U across three walls (plan § Wave U3). It waits on no owner answer;
> RQ1–RQ17 are all answered. U3 also owes the direct `slideReserveMm` wall-C test (round-2 review's
> accepted gap).

> **RESUME HERE — 2026-09-29, later the same day. M7B wave U0 is DONE.** Branch
> `m7b-u-shaped-rooms`, created from M7's `m7-room-and-presets` tip at `5462a6c` (M7's PR is not yet
> merged to main; the new branch is not pushed yet). Commits, in order: plan `dd9f63a`; U0 `3e76ea6`
> (census, measurements, ADR 0132 Accepted, owner answers Q-U1–Q-U5 and RQ1–RQ12 recorded in ADR 0108
> Amendment H, ADR 0110 Amendment N, ADR 0104 Amendment C, backlog 91); owner answers RQ13–RQ17
> `5462a6c`. Both docs commits ran with hooks; the hook's build steps passed. Tier **Light**, one logic
> reviewer, no blockers — its minor findings were folded into `3e76ea6` and `5462a6c` directly.
>
> **Branch state (owner ruling, 2026-09-29):** `dd9f63a`, `3e76ea6` and `5462a6c` were made on
> `m7-room-and-presets` before `m7b-u-shaped-rooms` branched from it at `5462a6c`, so the local M7
> branch holds those 3 M7B docs commits above `5fbcad7` (M7's true tip), while origin's
> `m7-room-and-presets` is still at `8e7b59f`. Offered a reset of the local M7 branch to `5fbcad7`,
> **the owner said: "keep like this."** Pushing `m7-room-and-presets` as it stands will carry the M7B
> docs commits into M7's pull request. See `milestones/M7B-u-shaped-rooms.md`, *Branch*.
>
> **Key outcomes** (detail in `milestones/M7B-u-shaped-rooms.md` and ADR 0132): wall C is a world wall,
> and only the four right-corner pieces are drawn in a reflection (α); wall A's approved minimum is
> 2700 mm (1200 mm walkway + 2 × 748); the owner's U composition — fridge on the wider side wall,
> counted from the corner; sink on the back wall; a 10 m large-U threshold; one oven tower; the
> corner-direction toggle is hidden for a U. **No wave now waits on an owner answer.**
>
> **Next wave: U1** — the stored U and wall C; domain; Full tier plus security on S2. S1 was
> dispatched 2026-09-29. See `milestones/M7B-u-shaped-rooms.md` for scope.

> **RESUME HERE — 2026-09-29. M7 is closed.** Its build sequence (`… → 7J → 7K → 7L`) is complete,
> Gate M7-C is withdrawn (ADR 0113), and both decision records the close required now exist: ADR 0131
> (the preset-path deferral past M8) and ADR 0104 Amendment B (Q-7L-1's answer). Full summary: the
> `M7 — Screen 1…` banner near the top of this file. The archived plan is
> `milestones/done/M7-room-and-presets.md`; do not open it except for a historical question.
>
> **Next milestone: M7B — U-shaped rooms**, confirmed by the owner as its own phase between M7 and
> M8 (`milestones/README.md`). ~~No plan is written for it yet — that is the next planning task, not an
> implementation to start from an existing dispatch. Read `milestones/README.md` for the phase
> sequence and cross-cutting rules before drafting it.~~ **Plan written 2026-09-29:
> [`milestones/M7B-u-shaped-rooms.md`](milestones/M7B-u-shaped-rooms.md) — eight waves, U0–U7. Next:
> wave U0** (the census, the measurements the owner questions need, ADR 0132, and putting Q-U1–Q-U5
> to the owner); U0 changes no production file. The preset story (search, evaluation,
> application, the thumbnail rig) is deferred past M8 by ADR 0131 and is not part of M7B.
>
> **Still outstanding, carried from M7 and earlier, none of it blocking M7B's planning:** the runner's
> own CI verdict for several waves (see the M7 table row and earlier RESUME HERE entries below for the
> exact list — one owner-dispatched `workflow_dispatch` of `ci.yml` settles them); the `.env*.local`
> file-layout cleanup the owner asked for after the migration mix-up during 7J (not started); two
> camera-framing follow-ups noted at 7J (not blockers, not scoped to a wave); the desktop-suggestion/
> phone-clause redundancy at 1C flagged during 7L (a UX observation for the owner's eventual judgment).

> **RESUME HERE — 2026-09-24. M7 wave 7I is DONE — mirrored right-hand L; a mirror that works on one
> group.** Commits, in order: plan + ADR 0129 `4ff2d64`; S1 domain `95c5ad4`; S2 adapter `e653efb`;
> S3 stage/URL/copy `bf3716a`; S4 capture + e2e `250efb7`; QA fixes + QA tests `a20085a`; review
> fixes `f653bdf`; comment-only `HEAD` (the commit after `f653bdf`). All with hooks except the plan
> commit (`--no-verify`, docs). Tier **Full**, visual **Yes** (confirmed in the plan).
>
> **What shipped:** the domain gains an optional `room.cornerDirection: "left" | "right"`, absent
> means left, read by exactly one query (`cornerDirectionOf`); generation, commands, columns and the
> body probe stay canonical (left-hand) regardless of direction. The adapter mirrors with one
> primitive, `applyCornerDirection(group, direction)` — a reflection in the group's own local X,
> settable on the scene root (the whole kitchen) or on one structural corner group alone, which is
> what M7B needs for the U shape. Face winding, picking, cameras, lights, the selection outline and
> the overflow mark all follow the reflection; the URL (`direction=right`/`left`), the share view and
> the capture route all carry it end to end.
>
> **QA found four defects and held everything else.** Found: the selection outline was invisible in
> a right-hand scene — `LineMaterial`'s screen-space quads never flip winding under a reflected world
> matrix, unlike a mesh, so a one-sided outline was culled entirely (0 red pixels vs >200 on the left
> twin); fixed with a scoped `side: DoubleSide` exception on the outline material alone, recorded as
> an amendment to ADR 0129 decision 5 rather than a silent departure. The contact blob was not
> re-seated on an in-place direction flip; the capture route's lights were not mirrored; a coverage
> gap in `usePanelView`'s direction wiring got a seam test (the real guard is the e2e). Held: left
> documents byte-identical against `fb7c925` (reference room, 8 policy corners, 60 sampled rooms);
> `kitchen-parts.ts`, `reference/`, the parity test, `measure-built-body.ts` and `generation/`
> unchanged; picking matches canonical over 400 random rays; winding reflected; presets bit-exact
> over 200 rooms; hostile `cornerDirection` values refused or treated as left.
>
> **A pre-existing defect was found and corrected as a side effect of building the mirror, not
> introduced by it: wall-B's side words and width-step note were mirrored wrong in every left-hand
> kitchen.** ADR 0129 decision 8 is amended — the side word and the width note cross on screen iff
> `(wall A and right) or (wall B and left)`, proved by projecting +along through each wall's camera
> preset. This **changes left-hand wall-B wording** going forward; `panel.widthStepNoteRight` is the
> swapped note, not a right-hand-only one. Plan criteria A1 and A15 are corrected in the close-out to
> say so — A1's "left render unchanged" still holds for geometry and storage, A15's "left strings
> unchanged" does not hold on wall B.
>
> **Review** folded two clean-code findings (a shared `reseatHoldingCamera` helper; a shared
> `FRAMES_BEFORE_READY` constant) and, across two rounds, five logic findings — the wall-B side word
> (above), camera held across a flip (new test), `seatObjectOnStage` taking a required `direction`,
> a corrected seam-test comment, and A3's one-reader scan widened to adapter + web `src`.
>
> **Gates:** `pnpm ci:local` at `f653bdf` — `LOCAL CI PASSED — all gates green, safe to push`; e2e
> **452 passed (7.0m), 2 skipped**; persistence **29 / 558 passed | 1 skipped**; three-adapter **95 /
> 3,609**; web **263 / 4,693**. The following commit is comments only.
>
> Full criterion-by-criterion record (7I-A1…A18), QA and review detail:
> [`milestones/done/M7-room-and-presets.md`, *7I close-out —
> 2026-09-24*](milestones/done/M7-room-and-presets.md#7i-close-out--2026-09-24).
>
> **Owner actions for this RESUME HERE:**
> 1. Review the new leaf `panel.widthStepNoteRight` (ro/ru), approved as drafted under ADR 0113.
> 2. **Left-hand kitchens' wall-B side words and width-step note now read the other way** — a
>    correctness fix, visible in existing designs, not a regression from this wave.
> 3. D11 (appliances drawn mirrored on a right-hand L) is recorded with its trigger — not built,
>    per ADR 0118's shape: the trigger is the owner objecting on seeing it.
> 4. Dispatch `ci.yml` when convenient (settles 7T, 7F4b, 7E4, 7E3a, 7E3c, 7E3b and now 7I's runner
>    verdicts in one run) — outstanding since 7E3b, unchanged by this wave.
>
> **Next wave: 7J** (straight kitchens). The owner's Q-7J-1 answer (2026-09-23): **one maximum for
> every kitchen shape (linear, L, U) — 6000 mm — unless 7J's planning shows the fill algorithm
> genuinely needs 6300 mm on a straight wall (instead of a corner cabinet it can fit a full-size
> cabinet); otherwise cap all walls at the same maximum.** Then 7K, 7L.
>
> **RESUME HERE (superseded above, kept for its detail) — 2026-09-23, later still. M7 wave 7E3b is DONE — a design opens only in its owning
> browser.** Commits, in order: plan + ADR 0114 Amendment H `239d87f`; S1 `8095718` (`--no-verify`,
> intermediate — web did not compile until S2); S2 `a401a4a`; S3 `09f9c6e`; S4 `00ea1ec`; QA
> `9960ab5`; S5 addendum + H4/H5 `6fe21b3`; S5a HMAC `3c82aec`; S5b `23161e2` (`--no-verify`, one red
> e2e); S6 addendum + H6 `8ffb3b2`; S6a revert `dd36ab8`; S6b Web Lock `38c37c1`; QA round 2
> `2a07509`; review round 2 fixes `f1e4fc9`. Tier **Full + security** (confirmed in the plan). Doc
> commits `--no-verify`. Security reviewer kept across 7E3a, 7E3c and 7E3b (*Review continuity*).
>
> **What shipped:** `/[locale]/d/{id}` and `GET /api/designs/{id}` now gate on the requesting
> browser's visitor hash matching the row's, one indistinguishable refusal for every other case
> (foreign cookie, no cookie, empty, malformed, unknown id, unowned row). Every `POST /api/designs`
> issues a fresh random visitor value and moves the browser's rows onto it in one transaction
> (ADR 0114 H1), closing backlog 81 (cookie fixation). A save refreshes the visitor cookie only when
> its own value still owns the saved row (H3). Tabs of one browser serialise design creation through
> a Web Lock (`lemnaria:create-design`), so the two-tab create race is closed in the browser rather
> than by a server-side secret (H6).
>
> **The wave's own middle was found wrong and reverted the same day, on the record rather than
> smoothed over.** QA measured the owner's first ruling (*"Rotate on mint"*) losing every earlier
> design in 29 of 30 rounds under two concurrent mints, predicted by the logic reviewer. The owner's
> next ruling, unconditional HMAC rotation, was corrected by the coordinator before being put back to
> the owner — it would have reopened backlog 81 by making the server an oracle. The owner's
> *"Conditional HMAC"* (H4) shipped, and security then found it chainable (SEC-7E3b.5, High): poll for
> the rotation, mint within 10 s, follow the victim indefinitely. The owner's final ruling, *"Web Lock
> + random"* (H6), removed the secret and closed the race client-side instead. **No
> `VISITOR_ROTATION_SECRET` exists in the shipped code and none is needed.**
>
> **SEC-7E3b.8 is resolved at this close-out** (ADR 0114 H6's residual): the 29/30 figure and QA's
> re-measured **15/15 raw concurrent fetches from one value lost earlier designs** are the same defect
> from two entry points; the lock's own 10 s acquire timeout is a second route into that race, not a
> separate one; and the claim that a peer mint slower than 10 s *"has almost certainly failed"* is
> **inference** — a cold Neon retry (0.5 s + 1.5 s backoff) plus a serverless cold start make a
> slow-but-live peer plausible (logic reviewer R2.3).
>
> **Residuals, named and not built, each with an owner:** SEC-7E3b.1 (backlog 88) — an attacker's
> rows planted under a fixated value move into the victim's identity on rotation and can surface as
> their newest design; owner to decide record-or-fix. R2.2 / SEC-7E3b.2 (backlog 89) — the Web Lock
> covers only the mint, so a save racing a rotation can revert the jar to a value owning nothing;
> told to the owner, not fixed (widening the lock would contradict the plan's D2). SEC-7E3b.3
> (backlog 90) — the rotation `UPDATE` has no rate limit, deferred to M8's limiter. Pre-`0005` rows
> are unreadable by anyone (ADR 0114 decision 5's stated consequence); their count on preview or
> production is **unmeasured**.
>
> **Gates:** `pnpm ci:local` at `f1e4fc9` — `LOCAL CI PASSED — all gates green, safe to push`; e2e
> **448 passed (6.5m), 2 skipped**; persistence **29 / 558 passed | 1 skipped**; three-adapter
> **92 / 3,553**; web **260 / 4,653**.
>
> Full criterion-by-criterion record, including §5's criteria and §9's S6-1…S6-6:
> [`milestones/done/M7-room-and-presets.md`, *7E3b close-out —
> 2026-09-23*](milestones/done/M7-room-and-presets.md#7e3b-close-out--2026-09-23).
>
> **Owner actions for this RESUME HERE:**
> 1. Before deploy — preview then production, in order: migration `0005`, migration `0006`, the
>    `design_share_links` grant (unchanged from 7E3c). **No** `VISITOR_ROTATION_SECRET` — the wave
>    that would have needed it was reverted the same day.
> 2. Confirm whether `vercel env add VISITOR_ROTATION_SECRET` was ever run during the reverted
>    window. If it was, ADR 0006's add-only rule means the variable stays, orphaned, until the owner
>    removes it — no agent action.
> 3. Dispatch `ci.yml` (settles 7T, 7F4b, 7E4, 7E3a, 7E3c and now 7E3b's runner verdicts in one run).
> 4. Decide backlog 88 (SEC-7E3b.1): record acceptance, or have resume prefer browser-minted rows.
> 5. Note backlog 89 (R2.2 / SEC-7E3b.2), the save-vs-rotation race — informational, not blocking.
> 6. Review the new leaf `designLoadError.bodyUnavailable` (ro/ru), approved as drafted under
>    ADR 0113 and open to the owner's later wording.
>
> **Next wave: 7I** — mirrored right-hand L, per the recorded order `7I → 7J → 7K → 7L`.
>
> **RESUME HERE (superseded above, kept for its detail) — 2026-09-23, later still. M7 wave 7E3c is DONE — the private share link.**
> Commits, in order: plan + ADR 0114 Amendment G + ADR 0008 note `f59d79b`; S1 `2565e19`; S1 screen
> fix (SEC-7E3c.1/.2) `ffb5484`; S2 `553031d`; S3a `ebb2d1c`; S3b `783a07d`; S4 `a20d577`; S5
> `0cc3e4a`; S6 `2260d44`; QA fixes + QA tests `8fafe82`; review round 1 `c9a2ccd`; review round 2
> `03ffd4a`; screen notes `b39983d`. Tier **Full + security** (confirmed in the plan). All commits
> made with hooks except the plan commit (`--no-verify`, docs only). Security reviewer kept across
> 7E3a, 7E3c and 7E3b (*Review continuity*).
>
> **What shipped:** a 12-character base62, rejection-sampled share token (`ALPHABET = 0-9A-Za-z`,
> four preimages per character), stored only as its SHA-256 hex digest, with one active link per
> design enforced by a partial unique index. `POST /api/designs/{id}/share` issues a link only with
> both the design's write token and the owning visitor cookie, revoking any prior active link in the
> same transaction; `DELETE` revokes; `GET` reports status. Every credential failure answers the
> byte-identical 404 a missing design gives. `/[locale]/s/{token}` renders the design read-only with
> `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private,
> no-store`; it holds no design id, no visitor cookie and no write token, sets no cookie but
> `NEXT_LOCALE`, mints nothing and runs no write-access probe. Revocation is immediate: the next
> request after a `DELETE` gets the unavailable response, and a re-issued link works while the
> revoked one never does again. Migration `0006` adds `design_share_links` (token hash PK, `design_id`
> FK `on delete cascade`, `created_at`, `revoked_at`), read back against its own contract.
>
> **The migration screen (`migration-safety.ts`) was the wave's main finding** — it gates unattended
> `deploy.yml` runs. Bypasses found and fixed, each measured (QA against the test DB inside
> rolled-back transactions; security via scratch probes): SEC-7E3c.1 `'--'` inside a string hid a
> following `DELETE` (pre-existing); SEC-7E3c.2 a parenthesised `CREATE TABLE AS SELECT`; QA's Q1
> (High) E-strings, `$`-ending identifiers, nested block comments and tagged dollar quotes, fixed
> **fail-closed** — the screen now refuses any construct it does not model rather than trying to
> parse it; Q2 a second CTAS shape; SEC-7E3c.7 (High) a bare carriage return ends a `--` comment
> under Postgres; SEC-7E3c.8 (High, pre-existing) any DO body mentioning `pg_constraint` was accepted
> including dynamic SQL via `execute`/`format`/`||`; SEC-7E3c.9 `insert … select` and `inherits`;
> SEC-7E3c.10 (High) the new DO template's greedy check capture spanned statements (RLS enable,
> revoke, grant, owner change); SEC-7E3c.11–.14 function calls inside checks/defaults/inline
> add-column checks, comment-split calls inside a DO body, and a qualified-name allowlist. **Security's
> final verdict: the screen approved at `03ffd4a`**, with notes .12–.14 closed at `b39983d`. All
> shipped migrations `0001`–`0006` still pass the screen; no migration's bytes changed. The screen is
> a guard against mistakes, not a hostile committer (the reviewer's framing).
>
> **Other review/QA findings, fixed:** SEC-7E3c.4, `issue()` relied on READ COMMITTED — isolation
> pinned to `isolationLevel: "ReadCommitted"`; L1.1, the share control's error retry always re-issued
> (would silently kill a sent link) — it now retries the operation that failed, labelled by it (new
> leaf `share.retry`, ro *"Încearcă din nou"* / ru *"Повторить"*); L1.2, *"Copiat"* showed before the
> clipboard write resolved — now only on resolve; L1.3, a new e2e share view test; Q3, a refused
> `issue` could revoke the owner's link — test added; Q4, a proxy test asserted against its own
> constant, now literal values. Clean-code: no actionable findings.
>
> **Coordinator rulings, on the record:**
> (a) criterion 10 — a *malformed* token's not-available page differs from an unknown/revoked one
> only in RSC flight-chunk framing (no query, per D6); accepted because the token format is public,
> and unknown vs revoked measured byte-identical on `next start` (QA 10/10). The criterion's wording
> listed malformed tokens; the ruling narrows it. Security upheld.
> (b) trailing-slash `/ro/s/{t}/` gets Next's own headerless 308 before the proxy runs — accepted,
> filed to the backlog. Security upheld.
> (c) the dev-only React *"Cannot update a component while rendering a different component"* warning
> on a client-side transition between two hydrated designs is pre-existing in `HydrateAndConfigure`'s
> render-time hydrate pattern, reproduced there too — filed to the backlog, not observed on `next
> start`.
>
> **QA (Full):** e2e both projects **413 passed, 2 skipped**; the new e2e spec, **12 tests (+
> `--repeat-each=10`, 40 passed on `CI=1`)**; the reported `global-colour` flake did not reproduce
> (2 full runs, 6 repeats, 6-worker stress). Sabotage red/green confirmed on: the `issue` credential
> predicate (both statements), not-found identity, no-id guarantee, no-referrer, the screen's quote
> handling [QA-reported].
>
> **Visual (production build, 390×844 touch, ro+ru):** J1–J5 PASS — create → shown once → *Copiat*;
> reopen → active + re-issue + revoke; a fresh context on `/s/{t}` → 307 → `/ro/s/{t}` 200 read-only,
> no edit/save/depth/Step 1/*"Verifică designul"*; headers measured `referrer-policy: no-referrer`,
> `x-robots-tag: noindex, nofollow`, `cache-control: private, no-store` on the redirect and the page;
> the jar holds only `NEXT_LOCALE`; no design id in the HTML; re-issue kills the old link, revoke
> kills the new one on the next request (*"Nu am putut deschide acest link"*). **J6 PARTIAL:** a
> non-owner's `/d/{id}` has no share section, verified; the never-saved-design case is unreachable via
> UI and covered by the DOM test only. Desktop spot-check not done. Evidence in
> `apps/web/testing-reports/7e3c/` (gitignored). Test-DB rows: `qYzuOaa-oNtXkuZD3Z2nG` (3 tokens, all
> revoked), `7-A1RdjKcCcmFZs_nsyq1`.
>
> **Incident, recorded plainly:** during visual setup the verify agent mis-parsed `.env.test.local`
> with shell `cut`; the app's error handler printed the **test database connection string** once to a
> local log file and to the agent's tool output. The agent deleted the log and switched to
> `loadEnvLocal()`. It is the allowlisted test DB, not production. Whether to rotate its credential is
> the owner's call — resources are add-only, and agents do not rotate them.
>
> **`pnpm ci:local` at `b39983d`:** `LOCAL CI PASSED — all gates green, safe to push.` — e2e **414
> passed (5.9 m), 2 skipped**; persistence **29 files / 535 passed | 1 skipped** (D9's conditional
> grant test, skipped by design because the table doesn't exist on the `DATABASE_URL` database);
> three-adapter **92 / 3,553**; web **255 / 4,608** [measured].
>
> **New backlog entries** (`docs/backlog/open.md`, `docs/BACKLOG.md` index) — 82–87: the trailing-slash
> 308 (ruling b); the render-time hydrate warning (ruling c); SEC-7E3c.5, the platform's own error
> logger may print a Postgres `detail` carrying a token hash on a PK collision (our own log lines are
> clean); SEC-7E3c.3, optional hardening — `GRANT UPDATE (revoked_at)` instead of table-wide `UPDATE`;
> criterion 9's leak scan did not exercise a camera preset (L1.5); visual J6's never-saved-design case,
> unreachable via UI, covered by the DOM test only.
>
> **Owner actions for this RESUME HERE:**
> 1. **Preview then production:** apply `0005` and `0006` (ledger 1–4 → 1–6), then `GRANT SELECT,
>    INSERT, UPDATE ON TABLE public.design_share_links TO app_designs;`, and read both back —
>    **before** deploying. Without them every mint/resume (`0005`) and every share operation (`0006` +
>    the grant) answers 500. After the grant, D9's conditional test stops skipping and must go green.
> 2. Dispatch `ci.yml` (settles 7E4, 7E3a, 7E3c, 7T and 7F4b runner verdicts in one run).
> 3. Decide backlog 81 (SEC-7E3a.1) before 7E3b starts.
> 4. Decide whether to rotate the test DB credential, per the incident above.
> 5. Review the 13 new share strings (ro/ru) — the 12 from D10 plus `share.retry`.
>
> Full criterion-by-criterion close-out:
> [`milestones/done/M7-room-and-presets.md`, *7E3c close-out —
> 2026-09-23*](milestones/done/M7-room-and-presets.md#7e3c-close-out--2026-09-23).
> [ADR 0114](decisions/0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
> Amendment G now carries this wave's commit hashes.
>
> **Next wave: 7E3b** — a design opens only in its owning browser, Full tier plus security, gated by
> the backlog-81 decision above.
>
> **Push is pending at the time of writing; the coordinator pushes after this record.**

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-23, later the same day. M7 wave
> 7E3a is DONE.** Commits, in order: plan +
> ADR 0114 Amendment F `046755e`; S1 `ca5d975`; S1 security fixes `49c4672`; S2 `1619715`; S3
> `15e18df`; S4 `e2d95ef`; QA tests `0d53a06`; review round 1 fixes `1ae9f32`. Tier **Full +
> security** (confirmed in the plan). Every commit made with hooks (no `--no-verify`). Security
> reviewer kept across 7E3a, 7E3c and 7E3b (*Review continuity*). **Push is pending at the time of
> writing; the coordinator pushes after this record.**
>
> **What shipped:** the `__Host-lemnaria_visitor` cookie (`Path=/`, `Max-Age=2592000`, `Secure`,
> `HttpOnly`, `SameSite=lax`, no `Domain`) is minted on the first successful mutation, reused across
> mints, refreshed on every successful save and cleared when it matches nothing. `/[locale]` and
> `/[locale]/configurator/configure` are now Route Handlers, `GET` only, resolving through one shared
> resume handler (`export { resumeVisitorRoute as GET }`) that answers a relative `307` — to the
> owner's design at `/{l}/d/{id}`, or to room, with `Cache-Control: private, no-store` and CSP on
> every hop. Migration `0005` adds `designs.visitor_hash` (nullable, `sha256hex`-checked) and its
> index; cross-site mint attempts (`Sec-Fetch-Site` not `same-origin`, or a foreign `Origin`) are
> refused with 403, no cookie and no `mint` call.
>
> **Incident, recorded plainly:** during S1 the implementer ran
> `packages/persistence/tests/migrate.test.ts` believing it non-live; `vitest.config.ts`'s
> `loadEnvLocal()` loads `TEST_DATABASE_URL`, so `0005` was applied to the **test database**
> (`lemn-conf-v2-staging`, ADR 0006's destructive target) before the security mini-gate read the SQL.
> The reviewer then required two header-comment edits (a false "re-runs every file" claim, an
> unverified "five production rows" claim) and a restore round-trip test. The test DB ledger was
> repaired with `forgetAppliedMigrations([5])` + `runMigrations` — checksum `26df252d…` →
> `822cba5d…`, no `MigrationChecksumMismatchError` [implementer-reported]. **No preview or production
> database has run `0005`.** Lesson: every persistence Vitest file is live in a checkout with
> `.env.test.local`; "non-live" must be established by the file's gate, not its describe block.
>
> **QA (Full):** no production defect found. 3 new web test files (39 + 50 Vitest, 13 e2e) plus live
> repository/backup tests. Measured: Chromium **does** store a Lax cookie from a cross-site
> top-level-navigation `POST` response — D6's guard is load-bearing (guard off → 201 and jar
> replaced; guard on → 403, jar unchanged). Sabotage red/green confirmed: `clearVisitorCookie` →
> `cookies.delete` (red in browser and Vitest), `secure: false` (red), the D6 guard disabled (red)
> [QA-reported].
>
> **Review:** clean-code, no must-fix (the shared resume handler above was C1.1's fix). Logic, no
> production defect — four findings fixed: L1.1, `SET LOCAL enable_seqscan` moved inside its own
> `sql.transaction`; L1.2, `configure-screen-single-mount.test.ts` now guards `<ConfigureScreen`
> mounting only in `hydrate-and-configure.tsx` (sabotage red); L1.4, CSP asserted on the found branch
> and both hops of unprefixed `/` and `/configurator/configure`, ro and ru; L1.7, the contact back
> link is `prefetch={false}`. **L1.6, coordinator's ruling, recorded not changed:** an empty
> `__Host-lemnaria_visitor=` value is treated as absent (no clear, no query) — this cannot arise
> since the server never sets an empty value with `Max-Age > 0`.
>
> **Two items filed to the backlog, not fixed here** — see
> [`docs/backlog/open.md`](backlog/open.md) entries 80–81 and the index: **L1.3**, the store's
> mint-on-first-command branch (ADR 0010's path) has no reaching route since 7E3a and needs its own
> dated retirement record; **SEC-7E3a.1**, gates 7E3b — a same-host script can plant a well-formed
> non-`HttpOnly` visitor value in a fresh browser and the next mint adopts it (D1 reuse), harmless
> under 7E3a but durable read access under 7E3b. **Must be decided before 7E3b ships.** The security
> reviewer's SEC-7E3a.2/.3 are notes, not blockers: D6 is acceptable as designed; a resume miss
> clears the cookie permanently, so a pre-`0005` restore or a wrong-database branch would orphan a
> returning visitor (the restore runbook covers this).
>
> **Visual (Light), 390 × 844, ro/ru + a desktop spot-check, against the test database at
> `1ae9f32`:** five journeys PASS — fresh `/` → Step 1 → editor; resume via `/`,
> `/ro/configurator/configure`, `/ru`; most-recent-wins after an edit plus a second mint; the contact
> back link resumes; cleared cookies land on Step 1 with no error page. Evidence in
> `testing-reports/7e3a/` (gitignored). Rows created in the test database: `aHY5Soe9q6one_l50692K`,
> `20uXjLpCk6Gli7zrzoKSZ`, `EMDHPB7Z37Z5TXJAIw2cg`. **Not verified:** WebKit, Firefox, a real device.
>
> **`pnpm ci:local` at `1ae9f32`:** `LOCAL CI PASSED — all gates green, safe to push.` — e2e **400
> passed (5.6 m), 2 skipped** (pre-existing); persistence 27 / 437; three-adapter 92 / 3,553; web
> 246 / 4,502 [measured].
>
> **The runner's own CI verdict is outstanding**, same structural gap as 7T, 7F4b and 7E4 — needs
> the owner's `workflow_dispatch` of `ci.yml` on `m7-room-and-presets` (the same run settles 7E4, 7T
> and 7F4b too). **Note: CI's e2e run will run against the shared test database, which already has
> `0005` applied — from the incident above, not from a deploy.**
>
> **Owner actions, prominently, because the first blocks a deploy:**
> 1. **Apply migration `0005` to `lemn-conf-v2-preview`, then production**, through `deploy.yml` or
>    `migrate` + `migrate:status` (ledger 1–4 → 1–5), **before this branch deploys** — until then
>    local `pnpm dev` (which points at preview, ADR 0054) answers 500 on every mint and every
>    cookie-carrying resume.
> 2. Dispatch `ci.yml`.
> 3. Decide SEC-7E3a.1 (backlog) before 7E3b ships.
>
> Full criterion-by-criterion close-out:
> [`milestones/done/M7-room-and-presets.md`, *7E3a close-out —
> 2026-09-23*](milestones/done/M7-room-and-presets.md#7e3a-close-out--2026-09-23).
> [ADR 0114](decisions/0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
> Amendment F now carries this wave's commit hashes, and records — per the security reviewer — that
> decision 5 (a design opens only in its owning browser) is **not yet enforced**; that is 7E3b.
>
> **Next wave: 7E3c** — the private share link (create, revoke, re-issue; `/[locale]/s/{token}`),
> Full tier plus security, visual **Yes**. Then **7E3b**.

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-23. M7 wave 7E4 is DONE.** Commits, in order: plan `4d65a6f`; S1
> `64e8894`; S1 QA spec `99fd679`; S2 + Q1/Q3 `740142b`; S3 `d00212a`; QA round 2 fixes (Q5–Q7)
> `708d3b8`; review round 1 fixes `734a5e3`; review round 2 fixes `1b512bb`. Tier **Light** —
> adversarial QA ×2 rounds, one combined reviewer ×2 rounds, no visual pass. Every commit made with
> hooks (no `--no-verify`). **Push is pending at the time of writing; the coordinator pushes after
> this record.**
>
> **What shipped:** the e2e suite and its tooling stop opening `/configurator/configure` as a test
> origin. `rtk proxy git grep -nE '(^|[^p])/configurator/configure' -- apps/web/tests/e2e
> apps/web/playwright.config.ts apps/web/scripts packages/three-adapter/tests` prints only
> `configure-route.e2e.spec.ts:12` and `:20` [measured at `d00212a`; reviewer re-ran at `708d3b8`].
> Every other remaining spec opens a seeded `/d/{id}` via `mintSeededDesign`. `playwright test
> --list` mobile went **274 tests / 31 files → 283 / 33** (desktop unchanged, 84 / 9); the only title
> removed against the base was the planned rename of `locale-routing.qa`'s "localized roots and all
> five customer entrypoints are real runtime routes" [measured]. **Criterion 2's letter is met only
> with one recorded exception, by the coordinator's own ruling (Q6):** per-file `expect` counts fell
> in eight files where unfailable `not.toBe("")` padding and pure duplicates of
> `waitForFirstSave`'s own check were removed, each still enforced by `mintSeededDesign` /
> `waitForFirstSave`'s named throws. `apps/web/src` and `packages/*/src` carry an empty diff
> [implementer + QA reported; reviewer confirmed by reading]; `scripts/verify-surfaces.mjs` is
> deleted, per the plan's D4. New QA spec `seeded-design.qa.e2e.spec.ts` (8 tests) proves distinct
> minted ids, teardown after a failing test, deep equality to `KITCHEN_L_DESIGN`, cookie
> `Path`/`HttpOnly` in the browser jar, no return while `checking`, and a named throw on a foreign
> design; sabotage reproduced red/green both directions [QA-reported].
>
> **Defects found and fixed:** Q5 — editor-rail's delete test stayed green with every PUT/PATCH
> forced to 500 (fixed; sabotage now red). Review round 1 — the S3 migration had dropped
> `SCENE_SETTLE_MS` waits before absence/pixel checks in `overflow-mark`, `global-settings-apply`
> (×4), `global-settings-centred.desktop` (×2) and `global-colour` (×7); restored. Probe-wait logic
> deduplicated into one helper, `openDesignAndAwaitAccessProbe`. `mintSeededDesign` now deletes its
> row before throwing on a malformed 201 response.
>
> **`pnpm ci:local` at `1b512bb`:** `LOCAL CI PASSED — all gates green, safe to push.` — e2e **365
> passed (5.2 m), 2 skipped** (the pre-existing `kitchen-stage` skip and the `global-settings-apply`
> fixme); persistence 27 files / 419 tests; three-adapter 92 / 3,553; web 242 / 4,379 [measured]. No
> local slowdown against 7F2's 5.9 m / 320 tests for a larger suite (365 tests), so the runner's own
> timing is untested rather than at risk on current evidence. **Criterion 6's readiness-probe check
> was met** (`capture:fidelity` after `pnpm build` wrote 9 shots, polling `/ro/d/e2e-readiness-probe`
> [implementer-reported]); **the "no compile on first `/d/{id}`" sub-check was not measured — said
> plainly, not implied passed.**
>
> **Criterion 8 (the runner's verdict) is outstanding**, same structural gap as 7T's criteria 1/18
> and 7F4b's criterion 44: it needs the owner's `workflow_dispatch` of `ci.yml` on
> `m7-room-and-presets`; one run settles all three.
>
> **Found by QA, not fixed — the owner's call under ADR 0006 (resources are add-only):** 16 rows
> leaked in the test database from 2026-09-22 runs, minted before S1 by configure-route specs that
> stored through the design store without registering deletion. The wave itself closes the leak — a
> full run after S3 left 0 rows. Filed as
> [`docs/backlog/open.md` entry 79](backlog/open.md) rather than fixed in place.
>
> Full criterion-by-criterion close-out:
> [`milestones/done/M7-room-and-presets.md`, *7E4 close-out —
> 2026-09-23*](milestones/done/M7-room-and-presets.md#7e4-close-out--2026-09-23).
> [ADR 0111](decisions/0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md)
> A3 is corrected in place — its "34 `goto` calls" figure was stale; the coordinator measured **47
> lines in 34 files** — and now records the durable rule this wave leaves behind: e2e opens a
> seeded `/d/{id}` via the fixture, and the editor route is not a test origin.
>
> **Next wave: 7E3a** — visitor identity (`__Host-` cookie, visitor-hash migration, server-side
> resume), Full tier plus a security pass, per the recorded order `7E4 → 7E3a → 7E3c → 7E3b → 7I →
> 7J → 7K → 7L`. It also inherits the Vitest/production route references D2 left to it.

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-22. M7 wave 7T is DONE but for the owner's CI run.** Commits, in order:
> S1 `5c1a6aa` (2026-09-16, shipped earlier, record gap closed 2026-09-22); plan (S2/S3 re-plan, the
> 7F3 deferral, Q-7J-1) `a67dcb8`; T-J5 Amendment A `4342f31`; S2b `092d583`; S2c pieces `b3a4570`
> (the slow-walk fix and the timer tolerance) and `3a10c50`; S3 `4a51f18`. HEAD `4a51f18` on
> `m7-room-and-presets`; origin is at `ea8b11e`, so `a67dcb8`…`4a51f18` are unpushed — **the
> coordinator pushes after this record.** **Gates (coordinator, doc-quoted):** `pnpm check` before
> every commit; at `4a51f18` — domain 228 files / 4,866 tests, persistence 27 / 419, three-adapter
> 92 / 3,553, web 242 / 4,379. **A process error is on the record, not smoothed over: `092d583` was
> committed while `pnpm check` was red**, on the pre-existing slow-walk timeout that `b3a4570` then
> fixed. Full close-out, criterion-by-criterion with evidence tiers:
> [`milestones/done/M7-room-and-presets.md`, *7T close-out —
> 2026-09-22*](milestones/done/M7-room-and-presets.md#7t-close-out--2026-09-22). New record:
> [ADR 0128](decisions/0128-live-persistence-suites-serialise-through-a-declared-transaction-scoped-readers-writer-lock.md)
> lifts the wave's lock, key and census rulings out of milestone prose, because 7P1's preset suites
> inherit the lock next.
>
> **What the wave repaired:** five live persistence suites gated themselves on `DATABASE_URL`, which
> `ci.yml` never sets, so they reported green without ever executing. They now gate on
> `TEST_DATABASE_URL` and serialise through a declared, per-file, transaction-scoped readers–writer
> lock, so two runners against the shared test database can no longer corrupt each other's migration
> state (BACKLOG 69, discharged).
>
> **The wave is complete but for the owner's `workflow_dispatch` run of `ci.yml` on this branch.**
> Criteria 8, 15 and 19 were re-measured by the coordinator at the closing tree `4a51f18` and are met
> — the skip counts (13 CI-shaped, 8 announce lines with both variables unset), the `expect(`/title
> diff (zero removed either way, the one removed line being a precondition swap, not a title), and the
> empty production-source diff. **Criteria 1 and 18 remain owed to that CI run**, plainly, not
> claimed — the three T4 suites' names appearing as run rather than skipped in a job log, and the full
> job-log verdict with every resolving file's CI hold duration. **That single CI run also settles
> 7F4b's outstanding criterion 44** ("CI is the verdict"), the same structural gap: no push to
> `m7-room-and-presets` has ever triggered `ci.yml`.
>
> **Next: 7E4** (e2e and tooling off `/configurator/configure`), per the order recorded in the 7F2
> RESUME HERE entry below and the wave table's *Recommended order* note — the preset story (7P1, 7P2,
> 7G, 7B, 7C) and 7F3 sit past M8, and 7T was the earliest unfinished wave ahead of them.

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-22. M7 wave 7F2 is DONE.** Commits, in order: S1 `731a338`; S1b
> `3bbbde8`; S2 `c4f59f3`; S3 `f4f775d`; S3b plan `518b7db`; S3b `c8bdc5e`; S4 `20381e7`; S5
> `9aad164`; S5b `22279b6`. HEAD `22279b6` on `m7-room-and-presets`. **Gates (coordinator,
> doc-quoted):** `pnpm check` before every commit; at `22279b6` — domain 228 files / 4,866 tests,
> persistence 20 / 282, three-adapter 92 / 3,553, web 242 / 4,379. `pnpm ci:local` at `9aad164`:
> `LOCAL CI PASSED — all gates green, safe to push.` (format, lint, typecheck, test, e2e 320 passed
> in 5.9 m, build, boundary, lockfile, SCA all PASS); pushed, local and origin matched at `9aad164`
> at dispatch time — `22279b6` (S5b) was not yet pushed and the coordinator pushes after this
> record. **Visual gate at `22279b6`** (production build, 390×844, touch, ro and ru, emulated
> Chromium): PASS on the eight criterion-14 witnesses, S1b-11, the S2 ru label, S3 timing (reason
> at 403–407 ms, cleared 1 ms after the fix), S5b help-tap and Tab, and the full journey to the
> editor; 136 screenshots in `testing-reports/7f2/` (gitignored); two preview-database design rows
> written by the journeys (`v1n9mXWMnGM7XJ3uHwLRd`, `FkBE4FQMFKGSVPxKJYMan`); console unchanged; not
> verified — a real device or keypad, WebKit, screen-reader output, 1F's own screen; captured, not
> judged — a mid-typing wall draws a red sliver under mm entry (backlog 78). Full close-out:
> [`milestones/done/M7-room-and-presets.md`, *7F2 close-out —
> 2026-09-22*](milestones/done/M7-room-and-presets.md#7f2-close-out--2026-09-22). New record:
> [ADR 0127](decisions/0127-step-1s-url-follows-the-typed-room-and-a-late-echo-is-still-ours.md)
> lifts the 7F1-D45 convergence rule out of milestone prose and folds in S3b's late-echo fix. Seven
> new backlog entries opened, 72–78 (`BACKLOG.md`). **Next (coordinator's ruling, 2026-09-22): the rest of wave 7T
> — S2 + S3, the live persistence suites run everywhere and two runners on the test database can no
> longer corrupt each other (discharges BACKLOG 69).** Plan: [`milestones/done/M7-room-and-presets.md`,
> *7T S2/S3 — the plan, 2026-09-22*](milestones/done/M7-room-and-presets.md#7t-s2s3--the-plan-2026-09-22).
> Full tier, not visual, no owner question gates a slice; **S2a (a probe, no committed code) is
> dispatchable once no other gate is running against `lemn-conf-v2-staging`**; S3 waits on the
> coordinator's C-7T-1; the CI verdict at the end needs the owner to dispatch `ci.yml` on this branch
> (which also settles 7F4b criterion 44). 7T S1 shipped at `5c1a6aa` (2026-09-16) — the record gap is
> closed in the wave table and the 7T section. **Same ruling:** 7F3 defers past M8 with 7B/7C (its
> *Continuă* obligation was already met by 7F4), so **7E4 is the first product wave after 7T**; and
> 7J's row now carries owner question Q-7J-1 (does the 6000 mm ruling cover a straight wall —
> recommended yes), which does not gate 7T.

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-21, later still. M7 wave 7D5b is DONE and pushed; 7F2 is next.** Commits,
> in order: plan + Amendment M `acb7b6f`; S0 `c0018ef`; S0b `4e88ae0`; S1 `f116b1c`; S2 `09cea46`; SW
> `f6e3730` (pushed, local and origin verified matching); the W7 fix committed just after `f6e3730`
> and pushed with the close-out. Gates at `f6e3730`, run by the coordinator: `pnpm check` — domain
> 228 / 4,866, persistence 20 / 282, three-adapter 92 / 3,553, web 220 / 3,401; `pnpm ci:local` —
> `LOCAL CI PASSED — all gates green, safe to push.`, e2e 208 passed in 5.6 minutes, build, boundary,
> lockfile and SCA all PASS; pre-push hook passed. Final composition (approved L, 10 mm, three
> ceilings): a dishwasher in **196,621** placed kitchens (M1 141,261; (e) 24,160; (b) 18,200; (d)
> 2,600; (c) 10,400), **48,590** without one; **156,886** oven-tower rooms; **367,428** columns;
> **173,691** bottles; **92,446** pan drawers; **5,725** threshold drawers. Every room has ≥ 1 oven;
> `minimumMet` / `dropped` / core-wall changes are **0**. S0b changed **5,260** rooms; the reference
> room ends `hob-2drawer · tower · 260 mm bare`; J6 is reversed. Owner rulings (Q-DW1/2/3, the drawer
> beside the sink, tower-over-bottle narrowed, at least one oven, the tower as a last resort only
> with the hob's oven, across-the-corner) and coordinator rulings (M10 precedence, the fallback
> reading, the W7 remedy) are all in [ADR 0110 Amendment M](decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-m--2026-09-21-wave-7d5b-the-dishwasher-and-the-oven-principle)
> (M1–M16). Two defects were found and fixed before commit: S2's (d) cost a door cabinet on 1,356
> declared runs (M14); S1 left an unreachable drawer guard (removed). **Visual gate, production
> build, 390 × 844, touch: all seven witness rooms PASS.** One defect found in that gate — **W7**: in
> ru, the sixth row plus wrapped rows pushed the 1F rule paragraph under the fixed footer,
> unreachable by scroll. Fixed by making `.composeBody` scroll vertically only, footer fixed
> (applies the owner's Q-7F2-2 remedy as a coordinator ruling); re-verified reachable, ro and the
> reference room unchanged, no horizontal scroll. Stated limits: the kit has no open-door state, so
> M13's corner-door judgement is on closed geometry (derived clearances recorded for the owner's
> information only); the editor was not run in ru for rooms 4–6; no real device. About 18 dev-database
> design rows were left by the visual runs. Obligations carried forward: `.dimensionsBody` (frame
> 1B/1C) still clips — that is 7F2's; the *Vedere generală* chip's no-op re-tap is filed in
> `docs/BACKLOG.md`. Full close-out: [`milestones/done/M7-room-and-presets.md`, *7D5b close-out —
> 2026-09-21*](milestones/done/M7-room-and-presets.md#7d5b-close-out--2026-09-21). **Next: wave 7F2 — 1C
> validation state, shape refusal, the wall marked red — see
> [`milestones/done/M7-room-and-presets.md`, *Wave 7F2 — the plan*](milestones/done/M7-room-and-presets.md#wave-7f2--the-plan-2026-09-21).
> All owner and coordinator questions are answered (Q-7F2-1…4 = (a); C-7F2-1/2/3 ruled); S0 is
> dispatchable.**

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-21. M7 wave 7D5 is DONE and pushed.** Commits: S1 `c67b4ee` (bottle
> cabinet), S2 `17df3f5` (pan-drawer cabinet), S3 `dd7a25b` (threshold drawer). Local and origin
> both at `dd7a25b`, source-verified with `git rev-parse` after `git fetch`. `pnpm check` passed —
> domain 221 files / 4,673 tests, persistence 20 / 282, three-adapter 92 / 3,546, web 218 / 3,316;
> format, lint and typecheck green. `pnpm ci:local` printed `LOCAL CI PASSED — all gates green,
> safe to push`, every gate PASS (format, lint, typecheck, test, e2e 208 passed / 2 skipped in
> 5.7 minutes, build, boundary, lockfile, SCA); e2e ran against `next dev`, not a production build,
> as on every prior wave here. The pre-push hook passed.
>
> **A coordinator process error is on the record, not smoothed over** (ADR 0110 L7): S1 and S2 were
> each committed after running only the domain suite; three-adapter was red at both commits (1 test
> at S1, 4 more at S2) and was restated in S3. Neither red commit was pushed.
>
> **Owner rulings this wave** (ADR 0110 Amendments J, K, L): Q-H6 = A, positional placement (J1);
> Q-H6a/b/c, the pan drawer's priority (K1/K2/K4); Q-H5 = add a third drawer after the hob (L1), the
> bottle gives way to it only in the narrow-kitchen shape named (L2), at most one tall column (L3).
> **Final measured composition** (approved L, 10 mm / 2600 mm): 245,211 placed, unchanged throughout;
> bottle 178,491; pan drawer 92,446; threshold drawer 15,795; tall-column losses (3 → 2) 9,600, all
> in threshold-drawer rooms; 0 `minimumMet` / `dropped` / core-wall differences vs pre-wave.
>
> **Visual gate** (production build, 390 × 844, touch): all six witness rooms PASS — no overlaps,
> gaps, corner clashes or new console errors. Screenshots in `testing-reports/7d5/` (gitignored).
> Not verified: open animations, the tall-column count read visually (only from the saved design),
> ru for rooms 2–6, editing.
>
> **Three items are open, none blocking:** an owner question on the reference room's bare 560 mm
> floor-to-ceiling gap after the bottle cabinet (product concern, not a defect — consistent with
> J6/J7); Q-DW1, still open for wave 7D5b (Q-DW2 = dishwasher first, Q-DW3 = converted + 1F row are
> answered); and the ru editor title truncation ("Конфигур…") plus hint wrap, a side note not this
> wave's scope. Full detail: the milestone's *7D5 close-out — 2026-09-21*.
>
> **Next: wave 7D5b — the sink-adjacent dishwasher conversion**, lifted whole out of 7D5 (S5). Its
> plan is being finalised. **After it: 7F2** — 1C validation state, which remains the owner of the
> live 1C validation state per the 7D7 entry below.
>
> **Record gap found while closing 7D5, left open rather than resolved here:** wave **7T**'s slice 1
> shipped at `5c1a6aa` on 2026-09-16 per the milestone's own 7T section, but neither this file nor
> the wave table recorded it as shipped until this pass's M7-row correction above. Not verified
> against `git log` by this pass — flagged as a gap, not claimed as fact beyond what the milestone
> text itself states.

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-19. M7 wave 7D7 is DONE through local gate follow-up `a9bad6b`.** Commits: plan
> `552cd74`; S1 `f861306`; S2 `6311f65`; S3a `009ab05`; S3b `49627f9`; S4 `8618129`; exhaustive
> oven-sweep timeout follow-up `5c1cd33`; exhaustive shell-sweep timeout follow-up `a9bad6b`. The
> four corner builders now draw their recorded widths;
> generation authors the largest even room-fitting widths and centres at 600 mm; 600 → 700 keeps
> those widths frozen while applying ADR 0089's slide. The reference room remains 900 / 320 / 570,
> the engine's shell floor is 880 / 880, and ADR 0125 keeps the customer-approved minima at
> 900 / 1000. S5 was cancelled and no approved policy literal moved.
>
> **Evidence:** final `pnpm check` passed — domain **4,570**, persistence **282**, three-adapter
> **3,536**, web **3,316** — after `5c1cd33` raised only the exhaustive oven sweep's timeout from 5 s
> to 10 s. Full QA, review, the 24-shot production visual gate and its precise 880 × 880 post-depth
> containment limitation are recorded in the milestone's *7D7 close-out — 2026-09-19*.
> **`pnpm ci:local` passed every gate: 208 E2E passed / 2 skipped, the production build generated
> 11 pages, boundaries and lockfile passed, and the audit found no known vulnerabilities. The first
> pre-push repeat later timed out only the exhaustive shell sweep at
> 5.019 s against 5 s; `a9bad6b` raises that test's budget to 10 s without changing its assertions
> or sample set, and the focused file passed 52/52. **The subsequent push completed; source-verified
> local and origin both at `7f95421`.**
>
> **The milestone stays open. Next: wave 7D5** — the drawer group astride the hob and bottle cabinet
> plan already recorded in the active milestone. **Corrected by the 2026-09-19 current-HEAD plan
> reconciliation:** capture the pre-width recording, then S1 is dispatchable; S2 needs Q-H6's A/C
> answer, and S3 needs Q-H5 after S1/S2 are re-measured. The dishwasher is recommended for 7D5b.
> 7F2 is also planned and
> remains the owner of the live 1C validation state. The two non-blocking corner questions remain Q-7D7-3
> (carousel policy) and Q-A′.2 (whether the customer may resize a generated corner); 7D7 changes
> neither. The misleading `WALL_MINIMUM_MARGIN_OWED_ON_Q_K1_MM` name remains an unowned cleanup.

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-17, later still. M7 wave 7F4b is DONE**, resolving the wave-table defect
> open since 2026-09-15 (the row carried no DONE marker while the coordinator reported it shipped).
> **Reconciled against `git log`: 7F4b shipped 2026-09-15**, across `9bb222b` (the hand-off — one
> attempt, one row, navigation after the write; nine deliberate breaks, each reddening its own test; a
> live defect found where both 7F4a DOM suites opened real sockets to `localhost:3000`), `b91cb25`
> (adversarial QA, no defect found in the hand-off), `e2f24dc` (the save-failed notice becomes a live
> region; a false contract line corrected), `ef83393` (the run token stops sharing a lifetime with the
> mount — a latent defect the review found and the implementer measured with React 19.2's `Activity`;
> `HandoffStatus` gains `saved`). Reported gates at `ef83393`: web **214 files / 3,227 tests**,
> three-adapter **78 / 3,071**; lint and whole-tree `format:check` green. **All four commit messages
> and hashes are relayed from the coordinator** — this pass has no shell and could not run `git log`
> itself.
>
> **The journey (criterion 44) PASSES its first-ever visual gate run, 2026-09-17, production build,
> 390 × 844, touch, both locales.** Step 1 → În L → 3,6 / 2,4 / 2,6 → *Continuă* → 1F (first paint
> 23 ms, rows 117 ms, all five *inclus* ~159 ms) → footer *Se compune…* → self-navigates to
> `/ro/d/{id}` (1,274 ms cold, 357–365 ms warm) → editor draws the typed room, read-back document
> `room 3600×2400×2600`, `presetId: null`, placements on walls A and B → *‹ Cameră* returns to Step 1
> with 3,60 / 2,40 / 2,60 refilled. Also passes at wave 7A3's 6,0 × 6,0 maximum and in **ru**. Failure
> paths (a failed `POST`, a failed `PUT`) keep the customer in 1F with a retry control that reuses the
> same attempt — `POST` count stays 1. **Criteria 42 and the stronger half of criterion 43 could not
> be verified from a browser** — component-covered only, per the plan's own tags. Full
> criterion-by-criterion record: `milestones/done/M7-room-and-presets.md`'s *7F4b close-out — 2026-09-17*.
>
> **Criterion 44's own "CI is the verdict" is NOT met, and this is recorded plainly rather than
> softened.** `.github/workflows/ci.yml` runs on pull requests to `main`, pushes to `main`, and manual
> `workflow_dispatch` only — no push to `m7-room-and-presets` has ever triggered it
> (`gh run list --branch m7-room-and-presets` empty against 36 runs overall). The coordinator's attempt
> to dispatch it by hand failed, **HTTP 403, token not authorised**. **The owner has agreed to trigger
> the `ci` workflow by hand from the Actions tab, 2026-09-17; the verdict is outstanding until that run
> completes.** See *What is open right now* for this and for a related, separately-found defect:
> **`main` itself has been red since the 2026-09-11 M6B merge** (`34580253814`, two `e2e (desktop)`
> specs), unrecorded until this pass, and overlapping the two specs wave 7H reported as one-off flakes.
>
> **Owner ruling recorded, 2026-09-17: a returning customer resumes by visitor identity, not by a new
> 1F state.** Asked what 1F should show when the write succeeded but the customer had already left, the
> owner answered: *"Just load the kitchen based on url that include the user id, taken from browser
> cookie or if is registered from user profile."* **No work is owed by 7F4b.** The mechanism is wave
> **7E3a** (the `__Host-` visitor cookie, the visitor-hash column, server-side resume); the
> registered-user half is beyond M7. **Recorded by the coordinator as
> [ADR 0114](decisions/0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
> Amendment E** — an amendment rather than a new ADR, because being recognised on return is that
> record's own subject — with the reading it rests on stated as the coordinator's: *"a url that include
> the user id"* is taken as the customer being identified when they return, **not** as a URL carrying
> an identifier. The design's link stays `/{locale}/d/{id}`, gated by the owning browser.
>
> **The milestone stays open. Next: wave 7D6** — the corner's along-wall reach derived from the cabinet
> depth, instead of carried as the fixture's 900/320/570 literals. **It carries a deadline: land before
> 7P2**, once presets are saved the reach becomes load-bearing on stored data. **7D5 and 7F2 follow it**
> — both have their dependencies met (7D4 and 7D3 through it; 7F1 and 7D2) and no unresolved owner
> question gating dispatch.

> **RESUME HERE — 2026-09-17, later still. Owner ruling on 7D6's Q-K1 (jointly 7D7's Q-7D7-2):
> [ADR 0125](decisions/0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md).**
> Put once, the owner first rejected the question's wording — a corner cannot be "200 mm" when it
> spans two walls — then gave the arithmetic that matches 7D7's own floor exactly: 200 mm per leg,
> 400 mm minimum corner. Put again with the premise corrected, **the owner chose to keep the approved
> minima at 900 (wall A) and 1000 (wall B)**, a deliberate 20 mm / 120 mm margin above the engine's
> derived 880/880 floor. **No bound moves, and no room is withdrawn or newly admitted.** Both waves'
> joint bound slice (7D6-S5 / 7D7-S5) does not dispatch, because no literal in
> `approved-room-policy.ts` moves; 7D6's criterion 4′ and 7D7's Q-7D7-2 are answered in place; an ADR
> 0108 amendment narrowing Amendment A ruling 1 to the corner's floor widths is still owed, now
> unblocked, by whichever wave lands the derivation. **7D6 slice S2 is in flight, concurrently, on
> `packages/configurator-domain/src`** — this ruling changes no code and touches nothing S2 is
> writing. **No wave is claimed done by this entry.**

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-17, later the same day still. M7
> wave 7A3 is DONE, close-out at `6bc1b44`.**
> Commits: S0 (ADR 0124) `6c8a1bc`; S1 `71aae6d`; S2 `1fac007`; S2 QA `cbd04a8`; S2 review fixes
> `2898b14`; S3 `c0d74dc`; S3 fixes `b7b3941`; S3 D2 `6bc1b44`. Full criterion-by-criterion close-out
> is in `milestones/done/M7-room-and-presets.md`'s *7A3 close-out — 2026-09-17*, appended to the wave's own
> plan section. **`pnpm ci:local` PASSED on `6bc1b44`**, run by the coordinator — `LOCAL CI PASSED —
> all gates green, safe to push.`: format, lint, typecheck, test (domain 210 / 4,424, persistence 20 /
> 282, three-adapter 85 / 3,484, web 218 / 3,316, all passed), e2e 208 passed / 2 skipped (5.6m, against
> `next dev`), build, boundary, lockfile, SCA. The push is recorded in the commit that follows this one.
>
> **The milestone stays open.** M7's wave table (`milestones/done/M7-room-and-presets.md`, *Revised wave
> table*) shows several waves whose stated dependencies now look satisfied: **7D5** (depends on 7D4,
> shipped, and 7D3 through it, shipped; PLANNED, most of its owner questions answered, Q-H5 gates only
> its slice S3), **7D6** (depends on 7D1, shipped; "none to dispatch" in its own Owner column), **7F2**
> (depends on 7F1 and 7D2, both shipped; owes the refusal sentence 7F1 left it and Q-7A3-2 is moot so
> nothing detaches to it from 7A3), and **7F4b** (depends on 7F4a and 7E2, both shipped; named "next"
> repeatedly through this file's own history before 7D3/7D4/7H/7D8/7A3 were dispatched ahead of it).
> **7D7** is not a candidate yet — it depends on 7D6, which has not shipped. **7J** is listed as
> "answered (F1) — unblocked" in the table but depends on 7D2 and 7F2, and 7F2 has not shipped either.
> **Coordinator's decision, 2026-09-17: 7F4b is next.** It is the hand-off that makes Step 1 reach the
> editor, and it has been next on merit since 7F4a closed. Every wave dispatched ahead of it (7D3, 7D4,
> 7H, 7D8, 7A3) was a generation or policy correction that had to land first, and none is still owed.
> **7D6 carries a deadline (before 7P2)** and is the next domain wave after 7F4b. 7D5 and 7F2 follow.

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-17, later the same day. `pnpm
> ci:local` and the push are now verified for
> 7D8, and M7 wave 7A3's S0 is DONE.** The coordinator ran `pnpm ci:local` on `b80ab97`:
> `LOCAL CI PASSED — all gates green, safe to push.` Format, lint, typecheck and test all passed —
> domain **4,358**, persistence **282**, three-adapter **3,476**, web **3,263** — plus e2e **196
> passed / 2 skipped (5.7m)**, build, boundary, lockfile and SCA, all PASS. **Those e2e tests ran
> against `next dev`, not a production build** — `playwright.config.ts:15` gates the production
> server on `process.env.CI`, which `scripts/local-ci.sh` does not set — so criterion 23 is satisfied
> by CI alone, exactly as recorded for earlier waves. The branch was then pushed: `8b73439..b80ab97
> m7-room-and-presets -> m7-room-and-presets`, pre-push gate green again; local and origin both at
> `b80ab97`.
>
> **The push range corrects the record, not just extends it: origin was already at `8b73439` before
> this push.** Every "nothing is pushed" / "the push is not claimed" statement below for **7F4a, 7D3,
> 7H and 7D4** was accurate about `pnpm ci:local` never having been run for those waves by the pass
> that wrote it, but wrong about the push — those waves' commits had already reached origin by some
> earlier push this file never recorded. Struck in place rather than rewritten, at each of the four
> passages below and in the M7 row.
>
> **M7 wave 7A3, slice S0 is DONE: [ADR 0124](decisions/0124-the-wall-maxima-move-together-and-one-number-not-two.md).**
> The plan's own ADR question (Q-7A3-3) is answered by writing it; Q-7A3-1 is answered by the owner
> — **(b) + (a): an always-visible hint line above the length fields, with the owner's tooltip on
> top** — which ungates S3 and makes Q-7A3-2 moot. **S1 is DONE at `71aae6d`**
> (`tests/support/composed-run-baseline.ts` splits `recordedLRoom()`, frozen, from `approvedLRoom()`,
> policy-backed; both recordings byte-identical), **S2 is in flight** (ADR 0124's number lands in `approved-room-policy.ts`), **then S3**
> (the hint line and tooltip). Full detail is in the 7A3 plan section of
> `milestones/done/M7-room-and-presets.md` and in ADR 0124 itself.

> **RESUME HERE (superseded above, kept for its detail) — 2026-09-17. M7 wave 7D8 is DONE.** Commits, in order: planning `8ebff1f`,
> `36fde8c`, `275c95e`, `27ae496`; S0 (pre-state baseline) `5c915f8`; S1 (ADR amendments) `2439da5`;
> the E4 correction `355a15e`; the adjudication `c456dbd`; S2 (the re-key) `814ca44`, committed
> `--no-verify` against a suite carrying **25 known-red tests, explicitly assigned to S3** per the
> adjudication's own sequencing rule; S3 (the wall-B witnesses and the silent-failure guard) `f919bfa`,
> suite green; review fixes `62cfee1`; the Q-7D8-2 downgrade `6dbff27`; ADR 0110 Amendment I1.1
> `e18908b`; the shrink-strip defect fix `24ca2bc`; the run-end-panel colour fix `dcec03f`; ADR 0122
> `8b73439`; S4 (the false-reason comment fix) `b83e4f2`, on branch `m7-room-and-presets`. **Every
> hash is the coordinator's and none was independently re-run by this pass**, which had no shell.
> **`pnpm ci:local` has NOT been run for 7D8 and nothing is pushed** — the same pending state as
> 7F4a, 7D3, 7H and 7D4.
>
> **What shipped is the rule the owner already gave, finally implemented:** the wall carrying the
> reading order's prefix is now derived from the **entered wall length**, not the constant
> `PREFIX_WALL = "B"`, so the sink and hob stand on the wider wall and the fridge on the narrower —
> **0 exceptions on both arms for the hob**, keyed provably rather than by correlation (the free-run
> split reads 97.61%, not 100/100, discharging criterion 4). The tall block now follows the run onto
> wall B where the owner ruled it may (**144 866 blocks, 47 175 on wall B**, against 97 691 confined),
> and the mirrored reading direction in B-wider rooms is owner-accepted. **A correction inside the
> wave's own record: "nobody loses a block" was wrong — 74 kitchens do**, witness **3300 × 3310**
> ([ADR 0110 Amendment I1.1](decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)),
> and the ruling stands unchanged because it was never the argument the owner's choice rested on.
>
> **[ADR 0123](decisions/0123-a-ruled-behaviour-whose-population-empties-keeps-its-branch-and-converts-its-sweep-coverage-into-a-declared-witness.md)
> is new**: a ruled behaviour whose discriminating population is emptied by a later wave keeps its
> branch and converts its sweep coverage into a declared witness — neither a stale instrument nor a
> genuinely emptied population is ever relaxed to a floor of 0. It generalises 7D8's own Finding B
> (7D4's descending-index drawer path went unreachable the moment criterion 1 held with zero
> exceptions) beyond this module. **[ADR 0122](decisions/0122-a-wall-cabinet-may-widen-over-floor-nothing-records-and-the-column-model-is-why.md)
> is also new**: the wall-cabinet-widens-over-floor defect's growth half (20 kitchens) ships unrepaired
> by owner ruling, while this wave's own review found and fixed the shrink half at `24ca2bc` (**4,413
> of 211,551 placed rooms, 2.09%**, a 10–200 mm unrecorded floor strip, zero in the pre-state;
> separately, over the shipped design's 605 accepted taps, such strips went **12 → 0**). **ADR 0045
> gains a dated pointer**: its Amendment A's stated reason — *"a fitter
> closes that gap with a filler strip"* — was found false by ADR 0120 D2; the ruling stands, only the
> reason was wrong, and `run-end-panel.ts:94-98`'s comment is corrected at `b83e4f2`.
>
> **Named, unowned, not a defect: Risk 7.** The run-end panel is now drawn in **1,971** rooms against
> **3,756** before — **1,785 rooms (20.7%) lose it, 0 gain it, 0 seats move.** The reason given — a
> B-wider room's composed run now ends at wall B's free end, which `run-end-panel.ts` never considers
> — is the plan's own R7 reasoning, not a measurement tying the two together, and is carried forward
> marked as an inference. This is reported and not ruled on; do not invent a wave for it without a
> trigger.
>
> **Findings 5 and 6 from the review round (`62cfee1`) are deferred with no owner, and their content
> is not recorded anywhere in this repository** — say so plainly rather than reconstructing them.
>
> **[Backlog 68](backlog/open.md)** — a large wood-decor run-end panel shows a visible grain tiling
> seam, observed on the same visual check as the colour fix (`dcec03f`), not compared to a pre-fix
> build; owner question, no wave.
>
> **Two obligations 7D4 handed forward, one closed and one partial.** `chooseWallCut`'s wall-identity
> keying (ADR 0120 C2) is **partly discharged** by 7D8 — the 7A3 plan's own *Outstanding elsewhere*
> section says its remainder is not 7A3's either. The ADR 0091 Amendment A pointer chore was already
> discharged at `ffc472e` before 7D8 started and was verified rather than redone.
>
> **7A3 is now unblocked — its hard dependency was 7D8 closing, and it starts next.** The 7A3 plan
> (`milestones/done/M7-room-and-presets.md`) recommends its own ADR (Q-7A3-3) as S0, then S1, then S2.
> ~~**S3 is gated on Q-7A3-1**~~ — **answered by the owner 2026-09-17: (b) + (a), an always-visible hint
> line plus the owner's tooltip on top — S3 is ungated and Q-7A3-2 is moot; see the top of this
> section.** ~~**`pnpm ci:local` and the push remain pending for five waves now: 7F4a, 7D3, 7H, 7D4 and
> 7D8** — none of the five is to be described as pushed or CI-verified until it is.~~ **Corrected
> 2026-09-17, later the same day: `pnpm ci:local` was run and passed on `b80ab97`, and the branch is
> pushed; see the top of this section for the figures and for the correction that the push half of
> this claim was already stale for 7F4a, 7D3, 7H and 7D4 before this pass ran.**
>
> **Updated 2026-09-16, later the same day. M7 wave 7D4 is DONE** across eight commits,
> `00152b8` (S1b), `9daf757` (S2), `8be7d9a` (the criterion-13 adjudication and ADR 0091 Amendment
> A), `d89a3b6` (S4), `a51d6ef` (the NUL-byte fix), `9258fa3` (review fixes), `c444ef9` (ADR 0121),
> `6456a3b` (the cycle→composed rename), on branch `m7-room-and-presets`. **The hashes are the
> coordinator's and the pass that wrote this had no shell**; `9daf757` and `9258fa3` are corroborated
> from inside the tree. ~~**`pnpm ci:local` and the push are pending for 7D4 exactly as they are for
> 7F4a, 7D3 and 7H**~~ — **corrected 2026-09-17: the push half was stale, these commits had already
> reached origin by an earlier unrecorded push; see the top of this section.** `pnpm ci:local` was
> never run for this wave specifically. **7D4 changes nothing about what is next: 7F4b still is.**
>
> **What shipped is one sentence.** The **preparation** cabinet and **the first storage slot after
> the hob in the reading order** take `base-3drawer`; **every other storage slot takes
> `base-cabinet`**. A slot is identified by **what composed it** and never by its role or its width —
> those are wrong on **32.8 %** and **14.9 %** of placed rooms against output that is **correct**, so
> the failure would present as a defect in a closed wave. **Measured over 211 551 placed rooms:
> `nonBuildIdDiff: 0`** — nothing moved but the body — with **261 162 body changes**, zero of them on
> a block column or on the hob. *(Reported; reproduced independently by the logic reviewer, not
> re-run by this pass.)*
>
> **Read the close-out before treating this as a clean wave.** It was **re-planned mid-flight when
> the owner replaced its central ruling**, and **five plan defects were found and fixed, every one
> the coordinator's own** — an enumeration missing a case that occurs in 11.1 % of rooms, a criterion
> **unsatisfiable by correct output**, a must-not **contradicting three criteria of its own plan**, a
> citation to an **ADR section that does not exist**, and a risk that named re-measuring a figure but
> not **re-capturing the artefact** that invalidates.
>
> **Three test defects, and they are the reusable half.** The parity suite **passed 15/15 with the
> wave's central rule deleted outright** (it selected by build id, and preparation now carries the
> drawer's id) — the same sabotage now gives **4 failed / 12 passed**. **Two QA guards passed under
> the sabotage they existed to catch**, because each asked whether an id equalled the constant the
> sabotage moves — **found by QA in its own work**. And **one NUL byte made a test file binary to
> git**, so a **229-line diff was reviewed by nobody** and the repo-wide convention greps used as
> gates **stepped over it reporting success**. All three are one family: **[ADR 0121](decisions/0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md)**.
>
> **Two obligations for 7D5's first slice, and they are comment-only edits:** the false stated reason
> at **`run-end-panel.ts:94-98`** under ADR 0120 Amendment D's run reading (the behaviour is correct;
> **a right rule with a false reason is one step from being "fixed"**), and the missing pointer on
> `qa-7d3-tall-end-block.adversarial.test.ts`'s widened clause, which **ADR 0091 Amendment A admits
> only with a comment naming `drawer-rows.test.ts:316-328`** and which has none at HEAD.
>
> **Two obligations with no owner, recorded as unowned rather than assigned:** **`chooseWallCut` is
> keyed on wall identity and not on width** — the fridge stands on the narrower wall in **0.0 %** of
> the 2 760 B-wider rooms that have one (ADR 0120 C2) — and **the *"Perete A"* field copy**, which
> ADR 0120 Amendment D makes **more** load-bearing, not less. **Do not invent a wave for either.**
>
> **What 7D4 does not prove** is listed in the close-out from S4's F6 and is deliberately not softened
> — four criterion-13 clauses with no assertion, criterion 12 asserted weaker than it is worded, and
> two clauses riding on a digest with no sabotage aimed at them.
>
> **The two wave-table defects below are unchanged by 7D4 and remain open**: 7F4b's missing DONE
> marker and 7F3's dependency on the deferred 7C.
>
> **Updated 2026-09-16. M7 wave 7H is DONE** across eleven commits, `7072930`, `463abc1`,
> `3d9a243`, `b3d0c59`, `6ba2b51`, `729ca62`, `2a4428f`, `ab2ae17`, `b0ca1eb`, `7b1f92c`, `a70efc1`,
> on branch `m7-room-and-presets`. **The hashes are the coordinator's and were not verified by the
> pass that wrote this** — it had no shell; `7b1f92c` is corroborated inside
> `milestones/done/M7-room-and-presets.md` and the other ten are reported. ~~**`pnpm ci:local` and the push
> are pending for 7H exactly as they are for 7F4a and 7D3**~~ — **corrected 2026-09-17: the push half
> was stale, these commits had already reached origin by an earlier unrecorded push; see the top of
> this section.** `pnpm ci:local` was never run for this wave specifically. **7H changes nothing about
> what is next: 7F4b still is.**
>
> **The 3D shell was `4.2 × 3.4 m` for every customer, whatever room they entered.** It now follows
> the design's room — floor, both wall planes, backsplash and every seat — with tile repeats
> **re-derived to hold world density constant** rather than stretched, a standing stage updated **in
> place** (nothing disposed), and the three camera presets derived from the **kitchen's height** and
> the field of view with **no room term**, which is why they survive a 3900 mm ceiling.
>
> **Four things a later wave must not file as bugs**, each ruled and each recorded with its trigger in
> ADR 0118's shape: **a preset showing part of a long wall** (Q7H-7 — the camera does not pull back
> for length; trigger: the owner has seen a 6 m kitchen and wants the whole wall framed); **a marked
> body framed off screen at mobile** (Q7H-8 — the band still reports it and the body stays editable,
> per ADR 0065 decision 1; trigger: backlog 67); **the empty strip above the uppers** (ADR 0110 E11,
> owner-confirmed); and **`MARKED_BODY_TAP` having no correct value**, struck with its old
> **(330, 440)** left visible so a reader knows one was once reachable. **Backlog 67** — tapping the
> overflow warning moves the camera to the marked body — is **wanted, unscheduled and not built**.
> **It was relayed as *backlog 66*, and 66 was already taken** by the tall-body gap ruled 2026-09-14,
> which ADR 0110, ADR 0117 and the M7 milestone all cite by number; the newer item is renumbered
> **67** in `backlog/open.md` and `BACKLOG.md`, with the collision recorded at both entries.
>
> **Three findings to carry into the next wave that measures this surface.** **(1)** A canvas constant
> is now **a function of (room, rail state)**: one measured against one document does not transfer to
> another, because a narrowed-room document puts a different body under the same pixel. **(2)** Two
> measurement hazards — clicking empty scene **deselects**, closing the rail and re-widening the canvas
> **1020 → 1440 px mid-scan**, so readings after such a click are in the other coordinate regime; and
> the mirror, which means **a page reload per sample is the only reliable way back to rail-closed**.
> **(3)** `MAX_ABSENT_CASING_PIXELS` is **50, not 15** — the count is anti-aliasing-sensitive and 15
> would be calibrated to one GPU — with **`MIN_CASING_PIXELS` 300 against a control of 14, ~21×
> separation**, as the ratio that earns the slack. `bowl_edge_back` is **a deliberate shadow strip**,
> not a defect, and `M.glassDark` sits **just outside** the patch: a near miss, not an absence.
>
> **Two test facts that must survive a tidy-up.** The wave's **95 shell tests all built a fresh
> shell**, so a defect appearing only on the **second** resize — the customer path — passed 95/95;
> closed by new tests with **no `src/` change**. And **a property whose generator cannot reach the case
> it asserts about is not testing it** — M7's **second** instance, after 7D3's finding 6.
>
> **The wall maxima are unblocked, and applying them is its own change.** Nothing in
> `packages/three-adapter/src` reads `MAX_ROOM_*`, `SCENE_SHELL_*` or any room ceiling; the shell is a
> linear function of the room plus one 300 mm constant; `PRESET_DISTANCE_M` has no room term. **ADR
> 0120's Q-B is answered** and the owner's ruled **6000 mm per wall** can be applied by editing the
> policy literals alone. **7H did not do it.**
>
> **Two flakes, named so they are not mistaken for regressions:** `top-bar-pill-containment` and
> `global-colour` each failed **once** under a loaded full-project run and each passed in isolation
> (**21/21**, **7/7**). Neither is a spec this wave touched. *(Reported; not re-run by this pass.)*
>
> **The two wave-table defects below are unchanged by 7H and remain open**: 7F4b's missing DONE marker
> and 7F3's dependency on the deferred 7C.
>
> **Updated 2026-09-15. M7 wave 7F4a is DONE** at `bf6901b` + `37f1ecb` + `6113176` +
> `52504d1`, branch `m7-room-and-presets` at HEAD `1afd65c`. **`pnpm ci:local` has NOT been run for
> this wave and nothing is pushed — both are pending, and the first thing this wave still owes.
> 7F4b is next.**
>
> **Updated 2026-09-15: wave 7D3 has also shipped — S1 at `03c98dc`, S2 at `97a4913`** — out of the
> recommended order, on the same branch. **It changes nothing about what is next: 7F4b still is**, and
> `pnpm ci:local` and the push are pending for 7D3 exactly as they are for 7F4a. What 7D3 shipped, its
> two struck acceptance criteria and its seven findings are in the M7 row above and in full in
> `milestones/done/M7-room-and-presets.md`'s **7D3 close-out**. **Two things to carry into the next wave that
> touches generation:** the centred-tower defect is **invisible to production**, so
> `qa-7d3-tall-end-block.adversarial.test.ts:371` must not be tidied away as an arithmetic identity,
> and neither may the two assertions that hold E12.2's order —
> `tall-end-block.test.ts:173-179` and `qa-7d3-tall-end-block.adversarial.test.ts:338-344`, **not**
> `tall-end-composition.test.ts:239`, which was named for it and would pass an inversion; and
> **every block room correctly loses wall A's run-end panel**
> (owner-ruled 2026-09-01, `run-end-panel.ts:76-98`), which now affects roughly half of generated
> kitchens and is not a regression.
>
> **Two defects in M7's wave table, recorded at 7D3's close-out and deliberately left for a decision
> rather than resolved by a scribe.** **(1)** The **7F4b** row carries no DONE marker while the
> coordinator reports it has shipped across `ef83393`, `e2f24dc` and `b91cb25` — **reported, not
> verified**; this file and the 7F4a close-out both still say *7F4b is next*, so **reconcile all three
> against `git log` in one pass**. **(2)** **7F3 depends on 7C, and 7C is deferred past M8**, so 7F3
> cannot stand in M7 as the table has it; **which of the two gives way is a scheduling call**, and it is
> open.
>

> - **What shipped:** the generation algorithm's **first production caller**. A tap on *Continuă* at
>   1B dynamically imports `@lemnaria/three-adapter`, borrows a transient kit through
>   `createBodyProbeLease`, runs `generateKitchen` **once, synchronously**, and draws frame 1F's five
>   rows. Composition is a client sub-state over the same URL — no query key, no path segment, no
>   history entry (R13). New: `src/room/generation-model.ts`, `use-generation.ts`,
>   `generation-steps.tsx`; edited: `room-screen.tsx`, `room.module.css`, both catalogues, the copy
>   lock and the golden manifest.
> - **1F is a dead end by design.** The primary control stays disabled reading *Se compune…* after
>   the rows settle, because its destination is 7F4b's. Do not file it.
> - **Verification actually performed:** web **210 files / 3,173 tests**, `three-adapter` **78 /
>   3,071**; typecheck, lint and whole-tree `pnpm format:check` green; **adversarial QA — 45 tests, 19
>   deliberate breaks, 18 of which reddened a test** (the nineteenth is finding F2, below); **one
>   combined logic + clean-code review, no blocker, three findings, all folded**; and a
>   **production-build visual gate at 390 × 844 in both locales** — criterion 14 across 16 elements,
>   criterion 15 across five layout states, no `line-through` on a *nu poate fi inclus* row, five
>   *Înapoi* round trips with the draft intact, `history.length` never moving, and **tap-to-rows
>   medians of 24–26 ms (n = 10 each)**.
> - **Four defects found and fixed.** (1) **A kit leaked** whenever anything between `makeKit` and the
>   lease threw — the lease's `finally` covers `lease.use`'s body, not the factory. **Measured
>   `{ built: 1, disposed: 0 }`**; a customer retrying stranded one kit per attempt for the page's
>   lifetime. Fixed with catch-release-rethrow at the allocating site, plus the rule that a failing
>   `disposeKit` must not discard a composition that succeeded. (2) **A failed screen drew green
>   *inclus* rows** for a discarded design; the `failed` state now carries **no `rows` property at
>   all**, so drawing them is a compile error. (3) **Browser Back out of 1F did nothing** — the entry
>   behind it is the settle's `replace` of the same query; cleared by a `popstate` listener. (4)
>   **Nothing guarded the `.composeRow*` classes**, and a comment cited a test file that did not
>   exist; dropping one class would have removed all of R10 with the suite green.
> - **The finding to carry into every later guard: the specified check would have been vacuous.**
>   Vitest processes no CSS, so a `.module.css` import **fabricates a class name for any property** —
>   `styles.thisClassDoesNotExist` is a non-empty string. The implementer measured that and built the
>   real guard: the token the row renders with, checked against `room.module.css` **read by path**.
>   **This is the fourth "green over something that never ran" in this milestone.**
> - **Two process facts, stated rather than smoothed.** **Criterion 34's boundary list was
>   mis-notated and the code was right** — one pair written `(wall B × wall A)` among neighbours
>   written `(A × B)`, flattened out of ADR 0108 Amendment E's table whose middle row fixes wall B;
>   `validateRoomInput` agreed with the screen on all twelve rooms the gate typed, so **no code defect
>   and no owner question**. And **criterion 38's measurement was taken after slice 3 rather than
>   before its dispatch** — a number in a close-out rather than a gate; the comfortable result is what
>   made it harmless, not a justification.
> - **Owner rulings:** *așezat* → **inclus**, *nu încape* → **nu poate fi inclus**, and the dropped
>   sentence must say the wall sizes did not leave enough space. The owner asked whether the algorithm
>   could drop non-fitting cabinets by itself — **it already does, and has since 7D1** — and then
>   ruled **the report stays**. **Romanian is approved; the Russian is an agent translation** and is
>   not recorded as approved here (ADR 0113 decision 3 says otherwise for the drafted copy — the
>   close-out records how the two reconcile).
> - **Stated limits:** the 24–26 ms medians are **a laptop over localhost**, and the **399 kB**
>   adapter chunk is paid on the customer's first tap at their own speed — **the durable fact is the
>   manifest one, that `three` is absent from the room route's first load**. The list **jumps up
>   18.1 px** when rows resolve (measured, repeatable, both locales, not filed). **Opening composition
>   drops focus to `<body>`** and nothing announces the run to a screen reader (recorded, not fixed).
>   A room the domain refuses still gives a **silent dead tap**; 1C's surface is 7F2's.
> - **One open obligation, owed by another wave: `ADR 0110 Amendment F` does not exist.** ADR 0110
>   carries Amendments A–E, and F is cited by `generation-steps.tsx:232`, `room.module.css:723`, ADR
>   0117 and the milestone. It is **wave 7D4's slice S0**, which that wave's punch list already marks
>   *NOT WRITTEN*.
> - **Next: 7F4b**, which inherits the seam this wave armed — **a departure armed by the primary tap
>   resolves after the customer has left 1F** — then 7T → 7P1 → 7P2 → 7G → 7B → 7C → 7F2 → 7F3 → 7E4
>   → 7E3a → 7E3c → 7E3b → 7H → 7I → 7J → 7K → 7L.
>
> ---
>
> **Superseded, kept for its detail — 2026-09-14, later the same day. M7 waves 7F1 and 7F1-D45 are
> both DONE — 7F1 at `5d2ff54` (D1–D3 fixed at `852df10`) and 7F1-D45 at `8437c95` (review fold
> `6682d8e`). 7F4 was next.** **`pnpm ci:local` PASSED** — `LOCAL CI PASSED — all gates green, safe to push`, 193 e2e
> tests in 5.7 minutes. Those e2e tests ran against `next dev`; only CI runs them against a build.
>
> - **What shipped:** Step 1's room screen. 7F1's five slices gave 1A (top bar, three shape cards,
>   *Continuă*) and 1B (fields, corner toggle, live isotropic plan, URL sync). 7F1-D45 then closed the
>   two defects 7F1's visual gate found and could not fix: **D4** (browser Back loses a typed room) and
>   **D5** (a traversal renders 1A under a 1B URL). Under ruling **R9** the URL is now written by a
>   debounced `router.replace` (`URL_SETTLE_MS` = 400 ms), the client derives the live sub-state from
>   `useSearchParams()` rather than trusting the server's parse after the first paint, and a deliberate
>   navigation **flushes the pending write and leaves once it has landed** — never cancels it, never
>   dispatches both in one tick.
> - **7F1 closes on what it actually verified.** Its own round was adversarial QA (**81 tests**, per
>   `91fe900`'s subject), one combined review (**two taste findings**, folded at `1d5bc08`), and the
>   390 × 844 visual gate, which filed **five** defects. **D4 and D5 are named as 7F1-D45's, not
>   blurred into 7F1's verification.** Two waves, two records.
> - **7F1-D45 verification, as measured:** **203 test files, 3,034 tests, 0 failed**; typecheck, lint
>   and whole-tree `pnpm format:check` green; a **production-build** measurement gate on slice A whose
>   **five checks all passed** (caret and value survive the settle; `history.length` does not grow
>   while typing; Back returns the full typed room — D4's original repro; the departure flush keeps a
>   digit typed inside the settle; neither button dead); **adversarial QA with 19 deliberate breaks, 18
>   of which reddened a test**; one combined logic + clean-code review, **no blocker**, two legibility
>   findings folded at `6682d8e`; and a closing **390 × 844 visual gate in both locales with zero
>   defects filed**, which also re-confirmed D4 and D5 closed in a production build.
> - **`pnpm ci:local`: PASSED.** The script's own verdict line reads `LOCAL CI PASSED — all gates
>   green, safe to push` — read from the log rather than inferred from an exit code, because a piped
>   gate once reported the pipe's status while the run had failed. **193 e2e tests in 5.7 minutes.**
> - **The new traversal e2e, `dev` versus CI:** `apps/web/tests/e2e/room-traversal.qa.e2e.spec.ts`
>   passed locally **against `next dev`** — and so did every e2e test inside `ci:local`, because
>   `playwright.config.ts:15` gates the production server on `process.env.CI !== undefined` and
>   `scripts/local-ci.sh` does not set it. **Criterion 23's production requirement is therefore met by
>   no local run; CI is the only one that satisfies it**, and the push reruns the gate. What *is*
>   production-build evidence for D4 and D5 is slice A's five-check gate and the closing visual gate,
>   both of which built and served the app. The e2e keeps the defects closed; it is not what proved
>   them closed.
> - **A defect the closing visual gate found that is not this wave's:** selecting the **U** chip while
>   `wallC` is empty leaves the plan preview drawing the **L** plan. 7F1-shipped behaviour, not a
>   regression — 7F1-D45's source diff is three files and touches neither `plan-preview.tsx` nor
>   `dimensions-form.tsx`. **Recorded against 7F2**, which owns that surface, in
>   `milestones/done/M7-room-and-presets.md`.
> - **The one rule most likely to be relaxed by a later reader, so it is repeated here:** *Înapoi*'s
>   **only** guard is the no-second-discriminator rule. It is what makes `draftText === liveText` hold
>   when a flush echo lands, and so the only thing stopping the write effect arming a timer after a
>   departure push. It rests on **I4 / criterion 21**, not on the queries this screen happens to
>   produce. The full statement is in `milestones/done/M7-room-and-presets.md`'s 7F1-D45 section.
> - **Three claims the wave rested on without stating**, all found by QA or review after the code was
>   written and green: Next's discard semantics carrying the two-tap case; `liveQueryNamesARoom` being
>   tautological once slice B removed the server's parse; and the suppression rule costing more than
>   its comment claimed.
> - **The accepted limit, with its baseline:** a browser Back **gesture** within `URL_SETTLE_MS` of a
>   keystroke leaves that keystroke out of the entry. Bounded by one constant, never on a reload, and
>   **strictly better than what 7F1 shipped, where the gesture lost the whole room.** It is an
>   improvement with its remaining edge named, not a regression.
> - ~~**Next: 7F4**, then continue: 7P1 → 7P2 → 7G → 7B → 7C → 7F2 → 7F3 → 7E4 → 7E3a → 7E3c → 7E3b →
>   7H → 7I → 7J → 7K → 7L.~~ **7F4 was split, and 7F4a has since shipped; the live order is in the
>   block above.**
>
> ---
>
> **Superseded, kept for its detail — 2026-09-14. M7 wave 7E2 is DONE at `470e5c9`, closed at
> `8434e76`; 7F1 was next.**
> `pnpm ci:local` and the pre-push rerun both passed in full; `41181d8..8434e76` is pushed to
> `origin/m7-room-and-presets`, local and origin both at `8434e76`.
>
> - **What shipped:** `createDesignCreationAttempt` (`apps/web/src/room/create-design.ts`, new) —
>   one deliberate selection, minting once and writing before navigation. Concurrent taps on one
>   attempt collapse to a single `POST`; a failed `PUT` retries onto the already-minted row; a failed
>   mint re-mints with no stray write; the completed write is cached before navigation so a throwing
>   router retries only the hand-off. The editor's two back controls and the load-error start-over
>   are now live links to `/configurator/room` carrying the design's room. 15 files, **1,297
>   insertions, 18 deletions**.
> - **Adversarial QA:** round 2, the final focused suite, passed **22 test files, 381 tests, 0
>   failed**, under `rtk proxy`; re-run after review fixes reproduced the identical 22/381.
> - **Reviews:** logic review found all six criteria met, nothing contradicting ADR 0111, ADR 0069
>   decision 5b, ADR 0085 or ADR 0104/0108. Clean-code review: no must-fix, three clarity items
>   applied. Security review: **clean** — no dependency, environment or API-route change.
> - **Light visual check at 390 × 844:** all four navigation items pass; 22 px back column, 52 px
>   bottom row, 44 px targets, no horizontal overflow.
> - **Coordinator verification, as measured:** whole-tree `pnpm format:check` clean, `git diff
>   --check` clean, typecheck and lint clean. `pnpm ci:local` and the pre-push rerun both passed in
>   full: format, lint, typecheck, test, e2e, build, boundary, lockfile and SCA all PASS. e2e **191
>   passed, 2 skipped** (5.4 minutes); unit/integration **4,196, 282, 3,059 and 2,704** tests across
>   their suites, all passing.
> - **An unexplained transient, on the record rather than softened:** the first `pnpm ci:local` run
>   for this wave reported `LOCAL CI FAILED: e2e`, and did not reproduce — an e2e run alone
>   immediately after was 191 passed / 2 skipped / 0 failed, and a full `ci:local` re-run and the
>   pre-push rerun were both green, three consecutive green runs against the identical commit. The
>   cause is unknown and was not diagnosed: the first run was piped through `tail -60`, which
>   discarded the e2e output before it reached the log. Port 4320 was confirmed free before the
>   re-run. Not called a flaky test or resolved on retry — if e2e fails once and then passes on this
>   branch again, this is the precedent to check first.
> - **Honest limits:** `createDesignCreationAttempt` has no production caller yet — 7F3 and 7F4 wire
>   it. Criterion 2 (a mint/`PUT` failure leaves the customer on Step 1 with a retry) is proven at the
>   unit level only, with no UI to exercise it this wave. Criterion 5 is verified only as far as this
>   wave reaches: the room reaches the URL to the millimetre and parses to substate 1D; field
>   population is 7F1's surface. No hydrated `/d/{id}` design and no `linear`-branch browser run were
>   exercised; keyboard activation was not verified.
> - **Carry-forwards recorded against their own waves** (`milestones/done/M7-room-and-presets.md`): 7I
>   (the hardcoded `cornerDirection: "left"` in `roomHrefFromDesignRoom`), 7F3/7F4 (constructing the
>   attempt where selection state lives, and the two-taps-one-`POST` criterion the factory alone
>   cannot enforce), 7K (the evaluated-design round-trip assertion).
> - ~~**Next: 7F1**, then continue: 7F4 → 7P1 → 7P2 → 7G → 7B → 7C → 7F2 → 7F3 → 7E4 → 7E3a → 7E3c →
>   7E3b → 7H → 7I → 7J → 7K → 7L.~~ **7F1 and 7F1-D45 have since shipped; the live order is in the
>   block above.**

~~**2026-09-11 — M7's next wave is 7D1**~~ ~~**Corrected the same day: 7D1 shipped at `f5b4cd9` and
7D1b was next.**~~ ~~**Corrected again: 7D1b is DONE in `f61c361` + `85091cc`; M7's next wave is
7D2.**~~ ~~**Corrected 2026-09-12: 7D2 is DONE at `4133cdc`; M7's next wave is 7A2.**~~ ~~**Corrected
2026-09-13: 7A2 is DONE at `f97d621`, closed at `6cde5ef`.**~~ ~~**Corrected again 2026-09-13: 7E1 is
DONE at `57f1e94`; M7's next wave is 7E2.**~~ ~~**Corrected 2026-09-14: 7E2 is DONE at `470e5c9`; M7's
next wave is 7F1.**~~ ~~**Corrected again 2026-09-14: 7F1 is DONE at `5d2ff54` and 7F1-D45 at
`8437c95`; M7's next wave is 7F4.**~~ **Corrected 2026-09-15: 7F4 was split into 7F4a and 7F4b, and
7F4a is DONE at `bf6901b` + `37f1ecb` + `6113176` + `52504d1`; M7's next wave is 7F4b. `ci:local` and
the push are still owed for 7F4a.** **Corrected 2026-09-16: waves 7D3 and 7H have since shipped, both
out of the recommended order — 7H across eleven commits, `7072930` … `a70efc1` — and neither moves
what is next. M7's next wave is still 7F4b, and `ci:local` and the push are owed for all three.**
Wave 7A shipped
at `8df0d49`; the close-outs, revised criteria and full wave table are in
`milestones/done/M7-room-and-presets.md`. The domain waves share `src/index.ts`; dispatch them one after
another per the tree-freeze rule.

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

~~**Current M6B next: 6B-e — move the 34 refusal codes to typed ICU descriptors and stop the domain
from rendering Romanian.** 6B-d closed 2026-09-09 at `1fbd780`; all 17 interpolated families and
`configure.step` now resolve through the active locale, and Romanian zero follows the owner's CLDR
ruling.~~ **Stale, and struck 2026-09-10: this paragraph was six waves behind the tree.** 6B-e
through 6B-j have all shipped — the last two at `87429ca` and `aff9a2c` — so **there is no next M6B
wave.** ~~The milestone's build scope is complete and it is **blocked on Gate O2**, the owner's
Russian review; see the first bullet under *What is open right now* for what that asks and what it
costs. Russian remains an unapproved agent draft until Gate O2.~~ **Updated 2026-09-11:** the owner's
review of the built product has since run and shipped its fixes at `4f3c808`
([ADR 0107](decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)),
ADR 0105's e2e split shipped at `b60f298`, **and Gate O2 is now closed — the owner approved all 235
leaves of the Russian as drafted.** After Gate O2 the milestone's only remaining item is the push,
which the owner has now explicitly authorised.

**Next: M6, ~~now on branch `wave/6r-control-shapes-and-strip-row`~~** (that is the branch 6R, 6R-b,
6K-i and 6N-a landed on, 2026-09-06) — ~~**work moved the same day to `wave/6t-finish`, which carries 6T
and is where 6T-a is being implemented now**~~ **superseded 2026-09-07: every M6 wave branch is merged
and work is on `main` at `bdef351`; superseded 2026-09-07: M6B is now in progress on
`m6b-internationalization`, Gate O1 is closed, and the corrected catalogue is being translated under
the owner's newer sequencing ruling**. Read
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
with the owner's words; and the **six open owner inputs** below. **M6B — Internationalization is in
progress on its milestone branch. Gate O1 closed on 2026-09-07 with the owner's 13-line Romanian
edit set (12 changed values and one whitespace-only line); ~~6B-a through 6B-d are complete, and 6B-e
is next.~~ **Corrected 2026-09-10: every wave from 6B-a to 6B-j is complete, the last two at
`87429ca` and `aff9a2c`, and the build scope is finished.** ~~Gate O2 is still the hard stop — it is
now the *only* one — and no agent may call the Russian approved.~~ **Corrected 2026-09-11: Gate O2 is
closed — the owner approved all 235 leaves. Only the force-push remains, now explicitly authorised.
See the banner at the top of this file.**

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
