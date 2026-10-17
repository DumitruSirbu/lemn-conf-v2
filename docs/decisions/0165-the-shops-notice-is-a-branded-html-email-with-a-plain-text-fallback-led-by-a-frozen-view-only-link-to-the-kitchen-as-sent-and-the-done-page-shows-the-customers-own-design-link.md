# ADR 0165 — The shop's notice is a branded HTML e-mail with a plain-text fallback, led by a frozen view-only link to the kitchen as sent, and the done page shows the customer's own design link

Status: **Accepted — 2026-10-17**, at wave 8V's documentation close (drafted 2026-10-16 in the 8V plan, §12). Built and
reviewed on branch `m8-mail-and-empty-space-merge`; **not deployed**, migration `0010` and its grant **not applied on
preview or production**, and **no real notice sent with this template** (owner steps open, below).
Date: 2026-10-17
Type: Decision
Milestone: M8, wave 8V (plan: [`milestones/8V-done-page-link-and-shop-email.md`](../milestones/8V-done-page-link-and-shop-email.md))

**Supersedes:**

- M8 plan **Q5 (a)** for the e-mail: the 3D view no longer waits for the dashboard (owner request, 2026-10-16;
  Q-8V-1 = (a), relayed).
- [ADR 0164](0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md)
  d1's *Not taken: … `html`* and d4's *"Plain text only"* — recorded as that record's **Amendment A**.
- [ADR 0154](0154-mail-leaves-through-one-provider-neutral-port-and-one-resend-adapter-that-sends-once-and-answers-with-one-of-seven-kinds-and-the-shops-notice-is-the-stored-review-printed-never-priced-again.md)
  d2's must-not item `html`.
- [ADR 0160](0160-a-sent-request-is-handed-to-its-done-page-in-memory-by-a-replaced-history-entry-an-answerless-send-is-retried-only-by-the-connection-returning-and-the-failure-screen-is-a-state-of-the-contact-page.md)'s
  and [ADR 0163](0163-the-design-goes-to-the-shops-whatsapp-an-unchanged-kitchen-already-sent-for-shows-its-request-and-a-call-and-the-shops-number-is-one-constant-a-launch-gate-refuses.md)
  d7's drawing of the reference with *Copiază* on 5A and on the already-sent view. **The callback form's sent view keeps
  it** (D2, corrected below).

**Keeps:** ADR 0114 G5 and C1; ADR 0115 d1 and d2; ADR 0153's grants on `contact_submissions`; ADR 0154 d1 (the seven
kinds) and d8; ADR 0163 d3 (WhatsApp) and the refusal of Q5 (c); ADR 0164 d2, d5, d6 and d10.

**Evidence tiers.** *[doc]* quoted from this repository; *[src]* read by the scribe in the working tree on 2026-10-17;
*[commit]* a commit subject on this branch, read from the reflog; *[relayed]* the coordinator's word; *[inf]*
inference, with its falsifier. The scribe ran no command, test or gate.

## Context

The owner sent a contact form and judged two things [relayed, 8V plan §1]: the done page's reference
(*"the reference number is useless"*) and the shop's plain-text e-mail. The owner asked for (a) the customer's own
link on the done page, (b) a view-only 3D link as the e-mail's most important item, (c) an e-mail that looks like the
site, and (d) content focused on the form and the link. The plan's findings F1–F19 hold the code facts: a design edits
only in its own browser (ADR 0115); the contact route never receives the write cookie (F4); a design has one active
share link (F5) and it shows the live design (F6); the application role cannot read the stored snapshot (F8); the
server had no configured public origin (F10).

**Owner answers [relayed, 2026-10-17 dispatch]:** **Q-8V-1 = (a)**, a frozen copy of the kitchen as sent.
**Q-8V-2 = yes**: the done page's link opens for editing only in the same browser until customer accounts (M8B); the
owner plans accounts later, with GDPR.

## Decisions

The labels D1–D10 are the plan's, kept so that code comments citing *"wave 8V Dn"* repoint to the same label here.

### D1. The done page shows the customer's own design address, and says it opens in this browser

