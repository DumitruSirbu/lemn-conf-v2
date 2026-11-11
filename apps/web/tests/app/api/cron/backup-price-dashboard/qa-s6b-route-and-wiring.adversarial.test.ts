import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as routeModule from "../../../../../src/app/api/cron/backup-price-dashboard/route";

/**
 * Adversarial QA for the S6b route, run against the REAL backup module with only its two edges replaced: the Postgres
 * row source factory and `@vercel/blob`. That is what lets a 401 be proved to open no store and make no Blob call, and
 * lets the production wiring (put options, delete of an empty list) be asserted, which the route test that mocks the
 * whole backup module cannot reach.
 */

const edges = vi.hoisted(() => ({
  createRowSource: vi.fn(),
  put: vi.fn(),
  list: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@lemnaria/persistence", () => ({
  createNeonPriceDashboardRowSource: edges.createRowSource,
}));
vi.mock("@vercel/blob", () => ({
  put: edges.put,
  list: edges.list,
  del: edges.del,
}));

const CRON_SECRET = "cron-secret-QA-S6B-sentinel";
const DATABASE_URL =
  "postgresql://qa_user:DB-PASSWORD-SENTINEL@db-host-sentinel.example/neondb";
const BLOB_TOKEN = "vercel_blob_rw_TOKEN-SENTINEL";
const SENTINELS = [
  CRON_SECRET,
  "DB-PASSWORD-SENTINEL",
  "db-host-sentinel",
  BLOB_TOKEN,
];
const ROUTE_URL = "https://example.test/api/cron/backup-price-dashboard";
const PREFIX = "backups/price-dashboard/";
const NOW_MS = Date.now();

function request(
  headers: Record<string, string> = {},
  method = "GET",
): NextRequest {
  return new NextRequest(ROUTE_URL, { headers, method });
}

function authorized(): NextRequest {
  return request({ authorization: `Bearer ${CRON_SECRET}` });
}

function workingRowSource() {
  return {
    fetchVersionPage: vi.fn().mockResolvedValue([]),
    fetchAvailabilityChangePage: vi.fn().mockResolvedValue([]),
    fetchAvailabilityHead: vi.fn().mockResolvedValue({ revision: "1" }),
    fetchKitchenDefaults: vi.fn().mockResolvedValue({
      revision: "1",
      defaults: {},
      saved_at: "2026-11-01T00:00:00.000Z",
      saved_by_account_id: null,
    }),
  };
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("DATABASE_URL", DATABASE_URL);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", BLOB_TOKEN);
  edges.createRowSource.mockReset().mockReturnValue(workingRowSource());
  edges.put
    .mockReset()
    .mockImplementation(
      async (_pathname: string, body: ReadableStream<Uint8Array>) => {
        const reader = body.getReader();
        for (;;) {
          const { done } = await reader.read();
          if (done) return {};
        }
      },
    );
  edges.list.mockReset().mockResolvedValue({ blobs: [] });
  edges.del.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("route 401 variants open no store and make no Blob call", () => {
  it.each([
    ["no header", {}],
    ["a lowercase scheme", { authorization: `bearer ${CRON_SECRET}` }],
    [
      "an inner space in the secret",
      { authorization: `Bearer ${CRON_SECRET.replace("-", " -")}` },
    ],
    ["one character too long", { authorization: `Bearer ${CRON_SECRET}x` }],
    [
      "one character short",
      { authorization: `Bearer ${CRON_SECRET.slice(0, -1)}` },
    ],
    ["the secret with no scheme", { authorization: CRON_SECRET }],
    ["an empty bearer", { authorization: "Bearer " }],
    ["a doubled scheme", { authorization: `Bearer Bearer ${CRON_SECRET}` }],
    ["the secret in a different header", { "x-cron-secret": CRON_SECRET }],
    ["a basic scheme", { authorization: `Basic ${CRON_SECRET}` }],
  ])("answers 401 for %s", async (_label, headers) => {
    const response = await routeModule.GET(request(headers));

    expect(response.status).toBe(401);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "Unauthorized" });
    for (const sentinel of SENTINELS) expect(text).not.toContain(sentinel);
    expect(edges.createRowSource).not.toHaveBeenCalled();
    expect(edges.put).not.toHaveBeenCalled();
    expect(edges.list).not.toHaveBeenCalled();
    expect(edges.del).not.toHaveBeenCalled();
  });

  it("answers 401 for a correct bearer when CRON_SECRET is unset, so an unconfigured project is closed", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await routeModule.GET(authorized());

    expect(response.status).toBe(401);
    expect(edges.createRowSource).not.toHaveBeenCalled();
    expect(edges.put).not.toHaveBeenCalled();
  });
});

describe("route exposure", () => {
  it("exports only GET and the nodejs, force-dynamic settings", () => {
    const exported = Object.keys(routeModule).sort();

    expect(exported).toEqual(["GET", "dynamic", "runtime"]);
    expect(routeModule.runtime).toBe("nodejs");
    expect(routeModule.dynamic).toBe("force-dynamic");
  });
});

