import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../../../../src/app/api/cron/prune-rate-limits/route";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

const CRON_SECRET = "cron-secret-for-tests-5513";
const NOW = new Date("2026-10-09T03:30:00.000Z");
const HOUR_MS = 3_600_000;
const URL_OF_THE_ROUTE = "https://example.test/api/cron/prune-rate-limits";

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return keyCounter.toString(16).padStart(64, "0");
}

function authorizedRequest(
  url = URL_OF_THE_ROUTE,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    headers: { authorization: `Bearer ${CRON_SECRET}`, ...headers },
  });
}

async function plantEndedHoursAgo(hoursAgo: number): Promise<void> {
  const window = utcWindowOf(new Date(NOW.getTime() - hoursAgo * HOUR_MS), 60);
  await getRateLimitStore().recordHits([{ key: newKey(), window }]);
}

function spiesOnTheConsole() {
  return {
    info: vi.spyOn(console, "info").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    log: vi.spyOn(console, "log").mockImplementation(() => undefined),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/prune-rate-limits: who may call it", () => {
  it.each([
    ["no authorization header", {}],
    ["the wrong secret", { authorization: "Bearer not-the-secret" }],
    ["the secret without its scheme", { authorization: CRON_SECRET }],
    ["an empty header", { authorization: "" }],
  ])("answers 401 for %s and touches nothing", async (_label, headers) => {
    const store = getRateLimitStore();
    const pruned = vi.spyOn(store, "pruneExpired");
    const totalled = vi.spyOn(store, "totalsOfWindow");

    const response = await GET(new NextRequest(URL_OF_THE_ROUTE, { headers }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(pruned).not.toHaveBeenCalled();
    expect(totalled).not.toHaveBeenCalled();
  });

  it("answers 401 for every caller when no secret is configured, even one that sends a bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const pruned = vi.spyOn(getRateLimitStore(), "pruneExpired");

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(401);
    expect(pruned).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/prune-rate-limits: the night's answer", () => {
  it("answers 200 with the rows removed as at least, and nothing else of the table", async () => {
    await plantEndedHoursAgo(40);
    await plantEndedHoursAgo(26);
    await plantEndedHoursAgo(3);
    spiesOnTheConsole();

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", removedAtLeast: 3 });
  });

  it("keeps a window that ended less than an hour ago and a live one", async () => {
    await plantEndedHoursAgo(0.5);
    const live = utcWindowOf(NOW, 60);
    const liveKey = newKey();
    await getRateLimitStore().recordHits([{ key: liveKey, window: live }]);
    spiesOnTheConsole();

    const response = await GET(authorizedRequest());

    expect(await response.json()).toEqual({ status: "ok", removedAtLeast: 0 });
    expect(
      await getRateLimitStore().recordHits([{ key: liveKey, window: live }]),
    ).toEqual([2]);
  });

  it("answers 200 and removes nothing on an empty table", async () => {
    spiesOnTheConsole();

    const response = await GET(authorizedRequest());

    expect(await response.json()).toEqual({ status: "ok", removedAtLeast: 0 });
  });

  it("steps from the server's clock and from nothing the request carries, however it is dressed", async () => {
    const pruned = vi.spyOn(getRateLimitStore(), "pruneExpired");
    spiesOnTheConsole();

    await GET(
      authorizedRequest(
        `${URL_OF_THE_ROUTE}?now=2030-01-01T00:00:00Z&cutoff=2030-01-01&instant=1`,
        {
          date: "Tue, 01 Jan 2030 00:00:00 GMT",
          "x-vercel-deployment-url": "2030-01-01",
          "x-now": "2030-01-01T00:00:00Z",
        },
      ),
    );

    const cutoffs = pruned.mock.calls.map(([cutoff]) => cutoff.getTime());
    expect(cutoffs).toHaveLength(25);
    expect(cutoffs[0]).toBe(NOW.getTime() - 25 * HOUR_MS);
    expect(cutoffs[24]).toBe(NOW.getTime() - HOUR_MS);
  });
});

describe("GET /api/cron/prune-rate-limits: a step that fails", () => {
  it("answers 503 with a code and the rows already removed, and keeps what the steps before removed", async () => {
    await plantEndedHoursAgo(40);
    const store = getRateLimitStore();
    const realPrune = store.pruneExpired.bind(store);
    let calls = 0;
    vi.spyOn(store, "pruneExpired").mockImplementation((cutoff) => {
      calls += 1;
      return calls === 3
        ? Promise.reject(new Error("postgres://user:ROUTE-MARKER-7702@host/db"))
        : realPrune(cutoff);
    });
    const console_ = spiesOnTheConsole();

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "failed",
      errorCode: "RATE_LIMIT_PRUNE_FAILED",
      removedAtLeast: 1,
    });
    expect(calls).toBe(3);
    expect(console_.error).toHaveBeenCalledTimes(1);
    expect(console_.error.mock.calls[0]).toEqual([
      "[rate-limit]",
      {
        event: "rate-limit-prune-failed",
        step: 5,
        stepCount: 27,
        removedAtLeast: 1,
      },
    ]);
  });

  it("answers 503 when the store cannot be made, with the failure written and nothing of it answered", async () => {
    vi.spyOn(getRateLimitStore(), "totalsOfWindow").mockRejectedValue(
      new Error("DATABASE_URL=postgres://user:ROUTE-MARKER-7702@host/db"),
    );
    const console_ = spiesOnTheConsole();

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(
      /MARKER|postgres/,
    );
    expect(JSON.stringify(console_.error.mock.calls)).not.toMatch(
      /MARKER|postgres/,
    );
  });
});

describe("GET /api/cron/prune-rate-limits: what it writes", () => {
  it("writes one line for each of the two days, a date and three counts under its label alone", async () => {
    const console_ = spiesOnTheConsole();

    await GET(authorizedRequest());

    expect(console_.info.mock.calls).toEqual([
      [
        "[rate-limit]",
        {
          event: "rate-limit-day-totals",
          date: "2026-10-07",
          buckets: 0,
          aboveFigure: 0,
          largestCount: 0,
        },
      ],
      [
        "[rate-limit]",
        {
          event: "rate-limit-day-totals",
          date: "2026-10-08",
          buckets: 0,
          aboveFigure: 0,
          largestCount: 0,
        },
      ],
    ]);
    expect(console_.error).not.toHaveBeenCalled();
    expect(console_.warn).not.toHaveBeenCalled();
    expect(console_.log).not.toHaveBeenCalled();
  });

  it("holds no secret and no key in anything it writes or answers", async () => {
    await plantEndedHoursAgo(40);
    const console_ = spiesOnTheConsole();

    const response = await GET(authorizedRequest());

    const everything = JSON.stringify([
      await response.json(),
      console_.info.mock.calls,
      console_.error.mock.calls,
    ]);
    expect(everything).not.toContain(CRON_SECRET);
    expect(everything).not.toMatch(/[0-9a-f]{64}/);
  });

  it("still answers when the transport throws", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("the transport is down");
    });

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
  });
});

describe("the schedule in vercel.json", () => {
  const configuration = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../../../../../vercel.json"),
      "utf8",
    ),
  ) as { crons: { path: string; schedule: string }[] };

  it("keeps the backup's entry first and as it was, then adds the prune's at half past three", () => {
    expect(configuration.crons).toEqual([
      { path: "/api/cron/backup-designs", schedule: "0 3 * * *" },
      { path: "/api/cron/prune-rate-limits", schedule: "30 3 * * *" },
    ]);
  });

  it("names a route that exists for every entry", () => {
    for (const { path } of configuration.crons) {
      expect(
        existsSync(
          join(import.meta.dirname, "../../../../../src/app", path, "route.ts"),
        ),
      ).toBe(true);
    }
  });
});
