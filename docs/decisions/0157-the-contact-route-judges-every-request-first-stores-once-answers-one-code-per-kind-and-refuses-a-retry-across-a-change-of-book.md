# ADR 0157 — The contact route judges every request first, stores once, answers one code per kind, and refuses a retry across a change of book

Status: Accepted, with the three figures of **Q39 provisional**. **Open to the owner:** Q39 (three figures) and **Q40** (a stored, un-notified request retried after the design or prices changed; **built on (b)**; "(b) is exact within one deployment, (a) always"). Neither blocks the build. **Named interim:** with no network source the world shares three new requests an hour. **No real mail has been sent**; the one real send is the owner's. Nothing is deployed.
Date: 2026-10-12
Type: Decision
Milestone: M8 wave 8K (`POST /api/contact-submissions`)

The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (wave 8K, *8K, restated for dispatch* through *the three reviews*) and the coordinator's close-out hand-over. Every decision cites its plan section. The scribe has no shell and ran nothing. Tiers: **[doc]**, **[src]** (read in the code by the plan's author or a reviewer), **[inf]**; every figure says who ran it.

## Context

8H made the request's one definition ([ADR 0150](0150-the-submission-contract-is-one-io-free-definition-a-request-holds-no-price-reads-only-what-the-sender-wrote-and-the-snapshot-and-the-review-share-one-refusal-rule.md)), 8I the store ([ADR 0153](0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md)), 8J the mail ([ADR 0154](0154-mail-leaves-through-one-provider-neutral-port-and-one-resend-adapter-that-sends-once-and-answers-with-one-of-seven-kinds-and-the-shops-notice-is-the-stored-review-printed-never-priced-again.md)), and 8F and 8G the limiter ([ADR 0155](0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md), [ADR 0156](0156-saves-shares-and-reads-are-limited-by-subjects-made-only-by-two-constructors-writes-fail-closed-reads-fail-open-pages-are-counted-in-the-interceptor-and-the-saves-wait-is-one-write-the-client-holds.md)). 8K is the boundary that joins them: it revalidates, refuses abuse, snapshots the stored design, stores once, notifies, and tells the customer the truth (the plan's 8K *Goal*). The bot check and the global bucket are M9's (*Scope restated 2026-10-07*).

## Decisions

### 1. The order: every request is judged first, a design is proved sendable before a new request is counted, and the notice is proved buildable before the record

Cross-site guard (nothing counted); body to its bound before it is parsed; **every request's bucket, by network**; the request's shape, the honeypot and the time (one refusal); what cannot send; the payload's digest and the lookup (*absent*, *stored*, *conflict*). *Stored or conflict:* the tries' bucket for that request, never for an id the lookup answered absent. *Absent:* the id's shape and the owned load at the stated revision; the snapshot; **the notice built once with a placeholder reference of the right shape**; then the new request's four buckets, one step at a time, each asked only when the one before allowed; the record; the notice with the stored reference; the send; the mark [plan: *restated for dispatch* point 3; *S0's security read*, K-S0.2 and K-S0.7; *S3's security read*, K-S1.4]. *Why:* a stale revision or a kitchen past its wall must not spend one of a browser's two an hour (K-S0.2), and a request whose notice cannot be made stores nothing (criterion 15). S4 starts at every request's judgement and takes the body's text; the route keeps only what nothing counts (K-S1.4).

### 2. The digest covers fourteen fields, the price book's version last; one book is taken once

The digest covers every stored and mailed field of the validated request and, for a design, the version of the book the server would price under; the honeypot's answer and the elapsed time are left out; the address is covered as typed [plan: *S1 and S2 as built*, src at `be64e3f3`]. A test fails when the request's type gains a field that is neither covered nor named as left out. **A retry across a change of book is a conflict, refused cleanly** (K-S0.1). *It cannot be added later:* a change of coverage changes every digest. **One book (K-S1.1):** handed in once for a request as a value; its version is what is digested; that same value prices the snapshot; wherever a snapshot is made its own `pricingVersion` is compared as text with the digested version before anything is stored or sent; unequal fails its region with the cause `price-book-mismatch`.

