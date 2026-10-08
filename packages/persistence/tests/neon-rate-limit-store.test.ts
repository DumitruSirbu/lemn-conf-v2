import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonRateLimitStore } from "../src/rate-limit-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import {
  describeRateLimitStoreContract,
  hourWindowContaining,
} from "./support/rate-limit-store-contract.js";
import { CONTRACT_SUITE_ERA } from "./support/rate-limit-test-eras.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes counter rows under random keys and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonRateLimitStore (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const CONCURRENT_HITS = 20;
const HALF_A_DAY_MS = 12 * 3_600_000;
const SHARED_WINDOW = hourWindowContaining(
  CONTRACT_SUITE_ERA.startsAtMs + HALF_A_DAY_MS,
);

const keysWritten: string[] = [];

function newKey(): string {
  const key = randomBytes(32).toString("hex");
  keysWritten.push(key);
  return key;
}

function oneToN(n: number): number[] {
  return Array.from({ length: n }, (_unused, index) => index + 1);
}

function ascending(counts: readonly number[]): number[] {
  return [...counts].sort((left, right) => left - right);
}

describe.skipIf(!hasLiveDatabase)(SUITE_NAME, () => {
  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
  });

  afterAll(async () => {
    await neon(testDatabaseUrl)`
      delete from rate_limit_counters where bucket_key = any(${keysWritten})
    `;
  });

  describeRateLimitStoreContract({
    createStore: () => new NeonRateLimitStore(testDatabaseUrl),
    newKey,
  });

  describe("under concurrency", () => {
    it("returns the counts 1 to N exactly once each for N concurrent hits on one bucket and window", async () => {
      const store = new NeonRateLimitStore(testDatabaseUrl);
      const bucket = { key: newKey(), window: SHARED_WINDOW };

      const answers = await Promise.all(
        oneToN(CONCURRENT_HITS).map(() => store.recordHits([bucket])),
      );

      expect(ascending(answers.flat())).toEqual(oneToN(CONCURRENT_HITS));
    });

    it("loses no hit and deadlocks nowhere when requests list the same two buckets in opposite orders", async () => {
      const store = new NeonRateLimitStore(testDatabaseUrl);
      const first = { key: newKey(), window: SHARED_WINDOW };
      const second = { key: newKey(), window: SHARED_WINDOW };

      const requests = oneToN(CONCURRENT_HITS).map((request) => ({
        listsFirstBucketFirst: request % 2 === 0,
      }));
      const answers = await Promise.all(
        requests.map(({ listsFirstBucketFirst }) =>
          store.recordHits(
            listsFirstBucketFirst ? [first, second] : [second, first],
          ),
        ),
      );

      const firstCounts = answers.map((counts, index) =>
        requests[index]?.listsFirstBucketFirst ? counts[0] : counts[1],
      );
      const secondCounts = answers.map((counts, index) =>
        requests[index]?.listsFirstBucketFirst ? counts[1] : counts[0],
      );
      expect([
        ascending(firstCounts as number[]),
        ascending(secondCounts as number[]),
      ]).toEqual([oneToN(CONCURRENT_HITS), oneToN(CONCURRENT_HITS)]);
    });
  });

  describe("the table's own constraints, for a writer that is not this store", () => {
    async function insertRow(row: {
      key: string;
      hits: number;
      endsAt: Date;
    }): Promise<unknown> {
      return neon(testDatabaseUrl)`
        insert into rate_limit_counters (bucket_key, window_start, window_end, hits)
        values (${row.key}, ${SHARED_WINDOW.startsAt.toISOString()}, ${row.endsAt.toISOString()}, ${row.hits})
      `;
    }

    it.each([
      ["a raw IPv4 address", "203.0.113.7"],
      ["the empty string", ""],
      ["an uppercase digest", "A".repeat(64)],
      ["a digest one character short", "a".repeat(63)],
      ["a digest one character long", "a".repeat(65)],
      ["64 characters that are not hex", "g".repeat(64)],
    ])("refuses %s as a key", async (_label, key) => {
      await expect(
        insertRow({ key, hits: 1, endsAt: SHARED_WINDOW.endsAt }),
      ).rejects.toThrow(/rate_limit_counters_bucket_key_is_sha256/);
    });

    it("refuses a count below 1 and a window that ends where it starts", async () => {
      const key = newKey();

      await expect(
        insertRow({ key, hits: 0, endsAt: SHARED_WINDOW.endsAt }),
      ).rejects.toThrow(/rate_limit_counters_hits_is_positive/);
      await expect(
        insertRow({ key, hits: 1, endsAt: SHARED_WINDOW.startsAt }),
      ).rejects.toThrow(/rate_limit_counters_window_is_not_empty/);
    });
  });
});
