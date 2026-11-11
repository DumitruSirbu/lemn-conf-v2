import type {
  AvailabilityChangeBackupRow,
  AvailabilityChangePageQuery,
  AvailabilityHeadBackupRow,
  KitchenDefaultsBackupRow,
  PriceBookVersionBackupRow,
  PriceBookVersionPageQuery,
} from "@lemnaria/persistence";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE,
  VERSION_BACKUP_PAGE_SIZE,
  backupPriceDashboard,
  type BackupBlobClient,
  type BackupBlobInfo,
  type PriceDashboardRowSource,
} from "../../../src/lib/server/backup-price-dashboard";

const A_DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-11T03:45:00.000Z");
const PREFIX = "backups/price-dashboard/";
const SYNTHETIC_SECRET =
  "postgresql://app_user:pA55w0rd-not-real@ep-secret-123.eu-central-1.aws.neon.tech/neondb";

function buildVersion(sequenceNumber: number): PriceBookVersionBackupRow {
  return {
    id: `version-${String(sequenceNumber).padStart(3, "0")}`,
    sequence_number: String(sequenceNumber),
    label: `Book ${String(sequenceNumber)}`,
    note: "",
    book: { prices: { a: sequenceNumber } },
    change_summary: [],
    change_count: 0,
    published_at: "2026-11-01T00:00:00.000Z",
    published_by_account_id: "account-1",
  };
}

function buildChange(revision: number): AvailabilityChangeBackupRow {
  return {
    revision: String(revision),
    item_kind: "front",
    item_id: `item-${String(revision)}`,
    active: revision % 2 === 0,
    changed_at: "2026-11-01T00:00:00.000Z",
    changed_by_account_id: "account-1",
  };
}

const DEFAULTS: KitchenDefaultsBackupRow = {
  revision: "3",
  defaults: { marker: "defaults" },
  saved_at: "2026-11-02T00:00:00.000Z",
  saved_by_account_id: null,
};

/** Serves fixed tables as keyset pages (numeric order, as the database's `bigint` order is), logs every call in order,
 *  and throws from a named call when scripted to. */
class StubRowSource implements PriceDashboardRowSource {
  readonly calls: string[] = [];
  readonly pageSizes: number[] = [];
  headRevision = "9";

  constructor(
    private readonly versions: PriceBookVersionBackupRow[] = [],
    private readonly changes: AvailabilityChangeBackupRow[] = [],
    private readonly failure?: { call: string; error: Error },
  ) {}

  fetchVersionPage({
    afterSequenceNumber,
    pageSize,
  }: PriceBookVersionPageQuery): Promise<PriceBookVersionBackupRow[]> {
    this.record("versions", pageSize);
    const after = Number(afterSequenceNumber ?? 0);
    return Promise.resolve(
      this.versions
        .filter((row) => Number(row.sequence_number) > after)
        .slice(0, pageSize),
    );
  }

  fetchAvailabilityChangePage({
    afterRevision,
    pageSize,
  }: AvailabilityChangePageQuery): Promise<AvailabilityChangeBackupRow[]> {
    this.record("changes", pageSize);
    const after = Number(afterRevision ?? 0);
    return Promise.resolve(
      this.changes
        .filter((row) => Number(row.revision) > after)
        .slice(0, pageSize),
    );
  }

  fetchAvailabilityHead(): Promise<AvailabilityHeadBackupRow> {
    this.record("head");
    return Promise.resolve({ revision: this.headRevision });
  }

  fetchKitchenDefaults(): Promise<KitchenDefaultsBackupRow> {
    this.record("defaults");
    return Promise.resolve(DEFAULTS);
  }

  private record(call: string, pageSize?: number): void {
    this.calls.push(call);
    if (pageSize !== undefined) this.pageSizes.push(pageSize);
    if (this.failure?.call === `${call}#${String(this.countOf(call))}`) {
      throw this.failure.error;
    }
  }

  private countOf(call: string): number {
    return this.calls.filter((name) => name === call).length;
  }
}

/** In-memory stand-in for `@vercel/blob`; it rejects an empty body as the real `put` does. */
class StubBlobClient implements BackupBlobClient {
  readonly uploads: { pathname: string; body: string }[] = [];
  readonly deleteCalls: string[][] = [];
  readonly listedPrefixes: string[] = [];
  private readonly blobs = new Map<string, BackupBlobInfo>();

  constructor(
    seedBlobs: BackupBlobInfo[] = [],
    private readonly behaviour: {
      uploadFailure?: Error;
      stopAfterOneChunk?: boolean;
      listFailure?: Error;
    } = {},
  ) {
    for (const blob of seedBlobs) this.blobs.set(blob.pathname, blob);
  }

