# ADR 0012 — The scheduled export is a scoped SQL select to ndjson, not `pg_dump`

Status: Accepted (closes ADR 0002 open questions 8 and 9)
Date: 2026-08-25
Type: Decision + Finding
Milestone: M2 Wave 2B

ADR 0002 raised two open questions about the backup job and marked both as "must be checked at
implementation time". The job was then built, and both were answered in code — but neither answer
was ever recorded. Found while converting the decision log to numbered ADRs: an implemented
behaviour whose reasoning exists only in a source file is exactly the knowledge this log is for.

## Question 9 — how the export is produced, given no `pg_dump` binary

A Vercel cron invokes an HTTP endpoint, so the job runs in a function runtime. `pg_dump` is not
available there, and ADR 0002 flagged that the "or equivalent" path had to be chosen deliberately
rather than discovered.

**Decision: a parameterised `select` over the `designs` table, serialised to ndjson — one JSON
object per line, every line newline-terminated.** The read lives in
`packages/persistence/src/design-row-source.ts` (`createNeonDesignRowSource`), because that package
is the only place in the codebase allowed to import a Postgres driver, so the backup's SQL is
audited in the same place as every other statement. The write lives in
`apps/web/src/lib/server/backup-designs.ts`.

**Scoped to `designs` alone, and this must not be widened.** A database-wide dump would sweep M8's
future contact table into Blob under the same 14-day rotation, contradicting the stricter handling
contact data is promised. Another table needs a second, separately-scoped export — not a broader
query. Both source files carry this warning at the point where someone would be tempted to change
it.

**Consequences.** The export carries table rows, not schema. A restore therefore assumes the target
already has the `designs` table — `packages/persistence/src/migrations/` creates it, and the restore
runbook's Path 2 runs migrations before loading rows. This is a real limitation compared with a
`pg_dump`: a restore cannot rebuild a database from nothing using the export alone. It is acceptable
because the schema is versioned in the repository and the document is self-contained, which is not
true of the data.

## Question 8 — the Hobby-plan cron frequency limit

**Resolved: the schedule is daily, which satisfies the limit on every plan.** `apps/web/vercel.json`
declares `0 3 * * *`, and the cron was confirmed registered on the first production deployment. The
constraint therefore never became binding, and no design depends on sub-daily runs. Accepted
worst-case data loss remains "up to roughly a day", as ADR 0002 recorded.

## Finding — the export failed on an empty table, on the first production run

The first real invocation, 2026-08-25, failed:

```
[backup-designs] export failed: Error: Vercel Blob: body is required
```

`toNdjson` used `join("\n")`, which returns `""` for zero rows, and `@vercel/blob`'s `put` rejects
an empty body outright. Production `designs` was at 0 rows, so **every scheduled run would have
failed** until the first design was written.

Three things made this worse than an ordinary bug, and each is the lesson worth keeping:

- **It reported success.** The endpoint returns 200 while logging the error, by design — a backup
  problem must never block the request path. So the Cron Jobs tab would have shown green runs, daily,
  producing nothing. This is precisely the failure ADR 0002's criteria warned about: a backup that
  never runs looks exactly like one that runs fine, until a restore is needed.
- **The code documented behaviour it did not have.** The comment on `toNdjson` claimed an empty table
  "produces an empty (but still valid, zero-line) file rather than failing".
- **A test asserted the defect as correct.** The empty-table case asserted `body === ""`, and passed,
  because the injected `StubBlobClient` accepted an empty body while the real client refuses one — a
  fidelity gap at exactly the seam where the constraint lives.

**Decision: every record is newline-terminated, and a zero-row export uploads a single newline.**
The stub now rejects an empty body with the same message the real client uses, which reproduces the
production failure locally.

**A zero-row export is uploaded, not skipped.** It is a meaningful snapshot — "there were no designs
at this timestamp". Skipping it would leave the newest backup an older, non-empty one, so a restore
after a deliberate purge would silently resurrect deleted designs.

## Alternatives considered

1. *Skip the upload when there are no rows.* Rejected for the resurrection hazard above. It also
   makes "no backup today" ambiguous between "nothing to back up" and "the job is broken", which is
   the ambiguity this whole record is about.
2. *Run `pg_dump` from a different runtime — a GitHub Action or a container.* Rejected for M2: it
   adds a second deployment target and a second place holding database credentials, to back up a
   single table whose rows are self-contained JSON. Worth revisiting only if a future phase needs a
   true schema-and-data dump.
3. *Have the stub keep accepting an empty body and add a separate integration test against live
   Blob.* Rejected: a test that needs a live Blob store will not run in CI, so the constraint would
   go unchecked in exactly the place that matters. Modelling the constraint in the stub costs
   nothing and fails fast.

## Obligation this creates

The restore drill — ADR 0002's requirement that the procedure be executed once against a throwaway
target — was what surfaced this. It has still not been completed end to end: the fix above must be
deployed, the cron re-run, and a real export restored. Until then M2's backup gate stays open, and
this record is evidence for why writing a procedure down is not the same as having a backup.
