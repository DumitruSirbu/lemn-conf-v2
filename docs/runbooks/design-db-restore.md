# Restoring the `designs` table

Two independent recovery paths, chosen by how far back the needed state is:

- **Neon instant restore (PITR)** — same-day recovery, inside Neon's history window.
- **A dated Vercel Blob export** — anything older than that window, back to whichever nightly
  export still exists (14-day rotation; see `apps/web/src/lib/server/backup-designs.ts`).

This file restores `designs`. The `presets` table has its own export and its own recipe, further down
(*Restoring the `presets` table*): the two exports never share a prefix, a cron or a restore.

Accepted worst-case data loss: up to roughly a day. Beyond the PITR window, the most recent
recovery point is the last nightly export, not the moment of failure — a known consequence of this
mechanism (`docs/decisions/0002-db-backed-shareable-persistence.md`, "Security and backups").

**A restored export is untrusted input**, exactly like any other load path. Every row goes back
through parse → validate → migrate (`migrateDesign` from `@lemnaria/configurator-domain`) and fails
*that row only* if it doesn't pass — never a bulk `COPY` straight into the table. A dump can carry
an older schema version, or the very corruption that prompted the restore in the first place.

## Migration `0006` (`design_share_links`) — the grant is a separate, owner-run step

M7 wave 7E3c's migration creates `design_share_links`, but `app_designs` gets no privilege on it
from the migration itself: `grant` is not a shape `migration-safety.ts` recognises as safe to run
unattended, and whether `app_designs` exists on every database this file runs against is not
something a migration file can assume (ADR 0008's 2026-09-23 note; ADR 0114 Amendment G3). The
owner runs this by hand, **after `0006` and before the deploy that ships the code reading the
table** — the same order `0005`'s own header states for its column, for the same reason: code that
ships before both answers every share operation with a 500.

```sql
GRANT SELECT, INSERT, UPDATE ON TABLE public.design_share_links TO app_designs;
```

Preview first, then production, each after that environment's own `0006` apply.
`application-role-privileges.test.ts` asserts the exact grant set whenever the table exists, so a
missing grant on a database that already has the table turns local gates red.

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

6. **If `design_share_links` exists (M7 wave 7E3c), revoke every link before declaring the
   incident resolved.** Unlike Path 2's row-level restore below — which excludes share rows
   deliberately, so an older export can never resurrect a link revoked since (D8) — a PITR restore
   moves the *whole* database backward, share links included, so a link revoked between the
   restore point and the incident comes back active:

   ```bash
   psql "$DATABASE_URL" -c "update design_share_links set revoked_at = now() where revoked_at is null;"
   ```

   Every outstanding link dies, including any the restore did not actually resurrect — the query
   cannot distinguish the two, and the owner re-issues.

## Path 2 — Restore from a dated Blob export

Use this when the needed state is older than the PITR window, or when Path 1 doesn't have the data
(e.g. the corruption predates the branch's history).

### 1. Find the export to restore from

```bash
BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN" vercel blob list --prefix backups/designs/
```

Pick the newest export at or before the point you're recovering to. Each pathname is the export's
own upload timestamp followed by a short per-run suffix:
`backups/designs/2026-08-24T03:00:00.000Z-9f3c1a07.ndjson`. The timestamp leads and is fixed width,
so a plain listing is already in upload order and "newest" is still the last line — the suffix only
guarantees two runs of the same millisecond are two different blobs, so that one cleaning up after
itself can never delete the other's export.

### 2. Download it

```bash
BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN" vercel blob get \
  "backups/designs/2026-08-24T03:00:00.000Z-9f3c1a07.ndjson" \
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

If the `neon` CLI is not installed, create a throwaway **database** instead of a branch, using the
owner connection — additive, and isolated from production:

```bash
# psql, or any client; the owner role has CREATEDB.
create database restore_drill_2026_08_25;
```

Run the migrations against the target so it has the `designs` table:

```bash
MIGRATION_DATABASE_URL="<restore-drill connection string>" \
  pnpm --filter @lemnaria/persistence run migrate <the target's database name>
```

**It is `MIGRATION_DATABASE_URL`, not `DATABASE_URL`.** The migration runner reads only that
variable, deliberately and with no fallback — the application role cannot run DDL. Setting
`DATABASE_URL` here does nothing: the runner would fall through to whatever
`.env.migration.local` holds, which is **production**, and you would believe the drill target had
been migrated when it had not. This runbook said `DATABASE_URL` until 2026-08-25; see ADR 0013.

**`migrate` now requires the `<environment>` argument and refuses a mismatch before connecting**
(`docs/milestones/migration-environment-safety-check.md`). `production` and `preview` are checked
against their own database names, so a throwaway restore target must be declared by its **own exact
database name** — for example `restore_drill_2026_08_25` — which passes because no listed
environment claims that name. Declaring it `production` or `preview` is refused even though the
credential is correct, because those labels are reserved for their real databases. A Neon branch
restore is the one case this does not fit cleanly: a branch forked from production keeps the
database name `lemn-conf-v2`, so it can only be declared `production` — this runbook's own
throwaway-**database** route (above) avoids that ambiguity by giving the drill target a name of its
own, which is why it is the recommended path over a branch restore.

Confirm the table exists before continuing — do not assume the command worked:

```bash
select to_regclass('public.designs') is not null;
```

### 4. Run the restore script

This script is the load-bearing part of this runbook: it is what makes a restore go through the
same parse → validate → migrate sequence as any other load, instead of trusting the dump.

It is an operator tool, not part of the deployed app. Two things about running it, both learned by
running it for real on 2026-08-25 (ADR 0013) — the instructions here were wrong on both counts:

- **Save it as `.mts`, not `.ts`.** It uses top-level `await`, and the repository root has no
  `"type": "module"`, so `tsx` transforms a `.ts` file as CJS and fails immediately with
  `Top-level await is currently not supported with the "cjs" output format`.
- **Run it from `packages/persistence/`, not the repository root.** pnpm links workspace packages
  into the packages that depend on them, not into the root — there is no `node_modules/@lemnaria`
  at the root, so `@lemnaria/configurator-domain` does not resolve there. `packages/persistence`
  has both it and `@neondatabase/serverless` linked, and its own `node_modules/.bin/tsx`.

Save it, then run it against the ndjson file from step 2:

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
const CURRENT_SCHEMA_VERSION = 3;

interface BackupRow {
  id: string;
  schema_version: number;
  document: unknown;
  created_at: string;
  updated_at: string;
  // Edit access itself (ADR 0019 decision 1). A restore that drops this column brings every design
  // back readable and permanently unwritable — the row loads by link, nothing looks broken, and the
  // customer discovers it only when a save is refused. Older dumps predate the column and carry
  // `undefined`, which lands as NULL and fails closed, exactly as an unminted row does.
  write_token_hash?: string | null;
  // Read access, since M7 wave 7E3a (ADR 0114 decision 5). A restore that drops this column brings
  // every design back unreadable to the visitor who owns it — the id still resolves, and the "not
  // available in this browser" page is all that loads. Older dumps predate the column the same way
  // `write_token_hash` above does, and land as NULL for the same reason: unowned, not an error.
  visitor_hash?: string | null;
  // The access-control marks of `0015` and `0016`. A restore that drops them brings every kitchen a client hid or
  // deleted back open to every arm, and every claimed design back unowned. Dumps written before those migrations
  // carry `undefined`, which lands as NULL: open, unclaimed, unsent, unnamed — exactly what such a row was.
  account_id?: string | null;
  name?: string | null;
  sent_at?: string | null;
  hidden_by_client_at?: string | null;
  deleted_by_client_at?: string | null;
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
        insert into designs (id, schema_version, document, created_at, updated_at, write_token_hash,
                              visitor_hash, account_id, name, sent_at, hidden_by_client_at,
                              deleted_by_client_at)
        values (${row.id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${row.created_at}, ${row.updated_at},
                ${row.write_token_hash ?? null}, ${row.visitor_hash ?? null}, ${row.account_id ?? null},
                ${row.name ?? null}, ${row.sent_at ?? null}, ${row.hidden_by_client_at ?? null},
                ${row.deleted_by_client_at ?? null})
        on conflict (id) do update
          set schema_version = excluded.schema_version,
              document = excluded.document,
              updated_at = excluded.updated_at,
              write_token_hash = excluded.write_token_hash,
              visitor_hash = excluded.visitor_hash,
              account_id = coalesce(designs.account_id, excluded.account_id),
              name = coalesce(excluded.name, designs.name),
              sent_at = coalesce(designs.sent_at, excluded.sent_at),
              hidden_by_client_at = coalesce(designs.hidden_by_client_at, excluded.hidden_by_client_at),
              deleted_by_client_at = coalesce(designs.deleted_by_client_at, excluded.deleted_by_client_at)
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
cd packages/persistence
RESTORE_DATABASE_URL="<restore-drill connection string>" \
  ./node_modules/.bin/tsx ./restore-designs-from-backup.mts ../../restore-2026-08-24.ndjson
```

Use the workspace's own `tsx` rather than `npx tsx`: `npx` may resolve a globally installed copy
running under a different Node version than the one `.nvmrc` pins.

**The access-control marks (`0015`, `0016`) travel with the row.** The export carries `account_id`, `name`,
`sent_at`, `hidden_by_client_at` and `deleted_by_client_at`, and the script above writes them back. Three things to
know before running it:

- **The target must already hold `0015` and `0016`** (ledger 1-16, or the numbers the M8C merge settles). The insert
  names these columns, so a target without them refuses every row.
- **A null mark means open.** A dump taken before `0015` or `0016` has no such member and restores every row as
  unclaimed, unsent, unnamed and not hidden or deleted, which is what those rows were.
- **A restore over a row that already exists never loosens a mark.** `account_id`, `sent_at`, `hidden_by_client_at`
  and `deleted_by_client_at` keep the live row's value and take the dump's only when the live one is null, so
  restoring an older dump cannot reopen a kitchen a client hid or deleted after it was taken, or give a claimed design
  back to nobody. `name` takes the dump's value when it has one, as `document` does. The cost is that a mark staff
  cleared after the dump (`design.unhide`) is set again by a restore over the live row; clear it again afterwards. A
  restore into an empty target has no live row, so it writes the dump's marks exactly.

### 5. Verify the restored target

```bash
psql "<restore-drill connection string>" -c "select count(*) from designs;"
```

A row count proves a row exists, not that the design survived. The real bar is M2's round-trip
invariant: load the restored design through the repository, canonically serialise it, and require
equality with the canonical serialisation of what was backed up. Compare **canonical
serialisations**, never the raw `jsonb` — Postgres normalises key order and whitespace, so a
byte-comparison of the column fails even when nothing is wrong.

Then re-derive the geometry, because voids and columns are never stored. A restored design must
produce the identical void set having never persisted one; that is the sharpest case in the
round-trip criterion. In the 2026-08-25 drill this was 25 placements, 10 columns, identical
canonical serialisation.

Spot-check that a restored design loads through the normal application path, not just that the row
exists:

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

## Restoring the `presets` table

**Wave M8C P2, written 2026-10-18. Nothing here has been executed**: the export has not been deployed or run, and the
recipe below has not been drilled [src: written from the code and the migration; no database, Blob store or script
was touched]. Treat the first real use as the drill, against a throwaway target (step 3 of Path 2 above).

### What the export is

| | |
| --- | --- |
| Route | `/api/cron/backup-presets`, declared in `apps/web/vercel.json` at `15 3 * * *` (03:15 UTC daily, between the `designs` export at 03:00 and the rate-limit prune at 03:30) |
| Blob prefix | `backups/presets/` (the trailing slash matters; it can never match `backups/designs/`). A pathname is `backups/presets/<ISO timestamp>-<8 hex>.ndjson` |
| Rows | **Every** `presets` row, `hidden` ones included, one JSON object per line, in `id` order. A zero-row export is uploaded too, as a single newline |
| Columns | `id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, schema_version, design_document, typed_name, thumbnail_hex, thumbnail_type, status, created_at`. The image is `thumbnail_hex`, the bytes as lowercase hex text, the way the repository reads and writes it; it is `decode(..., 'hex')` on the way back |
| Retention | 14 days, and at most 30 files, the same rule as `designs`. Rotation lists and deletes only under `backups/presets/` |
| Credentials | None new. It reads as the application role (`DATABASE_URL`, `app_designs`, whose table-level `SELECT` on `presets` covers every column) and writes with the project's one `BLOB_READ_WRITE_TOKEN`; the cron authenticates with `CRON_SECRET`, **set for Production only**. "Separately scoped" (ADR 0012) means the query and the prefix, not a second token |
| Not covered | **Preview.** `CRON_SECRET` is deliberately not set there, so the route answers 401 and a preview database's presets are never backed up |

Neon's point-in-time history is 6 hours (Path 1 above), so this export is the only recovery point older than that.

### Find and download the export

The same commands as Path 2 steps 1 and 2, with the other prefix:

```bash
BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN" vercel blob list --prefix backups/presets/
BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN" vercel blob get \
  "backups/presets/2026-10-19T03:15:00.000Z-9f3c1a07.ndjson" \
  --access private \
  --output ./restore-presets-2026-10-19.ndjson
```

Pick the newest export at or before the recovery point. An export of one newline is a real snapshot of an empty table:
if it is the newest, restoring from it restores nothing, correctly.

### Restore into a throwaway target first, with the owner credential

The application role **cannot** restore: it has no `UPDATE` and its `INSERT` is by column, without `status` and
`created_at`, so it can neither put a hidden preset back hidden nor keep a preset's original time. The restore runs as
the **owner** role. Follow Path 2 step 3 to make a throwaway database and migrate it (the migration creates `presets`;
the grant is not needed for the owner). Only after that target checks out, and only if the live table really needs
repair, run the same script with the owner connection string for the live database in `RESTORE_DATABASE_URL`, supplied
for that one invocation and never printed or written into a file.

```ts
// restore-presets-from-backup.mts
// Usage: RESTORE_DATABASE_URL=... tsx restore-presets-from-backup.mts ./restore-presets-2026-10-19.ndjson
import { readFileSync } from "node:fs";

import { migrateDesign } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";

interface PresetBackupRow {
  id: string;
  shape: string;
  wall_a_mm: number;
  wall_b_mm: number | null;
  wall_c_mm: number | null;
  height_mm: number;
  schema_version: number;
  design_document: unknown;
  typed_name: string | null;
  thumbnail_hex: string;
  thumbnail_type: string;
  status: string;
  created_at: string;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: tsx restore-presets-from-backup.mts <path-to-ndjson>");

  const connectionUrl = process.env["RESTORE_DATABASE_URL"];
  if (!connectionUrl) throw new Error("Set RESTORE_DATABASE_URL to the restore target (owner role).");

  const sql = neon(connectionUrl);
  const lines = readFileSync(filePath, "utf8").split("\n").filter((line) => line.length > 0);

  let restored = 0;
  let alreadyPresent = 0;
  let failed = 0;

  for (const line of lines) {
    // Each row fails on its own: a single corrupt line must not abort the whole restore.
    try {
      const row = JSON.parse(line) as PresetBackupRow;
      // Validation only. The document and its version go back exactly as exported: a preset keeps the
      // `schema_version` it was written in and is migrated when it is read, so nothing is rewritten here.
      migrateDesign(row.schema_version, row.design_document);

      // `do nothing`, never `do update`: an update would put back the `status` the export held and so
      // re-publish a preset the owner hid after the export was taken.
      const inserted = await sql`
        insert into presets (
          id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, schema_version, design_document,
          typed_name, thumbnail, thumbnail_type, status, created_at
        )
        values (
          ${row.id}, ${row.shape}, ${row.wall_a_mm}::integer, ${row.wall_b_mm}::integer, ${row.wall_c_mm}::integer,
          ${row.height_mm}::integer, ${row.schema_version}::integer, ${JSON.stringify(row.design_document)}::jsonb,
          ${row.typed_name}::text, decode(${row.thumbnail_hex}::text, 'hex'), ${row.thumbnail_type},
          ${row.status}, ${row.created_at}::timestamptz
        )
        on conflict (id) do nothing
        returning id
      `;
      if (inserted.length === 1) restored += 1;
      else alreadyPresent += 1;
    } catch (error) {
      failed += 1;
      console.error("Skipped one row that failed validation or insert:", error instanceof Error ? error.name : "error");
    }
  }

  console.log(`Restored ${String(restored)}, already present ${String(alreadyPresent)}, skipped ${String(failed)}.`);
  if (failed > 0) {
    console.warn("Rows were skipped. Investigate before treating the restore as complete.");
  }
}

await main();
```

```bash
cd packages/persistence
RESTORE_DATABASE_URL="<restore-drill connection string>" \
  ./node_modules/.bin/tsx ./restore-presets-from-backup.mts ../../restore-presets-2026-10-19.ndjson
```

The same two notes as the `designs` script apply: save it as `.mts`, and run it from `packages/persistence/` with the
workspace's own `tsx`. The script prints an exception's class name, not its message, because a driver message can carry
a connection value.

### Verify

The bar is the image, byte for byte, and the status, not a row count:

```bash
diff \
  <(psql "<restore-drill connection string>" -At -c "select id || '|' || status || '|' || md5(thumbnail) from presets" | sort) \
  <(node -e '
    const fs = require("node:fs");
    const crypto = require("node:crypto");
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      const md5 = crypto.createHash("md5").update(Buffer.from(r.thumbnail_hex, "hex")).digest("hex");
      console.log(`${r.id}|${r.status}|${md5}`);
    }
  ' ./restore-presets-2026-10-19.ndjson | sort)
```

No output from `diff` and exit status 0 means every id, status and image checksum matches, for a restore into an empty
table. Into a table that already held rows, expect `diff` to show the rows the live table kept as they were.

### After a restore, check what the restore cannot know

- **Deleted rows come back.** The table has no application `DELETE`, but the owner can delete by hand; anything deleted
  since the export reappears. Delete it again if it should stay gone.
- **A Path 1 (PITR) restore moves the whole database back**, so a preset hidden after the restore point is published
  again. Re-check the hidden presets afterwards (the hiding statement is in the runbook for applying a table migration,
  *For `0011`*, the owner's hand steps) and hide them again.
- **The row-level restore above keeps whatever is in the live table** (`on conflict do nothing`), so a preset the owner
  has since hidden stays hidden, and a preset edited by hand since the export is not overwritten.

## Drill record — Path 2 executed 2026-08-25

The milestone requires this procedure to be **executed once and verified against a throwaway
target** before M2 Wave 2B closes (`docs/milestones/M2-void-engine.md`, "Security and backups"). A
procedure that has only been written down is an assumption, not a backup.

**Executed 2026-08-25. Result: the restore works; the runbook did not.** Full account in ADR 0013.

What was done: two throwaway databases (`lemn_conf_drill_src`, `lemn_conf_drill_tgt`) on the
standalone Neon project; a real 25-placement design written into the source through
`NeonConfigurationRepository`; exported through `createNeonDesignRowSource` — the same read the cron
uses — to a 3,263-byte ndjson; restored into the target with the script above; verified by loading
through the repository and comparing canonical serialisations.

Outcome: **`Restored 1 rows, skipped 0`**, 25 placements, canonical serialisation **identical**,
10 columns re-derived from the restored document alone.

Five defects were found, four of which would have stopped an operator following these instructions
during a real incident. All are fixed; each is described at the step it affected. The one that
matters most: `pnpm run migrate` exited 0 without migrating anything, because its CLI guard compared
a percent-encoded `import.meta.url` against a plain `process.argv[1]` — so it silently did nothing
for anyone whose checkout path contains a space.

**Still to drill:** Path 1 (Neon PITR) has not been exercised, and Path 2 has not been run against
an export downloaded from Blob — the drill built its export locally from the same code the cron
runs, because the Blob token is Production-scoped. Re-run Path 2 from a real downloaded export once
M3 wires the write path and production holds a design worth losing.
