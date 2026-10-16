# M8 wave 8V: the done page links to the customer's design, and the shop's e-mail is a branded notice built around a view-only link

> **STATUS: PLANNED by the architect on 2026-10-16. Not dispatched, and no code exists for this wave.**
>
> The two decision records are **drafts inside this file** (*ADR drafts* below), not files in `docs/decisions/`:
>
> - ADR 0165's content depends on the owner's answer to Q-8V-1. The coordinator, or the scribe, creates the file
>   once that answer exists.
> - ADR 0164's amendment is a dated note written at the close.
>
> **Ordering.** Wave 8U is in flight in the same tree. At the time of writing, 18 files are modified (domain and adapter
> code, their tests, one agent card) and 2 are new, none of them this wave's [ran: `rtk proxy git status --short`]. No 8V slice is
> dispatched into this tree until 8U's writer says *nothing in flight* (WORKFLOW R1, R2). The alternative is a
> separate worktree based on 8U's closing commit.
>
> The architect touched only this file. It did not touch `STATUS.md`, the 8U plan, any ADR, code or test.

Evidence tiers. Every load-bearing claim carries one.

- **[doc]** quoted from a record in this repository, with `file:line` where it matters.
- **[src]** read in the working tree at `HEAD` `9c69f1c0`.
- **[src-installed]** read in the installed `node_modules/.pnpm/nodemailer@10.1.1/.../dist/cjs`.
- **[owner]** the owner's words or intent, as the coordinator relayed them on 2026-10-16.
- **[inf]** the architect's inference, with what would falsify it.

Mapped to the brief's three tiers: [doc] is *doc-quoted*; [src] and [src-installed] are *source-verified*; [inf] is
*inference*. **Nothing was run except reads and greps.** No test, gate, server, database or mail send was run.

## 1. The request, and how it is classified

The owner sent a contact form and then looked at two things [owner]:

1. **The done page.** It showed *NUMĂR CERERE LM-2N1B5479* with a *Copiază* button. The owner's verdict: *"the
   reference number is useless."*
2. **The shop's e-mail.** It was plain text, with these lines in order: reference, language, name, phone, city,
   preferred channel, the room line, and then a long list of lines such as *Perete A · bază / Dulap bază de colț 900:
   4 000 / 900 mm …*.

The owner wants:

- **(a)** on the done page, in place of the reference, the customer's own editable link back to their design;
- **(b)** in the e-mail, a view-only 3D link to the kitchen, as its most important item;
- **(c)** an e-mail that looks like the website, not plain text;
- **(d)** content focused on the form values and the link. The owner is *"not sure about the details"* of the cabinet
  list. The owner also asked for informative improvements.

**Classification: a contract gap, not an implementation defect.** The code does what its records decided:

- The done page shows the reference with *Copiază* because ADR 0160 and frame 5A say so, and ADR 0163 d7 does the same
  for the already-sent view [doc].
- The e-mail is plain text because ADR 0164 d1 and d4 refused `html` (`0164:66-67`, `:105-106`) [doc].
- The e-mail has no link because the owner answered **Q5 (a)** on 2026-10-07: *"the text summary in the e-mail and
  the stored snapshot; the 3D view waits for the dashboard"* (`M8-review-contact-success.md:356-366`) [doc].

The request **changes recorded decisions**. Under WORKFLOW's *Sweep the decision records*, those decisions are
amended explicitly (§3), never silently.

## 2. Findings

