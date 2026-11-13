import type {
  AvailabilityChangeBackupRow,
  AvailabilityChangePageQuery,
  AvailabilityHeadBackupRow,
  KitchenDefaultsBackupRow,
  PriceBookVersionBackupRow,
  PriceBookVersionPageQuery,
} from "@lemnaria/persistence";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE,
  VERSION_BACKUP_PAGE_SIZE,
  backupPriceDashboard,
  type BackupBlobClient,
  type BackupBlobInfo,
  type PriceDashboardRowSource,
} from "../../../src/lib/server/backup-price-dashboard";

/**
 * Adversarial QA for M10 wave S6b. These tests use a row source that compares keys as `bigint` and records every query
 * exactly as it was passed, because a stub that coerces keys with `Number()` hides the bugs a keyset walk can have
 * (a bound re-typed, truncated or dropped).
 */

const A_DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-11T03:45:00.000Z");
const PREFIX = "backups/price-dashboard/";
const SECRET_URL =
  "postgresql://app_user:pA55w0rd-not-real@ep-secret-123.eu-central-1.aws.neon.tech/neondb";
const BOUNDARY_CHANGE_COUNTS = [0, 1, 499, 500, 501, 999, 1000, 1001, 1500];

function versionRow(
  sequenceNumber: string,
  overrides: Partial<PriceBookVersionBackupRow> = {},
): PriceBookVersionBackupRow {
  return {
    id: `version-${sequenceNumber}`,
    sequence_number: sequenceNumber,
    label: `Book ${sequenceNumber}`,
    note: "",
    book: { marker: sequenceNumber },
    change_summary: [],
    change_count: 0,
    published_at: "2026-11-01T00:00:00.000Z",
    published_by_account_id: "account-1",
    ...overrides,
  };
}

