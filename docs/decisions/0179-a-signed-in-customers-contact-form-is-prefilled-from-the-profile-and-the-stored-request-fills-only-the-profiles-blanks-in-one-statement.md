# ADR 0179 — A signed-in customer's contact form is prefilled from the profile, and the stored request fills only the profile's blanks, in one statement

Status: **Accepted** (2026-11-13), after the owner's rulings of three rounds and the security read; see *Acceptance,
2026-11-13* at the end. Proposed the same day. Nothing is built.
Date: 2026-11-13
Type: Decision record (product rule and data path)
Milestone: M11 — [`M11-owner-feedback-2026-11-07.md`](../milestones/M11-owner-feedback-2026-11-07.md), waves W2a and W2b

**Evidence tiers.** **[owner, relayed]**: an owner selection through AskUserQuestion on 2026-11-13, relayed by the
coordinator and recorded in `docs/OWNER_FEEDBACK.md` (*Owner rulings, 2026-11-13*, *second round*, *third round*); an
option picked, not a verbatim quotation. **[sec, relayed]**: a finding of the 2026-11-13 security read, relayed by the
coordinator; each one used here was re-read in the source by the architect before it was written. **[doc]** and
**[src]**: a repository document or source file with `file:line`, at `607af1db` unless marked `12266a02`. **[inf]**:
the architect's reasoning, with its falsifier.

## Context

Owner feedback item 4 (2026-11-07): a signed-in customer's contact form ("Unde îți trimitem oferta?") should open
prefilled with the profile's name, phone and city, and a submission should save into the profile only the values it
lacks [doc: `docs/OWNER_FEEDBACK.md`, item 4]. The rulings [owner, relayed]:

- **First round:** fill blanks only; prefill name, phone and city; on submit save only the fields the profile lacks,
  never overwrite; the preferred-contact choice is not profile data.
- **Second round:** the form of a signed-in customer says, in one line, that any missing details are saved to their
  profile (Q1); an empty profile field is filled from the request even if the customer emptied it on purpose, with no
  "removed" mark and no migration (Q2); M11's new Romanian and Russian copy is pre-approved as drafted (Q3).
- **Third round:** prefill and fill are for **confirmed customer accounts only, gated on `design.edit.own`**; staff and
  unconfirmed customers see the empty form, as a visitor does, and nothing is written to their profiles. Copying a
  request's name, phone and locality into the customer's profile is a **dated, owner-ruled change to ADR 0153 d1 for
  signed-in submitters**, and the privacy notice says that a profile can be filled from a request.

What exists:

- The profile holds three optional values: `name`, `address` (shown as "Adresă / localitate") and the phone pair
  `phone` + `phone_normal_form`, written together or not at all [src: `packages/configurator-domain/src/account/profile-fields.ts:29`,
  `:40-46`; doc: `packages/persistence/src/migrations/0017_add_account_profile_columns.sql:1-2`;
  `0012_create_accounts.sql:43-44`, `:100`].
- The contact form's `name` is required (≤ 100), `phone` required and normalised by `normalisePhoneNumber`, `locality`
  optional (≤ 100) [src: `contact/contact-fields.ts:16-17`, `:137-150`, `:185-194`]. The profile bounds are those same
  constants, and its phone uses the same normaliser [src: `profile-fields.ts:20-22`; `account-fields.ts:16`].
- `updateProfile` overwrites every column it is given [src: `neon-account-store.ts:141-163`].
- **`account.manage.own` is held by every role**, staff and administrator included [src:
  `packages/configurator-domain/src/account/capabilities.ts:33-38`, `:45-52`, `:54-57`], **and by an account whose
  address is not confirmed** [src: `apps/web/src/lib/server/account/require-capability.ts:11-18`]. `design.edit.own` is
  the client's own-design capability [src: `capabilities.ts:28-31`], withheld from staff, the administrator and every
  unconfirmed account [src: `require-capability.ts:11-18`, `:44-52`].
