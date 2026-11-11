# M10 release notes: price dashboard (for the owner)

Written 2026-11-10 by the scribe. Nothing here was run by the scribe; every claim is copied from the document
named beside it. Abbreviations: **M10** is `docs/milestones/done/M10-price-dashboard.md` (archived 2026-11-11), **STATUS** is `docs/STATUS.md`,
**runbook** is `docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md`.

This directory is new: no earlier release-notes file exists outside the archives, so there was no better home.

## 1. No rollback past the build that introduced `settings.handle` or `settings.topRowHandle`

- Once a saved kitchen carries `settings.handle` (H1) or `settings.topRowHandle` (H2), do not roll the deployment
  back to a build without those keys. The design settings schema is a `strictObject` and refuses an unknown key
  [M10 Z2; M10 H-5].
- In practice: every such kitchen becomes unreadable on load. ADR 0099 decision 10 states the same hazard for
  `settings.finish`: a rollback "turns every one of them into a `DESIGN_UNREADABLE` 500 on load"
  [ADR 0099 d10].
- Going forward is safe: Vercel deploys server and client together, and an old client simply omits the key
  [ADR 0099 d10].
- This is a deployment note, not a migration; no schema-version bump is involved [M10 H-5; ADR 0099 d10].
- The fix after a bad deploy is a fix-forward build, not a rollback. (This sentence is the scribe's reading of the
  above, not a quoted rule.)

## 2. Migrations 0023 to 0029 and the application-role grants

