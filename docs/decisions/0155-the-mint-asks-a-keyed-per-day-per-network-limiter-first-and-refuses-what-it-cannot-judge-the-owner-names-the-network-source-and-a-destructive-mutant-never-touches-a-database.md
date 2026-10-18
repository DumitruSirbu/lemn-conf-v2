# ADR 0155 — The mint asks a keyed, per-day, per-network limiter first and refuses what it cannot judge; the owner names the network source; and a mutant of a destructive statement never touches a database

Status: Accepted. **Open to the owner:** the closing rule (decision 11), whether twenty a day counts attempts or designs made (limit
FL-R1.3), the limit notice's look and its draft words, and **Q35 (the two-tab race), which is recorded and not decided.** Nothing is
deployed; the secret and the source are not set anywhere.
Date: 2026-10-09
Type: Decision
Milestone: M8 wave 8F (the limiter and the mint)

The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (wave 8F: *8F, restated for
dispatch*; *S0's security read, ruled; S1 for dispatch*; *S1's security read, ruled; S2 to S4 for dispatch*; *S3's deviations and one
incident, ruled; S4 for dispatch*; *the three reviews, ruled*, whose end lists what this record must hold) and from the coordinator's
close-out hand-over. The scribe has no shell and ran nothing. Tiers: **[doc]** quoted from a record in this repository, **[src]** read in
the code by the plan's author or a reviewer, **[inf]** inference, with what would falsify it. Every figure says who ran it. Finding numbers
(FL-, FC-, F-S, F, O) point into the plan and the two review-findings files; they are not restated here.

## Context

The owner ruled, on 2026-10-07, that creating a design is bounded by one bucket: the network, 20 a calendar day, the same for everyone and
nothing else ([ADR 0147](0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md), with Amendment A: a block
of 256 for IPv4, /64 for IPv6). ADR 0019 d5 says a store that fails refuses the write. 8E built the counter store ([ADR 0149](0149-the-rate-limit-store-keeps-one-row-per-bucket-per-window-refuses-a-broken-promise-and-may-count-high-but-never-low-between-prunes.md)),
whose amendment made the digest keyed from the first deploy by one secret; 8J built the flag-and-fake pattern ([ADR 0154](0154-mail-leaves-through-one-provider-neutral-port-and-one-resend-adapter-that-sends-once-and-answers-with-one-of-seven-kinds-and-the-shops-notice-is-the-stored-review-printed-never-priced-again.md)).
8F makes `POST /api/designs` ask the limiter, keyed, before anything is minted, and makes Step 1 say so. Backlog 125's triage, which
preceded it, is in the plan; its one defect is Q35 below. The plan is archived when M8 closes.

## Decisions

### 1. The key: HMAC-SHA-256 of length-marked parts, under thirty-two bytes

The key is HMAC-SHA-256 under **the thirty-two bytes the sixty-four hexadecimal characters of `DIGEST_SECRET` spell**, of: the purpose,
then each field, **every part written as the count of its UTF-8 bytes in plain decimal, a colon, those bytes and a comma** (not a text's
length). The purpose is from a **closed set in code** (today `rate-limit-bucket`); the encoder refuses a `fields` object whose own keys
are not exactly the purpose's (F-S1.2), so a field is never dropped in silence; the digest accepts a key only as a `Uint8Array` of
thirty-two bytes, so text of that length is refused (F-S1.1). **A part that is not well-formed text is refused before anything is
digested**: half of a surrogate pair becomes U+FFFD in bytes and two different texts would be one key [relayed, the reader's,
recalled]. A bucket's parts are four: the purpose, the policy's name, the subject's kind and the subject. A policy's name carries its
window, so a new window is a new name (ADR 0149). Equal keys come only from equal purpose, name and subject, held as a property over
arbitrary parts including ones that hold a policy's name or the encoding's own marks (criterion 13). **One known answer is pinned in a
test**, for a key nobody would deploy, and its expected value comes from a tool that is not the function under test: the coordinator
reproduced it with `openssl` at `ad0996d` (`1bba7acd…9c52`) [coordinator-run]. The pure function has no server-only import (the e2e
harness uses it); only the secret's reader has, and a scan holds that nothing under `src` outside `lib/server` imports either.
*Alternatives not taken:* the characters themselves as the key (either would be strong enough; it had to be one); a text's length for
a part's length.