- `GET /api/account/session` answers the session's held capabilities, already filtered by the address's confirmation
  [src: `app/api/account/session/route.ts:28-37`; `current-session.ts:94`; `require-capability.ts:44-52`].
- `GET /api/account/profile` exists and was kept by O20 [doc: ADR 0172 Amendment H item 6]; it is cross-site guarded,
  counts the reads limiter (fail open), then requires `account.manage.own` [src: `app/api/account/profile/route.ts:23-41`];
  its answers carry `Cache-Control: private, no-store` [src: `lib/server/account/account-responses.ts:26`].
- The contact pages are not in the proxy's no-store families; only share, account and staff paths get them [src:
  `proxy.ts:147-150`].
- The contact route reads no session [src: `app/api/contact-submissions/route.ts:41-55`].
- Staff read a client's `accounts.name` and `accounts.phone` on the kitchens list and the kitchen page [src:
  `packages/persistence/src/staff-kitchen-statements.ts:89`, `:194`].
- The privacy notice is an unpublished working draft (`docs/legal/privacy-notice-draft.md`) [doc: ADR 0172, *Remaining*
  item 6]; the page is a stub until the launch gate [src: `account/privacy-notice-stub.tsx:5-8`]. Migration `0017`'s
  header says "The privacy notice must list name and address among what an account keeps" [doc: `0017:18-19`].

## Decision

### d1. Prefill is a client read, made only for a session that holds `design.edit.own`

The contact screen (both `/{locale}/configurator/contact` and `/{locale}/d/{id}/contact`) first reads `GET
/api/account/session`. **Only when its `capabilities` include `design.edit.own`** does it read `GET
/api/account/profile`, once per mount. A `200` fills Nume from `name`, Telefon from `phone` (as entered) and Oraș sau
localitate from `address`, each **only if the field is still empty and the customer has not typed in or left it**.
Every other case (anonymous, a staff or administrator session, an unconfirmed account, a `503` or a network failure on
either read) changes nothing and shows nothing: the form is the visitor's. The channel choice and the e-mail field are
never prefilled. Values live only in the form's memory (ADR 0159). A page restored from the back-forward cache re-reads
or clears, so a signed-out tab does not keep showing the profile.

*Why client-side:* a server-rendered prefill would put a name and a phone into a page response the proxy does not mark
`private, no-store` [inf from `proxy.ts:147-150`; falsified if the contact pages are shown to carry `private, no-store`
from another layer]. The profile route already answers privately and does not count the profile-save bucket.

*Why the session read first [sec, relayed; F1, F5]:* the profile route's own gate is `account.manage.own`, which a
staff account and an unconfirmed account hold, so it would prefill them, against the third-round ruling. The session
check also means a visitor's contact view makes no profile request at all: it spends no reads-bucket hit on the profile
route and logs no `401` "refused" account event per view [src: the route logs through `sessionThatMayManageOwnAccount`'s
`event: "profile"`, `profile/route.ts:35-38`]. The check is advisory, a convenience of the page; the server-side fill
(d2) applies its own gate and never relies on it.

### d2. The write-back happens on the server, when the request is stored, in one statement that fills only nulls

The fill runs at **exactly the two places the submission marks a design sent**, and nowhere else [src:
`lib/server/contact/submit-contact.ts:224-228`, `:287-289`]:

1. a new request, right after `store.record` answered stored (not `conflict`);
2. a retry whose lookup answered *stored, not notified*, after its design was read again and **not** refused.

So: a `CONTACT_REQUEST_CONFLICT` never fills (`:190`, `:223`); a retry whose design is now refused does not fill
(`:284-286`), because its first try already filled when the record was stored; a retry of a request already notified is
answered without a fill, for the same reason (`:191`). [inf for the two retry cases: the first try is the one that
filled; falsified if a first try's fill can be lost in a way the retry would repair, which the deadline below makes
possible and which is accepted as best-effort.]

