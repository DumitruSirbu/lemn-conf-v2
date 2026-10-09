import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteRateLimitCountersForTests } from "../src/delete-rate-limit-counters-for-tests.js";
import { runMigrations } from "../src/migrate.js";
import { NeonRateLimitStore } from "../src/neon-rate-limit-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { COUNTER_DELETE_SUITE_ERA } from "./support/rate-limit-test-eras.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes counter rows under random keys and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "deleteRateLimitCountersForTests (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const HOUR_MS = 3_600_000;
const FIRST_WINDOW = {
  startsAt: new Date(COUNTER_DELETE_SUITE_ERA.startsAtMs),
  endsAt: new Date(COUNTER_DELETE_SUITE_ERA.startsAtMs + HOUR_MS),
};
const SECOND_WINDOW = {
  startsAt: FIRST_WINDOW.endsAt,
  endsAt: new Date(FIRST_WINDOW.endsAt.getTime() + HOUR_MS),
};

const keysWritten: string[] = [];

function newKey(): string {
  const key = randomBytes(32).toString("hex");
  keysWritten.push(key);
  return key;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const sql = neon(liveTestDatabaseUrl);
  const store = () => new NeonRateLimitStore(liveTestDatabaseUrl);

  async function rowsOf(keys: readonly string[]): Promise<number> {
    const rows = await sql`
      select bucket_key from rate_limit_counters where bucket_key = any(${keys})
    `;
    return rows.length;
  }

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    await sql`delete from rate_limit_counters where bucket_key = any(${keysWritten})`;
  });

  it("removes the rows of the keys it is handed, in every window, and answers their counts", async () => {
    const handed = newKey();
    const counted = store();
    await counted.recordHits([{ key: handed, window: FIRST_WINDOW }]);
    await counted.recordHits([{ key: handed, window: FIRST_WINDOW }]);
    await counted.recordHits([{ key: handed, window: FIRST_WINDOW }]);
    await counted.recordHits([{ key: handed, window: SECOND_WINDOW }]);

    const removed = await deleteRateLimitCountersForTests([handed]);

    expect(removed.rowsRemoved).toBe(2);
    expect([...removed.counts].sort()).toEqual([1, 3]);
    expect(await rowsOf([handed])).toBe(0);
  });

  it("leaves every row whose key it was not handed", async () => {
    const handed = newKey();
    const kept = newKey();
    const other = newKey();
    const counted = store();
    await counted.recordHits([
      { key: handed, window: FIRST_WINDOW },
      { key: kept, window: FIRST_WINDOW },
      { key: other, window: SECOND_WINDOW },
    ]);

    const removed = await deleteRateLimitCountersForTests([handed]);

    expect(removed).toEqual({ rowsRemoved: 1, counts: [1] });
    expect(await rowsOf([kept, other])).toBe(2);
  });

  it("answers none for a key with no row, and none again for a key it already removed", async () => {
    const absent = newKey();
    const once = newKey();
    await store().recordHits([{ key: once, window: FIRST_WINDOW }]);

    expect(await deleteRateLimitCountersForTests([absent])).toEqual({
      rowsRemoved: 0,
      counts: [],
    });
    expect((await deleteRateLimitCountersForTests([once])).rowsRemoved).toBe(1);
    expect(await deleteRateLimitCountersForTests([once])).toEqual({
      rowsRemoved: 0,
      counts: [],
    });
  });

  it("removes several keys in one call and sums to the rows that held them", async () => {
    const keys = [newKey(), newKey(), newKey()];
    await store().recordHits(
      keys.map((key) => ({ key, window: FIRST_WINDOW })),
    );

    const removed = await deleteRateLimitCountersForTests(keys);

    expect(removed).toEqual({ rowsRemoved: 3, counts: [1, 1, 1] });
  });
});
