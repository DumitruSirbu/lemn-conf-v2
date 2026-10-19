import "server-only";

import { randomUUID } from "node:crypto";

import { createNeonPresetRowSource } from "@lemnaria/persistence";
import type {
  PresetBackupRow,
  PresetRowPageQuery,
  PresetRowSource,
} from "@lemnaria/persistence";
import { del, list, put } from "@vercel/blob";

import type {
  BackupBlobClient,
  BackupBlobInfo,
  BackupResult,
  BackupStatus,
  PublishedBackupErrorCode,
} from "./backup-designs";

/**
 * The presets export, a second and separately scoped export beside `backup-designs.ts` (ADR 0012: a new table needs
 * "a second, separately-scoped export", never a broader query; ADR 0112 Amendment A). It is a parallel module on
 * purpose: `backup-designs.ts` guards the customers' designs and is not touched to share code with it. If a third
 * export is ever added, consolidate the three into one engine then.
 *
 * The trailing slash is load-bearing: `list({ prefix })` is a string-prefix match, and `backups/presets/` can never
 * match a `backups/designs/` object, so this rotation can never reach a design backup.
 */
const PRESETS_BACKUP_BLOB_PREFIX = "backups/presets/";

/** Same age rule as the designs export (`BACKUP_RETENTION_DAYS` in `backup-designs.ts`), restated rather than shared. */
const BACKUP_RETENTION_DAYS = 14;

/** A ceiling on file count, not a second retention policy: age wins whenever they disagree. See `backup-designs.ts`. */
const MAX_RETAINED_BACKUPS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Rows held in memory at once. A judgement call, not a measurement: a preset row is not a design row. Migration `0011`
 * allows an image of up to 512 KiB (1 MiB as the hex the export carries) and a document of up to 4 MiB of `jsonb`
 * text, so a worst-case row is about 5 MiB and a page of 5 is about 25 MiB, comfortably inside the driver's response
 * limit. The designs export reads 200 at a time, which here would be a gigabyte in the worst case. The library is
 * owner-authored and small, so more pages cost little.
 */
export const PRESET_BACKUP_PAGE_SIZE = 5;

/** `put` rejects an empty body. A zero-row export is uploaded, not skipped, for the reason ADR 0012 records: skipping
 *  it would leave an older non-empty export as the newest, and a restore would bring back deleted presets. The table
 *  is empty until the owner saves the first preset, so this is the first run's case. */
const EMPTY_EXPORT_BODY = "\n";

const INVOCATION_SUFFIX_LENGTH = 8;

/** The one structured line a failure writes, labelled apart from `backup-designs` so the two read differently in a
 *  log. Never the error itself: a driver or storage object can carry a connection string or request URL. */
const LOG_OPERATION = "backup-presets";

const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const UNKNOWN_ERROR_NAME = "UnknownError";

export type {
  BackupBlobClient,
  BackupBlobInfo,
  BackupResult,
  BackupStatus,
  PresetBackupRow,
  PresetRowSource,
};

export interface BackupPresetsDeps {
  rowSource: PresetRowSource;
  blobClient: BackupBlobClient;
  now?: Date;
}

const EXPORT_FAILED = "BACKUP_EXPORT_FAILED";
const ROTATION_FAILED = "BACKUP_ROTATION_FAILED";

/** The upload resolved while the keyset walk had not reached the end of the table: a short file named as a whole one
 *  would lose presets silently on restore. */
class IncompletePresetBackupWalkError extends Error {
  constructor(rowsWritten: number) {
    super(
      `Preset backup upload finished after ${String(rowsWritten)} rows without reaching the end of the table`,
    );
    this.name = "IncompletePresetBackupWalkError";
  }
}

/** Exports every `presets` row (hidden ones too) to a timestamped ndjson file in Blob, then rotates out old exports.
 *  Rotation runs only after a successful export, so a failed backup never leaves fewer recovery points. Never throws:
 *  problems are returned and logged. */
