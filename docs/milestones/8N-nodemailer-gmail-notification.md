# M8 wave 8N (proposed id 8J2): the shop's notice leaves through Gmail SMTP by nodemailer

> **STATUS, 2026-10-17 (scribe): BUILT AND REVIEWED; documentation closed. The wave id is 8J2** (renamed per the note
> below; this file keeps its path, and `8N` stays the M8B profile reservation). Commits on `m8-mail-and-empty-space-merge`
> [subjects read from the reflog]: plan `49737d9c`, S1 `b51899a6`, S2 + QA `fb15fa08`, S3 + QA `0da63d6a` (its subject:
> *"whole e2e 1050 passed"*), review fix-up `58ab3695`. [ADR 0164](../decisions/0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md)
> is **Accepted**, with Amendment A from wave 8V. *For the scribe, at the close* is done: dated notes on ADR 0001,
> 0153, 0154, 0157; `environments-and-resources.md`; `M9-delivery-preparation.md`; `decisions/README.md`;
> `SUPERSESSIONS.md`; backlog 160 closed; STATUS. **Open:** Q61–Q63 (defaults built, not recorded as answered); the
> owner-side steps below, including the one real send from Preview. **The milestone (M8) is not done.**
>
> **Earlier status, kept:** **PLANNED by the architect, 2026-10-16. Not dispatched. No code exists for this wave.** The decision
> record is [ADR 0164](../decisions/0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md),
> **Proposed**.
>
> **The wave id collides.** `8N` is still a reserved name. [`M8B-customer-profiles.md:22`](M8B-customer-profiles.md)
> says: *"Wave names 8N and 8P1–8P9 are kept so the M8 plan's references still resolve"* [doc], and 8N appears there
> and in the M8 plan as the profiles design record. This file sits at the path the dispatch named. **The architect
> recommends the id `8J2`.** It is a follow-on of 8J, the mail wave, in the pattern of 8K2, 8M2 and 8Q2, and no
> document uses it today [ran: `grep -rlw 8J2 docs/milestones docs/STATUS.md docs/BACKLOG.md docs/decisions`, 0 files].
> Renaming the file is the coordinator's call. Until then this plan writes **8N** and means only this wave.
>
> **For the scribe, not done here:** the M8 plan's wave table gets a pointer row to this file. `docs/STATUS.md`'s
> *What to do next* names the wave. `decisions/README.md` lists ADR 0164 as Proposed. The dated notes listed under
> *For the scribe, at the close* are owed at the close and not before, because writing them now would present a plan
> as landed. The architect touched only this file and the ADR draft.

Evidence tiers:

- **[doc]** quoted from a record in this repository, with `file:line`.
- **[src]** read at `HEAD` `ccb0cd5e`, with `file:line`.
- **[tarball]** read in the published `nodemailer@10.1.1` package. The architect unpacked `npm pack` into the session
  scratchpad: this is not the installed `node_modules`, and S1 re-verifies every [tarball] line against the
  installed copy.
- **[ran]** a command the architect ran, quoted.
- **[owner]** the owner's words or decision, as the coordinator relayed them.
- **[inf]** the architect's inference, with what would falsify it.

**How these map to the brief's three tiers:**

- [doc] is *doc-quoted*.
- [src] and [tarball] are *source-verified*. [tarball] is the weaker of the two, because it is not the installed
  copy.
- [inf] is *inference*.
- [ran] and [owner] are the evidence they name.

**Nothing was run except** `npm view`, `npm pack` and reads: no gate, no test, no server, no database. No
environment value was read or printed. Only the variable *names* in the two `.env.local` files were listed [ran:
`grep -oE '^…[A-Za-z_][A-Za-z0-9_]*='`, names only].

## The owner's decisions this wave builds

- **2026-10-15:** replace the notification mail provider with nodemailer through Google (Gmail) SMTP, reading
  `GOOGLE_EMAIL` and `GOOGLE_APP_PASSWORD` [owner]. Both names exist in the **repo-root** `.env.local` [ran: names
  only: `DATABASE_URL`, `VERCEL_OIDC_TOKEN`, `GOOGLE_APP_PASSWORD`, `GOOGLE_EMAIL`]. `apps/web/.env.local` holds only
  `DATABASE_URL` [ran, names only].
- **2026-10-16:** the shop's receiving address is the value of `LEAD_NOTIFICATION_ADDRESS`. It stays a variable and is
  never hard-coded in source, tests or documentation examples. The value is written **only** in *Owner-side steps*
  below. The rule *exactly one address, never a customer's* is kept [owner].

## Goal

The notice that ADR 0154 built and 8K wired leaves through Gmail SMTP instead of Resend. The decisions, the
configuration and the e2e harness change with it. **Nothing the customer sees changes**: the same answers, the same
5A and 5B, the same stored row and the same `notified_at`.

## Scope

**In:**

- The dependency `nodemailer`, pinned exactly, in `apps/web` only.
- A new Gmail adapter behind the existing `MailSender` port, with its SMTP answer mapping in a module of its own.
- The configuration reader's three names and its shape.
- The selection's refusal set for the fake.
- The factory's switch. The Resend adapter is deleted.
- The e2e harness, so that a local file holding mail names can never give a test server a real sender.
- The contact route pinned to the Node runtime.
- `.env.example`.

**Out, and must not change:**

- The port `mail-sender.ts`: `MailMessage`, `MailOutcome`, `MAIL_FAILURE_KINDS`, `isSendableMailMessage`,
  `sendableCopyOf`, `isRetryableMailFailure`, and the retry table. All are byte-identical at the close.
- The notice `lead-notification.ts`.
- `deliver-notice.ts`, `submit-contact.ts`, `contact-log.ts`, `contact-availability.ts`,
  `contact-production-ports.ts`.
- The persistence package, migrations and grants.
- Every page and every message catalogue.
- The client: `send-contact-request.ts`, `use-contact-submission.ts`.
- The fake `fake-mail-sender.ts`.

**Not in this wave:**

