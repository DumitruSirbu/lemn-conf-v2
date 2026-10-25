# M8B follow-up — login back-off: failed attempts only, a growing delay, a day ceiling, and reset as the way back in

Status: **Planned — 2026-10-18**, by the architect. Nothing is built. No migration exists. No ADR amendment is written
yet (§9 lists the one owed).
Branch: `feat/login-register` (worktree `lemnaria-configurator-login`).
Parent plan: [`M8B-login-register-plan.md`](M8B-login-register-plan.md) (§5 *Limiter policies*, wave L9, §12 *Review
record*).
Governing record: ADR 0172 (on this branch; **renumbered from 0169 to 0172 at the merge with `main`**, ADR 0172 *Remaining before production* item 9),
D5 *Login throttling*, Amendment A items 1 and 5, Amendment E items 1 and 5.

**Evidence tiers used below.**

- **[owner]** the owner's words or ruling, as recorded in ADR 0172.
- **[relay]** the owner's intent as stated in the coordinator's dispatch of 2026-10-18 and **not** recorded in ADR 0172:
  the example schedule "1, 2, 5, 15, 60 min", "a high absolute ceiling (≤ 100/day)", "a looser per-network counter",
  and "the forgot-password flow is the way back in". The owed amendment (§9) must not quote these as [owner] until the
  owner confirms them.
- **[doc]** quoted from this repository, with a path.
- **[src]** read in the source on this branch at `d07a09a1`, by the architect, for this plan.
- **[ven]** a vendor or standards fact. Here that means only the OWASP and NIST lines ADR 0172 D5 records. The record
  itself labels them "read by the coordinator, not re-read here". They were **not** re-researched for this plan.
- **[inf]** the architect's inference. Every SQL statement below is [inf]: a sketch for wave B1 to prove, not a
  verified statement.

---

## 1. Goal

Build the login throttling the owner approved on 2026-10-18 [owner, ADR 0172 D5 *Decision*]:

> failure-only counting with a growing delay and a ceiling of 100 failures a day per address. A correct password resets
> the run. The block-level bucket and Turnstile stay. The reset-mail bucket (5 a day) is not changed by this decision.

The research behind it [ven, ADR 0172 D5 *Research*]:

- OWASP *Authentication Cheat Sheet*: count per account, lock out with an exponential delay, show the CAPTCHA only
  after failures.
- NIST SP 800-63B: limit **consecutive failed** attempts to no more than 100, use delays that increase, disregard
  earlier failures after a success.

What runs today is an **INTERIM** [doc: ADR 0172 D5 *IMPLEMENTATION STATE*; src: `limit-policy.ts:143,147`,
`judge-account-request.ts` `SUBJECT_PLAN_OF_PURPOSE.login`, `sign-in.ts` `signIn`]:

- two fixed UTC windows per address, `account-login-by-address` at 10 per 15 min and 100 per 1440 min;
- every valid attempt is counted at step 7, before the lookup and before the password is looked at;
- nothing is ever reset.

### Out of scope

- The reset-mail bucket and its residual. They are unchanged by the owner's decision.
- The block buckets of other flows.
- Turnstile's behaviour, which stays exactly as ADR 0172 Amendment E item 5 has it.
- The login screen copy. A `429` already exists and keeps its shape.

---

## 2. What the code allows today (the developer's finding, checked)

| Finding | Checked | Consequence for the design |
| --- | --- | --- |
| The rate-limit store only increments | [src] `RateLimitStore` has `recordHits`, `pruneExpired` and `totalsOfWindow`, and nothing else. `totalsOfWindow` totals a whole window across every key and is a telemetry read for the nightly prune (`prune-rate-limits.ts`). It is no per-key read | A per-key read or reset is a port addition, in the Neon store and the fake alike |
| Windows are fixed per policy | [src] `windowOfRule` gives either `chisinauDayOf` or `utcWindowOf(instant, minutes)`. `utcWindowOf` refuses any length that does not divide the day | A delay that runs "from the last failure" cannot be expressed as a `WindowRule`. The port itself accepts any non-empty caller-chosen window (`requireNonEmptyWindow`) |
| Counting happens before judging | [src] `enforceRateLimit` calls `recordHits`, then `judge` compares the returned count with `policy.figure`. `sign-in.ts` asks `judgeAccountSubject({purpose:"login"})` before `answerAttempt` | Counting first is what makes today's count **race-free**: the upsert is atomic per row. This plan keeps that property on purpose (§4.3) |
| No reset | [src] No statement on `rate_limit_counters` removes a row except the prune | A success cannot clear anything today |
| The table and its grant | [src] `0007_create_rate_limit_counters.sql`: primary key `(bucket_key, window_start)`, no timestamp of a hit. [doc] runbook `applying-a-table-migration-and-its-application-role-grant.md`, step 4 for 0007: *"`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_counters TO app_designs;`"*. Step 9: *"Order: the migration, then the grant, then the code that counts. The limiter fails closed without either."* | A reset by `DELETE` on that table would need no new grant. The table holds no "last failure at" and no run length, which a growing delay needs (§3) |

