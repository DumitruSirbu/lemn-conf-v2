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
  L3-S9: do hidden or client-deleted designs' notes go into the client's export? (not answered; the coordinator's default
  is built and recorded in the L3-S9 note below).**

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
  **Accepted.** **Closed 2026-10-22 (L3-U4 review pass, security I1):** both routes (`POST /api/staff/kitchens/{id}/unhide`
  and `POST /api/account/kitchens/{id}/hide`) now read their request through `readGuardedBody`: the cross-site check first,
  then a `415` for any media type that is not JSON, then a bounded body that is read and not looked at. An empty body is
  fine while the media type is JSON, and the browser sends `{}`. [relayed; the implementer ran the route tests]
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
- **Owner ruling, 2026-10-21 (direct): reading the audit page is itself audited. This replaces the earlier residual that
  it was not** (P-L3-3: "The list (E-L3-1) and the audit page (E-L3-6) are not logged"). As built, the page is read from the
  store and its body shaped, then an `audit-viewed` row is committed and awaited, and only then is the body returned. It
  fails closed: a row that cannot be committed is a `503` with no page, and a request that is refused or fails before the
  page is read writes none. The row names the actor (taken from the session), no kitchen and no client, and its detail is
  exactly `{page, rowCount, hasActorFilter, hasActionFilter, hasDateFilter}`: the page number, the rows returned (0 to 25)
  and which filters the query carried (a date filter is `from` or `to`), never the actor id, the action or the dates.
  **Consequence:** an administrator reading the log adds rows to it, at most as many as the provisional 300 an hour per
  account bucket serves, and the action filter can leave them out (`?action=...` with any other code). The page still
  returns staff and client e-mails in bulk, bounded by `audit.read` (administrator with a confirmed address), the
  fail-closed bucket and the network read limit.
- **One client address per row; the actor's id and address only (security review, Low, fixed).** The answer's `actor` is
  `{id, email}` (the S8B frame draws the address only, so the name is not sent) and a row's client is named once, by
  `subject.email`; the kitchen is `{id, name}` and its owner is not named. The subject is the row's own
  `subject_account_id`, so it still resolves after the client deletes the kitchen, whereas the port reads a kitchen's owner
  through the kitchen and answers `null` for a deleted one.
- **The actor's account id is on the wire.** The coordinator ruled that each row's `actor.id` is sent, so the "Persoana"
  filter can offer actors from the rows already shown and send `actor=<id>`. No other account id is. The answer is
  administrator-only and fail-closed, and ids are unguessable.
- **Unrecognised actions appear only on unfiltered pages.** The action filter accepts the five closed codes only, while
  the store would accept any table-shaped code; a row the build does not know is therefore found by paging, not by filter.

## L3-S9: the notes in the client's own export, 2026-10-21 [written by the wave's implementer from the dispatch and the code; no owner ruling, no review yet]

**Evidence tier.** Source-verified in this worktree (the files named below, read and run); the owner's O-L3-6 is
doc-quoted from [ADR 0174](0174-the-owner-rulings-o-l3-1-to-o-l3-7-defer-the-price-and-translation-screens-and-fix-the-staff-request-line-the-notes-export-and-the-lot-3-copy.md)
decision 4.

**Built.** `POST /api/account/export` now carries, on each exported kitchen, `notes: [{ text, createdAt }]` (newest
first) and `notesTruncated`; `formatVersion` is 2. The read is `AccountKitchenStore.exportNotes(accountId, designIds)`:
one statement (`packages/persistence/src/account-kitchen-notes-statement.ts`) that joins `designs` for ownership alone
(`account_id = $1 and deleted_by_client_at is null`), selects the design id, the text and the instant, and joins neither
`accounts` nor reads `author_account_id`. A notes read that fails is a `503` with no file, never a download without them.

**Still OPEN for the owner, with the coordinator's default built.** _Do the notes of kitchens the client hid, or deleted,
go into the export?_ The default (owner-visible, **not owner-ruled**): the notes of a kitchen that still exists for the
client are included, **hidden ones too**, because hidden means "not listed" and the shop still holds the data; the notes
of a kitchen the client **deleted** are excluded, consistent with the deleted kitchen not being exported. The cost of the
second half is the one F6 already names: those notes stay held and are in no download, with no retention rule. The
default is two predicates (`deleted_by_client_at is null`; no `hidden_by_client_at`) pinned by the statement test.

**Residuals recorded with it.**

- **The bounds are provisional, and now include bytes (security review of L3-S9, Medium, fixed).** Per kitchen
  `MAX_EXPORTED_NOTES_PER_KITCHEN` = 100 (the staff view's own 100); over the whole export `MAX_EXPORTED_NOTES_IN_TOTAL` =
  2000 notes and `MAX_EXPORTED_NOTE_BYTES` = 1 MiB (1,048,576) of note text, taken newest first by a running
  `octet_length` sum, so the first note past the budget and every older one are withheld (a small old note never slips
  past a large newer one that was withheld). Counts alone had left the worst case near 16 MB (2000 notes x 2000 code
  points x 4 bytes); the byte budget makes notes unable to make the export unservable on their own, and is why the
  pre-bucket guard still counts kitchens only. A kitchen from which any note was left out, by the per-kitchen cap, the
  total or the bytes, is `notesTruncated`. **Every figure stays PROVISIONAL**: the Neon HTTP reply limit and the host's
  response limit have not been measured, and the file also holds up to 200 design documents. They are the engineer's
  figures, to be set against a measurement. JSON writes a line break in two bytes, so the file's notes can weigh up to
  twice the budget plus about 64 bytes of keys and date per note; a test states that bound.
- **Statement shape (security review, Low, fixed).** A lateral subselect per kitchen reads at most 101 of its newest notes
  through `design_notes_by_design_newest_idx`, so a kitchen's history is never scanned past that window; the 101st row
  only sets the kitchen's `has_more` and takes no global rank, so the full 2000 real notes ship when the kitchens hold
  more than their window.
- **Two reads, not one snapshot (Info).** `exportAll` and `exportNotes` are separate statements: a kitchen the client
  deletes between them is exported with no notes. Accepted.
- **The export screen's lead sentence overclaims slightly, for the owner's wording.** It reads "…toate bucătăriile
  (inclusiv cele trimise și cele ascunse) și notele personalului despre ele." but notes past the caps, and the notes of a
  kitchen the client deleted (which is not in the file either), are not included. The file itself carries
  `notesTruncated` per kitchen; the sentence does not. Not changed here.
- **The export can drop real notes, not only the staff view.** The L3-S7 residual (120 notes an hour per staff session,
  no delete path) pushes real notes out of the newest 100 of a kitchen in the client's own file too. The marker says the
  kitchen was cut; no path in the export returns the older notes.
- **A failed notes read spends the day's bucket,** like a failed kitchen read (O26's residual): the bucket is counted
  before the reads.
- **The `design_notes` `SELECT` grant** is in the runbook's `0021` list and the privilege test now plans the export's
  statement as the application role; that test needs `DATABASE_URL` as the application role and was not run by the
  implementer.
- **Free text goes to the client.** A note is staff free text about a person; the ruling is that the person receives it
  with no author. Nothing screens a note for what a staff member chose to write.

## Not covered

- The staff-invitation mechanism (O-L3-4) and the preset visibility and order grant (O-L3-5). Each needs its own record
  and security review; see ADR 0174.
- Migration numbers `0020`-`0024` are provisional (plan §2.3); wave L3-S1 re-lists them.
- Nothing here reverses an accepted record. ADR 0172 D7, D9-D12, ADR 0153 d1 and ADR 0019 d11 stand.