function changeRow(revision: string): AvailabilityChangeBackupRow {
  return {
    revision,
    item_kind: "front",
    item_id: `item-${revision}`,
    active: true,
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

interface ScriptedSource {
  versions?: PriceBookVersionBackupRow[];
  changes?: AvailabilityChangeBackupRow[];
  /** Throws from the named call (`head`, `defaults`, `versions#2`, ...). */
  failAt?: { call: string; error: unknown };
  /** Answers at most this many rows to the n-th (1-based) page request of a table, whatever was asked. */
  shortPage?: { table: "versions" | "changes"; call: number; rows: number };
}

class RecordingRowSource implements PriceDashboardRowSource {
  readonly calls: string[] = [];
  readonly versionQueries: PriceBookVersionPageQuery[] = [];
  readonly changeQueries: AvailabilityChangePageQuery[] = [];

  constructor(private readonly script: ScriptedSource = {}) {}

  fetchVersionPage(
    query: PriceBookVersionPageQuery,
  ): Promise<PriceBookVersionBackupRow[]> {
    this.versionQueries.push(query);
    this.enter("versions");
    return Promise.resolve(
      this.page(
        this.script.versions ?? [],
        (row) => row.sequence_number,
        query.afterSequenceNumber,
        query.pageSize,
        "versions",
        this.versionQueries.length,
      ),
    );
  }

  fetchAvailabilityChangePage(
    query: AvailabilityChangePageQuery,
  ): Promise<AvailabilityChangeBackupRow[]> {
    this.changeQueries.push(query);
    this.enter("changes");
    return Promise.resolve(
      this.page(
        this.script.changes ?? [],
        (row) => row.revision,
        query.afterRevision,
        query.pageSize,
        "changes",
        this.changeQueries.length,
      ),
    );
  }

  fetchAvailabilityHead(): Promise<AvailabilityHeadBackupRow> {
    this.enter("head");
    return Promise.resolve({ revision: "9" });
  }

  fetchKitchenDefaults(): Promise<KitchenDefaultsBackupRow> {
    this.enter("defaults");
    return Promise.resolve(DEFAULTS);
  }

  private page<Row>(
    rows: readonly Row[],
    keyOf: (row: Row) => string,
    after: string | undefined,
    pageSize: number,
    table: "versions" | "changes",
    callNumber: number,
  ): Row[] {
    const bound = after === undefined ? undefined : BigInt(after);
    const served = rows
      .filter((row) => bound === undefined || BigInt(keyOf(row)) > bound)
      .slice(0, pageSize);
    const short = this.script.shortPage;
    if (short?.table === table && short.call === callNumber) {
      return served.slice(0, short.rows);
    }
    return served;
  }

  private enter(call: string): void {
    this.calls.push(call);
    const failAt = this.script.failAt;
    if (!failAt) return;
    const occurrence = this.calls.filter((name) => name === call).length;
    if (
      failAt.call === call ||
      failAt.call === `${call}#${String(occurrence)}`
    ) {
      throw failAt.error;
    }
  }
}

interface BlobBehaviour {
  /** Reads the stream, but swallows a stream error and resolves with what it had, as a lenient uploader could. */
  swallowStreamErrors?: boolean;
  deleteFailure?: unknown;
  listFailure?: unknown;
  uploadFailure?: unknown;
}

class StubBlobClient implements BackupBlobClient {
  readonly uploads: { pathname: string; body: string }[] = [];
  readonly deleteCalls: string[][] = [];
  readonly listedPrefixes: string[] = [];
  private readonly blobs = new Map<string, BackupBlobInfo>();

  constructor(
    seed: BackupBlobInfo[] = [],
    private readonly behaviour: BlobBehaviour = {},
  ) {
    for (const blob of seed) this.blobs.set(blob.pathname, blob);
  }

  async upload(
    pathname: string,
    body: ReadableStream<Uint8Array>,
  ): Promise<void> {
    if (this.behaviour.uploadFailure !== undefined) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the cause may be any value a driver throws
      throw this.behaviour.uploadFailure;
    }
    const text = await this.readAll(body);
    if (text === "") throw new Error("Vercel Blob: body is required");
    this.uploads.push({ pathname, body: text });
    this.blobs.set(pathname, { pathname, uploadedAt: NOW });
  }

  /** The real `list({ prefix })` is a string-prefix match; this stub is exactly that and nothing safer. */
  list(prefix: string): Promise<BackupBlobInfo[]> {
    this.listedPrefixes.push(prefix);
    if (this.behaviour.listFailure !== undefined) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a driver can reject with anything
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
    if (this.behaviour.deleteFailure !== undefined) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a driver can reject with anything
      return Promise.reject(this.behaviour.deleteFailure);
    }
    for (const pathname of pathnames) this.blobs.delete(pathname);
    return Promise.resolve();
  }

  holds(pathname: string): boolean {
    return this.blobs.has(pathname);
  }

  private async readAll(body: ReadableStream<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let text = "";
    for (;;) {
      try {
        const { done, value } = await reader.read();
        if (done) return text + decoder.decode();
        text += decoder.decode(value, { stream: true });
      } catch (error) {
        if (this.behaviour.swallowStreamErrors) return text;
        throw error;
      }
    }
  }
}

interface ParsedRecord {
  table: string;
  row: Record<string, unknown>;
}

function parseNdjson(body: string): ParsedRecord[] {
  return body
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as ParsedRecord);
}

function lastUploadBody(blobClient: StubBlobClient): string {
  return blobClient.uploads.at(-1)?.body ?? "";
}

function ageBlob(ageInDays: number, pathname: string): BackupBlobInfo {
  return {
    pathname,
    uploadedAt: new Date(NOW.getTime() - ageInDays * A_DAY_MS),
  };
}

function ownBlob(ageInDays: number, name: string): BackupBlobInfo {
  return ageBlob(ageInDays, `${PREFIX}${name}.ndjson`);
}

