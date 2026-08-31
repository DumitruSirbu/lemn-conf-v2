# ADR 0042 — The database records which migrations it ran, and the runner refuses to guess

Status: Accepted
Date: 2026-08-31
Type: Decision
Milestone: Adversarial review remediation, wave S10 — closes DB-004; supersedes prose in [ADR 0020](0020-a-migration-file-is-not-an-applied-migration.md)

## Context

[ADR 0020](0020-a-migration-file-is-not-an-applied-migration.md) is titled *"A migration that exists
is not a migration that ran"*, and it recorded the runner as having no way to tell the two apart.
Its decision 4 — *"`migrate` must report what it applied"* — was scoped as a follow-up and assigned
to **"whichever wave next touches `packages/persistence/src/migrate.ts`"**, with the note that it
must not be discovered a third time. This wave is that wave.

`testing-reports/05-persistence-and-backup.md` records the state as **DB-004**: the runner kept a
hard-coded file list, executed every file on every run, recorded no applied version or checksum, and
ran each file as a bare query. That is correct only for as long as every migration is hand-written
to be idempotent — which all three shipped files are. The first data backfill, rename, constraint
validation or other non-idempotent transformation either re-runs, or leaves the database half
migrated after a later file fails, and **nothing afterwards can say which**.

Commit `945de39` (`feat(persistence): record which migrations ran, and refuse to guess`) is the
change these decisions describe.

## Decisions

### 1. There is an append-only `schema_migrations` ledger, so a file and an applied migration are now different things

`schema_migrations(version integer primary key, file_name text, checksum text, applied_at
timestamptz)` records one row per migration that actually executed against this database. Reading it
answers the question ADR 0020's title says could not be answered.

The ledger is **append-only in the strict sense**: `SELECT_APPLIED_MIGRATIONS_SQL` and
`INSERT_APPLIED_MIGRATION_SQL` in `migration-ledger.ts` are the only two statements this package
ever runs against it, and there is no update and no delete anywhere. A row is a fact about something
that happened. Rewriting one would make decision 5's checksum guard meaningless — the repair for a
mismatch is to revert the file, never to relabel history. The primary key is a second,
database-level guarantee that a version is recorded at most once even if the lock of decision 3 were
somehow not held.

**The ledger is created by the runner, not by a migration file.** A table cannot carry the record of
its own creation, so `CREATE_MIGRATION_LEDGER_SQL` runs on every run, inside the same transaction
and *after* the lock, guarded by `if not exists`. It lives in TypeScript rather than as a loose
`.sql` file because the build copies only `src/migrations` into `dist` — a file present in the
source tree and missing from the published package is the exact shape of ADR 0013's failure.

The file list is also gone: `readMigrationFiles` reads the directory and asserts the versions run
consecutively from 0001. A hard-coded list is one more place to forget, where adding a file and not
its entry means the migration silently never runs.

### 2. One transaction per migration, with the ledger row inserted inside it

`applyIfPending` opens a transaction, decides, executes the file, inserts that file's ledger row, and
commits — all in one transaction, so **the schema change and the record of it are one change or
neither**. A migration cannot execute unrecorded, and cannot be recorded without executing.

A run that fails part-way leaves the migrations before it committed *and* recorded, which is the
honest account of what happened, and is exactly the state the next run needs in order to resume. A
failed migration is rolled back and reported as such: *"the database is unchanged by it and it is
not recorded as applied"*.

### 3. The lock is transaction-scoped, and that choice is what makes it safe

`ACQUIRE_MIGRATION_LOCK_SQL` is `select pg_advisory_xact_lock($1::bigint)` against a fixed key
(`MIGRATION_ADVISORY_LOCK_KEY`). Postgres releases it when the transaction commits or rolls back, so
the question *"what if a migration process dies holding the lock?"* has **no code path to answer**:
not an uncaught exception, not a `process.exit` between statements. A session-scoped
`pg_advisory_lock` would need a matching unlock on every path and would additionally depend on the
server noticing a dropped connection before the next deploy could proceed.

**The accepted cost, stated plainly: the lock covers one migration, not a whole run.** A second
runner can apply a later file between two of this one's transactions. That is safe only because of
decision 2's ordering — every transaction takes the lock and then **re-reads the ledger inside it**
(`lockLedgerAndCheckPending`), so a runner never decides from a view taken before the lock, and both
runners walk the files in the same order. Remove the re-read and this decision becomes a defect.

