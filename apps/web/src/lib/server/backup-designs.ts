import "server-only";

import { randomUUID } from "node:crypto";

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

/**
 * Age is the governing rule, and it is what the recovery window is made of: a mistake can be undone
 * for this long and no longer. `docs/runbooks/design-db-restore.md` tells the operator to pick the
 * newest export at or before the point being recovered to, so shortening this shortens how far back
 * that instruction can reach. Two weeks covers a problem introduced before a weekend and noticed
 * the week after, which is the realistic detection latency while nobody is watching daily.
 */
const BACKUP_RETENTION_DAYS = 14;

/**
 * A ceiling on file count, not a second retention policy — the two rules answer different questions
 * and age wins whenever they disagree. Nightly runs put steady state at roughly
 * `BACKUP_RETENTION_DAYS` files, so this is slack of more than 2x and never binds in normal
 * operation. It exists for the abnormal case: a cron delivered repeatedly, a manual
 * `runDesignsBackup` loop, or any future schedule more frequent than daily, each of which would
 * otherwise grow the folder without bound between one night's rotation and the next, since every
 * file is a full copy of the table.
 *
 * Deliberately NOT a "keep only the last N" rule. That was considered on 2026-08-31 and rejected:
 * a small N reads as tidiness but silently trades away recovery depth, and it does so precisely
 * when the table is large enough for storage to look worth saving — which is the same moment a
 * restore matters most. Bounding what each dump *contains* is the retention cron in ADR 0019
 * decision 7, not this.
 */
const MAX_RETAINED_BACKUPS = 30;

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

/** Enough to separate two runs of the same millisecond; short enough to keep the pathname readable
 *  in a `vercel blob list` the operator is scanning by eye. */
const INVOCATION_SUFFIX_LENGTH = 8;

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

/** What the cron route may publish. `BACKUP_CLEANUP_FAILED` is excluded by type rather than by
 *  which call sites happen to exist today: routing cleanup through `reportStageFailure` would
 *  otherwise typecheck and put a code the caller cannot act on into the response. */
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
  | { ok: false; errorCode: PublishedBackupErrorCode };

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

/**
 * A pathname unique to this invocation, sorting by timestamp first.
 *
 * The timestamp alone was not unique: `addRandomSuffix` is off, so two runs landing in the same
 * millisecond — a duplicated cron delivery, or a manual `runDesignsBackup(now)` — computed the same
 * path. That was an overwrite hazard before, and NEW-1 turned it into a worse one: run B's
 * truncation cleanup would delete run A's blob, which may be a complete backup.
 *
 * The suffix goes after a fixed-width ISO timestamp, so a lexicographic listing still orders by
 * upload time and `docs/runbooks/design-db-restore.md`'s "pick the newest export" rule is unchanged.
 */
function buildBackupPathname(now: Date): string {
  const invocationSuffix = randomUUID().slice(0, INVOCATION_SUFFIX_LENGTH);
  return `${BACKUP_BLOB_PREFIX}${now.toISOString()}-${invocationSuffix}.ndjson`;
}

/**
 * Deletes every backup the two retention rules agree may go: anything past
 * `BACKUP_RETENTION_DAYS`, plus anything beyond `MAX_RETAINED_BACKUPS` once the survivors are
 * ordered newest first. A blob caught by both rules is deleted once — the pathnames are collected
 * as a set, because `delete` receiving the same pathname twice is a wasted call at best and an
 * error from the store at worst.
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

/** Newest first, so the slice that survives is the most recent `MAX_RETAINED_BACKUPS`. Ordered by
 *  `uploadedAt` rather than by pathname: the pathname's timestamp is the invocation's own `now`,
 *  which a caller may supply, so only the store's own record of when a blob arrived is trustworthy
 *  for deciding what to destroy. */
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