At either place the submission reads the session with the reader that treats a failure as anonymous [src:
`current-session.ts:32-38`]. **Only a live session holding `design.edit.own`** (confirmed client; never staff, the
administrator, or an unconfirmed account) gets a fill. The new store method `fillProfileBlanks({ accountId:
session.accountId, fill })` runs one `update accounts … where id = $accountId`, `fill` being derived by a pure domain
function from the **judged** request: `name`; `address` from `locality` only when it is non-empty; the phone pair from
the judged phone. Each column is set with `case when <column> is null then <value> else <column> end` (the phone pair
under one condition on `phone`), and `updated_at` only when something changed.

**Best-effort, bounded, closed-list logged.** The fill waits at most a named deadline, as the sent mark does
(`SENT_MARK_DEADLINE_MS = 1000` and `beforeDeadline`, `:239`, `:247-260`). A throw or a timeout is caught, and the catch
writes one contact-log line naming the request's reference and a cause from a closed list (for example `timeout`,
`store-failed`), **never the thrown value** (the shape of `reportContactSentMarkFailed`, `contact-log.ts:160-165`). The
request's answer is the one it would have been without the step.

Consequences of d2, each a criterion in the plan (W2a):

- never overwrites a non-null column, never clears one, never writes an empty string;
- writes only the session's own account, never the design's owner when they differ;
- runs on no refusal and on no conflict, and changes no status, body or header;
- is idempotent, so a retry with the same body (ADR 0159 d3) may run it again harmlessly;
- reads nothing from `contact_submissions`;
- sets, clears and refreshes no cookie (the route's rule, `route.ts:38-39`) and does not touch the session.

### d3. No migration, no grant

The columns and their `UPDATE` grants are already declared: `GRANT UPDATE (name, address)` [doc: `0017:27`] and the
`UPDATE` list that includes `updated_at`, `phone` and `phone_normal_form` [doc: `0012:62-63`]. Whether those grants are
applied on preview and production is **not known** to this record; the milestone's close-out asks the owner to confirm
it (plan R3).

### d4. Limits

No new bucket. The write rides on a request the contact route has already admitted and counted (ADR 0157 d1), it
writes at most three columns of the caller's own row, and the contact buckets bound its rate [inf; the security read
found no path that runs the fill without a stored request].

### d5. What the customer is told

- **On the form** (second round, Q1; [sec, relayed] F3): a confirmed client with at least one blank the request would
  fill sees one line saying the missing details are saved to their profile, **naming the account by its e-mail**
  (for example *"Completăm datele care lipsesc în profilul contului ana@mail.md."*; final wording pre-approved as
  drafted, Q3). The e-mail comes from the session read d1 already makes. No line for a visitor, staff, an unconfirmed
  account, or a profile with no blank.
- **In the privacy notice** (third round): the working draft `docs/legal/privacy-notice-draft.md` states that a
  signed-in customer's empty profile fields (name, phone, locality) can be filled from a contact request they send.
  The published notice inherits it at the launch gate.

## ADR 0153 d1 and ADR 0172 D11 — what changes (rewritten 2026-11-13 after the security read)

The Proposed text said d2 fell under ADR 0172 D11's renewed acceptance. **That was wrong** [sec, relayed; F2]: D11
accepted that a lead can be joined to the account owning its design "with no personal column read" [doc: ADR 0172
`:382-386`]. d2 does more: it **copies** a request's personal values (name, phone, locality) into `accounts`, whose
`name` and `phone` staff then read beside the kitchen [src: `staff-kitchen-statements.ts:89`, `:194`]. ADR 0153 d1's
intent, that the application learns nothing about who a lead is from the request, no longer holds for a signed-in
submitter's own blanks.