function numberedKeys(first: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => String(first + index));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("keyset bounds", () => {
  it("passes the previous page's last key, as the string it was, as the next bound, across 9/10/100 and above 2^53", async () => {
    const keys = ["9", "10", "100", "9007199254740993"];
    const rowSource = new RecordingRowSource({
      versions: keys.map((k) => versionRow(k)),
    });

    await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(rowSource.versionQueries).toEqual([
      { pageSize: 2 },
      { afterSequenceNumber: "10", pageSize: 2 },
      { afterSequenceNumber: "9007199254740993", pageSize: 2 },
    ]);
  });

  it("asks for the first page of each table with no bound at all, not an undefined or empty one", async () => {
    const rowSource = new RecordingRowSource({
      versions: [versionRow("1")],
      changes: [changeRow("1")],
    });

    await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(Object.keys(rowSource.versionQueries[0] ?? {})).toEqual([
      "pageSize",
    ]);
    expect(Object.keys(rowSource.changeQueries[0] ?? {})).toEqual(["pageSize"]);
  });

  it("walks the log across the 9/10, 99/100 and 999/1000 digit transitions with the last key of each page as the bound", async () => {
    const changes = numberedKeys(5, 1001).map(changeRow);
    const rowSource = new RecordingRowSource({ changes });
    const blobClient = new StubBlobClient();

    await backupPriceDashboard({ rowSource, blobClient, now: NOW });

    expect(rowSource.changeQueries).toEqual([
      { pageSize: 500 },
      { afterRevision: "504", pageSize: 500 },
      { afterRevision: "1004", pageSize: 500 },
    ]);
    const exported = parseNdjson(lastUploadBody(blobClient)).filter(
      (record) => record.table === "catalogue_availability_changes",
    );
    expect(exported.map((record) => record.row.revision)).toEqual(
      numberedKeys(5, 1001),
    );
  });

  it("sends the bound of a row at the very top of the bigint range unchanged", async () => {
    const top = "9223372036854775807";
    const rowSource = new RecordingRowSource({
      versions: [versionRow("1"), versionRow(top)],
    });

    await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(rowSource.versionQueries[1]).toEqual({
      afterSequenceNumber: top,
      pageSize: 2,
    });
  });
});

describe("page-size boundaries", () => {
  it("fetches exactly floor(n / pageSize) + 1 pages of each table, exports every row once in order, and counts every record", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 9 }),
        fc.constantFrom(...BOUNDARY_CHANGE_COUNTS),
        async (versionCount, changeCount) => {
          const rowSource = new RecordingRowSource({
            versions: numberedKeys(1, versionCount).map((key) =>
              versionRow(key),
            ),
            changes: numberedKeys(1, changeCount).map(changeRow),
          });
          const blobClient = new StubBlobClient();

          const result = await backupPriceDashboard({
            rowSource,
            blobClient,
            now: NOW,
          });

          const records = parseNdjson(lastUploadBody(blobClient));
          expect(rowSource.versionQueries).toHaveLength(
            Math.floor(versionCount / VERSION_BACKUP_PAGE_SIZE) + 1,
          );
          expect(rowSource.changeQueries).toHaveLength(
            Math.floor(changeCount / AVAILABILITY_CHANGE_BACKUP_PAGE_SIZE) + 1,
          );
          expect(records.map((record) => record.table)).toEqual([
            ...Array<string>(versionCount).fill("price_book_versions"),
            ...Array<string>(changeCount).fill(
              "catalogue_availability_changes",
            ),
            "catalogue_availability_head",
            "kitchen_defaults",
          ]);
          expect(result.rowCount).toBe(versionCount + changeCount + 2);
          expect(result.rowCount).toBe(records.length);
        },
      ),
      { numRuns: 60 },
    );
  }, 60_000);

  it("stops after one empty extra fetch when the rows are an exact multiple of the page size", async () => {
    const rowSource = new RecordingRowSource({
      versions: numberedKeys(1, 4).map((key) => versionRow(key)),
      changes: numberedKeys(1, 500).map(changeRow),
    });

    await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(rowSource.calls).toEqual([
      "versions",
      "versions",
      "versions",
      "changes",
      "changes",
      "head",
      "defaults",
    ]);
  });

  it("stops without a second fetch when a table has fewer rows than one page", async () => {
    const rowSource = new RecordingRowSource({
      versions: [versionRow("1")],
      changes: numberedKeys(1, 499).map(changeRow),
    });

    await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(rowSource.calls).toEqual([
      "versions",
      "changes",
      "head",
      "defaults",
    ]);
  });

  it("treats a page shorter than asked as the end of the table (design contract: the SQL limit means a short page is the last), and still reports ok", async () => {
    const rowSource = new RecordingRowSource({
      versions: numberedKeys(1, 6).map((key) => versionRow(key)),
      shortPage: { table: "versions", call: 1, rows: 1 },
    });
    const blobClient = new StubBlobClient();

    const result = await backupPriceDashboard({
      rowSource,
      blobClient,
      now: NOW,
    });

    expect(rowSource.versionQueries).toHaveLength(1);
    expect(result).toMatchObject({ status: "ok", rowCount: 1 + 2 });
  });
});

