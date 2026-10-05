import "server-only";

import { randomUUID } from "node:crypto";

import { createNeonDesignRowSource } from "@lemnaria/persistence";
import type {
  DesignBackupRow,
  DesignRowPageQuery,
  DesignRowSource,
} from "@lemnaria/persistence";
import { del, list, put } from "@vercel/blob";

/** Scoped to the `designs` table, not a whole-database dump: a database-wide export would sweep M8's contact
 *  table into Blob under this 14-day rotation. Add a second, separately scoped export instead (ADR 0012). */
const BACKUP_BLOB_PREFIX = "backups/designs/";

/**
 * Age is the governing rule: a mistake can be undone for this long and no longer. The restore runbook
 * (`docs/runbooks/design-db-restore.md`) picks the newest export at or before the recovery point, so
 * shortening this shortens how far back it can reach. Two weeks covers a problem noticed after a weekend.
 */
const BACKUP_RETENTION_DAYS = 14;

/**
 * A ceiling on file count, not a second retention policy: age wins whenever they disagree. Steady state is
 * about `BACKUP_RETENTION_DAYS` files, so this binds only on abnormal volume (a redelivered cron, a manual
 * `runDesignsBackup` loop), since every file is a full copy of the table. Do not replace age with "keep the
 * last N": a small N silently trades away recovery depth when the table is largest.
 */
const MAX_RETAINED_BACKUPS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Rows held in memory at once: the export streams, so this is its whole row budget however large the table
 *  grows. */
export const BACKUP_PAGE_SIZE = 200;

/** ndjson body for a zero-row export: `@vercel/blob`'s `put` rejects an empty body ("body is required"). A
 *  zero-row export is uploaded rather than skipped: it is a real snapshot, and skipping it would leave an
 *  older non-empty one as the newest, so a restore after a deliberate purge would resurrect deleted designs. */
const EMPTY_EXPORT_BODY = "\n";

/** Enough to separate two runs of the same millisecond; short enough to keep the pathname readable
 *  in a `vercel blob list` the operator is scanning by eye. */
const INVOCATION_SUFFIX_LENGTH = 8;

// Both come from `@lemnaria/persistence`, which owns every Postgres statement; re-exported because
// `BackupDesignsDeps` refers to them.
export type { DesignBackupRow, DesignRowSource };

export interface BackupBlobInfo {
  pathname: string;
  uploadedAt: Date;
}

/** The subset of `@vercel/blob` this module needs, injected so `backupDesigns` is testable without a live
 *  store. The body is a stream: a string would force the whole export into memory before the first byte. */
export interface BackupBlobClient {
  upload(pathname: string, body: ReadableStream<Uint8Array>): Promise<void>;
  list(prefix: string): Promise<BackupBlobInfo[]>;
  delete(pathnames: string[]): Promise<void>;
}

export interface BackupDesignsDeps {
  rowSource: DesignRowSource;
  blobClient: BackupBlobClient;
  now?: Date;
}

/** `rotation-failed` is a warning, not a failure: the snapshot was written and only pruning did not happen.
 *  The cron route answers each of the three with a different HTTP status. */
export type BackupStatus = "ok" | "export-failed" | "rotation-failed";

const BACKUP_ERROR_CODES = {
  export: "BACKUP_EXPORT_FAILED",
  rotation: "BACKUP_ROTATION_FAILED",
  // Logged, never returned: a failed cleanup of a truncated upload must not replace the truncation
  // as the reported cause, so `BackupResult` never carries this code.
  cleanup: "BACKUP_CLEANUP_FAILED",
} as const;

type BackupStage = keyof typeof BACKUP_ERROR_CODES;
export type BackupErrorCode = (typeof BACKUP_ERROR_CODES)[BackupStage];

/** What the cron route may publish. `BACKUP_CLEANUP_FAILED` is excluded by type, so routing cleanup through
 *  `reportStageFailure` cannot put a code the caller cannot act on into the response. */