### 2. The secret's reader

One module reads `DIGEST_SECRET` and answers a digester or the variable's name. It reads the variable as **the environment's own
member, at each call, never at module load**. Usable means sixty-four lowercase hexadecimal characters; anything else is *unavailable*,
**naming the variable and nothing of its value, not its length**. *Must not:* a default, a fallback, a literal key, a branch on a build
mode. The key stays in a closure and no value that holds it is returned (8J's J-S1.1). With the secret unset or unusable no row is written
(criterion 11). **From the day this code runs in an environment, that environment creates no design until the variable is set there.**

### 3. Who a client is: the source the owner names, never one the host sets

`CLIENT_NETWORK_SOURCE` is **set by the owner, on a deployment on that platform only**, never in a local file, on another host, or for the
platform's development target (FC-R1.19: read as the platform's name). Its one accepted value is `vercel`, from a closed set in code, and
it means the address is the header that platform overwrites [ven §2]. **Absent: *none*** (one shared bucket, no header read: a named
interim, decision 8). **Present as the environment's own member with anything else in it: every mint is refused.** *Why the owner names
it and the host does not:* a variable a host sets travels with every file pulled from it, and a pulled file here already held one of its
names [relayed, the reader's names-only check]; wherever that name is present off the host the application would trust a header the
client wrote, and the rule would fail without a sound. The address is reduced to its block: IPv4 by its first 24 bits (the owner's Q32),
IPv6 by its first 64, an IPv4-mapped address into its IPv4 block; **the parser takes exactly one address**, and a list, a port, a zone, a
leading zero or anything else is the shared bucket. The subject is made from the parsed bits and never from the header's text: three
decimal octets joined by dots; four groups of four lowercase hexadecimal digits joined by colons; nothing for the shared bucket; and its
kind, one of three words in code (IPv4 block, IPv6 block, shared). *Not taken:* inferring the host from a variable the host sets itself.

### 4. The policy and the Chișinău day

The mint's one row: 20 per day per block. **A hit is refused when its count is above the figure**; the store's count includes that hit
(ADR 0149). The day is the Chișinău calendar day by the runtime's own `Intl` for `Europe/Chisinau`, from that date's local midnight to the
next, with no dependency; the zone changes its clock at two or three in the morning, never at midnight [inf: its rules as the runtime holds
them]. **A test pins, as literal instants, a day of 23 hours** (2026-03-29, from 22:00 UTC the day before to 21:00 UTC) **and one of 25**
(2026-10-25, from 21:00 UTC the day before to 22:00 UTC) [ran: the architect's runtime shows each of the four instants as a local
midnight]. If the runtime cannot name the zone the evaluator answers *unavailable* (`window-unavailable`).

### 5. The evaluator: allow, refuse with its wait, or unavailable

It takes a block, a digester, a store, a policy and an instant and answers *allow*; *refuse* with the wait; or *unavailable* with **one of
seven causes** from one closed list (the route's `judgement-failed` joined the other six; the log line's cause is typed by that list).
**It judges one bucket**; two buckets, the stricter deciding, and a refused request hitting every bucket it lists, are 8G's by name (criterion
3 was struck; FL-R1.1). **A count that is not a whole number of at least one is `store-failed`** (FL-R1.4). **The deadline is three
seconds** (the architect's figure) around the store's call, held to **at most a third of the lock's ten-second acquire timeout**, both
constants imported (the lock's gained the word `export`; FC-R1.1): the store repeats a hit after a cold start for up to two seconds, and a
second tab that waits ten seconds mints without the lock, the worse race (ADR 0114 H6). When the deadline passes the answer is
unavailable; the store's late answer or rejection is handled and dropped. **Any throw is unavailable. It fails closed** (ADR 0019 d5): a
hit may still land after an unavailable answer, which errs high as the store allows (ADR 0149).

### 6. The route's order, and a refused mint touches nothing

`POST /api/designs` runs the cross-site guard, then the limiter (the environment asked inside the request, the block made from the
request's own headers), then the token, the visitor, the mint and the cookies. **A request the cross-site guard refuses is not counted.**
**A refused or unjudgeable mint resolves no visitor, writes no `designs` row, sets, clears or refreshes no cookie and rotates nothing**;
the limiter does not sit inside the mint's transaction; and 8F changes neither the lock, the save's route nor its refresh. A seam module
(`judge-mint-request.ts`) is where the environment is asked. The store's lazy instance has a module of its own, not `repository.ts`, which
sixteen files mock whole (the architect's own fault, recorded). Backlog 90 (the rotation has no limit) is closed by this wave: a rotation
happens only in a mint the limiter passed.

### 7. The two answers and the two log lines

**`429`:** `Retry-After`, a whole number from 1 to 90,000 (the seconds to the window's end, rounded up) and a fixed sentence with the code
`MINT_LIMIT_REACHED`. **`503`:** the same shape with `MINT_UNAVAILABLE` and no `Retry-After`, answered **before any store call** when the
source or the flag is misconfigured or the digester is unusable or throws. **No count, block, key or remainder in a header or body.** Which
cause it was is in the log's code alone. A refusal writes one fixed line (a code, the status and the policy's name; of a thrown value its
type's name at most), and the e2e policy writes the one warning of decision 10. No log line holds an address, a block, a cookie's value, a
key or the secret.

### 8. *None* is a named interim

Under *none* **the whole world shares 20 designs a day, and twenty requests from a script shut everyone out until midnight**, because the
cross-site guard passes a request carrying neither `Sec-Fetch-Site` nor `Origin` [src `cross-site-request.ts`]. Acceptable only while nothing
takes customers. Until the owner sets the source a deployment runs under *none*. The gate sentences for it are in decision 12.

### 9. Step 1 and the client

A mint's `429` is **the day's limit only when the body's own `code` equals `MINT_LIMIT_REACHED`**, compared with a constant, and nothing of the
body is shown (FL-R1.2): any other `429`, a firewall's, which M9 ships beside this limiter, is the failure it was before, with its retry. The
day's-limit failure is **not retried by anything**, no save follows it, and the room's entry is kept. Step 1's hand-off gains a `limited`
state (ADR 0111's states gain one, with no retry offered); a `503` keeps the existing failure and its retry. One new leaf,
**`room.compose.limitReached`**, says no more designs can be made today and the limit returns tomorrow; it is **a draft under Q10 (a), in the
copy lock marked as drafted, in `ro` and `ru`**, the lock and the hashes grown and none moved. *Must not:* a wait in minutes, a count, or
the word for an address in the copy. The developer traced FL-R1.5 (can the editor still create a design by a save with no id?) and changed
nothing; the logic reader's own trace holds that Step 1 is the only mint [reviewer]. The notice sits in the same neutral band as a failure's,
under the ticked rows; no frame draws this state and none is owed [the architect's ruling]. A 503 retried by the client may spend a hit each
time (limit).

### 10. The e2e policy and the harness

**The e2e suite runs under a policy, not a switch**: the same route, evaluator, store and database; only the day's figure differs. The flag
is **`LEMNARIA_E2E_RATE_LIMIT_POLICY`, exactly `1`**, read as the environment's own member inside the request (never at module level) and
following ADR 0154's pattern. **Beside `CLIENT_NETWORK_SOURCE` present as an own member, whatever it holds, every mint is refused (`503`).**
Otherwise the e2e policy applies, and the first time it decides a request in a process one fixed warning of constants is written:
`rate limit: the e2e policy is in use (LEMNARIA_E2E_RATE_LIMIT_POLICY); the day's figure is not the production one`. The figure is a named
constant, **1,100: twice the designs one whole run makes, rounded up to the next hundred** (132, 191 and 184 make 507 [relayed,
developer-run at eight workers]; twice is 1,014). The constant's comment says so. A bucket lasts one invocation and one invocation may run
the whole suite. **The teardown fails when an invocation made more than half the figure**, so a person raises it as the suite grows and it
is never worn through. **Each run's keys are its own:** the run's secret is made **once in the runner's main process and handed down through
its environment**, in no file and with no literal in the repository (made where the configuration is evaluated it would differ in every
worker). The teardown computes the run's keys with `keyedDigest` from those bytes and the shared block, counts the rows, removes them
through the test-only delete (S3a, below), and **fails when it finds none**. `LEMNARIA_E2E_RUN_SECRET` is named by rule and nothing under
`apps/web/src` may name it; the second server is started without it [relayed]. **The real figure is proved twice:** on a fake clock
(criterion 8), and by one spec against a second server under the production policy with its own secret, **under `CI` only** (it shares the
first server's build; elsewhere it is skipped with a reason that gives the command; **a skip reads as fine, so the wave's QA pass and this
close-out each quote a run in which it passed**). The helper takes the port as a parameter and names both ports (4322 and 4323); QA's live
spec uses 4323. A suite-wide mock of the limiter's judgement, built in S3b, was **replaced** in the fix round: **what a test fakes is the
database, not the decision**. The test setup gives every file a random secret made in that process and the persistence package's fake as
the store, fresh for each test, so the real seam, policy, digest and evaluator run in every route test. *Not taken:* a suite-wide mock of
the decision.

### 11. The closing rule (the architect's, open to the owner)

After the reviews, a finding was fixed inside 8F only if a mint that should be refused is allowed or one that should be allowed is
refused; a refused or unjudgeable mint writes a row, sets a cookie or moves a visitor; or an address, a block, a key, the secret or a count
leaves in an answer or a log line. Anything else is recorded with its trigger.

### 12. What this changes in standing records, and the gate sentences

- **ADR 0149's *"unkeyed for 8E and 8F"*** (already amended 2026-10-08): the digest is keyed from the first deploy; criterion 3's two
  buckets go to 8G. The test-only delete sits beside the fake in the persistence package.
- **ADR 0111's states of a hand-off gain one** (`limited`). **Backlog 90 closes.**
- **The gate sentences are written into the gates' own text** (F-S2.1): 8T's phase gate, *`LEMNARIA_E2E_RATE_LIMIT_POLICY` is defined on no
  deployment, read by name only*; and M9's launch gate, *Production's network source is a named platform and not none; a request sent to that
  deployment with a forged forwarding header is counted under its real block; and the e2e policy's flag is absent there.* The first joins
  the mail flag's line.

## Alternatives not taken

- A persistence predicate or a database check that the e2e policy's server uses the test database (the plan's 8J ruling for the mail flag
  applies: the refusal beside the source's name is enough; what is left is a gate line).
- Inferring the host from a variable the host sets (decision 3).
- A suite-wide mock of the limiter's decision (decision 10).
- A third condition beside the flag; reading the header under *none*.
- Catching the unnamed `429` as the day's limit (FL-R1.2); a wait in minutes in the copy.

## Incident, plainly: a mutant run against the live test database, 2026-10-09

To show a mutation red, the developer ran a mutant of `deleteRateLimitCountersForTests` with its `where` clause removed against the **live
test database**. Each live test that reached it sent `delete from rate_limit_counters returning hits`: **every row of that table on the test
database was deleted, more than once.** The helper's guard held: it allows the allowlisted test database only, and the application database
was never connected to. **How many rows went, and whose, is not known**; nothing was read before or after [developer's disclosure, relayed].
It broke the dispatch's rule (*delete only what the helper is handed*) and did what the guard exists to prevent. It is inside the owner's
sentence in [ADR 0151](0151-a-test-may-delete-the-rows-tests-added-and-never-a-row-a-production-user-added.md) only because that table on that
database is written by tests alone, the persistence suites and, since this wave, the e2e runs, so no user's row could be there [inf, the
architect's reading]; it is outside the architect's reading of it, which wanted a marker and a count. **No further read of the table is owed**
(a row delete changes no definition and the suites that read the table passed after [relayed]) [the architect's ruling]; **nothing is to be
restored**, so there is no backlog entry. A run in flight then lost its own count and nothing else; that stays unknown. The mutant of the
delete was already dead without a database: the live test plants two rows it does not hand over and asserts both remain, and the unit test
pins the statement's whole text with the driver mocked [src]. **The owner is told in these words:** every counter row on the test database
was deleted by a mutation run; the guard held; what went is not known.

**The standing rule, verbatim:** *A mutant of a statement that deletes, updates, truncates or alters is run against a mocked driver and never
against a database. A live proof that a statement touches only what it is handed plants rows of its own beside the ones it hands over and
asserts they remain. A destructive statement whose `where` no longer names what it was handed is not sent anywhere.*

**The test-only delete (S3a)** deletes the counters whose keys it is handed, **by `bucket_key = any(keys)` only** (an empty list returns before
any statement), on the guarded test database alone. What keeps it from the application is that the connection is the guarded test
database's and no other, and that nothing under `apps/web/src` names it (a scan holds the second); a follow-up widened its runner guard to
`PLAYWRIGHT_TEST`, accepted.

## Q35, recorded and not decided: the two-tab race (the owner's)

*Two tabs creating a design within one request's time can leave a browser unable to open any of its designs. Which fix?* It is backlog 89
(ADR 0114 H1's first residual, measured by the triage: 13 of 250 rounds, none alone, 12 of 100 at eight workers [QA-run]). 8F is independent
of it: it adds no response that sets a cookie and reads no visitor value. The three options, as the plan words them:

- **(a)** Every save takes the lock shared and the mint takes it alone. Closes it in every browser that has the lock; each save then waits on
  a lock.
- **(b)** The lock is held across the first save. Closes the create path only: a later save racing another tab's mint still loses.
- **(c), the architect's addition and recommendation** [inf, unmeasured: what else leans on the refresh is that wave's S0]: **a save never sets
  the visitor cookie; only a mint does.** Closes it on the server for every browser, by removing the one answer that can put an old value back.
  Its cost: the cookie's thirty days run from the last design created and not the last save, unless the lifetime is lengthened.

(a) and (b) amend ADR 0114 H6 (2026-09-23, the owner's *"Web Lock + random"*); (c) amends decision 1 (*"refreshed with every successful save"*)
and H3. *The security reader's view* [relayed]: (c) is the soundest, the only one the server enforces for every browser, since the cookie is then
written by one answer alone, the mint's, which is guarded and limited; (a) and (b) rest on a lock some clients lack and a hostile one ignores.
What (c) changes: the cookie no longer slides with saves, so a browser that only edits is shut out when it expires; a long lifetime is the
remedy, and browsers cap one near 400 days [recalled]. **The two measurements, one sample each [QA-run]: 12 of 100 rounds red under eight workers
before the limiter (the triage), and 0 of 100 with it. 0 of 100 is not a fix.** Whichever option: a wave of its own, Full + security, before 8T.
**Until it is decided the two-tab spec stays in the suite, neither skipped nor marked, and 8T's gate cannot be ticked unless the owner accepts
the residual.** A whole run red on that title alone is recorded by its name (backlog 89) and run again once.

## Limits recorded, not fixed (ADR 0118)

Each with its trigger.

- **The shared bucket under *none*** (decision 8): twenty requests lock out everyone until midnight. *Trigger:* anything takes customers;
  the launch gate sentence in decision 12.
- **Twenty a day counts tries, not designs made** (FL-R1.3, the architect's, **open to the owner**). A hit is counted before it is judged, so a
  mint that then fails has spent one and the store cannot give it back; a customer can be refused short of twenty designs. ADR 0147's sentence is
  the figure; whether a failed try counts was not ruled. *Trigger:* the designs write fails for a stretch, or a customer is refused short of
  twenty designs.
- **A replaced secret gives that day a second twenty** (O5; the rotation runbook says so).
- **Counts err high and never low** (ADR 0149; a 503 retried by the client, a hit landing after a deadline, O3: the e2e notice is also written
  for a mint that then answers `503`, harmless).
- **The odd IPv6 families and a subscriber's blocks, for M9** (F-S1.3): `::ffff:0:a.b.c.d`, `::a.b.c.d` and `::` share one bucket of zeros;
  every `64:ff9b::` address shares one; a 6to4 address has a bucket for each of its 65,536 subnets. A home IPv6 line commonly holds 256 blocks
  of /64, so 5,120 designs a day from one subscriber [inf, the reader's]; a /56 note for M9. If the platform's header ever holds a list every
  request falls silently into the shared bucket, which M9's gate sentence catches.
- **Both harness servers listen on every interface** (F-S2.4, backlog 165): the second is CI-only; a developer's first server is reachable on
  the local network under the e2e policy, on the test database. *Trigger:* loopback only, measured on its own.
- **No guarded helper counts design rows** (O2): *writes no row* is shown live as far as the ids the route answered. *Trigger:* 8K, which owes
  the same proof.
- **The environment type and its own-member read are written three times across mail, digest and network, and the deadline helper twice**
  (FC-R1.9, FC-R1.11's shared deadline; backlog 166). *Trigger:* the fourth reader, 8G's or 8K's.
- **The parser's split and the notice's move** (FC-R1.12, FC-R1.14): each could change behaviour the security reader proved over 60,000
  spellings, or when a line is written.
- **`Headers` trims surrounding whitespace** (O4), so " 203.0.113.1" is an address at the route. **A local file naming the flag or the source
  reaches the second server** (O6; Next loads `apps/web/.env*` itself): both then fail loudly, and that spec is CI's.
- **The milestone-close test audit** (ADR 0152 Amendment A; backlog 167) gathers the restated pairs and the remaining should-fix and nits.
- **A tap on *Continuă* before the page is live does nothing (backlog 163) and one resource answers `404` in every run** (backlog 164): neither is
  this wave's.

## What is unproven until the owner acts

*[the security reader's lists, relayed; the architect's]* `DIGEST_SECRET` in each environment, then one design created there. `0007` and its
grant on preview and production (the counters' grant test has only ever been skipped). `CLIENT_NETWORK_SOURCE` on a deployment: that the host's
header holds one address and cannot be forged. That the deployed runtime names the Chișinău zone (else every mint is `503`) [inf]. Not run:
`pnpm check`, `pnpm ci:local`, anything on a CI runner, anything on a deployment, e2e in dev mode in full (all whole runs were `CI=1` locally).

**Owner actions:** `DIGEST_SECRET` per environment **before this branch is merged or deployed**; `CLIENT_NETWORK_SOURCE=vercel` on the
deployment(s) on that platform only; `0007` and its grant; Q35; whether twenty a day counts attempts or designs made; the limit notice's look
(the same neutral band as the failure notice) and the draft sentence's wording, `ro` and `ru`; the closing rule; the incident above. The
runbook for replacing the secret: `runbooks/replacing-the-digest-secret.md`.

## What later waves inherit

- **8G** [the logic and security readers' notes, relayed]: the evaluator must grow to several buckets and **extend the existing one, not write a
  second** (F-S2.5); a refused request hits every bucket it lists (one bucket at its figure drains the others); the client's general rule repeats
  a `429` (`design-request-errors.ts:85-91`), so once saves are limited the coalescer would retry a refused save with backoff, each a hit: **8G
  needs its own terminal type with the code read**; counts are attempts; a change to a window's rule under the same policy name is a window
  conflict, `503` for that bucket until pruned; its criterion 3's two buckets are its own by name.
- **8K:** its two-an-hour limit will feel the attempts-not-designs rule first; it owes the proof of *writes no row* that no guarded helper gives
  here (O2); if the platform's header ever holds a list every request falls into the shared bucket; the fourth reader of the environment
  makes the shared module (backlog 166).
- **Every later dispatch:** the standing rule above; and a pinned figure in a QA-owned file that a wave's own change moves is **reported** to
  QA, who changes it (8F's S4: the developer edited `tests/room/qa-7f1-copy-and-conversions.adversarial.test.ts` to move a leaf count from 72 to
  73, and one comment that cites the wave by id).
- **M9:** decision 12's launch sentence; the odd IPv6 families and the /56 note.

## Evidence

- **[coordinator-run, at `63e1428`]** the whole web suite exit 0: 364 files, 7125 passed; web typecheck 0, lint 0; root `format:check` 0;
  `gate:boundary` 0. **[coordinator-run, at `9edf176`, alone]** the whole persistence suite exit 0: 80 files, 2478 passed, 2 skipped (the two
  grant tests: the tables are absent on the database `DATABASE_URL` reaches); persistence typecheck and lint 0. The pinned known answer was
  reproduced with `openssl` at `ad0996d`.
- **[QA-run, m8-8j-qa, two passes]** pass 1 green at `e8264f8`: 57 mutants, none surviving; through the real route a `429` and a `503` resolve
  no visitor, write no row and set no cookie; 20 allowed and the 21st refused at both edges of 23-, 24- and 25-hour days; 60 at once gave exactly
  20 made; live on the real store 12 at once with 6 left gave exactly 6; 192 cells of flag x source x secret at the route; the two-tab race 0 of
  100 rounds. Pass 2 green at `9edf176`: 9 mutants; the whole e2e suite under `CI=1`, eight workers: 683 passed, 1 failed (the 8D pixel test,
  backlog 162, passed alone), 508 designs counted (132 / 192 / 184); both production-policy specs passed. **[developer-run]** the whole e2e suite
  under `CI=1` at `30467c6`: 679 passed, 0 failed.
- **[visual verifier, at `59b292d`, 390 x 844 and 1440 x 900, `ro` and `ru`, the request intercepted in the page, nothing minted]** the limit
  sentence in full on two lines, no retry button, back only; one POST and zero PUT; back keeps the room; the `503` shows the existing failure with
  its retry. Not done: the comparison against a mockup frame (the architect ruled none is owed: no frame draws this state).
- **[reviewers]** logic: approve at `5a2d818` (FL-R1.2, FL-R1.4 closed; the trace holds: Step 1 is the only mint); security: approve at `5a2d818`,
  no open security finding in the code (it re-ran its S1 probe: the parser unchanged); clean-code: approve at `5a2d818` with two should-fix in test
  titles, fixed in `63e1428` (**not re-read by a reviewer**), and one listener left in a QA file (backlog 167).
- **Deviations:** S3 split into S3a (persistence) and S3b; a follow-up widened the test-only delete's runner guard to `PLAYWRIGHT_TEST`
  (accepted); the suite-wide mock was replaced (decision 10); the developer edited a QA-owned file (reported, ruled: *Every later dispatch*);
  one DOM test lost its wall-clock wait and was retitled to what it holds; QA's live spec uses port 4323; the developer committed its own rounds
  (explicit paths, hook on). `e8264f8` lacks the `Co-Authored-By` line: the developer's slip, not amended.
- **Commits** on `m8-review-contact-success`, local, not pushed [coordinator ran `git log`]: see the plan's *8F as closed*.
- **Not run / not proven:** the list above.

## Note — 2026-10-10 (wave 8G)

**The mint's e2e twin is now 1,600, not 1,100**: the 8F rule (*twice, to the next hundred*) left a margin of four, so a twin's figure is **three times what one whole run makes, rounded up to the next hundred, and the teardown still fails above half**. Measured 510 to 528 designs a run; **the wave that passes 533 raises it**. The e2e notice's words changed, and are true of every twin: `rate limit: an e2e policy is in use (LEMNARIA_E2E_RATE_LIMIT_POLICY); its figure is not the production one`. A **fourth port** (4325) was named beside 4322 to 4324. [ADR 0156](0156-saves-shares-and-reads-are-limited-by-subjects-made-only-by-two-constructors-writes-fail-closed-reads-fail-open-pages-are-counted-in-the-interceptor-and-the-saves-wait-is-one-write-the-client-holds.md) decision 9.

## Dated note — 2026-10-18: the account purposes extend this limiter (ADR 0169 D5; the scribe; this record's text is not edited)

[ADR 0169](0169-a-client-account-is-an-e-mail-and-an-argon2id-password-a-session-is-a-hashed-host-only-cookie-a-role-is-a-named-set-of-capabilities-and-a-claimed-design-opens-on-any-device.md)
(**Accepted** 2026-10-18) *extends* this limiter with account purposes (register, login, reset request and token completion
by network block; login by address; three per-address mail buckets; claim and session saves by account) and one new subject
kind, an account id, under the same rules: they fail closed, and every figure is provisional. The login's per-address day
figure is an interim 100; the failure-only back-off the owner approved is not built (ADR 0169 D5, *IMPLEMENTATION STATE*).
Nothing in this record is superseded. Built but unexercised (ADR 0169 D12).
