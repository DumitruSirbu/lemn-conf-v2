import {
  DesignSchema,
  KITCHEN_L_DESIGN,
  migrateDesign,
} from "@lemnaria/configurator-domain";
import type { DesignRowPageQuery } from "@lemnaria/persistence";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BACKUP_PAGE_SIZE,
  backupDesigns,
  type BackupBlobClient,
  type BackupBlobInfo,
  type DesignBackupRow,
  type DesignRowSource,
} from "../../../src/lib/server/backup-designs";

const AN_HOUR_MS = 60 * 60 * 1000;
const A_DAY_MS = 24 * AN_HOUR_MS;
const NOW = new Date("2026-08-25T03:00:00.000Z");

function buildRow(
  id: string,
  overrides: Partial<DesignBackupRow> = {},
): DesignBackupRow {
  return {
    id,
    schema_version: 1,
    document: { ...KITCHEN_L_DESIGN, presetId: id },
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    write_token_hash: "a".repeat(64),
    visitor_hash: null,
    account_id: null,
    name: null,
    sent_at: null,
    hidden_by_client_at: null,
    deleted_by_client_at: null,
    ...overrides,
  };
}

/** Serves a fixed row list as keyset pages, or throws if scripted to. Ids are compared as strings,
 *  which is exactly the ordering the production `order by id` uses. */
class StubRowSource implements DesignRowSource {
  constructor(
    private readonly rows: DesignBackupRow[],
    private readonly failure?: Error,
  ) {}

  fetchDesignPage({
    afterId,
    pageSize,
  }: DesignRowPageQuery): Promise<DesignBackupRow[]> {
    if (this.failure) return Promise.reject(this.failure);
    const remaining =
      afterId === undefined
        ? this.rows
        : this.rows.filter((row) => row.id > afterId);
    return Promise.resolve(remaining.slice(0, pageSize));
  }
}

/** In-memory stand-in for `@vercel/blob`'s `put`/`list`/`del`, scriptable to fail on upload. */
class StubBlobClient implements BackupBlobClient {
  readonly uploads: { pathname: string; body: string }[] = [];
  readonly deleteCalls: string[][] = [];
  private readonly blobs = new Map<string, BackupBlobInfo>();

  constructor(
    seedBlobs: BackupBlobInfo[] = [],
    private readonly uploadFailure?: Error,
  ) {
    for (const blob of seedBlobs) this.blobs.set(blob.pathname, blob);
  }

  async upload(
    pathname: string,
    body: ReadableStream<Uint8Array>,
  ): Promise<void> {
    if (this.uploadFailure) throw this.uploadFailure;
    const text = await readStreamAsText(body);
    // Mirrors a real constraint of `@vercel/blob`'s `put`: an empty body is rejected with "Vercel
    // Blob: body is required". Without this the stub is more permissive than the thing it stands in
    // for, and a zero-row export passes here while failing in production — which is exactly what
    // happened on 2026-08-25, caught only by running the job against the live store.
    if (text === "") throw new Error("Vercel Blob: body is required");
    this.uploads.push({ pathname, body: text });
    this.blobs.set(pathname, { pathname, uploadedAt: NOW });
  }

  list(prefix: string): Promise<BackupBlobInfo[]> {
    return Promise.resolve(
      [...this.blobs.values()].filter((blob) =>
        blob.pathname.startsWith(prefix),
      ),
    );
  }

  delete(pathnames: string[]): Promise<void> {
    this.deleteCalls.push(pathnames);
    for (const pathname of pathnames) this.blobs.delete(pathname);
    return Promise.resolve();
  }
}

async function readStreamAsText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
  }
}

/** Mirrors how a restore reads the export: split on newlines and skip blank lines. Every record is
 *  newline-terminated, so the final split always yields a trailing empty string, and a zero-row
 *  export is a single blank line. */
function parseNdjson(body: string): unknown[] {
  return body
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as unknown);
}