### 4. Existing databases adopt the ledger by re-running the migrations, not by backfilling it

The alternative — inspect `information_schema`, decide which migrations "look applied", and write
ledger rows to match — is rejected. **An inference that is wrong marks an unapplied migration as
applied, permanently and silently**, and every later run then trusts it. The schema is evidence
about the end state, not about which files produced it, so the inference cannot be made sound.

Re-running is safe *for this file set specifically*, and the claim is about these files rather than
about migrations in general. **The file set as of `945de39` is three**: `0001` is `create table if
not exists`, `0002` is `alter table … add column if not exists`, and `0003` wraps its `add
constraint` in a `do` block that checks the catalogue first, because Postgres has no `add constraint
if not exists`. All three are guarded DDL with **no DML and no drops**, so re-running them against a
live database brings the schema no further than it already is and touches no row of `designs`.

**The count is incidental; the invariant is not.** What this decision rests on is that **every file
adopted by re-running is idempotent** — a later migration added before a database adopts the ledger
must satisfy the same property, or it will execute a second time against a database that has already
had it applied by hand. That is the thing to check when the file set grows, not the number three.

**On the first production run**, the ledger table is created, every file the checkout carries is
pending, each executes, and one row is written per file; `describeMigrationRun` reports them as
applied. Every run after that reports them as already applied and applies nothing new. This is a
one-time cost paid once per database. A migration added after `945de39` is simply pending too, which
is the runner working as intended rather than an exception to this decision.

### 5. The checksum is SHA-256 over the file's bytes, with line endings normalised and nothing else

`checksumOfMigration` hashes the file after `\r\n` and `\r` become `\n`. Both halves are deliberate:

- **Line endings are normalised** because git can rewrite them on checkout (`core.autocrlf`), which
  would change every byte of every migration on a Windows clone and block a deploy over a difference
  nobody made. That is the one transformation a checkout applies on its own.
- **Nothing else is normalised** — not whitespace, not comments, not case. A rule cleverer than "the
  file changed" has to understand SQL, and every gap in that understanding is a place a real edit
  can hide. The comments in these files are load-bearing: `0003`'s explain a security control.

**The consequence is accepted deliberately: reformatting an applied migration breaks the next
migration run, on purpose.** The fix is to revert the file. It is never to re-checksum the ledger —
that would be editing history to match a file, which is the inversion decision 1's append-only rule
exists to prevent.

### 6. Four refusals, decided in one pure function, with "ledger ahead" told apart from a hole

`planPendingMigrations` in `migration-plan.ts` decides *what* to apply from two plain lists — the
files and the ledger rows — so every refusal is testable without a database and without racing one.
The database-shaped concerns (lock, transaction, insert) stay in `migrate.ts` and decide only *how*.
It refuses:

1. **A changed checksum.** *"An applied migration is history and must not be edited — the change it
   describes has already happened, and re-running it is not what an edit asks for."*
2. **A gap in the sequence** — a file recorded as applied sitting after one that is not. The
   database holds the later schema change without the earlier one, so running the earlier file now
   would apply it against a shape it was never written for.
3. **A rename with unchanged bytes.** The checksum hashes bytes and sees nothing; the ledger records
   `file_name` precisely so this is answerable. Until the two names were compared, the refusal
   message promised to catch a rename that in fact passed silently.
4. **A ledger row whose file has vanished** — and here the two causes are told apart, because
   naming the wrong one sends the operator looking for something that never happened:
   - **The ledger is merely ahead of the checkout.** Every orphaned version is above the highest
     version on disk: a newer migration shipped and applied, and `migrate` is being run from an
     older revision — the restore runbook's drill step does exactly this. Nothing was deleted, so
     the message says so and asks the operator to migrate from the matching revision.
   - **A genuine hole.** An orphaned version sits *below* the highest version on disk: a migration
     that ran has been deleted or renamed away. The message asks for the file to be restored at its
     original version.

   Both refuse. "Ahead" is benign as a *state* but not as a *result*: reporting success would tell
   the operator the database is at the schema this checkout expects, which is precisely what it is
   not, and the runner cannot know whether the newer migration is compatible with the code being
   rolled back to.

### 7. The runner uses the WebSocket driver, alone in this package

