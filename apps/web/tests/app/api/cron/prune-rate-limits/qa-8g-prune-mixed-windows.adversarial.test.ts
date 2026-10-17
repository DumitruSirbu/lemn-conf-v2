// The nightly prune through its route, on a table that holds day rows and hour rows together, as it does once
// reads and share writes are counted: a day's totals count the day's own rows alone, a row is removed by when its
// window ended and by nothing else, and an unauthorised call reads and removes nothing.
import type { RateLimitWindow } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chisinauDayOf } from "@/lib/server/rate-limit/chisinau-day";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

import { GET } from "../../../../../src/app/api/cron/prune-rate-limits/route";
import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
} from "../../../../lib/server/mail/mail-test-support";

const CRON_SECRET = "qa-cron-secret-5d81c0";
/** Half past three in the morning in Chisinau, in winter: 01:30 UTC. */
const NOW = new Date("2026-11-04T01:30:00.000Z");
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const YESTERDAY = chisinauDayOf(new Date(NOW.getTime() - 12 * HOUR_MS));
const TODAY = chisinauDayOf(NOW);
const A_COUNT_NO_DAY_ROW_HOLDS = 900;

let keysMade = 0;
function newKey(): string {
  keysMade += 1;
  return keysMade.toString(16).padStart(64, "5d81c0");
}

async function plant(window: RateLimitWindow, hits: number): Promise<void> {
  const bucket = { key: newKey(), window };
  for (let hit = 0; hit < hits; hit += 1) {
    await getRateLimitStore().recordHits([bucket]);
  }
}

function hourHolding(instantMs: number): RateLimitWindow {
  return utcWindowOf(new Date(instantMs), 60);
}

async function bucketsIn(window: RateLimitWindow): Promise<number> {
  return (await getRateLimitStore().totalsOfWindow(window, 1)).buckets;
}

function call(headers: Record<string, string>) {
  return GET(
    new NextRequest("https://lemnaria.test/api/cron/prune-rate-limits", {
      headers,
    }),
  );
}

const AUTHORISED = { authorization: `Bearer ${CRON_SECRET}` };

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

describe("a day's totals, on a table that also holds hour rows", () => {
  it("count the day's own three buckets and none of the hour rows inside that day or starting with it", async () => {
    const consoleSpies = spyOnEveryConsoleMethod();
    await plant(YESTERDAY, 1);
    await plant(YESTERDAY, 21);
    await plant(YESTERDAY, 25);
    for (let hour = 0; hour < 24; hour += 1) {
      await plant(
        hourHolding(YESTERDAY.startsAt.getTime() + hour * HOUR_MS),
        A_COUNT_NO_DAY_ROW_HOLDS,
      );
    }

    await call(AUTHORISED);

    const yesterdaysLine = consoleCallsOf(consoleSpies)
      .map(([, line]) => line as Record<string, unknown>)
      .find(({ date }) => date === "2026-11-03");
    expect(yesterdaysLine).toEqual({
      event: "rate-limit-day-totals",
      date: "2026-11-03",
      buckets: 3,
      aboveFigure: 2,
      largestCount: 25,
    });
  });
});

describe("what one night removes from a table of day rows and hour rows", () => {
  it("removes every hour row and day row whose window ended an hour ago or more, and no other", async () => {
    spyOnEveryConsoleMethod();
    const endedLongAgo = [
      YESTERDAY,
      hourHolding(NOW.getTime() - 30 * HOUR_MS),
      hourHolding(NOW.getTime() - 3 * HOUR_MS),
      hourHolding(NOW.getTime() - 61 * MINUTE_MS - 30 * MINUTE_MS),
    ];
    const mustStay = [
      TODAY,
      hourHolding(NOW.getTime()),
      hourHolding(NOW.getTime() - 31 * MINUTE_MS),
      hourHolding(NOW.getTime() + 5 * HOUR_MS),
    ];
    for (const window of [...endedLongAgo, ...mustStay]) await plant(window, 2);

    const response = await call(AUTHORISED);

    const gone = [];
    for (const window of endedLongAgo) gone.push(await bucketsIn(window));
    const stayed = [];
    for (const window of mustStay) stayed.push(await bucketsIn(window));
    expect(await response.json()).toEqual({
      status: "ok",
      removedAtLeast: endedLongAgo.length,
    });
    expect(gone).toEqual([0, 0, 0, 0]);
    expect(stayed).toEqual([1, 1, 1, 1]);
  });

  it("keeps the hour that ended half an hour ago although the day it lies in ended and is removed", async () => {
    spyOnEveryConsoleMethod();
    vi.setSystemTime(new Date(YESTERDAY.endsAt.getTime() + 90 * MINUTE_MS));
    const lastHourOfTheDay = hourHolding(YESTERDAY.endsAt.getTime() - 1);
    const hourAfterMidnight = hourHolding(YESTERDAY.endsAt.getTime());
    for (const window of [YESTERDAY, lastHourOfTheDay, hourAfterMidnight]) {
      await plant(window, 1);
    }

    await call(AUTHORISED);

    expect(await bucketsIn(YESTERDAY)).toBe(0);
    expect(await bucketsIn(lastHourOfTheDay)).toBe(0);
    expect(await bucketsIn(hourAfterMidnight)).toBe(1);
  });
});

describe("a call that does not hold the secret", () => {
  it.each([
    ["no header", {}],
    ["the secret without its scheme", { authorization: CRON_SECRET }],
    ["the secret in a query's place", { "x-cron-secret": CRON_SECRET }],
    [
      "the secret and a trailing space",
      { authorization: `Bearer ${CRON_SECRET} x` },
    ],
  ])("reads no total and removes no row, with %s", async (_label, headers) => {
    const consoleSpies = spyOnEveryConsoleMethod();
    await plant(hourHolding(NOW.getTime() - 30 * HOUR_MS), 1);
    const store = getRateLimitStore();
    const pruned = vi.spyOn(store, "pruneExpired");
    const totalled = vi.spyOn(store, "totalsOfWindow");

    const response = await call(headers);

    expect(response.status).toBe(401);
    expect(pruned).not.toHaveBeenCalled();
    expect(totalled).not.toHaveBeenCalled();
    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });
});