describe("backupDesigns", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  it("uploads one parseable ndjson line per row, each round-tripping to a valid Design", async () => {
    const rows = [buildRow("a"), buildRow("b")];
    const rowSource = new StubRowSource(rows);
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.status).toBe("ok");
    expect(result.rowCount).toBe(2);
    const uploaded = blobClient.uploads[0];
    if (!uploaded) throw new Error("expected an upload to have been recorded");

    const parsedLines = parseNdjson(uploaded.body);
    expect(parsedLines).toHaveLength(2);
    for (const line of parsedLines) {
      const row = line as DesignBackupRow;
      const design = migrateDesign(row.schema_version, row.document);
      expect(DesignSchema.safeParse(design).success).toBe(true);
    }
  });

  it("carries each row's write-token hash, without which a restore revokes edit access", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    const blobClient = new StubBlobClient();

    await backupDesigns({ rowSource, blobClient, now: NOW });

    const uploaded = blobClient.uploads[0];
    if (!uploaded) throw new Error("expected an upload to have been recorded");
    // The column *is* edit access (ADR 0019 decision 1). A backup missing it restores every design
    // readable and permanently unwritable, and nothing looks broken until a customer tries to save.
    const [row] = parseNdjson(uploaded.body) as DesignBackupRow[];
    expect(row?.write_token_hash).toBe("a".repeat(64));
  });

  it("carries a null hash through unchanged, rather than dropping the field", async () => {
    const rowSource = new StubRowSource([
      buildRow("a", { write_token_hash: null }),
    ]);
    const blobClient = new StubBlobClient();

    await backupDesigns({ rowSource, blobClient, now: NOW });

    const uploaded = blobClient.uploads[0];
    if (!uploaded) throw new Error("expected an upload to have been recorded");
    const [row] = parseNdjson(uploaded.body) as DesignBackupRow[];
    expect(row).toHaveProperty("write_token_hash", null);
  });

  it("names the uploaded blob under the designs backup prefix with an ISO timestamp", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    // The timestamp still leads, so a lexicographic `vercel blob list` orders by upload time and
    // the restore runbook's "pick the newest export" rule holds. The suffix after it makes two runs
    // of the same millisecond two different blobs (finding 1).
    expect(result.backupPathname).toMatch(
      new RegExp(`^backups/designs/${NOW.toISOString()}-[0-9a-f]{8}\\.ndjson$`),
    );
  });

  it("uploads a non-empty zero-record file when the designs table has no rows", async () => {
    const rowSource = new StubRowSource([]);
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.status).toBe("ok");
    expect(result.rowCount).toBe(0);

    // The body must not be empty: `@vercel/blob`'s `put` rejects an empty string outright, which
    // took the first production run down. It must still parse to zero records, so a restore reads
    // it as "there were no designs" rather than as a corrupt file.
    const uploaded = blobClient.uploads[0];
    if (!uploaded) throw new Error("expected an upload to have been recorded");
    expect(uploaded.body).not.toBe("");
    expect(parseNdjson(uploaded.body)).toEqual([]);
  });

  it("walks past the first page, exporting rows a single query could not have returned", async () => {
    const rows = Array.from({ length: BACKUP_PAGE_SIZE + 3 }, (_, index) =>
      buildRow(`design-${String(index).padStart(6, "0")}`),
    );
    const rowSource = new StubRowSource(rows);
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.rowCount).toBe(rows.length);
    const uploaded = blobClient.uploads[0];
    if (!uploaded) throw new Error("expected an upload to have been recorded");
    expect(parseNdjson(uploaded.body)).toHaveLength(rows.length);
  });

  it("reports failure and logs it, rather than throwing, when the export fails", async () => {
    const rowSource = new StubRowSource([], new Error("connection refused"));
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.status).toBe("export-failed");
    expect(result.errorCode).toBe("BACKUP_EXPORT_FAILED");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("does not run rotation when the upload fails", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    const blobClient = new StubBlobClient(
      [
        {
          pathname: "backups/designs/old.ndjson",
          uploadedAt: new Date(NOW.getTime() - 30 * A_DAY_MS),
        },
      ],
      new Error("blob store unavailable"),
    );

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.status).toBe("export-failed");
    expect(blobClient.deleteCalls).toHaveLength(0);
  });

  it("deletes only backups older than the 14-day retention window", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    const blobClient = new StubBlobClient([
      {
        pathname: "backups/designs/too-old.ndjson",
        uploadedAt: new Date(NOW.getTime() - 15 * A_DAY_MS),
      },
      {
        pathname: "backups/designs/boundary.ndjson",
        uploadedAt: new Date(NOW.getTime() - 14 * A_DAY_MS),
      },
      {
        pathname: "backups/designs/recent.ndjson",
        uploadedAt: new Date(NOW.getTime() - 1 * A_DAY_MS),
      },
    ]);

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.deletedPathnames).toEqual(["backups/designs/too-old.ndjson"]);
  });

  it("keeps at most MAX_RETAINED_BACKUPS even when every file is inside the window", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    // All well inside 14 days, so age deletes nothing and only the ceiling can act. Two runs an
    // hour apart is the abnormal case the ceiling exists for: a redelivered cron.
    const withinWindow = Array.from({ length: 34 }, (_, index) => ({
      pathname: `backups/designs/within-${String(index).padStart(2, "0")}.ndjson`,
      uploadedAt: new Date(NOW.getTime() - index * AN_HOUR_MS),
    }));
    const blobClient = new StubBlobClient(withinWindow);

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    // 34 existing + the one just written = 35, so the 5 oldest go. Compared as a sorted set rather
    // than in emission order: `within-00` and the new upload share a timestamp, so their relative
    // order is a detail of sort stability and not a property worth pinning.
    expect([...result.deletedPathnames].sort()).toEqual([
      "backups/designs/within-29.ndjson",
      "backups/designs/within-30.ndjson",
      "backups/designs/within-31.ndjson",
      "backups/designs/within-32.ndjson",
      "backups/designs/within-33.ndjson",
    ]);
  });

  it("leaves the folder alone at exactly MAX_RETAINED_BACKUPS", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    // 29 existing plus the one this run writes is exactly the ceiling, so nothing may be deleted.
    const blobClient = new StubBlobClient(
      Array.from({ length: 29 }, (_, index) => ({
        pathname: `backups/designs/within-${String(index).padStart(2, "0")}.ndjson`,
        uploadedAt: new Date(NOW.getTime() - index * AN_HOUR_MS),
      })),
    );

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.deletedPathnames).toEqual([]);
  });

  it("deletes a blob caught by both rules exactly once", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    // 40 files, all expired: age selects every one, and the ceiling would select the oldest of
    // them again. A pathname handed to `delete` twice is a wasted call at best.
    const blobClient = new StubBlobClient(
      Array.from({ length: 40 }, (_, index) => ({
        pathname: `backups/designs/expired-${String(index).padStart(2, "0")}.ndjson`,
        uploadedAt: new Date(NOW.getTime() - (15 + index) * A_DAY_MS),
      })),
    );

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.deletedPathnames).toHaveLength(40);
    expect(new Set(result.deletedPathnames).size).toBe(40);
  });

  it("reports rotation failure as a warning distinct from a lost snapshot", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    const blobClient = new StubBlobClient();
    vi.spyOn(blobClient, "list").mockRejectedValueOnce(
      new Error("list failed"),
    );

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.status).toBe("rotation-failed");
    expect(result.errorCode).toBe("BACKUP_ROTATION_FAILED");
    expect(result.backupPathname).toBeDefined();
  });
});