- A Reply-To (Q61).
- Any mail to a customer.
- A pooled or long-lived transport.
- A real send by any agent.
- DNS, SPF, DKIM and DMARC (M9).
- The privacy text naming the processor (M9's Q7 and Q13; see *Risks*).

## What the code has today [src at `ccb0cd5e`]

**The port**
- One message is `{ key, subject, text }` and nothing else. It has *"no recipient, no sender and no markup"*
  (`apps/web/src/lib/server/mail/mail-sender.ts:3-13`).
- Seven failure kinds (`:17-25`).
- A send *"answers with a value and never rejects"* (`:37-40`).
- The sendable predicate refuses a subject holding `\p{Cc}\p{Zl}\p{Zp}` (`:57`, `:64-76`).
- The retry classes (`:98-111`).

**The configuration**
- `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `LEAD_NOTIFICATION_ADDRESS` (`mail-configuration.ts:7-15`).
- The address rule allows exactly one `@` and no whitespace, `,;<>` or `\p{C}` (`:33-35`).
- The key rule is visible ASCII (`:37-41`).
- Only own members are read (`:81-87`).

**The selection**
- The fake is chosen only when the flag is exactly `1` and no mail name is present. Beside any mail name the flag
  answers `unavailable` (`select-mail-sender.ts:11-14`, `:30-46`).

**The factory**
- `create-mail-sender.ts` is the only importer of the fake and of the adapter, and the module's one log line is the
  fake's warning (`:16`, `:31-55`).
- It is called per request through `createSender: () => createMailSender(process.env)`
  (`contact-production-ports.ts:29`). The sender is made once per request, before the lookup
  (`submit-contact.ts:272-276`).

**The adapter**
- `resend-mail-sender.ts` makes one `fetch` POST under one bound, `MAIL_REQUEST_TIMEOUT_MS = 10_000` (`:24`).
- The `Idempotency-Key` header carries the message key (`:74`).

**The notice**
- The subject holds the reference and nothing the customer wrote (`lead-notification.ts:81-92`).
- The customer lines are reference, locale, name, phone normal form, locality, channel, and the e-mail only with the
  e-mail channel (`:106-120`, `:146-153`). **There is no notes field.**
- Every line is refused if it holds a line-breaking character (`:273-276`).

**Delivery**
- On a failure the outward answer follows `isRetryableMailFailure` (`deliver-notice.ts:114-131`).
- After an accepted send, `markNotified` runs. A failed mark is still a success, with a line (`:101-112`).
- Whether to send is decided on `isNotified` (`submit-contact.ts:200-218`).

**The client**
- `send-contact-request.ts:9-10`: *"It has no abort and no timer."*

**The route**
- `app/api/contact-submissions/route.ts` exports no `runtime`.
- The two cron routes do: `export const runtime = "nodejs"` (`api/cron/prune-rate-limits/route.ts:11-12`,
  `api/cron/backup-designs/route.ts:7-8`).

**The e2e harness**
- `playwright.config.ts:25` calls `loadEnvLocal()`, then `:29` calls `requireNoMailVariable(process.env)`.
- `loadEnvLocal` reads `.env.test.local`, `.env.migration.local` and the **repo-root** `.env.local` into
  `process.env` (`packages/persistence/src/load-env.ts:13`, `:37-45`).
- Playwright 1.62.1 starts the web server with `{ ...process.env, ...config.env }`
  (`node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/lib/runner/index.js:858-862`) [src].
- The second, production-policy server inherits `process.env` minus `NOT_INHERITED`, which names no mail variable
  (`tests/e2e/support/production-policy-server.ts:62-67`, `:188-192`).
- The suite's refusal list is the three current names (`tests/e2e/support/fake-mail-environment.ts:13-17`). A test
  holds it equal to the server's `MAIL_VARIABLE_NAMES` (`fake-mail-environment.test.ts:38-43`).

## Decision-record sweep

| Record | What it says | How this wave settles it |
| --- | --- | --- |
| ADR 0001 d7 | A provider-neutral server API | **Kept.** No provider name enters the port, the fake, the kinds or the notice. One adapter file holds Gmail (ADR 0154 d11) |
| ADR 0154 d1 | The port and seven kinds, final | **Kept.** The kinds and the retry table are unchanged. The Gmail adapter never produces `payload-mismatch` (8N.5) |
| ADR 0154 d2 | Resend over `fetch`, *"no SDK, no dependency"*. *Must not:* `reply_to`, `html`, `cc`, `bcc`, `headers`, `attachments` | **Superseded for the transport by ADR 0164:** one dependency, nodemailer. **Its must-not list is kept and carried over to SMTP** (8N.4) |
| ADR 0154 d3 | The Resend answer table | **Superseded** by the SMTP answer table (8N.5) |
| ADR 0154 d4 | *"A retry inside a day cannot send a second message even if marking the row notified failed"* (`:89-91`) | **No longer true; superseded by ADR 0164 d4.** SMTP has no idempotency key. The stored mark is the only guard (8N.6) |
| ADR 0154 d6 | The three names; *usable* | **Amended:** the names are `GOOGLE_EMAIL`, `GOOGLE_APP_PASSWORD`, `LEAD_NOTIFICATION_ADDRESS`, with the same usability rules (8N.2) |
| ADR 0154 d7 | The fake only by the flag, with no mail name present | **Kept, and widened.** The two retired names stay in the refusal set (8N.3) |
| ADR 0154 d9 | What leaves to the third party | **Amended:** the third party is Google. The client request id no longer leaves in a header, only its digest in `Message-ID` (8N.4) |
| ADR 0154 J-S1.6 and *Alternatives* (`:224-225`) | *"weakening the rule so a developer's `.env.local` with a mail name passes the contact specs"* is not taken | **The server's rule is kept unweakened.** The harness change of 8N.7 concerns the repo-root file, which `loadEnvLocal` copies into the runner. It hands mail names to no server, which is stronger than J-S1.6. `apps/web/.env.local` still fails loudly, by design. ADR 0164 d7 records the distinction |
| ADR 0153 R6 (`:189-193`) | Whoever clears `notified_at` *"can notify the shop twice once the provider's day-long key has lapsed"* | **Amended:** there is no provider key, so a cleared mark re-notifies at once (8N.6) |
| ADR 0157 (`:93`) | *"The free quota is 100 messages a day"* (Resend), and a stored request never notified is invisible to the shop | **Amended:** the quota is Gmail's (8N.8). The invisibility limit stands |
| ADR 0160, 0163 | 5B and the already-sent page | **Untouched.** Their inputs are the route's answers, which do not change |
| ADR 0146 B2 | Nothing copied from a connection value or a driver leaves | **Applied to nodemailer:** no `message`, `response`, `command` or `stack` of its errors is kept (8N.5) |
| ADR 0152 | A test is deleted only on evidence | **Applied to the Resend tests** (S2 item 3) |

## Rulings (8N.1 to 8N.10)

### 8N.1 — The port keeps its interface. Only the transport changes

`mail-sender.ts` is not edited. The new `gmail-mail-sender.ts` exports `createGmailMailSender(configuration,
makeTransport?)`, which returns `MailSender`. `send` reads the message only through `sendableCopyOf` and answers
`MAIL_REFUSED_UNSENT` for a message that may not be sent, before any transport exists. That is the Resend adapter's
order (`resend-mail-sender.ts:103-120`) [src].

`MAIL_REQUEST_TIMEOUT_MS` moves into the new adapter, unchanged at `10_000`, because the Resend file is deleted.
*Not taken:* widening `MailMessage` with a reply-to, a recipient or `html`, because each widens the port under its own
review (ADR 0154, *What later waves inherit*) [doc].

### 8N.2 — The configuration: three names, all or nothing

`MAIL_VARIABLE_NAMES` becomes `GOOGLE_EMAIL`, `GOOGLE_APP_PASSWORD` and `LEAD_NOTIFICATION_ADDRESS`. `MailConfiguration`
becomes `{ senderAddress, appPassword, notificationAddress }`. It is internal to `lib/server/mail` and is not the
port. The two addresses take today's address rule (`mail-configuration.ts:35`). The app password takes today's key
rule, visible ASCII with no space (`VISIBLE_ASCII_KEY`).

- **All or nothing, as today.** If any name is missing or unusable, the answer is `unavailable`, naming only the
  missing or unusable names and never a value.
- **The app password is refused with a space in it.** Google displays the 16-character code in four groups of four
  [inf: recalled vendor UI; falsified if the owner's copy has no spaces]. A pasted value with spaces reads
  *unavailable* and names `GOOGLE_APP_PASSWORD`. The owner step says to paste it without spaces. *Not taken:* stripping
  the spaces, because a reader that edits a secret it then sends is a second rule about the secret. *Not taken:* a
  16-letter shape rule, because Google's format is not a documented contract [inf].
- **`LEAD_NOTIFICATION_ADDRESS` stays a separate variable.** *Not taken:* sending to `GOOGLE_EMAIL` itself. The sender
  should be a dedicated account (Q62), and the shop's inbox is the owner's to move without touching the credential.
- **`RESEND_API_KEY` and `MAIL_FROM_ADDRESS` are no longer read for configuration.** Nothing deletes them from any
  environment (add-only, `environments-and-resources.md:6-11`) [doc].

### 8N.3 — Selection: the fake's refusal set keeps the retired names

`RETIRED_MAIL_VARIABLE_NAMES = ["RESEND_API_KEY", "MAIL_FROM_ADDRESS"]` is exported beside `MAIL_VARIABLE_NAMES`.
`hasAnyMailVariable` reads the union of the two lists.

**Why:** variables are add-only, so a retired name may live on in some environment indefinitely, and the flag beside
any name that ever meant mail stays a misconfiguration. It costs nothing. *Not taken:* dropping them, which makes a
deployment holding only a Resend key and the flag select the fake.

The `unavailable` answer for a missing configuration still names only the three live names.

### 8N.4 — The message on the wire: from, to, subject, text, Message-ID, and nothing else

`buildGmailMessage(copy, configuration)` is pure and builds the nodemailer options **from named members, never by
spreading** (ADR 0154 d2's rule):

- `from`: `configuration.senderAddress`, bare. Gmail rewrites a `From` that is not the authenticated account or a
  verified alias [inf: recalled vendor behaviour; falsified by the owner's real send showing another From].
  `MAIL_FROM_ADDRESS` is therefore gone.
- `to`: `configuration.notificationAddress`, the one address.
- `subject`: `copy.subject`. `text`: `copy.text`.
- `messageId`: `<{sha256-hex(copy.key)}@{domain of senderAddress}>`.
  - **Why a digest:** the port's key is any visible ASCII (`mail-sender.ts:53`). `<`, `>`, `@` and quotes would
    break a `msg-id`, and the digest keeps the client request id out of every header. Resend saw it in
    `Idempotency-Key` (ADR 0154 d9).
  - **Why deterministic:** a retry carries the same `Message-ID`. Mail stores may collapse duplicates on it [inf:
    widely reported for Gmail, not a documented contract; nothing in this wave relies on it].

**Must not appear in the options or on the wire:** `replyTo`, `html`, `cc`, `bcc`, `headers`, `attachments`,
`alternatives`, `envelope`, `list`, `amp`, `icalEvent`, `dkim`, a display name, or any customer value in any header.
**Plain text only.**

**Injection.** Customer text reaches only body lines, one value per line, and the notice throws on any
`\p{Cc}\p{Zl}\p{Zp}` (`lead-notification.ts:273-276`) [src]. The subject is constant text plus the reference
(`:89-92`), and the port refuses a subject that breaks a line (`mail-sender.ts:72`) [src]. Two nodemailer behaviours
sit beneath these rules as a second layer, and nothing in this wave relies on them:

- It folds CR/LF in header values to spaces (`mime-node/index.js:1227`, `:1307`, `:1341-1348`) [tarball].
- It dot-stuffs the body and guards against SMTP smuggling (`smtp-connection/data-stream.js:10`, `:46-54`) [tarball].

### 8N.5 — The transport: Node, lazy, implicit TLS, bounded, silent, unpooled

**`buildGmailTransportOptions(configuration)` is pure** and answers exactly:

- `host: "smtp.gmail.com"`, `port: 465`, `secure: true`. Implicit TLS. nodemailer defaults `secure` to true on 465
  (`smtp-connection/index.js:162-163`) [tarball], and the options set it explicitly anyway.
- `auth: { user: senderAddress, pass: appPassword }`.
- `pool: false`.
- `logger: false`, `debug: false`. The default logger is a no-op (`shared/index.js:410-420`) [tarball]. Debug output
  would carry the SMTP dialogue, the AUTH exchange included [inf]. Both are stated so a later edit is a visible diff.
- `disableFileAccess: true`, `disableUrlAccess: true`.
- Four timeouts, named constants, each **strictly below** `MAIL_REQUEST_TIMEOUT_MS`. The architect's figures:
  `dnsTimeout 2_000`, `connectionTimeout 4_000` (it covers DNS, TCP and TLS:
  `smtp-connection/index.js:239-247` [tarball]), `greetingTimeout 3_000` (cut by what is left of the connection:
  `:423-429` [tarball]), and `socketTimeout 6_000`.
  - nodemailer's defaults are 2 min, 10 min, 30 s and 30 s (`:50-53`) [tarball], which is why none may be left
    unset.
  - **A value of `0` falls back to the default** (`|| CONNECTION_TIMEOUT`, `:240`) [tarball], so each constant must
    be a positive integer.
- No `tls` override, so certificate verification stays on.
- No `service: "gmail"`: the host and port are named.

**Per send:**

1. The transport is made inside `send` (lazily, one per send, never at module level).
2. `sendMail` races the 10 s bound.
3. `transport.close()` runs in `finally`.
4. Every throw maps to a kind.

**Node only.** The contact route gains `export const runtime = "nodejs"`, following the cron routes' precedent.
`runtime.md:18-23` says nodejs is the default and Edge is deprecated [doc,
`apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`].
The pin turns *never Edge* into an assertion a test can make. *Not taken:* relying on the default, because a default
is not an invariant.

**The route's deadline.** The route and the client set no deadline of their own [src, above]. The send's bound,
10 s, stays the one deadline the customer waits under (ADR 0154 d2). The platform's function ceiling is not read here
[inf: a deployment ceiling below about 12 s would cut the bound; falsified by `maxDuration` being set or by the
platform's documented default].

**The answer table.** It is a new module, `smtp-answer.ts`, whose input is a thrown value or a `sendMail` result. It
discharges ADR 0154's JC-R1.8 trigger (*"a second adapter"*) and backlog 160. **It reads only `code` (a string
compared with constants) and `responseCode` (a number). It never reads `message`, `response`, `command`, `stack` or
`cause` beyond one comparison, and copies none of them.**

| What came back | Kind | Warrant |
| --- | --- | --- |
| `sendMail` resolved, `accepted` is an array of **exactly one** entry, `rejected` is empty | *accepted* | [tarball: `smtp-connection/index.js:1832`, `:1932`: `accepted` holds the envelope's recipients as nodemailer parsed them from `to` (`smtp-transport/index.js:184-186`), which may normalise the text, for example an A-label domain (CHANGELOG 10.1.0, *"decode an SMTPUTF8 domain from its A-label form"*). So **byte-equality with the configured string is not required.** That no other recipient exists is held by construction and by criterion 5's envelope property] |
| `sendMail` resolved otherwise | *unreadable answer* (status = `responseCode` if one is present) | [inf] |
| `code` `EAUTH`, `ENOAUTH`, `EENVELOPE`, `ECONFIG`, `EFILEACCESS`, `EURLACCESS`, `EREQUIRETLS` | *refused* | [tarball: `errors.js:19-46`]; [inf: the class] |
| `responseCode` 4xx (421, 450, 451, 452, 454 …) | *busy* | [tarball: `errors.js:74`, `isTransientError` counts 421]; [inf] |
| `responseCode` 550 and `response` matching `/^550[ -]5\.4\.5\b/` (a multi-line reply uses `-`; compared, never copied) | *quota spent* | [inf: Gmail's daily-limit reply recalled as `550 5.4.5`; unproven until a real refusal is seen] |
| any other `responseCode` 5xx | *refused* | [inf] |
| `code` `ETIMEDOUT`, or our bound passes | *timed out* | [tarball: `errors.js:20`] |
| `code` `ECONNECTION`, `ESOCKET`, `EDNS`, `ETLS`, `EPROXY`; or any other throw | *unreachable* | [tarball: `errors.js:19-24`, `:43`]; [inf] |
| `EPROTOCOL` | *unreadable answer* | [tarball: `errors.js:27`] |
| (never) | *payload mismatch* | SMTP has no idempotent replay to mismatch |

**Precedence:** a usable `responseCode` (an integer from 200 to 599) decides before `code`. `status` is kept only
when it is that integer, as today (`resend-mail-sender.ts:191-197`) [src], and it is logged as `providerStatus`
(`contact-log.ts:191-197`) [src].

### 8N.6 — Sending fails: the 5B path, the stored row and `notified_at` are unchanged, and a second notice is possible

**Unchanged** [src: `deliver-notice.ts:91-131`, `submit-contact.ts:200-218`]:

- A failed send answers the same two outward codes by the unchanged retry table.
- The request stays stored.
- `notified_at` is set only after an accepted send.
- A failed mark after acceptance is still a success, with its line.
- A retry of a notified row is answered *sent* without a send.

**What changes, recorded and not fixed (ADR 0118's form):**

- **ADR 0154 d4's guarantee is gone.** It was *a retry inside a day cannot send a second message even if the mark
  failed*. Two cases now notify the shop twice:
  - an accepted send whose mark fails, then a retry;
  - an ambiguous failure: a timeout or a dropped socket after the server took the message, then a retry.
- The stored mark is the only guard.
- **The accepted direction is the duplicate.** A lost lead costs more than a second notice with the same reference
  [inf; Q63 if the owner disagrees].
- *Not taken:* treating *timed out* or *unreachable* as not retryable. That changes the port's table, and it would turn
  every transient fault into a request the shop never hears of.

### 8N.7 — Tests never send. The e2e harness withholds every mail name from every server and worker

**Unit tests.**
- The adapter's `makeTransport` is injected. Every adapter test hands a fake transport, an object with `sendMail` and
  `close`, that records calls and answers what it is scripted to.
- MIME and envelope checks use nodemailer's own `streamTransport` (`buffer: true`) or `jsonTransport`
  (`nodemailer.js:86-90`) [tarball], so the real composer runs and no socket opens.
- **No test constructs the adapter with the default `makeTransport`**, except one identity assertion that does not
  call `send`.
- A network guard fails any mail test that reaches `net.connect`, `tls.connect` or `node:dns` lookups.
- The web Vitest config loads no env file [src: `apps/web/vitest.config.ts`, no loader].

**e2e.**
- `LEMNARIA_E2E_FAKE_MAIL` and the fake are unchanged.
- **New:** right after `loadEnvLocal()`, `playwright.config.ts` removes every mail name (the three live and the two
  retired) from its own `process.env`. It prints one line naming what it withheld, names only, and only if any.
- `requireNoMailVariable` stays, now as the proof that the withholding ran.
- `production-policy-server.ts`'s `NOT_INHERITED` gains the five names and the flag.
- **Why:** the repo-root `.env.local` already holds `GOOGLE_EMAIL` and `GOOGLE_APP_PASSWORD` [ran, names only], and
  `loadEnvLocal` copies it into the runner [src].
  - Without the withholding, the moment the refusal list names them, `pnpm test:e2e` throws at config load on the
    owner's machine. So does `pnpm ci:local`, which runs it (`scripts/local-ci.sh:143`) [src], and with it the
    pre-push hook.
  - Worse, a production-policy server under `CI=1` would inherit a real Gmail sender. No such spec sends a contact
    request today [src: `contact-unavailable.e2e.spec.ts:65-100` only renders], and that is luck, not a rule.
- **This is not the removal of an environment variable** in the add-only sense: no file and no deployment is touched.
  Only the test runner's in-memory copy changes.
- **`apps/web/.env.local` is out of reach.** Next itself loads it into the local `next dev` server
  (`environments-and-resources.md:58-60`) [doc]. A mail name there still makes the server refuse the flag, and the
  contact specs still fail loudly (ADR 0154 J-S1.6, kept) [doc]. The owner step forbids mail names in that file.

### 8N.8 — Gmail's limits, and what the request does when they are reached

- **The figure.** About 500 recipients a day for a consumer account [owner-brief figure; inf until Google's
  *"Gmail sending limits"* page is fetched and quoted].
  - The application's own limits bound one network to 10 new requests a day and one e-mail to 3 (ADR 0157 d6) [doc].
  - Nothing bounds the world: a spread of networks can spend the day. That is the class ADR 0157 already records for
    Resend's 100 [doc, `0157:93`].
- **When the limit is reached:**
  - The reply maps to *quota spent*, which is not retried automatically (`mail-sender.ts:97`) [src].
  - The customer sees 5B.
  - The row is stored with `notified_at` null and is invisible to the shop until M9's read-back.
- **Sending through a consumer account at volume may get the account suspended** [inf]. This is the second reason
  for a dedicated sending account (Q62).

### 8N.9 — The dependency

**The pin.** `nodemailer`, an **exact** version (no `^` and no `~`), in `apps/web/package.json` `dependencies` only.
It goes in no other package and never in `devDependencies`, because the server imports it at run time.

**The facts at 10.1.1** [ran: `npm view nodemailer`, 2026-10-16]:
- `latest` is `10.1.1`, published 2026-10-14T05:38Z.
- `engines.node >=20.0.0` (the repository requires `>=24 <25`, root `package.json:6-7` [src]).
- License `MIT-0`.
- No `dependencies` key in the metadata.
- It ships `./dist/cjs/nodemailer.d.ts`, so **no `@types/nodemailer` is added**.

**Which version: `10.1.1`, exactly. It is the version this plan read**, and every [tarball] citation is at 10.1.1.

The architect weighed an age floor: the newest release at least seven days old. At this date that is `10.0.16`
(2026-10-07) [ran: `npm view nodemailer time`]. The floor is **not taken**, because the releases it skips carry
behaviour this plan relies on [tarball: `CHANGELOG.md`, the 10.1.0 and 10.1.1 entries]:

- **10.1.0** (2026-10-10):
  - *"smtp-connection: count the wait for the greeting against connectionTimeout"*: the bound reasoning of 8N.5
    (`:423-429`);
  - *"harden message streams, SMTP connections and the connection pool"*;
  - *"end the SMTP session on any 421 reply"*;
  - *"qp: encode a lone CR or LF in binary quoted-printable parts"*;
  - *"do not read the environment or the interface table on import"*.
- **10.1.1** (2026-10-14): *"fetch: strip credentials on any cross-origin redirect"*. Our `disableUrlAccess` keeps the
  fetch path unused, but the fix is a credential fix.

Under 10.0.16 the per-phase timeouts would differ, but **the design would still hold**: the outer 10 s bound governs
every send, and criterion 8 tests it with no reliance on nodemailer's own timers [inf].

**The cost is freshness.** 10.1.1 is two days old at this date, and it holds a mail credential. That is a
supply-chain risk carried to the security reader (risk 7).

*Not taken:*

- `10.0.16` under the floor, because it lacks the hardening above;
- `10.1.0`, because it is not the version read and lacks the 10.1.1 fix.

**If the coordinator prefers a floor**, the alternative is this: dispatch on or after 2026-10-21, when 10.1.1 is
seven days old, with the same pin.

**The gates.**
- `pnpm install` regenerates the one root `pnpm-lock.yaml` (`scripts/gates/lockfile.sh`).
- `pnpm gate:sca` (`pnpm audit --audit-level=high --prod`, root `package.json:21`) [src] must pass and is quoted.
- The installed copy has no install script [ran: `npm view` shows none; S1 re-checks the installed `package.json`].

**Bundling.** nodemailer is not on Next's default server-externals list [src:
`node_modules/next/dist/lib/server-external-packages.jsonc`, no match]. Whether it needs `serverExternalPackages` is
settled by S3's `next build` and its result, not by guessing.

**Where it may be imported.** Only `gmail-mail-sender.ts`. The existing source scan
(`tests/lib/server/mail/create-mail-sender.test.ts:205`, `:237-242`) is re-pointed to hold this, and the factory stays
the only importer of the adapter.

### 8N.10 — Documentation, and who sets what

`.env.example`'s mail block is rewritten. It keeps the two retired names, commented as *no longer read; kept because
variables are add-only*. It contains no value and no address.

The owner's steps are below. The dated notes are the scribe's, at the close.

## Acceptance criteria

Each criterion is falsifiable. *Must not* clauses are part of the criterion.

**The port**

1. **The port is unchanged.** `git diff <base>..HEAD -- apps/web/src/lib/server/mail/mail-sender.ts
   apps/web/src/lib/server/mail/lead-notification.ts apps/web/src/lib/server/mail/fake-mail-sender.ts
   apps/web/src/lib/server/contact/` is empty [checked with `rtk proxy`].

**The configuration**

2. **Configured exactly when all three are usable.** For every assignment of each of the three names to
   {absent, own-member `undefined`, `""`, usable, value with a space, value with a trailing `\n`, two addresses, an
   address with `<>`}, the reader answers `configured` iff all three are usable. Otherwise it answers `unavailable`
   with exactly the unusable names, sorted as `MAIL_VARIABLE_NAMES`. **No value, and no substring of a value of
   length ≥ 4, appears in any answer, thrown message or console call.** This is a property over the full product
   (fast-check), with a floor per arm.
3. **Retired names do not configure.** An environment holding only `RESEND_API_KEY` and `MAIL_FROM_ADDRESS`, plus
   `LEAD_NOTIFICATION_ADDRESS`, is `unavailable` and names `GOOGLE_EMAIL` and `GOOGLE_APP_PASSWORD`.

**The selection**

4. **The fake stays fenced.** With the flag `"1"`, the selection is `fake` iff none of the five names is an own
   member. Beside any one of the five, it is `unavailable` naming only the flag. Every other flag value never selects
   the fake. This is a property over the five names × {absent, present-undefined, present-value}.

**The message**

5. **One recipient, the configured one, and never a customer's.** For every sendable message and every
   configuration, the nodemailer options handed to `sendMail` have exactly the own keys `from`, `to`, `subject`,
   `text`, `messageId`; `to` equals `notificationAddress`; `from` equals `senderAddress`. Composed through
   `streamTransport`, the envelope has exactly one recipient, equal to `notificationAddress`.
   - **The raw message has no `Reply-To`, `Cc`, `Bcc`, `Content-Type: text/html` or attachment part.**
   - **For a contact whose e-mail channel carries an address A, A appears only in the body, never in any header or in
     the envelope.** This is a property over generated contacts.
6. **No header carries customer text or the request id.** Over generated notices, every header of the raw message is
   free of the customer's name, phone, locality, e-mail and `clientRequestId`. `Message-ID` equals
   `<sha256-hex(key)@domain(senderAddress)>` and is identical across two builds of one message.

**The transport**

7. **The transport options are exact.** `buildGmailTransportOptions` answers host `smtp.gmail.com`, port `465`,
   `secure: true`, `pool: false`, `logger: false`, `debug: false`, `disableFileAccess: true`,
   `disableUrlAccess: true`, the four timeouts, and nothing else (no `tls`, no `service`). Each timeout is a positive
   integer strictly below `MAIL_REQUEST_TIMEOUT_MS`.
8. **Bounded.** With a fake transport whose `sendMail` never settles, `send` answers *timed out* within
   `MAIL_REQUEST_TIMEOUT_MS`, measured with fake timers. `close` has been called once. `send` never rejects.
9. **One transport per send, closed every time.** Two sends make two transports. Each is closed once, after its
   `sendMail` settles or the bound passes, whether it resolved, threw or hung. **No transport is made when the
   message is not sendable**, and that answer is `refused` with no status.

**The answer mapping**

10. **Every answer is exactly one kind, and nothing of it survives.** For every thrown value — any `code` string from
    nodemailer's list or random, any `responseCode` in {undefined, 0, 99, 100–599, 600, 1.5, NaN, a string}, any
    `response`, `message` and `command` holding a marker, and also non-object throws and getters that throw — the
    mapping answers one kind from `MAIL_FAILURE_KINDS`, never `payload-mismatch`. Its `status` is present iff
    `responseCode` is an integer from 200 to 599. **Its `JSON.stringify` holds no marker.** This is a property
    test, with a floor per kind row of 8N.5.
11. **Acceptance is strict about count, not about spelling.** A resolved `sendMail` is *accepted* only when
    `accepted` is an array of exactly one entry and `rejected` is an empty array (or absent). Two accepted entries,
    an empty `accepted`, a non-empty `rejected`, a non-array or a throwing getter is *unreadable answer*. **The
    accepted entry is not compared byte-for-byte with `notificationAddress`.** nodemailer records the parsed envelope
    address, which may be normalised (8N.5, the *accepted* row). A strict comparison would turn every real delivery
    into a retryable failure: 5B for the customer and a duplicate for the shop. That no other recipient exists is
    criterion 5's job.
12. **Never retried twice by us.** Each `send` calls `sendMail` at most once.

**Secrets and errors**

13. **No secret anywhere.** With `appPassword` set to a marker, no outcome, thrown error, `console` call (spied, all
    levels) or recorded transport argument other than the options' `auth.pass` contains the marker. The mail module
    keeps exactly one console call, the fake's warning (ADR 0154 d7).

**The route**

14. **The Node runtime.** `route.ts` exports `runtime === "nodejs"`. A source scan finds no `runtime = "edge"`
    anywhere under `apps/web/src/app`.

**Imports**

15. **Import fences.** `nodemailer` is imported only by `gmail-mail-sender.ts`, and the adapter only by
    `create-mail-sender.ts` (source scan, self-checking as today). No `resend` string remains in `apps/web/src`, and
    `RESEND_API_KEY` remains only in the retired list.

**The e2e harness**

16. **The harness withholds, shown by three witnesses.** `loadEnvLocal` resolves the repository root from its own
    module path (`load-env.ts:5-6`, `:39`) [src], so nothing can point it at a scratch file. A server's environment
    also cannot be read from outside it.
    - **(a) The function.** The withholding is a pure, unit-tested function. Over an environment holding all five
      names (with values that are markers) and unrelated names, it leaves none of the five and keeps every other
      name and value. Over an environment holding none, it is a no-op and prints nothing.
      `production-policy-server.ts`'s environment builder is tested the same way.
    - **(b) The server, by behaviour.** If any mail name reached the suite's server, the server would refuse the flag
      (criterion 4) and every contact spec would go red. **Green contact specs with the Google names in the root
      file are the witness.** The run that gives it is (c), or a QA run from a **git worktree**: its root is what
      `loadEnvLocal` resolves, QA writes a root `.env.local` there holding marker values for the five names, and QA
      supplies its own `TEST_DATABASE_URL`. **Never the owner's files.**
    - **(c) The owner's machine:** criterion 20.
    - **Sabotage, in both directions** (R6), on the (b) run:
      - remove the withholding call, and the run fails at config load;
      - move the call above `loadEnvLocal()`, and it also fails at config load;
      - leave the call standing and add an unrelated variable to the root file, and the run stays green.
17. **The suite stays on the fake.** Whole `CI=1` e2e is green, including `contact-unavailable.e2e.spec.ts`, whose
    `NAMES_THAT_MUST_NOT_REACH_A_PAGE` gains the two new names.

**The dependency**

18. **Pinned and audited.** `apps/web/package.json` names `nodemailer` with an exact version, under `dependencies`.
    No other `package.json` names it, and there is no `@types/nodemailer`. There is one root lockfile. `pnpm
    gate:sca` and `pnpm gate:lockfile` pass, quoted.

**The build**

19. **The production build.** `pnpm --filter @lemnaria/web build` passes and is quoted. If it needed
    `serverExternalPackages`, the line is in `next.config.ts` with a one-line reason.

**The gates**

20. **The whole gate.** `pnpm ci:local` on a clean tree, run by the coordinator on the owner's machine with the root
    file holding the Google names, ends `LOCAL CI PASSED`, quoted.

**Nothing hard-coded**

21. **The address is nowhere.** `rtk proxy git grep -n -i "@gmail\.com"` over `apps/`, `packages/`, `.env.example`
    and `docs/` returns only this plan's *Owner-side steps* line.

## Slices

**Tier for the wave: Full + security.** A dependency changes, a secret is handled, and customer data reaches a new
third party (`WORKFLOW.md`, *How much review a wave gets*: *dependency changes*, *customer data*) [doc].

**Every dispatch carries, verbatim:**

- the discarding git commands are banned by name: `git stash`, `git stash pop`, `git checkout -- .`,
  `git reset --hard`, `git clean`;
- *no environment variable is created, changed, removed or printed, in any file or deployment. The repo-root
  `.env.local` and `apps/web/.env.local` are never opened, edited or listed by value*;
- *no test, script or agent sends real mail or opens a connection to an SMTP host*;
- *no database row is deleted outside the harness's own teardown (ADR 0151)*;
- *check the change against ADR 0154's intent before proceeding, and stop and report on a conflict*.

One writing agent at a time (R2).

| Slice | Work (≤ 5 items) | Production files | Reading |
| --- | --- | --- | --- |
| **S1** | **The dependency and the adapter, unwired.** (1) Add `nodemailer` at the exact version 8N.9 names (`pnpm --filter @lemnaria/web add -E`). Quote `pnpm gate:sca` and `gate:lockfile`. Re-verify every [tarball] line of 8N.4 and 8N.5 against the installed copy, and report any difference. (2) New `gmail-mail-sender.ts`: `buildGmailTransportOptions`, `buildGmailMessage` and `createGmailMailSender(configuration, makeTransport = createTransport)` with 8N.1, 8N.4 and 8N.5's per-send order. It takes a `MailConfiguration` of the **new** shape, declared locally until S2 moves it. (3) New `smtp-answer.ts`, the table of 8N.5. (4) The network guard for the mail test directory (8N.7). (5) Tests for criteria 5 to 13 | `apps/web/package.json`; `pnpm-lock.yaml`; new `apps/web/src/lib/server/mail/gmail-mail-sender.ts`; new `apps/web/src/lib/server/mail/smtp-answer.ts` | this plan: *What the code has today*, 8N.1, 8N.4, 8N.5, 8N.7, 8N.9, criteria 5 to 13 and 18; ADR 0154 d1, d2, d5, d9, and *Limits* JC-R1.8; ADR 0146 B2; ADR 0164. Source: `mail-sender.ts` (whole), `resend-mail-sender.ts` (whole: the pattern being replaced), `fake-mail-sender.ts`, `read-body-with-limit.ts` (not used; why). Installed `node_modules/nodemailer/dist/cjs/`: `nodemailer.d.ts`, `errors.js`, `smtp-transport/index.js`, `smtp-connection/index.js:50-53,129-163,239-247,423-429`, `shared/index.js:410-420`, `mime-node/index.js:1220-1350`. Tests: `tests/lib/server/mail/mail-test-support.ts`, `resend-mail-sender.test.ts` (the shape of the tests being replaced). `engineering-conventions.md`, *Coverage an adversarial pass owes* |
| **S2** | **The names move together, and the factory switches.** (1) `mail-configuration.ts`: the three names, `RETIRED_MAIL_VARIABLE_NAMES`, the new `MailConfiguration`, and the rules of 8N.2. (2) `select-mail-sender.ts`: the refusal set of 8N.3. (3) `create-mail-sender.ts` builds `createGmailMailSender`. Delete `resend-mail-sender.ts` and the tests whose only subject it is. List each deleted test title with the reason *subject deleted* (ADR 0152). Provider-neutral tests inside the QA files move, they are not deleted, and QA-owned pins that move are reported. (4) The harness of 8N.7: `fake-mail-environment.ts` (five names, the withholding function), `playwright.config.ts` (withhold right after `loadEnvLocal`), `production-policy-server.ts` (`NOT_INHERITED`), and the list in `contact-unavailable.e2e.spec.ts`. (5) The re-pointed import fences (criterion 15), and every test naming `RESEND_API_KEY` as a live name moved to the new names | `apps/web/src/lib/server/mail/mail-configuration.ts`; `select-mail-sender.ts`; `create-mail-sender.ts`; `resend-mail-sender.ts` (deleted); `apps/web/playwright.config.ts` | this plan: 8N.2, 8N.3, 8N.7, criteria 1 to 4, 15 to 17; ADR 0154 d6, d7, J-S1.6, *Alternatives* (`:224-225`); ADR 0152; ADR 0151; `environments-and-resources.md` *Which file holds what* and *The three mail variables*. Source: `mail-configuration.ts`, `select-mail-sender.ts`, `create-mail-sender.ts`, `contact-availability.ts`, `packages/persistence/src/load-env.ts`, `playwright.config.ts:1-125`, `tests/e2e/support/fake-mail-environment.ts`, `production-policy-server.ts:55-200`. Tests: every file from `rtk proxy grep -rln "RESEND_API_KEY\|MAIL_FROM_ADDRESS\|resend-mail-sender" apps/web/tests` (14 files at `ccb0cd5e` [ran]) |
| **S3** | **Runtime, build, example.** (1) `route.ts`: `export const runtime = "nodejs"` and criterion 14's test. (2) `pnpm --filter @lemnaria/web build`, quoted. If it fails on nodemailer, add `serverExternalPackages: ["nodemailer"]` with a one-line reason, and quote the build again. (3) `.env.example` per 8N.10. (4) Quote criterion 21's grep | `apps/web/src/app/api/contact-submissions/route.ts`; `apps/web/next.config.ts` (only if item 2 needs it); `.env.example` | this plan, 8N.5 (*Node only*), 8N.9 (*Bundling*), 8N.10, criteria 14, 19, 21; the Next docs `runtime.md`, `maxDuration.md` (installed); the two cron routes' runtime lines |
| **QA** | Below | — | QA *Reading* |
| **Review** | Below | — | Reviewer *Reading* lines |
| **Close** | The scribe | — | *For the scribe, at the close* |

S1 leaves the adapter unwired, and that is a named interim inside the wave. Each slice's own tests are green before
the next slice is dispatched.

## QA plan

**QA Reading:** this plan whole; ADR 0164; ADR 0154 d1 to d9, *Limits*, *What is unproven*; ADR 0153 R6;
ADR 0157 d6 and its *never notified* limit; ADR 0146 B2; ADR 0152; `engineering-conventions.md`, *Coverage an
adversarial pass owes* and *Three guards that look thorough and cannot fail*; `WORKFLOW.md` R6. Source: the S1 to S3
diff; `mail-sender.ts`, `lead-notification.ts`, `deliver-notice.ts`, `submit-contact.ts:195-280`; installed nodemailer
`errors.js`, `smtp-transport/index.js`, `mime-node/index.js`. Existing QA files under `tests/lib/server/mail/qa-8j-*`.

**Freeze the tree** before dispatch (R1). QA writes tests only. A failing test is a finding, left failing.

**Adversarial cases QA owes, beyond the developer's:**

1. **Header injection through every customer field.** Name, phone (normal form), locality and e-mail each carry
   CR, LF, CRLF, U+0085, U+2028, U+2029, `\r\nBcc: x@y`, `\nReply-To:`, a lone `.` line, `\r.\r` and a NUL. The
   notice throws its named error, or the raw `streamTransport` output has the same header set as a clean notice and
   no second recipient. **There is no notes field. QA confirms there is none and invents none.**
2. **A key built to break the Message-ID:** `<>@"()[];:,\` and 256 visible characters. The `Message-ID` stays one
   well-formed `msg-id`. A key outside the predicate is `refused` with no transport made.
3. **The configuration as an attacker sets it:**
   - `LEAD_NOTIFICATION_ADDRESS` as `a@b, c@d`, `a@b\r\nBcc: c@d`, `"a@b" <c@d>`, `a@b;c@d` and a Unicode
     line separator: each is `unavailable`, and none reaches a transport.
   - `GOOGLE_EMAIL` the same.
   - **The domain part.** The address rule admits `"()[]\` and `/` after the `@` (`mail-configuration.ts:35`
     excludes only whitespace, `@,;<>` and `\p{C}`) [src], and that domain feeds the `Message-ID`. With
     `GOOGLE_EMAIL` such as `a@b"c`, `a@(x)`, `a@[1.2.3.4]` or `a@b\c`, the `Message-ID` either stays one well-formed
     `msg-id` or the adapter refuses unsent. **Neither may produce a malformed header.** If that needs a narrower
     domain rule for the `Message-ID` alone, it is a finding.
   - `GOOGLE_APP_PASSWORD` with spaces, a tab, a trailing `\n`, or empty.
   - A getter that throws (ADR 0154 O3's trigger, re-read).
4. **The answer mapping, attacked:**
   - Errors whose `message` or `response` holds the app password, the address or a marker.
   - `responseCode` as a string `"550"`, as `550.0`, or as a getter.
   - `code` as a non-string.
   - A thrown `null`, `undefined`, a number or a `Symbol`.
   - A `sendMail` result with getters that throw.
   - **Mutants:** swap `busy` and `refused`; drop the `5.4.5` check; keep `response` in `status`. Each must go red.
5. **The bound and the transport's life:**
   - `sendMail` that resolves after 10 s.
   - `sendMail` that rejects after `close`.
   - `close` that throws: the answer is still the send's, and nothing rejects.
   - `makeTransport` that throws: *unreachable* or *refused* per 8N.5, never a rejection.
   - Fake timers, with the bound proven by sabotage: remove the race and the test goes red.
6. **No real network, proven.**
   - Delete the network guard: the guard test goes red.
   - Construct the adapter with the default transport in a scratch test: the guard trips before any socket.
   - `rtk proxy git grep -n "smtp.gmail.com"` under `apps/web/tests` names only the options test's expected value.
7. **The harness (criterion 16)**: witnesses (a) and (b), and the sabotage pair, from a git worktree whose root
   `.env.local` holds marker values. **Never the owner's files, and never print a value.** The withheld-names line
   is checked to hold names only.
8. **The retry semantics end to end, with the fake transport through `submitContact`:**
   - (a) A send that times out, then a retry of the same request: two `sendMail` calls, one row, `notified_at` set
     once. This is the recorded duplicate.
   - (b) A send accepted with the mark failing, then a retry: two sends. Recorded.
   - (c) An accepted and marked request, retried: zero further sends.
   - (d) *quota spent*: the 5B non-retry code and the row stored un-notified.
   - (a) and (b) are **expected**; QA asserts they are what happens, so a later change to them is visible.
9. **The port unchanged (criterion 1),** by diff, not by reading.

**What a clean report would mean:** weak (`engineering-conventions.md`). QA states the mutants it ran and which it
killed.

## Review plan

Full + security. The three run in parallel **only after QA is green**.

- **Security, Reading:** this plan, 8N.2 to 8N.9 and criteria 2, 5, 6, 10, 13, 16, 18; ADR 0164; ADR 0154 d2, d6,
  d7, d9 and *Limits*; ADR 0146 B2; ADR 0153 R6; `environments-and-resources.md` whole. Source: the full wave diff,
  `apps/web/package.json`, the `pnpm-lock.yaml` hunk for nodemailer, the installed nodemailer `package.json`, `errors.js`,
  `shared/index.js:400-440`, `mime-node/index.js:1220-1350`, `smtp-connection/index.js:120-260`.
  **The questions:**
  - the dependency's provenance, age and scripts;
  - every path a secret could leave (logger, debug, errors, `info`, the fake, the harness's printed line);
  - header injection;
  - one recipient by construction;
  - the harness withholding, including the worker path;
  - what Google now holds (the sender's *Sent* folder keeps every notice [inf]).
- **Logic, Reading:** this plan, 8N.1, 8N.5, 8N.6, 8N.8 and criteria 4, 8 to 12, 17; ADR 0164; ADR 0154 d1, d3, d4;
  ADR 0157 d2 to d6; ADR 0160 d2. Source: `smtp-answer.ts`, `gmail-mail-sender.ts`, `deliver-notice.ts`,
  `submit-contact.ts:195-280`, `mail-sender.ts:97-111`. **The questions:**
  - whether the table sends a retry-worthy failure to a non-retry code, or the reverse;
  - whether a duplicate is the only new failure mode;
  - whether `payload-mismatch` is now dead in production and that is stated, not hidden.
- **Clean-code, Reading:** the full wave diff; `engineering-conventions.md`; ADR 0136 (comments carry only what
  nothing else can); ADR 0152 (the deleted tests and their reasons).

## Risks

1. **The owner's local gate goes red** if the withholding (S2 item 4) lands after the names move. It is one slice for
   that reason. *Before S2 is committed, adding `LEAD_NOTIFICATION_ADDRESS` to the repo-root `.env.local` breaks
   local e2e today*, because that name is already on the refusal list (`fake-mail-environment.ts:16`) and
   `loadEnvLocal` reads the file [src]. Owner step 4 is ordered after S2 for this reason.
2. **The duplicate notice** (8N.6). Accepted. Q63 lets the owner overturn it.
3. **Bundling** (8N.9). Unknown until S3's build. Mitigated by the build being a criterion.
4. **Gmail behaviours the wave cannot see** [inf, all]:
   - From rewriting;
   - the `5.4.5` reply;
   - whether Gmail keeps our `Message-ID`;
   - app passwords being revoked when the account password changes;
   - the platform allowing outbound 465.
   Each is proved or falsified by the owner's one real send from a Preview deployment, and that close-out quotes
   them. Until then the ADR marks them unproven.
5. **The credential's blast radius.** An app password gives the whole mailbox over IMAP and SMTP, not only sending
   [inf: recalled vendor docs]. Leaked, it reads every notice ever sent. This is the reason for Q62's dedicated
   account. Resend's *sending-access-only* key had no equivalent here.
6. **Self-sent mail.** If `GOOGLE_EMAIL` and the shop's inbox are one account, whether the notice lands in the inbox
   and alerts the phone is unproven [inf].
7. **A fresh dependency** (8N.9). `10.1.1` is two days old at this date, and the age floor was weighed and not
   taken. The mitigations:
   - security review reads the installed package;
   - `gate:sca`;
   - the import fence;
   - the coordinator's option to dispatch S1 on or after 2026-10-21.
8. **The function ceiling** (8N.5). Not read. Falsified or confirmed at the Preview send.
9. **`vercel env pull` rewrites the repo-root `.env.local` wholesale** (`environments-and-resources.md:59-60`, `:71`)
   [doc]. Names the owner added by hand there are lost on the next pull unless they are also on Vercel's
   **Development** environment. The owner keeps his own copy.

## Verification

The coordinator runs the following on a clean tree and quotes each:

- the web Vitest suite;
- `pnpm typecheck`, `pnpm lint` and `pnpm format:check` (whole tree);
- `pnpm gate:boundary`, `pnpm gate:lockfile` and `pnpm gate:sca`;
- `pnpm --filter @lemnaria/web build`;
- whole `CI=1` e2e;
- `pnpm ci:local`;
- criterion 1's `git diff` and criterion 21's `git grep`, via `rtk proxy`.

**No real send is part of the wave's verification.** The owner's one real send (step 7 below) is quoted in a later
close-out, as ADR 0154's criterion 9 already required.

## Owner questions (Q61 to Q63)

Each has a default, and none blocks S1.

- **Q61 — a Reply-To with the customer's e-mail?** Default **(a) none**: the customer's e-mail stays a body line, and
  ADR 0154 d2 stands. (b) When the channel is e-mail, a validated customer address as `Reply-To` only. That widens the
  port with a field and puts a customer's address in a header, so it would be its own wave under security review.
- **Q62 — which Google account is `GOOGLE_EMAIL`?** Default **(a) a dedicated sending account** with 2-Step
  Verification. It would hold only these notices in *Sent*, and could be suspended or leaked without exposing the
  shop's own mail. (b) The shop's own inbox account. That is simpler, but it carries risks 5 and 6.
- **Q63 — a possible second notice, or a possible lost one?** Default **(a) a possible second notice** (8N.6).
  (b) Treat *timed out* and *unreachable* as final. That changes the port's retry table, and it means a lost lead on
  every transient fault.

## Owner-side steps

**No agent does any of these.** Add-only throughout: if a name already exists in an environment, do not overwrite
it. Report it instead (`environments-and-resources.md:6-30`).

**Preparing the Google account**

1. **Choose the sending account** (Q62). On it, turn on **2-Step Verification**. An app password cannot be created
   without it [inf: recalled vendor docs].
2. **Create an App password** (Google Account → Security → 2-Step Verification → App passwords). Copy the 16
   characters **without spaces**. Changing the account's password later revokes it [inf], and then the step is
   repeated.

**Adding the variables to Vercel**

3. **Add the three variables to Vercel, Production and Preview, as sensitive.** For example:
   `vercel env add GOOGLE_EMAIL production --sensitive`, then the same with `preview`. Do the same for
   `GOOGLE_APP_PASSWORD` and for `LEAD_NOTIFICATION_ADDRESS`. Check the flag with `vercel env add --help` first.
   **The value of `LEAD_NOTIFICATION_ADDRESS` is `<the shop's receiving address, supplied by the owner>`** [owner, 2026-10-16]. Paste each value at
   the prompt, never on the command line. Do not add `LEMNARIA_E2E_FAKE_MAIL` anywhere.
   `RESEND_API_KEY` and `MAIL_FROM_ADDRESS`, if set anywhere, are left as they are.

**Local files**

4. **Locally, and only after S2 is committed:** if a local copy is wanted, `LEAD_NOTIFICATION_ADDRESS` may go in the
   **repo-root** `.env.local`, beside `GOOGLE_EMAIL` and `GOOGLE_APP_PASSWORD` (risk 1 explains the order). **Never
   in `apps/web/.env.local`:** Next loads that file into the local server, and the e2e contact specs then fail by
   design (8N.7). Nothing local sends mail: `next dev` does not read the repo-root file
   (`environments-and-resources.md:58-60`) [doc]. Keep a private copy, because `vercel env pull` rewrites the root
   file (risk 9).

**The real send**

5. **Redeploy Preview** so the new variables take effect. A variable change applies to new deployments [inf].
   Deployment is manual (ADR 0096 d2).
6. **The phase gate's line stands:** the variable names on each environment, names only, show no
   `LEMNARIA_E2E_FAKE_MAIL` (ADR 0154, *8T*).
7. **One real send, from Preview:** submit one contact request and confirm the notice arrives in the shop's inbox,
   with the From, the subject and plain text. Report what arrived, without forwarding the mail content to anyone.
   This is ADR 0154 criterion 9's one real send, now against Gmail.
8. **Production** follows at launch (M9's gate), with the same three variables.

## For the scribe, at the close

Owed then and not before:

- **ADR 0164:** Accepted, with an amendment recording the close.
- **Dated notes on Accepted records** (a note each, never an edit of their text):
  - ADR 0154: d2 and d3 superseded; d4's guarantee gone; d6 names; d9 recipient party; J-S1.6's harness;
  - ADR 0153 R6;
  - ADR 0157 (the quota line);
  - ADR 0001 d7: kept, noted.
- **`environments-and-resources.md`:** a dated note under *The three mail variables*, with the new names and the
  retired two.
- **`M9-delivery-preparation.md`:** a dated note on the launch line at `:19` and `:44`, with the three new names, the
  App password replacing *"sending access only"*, and Google as the processor for Q7 and Q13.
- **`decisions/README.md`** and **`SUPERSESSIONS.md`:** the index row, and 0154 d2 to d4 → 0164.
- **`docs/STATUS.md`:** the wave's row and *What to do next*.
- **Backlog 160:** closed by `smtp-answer.ts`.