The reference card on 5A is replaced by a design-link card (`done/design-link-card.tsx` [src]): the absolute editor
address for this design and locale as text, *Copiază* copying exactly that text, and one sentence that it opens for
editing **in this browser**. *Înapoi la design* and the WhatsApp action stay.
*Refused:* an edit-capability link (ADR 0115 d1–d2; M8B's if wanted); giving the customer the shop's frozen link
(irrevocable from the customer's side); copy that hides the limitation.

### D2. The reference leaves the customer's design screens and stays on the server and in the shop's channels

- **Not rendered on:** 5A and the already-sent view.
- **Kept in:** the e-mail subject, the database, the `200` answer, the in-memory hand-over, the WhatsApp message to
  the shop (ADR 0163 d3), **and the callback form's sent view**.
- `alreadySentAdvice` is re-drafted without *"numărul cererii"* / *"номер заявки"*, as provisional copy.

**Correction, 2026-10-17 (coordinator decision, relayed):** the plan said *"`SentReferenceCard` and its test file are
deleted"* (plan §4 D2 and the S7 row). That was wrong: **a callback request has no design**, so its sent view has no
design link to show, and the reference stays its one handle. `SentReferenceCard` is kept and is rendered by the
callback sent view (`contact/contact-screen.tsx:12`, `:348` [src]). The plan lines are struck in place.
*Refused:* the reference as a small grey line (the owner's complaint); dropping it everywhere (loses the shop's search
key and the idempotency label).

### D3. The shop's link is a frozen view-only copy of the kitchen as sent, served by the existing `/s/{token}` page

- **Migration `0010`** creates `contact_submission_views`: `token_hash` (primary key, SHA-256 shape check),
  `client_request_id` (references `contact_submissions`, on delete cascade), `schema_version`, `design_document`
  (a copy of the non-personal snapshot, checked to be an object), `created_at`, `revoked_at`. Six columns and four
  constraints [doc: the runbook's `0010` checks].
- **Grant:** the application role gets `INSERT, SELECT` on that table and nothing else; the migration carries no grant
  (the `0006` / `0008` precedent). Applied by the owner, preview first, then production.
- **Port:** `SentKitchenViewRepository` with `record` (insert, no-op on a duplicate hash) and `load` (an unrevoked
  row, migrated, or none), plus a fake [commit `9aa11d34`: *"SentKitchenViewRepository (Neon + fake)"*].
- **Page:** `/s/{token}` asks the share-link repository first and, on none, the frozen-view repository; both draw the
  same shared view; every failure is the same not-found; the page reads no cookie (G5); `proxy.ts` is untouched
  [commit `f2b1095f`].
*Refused:* spending the design's share link (Q5 (c); F4–F6); a new `/v/{token}` route family; widening ADR 0153's
grant on `contact_submissions`; a `union all` inside `loadShared`.

### D4. A link is minted at each delivery attempt, and its failure never stops the notice

Before each send the route mints a token, records the row with the snapshot being sent within
`KITCHEN_LINK_DEADLINE_MS = 2000` (`contact/sent-kitchen-link.ts:15` [src]), builds the link under the configured
origin, and sends. **A link is in the notice only if the record answered in time.** Otherwise the notice is sent with
a *link unavailable* line and no button; one log line per process and closed cause, holding no token, hash, id or
value; the 200 / 502 contract and `notified_at` are unchanged. A callback mints nothing [commit `a079a797`].
**Consequence, recorded:** a retried or duplicate notice carries a second, equally valid link; rows are bounded by the
contact limiter.
*Refused:* an HMAC-derived token (couples links to secret rotation); minting inside `record` (F9).

### D5. The e-mail is `multipart/alternative`: plain text kept, plus a branded HTML part — unless the HTML is over budget

- The port gains one optional member, `MailMessage.html`; the predicate accepts it absent or non-empty; the copy takes
  four members; the Gmail adapter adds `html` by name only when present [commit `53f47c88`].
- **HTML safety:** one escape function at every interpolation; closed element builders; an `href` allow-list (the
  kitchen link, `tel:`, `https://wa.me/`, an encoded `mailto:`); no remote or active content; inline styles and table
  layout; explicit light colours; `lang="ro"`; one `h1`; a hidden preheader; no new header.
- **Review fix pass, 2026-10-17 [commit `0d21f388`]:** *"over-budget notices go as text only and the build proof
  checks sendability before storing, link allow-list bound to the configured origin"*. In source: a notice whose HTML
  exceeds `NOTICE_HTML_BUDGET_BYTES = 90_000` UTF-8 bytes is sent as its text part alone
  (`mail/lead-notification.ts:71-73`, `:127-132` [src]). **So "always multipart" is not the rule:** multipart when the
  HTML fits, text only when it does not.
*Refused:* HTML only; a `<style>` block; a logo image (remote or attached); a template library.

### D6. The frozen link: who sees it, revocation, expiry, privacy

The token is random, 12 characters (ADR 0114 C1); the stored value is its SHA-256 hex (`share-token.ts:55` [src]). The
page shows only the kitchen, under the share view's headers. Whoever holds the e-mail holds the link. **Revocation is
the owner's, by hand** (the runbook step for `0010`); deleting a lead cascades to its links. **No expiry**, recorded
under ADR 0118 — *trigger:* M9's retention policy, or the owner asking.

### D7. The origin is one add-only variable, `LEMNARIA_PUBLIC_ORIGIN`, read on the server, never the request's host

Accepted: exactly an origin as the URL standard serialises it, `https:` with a DNS host name, no path, trailing `/`,
userinfo, upper case, default port, port 0, or Unicode host. **A loopback host (`localhost`, `127.0.0.1`, `[::1]`),
over `http:` or `https:`, is accepted only where the e2e fake sender's flag is also set** (`public-origin.ts:30-36`,
`:46-66` [src]; commit `0d21f388`). That is a deviation from the plan's D7, which listed only `http://localhost` and
`http://127.0.0.1` "for e2e" with no flag condition. Unset or unusable, the link is *unavailable*; the log names the
variable, never its value. Not a secret, not a mail variable, set per environment by the owner.
*Refused:* the request's `Host`; a code constant (environments use different databases); platform system variables.

### D8. Content: the link first, then the contact, then a compact summary, then the full list as an appendix

A compact summary from the stored review (room line, one line per group with its body count, the stored figure with
its sentences) and the full itemised list kept as an appendix in muted type — the durable record when the link is
unavailable or revoked. Never re-priced (ADR 0154). The plain-text part has the same order.

### D9. The WhatsApp hand-over is unchanged

It still carries the reference and the customer's own live share link (ADR 0163 d3). The two links are now independent.

### D10. Language and copy

The shop's e-mail stays Romanian; the client's language is shown by its own name (ADR 0107). New and changed leaves are
in *tu* / *ты*, carried in the copy lock as drafted, and **provisional** until the owner approves them.

## Limits recorded (ADR 0118)

- No expiry on a frozen link (*trigger:* M9 retention, or the owner).
- A second link per retried notice (*trigger:* the shop reports confusion).
- No thumbnail (*trigger:* the owner asks after seeing the link).
- Client rendering unproven (*trigger:* the owner's real check: Gmail web, Android, iOS, light and dark).
- The 90 000-byte budget is an inference from Gmail's reported clipping, not vendor-quoted (*trigger:* a clipped
  notice).
- **Missing `0010` reads as "link unavailable"** in the notice and as a 500 on an unknown share token (plan risk 3):
  the order is migration, grant, code (backlog 254).

## Owner steps (none done by an agent; values never printed)

1. Apply `0010` on preview, then production; read the ledger; issue the one `GRANT`; run the privilege test as the
   application role and quote its `reached database … as role …` line
   ([runbook](../runbooks/applying-a-table-migration-and-its-application-role-grant.md)).
2. Add `LEMNARIA_PUBLIC_ORIGIN` per environment, add-only
   ([environments-and-resources.md](../best-practices/environments-and-resources.md)).
3. Look at the preview files (`preview:lead-notice`) and say what to change.
4. After the Preview deploy, one real send, opened in Gmail web, Gmail Android and iOS Mail, light and dark; open the
   button on a phone that never saw the design.
5. Approve or correct the provisional copy (ro and ru).

## Evidence

Built in commits `2b71c19b` (plan), `9aa11d34` (S1), `f2b1095f` (S2), `53f47c88` (S3, S4, S6), `a079a797` (S5),
`7ca2d443` (S7), `c218f4e1` (e2e repoint; its subject quotes *"mobile e2e 114 + 55 passed"*), `0d21f388` (review fix
pass) [commit]. QA and review rounds ran [relayed]; their reports were not read by the scribe. Not run by anyone, per
what was relayed: a real send of this template, a deployment, `0010` on preview or production.