| # | Finding | Tier |
| --- | --- | --- |
| F1 | **A design opens for editing only in the browser that made it.** `/d/{id}` reads and edits only with the owning visitor cookie, and anyone else gets the *"not available in this browser"* page. Editing across devices is a customer profile, which is M8B wave 8P6 and is planned, not built. ADR 0115 d1 and d2 decide this, and say *"short link only to share"*: the 12-character token is for sharing alone. **No edit-capability link exists, and ADR 0115 rules one out.** | [doc] `0115:46-63`; `M8B-customer-profiles.md` wave table |
| F2 | The done page already links to the editor. `BackToDesignLink` renders *Înapoi la design* to `editorHref(designId)`. `savedSentence` already says *"îl poți redeschide oricând din acest browser"*. | [src] `done/back-to-design-link.tsx:13-29`; `messages/ro.json` `submissionResult.savedSentence` |
| F3 | A share link is issued by `POST /api/designs/{id}/share`. It needs the design's write-token cookie **and** the visitor cookie, checked inside SQL, then the share-write limiter. It answers `{ path: "/s/{token}" }` once and stores only the hash. | [src] `app/api/designs/[id]/share/route.ts:50-81`; `share-link-repository.ts:102-158` |
| F4 | **The write-token cookie is scoped to `Path=/api/designs/{id}`**, so `POST /api/contact-submissions` never receives it. The contact route therefore **cannot** issue the customer's share link without a new rule for who may authorise one. | [src] `lib/server/write-token.ts:49`, `:57` |
| F5 | **A design has one active link.** The partial unique index `design_share_links_one_active_per_design` enforces it, and `issue` revokes the active link before it inserts. If the e-mail spent the design's link, the customer's next *Trimite design-ul pe WhatsApp* would revoke the link already in the shop's inbox, and the reverse. | [src] `migrations/0006_create_design_share_links.sql:65-66`; `share-link-repository.ts:121-134`; `done/send-on-whatsapp.tsx:103-129` |
| F6 | **A share link shows the live design.** `loadShared` joins `designs`, so the holder sees every later edit. The kitchen as sent is the snapshot in `contact_submissions.design_document`. | [src] `share-link-repository.ts:223-239`; ADR 0163 d3 [doc] |
| F7 | **Share links never expire.** They end only by revocation (`revoked_at`) or by the design's deletion (cascade). | [src] `0006:58-64` |
| F8 | **The application role cannot read `design_document`.** It may `SELECT` only seven columns of `contact_submissions`, and the snapshot is not among them. Per the migration header, the snapshot is **not personal**. | [src] `migrations/0008_create_contact_submissions.sql:2-11`, `:36-41` |
| F9 | **The retry path cannot recover a minted token.** A stored, un-notified request re-enters `passOn` with `stored === undefined` and prepares the design again. `proveTheNoticeIsBuildable` builds a notice with a placeholder reference before the row exists. A token stored only as a hash cannot be reproduced on a later attempt. | [src] `submit-contact.ts:234-261`; `deliver-notice.ts:48-69` |
| F10 | **The server has no configured public origin.** `absoluteShareAddress` uses `location.origin`, which exists only in the browser. No site-URL or `metadataBase` variable exists [src: grep for `SITE_URL`, `metadataBase`, `VERCEL_URL`, `PUBLIC_ORIGIN` and `APP_ORIGIN` found nothing]. A link built from the request's `Host` is attacker-influenced: a forged host would put a working token under a foreign domain into the shop's inbox [inf; falsified only by a platform guarantee on `Host`, which this plan does not rely on]. | [src] `share/absolute-share-address.ts:5-7` |
| F11 | **The port carries plain text only.** `MailMessage` has `key`, `subject` and `text`. `sendableCopyOf` copies those three. `buildGmailMessage` builds `from`, `to`, `subject`, `text` and `messageId` from named members. | [src] `mail/mail-sender.ts:9-13`, `:83-95`; `gmail-mail-sender.ts:51-57`, `:111-125` |
| F12 | **nodemailer 10.1.1 makes `multipart/alternative`** when it is given both `text` and `html`. It collects the alternatives text first, then html, and uses an alternative node when there is more than one. | [src-installed] `mail-composer/index.js:70`, `:84`, `:281-330`, `:436-446` |
| F13 | **The notice is the stored review, printed.** It has customer lines, then a room line, then every group heading with each row and its facts, the whole-kitchen rows, the figure, and the two disclaimers. The price is the stored `priced` snapshot, never re-priced (ADR 0154's title). The subject is `Cerere din configurator {reference}`, with nothing the customer wrote. | [src] `mail/lead-notification.ts:85-104`, `:215-271`; `ro.json` `leadNotice` |
| F14 | **The e2e fake records only inside the server's process.** No endpoint or file exposes what it recorded, so an e2e test cannot read the e-mail. The HTML is asserted at unit level, and MIME through nodemailer's `streamTransport`, which is already the pattern. | [src] `mail/fake-mail-sender.ts:22-35`; `tests/lib/server/mail/qa-8n-compose-support.ts:37` |
| F15 | **`server-only` throws outside the RSC condition.** Vitest aliases it to a stub. A separate Vitest config already runs a non-default suite (`gate:launch-placeholders`). | [src] `apps/web/vitest.config.ts:35-41`; `apps/web/package.json` scripts; `vitest.launch.config.ts` |
| F16 | **The reference is used in five places.** (1) The done page card, `SentReferenceCard`. (2) The already-sent view, which shows the card and the advice *"spune-ne numărul cererii"*, in Russian *"назови номер заявки"*. (3) The WhatsApp message to the shop. (4) The e-mail subject. (5) The `200` answer and the in-memory hand-over. | [src] `done/done-screen.tsx:218-226`; `contact/already-sent-view.tsx:8`, `:32`; `ro.json` / `ru.json` `alreadySentAdvice`, `whatsappMessageToShop`; `contact-responses.ts:152-157` |
| F17 | **The copy lock is a deep-equality corpus.** *"Carrying a leaf is not approval."* Golden hashes cover the rendered output, and a register test holds *tu* / *ты*. | [src] `tests/support/approved-romanian-messages.ts:1-5`; `tests/i18n/golden-output-hashes.ts`; ADR 0163 d10 [doc] |
| F18 | **The brand tokens.** Colours: paper `#faf8f4`, surface `#f5f3f0`, line `#dcd8ce`, ink `#1c1814`, muted ink `#6b5e52`, accent `#7c5c3d`, strong accent `#5a3e25`. Font: `Helvetica, Arial, sans-serif`. The mobile mockup uses the same set, with one `font-family` of Helvetica, Helvetica Neue and Arial. | [src] `app/globals.css:2-24`, `:54`; [src] `docs/design/mockups/Lemnaria Configurator Mobil.dc.html` (colour counts by grep) |
| F19 | **ADR 0164's header still reads *Proposed*, and `decisions/README.md` has no row for it**, although 8N S1 to S3 and the review fix-up landed (`b51899a6`, `fb15fa08`, `0da63d6a`, `58ab3695`). The 8N close-out is owed. The amendment below is therefore drafted against a record that is not yet accepted, and the scribe orders the two. | [src] ADR 0164 lines 3-4; `rtk proxy grep 0164 docs/decisions/README.md` returned nothing; `git log` |

## 3. Decision-record sweep

| Record (date) | What it says | How it is settled here |
| --- | --- | --- |
| M8 **Q5 (a)** (answered 2026-10-07) | The shop sees a text summary and the stored snapshot. The 3D view waits for the dashboard. (b), a read-only link to the snapshot, was costed as *"one more Full-tier wave with a security reviewer"* | **Superseded for the e-mail by the owner's request of 2026-10-16**, subject to Q-8V-1. Recommended: **(b)** |
| M8 **Q5 (c)**; ADR 0163 sweep row and d3 *Not taken* (2026-10-13) | Spending the design's one share link on the shop is not revived | **Kept refused.** F4 and F5 make it unbuildable without a new authorisation rule, and self-defeating with the WhatsApp action |
| ADR 0163 d3 (2026-10-13) | *"Not taken: a frozen link for the shop. That is Q5 (b): a new token, table and route, as its own Full wave."* | **This wave is that Full wave**, except that the route is not new (D3) |
| ADR 0154 d1 / d2 must-not list; ADR 0164 d1 and d4 (2026-10-16) | No `html` on the port or the wire. *"Plain text only."* | **Amended** (ADR 0165 D5, and the drafted note on 0164). The rest of the must-not list stands: no `replyTo`, `cc`, `bcc`, `headers`, `attachments`, display name, or customer value in a header |
| ADR 0154 title and d8 | The notice is the stored review printed, never priced again | **Kept.** The compact summary and the appendix read the stored `priced` snapshot |
| ADR 0114 decision 5; ADR 0115 d1 and d2 (2026-09-11) | A design link opens only in its own browser. No PIN, and no edit-capability URL. Editing across devices is a profile | **Kept.** The done page's link is `/d/{id}`, worded honestly. Q-8V-2 confirms the owner accepts that until M8B |
| ADR 0114 Amendment G5 | The share view reads no cookie and imports nothing that could authorise a write | **Kept.** The `/s/{token}` page gains a second read-only lookup and still reads no cookie |
| ADR 0153 (grants; personal columns) | The application role reads seven columns of `contact_submissions` and no personal one | **Kept unchanged.** The new table carries its own copy of the non-personal snapshot, so no grant on `contact_submissions` widens |
| ADR 0160; frame 5A; ADR 0163 d7 | 5A and the already-sent view draw the reference with *Copiază* | **Amended.** Neither screen renders the reference. It stays in the subject, the database, the `200` answer, the hand-over and the WhatsApp message |
| ADR 0163 d3 (WhatsApp) | The message carries the reference and the customer's own live link | **Kept unchanged** (D9) |
| ADR 0164 d6 (a duplicate is accepted) | The stored mark is the only guard | **Kept.** A duplicate notice carries a different, equally valid link (D4) |
| ADR 0118 | A problem that has not occurred is recorded with its trigger | Applied to expiry, thumbnails and the summary's size (§9) |

## 4. Decisions

Each decision states what was chosen and the alternatives refused, with the reason.

### D1. The done page shows the customer's own design address, `/d/{id}`, and says it opens in this browser

The reference card is replaced by a **design-link card**. It holds:

- the absolute address of this design's editor in the current locale, as text;
- *Copiază*, which copies exactly that text;
- one honest sentence that the link opens the design for editing **in this browser**.

The foot keeps *Înapoi la design* and the WhatsApp action. Nothing on the card is a secret: the design id is already
in the page's own address [src: `app/[locale]/d/[id]/done/page.tsx`].

*Refused:*

- **An edit-capability link** (a secret token that grants writing on any device). ADR 0115 d1 and d2 forbid it, and
  the owner superseded the PIN with profiles. It would be a second credential beside the cookie pair, which needs its
  own Full wave and a security reading. If the owner wants it, it is M8B's.
- **Giving the customer the shop's frozen link.** That link is irrevocable from the customer's side (D6), so handing
  it out spreads a link nobody can withdraw.
- **Hiding the limitation.** The screenshot the owner saw is exactly what another browser shows. Copy that implied
  otherwise would be a wrong answer, not an interim.

### D2. The reference stays on the server and in the shop's channels, and leaves the customer's screens

- **Not rendered on:** 5A, the already-sent view.
- **Kept in:** the e-mail subject, the database, the `200` answer, the hand-over memory and the WhatsApp message to the
  shop (ADR 0163 d3).
- **Why it is kept at all:** it is the idempotency label (`reference` is unique), the shop's search key in its inbox,
  and the WhatsApp message's tie to the e-mail.
- `alreadySentAdvice` is re-drafted without *"numărul cererii"* / *"номер заявки"*, as **provisional** copy.
- `SentReferenceCard` and its test file are deleted, with the reason *"subject deleted"* (ADR 0152).

*Refused:*

- **Keeping it as a small grey line.** The owner called it useless, and a second identifier beside the design link
  is the confusion the owner reported.
- **Dropping it everywhere.** That would cost the shop's search key and the idempotency label.

### D3. The shop's link is a frozen, view-only link to the kitchen as sent, served by the existing `/s/{token}` page (recommended answer to Q-8V-1)

**A new table** `contact_submission_views`, added as migration `0010`, has one row per minted link:

- `token_hash`: the primary key, with `0006`'s SHA-256 shape check;
- `client_request_id`: `not null references contact_submissions (client_request_id) on delete cascade`, so retention
  follows the lead;
- `schema_version`: `integer not null`, the design schema the copy was written in, so `migrateDesign` can read it
  later;
- `design_document`: `jsonb not null`, checked to be an object. It is **a copy** of the non-personal snapshot;
- `created_at`;
- `revoked_at`: nullable.

The application role needs `INSERT` and `SELECT` on this table and nothing else. It is a grant step the owner runs,
and the migration file carries none (the `0006` and `0008` precedent).

**A new narrow persistence port**, `SentKitchenViewRepository`, has two methods:

- `record({ tokenHash, clientRequestId, schemaVersion, document })`, an `insert … on conflict (token_hash) do
  nothing` under the existing transient-failure retry (ADR 0145);
- `load(tokenHash)`, which answers the migrated `Design` or `none`, for an unrevoked row only.

The port follows `ShareLinkRepository`'s pattern, with a fake for unit tests.

**The `/s/{token}` page** asks `ShareLinkRepository.loadShared` first. On `none` it asks
`SentKitchenViewRepository.load`. Both draw the same `SharedDesignView`.

- Every failure (malformed, unknown, revoked in either table) is still the one byte-identical `DesignLoadError`.
- The page still reads no cookie (G5).
- `proxy.ts` is untouched, so the headers, the page counting and the locale redirect are what `/s/` already has.

*Refused:*

- **Spending the design's share link (Q5 (c)).** F4: the contact route lacks the write cookie, so this needs a new
  authorisation rule. F5: the next WhatsApp press revokes the e-mailed link, and the reverse. F6: the shop would see
  later edits.
- **A new route family (`/v/{token}`).** It needs a matcher entry, an allow-list arm, a header rule and a count rule
  in `proxy.ts`, which is a second copy of G5's invariants, for no difference the shop can see.
- **A join to `contact_submissions.design_document` with a widened grant.** It widens ADR 0153's seven-column grant
  on the leads table, and the copy is non-personal and bounded by the contact limiter.
- **One `union all` statement inside `loadShared`.** It folds a second table into a port whose contract is the design
  share link (`share-link-repository.ts:38-52`). Two explicit lookups are clearer, and the timing difference reveals
  nothing a rendered page does not [inf].

### D4. A link is minted at each delivery attempt, and its failure never stops the notice

In `deliverNotice`, before the send:

1. mint a token with `createShareToken()`;
2. `record` the row with the snapshot being sent, raced against `KITCHEN_LINK_DEADLINE_MS`. The proposed value is
   2 000 ms [inf], a named constant with its reason in the plan, not in a comment;
3. build the notice with the link `${origin}/ro/s/${token}`;
4. send.

**The link is in the notice only if the record answered in time.** On any failure:

- the cause is one of a closed list: `origin-unset`, `record-failed`, `deadline`, `unexpected`;
- the notice is still built and sent with a *link unavailable* line and no button;
- one log line is written per process and cause (ADR 0156 d4's rule, ADR 0146 B2): no token, hash, id or value;
- the route's answers, the 200 / 502 contract and `notified_at` are **unchanged**.

`proveTheNoticeIsBuildable` proves both forms, with a link and with *unavailable*, using placeholder values that are
never sent.

**A callback request (`target.kind === "intent"`) mints nothing.**

*Refused:*

- **A token derived by HMAC from the digester under a new purpose**, so that every retry carries the same link. It
  couples a link's validity to the secret's rotation and adds a purpose to a closed set (`keyed-digest.ts:7-11`), and
  all it buys is one link across a duplicate notice, which nobody needs.
- **Minting inside `record`.** The raw token is gone on a retry (F9).

**The consequence, recorded.** A retried or duplicate notice carries a second link, and both work. Each attempt adds
at most one row, bounded by the contact limiter: 3 an hour and 10 a day per network, 2 an hour per browser
(`limit-policy.ts:110-113` via ADR 0163 d8) [doc]. A minted row whose send then failed is held by nobody.

### D5. The e-mail is `multipart/alternative`: the existing plain text as the fallback, and a branded HTML part

The port widens by one optional member: `MailMessage.html?: string`.

- `isSendableMailMessage` adds: `html` is absent, or is a non-empty string.
- `sendableCopyOf` copies four members.
- The fake records `html`.
- `buildGmailMessage` adds `html` **by name, only when it is present**.
- Nothing else changes: the seven kinds, the retry table, one recipient, the subject rule, `disableFileAccess` and
  `disableUrlAccess`.

**HTML safety. Every one of these is a criterion (§8).**

- **One escape function** for text and attribute values (`& < > " '`), applied where each value is interpolated. The
  template is made of a closed set of element builders. No value is concatenated into markup outside them.
- **An `href` allow-list of four shapes:**
  - the kitchen link;
  - `tel:` plus the E.164 normal form;
  - `https://wa.me/` plus its digits;
  - `mailto:` plus the address, `encodeURIComponent`-encoded, so that `?`, `&` and `#`, which a dot-atom local part
    may hold [src: `plain-mailbox.ts:6-7`], cannot add a header.
- **No remote or active content:**
  - none of `<img`, `<script`, `<link`, `<iframe`, `<form`, `<style`, or `src=`;
  - none of `url(`, `@import` or `background=`;
  - **inline `style` attributes only**, and table layout.
- **Dark mode.** `<meta name="color-scheme" content="light">` and `supported-color-schemes`, explicit background and
  text colours on every cell, and no text drawn over an image. Clients may still invert: Gmail on Android does
  [inf; falsified or confirmed by the owner's real check, owner step 4].
- **Accessibility:**
  - `lang="ro"`;
  - layout tables with `role="presentation"`;
  - one `h1` and the section headings as real headings;
  - link text that names its action;
  - a contrast of at least 4.5:1 for every text and background pair, computed by QA from the tokens and not assumed.
- **A hidden preheader**, the first text node: *Vezi bucătăria · {name} · {locality}*, escaped.
- **No new header.** The subject is unchanged: the constant plus the reference.

*Refused:*

- **HTML only.** It drops the fallback, and some clients and filters prefer the text part.
- **A `<style>` block with media queries.** Gmail support varies, and a block is one more surface that a constant must
  not leak into [inf].
- **A logo image**, remote or attached. A remote image is a fetch and a tracker class. An attachment is on d4's
  must-not list.
- **A template library such as MJML or react-email.** It adds a dependency, and the escaping guarantee becomes theirs.

### D6. The frozen link: who sees it, revocation, expiry, privacy

- **What it holds.** The link carries a random 12-character token, about 71 bits (ADR 0114 C1). It carries no
  personal data, no design id and no reference.
- **What the page shows.** Only the kitchen, through the share view's headers: `noindex`, `no-referrer`,
  `private, no-store` [src: `s/[token]/page.tsx:14-17`; `proxy.ts:156-158`].
- **Who sees it.** Whoever holds the e-mail: the shop's inbox, the sending account's *Sent* folder (ADR 0164 d10
  [inf]), and anyone the e-mail is forwarded to. Google already processes the full kitchen list for these notices, so
  no new category of data reaches a third party.
- **Revocation.** The customer never holds this link, so the customer has nothing to revoke. The owner revokes a row
  by hand (`revoked_at = now()`), a step the plan adds to the runbook. Deleting a lead deletes its links (cascade).
- **Expiry.** None, recorded under ADR 0118. *Trigger:* M9's retention policy, or the owner asking for one.
- **Privacy text.** M9's privacy copy (Q7) names the kitchen being sent to the shop, which is already true of the
  itemised list.

### D7. The origin is one add-only variable, `LEMNARIA_PUBLIC_ORIGIN`, read on the server, never the request's host

- **What it accepts:** exactly `https://host[:port]`, with no path, query, fragment or userinfo. It also accepts
  `http://localhost[:port]` and `http://127.0.0.1[:port]`, for e2e only.
- **When it is unset or unusable,** the link is *unavailable* (D4). The log line names the variable, never its value.
- **Who sets it:** the owner, per environment (owner step 2). The e2e harness sets it to its own server's origin.
- **It is not a mail variable.** It is not on the fake's refusal list, and its absence never makes the contact route
  unavailable.

*Refused:*

- **The request's `Host` or `nextUrl.origin`** (F10).
- **A code constant.** Preview and production use different databases, so a constant would mail tokens that resolve
  on another environment's database [inf from `STATUS.md`'s preview branch].
- **Vercel's system variables.** They couple the code to the platform, and a preview deployment URL may sit behind
  deployment protection [inf].

### D8. What the e-mail carries: the link first, then the contact, then a compact summary, then the full list as an appendix

The owner was *"not sure about the details"*. The architect decides as follows, and the owner judges it at the
preview:

- **A compact summary**, computed from the stored review:
  - the room line;
  - one line per group, the group heading and its body count (*Perete A · bază — 6 corpuri*);
  - the review's figure with its rounding sentence and disclaimer.
- **The full itemised list stays, as an appendix** at the end, in small muted type, headed *Lista corpurilor (pentru
  verificare)*. Why keep it:
  - it is the durable, unrevocable record of what was sent, while the link can be unavailable (D4) or revoked (D6);
  - the shop has no dashboard until M9.

*Refused:*

- **Dropping the list.** A notice whose link is unavailable would then hold no kitchen at all.
- **Keeping the list in its current place.** That is what the owner reported as noise.
- **A re-priced figure** (ADR 0154).

### D9. The WhatsApp hand-over is unchanged

The message still carries the reference and the customer's own live share link (ADR 0163 d3). It is the customer's
channel and the customer's link, so it stays revocable by the customer. Since D3 no longer spends the share slot, the
two links are now **independent**: issuing or revoking the customer's link never touches the shop's, and the reverse.

### D10. Language and copy

- **The shop's e-mail stays Romanian** (`NOTICE_LOCALE = "ro"`, `contact-production-ports.ts:47-55`) [src].
- **The client's language is shown as its own name,** *Română* or *Русский*, not as `ro` or `ru` (ADR 0107: a
  language is named in its own language).
- **New leaves:**
  - the e-mail's headings, button labels, the *unavailable* line, the preheader and the appendix heading;
  - the done page's card label, its note, and *Copiază*, which reuses `submissionResult.copy`.
- **Every new or changed leaf is drafted in *tu* / *ты*** (ADR 0163 d10), carried in the copy lock as drafted, and
  marked **provisional**. **Copy approval is the owner's** and is not a gate of this wave.
- The register test's allow-list keeps *the shop's notice* (customer voice).

## 5. The e-mail, section by section

The HTML part has a 600 px single-column table, set on `#f5f3f0`, with the card on `#faf8f4`, ink `#1c1814` and
accent `#7c5c3d`. The sections run in this order:

```
[hidden preheader]  Vezi bucătăria · Ion Popescu · Chișinău

┌──────────────────────────────────────────────────────────┐
│ LEMNARIA                         configurator bucătărie  │  header: wordmark as text, accent rule under it
├──────────────────────────────────────────────────────────┤
│ Cerere nouă din configurator                     (h1)    │
│ Bucătărie în L · 3 400 × 2 800 mm                        │  the room line, from the stored review
│                                                          │
│   ┌────────────────────────────────────────────────┐     │
│   │        Vezi bucătăria în 3D   →                │     │  THE primary button: solid #7c5c3d, white text,
│   └────────────────────────────────────────────────┘     │  44 px tall, href = origin/ro/s/{token}
│   Link de vizualizare: se deschide fără cont.             │  muted note under it
│   ── or, when the link is unavailable: ──                 │
│   Linkul 3D nu a putut fi creat. Lista completă e mai jos.│  (no button)
├──────────────────────────────────────────────────────────┤
│ Client                                            (h2)   │
│ Ion Popescu                                              │  name, large
│ +373 69 123 456                                          │  the phone's display form
│ [ Sună ]  [ WhatsApp ]  [ E-mail ]                       │  tel: always; wa.me when the channel is WhatsApp;
│                                                          │  mailto: only when the channel is e-mail
│ Canal preferat   WhatsApp                                │
│ Localitate       Chișinău          (or —)                │
│ E-mail           ion@example.md    (only with that channel)
│ Limba clientului Русский                                 │
├──────────────────────────────────────────────────────────┤
│ Pe scurt                                          (h2)   │  compact summary (D8)
│ Perete A · bază — 6 corpuri                              │
│ Perete A · suspendate — 4 corpuri                        │
│ Perete B · bază — 3 corpuri                              │
│ Preț estimativ  ≈ 48 000 lei                             │  the stored figure
│ rounding sentence · disclaimer sentence (small, muted)   │
├──────────────────────────────────────────────────────────┤
│ Lista corpurilor (pentru verificare)              (h3)   │  appendix (D8): the existing groups, rows and facts,
│ Perete A · bază                                          │  small muted type
│   Dulap bază de colț 900 ……… 4 000                       │
│     900 mm · …                                           │
├──────────────────────────────────────────────────────────┤
│ Cerere LM-2N1B5479 · revizia 7                           │  footer: reference (support), design revision,
│ Trimis din configuratorul Lemnaria. Nu răspunde la acest │  "do not reply" (no Reply-To, ADR 0164 Q61)
│ e-mail — contactează clientul direct.                    │
└──────────────────────────────────────────────────────────┘
```

The figures and names above are illustrative only: they are not data, not copy, and not measured.

**The plain-text part** keeps today's single-line rules (`assertEachLineIsOneLine`). It has the same order:

1. the link line, or the *unavailable* line;
2. a blank line;
3. the customer lines (reference, locale name, name, phone, locality, channel, e-mail);
4. a blank line;
5. the compact summary;
6. a blank line;
7. the appendix.

**A callback request** has no button, no summary and no appendix. Its single callback line takes their place, as
today.

## 6. The three screens

1. **5A, the done page.**
   - `SentReferenceCard` is replaced by `DesignLinkCard`: the label, the absolute editor address, *Copiază* with the
     same clipboard and select fallback the reference card had, and the note *"Linkul deschide designul pentru
     editare doar în acest browser."* (provisional).
   - The heading, the channel line, `savedSentence`, the next steps, the picture, the WhatsApp action and *Înapoi la
     design* are unchanged.
   - `resultToShow` still carries the reference, because the WhatsApp message needs it.
2. **The already-sent view.**
   - The reference card is removed.
   - `alreadySentAdvice` is re-drafted (provisional), for example *"Ai greșit ceva în cerere? Sună-ne la {phone} —
     găsim cererea după numărul tău de telefon."* [inf: that the shop searches its inbox by phone].
   - The call link, the changed-kitchen sentence and *Înapoi la design* are unchanged. No form, no send path
     (ADR 0163 A5, kept).
3. **The e-mail:** §5.

## 7. Improvements, ranked

The effort column is the architect's estimate [inf].

| Rank | Idea | Effort | In 8V? |
| --- | --- | --- | --- |
| 1 | A frozen *view the kitchen* button as the first item | M (table, port, page lookup) | **Yes** (D3, D4) |
| 2 | Tap-to-call, WhatsApp to the customer, and mailto, from validated normal forms | S | **Yes** |
| 3 | `multipart/alternative` with the plain-text fallback kept | S | **Yes** (D5) |
| 4 | A compact summary (room, counts per group, the stored figure), and the full list as an appendix | S | **Yes** (D8) |
| 5 | A preheader | XS | **Yes** |
| 6 | The client's language as a word; the design revision and the reference in the footer | XS | **Yes** |
| 7 | An owner preview of the template, rendered to a local HTML file | S | **Yes** (S6) |
| 8 | A send time in the footer, in Moldovan time | S: a clock port into the pure builder | No. The `Date` header carries it. Later, if the shop asks |
| 9 | Global finish, material and handle brand in the summary | S, if the review model exposes them | No. The review model was not read for it. Later wave |
| 10 | A *Lemnaria Configurator* display name on `From` | XS, but a must-not item (ADR 0164 d4) | No. Its own amendment |
| 11 | A *frozen* banner on the shop's view (*Bucătăria așa cum a fost trimisă*) | S, plus copy | No. Follow-up, once the owner has seen the view |
| 12 | A thumbnail or screenshot of the kitchen | **L.** No WebGL on the server. A headless render, or a client-captured upload, is a new upload surface, and an image means an attachment or a remote image, both refused (D5) | No. Recorded with its trigger (ADR 0118): the owner asks after seeing the link |
| 13 | A copy of the e-mail to the customer | M, and a second recipient class | No. *"Exactly one address, never a customer's"* (ADR 0164 context) |

## 8. Acceptance criteria

Criteria are written as properties where a range applies. "Property" means a `fast-check` property with at least
the runs the project's convention names. Each line says what must **not** happen as well.

**The port and the wire**

1. For every message, `isSendableMailMessage(m)` holds iff the 8N rule holds **and** `html` is absent or a non-empty
   string. The fake and the adapter agree on a property over generated messages. `sendableCopyOf` returns a frozen
   copy of exactly four members, and a getter on `html` is read once.
2. `buildGmailMessage`'s key set is exactly `{from, to, subject, text, messageId}` plus `html` iff the copy has
   `html`. The property holds over generated copies. There is never a `replyTo`, `cc`, `bcc`, `headers`,
   `attachments` or display name.
3. **MIME,** parsed from `streamTransport` output:
   - one `multipart/alternative` with exactly two parts, `text/plain` then `text/html`, both UTF-8;
   - no attachment, and one `To`;
   - no `Reply-To`, `Cc` or `Bcc`;
   - a subject identical to the 8N subject for the same reference.

**HTML safety**

4. **Escaping, as a property.** For arbitrary full-Unicode strings in name, locality and e-mail, including `<`,
   `&`, `"`, `'`, `</td>`, `<script>`, `javascript:` and `{{`, either:
   - the builder throws `NoticeLineError` (control and line-break characters, the rule unchanged); or
   - the parsed HTML's element-tag sequence equals the benign baseline's, and the text of the field's own slot
     equals the input.
5. **`href` allow-list, as a property.** Every `href` in the output matches exactly one of the four shapes in D5.
   - The kitchen link equals `${origin}/ro/s/${token}`, with `token` matching `^[0-9A-Za-z]{12}$`.
   - `sha256(token)` is the `tokenHash` the repository fake recorded, for the request's `clientRequestId`.
   - A `mailto:` appears iff the channel is e-mail. After `mailto:`, no unencoded `?`, `&`, `#` or `%0A` appears for
     any generated address.
6. **No remote or active content.** For every generated input, the HTML contains none of the strings listed in D5.
   **Sabotage (R6):** inserting `<img src=x>` into the template turns the criterion red.
7. **Size.** The HTML of the largest fixture kitchen the suite generates (a U, at maxima) is at most 90 000 bytes.
   QA records the measured number. The bound is set from Gmail's reported clipping at about 102 KB [inf; not
   vendor-quoted].
