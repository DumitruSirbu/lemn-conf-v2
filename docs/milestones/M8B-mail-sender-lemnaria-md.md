# M8B follow-up — mail sent and received under `@lemnaria.md` through the domain provider's SMTP

Status: **Planned — 2026-10-18**, by the architect. Nothing is built. No ADR is written yet (see §9).
Branch: `feat/login-register` (worktree `lemnaria-configurator-login`).
Parent plan: [`M8B-login-register-plan.md`](M8B-login-register-plan.md) (wave L7, §10 risks, M9 launch-gate lines).

**Evidence tiers used below.**

- **[owner]** the owner's words, relayed by the coordinator, quoted.
- **[doc]** quoted from this repository, with a path and line.
- **[src]** read in this worktree's source on 2026-10-18 (uncommitted working tree of `feat/login-register`).
- **[nm]** read in the installed `nodemailer@10.1.1` (`node_modules/.pnpm/nodemailer@10.1.1/.../dist/esm`).
- **[std]** a mail-standard fact (SPF, DKIM, DMARC, SMTP submission) from memory, **not re-read**. A wave that depends
  on one quotes the RFC first.
- **[inf]** the architect's inference, with what would falsify it.
- **[Q]** a provider-specific fact that is **not known** and is listed as a question in §8. No provider fact in this
  plan is asserted; the provider is not yet named.

---

## 1. The owner's rulings, and how they fit together

Three rulings, all 2026-10-18, in order [owner]:

1. *"email will be from domain provider and domain is md lemnaria.md"* — account mail leaves from an address on
   `lemnaria.md` through the domain provider's mail service. Recorded in ADR 0172 Amendment E item 1 [doc:
   `docs/decisions/0172-…md:675-685`].
2. *"everywhing will be send and received unde @lemnaria.md"* — the shop's lead notices too: they are **sent from** an
   address on `lemnaria.md` and **received at** a mailbox on `lemnaria.md`. Gmail leaves both paths.
3. *"now till development keep gmail one as it works"* — Gmail stays the **only configured sender** during development,
   until the `lemnaria.md` sender is built, tested on Preview, and the owner switches over.

**Reading of the three together.** Ruling 2 is the **end state**. Ruling 3 governs **now**. Therefore:

- The new sender is an **additive, opt-in** path. It is selected only by new variables. With none of them present,
  what Gmail does — the selection, the transport options and the bytes on the wire — is exactly what it does today.
- No wave before the owner's cutover changes Gmail's behaviour, retires a `GOOGLE_*` name, or removes anything.
- **Cutover** (the owner adds the new variables to an environment) and **retirement** (the code stops reading
  `GOOGLE_*`) are separate owner steps, in that order, each gated on evidence (§6).

## 2. Goal and scope

**Goal.** One generic, authenticated-SMTP sender, configured by new add-only variables, that sends both the shop's
notice and the four account mails from a `lemnaria.md` address, with the same guarantees the Gmail adapter gives today:
one recipient, one attempt, the seven failure kinds, a 10 s bound, nothing from a provider or a value in a log, and the
e2e fake untouched.

**In scope.** Code waves W1–W2 (the adapter; configuration, selection and factories), documentation wave W3, the
owner's provider and DNS work (§5), the owner's Preview and Production cutover (§6), and retirement wave W4, gated on
the owner's ruling.

**Out of scope.**

- Widening either port: no Reply-To, no display name, no `cc`/`bcc`/`headers`/`attachments`, no explicit `envelope`
  (ADR 0164 d4 must-not list, kept; §4.4).
- A global daily ceiling on account mail (parent plan L8 conditions, option (a)). It stays the owner's choice (§7, R4).
- Inbound processing by the application. Receiving is a mailbox at the provider; the app reads no mail.
- The privacy-notice text itself. W3 drafts the processor lines; the text stays the owner's (launch-gate line 4).

## 3. What exists today (the baseline the plan must not disturb)

All [src] unless marked.

- **Two ports.** The shop's `MailMessage` has no recipient (`mail/mail-sender.ts:12-17`); the customer's
  `CustomerMailMessage` carries exactly one plain mailbox (`mail/customer-mail.ts:19-25`). `sendableCopyOf` refuses a
  shop message that has a `recipient` member (`mail-sender.ts:103-105`). The two sender types are not assignable to
  each other (`customer-mail.ts:29-37`).
- **One configuration, three names, all or nothing.** `readMailConfiguration` reads `GOOGLE_EMAIL`,
  `GOOGLE_APP_PASSWORD`, `LEAD_NOTIFICATION_ADDRESS` (`mail/mail-configuration.ts:8-16`, `:59-84`). An unusable or
  missing name answers `unavailable` with names only. `RESEND_API_KEY` and `MAIL_FROM_ADDRESS` are **retired** names
  that configure nothing but still refuse the fake flag (`:22-25`).
- **One selector.** `selectMailSender` answers `fake` (flag `LEMNARIA_E2E_FAKE_MAIL=1` with no mail name present),
  `provider` (the three names usable), or `unavailable` (`mail/select-mail-sender.ts:32-44`). The flag beside any live
  or retired name is `unavailable` (`:47-56`).
- **Two factories, one selection.** `createMailSender` (shop) and `createCustomerMailSender` (account) both call
  `selectMailSender`, then build from `readMailConfiguration` (`create-mail-sender.ts:31-55`,
  `create-customer-mail-sender.ts:25-54`). `isContactSendable` asks the selector, not the factory
  (`contact/contact-availability.ts:16-21`); `prepareAccountMail` asks the customer factory
  (`account/queue-account-mail.ts:52-63`).
