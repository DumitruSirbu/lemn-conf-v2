# ADR 0173 — The staff area: routes, an audit that fails closed, kitchen visibility, notes, status and pagination rulings for the Lot 3 port

Status: **Proposed** (2026-10-20). The P-rows are the architect's recommendations; they become Accepted when the coordinator accepts them and a security reviewer has read this record (plan wave L3-W0 tier: security-reviewed docs). Nothing is built.
Date: 2026-10-20
Type: Decision record (architect rulings, proposed)
Milestone: M8B Lot 3 (staff area), wave L3-W0

**Evidence tier.** Doc-quoted from [`M8B-account-screens-lot3-plan.md`](../milestones/M8B-account-screens-lot3-plan.md)
§5.1, §2.2, §2.3 and §3. The text of each ruling is in that section and is not restated; this record names which
rulings are in force once accepted, and what they do not cover. The provisional number 0173 was checked in this worktree
and in the primary checkout (neither holds a 0173); `origin/main` was not checked by the scribe.

## Decision

Once accepted, the following plan rulings bind the Lot 3 waves:

- **P-L3-2** staff routes and the `proxy.ts` family (`/[locale]/staff/{kitchens,team,presets,audit}`, the kitchen page,
  the token page `/staff/accept`).
- **P-L3-3** the audit rule, fail closed: no `200` with a staff-read kitchen leaves without a committed audit row; every
  staff write commits its audit row in the same transaction; rows hold ids and codes, never an address, phone, kitchen
  name or note text.
- **P-L3-4** which kitchens staff see (client-deleted rows refused everywhere; hidden rows shown with a badge; sent
  kitchens with no account shown). **CG-L3-10:** staff read through a separate read-only store; the client and visitor
  predicates are untouched.
- **P-L3-5** notes (immutable, no edit or delete route). **P-L3-8** request status per design in its own table.
- **P-L3-6, 7, 9, 10, 11, 12, 13** as written in plan §5.1 (3D column, session-expired sheet, shell departures,
  classifier, limiter figures, pagination, search).
- **P-L3-14** the preset authoring gate wired to `preset.create`.

## Accepted residuals, 2026-10-21 (wave L3-S1 security review) [relayed from the reviewer; the scribe ran nothing]

Appended; the status line above is unchanged. These are recorded as **accepted** residuals, not as defects to fix.

- **F1, re-attribution or backdating of the status row.** A holder of the application credential can rewrite the status
  row's `changed_by_account_id` and `changed_at` (the `UPDATE` grant covers both). Accepted; the true time and actor are in
  the audit row, which the credential cannot backdate.
- **F2, the database cannot bind the actor to the session.** Forging an `actor_account_id` needs the leaked credential.
  Accepted under ADR 0019 decision 11 and ADR 0172 D7.
- **F5, no size cap on audit `detail` and no schema stop for personal data.** The domain closes it (the action's allowed
  detail shape); the schema does not.
- **F6, the application role reads note free text in full.** This goes beyond ADR 0153 decision 1 the way ADR 0172 D11 did
  for accounts. There is no erasure path, notes on client-deleted designs are orphaned, and there is no retention rule.
  Accepted for now. **OPEN owner question: retention for audit rows and notes (not answered).** **OPEN question for wave
  L3-S9: do hidden or client-deleted designs' notes go into the client's export? (not answered).**

**Plan-level observation, CLOSED 2026-10-21 by the owner ruling below.** E-L3-1 (the kitchens list) returns client e-mail,
name and phone in bulk and was not itself audited, so the audit trail did not show bulk harvesting of contacts.

## Owner ruling, 2026-10-21: audit each list view, and a hard page limit [relayed by the coordinator as given directly by the owner via AskUserQuestion; the scribe ran nothing]

The owner chose **"Audit each list view + hard page limit"**. This closes the OPEN question above (auditing E-L3-1).

- **Every staff kitchens LIST view writes an audit row.** Action `kitchens-listed`. The detail carries codes and counts
  only: `segment`, `status` (or null), `page`, `rowCount`, `hasSearch`. **Never the search text; no design id.** It fails
  closed like E-L3-2: if the audit row cannot be written, the list is not served.
- **A per-account page limiter for the list fails closed above its ceiling**, so harvesting is capped even if the general
  read limiter is down. About **300 pages per hour is proposed**; the exact figure is decided at wave L3-S6.
- **Build state** [relayed]: the domain commit `d76963d3` is **built**. The audit-store adoption and the L3-S6 route plus
  limiter are **pending**.

### Product decisions taken by the coordinator on reviewers' recommendation (owner-visible, NOT owner-ruled)

- The staff profile block does **not** show the client's postal address; only e-mail, name and phone (shown as
  "neverificat").
- Search is over the **client's** e-mail (normal form) and profile name, with Romanian cedilla/comma-below folding
  (Ş ş Ţ ţ become Ș ș Ț ț, on both sides). The UI label must say "numele clientului".
- The list rows carry a migrated design, for the S2 thumbnail.
- The notes read returns the newest 100 plus a `truncated` flag.

Pointer: the account-to-contact read this list sits beside is recorded in ADR 0172 D11 (dated note 2026-10-21).

## Not covered

- The staff-invitation mechanism (O-L3-4) and the preset visibility and order grant (O-L3-5). Each needs its own record
  and security review; see ADR 0174.
- Migration numbers `0020`-`0024` are provisional (plan §2.3); wave L3-S1 re-lists them.
- Nothing here reverses an accepted record. ADR 0172 D7, D9-D12, ADR 0153 d1 and ADR 0019 d11 stand.