/**
 * The memory property, asserted without ever building the data that would prove it the slow way.
 *
 * The fake generates each row as it is asked for and the blob client counts bytes instead of
 * keeping them, so this test streams far more data than the old single-array read could have held
 * while itself allocating about one page. What it checks is the bound: no page larger than
 * `BACKUP_PAGE_SIZE` was ever requested or returned, so peak memory is a page, not a database.
 */
describe("backupDesigns memory bound", () => {
  const HUGE_ROW_COUNT = BACKUP_PAGE_SIZE * 250;
  /** Roughly a kilobyte per row, so the walk moves tens of megabytes past a page-sized buffer. */
  const ROW_DOCUMENT_FILLER = "x".repeat(1024);

  function idAt(index: number): string {
    return `design-${String(index).padStart(9, "0")}`;
  }

  function indexOfId(id: string): number {
    return Number(id.slice("design-".length));
  }

  /** Materializes one page at a time and never holds the rows it already served. */
  class GeneratedRowSource implements DesignRowSource {
    readonly requestedPageSizes: number[] = [];
    readonly servedPageSizes: number[] = [];

    constructor(private readonly totalRows: number) {}

    fetchDesignPage({
      afterId,
      pageSize,
    }: DesignRowPageQuery): Promise<DesignBackupRow[]> {
      this.requestedPageSizes.push(pageSize);
      const startIndex = afterId === undefined ? 0 : indexOfId(afterId) + 1;
      const length = Math.max(
        Math.min(startIndex + pageSize, this.totalRows) - startIndex,
        0,
      );
      const page = Array.from({ length }, (_, offset) =>
        buildRow(idAt(startIndex + offset), {
          document: { filler: ROW_DOCUMENT_FILLER },
        }),
      );
      this.servedPageSizes.push(page.length);
      return Promise.resolve(page);
    }
  }

  /** Consumes the upload stream and remembers only its size, so draining a very large export costs
   *  one chunk of memory here too. */
  class CountingBlobClient implements BackupBlobClient {
    byteLength = 0;
    lineCount = 0;

    async upload(
      _pathname: string,
      body: ReadableStream<Uint8Array>,
    ): Promise<void> {
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        this.byteLength += value.byteLength;
        this.lineCount += countNewlines(value);
      }
    }

    list(): Promise<BackupBlobInfo[]> {
      return Promise.resolve([]);
    }

    delete(): Promise<void> {
      return Promise.resolve();
    }
  }

  function countNewlines(chunk: Uint8Array): number {
    const NEWLINE_BYTE = 0x0a;
    let count = 0;
    for (const byte of chunk) if (byte === NEWLINE_BYTE) count += 1;
    return count;
  }

  it("never asks for or holds more than one page, however large the table", async () => {
    const rowSource = new GeneratedRowSource(HUGE_ROW_COUNT);
    const blobClient = new CountingBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.status).toBe("ok");
    expect(result.rowCount).toBe(HUGE_ROW_COUNT);
    expect(blobClient.lineCount).toBe(HUGE_ROW_COUNT);
    expect(Math.max(...rowSource.requestedPageSizes)).toBe(BACKUP_PAGE_SIZE);
    expect(Math.max(...rowSource.servedPageSizes)).toBe(BACKUP_PAGE_SIZE);
    // A single whole-table read would have been one request; this is the walk.
    expect(rowSource.requestedPageSizes.length).toBeGreaterThan(1);
    // Tens of megabytes streamed past a buffer holding one page of it.
    expect(blobClient.byteLength).toBeGreaterThan(
      HUGE_ROW_COUNT * ROW_DOCUMENT_FILLER.length,
    );
  });
});

