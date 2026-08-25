import {
  DesignSchema,
  KITCHEN_L_DESIGN,
  migrateDesign,
} from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  backupDesigns,
  type BackupBlobClient,
  type BackupBlobInfo,
  type DesignBackupRow,
  type DesignRowSource,
} from "./backup-designs";

const A_DAY_MS = 24 * 60 * 60 * 1000;
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
    ...overrides,
  };
}

/** Hands back exactly the rows it was constructed with, or throws if scripted to. */
class StubRowSource implements DesignRowSource {
  constructor(
    private readonly rows: DesignBackupRow[],
    private readonly failure?: Error,
  ) {}

  fetchAllDesigns(): Promise<DesignBackupRow[]> {
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve(this.rows);
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

  upload(pathname: string, body: string): Promise<void> {
    if (this.uploadFailure) return Promise.reject(this.uploadFailure);
    this.uploads.push({ pathname, body });
    this.blobs.set(pathname, { pathname, uploadedAt: NOW });
    return Promise.resolve();
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

function parseNdjson(body: string): unknown[] {
  if (body === "") return [];
  return body.split("\n").map((line) => JSON.parse(line) as unknown);
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

    expect(result.ok).toBe(true);
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

  it("names the uploaded blob under the designs backup prefix with an ISO timestamp", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.backupPathname).toBe(
      `backups/designs/${NOW.toISOString()}.ndjson`,
    );
  });

  it("succeeds and uploads a valid, empty file when the designs table has no rows", async () => {
    const rowSource = new StubRowSource([]);
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.ok).toBe(true);
    expect(result.rowCount).toBe(0);
    expect(blobClient.uploads[0]?.body).toBe("");
  });

  it("reports failure and logs it, rather than throwing, when the export fails", async () => {
    const rowSource = new StubRowSource([], new Error("connection refused"));
    const blobClient = new StubBlobClient();

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("connection refused");
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

    expect(result.ok).toBe(false);
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

  it("reports rotation failure without failing the overall backup, since the export already succeeded", async () => {
    const rowSource = new StubRowSource([buildRow("a")]);
    const blobClient = new StubBlobClient();
    vi.spyOn(blobClient, "list").mockRejectedValueOnce(
      new Error("list failed"),
    );

    const result = await backupDesigns({ rowSource, blobClient, now: NOW });

    expect(result.ok).toBe(true);
    expect(result.error).toContain("list failed");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