describe("singleton failures", () => {
  it.each([
    ["head", "head"],
    ["defaults", "defaults"],
  ])(
    "leaves no blob, no listing and no delete when the %s read throws, so rotation never runs",
    async (_label, failingCall) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const seeded = ownBlob(30, "ancient");
      const blobClient = new StubBlobClient([seeded]);
      const rowSource = new RecordingRowSource({
        versions: [versionRow("1")],
        changes: [changeRow("1")],
        failAt: { call: failingCall, error: new Error("boom") },
      });

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
      expect(blobClient.uploads).toEqual([]);
      expect(blobClient.listedPrefixes).toEqual([]);
      expect(blobClient.deleteCalls).toEqual([]);
      expect(blobClient.holds(seeded.pathname)).toBe(true);
    },
  );

  it.each([["head"], ["defaults"]])(
    "deletes the partial blob by its own pathname when an uploader swallows the stream error after the %s read threw",
    async (failingCall) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const blobClient = new StubBlobClient([], { swallowStreamErrors: true });
      const rowSource = new RecordingRowSource({
        versions: [versionRow("1")],
        failAt: { call: failingCall, error: new Error("boom") },
      });

      const result = await backupPriceDashboard({
        rowSource,
        blobClient,
        now: NOW,
      });

      const partial = blobClient.uploads[0]?.pathname ?? "";
      expect(partial).toMatch(new RegExp(`^${PREFIX}`));
      expect(result.status).toBe("export-failed");
      expect(blobClient.deleteCalls).toEqual([[partial]]);
      expect(blobClient.holds(partial)).toBe(false);
      expect(blobClient.listedPrefixes).toEqual([]);
    },
  );

  it("still answers export-failed, and logs a cleanup line without the cause, when removing the partial blob fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const blobClient = new StubBlobClient([], {
      swallowStreamErrors: true,
      deleteFailure: new Error(`delete refused for ${SECRET_URL}`),
    });
    const rowSource = new RecordingRowSource({
      failAt: { call: "defaults", error: new Error("boom") },
    });

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
    const lines = consoleError.mock.calls.map(([line]) => String(line));
    expect(lines.some((line) => line.includes('"stage":"cleanup"'))).toBe(true);
    expect(lines.some((line) => line.includes('"stage":"export"'))).toBe(true);
    expect(lines.join("\n")).not.toContain("pA55w0rd-not-real");
  });

  it("answers export-failed, not a throw, when the clock is an invalid Date", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const blobClient = new StubBlobClient();

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: new Date(Number.NaN),
    });

    expect(result.status).toBe("export-failed");
    expect(blobClient.uploads).toEqual([]);
    expect(blobClient.listedPrefixes).toEqual([]);
  });
});

