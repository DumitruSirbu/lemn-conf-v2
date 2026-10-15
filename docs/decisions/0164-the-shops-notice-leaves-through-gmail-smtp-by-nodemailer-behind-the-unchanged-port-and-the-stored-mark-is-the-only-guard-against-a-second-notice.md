# ADR 0164 — The shop's notice leaves through Gmail SMTP by nodemailer behind the unchanged port, and the stored mark is the only guard against a second notice

Status: **Proposed — 2026-10-16**, by the architect at the planning of the wave. Nothing is built. No real message has
been sent by anyone.
Date: 2026-10-16
Type: Decision
Milestone: M8, wave 8N (proposed id 8J2; plan:
[`milestones/8N-nodemailer-gmail-notification.md`](../milestones/8N-nodemailer-gmail-notification.md))

**Supersedes, when accepted:**

- [ADR 0154](0154-mail-leaves-through-one-provider-neutral-port-and-one-resend-adapter-that-sends-once-and-answers-with-one-of-seven-kinds-and-the-shops-notice-is-the-stored-review-printed-never-priced-again.md)
  **d2**, for the transport only: *"no SDK, no dependency"*. Its must-not list is kept.
- ADR 0154 **d3**: the Resend answer table.
- ADR 0154 **d4**'s guarantee: *"a retry inside a day cannot send a second message"*.

**Amends, when accepted:**

- ADR 0154 **d6** (the names), **d7** (the refusal set) and **d9** (the third party).
- ADR 0154's harness clause under **J-S1.6** (decision 7 below).
- [ADR 0153](0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md)
  **R6**: a cleared mark re-notifies at once.
- [ADR 0157](0157-the-contact-route-judges-every-request-first-stores-once-answers-one-code-per-kind-and-refuses-a-retry-across-a-change-of-book.md):
  the quota line.

**Keeps:** ADR 0001 d7 (*provider-neutral server API*), ADR 0154 d1 (the port and the seven kinds), d5 and d8, and
ADR 0160 and 0163.

These records are Accepted. They get dated notes at the close, written by the scribe. Their text is not edited.

Evidence tiers:

- **[doc]** quoted from this repository, with `file:line`.
- **[src]** read at `HEAD` `ccb0cd5e`.
- **[tarball]** read in the published `nodemailer@10.1.1` package, unpacked in the session scratchpad. It is
  re-verified against the installed copy in S1.
- **[ran]** a command the architect ran.
- **[owner]** relayed by the coordinator.
- **[inf]** inference, with what would falsify it.

In the brief's three tiers:

- [doc] is *doc-quoted*.
- [src] and [tarball] are *source-verified*. [tarball] is weaker, because it is not the installed copy.
- [inf] is *inference*.

## Context

On 2026-10-15 the owner replaced the mail provider: nodemailer through Google (Gmail) SMTP, reading
`GOOGLE_EMAIL` and `GOOGLE_APP_PASSWORD` [owner]. On 2026-10-16 the owner named the shop's receiving address as the
value of `LEAD_NOTIFICATION_ADDRESS`. It stays a variable, and the rule *exactly one address, never a customer's* is
kept [owner]. The value is written only in the plan's *Owner-side steps*.

ADR 0154 built a provider-neutral port and one Resend adapter. Wave 8K wired them into the contact route. The port's
message has no recipient, no sender and no markup (`apps/web/src/lib/server/mail/mail-sender.ts:3-13`) [src]. That
is what lets one adapter change without touching the route, the notice, the store or a page.

## Decisions

### 1. The port keeps its interface; only the transport changes

`MailMessage`, `MailOutcome`, the seven kinds, the predicate, `sendableCopyOf` and the retry table are not edited. A
new adapter, `gmail-mail-sender.ts`, returns `MailSender`, reads only through `sendableCopyOf`, and refuses unsent,
before making any transport, what may not be sent.

*Not taken:* widening the message with a recipient, a reply-to or `html`. Each is a widening under its own review
(ADR 0154, *What later waves inherit*) [doc].

### 2. Three variables, all or nothing; the sender is the account

The names are `GOOGLE_EMAIL`, `GOOGLE_APP_PASSWORD` and `LEAD_NOTIFICATION_ADDRESS`, with ADR 0154 d6's rules:

- An address is exactly one bare address.
- The password is visible ASCII with no space, so a pasted spaced password reads *unavailable*.
- Only own members are read.
- If any name is missing or unusable, the answer is *unavailable*, naming names and never a value.