8. **Contrast.** Every text and background pair in the template is at least 4.5:1, computed by a test from the hex
   values used.

**The link**

9. **Frozen**, live persistence, e2e or the repository's live suite:
   - after a request is notified, the customer edits and saves (the revision moves on): `load(hash)` still answers a
     design whose canonical serialisation equals the submission's snapshot;
   - issuing and revoking the customer's share link changes nothing in `contact_submission_views`, and recording a
     view row changes nothing in `design_share_links` (`status` unchanged).
10. **Failure never blocks the notice.** For each of origin unset, origin invalid, `record` throws, and `record` past
    the deadline (fake timers):
    - exactly one `send`, whose HTML holds the *unavailable* sentence and no kitchen `href`, and whose text part says
      the same;
    - the route answers 200 with the reference, and `markNotified` is called;
    - exactly one log line from the closed causes, containing no token, hash, id or variable value.

    **No notice ever carries a link whose `record` did not answer `recorded` in time.**
11. **A callback request** calls `record` zero times and carries no kitchen `href`.
12. **The page.** Unknown, revoked-share and revoked-frozen tokens render one byte-identical not-found, and all three
    take two awaited lookups. A malformed token keeps today's accepted difference: it issues no query and skips the
    `await`, which changes the RSC chunk numbering (`s/[token]/page.tsx:26-28`) [src]. The token's shape is public.
    - A frozen token renders `SharedDesignView`.
    - The page's import closure still holds none of `visitor.ts`, `write-token.ts` or
      `fetch-configuration-repository.ts` (G5).
    - The response headers equal `/s/`'s today. `proxy.ts` has no diff.
