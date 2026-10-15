# ADR 0142 — Persistence concurrency, migration safety and API reasons recovered from code comments

Status: Accepted
Date: 2026-10-06
Type: Finding (recovered reasons; no behaviour changes)
Milestone: Cross-cutting (M7 persistence and security reviews, M6 backups); filed under ADR 0136 decision 3

**Why this record exists.** [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
decision 3. **Evidence tier for every decision: recovered from a code or test comment on 2026-10-06, not
re-measured.** Security-sensitive items (decisions 1 to 6 and 8) describe the **class and shape** of the
problem only; no credential, connection string, token or host appears here, and none should be added.
Finding ids such as "SEC-7E3c.4" are the comments' own labels; the findings themselves are recorded only
in `docs/STATUS.md` and `docs/backlog/open.md` (a few entries), not in an ADR. Cite as
`see ADR 0142 decision N`.

## Decision 1 — share-link issue and design mint run at an explicit READ COMMITTED

- **Rule.** `NeonShareLinkRepository.issue` and `NeonConfigurationRepository.mint` pass
  `{ isolationLevel: "ReadCommitted" }` to the transaction explicitly. It is Postgres's own default; it is
  stated so a change to the driver's default cannot silently change which outcome below the method gets.
- **Why (`issue`).** The `select … for update` on the design row serialises two concurrent issues for the
  same design, but the lock alone is not what keeps them correct. Under READ COMMITTED each statement
  takes a fresh snapshot, so a second `issue()` that blocked on the lock sees, once the first commits,
  that first call's *committed* insert when its own revoke and insert run. Its revoke deactivates the row
  the first just created before it inserts its own, leaving exactly one active row after any number of
  concurrent issues. Under `RepeatableRead` or `Serializable` its snapshot is fixed at its own `BEGIN`,
  before the first committed, so it would neither see nor revoke that row, and its insert would collide
  with the partial unique index `0006` adds.
- **Why (`mint`).** READ COMMITTED lets a visitor rotation racing another mint see the first one's
  committed move rather than a snapshot fixed before it (comment attributes it to SEC-7E3c.4).
- **Related, recorded.** `docs/STATUS.md` lists SEC-7E3c.4 ("`issue()` relied on READ COMMITTED") among the
  review findings fixed; [ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
  covers the rotation on mint.
- **Where.** `packages/persistence/src/share-link-repository.ts` (`issue`);
  `packages/persistence/src/neon-configuration-repository.ts` (`mint`).

> **Dated pointer, 2026-10-06: decisions 2 and 3 are superseded by [ADR 0145](0145-a-persistence-retry-covers-an-empty-reply-and-a-retried-write-leaves-no-trace.md)** (CE S4, `556abb3`).
> Decision 2's "a lost acknowledgement retries into a primary-key collision" is now false; decision 3's
> name, file, marker-only rule, call-site list and "accepted false conflict" are replaced. Text kept as
> written.

## Decision 2 — the retried callback must not generate the identifier, and a lost acknowledgement is a collision, not two rows

- **Rule.** The design `id` in `mint` and the `tokenHash` in `issue` are generated **outside** the retried
  callback and must stay there.
- **Why.** A retry that generated a fresh value each attempt would write a second row (or leave an earlier,
  unacknowledged attempt's link live under a token the customer never saw, alongside a second one) for a
  write the customer made once, whenever an acknowledgement is lost rather than the query refused. With the
  value fixed, a lost acknowledgement retries into a **primary-key collision**, which surfaces as an error
  and not as two links.
- **Citation fix.** The comment cited "R8 (ADR 0118)"; ADR 0118 contains no item R8. This decision is the
  record.
- **Where.** `share-link-repository.ts` (`issue`); `neon-configuration-repository.ts` (`mint`).

## Decision 3 — compute-restart retry: the marker is read from the message, and safety rests on idempotence

- **Rule.** `retryOnComputeRestart` repeats a query only while Neon's proxy says it could not reach the
  compute (`"neon:retryable": true`), with waits of 500 ms and 1 500 ms before the second and third
  attempts and a final attempt outside the loop whose error propagates unchanged. Every other failure
  propagates on the first attempt.
- **The marker is read from the message, because the driver decodes fields for HTTP 400 only.** Comment:
  `@neondatabase/serverless@1.1.0` decodes the server's structured fields onto `NeonDbError` for HTTP 400
  alone; every other status stringifies the whole payload into the message and leaves `code`, `detail`
  and the rest `undefined`. A cold start is an HTTP 500, so matching on `code` would match nothing. The
  last `describe` block of `retry-on-compute-restart.test.ts` pins the shape against the real driver.
- **What makes it safe is idempotence, not the marker.** The marker is the proxy's judgement about its own
  error; the vendor does not promise the statement never ran. `mint` keeps its id outside the callback
  (decision 2); `updateIfCurrent` is guarded by `revision::text = ${expectedRevision}`; `load`,
  `fetchDesignPage` and `delete … where id =` are reads and an idempotent delete.
- **Accepted "false conflict".** If a commit's acknowledgement is lost, the repeat of an
  `updateIfCurrent` finds a revision that has moved and the customer is told their design changed
  elsewhere when their own save landed. Nothing is lost either way (reloading shows their save;
  overwriting rewrites the same document); the message is wrong in a single tab. It needs a post-commit
  acknowledgement loss stamped retryable, and is accepted at that likelihood.
- **Backoff sizing, as the comment gives it.** Sized to outlast a restart, not a warm start: ADR 0002
  records twice that a cold start on this tier "costs about a second", so the last attempt lands about
  2 s in. No route or `vercel.json` sets `maxDuration` (leaving the platform default) and the client's own
  read timeout is 10 s, so the worst case is, in the comment's words, "a fifth of the smallest of those,
  and only on requests that were failing anyway". No jitter at this traffic level.
- **Declined shapes.** A fetch-level failure the driver wraps with no payload in the message, and a
  non-JSON gateway body such as a 502.
- **Why it matters.** Per the code comment, the `/d/{id}` and `/s/{token}` pages rethrow every error but
  their mapped ones and the app declares no `error.tsx`, so a cold start there shows a customer opening
  a link Next's default error page. (An earlier version of this record named a file that does not
  exist; the routes are the comment's own.)
- **Where.** `packages/persistence/src/retry-on-compute-restart.ts`.

## Decision 4 — the unattended-migration screen refuses unmodelled lexical constructs and constrains DO blocks to one template

*Extends [ADR 0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md)
decision 5 (additive, idempotent migrations run unattended; the rest need a human).*

- **Rule 1 — refuse by default.** A statement runs unattended only if a shape in
  `ADDITIVE_STATEMENT_SHAPES` positively recognises it as additive and idempotent. The first version was a
  denylist, and adversarial QA broke it seven ways on 2026-09-07 without writing an unusual statement
  (every rule had assumed a keyword Postgres makes optional). The named destructive diagnoses stay to
  sharpen messages and to catch a denied operation inside a recognised shape; they are not the safety
  property. It is a lexical screen, deliberately not a parser: it over-refuses, and a false refusal costs
  one manual apply.
- **Rule 2 — one construct this scanner cannot lex costs the whole file its unattended status
  (`unmodelledConstructsOf`).** The constructs: a backslash inside a single-quoted string (its meaning
  depends on `standard_conforming_strings`, which the module never reads); `E'`, `U&`, `B'`, `X'` string
  prefixes; an unquoted identifier containing `$` (read as a dollar-quote open); a tagged dollar quote; a
  nested block comment (Postgres nests them, this scanner does not); and a bare carriage return not
  followed by a line feed (Postgres ends a `--` comment at `\n` **or** `\r`). Each of these, the comment
  says, merged a hidden, unscreened statement into a preceding `create table if not exists`.
  **"Modelling more of Postgres's lexer is not the fix that generalises"**: the next construct nobody
  pictured would still get through, so the module refuses by construct, checked once per file before the
  allowlist runs (a file that hits one cannot trust its own statement split).
- **Rule 3 — `DO` blocks.** A `DO` block is recognised only as the exact `pg_constraint`-guarded
  `alter table … add constraint … check (…)` template, matched structurally rather than by the mere
  presence of `pg_constraint` (an old check accepted any block that *mentioned* it, including inside a
  string a dynamic statement built from). The `check` condition is read with a balanced-paren scan and
  may hold no `;`; what follows must be exactly the template's tail; `begin` and `end if;` must each occur
  once (the anchoring stated twice, structurally and by count, so a bug in one is not the only barrier).
  Dynamic SQL inside any `DO` block (`execute`, `perform`, `format(`, `||`) is refused regardless of
  template. A comment marker anywhere in a `DO` body is refused, because PL/pgSQL strips comments before
  running the body, so a function call split by an empty block comment would reach the check as two
  broken tokens and run as one call.
- **Rule 4 — function calls in `check` or `default`.** Refused by syntax (an identifier immediately
  followed by `(`), not by a denylist of names; the one exception is `now()`, matched whole — exactly the
  unqualified and `pg_catalog`-qualified spellings — never by its last segment.
- **Other shapes.** `insert … values` only (never `insert … select`; only `on conflict … do nothing`);
  `create table … as select`, `inherits` and `partition of` refused; an added `not null` column must carry
  its own default, asked of each clause and not of the statement.
- **Where recorded elsewhere.** The SEC-7E3c.* findings behind these rules are listed in `docs/STATUS.md`
  (and `docs/backlog/open.md` for the open ones). This decision is the durable statement of the rules.
- **Where.** `packages/persistence/src/migration-safety.ts`.

## Decision 5 — the test-database guard reads the database name from the URL path only, which holds for one driver

- **Rule.** `identityOf` reads the database name from the path only, which is correct for
  `@neondatabase/serverless`, the one driver the package uses. **libpq applies URI query keywords after
  the path, so a `dbname` query parameter overrides it:** a URL whose path names a test database could
  reach another database entirely under libpq.
- **Consequence.** Anything that adds a second driver must check how that driver resolves the two and read
  the parameter in `identityOf` if it can win; otherwise the guard silently starts checking a name nothing
  connects to. **Only libpq's behaviour is verified; other clients were not checked.**
- **Why credentials and query parameters are otherwise excluded.** A second role on the same database is
  still that database.
- **Where.** `packages/persistence/src/test-database-url.ts` (`identityOf`).

## Decision 6 — `databaseNameOf` never throws, and refuses a URL shape whose path would carry the credential

- **Rule.** `databaseNameOf` returns the database a connection string names and nothing else, and **never
  throws**. It returns a placeholder for an unparseable string and a second placeholder for a string
  with a scheme other than `postgres:`/`postgresql:` or with no `//` authority at all, before any pathname
  is read. It returns the pathname still percent-encoded with any backslash untouched; the judgement of a
  raw `%` or `\` belongs to `assertDeclaredEnvironmentReaches`.
- **Why it never throws.** `new URL` on a malformed string raises `ERR_INVALID_URL`, which carries the
  whole input — password included — as an enumerable property that Node's uncaught-exception printer
  emits into a deploy log.
- **The shape (described, not exemplified).** A connection string written with a single slash after the
  scheme has an empty `host` and a `pathname` that starts with the userinfo and host. A naive
  pathname-strip would return the credential itself as "the database name": a **leak** (found by security
  review). Separately, the driver re-parses the same string under `http:`, a WHATWG "special" scheme that
  tolerates the missing slash, and resolves a real host and database there — so a label equal to that raw
  fragment would pass `assertDeclaredEnvironmentReaches` as its own unclaimed ad-hoc name while the driver
  reaches a listed environment's database: a **bypass** (found by logic review, same root cause).
  Refusing every URL shaped like this before any pathname is read closes both at once, "rather than
  trying to enumerate every string that can produce them".
- **Where recorded elsewhere.** `docs/milestones/migration-environment-safety-check.md`.
- **Where.** `packages/persistence/src/migrate.ts` (`databaseNameOf`, `hasTrustedPostgresAuthority`).
- **Note, 2026-10-07 — [ADR 0146](0146-nothing-copied-from-a-connection-value-or-thrown-by-a-driver-leaves-the-persistence-package.md).**
  `databaseNameOf` now lives in `packages/persistence/src/open-database.ts`, not `migrate.ts`, and its
  no-slash refusal is applied at every site that opens a connection (B7), not only the migration target.
  The rule above stands; its reach widened.

## Decision 7 — a live test forgets the migration-ledger rows before dropping the column, never after

- **Rule.** In the live suite that drops the `revision` column, the ledger rows are forgotten **first**
  and the column dropped second, and **every version from `REVISION_VERSION` upward** is forgotten, not
  only `REVISION_VERSION`.
- **Why (order).** Killed between the two steps, the forgotten-first order leaves only a forgotten tail,
  which the next `runMigrations` re-applies and re-records. The other order leaves the ledger claiming a
  column that is gone, which is the comment's "BACKLOG 69's second error" and wedges every later run
  (review finding R1.2).
- **Why (every later version).** Forgetting 4 while a later migration stays recorded is itself the gap the
  runner refuses (`MigrationSequenceError`); migration 0005 is such a later one. The comment says the
  same argument is made by `WRITE_TOKEN_MIGRATION_VERSIONS` in
  `neon-configuration-repository.adversarial.test.ts` (WEB-003).
- **Related, recorded.** [ADR 0128](0128-live-persistence-suites-serialise-through-a-declared-transaction-scoped-readers-writer-lock.md)
  (the exclusive schema lock this suite holds); backlog 69.
- **Where.** `packages/persistence/tests/neon-configuration-repository.test.ts` (the "backfills rows that
  already existed" test).

## Decision 8 — the expected revision of a save travels in a custom header

- **Rule.** A save states the revision it edits in `x-expected-revision`, a custom request header (WEB-003).
- **Why.** Not a body field: the body of a save **is** the `Design` document and `CurrentDesignSchema` is
  strict, so a revision smuggled into it would be rejected; and transport metadata inside the customer's
  document is how the two come to be confused later. Not `If-Match`, even though the semantics are a
  conditional write: that header's failure is a `412` while this route answers `409`, the status the
  client's two-way choice (reload, or overwrite) is written against, and `If-Match` "invites a proxy or
  CDN to act on a precondition it does not understand here". A custom header is inert to every
  intermediary.
- **Where.** `apps/web/src/app/api/designs/[id]/route.ts` (`EXPECTED_REVISION_HEADER`).

## Decision 9 — backup retention is by age, with a count ceiling beside it, and never "keep the last N"

- **Rule.** `BACKUP_RETENTION_DAYS = 14` stays the authoritative rule. `MAX_RETAINED_BACKUPS = 30` is a
  ceiling on file count, not a second retention policy; age wins when they disagree. Do not replace age
  retention with keep-the-last-N.
- **Why the ceiling.** Nightly runs put steady state at roughly `BACKUP_RETENTION_DAYS` files, so it never
  binds normally. It exists for the abnormal case (a cron delivered repeatedly, a manual
  `runDesignsBackup` loop, any future schedule more frequent than daily), since each file is a full copy
  of the table.
- **Why not last-N (comment, "considered on 2026-08-31 and rejected").** A small N reads as tidiness but
  silently trades away recovery depth, precisely when the table is large enough for storage to look worth
  saving — the same moment a restore matters most. Bounding what each dump *contains* is the retention
  cron in ADR 0019 decision 7, not this.
- **Source.** The decision is also recorded at `docs/backlog/resolved.md` ("DECIDED 2026-08-31: age stays
  the rule, and a count ceiling was added beside it"; the owner asked for "keep the last 3" and, after the
  trade was laid out, chose the 14-day window plus a ceiling). Recorded there by the owner's choice as
  that entry states it; not re-confirmed on 2026-10-06.
- **Where.** `apps/web/src/lib/server/backup-designs.ts` (`MAX_RETAINED_BACKUPS`).

## Decision 10 — a save restamps `schema_version`, which is safe because a normalised document is a fixed point of every older arm

- **Rule.** `updateIfCurrent` writes `schema_version = CURRENT_SCHEMA_VERSION` with the document.
  The property it relies on, and that **any future `migrateDesign` arm must keep**: a normalised document
  is a fixed point of every arm below the current version (re-running an older arm on it changes
  nothing), so the restamp is safe in both directions.
- **Why.** The document was produced by this build; a row left at its minted version would keep asking for
  an older normalisation arm on every load, so that arm could never be removed.
- **Evidence note.** Searched `docs/decisions/` and `docs/backlog/` on 2026-10-06 for the restamp and
  fixed-point property: no decision record states it. `docs/milestones/M6-price-and-global-settings.md`
  (a plan, line "The migration is a fixed point") states the property for one migration only.
- **Evidence tier.** Recovered from a code comment on 2026-10-06, not re-measured.
- **Where.** `packages/persistence/src/neon-configuration-repository.ts` (`updateIfCurrent`).
