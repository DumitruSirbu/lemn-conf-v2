# ADR 0020 — A migration that exists is not a migration that ran

Status: Accepted
Date: 2026-08-25
Type: Finding + Decision
Milestone: M3 Wave 3C-2a — found by adversarial QA

> **Amended 2026-08-31 (wave S10).** Decision 4, left open here for "whichever wave next touches
> `migrate.ts`", is settled by [ADR 0042](0042-the-database-records-which-migrations-it-ran.md): an
> append-only `schema_migrations` ledger, one transaction per migration. This record's finding and
> decisions 1–3 stand, and its schema read-back is still owed.

## Context

Wave 3C-2a added `0002_add_write_token_hash.sql` and the code that depends on it. Every gate was
green: `pnpm check` passed with 924 tests, including a persistence suite that asserts the migration
applies, that it is idempotent, and — better than asserting the column exists — that dropping the
column and re-running the migration puts it back, so only a migration that genuinely executes
passes.

Adversarial QA then queried the databases directly:

```
APPLICATION  /lemn-conf-v2        rows: 0  columns: id, schema_version, document, created_at, updated_at
TEST         /lemn-conf-tests-v2  rows: 0  columns: id, schema_version, document, created_at, updated_at, write_token_hash
```

**The application's database had never been migrated.** `write_token_hash` existed only in the test
database, and it got there because `neon-configuration-repository.test.ts`'s `beforeAll` calls
`runMigrations(testDatabaseUrl)` — the suite migrates the database it is about to use.