---

## 3. Decision 1 — a new table, `0016`, and a new port

### 3.1 Why the existing table does not carry it

A growing delay needs two facts per address: the **length of the current run** of consecutive failures, and **when its
last failure happened**. `rate_limit_counters` holds neither. It holds `hits` per `(bucket_key, window_start)`.

| Option | How | Cost | Verdict |
| --- | --- | --- | --- |
| **A. No migration** | Keep `rate_limit_counters`. Add a port `forgetBuckets(keys)` (a `DELETE`, under the existing grant). Either (A1) each delay tier is a fixed-window policy ("≤ 4 per 1 min, ≤ 6 per 15 min, ≤ 8 per 60 min, ≤ 100 per day", failures only), or (A2) a "lock row" with a caller-chosen window `[failureAt, failureAt + delay)` beside a run-count row | A1 is not a delay that grows from the last failure. It is window edges, with a burst of up to twice a figure across an edge. A2 needs a read-then-act across two rows, so the race of §4.3 comes back. Lock rows have windows of every length, so `totalsOfWindow` and the nightly totals line never see them | **Fallback only**, if the owner refuses a migration (Q6) |
| **A3. Success epoch in the key** | Key the failure bucket by `(address, epoch)`, and bump the epoch on success | The epoch must be **stored** per address, so this is a table anyway, and a worse one | Rejected |
| **B. One row per address in a new table** (recommended) | `0016_create_login_backoff_runs.sql`: run length, last failure, day count, all in one row. One atomic statement checks, reserves and returns everything the judgement needs | An **owner-run migration** and a grant. It is applied after `0011`–`0015`. Until it is applied and granted, the login answers `503` (fail closed) | **Recommended** |

**Run boundary.** Under B the run does **not** restart at midnight. It ends on a verified success, on a completed
password reset, or after a quiet period with no failure (`LOGIN_RUN_QUIET_HOURS`, default 24 h; Q3). Under A1 the
schedule would restart every midnight UTC. That is one more reason A is the fallback only.

### 3.2 The table (sketch) [inf]

```sql
-- 0016: one row per address that has failed to sign in. The row holds the run of consecutive failures and the day's
-- failures, keyed by the keyed digest of the address's counted form, as rate_limit_counters is. No raw address.
create table if not exists login_backoff_runs (
  subject_key text primary key
    constraint login_backoff_runs_subject_key_is_sha256 check (subject_key ~ '^[0-9a-f]{64}$'),
  run_failures integer not null
    constraint login_backoff_runs_run_failures_is_not_negative check (run_failures >= 0),
  last_failure_at timestamptz not null,
  day_start timestamptz not null,
  day_failures integer not null
    constraint login_backoff_runs_day_failures_is_not_negative check (day_failures >= 0),
  last_attempt_admitted boolean not null,
  expires_at timestamptz not null,
  constraint login_backoff_runs_expiry_is_after_last_failure check (expires_at > last_failure_at)
);
create index if not exists login_backoff_runs_expires_at on login_backoff_runs (expires_at);
```

- `subject_key` is made by the same keyed digest the limiter uses (`keyOf` in `enforce-rate-limit.ts` [src]), under
  a **new** policy name such as `account-login-backoff`. The digest takes `{policyName, subjectKind, subject}`, so the
  key never equals a `rate_limit_counters` key.
- `last_attempt_admitted` exists only so the one statement can say whether **it** admitted the attempt (§3.3). A
  `RETURNING` of old and new values would avoid it, but only on newer Postgres. That is unverified for this database
  [ven, not checked], so the plan does not depend on it.
- `expires_at` = the later of `last_failure_at + quiet period` and the end of the UTC day. An expired row that the
  prune has not reached yet is read as a fresh run, exactly as `0007` treats an expired window.
- **Migration screen.** `0016` must pass the unattended screen (`migration-safety.ts`) with no finding. It uses only
  `0007`'s constructs plus `boolean`. Wave B1 runs the screen. It cannot run the CLI gate until `0011` is on the base
  [doc: ADR 0172 Amendment E item 3].

**Numbering and order [doc: ADR 0172 *Remaining* items 1–2; src: `0011_create_presets.sql` exists on the M8C
checkout, `0012`–`0015` on this branch].** The order is:

1. merge M8C;
2. apply `0011`;
3. apply `0012`–`0015` and their grants;
4. apply **`0016`** and its grant;
5. deploy the code of wave B3.

Applying is **the owner's step** (AGENTS rule 1). No agent runs it. The number `0016` is re-checked at the merge, as
the ADR number is: if M8C or any other branch has taken `0016` by then, this migration takes the next free number
before it is applied anywhere.

