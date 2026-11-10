# Project status

**Read this second, right after `AGENTS.md`.** It is the short current-state page: where the project stands,
what is open, and where to look next. It does not carry per-wave records.

History (long-form per-wave records): [`archive/STATUS-history.md`](archive/STATUS-history.md) — do not read
unless asked a historical question. Line numbers quoted below (`H:123`) refer to that file as frozen before its 2-line header note was added (add 2 to find the line today).

Evidence tiers: **doc-quoted** (a record read, with its line), **inference** (not stated by a record).
Nothing here was re-run by the scribe; no test counts are restated.

## 1. Current position

- Branch: `fix/empty-space-fill-and-preset-save`; HEAD `dd40bf16` [coordinator's `git log`, 2026-10-17].
- Committed on it, per that `git log` (M8C, plan [`M8C-generation-fill-and-preset-authoring.md`](milestones/M8C-generation-fill-and-preset-authoring.md)):
  - wave F0 (docs): `d91b7063`
  - wave F1a: `b43a8e18` (composition's merge never joins two planned tiles)
  - wave F1b: `8023c880`, `e3818726`, `dd40bf16` (the last includes ADR 0167 Amendment A and backlog 256-260)
- The M8 mail / empty-space-merge branch (`m8-mail-and-empty-space-merge`) merged to `main` as PR #12
  (`4f85b970`) [coordinator]. The old "RESUME HERE ... NOT pushed" entry (H:1210) is therefore stale.
- Push state of the current branch and whether gates (`pnpm check`, `pnpm ci:local`) passed at HEAD are not
  known to this page. Run them and quote the result before claiming either.

**2026-10-18 update (M8C close-out) [coordinator's brief, relayed; the scribe ran nothing].** Waves F0 to P9 are
committed on the branch (commit list and verification figures in the
[M8C plan banner](milestones/M8C-generation-fill-and-preset-authoring.md)); HEAD is `c57540b9`. The milestone is **not
closed**: the owner obligations in that banner are open (migrations `0009`/`0010`/`0011` and grants on preview and
production, copy approval, provisional figures, Back-history question, first-deploy checks). `pnpm ci:local` was **not
run**. ADR 0167 stays Proposed; its acceptance is the coordinator's or owner's call (Amendment B). Backlog 262-267
recorded. Section 1's HEAD line above is older than this update.

**2026-10-18 update (M8D, preset screens to the v2 mockup) [coordinator's brief, relayed; the scribe ran nothing].**
Plan [`M8D-preset-screens-to-mockup.md`](milestones/M8D-preset-screens-to-mockup.md). The owner's answers to O-1 to O-6
are recorded in [ADR 0104 Amendment G](decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md);
M8D runs on this branch before its PR and before M8B. W0 (docs) is done and W1 is in progress; W2 and W3 are not started
(nothing built by the scribe). **Copy:** the Romanian preset copy was approved 2026-10-18 (relayed). **Still open:** the
Russian copy (an unapproved agent draft, ADR 0095 decision 2), and the two leaves `presetChooser.selectFailed` (approved as
drafted by O-1; whether the copy lock already holds it was not checked) and `presetChooser.selectLimitReached` (wording changed to
v2's *"… Încearcă mâine."* by O-1, in code in W2). Backlog 263 is resolved by decision (delivery in W1).

**2026-10-19 update (M8B Lot 2 built, branch `feat/login-register`, HEAD `a47db452`) [coordinator's brief, relayed; the
scribe ran nothing].** Server waves S1-S10 and UI waves U5, U5b, U6, U10, U12 are committed; each wave was reviewed by reading
(a logic and a security agent). **No tests were written (ADR 0172 D12); nothing was run against a database or in a
browser.** Migrations `0016`-`0018` are **unapplied anywhere** (corrected 2026-10-20 below: now `0016`-`0019`, still unapplied anywhere). In progress, uncommitted: U7/U8 and U11 plus the E8 page
(the e-mail-change UI sits behind `EMAIL_CHANGE_ENABLED = false`; **corrected below: the E8/E9 routes are gated too**). Detail: plan
[§12](milestones/M8B-account-screens-lot2-plan.md); decisions: ADR 0172 Amendment G. **New open owner questions O19-O24:**
O19 (e-mail change takeover recovery; blocks the `UPDATE (email, email_normal_form)` grant, runbook step 4b), O20 (keep
`GET /api/account/profile`), O21 (backup export and `account_id`/`name`), O22 (`/s/<token>` frozen copy after hide), O23
(password change retires all unused tokens), O24 (429 wait in the notice). **Owner re-acceptance needed** of ADR 0019 d11's
scope growth (`hidden_by_client_at`, `deleted_by_client_at`, `sent_at`) before hide, delete **and staff unhide** are used in production
(ADR 0172 Amendment G item 3, dated note 2026-10-21).

**2026-10-19 update, later (M8B Lot 2 UI built, branch `feat/login-register`, HEAD `aa09a1e0`) [coordinator's brief,
relayed; commits read by the scribe in the worktree reflogs; nothing run].** This supersedes the "in progress,
uncommitted" sentence of the update above. U5-U13 are all committed and reviewed by reading (a logic and a security agent
each; no browser, no database run): U7/U8 (card menu, inline rename, duplicate, share sheet on the shared
`share/use-share-link.ts`, delete and hide dialogs), U9b, U11, U12, U13 (export, blob download), the live 429 countdown
for all account forms, login arrival `password-maybe-changed`. **The e-mail change is gated whole:**
`EMAIL_CHANGE_ENABLED = false` hides the UI **and** the E8/E9 routes answer an empty `404` (the earlier "only the UI"
wording was wrong). **New open owner questions O25-O27:** O25 (client load-error wording, RO and RU), O26 (export bound by
bytes against the 200-kitchen count; platform limit unknown), O27 (approve all RO and RU draft copy of Lot 2). O1-O24
keep their recorded states. **D12 was lifted by the owner for the tests round (2026-10-19):** tests are being added in
three lanes (persistence and domain; web server routes; web client, UI and i18n) with mutation proofs; **results to be
recorded** by the coordinator (plan [§13](milestones/M8B-account-screens-lot2-plan.md)). Detail: plan §12.7-§13; ADR 0172
Amendment G, addendum.

**2026-10-20 update (M8B Lot 2, owner rulings; wave H0, records only) [owner rulings relayed by the coordinator; nothing
built or run].** O1 is ruled: autosave only, no Save / Discard (A15 and A16A dropped; the A16B card survives on Step 1,
O28a). O19 is ruled: request-time notice plus a revert link of **24 hours** (O28c); the plan's §14 designs it as waves
S13-0 to U16, none built. O20-O27 are ruled; the backup export will carry `account_id` and `name` (O21). New copy is
pre-approved as drafted (O28b); Lot 1 Romanian copy is approved. **D12 stays lifted for all remaining Lot 2 waves** (QA
and review per tier). Grant 4b (runbook) still waits: it follows S13-0 to U16 reviewed, then the owner, then a separate
flag-flip commit. Detail: plan §9 *(later)* and §14; ADR 0172 Amendment H.

**2026-10-20 update, later (M8B Lot 2, waves S13-0 to U16 built and reviewed) [coordinator's brief, relayed; hashes
quoted from it; the scribe had no shell, saw no gate output and ran nothing].** This supersedes "none built" in the H0
update above and the "O1 blocks U15" wording. Built: H0 `0b3f5ed8`; U15c `1c1dbf0d`, `f80d5d76`; U15d `a573720f`,
`12d1b9ec`, `44f6fda7` (QA `e6b4f55b`); S13-0 `981d165c`; S13a `067c6f41`, `55cb3738`; S13b `6c38bd13`, `779b3b1e`; S13b
security fixes `38d9e780` (migration `0019`, an additive partial index); S13c `fa653ec4`, `6245ea89`; S13d `987992a8`,
`818f94ea`, `45de9d56`, `3d3ca2cd`; U16 `ed4787c7`, `6682af15`; O21 `e4c3fb5a`. All Romanian copy of Lot 1 and Lot 2 is
owner-approved (`883f9372`, `f38815ee`); later copy is pre-approved (O28b). Save / Discard is dropped; nothing pends on
O1. **Migrations `0016`-`0019` are unapplied anywhere. All new SQL has never run against Postgres.** **S13e
(enablement) is NOT done**, blocked on: the owner running grant 4b (preview first), a live or preview SQL check, the
visual pass for U15d and U16 (Step 1 at 390x844 and the back-guard Playwright specs are unverified), and the separate
flag-flip commit. Twelve dated residuals and departures: plan [§14.7.1](milestones/M8B-account-screens-lot2-plan.md);
ADR 0172 Amendment H, addendum.

**2026-10-20 update, final round (M8B Lot 2, older owner questions ruled) [owner answered directly; relayed by the
coordinator; records only, nothing run].** O2 (claim dialog: count, dates and names, as built), O3, O4 (client export
keeps profile and kitchens), O7 (hide revokes the share link), O9 (A16C deferred), O11 (**no `sent_at` backfill**; the
owner-run backfill is cancelled, the S5 replay residual has no repair, older requests are deletable and missed by the
operator "sent" filter), O12 ("Anulează" scoped exception to ADR 0086), O13 (by O27), O14 and O17 (counts take «de» from
twenty up, overriding the 2026-09-10 ruling) are ruled; O15 was not asked. O8 is ruled and its point 1 (a notice to the
owner of an address that already has an account) is source-verified at
`apps/web/src/lib/server/account/change-email.ts` (`sendAddressInUseNotice`: a verified holder gets
`email-change-address-in-use`, an unverified holder nothing). No owner question of Lot 2
is otherwise open. Detail: plan §9 *final round*; ADR 0172 Amendment H, addendum.

**2026-10-20 update (M8B Lot 3, staff area: planned, owner rulings recorded) [owner answered directly through
AskUserQuestion; relayed by the coordinator; records only, nothing built or run].** Plan:
[`M8B-account-screens-lot3-plan.md`](milestones/M8B-account-screens-lot3-plan.md), rulings in its §5.3. O-L3-1 to O-L3-7
are ruled: S3 shows profile contact, request reference and date, and the as-sent kitchen (ADR 0153 d1 unchanged); S6
Prețuri and S7 Traduceri deferred; narrow `INSERT (role)` grant for staff invitations, no `UPDATE (role)` (reverses the
ADR 0172 D7 position for role writes); the app may `UPDATE` only `status` and `sort_position` on presets; notes join the
client export; Lot 3 copy pre-approved as drafted. **Still blocked:** the S4 and S5 waves, until their decision records
and security reviews exist; the undrawn states (plan §10 item 6, §11); retention and erasure for notes, audit rows and
invitations (plan §10 item 8). No wave dispatched.

**2026-10-20 update, wave L3-W0 (records) [scribe; docs only; no shell, nothing run].** Written: ADR 0173 (staff area **Update (coordinator, ran): the two mockups were copied to docs/design/mockups/ and their sha256 matched the plan; the Lot 2 re-render check ran: identical DOM and PNG hashes old vs new at 1440x900 and 390x844.**
P-rows, **Proposed**, awaits coordinator acceptance and a security read) and ADR 0174 (owner rulings O-L3-1 to O-L3-7,
Accepted; S6 deferred naming ADR 0062, S7 naming ADR 0095 decision 2); the plan's scope list, §1/§3/§10/§12 wording
aligned to §5.3. **Not done:** the copy of `Lemnaria Cont Lot 3.dc.html` and the updated `ContBlocks2.dc.html` into
`docs/design/mockups/`, their sha256 check, and the Lot 2 re-render (no shell; `docs/design/README.md` says so). **Not
written, by instruction:** the staff-invitation record (O-L3-4) and the ADR 0112 amendment (O-L3-5).

**2026-10-21 (L3-S1 security-review follow-up, branch `feat/login-register`; docs only) [relayed from the reviewer and QA run 5781729b; the scribe ran nothing].** Runbook `0020`–`0022` section corrected (privilege-test arm red at the table-level assertion with `[]`, arm 2 also red, extra probes, store conditions); ADR 0173 records accepted residuals F1, F2, F5, F6 and open owner questions (retention; E-L3-1 bulk contacts at L3-S6; export of hidden notes at L3-S9), none answered; plan gains brief notes for L3-S3/S5/S8/U4.

**2026-10-21 (Lot 3 staff area, waves L3-A1 to L3-S5 and L3-U1 built; branch `feat/login-register`; docs only) [relayed from the coordinator; the scribe ran nothing].** Owner ruling "Audit each list view + hard page limit" recorded in ADR 0173 (closes the E-L3-1 audit question; `kitchens-listed` row plus a fail-closed per-account page limiter, both to build in L3-S6; domain `d76963d3` built). ADR 0172 D11's lead-to-account revisit trigger fired in L3-S4 (remedy unbuilt, accepted), with pointers in ADR 0153 and 0174. Runbook `0020`–`0022`: grant timing is now "before the first staff route (L3-S6) ships", plus a grants checklist; the owner must confirm `0008`/`0010`/`0012`/`0017` grants before L3-S6 deploys. Plan section 7.1 carries the built-state table and L3-S6 brief notes.

**2026-10-21 (Lot 3 staff list, wave L3-U2; branch `feat/login-register`) [relayed; docs only].** Interim deviation: frame S2F (session-expired sheet over the list) is not drawn; a `401` on the staff list does a full load to the login page, and L3-U4's `staff-session-sheet.tsx` replaces it (plan §7.2, L3-U4 note).

**2026-10-21 update (top bar: signed-out link, title give, popover clamp; branch `feat/login-register`) [developer's
measurements and owner rulings of 2026-10-20 relayed; commits `a05440ce`, `419b7a69`, `1e55d0d1`; the scribe ran nothing].**
Recorded as [ADR 0104 Amendment H](decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md):
the top bar's order of gives is extended (A to E), the visitor's "Intră în cont" is icon-only on narrow widths (departs from
mockup A19A, dated note in `docs/design/README.md`), the title yields at 900 px, and the price popover is clamped to the viewport.

**2026-10-26 update (M10, manufacturer price dashboard: W0 records) [coordinator's brief, relayed; the scribe ran nothing,
had no shell and saw no gate output].** Branch `m10-price-dashboard` (pushed to origin up to `a6b23c18`, 2026-11-05; corrected 2026-11-10, first said "local, not pushed"); the plan
[`M10-price-dashboard.md`](milestones/M10-price-dashboard.md) is committed (`730458bd`, per the coordinator). The owner
instructed on 2026-10-26 that M10 be planned and implemented now, in parallel waves (relayed). Written in W0, **uncommitted
at the time of writing**: ADR [0176](decisions/0176-the-manufacturer-price-dashboard-is-milestone-m10-and-starts-now.md)
(timing; supersedes ADR 0062's "after M8"; satisfies ADR 0174 O-L3-2), ADR
[0177](decisions/0177-the-m10-pricing-seams-rounding-round-up-percentages-deepening-fixed-size-rows-linked-accessories-and-the-lift-mechanism.md)
(pricing seams) and ADR [0178](decisions/0178-the-m10-dashboard-storage-lifecycle-defaults-notice-seen-and-digest.md)
(storage and lifecycle; **Accepted, security-reviewed 2026-10-26, findings F1–F10 applied**), dated amendments to ADRs 0062, 0068, 0070, 0072, 0092, 0100,
0106, 0173, 0174 and 0175, and notes on backlog 54, 176 and 276-286. **Nothing is built; no code wave is dispatched until
W0 and X0 merge (MP-0).** Migrations `0023`-`0029` (renumbered 2026-10-27, ADR 0178 Amendment; first planned as `0025`-`0031`) are **unapplied anywhere**. **Open owner flags, blocking
nothing:** OQ-5a (is a lift door's third hinge from 500 mm or above it; built strict, `> 500`) and OQ-4a (the
coordinator's reading that creating an accessory linked to a cabinet type is in scope). Close-only questions: plan §6.2.
**No amount or percentage in the plan, mockup or briefs is approved.** ADR 0173 stays Proposed; its acceptance is owed.

**2026-11-08 (M10 R4b2) [relayed from the coordinator; reviewers' reports; the scribe ran nothing].** R4b2 was built and reviewed on branch `m10/r4b2` and is **merged** (`6aea980d`; corrected 2026-11-09, this line first said unmerged). Visual pass and e2e are not done. Detail: the *R4b2 built and reviewed* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**2026-11-08 (M10 R4b3) [relayed from the coordinator; reviewers' reports; the scribe ran nothing].** R4b3 was built and reviewed on branch `m10/r4b3` and is **merged** (`9bb349ea`; corrected 2026-11-09, this line first said unmerged); R4c followed. The `CI=1` e2e specs and the visual pass are not done. Detail: the *R4b3 built and reviewed* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**2026-11-09 (M10 R5b) [relayed from the coordinator; source-verified by the coordinator; the scribe ran nothing].** R5b is merged (`26606c74`): the price-notice GET and acknowledge routes. QA green; full `apps/web` vitest 1156 files / 28788 passed / 2 skipped; `tsc` and `eslint` clean; logic, clean-code and security reviews found no blocker. Next: Q3, Q4, Q5, then R4c, then the Z gate. Detail and the five residuals: the *R5b merged* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**2026-11-09, later (M10 T4, Q3a, Q3c, Q4, Q3b) [relayed from the coordinator; source-verified by the coordinator with merged-tree gates (`tsc` and `eslint` exit 0, `apps/web` vitest all passed at each merge); the scribe ran nothing].** T4, Q3a, Q3c, Q4 and Q3b are merged locally, after the pushed tip `a6b23c18` (tip `90324563`; corrected 2026-11-10, first said "unpushed"). **Correction:** S2c was merged on 2026-11-05 (`64d98623`); any line listing it as unbuilt is stale. **Q3d is built (`c6211abd`, `m10/q3d`) and in QA, not merged.** Remaining order: Q3d QA, reviews and visual, then Q5, then R4c, then the Z gate; Q3d and Q5 merge together before any push. Open: T4's two Romanian leaves are drafted, not approved (OQ-11g); Q4's desktop placement (scene-footer card, not the C5AD rail) may be overruled by the owner; Q3b's availability-outage residual is an owner call; about 11 stray e2e designs to clean before the Z gate. Detail, figures and residuals: the *Q3 sub-waves T4, Q3a, Q3c, Q4, Q3b merged* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**2026-11-09, latest (M10 Q3d, e2e rewrite, T5, Q5a, Q5c) [relayed from the coordinator; gates verified by the coordinator on the merged trees; the scribe ran nothing].** Merged locally, after the pushed tip `a6b23c18` (corrected 2026-11-10, first said "unpushed"): Q3d (replacement sheet; merge `a8e1a193`; replacement-sheet and global-settings-apply e2e specs 5 passed under `CI=1`), `m10/e2e-withdrawn`, T5 (`replacementSheet.changedColour`, drafted not approved), Q5a, Q5c (visual check owed). **Q5b is built (`fe992f4d`, `56c18187` on `m10/q5b`) and in QA, not merged.** Owed before the Z gate: Q5b and Q5c visual checks, the review control's disabled look, the waiting colour row's missing copy, owner decisions on the frame deviations, cleanup of about 25 stray e2e designs, and rewriting the M10 phase-table row below (stale since 2026-11-04). Remaining: Q5b QA/reviews/visual/merge, R4c1-R4c3, Z gate. **Proposed ruling awaiting owner confirmation:** ADR 0081 Amendment 2026-11-09 (the C4 sheet announces the colour reset after a forced replacement instead of confirming first). Detail: the *Q3d, e2e rewrite, T5, Q5a, Q5c merged* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**2026-11-09, close (M10 Q5b, Q5d, R4c1 merged; R4c2 started) [relayed from the coordinator; gates verified by the coordinator on merged trees: `tsc` and `eslint` exit 0, `apps/web` vitest 1212 files / 30005 tests passed at the R4c1 merge; the scribe ran nothing].** Merged locally, after the pushed tip `a6b23c18` (corrected 2026-11-10, first said "unpushed"): Q5b, Q5d, R4c1. R4c2 (`m10/r4c2`) is started, not merged. Remaining: R4c2 QA, reviews (security) and merge; R4c3 (Delete on in the dashboard; Full + visual); then the Z gate, which needs owner go-ahead before touching the shared test DB. Ruling 4's text was falsified by Q5b and is corrected; the Q5-a "price shows once the save lands" acceptance is recorded as a departure (price shows after Apply, the rest waits for the save); ruling 14 is a real defect closed as unreachable for app-written books and **added to the Z gate** (every hardware class in the active book states the same rate fields, or the parser requires all five). Detail and residuals: the *Q5b, Q5d, R4c1 merged* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**2026-11-09, after close (M10 R4c2 merged) [relayed from the coordinator; gates run by the coordinator on the merged tree under `rtk proxy`; reviewers' reports; the scribe ran nothing].** R4c2 is merged locally, after the pushed tip `a6b23c18` (merge `a9a35ce1`; corrected 2026-11-10, first said "unpushed"): deletion is accepted at the draft route. `tsc` and `eslint` exit 0; `apps/web` vitest 1219 files / 30189 tests passed; R-j ancestry (`dafc263b`, `a8e1a193`) exit 0. Logic review: no defects; clean-code: no blockers; security: no exploitable issue, one Low (no in-flight slot on the pre-check, only the 600/h draft bucket; refused deletions leave no audit row), accepted residual unless the owner wants a limiter. Nine residuals, including that R4c3 must handle a linked row the catalogue no longer prices and that the memo TTL (60 s) is provisional for the owner to retune. This supersedes "R4c2 started" above. Next: R4c3 (Delete on in the dashboard), then the Z gate, which needs the owner's go-ahead. Detail: the *R4c2 merged* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**2026-11-10 (M10 R4c3 closed; Z gate in progress) [relayed from the coordinator, who ran the commands; the scribe ran nothing].** R4c3 (client Delete on) is merged locally and **closed** by owner instruction (`c9dd3536`; fixes `b7e86955`, `ce139f1c`), after the pushed tip `a6b23c18` (corrected 2026-11-10, first said "unpushed"); M10 stays open. Z gate: persistence live suite on staging green after `d0b122dd`; migrations 1-29 applied in production and staging. **`pnpm ci:local` exit 1, open:** `e2e-shard-budget` and `e2e` (8 mobile failures) fail, being fixed in a separate wave. Still open in Z: live S7/S2/S4 runs, C-grants check, S7 sabotages, demotion-write test, stray e2e designs, production grants SQL (owner's). Residuals, deviations and figures: the *R4c3 merged and CLOSED* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**2026-11-10, owner rulings (M10) [owner, in chat, relayed by the coordinator; the scribe ran nothing].** Full list in the
*Owner rulings of 2026-11-10* block of [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md). In short: the ADR 0081
amendment is rewritten and **its push block is lifted** (the C4 sheet only says the material and colours are unavailable; no C4C
line; [ADR 0081](decisions/0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md), pointer in ADR 0178 A-16);
a push still needs a green `pnpm ci:local`. Frame deviations, memo TTL 60 s and no limiter are accepted. Staging may be cleared of
its stray designs. Production grants for `0023`-`0029`: owner-run, unverified. Preview steps deferred.
`ci:local`: a third full run was in progress; desktop e2e is now 8 shards.

**2026-11-10, C4 wave CLOSED [relayed from the coordinator, who ran the gates; reviewers' and verifier's reports; the scribe ran nothing].** Merged locally: C4a `ac81cdad` (ro/ru leaf `replacementSheet.materialAndColoursUnavailable`, Drafted under OQ-11i; Russian pill "Материал"), C4b `21eb9c7a` (reset line and `colourReverted` removed, note after the lead, D2 colour row without value), review round `097c9989`. Coordinator gates: `tsc` exit 0; vitest on price, i18n, settings plus `leaked-id.test.ts` exit 0 (340 files, 6532 tests). Logic review minor concerns, no logic bug; clean-code no blockers. Seven residuals (visual case of a cleared colour row not reproducible; settings sheet at 1440 unverified; e2e not sabotage-tested; a nearly vacuous QA DOM check; an undiagnosed Next 404 after a mint in about 8 of 14 hand-started runs; 900x500 pill and tier-pick state not run; ro/ru text awaits owner approval). Detail: the *C4 wave merged and CLOSED* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).

**Push state and Z gate, 2026-11-10, latest [coordinator, relayed; detail and tiers: the *Z gate close-out* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md)].** The owner pushed: after `git fetch`, local HEAD and `origin/m10-price-dashboard` are both `99857d26` (0 commits either side). This supersedes every "pushed up to `a6b23c18`", "local only", "unpushed" and "145 commits" line above. PR 16 on DumitruSirbu/lemn-conf-v2 is the PR; its state is unverified (`gh` 401). The push came **before the final `pnpm ci:local` on this tree finished; that run was in progress, result unknown** (the earlier third run, before the C4 commits, passed all 10 gates: 1423 e2e, 30311 unit tests). Z1: live S2 221, S4 145, S7 131 passed on staging (QA report, not re-run); S7 sabotages all red; the demotion-write test was never skipped. The 183 staging designs are deleted (0 left). `0023`-`0029` grants were run by the owner on production (coordinator-compared with the runbook), preview and staging (owner's word). **Not run:** the live application-role-privileges test against staging (it ran on an unconfirmed database, possibly preview). Moot until a book is active: the stored-version parse check and ruling 14's rate-uniformity check (production has 0 `price_book_versions` rows). R4c3 residuals closed in `99857d26` (340 files, 6526 tests, exit 0); still open: `candidate-refused` does not re-read the draft, duplicated `deskDeleting` test helpers. **State not stated in the docs:** S6, T2, K4, Q1c (last entry 2026-10-28 says QA, not merged; probably stale), Z2 (release notes and test audit; waits on Z1).

**2026-11-11 (M10 Z1 visual pass and Z2 test audit done; M10 NOT archived) [relayed from the coordinator; the reports and commit subjects read by the scribe; the scribe ran nothing and had no shell]. This supersedes the "Z2 waits on Z1" and "state not stated: Z2" sentences above.** Detail and evidence: the *Z1 visual pass and Z2 close, 2026-11-11* block in [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md).
- **Z1:** [`milestones/m10-z1-visual-pass-report.md`](milestones/m10-z1-visual-pass-report.md): 75 frames, 61 reproduced, 10 partial, 4 not [counts relayed]; no functional defect on a dashboard surface; frame deviations were accepted by the owner earlier. The React #418 it saw is a harness artifact, **not a customer bug and not an M10 regression** ([`milestones/m10-hydration-418-diagnosis.md`](milestones/m10-hydration-418-diagnosis.md)): do not chase it.
- **Z2:** [`test-audits/m10-close-audit.md`](test-audits/m10-close-audit.md): 3 cannot-fail, 1 near-duplicate, 4 obsolete, all fixed and proven by mutation in `77fadd67`. Release notes are `044a11f1`. Audit limits stand (persistence, e2e and three-adapter files not run; `d61bfd6d..0910dc06` unaudited).
- **Timeouts:** `a739d4d9` (domain sweeps) and `d3cb086b` (three-adapter) size the slow tests' timeouts; `e073ed9b` recorded the Z gate close-out.
- **Backlog 291-299** record the deferred items.
- **Push state:** commits up to `d3cb086b` are on origin; `77fadd67` and the Z-close docs are local. The push gate (`pnpm ci:local`) failed once on machine load (stale processes) and the owner pushed manually. **The re-run of the gate for the final tip is pending; no result is recorded.**
- **Why not archived:** Z1's criterion "`pnpm ci:local` on a clean tree, quoted" has no run for the final tip, and the state of S6, T2, K4 and Q1c is recorded nowhere the scribe could read. Owner items OQ-41 to OQ-44, OQ-11g, OQ-11h and OQ-11i do not block (defaults stand).

**Open M10 items:**
0. Run `pnpm ci:local` on the final tip and quote it; state whether S6, T2, K4 and Q1c are merged (git log); then archive M10 (WORKFLOW step 7).
1. ~~Q5b rework~~ and ~~Russian pill~~ done by the C4 wave (above). Whether `replacementSheet.changedColour` (T5, OQ-11h) is dead copy stays for the architect.
2. Owner approval of the new ro text and the ru leaf (OQ-11i, drafted).
3. ~~Delete the stray designs on staging~~ done 2026-11-10 (183 deleted, 0 left).
4. OQ-41, OQ-42, OQ-43, OQ-44, OQ-11g, OQ-11h: defaults stand until answered. OQ-44's answer also triggers the ADR 0178 A-15 amendment pointer.

## 2. Phase table

Read column: **No** = do not open. A row marked **UNCLEAR** would be a contradiction inside the history, left
for the owner to rule, not guessed; none is open now.

| Phase | Status | Why (one line) | Read? | Evidence |
| --- | --- | --- | --- | --- |
| M0 Foundations | Done 2026-08-24 | Closed, partly superseded | No (`milestones/done/`) | doc-quoted H:581 |
| M1 Scene port | Done 2026-08-25 | Closed | No | doc-quoted H:582 |
| M2 Void engine | Done 2026-08-25 | Closed | No | doc-quoted H:583 |
| M3 Mutations | Done 2026-08-26 | Closed | No | doc-quoted H:584 |
| M4 Editor surface | Done 2026-08-26 | One criterion unmet by design (ADR 0024) | No | doc-quoted H:585 |
| M5 Width editing | Done (owner ruling 2026-10-18) | 5A-5D2c, 5F-5H shipped; the history still recorded wave 5E as owed, the ruling closes the phase | No (`milestones/done/`: `M5-width.md`, `M5-frozen-map.md`) | owner ruling 2026-10-18 (coordinator-relayed); H:586, 1045, 3292 |
| M5B Manual UX remediation | Done 2026-09-02 | All eleven waves shipped | No (`milestones/done/`) | doc-quoted H:618, 658 |
| M6 Price bar and global settings | Done (owner ruling 2026-10-18) | The history still listed 6T, 6T2, 6W, 6V, 6X as open (H:587-588); the ruling closes the phase | No (`milestones/done/`) | owner ruling 2026-10-18 (coordinator-relayed); H:587-588, 3344-3345 |
| M6B Internationalization | Done (owner ruling 2026-10-18) | All waves shipped; Gate O2 closed 2026-09-11 | No (`milestones/done/`) | owner ruling 2026-10-18 (coordinator-relayed); H:589 |
| M7 Room and presets | Done 2026-09-29 | ADR 0131, ADR 0104 Amendment B | No (`milestones/done/`) | doc-quoted H:74, 590 |
| M7B U-shaped rooms | Done (owner ruling 2026-10-18) | Waves U0-U7 per the history; the ruling closes the phase | No (`milestones/done/`) | owner ruling 2026-10-18 (coordinator-relayed); H:612 |
| M7C M7 feedback fixes | Done (owner ruling 2026-10-18) | Merged as PR #10; the history showed close-out criteria CE and C6 unreconciled (H:1382, 1393); the ruling closes the phase | No (`milestones/done/`) | owner ruling 2026-10-18 (coordinator-relayed); H:613, 1382, 1393 |
| M8 Review, contact, success | In progress, not done | Open list in section 3 | Yes, [`M8-review-contact-success.md`](milestones/M8-review-contact-success.md) | doc-quoted H:614, 1215 |
| 8M2, 8J2 (file `8N-`), 8Q2, 8V | Done, archived | M8 sub-waves | No (`milestones/done/`) | doc-quoted H:1210-1213; files in `milestones/done/` |
| 8U Merge adjacent empty spaces | Built and reviewed; plan not archived; S5 not built | Close note lists code comments to repoint before archiving | Only for S5 / the repoint list, [`8U-...md`](milestones/8U-merge-adjacent-empty-spaces.md) | doc-quoted H:1212, 1219 |
| M8B Accounts: login and register (Lot 1 backend, waves L1-L13a) | Built, unexercised (no tests this round, ADR 0172 D12); ADR 0172 accepted by the owner 2026-10-18 | Branch `feat/login-register`, local, not pushed. `main` (M8C's `0011`, M8D) is merged into it; the accounts ADR was renumbered 0169 -> 0172 at that merge because `main` holds a different 0169 (migration commands), 0170 and 0171. Migrations `0012`-`0015` are **unapplied** and need `0011` applied first (owner step; order and grants in ADR 0172 *Remaining before production*); screens L13b-L14b wait for Claude Design | When started, [`M8B-login-register-plan.md`](milestones/M8B-login-register-plan.md) | doc-quoted (the branch's pre-merge STATUS, 2026-10-18; coordinator-relayed counts not re-run) |
| M8B Account screens Lot 2 (client dashboard A9-A20) | **Update 2026-10-19 (later): S1-S10 and U5-U13 built and committed (HEAD `aa09a1e0`), reviewed by reading only, unrun; e-mail change gated whole by `EMAIL_CHANGE_ENABLED = false`; D12 lifted for the tests round, three lanes, results to be recorded; open questions O19-O27 (section 1); ADR 0172 Amendment G and addendum.** *Earlier 2026-10-19 text: S1-S10, U5, U6, U10, U12 built, U7/U8 and U11 in progress, no tests (D12).* Original row: designs received, port plan written 2026-10-19; draft, no wave dispatched | Architect rulings recorded as ADR 0172 Amendment F as coordinator-accepted defaults, pending owner confirmation; owner questions O1, O2, O8, O12, O17 open; O5, O6, O10, O16, O18 answered 2026-10-19 (ADR 0172 Amendment F, 2a). Waves U1-U4, U9a, U15a and U15b are committed on `feat/login-register`; commit `9d33cd6a` is the latest [coordinator-relayed, not re-run] | When started, [`M8B-account-screens-lot2-plan.md`](milestones/M8B-account-screens-lot2-plan.md) | doc-quoted (the branch's pre-merge STATUS) |
| M8B Customer profiles (original plan) | Planned | After M8C by owner ruling, before launch; superseded in part by the two rows above | [`M8B-customer-profiles.md`](milestones/M8B-customer-profiles.md) | doc-quoted H:615, 6-15 |
| M8C Generation fill and preset authoring | Waves F0-P9 committed, not closed | See the 2026-10-18 update in section 1; owner obligations open | Yes, [`M8C-...md`](milestones/M8C-generation-fill-and-preset-authoring.md) | git log (coordinator) + doc-quoted H:6-29 |
| M8D Preset screens to the v2 mockup | W0 done; W1 in progress (2026-10-18, relayed) | Runs on this branch before its PR and before M8B (owner O-5) | Yes, [`M8D-...md`](milestones/M8D-preset-screens-to-mockup.md) | coordinator's brief (relayed) + doc-quoted plan banner |
| M10 Manufacturer price dashboard | **In progress** (2026-11-09, rewritten; the 2026-11-04 text was stale). Merged on `m10-price-dashboard`, pushed only up to `a6b23c18`, later commits local (corrected 2026-11-10; per the 2026-11-09 entries in section 1; the R4a/R4b merge state is not restated here): R5b, T4, T5, Q3a-Q3d, Q4, Q5a, Q5b, Q5c, Q5d, the e2e rewrite, R4c1. **Update 2026-11-10: R4c2 merged (`a9a35ce1`) and R4c3 merged and closed (`c9dd3536`); nothing in flight.** **Update 2026-11-10, latest: pushed, local and origin both `99857d26`; the final `ci:local` on this tree was in progress, result unknown.** **Update 2026-11-11: Z1 visual pass and Z2 audit done, `77fadd67` local, origin at `d3cb086b`; the final-tip `ci:local` re-run is pending; NOT archived (section 1, 2026-11-11 entry).** **Remaining:** see section 1, *Push state and Z gate, latest* (live S2/S4/S7 passed on staging; stray designs deleted; privilege test not run on staging; Z2 waits). K2a parked until K2b. **Push:** the ADR 0081 block is lifted by the owner's ruling of 2026-11-10; a green `pnpm ci:local` is still required. Open items: section 1, 2026-11-10 owner rulings | Branch `m10-price-dashboard`; runs in parallel with the open M8 work by owner instruction of 2026-10-26 (ADR 0176). Push state of the 2026-11-04 tip is not re-checked by the scribe | Yes, [`M10-price-dashboard.md`](milestones/M10-price-dashboard.md) | coordinator's brief (relayed), merged-tree gates quoted in section 1; the older waves list is in the milestone file |
| M9 Delivery preparation | Proposed stub | No plan, no waves; inherits 8R/8S and the launch gate | When started, [`M9-delivery-preparation.md`](milestones/M9-delivery-preparation.md) | doc-quoted H:616 |
| Adversarial review remediation | Done (S1-S12 shipped, commits db9c4024..); only SEC-001 stays open, as a launch gate tracked in `docs/backlog/open.md` and M9 | Plan archived at `milestones/done/adversarial-review-remediation.md` | No | doc-quoted H:617, 625-642; shipped state verified in git/source by a read-only analyst (coordinator-relayed) |
| dom-003 set-width split | Done (shipped in 30283571) | Nine-module `set-width.ts` split; plan archived at `milestones/done/dom-003-set-width-split.md` | No | doc-quoted H:617, 630; commit verified in git by a read-only analyst (coordinator-relayed) |
| 8q-s0-measurements | No status in the history | Measurement record for the 8Q wave | Inference: no, 8Q2 is done | inference (file name only; not opened) |
| chrome-parity-with-the-design-reference | Done (shipped via 55c0a9b4, 0efcbbd1, d1f34977, b489f028; ADR 0104) | Plan archived at `milestones/done/chrome-parity-with-the-design-reference.md` | No | commits and ADR verified in git/source by a read-only analyst (coordinator-relayed) |
| migration-environment-safety-check | No status in the history | Standalone plan | Inference: only for a migration task | inference (not opened) |

### Rows the history contradicts

None left. M5, M6, M6B, M7B and M7C were open or UNCLEAR in the history; the owner ruled all five Done on
2026-10-18 and their plans moved to `milestones/done/`. Their old contradiction notes are in
`archive/STATUS-history.md`.

## 3. What is open right now

**M8C** (branch in section 1; plan [`M8C-...md`](milestones/M8C-generation-fill-and-preset-authoring.md); ADRs
[0167](decisions/0167-generation-fills-every-free-wall-run-end-that-the-narrowest-catalogue-cabinet-fits-at-every-level-its-column-carries-and-a-narrower-end-stays-bare.md)
and [0168](decisions/0168-the-owners-no-new-tests-is-option-c-for-m8c-the-existing-suites-are-updated-and-four-places-keep-a-committed-test.md)):

- Fix 1 (fill every free wall-run end the narrowest catalogue cabinet fits): F0, F1a, F1b are committed. Whether
  their QA and review rounds ran is not stated in anything I read; check the plan before treating F1 as closed.
- Fix 2 (save a kitchen as a preset, list on Step 1, carousel preview, use a copy): authoring group P1 to P4,
  then an **owner checkpoint** (migrations `0009`, `0010`, `0011`, grants, deploy to production, author there),
  then P5 to P9 (H:21-24).
- Fix 3 (accounts, roles, dashboard) stays M8B's. M8C runs before M8B by owner ruling. No owner question open
  at the F0 banner (Q-1 to Q-8 answered) (H:12-15).
- Launch-gate line: the ungated save-as-preset policy is removed or replaced before the first public deploy;
  the check does not exist yet (wave P3) (H:25-26).

**M8 (parent) stays open for** (H:1215-1220, as of 2026-10-17):

1. The M8 test audit over the 8Q2, 8M2, 8J2, 8U and 8V tests (ADR 0152 Amendment A); **backlog 249 blocks the
   close** until the auditor retitles or deletes the test that cannot fail its title.
2. The owed live persistence run of `findSentReference`, alone (ADR 0155).
3. Wave 8T: the owner, a real phone, a TLS host.
4. `pnpm ci:local` in full, quoted, before any push. `pnpm gate:launch-placeholders` stays red by design until
   Q3 (the shop's real number).
5. 8U S5 (retire the 800 mm cuts inside the commands) is not built; backlog 255. Repoint the code comments
   listed in the 8U close note; fix the stale comment of backlog 252.
6. Dated notes still owed from 8M2's close: ADR 0159, 0114 G, 0148, 0156, 0095, and the M8 plan's struck lines.

**Owner-side checkpoints** (H:1216; add-only for variables, see
[`best-practices/environments-and-resources.md`](best-practices/environments-and-resources.md)):

- Apply migration `0010` and its grant on preview, then production, before the code ships there
  ([runbook](runbooks/applying-a-table-migration-and-its-application-role-grant.md); backlog 254).
- Set `LEMNARIA_PUBLIC_ORIGIN` per environment; the three mail variables on Vercel Preview and Production (not
  reported done).
- The one real send from Preview, opened in Gmail web, Gmail Android and iOS Mail, and the button on a phone
  that never saw the design; the `preview:lead-notice` preview.
- Copy approvals (provisional notice and done-page strings; Russian leaves needing re-signing); Q61-Q63 if the
  defaults are not wanted; Q3's real shop number; backlog 236 (`deploy.yml`).
- Production migration state of `0004` and `0009`'s owner steps: see H:636-642 and H:1218 before any deploy.

**Open test hygiene:** backlog 232, 145, 249.

**Test audit cadence** (ADR 0152 Amendment A, H:44-47): the audit runs at each milestone's end; a "cannot fail"
finding keeps the milestone open. M8's close includes the first incremental audit.

## 4. Standing pointers

- **Security decision, ADR 0019**: [`decisions/0019-security-baseline-writes-throttling-retention.md`](decisions/0019-security-baseline-writes-throttling-retention.md)
  (writes, throttling, retention; supersedes ADR 0014). Staged across phases. Open parts as of H:1195-1202:
  rate limiting and BotID/honeypot (M8), WAF rules (M9), the mint limit (ADR 0147, not built at that date), and the
  launch gate SEC-001 (application half M8, the gate moves to M9). Do not restate the ADR; read it.
- **Backlog**: [`BACKLOG.md`](BACKLOG.md) — reported issues with no owner or phase; check it before proposing a fix.
- **Decisions**: [`decisions/`](decisions/) — the knowledge base; a dated record beats prose and is never
  silently overturned.
- **Phase sequence and reasoning**: [`milestones/README.md`](milestones/README.md).
- **Workflow**: [`WORKFLOW.md`](WORKFLOW.md).

## 5. Keeping this file honest

Condensed from H:3315-3346. Update it when a phase changes state, not in a batch later.

- **Copy quantitative claims from a command you ran, or from a dated record that ran one.** Never carry a count
  forward from a commit message.
- **Record what is not met, at the criterion.** An unmet gate that is written down is manageable; one quietly
  assumed met is not. The same applies to this file's claims about other documents.
- **A commit in a worktree is work this file must already know about.** Record a wave as implemented-and-unmerged,
  with its commit and its worktree, the moment the commit exists, never as open.
- **When the history contradicts itself, mark it UNCLEAR and quote both lines.** Do not resolve it by guessing.
- Keep this page short. Per-wave detail goes in the milestone file or an ADR; this page links to it.