export async function backupPresets(
  deps: BackupPresetsDeps,
): Promise<BackupResult> {
  const now = deps.now ?? new Date();

  const exportOutcome = await tryExportPresets(
    deps.rowSource,
    deps.blobClient,
    now,
  );
  if (!exportOutcome.ok) {
    return {
      status: "export-failed",
      deletedPathnames: [],
      errorCode: exportOutcome.errorCode,
    };
  }

  const rotationOutcome = await tryRotateOldBackups(deps.blobClient, now);
  return {
    status: rotationOutcome.errorCode ? "rotation-failed" : "ok",
    backupPathname: exportOutcome.pathname,
    rowCount: exportOutcome.rowCount,
    deletedPathnames: rotationOutcome.deletedPathnames,
    ...(rotationOutcome.errorCode
      ? { errorCode: rotationOutcome.errorCode }
      : {}),
  };
}

type ExportOutcome =
  | { ok: true; pathname: string; rowCount: number }
  | { ok: false; errorCode: PublishedBackupErrorCode };

async function tryExportPresets(
  rowSource: PresetRowSource,
  blobClient: BackupBlobClient,
  now: Date,
): Promise<ExportOutcome> {
  try {
    const ndjson = streamRowsAsNdjson(rowSource);
    const pathname = buildBackupPathname(now);
    await blobClient.upload(pathname, ndjson.body);
    const rowCount = ndjson.writtenRowCount();
    if (!ndjson.isWalkComplete()) {
      await discardTruncatedBackup(blobClient, pathname);
      throw new IncompletePresetBackupWalkError(rowCount);
    }
    return { ok: true, pathname, rowCount };
  } catch (error) {
    logFailure("export", error);
    return { ok: false, errorCode: EXPORT_FAILED };
  }
}

/** Removes a partial upload before reporting the export failed, so a short file is never the newest export the
 *  restore runbook tells the operator to pick. Best effort: the truncation stays the reported cause. */
async function discardTruncatedBackup(
  blobClient: BackupBlobClient,
  pathname: string,
): Promise<void> {
  try {
    await blobClient.delete([pathname]);
  } catch (error) {
    logFailure("cleanup", error);
  }
}

async function tryRotateOldBackups(
  blobClient: BackupBlobClient,
  now: Date,
): Promise<{
  deletedPathnames: string[];
  errorCode?: PublishedBackupErrorCode;
}> {
  try {
    return { deletedPathnames: await rotateOldBackups(blobClient, now) };
  } catch (error) {
    logFailure("rotation", error);
    return { deletedPathnames: [], errorCode: ROTATION_FAILED };
  }
}

interface NdjsonExport {
  readonly body: ReadableStream<Uint8Array>;
  /** Meaningful only once the stream has been fully consumed, which an awaited upload guarantees. */
  writtenRowCount(): number;
  /** True only once a short or empty page proved the walk reached the end of the table. */
  isWalkComplete(): boolean;
}

/** The export as ndjson bytes pulled one bounded page at a time, so the upload's pace sets the read pace. */
function streamRowsAsNdjson(rowSource: PresetRowSource): NdjsonExport {
  const readNextPage = createPageReader(rowSource);
  const encoder = new TextEncoder();
  let writtenRowCount = 0;
  let hasReachedEndOfTable = false;
  let isCancelled = false;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const page = await readNextPage();
      if (page.length === 0) {
        if (writtenRowCount === 0) {
          controller.enqueue(encoder.encode(EMPTY_EXPORT_BODY));
        }
        hasReachedEndOfTable = true;
        controller.close();
        return;
      }
      writtenRowCount += page.length;
      controller.enqueue(encoder.encode(toNdjson(page)));
    },
    cancel() {
      isCancelled = true;
    },
  });

  return {
    body,
    writtenRowCount: () => writtenRowCount,
    isWalkComplete: () => hasReachedEndOfTable && !isCancelled,
  };
}

