import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../../../../src/app/api/cron/backup-price-dashboard/route";
import type { BackupResult } from "../../../../../src/lib/server/backup-price-dashboard";

/** The route's only collaborator, replaced so these tests are about authentication, status codes and response shape. */
const backupModule = vi.hoisted(() => ({
  result: undefined as BackupResult | undefined,
  runs: 0,
}));

vi.mock("@/lib/server/backup-price-dashboard", () => ({
  runPriceDashboardBackup: () => {
    backupModule.runs += 1;
    return Promise.resolve(backupModule.result);
  },
}));

const CRON_SECRET = "cron-secret-for-the-price-dashboard-tests";
const ROUTE_URL = "https://example.test/api/cron/backup-price-dashboard";

function requestWith(headers: Record<string, string>): NextRequest {
  return new NextRequest(ROUTE_URL, { headers });
}

describe("GET /api/cron/backup-price-dashboard", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    backupModule.result = { status: "ok", deletedPathnames: [] };
    backupModule.runs = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["no authorization header", {}],
    ["a wrong token", { authorization: "Bearer not-the-secret" }],
    ["the secret without its scheme", { authorization: CRON_SECRET }],
    [
      "a token one character short",
      { authorization: `Bearer ${CRON_SECRET.slice(1)}` },
    ],
  ])("answers 401 for %s and runs no backup", async (_label, headers) => {
    const response = await GET(requestWith(headers));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(backupModule.runs).toBe(0);
  });

  it("answers 401 to every caller when no secret is configured, even one sending an empty bearer", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(requestWith({ authorization: "Bearer " }));

    expect(response.status).toBe(401);
    expect(backupModule.runs).toBe(0);
  });

  it("answers 200 with the result when the snapshot was written and rotation ran", async () => {
    backupModule.result = {
      status: "ok",
      backupPathname:
        "backups/price-dashboard/2026-11-11T03:45:00.000Z-abcd1234.ndjson",
      rowCount: 6,
      deletedPathnames: [],
    };

    const response = await GET(
      requestWith({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", rowCount: 6 });
    expect(backupModule.runs).toBe(1);
  });

  it("answers 503 with the stable code when the export failed, so monitoring sees a missing recovery point", async () => {
    backupModule.result = {
      status: "export-failed",
      deletedPathnames: [],
      errorCode: "BACKUP_EXPORT_FAILED",
    };

    const response = await GET(
      requestWith({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "export-failed",
      deletedPathnames: [],
      errorCode: "BACKUP_EXPORT_FAILED",
    });
  });

  it("answers 200 with a distinct status when only rotation failed, since the snapshot exists", async () => {
    backupModule.result = {
      status: "rotation-failed",
      backupPathname:
        "backups/price-dashboard/2026-11-11T03:45:00.000Z-abcd1234.ndjson",
      rowCount: 6,
      deletedPathnames: [],
      errorCode: "BACKUP_ROTATION_FAILED",
    };

    const response = await GET(
      requestWith({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "rotation-failed",
      errorCode: "BACKUP_ROTATION_FAILED",
    });
  });
});