13. **The table** (live, under the application role):
    - insert and select work;
    - a non-SHA-256 hash is refused by the check;
    - a duplicate `token_hash` is a no-op;
    - deleting the lead cascades;
    - the role still cannot read any personal column of `contact_submissions`:
      `packages/persistence/tests/application-role-privileges.test.ts` [src: the file exists], extended for the new
      table and re-run, is green;
    - a `migration-0010-text.test.ts` pins the header and the statement, as `migration-0008-text.test.ts` does
      [src: that file exists].
14. **The origin reader, as a property over arbitrary strings.** It answers `configured` only for the shapes in D7,
    and otherwise `unavailable`, never throwing and never echoing the value.

**The summary**

15. **Never re-priced.** Swapping the shipped price book between record and send leaves the HTML and the text
    byte-identical.
16a. **The text part's order.** For every design request, the first line of the text part is the link line or the
    *unavailable* line, then a blank line, then the customer lines in §5's order. Every line passes the 8N single-line
    rule. For a callback, no link line and no *unavailable* line appear.
16. **The counts are true.** The compact summary's counts per group equal the stored review's `rows.length` per
    group. **Sabotage:** an off-by-one in the count turns the criterion red.

**The screens**

17. **5A.**
    - No element shows the reference or `referenceLabel` (`done-reference*` absent).
    - The card's *Copiază* writes exactly the absolute editor address for this design and locale.
    - The text shown equals the text copied after hydration, with no hydration warning.
    - Without a clipboard, the address is selected instead.
    - The WhatsApp message still contains the reference.