  async upload(
    pathname: string,
    body: ReadableStream<Uint8Array>,
  ): Promise<void> {
    if (this.behaviour.uploadFailure) throw this.behaviour.uploadFailure;
    const text = await this.readBody(body);
    if (text === "") throw new Error("Vercel Blob: body is required");
    this.uploads.push({ pathname, body: text });
    this.blobs.set(pathname, { pathname, uploadedAt: NOW });
  }

  list(prefix: string): Promise<BackupBlobInfo[]> {
    this.listedPrefixes.push(prefix);
    if (this.behaviour.listFailure) {
      return Promise.reject(this.behaviour.listFailure);
    }
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

  holds(pathname: string): boolean {
    return this.blobs.has(pathname);
  }

  /** A consumer that reads one chunk, cancels the stream, and still resolves, as a multipart upload can. */
  private async readBody(body: ReadableStream<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text;
      text += decoder.decode(value);
      if (this.behaviour.stopAfterOneChunk) {
        await reader.cancel();
        return text;
      }
    }
  }
}

interface ParsedRecord {
  table: string;
  row: Record<string, unknown> & {
    sequence_number?: string;
    revision?: string;
  };
}

function parseNdjson(body: string): ParsedRecord[] {
  return body
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as ParsedRecord);
}

function recordsOf(table: string, records: ParsedRecord[]): ParsedRecord[] {
  return records.filter((record) => record.table === table);
}