/**
 * DB-003's redaction boundary. The thrown error carries a credential-shaped string of exactly the
 * kind a driver or storage client puts in its message, and the test asserts it reaches neither the
 * returned result nor anything logged.
 */
describe("backupDesigns error redaction", () => {
  const SYNTHETIC_SECRET =
    "postgresql://app_user:pA55w0rd-not-real@ep-secret-123.eu-central-1.aws.neon.tech/neondb";

  class NamedDriverError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NeonDbError";
    }
  }

  it("returns a stable code and logs a redacted event, never the failure's own text", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const rowSource = new StubRowSource(
      [],
      new NamedDriverError(`connect ECONNREFUSED ${SYNTHETIC_SECRET}`),
    );

    const result = await backupDesigns({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(JSON.stringify(result)).not.toContain("pA55w0rd-not-real");
    expect(JSON.stringify(result)).not.toContain("ep-secret-123");
    expect(result.errorCode).toBe("BACKUP_EXPORT_FAILED");

    const logged = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(logged).not.toContain("pA55w0rd-not-real");
    expect(logged).not.toContain("ep-secret-123");
    expect(logged).not.toContain("ECONNREFUSED");
    // What a responder actually needs: which stage, which code, which exception class.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      JSON.stringify({
        operation: "backup",
        stage: "export",
        code: "BACKUP_EXPORT_FAILED",
        errorName: "NeonDbError",
      }),
    );
  });
});