18. **The already-sent view** renders no reference, and its advice leaf, in Romanian and Russian, no longer asks for
    the request number.
19. **Copy.**
    - New and changed leaves are carried in `approved-romanian-messages.ts` and marked as drafted.
    - The golden hashes are rebaselined with the list of changed keys in the hand-back.
    - The register test is green.

**No real mail, and the preview**

20. **Nothing sends real mail.**
    - The mail network guard is green.
    - `rtk proxy git grep -n "smtp.gmail.com" apps/web/tests` names only the options test.
    - The preview command imports the builder, never a sender or `nodemailer`. A dependency check proves it.
21. **The preview.** `LEAD_NOTICE_PREVIEW_DIR=<dir> pnpm --filter @lemnaria/web preview:lead-notice` exits 0 and writes
    the HTML and text files into `<dir>`. The directory travels by variable, not by a positional argument, because
    Vitest reads a positional argument as a test-file filter. The spec refuses to run, and fails, when the variable is
    unset or names a path inside the repository.
    - The files are built by the same exported builder function the route uses, for four fixtures: design with
      link, design with link unavailable, e-mail channel, callback.
    - The fixtures' names and numbers are fictitious, and the placeholder origin is `https://example.invalid`.
    - It writes nothing inside the repository, and its config is outside the default `test`, `check` and `ci:local`
      runs.

