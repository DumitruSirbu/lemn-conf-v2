# Restoring the `designs` table

Two independent recovery paths, chosen by how far back the needed state is:

- **Neon instant restore (PITR)** — same-day recovery, inside Neon's history window.
- **A dated Vercel Blob export** — anything older than that window, back to whichever nightly
  export still exists (14-day rotation; see `apps/web/src/lib/server/backup-designs.ts`).

Accepted worst-case data loss: up to roughly a day. Beyond the PITR window, the most recent
recovery point is the last nightly export, not the moment of failure — a known consequence of this
mechanism (`docs/decisions/0002-db-backed-shareable-persistence.md`, "Security and backups").

**A restored export is untrusted input**, exactly like any other load path. Every row goes back
through parse → validate → migrate (`migrateDesign` from `@lemnaria/configurator-domain`) and fails
*that row only* if it doesn't pass — never a bulk `COPY` straight into the table. A dump can carry
an older schema version, or the very corruption that prompted the restore in the first place.

## Path 1 — Neon instant restore (PITR)

Use this first if the incident is recent. The restore window is a **hard cap**, not a default, and
varies by plan (verified against Neon's docs 2026-08-25):

| Plan  | PITR window |
| ----- | ----------- |
| Free  | 6 hours     |
| Launch | 7 days     |
| Scale | 30 days     |

This project is on Neon's Free plan — **6 hours**. Past that, skip to Path 2.

### Steps

1. Identify the target timestamp (UTC) just before the bad write or corruption occurred.

2. Restore the branch to that point in time, preserving the current (bad) state under a new branch
   name rather than discarding it — this is what makes the operation reversible if the timestamp
   was picked wrong:

   ```bash
   neon branches restore main "^self@2026-08-25T02:14:00Z" \
     --preserve-under-name main_pre_restore_2026-08-25 \
     --project-id <neon-project-id>
   ```

3. Confirm the restored branch serves the expected data before treating the incident as resolved:

   ```bash
   psql "$DATABASE_URL" -c "select count(*) from designs;"
   psql "$DATABASE_URL" -c "select id, updated_at from designs order by updated_at desc limit 5;"
   ```

4. If the restored point turns out to be wrong, restore again from `main_pre_restore_2026-08-25`
   (or a fresh `^self` point) — nothing was destroyed in step 2.

5. Once confirmed, delete the preserved branch to stop paying for its storage:

   ```bash
   neon branches delete main_pre_restore_2026-08-25 --project-id <neon-project-id>
   ```

## Path 2 — Restore from a dated Blob export

Use this when the needed state is older than the PITR window, or when Path 1 doesn't have the data
(e.g. the corruption predates the branch's history).

### 1. Find the export to restore from

```bash
BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN" vercel blob list --prefix backups/designs/
```

Pick the newest export at or before the point you're recovering to. Each pathname is the export's
own upload timestamp: `backups/designs/2026-08-24T03:00:00.000Z.ndjson`.

### 2. Download it

```bash
BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN" vercel blob get \
  "backups/designs/2026-08-24T03:00:00.000Z.ndjson" \
  --access private \
  --output ./restore-2026-08-24.ndjson
```

### 3. Restore against a throwaway target first, never straight at production

Point `RESTORE_DATABASE_URL` at a scratch Neon branch or database — never at the live
`DATABASE_URL` — for the first run of any restore. Create a disposable branch to restore into:

```bash
neon branches create --name restore-drill-2026-08-25 --project-id <neon-project-id>
neon connection-string restore-drill-2026-08-25 --project-id <neon-project-id>
```

Run the migrations against it so the target has the `designs` table:

```bash
DATABASE_URL="<restore-drill connection string>" pnpm --filter @lemnaria/persistence run migrate
```

### 4. Run the restore script

This script is the load-bearing part of this runbook: it is what makes a restore go through the
same parse → validate → migrate sequence as any other load, instead of trusting the dump. Save it
locally (it isn't part of the deployed app — it's an operator tool, run with `tsx` from the repo
root so the workspace packages resolve) and run it against the ndjson file from step 2:

```ts
// restore-designs-from-backup.ts
// Usage: RESTORE_DATABASE_URL=... tsx restore-designs-from-backup.ts ./restore-2026-08-24.ndjson
import { readFileSync } from "node:fs";

import { migrateDesign, DesignSchema } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";

// Matches `packages/persistence/src/neon-configuration-repository.ts`'s CURRENT_SCHEMA_VERSION.
// A restored row is written back at the *current* schema version, not whatever version the dump
// carried — `migrateDesign` already brought the document up to date; re-storing the old version
// number would make a future load try to migrate an already-current document.
const CURRENT_SCHEMA_VERSION = 1;

interface BackupRow {
  id: string;
  schema_version: number;
  document: unknown;
  created_at: string;
  updated_at: string;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: tsx restore-designs-from-backup.ts <path-to-ndjson>");

  const connectionUrl = process.env["RESTORE_DATABASE_URL"];
  if (!connectionUrl) throw new Error("Set RESTORE_DATABASE_URL to the throwaway restore target.");

  const sql = neon(connectionUrl);
  const lines = readFileSync(filePath, "utf8").split("\n").filter((line) => line.length > 0);

  let restored = 0;
  let failed = 0;

  for (const line of lines) {
    // Each row fails on its own — a single corrupt or stale line must not abort the whole restore.
    try {
      const row = JSON.parse(line) as BackupRow;
      const design = migrateDesign(row.schema_version, row.document);
      DesignSchema.parse(design); // belt-and-braces: migrateDesign already validates internally.

      await sql`
        insert into designs (id, schema_version, document, created_at, updated_at)
        values (${row.id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${row.created_at}, ${row.updated_at})
        on conflict (id) do update
          set schema_version = excluded.schema_version,
              document = excluded.document,
              updated_at = excluded.updated_at
      `;
      restored += 1;
    } catch (error) {
      failed += 1;
      console.error("Skipped one row that failed parse/validate/migrate:", error);
    }
  }

  console.log(`Restored ${String(restored)} rows, skipped ${String(failed)}.`);
  if (failed > 0) {
    console.warn(
      "Rows were skipped. Investigate before treating the restore as complete — a skipped row " +
        "may be the corruption you're recovering from, or evidence the dump itself is damaged.",
    );
  }
}

await main();
```

```bash
RESTORE_DATABASE_URL="<restore-drill connection string>" \
  npx tsx restore-designs-from-backup.ts ./restore-2026-08-24.ndjson
```

### 5. Verify the restored target

```bash
psql "<restore-drill connection string>" -c "select count(*) from designs;"
```

Spot-check a few restored designs load correctly through the normal application path, not just
that the row exists:

```bash
DATABASE_URL="<restore-drill connection string>" node -e '
  const { NeonConfigurationRepository } = require("@lemnaria/persistence");
  const repo = new NeonConfigurationRepository(process.env.DATABASE_URL);
  repo.load("<some-id-from-the-export>").then((d) => console.log(JSON.stringify(d, null, 2)));
'
```

### 6. Promote to production, only after the drill target checks out

Point the application's `DATABASE_URL` at the now-verified data. Depending on the incident, that
means either running this same script against the production database (still using
`on conflict (id) do update`, so it repairs in place without touching rows the export didn't cover)
or, if the whole database needs replacing, following Neon's project-level restore-from-branch
procedure to promote the restored branch. Prefer the narrower, row-level repair; reach for a
whole-branch promotion only when the corruption is broad enough that "designs the export didn't
cover" is not a meaningful distinction anymore.

## Operator step required before this phase closes

The milestone requires this procedure to be **executed once and verified against a throwaway
target** before M2 Wave 2B closes (`docs/milestones/M2-void-engine.md`, "Security and backups"). A
procedure that has only been written down is an assumption, not a backup. This is a manual step —
it needs a real Neon branch and a real Blob export to restore from — and was **not** performed as
part of this implementation task, which was scoped to code and documentation only and explicitly
prohibited from touching real infrastructure. Whoever closes this phase must run Path 2 end-to-end
against a scratch branch (Path 1 can be drilled the same way, restoring `^self` on a disposable
branch rather than `main`) and record the outcome here or in the milestone doc.