**Grant (owner-run, a new runbook section *For 0016*):**
`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_backoff_runs TO app_designs;`

- `DELETE` is for the prune only. A reset is an `UPDATE`.
- ADR 0172 D10's "No `DELETE` grant" is written for the four account tables. This is a limiter table, on `0007`'s
  precedent. The amendment owed in §9 says so explicitly, so that it is not read as a silent exception.

### 3.3 The port (persistence) [inf]

A **new port**, `LoginBackoffStore`, beside `RateLimitStore`. It does not extend `RateLimitStore`: the semantics differ
(one row per subject, no windows), and the existing port's callers must not see new methods. Every method rejects with
a typed store error when the database gives no trustworthy answer, as `RateLimitStoreError` does.

| Method | Meaning |
| --- | --- |
| `admitAttempt({key, instant, dayStart, dayEnd, delaysSeconds, ceiling, quietMs})` → `{admitted, runFailures, lastFailureAt, dayFailures}` | One atomic statement. An attempt is admitted if the run's delay has run out **and** the day count is under the ceiling. If it is, the statement **reserves** it: the run and the day count each go up by one, and `last_failure_at` is set to now. A refused attempt changes nothing. This is the check **and** the record, so there is no gap between them |
| `forgetRun({key, dayStart})` | After a verified success: the run goes to 0, and the day count goes down by one (this attempt's own reservation; floor 0). Earlier failures stay in the day count, so the ceiling stays absolute |
| `refundAttempt({key, dayStart})` | After a hashing platform failure (`503`): the run and the day count each go down by one (floor 0). `last_failure_at` stays, which is conservative. Only if Q4 is accepted |
| `clearRun({key})` | After a completed password reset, and after a confirmed e-mail: run and day count to 0 |
| `pruneExpired(now)` | Deletes rows with `expires_at <= now`. Called by the existing nightly cron as one more step |

Why there is **no `readCounts`** (ADR 0172 D5 *IMPLEMENTATION STATE*, need 1, which this plan replaces):

- A read-then-record check lets every request that passes the check before any record lands make a guess.
- That burst is bounded only by the solved Turnstile tokens the attacker holds (one per solve) and by
  `account-login-by-block` (30 per 60 min per network block [src: `limit-policy.ts:142`]). So it is up to **30 guesses
  per network block per unlock**, and without limit across many blocks.
- The reserve-first statement closes this. It is today's count-first property, kept.

The admission statement (sketch) [inf]. `$d` is the delay array. `fresh` means `run.expires_at <= $now`:

```sql
insert into login_backoff_runs as run
  (subject_key, run_failures, last_failure_at, day_start, day_failures, last_attempt_admitted, expires_at)
values ($key, 1, $now, $dayStart, 1, true, $expiresAt)
on conflict (subject_key) do update set
  -- every right-hand side reads the row as it was before this statement (old values), under the row lock
  last_attempt_admitted = <admit>,
  run_failures   = case when <admit> then <run_base> + 1 else run.run_failures end,
  day_failures   = case when <admit> then <day_base> + 1 else run.day_failures end,
  day_start      = case when <admit> then $dayStart      else run.day_start end,
  last_failure_at= case when <admit> then $now           else run.last_failure_at end,
  expires_at     = case when <admit> then $expiresAt     else run.expires_at end
returning run.last_attempt_admitted, run.run_failures, run.last_failure_at, run.day_start, run.day_failures;

-- <run_base> := case when run.expires_at <= $now then 0 else run.run_failures end
-- <day_base> := case when run.day_start = $dayStart then run.day_failures else 0 end
-- <wait_ok>  := run.expires_at <= $now
--               or run.last_failure_at
--                  + make_interval(secs => coalesce(($d::int[])[least(run.run_failures, cardinality($d::int[]))], 0))
--                  <= $now
-- <admit>    := <wait_ok> and <day_base> < $ceiling
```

- The instant is handed in, as everywhere in the limiter (`requestMakerFor` [src]). It is not the database's `now()`.
- A repeated statement may reserve twice. The rule is "err high, never low", as for `recordHits` (ADR 0149). The
  Neon store reuses `refusingToRepeatAnEmptyReply`.
- That `ON CONFLICT DO UPDATE` serialises concurrent statements on one key, and that every `SET` reads old values,
  are both Postgres behaviour [ven, not re-read]. Wave B1's live test proves the consequence (criterion B1-3).

---

## 4. Decision 2 — the rules

### 4.1 The schedule (provisional constants, one each, as the house does)

The owner gave the delay schedule as an example only: "e.g. 1, 2, 5, 15, 60 min" [relay].

| Consecutive failures in the run | Next attempt waits |
| --- | --- |
| 1–4 | nothing (`LOGIN_FREE_FAILURES = 4`) |
| 5 | 1 min |
| 6 | 2 min |
| 7 | 5 min |
| 8 | 15 min |
| 9 and later | 60 min (the plateau) |

- **Day ceiling:** at most `LOGIN_DAY_FAILURE_CEILING = 100` admitted failures per address per UTC day. This is
  absolute: a success does not reset it, and it counts failures only (a success takes back its own reservation).
- **Quiet period:** after `LOGIN_RUN_QUIET_HOURS = 24` with no failure, the run is forgotten.
- **What waits:** during a wait, **every** attempt for the address is refused, the owner's correct one included. Each
  refusal is `429` with `Retry-After`:
  - during a run wait: `Retry-After` = the end of the wait minus now, rounded up to whole seconds;
  - at the ceiling: the seconds to the **later** of the run wait's end and 00:00 UTC.

  A refused attempt is **not counted**: it changes no count, does no lookup and calls argon2 zero times. This matches
  NIST's "failed attempts" [ven]. It also means the victim's own retries never lengthen the wait.
- Expressed through the existing `RateLimitDecision {kind:"refuse", retryAfterSeconds}`. That reuses
  `answerOfJudgement`, which already refuses any wait that is not whole seconds in `[SHORTEST_WAIT_SECONDS,
  LONGEST_DAY_SECONDS]` [src: `account-responses.ts`]. The longest wait is 60 min, and the ceiling waits at most one
  day.
- **Why the waits are not policies:** a "tier per policy" (Option A1) cannot grow from the last failure. The delay is
  computed from the row.

### 4.2 Order of the work (plan §5 common order, step 7 replaced for login only)

| Step | What runs | Answer when it stops the request |
| --- | --- | --- |
| 1–3 | Cross-site check, media type, bounded body | — |
| 4 | `account-login-by-block` | **Unchanged**: counts every attempt and is **never** reset |
| 5 | Turnstile | Unchanged |
| 6 | Input validation | `400` |
| 7 | `admitAttempt` for the address. This replaces `judgeAccountSubject({purpose:"login"})` and its two policies | Refused → `429`. Cannot be judged (store failure, deadline `RATE_LIMIT_DEADLINE_MS`, an unusable digester, a malformed reply) → `503`, with no lookup and no argon2 |
| 8 | One lookup, one argon2id verification (the dummy hash when the address is unknown or the password was refused by policy) | — |
| 9 | Outcome (table below) | — |

| Outcome | Store write after verification | Answer |
| --- | --- | --- |
| Unknown address | none | `401 invalid-credentials` |
| Wrong password | none | `401` |
| Password refused by the policy | none | `401` |
| **Correct password, unconfirmed account** | **none.** The run is **not** reset. The resend stays in `after()` as today | `401` |
| Hash platform failure | `refundAttempt` if Q4 is accepted, otherwise none | `503` |
| Correct password, verified account, session `started` | `forgetRun`, in `after()`, best effort. A failure is logged and changes nothing | `200` and the cookie |
| Correct and verified, but the session is not `started` (`stale` or `refused`) | none: it is a failed sign-in, as today | `401` |

- The check uses the **write** deadline (`RATE_LIMIT_DEADLINE_MS`, 3000 ms). It never uses the read deadline
  (`RATE_LIMIT_READ_DEADLINE_MS`, 300 ms), whose failures are *served* [src: `enforce-rate-limit.ts`]. A login that
  cannot be judged is refused.
- The record is the reservation. It is made before the password is verified, so there is no "the failure could not be
  written after a wrong password" case, and therefore no way to get free guesses while the store is flaky.

### 4.3 The check/record race

It is closed by reserving first (§3.3).

- With a wait in force, N concurrent attempts on one address admit **exactly one**.
- In the free part of the run, at most `LOGIN_FREE_FAILURES + 1` minus the run length are admitted concurrently (the
  attempt after the 4th failure still waits nothing; the wait starts after the 5th). Each one gets its own
  reservation.
- Successes and failures that race: a `forgetRun` that lands after a concurrent admitted failure erases that failure
  too. That is NIST's "disregard earlier failures after a success" [ven], and it is accepted.

### 4.4 The `503` hash-failure path: a recorded ruling changes

ADR 0172 Amendment A item 5 and plan L9 F4 [doc] say:

> a hashing platform failure answers `503` but stays counted … the count cannot be taken back once the hash is known to
> have failed.

That cost was recorded as "not feasible" against the L3 security review's preferred arm ("does not count it … if
feasible"). Under this design, taking the count back **is** feasible (`refundAttempt`).

- **Proposed:** refund. A refunded attempt produced no verification result (it answered `503` whatever the password),
  so a refund gives the attacker no guess. Without a refund, an argon2 outage would push every real user up the
  schedule.
- This **overturns Amendment A item 5.** It is therefore owner question Q4 and a dated amendment (§9), and is not
  made silently.

### 4.5 The enumeration rule (ADR 0172 Amendment A)

1. **Identical recording.** Every `401` branch does exactly one store write before the response: the same
   `admitAttempt`, on a key made from the normal form of the typed address (`keyOf` takes the subject text only, never
   an account [src]). After verification, no `401` branch writes anything. A row is created for an unknown address
   just as for a known one.
2. **Equal work.** Before the response, every `401` branch does: one admission, one `findByNormalForm`, one argon2id
   verification. That is the current L9 obligation, unchanged. The success path differs, but it is visibly a different
   answer (`200`).
3. **Only a correct password on a verified account, with a started session, resets the run.** If a correct password on
   an unconfirmed account reset it, Amendment A's oracle would come back:
   1. the attacker registers the victim's address with a password of their own;
   2. they fail a few times;
   3. they log in with their own password;
   4. a reset (seen as the wait vanishing) would show the address was unknown or unverified, and no reset would show it
      was verified.
4. **Residual oracle, accepted (owner-visible).** The wait is observable through `429` and `Retry-After`.
   - **The attack.** An attacker pushes an address into a wait and later sees the run back at zero. That shows someone
     signed in as that address in between, so the address has a verified account whose owner is active.
   - **Cost to the attacker.** About 5–6 solved challenges per probe, and the victim must sign in during the interval.
   - **Why it stays.** It cannot be removed without dropping NIST's reset-on-success [ven], which the owner approved.
   - **Not an oracle.** A `429` alone says nothing about existence, because unknown addresses build runs identically.
5. **Nothing new in logs.** Only event, outcome and policy name, as `account-log.ts` does. The table holds a keyed
   digest, never an address (the check constraint enforces the shape).

### 4.6 "Success resets" and an attacker who alternates a known good account

A success resets **only the run of the address that succeeded**.

- A success never touches another address's row, any `rate_limit_counters` row, or the block bucket.
- An attacker who owns account A and alternates A's correct password with guesses at B therefore gains nothing:
  - B's run keeps growing;
  - the block bucket counts every one of those attempts (30 per hour per block).
- The day ceiling is not reset by any success, so success-interleaving on **one** address cannot give more than 100
  failures a day there either.
- This is acceptance criterion B2-4.

### 4.7 Turnstile fail-open and the per-network bucket

- Turnstile's behaviour is unchanged (Amendment E item 5).
- During an outage, the admission statement is still asked at step 7, so the per-address schedule still binds. The
  block bucket (step 4) binds too.
- The "looser per-network counter" [relay] is the existing `account-login-by-block` (30 per 60 min, all attempts, never
  reset). Making it failure-only would bring the alternating-account attack back at the network level. The plan keeps
  it as it is (Q5).

---

## 5. Decision 3 — the way back in, and the victim-lockout residual (quantified)

### 5.1 The way back in

- **A completed password reset clears the address's run and its day count** (`clearRun`).
  - `reset-password.ts` has `account.email`, and so the normal form through `judgeAccountEmail` [src:
    `isPasswordHashStored`].
  - The key is derived through the rate-limit module's digest. It is never assembled by hand.
  - A failed clear does not fail the reset: the clear is logged, and the reset is answered `200` as now.
  - Without the clear, "forgot-password is the way back in" [relay] would not hold: the new password would still
    be refused until the wait ends.
- **A confirmed e-mail clears it too** (`verify-email.ts`). The token proves the inbox and the password was verified.

### 5.2 What a stranger can do to a victim (Turnstile working)

The figures assume the default schedule. Each failure costs one solved challenge.

- **Reaching the plateau.** 9 failures, and at least 1 + 2 + 5 + 15 = 23 min.
- **Holding the victim out.** After that, one failure is fired the moment each 60-min wait ends. So the victim's
  login is refused for almost the whole day, at about **9 + 23 ≈ 32 solved challenges on the first day and 24 a day
  after that**.
- **Closing the way back in too** costs about **5 more** solved challenges a day. They exhaust the reset-mail bucket
  (5 a day, unchanged [doc: ADR 0172 Amendment A item 2]).
- **Total to keep a victim fully out: about 29–37 solved challenges a day.**

| | Interim (today) | This design, default schedule |
| --- | --- | --- |
| Guesses an attacker gets per address per day | 100 (the day window) | about 32, so brute force is **about 3× harder** |
| Solved challenges to keep one victim out all day | 100, which locks to 00:00 UTC. A reset does not help, because the login windows are not cleared by it | about 24–32, plus 5 to block the reset mail. **The DoS is about 3× cheaper** |
| Remedy | none before 00:00 UTC | a password reset clears the run, unless the reset mail is also exhausted |
| Does the day ceiling bind? | yes | **never** for one address on this schedule (at most about 32 a day). It is a backstop for races, for success-interleaving, and for the schedules of Q2 |

**Said plainly: on the owner's example schedule, the change makes brute force harder and targeted lockout cheaper.**

Both figures are small next to the price of a solving service. The real control is that the reset clears the run.
Q2 offers two variants that restore the interim's lockout cost:

- **Plateau 15 min:** about 8 + 95 failures a day, so the 100 ceiling binds. Lockout costs about 100 a day and brute
  force is capped at 100, the same as the interim on both counts.
- **Key the run by (address × network block):** the per-address ceiling becomes the distributed cap. A victim on
  another network is unaffected until 100 failures. This needs an `address_key` column so that success, reset and
  confirm can clear every row of an address. The owner said "per account", so this is the owner's call.

### 5.3 During a Turnstile outage

- The challenge cost is **zero**. Only the block bucket binds: 30 per hour, about 720 a day per network block.
- One block can therefore hold **about 22 victims on the first day and 30 a day after**, at 32 and 24 failures each.
  Many blocks can hold more.
- Under the interim, one block could lock about 7 victims to midnight (720 ÷ 100).

---

## 6. Waves

All code waves are tier **Full**, with security review mandatory on every one: auth, persistence, public endpoint
(WORKFLOW tier table; ADR 0172 D12 "security review is on every code wave").

**Tests.** ADR 0172 D12's no-test rule is scoped to "this round of M8B only" [doc]. **Proposed default: this design
ships with its tests** (Q1). QA writes the properties in §7 with `fast-check`.

| Wave | Items (≤ 5 files) | Reading |
| --- | --- | --- |
| **B1 — persistence** | (1) `packages/persistence/src/migrations/0016_create_login_backoff_runs.sql`, with a header in `0007`'s style: apply before the code that counts, apply before the grant, the bytes are frozen once applied; (2) `login-backoff-store.ts`: port, request checks, store error; (3) `neon-login-backoff-store.ts`; (4) `fake-login-backoff-store.ts`, with the same semantics including serialised admission; (5) `index.ts` exports | This plan §3, §4.1–4.3. ADR 0149 (count may err high). ADR 0172 D10 and Amendment E item 3. `0007_create_rate_limit_counters.sql`, `rate-limit-store.ts`, `neon-rate-limit-store.ts`, `fake-rate-limit-store.ts`, `retry-on-transient-failure.ts`, `migration-safety.ts` (the screen's allow-list) |
| **B2 — limiter judge** | (1) `apps/web/src/lib/server/rate-limit/judge-login-backoff.ts`: makes the key through the digester under policy `account-login-backoff`, maps admission to a `RateLimitDecision`, computes `Retry-After`, applies the write deadline, fails closed, reports through `account-log.ts`, and exposes `forget`, `refund` and `clear`; (2) `login-backoff-store-instance.ts`, lazy, as `rate-limit-store-instance.ts`; (3) `limit-policy.ts`: the schedule, ceiling and quiet-period constants, PROVISIONAL, **added** only (nothing retired yet, so the build stays green); (4) `prune-rate-limits.ts`, or the cron route: one more prune step for the new table | This plan §4, §5.1. ADR 0156 (writes fail closed). ADR 0172 D5, Amendment A. `enforce-rate-limit.ts`, `judge-block-bucket.ts`, `judge-account-request.ts`, `limit-policy.ts`, `bucket-subject.ts`, `account-responses.ts` (`answerOfJudgement`), `prune-rate-limits.ts`, `app/api/cron/prune-rate-limits/route.ts` |
| **B3 — wiring and retirement** | (1) `sign-in.ts`: admission at step 7, the outcome table, `forgetRun` in `after()`, refund (Q4), and the **header comment rewritten** (it currently says every valid attempt is counted before the lookup and a `503` cannot be un-counted); (2) `reset-password.ts`: `clearRun` after `password-changed`; (3) `verify-email.ts`: `clearRun` after a started session; (4) `judge-account-request.ts`: drop `login` from `SUBJECT_PLAN_OF_PURPOSE` and from `AddressedPurpose`; (5) `limit-policy.ts`: retire `ACCOUNT_LOGIN_BY_ADDRESS_*`, their `PolicyPurpose` entries and their twins, keeping `ALL_LIMIT_POLICIES` duplicate-free | This plan §4.2, §4.5, §5.1. ADR 0172 D5, Amendment A items 1 and 5, Amendment E item 5. Plan §5 flow 3 and L9 obligations. `sign-in.ts`, `reset-password.ts`, `verify-email.ts`, `judge-account-request.ts`, `limit-policy.ts`, `app/api/account/login/route.ts` (read only) |
| **B4 — records** (documentation; not a code wave) | ADR 0172 amendment (§9). Plan §5 limiter table, §9 tests-owed, §12. Runbook section *For 0016* (steps 1–9 as for 0007). `docs/STATUS.md` | This plan. ADR 0172. The runbook's 0007 section. `docs/best-practices/documentation.md` |

