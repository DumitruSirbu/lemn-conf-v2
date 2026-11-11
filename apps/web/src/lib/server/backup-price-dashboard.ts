import "server-only";

import { randomUUID } from "node:crypto";

import { createNeonPriceDashboardRowSource } from "@lemnaria/persistence";
import type {
  AvailabilityChangeBackupRow,
  PriceBookVersionBackupRow,
  PriceDashboardRowSource,
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
 * The price dashboard's export (M10 wave S6, OQ-13, RK-17): a third, separately scoped export beside
 * `backup-designs.ts` and `backup-presets.ts` (ADR 0012: another table is "a second, separately-scoped export", never a
 * broader query). It is a parallel module on purpose, so `backup-designs.ts`, which guards the customers' designs, is
 * not touched. `backup-presets.ts` says the exports are to be consolidated into one engine when a third is added; this
 * is that third, and the consolidation is owed to a wave that may edit both.
 *
 * One file holds four tables, one tagged record per line (`{"table":…,"row":{…}}`), in this order:
 * `price_book_versions`, `catalogue_availability_changes`, `catalogue_availability_head`, `kitchen_defaults`.
 *
 * **The head is read after the log walk, never before.** A publish moves the head and appends log rows between two reads
 * of this export. Read first, the head could sit below the largest revision the log then carries, and a restore would
 * bring back a head the next write collides with on the log's primary key. Read after, the head is at or above every
 * logged revision, and a head ahead of the log is a state the database already allows (a publish that creates nothing
 * moves the head with no log row). `kitchen_defaults` follows for the same reason: nothing it holds depends on the log.
 *
 * The trailing slash on the prefix is load-bearing: `list({ prefix })` is a string-prefix match, and
 * `backups/price-dashboard/` can never match a `backups/designs/` or `backups/presets/` object, so this rotation can
 * never reach those exports. The Blob calls name no token, so they use the project's one store like the other two:
 * no new store or variable is needed.
 */
const PRICE_DASHBOARD_BACKUP_BLOB_PREFIX = "backups/price-dashboard/";

/** Same age rule as the designs export (`BACKUP_RETENTION_DAYS` in `backup-designs.ts`), restated rather than shared. */
const BACKUP_RETENTION_DAYS = 14;

/** A ceiling on file count, not a second retention policy: age wins whenever they disagree. See `backup-designs.ts`. */
const MAX_RETAINED_BACKUPS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Versions held in memory at once. Migration `0023` bounds `book` and `change_summary` at 4 MiB of `jsonb` text each, so
 * a worst-case row is 8 MiB and a page of 2 is 16 MiB, well inside the driver's response limit even after the
 * stringify and encode copies. The designs export's 200 would be gigabytes in the worst case. Versions are published by
 * hand, so there are few, and a small page costs few extra round trips.
 */
export const VERSION_BACKUP_PAGE_SIZE = 2;

/** A log row is a few hundred bytes (ids, a flag, two timestamps), so a large page is cheap. */
export const AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE = 500;

const INVOCATION_SUFFIX_LENGTH = 8;

/** The one structured line a failure writes, labelled apart from the other exports. Never the error itself: a driver or
 *  storage object can carry a connection string or request URL. */
const LOG_OPERATION = "backup-price-dashboard";

const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const UNKNOWN_ERROR_NAME = "UnknownError";

const EXPORT_FAILED = "BACKUP_EXPORT_FAILED";
const ROTATION_FAILED = "BACKUP_ROTATION_FAILED";

export type {
  BackupBlobClient,
  BackupBlobInfo,
  BackupResult,
  BackupStatus,
  PriceDashboardRowSource,
};

export interface BackupPriceDashboardDeps {
  rowSource: PriceDashboardRowSource;
  blobClient: BackupBlobClient;
  now?: Date;
}

interface TaggedRecord {
  readonly table: string;
  readonly row: unknown;
}

/** The upload resolved while the walk had not read all four tables: a short file named as a whole one would lose
 *  history silently on restore. */
class IncompletePriceDashboardBackupWalkError extends Error {
  constructor(recordsWritten: number) {
    super(
      `Price dashboard backup upload finished after ${String(recordsWritten)} records without reading every table`,
    );
    this.name = "IncompletePriceDashboardBackupWalkError";
  }
}

/** Exports the four tables to a timestamped ndjson file in Blob, then rotates out old exports. Rotation runs only after
 *  a successful export, so a failed backup never leaves fewer recovery points. Never throws: problems are returned and
 *  logged. `rowCount` is the number of records in the file, across the four tables. */
export async function backupPriceDashboard(
  deps: BackupPriceDashboardDeps,
): Promise<BackupResult> {
  const now = deps.now ?? new Date();

  const exportOutcome = await tryExport(deps.rowSource, deps.blobClient, now);
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

async function tryExport(
  rowSource: PriceDashboardRowSource,
  blobClient: BackupBlobClient,
  now: Date,
): Promise<ExportOutcome> {
  try {
    const ndjson = streamRecordsAsNdjson(rowSource);
    const pathname = buildBackupPathname(now);
    await blobClient.upload(pathname, ndjson.body);
    const rowCount = ndjson.writtenRecordCount();
    if (!ndjson.isWalkComplete()) {
      await discardTruncatedBackup(blobClient, pathname);
      throw new IncompletePriceDashboardBackupWalkError(rowCount);
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
  writtenRecordCount(): number;
  /** True only once the walk ran to its last table. A consumer that stops early, or a read that failed, leaves this
   *  false. The body is never empty, since each singleton table always yields its one record or throws. */
  isWalkComplete(): boolean;
}

/** The export as ndjson bytes pulled one bounded chunk at a time, so the upload's pace sets the read pace. */
function streamRecordsAsNdjson(
  rowSource: PriceDashboardRowSource,
): NdjsonExport {
  const chunks = walkTables(rowSource);
  const encoder = new TextEncoder();
  let writtenRecordCount = 0;
  let hasReachedEnd = false;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) {
        hasReachedEnd = true;
        controller.close();
        return;
      }
      writtenRecordCount += next.value.length;
      controller.enqueue(encoder.encode(toNdjson(next.value)));
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  return {
    body,
    writtenRecordCount: () => writtenRecordCount,
    isWalkComplete: () => hasReachedEnd,
  };
}

/** Every record of the four tables, one bounded chunk at a time, in the order the module comment fixes. */
async function* walkTables(
  rowSource: PriceDashboardRowSource,
): AsyncGenerator<TaggedRecord[], void, undefined> {
  yield* walkKeyset<PriceBookVersionBackupRow>(
    "price_book_versions",
    VERSION_BACKUP_PAGE_SIZE,
    (rows) => rows.at(-1)?.sequence_number,
    (after, pageSize) =>
      rowSource.fetchVersionPage(
        after === undefined
          ? { pageSize }
          : { afterSequenceNumber: after, pageSize },
      ),
  );
  yield* walkKeyset<AvailabilityChangeBackupRow>(
    "catalogue_availability_changes",
    AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE,
    (rows) => rows.at(-1)?.revision,
    (after, pageSize) =>
      rowSource.fetchAvailabilityChangePage(
        after === undefined ? { pageSize } : { afterRevision: after, pageSize },
      ),
  );
  yield [
    {
      table: "catalogue_availability_head",
      row: await rowSource.fetchAvailabilityHead(),
    },
  ];
  yield [
    { table: "kitchen_defaults", row: await rowSource.fetchKitchenDefaults() },
  ];
}

/** A keyset walk resuming from the last key of the previous page; a page shorter than `pageSize` is the end. */
async function* walkKeyset<Row>(
  table: string,
  pageSize: number,
  lastKeyOf: (rows: readonly Row[]) => string | undefined,
  fetchPage: (after: string | undefined, pageSize: number) => Promise<Row[]>,
): AsyncGenerator<TaggedRecord[], void, undefined> {
  let after: string | undefined;
  for (;;) {
    const page = await fetchPage(after, pageSize);
    if (page.length > 0) {
      yield page.map((row) => ({ table, row }));
    }
    if (page.length < pageSize) return;
    after = lastKeyOf(page);
  }
}

/** One JSON object per line, newline-terminated, so a restore can read the file a chunk at a time. */
function toNdjson(records: readonly TaggedRecord[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join("");
}

/** A pathname unique to this invocation, sorting by a fixed-width ISO timestamp first (see `backup-designs.ts`). */
function buildBackupPathname(now: Date): string {
  const invocationSuffix = randomUUID().slice(0, INVOCATION_SUFFIX_LENGTH);
  return `${PRICE_DASHBOARD_BACKUP_BLOB_PREFIX}${now.toISOString()}-${invocationSuffix}.ndjson`;
}

/**
 * Deletes every export past `BACKUP_RETENTION_DAYS`, plus any beyond `MAX_RETAINED_BACKUPS` among the survivors. Only
 * pathnames under this export's own prefix are ever deleted, even if the listing returned others.
 */
async function rotateOldBackups(
  blobClient: BackupBlobClient,
  now: Date,
): Promise<string[]> {
  const listed = await blobClient.list(PRICE_DASHBOARD_BACKUP_BLOB_PREFIX);
  const blobs = listed.filter((blob) =>
    blob.pathname.startsWith(PRICE_DASHBOARD_BACKUP_BLOB_PREFIX),
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
export async function runPriceDashboardBackup(
  now?: Date,
): Promise<BackupResult> {
  return backupPriceDashboard({
    rowSource: createNeonPriceDashboardRowSource(),
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