describe("authorized run through the production wiring", () => {
  it("writes one private, non-suffixed, multipart ndjson blob under the prefix and names no token", async () => {
    const response = await routeModule.GET(authorized());

    expect(response.status).toBe(200);
    expect(edges.put).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = edges.put.mock.calls[0] as [
      string,
      unknown,
      Record<string, unknown>,
    ];
    expect(pathname).toMatch(
      /^backups\/price-dashboard\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-[0-9a-f]{8}\.ndjson$/,
    );
    expect(body).toBeInstanceOf(ReadableStream);
    expect(options).toEqual({
      access: "private",
      addRandomSuffix: false,
      contentType: "application/x-ndjson",
      multipart: true,
    });
    expect(edges.list).toHaveBeenCalledWith({ prefix: PREFIX });
  });

  it("never calls Blob delete with an empty list, and deletes only its own expired pathnames", async () => {
    await routeModule.GET(authorized());
    expect(edges.del).not.toHaveBeenCalled();

    edges.list.mockResolvedValue({
      blobs: [
        {
          pathname: `${PREFIX}old.ndjson`,
          uploadedAt: new Date(NOW_MS - 20 * 24 * 60 * 60 * 1000),
        },
        { pathname: "backups/designs/old.ndjson", uploadedAt: new Date(0) },
        {
          pathname: "backups/price-dashboard-x/old.ndjson",
          uploadedAt: new Date(0),
        },
      ],
    });
    const response = await routeModule.GET(authorized());

    expect(edges.del).toHaveBeenCalledTimes(1);
    expect(edges.del).toHaveBeenCalledWith([`${PREFIX}old.ndjson`]);
    expect(
      (await response.json()) as { deletedPathnames: string[] },
    ).toMatchObject({
      deletedPathnames: [`${PREFIX}old.ndjson`],
    });
  });

  it("answers 503 with only the stable code when the row source rejects with the connection string, and logs only the class", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const rowSource = workingRowSource();
    rowSource.fetchAvailabilityHead.mockRejectedValue(
      Object.assign(
        new Error(`connect ECONNREFUSED ${DATABASE_URL} with ${BLOB_TOKEN}`),
        {
          name: "NeonDbError",
          cause: DATABASE_URL,
        },
      ),
    );
    edges.createRowSource.mockReturnValue(rowSource);

    const response = await routeModule.GET(authorized());

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      status: "export-failed",
      deletedPathnames: [],
      errorCode: "BACKUP_EXPORT_FAILED",
    });
    const everything = `${text}${JSON.stringify(consoleError.mock.calls)}`;
    for (const sentinel of SENTINELS)
      expect(everything).not.toContain(sentinel);
    expect(edges.list).not.toHaveBeenCalled();
    expect(edges.del).not.toHaveBeenCalled();
  });

  it("answers 503 and runs no rotation when the Blob put rejects with the token in its message", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    edges.put.mockRejectedValue(new Error(`401 invalid token ${BLOB_TOKEN}`));

    const response = await routeModule.GET(authorized());

    expect(response.status).toBe(503);
    const text = await response.text();
    for (const sentinel of SENTINELS) {
      expect(`${text}${JSON.stringify(consoleError.mock.calls)}`).not.toContain(
        sentinel,
      );
    }
    expect(edges.list).not.toHaveBeenCalled();
    expect(edges.del).not.toHaveBeenCalled();
  });

  it("answers 200 with the rotation-failed status, and no token, when the listing rejects after a good export", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    edges.list.mockRejectedValue(new Error(`list refused ${BLOB_TOKEN}`));

    const response = await routeModule.GET(authorized());

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      status: "rotation-failed",
      errorCode: "BACKUP_ROTATION_FAILED",
      rowCount: 2,
    });
    for (const sentinel of SENTINELS) {
      expect(`${text}${JSON.stringify(consoleError.mock.calls)}`).not.toContain(
        sentinel,
      );
    }
  });

  it("counts the two singleton records as the rowCount of an empty database", async () => {
    const response = await routeModule.GET(authorized());

    expect(await response.json()).toMatchObject({ status: "ok", rowCount: 2 });
  });
});

describe("vercel.json cron declaration", () => {
  const config = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../../../../../vercel.json"),
      "utf8",
    ),
  ) as { crons: { path: string; schedule: string }[] };

  it("schedules the backup daily at 03:45 UTC", () => {
    expect(config.crons).toContainEqual({
      path: "/api/cron/backup-price-dashboard",
      schedule: "45 3 * * *",
    });
  });

  it("gives every cron its own path and its own slot, so no two exports start together", () => {
    const paths = config.crons.map((cron) => cron.path);
    const schedules = config.crons.map((cron) => cron.schedule);

    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(schedules).size).toBe(schedules.length);
  });

  it("leaves the designs and presets backup cron entries as they were", () => {
    expect(config.crons).toContainEqual({
      path: "/api/cron/backup-designs",
      schedule: "0 3 * * *",
    });
    expect(config.crons).toContainEqual({
      path: "/api/cron/backup-presets",
      schedule: "15 3 * * *",
    });
  });
});