## 9. Slices

**Every dispatch carries these instructions:**

- the discarding-git ban, by name (`git stash`, `git checkout -- .`, `git reset --hard`, `git clean`);
- *no test, script or agent sends real mail or opens an SMTP connection*;
- *no database row is deleted outside the harness's own teardown (ADR 0151)*;
- *check the change against the intent of ADR 0114 G5, 0115, 0153, 0154 and 0164, and stop on a conflict*;
- one writing agent per tree (R2), and the complete changed-file list first in the hand-back (R7).

**Q-8V-1 must be answered before S1.** Q-8V-2 blocks only S7.

| Slice | Owner of the files | Work (≤ 5 items) | Production files | Tier | Reading |
| --- | --- | --- | --- | --- | --- |
| **S1** | Developer (persistence) | (1) Migration `0010_create_contact_submission_views.sql`, with D3's columns and a header in `0006` and `0008`'s form: apply before code, the grant is separate, the bytes are frozen. (2) `SentKitchenViewRepository` on Neon: `record` and `load`. (3) Its fake. (4) Export it from `index.ts`. (5) Live tests for criterion 13, and the [inf] that the FK check needs no `SELECT` grant for the application role, proved or refuted under that role | new `packages/persistence/src/migrations/0010_create_contact_submission_views.sql`; new `sent-kitchen-view-repository.ts`; new `fake-sent-kitchen-view-repository.ts`; `index.ts` | Full + security | This plan: F5 to F9, D3, D6, criteria 9 and 13. ADR 0153 (grants), 0145, 0146 B2, 0151, 0128 (the live-suite lock), 0020. Source: `migrations/0006*.sql`, `0008*.sql`, `share-link-repository.ts`, `contact-submission-store.ts`, `fake-contact-submission-store.ts`, `migration-safety.ts` (the cascade allowance), `retry-on-transient-failure.ts`. Tests: `tests/application-role-privileges.test.ts`, `tests/migration-0008-text.test.ts`, `tests/delete-contact-submissions-for-tests.test.ts` (teardown, ADR 0151). `environments-and-resources.md` |
| **S2** | Developer (web server) | (1) `public-origin.ts`: D7's reader and its property test. (2) `sent-kitchen-link.ts`: mint, `record` within the deadline, answer `{kind: "link", href}` or `{kind: "unavailable", cause}`, plus the log line. (3) The `/s/{token}` page's second lookup (D3). (4) The repository instance getter beside `getShareLinkRepository`. (5) Tests for criteria 12 and 14, and the unit half of criterion 10 | new `apps/web/src/lib/server/public-origin.ts`; new `apps/web/src/lib/server/contact/sent-kitchen-link.ts`; `apps/web/src/app/[locale]/s/[token]/page.tsx`; `apps/web/src/lib/server/repository.ts` | Full + security | This plan: F3, F10, D3, D4, D7, criteria 10, 12 and 14. ADR 0114 G5 and C1, ADR 0156 d4, ADR 0146 B2. Source: `share-token.ts`, `s/[token]/page.tsx`, `proxy.ts:150-240` (read, not edited), `lib/server/repository.ts`, `contact/sent-reference-log.ts` (the log pattern), `lib/server/csp/csp-report-log.ts` |
| **S3** | Developer (mail) | **The port widens and nothing uses it yet.** (1) The port's `html?` and the predicate (D5). (2) `sendableCopyOf` copies four members. (3) The fake records `html`. (4) The adapter adds `html` by name, only when it is present. (5) Tests for criteria 1 to 3, the MIME check through `streamTransport` with a fixed HTML string | `apps/web/src/lib/server/mail/mail-sender.ts`; `fake-mail-sender.ts`; `gmail-mail-sender.ts` | Full + security | This plan: F11, F12, D5 (the port paragraph), criteria 1 to 3. ADR 0164 d1, d4 and d7; ADR 0154 d1 and d2. Source: the mail directory (whole), installed nodemailer `mail-composer/index.js:60-120,270-340,430-520`. Tests: `mail-sender.test.ts`, `fake-mail-sender.test.ts`, `gmail-mail-sender.test.ts`, `qa-8n-compose-support.ts`, `qa-8n-header-injection.adversarial.test.ts` |
| **S4** | Developer (mail) | **The template.** (1) New `lead-notification-html.ts`: the escape function, the closed element builders, the §5 layout. (2) The compact summary and the appendix from the stored review (D8). (3) `lead-notification.ts` composes `{text, html}` from one input, which gains `kitchenLink` (a link or *unavailable*) as a value; the text part puts its line first. (4) The e-mail's leaves in `ro.json`, `ru.json` and `content.ts` (D10), carried in the copy lock as drafted. (5) Tests for criteria 4 to 8, 16 and 16a. **Also:** repoint, flip or delete every existing test this slice turns red (the text part's new order and content: `lead-notification.test.ts`, `qa-8j-notice-*`, `qa-8n-compose-support.ts` users, the golden hashes), under an ADR 0152 table in the hand-back, reporting every QA-owned pin moved (the 8N S2 and 8U round A precedent) | new `apps/web/src/lib/server/mail/lead-notification-html.ts`; `lead-notification.ts`; `apps/web/src/messages/ro.json`, `ru.json`; `apps/web/src/i18n/content.ts` | Full + security | This plan: F13, F17, F18, D5 (the safety list), D8, D10, §5, criteria 4 to 8 and 16. ADR 0154 title and d8; ADR 0107; ADR 0163 d10. Source: `lead-notification.ts` (whole), `review/review-model.ts` (`describeReview`, `rowDetailOf`), `price/price-breakdown-model.ts` (`BreakdownGroup`), `app/globals.css:1-60`. Tests: `lead-notification.test.ts`, `qa-8j-notice-*.adversarial.test.ts`, `tests/support/approved-romanian-messages.ts`, `tests/i18n/golden-output-hashes.ts` |
| **S5** | Developer (web server) | (1) `deliverNotice` calls `sent-kitchen-link` before the send, in the order of D4. (2) `proveTheNoticeIsBuildable` proves both forms. (3) The ports (`SubmitContactPorts`, `Delivery`) gain the repository, the origin and the clock for the deadline. (4) Production ports wire them. (5) `LEMNARIA_PUBLIC_ORIGIN` reaches the e2e server: `playwright.config.ts` sets it to the server's own origin, `production-policy-server.ts` passes it, `.env.example` gains a commented line with no value. Tests for criteria 10, 11 and 15, through `submitContact` with fakes. **Five production entries at the limit, with harness files beside them; a mini-review follows the slice** | `apps/web/src/lib/server/contact/deliver-notice.ts`; `submit-contact.ts`; `contact-production-ports.ts`; `apps/web/playwright.config.ts`; `.env.example` (test support, not counted: `tests/e2e/support/production-policy-server.ts`, `fake-mail-environment.ts` if its list is touched) | Full + security | This plan: F9, F13, D4, D8, criteria 10, 11 and 15. ADR 0157 (the route's order and codes), 0164 d6, 0154 title and d8. Source: `submit-contact.ts` (whole), `deliver-notice.ts` (whole), `lead-notification.ts` (whole, read only: S4 owns it), `contact-production-ports.ts`, `playwright.config.ts:1-130`, `tests/e2e/support/production-policy-server.ts`, `fake-mail-environment.ts`, `tests/lib/server/contact/submit-contact-harness.ts`. `environments-and-resources.md`, *Which file holds what* |
| **S6** | Developer (tooling) | (1) `vitest.preview.config.ts`, which includes only the preview spec. (2) A `preview:lead-notice` script. (3) The preview spec and four fixtures, writing into `LEAD_NOTICE_PREVIEW_DIR` and refusing to run without it or with a path inside the repository (criterion 21) | `apps/web/vitest.preview.config.ts`; `apps/web/package.json` | Light | This plan: §5, criteria 20 and 21. Source: `vitest.config.ts`, `vitest.launch.config.ts`, `package.json` scripts. `ci-and-local-gates.md` |
| **S7** | Developer (UI) | (1) New `done/design-link-card.tsx`, with the clipboard and feedback hook moved out of `sent-reference-card.tsx` into a shared module if `share-design.tsx`'s copy is the same pattern. (2) `done-screen.tsx` uses it. (3) `already-sent-view.tsx` drops the card. (4) Delete `sent-reference-card.tsx` and its test, listed under ADR 0152. (5) Leaves: the card's label and note, and `alreadySentAdvice` in Romanian and Russian, carried in the lock. Tests for criteria 17 to 19, and e2e at the mobile viewport. **Also:** repoint, flip or delete every existing test D2 turns red (`done-reference*` selectors in the dom tests and the `qa-8m-*`, `qa-8m2-*` e2e specs), under an ADR 0152 table in the hand-back, reporting every QA-owned pin moved | new `apps/web/src/done/design-link-card.tsx`; `done/done-screen.tsx`; `contact/already-sent-view.tsx`; `done/sent-reference-card.tsx` (deleted); `messages/ro.json`, `ru.json` (the done leaves only) | Light + visual | This plan: F1, F2, F16, F17, D1, D2, D9, D10, §6, criteria 17 to 19. ADR 0115 d1 and d2, ADR 0160, ADR 0163 d3, d7 and d10, ADR 0152. Source: `done/` (whole), `contact/already-sent-view.tsx`, `review/design-hrefs.ts`, `share/share-design.tsx` (the copy pattern). Tests: `tests/done/*.dom.test.ts`, `tests/contact/already-sent-view.dom.test.ts`, `contact-screen.already-sent.dom.test.ts`, and the e2e specs that select `done-reference` (`qa-8m-done-door`, `qa-8m-geometry`, `qa-8m-failure-screens`, `qa-8m2-hand-over-and-read`, `support/contact-page.ts`, `support/qa-8m2.ts`). `browser-and-visual-qa.md` |
| **QA** | QA (tests only, `qa-8v-*`) | Below | — | — | QA *Reading* |
| **Review** | Reviewers | Below | — | — | Reviewer *Reading* lines |
| **Close** | Scribe | ADR 0165 accepted, the dated notes, `STATUS.md`, `decisions/README.md` | — | — | *For the scribe* |

