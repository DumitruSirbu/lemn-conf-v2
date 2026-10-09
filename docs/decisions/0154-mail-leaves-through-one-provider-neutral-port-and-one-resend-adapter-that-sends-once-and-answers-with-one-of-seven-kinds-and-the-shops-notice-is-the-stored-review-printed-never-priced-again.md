# ADR 0154 — Mail leaves through one provider-neutral port and one Resend adapter that sends once and answers with one of seven kinds, and the shop's notice is the stored review printed, never priced again

Status: Accepted. **The language of the notice (decision 8, Q34), the notice's wording (a draft) and the closing rule (decision 12) are
open to the owner.** No real message has been sent by any test, gate or agent; the adapter is unproven against the live provider.
Date: 2026-10-09
Type: Decision
Milestone: M8 wave 8J (mail, and the shop's notification)

The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (wave 8J: *8J, restated for
dispatch*; *S1 for dispatch*; *S1's security read, ruled; S2 for dispatch*; *S3's stop, ruled*; *adjudication of QA*; *the three
reviews, ruled*, whose end lists what this record must hold) and from the coordinator's close-out hand-over. The scribe has no shell
and ran nothing. Tiers: **[doc]** quoted from a record in this repository or a vendor's page, **[src]** read in the code by the plan's
author or a reviewer, **[inf]** inference, with what would falsify it. Every figure says who ran it. Finding numbers (JL-, JC-, J-S,
F, O) are pointers into the plan and its review findings; they are not restated here.

## Context

Wave 8H defined the contact request (ADR 0150) and 8I stores it (ADR 0153). 8J gives the application a way to tell the shop: one
provider-neutral port that sends one fixed message to one configured address, the one adapter that reaches the provider the owner
chose on 2026-10-07 (*"lets use resend , i have the api key already"*, relayed, after being told Resend keeps account data and thirty
days of message content in the United States), the configuration that decides whether mail can be sent, a fake for tests, and the
notice's text. Nothing calls any of it yet: no route and no store wiring (that is 8K). The plan is archived when M8 closes, and
several rules below were found by an attack or a stop and not planned.

## Decisions

### 1. The port, and the seven failure kinds with their retry classes

The port takes a message of a key, a subject and a text and answers an outcome that is **a value and never a rejection**
(`ok`, `kind`, `status`, and no other key). **The message has no recipient, no sender and no `html`**: the adapter fills the
configured inbox, so a customer's address is never a recipient or a header value by the type (criterion 1). The failure kinds are
final, seven, and the retry class of each is said in one place in the port [src `mail-sender.ts`]:

| Kind | A retry |
| --- | --- |
| *accepted* | none needed |
| *unreadable answer* | may; the key guards it |
| *payload mismatch* | **never**: our bytes changed between attempts, a defect or a deploy |
| *busy* | may |
| *quota spent* | **not automatically** (criterion 12) |
| *refused* | never: the request or the account is wrong |
| *unreachable* | may |
| *timed out* | may |

The seven failure kinds are every row but *accepted*. *Refused* with no status is also ours, before any request (decision 5).

### 2. The provider is reached by one adapter over `fetch`, no SDK, no dependency

`POST https://api.resend.com/emails`, one constant URL, a JSON body built **from named members, never by spreading the message**:
exactly `from`, `to` as a list of the one configured inbox, `subject`, `text`. *Must not:* `html`, `reply_to`, `cc`, `bcc`, `headers`,
`attachments`, `tags`, `scheduled_at` (a reply-to holding the customer's address is a customer's address in a header). **Four headers
and no other:** the bearer key, `Content-Type`, a constant `User-Agent`, the `Idempotency-Key`. `redirect: "manual"`: a followed
redirect would post the notice to another host; a 3xx arrives as itself and is *unreadable answer*. **One attempt**: no retry, no wait,
no second request (retries are 8K's). **One bound of ten seconds** (a named constant, the architect's figure; the customer waits for
it, D8) covers the request and the reading of the answer; the answer is read to sixteen kilobytes with `readUtf8BodyWithLimit` (the
architect's figure). Everything is caught and mapped, the request's own construction included; no message of a `TypeError`, of
`Headers` or of an abort is kept, as text or as a cause. `status` is the response's own, never a number from the body, and **it is kept
whenever a response arrived, however its body fails** (F2); only a `fetch` that gives no response has none. The body is read only for a
2xx, a `409` and a `429`. *Not taken:* the provider's SDK (a dependency, and a second place that could log a key); retries inside the
adapter.

### 3. The answer table: the only success is a 2xx with a non-empty text `id`

| The provider's answer | Kind | Evidence |
| --- | --- | --- |
| 2xx whose body is a JSON object with a **non-empty** text `id` (a repeat under one key and the same bytes answers this) | *accepted* | [doc, vendor: the architect fetched the pages 2026-10-09] a sent message answers `{ "id": … }`; a repeat: *"Successful responses will return the email ID of the sent email."* The non-empty rule is the architect's tightening (iii) |
| 2xx otherwise; any 1xx or 3xx | *unreadable answer* | [inf] |
| `409` named `invalid_idempotent_request` | *payload mismatch* | [doc, vendor] *"used on a request that had a different payload. Retrying this request is useless"* |
| `409` otherwise (`concurrent_idempotent_requests`, `resource_locked`, no readable name) | *busy* | [doc, vendor] for `concurrent_idempotent_requests`: *"safe to retry this request later"*; the others [inf] |
| `429` named `rate_limit_exceeded` | *busy* | [inf: the name's field is recalled] |
| `429` otherwise (`daily_quota_exceeded`, `monthly_quota_exceeded`, no readable name) | *quota spent* | [inf: the name's field is recalled] |
| any other 4xx | *refused* | [inf] |
| any 5xx; or the `fetch` rejects (no status) | *unreachable* | [inf] |
| our bound passes | *timed out* | [inf] |

**Neither `409` is a success** (8J's criterion 8 had said "a `409`"; there are two, and ADR 0150 had said so). A property holds that
every status from 100 to 599 with any body falls in exactly one kind and nothing of the body is in what is returned. **A name is
looked for as the body's top-level `name` and read for a comparison with a constant, never copied** [inf, recalled]. **The four fetched
vendor pages show no error body at all** [coordinator hand-over; the architect]: which field carries an error's name is unproven. If it
is the wrong field the mapping still answers: a mismatch reads as *busy* and is retried to 8K's cap, and a rate limit reads as *quota
spent*; both err toward not sending twice. The `403` for a missing `User-Agent` is in the 8A figures only [doc, plan], not on the
fetched pages.

### 4. One request, one message: the key and the same bytes

The key is **`lead-notification/` and the client request id**: at most 82 characters of the provider's 256 [doc, vendor: *"up to 256
characters"*; src, the id's shape]. The prefix is the purpose, from a closed set in code, so a second kind of mail under the same
account (M8B's) cannot meet this one's keys. The vendor keeps a key twenty-four hours [doc, vendor]. The message for one request is
**the same bytes on every attempt**: no clock, no counter, no random value, no variable in the notice. A retry inside a day cannot
send a second message even if marking the row notified failed; past a day only the row's mark stands between a retry and a second
message (a recorded limit, criterion 11). The notice builds a key only from an id that is text and not empty, or throws its named
error; it has no shape of its own for an id.

### 5. A message is read once into a frozen copy that is judged, sent and recorded

One function of the port reads the message's three members once into a copy that cannot change; **one predicate in the port says what
may be sent** (the key 1 to 256 visible ASCII characters; a subject that is not empty and holds no control character or line separator;
a text that is text and not empty); the predicate judges the copy and the adapter builds the request, and the fake records, from that
copy. A read that throws is *refused* with no status, unsent. A message that answers differently the second time would otherwise be
sent unjudged, and here the second read becomes a header and the key the provider tells requests apart by (F1; 8I recorded the same
shape as a limit because there a second read reached a statement's parameter). The key that cannot be a header is *refused* before
any request, because `Headers` quotes a value it refuses. The fake neither records nor spends a scripted answer on a message that may
not be sent. One constant for each rule is exported by the port, and the reader and the notice ask it (JC-R1.6).

### 6. The configuration reader and what "usable" means

The reader is a pure function of an environment handed in: *configured*, or *unavailable* with the names of the variables, never a
value (ADR 0146 B2). A variable is read only as the environment's **own member**, and **a mail name that is an own member counts as
present whatever it holds**, `undefined` too (O2): an environment spread by a caller can hold one, and this is the one answer that
would tell a customer a request was sent when nothing was. **Usable:** a key is not empty and is visible ASCII only; an address is
exactly one, with one `@` between two parts and no space, comma, semicolon or angle bracket, so no variable carries a second recipient
or breaks a header, and nothing reaches `Headers`. A pasted value ending in a line break reads *unavailable* with only the variable's
name to go on (J-S1.6, the runbook's). A reader's names: `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `LEAD_NOTIFICATION_ADDRESS`; none of
them is read when the module loads, so a build needs no value.

### 7. Selection, the factory and the fake: a flag exactly `1`, with no mail variable present, and one log line

Selection is **one pure function of the server's environment handed in as a value**; no request reaches it and its signature has no
place for one. The form is `isSceneShotRouteEnabled` but **its `NODE_ENV` arm is not copied: the selection asks nothing of
`NODE_ENV`**. The fake is chosen only when `LEMNARIA_E2E_FAKE_MAIL` is exactly `1` **and none of the three mail variables is present
as an own member**; the flag with any mail variable present is *unavailable*, naming the flag, never the fake and never the provider.
Under CI the e2e server is `next start`, a production build [src `playwright.config.ts:70-72`], so the plan's earlier sentence *"a
production build cannot select the fake"* could never hold; what a deployment cannot do is the rule above. **No third condition**
(that the server's database is the test database) was ruled by the security reader's answer: `assertSafeTestDatabaseUrl` cannot be
that test as it stands (it refuses a URL naming `DATABASE_URL`'s own database, and the e2e server's `DATABASE_URL` is the test URL)
and the condition would need a new export from the persistence package. **What is left is recorded:** a deployment given the flag and
never set up to send answers success and sends nothing; it takes a variable only the owner sets. *Trigger:* a deployment that takes
real requests is run without mail variables on purpose, or M8B reaches the fake by another path; then the predicate in the persistence
package. The selection answers `fake`, `provider` or `unavailable` and **carries no configuration** (J-S1.1). The factory takes the
environment, reads the configuration and builds the adapter in one function; the key lives in a closure or a `#` member, never in a
property. **The one log line this module writes**, when the factory builds the fake, as a warning, one constant with no value in it
(ADR 0146 B2 allows a constant and a variable's name): `mail: the fake sender is in use (LEMNARIA_E2E_FAKE_MAIL); no message leaves
this server`. *Must not:* the adapter, the reader, the selection or the notice logs anything. **For the fake the factory hands back
`send` alone** (J-S2.4), so what the fake holds, which is every message and therefore personal data, is out of reach of whatever holds
the sender. **There is no database check in the mail path**; the trigger is above. Only `create-mail-sender.ts` imports the fake or
the adapter (the plan's earlier sentence that only "the module that selects" does was wrong; `select-mail-sender.ts` imports neither),
and a test fails on any other import under `apps/web/src`; the scans read for the module's name and `createFakeMailSender` under `src`
(J-S1.4), and one scan holds the three names, the fake, the adapter and `readMailConfiguration`, none outside `lib/server/mail`
(J-S2.2). **The API key never leaves `lib/server/mail`** (J-S1.1): no value that holds it is returned from the selection or the factory.

### 8. The notice: what it prints, from what, and in what language

- **It is the stored review printed**, by one pure function (no clock, no random value, no variable, no counter) of a reference as the
  store answered it, the request as stored (`ContactSubmissionToRecord`, with its snapshot, passed through 8I's rules, ADR 0153) and
  the notice's `Content`. It parses the snapshot's document, calls `describeReview` with the snapshot's price and the document's own
  projection, and prints that review's room line, groups, rows, whole-kitchen rows, figure and disclaimer. **It adds no sentence of its
  own about the price**, prices nothing, names no price book, pricing function or store, and rounds nothing: a snapshot whose stored
  total is changed prints the changed figure (D7; ADR 0072: nothing re-prices a stored submission). **It prints each body's facts**
  under its row, one line for each fact as `rowDetailOf` gives them and in its order, set in by two spaces and with no label (JL-R1.1;
  the mail is the shop's only readable copy in M8 and a body's own finish and handle are what the shop builds; ADR 0148 Amendment B,
  ADR 0099). The first fact repeats the row's width and is printed all the same, since choosing among the model's facts would be
  composing. Criterion 7 is proven against `describeReview` over the stored snapshot, not over a re-priced one.
- **Customer text goes one value to a line behind a fixed label, never in the subject or the key.** The subject is
  `Cerere din configurator {reference}` (a draft under Q10 (a)). The phone is `phoneNormalForm`, **never the text as typed** (ADR 0150).
  The channel is the notice's own word for it, looked up as the list's own member; a channel with none throws a named error holding the
  line's name and no value. The e-mail line exists only when the channel is e-mail. An empty locality prints the label and a fixed dash.
  The customer's locale is printed as the application's own code. **Any line holding a control character or a line separator makes the
  notice throw**, naming the label and no value (one check, over customer lines and kitchen lines alike); a name that is a link or a
  formula is printed as it is, inert on its own line, nothing escaped, wrapped or altered, and no `html` is sent.
- **The named, value-free errors.** The notice's own errors hold a label or a part name and never a value. **The one guard (J-S2.1):** the
  catalogue, the projection, `describeReview` and the lines made from them sit inside one guard; anything thrown there that is not the
  notice's own error becomes `review-not-sendable`, because the model's divergence and missing-detail errors quote a placement id,
  which is a client's text and may hold a line break. A review that is not available, or not allowed, throws a named error with no
  value.
- **The language is one constant, `NOTICE_LOCALE`, set to `ro`, and Q34 is owed to the owner**: Q5's answer (*"(a), and the WhatsApp
  action built on the customer's own share link, as recommended"*) does not say in which language and no record does. Recommended:
  Romanian whatever the customer's locale, with that locale on a line of its own. **The notice leaves (seventeen `leadNotice` leaves
  in `ro.json`, `ru.json` and `content.ts`) are drafts**: the Romanian is drafted copy in the copy lock marked *"Drafted, not
  approved:"* (ADR 0095; the lock only grew, 34 lines added and none removed [ran: `git diff --numstat`, the architect]); the
  **Russian is unsigned, the file's standing state, and read by nothing while the language is `ro`**. *Preț* is a label and not a
  sentence; the figure and the two lines under it are the review's own words; the disclaimer's missing diacritics are the owner's
  existing item, now on one more surface.
- **The inbox is not a full second copy** (Q13 (ii), corrected by the security reader's J-S2.5): the notice carries what the shop acts
  on, and not the consent text's version, the phone as typed, the title, the settings row, the *not included* line or the overflow
  warning (JL-R1.2 and JL-R1.4: nothing the shop builds from is lost, and a target of neither kind fails for its snapshot). The stored
  row is the whole record.

### 9. What leaves to the third party, and what does not

*The security reader's list [reviewer, source-read at `08ead7b`, and the facts' lines at `ab5d77a`].* **To the provider:** the
reference; the customer's locale; the name; the phone's normal form; the locality or a dash; the channel's own word; the e-mail only
with that channel; the room line, the groups, the rows with each body's facts under its row, the figure and two disclaimer lines
(or the callback line). **Not sent:** the design id, the revision, the consent text's version, the phone as typed (and no design link,
ADR 0114 B7, nothing from the customer in a header, no `html`). **The client request id leaves in the `Idempotency-Key` header:
accepted by the security reader, since the provider receives the details themselves and the id adds nothing for it.** A fact line holds
catalogue words and numbers and at most one customer-authored value, a free colour, which the document's schema limits to `#` and six
hex digits. *Recorded limits:* within its own line a name may still imitate a label, and a mail client may link an address. **The inbox
is therefore not a full second copy:** no proof of consent is in it; the database alone holds that. The provider keeps account data,
metadata and thirty days of each message's content in the United States [doc, vendor, plan] (the privacy text naming a processor is the
owner's, Q7 and Q13; M9). The provider's answer is never passed on: its body can quote the recipient's address or the message, so what
survives of a failure is built, a kind and a status as a number. **A key created with sending access only** is an owner action,
because one with full access, leaked, reads thirty days of notices.

### 10. Two amendments of standing records

**ADR 0148 decision 3 and 8D's criterion 10: two named callers of `describeReview`** (Amendment C of ADR 0148, written with this
record), and **ADR 0138 decision 4: the notice is a recorded addition** to the modules that may go near a price, and derives nothing.
Both came from S3's stop, which was right: the plan had ruled S3 without reading 8D's criterion 10.

### 11. The records that speak of mail stay as they were

ADR 0001 d7 (*provider-neutral server API*) is kept: no provider's name in the port, the fake, the kinds or the notice; one adapter file
holds it. ADR 0001 d6 is kept (the e-mail line only with that channel). ADR 0019 d8's e-mailed edit link is superseded by ADR 0115;
no link e-mail is built here and Q12 (ii) is 8L's, which widens the port. ADR 0115's note (M8B *builds on M8's mail port and its
recording fake*) is kept: the fake records, and a recipient is M8B's change under its own review.

### 12. The closing rule (the architect's, open to the owner)

After the fix round after QA, a finding was fixed inside 8J only if a message is sent that should not be; a secret or a customer's value
leaves in an error, a log line, a header, the subject or the key; or the notice shows anything but the stored review. Anything else is
recorded with its trigger. The last small commit (`bb26f6c`: the guard throws unconditionally; a named object for `groupLines`) was
dispatched by the coordinator directly from the reviewers' final notes, without a new architect section.

## Alternatives not taken

- **The notice built from `describeBreakdownRows`** (S3's (b)): a second composer of what a review shows (room line, figure,
  disclaimer), the drift the one model was built to end; criterion 7 would rest on a parity test and not on construction.
- Re-pricing in the notice, a sentence of its own about the price, or any rounding of its own.
- A third selection condition that the database is the test database (decision 7).
- Catching the unreadable body as *unreachable* with no status for a `429` (F2): the status is kept.
- Sending the message after judging it and reading it again (F1): one read into a copy.
- A shape for the reference or the id in the notice (O5): unequal ids give unequal keys and an id the header cannot carry is refused
  unsent by the adapter.
- Refusing a flag beside mail variables only by `NODE_ENV`; weakening the rule so a developer's `.env.local` with a mail name
  passes the contact specs (J-S1.6: the rule is not weakened to mend that).
- Selecting among the model's facts for a row (decision 8).

## Limits recorded, not fixed (ADR 0118)

Each with its trigger.

- **O1.** An `id` of blank characters is an acceptance; the evidence of acceptance is the 2xx and of the `id` only that it is not
  empty. *Trigger:* the provider is seen to answer so.
- **O3.** A getter in the environment that throws leaves the reader, the selection and the factory as its own error, never as a sender
  and never with the key. *Trigger:* a caller that hands over anything but `process.env`.
- **O6.** An address the reader accepts and the provider refuses reads *configured* and is *refused* on every send [inf]. *Trigger:*
  the owner's one real send, which proves both.
- **O7, with J-S2.3.** A body the adapter does not read is not cancelled [inf: the connection is held until collected]; a cancel can
  itself reject and nothing is held past the request. *Trigger:* failures in number; then the body is cancelled.
- **J-S1.5, a must-not for 8K and M8B:** no route, action or log shows what the fake holds.
- **J-S1.6.** A pasted value ending in a line break reads *unavailable* (the runbook's); an empty mail variable counts as present, so on
  a machine whose `apps/web/.env.local` defines one the contact specs fail loudly once 8K wires them; the rule is not weakened.
- **JL-R1.2 to JL-R1.4.** The title, the settings row, the *not included* line and the warning are left out; a target of neither kind
  fails for its snapshot (O5; the store reads a target as "design or not", the notice as "intent or not"); which member of an error's
  body is its name is unproven (JL-R1.3).
- **JC-R1.8.** The adapter's answer mapping is not in a module of its own; the file is one provider's one exchange, 231 lines. *Trigger:*
  a second adapter, or the file's next change of behaviour (backlog 160).
- **The tripwires are source-text scans** (decision 7) [reviewer, security, source-read]. The one source-wide scan
  (`apps/web/tests/lib/server/mail/create-mail-sender.test.ts`) reads every source file under `apps/web/src` for the fake, the adapter
  and `readMailConfiguration` and checks itself by requiring the factory among the namers. **It cannot see** a specifier or member name
  built from parts at run time, a re-export under another name from a file inside `lib/server/mail`, or files outside `src`.
- **The fake's residual.** The fake's outcome stays the same as the provider's to its caller and it cannot stand for the provider; a
  deployment given the flag and no mail variable answers success and sends nothing (decision 7).
- **A mail client may turn an address-like name into a link**, and the provider keeps thirty days of content in the United States.
- **For tamper cases, O4:** for a snapshot that has been tampered with, errors other than the two named ones leave the notice (the
  review's divergence error, which lists placement ids; a `RangeError` quoting the stored total; a `TypeError`); none holds a contact
  value. 8K treats any throw from the notice as one fixed failure.
- **Fixtures and tests:** the mail tests' fixtures are duplicated between the developer's and QA's files (JC-R1.12, backlog 158); the
  restated pairs and the nits wait for the milestone-close test audit (JC-R1.13, backlog 159).

## What is unproven until the owner's one real send (criterion 9)

No real message has been sent by any test, gate or agent. **Unproven:** that the provider takes the request as built; where an error's
name sits (and so the whole split of *busy*, *quota spent* and *payload mismatch* by name); the `403` without a `User-Agent`; what the
deployed runtime's `fetch` answers under `redirect: "manual"` and that the framework's `fetch` neither caches nor repeats the POST; a
replay under one key; delivery; SPF, DKIM and DMARC (M9). The one real send is the owner's, or on the owner's word, once, from a
deployment where the variables are set, and a later close-out quotes it. It would also capture one real error body.

## What later waves inherit

- **8K** (the plan's lists and the three reviewers' and QA's notes merged):
  - Import only the factory (`create-mail-sender`) and the selection, and nothing else of the mail.
  - Call the factory with the process's environment inside the request and keep no sender at module level.
  - **Any throw from the notice is one fixed failure, never rethrown and never logged** (O4): a rule change between attempts can make a
    stored request throw for good.
  - *Payload mismatch* is not an acceptance and is not retried; whether the provider replays a stored failure under a key is unproven.
  - A notice made again from the live design can differ from the stored row; a deploy that changes this text, a sender or inbox
    variable, or the price book between an attempt and its retry inside a day answers *payload mismatch*.
  - Resolve the content in the notice's language by name (`NOTICE_LOCALE`), explicitly.
  - Pass only a validated request as plain data, and `snapshotSubmission`'s result untouched (ADR 0153).
  - Count failures; no route, action or log shows what the fake holds; the flag's line lives in `playwright.config.ts` alone, and 8K
    owns the call site; `MAIL_FROM_ADDRESS` must be a bare address.
  - On a machine with a mail variable in `apps/web/.env.local` the contact specs fail loudly by design.
- **8M, M8B and Q12 (ii):** the port's message has no recipient; a mail to a customer, or a link e-mail, widens the port under its own
  review.
- **8T, the phase gate:** *`LEMNARIA_E2E_FAKE_MAIL` is defined on no deployment.* The owner reads the variables' names for production,
  preview and development on the host, and the name is in none. Names only; no value is read or printed.
- **M9, the launch gate:** *the three mail variables are set on production, the key has sending access only, the fake's flag is absent
  there, and the owner's one real send is quoted.*
- **The owner:** the three variables on a deployment, the key created with sending access only; a verified sender domain (DNS records)
  and a bare sender address; the shop's inbox; then the one real send; Q34; the notice's wording is a draft; the closing rule; the shop's
  phone number is still owed for 8M.

## Evidence

- **[coordinator-run, at `45e2c39`]** the whole web suite exit 0: 347 files, 6589 passed; web typecheck 0, lint 0; root
  `pnpm format:check` 0; `pnpm gate:boundary` 0. In the mail module's source: one console call (the factory's fixed warning), no
  `process.env`, no `NODE_ENV` [coordinator ran grep]. No dependency, lockfile, `packages/`, `playwright.config.ts`, `src/review` or
  `src/price` change in the wave [coordinator ran `git diff --stat`].
- **[QA-run, m8-8j-qa, five passes]** pass 1 red on F1 to F3 (9 tests), 77 mutants none surviving; the re-check green, 11 mutants; after the
  reviews green, 7 mutants; the last pass green. Criterion 7 over 357 kitchens made by the domain's public `snapshotSubmission`
  (straight 94, L 88, right-hand L 88, U 87) stored under a book that makes stored differ from live in all: the notice equals
  `describeReview` over the stored snapshot in all and the live re-pricing in none; after round A the same over 357 dressed kitchens
  (every body a handle and its material's own finish), with floors per arm. The same bytes across three TZ/LANG pairs. Every control
  character U+0000 to U+001F, U+007F to U+009F, U+2028, U+2029 in six fields throws the named value-free error; a bidi override, ZWJ,
  BOM, a half surrogate, a URL, `=HYPERLINK`, `<script>` and ICU syntax print inert on their own line. Digests over 357 notices and a
  callback (`6e622520…946b`) and over 357 dressed (`6926a055…2607`) equal at `5c01858`, `e26655f` and `bb26f6c`; not pinned in a test
  (QA's choice, stated).
- **[reviewers]** logic: approve at `ab5d77a` (JL-R1.1 closed). Security: approve at `ab5d77a`, no open security finding (S1 read, the
  wave, a diff re-check; its probes replaced `fetch`, no request left a process). Clean-code: changes required at `08ead7b` (five
  must-fix in tests), four closed at `ab5d77a`, JC-R1.3 fixed by QA in `45e2c39`; **clean-code approves at `45e2c39`** (it read the diff `ab5d77a..45e2c39` in full;
  JC-R1.3 and JC-R1.19 closed; no new finding; it ran no suite). All three reviewers approve. **`bb26f6c`'s two changes were made on
  the reviewers' final notes and were re-read by QA and the clean-code reader, not by logic or security.**
- **[vendor]** the architect fetched four Resend documentation pages on 2026-10-09 (copies in the session scratchpad, not in the repo);
  they show no error body at all.
- **Deviations:** S3 stopped on a conflict between the plan and two existing gates (decision 10) and the stop was right; the developer
  committed its own rounds from S2 on (explicit paths, hook on) by the coordinator's choice; the last small commit was dispatched by the
  coordinator directly (decision 12); none of the generated kitchens has a body with its own finish or handle, so both the developer's
  and QA's proofs of the facts' lines use dressed kitchens.
- **Commits** on `m8-review-contact-success`, local, not pushed [coordinator ran `git log`]: see the plan's *8J as closed*.
- **Not run / not proven:** `pnpm check`, `pnpm ci:local`, e2e, anything on a CI runner; and anything against the live provider
  (list above).
