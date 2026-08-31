import "server-only";

import { createNeonDesignRowSource } from "@lemnaria/persistence";
import type {
  DesignBackupRow,
  DesignRowPageQuery,
  DesignRowSource,
} from "@lemnaria/persistence";
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

/** Rows held in memory at once. The export streams, so this is the whole of its row budget however
 *  large the table grows — the previous whole-table read made peak memory O(total stored data) and
 *  would have failed exactly when the database was big enough for a restore to matter
 *  (finding DB-002). Small enough to stay cheap, large enough that a page costs one round trip. */
export const BACKUP_PAGE_SIZE = 200;

/** ndjson body for a zero-row export. `@vercel/blob`'s `put` rejects an empty body with "Vercel
 *  Blob: body is required", which took the first production run down (2026-08-25). A zero-row
 *  export is uploaded rather than skipped because it is a meaningful snapshot — "there were no
 *  designs at this timestamp" — and skipping it would leave the most recent backup an older,
 *  non-empty one, so a restore after a deliberate purge would silently resurrect deleted designs. */
const EMPTY_EXPORT_BODY = "\n";

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
 *  a live Blob store. The body is a stream, not a string: a string forces the whole export into
 *  memory before the first byte is uploaded, which was the artificial half of finding DB-002. */
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

/** `rotation-failed` is a warning, not a failure: the snapshot was written, and only the pruning of
 *  expired ones did not happen. The three are distinct because the cron route answers each with a
 *  different HTTP status (finding DB-003). */
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

export interface BackupResult {
  status: BackupStatus;
  backupPathname?: string;
  rowCount?: number;
  deletedPathnames: string[];
  errorCode?: BackupErrorCode;
}

/**
 * A failed backup stage, reduced at the boundary to the parts that are safe to publish.
 *
 * Driver, storage and network errors carry endpoint hosts, request URLs, headers and
 * credential-adjacent detail in their messages. Returning `error.message` to the caller and logging
 * the raw object put all of it across two trust boundaries at once (finding DB-003), so the
 * third-party error is wrapped here and its message deliberately dropped: what survives is a stable
 * public code and the exception's class name.
 */
/**
 * The upload resolved while the keyset walk had not reached the end of the table.
 *
 * Its own type because the export did not throw — it "succeeded" — and the resulting blob is a
 * structurally valid but short ndjson file. A truncated recovery point that reports `ok` is the
 * DB-002 failure in a new shape: the backup exists, and restoring it loses designs silently.
 */
export class IncompleteBackupWalkError extends Error {
  constructor(rowsWritten: number) {
    super(
      `Backup upload finished after ${String(rowsWritten)} rows without reaching the end of the table`,
    );
    this.name = "IncompleteBackupWalkError";
  }
}

/** A stable, publishable exception class name. Clamped because `name` is free text on a third-party
 *  object: a dependency that copies it from a server response would otherwise write attacker-chosen
 *  text straight into the log line this exists to keep boring. */
const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const UNKNOWN_ERROR_NAME = "UnknownError";

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
  | { ok: false; errorCode: BackupErrorCode };

/** Error handling extracted into its own function per this repo's Clean Code convention (error
 *  handling is one thing): the happy path below stays a single, readable sequence. */
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
    // An upload that resolves is not an export that finished. A consumer can stop reading and still
    // resolve — multipart committing the parts it has, an internal retry abandoning the source —
    // which commits a short file under a name that says it holds the whole table.
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
 * Removes a partial upload before reporting the export failed.
 *
 * Leaving it behind is worse than the truncation itself: rotation is skipped when the export fails,
 * so the short file survives the full retention window as the *newest* export — and
 * `docs/runbooks/design-db-restore.md` tells the operator to pick the newest one. It parses as valid
 * ndjson and neither its name nor its bytes reveal it is short, so the documented recovery procedure
 * would select it.
 *
 * Best effort, in its own try: if the delete fails there is nothing further this can do, and the
 * truncation — not the cleanup — must remain the reported cause.
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
): Promise<{ deletedPathnames: string[]; errorCode?: BackupErrorCode }> {
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
 * The export as a stream of ndjson bytes, pulled one bounded page at a time.
 *
 * `pull` is called only when the consumer has taken what was already enqueued, so the upload's own
 * pace decides when the next page is read: memory stays at one page plus one encoded chunk however
 * many rows the table holds.
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
    // Defensive only, and close to unreachable: a consumer that cancels has almost always already
    // left `hasReachedEndOfTable` false, which is what actually fails the export. This covers the
    // one ordering where it has not — a cancel arriving while `pull` awaits the final empty page.
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

/** One JSON object per line, every line newline-terminated — the ndjson convention, and what lets a
 *  restore read the file a chunk at a time rather than parsing one enormous document. */
function toNdjson(rows: readonly DesignBackupRow[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("");
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

function reportStageFailure(
  stage: BackupStage,
  cause: unknown,
): BackupErrorCode {
  const failure = new BackupStageError(stage, cause);
  logBackupFailure(failure);
  return failure.code;
}

// A redacted structured event, never the error itself: `console.error(stage, error)` printed the
// raw driver/storage object, including any connection string or request URL inside it. No
// structured-logging convention exists yet in this repo, so the event is serialized by hand
// (follow-up: replace with the eventual logging solution once one is chosen).
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
