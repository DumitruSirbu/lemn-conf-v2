# Persistence, database safety, and backup

## FINDING: Destructive test cleanup bypasses its documented database guard

- **ID:** DB-001
- **SEVERITY:** High
- **THE EXPLOIT/FLAW:** `deleteDesignsForTests` documents that passing the application database is
  refused by the live-suite guard, but the implementation accepts any `connectionUrl`, constructs a
  Neon client, and issues `DELETE` directly
  (`packages/persistence/src/delete-designs-for-tests.ts:3-25`). It neither calls nor imports
  `resolveTestDatabaseUrl`. The function is exported from the package's public index
  (`packages/persistence/src/index.ts:13-14`). E2E callers pass the raw value named
  `TEST_DATABASE_URL`, but `apps/web/playwright.config.ts:74-99` only checks that the variable exists;
  it does not compare it with the application database. A misnamed production owner URL therefore
  defeats the promised three-layer safety model. The normal application role currently lacks DELETE,
  but the helper explicitly expects a privileged owner connection, so role permissions are not a
  reliable guard.
- **REMEDIATION:** Do not accept an unvalidated raw URL in the delete API. Export a single
  `assertSafeTestDatabaseUrl(url)` that compares normalized host, port, and database identity against
  `DATABASE_URL`, and call it both in Playwright configuration before starting the server and inside
  every destructive helper. Prefer:

  ```ts
  export async function deleteDesignsForTests(
    ids: readonly string[],
  ): Promise<void> {
    const connectionUrl = resolveTestDatabaseUrl();
    // delete only the provided, suite-recorded IDs
  }
  ```

  If CI must pass an override with no application URL, require an explicit test-database marker in the
  database itself and verify it read-only before deletion. Add a test that mocks the driver and proves
  no query is issued when the URL equals the application database.

## FINDING: Backup scales as multiple full in-memory copies of the database

- **ID:** DB-002
- **SEVERITY:** High
- **THE EXPLOIT/FLAW:** `fetchAllDesigns()` returns every design row as one array and executes a full
  ordered select (`packages/persistence/src/design-row-source.ts:29-64`). The web backup retains that
  array, maps every row through `JSON.stringify`, joins all lines into one string, and hands that string
  to Blob (`apps/web/src/lib/server/backup-designs.ts:85-98,114-129`). Peak memory includes database
  result objects, individual JSON strings, the joined NDJSON string, and upload buffering. Growth is
  O(total stored data), and SEC-001 allows total rows to grow without an active application quota or
  retention job. The nightly recovery mechanism will eventually OOM precisely when the database is
  large enough that recovery matters.
- **REMEDIATION:** Change `DesignRowSource` to keyset pages or an async iterable and upload NDJSON as a
  `ReadableStream<Uint8Array>`. The installed `@vercel/blob` 2.8 type accepts `ReadableStream`, so the
  current `BackupBlobClient.upload(pathname, body: string)` interface is the artificial buffering
  constraint. Fetch bounded pages ordered by `id`, encode each row into the stream, observe backpressure,
  and keep only one page in memory. For very large exports, use Blob multipart upload with fixed-size
  parts. Add a stress test whose fake source yields enough data to exceed the old memory budget and
  assert bounded page size rather than constructing the full result.

## FINDING: Backup failure is masked as success and raw error detail crosses boundaries

- **ID:** DB-003
- **SEVERITY:** Medium
- **THE EXPLOIT/FLAW:** The cron route deliberately returns HTTP 200 even when export failed
  (`apps/web/src/app/api/cron/backup-designs/route.ts:11-21`). This prevents status-based monitoring,
  retry, and alerting from distinguishing a backup from no backup. The failure path logs the raw error
  object and returns `error.message` in the authorized response
  (`apps/web/src/lib/server/backup-designs.ts:90-110,151-159`). Driver, storage, and network errors can
  contain internal endpoint, object path, request, or credential-adjacent detail; there is no redaction
  boundary. The route's cron bearer check limits who can request the body but does not make raw logs
  safe.
- **REMEDIATION:** Return `503` when export fails and a distinct warning status/field when export
  succeeds but rotation fails. Emit stable public error codes, not exception messages. Log a redacted
  structured event such as `{ operation: "backup", stage, code, errorName }`; never log the raw object,
  URL, headers, or connection string. Wire an alert to consecutive failures and test both HTTP status
  and absence of a synthetic secret in logs/responses.

## FINDING: Migration runner cannot safely evolve beyond idempotent DDL

- **ID:** DB-004
- **SEVERITY:** Low
- **THE EXPLOIT/FLAW:** `runMigrations` keeps a hard-coded file list, executes every file on every run,
  records no applied version/checksum, and runs each file as a separate query
  (`packages/persistence/src/migrate.ts:14-47`). Current files are written to be idempotent, but a future
  data backfill, rename, constraint validation, or non-idempotent transformation can rerun or leave the
  database partially migrated after a later file fails. The code comments explicitly acknowledge the
  missing ledger.
- **REMEDIATION:** Add an append-only `schema_migrations(version, checksum, applied_at)` table. Under an
  advisory lock, verify checksums of applied files, execute each unapplied migration in a transaction,
  and insert its ledger row atomically. Fail on a changed checksum or gap. Keep privileged migration
  credentials separate from the application role as they are now.