All seven are applied in production and staging [STATUS, push state and Z gate, 2026-11-10]. The grants were run by
the owner on production (coordinator-compared with the runbook), preview and staging (the owner's word)
[STATUS, same block].

Grants go to the role `app_designs`. Tables, by migration [runbook, lines 1182-1284]:

| Migration | Tables the role is granted on |
| --- | --- |
| 0023 | `price_book_versions` |
| 0024 | `price_book_draft` |
| 0025 | `catalogue_availability_head`, `catalogue_availability_changes` |
| 0026, 0027 | `design_staff_seen`, `contact_submissions` (column `priced`), `staff_change_digest_rounds`, `staff_change_digest_entries` |
| 0028 | `design_price_notices` |
| 0029 | `kitchen_defaults` |

- No grant gives `DELETE`, `TRUNCATE`, `ALL`, `PUBLIC` or a grant option [runbook, per wave].
- The exact statements are in the runbook; the runbook itself says to re-check them against the merged migration
  files [runbook, 1184-1185].
- Without the grants the new routes answer 503 [runbook, 1221-1223, 1248-1249, 1271-1273].
- Not verified: the live application-role-privileges test against staging was not run on a confirmed database
  [STATUS, push state]. Production grants are the owner's and unverified by tests [STATUS, 2026-11-10 rulings].

## 3. Deploy order and the production state

- Order: migrations and all their grants first, then the code [runbook, 1221-1223, 1248-1249, 1271-1273].
- Production has **no stored price-book version**: `price_book_versions` has 0 rows, `price_book_draft` has 1 row
  [M10, Z-gate block, line ~3032 and ~3077].
- Customer side with no active book: the price bar, account card and sent-kitchen estimate show no figure; new
  kitchens get only four of the six default keys (no tier ids); price-notice reading takes its `no-active-version`
  path and touches nothing in `0028` [M10 R-b, line 2428; M10 rule 3, line 3171; M10 line 3667]. The same four-key
  result also occurs when the stores are unavailable [M10, line 2893].
- Earlier text said the editor and share view crash with no active book (R1 review, line 2430); that was a finding
  for Q3 to cover. Whether Q3 closed it in the shipped build is **not verified here**.
- Dashboard publish and delete paths are live per the milestone (R4c2 accepts deletion at the draft route; R4c3
  turned client Delete on) [STATUS 2026-11-09 and 2026-11-10].
- Moot until a book is active: the stored-version parse check and the rate-uniformity check (ruling 14)
  [M10, line 3077]. The first publish is the first time they matter.

## 4. What changed for the owner

Dashboard (desktop) [M10 §1, §2 frame table]:
- Edit cabinet anchor prices and steps, hardware classes, material percentages, the depth rule, accessories (D2-D6).
- Disable an option, or delete one, each through a dialog; the dialogs use usage counts (D4-D6; D10C cycle).
- Edits collect in a draft and go live together through **Publicare prețuri** (D7).
- Version history and restore (D8). A restore beside a draft that deletes a row leaves that row alone
  [M10 R4c1; ruling 12].
- New-kitchen defaults (D9).
- Shop side: a badge in **Bucătării clienți** and a daily digest e-mail for kitchens changed since staff last
  opened them (D10) [M10 §1].

Customer side [M10 §1, §2]:
- One calm price notice banner (C1) when a saved kitchen is affected.
- A kitchen using a disabled option must pick a replacement before seeing a price (C4). The sheet says only that
  the material and its colours are not available, and announces no colour reset (owner ruling 2026-11-10;
  STATUS, 2026-11-10 rulings; C4 wave block).
- A soft note on a sent kitchen (C5A). The two estimates are labelled "trimisă" and "actuală" [M10 RK-1].

## 5. Known limits and open owner items

- Defaults stand until answered: OQ-41 (generic line for a vanished class), OQ-42 (banner, not sheet, when only
  accessories were removed), OQ-43 (pill leaves out the hardware entry while a hardware row is owed), OQ-44 (the
  deletion stays on restore), OQ-11g, OQ-11h [M10 lines 4149-4154, 4493-4498; STATUS open items].
- OQ-11i: the new Romanian text and the Russian leaf `replacementSheet.materialAndColoursUnavailable` are Drafted,
  not approved [STATUS, C4 wave block and open items].
- The Russian copy is an agent draft, kept marked and never pinned (ADR 0095 d2) [M10 RK-3].
- The memo TTL is 60 s, accepted by the owner on 2026-11-10; there is no pre-check limiter, also accepted
  [STATUS, 2026-11-10 rulings].
- `ci:local`: the push (`99857d26`) came before the final run on that tree finished; its result is unknown
  [STATUS, push state].
- Still open: `candidate-refused` does not re-read the draft; duplicated `deskDeleting` test helpers; S6, T2, K4,
  Q1c and the Z2 test audit have no stated state [STATUS, push state].
- M10 stays open until the Z2 test audit has no "cannot fail" finding [M10 Z2]. **Superseded 2026-11-11: the Z2
  audit findings were fixed in `77fadd67` and M10 is closed and archived** [`milestones/done/M10-price-dashboard.md`,
  close block]. The "no stated state" line above for S6, T2, K4, Q1c and the Z2 audit is also superseded: all are
  built or merged (section 6).

## 6. Production notes added 2026-11-11 (S6, K4, K4b, S6b) [M10 close block, S6/K4/K4b/S6b block; coordinator's reports; nothing run by the scribe]

- **Two new crons in `vercel.json`:** the staff-change digest at `0 5 * * *` (05:00 UTC) and the nightly
  price-dashboard backup at `45 3 * * *` (03:45 UTC). `vercel.json` now holds 5 crons. **The owner must confirm the
  Vercel plan allows that many.**
- **No new environment variable** (the K4 digest route authenticates by `CRON_SECRET` only, per its report), **no new migration and
  no new grant, and no new Blob store.**
- **Blob prefix for the export: `backups/price-dashboard/`** (rotation 14 days, at most 30 files).
- The digest goes to the configured shop inbox, not to accounts holding `contact.read` (backlog 302); the new nav
  badge and digest copy (OQ-11j) are drafted, not approved.
- The restore runbook does not yet cover the price-dashboard export (backlog 300; a stub is in
  `runbooks/design-db-restore.md`).
- Gate evidence for the final tip: STATUS, 2026-11-11 close entry.