`from` is `GOOGLE_EMAIL`, because Gmail rewrites any other `From` that is not a verified alias [inf; falsified by the
owner's real send]. `to` is `LEAD_NOTIFICATION_ADDRESS` alone. It remains a separate variable, so the shop's inbox can
move without touching the credential, and the sender can be a dedicated account.

*Not taken:*

- keeping `MAIL_FROM_ADDRESS`, which Gmail would override;
- sending to `GOOGLE_EMAIL`;
- stripping spaces from the password, because a reader that edits a secret is a second rule about it.

### 3. The fake's refusal set keeps the retired names

`RESEND_API_KEY` and `MAIL_FROM_ADDRESS` configure nothing. They stay in the set beside which the e2e flag is refused,
because variables are add-only and a retired name may outlive its code in an environment. *Not taken:* dropping them.

### 4. On the wire: from, to, subject, text, a derived Message-ID, nothing else

The nodemailer options are built from named members. They are exactly `from`, `to`, `subject`, `text` and
`messageId`.

`messageId` is `<sha256-hex(key)@domain(GOOGLE_EMAIL)>`, for two reasons:

- the port's key may hold characters a `msg-id` cannot;
- the client request id, which Resend saw in `Idempotency-Key`, leaves in no header.

Collapsing a duplicate on it is [inf], and nothing relies on it.

**Plain text only.** ADR 0154 d2's must-not list is carried over: no `replyTo`, `html`, `cc`, `bcc`, `headers`,
`attachments`, display name, or any customer value in a header.

**Injection** is closed by the existing rules:

- customer text only as body lines;
- every line refused on `\p{Cc}\p{Zl}\p{Zp}` (`lead-notification.ts:273-276`) [src];
- the subject constant plus the reference, and refused on a line break (`mail-sender.ts:72`) [src].

nodemailer's own header folding (`mime-node/index.js:1227`, `:1341-1348`) and dot-stuffing
(`smtp-connection/data-stream.js:46-54`) [tarball] are a second layer, not the guard.

### 5. The transport: implicit TLS, lazy, bounded, silent, unpooled; Node only

**The options:**

- `smtp.gmail.com:465`, with `secure: true`;
- `pool: false`;
- `logger: false` and `debug: false`;
- `disableFileAccess: true` and `disableUrlAccess: true`;
- no `tls` override and no `service` shortcut;
- four timeouts (DNS, connection, greeting, socket), each a positive named constant strictly below the one bound.

**The bound.** It stays `MAIL_REQUEST_TIMEOUT_MS = 10_000` (ADR 0154 d2). nodemailer's defaults are 2 min, 10 min,
30 s and 30 s (`smtp-connection/index.js:50-53`), and `0` falls back to them (`:240`) [tarball].

**Per send.** One transport is made inside `send`. `sendMail` races the bound, and `close()` runs in `finally`.

**The contact route** exports `runtime = "nodejs"`, following the cron routes. Next documents nodejs as the default and
Edge as deprecated (installed `runtime.md:18-23`) [doc]. The pin makes *never Edge* testable.

**The answer table.** It lives in a module of its own (discharging ADR 0154 JC-R1.8 and backlog 160). It reads only
`code` and `responseCode`, and copies no `message`, `response`, `command` or `stack` (ADR 0146 B2):

| What came back | Kind |
| --- | --- |
| Accepted exactly one recipient and rejected nothing | *accepted* |
| Resolved otherwise | *unreadable answer* |
| `EPROTOCOL` | *unreadable answer* |
| An auth, envelope or configuration code | *refused* |
| 4xx | *busy* |
| 550 with `5.4.5` | *quota spent* [inf] |
| Other 5xx | *refused* |
| `ETIMEDOUT`, or the bound | *timed out* |
| Connection, socket, DNS or TLS failure, or anything else | *unreachable* |

**This adapter never produces *payload mismatch*.** The kind stays in the closed list.

**The accepted entry is not compared byte-for-byte with the configured address.** nodemailer records the parsed
envelope address (`smtp-connection/index.js:1832`, `:1932`) [tarball], which may be normalised. A strict comparison
would make every real delivery a retryable failure and a duplicate. That there is no other recipient is held by
construction: one `to`, built from the configuration.

**The quota match** is `/^550[ -]5\.4\.5\b/` on the reply. It is compared, never copied.

The full table and its warrants are in the plan, 8N.5.

### 6. A failed send changes nothing a customer or the row sees; a second notice is the accepted failure

**Unchanged** [src: `deliver-notice.ts:91-131`, `submit-contact.ts:200-218`]:

- 5B;
- the two outward codes;
- the stored request;
- `notified_at`, set only after an accepted send;
- a failed mark after acceptance still being success.

**ADR 0154 d4's guarantee no longer holds:** SMTP has no idempotency key. An accepted send whose mark failed, or an
ambiguous timeout after the server took the message, notifies the shop again on a retry. **The stored mark is the
only guard.** A cleared mark (ADR 0153 R6) now re-notifies at once rather than after a day.

**The accepted direction is a duplicate over a lost lead** [inf; the owner's Q63].

*Not taken:* making *timed out* and *unreachable* final. That changes the port's table and loses a lead on every
transient fault.

### 7. Tests never send, and the e2e harness withholds every mail name

Unit tests inject the transport maker. MIME is checked through nodemailer's `streamTransport` or `jsonTransport`, and
a network guard fails any mail test that reaches a socket.

**The e2e harness.** `playwright.config.ts` removes the five mail names from its own `process.env` right after
`loadEnvLocal()`, and names what it withheld. The production-policy server's `NOT_INHERITED` gains them.

**Why.** `loadEnvLocal` copies the repo-root `.env.local` into the runner
(`packages/persistence/src/load-env.ts:13`, `:37-45`) [src]. That file already holds the two Google names [ran, names
only]. Playwright 1.62.1 hands `process.env` to the web server (`lib/runner/index.js:858-862`) [src].

Without the withholding:

- the moment the refusal list names the Google variables, local e2e, `ci:local` and the pre-push hook fail at config
  load;
- a second server under `CI=1` would hold a real sender.

**What this is not.** It is not ADR 0154's rejected alternative, *"weakening the rule so a developer's `.env.local`
with a mail name passes the contact specs"* (`0154:224-225`). That rule is the server's, and it is kept: flag beside
any mail name means *unavailable*. `apps/web/.env.local`, which Next loads into the local server itself, still fails
the contact specs loudly (J-S1.6, kept). The harness now gives no server a mail name from the root file, which is
stronger, not weaker. Nothing in any file or deployment is removed.

### 8. Gmail's limit

The limit is about 500 recipients a day for a consumer account [owner-brief figure; inf until Google's page is quoted].
At the limit, the request is *quota spent*, which is not retried automatically. The customer sees 5B, and the row is
stored un-notified and invisible to the shop until M9's read-back. That is the class ADR 0157 recorded for Resend's
100 a day [doc, `0157:93`]. Heavy automated sending may suspend a consumer account [inf]; see Q62.

### 9. The dependency

`nodemailer` is pinned at an exact version in `apps/web` `dependencies` only, with no `@types` package: it ships
`dist/cjs/nodemailer.d.ts` [ran: `npm view`]. Its metadata lists no dependencies, and its license is `MIT-0` [ran].

**The version is `10.1.1`, the version read.** It was published 2026-10-14 [ran: `npm view nodemailer time`].

An age floor of seven days was weighed and not taken. It would select `10.0.16`, which lacks behaviour the design
cites [tarball: `CHANGELOG.md`, 10.1.0 and 10.1.1]:

- 10.1.0 counts the greeting against `connectionTimeout`;
- 10.1.0 hardens SMTP connections and message streams;
- 10.1.0 ends the session on any 421;
- 10.1.1 strips credentials on cross-origin fetch redirects.

The outer bound would still govern under 10.0.16 [inf]. Freshness is the recorded cost. The coordinator may defer S1
to on or after 2026-10-21, when 10.1.1 is seven days old, with the same pin.

**The gates:** the one root lockfile, `pnpm gate:sca` (`pnpm audit --audit-level=high --prod`) and the import fence
(only the adapter imports it).

**Bundling** (`serverExternalPackages`) is decided by the production build, not assumed: nodemailer is not on Next's
default list [src].

### 10. What leaves to the third party

Google now receives what ADR 0154 d9 listed for Resend:

- the reference;
- the locale;
- the name;
- the phone's normal form;
- the locality;
- the channel word;
- the e-mail, only with that channel;
- the kitchen lines.

The client request id appears only as its digest in `Message-ID`.

**The sending account's *Sent* folder keeps every notice** [inf]. An app password grants the whole mailbox, not only
sending [inf: recalled vendor docs]. Resend's *sending-access-only* key has no equivalent. Hence the default of a
dedicated account (Q62).

The privacy text naming the processor is M9's (Q7, Q13).

## Alternatives not taken

- **Keep Resend.** The owner decided otherwise [owner].
- **Google's Gmail API with OAuth.** No transport library is needed, but it requires an OAuth client, consent and a
  refresh token. The owner named SMTP and an app password.
- **A hand-written SMTP client over `node:tls`.** That is a second implementation of a protocol a maintained library
  already escapes correctly (SMTP smuggling, dot-stuffing).
- **nodemailer's `service: "gmail"` shortcut.** It hides the host and port the invariant names.
- **A pooled or module-level transport.** It makes a serverless instance hold a credentialed socket between requests.
- **A Reply-To holding the customer's address** (Q61, default none).
- **Final, unretried timeouts** (decision 6).

## Limits recorded, not fixed (ADR 0118)

Each limit has its trigger.

- **A duplicate notice is possible** (decision 6). *Trigger:* the shop reports duplicates in number, or Q63 is (b).
- **Gmail behaviours are unproven** [inf]:
  - From rewriting;
  - the `5.4.5` reply;
  - `Message-ID` kept;
  - app passwords revoked on a password change;
  - outbound 465 from the platform;
  - the platform's function ceiling above the bound.
  *Trigger:* the owner's one real send from Preview, quoted in a close-out.
- **`payload-mismatch` is unproducible in production.** It stays in the closed list because the port is unchanged.
  *Trigger:* a provider with idempotent replay.
- **No mail names in `apps/web/.env.local`.** A name there fails the local contact specs by design.

## Open to the owner

- **Q61**, a Reply-To: default none.
- **Q62**, which account: default a dedicated one.
- **Q63**, a duplicate versus a lost notice: default a duplicate.

## Evidence

Reads only. No gate, test, server or database was run [ran: none]. `npm view nodemailer` and `npm pack
nodemailer@10.1.1` were run by the architect on 2026-10-16. The variable names, without values, were listed in the
two `.env.local` files.