This is recorded as an **owner-ruled change to ADR 0153 d1, dated 2026-11-13, for signed-in submitters only** (third
round [owner, relayed]). Bounds of the change: only the submitter's own account; only blanks; only the three values;
only a confirmed client (`design.edit.own`); the values are taken from the body being judged, so no statement reads
a personal column of `contact_submissions` and the grant ADR 0153 d1 decided is unchanged. A visitor's request and a
staff member's request are exactly as before. ADR 0153 carries a dated amendment pointing here.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **The client calls a separate fill endpoint after a successful submit** | The write is lost when the tab closes between the two requests; it adds an endpoint a client can call with no submission, i.e. a second profile-write path outside the profile screen's rules; and the client would choose what is blank from a read taken at page load. |
| **The client calls `PATCH /api/account/profile` with the fields it saw empty** | Same loss as above, and `updateProfile` overwrites unconditionally, so a profile saved in another tab between page load and submit is overwritten: the opposite of the ruling. |
| **Read the profile, then write the blanks, in two statements on the server** | A profile save committed between the read and the write is overwritten. One statement is the only shape that holds "never overwrite" under concurrency. |
| **Fill on success only (stored row and accepted notice)** | A request whose notice failed is still the customer's submission; tying the fill to the notice adds a case without protecting anything. |
| **Gate on `account.manage.own`** (the Proposed text) | Every role and every unconfirmed account holds it [src above]; it would prefill and fill staff and unconfirmed profiles, against the third-round ruling. |
| **Prefill without the session read, relying on the profile route's `401`/`403`** | Same gate problem, and a visitor's view would spend a reads-bucket hit and log a refused account event each time. |
| **Prefill on the server, in the page render** | Personal data in a page response that is not `private, no-store`; would need a proxy change for two page families to protect one feature. |
| **Overwrite with the latest submitted values** | Contradicts the ruling [owner, relayed]. |
| **Keep a "removed" mark so a deliberately emptied phone is not refilled** | Ruled out, second round Q2 [owner, relayed]. |

## Sweep (dates)

- **ADR 0153 (2026-10-09) d1** — **changed, owner-ruled 2026-11-13**, for signed-in submitters only (section above);
  amendment recorded on ADR 0153.
- **ADR 0172 (2026-10-17, accepted 2026-10-18) D11, dated note 2026-10-21** — the join without a personal column read.
  **Not** the warrant for d2 (corrected above); unchanged itself.
- **ADR 0172 D7** — capabilities; the gate is `design.edit.own`, a confirmed client's.
- **ADR 0157 (2026-10-12) d1, d4, d5** — the order, the refusals, success. One bounded best-effort step is added where
  the sent mark is; no bucket, refusal or answer changes.
- **ADR 0159 (2026-10-12) d3 and title** — a retry has the same id and body; the form holds no typed value outside
  memory. d1 keeps prefilled values in memory only; d2 is idempotent.
- **ADR 0172 Amendment H (2026-10-20) item 6** — `GET /api/account/profile` is kept. d1 is its reader.

## What is still inference, and what would falsify it

- "City" is the profile's `address` field. Falsified if the owner meant a separate city field (none exists).
- The phone as entered is what the profile shows; the normal form is the stored pair's second half. Falsified if the
  profile screen stores a different entered form for the same number.
- The two retry cases in d2 (see there).

## Consequences

- One new domain function, one new store method on the account store and its fake, one new bounded step in the
  submission, one new hook and model event in the contact screen, one line of copy, one paragraph in the notice draft.
- The contact route becomes a reader of the session cookie. It still sets none.
- A visitor's, a staff member's and an unconfirmed account's contact flow is unchanged.

## Acceptance, 2026-11-13

Accepted by the coordinator on 2026-11-13, once the changes the security read required were in this text [relayed]:
F1 (gate on `design.edit.own`, client check from `/api/account/session`; d1, d2), F2 (the ADR 0153 d1 change replaces the
D11 paragraph; the notice statement; d5), F3 (the notice line names the account's e-mail; d5), F4 (the deadline, no
fill on conflict, the retry cases, the closed-list log; d2), F5 (no profile read or refused event for visitors; d1).
The owner rulings of all three rounds are folded in. The security read found no exploitable design flaw [sec, relayed].