**QA reading (each wave):** this plan §4 and §7. The wave's files. `fake-login-backoff-store.ts` (B2 and B3).
`sign-in.ts` (B3).

**Logic reviewer reading:** this plan §3–§5. ADR 0172 D5 and Amendment A. The wave's diff and the files in its Reading
column.

**Clean-code reviewer reading:** the wave's diff. `docs/best-practices/engineering-conventions.md`.

**Security reviewer reading:** this plan §3.2, §4.2–§4.7 and §5. ADR 0172 D5 and Amendments A and E (item 5). ADR
0156. The wave's diff. For B3 also `account-request.ts` (`refusalOfChallenge`) and `password-hash.ts`
(`checkPassword`, `DUMMY_PHC`).

**Owner steps, after B1 is reviewed and before B3 deploys anywhere:**

1. apply `0016` on Preview;
2. issue the grant;
3. run the privilege test and quote its line `reached database … as role …`.

Production follows the same steps, after `0011`–`0015`.

---

## 7. Acceptance criteria (falsifiable; P = a property for `fast-check`)

**B1 — persistence**

1. **(P)** For any sequence of `admitAttempt` calls with non-decreasing instants on one key, the admitted attempts
   satisfy two things:
   - each admitted attempt `i` with run length `n` before it has `instant_i ≥ lastFailureAt + delay(n)`;
   - the day count never exceeds `ceiling`.

   A refused call leaves the row byte-identical.