function seedBlob(ageInDays: number, name: string): BackupBlobInfo {
  return {
    pathname: `${PREFIX}${name}.ndjson`,
    uploadedAt: new Date(NOW.getTime() - ageInDays * A_DAY_MS),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backupPriceDashboard export", () => {
  it("writes the four tables as tagged ndjson records, versions then log then head then defaults", async () => {
    const blobClient = new StubBlobClient();
    const rowSource = new StubRowSource(
      [buildVersion(1), buildVersion(2)],
      [buildChange(1), buildChange(2)],
    );

    const result = await backupPriceDashboard({
      rowSource,
      blobClient,
      now: NOW,
    });

    const records = parseNdjson(blobClient.uploads[0]?.body ?? "");
    expect(records.map((record) => record.table)).toEqual([
      "price_book_versions",
      "price_book_versions",
      "catalogue_availability_changes",
      "catalogue_availability_changes",
      "catalogue_availability_head",
      "kitchen_defaults",
    ]);
    expect(records[0]?.row).toEqual(buildVersion(1));
    expect(records[4]?.row).toEqual({ revision: "9" });
    expect(records[5]?.row).toEqual(DEFAULTS);
    expect(result).toMatchObject({ status: "ok", rowCount: 6 });
  });

  it("names the blob under the price-dashboard prefix with an ISO timestamp", async () => {
    const blobClient = new StubBlobClient();

    const result = await backupPriceDashboard({
      rowSource: new StubRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result.backupPathname).toMatch(
      /^backups\/price-dashboard\/2026-11-11T03:45:00\.000Z-[0-9a-f]{8}\.ndjson$/,
    );
    expect(blobClient.uploads[0]?.pathname).toBe(result.backupPathname);
  });

  it("uploads the two singletons even when both logs are empty, so the body is never empty", async () => {
    const blobClient = new StubBlobClient();

    const result = await backupPriceDashboard({
      rowSource: new StubRowSource(),
      blobClient,
      now: NOW,
    });

    expect(
      parseNdjson(blobClient.uploads[0]?.body ?? "").map((r) => r.table),
    ).toEqual(["catalogue_availability_head", "kitchen_defaults"]);
    expect(result.status).toBe("ok");
  });

  it("walks every page of both logs, so rows past the first page are exported", async () => {
    const versionCount = VERSION_BACKUP_PAGE_SIZE * 2 + 1;
    const changeCount = AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE * 2 + 1;
    const blobClient = new StubBlobClient();
    const rowSource = new StubRowSource(
      Array.from({ length: versionCount }, (_, index) =>
        buildVersion(index + 1),
      ),
      Array.from({ length: changeCount }, (_, index) => buildChange(index + 1)),
    );

    await backupPriceDashboard({ rowSource, blobClient, now: NOW });

    const records = parseNdjson(blobClient.uploads[0]?.body ?? "");
    expect(
      recordsOf("price_book_versions", records).map(
        (r) => r.row.sequence_number,
      ),
    ).toEqual(Array.from({ length: versionCount }, (_, i) => String(i + 1)));
    expect(recordsOf("catalogue_availability_changes", records)).toHaveLength(
      changeCount,
    );
  });

  it("orders the keyset by number, so version 10 follows version 9", async () => {
    const blobClient = new StubBlobClient();
    const rowSource = new StubRowSource(
      Array.from({ length: 11 }, (_, index) => buildVersion(index + 1)),
    );

    await backupPriceDashboard({ rowSource, blobClient, now: NOW });

    const sequence = recordsOf(
      "price_book_versions",
      parseNdjson(blobClient.uploads[0]?.body ?? ""),
    ).map((record) => record.row.sequence_number);
    expect(sequence.slice(8)).toEqual(["9", "10", "11"]);
  });

  it("asks for a small page of versions, never the designs export's 200, and a page of log rows no larger than it needs", async () => {
    const rowSource = new StubRowSource([buildVersion(1)], [buildChange(1)]);

    await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(VERSION_BACKUP_PAGE_SIZE).toBeLessThanOrEqual(5);
    expect(rowSource.pageSizes).toEqual([
      VERSION_BACKUP_PAGE_SIZE,
      AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE,
    ]);
  });

  it("reads the head only after the last page of the log, and the defaults after the head", async () => {
    const changeCount = AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE + 1;
    const rowSource = new StubRowSource(
      [buildVersion(1)],
      Array.from({ length: changeCount }, (_, index) => buildChange(index + 1)),
    );

    await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(rowSource.calls).toEqual([
      "versions",
      "changes",
      "changes",
      "head",
      "defaults",
    ]);
  });

  it("carries a head that moved while the log was being read, never one read before it", async () => {
    const changeCount = AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE + 1;
    const blobClient = new StubBlobClient();
    const rowSource = new StubRowSource(
      [],
      Array.from({ length: changeCount }, (_, index) => buildChange(index + 1)),
    );
    // A publish lands while the log is read: the head moves on, and its revision is read last.
    const fetchPage = rowSource.fetchAvailabilityChangePage.bind(rowSource);
    rowSource.fetchAvailabilityChangePage = async (query) => {
      const page = await fetchPage(query);
      rowSource.headRevision = String(changeCount + 5);
      return page;
    };

    await backupPriceDashboard({ rowSource, blobClient, now: NOW });

    const records = parseNdjson(blobClient.uploads[0]?.body ?? "");
    const head = recordsOf("catalogue_availability_head", records)[0];
    expect(Number(head?.row.revision)).toBeGreaterThanOrEqual(changeCount);
  });
});

describe("backupPriceDashboard failure", () => {
  it.each([
    ["the first page of versions", "versions#1"],
    ["a later page of the log", "changes#2"],
    ["the head", "head#1"],
    ["the defaults, as a missing singleton row throws", "defaults#1"],
  ])(
    "answers export-failed with the stable code and skips rotation when %s throws",
    async (_label, failingCall) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const blobClient = new StubBlobClient([seedBlob(20, "old")]);
      const changeCount = AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE + 1;
      const rowSource = new StubRowSource(
        [buildVersion(1)],
        Array.from({ length: changeCount }, (_, i) => buildChange(i + 1)),
        { call: failingCall, error: new Error("boom") },
      );

      const result = await backupPriceDashboard({
        rowSource,
        blobClient,
        now: NOW,
      });

      expect(result).toEqual({
        status: "export-failed",
        deletedPathnames: [],
        errorCode: "BACKUP_EXPORT_FAILED",
      });
      expect(blobClient.listedPrefixes).toEqual([]);
      expect(blobClient.deleteCalls).toEqual([]);
    },
  );

  it("never serialises the cause or a secret in the result or the log, only the stage and the exception class", async () => {
    class NamedDriverError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "NeonDbError";
      }
    }
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const rowSource = new StubRowSource([], [], {
      call: "head#1",
      error: new NamedDriverError(`connect ECONNREFUSED ${SYNTHETIC_SECRET}`),
    });

    const result = await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    const published = JSON.stringify(result);
    const logged = JSON.stringify(consoleErrorSpy.mock.calls);
    for (const text of [published, logged]) {
      expect(text).not.toContain("pA55w0rd-not-real");
      expect(text).not.toContain("ep-secret-123");
      expect(text).not.toContain("ECONNREFUSED");
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      JSON.stringify({
        operation: "backup-price-dashboard",
        stage: "export",
        errorName: "NeonDbError",
      }),
    );
  });

  it("logs UnknownError rather than an exception name carrying injected text", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const error = new Error("x");
    error.name = `evil ${SYNTHETIC_SECRET}`;

    await backupPriceDashboard({
      rowSource: new StubRowSource([], [], { call: "head#1", error }),
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      "pA55w0rd-not-real",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"errorName":"UnknownError"'),
    );
  });

  it("answers export-failed when the upload throws, and keeps the cause out of the answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await backupPriceDashboard({
      rowSource: new StubRowSource(),
      blobClient: new StubBlobClient([], {
        uploadFailure: new Error(SYNTHETIC_SECRET),
      }),
      now: NOW,
    });

    expect(result.status).toBe("export-failed");
    expect(JSON.stringify(result)).not.toContain("pA55w0rd-not-real");
  });

  it("fails the export and deletes the partial blob when the upload resolves before the walk reached the last table", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const blobClient = new StubBlobClient([seedBlob(20, "old")], {
      stopAfterOneChunk: true,
    });
    const rowSource = new StubRowSource([buildVersion(1)], [buildChange(1)]);

    const result = await backupPriceDashboard({
      rowSource,
      blobClient,
      now: NOW,
    });

    expect(result).toEqual({
      status: "export-failed",
      deletedPathnames: [],
      errorCode: "BACKUP_EXPORT_FAILED",
    });
    const partial = blobClient.uploads[0]?.pathname ?? "";
    expect(blobClient.deleteCalls).toEqual([[partial]]);
    expect(blobClient.holds(partial)).toBe(false);
    expect(rowSource.calls).not.toContain("defaults");
  });
});