/**
 * Finding S5-3: an upload that resolves is not an export that finished.
 *
 * Both cases below produce a structurally valid, parseable, SHORT ndjson file. Nothing about the
 * bytes says anything is wrong — which is why the walk's own completeness has to be the thing that
 * decides, and why a truncated snapshot must be reported as a failed export rather than as a
 * recovery point that happens to be missing designs.
 */
describe("backupDesigns truncation guard", () => {
  const SMALL_DOCUMENT = { filler: "x" };

  /** Serves full pages until `failingPageIndex`, then rejects — a walk that dies partway. */
  class FailingAfterFirstPageSource implements DesignRowSource {
    private pageIndex = 0;

    constructor(private readonly failingPageIndex: number) {}

    fetchDesignPage({
      pageSize,
    }: DesignRowPageQuery): Promise<DesignBackupRow[]> {
      if (this.pageIndex === this.failingPageIndex) {
        return Promise.reject(new Error("connection reset mid-walk"));
      }
      const page = Array.from({ length: pageSize }, (_, offset) =>
        buildRow(`design-${String(this.pageIndex)}-${String(offset)}`, {
          document: SMALL_DOCUMENT,
        }),
      );
      this.pageIndex += 1;
      return Promise.resolve(page);
    }
  }

  /** Endless rows, so any stop is the consumer's choice rather than the table running out. */
  class EndlessRowSource implements DesignRowSource {
    private pageIndex = 0;

    fetchDesignPage({
      pageSize,
    }: DesignRowPageQuery): Promise<DesignBackupRow[]> {
      const page = Array.from({ length: pageSize }, (_, offset) =>
        buildRow(`design-${String(this.pageIndex)}-${String(offset)}`, {
          document: SMALL_DOCUMENT,
        }),
      );
      this.pageIndex += 1;
      return Promise.resolve(page);
    }
  }

  /** Takes one chunk and resolves, exactly as a multipart upload committing the parts it already
   *  holds would. It reports success; the export did not happen. */
  class ShortReadingBlobClient implements BackupBlobClient {
    bytesTaken = 0;
    readonly uploadedPathnames: string[] = [];
    readonly deleteCalls: string[][] = [];

    constructor(private readonly deleteFailure?: Error) {}

    async upload(
      pathname: string,
      body: ReadableStream<Uint8Array>,
    ): Promise<void> {
      this.uploadedPathnames.push(pathname);
      const reader = body.getReader();
      const { value } = await reader.read();
      this.bytesTaken = value?.byteLength ?? 0;
    }

    list(): Promise<BackupBlobInfo[]> {
      return Promise.resolve([]);
    }

    delete(pathnames: string[]): Promise<void> {
      this.deleteCalls.push(pathnames);
      if (this.deleteFailure) return Promise.reject(this.deleteFailure);
      return Promise.resolve();
    }
  }

  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  // Regression only: the rejection propagates through the stream and the surrounding `try` catches
  // it, which was already true before `isWalkComplete()` existed. It is the case below, where the
  // upload RESOLVES, that the completeness flag is the only thing catching.
  it("fails the export when a later page rejects after earlier rows were already enqueued", async () => {
    const rowSource = new FailingAfterFirstPageSource(1);
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.status).toBe("export-failed");
    expect(result.errorCode).toBe("BACKUP_EXPORT_FAILED");
    expect(result.rowCount).toBeUndefined();
  });

  it("fails the export when the upload resolves without the walk reaching the end of the table", async () => {
    const rowSource = new EndlessRowSource();
    const blobClient = new ShortReadingBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    // The upload succeeded and a valid, parseable file was committed. It is short, so the backup
    // failed — no `ok`, no row count anyone could mistake for a whole-table snapshot.
    expect(blobClient.bytesTaken).toBeGreaterThan(0);
    expect(result.status).toBe("export-failed");
    expect(result.errorCode).toBe("BACKUP_EXPORT_FAILED");
    expect(result.backupPathname).toBeUndefined();
    expect(result.rowCount).toBeUndefined();
  });

  // Finding NEW-1. Rotation is skipped when the export fails, so a partial left in Blob survives the
  // whole retention window as the NEWEST export — and `docs/runbooks/design-db-restore.md` tells the
  // operator to pick the newest one. It parses as valid ndjson, so nothing about it looks wrong.
  it("deletes the partial upload it just wrote, so a restore cannot select it", async () => {
    const blobClient = new ShortReadingBlobClient();

    const result = await backupDesigns({
      rowSource: new EndlessRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result.status).toBe("export-failed");
    const writtenPathname = blobClient.uploadedPathnames[0];
    expect(writtenPathname).toMatch(
      new RegExp(`^backups/designs/${NOW.toISOString()}-[0-9a-f]{8}\\.ndjson$`),
    );
    // Exactly the blob just written, never a path recomputed from `now` — which is what made a
    // same-millisecond neighbour deletable.
    expect(blobClient.deleteCalls).toEqual([[writtenPathname]]);
  });

  it("gives two runs of the same millisecond different pathnames, so neither deletes the other", async () => {
    const first = new ShortReadingBlobClient();
    const second = new ShortReadingBlobClient();

    await backupDesigns({
      rowSource: new EndlessRowSource(),
      blobClient: first,
      now: NOW,
    });
    await backupDesigns({
      rowSource: new EndlessRowSource(),
      blobClient: second,
      now: NOW,
    });

    expect(second.deleteCalls[0]).not.toEqual(first.deleteCalls[0]);
  });

  it("still reports the truncation, not the cleanup's own error, when the delete fails", async () => {
    const blobClient = new ShortReadingBlobClient(
      new Error("blob delete unavailable"),
    );

    const result = await backupDesigns({
      rowSource: new EndlessRowSource(),
      blobClient,
      now: NOW,
    });

    // The cleanup failing must not become the reported cause, and must not throw out of the backup.
    expect(result.status).toBe("export-failed");
    expect(result.errorCode).toBe("BACKUP_EXPORT_FAILED");
    expect(blobClient.deleteCalls).toHaveLength(1);
    // The log is the only signal anywhere that a partial was left in Blob. If it is not emitted,
    // nobody ever learns the file is there.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      JSON.stringify({
        operation: "backup",
        stage: "cleanup",
        code: "BACKUP_CLEANUP_FAILED",
        errorName: "Error",
      }),
    );
  });
});

/** Finding S5-4: `name` is free text on a third-party error object. A dependency that copies it from
 *  a server response would otherwise write remote-controlled text into the one log line this module
 *  exists to keep boring. */
describe("backupDesigns error-name clamping", () => {
  it("logs UnknownError rather than an exception name carrying injected text", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const hostile = new Error("failed");
    hostile.name =
      'Error", "leaked": "postgresql://app_user:pA55w0rd-not-real@host/db';

    await backupDesigns({
      rowSource: new StubRowSource([], hostile),
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      JSON.stringify({
        operation: "backup",
        stage: "export",
        code: "BACKUP_EXPORT_FAILED",
        errorName: "UnknownError",
      }),
    );
  });
});