**`rows: 0` above is a dated observation, not a ruling, and it is stale.** Re-measured 2026-09-02
during M5 wave 5G: the application database now carries **5 `designs` rows**, all `schema_version` 1
(see [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)). This is the same premise ADR 0038
corrected once already (2026-08-31, on reachability) and again (2026-09-02, on "no design has ever
been stored"). This paragraph is left as it was measured on 2026-08-25 — it was true then — with this
pointer added so a reader does not re-inherit `rows: 0` as still current.

The first `POST /api/designs` against the real database would have failed on
`insert into designs (…, write_token_hash)` with `column … does not exist`. Mint 500s; the entire
write path is dead.

## The finding

**No test in this repository could have caught it, and that is a consequence of a correct decision,
not a missing one.** ADR 0006 requires live database tests to run against a separate database and
guards hard against pointing at `DATABASE_URL` — that record exists because a test once had to be
prevented from doing exactly that. The guard is right and stays.

But it means every migration assertion in the repository targets the test database, and a
test-database assertion proves the migration **file** is correct while saying nothing about whether
it was ever **applied** anywhere else. A green suite is not evidence about production schema.

This is ADR 0013's lesson one level up. That record's finding was "a zero exit status is not
evidence a migration ran". This one is "a green suite is not evidence a migration ran either".

**It got worse on the way out.** Applying the migration produced:

```
pnpm --filter @lemnaria/persistence run migrate
→ exit 0, and no output whatsoever
```

Silence on success, from a command with a recorded history of exiting 0 while doing nothing, is
close to the worst available output: the operator cannot tell "applied one migration" from "did
nothing" without going to the database. The column was verified present by reading
`information_schema` directly, never by trusting that exit code.

## Decisions

1. **Applying a migration to a deployed environment is a first-class release step**, not a
   consequence of merging the file. It is recorded in the wave that adds the migration, and the
   wave does not close until the deployed schema has been **read back and quoted**.
   **Amended 2026-09-07 by [ADR 0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md)
   decision 5, in one clause only.** On the owner's direction that migrations run in the deployment
   pipeline, an **additive, idempotent** migration is applied by that pipeline **without a human
   present**, so *"with the owner's authorisation"* no longer governs that class. Everything else in
   this decision stands, and the authorisation requirement stands unchanged for any migration that
   can destroy or rewrite data, or that cannot run inside the runner's transaction — which the
   pipeline must **refuse** rather than run. The read-back is not weakened by the automation; ADR
   0096 decision 3 makes it a standing guard precisely because a pipeline that trusts its own exit
   status repeats this record's finding.
2. **Verification is by inspecting the schema, never by the migrate command's exit status.**
   `information_schema.columns` for the shape; `has_column_privilege` / `has_table_privilege` for
   the grants — asking Postgres what the role *was granted*, rather than inferring it from the
   absence of a column-level ACL, which does not establish what was granted in the first place.
3. ~~**The persistence suite keeps a standing assertion that the application database carries the
   current schema**, whose failure message names the fix command so the failure explains itself.
   This is the one check that would have caught it, and it necessarily reads the application
   database — read-only, schema only, never its rows, so ADR 0006's guard against *writing* to the
   application database is untouched.~~
   **Amended 2026-09-07 by [ADR 0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md)
   decision 2 — the intent stands, the mechanism does not.** This assertion **was never
   implemented**, and on 2026-09-07 the failure it was written to catch happened again, in
   production, found by a customer. ADR 0096 finding 4 also records that it would not have been
   sufficient as specified: a suite-level check inherits its target from whichever untracked
   `.env` file the executing machine supplies — production from the repository root, preview from
   `apps/web` (ADR 0054), nothing in CI — and `describe.skipIf(!hasLiveDatabase)` keeps it silent
   exactly where it must speak. The read-back is therefore a **deploy-time gate naming each
   environment**, able to fail in the pipeline. A suite-level assertion may stand beside it; it may
   not be it. **Decisions 1 and 2 are unaffected and are restated by ADR 0096.**
4. **`migrate` must report what it applied.** A migration runner that prints nothing on success is
   indistinguishable from one that did nothing, which is precisely the failure ADR 0013 recorded.
   Scoped as a follow-up rather than done here; owner named below.

## Alternatives considered

1. **Run migrations automatically at application start or during the build.** Rejected: the
   application connects as `app_designs`, which by ADR 0008 deliberately holds no DDL privilege, and
   migrations use a separate owner connection. Handing DDL to the runtime role to make deployment
   convenient would reverse a security decision to save an operational step.
   **Still rejected as written, 2026-09-07 — and read the distinction
   [ADR 0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md)
   decision 2 draws on it.** The owner has directed that migrations run in the deployment *pipeline*,
   which is not this: this rejection is about *which role executes DDL*, and ADR 0096 chooses a
   GitHub Actions job holding its own credential, handing DDL to no runtime. Running `migrate` from
   Vercel's `buildCommand` **is** this alternative's case and remains refused, on this reasoning plus
   four more recorded there.
2. **Let the test suite migrate the application database.** Rejected outright — it inverts ADR 0006,
   whose entire purpose is that tests never touch the application's database.
3. **Treat it as a one-off operator slip.** Rejected: the whole point is that nothing in the
   repository could have told anyone. A gap invisible to every gate is a process defect, not a
   mistake.

## Consequences

- The migration was applied to `lemn-conf-v2` on 2026-08-25 with the owner's authorisation. The
  table held 0 rows and the change is additive and idempotent (`add column if not exists`,
  nullable), so nothing could be lost. Verified afterwards by reading `information_schema`.
- ADR 0019's grant claim is now **verified rather than asserted**: `app_designs` holds
  `select`/`insert`/`update` on `write_token_hash` through the existing table-level grants, and
  still holds neither `delete` nor `truncate`. No widening was required and ADR 0008 stands.
- **Preview has its own database** (ADR 0009) and needs the same migration. **It could not be
  checked from here, and this is not a gap that can be closed locally**: Preview's `DATABASE_URL` is
  stored as a *sensitive* Vercel variable, so `vercel env pull` returns `[SENSITIVE]` rather than a
  connection string. That is correct behaviour and must not be changed to make this convenient.

  Until it is migrated, minting on a Preview deployment 500s exactly as production would have.
  Verifiable two ways, neither of them local: read the schema in the Neon console for the Preview
  database, or `POST /api/designs` against a Preview URL and see whether it returns 201 or 500.
  Recorded as open in `docs/STATUS.md`, owner: whoever next needs Preview to exercise the write
  path — which is Wave 3C-3's mobile gate if it runs against Preview rather than locally.
- Decision 4's owner: whichever wave next touches `packages/persistence/src/migrate.ts`. It must not
  be discovered a third time.

## Amendment — 2026-08-31: decision 4 is settled, and the runner now has a ledger

**Appended, not rewritten**; everything above stands as written.

Decision 4 named its owner as *"whichever wave next touches `packages/persistence/src/migrate.ts`"*.
That wave has happened: the adversarial-review remediation's wave S10, commit `945de39`, closing
**DB-004** in `testing-reports/05-persistence-and-backup.md`. It is recorded in
[ADR 0042](0042-the-database-records-which-migrations-it-ran.md).

**What that supersedes here.** This record describes a runner that deliberately keeps no ledger, so
the prose above that treats "which migrations ran" as unanswerable from the database is superseded.
There is now an append-only `schema_migrations(version, checksum, applied_at)` table, one
transaction per migration with its ledger row inserted inside it, and a run that always prints what
it applied — decision 4's requirement, met.

**What still stands.** The finding is unchanged, and so are decisions 1, 2 and 3. Applying a
migration to a deployed environment is still a first-class release step; verification is still by
inspecting the schema and never by an exit status — a ledger row is evidence about what the runner
did, not the schema read-back this record requires — and **that read-back is still owed after the
first production run**. The deployed databases have not been migrated by wave S10. The Preview item
in Consequences is likewise untouched and still open.