- **One adapter, Gmail-fixed.** `gmail-mail-sender.ts` hard-codes `smtp.gmail.com:465`, `secure: true` (`:32-33`,
  `:91-112`); `from` is `GOOGLE_EMAIL`, which is also the SMTP user (`:98-101`, `:125-133`); `Message-ID` is
  `<sha256(key)@domain(from)>` (`:177`); one transport per send, closed in `finally`, raced against
  `MAIL_REQUEST_TIMEOUT_MS = 10_000` (`:30`, `:220-232`, `:291-305`); no pool, logger, debug, file or URL access.
- **One answer table**, provider-neutral except one Gmail-shaped rule: `550 5.4.5` is read as `quota-spent`
  (`mail/smtp-answer.ts:13-16`, `:72-79`). `EREQUIRETLS` is already a `refused` code (`:18-26`).
- **The e2e harness** withholds the five mail names from every server it starts and fails the run if one survives
  (`tests/e2e/support/fake-mail-environment.ts:18-24`, `:32-57`). `production-policy-server.ts:78` spreads the same
  list into `NOT_INHERITED`. `fake-mail-environment.test.ts` holds the list equal to
  `[...MAIL_VARIABLE_NAMES, ...RETIRED_MAIL_VARIABLE_NAMES]`.
- **Tests that pin today's shape.** `qa-8j-environment.adversarial.test.ts` enumerates
  `VARIABLE_STATES ** MAIL_VARIABLE_NAMES.length` (line 246) and several tests pin the selection kind `"provider"`
  (`select-mail-sender.test.ts`, `mail-configuration.test.ts`). Fifteen files under `apps/web/tests` name `gmail-mail-sender` [ran: `grep -rln`, 15].