/** A keyset walk over `presets`, resuming from the last id of the previous page. */
function createPageReader(
  rowSource: PresetRowSource,
): () => Promise<PresetBackupRow[]> {
  let afterId: string | undefined;
  let isExhausted = false;

  return async () => {
    if (isExhausted) return [];
    const page = await rowSource.fetchPresetPage(buildPageQuery(afterId));
    isExhausted = page.length < PRESET_BACKUP_PAGE_SIZE;
    afterId = page.at(-1)?.id ?? afterId;
    return page;
  };
}

function buildPageQuery(afterId: string | undefined): PresetRowPageQuery {
  return afterId === undefined
    ? { pageSize: PRESET_BACKUP_PAGE_SIZE }
    : { afterId, pageSize: PRESET_BACKUP_PAGE_SIZE };
}

/** One JSON object per line, newline-terminated, so a restore can read the file a chunk at a time. */
function toNdjson(rows: readonly PresetBackupRow[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("");
}

/** A pathname unique to this invocation, sorting by a fixed-width ISO timestamp first (see `backup-designs.ts`). */
function buildBackupPathname(now: Date): string {
  const invocationSuffix = randomUUID().slice(0, INVOCATION_SUFFIX_LENGTH);
  return `${PRESETS_BACKUP_BLOB_PREFIX}${now.toISOString()}-${invocationSuffix}.ndjson`;
}

/**
 * Deletes every export past `BACKUP_RETENTION_DAYS`, plus any beyond `MAX_RETAINED_BACKUPS` among the survivors. Only
 * pathnames under this export's own prefix are ever deleted, even if the listing returned others.
 */
async function rotateOldBackups(
  blobClient: BackupBlobClient,
  now: Date,
): Promise<string[]> {
  const listed = await blobClient.list(PRESETS_BACKUP_BLOB_PREFIX);
  const blobs = listed.filter((blob) =>
    blob.pathname.startsWith(PRESETS_BACKUP_BLOB_PREFIX),
  );
  const expired = expiredBackups(blobs, now);
  const surplus = surplusBackups(blobs.filter((blob) => !expired.has(blob)));

  const removedPathnames = [...expired, ...surplus].map(
    (blob) => blob.pathname,
  );
  await blobClient.delete(removedPathnames);
  return removedPathnames;
}

function expiredBackups(
  blobs: readonly BackupBlobInfo[],
  now: Date,
): ReadonlySet<BackupBlobInfo> {
  const cutoff = new Date(
    now.getTime() - BACKUP_RETENTION_DAYS * MILLISECONDS_PER_DAY,
  );
  return new Set(blobs.filter((blob) => blob.uploadedAt < cutoff));
}

/** Newest first by the store's own `uploadedAt`, so the survivors are the most recent `MAX_RETAINED_BACKUPS`. */
function surplusBackups(
  retained: readonly BackupBlobInfo[],
): readonly BackupBlobInfo[] {
  if (retained.length <= MAX_RETAINED_BACKUPS) return [];
  return [...retained]
    .sort(
      (left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime(),
    )
    .slice(MAX_RETAINED_BACKUPS);
}

/** A stable, publishable exception class name, clamped because `name` is free text on a third-party object. */
function clampErrorName(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : typeof cause;
  return ERROR_NAME_PATTERN.test(name) ? name : UNKNOWN_ERROR_NAME;
}

function logFailure(
  stage: "export" | "rotation" | "cleanup",
  cause: unknown,
): void {
  console.error(
    JSON.stringify({
      operation: LOG_OPERATION,
      stage,
      errorName: clampErrorName(cause),
    }),
  );
}

/** Wires the production dependencies and runs a backup. The route handler calls only this. */
export async function runPresetsBackup(now?: Date): Promise<BackupResult> {
  return backupPresets({
    rowSource: createNeonPresetRowSource(),
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
        multipart: true,
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