2. A row whose `expires_at <= instant`, not yet pruned, is admitted as run length 0 and day count 0. **It must not**
   carry its old run.
3. **Live (Neon), all 20 calls handed one shared instant** (so the count is deterministic): with a wait in force, 20
   concurrent `admitAttempt` calls on one key admit **exactly one**. In the free part with run length 0, 20 concurrent calls admit **exactly `LOGIN_FREE_FAILURES + 1`** (five), then the wait
   begins. The fake must give the same counts. With instants that differ, a call whose instant is earlier than the
   stored `last_failure_at` is only ever **refused** (with `Retry-After: 1`), never admitted beyond the schedule.
   Admission requires `instant ≥ last_failure_at`, so the stamp never moves backwards.
4. `forgetRun` sets the run to 0 and lowers the day count by exactly one, never below 0. `clearRun` sets both to 0.
   `refundAttempt` lowers both by one, never below 0, and **must not** change `last_failure_at`.
5. A key that is not a 64-hex digest, an empty delay array, a ceiling below 1, or an invalid instant are refused before
   any statement is sent. The database's check refuses a raw address as a key.
6. Every driver failure leaves as the typed store error and never as the driver's error. A reply that is not exactly
   one well-shaped row is a store error.
7. The migration screen returns no finding on `0016`, and `0016` is additive (no `drop`, no `alter` of an existing
   table).