describe("rotation scope", () => {
  const LOOKALIKES = [
    "backups/price-dashboard-x/a.ndjson",
    "backups/price-dashboardx.ndjson",
    "backups/price-dashboard",
    "Backups/price-dashboard/a.ndjson",
    "backups/price-dashboards/a.ndjson",
    " backups/price-dashboard/a.ndjson",
    "x/backups/price-dashboard/a.ndjson",
    "backups/designs/a.ndjson",
    "backups/presets/a.ndjson",
    "backups/designs/price-dashboard/a.ndjson",
    "https://store.public.blob.vercel-storage.com/backups/price-dashboard/a.ndjson",
  ];

  it.each([0, 100])(
    "never deletes a lookalike or another export's file, at age %s days, and deletes its own expired one",
    async (ageInDays) => {
      const lookalikes = LOOKALIKES.map((name) => ageBlob(ageInDays, name));
      const expired = ownBlob(15, "expired");
      const blobClient = new StubBlobClient([...lookalikes, expired]);

      const result = await backupPriceDashboard({
        rowSource: new RecordingRowSource(),
        blobClient,
        now: NOW,
      });

      expect(result.deletedPathnames).toEqual([expired.pathname]);
      for (const blob of lookalikes)
        expect(blobClient.holds(blob.pathname)).toBe(true);
    },
  );

  it("filters a hostile listing that ignores the prefix, even for 100-day-old foreign files", async () => {
    const foreign = LOOKALIKES.map((name) => ageBlob(100, name));
    const own = ownBlob(20, "expired");
    const blobClient = new StubBlobClient();
    vi.spyOn(blobClient, "list").mockResolvedValue([...foreign, own]);

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result.deletedPathnames).toEqual([own.pathname]);
    expect(blobClient.deleteCalls).toEqual([[own.pathname]]);
  });

  it("lists with the trailing-slash prefix and nothing else", async () => {
    const blobClient = new StubBlobClient();

    await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: NOW,
    });

    expect(blobClient.listedPrefixes).toEqual(["backups/price-dashboard/"]);
  });
});

describe("rotation edges", () => {
  it("keeps a file exactly 14 days old and deletes one 14 days and 1 ms old", async () => {
    const exactly = ageBlob(14, `${PREFIX}exactly.ndjson`);
    const justOver = {
      pathname: `${PREFIX}just-over.ndjson`,
      uploadedAt: new Date(NOW.getTime() - 14 * A_DAY_MS - 1),
    };
    const justUnder = {
      pathname: `${PREFIX}just-under.ndjson`,
      uploadedAt: new Date(NOW.getTime() - 14 * A_DAY_MS + 1),
    };
    const blobClient = new StubBlobClient([exactly, justOver, justUnder]);

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result.deletedPathnames).toEqual([justOver.pathname]);
  });

  it("deletes exactly the oldest file when 30 others plus this run's own make 31", async () => {
    const seeded = Array.from({ length: 30 }, (_, index) =>
      ownBlob(1 + index * 0.1, `file-${String(index).padStart(2, "0")}`),
    );
    const blobClient = new StubBlobClient(seeded);

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result.deletedPathnames).toEqual([`${PREFIX}file-29.ndjson`]);
  });

  it("deletes nothing at exactly 29 others plus this run's own (30 files)", async () => {
    const seeded = Array.from({ length: 29 }, (_, index) =>
      ownBlob(1 + index * 0.1, `file-${String(index)}`),
    );

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient: new StubBlobClient(seeded),
      now: NOW,
    });

    expect(result.deletedPathnames).toEqual([]);
  });

  it("lets age win: 35 files of which 5 are expired delete exactly those 5, not the 5 oldest survivors as well", async () => {
    const expired = Array.from({ length: 5 }, (_, index) =>
      ownBlob(20 + index, `expired-${String(index)}`),
    );
    const fresh = Array.from({ length: 30 }, (_, index) =>
      ownBlob(1 + index * 0.1, `fresh-${String(index).padStart(2, "0")}`),
    );
    const blobClient = new StubBlobClient([...expired, ...fresh]);

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: NOW,
    });

    // 30 fresh plus this run's own is 31 survivors, so exactly one surplus (the oldest fresh) goes beside the 5 expired.
    expect([...result.deletedPathnames].sort()).toEqual(
      [
        ...expired.map((blob) => blob.pathname),
        `${PREFIX}fresh-29.ndjson`,
      ].sort(),
    );
    expect(blobClient.deleteCalls).toHaveLength(1);
  });

  it("deletes the surplus by the store's uploadedAt, not by listing or pathname order", async () => {
    const shuffled = Array.from({ length: 30 }, (_, index) =>
      ownBlob(
        ((index * 7) % 30) / 10 + 1,
        `file-${String(index).padStart(2, "0")}`,
      ),
    );
    const oldest = [...shuffled].sort(
      (left, right) => left.uploadedAt.getTime() - right.uploadedAt.getTime(),
    )[0];
    const blobClient = new StubBlobClient(shuffled);

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result.deletedPathnames).toEqual([oldest?.pathname]);
  });

  it("keeps the file it just wrote under any seeding of the folder that is older than itself", async () => {
    const seeded = Array.from({ length: 40 }, (_, index) =>
      ownBlob(0.5 + index * 0.3, `file-${String(index)}`),
    );
    const blobClient = new StubBlobClient(seeded);

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: NOW,
    });

    expect(blobClient.holds(result.backupPathname ?? "")).toBe(true);
  });

  it("reports rotation-failed and the written file's pathname when the delete throws, and logs only the stage", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const blobClient = new StubBlobClient([ownBlob(30, "old")], {
      deleteFailure: new Error(`token ${SECRET_URL}`),
    });

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient,
      now: NOW,
    });

    expect(result).toMatchObject({
      status: "rotation-failed",
      errorCode: "BACKUP_ROTATION_FAILED",
      deletedPathnames: [],
    });
    expect(result.backupPathname).toBe(blobClient.uploads[0]?.pathname);
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({
        operation: "backup-price-dashboard",
        stage: "rotation",
        errorName: "Error",
      }),
    );
    expect(JSON.stringify([result, consoleError.mock.calls])).not.toContain(
      "pA55w0rd-not-real",
    );
  });
});

