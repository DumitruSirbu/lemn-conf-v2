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

## Residuals and rulings of the L3-S6 review, 2026-10-21 [relayed from the reviewers and the coordinator; the scribe ran nothing]

- **The search text travels in the URL.** The list is `GET /api/staff/kitchens?q=...`, so a search reaches the platform's
  request logs and any proxy log between the browser and the server, though never the audit log, the application log or a
  response. **Accepted** as a residual of a GET list. Obligations on the screen that calls it (wave L3-U2): keep `q` out of
  the page's own URL and history, wait at least 500 ms after the last keystroke before asking, and never retry a `429` or
  `503` by itself.
- **Opening a kitchen is capped per account, and fails closed**, like the list: `staff-kitchen-open-by-account`, 600 an
  hour, counted after the id's shape and before the reader, so a malformed id costs nothing. Both figures are provisional
  and the owner's to retune. The 600 equals the network read bucket's figure and window, so behind one network block that
  bucket can refuse first; it fails open only when it cannot be judged.
- **`HEAD` on a staff read is refused with `405` and does nothing**: the framework would otherwise run `GET` for it, with
  its audit row and its bucket.
- **Every admitted staff request, read or write, marks the session seen** (best-effort, never changes the answer), so the
  12-hour idle lifetime measures inactivity and not the absence of writes.
- **Legacy ids.** The list serves a kitchen whatever the length of its id (1 to 64), but opening one answers the one `404`,
  because the audit row's id has the 21-character shape. Count the rows first with the owner's read-only
  `select count(*) from designs where length(id) <> 21`.

## Residuals of the L3-S7 review, 2026-10-21 [relayed from the L3-S7 security review; the scribe ran nothing]

- **Unhide takes no body and no content type**, so only the cross-site check and `SameSite=Lax` protect it. This is the
  same residual as the client's hide route. The only path is a legacy browser that sends neither `Sec-Fetch-Site` nor
  `Origin`, together with a takeover of a same-site sibling. Hardening: require a JSON content type on **both** routes.
  **Accepted.**
- **Note spam.** One staff session can post 120 notes an hour to one kitchen, pushing real notes out of the newest-100
  view; there is no delete path. Every note is attributable by its audit row. **Accepted**, next to F6. Wave L3-U3 must
  provide a "load older" path so that the truncation cannot hide notes.
- **The 8 KiB body cap** rejects roughly 910 or more decomposed Hangul syllables (each is three code points). Wave L3-U4
  must normalise a note to NFC before sending it.

## Residuals of the L3-S8 audit page, 2026-10-21 [relayed by the coordinator; the scribe ran nothing]

- **The audit page's bucket is PROVISIONAL.** P-L3-11 names no figure for it; `staff-audit-page-by-account` borrows the
  list's 300 an hour per account and, like the list, fails closed. The owner's to retune; it is a constant.
- **The date filter's bounds are ours.** A day filter accepts the years 2000 to 9998: below 2000 is before the product, and
  `Date.UTC` reads a year under 100 as 19xx; above 9998 the day after is past the last instant the table reads back.
- **The page returns staff and client e-mails in bulk and is not itself audited**, per P-L3-3 ("The list (E-L3-1) and the
  audit page (E-L3-6) are not logged"; the 2026-10-21 owner ruling above changed only the kitchens list). It is bounded by
  `audit.read` (administrator with a confirmed address), the fail-closed bucket and the network read limit. **The owner may
  revisit**, as the same bulk-harvest reasoning that got the list audited applies.
- **The actor's account id is on the wire.** The coordinator ruled that each row's `actor.id` is sent, so the "Persoana"
  filter can offer actors from the rows already shown and send `actor=<id>`. No other account id is (the subject, the
  kitchen's owner and the client are named by address alone). The answer is administrator-only and fail-closed, and ids
  are unguessable.
- **Unrecognised actions appear only on unfiltered pages.** The action filter accepts the five closed codes only, while
  the store would accept any table-shaped code; a row the build does not know is therefore found by paging, not by filter.

## Not covered

- The staff-invitation mechanism (O-L3-4) and the preset visibility and order grant (O-L3-5). Each needs its own record
  and security review; see ADR 0174.
- Migration numbers `0020`-`0024` are provisional (plan §2.3); wave L3-S1 re-lists them.
- Nothing here reverses an accepted record. ADR 0172 D7, D9-D12, ADR 0153 d1 and ADR 0019 d11 stand.
