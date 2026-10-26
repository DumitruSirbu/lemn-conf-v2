import { randomBytes } from "node:crypto";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteRateLimitCountersForTests } from "../src/delete-rate-limit-counters-for-tests.js";
import { runMigrations } from "../src/migrate.js";
import { NeonRateLimitStore } from "../src/neon-rate-limit-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { TOTALS_SUITE_ERA } from "./support/rate-limit-test-eras.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes counter rows under random keys and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonRateLimitStore.totalsOfWindow (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const HOUR_MS = 3_600_000;
const FIGURE = 3;
const FIRST_HOUR = {
  startsAt: new Date(TOTALS_SUITE_ERA.startsAtMs),
  endsAt: new Date(TOTALS_SUITE_ERA.startsAtMs + HOUR_MS),
};
const SECOND_HOUR = {
  startsAt: FIRST_HOUR.endsAt,
  endsAt: new Date(FIRST_HOUR.endsAt.getTime() + HOUR_MS),
};
/** A window of another length that starts where the first hour does, in the same table. */
const DAY_FROM_THE_FIRST_HOUR = {
  startsAt: FIRST_HOUR.startsAt,
  endsAt: new Date(FIRST_HOUR.startsAt.getTime() + 24 * HOUR_MS),
};

const keysWritten: string[] = [];
let rowsPlanted = 0;
let rowsRemovedByATest = 0;

function newKey(): string {
  const key = randomBytes(32).toString("hex");
  keysWritten.push(key);
  return key;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  // Opened in `beforeAll`: a skipped suite's body still runs, and with no database configured the URL is empty.
  let sql: NeonQueryFunction<false, false>;
  let store: NeonRateLimitStore;

  async function plant(
    window: typeof FIRST_HOUR,
    hits: number,
  ): Promise<string> {
    const key = newKey();
    for (let hit = 0; hit < hits; hit += 1) {
      await store.recordHits([{ key, window }]);
    }
    rowsPlanted += 1;
    return key;
  }

  async function rowsOf(keys: readonly string[]): Promise<number> {
    const rows = await sql`
      select bucket_key from rate_limit_counters where bucket_key = any(${keys})
    `;
    return rows.length;
  }

  // Every assertion is a difference from a reading taken first, so a row an interrupted run of this file left in its
  // era cannot move it.
  async function readingOf(window: typeof FIRST_HOUR) {
    return store.totalsOfWindow(window, FIGURE);
  }

  beforeAll(async () => {
    sql = neon(liveTestDatabaseUrl);
    store = new NeonRateLimitStore(liveTestDatabaseUrl);
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    const removed = await deleteRateLimitCountersForTests(keysWritten);

    expect(removed.rowsRemoved).toBe(rowsPlanted - rowsRemovedByATest);
  });

  it("reads one window's three numbers from rows planted in two windows", async () => {
    const [firstBefore, secondBefore] = [
      await readingOf(FIRST_HOUR),
      await readingOf(SECOND_HOUR),
    ];
    await plant(FIRST_HOUR, 1);
    await plant(FIRST_HOUR, FIGURE);
    await plant(FIRST_HOUR, FIGURE + 4);
    await plant(SECOND_HOUR, FIGURE + 9);

    const first = await readingOf(FIRST_HOUR);
    const second = await readingOf(SECOND_HOUR);

    expect(first.buckets - firstBefore.buckets).toBe(3);
    expect(first.aboveFigure - firstBefore.aboveFigure).toBe(1);
    expect(first.largestCount).toBe(
      Math.max(firstBefore.largestCount, FIGURE + 4),
    );
    expect(second.buckets - secondBefore.buckets).toBe(1);
    expect(second.aboveFigure - secondBefore.aboveFigure).toBe(1);
    expect(second.largestCount).toBe(
      Math.max(secondBefore.largestCount, FIGURE + 9),
    );
  });

  it("holds out a window of another length that starts where the hour does", async () => {
    const hourBefore = await readingOf(FIRST_HOUR);
    const dayBefore = await readingOf(DAY_FROM_THE_FIRST_HOUR);
    await plant(DAY_FROM_THE_FIRST_HOUR, FIGURE + 20);

    const hour = await readingOf(FIRST_HOUR);
    const day = await readingOf(DAY_FROM_THE_FIRST_HOUR);

    expect(hour).toEqual(hourBefore);
    expect(day.buckets - dayBefore.buckets).toBe(1);
    expect(day.aboveFigure - dayBefore.aboveFigure).toBe(1);
  });

  it("reads and writes nothing: the same reading twice, and the planted rows as they were", async () => {
    const planted = [await plant(FIRST_HOUR, 2), await plant(SECOND_HOUR, 2)];
    const rowsBefore = await rowsOf(planted);

    const once = await readingOf(FIRST_HOUR);
    const twice = await readingOf(FIRST_HOUR);

    expect(twice).toEqual(once);
    expect(await rowsOf(planted)).toBe(rowsBefore);
    expect(
      await store.recordHits([{ key: planted[0] ?? "", window: FIRST_HOUR }]),
    ).toEqual([3]);
  });

  it("is undone by the test-only delete of its own keys, which reports its rows and leaves the rest", async () => {
    const planted = [await plant(FIRST_HOUR, 1), await plant(FIRST_HOUR, 2)];
    const bystander = await plant(SECOND_HOUR, 1);
    const before = await readingOf(FIRST_HOUR);

    const removed = await deleteRateLimitCountersForTests(planted);

    rowsRemovedByATest += removed.rowsRemoved;
    expect(removed.rowsRemoved).toBe(2);
    expect([...removed.counts].sort()).toEqual([1, 2]);
    expect((await readingOf(FIRST_HOUR)).buckets).toBe(before.buckets - 2);
    expect(await rowsOf([bystander])).toBe(1);
  });
});