**B2 — judge**

1. **(P)** `delay(n)` is non-decreasing in `n`. It is 0 for `n ≤ LOGIN_FREE_FAILURES` and equals the plateau for
   `n ≥ LOGIN_FREE_FAILURES + 5`, for all `n` in `0..10_000`.
2. A refusal's `retryAfterSeconds` is an integer in `[1, 86_400]`. It equals the ceiling of (wait end minus instant).
   At the ceiling it equals the seconds to the later of the wait end and 00:00 UTC.
3. Fail closed. A store rejection, the deadline passing, a malformed reply, or an unusable digester each give
   `unavailable`, and **never** `allow`.
4. **(P)** For any interleaving of attempts over addresses A and B: a success on A changes no state of B, no
   `rate_limit_counters` row, and no block count.
5. The key for an address under `account-login-backoff` differs from its key under every `rate_limit_counters` policy.
   It is equal for equal normal forms, whether or not an account exists.

**B3 — wiring**

1. **(P) Enumeration equivalence.** Take any sequence of attempts drawn from {unknown, wrong, policy-refused,
   unconfirmed-correct}, and substitute any kind for any other at any position. The response (status, body, headers)
   and the sequence of store operations before the response (operation names and arguments, with the key replaced by
   a placeholder) are **identical**.