**The order is S1, S2, S3, S4, S5, S6, S7.** Each production file has one owning slice, with one exception:
`ro.json` and `ru.json`, which S4 (the `leadNotice` leaves) and S7 (the `submissionResult` leaves) touch in disjoint
leaves, and which are therefore never in flight in two slices at once. `lead-notification.ts` is S4's alone, and S5
only calls it. S7 counts six production entries, one of them a deletion: within the limit's intent, said here rather
than stretched quietly.

- S3 and S4 do not depend on S1 or S2: the builder takes `kitchenLink` as a value. They may run in their own worktree
  in parallel with S1 and S2, and S5, the wiring, comes after all four.
- S7 is independent of everything else and may run first if Q-8V-2 is answered early.
- Each slice's own tests are green before the next slice is dispatched.

**QA Reading:**

- this plan, whole;
- ADR 0164 (d1, d4, d6, d7, d10), 0154 d1, d2 and d8, 0153, 0114 G5 and C1, 0115, 0146 B2, 0151, 0152;
- `engineering-conventions.md`, *Coverage an adversarial pass owes* and *Three guards that look thorough and cannot
  fail*; WORKFLOW R6;
- source: the S1 to S7 diff, `share-link-repository.ts`, `s/[token]/page.tsx`, `proxy.ts` (to prove no diff),
  installed nodemailer `mail-composer/index.js`;
- the existing tests `qa-8n-*` and `qa-8j-notice-*`.

**What QA owes, beyond the developer's tests:**

1. Header and markup injection through every field, as in the 8N list, with the HTML cases added.
2. `mailto:` with `?cc=`, `&bcc=`, `#`, `%0A` and `%0D` in a valid local part.
3. Origins that look valid but are not: `https://a.b/`, `https://a.b/x`, `https://u@a.b`, `https://a.b?x`,
   `HTTPS://A.B`, `https://a.b:99999`, `http://a.b`, a trailing newline, an IDN host.
4. `record` that resolves after the deadline: no link in the notice, and the row's later existence is harmless.
5. Two retries of one request: two links, both loading the same document.
6. An unknown token, a revoked share token and a revoked frozen token: byte-identical bodies (criterion 12; malformed is excluded).
7. The size bound on the largest kitchen.
8. Sabotage both ways for criteria 5, 6, 10 and 16 (R6). Report the mutants run and the mutants killed.

**Review**, Full + security, run in parallel **only after QA is green**:

- **Security, Reading:**
  - this plan: D3 to D7 and criteria 2 to 6, 9 to 14 and 20;
  - ADR 0114 G5 and C1, 0153, 0146 B2, 0164 d4 and d10;
  - `environments-and-resources.md`, whole;
  - source: the full diff, `migrations/0010*.sql`, `share-token.ts`, `proxy.ts`.

  *The questions:*

  - Can any customer value become markup, an `href` scheme, a header or a recipient?
  - Can the e-mailed link be made to point off-origin?
  - What does the new table expose to a leaked `DATABASE_URL`?
  - Is the not-found identity kept?
  - Is any value logged?
- **Logic, Reading:**
  - this plan: F9, D4, D8 and criteria 10, 11, 15 and 16;
  - ADR 0157, 0164 d6, 0154 d8;
  - source: `submit-contact.ts`, `deliver-notice.ts`, `lead-notification*.ts`.

  *The questions:*

  - Is the 200 / 502 contract unchanged on every link failure?
  - Can a link reach a notice without a recorded row?
  - Is the summary true to the stored review?
- **Clean-code, Reading:** the full diff; `engineering-conventions.md`; ADR 0136; ADR 0152 (the deleted tests).
- **Visual (S7 and the preview), Reading:**
  - §5, §6 and criterion 17;
  - `browser-and-visual-qa.md`;
  - frame 5A in `docs/design/mockups/Lemnaria Configurator Mobil.dc.html`;
  - the preview files from S6, opened in a browser at 600 px and at 390 px.