export type PublishedBackupErrorCode = Exclude<
  BackupErrorCode,
  "BACKUP_CLEANUP_FAILED"
>;

export interface BackupResult {
  status: BackupStatus;
  backupPathname?: string;
  rowCount?: number;
  deletedPathnames: string[];
  errorCode?: PublishedBackupErrorCode;
}

/**
 * The upload resolved while the keyset walk had not reached the end of the table. Its own type because the
 * export did not throw: the blob is a valid but short ndjson file, and a truncated recovery point reporting
 * `ok` would lose designs silently on restore.
 */
export class IncompleteBackupWalkError extends Error {
  constructor(rowsWritten: number) {
    super(
      `Backup upload finished after ${String(rowsWritten)} rows without reaching the end of the table`,
    );
    this.name = "IncompleteBackupWalkError";
  }
}

/** A stable, publishable exception class name, clamped because `name` is free text on a third-party object:
 *  a dependency copying it from a server response would write attacker-chosen text into the log. */
const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const UNKNOWN_ERROR_NAME = "UnknownError";

/** A failed backup stage reduced at the boundary to what is safe to publish: a stable public code and the
 *  exception's class name. Driver, storage and network messages can carry hosts, URLs and credentials, so the
 *  third-party message is dropped. */
export class BackupStageError extends Error {
  readonly stage: BackupStage;
  readonly code: BackupErrorCode;
  readonly errorName: string;

  constructor(stage: BackupStage, cause: unknown) {
    super(`Backup ${stage} failed`);
    this.name = "BackupStageError";
    this.stage = stage;
    this.code = BACKUP_ERROR_CODES[stage];
    this.errorName = clampErrorName(cause);
  }
}

function clampErrorName(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : typeof cause;
  return ERROR_NAME_PATTERN.test(name) ? name : UNKNOWN_ERROR_NAME;
}

/** Exports every `designs` row to a timestamped ndjson file in Blob, then rotates out old backups. Rotation
 *  runs only after a successful export, so a failed backup never leaves fewer recovery points. Never throws:
 *  problems are returned and logged, so this never blocks the request path that calls it. */
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

async function tryExportDesigns(
  rowSource: DesignRowSource,
  blobClient: BackupBlobClient,
  now: Date,
): Promise<ExportOutcome> {
  try {
    const ndjson = streamRowsAsNdjson(rowSource);
    const pathname = buildBackupPathname(now);
    await blobClient.upload(pathname, ndjson.body);
    const rowCount = ndjson.writtenRowCount();
    // An upload that resolves is not a finished export: a consumer can stop reading and still resolve
    // (multipart committing the parts it has), committing a short file under a name that claims the whole table.
    if (!ndjson.isWalkComplete()) {
      await discardTruncatedBackup(blobClient, pathname);
      throw new IncompleteBackupWalkError(rowCount);
    }
    return { ok: true, pathname, rowCount };
  } catch (error) {
    return { ok: false, errorCode: reportStageFailure("export", error) };
  }
}

/**
 * Removes a partial upload before reporting the export failed. Rotation is skipped on failure, so the short
 * file would survive as the newest export, which the restore runbook tells the operator to pick, and it
 * parses as valid ndjson. Best effort in its own try: the truncation, not the cleanup, stays the reported cause.
 */
async function discardTruncatedBackup(
  blobClient: BackupBlobClient,
  pathname: string,
): Promise<void> {
  try {
    await blobClient.delete([pathname]);
  } catch (error) {
    logBackupFailure(new BackupStageError("cleanup", error));
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
    const deletedPathnames = await rotateOldBackups(blobClient, now);
    return { deletedPathnames };
  } catch (error) {
    return {
      deletedPathnames: [],
      errorCode: reportStageFailure("rotation", error),
    };
  }
}

interface NdjsonExport {
  readonly body: ReadableStream<Uint8Array>;
  /** Meaningful only once the stream has been fully consumed, which an awaited upload guarantees. */
  writtenRowCount(): number;
  /** True only once a short or empty page proved the walk reached the end of the table. A consumer
   *  that stops early, or a page that failed, leaves this false. */
  isWalkComplete(): boolean;
}