2. A correct password on an unconfirmed account **never** calls `forgetRun`, `clearRun` or `refundAttempt`.
3. During a wait, an attempt returns `429` with `Retry-After`. It does **no** lookup and **zero** argon2 calls, and
   changes **no** count, even with the correct password.
4. A store that cannot judge gives `503`, with no lookup and no argon2 call.
5. Verified success with a `started` session calls `forgetRun` exactly once, after the response. A `forgetRun` that
   fails leaves the answer `200`. `stale` or `refused` calls no `forgetRun` and answers `401`.
6. A hash platform failure gives `503`. With Q4 accepted, the run and day counts after the attempt equal those before
   it. Without Q4, they are one higher.
7. A completed reset calls `clearRun` for the account's normal form. After the reset, the new password signs in at
   once, even if the run was at the plateau. A confirmed e-mail does the same.
8. `ALL_LIMIT_POLICIES` stays duplicate-free. No `account-login-by-address` policy remains. `account-login-by-block`
   is unchanged in name, figure and position (step 4, before Turnstile).
9. No answer, log line or header carries an address, a password or a count. `Retry-After` is the only number.
10. The `sign-in.ts` header comment describes reservation and reset. It no longer claims that every valid attempt is
    counted with no reset.

**What must not happen, across all waves**

