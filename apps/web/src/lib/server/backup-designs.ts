import "server-only";

import { createNeonDesignRowSource } from "@lemnaria/persistence";
import type { DesignBackupRow, DesignRowSource } from "@lemnaria/persistence";
import { del, list, put } from "@vercel/blob";

/** Scoped to the `designs` table only — deliberately not a whole-database dump. M8 adds a contact
 *  table holding personal data; a database-wide export would sweep contact submissions into Blob
 *  under this same 14-day rotation, which contradicts the stricter handling contact data is
 *  promised (`docs/decisions/0002-db-backed-shareable-persistence.md`, "Security and
 *  backups"). Do not broaden this to `select * from` every table — add a second, separately-scoped
 *  export instead. */
const BACKUP_BLOB_PREFIX = "backups/designs/";
const BACKUP_RETENTION_DAYS = 14;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// `DesignBackupRow` and `DesignRowSource` come from `@lemnaria/persistence`: that package owns
// every Postgres statement in the codebase, so the backup's read lives there too rather than being
// a second place SQL has to be audited. Re-exported because this module's own public shape
// (`BackupDesignsDeps`) refers to them.
export type { DesignBackupRow, DesignRowSource };

export interface BackupBlobInfo {
  pathname: string;
  uploadedAt: Date;
}

/** The subset of `@vercel/blob` this module needs, injected so `backupDesigns` is testable without
 *  a live Blob store. */
export interface BackupBlobClient {
  upload(pathname: string, body: string): Promise<void>;
  list(prefix: string): Promise<BackupBlobInfo[]>;
  delete(pathnames: string[]): Promise<void>;
}

export interface BackupDesignsDeps {
  rowSource: DesignRowSource;
  blobClient: BackupBlobClient;
  now?: Date;
}

export interface BackupResult {
  ok: boolean;
  backupPathname?: string;
  rowCount?: number;
  deletedPathnames: string[];
  error?: string;
}

/** Exports every `designs` row to a timestamped ndjson file in Blob, then rotates out backups
 *  older than `BACKUP_RETENTION_DAYS` — rotation runs only when the export above it succeeded, so
 *  a failed backup never leaves fewer recovery points than before it ran. Never throws: a backup
 *  problem is reported in the returned result and logged, not raised, so it can never block the
 *  request path that calls this. */
export async function backupDesigns(
  deps: BackupDesignsDeps,
): Promise<BackupResult> {
  const now = deps.now ?? new Date();

  const exportOutcome = await tryExportDesigns(
    deps.rowSource,
    deps.blobClient,
    now,
  );
  if (!exportOutcome.ok) {
    return { ok: false, deletedPathnames: [], error: exportOutcome.error };
  }

  const rotationOutcome = await tryRotateOldBackups(deps.blobClient, now);
  return {
    ok: true,
    backupPathname: exportOutcome.pathname,
    rowCount: exportOutcome.rowCount,
    deletedPathnames: rotationOutcome.deletedPathnames,
    ...(rotationOutcome.error ? { error: rotationOutcome.error } : {}),
  };
}

type ExportOutcome =
  | { ok: true; pathname: string; rowCount: number }
  | { ok: false; error: string };

/** Error handling extracted into its own function per this repo's Clean Code convention (error
 *  handling is one thing): the happy path below stays a single, readable sequence. */
async function tryExportDesigns(
  rowSource: DesignRowSource,
  blobClient: BackupBlobClient,
  now: Date,
): Promise<ExportOutcome> {
  try {
    const rows = await rowSource.fetchAllDesigns();
    const pathname = buildBackupPathname(now);
    await blobClient.upload(pathname, toNdjson(rows));
    return { ok: true, pathname, rowCount: rows.length };
  } catch (error) {
    logBackupFailure("export", error);
    return { ok: false, error: describeError(error) };
  }
}

async function tryRotateOldBackups(
  blobClient: BackupBlobClient,
  now: Date,
): Promise<{ deletedPathnames: string[]; error?: string }> {
  try {
    const deletedPathnames = await rotateOldBackups(blobClient, now);
    return { deletedPathnames };
  } catch (error) {
    logBackupFailure("rotation", error);
    return { deletedPathnames: [], error: describeError(error) };
  }
}

/**
 * One JSON object per line, every line newline-terminated.
 *
 * The trailing newline is the ndjson convention, but here it also carries weight: it guarantees a
 * non-empty body even for a zero-row export. `@vercel/blob`'s `put` rejects an empty string with
 * "Vercel Blob: body is required", so the previous `join("\n")` — which returned `""` for an empty
 * table — failed in production on the very first run (2026-08-25). The unit tests missed it because
 * the injected stub accepted an empty body; the stub now refuses one, as the real client does.
 *
 * A zero-row export is uploaded rather than skipped because it is a meaningful snapshot — "there
 * were no designs at this timestamp". Skipping it would leave the most recent backup an older,
 * non-empty one, so a restore after a deliberate purge would silently resurrect deleted designs.
 */
function toNdjson(rows: readonly DesignBackupRow[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("") || "\n";
}

function buildBackupPathname(now: Date): string {
  return `${BACKUP_BLOB_PREFIX}${now.toISOString()}.ndjson`;
}

async function rotateOldBackups(
  blobClient: BackupBlobClient,
  now: Date,
): Promise<string[]> {
  const cutoff = new Date(
    now.getTime() - BACKUP_RETENTION_DAYS * MILLISECONDS_PER_DAY,
  );
  const blobs = await blobClient.list(BACKUP_BLOB_PREFIX);
  const expiredPathnames = blobs
    .filter((blob) => blob.uploadedAt < cutoff)
    .map((blob) => blob.pathname);

  await blobClient.delete(expiredPathnames);
  return expiredPathnames;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// No structured-logging convention exists yet in this repo; `console.error` is the interim
// default (follow-up: replace with the eventual logging solution once one is chosen).
function logBackupFailure(stage: "export" | "rotation", error: unknown): void {
  console.error(`[backup-designs] ${stage} failed:`, error);
}

/** Wires the production dependencies and runs a backup. The route handler calls only this. */
export async function runDesignsBackup(now?: Date): Promise<BackupResult> {
  return backupDesigns({
    rowSource: createNeonDesignRowSource(),
    blobClient: createVercelBlobClient(),
    ...(now ? { now } : {}),
  });
}

function createVercelBlobClient(): BackupBlobClient {
  return {
    async upload(pathname, body) {
      await put(pathname, body, {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/x-ndjson",
      });
    },
    async list(prefix) {
      const result = await list({ prefix });
      return result.blobs.map((blob) => ({
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt,
      }));
    },
    async delete(pathnames) {
      if (pathnames.length === 0) return;
      await del(pathnames);
    },
  };
}
