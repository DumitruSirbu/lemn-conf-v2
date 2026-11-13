# ADR 0179 — A signed-in customer's contact form is prefilled from the profile, and the stored request fills only the profile's blanks, in one statement

Status: **Proposed** (2026-11-13). A security read is owed before wave W2a is dispatched (personal data, a new write
from a public endpoint into `accounts`). Nothing is built.
Date: 2026-11-13
Type: Decision record (product rule and data path)
Milestone: M11 — [`M11-owner-feedback-2026-11-07.md`](../milestones/M11-owner-feedback-2026-11-07.md), waves W2a and W2b

**Evidence tiers.** **[owner, relayed]**: the owner's 2026-11-13 selection through AskUserQuestion, relayed by the
coordinator and recorded in `docs/OWNER_FEEDBACK.md` (*Owner rulings, 2026-11-13*); an option picked, not a verbatim
quotation. **[doc]** and **[src]**: a repository document or source file at `12266a02`, with `file:line`. **[inf]**: the
architect's reasoning, with its falsifier.

## Context

Owner feedback item 4 (2026-11-07): a signed-in customer's contact form ("Unde îți trimitem oferta?") should open
prefilled with the profile's name, phone and city, and a submission should save into the profile only the values it
lacks [doc: `docs/OWNER_FEEDBACK.md`, item 4]. The ruling of 2026-11-13 [owner, relayed]: **fill blanks only; prefill
name, phone and city; on submit save only the fields the profile lacks, never overwrite; the preferred-contact choice is
not profile data.**

What exists:

- The profile holds three optional values: `name`, `address` (shown as "Adresă / localitate") and the phone pair
  `phone` + `phone_normal_form`, written together or not at all [src: `packages/configurator-domain/src/account/profile-fields.ts:29`,
  `:40-46`; doc: `packages/persistence/src/migrations/0017_add_account_profile_columns.sql:1-2`;
  `0012_create_accounts.sql:43-44`, `:100`].
- The contact form's `name` is required (≤ 100), `phone` required and normalised by `normalisePhoneNumber`, `locality`
  optional (≤ 100) [src: `contact/contact-fields.ts:16-17`, `:137-150`, `:185-194`]. The profile bounds are those same
  constants, and its phone uses the same normaliser [src: `profile-fields.ts:20-22`; `account-fields.ts:16`]. The
  comment at `profile-fields.ts:20` already says the profile's name and address are the fields "which these prefill".
- `updateProfile` overwrites every column it is given [src: `neon-account-store.ts:141-163`].
- `GET /api/account/profile` exists and was kept by O20 [doc: ADR 0172 Amendment H item 6]; its answers carry
  `Cache-Control: private, no-store` [src: `lib/server/account/account-responses.ts:26`].
- The contact pages are not in the proxy's no-store families; only share, account and staff paths get them [src:
  `proxy.ts:147-150`].
- The contact route reads no session [src: `app/api/contact-submissions/route.ts:41-55`].

## Decision

### d1. Prefill is a client read of the kept profile route, applied only to untouched empty fields

The contact screen (both `/{locale}/configurator/contact` and `/{locale}/d/{id}/contact`) reads `GET
/api/account/profile` once per mount. A `200` fills Nume from `name`, Telefon from `phone` (as entered) and Oraș sau
localitate from `address`, each **only if the field is still empty and the customer has not typed in or left it**. Any
other answer (`401` signed out, `403` a role without `account.manage.own`, `503`, a network failure) changes nothing
and shows nothing. The channel choice and the e-mail field are never prefilled. Values live only in the form's memory
(ADR 0159). A page restored from the back-forward cache re-reads or clears, so a signed-out tab does not keep showing
the profile.

*Why client-side:* a server-rendered prefill would put a name and a phone into a page response the proxy does not mark
`private, no-store` [inf from `proxy.ts:147-150`; falsified if the contact pages are shown to carry `private, no-store`
from another layer]. The kept route already answers privately, and gives O20's route its first page reader. Its `GET`
is cross-site guarded, counts only the reads limiter (which fails open), then requires `account.manage.own`; it does
not count the profile-save bucket [src: `app/api/account/profile/route.ts:23-41`], so a contact page view spends none
of the client's save quota.

### d2. The write-back happens on the server, after the request is stored, in one statement that fills only nulls