/**
 * The export as a stream of ndjson bytes pulled one bounded page at a time: `pull` runs only once the consumer
 * has taken what was enqueued, so the upload's pace sets the read pace and memory stays at one page.
 */
function streamRowsAsNdjson(rowSource: DesignRowSource): NdjsonExport {
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
    // Defensive and near-unreachable: a cancelling consumer has almost always left `hasReachedEndOfTable`
    // false. This covers a cancel arriving while `pull` awaits the final empty page.
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

/** A keyset walk over `designs`, resuming from the last id of the previous page. Returns an empty
 *  page once, and every time after, when the table is exhausted. */
function createPageReader(
  rowSource: DesignRowSource,
): () => Promise<DesignBackupRow[]> {
  let afterId: string | undefined;
  let isExhausted = false;

  return async () => {
    if (isExhausted) return [];
    const page = await rowSource.fetchDesignPage(buildPageQuery(afterId));
    isExhausted = page.length < BACKUP_PAGE_SIZE;
    afterId = page.at(-1)?.id ?? afterId;
    return page;
  };
}

function buildPageQuery(afterId: string | undefined): DesignRowPageQuery {
  return afterId === undefined
    ? { pageSize: BACKUP_PAGE_SIZE }
    : { afterId, pageSize: BACKUP_PAGE_SIZE };
}

/** One JSON object per line, newline-terminated (ndjson), so a restore can read the file a chunk at a time. */
function toNdjson(rows: readonly DesignBackupRow[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("");
}

/**
 * A pathname unique to this invocation, sorting by timestamp first. `addRandomSuffix` is off, so two runs in
 * the same millisecond would share a path and one run's truncation cleanup would delete the other's possibly
 * complete blob. The suffix follows a fixed-width ISO timestamp, so listings still order by upload time and
 * the runbook's "pick the newest export" rule holds.
 */
function buildBackupPathname(now: Date): string {
  const invocationSuffix = randomUUID().slice(0, INVOCATION_SUFFIX_LENGTH);
  return `${BACKUP_BLOB_PREFIX}${now.toISOString()}-${invocationSuffix}.ndjson`;
}

/**
 * Deletes every backup past `BACKUP_RETENTION_DAYS`, plus any beyond `MAX_RETAINED_BACKUPS` among the
 * survivors. The surplus is taken only from non-expired blobs, so a blob caught by both rules is deleted once.
 */
async function rotateOldBackups(
  blobClient: BackupBlobClient,
  now: Date,
): Promise<string[]> {
  const blobs = await blobClient.list(BACKUP_BLOB_PREFIX);
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

/** Newest first, so the survivors are the most recent `MAX_RETAINED_BACKUPS`. Ordered by `uploadedAt`, not
 *  pathname: the pathname's timestamp is the caller-suppliable `now`, so only the store's own arrival time is
 *  trustworthy for deciding what to destroy. */
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

/** Generic in the stage so each call site gets that stage's literal code, which is what lets
 *  `PublishedBackupErrorCode` exclude the cleanup code without a cast. */
function reportStageFailure<Stage extends BackupStage>(
  stage: Stage,
  cause: unknown,
): (typeof BACKUP_ERROR_CODES)[Stage] {
  logBackupFailure(new BackupStageError(stage, cause));
  return BACKUP_ERROR_CODES[stage];
}

// A redacted structured event, never the error itself: a raw driver or storage object can carry a connection
// string or request URL. Serialised by hand because the repo has no logging convention yet.
function logBackupFailure(failure: BackupStageError): void {
  console.error(
    JSON.stringify({
      operation: "backup",
      stage: failure.stage,
      code: failure.code,
      errorName: failure.errorName,
    }),
  );
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
        // Fixed-size parts, so the upload consumes the stream incrementally instead of buffering
        // the whole export to learn its length.
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