- **Tests that read names or source text**, which a new module or a new name trips even when behaviour is right:
  - `qa-8j-environment.adversarial.test.ts:530-565` hands the reader, the selector and the shop factory a recording
    proxy and fails if any name outside `SIX_NAMES` (the three live, the two retired, the flag) is asked. W2's selector
    asks `MAIL_TRANSPORT` and, in the fake's fence, the `MAIL_SMTP_*` names, so this list **must grow** in W2.
  - `qa-8n-no-network-and-scans.adversarial.test.ts:117-124` pins `GMAIL_SMTP_HOST` to exactly
    `gmail-mail-sender.ts` and its test, so the constant stays in that file.
  - The network-guard census in `mail-network-guard.test.ts:119-123` and `qa-8n-no-network-and-scans…:161-162` matches
    imports of `nodemailer`, `gmail-mail-sender` and `create-mail-sender` only. A test importing a new adapter module, or
    the existing `create-customer-mail-sender`, escapes the census. **That is an existing gap since L7** [src] that W1
    closes by widening both patterns.
  - No lint rule pins which source file imports `nodemailer`, but a test does: `create-mail-sender.test.ts`'s naming
    rule *the mail library* (`isAllowed`) fails any file under `apps/web/src` other than `gmail-mail-sender.ts` that
    imports it [src, found by W1's review]. A new importer, `smtp-mail-sender.ts`, therefore needs that `isAllowed` to
    grow. [ran: `grep -rln nodemailer` outside `node_modules`, `.next`, `docs`: only `gmail-mail-sender.ts` in
    `src/lib`, three route files naming it in comments or config, tests, `package.json`, the lockfile and `.env.example`].

**nodemailer facts this plan relies on** [nm]:

- `requireTLS` *"Force STARTTLS, fail when the server does not support it. Takes precedence over ignoreTLS and
  opportunisticTLS"* (`smtp-connection/index.d.ts:31-32`); a contradictory `requireTLS` with `ignoreTLS` or
  `opportunisticTLS` does not fall back to plaintext (`smtp-connection/index.js:113-114`); with `requireTLS` set, a
  non-2xx EHLO fails with `ECONNECTION` instead of falling back to HELO (`:1466-1468`).
- The envelope sender is derived from the `From` header when no `envelope` option is given
  (`mime-node/index.js:901-920`). **So bounces go to the `From` address.**

## 4. Design

### 4.1 New variables (add-only; names only, never values in the repository)

| Name | Secret | Rule ("usable") | Purpose |
| --- | --- | --- | --- |
| `MAIL_TRANSPORT` | no | exactly `smtp` | The opt-in. Absent: today's behaviour. |
| `MAIL_SMTP_HOST` | no | a lower-case ASCII DNS name, at least two labels, last label starting with a letter; no scheme, port, path, IP literal or trailing dot. **A hard W2 requirement** (the W1 builder refuses only a host that is not a plain DNS name; W2's reader is the one place that holds this whole rule, and a test must pin each clause) | The provider's submission host [Q1]. |
| `MAIL_SMTP_PORT` | no | exactly `465` or exactly `587` | Implicit TLS or STARTTLS submission [Q2]. |
| `MAIL_SMTP_USER` | yes (treated as) | visible ASCII, no space, 1–254 characters | The SMTP login [Q3]. May differ from the From address. |
| `MAIL_SMTP_PASSWORD` | **yes** | visible ASCII, no space (`VISIBLE_ASCII_KEY`), as Gmail's | The SMTP password. Never printed, logged, read at build, or bundled. |
| `MAIL_SMTP_FROM_ADDRESS` | no | exactly one plain mailbox (`asciiDomainOfPlainMailbox`) | The `From`, the envelope sender, and the `Message-ID` domain. |

- **`LEAD_NOTIFICATION_ADDRESS` is shared, not Gmail's.** It is the shop's one recipient under either transport. Its
  rule (*exactly one plain mailbox, never a customer's*) is unchanged. Moving the shop's inbox to `lemnaria.md` is a
  **change of its value**, which is the owner's step (§6). It works under Gmail too, so it can move before or after the
  sender does [inf: Gmail can send to any external mailbox; falsified if a test notice to the new value does not
  arrive].
- **`MAIL_FROM_ADDRESS` is not reused.** It is a retired Resend name that may still hold a stale value in an
  environment (`mail-configuration.ts:18-25`) [src]. Reusing it would make an old value live again.
- **Why the user is separate from the From address.** Some providers log in with a username that is not the mailbox;
  whether this one does is [Q3]. A separate name costs nothing and avoids a code change if it does.
- A password with a space reads *unavailable*, as Gmail's does. If the provider issues such passwords [Q3], that rule
  is revisited in W2's review, not loosened silently.

### 4.2 Selection (the precedence, and how ambiguity is refused)

`selectMailSender` gains one kind, `smtp`. `provider` keeps meaning Gmail, so every test that pins it is untouched.

| # | Environment | Answer |
| --- | --- | --- |
| S1 | Flag `=1` and **no** mail name (live Gmail, retired, `MAIL_TRANSPORT`, any `MAIL_SMTP_*`) | `fake` |
| S2 | Flag `=1` beside **any** of those names | `unavailable`, naming the flag |
| S3 | `MAIL_TRANSPORT` absent | **exactly today**: `provider` when the three Gmail names are usable, else `unavailable` naming the Gmail names. `MAIL_SMTP_*` names are ignored for selection, whether some or all are present |
| S4 | `MAIL_TRANSPORT` present with any value other than exactly `smtp` (empty, `SMTP`, ` smtp`, `gmail`, …) | `unavailable`, naming `MAIL_TRANSPORT` |
| S5 | `MAIL_TRANSPORT=smtp`, and any of the five `MAIL_SMTP_*` or `LEAD_NOTIFICATION_ADDRESS` missing or unusable | `unavailable`, naming exactly the missing or unusable ones. **Never falls back to Gmail** |
| S6 | `MAIL_TRANSPORT=smtp`, all six usable | `smtp`, **whatever the `GOOGLE_*` names hold** |

**Why an explicit opt-in (recommended) rather than presence of the SMTP set (considered).**

- *Presence-based* (a complete `MAIL_SMTP_*` set wins; a partial set is `unavailable`) also meets "Gmail stays when the
  new names are absent". But a typo in one of five secrets added to Production turns working Gmail mail into
  `unavailable`, and rolling back means removing five variables, one of them secret.
- *The opt-in* lets the owner add and stage the five `MAIL_SMTP_*` names in an environment with **no effect** (S3), then
  switch with one non-secret addition (S6). Both the staging and the switch are additions, so cutover is purely
  add-only. Rollback is the removal of one non-secret name, which is the owner's act (§6.3).
- *A per-path opt-in* (account mail on SMTP, shop on Gmail) was not taken: ruling 2 moves both, and one selection is
  what keeps `isContactSendable` and `prepareAccountMail` in agreement.

**The customer path keeps requiring `LEAD_NOTIFICATION_ADDRESS`** under SMTP (S5), as it does under Gmail today
(`create-customer-mail-sender.ts:43-53` reads the three-name configuration) [src]. Not taken: dropping it for the
customer path. That would make the two factories answer differently for one environment, which breaks the "one
selection" property in §4.3.

### 4.3 Factories

Both factories **branch on the selector's kind** and never re-derive a precedence of their own: `fake` builds the fake,
`provider` builds the Gmail adapter exactly as today, `smtp` builds the SMTP adapter from `readSmtpConfiguration`,
`unavailable` returns the selector's names. The configuration value (with the password) stays inside the factory, as
today (`create-mail-sender.ts:26-30`).

### 4.4 On the wire (the SMTP adapter)

**Transport options**, built from named members only:

- `host` = `MAIL_SMTP_HOST`; `port` = 465 or 587; `auth: { user, pass }`.
- Port 465: `secure: true`. Port 587: `secure: false` **and** `requireTLS: true` [nm: STARTTLS mandatory, no plaintext
  fallback].
- `pool: false`, `logger: false`, `debug: false`, `disableFileAccess: true`, `disableUrlAccess: true`, and the same four
  timeouts and the same 10 s bound as Gmail.
- **Never present:** `tls` (no `rejectUnauthorized: false`, no cipher or version override; ADR 0164 d5 "no `tls`
  override", kept), `ignoreTLS`, `opportunisticTLS`, `service`, `url`, `proxy`, `name`, `authMethod`,
  `requireTLSExtensionEnabled`.
- Node's own default minimum TLS version governs [inf: `tls.DEFAULT_MIN_VERSION` is TLSv1.2; W1's reading quotes Node's
  docs before relying on it].

**Message options**, exactly `{ from, to, subject, text, messageId, html? }`:

- `from` = `MAIL_SMTP_FROM_ADDRESS`, bare, **no display name**.
- `to` = `LEAD_NOTIFICATION_ADDRESS` for the shop sender; the message's own recipient (`asciiMailboxOf`) for the
  customer sender. One string, never a list.
- `messageId` = `<sha256-hex(key)@ascii-domain(MAIL_SMTP_FROM_ADDRESS)>`, so it carries the `lemnaria.md` domain once
  the From is on it.
- No `replyTo`, `cc`, `bcc`, `headers`, `attachments`, `envelope`.

**Bounces and replies.** With no `envelope` option the return path is the `From` address [nm]. So the From must be a
**real mailbox** that someone can read, or bounces and customer replies are lost. That is an owner choice (Q6), not a
reason to add an `envelope` or a `Reply-To`: either one widens the surface that ADR 0164 and ADR 0172 D6 keep closed.

**Logging.** The adapter logs nothing. Only the factory logs, and only the fake's constant warning. A thrown error
names a setting, never a value. `smtp-answer.ts` reads only `code`, `responseCode` and one comparison of `response`;
nothing a server said is kept (ADR 0146).

**The answer table is kept as is.** One limit is recorded: the `550 5.4.5` match is Gmail's. A provider that signals its
cap differently lands in `refused` (a 5xx) or `busy` (a 4xx, which is retried) [inf]. The provider's reply codes are
[Q8]. A change to the table is a later wave under its own review, once those codes are quoted.

### 4.5 Code structure

- **New `mail/smtp-transport.ts`**: the transport-neutral machinery now inside `gmail-mail-sender.ts`, moved without
  change: `sendOnce`, `tryMakeTransport`, `attemptSend`, `answerWithinBound`, `closeQuietly`, the digest, and the
  options-of builder. The four timeouts and the bound stay single constants.
- **New `mail/smtp-mail-sender.ts`**: `buildSmtpTransportOptions(settings)`, `buildSmtpMessage`,
  `buildSmtpCustomerMessage`, `createSmtpMailSender`, `createSmtpCustomerMailSender`.
- **`mail/gmail-mail-sender.ts`** delegates to `smtp-transport.ts` and **keeps every export, type and constant it has
  today**, so the fifteen test files that name it compile and pass unedited.
- **New `mail/smtp-configuration.ts`**: the six-name reader (`readSmtpConfiguration`), its own `SMTP_MAIL_VARIABLE_NAMES`
  constant and `MAIL_TRANSPORT_VARIABLE`. **The SMTP names are not appended to `MAIL_VARIABLE_NAMES`**: that list drives
  `qa-8j-environment`'s exhaustive `VARIABLE_STATES ** n` enumeration and the Gmail all-or-nothing rule.

*Not taken:* a second copy of the Gmail adapter edited for SMTP. It would leave two copies of the must-not list and the
bound to drift apart until W4. *Not taken:* renaming `gmail-mail-sender.ts`. That edits fifteen test files, which
would destroy W1's proof that Gmail is unchanged.

## 5. Owner-side setup at the domain provider (no code; can start now, beside W1)

All record contents come from the provider [Q]. The shapes below are [std], not re-read.

**5.1 Where DNS lives (ask first, Q4).** The records go wherever `lemnaria.md`'s **nameservers** point. If they point
at Vercel or another host rather than the domain provider, the SPF, DKIM, DMARC and MX records are added **there**, not
in the provider's panel.

**5.2 Addresses.**

- A **sending address**, for example `no-reply@lemnaria.md` or `cont@lemnaria.md` (Q5). Because bounces return to it
  (§4.4), it should be a real mailbox that is read, or at least forwarded (Q6).
- A **shop inbox** on `lemnaria.md` that receives lead notices (Q7). It may be the same mailbox or a separate one.
- An address for **DMARC aggregate reports** (`rua`), which can be the shop inbox or a separate one.

**5.3 Records** [std].

- **MX** for `lemnaria.md` pointing at the provider's inbound servers. Without it nothing can be *received* there:
  not the lead notices, not the bounces, not replies.
- **SPF**: one `TXT` record at `lemnaria.md` that authorises the provider's outbound servers. **Exactly one SPF
  record per name**: if one already exists (for example from a website host), it is merged, not duplicated. Two SPF
  records make SPF fail.
- **DKIM**: the provider generates a key pair and gives a selector record (`<selector>._domainkey.lemnaria.md`, a
  `TXT` or `CNAME`). The signing domain must be `lemnaria.md`, so that it aligns with the From. Whether the provider
  signs at all is [Q9]; **without DKIM, delivery to Gmail and Outlook recipients is at risk** [inf].
- **DMARC**: a `TXT` record at `_dmarc.lemnaria.md`. Start with `p=none` and a `rua` address. Move to `quarantine`
  and then `reject` once the reports show only the provider's mail passing. Alignment holds because the From, the
  envelope sender (= From, §4.4) and the DKIM `d=` are all `lemnaria.md`.
- Reverse DNS (PTR) of the sending IP is the provider's, not the owner's [std].

**5.4 What to ask the provider** (the questions are listed in §8 with defaults).

- SMTP **submission** host; whether 465 (implicit TLS) and 587 (STARTTLS) are offered; the authentication method.
- Whether logging in from **cloud IPs** (Vercel functions) is allowed, or blocked or geofenced [Q10].
- **Sending limits**: per hour, per day, per message recipients; what happens at the limit, and with what reply code
  [Q8]. Whether the account is suspended for automated sending.
- Whether **DKIM** is supported and who creates the key [Q9]; whether DMARC reports can be received.
- Whether mail sent by SMTP is **stored** (a *Sent* copy), and for how long; whether that can be turned off [Q11].
- A **data processing agreement** (GDPR Art. 28, Law 195/2024 art. 28 per the privacy draft); where mail and
  mailboxes are **stored** (country); sub-processors [Q12].
- The shop inbox's storage quota and spam filtering on **inbound** mail (lead notices must not land in spam at the
  receiving end either).
- Whether the From may differ from the login (aliases) [Q3].

## 6. Rollout, environments, and retirement

### 6.1 Order

1. **W1, W2 merge** with no new variable set anywhere. Every environment behaves exactly as before (S3).
2. **Owner, provider and DNS** (§5). Verify the records with the provider's checker, if any.
3. **Preview cutover (owner).** Add the five `MAIL_SMTP_*` names to **Preview only**
   (`vercel env add NAME preview`, sensitive). Redeploy. Confirm Gmail mail still works (S3). Then add
   `MAIL_TRANSPORT=smtp` to Preview. Redeploy.
4. **Preview evidence (owner, quoted in a close-out).** Send each of the four account mails (confirm, already
   registered, reset, password changed) and one lead notice, to at least one Gmail and one Outlook recipient, and to
   the shop inbox. Quote, for each: `From`, `Return-Path`, the `Message-ID` domain, the `Received` line showing TLS,
   and `Authentication-Results` showing `spf=pass`, `dkim=pass` (with `d=lemnaria.md`) and `dmarc=pass`. Reply to one
   mail, and confirm the reply and a deliberate bounce reach the From mailbox.
5. **Production cutover (owner ruling).** The same two steps on Production.
6. **Retirement (W4)** only after the owner rules that Gmail is retired. **Removing `GOOGLE_*` from Vercel stays the
   owner's decision at any later time** (add-only).

### 6.2 Preview versus Production consequences

- Between steps 3 and 5, **Preview sends from `lemnaria.md` and Production from Gmail**. Both are processors in that
  window (§7).
- Preview's lead notices go to Preview's `LEAD_NOTIFICATION_ADDRESS`. If that value is the real shop inbox, test
  notices reach the shop (Q7). Changing it is an overwrite, which only the owner may do.
- Preview's links resolve under Preview's own `LEMNARIA_PUBLIC_ORIGIN` and database (ADR 0165), unchanged.
- **Development and local runs are untouched.** A local copy of the new names goes only in the repo-root `.env.local`,
  never `apps/web/.env.local`, as for Gmail. The e2e harness withholds all of them (W2), so no test server can send.
- The provider's sending limit is shared between Preview and Production if both use one account [inf]. Q13 asks whether
  Preview gets its own credential.

### 6.3 Rollback

- From S6 to Gmail: the owner removes `MAIL_TRANSPORT` from that environment. **`vercel env rm NAME <env>` deletes a
  variable across every environment** [doc: `docs/best-practices/environments-and-resources.md:21-25`]. Once Production
  also holds it, a Preview-only rollback is not a CLI act. The owner decides how (for example the dashboard), and the
  agent prepares the steps only.
- A partial or broken SMTP set under `MAIL_TRANSPORT=smtp` answers `unavailable` (S5): the contact page shows its
  unavailable state and account flows answer unavailable. It **never silently sends from Gmail**.

### 6.4 Retirement (W4, gated)

- `GOOGLE_EMAIL` and `GOOGLE_APP_PASSWORD` move into `RETIRED_MAIL_VARIABLE_NAMES`: they configure nothing and still
  refuse the fake flag. The harness keeps withholding them.
- The Gmail adapter and the tests that exist only for it are deleted **on evidence** (ADR 0152); tests that protect a
  shared rule are re-pointed at the SMTP adapter.
- Whether `MAIL_TRANSPORT` stays required, or SMTP becomes the default when it is absent, is decided in W4's plan.
  Either way, retired Gmail names alone answer `unavailable`.

## 7. Privacy and launch effects

- **Processor entry.** Once Gmail is retired in Production, the domain provider replaces Google as the processor for
  **all** mail: account mails and the shop's notices. During the overlap (§6.2) both are processors.
- **Lines in `docs/legal/privacy-notice-draft.md` to change in W3** [doc]: 37 (the Gmail *Sent* folder erasure row
  becomes the provider's sent-mail retention, Q11), 71 (recipients), 72 (transfers: Google and the US drop out for
  mail; the provider's country is Q12), 167 (the Romanian processor table row `Google (Gmail)`), 294 (English
  recipients), 375 (the processor-contract row), 402 (the US-transfer row).
- **Consumer Gmail has no Art. 28 contract.** The privacy draft marks it **BLOCKING** [doc: `privacy-notice-draft.md:375`].
  So "Gmail during development" holds only while **no real user's data** flows through it.
- **New M9 launch-gate line (W3 adds it to the parent plan's list):** *before any real user, Production mail is sent
  through the `lemnaria.md` provider with its data-processing agreement in place and its data location recorded, or
  Google is otherwise covered by an Art. 28 contract.* The line carries ADR 0172 Amendment E's recorded effect
  ("obtain and verify the domain provider's data-processing agreement and region") into M9's gate list; it changes
  nothing in that record.
- **The shared-quota risk is transformed, not closed.** The parent plan's L7 M2 risk (`M8B-login-register-plan.md:793-801`,
  `:1225-1227`) names Gmail's ~500 a day. That figure goes away at cutover. But both paths will share **one** provider
  account, so account mail can still starve lead notices under the provider's limit, which is unknown [Q8]. W3 corrects
  the risk row (its 2026-10-18 update says the risk *"no longer applies to account mail"*, which is not so while the
  account is shared). The mitigations stay the owner's: (a) a global daily ceiling on account mail, or (b) separate
  credentials per path (Q13).

## 8. Open questions for the owner

| # | Question | Default until answered |
| --- | --- | --- |
| Q1 | Which provider hosts `lemnaria.md` mail, and what is its SMTP submission host? | None; W1–W2 do not need it |
| Q2 | Does it offer 465 (implicit TLS), 587 (STARTTLS), or both? | 465 if offered, else 587. Nothing else is accepted |
| Q3 | What is the SMTP login (full mailbox or a username)? App passwords? Can the From be an alias of the login? Can a password contain a space? | The login is the From mailbox; no alias |
| Q4 | Where are `lemnaria.md`'s nameservers (the provider, Vercel, elsewhere)? | Ask before adding any record |
| Q5 | Which address sends? | A real, read mailbox, for example `cont@lemnaria.md`, over `no-reply@` |
| Q6 | Who reads bounces and replies to the From mailbox? | The shop, through the same mailbox or a forward |
| Q7 | Which `lemnaria.md` mailbox receives lead notices, and should Preview's notices go to a test mailbox instead? | Production: the shop inbox. Preview: a separate test mailbox |
| Q8 | The provider's sending limits (hour, day, recipients per message) and the reply code at the limit | Unknown; the answer table is unchanged |
| Q9 | Does the provider sign DKIM for `lemnaria.md`? | Required before Preview cutover |
| Q10 | Does it allow SMTP logins from cloud IPs (Vercel's functions)? | Proven only by the Preview send |
| Q11 | Is SMTP-sent mail kept as a *Sent* copy, for how long, and can that be turned off? | Assume kept; the privacy draft must say so |
| Q12 | Data-processing agreement, storage country, sub-processors | Launch-blocking (§7) |
| Q13 | One credential for both paths, or one per path; one for Preview and one for Production? | One shared account; risk R4 stands |
| Q14 | A display name such as `Lemnaria` on the From? | None (ADR 0164 must-not list); a widening needs its own review |

## 9. Records owed

- **A new ADR, provisional number.** This worktree's records jumped from 0166 to 0169 (the accounts ADR, since renumbered 0172 at the merge with `main`), and the `-gbt` worktree
  already held a **different** 0169 plus 0167, 0168, 0170 and 0171 [ran: `ls docs/decisions` in both worktrees]. So both
  worktrees held an ADR 0169 with different content, a numbering clash the merge resolved by renumbering the accounts ADR to 0172. The new
  record takes the next number free on **both** branches at the time it is written. It is **owed, not written**.
- **It amends** ADR 0164 d2 (the names; the sender is no longer necessarily the Google account) and d5 (the fixed host
  and port become configuration; the TLS rules of §4.4), and ADR 0172 D6 (*"reuses the Gmail transport … until M9
  chooses a provider"*). **It keeps** ADR 0154 d1 and d11, ADR 0164 d4's must-not list, d6, d7 and d9, and ADR 0165.
  Alternatives to record: presence-based selection, a per-path opt-in, a duplicate adapter, an explicit `envelope` or
  `Reply-To`.

## 10. Waves

Each code wave touches at most five production files; paired tests do not count (`docs/WORKFLOW.md`, *Scope
discipline*). Review tier per `docs/WORKFLOW.md`, *How much review a wave gets*. Security review is mandatory on W1, W2
and W4.

| Wave | Items | Production files | Depends on | Tier | Reading |
| --- | --- | --- | --- | --- | --- |
| **W1** — the SMTP adapter, unwired | 1. Move the shared send machinery out of the Gmail adapter, unchanged. 2. `buildSmtpTransportOptions` (465 / 587 rules, §4.4). 3. Shop and customer message builders and senders. 4. The Gmail adapter delegates and keeps every export | `mail/smtp-transport.ts` (new), `mail/smtp-mail-sender.ts` (new), `mail/gmail-mail-sender.ts` | — | **Full + security** | This plan §3, §4.4, §4.5; ADR 0164 d4, d5, d6, Amendment A; ADR 0165 D5; ADR 0172 D6 and the L7 security-review conditions (`M8B-login-register-plan.md:760-801`); ADR 0146; source: `gmail-mail-sender.ts`, `smtp-answer.ts`, `mail-sender.ts`, `customer-mail.ts`, `plain-mailbox.ts`; [nm] `smtp-connection/index.d.ts:1-60`, `smtp-connection/index.js:100-120`, `:1460-1485`, `mime-node/index.js:901-930`; Node `tls` docs on `DEFAULT_MIN_VERSION`; tests: `mail-network-guard.test.ts:110-160`, `qa-8n-no-network-and-scans.adversarial.test.ts:100-200` |
| **W2** — configuration, selection, factories, harness | 1. `readSmtpConfiguration` and `SMTP_MAIL_VARIABLE_NAMES`. 2. Selection rows S1–S6. 3. Both factories branch on the selector's kind. 4. The harness withholds the six new names. 5. `.env.example` documents them, commented, with no value | `mail/smtp-configuration.ts` (new), `mail/select-mail-sender.ts`, `mail/create-mail-sender.ts`, `mail/create-customer-mail-sender.ts`, `tests/e2e/support/fake-mail-environment.ts` (+ `.env.example`, config) | W1 | **Full + security** | This plan §3, §4.1–§4.3, §6.3; ADR 0154 d6, d7; ADR 0164 d2, d3, d7; ADR 0172 D6, Amendment E item 1; `docs/best-practices/environments-and-resources.md` (*Hard rule*, *The mail variables since 8J2*); source: `mail-configuration.ts`, `select-mail-sender.ts`, `create-mail-sender.ts`, `create-customer-mail-sender.ts`, `fake-mail-flag.ts`, `contact/contact-availability.ts`, `account/queue-account-mail.ts:47-63`, `tests/e2e/support/fake-mail-environment.ts`, `production-policy-server.ts:70-85`, `qa-8j-environment.adversarial.test.ts:160-260` and `:470-565`, `fake-mail-environment.test.ts` |
| **W3** — records and documents | The ADR (§9); `environments-and-resources.md` gains *The SMTP mail variables*; the parent plan's risk rows and launch-gate line (§7); privacy-draft processor lines (§7), marked draft | docs only | W2 | **Coordinator-only**, plus the owner's reading of the privacy lines | This plan §6, §7, §9; ADR 0164; ADR 0172 Amendment E; `docs/best-practices/documentation.md`; `privacy-notice-draft.md` lines named in §7 |
| *Owner* | §5 setup; §6.1 steps 3–5 | — | W2 for step 3 | — | §5, §6, §8 |
| **W4** — retirement (gated on the owner's ruling) | §6.4 | `mail-configuration.ts`, `select-mail-sender.ts`, both factories, Gmail adapter deleted | Production cutover evidence | **Full + security** | Planned when ruled; ADR 0152 for the deletions |

**QA reading (W1, W2):** the slice's Reading cell, plus `tests/lib/server/mail/mail-test-support.ts`,
`mail-network-guard.test.ts`, `qa-8n-header-injection.adversarial.test.ts`, `qa-8j-environment.adversarial.test.ts`,
and the `javascript-testing-expert` guidance on `fast-check` for the property criteria.
**Logic reviewer reading:** the slice's Reading cell and this plan §4.2 (rows S1–S6) and §4.4.
**Clean-code reviewer reading:** the slice's diff, `docs/best-practices/engineering-conventions.md`, and §4.5.
**Security reviewer reading:** the slice's Reading cell, ADR 0146, ADR 0164 d4 and d5, the OWASP guidance on secrets
in configuration and on e-mail header injection (cited by section), and §4.4 of this plan.

## 11. Acceptance criteria

### W1 — the SMTP adapter, unwired

1. **Gmail is unchanged, provably.** Every file under `apps/web/tests/lib/server/mail/` that exists at W1's base commit
   is **unedited** (`git diff --stat <base> -- <those paths>` prints only the two allowed widenings, run with
   `rtk proxy`), and all of them pass. For every Gmail configuration, `buildGmailTransportOptions` deep-equals its value
   at the base commit. `GMAIL_SMTP_HOST` stays in `gmail-mail-sender.ts`.
   **Allowed widenings, and the rule for them:** three list widenings, plus the growth of one `isAllowed`.
   (i) The census patterns in `mail-network-guard.test.ts` and `qa-8n-no-network-and-scans.adversarial.test.ts` grow to
   match `smtp-mail-sender`, `smtp-transport` and `create-customer-mail-sender`, each with a control sample.
   (ii) `smtp-mail-sender.ts` and `smtp-transport.ts` join the no-log / no-env "other mail modules" list in
   `create-mail-sender.test.ts`. (iii) The same two join `SENDING_MODULES` in `lead-notice-preview.test.ts`.
   (iv) The `isAllowed` of the naming rule *the mail library* in `create-mail-sender.test.ts` also allows
   `smtp-mail-sender.ts` (§3), with a control sample proving other files are still refused. A name list, pattern or
   `isAllowed` may **grow**; no assertion may be removed, loosened or skipped. A reviewer checks every edited line of an
   existing test against that rule.
   **The base was already red.** At W1's base commit five existing tests were already red for reasons unrelated
   to W1, from L7 and L5 [doc: the W1 dispatch; not re-run at the base]: the `create-mail-sender.test.ts` naming rules for `create-customer-mail-sender`, the
   `qa-8n-no-network-and-scans` lines that name `limit-policy`, `judge-account-request` and `sign-in`, and the
   `qa-8j` proxy case that asks for `recipient`. They belong to the tests-owed round, not to W1; "all of them pass" in
   this criterion means no test W1 touches or could affect regresses, and W1 does not edit those five.
2. **465 means implicit TLS, 587 means STARTTLS and nothing weaker.** For port 465 the options hold `secure: true` and
   no `requireTLS`. For port 587 they hold `secure: false` and `requireTLS: true`.
   *Property (fast-check over arbitrary settings objects, extra members included):* the built options **never** hold
   `tls`, `ignoreTLS`, `opportunisticTLS`, `service`, `url`, `proxy`, `name`, `authMethod`,
   `requireTLSExtensionEnabled` or `envelope`, and hold exactly the keys named in §4.4.
3. **A port that is not 465 or 587** (25, 2525, `"465"` as a string, 0, NaN), forced past the types, is refused unsent:
   `refused`, no transport is made, and the injected transport maker is never called.
4. **One recipient.** The shop sender's `to` is the configured notification address and nothing else. The customer
   sender's `to` is the message's recipient and never the notification address. Neither is ever a list. A shop message
   with a `recipient` member is refused unsent (`sendableCopyOf`, unchanged).
5. **Exactly the fields on the wire.** The message options' keys are exactly `from, to, subject, text, messageId`, plus
   `html` when the message has one. `from` is the configured From address, bare. `messageId`'s domain is the From's ASCII
   domain, its local part is the SHA-256 hex of the key, and the key's text appears nowhere in the options.
6. **Same bound and same answers.** A transport that never settles answers `timed-out` within
   `MAIL_REQUEST_TIMEOUT_MS`. `close()` runs on every path. `send` never rejects, whatever the transport throws or
   resolves (the existing `smtp-answer` table, unchanged).
7. **Nothing leaks.** The adapter calls no `console` method. No error it builds, and no outcome it returns, contains the
   host, the user, the password, or any address. Mutant check: plant a marker value in each setting and assert that it
   is absent from every outcome and every thrown message.
8. **No network.** The mail network guard stays green: no W1 test opens a socket.
9. **Not wired.** Nothing outside `mail/` imports `smtp-mail-sender.ts` after W1 (grep, run with `rtk proxy`).

### W2 — configuration, selection, factories, harness

1. **Rows S1–S6 hold**, each as a named test, including these boundaries: `MAIL_TRANSPORT` empty, `SMTP`, ` smtp`,
   `smtp ` and `gmail` (S4); each one of the six missing in turn and each unusable in turn (S5, with exactly those names
   reported); a complete SMTP set beside usable, unusable and absent Gmail names (S6).
2. **Today, unchanged, as a property.** For any environment with no `MAIL_TRANSPORT` **and no fake flag**,
   `selectMailSender` returns the same value as at W1's base commit, whatever `MAIL_SMTP_*` names it holds (fast-check
   over presence and usability of the eleven names; the base behaviour is restated as an oracle in the test). With the
   flag set, the oracle is the base behaviour **except row S2**: the flag beside `MAIL_TRANSPORT` or any `MAIL_SMTP_*`
   name is `unavailable`, where the base, which knew none of them, answered `fake`.
3. **One selection, two factories.** *Property:* for every environment, `createMailSender` and
   `createCustomerMailSender` build the sender kind the selector names (`fake`, Gmail, SMTP) or return exactly the
   selector's `unavailable` names. Hence `selectMailSender(env).kind !== "unavailable"` (what `isContactSendable` asks)
   holds exactly when `createCustomerMailSender(env).kind === "sender"` (what `prepareAccountMail` asks), for every
   environment.
4. **No silent fallback.** No environment with `MAIL_TRANSPORT=smtp` ever builds the Gmail adapter (spy on both
   transport makers).
5. **No value in any answer.** For every environment, the `unavailable` answer holds names only. Marker values planted
   in all eleven names never appear in a selection, a creation, or a log line.
6. **The fake stays a test instrument.** The flag beside `MAIL_TRANSPORT` or beside any one `MAIL_SMTP_*` name is
   `unavailable` (S2). `MAIL_VARIABLES_THE_SUITE_REFUSES` equals the Gmail, retired, SMTP and opt-in names, no fewer and
   no more (`fake-mail-environment.test.ts`, whose equality is the one existing test W2 edits, and only to widen it).
   `production-policy-server.ts` withholds them through its existing spread, unedited.
7. **Existing tests are unedited except two widenings**, under W1 criterion 1's rule (lists grow, no assertion
   weakens): `fake-mail-environment.test.ts` (criterion 6), and `qa-8j-environment.adversarial.test.ts`'s `SIX_NAMES`,
   which grows to the twelve names the three functions may now ask (the eleven plus the flag), with its title and its
   "never another variable" assertion kept. Its exhaustive case count (`VARIABLE_STATES ** MAIL_VARIABLE_NAMES.length`)
   is unchanged, because `MAIL_VARIABLE_NAMES` is unchanged.
8. **Gates.** `pnpm check`, and `pnpm ci:local` before any push, run by the coordinator and quoted. The whole e2e suite
   stays green with the fake.

### W3 — records and documents

1. The ADR exists with the next free number on both branches, and lists what it amends and keeps (§9).
2. `environments-and-resources.md` names the six variables, their rules, *add-only*, *the owner's*, and the rollback
   caveat of §6.3, and **no value**.
3. The parent plan's two risk rows say *transformed* (§7), and the new launch-gate line is in its M9 list.
4. The privacy draft's seven lines (§7) name the provider as `[DOMAIN PROVIDER]`, a placeholder, and stay marked draft.

### Owner cutover (evidence, not code)

1. Preview: the §6.1 step-4 headers are quoted in a close-out, all three authentication results `pass`, with
   `d=lemnaria.md`.
2. A reply and a bounce reach the From mailbox.
3. Production is cut over only on the owner's ruling, after (1) and (2).

## 12. Risks

| # | Risk | Effect | Mitigation |
| --- | --- | --- | --- |
| R1 | The provider has no DKIM, or blocks cloud IPs (Q9, Q10) | Mail in spam, or no mail at all | Asked before Preview cutover. The Preview send proves it. Gmail keeps running until then |
| R2 | The W1 refactor changes Gmail's behaviour | Live lead notices break during development | W1 criterion 1: the Gmail tests are unedited and pass, and the transport options deep-equal the base |
| R3 | A typo in one SMTP value at cutover | Mail `unavailable` in that environment | S5 fails closed and visibly. Rollback is one non-secret name (§6.3). Preview goes first |
| R4 | Account mail starves lead notices under the provider's shared limit | A lead notice refused or delayed | Owner's choice: a global ceiling, or separate credentials (Q13). Recorded, not built |
| R5 | The provider's quota reply differs from `550 5.4.5` | A cap read as `busy` and retried, or as `refused` | Recorded limit. The table changes only once Q8's codes are quoted |
| R6 | Two SPF records, or an SPF record at the wrong DNS host (Q4) | SPF fails for all mail on the domain | §5.3 "exactly one". Checked in the Preview headers |
| R7 | Gmail carries real users' data before cutover | No Art. 28 contract (privacy draft BLOCKING) | The new launch-gate line (§7) |
| R8 | The ADR 0169 number clash between the two worktrees (resolved: accounts ADR is now 0172) | A broken link or a mis-cited decision after the merge | §9. Resolved at the merge, before the new ADR is numbered |

## 13. Verification method

- **W1, W2:** unit and property tests with injected transport makers and `jsonTransport` / `streamTransport` for MIME,
  under the existing network guard. No test opens a socket, so TLS on the wire is proven only by the option-shape
  criteria and the owner's Preview headers. Adversarial QA writes its own tests before review (QA gates review).
  Sabotage in both directions (`docs/WORKFLOW.md` R6): drop `requireTLS` and add a `tls` override, and see W1
  criterion 2 fail; make the factory re-read Gmail under `smtp`, and see W2 criteria 3–4 fail.
- **Every claim in a close-out** carries its tier. A command's result is quoted only from a run the reporter made
  (AGENTS rule 2).
- **Cutover:** the owner's quoted headers (§6.1 step 4). No agent sets, reads or prints a variable's value.