Inside the contact submission, **after the record is stored** (or a retry's lookup has answered *stored*), the
submission reads the session with the reader that treats a failure as anonymous [src:
`lib/server/account/current-session.ts:32-38`]. For a live session whose capabilities include `account.manage.own`, it
calls a new store method, `fillProfileBlanks({ accountId: session.accountId, fill })`, where `fill` is derived by a pure
domain function from the **judged** request: `name`, `address` from `locality` only when it is non-empty, and the phone
pair from the judged phone. The store runs one `update accounts … where id = $accountId` that sets each column with
`case when <column> is null then <value> else <column> end` (the phone pair under one condition on `phone`), and
`updated_at` only when something changed. The step is best-effort: a throw is one log line in the contact log's
closed list, and the request's answer is the one it would have been without the step.

It stands where the submission already marks a design sent once the request is stored [src:
`lib/server/contact/submit-contact.ts:242-247`], and for the same reason: the customer has submitted, whatever the
shop's notice then does.

Consequences of d2, each a criterion in the plan (W2a-1 to W2a-10):

- never overwrites a non-null column, never clears one, never writes an empty string;
- writes only the session's own account, never the design's owner when they differ;
- runs on no refusal, and its answer changes no status, body or header;
- is idempotent, so a retry with the same body (ADR 0159 d3) may run it again harmlessly;
- reads nothing from `contact_submissions` (ADR 0153 d1 holds);
- sets, clears and refreshes no cookie (the route's rule, `route.ts:38-39`) and does not touch the session.

### d3. No migration, no grant

The columns and their `UPDATE` grants are already declared: `GRANT UPDATE (name, address)` [doc: `0017:27`] and the
`UPDATE` list that includes `updated_at`, `phone` and `phone_normal_form` [doc: `0012:62-63`]. Whether those grants are
applied on preview and production is **not known** to this record; the milestone's close-out asks the owner to confirm
it (plan R3).

### d4. Limits

No new bucket. The write rides on a request the contact route has already admitted and counted (ADR 0157 d1), it
writes at most three columns of the caller's own row, and the contact buckets bound its rate [inf; falsified if the
security read finds a path that runs the fill without a stored request].

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **The client calls a separate fill endpoint after a successful submit** | The write is lost when the tab closes between the two requests; it adds an endpoint a client can call with no submission, i.e. a second profile-write path outside the profile screen's rules; and the client would choose what is blank from a read taken at page load. |
| **The client calls `PATCH /api/account/profile` with the fields it saw empty** | Same loss as above, and `updateProfile` overwrites unconditionally, so a profile saved in another tab between page load and submit is overwritten: the opposite of the ruling. |
| **Read the profile, then write the blanks, in two statements on the server** | A profile save committed between the read and the write is overwritten. One statement is the only shape that holds "never overwrite" under concurrency. |
| **Fill on success only (stored row and accepted notice)** | A request whose notice failed is still the customer's submission and is retried with the same body; tying the fill to the notice adds a case without protecting anything. Recorded as the fallback if the security read prefers it. |
| **Prefill on the server, in the page render** | Personal data in a page response that is not `private, no-store`; would need a proxy change for two page families to protect one feature. |
| **Overwrite with the latest submitted values** | Contradicts the ruling [owner, relayed]. |

## Sweep (dates)

- **ADR 0153 (2026-10-09) d1** — the application reads no personal column of a contact request. Unchanged: d2 takes
  values from the body being judged.
- **ADR 0172 (2026-10-18) D11, dated note 2026-10-21** — the lead-to-account join was accepted and, when its trigger
  fired, renewed. d2 is a **new path from a lead into an account** (a request's values reach the account's columns).
  It is recorded here as falling under that renewed acceptance, because the account written is the submitter's own and
  the values are the submitter's own input; this is an inference the security read must confirm or reject.
- **ADR 0157 (2026-10-12) d1, d4, d5** — the order, the refusals, success. One step is added after the record; no
  bucket, refusal or answer changes.
- **ADR 0159 (2026-10-12) d3 and title** — a retry has the same id and body; the form holds no typed value outside
  memory. d1 keeps prefilled values in memory only; d2 is idempotent.
- **ADR 0172 Amendment H (2026-10-20) item 6** — `GET /api/account/profile` is kept. d1 is its reader.

No record says the opposite of the 2026-11-13 ruling.

## What is still inference, and what would falsify it

- "City" is the profile's `address` field. Falsified if the owner meant a separate city field (none exists).
- The phone as entered is what the profile shows; the normal form is the stored pair's second half. Falsified if the
  profile screen stores a different entered form for the same number.
- A profile phone the customer deliberately emptied will be refilled by the next request (frame A10A treats an empty
  phone as a withdrawal, `Lemnaria Cont Lot 2.dc.html:194`). **Owner question Q2 in the plan.**
- The consent shown on the form (*"Sunt de acord cu prelucrarea datelor pentru a primi oferta."*,
  `apps/web/src/messages/ro.json:404`) covers the offer, not the profile. **Owner question Q1 in the plan.**

## Consequences

- One new domain function, one new store method on the account store and its fake, one new step in the submission,
  one new hook and model event in the contact screen.
- The contact route becomes a reader of the session cookie. It still sets none.
- A signed-out visitor's contact flow is unchanged.