- a login verified while the store is unjudgeable;
- a run reset by anything but a verified, started success, a completed reset, or a confirmed e-mail;
- a refused attempt counted;
- a delay that shrinks as failures grow;
- a raw address in the new table.

---

## 8. Risks and rollback

| Risk | Mitigation |
| --- | --- |
| **The code deploys before `0016` and its grant.** Every login answers `503` (fail closed) | Owner steps before B3 deploys (§6). B3's dispatch states this. The runbook step 9 order ("migration, grant, then the code that counts") [doc] |
| The single-statement admission does not serialise as sketched [inf]. This is the design's one load-bearing unverified claim | Criterion B1-3 is a live test. If it fails, fall back to a two-statement transaction with `select … for update`. **If the owner answers Q1 "no tests" (D12 continues), B1-3 still runs, as a coordinator gate on Preview before B3 deploys.** Reading alone does not cover this claim. If even that is refused, B1 builds the `select … for update` variant by default |
| A clock skew between instances shortens or lengthens a wait | The instant is handed in. Waits are at least 60 s. Accepted [inf] |
| An e2e spec that signs in repeatedly hits the schedule | There is no e2e twin. Specs use a distinct address per test. Flagged to the e2e round |
| The DoS becomes cheaper (§5.2) | Owner question Q2, with figures |
| The run is erased by a concurrent success | NIST behaviour [ven]. Accepted (§4.3) |

**Rollback.**

- Revert B3's commit. That restores `sign-in.ts` and the two interim policies exactly.
- Table `0016` stays, unused and harmless. Resources are add-only, and the table is never dropped.
- B2's prune step keeps the table empty over time.
- No data migration is involved: runs are disposable.

---

## 9. Records owed on acceptance (by the scribe, not in this file)

A dated **amendment to ADR 0172**, under its post-merge number. It states:

1. **D5 *Login throttling*:** the mechanism as built — reservation, `forgetRun`, `clearRun`, the schedule and the
   ceiling. The *IMPLEMENTATION STATE* line moves from INTERIM to built.
2. **Amendment A item 5 superseded** if Q4 is accepted: a hashing platform failure is refunded.
3. **D10:** `login_backoff_runs` holds a `DELETE` grant, for the prune, on `0007`'s precedent. D10's "no `DELETE`"
   covers the four account tables only.
4. **Migrations:** `0016` is added after `0012`–`0015`.
5. **The residual oracle** of §4.5 item 4, and the lockout figures of §5, as owner-visible residuals.

In the parent plan, the plan §5 limiter table and its "what the per-address buckets allow" paragraph are rewritten,
and §12's row is closed.

---

## 10. Owner questions (each with a proposed default)

| # | Question | Proposed default |
| --- | --- | --- |
| Q1 | Does this follow-up ship with its tests, or under D12's no-test round? | **With tests.** D12 is scoped to "this round of M8B only" |
| Q2 | Schedule and keying: (a) your example, plateau 60 min, per address: brute force about 32 a day, lockout about 24–32 solved challenges a day; (b) plateau 15 min: both about 100, as the interim; (c) per (address × network block), with the 100/day per address as the cap | **(a)**, as you approved it. Reconsider (b) if a customer locked out by a stranger matters more than brute force |
| Q3 | Free failures before the first wait, and the quiet period | **Five attempts with no wait; the 1-minute wait follows the 5th consecutive failure, then 2, 5, 15, 60 min. A run is forgotten after 24 h without a failure.** Ceiling 100 per UTC day |
| Q4 | A hashing platform failure (`503`): refund the attempt? This **overturns** Amendment A item 5 | **Refund.** It gives no guess, and it spares real users during an argon2 outage |
| Q5 | Keep `account-login-by-block` (30/h, every attempt, never reset) as the per-network counter? | **Keep as is.** Failure-only at the network would bring the alternating-account attack back |
| Q6 | Accept a new table, `0016`, run by you, rather than approximating the delay in the existing table? | **Accept `0016`.** Option A cannot express a delay that grows from the last failure |
| Q7 | Should a confirmed e-mail also clear the run, as a completed reset does? | **Yes.** Both prove the inbox |
