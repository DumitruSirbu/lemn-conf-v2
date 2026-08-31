import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../../../../src/app/api/cron/backup-designs/route";
import type { BackupResult } from "../../../../../src/lib/server/backup-designs";

/**
 * The route's only collaborator, replaced so these tests are about status codes and response shape
 * rather than about Postgres or Blob. `vi.mock` is hoisted, so the mutable outcome it returns has to
 * be created through `vi.hoisted`.
 */
const backupModule = vi.hoisted(() => ({
  result: undefined as BackupResult | undefined,
}));

vi.mock("@/lib/server/backup-designs", () => ({
  runDesignsBackup: () => Promise.resolve(backupModule.result),
}));

const CRON_SECRET = "cron-secret-for-tests";

function authorizedRequest(): NextRequest {
  return new NextRequest("https://example.test/api/cron/backup-designs", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe("GET /api/cron/backup-designs", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret ?? "";
  });

  it("refuses a request without the cron bearer token", async () => {
    backupModule.result = { status: "ok", deletedPathnames: [] };

    const response = await GET(
      new NextRequest("https://example.test/api/cron/backup-designs"),
    );

    expect(response.status).toBe(401);
  });

  it("answers 200 when the snapshot was written and rotation ran", async () => {
    backupModule.result = {
      status: "ok",
      backupPathname: "backups/designs/2026-08-25T03:00:00.000Z.ndjson",
      rowCount: 3,
      deletedPathnames: [],
    };

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", rowCount: 3 });
  });

  // A backup that did not happen must not look like one that did: 200 for every outcome left
  // status-only monitoring unable to tell a snapshot from no snapshot (finding DB-003).
  it("answers 503 when the export failed, so monitoring sees a missing recovery point", async () => {
    backupModule.result = {
      status: "export-failed",
      deletedPathnames: [],
      errorCode: "BACKUP_EXPORT_FAILED",
    };

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "export-failed",
      errorCode: "BACKUP_EXPORT_FAILED",
    });
  });

  it("answers 200 with a distinct status when only rotation failed, since the snapshot exists", async () => {
    backupModule.result = {
      status: "rotation-failed",
      backupPathname: "backups/designs/2026-08-25T03:00:00.000Z.ndjson",
      rowCount: 3,
      deletedPathnames: [],
      errorCode: "BACKUP_ROTATION_FAILED",
    };

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "rotation-failed",
      errorCode: "BACKUP_ROTATION_FAILED",
    });
  });
});
