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
| M8B Customer profiles | Planned | After M8C by owner ruling, before launch; no wave dispatched | When started, [`M8B-customer-profiles.md`](milestones/M8B-customer-profiles.md) | doc-quoted H:615, 6-15 |
| M8C Generation fill and preset authoring | Waves F0-P9 committed, not closed | See the 2026-10-18 update in section 1; owner obligations open | Yes, [`M8C-...md`](milestones/M8C-generation-fill-and-preset-authoring.md) | git log (coordinator) + doc-quoted H:6-29 |
| M8D Preset screens to the v2 mockup | W0 done; W1 in progress (2026-10-18, relayed) | Runs on this branch before its PR and before M8B (owner O-5) | Yes, [`M8D-...md`](milestones/M8D-preset-screens-to-mockup.md) | coordinator's brief (relayed) + doc-quoted plan banner |
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