Everything else in `@lemnaria/persistence` uses the HTTP `neon()` function; `migrate.ts` uses
`Client`. **The HTTP driver has no session.** It cannot hold a lock across a read and a write, and
its transactions must be handed every statement up front — so "take the lock, read the ledger, then
decide what to execute" is not expressible over it. Decisions 2 and 3 require a session; this is
what pays for them.

A driver connect failure is wrapped rather than left to escape: Neon's WebSocket errors carry
endpoint and host detail, and the CLI's uncaught-exception path would print the whole object. The
replacement names the database and nothing else from the connection string, keeping the driver error
as `cause`. Same rule for the operator-facing lines — `describeMigrationRun` and
`describeMigrationFailure` name the database, never the connection string, and never the error
object. ADR 0020's decision 4 is settled by that first line, which always says what was applied,
spelling out "nothing" when that is the answer, and how many files were already applied.

### 8. Every migration now runs inside a transaction, and some statements are therefore impossible

Postgres refuses a handful of statements inside a transaction block, so **no migration file may
contain one**: `create index concurrently`, `reindex concurrently`, `vacuum`, `alter system`,
`create database`, `drop database`, and `alter type … add value` on older servers. A file using any
of them fails with a bare *"cannot run inside a transaction block"*, which says nothing about why
this runner is built the way it is — hence the paragraph on `runMigrations` that says it.

**The trade is accepted**: atomicity of a migration with its ledger row is worth more than building
an index without taking a write lock, on a table this project expects to stay small. A migration
that genuinely needs one of these has to be applied by hand and then recorded — **a deliberate
operator action that deserves its own decision record**, rather than a quiet exception carved into
this runner.

### 9. The deployed databases have not been migrated, and ADR 0020's read-back is still owed

This wave changed the runner. It did not run it against anything deployed. **Applying a migration to
a deployed environment remains a first-class release step** (ADR 0020 decision 1), and ADR 0020
decision 2's verification — reading `information_schema` rather than trusting an exit status — is
**still owed after the first production run**, now with `schema_migrations` as a second thing to
read back. A ledger that says three rows is evidence about what this runner did; it is not, on its
own, the schema inspection ADR 0020 requires, and treating it as such would repeat that record's
finding one level further up.

Migrations still connect only through `MIGRATION_DATABASE_URL`, never as the application role.
[ADR 0008](0008-least-privilege-database-role.md) is unchanged and unaffected: `app_designs` holds
no DDL privilege, so it can neither create the ledger nor write to it, and nothing here asks it to.

## Alternatives considered

1. **Backfill the ledger from `information_schema`.** Rejected — decision 4. A wrong inference is
   permanent and silent.
2. **A session-scoped advisory lock covering the whole run.** Rejected — decision 3. It buys
   run-level exclusion at the price of a lock a dying process can leave held, and the per-migration
   lock is safe because of the re-read.
3. **One transaction around the entire run.** Rejected: a failure would roll back migrations that
   had already succeeded, so a long run has no resumable middle state, and every file in the run
   would still be bound by decision 8's restrictions with no compensating gain.
4. **A checksum that normalises whitespace or strips comments.** Rejected — decision 5. It has to
   understand SQL to be right, and the comments in these files are load-bearing.
5. **Keep the hard-coded file list.** Rejected: adding a file and forgetting the entry means the
   migration silently never runs. The contiguity assertion is what the list was really buying, and
   it is now checked rather than assumed.

## Consequences

- **Two defects surfaced on the way in, both recorded in `945de39`.** The build copied migrations
  into an existing directory rather than replacing it, so an incremental build could leave a stale
  file beside a nested copy while the guard still passed — harmless under a hard-coded list, a
  silently partial migration set under a directory read. And the test proving the ledger row is
  atomic with its migration inserts its own ledger row, so when the transaction it tests is absent
  the row commits and **every later run refuses forever**; that wedged the shared test database
  during review, and the artefacts are now dropped unconditionally rather than only on the happy
  path. Both are the same shape: a ledger is a durable side effect, and anything that writes one
  outside the runner's transaction can poison a database permanently.
- **ADR 0020's decision 4 is settled** and its owner clause is discharged. The rest of ADR 0020
  stands: its finding, its decisions 1–3, and its open Preview item are untouched by this record.
- **The refusals are a deploy-time surface, not a development one.** Every one of them stops a run
  with an explanatory message rather than migrating "as best it can", which is the point — but it
  means an operator can now be blocked by a file edit that used to pass unnoticed. Decision 5's
  reformatting case is the likeliest, and its fix is one `git checkout` of the file.