describe("pathnames and the clock", () => {
  it("sorts pathnames in time order for any two instants of the supported range", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({
          min: new Date("1970-01-01T00:00:00.000Z"),
          max: new Date("9999-12-31T23:59:59.999Z"),
          noInvalidDate: true,
        }),
        fc.date({
          min: new Date("1970-01-01T00:00:00.000Z"),
          max: new Date("9999-12-31T23:59:59.999Z"),
          noInvalidDate: true,
        }),
        async (first, second) => {
          const names: string[] = [];
          for (const now of [first, second]) {
            const result = await backupPriceDashboard({
              rowSource: new RecordingRowSource(),
              blobClient: new StubBlobClient(),
              now,
            });
            names.push(result.backupPathname ?? "");
          }
          if (first.getTime() < second.getTime()) {
            expect((names[0] ?? "") < (names[1] ?? "")).toBe(true);
          }
          if (first.getTime() > second.getTime()) {
            expect((names[0] ?? "") > (names[1] ?? "")).toBe(true);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("gives two runs at the same instant different pathnames, so neither overwrites the other", async () => {
    const names = new Set<string>();
    for (let run = 0; run < 20; run += 1) {
      const result = await backupPriceDashboard({
        rowSource: new RecordingRowSource(),
        blobClient: new StubBlobClient(),
        now: NOW,
      });
      names.add(result.backupPathname ?? "");
    }

    expect(names.size).toBe(20);
  });
});

describe("one record per line", () => {
  const HOSTILE_TEXT = [
    "line one\nline two",
    "carriage\rreturn",
    "windows\r\nline",
    "separator here and here",
    "lone surrogate \uD800 end",
    'nul \u0000 tab \t quote " backslash \\',
    "emoji \u{1F600} and é",
  ].join(" | ");

  it("keeps every record on its own line when text fields hold newlines, CR, U+2028/2029 and a lone surrogate", async () => {
    const versions = ["1", "2", "3"].map((key) =>
      versionRow(key, {
        label: HOSTILE_TEXT,
        note: HOSTILE_TEXT,
        book: { text: HOSTILE_TEXT, [HOSTILE_TEXT]: [HOSTILE_TEXT] },
        change_summary: [{ text: HOSTILE_TEXT }],
      }),
    );
    const rowSource = new RecordingRowSource({
      versions,
      changes: [changeRow("1")],
    });
    const blobClient = new StubBlobClient();

    const result = await backupPriceDashboard({
      rowSource,
      blobClient,
      now: NOW,
    });

    const body = lastUploadBody(blobClient);
    const lines = body.split("\n");
    expect(lines.at(-1)).toBe("");
    expect(lines.slice(0, -1)).toHaveLength(3 + 1 + 2);
    expect(body).not.toContain("\r");
    expect(result.rowCount).toBe(6);
    const records = parseNdjson(body);
    for (const [index, record] of records.slice(0, 3).entries()) {
      expect(record.row).toEqual(versions[index]);
    }
  });

  it("round-trips a book of more than 4 MiB, two on one page, as two intact lines", async () => {
    const bigText = "é\n x".repeat(1_000_000);
    expect(new TextEncoder().encode(bigText).length).toBeGreaterThan(
      4 * 1024 * 1024,
    );
    const versions = ["1", "2"].map((key) =>
      versionRow(key, { book: { bigText } }),
    );
    const blobClient = new StubBlobClient();

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource({ versions }),
      blobClient,
      now: NOW,
    });

    const lines = lastUploadBody(blobClient).split("\n");
    expect(
      lines
        .slice(0, 2)
        .map((line) => (JSON.parse(line) as ParsedRecord).row.book),
    ).toEqual([{ bigText }, { bigText }]);
    expect(result.rowCount).toBe(4);
  }, 60_000);
});

describe("memory is bounded by the page, not the table", () => {
  it("does not read the next page until the uploader has taken the previous chunk, beyond one chunk of look-ahead", async () => {
    const rowSource = new RecordingRowSource({
      versions: numberedKeys(1, 40).map((key) => versionRow(key)),
    });
    const fetchesWhenFirstChunkWasTaken: number[] = [];
    const blobClient = new StubBlobClient();
    blobClient.upload = async (_pathname, body) => {
      const reader = body.getReader();
      await reader.read();
      await new Promise((resolve) => setTimeout(resolve, 20));
      fetchesWhenFirstChunkWasTaken.push(rowSource.versionQueries.length);
      for (;;) {
        const { done } = await reader.read();
        if (done) return;
      }
    };

    await backupPriceDashboard({ rowSource, blobClient, now: NOW });

    expect(rowSource.versionQueries).toHaveLength(21);
    expect(fetchesWhenFirstChunkWasTaken[0]).toBeLessThanOrEqual(2);
  });
});

describe("no cause or secret in answers or logs", () => {
  it.each([
    ["a string thrown by the driver", SECRET_URL],
    [
      "an Error whose message holds the connection string",
      new Error(SECRET_URL),
    ],
    [
      "an Error whose class name holds it",
      Object.assign(new Error("x"), { name: SECRET_URL }),
    ],
    ["an object carrying it", { message: SECRET_URL, url: SECRET_URL }],
    ["null", null],
  ])("keeps %s out of the result and the log", async (_label, thrown) => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource({
        failAt: { call: "head", error: thrown },
      }),
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    const everything = JSON.stringify([result, consoleError.mock.calls]);
    expect(everything).not.toContain("pA55w0rd-not-real");
    expect(everything).not.toContain("ep-secret-123");
    expect(result.status).toBe("export-failed");
    for (const [line] of consoleError.mock.calls) {
      expect(JSON.parse(String(line))).toEqual({
        operation: "backup-price-dashboard",
        stage: "export",
        errorName: expect.stringMatching(
          /^[A-Za-z][A-Za-z0-9]{0,63}$/,
        ) as string,
      });
    }
  });

  it("keeps an upload failure's cause out of the result and the log", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await backupPriceDashboard({
      rowSource: new RecordingRowSource(),
      blobClient: new StubBlobClient([], {
        uploadFailure: new Error(SECRET_URL),
      }),
      now: NOW,
    });

    expect(JSON.stringify([result, consoleError.mock.calls])).not.toContain(
      "pA55w0rd-not-real",
    );
    expect(result).toEqual({
      status: "export-failed",
      deletedPathnames: [],
      errorCode: "BACKUP_EXPORT_FAILED",
    });
  });

  it("keeps the export's file contents out of the log when the walk fails midway", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const rowSource = new RecordingRowSource({
      versions: [versionRow("1", { label: "CUSTOMER-PII-LABEL" })],
      failAt: { call: "head", error: new Error("boom") },
    });

    await backupPriceDashboard({
      rowSource,
      blobClient: new StubBlobClient(),
      now: NOW,
    });

    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "CUSTOMER-PII-LABEL",
    );
  });
});
