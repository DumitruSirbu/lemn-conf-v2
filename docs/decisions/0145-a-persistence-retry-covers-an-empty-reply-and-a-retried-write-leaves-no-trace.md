# ADR 0145 — A persistence retry covers an empty reply, and a retried write leaves no trace

Status: Accepted
Date: 2026-10-06
Type: Decision
Milestone: M7C CE (slice S4, `556abb3`)
Supersedes: [ADR 0142](0142-persistence-concurrency-migration-safety-and-api-reasons-recovered-from-code-comments.md)
decisions 2 and 3.

**Tiers.** [source-verified] a reading of the installed driver. [implementer-run] and [coordinator-run] were
reported to the scribe, not re-run by it. [owner] is a ruling given 2026-10-06. Cited in code as
`see ADR 0145` (`packages/persistence/src/retry-on-transient-failure.ts`, `share-link-repository.ts`).

## Decision 1 — the retry predicate: Neon's marker, or an empty reply body

Retry a query when either holds.

- Neon's `"neon:retryable": true` marker, read from the message as before.
- An **empty reply body**: the driver's bare `SyntaxError` *"Unexpected end of JSON input"* from `ye.json()`
  on a 2xx or 400 (`@neondatabase/serverless@1.1.0`, `index.mjs:1293` and `:1297`) [source-verified]. It is
  matched by class tag `[object Error]`, `name` and the exact message, so an Error from another realm
  matches and a plain lookalike object does not.

**Not retried:** a decoded Postgres rejection (400 with a code); `NeonDbError("Error connecting to
database…")` from a rejected fetch; a non-JSON 502; a reply cut mid-body (undici `TypeError: terminated`);
and `Connection terminated unexpectedly`. The last is an **owner ruling**: no production path uses it (the
pg `Client` appears only in the test-schema lock harness and `migrate.ts`). Budget unchanged: 3 attempts,
waits of 500 and 1 500 ms.

## Decision 2 — a retry never leaves a trace of the attempt it replaces [owner]

A retried call ends in the same rows as a first-time success: no duplicate design, link or visitor move,
no orphan. By caller class:

- **Reads:** `load`, `loadOwned`, `resumeVisitor`, `status`, `loadShared`, `fetchDesignPage`,
  `findDesignIdsForTests`.
- **Idempotent:** `revoke`, `deleteDesignsForTests`.
- **Made idempotent:**
  - `mint`: the id is fixed before the callback and the insert is `on conflict (id) do nothing` (already so
    since ADR 0114 H1).
  - `issue`: one transaction. The revoke runs only if this call's token row does not exist; the insert is
    `on conflict (token_hash) do nothing`; the readback is by token regardless of `revoked_at`. **On a retry
    only,** the readback omits the visitor condition [owner], so a mint's visitor rotation inside the retry
    window still answers `issued`. A refused caller writes nothing.
  - `updateIfCurrent`: a retry-only arm adopts the row at revision + 1 holding this exact jsonb document
    under the same id and write token.

## Decision 3 — accepted residuals

- **F1** [owner]: a third writer inside the retry window. The rows equal a clean run; the retried save
  answers 409.
- **F2:** a second tab saving the identical document under the same write token is adopted by the landed
  arm. Harmless.
- A retried **revoke** across a visitor rotation answers `refused` though the link is revoked [owner]; there
  is no per-call key.
- A retried **mint** whose window holds a concurrent rotating mint can throw after its row landed (within
  SEC-7E3b.8, ADR 0118).
- The old false 409 survives only when the first attempt is still uncommitted as the retry starts,
  practically out of reach.

Security-reviewed twice: no caller without the credential learns anything; a write-token holder without the
visitor cannot obtain `issued`, because the token row exists only if that request passed the full predicate
at insert.

## What this replaces in ADR 0142

Decision 2's *"a lost acknowledgement retries into a primary-key collision"* is now **false**. Decision 3's
function name, file, marker-only rule, call-site list and *"accepted false conflict"* are replaced by
decisions 1 to 3 above.

## Note — 2026-10-08: a counter is a fourth caller class, counted and erring high

Decision 2 lists reads, idempotent calls and made-idempotent writes. The rate-limit store (M8 wave 8E) adds a caller
that is none of them: a counter, whose hit is repeated after a cold-start refusal and may therefore count one request
up to three times. An over-count is a trace, so this is an exception to decision 2's headline, **the architect's
ruling and open to the owner**. A counter errs high and never low between prunes of a window. Decisions 1 to 3 above
are unchanged. The ruling, its reasons and the empty-reply case: [ADR 0149](0149-the-rate-limit-store-keeps-one-row-per-bucket-per-window-refuses-a-broken-promise-and-may-count-high-but-never-low-between-prunes.md)
decision 3.

## Note — 2026-10-09: a repeated statement re-sends the same proposal (wave 8I)

The contact submissions store relies on decision 2's retry: a repeated statement re-sends the same reference proposal, so a call whose first attempt landed still answers *new*, and only a collision draws a new proposal. A repeated mark keeps the first instant. [ADR 0153](0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md) decision 4.

## Evidence

Live tests `packages/persistence/tests/retried-writes-leave-no-trace.test.ts` and QA's
`qa-ce-s4-retry.adversarial.test.ts` drop the reply after the write lands and compare the rows with a clean
run; a sabotage per clause goes red. Persistence 819/819 [implementer-run]. Backlog 117 stays open (see
`docs/backlog/open.md`).