### 3. Q40 is built on (b): the retry is refused, and no grant is added

(b) lets the application read back no stored request's kitchen or price; a retry after an edit or a change of prices is refused, the customer reviews and sends again as a new request, and the first stays un-notified. The security reader holds (b) the safer: a leaked credential reads no kitchen and no quoted price [plan: K-S0.1]. **(b) is exact within one deployment, (a) always** (KL-R1.1, recorded beside K-S1.7): the digest covers the id, the revision and the book's version, not the pricing code, the catalogue or the notice's words, so across a deployment that changes one of those the provider refuses the retry as another payload, or after its day it is sent with lines that are not the stored row's. The recommendation stays (b). Q40 widens Q14, which is why it is the owner's.

### 4. Which refusals are one, and which may differ (K-S0.4)

**One:** the honeypot and the time; every way the owned load fails, an id of the wrong shape included (`409 CONTACT_DESIGN_NOT_CURRENT`, equal in body and headers, shown by a test); every limit refusal whichever bucket (`429 CONTACT_LIMIT_REACHED`, with `Retry-After`; the e-mail's bucket never has its own code); every *unavailable* (`503 CONTACT_UNAVAILABLE`, byte-equal across every cause). **May differ:** the schema's issues by field and code, never a value; the fit's refusal with its bodies' ids (`422`); a conflict (`409 CONTACT_REQUEST_CONFLICT`); a provider's failure as two outward answers (`502 CONTACT_NOTICE_NOT_SENT_RETRY`, `502 CONTACT_NOTICE_NOT_SENT`) with its kind in the line. A cross-site request is `403`, a body not JSON by its content type `415`, a body past its bound `413`; none counts. Every answer is JSON with a sentence and a code, `no-store`, and sets, clears or refreshes no cookie; none holds a submitted value; a failure never holds the reference [plan: *S1 and S2 as built*, S3's table; K-S0.8].

### 5. Success is a stored row and an accepted notice; two regions of failure