## 10. Risks

1. **Mail clients render differently** [inf]. Gmail's dark mode on Android inverts colours, and Outlook ignores some
   CSS. *Mitigation:* table layout, inline styles, explicit colours, and the text fallback. *Proof:* only the owner's
   real check (owner step 4) settles it.
2. **Gmail clips long messages** [inf]. The appendix of a large U kitchen could push the fold. *Mitigation:*
   criterion 7, and the link and contact sit before the appendix.
3. **Migration order.** If the code ships before `0010` and its grant, the `/s/` lookup of an unknown token throws on
   the missing table, and every unknown share token becomes a 500. *Mitigation:* the same rule as `0006`: apply
   before the code ships (owner step 1). The notice path degrades to *unavailable* instead of failing (D4), but the
   page does not, and that is deliberate: a missing table is a deployment error to see, not to hide.
4. **Latency.** The link step adds up to `KITCHEN_LINK_DEADLINE_MS` before the 10 s mail bound. The platform's
   function ceiling must exceed both [inf]. 8N's limit list already carries this trigger.
5. **A second link per retry** (D4). Accepted, and bounded by the limiter.
6. **The owner expects cross-device editing** (F1). Q-8V-2 surfaces it, and the copy states it.
7. **Copy is provisional** and needs owner approval. It is not a gate of this wave (ADR 0163 Amendment B,
   precedent).
8. **8U is in flight in this tree.** The R1 and R2 freeze rules apply. Section 1's ordering note governs.

## 11. Owner-side steps

None is done by an agent. Values are never printed.

1. Apply migration `0010` to each database (preview branch, staging, production) **before** the deploy. Confirm the
   ledger reads 1-10 by reading the schema (ADR 0020). Then grant the application role `INSERT, SELECT` on
   `contact_submission_views` and nothing else.
2. Add `LEMNARIA_PUBLIC_ORIGIN` per environment: the production domain for Production, and the matching origin for
   Preview. This is add-only: nothing existing is changed.
3. After S6, run `LEAD_NOTICE_PREVIEW_DIR=<a folder outside the repository> pnpm --filter @lemnaria/web preview:lead-notice`, open the HTML files, and say what to change in the layout or the summary.
4. After the deploy to Preview, send one real request, and open the e-mail on Gmail web, Gmail Android and iOS Mail,
   in light and dark mode. Open the button on a phone that never saw the design, and confirm it shows the kitchen.
5. Approve or correct the provisional copy (Romanian and Russian).

## 12. ADR drafts

### ADR 0165 (draft) — The shop's notice is a branded HTML e-mail with a plain-text fallback, led by a frozen view-only link to the kitchen as sent

Status: **Draft, 2026-10-16**, inside the 8V plan. The file is created on Q-8V-1's answer.
Type: Decision. Milestone: M8 wave 8V.

**Supersedes, when accepted:**

- M8 Q5 (a) for the e-mail: the 3D view no longer waits for the dashboard;
- ADR 0164 d1's *Not taken: … `html`* and d4's *"Plain text only"*;
- ADR 0154 d2's must-not item `html`;
- ADR 0160's and ADR 0163 d7's drawing of the reference with *Copiază* on 5A and on the already-sent view.

**Keeps:**

- ADR 0114 G5;
- ADR 0115 d1 and d2;
- ADR 0153's grants on `contact_submissions`;
- ADR 0154 d1 (the seven kinds) and d8;
- ADR 0163 d3 (WhatsApp) and the refusal of Q5 (c);
- ADR 0164 d2, d5, d6 and d10.

**Context.** §1 and the findings F1 to F19 of the 8V plan. The owner's 2026-10-16 request: a link on the done page,
the kitchen link as the e-mail's first item, an e-mail that looks like the site, and the content focused.

**Decisions.** D1 to D10 of the plan, carried verbatim at acceptance, with the alternatives refused under each.

**Limits recorded (ADR 0118):**

- no expiry on a frozen link (*trigger:* M9 retention, or the owner);
- a second link per retried notice (*trigger:* the shop reports confusion);
- no thumbnail (*trigger:* the owner asks after seeing the link);
- client rendering unproven (*trigger:* owner step 4, quoted in the close-out);
- the size bound inferred (*trigger:* a clipped notice).

**Evidence.** The plan's tiers. Nothing was run at planning.

### ADR 0164, Amendment A (draft, for the scribe to append at 8V's close, after 0164 itself is accepted at 8N's close)

> **Amendment A — dated {close date}, by wave 8V (ADR 0165).**
>
> **d1:** *Not taken: … `html`* no longer holds. `MailMessage` gains `html?: string`. The predicate adds *absent or a
> non-empty string*, and `sendableCopyOf` copies four members. Nothing else of the port changes.
>
> **d4:** *"Plain text only"* is replaced by *a plain-text part and an HTML part, as `multipart/alternative`*. The
> rest of the must-not list stands: no `replyTo`, `cc`, `bcc`, `headers`, `attachments`, display name, or customer
> value in a header. `disableFileAccess` and `disableUrlAccess` stay set, and the HTML holds no remote or active
> content (ADR 0165 D5).
>
> **d10:** Google additionally receives a view-only link to the kitchen as sent. The link holds no personal data.
>
> Nothing above this amendment is edited.

**Notes owed at the close, for the scribe:**

- ADR 0154 d2: the `html` item, pointing to 0165;
- ADR 0160 and ADR 0163 d7: the reference is no longer drawn;
- ADR 0153: a sibling table holds a non-personal copy of the snapshot, and the grants on `contact_submissions` are
  unchanged;
- the M8 plan, Q5: a dated pointer.

## 13. Open owner questions

The owner is asked these two, no more.

**Q-8V-1 — The link in the shop's e-mail: a frozen copy of the kitchen as it was sent, or the customer's own share
link?**

- **(a) A frozen copy. Recommended.** The shop always sees exactly the kitchen the customer sent, even if the
  customer edits it later. The customer sending the design on WhatsApp never breaks the shop's link. It needs one new
  database table, which you apply with one grant before the release (owner step 1).
- **(b) The customer's own share link.** It needs no new table, but it does not work today without a new security
  rule, because the contact form does not carry the customer's edit permission. Each new WhatsApp send by the
  customer would also cut the link in your e-mail, and you would see the kitchen as it is now, not as it was sent.

You already chose against (b) on 2026-10-07 and 2026-10-13.

**Q-8V-2 — Is it acceptable that the customer's design link on the done page opens for editing only in the same
browser, until customer accounts (M8B) exist?**

- **(a) Yes. Recommended.** The page shows the link with *Copiază* and says plainly *"opens for editing only in this
  browser"*. Accounts, planned next, make it work on any device.
- **(b) No, it must work on any device now.** That means a secret edit link. It reverses your 2026-09-11 decision
  that editing across devices comes through an account, and it needs its own security wave.

## 14. For the scribe, not done here

- Add a pointer row for 8V to the M8 plan's wave table.
- `STATUS.md`'s *What to do next* names 8V after 8U's close. The architect did not edit `STATUS.md`, per the
  dispatch.
- Create `docs/decisions/0165-…md` from §12 once Q-8V-1 is answered.
- Write ADR 0164's own acceptance at 8N's close (F19) before Amendment A.
- Add `LEMNARIA_PUBLIC_ORIGIN` to `best-practices/environments-and-resources.md`, *Which file holds what*: its
  name, its rule (D7), the environments that hold it, and that it is not a secret. The value is never written.
- Add the frozen-link revocation step (D6) to the database runbook under `docs/runbooks/`.