describe("backupPriceDashboard rotation", () => {
  it("lists and deletes only under its own prefix, and only backups older than 14 days", async () => {
    const blobClient = new StubBlobClient([
      seedBlob(15, "expired"),
      seedBlob(13, "recent"),
      { pathname: "backups/designs/ancient.ndjson", uploadedAt: new Date(0) },
      { pathname: "backups/presets/ancient.ndjson", uploadedAt: new Date(0) },
    ]);

    const result = await backupPriceDashboard({
      rowSource: new StubRowSource(),
      blobClient,
      now: NOW,
    });

    expect(blobClient.listedPrefixes).toEqual([PREFIX]);
    expect(result.deletedPathnames).toEqual([`${PREFIX}expired.ndjson`]);
    expect(blobClient.holds("backups/designs/ancient.ndjson")).toBe(true);
    expect(blobClient.holds("backups/presets/ancient.ndjson")).toBe(true);
  });

  it("never deletes outside its prefix even when the listing returns a foreign pathname", async () => {
    const foreign = {
      pathname: "backups/designs/old.ndjson",
      uploadedAt: new Date(0),
    };
    const blobClient = new StubBlobClient([foreign]);
    vi.spyOn(blobClient, "list").mockResolvedValue([
      foreign,
      seedBlob(20, "expired"),
    ]);

    const result = await backupPriceDashboard({
      rowSource: new StubRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result.deletedPathnames).toEqual([`${PREFIX}expired.ndjson`]);
  });

  it("keeps the 30 newest when more files than that are all inside the window", async () => {
    const seeded = Array.from({ length: 32 }, (_, index) =>
      seedBlob(1 + index * 0.1, `file-${String(index).padStart(2, "0")}`),
    );
    const blobClient = new StubBlobClient(seeded);

    const result = await backupPriceDashboard({
      rowSource: new StubRowSource(),
      blobClient,
      now: NOW,
    });

    // 32 seeded plus this run's own file is 33 retained candidates; the 3 oldest go.
    expect(result.deletedPathnames).toEqual([
      `${PREFIX}file-29.ndjson`,
      `${PREFIX}file-30.ndjson`,
      `${PREFIX}file-31.ndjson`,
    ]);
  });

  it("leaves the folder alone at exactly 30 files", async () => {
    const seeded = Array.from({ length: 29 }, (_, index) =>
      seedBlob(1 + index * 0.1, `file-${String(index)}`),
    );

    const result = await backupPriceDashboard({
      rowSource: new StubRowSource(),
      blobClient: new StubBlobClient(seeded),
      now: NOW,
    });

    expect(result.deletedPathnames).toEqual([]);
  });

  it("reports a rotation failure as a warning with the snapshot's pathname, not as a lost snapshot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const blobClient = new StubBlobClient([], {
      listFailure: new Error(SYNTHETIC_SECRET),
    });

    const result = await backupPriceDashboard({
      rowSource: new StubRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result).toMatchObject({
      status: "rotation-failed",
      errorCode: "BACKUP_ROTATION_FAILED",
      deletedPathnames: [],
    });
    expect(result.backupPathname).toBe(blobClient.uploads[0]?.pathname);
    expect(JSON.stringify(result)).not.toContain("pA55w0rd-not-real");
  });
});