Success only with a stored row and an accepted notice (D8). A mark that fails after an accepted send is still success, with a line. **Two regions (K-S1.2):** before a reference is held a throw is *unavailable*; **a reference is held from the record's answer, and, for a retry, from a lookup that answered stored and not notified once the tries' judgement allowed**, and from there a throw is `502 CONTACT_NOTICE_NOT_SENT_RETRY` with the not-passed-on line and the reference (a mail failure's kind **or** a cause from the closed list, never both and never neither). The sender is made once, before the lookup, and that one is used. **Criterion 8, read exactly (logic):** *unavailable* means nothing is known to be stored; a record that rejected may have stored (ADR 0153).

### 6. Subjects, figures and the day

Three subject constructors, each throwing for a text that is not its source's: a visitor's hash (sixty-four hexadecimal characters and nothing else), an address's counted form, a stored request's id. A request with no visitor cookie skips the browser's step; the network's two stand (K-S0.3). **One domain function makes an address's counted form: lower case, nothing stripped** (K-S0.5). The contact form's day is **the UTC day**, so the Chișinău day's totals stay the mint's alone (the architect's). Six policies; the purposes are `contact-every-by-block`, `contact-new-by-block-hour`, `contact-new-by-block-day`, `contact-new-by-visitor`, `contact-new-by-address`, `contact-tries-by-request` [src, at `be64e3f3`].

| Bucket | Figure | Source |
| --- | --- | --- |
| A new request, by network | 3 an hour, and 10 a day | ADR 0019 d5, the contact form's row, its Moldovan column for everyone |
| A new request, by browser | 2 an hour | The same row's *Session*; the subject is the visitor's hash |
| A new request, by e-mail | 3 a day | The same row; only when the channel is e-mail |
| **Every request, by network** | **30 an hour, provisional** | None. **Q39** |
| **Tries of one stored request** | **10 an hour, provisional** | None. **Q39**; criterion 6 needs at least six |
| **The least time a form took** | **2 seconds, provisional** | None. **Q39**; 8L's phone check: an autofilled form sent by a real tap must pass |
| The body | 8 kilobytes, counted as read | The security reader's figure (ADR 0154) |

**Q39 (the owner's; the build does not wait):** three numbers no record gives: how many contact requests of any kind one network may send in an hour (30); how often one stored request may be tried again in an hour (10); and the least time a form must have been open (2 seconds). The e2e twins are one for each bucket the suite's one block shares, set by the rule of three times a whole run, rounded up to the next hundred; the final run counted against twins of 100 [relayed, QA's].

### 7. Lines: closed lists, and nothing a thrown value said

A line may hold a code, a status, a policy's name or a cause, a mail failure's kind, and the reference where a request is stored and was not notified, or was notified and its mark failed. It never holds the client request id, a design's id, a visitor's hash, a body's id or an issue's value (K-S0.6). Causes are a closed list: the limiter's seven, and `sender-unusable`, `submission-store-failed`, `notice-unbuildable`, `unexpected` (and `price-book-mismatch`, K-S1.1). A limit refusal writes one line for a process and a policy; any other refusal but the honeypot's and the time's, one for a process and a code; the honeypot and the time write none. **A stored request refused for its design writes a line of its own with the code and the reference, each time (K-S1.3).** The log imports the mail port's own list of kinds, never the adapter (KC-R1.10, ruled).

### 8. The route is thin; the server has its own price-book root (amends ADR 0062 seam 1)

Neither of two older tests is loosened to name a route [plan: *S5: the route composed what two invariants reserve*]. The contact's production ports are made by one module under `lib/server/contact` (`contact-production-ports.ts`), once for a request, holding nothing at module level; the route imports no digest module, no book, no mail and no message file. **The server gets one price-book root of its own, `lib/server/shipped-price-book.ts`; the application has two roots, the browser's and the server's, each named, and both name the same book.** A dated note is on [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1 and a pointer on [ADR 0148](0148-the-review-refuses-one-thing-at-a-time-the-first-the-customer-can-act-on-and-no-cabinet-means-nothing-lemnaria-supplies.md) decision 3. **Interim, with its trigger:** two roots are two substitutions; if one were changed alone a customer would review one price and the shop would be sent another, and nothing would catch it. **Before either root names another book, they become one** (backlog 176).

### 9. One predicate of a reference's shape is exported (K-S1.5)

The persistence package exports **one** predicate, the table's shape, which the store already tests its own answers with [src `neon-contact-submission-store.ts:325-331`]; the generator's look leaves the exports again. The answer and the lines test by that one. **No route opens anything by a reference**, which stays a must-not. A dated note is on [ADR 0153](0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md).

### 10. What the review rounds changed in behaviour

Round A [plan: *the three reviews*, A]: the judge's making and every request's judgement moved inside the guard, so a maker or a clock that throws is `503 CONTACT_UNAVAILABLE` with its line and never the framework's own (R4, K-S2.3; `9fc941e6`). The notice's translator is given a handler that throws, so its failure writes nothing of its own and is the one `503` (K-S2.4; `a2f0a95d`, after a test that first showed what the default writes). Rounds B and C were no-behaviour changes (one function judges a bucket; a refusal's line and answer made from one code; the parse and automatic check in a file of their own). Round D and QA's own items were tests only. **A stored request's retry whose notice leaf fails is `502 CONTACT_NOTICE_NOT_SENT_RETRY` with `notice-unbuildable`, not the `503` that the commit message of `a2f0a95d` implies** (as ruled; criterion 8 holds) [security, round-2 note 2, reviewer-read, relayed].

### 11. The harness

Two test-only functions in the persistence package (one removes the requests whose ids it is handed, ids of the request id's shape only, by `client_request_id = any(ids)` alone; one counts them with no column selected), behind the one test-runner guard and the guarded test database; the store's lazy instance in a module of its own; the suite's server is given the fake mail's flag and no mail variable; the teardown removes the run's requests and counter rows and fails above half a twin's figure; one spec goes through the real route, store and fake sender, and rows are counted in the database (criteria 5, 13). *Must not, every slice:* a subject made outside a constructor; a sender, store, book or variable held at module level; a submitted value in an answer or a line; a figure outside the policy module; a `qa-*` file edited; **a mutant sent to a database.**

### 12. The closing rule (the architect's)

A new fix round only for a branch on which personal data leaves; a request stored or mailed that should be refused, or refused that should be stored; anything counted, looked up, stored or sent before its check; a caller told which limit or which unavailable; or a test touched by these rounds that cannot fail for its title. Anything else goes to the milestone-close audit. The wave closed on the round-2 re-checks, which met none of these.

## Alternatives not taken

- Q40 (a), a narrow read-back grant (decision 3): not needed once the book's version is in the digest.
- A second look-up after a refusal, giving hits back, or a claim on the id, for calls at once under one id (R1): each is a new power in the limiter or traps the honest retry, and each needs the security reader (decision in *adjudication of QA*).
- Amending the two older tests to name the route (decision 8); one shared price-book root now (decision 8): right in the end, refused for this slice because moving the browser's ingress moves QA's pins and is a change to the editor's price path.
- Decoding bytes strictly for this route (R2), and a second way to read a body.
- A bot check and a global bucket: M9's.

## Limits and recorded notes, each with its trigger (ADR 0118)

- **Calls at once under one id are each counted as new** (R1, K-S2.1; backlog 175). One row, one reference, no false success; one request can spend two of a bucket. Bound: the network's hour. *Trigger:* 8L cannot hold the one-request-in-flight criterion; or a customer is reported refused for a request the shop received; or the delivery milestone's hardening of the form, whichever is first. *Not proven:* that two messages under one key are one at the provider.
- **Bytes that are not UTF-8 are stored and mailed as replacement characters** (R2, K-S2.2; backlog 178). *Trigger:* anything that reads a stored contact field as bytes, or the shared reader gaining a strict mode for another reason.
- **A deploy that changes a figure of a book and not its version is not caught by the digest** (K-S1.7), and the digest does not cover the pricing code, the catalogue or the notice's words (KL-R1.1; backlog 181). *Trigger:* a deployment while a not-sent line is in the log.
- **A design that cannot be priced is answered *try again* each time** (KL-R1.5). *Trigger:* an `unexpected` cause in the log.
- **The ports are made before the first count; nothing of the request is read to make them** (KL-R1.6), recorded with M9's shield.
- **Since `a2f0a95d`, leaves read eagerly when the ports are made throw, so one unreadable leaf of `ro.json`, even one the notice never uses, makes every contact request `503` with cause `unexpected` rather than `notice-unbuildable`** (KL-R2.1; backlog 179; `contact-production-ports.ts:47-59`, `route.ts:80-89`); closed (nothing stored or sent). Which leaves are eager is the reviewer's **[inf]**. *Trigger:* a `contact-request-unavailable` line with `unexpected` on every request after a catalogue change. *Direction:* a build-time test that the shipped catalogue resolves whole. A2's tests stop at the port; no test takes a real missing leaf through the notice builder to the `503`/`502` (KL-R2.2, security note 3).
- **Rest on what the client states:** the least time and the honeypot; the buckets are the bound. A sender who varies the address is bounded by the network alone; a caller refused for a day learns that an address was used three times that day (K-S0.5, K-S0.4).
- **A stored request that is never notified** is invisible to the shop: nothing in M8 reads it back; the log line carries the reference and no detail (a named interim for the delivery milestone). **The free quota is 100 messages a day** [ven §4] and, with the contact form's global figure not built, nothing stops a spread of addresses from spending it; while it is spent every customer sees 5B. The delivery milestone's shield is the answer.
- **The two price-book roots** (decision 8; backlog 176).
- **The log tests mail failure kinds against the mail port's own list**, equal to the removed copy today (KL-R2.3; backlog 179).
- **`prepareSubmission` takes three arguments** (`prepare-submission.ts:38-42`: request, payloadDigest, sources), known and recorded (backlog 180).
- **Named interim:** with no network source the world shares three new requests an hour.

## What is unproven

- **No real mail has been sent**; anything against the live provider (the one real send is the owner's); that two messages under one key are one at the provider.
- Anything as the role `app_designs`; anything on a CI runner or a deployment; the host's header and interceptor runtime; the Chișinău zone on a deployed runtime (ADR 0156's list also stands).
- That next-intl propagates the handler's throw and writes nothing rests on `a2f0a95d`'s tests; the security reader did not read next-intl's source.
- `pnpm check`, `pnpm ci:local`, e2e in dev mode.
- The **domain** suite was **not re-run** after `be64e3f3`. `2b8955cc` changed one persistence test file (`qa-8k-contact-test-only.adversarial.test.ts`); QA's own run of it is **not relayed** (the coordinator's persistence run is under *Evidence*).
- What each round-2 reviewer did not read: logic did not read round B's rate-limit modules, C's tests, D or QA's commits; security did not read C's items 2 to 5, D or QA's files; clean-code did not read the new files `contact-refusal.test.ts` and `parse-contact-request.test.ts`.

## What later waves inherit

- **8L** carries four criteria (the plan's 8L section): one request in flight; a retry carries the same id and the same body after any answer that is not success, and after none; a new id whenever anything the digest covers changes, the revision first; the sentence for `CONTACT_DESIGN_NOT_CURRENT` asks the customer to review the design again and never says it changed.
- **Backlog 168's wave** runs before 8L (the load that 8L changes must be reached first).
- **The milestone-close test audit:** backlog 177.
- **8T's gate / the owner:** `DIGEST_SECRET` per environment; `CLIENT_NETWORK_SOURCE` as in ADR 0156; the mail variables; Q39, Q40; the one real send.

## Evidence

- **[coordinator ran `git log`]** commits on `m8-review-contact-success`, local, not pushed: S1 `16681974`, `0b3f6f32`, `8a8af6df`, `1664aac4`; S2 `866c08aa`, `a57e11fa`, `be64e3f3`; S3 `e862b44b`, `a6291d52`, `2b287c07`, `1c78f0dd`; S4 `bff553e1`, `70fb82c4`; S5 `62209a20` … `f435e70d`; QA's adversarial pass `45095836`; fix rounds A1 `9fc941e6`, A2 `a2f0a95d`, B `ddba03c4`, C `eaa52955`, D `54d0edce`, `d7ca0c27`; QA's own items `2b8955cc`; `8782ad17` (the e2e helper's old alias `expectStoredOnce` removed; coordinator-made, no behaviour; no importer remained [coordinator ran a grep through `rtk proxy`, exit 1]).
- **[coordinator-run, 2026-10-12, with the change of `8782ad17` in the tree, before its commit]** web typecheck exit 0, lint exit 0, the whole web suite exit 0: 419 files, 8597 passed; root `pnpm format:check` exit 0; `pnpm gate:boundary` exit 0.
- **[coordinator-run, 2026-10-12, at `8782ad17`, alone, `CI=1`, a build and `next start`, tree clean before and after]** one whole e2e run: exit 0, **778 passed**, 9.5 minutes. The five tests the log marks failed are all marked expected to fail or deliberate (`seeded-design.qa` :35, deliberate; `qa-8d-review-arrival.adversarial` :500 and :524; `qa-8g-leave-while-waiting.adversarial` :471 and :498, backlog 168). The teardown's line: minted 531 designs, 71 share writes, 338 saves, 18 contact requests of any kind, 8 new ones counted in the hour, 8 new ones counted in the UTC day.
- **[coordinator-run, 2026-10-12, at `8782ad17` with only the uncommitted `docs/` changes in the tree, alone]** the whole persistence suite: exit 0, 91 files, 2666 passed, 2 skipped.
- **Earlier: [coordinator-run, `70fb82c4`]** the whole persistence suite 90 files, 2644 passed, 2 skipped. **[coordinator-run, `be64e3f3`]** the whole domain suite 303 files, 7745. **[QA-run, `45095836`]** the adversarial pass green, 58 mutants.
- **Reviews.** Round 1 at `45095836` [relayed]: security APPROVE, logic APPROVE WITH NOTES, clean-code 7 must-fix, all taken in rounds A to D. **Round 2, diff re-checks at `8782ad17`, 2026-10-12, all read-only, no reviewer ran a suite [reviewer-read, relayed; the coordinator spot-read `submit-contact.ts:118-134`, `contact-refusal.ts:14-36`, `contact-production-ports.ts:44-60` and grepped that `judgeInSequence` and `ContactStoredRefusalCode` are gone]:** clean-code APPROVE (B, C, D, QA's, the alias); security APPROVE, no new finding (A1, A2, B, C item 1); logic APPROVE WITH NOTES (A1, A2, C items 1 to 3; the order at HEAD equals the ruled order on every branch, with the one ruled change of A1). Nothing met the closing rule; the wave closes on these re-checks.
- **Round-2 notes** (none a closing-rule item): KL-R2.1 to KL-R2.3 above; **KC-R2.1** `apps/web/tests/lib/server/contact/contact-responses.test.ts:116`, a title that says more than the test asserts (it can fail; not a dead test; KC-R1.17 is therefore partial); **KC-R2.2** `apps/web/tests/lib/server/rate-limit/contact-policies.test.ts:98` and `:103` name "Q39" in test titles; **KC-R2.3** noun-named functions in `submit-contact.ts` (`digestOf`, `countedAddressOf`, `storedOrPrepared`) and in `tests/e2e/global-teardown.ts` `summaryOf` defaults a twin missing from the map to zero. All in backlog 177.

## Dated note — 2026-10-13, waves 8L and 8M (the scribe; relayed; nothing re-run)

**The client's side of 8L's criteria 10 to 12 (the plan's point 12 left this note owed):** one request in flight (no abort, no timer), the same id and the same body on a retry after any answer that is not success and after none, and a new id after `CONTACT_REQUEST_CONFLICT` or when a covered field or the revision changed (8L.3, 8L.4, 8L.5; ADR 0159 decisions 2 and 3). **8M adds:** an answered `502` (either code), `503`, `400 CONTACT_REJECTED` or any other answered failure is **retried only by a press**, never automatically, because each try spends the request's tries bucket (decision 1 here); the one automatic retry follows an `unanswered` send (a fetch with no answer) on the browser's `online` event, under the same id and body (ADR 0160 decision 1). 8M reads the stored request back once, for `/done` after a reload: `findSentReference`, by design id and revision, behind the owned load, opening nothing by a reference (decision 9 stands). A stored row whose notice was accepted and whose mark failed (decision 5) is shown as sent to the tab that got the `200` and as no request on a later load.

## Dated note — 2026-10-17, waves 8J2 and 8V (the scribe; nothing re-run)

- **The quota line** (*What is recorded*, *"The free quota is 100 messages a day"*) described Resend. Since
  [ADR 0164](0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md)
  decision 8 the limit is Gmail's, about 500 recipients a day for a consumer account (an owner-brief figure, not yet
  quoted from Google). The class is the same: at the limit the request is *quota spent*, 5B, stored un-notified.
- **The route mints a link per delivery attempt** ([ADR 0165](0165-the-shops-notice-is-a-branded-html-email-with-a-plain-text-fallback-led-by-a-frozen-view-only-link-to-the-kitchen-as-sent-and-the-done-page-shows-the-customers-own-design-link.md)
  D4): the order and the outward codes are unchanged, and a failed mint sends the notice with the link unavailable.
- **A limit found at 8V's review, not new in 8V [relayed]:** a retry under the same price-book **version** re-prices
  from the live book, so if a book's amounts change without its version, a retried notice can show a different figure
  than the first attempt. Fixing it needs the stored snapshot read back, which the application role cannot do
  (backlog 250; related to K-S1.7 above).
