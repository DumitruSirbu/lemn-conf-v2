import { inspect } from "node:util";

import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonRateLimitStore } from "../src/neon-rate-limit-store.js";
import {
  RateLimitStoreError,
  RateLimitWindowConflictError,
} from "../src/rate-limit-store.js";
import type { RateLimitBucket } from "../src/rate-limit-store.js";
import {
  FAKE_HOST,
  FAKE_PASSWORD,
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

interface StatementSent {
  readonly text: string;
  readonly values: readonly unknown[];
}

const driver = vi.hoisted(
  (): {
    statements: StatementSent[];
    replies: (() => Promise<unknown>)[];
  } => ({ statements: [], replies: [] }),
);

vi.mock("@neondatabase/serverless", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  neon:
    () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      driver.statements.push({ text: strings.join("?"), values });
      const reply = driver.replies.shift();
      if (reply === undefined) throw new Error("the test queued no reply");
      return reply();
    },
}));

const FIRST_KEY = "a".repeat(64);
const SECOND_KEY = "b".repeat(64);
const WINDOW_START = new Date("2026-10-08T21:00:00.000Z");
const WINDOW_END = new Date("2026-10-09T21:00:00.000Z");
const WINDOW = { startsAt: WINDOW_START, endsAt: WINDOW_END };
const BUCKETS: readonly RateLimitBucket[] = [
  { key: FIRST_KEY, window: WINDOW },
  { key: SECOND_KEY, window: WINDOW },
];

const FIRST_BACKOFF_MS = 500;

function answerWith(rows: unknown): void {
  driver.replies.push(() => Promise.resolve(rows));
}

function failWith(error: unknown): void {
  driver.replies.push(() => Promise.reject(error as Error));
}

function hitRow(key: string, hits: unknown): object {
  return { bucket_key: key, window_start: WINDOW_START, hits };
}

function coldStartRefusal(): NeonDbError {
  return new NeonDbError(
    'Server error (HTTP status 500): {"message":"Couldn\'t connect to compute node","neon:retryable":true}',
  );
}

function checkViolation(constraint: string): NeonDbError {
  return Object.assign(
    new NeonDbError(
      `new row for relation "rate_limit_counters" violates check constraint "${constraint}"`,
    ),
    { code: "23514", constraint },
  );
}

function emptyReply(): SyntaxError {
  return new SyntaxError("Unexpected end of JSON input");
}

async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (error) {
    return error;
  }
  throw new Error("the call resolved");
}

function newStore(): NeonRateLimitStore {
  return new NeonRateLimitStore(WELL_FORMED_UNREACHABLE_VALUE);
}

beforeEach(() => {
  driver.statements.length = 0;
  driver.replies.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NeonRateLimitStore.recordHits", () => {
  it("writes every bucket of a request in one statement, in one round trip", async () => {
    answerWith([hitRow(FIRST_KEY, 4), hitRow(SECOND_KEY, 1)]);

    await newStore().recordHits(BUCKETS);

    expect(driver.statements).toHaveLength(1);
    expect(driver.statements[0]?.values).toEqual([
      [FIRST_KEY, SECOND_KEY],
      [WINDOW_START.toISOString(), WINDOW_START.toISOString()],
      [WINDOW_END.toISOString(), WINDOW_END.toISOString()],
    ]);
  });

  it("returns the counts in the request's order whatever order the database answers in", async () => {
    answerWith([hitRow(SECOND_KEY, 1), hitRow(FIRST_KEY, 4)]);

    const counts = await newStore().recordHits(BUCKETS);

    expect(counts).toEqual([4, 1]);
  });

  it("reads a window start the driver hands back as text as well as one it hands back as a date", async () => {
    answerWith([
      {
        bucket_key: FIRST_KEY,
        window_start: WINDOW_START.toISOString(),
        hits: 2,
      },
      hitRow(SECOND_KEY, 3),
    ]);

    expect(await newStore().recordHits(BUCKETS)).toEqual([2, 3]);
  });

  it("names the counters table and never the designs table", async () => {
    answerWith([hitRow(FIRST_KEY, 1), hitRow(SECOND_KEY, 1)]);

    await newStore().recordHits(BUCKETS);

    const text = driver.statements[0]?.text ?? "";
    expect(text).toContain("rate_limit_counters");
    expect(text).not.toMatch(/\bdesigns\b/);
  });

  it("locks rows in key order and counts from the one row of the bucket's own window", async () => {
    answerWith([hitRow(FIRST_KEY, 1), hitRow(SECOND_KEY, 1)]);

    await newStore().recordHits(BUCKETS);

    const text = driver.statements[0]?.text ?? "";
    expect(text).toMatch(/order by hit\.bucket_key, hit\.window_start/);
    expect(text).toMatch(/on conflict \(bucket_key, window_start\)/);
    expect(text).toMatch(/hits = counter\.hits \+ 1/);
  });

  it("refuses an invalid request before any statement is sent", async () => {
    const store = newStore();
    const invalid = [
      [{ key: "203.0.113.7", window: WINDOW }],
      [
        {
          key: FIRST_KEY,
          window: { startsAt: WINDOW_END, endsAt: WINDOW_START },
        },
      ],
      [BUCKETS[0], BUCKETS[0]] as RateLimitBucket[],
      [
        {
          key: FIRST_KEY,
          window: { startsAt: new Date(NaN), endsAt: WINDOW_END },
        },
      ],
    ];

    for (const request of invalid) {
      await expect(store.recordHits(request)).rejects.toThrow(/Refusing/);
    }

    expect(driver.statements).toHaveLength(0);
  });
});

describe("NeonRateLimitStore.recordHits when the database fails", () => {
  it("rejects with the typed error naming the operation, never with a count", async () => {
    failWith(Object.assign(new Error("permission denied"), { code: "42501" }));

    const error = await rejectionOf(newStore().recordHits(BUCKETS));

    expect(error).toBeInstanceOf(RateLimitStoreError);
    expect((error as RateLimitStoreError).operation).toBe("record hits");
    expect((error as Error).cause).toEqual({ name: "Error", code: "42501" });
  });

  it("keeps nothing of a failure that shows the host or the password", async () => {
    failWith(
      new Error(`fetch failed for https://${FAKE_HOST} with ${FAKE_PASSWORD}`),
    );

    const error = await rejectionOf(newStore().recordHits(BUCKETS));

    expect(error).toBeInstanceOf(RateLimitStoreError);
    expect(markersFoundOn(error)).toEqual([]);
  });

  it.each([
    ["a bucket missing from the reply", [hitRow(FIRST_KEY, 1)]],
    ["a count of zero", [hitRow(FIRST_KEY, 0), hitRow(SECOND_KEY, 1)]],
    ["a count that is text", [hitRow(FIRST_KEY, "3"), hitRow(SECOND_KEY, 1)]],
    ["a count that is null", [hitRow(FIRST_KEY, null), hitRow(SECOND_KEY, 1)]],
    ["a fractional count", [hitRow(FIRST_KEY, 1.5), hitRow(SECOND_KEY, 1)]],
    ["no rows at all", []],
    ["a row that is null", [null, hitRow(SECOND_KEY, 1)]],
    ["a row that is a number", [hitRow(FIRST_KEY, 1), 7]],
    ["a reply that is not a list of rows", { rows: [] }],
  ])("rejects with the typed error on %s", async (_label, reply) => {
    answerWith(reply);

    const error = await rejectionOf(newStore().recordHits(BUCKETS));

    expect(error).toBeInstanceOf(RateLimitStoreError);
  });

  it("rejects with its own named error when the table's window check refuses a different end, naming no key", async () => {
    failWith(checkViolation("rate_limit_counters_window_is_not_empty"));

    const error = await rejectionOf(newStore().recordHits(BUCKETS));

    expect(error).toBeInstanceOf(RateLimitWindowConflictError);
    expect(error).not.toBeInstanceOf(RateLimitStoreError);
    expect(inspect(error, { depth: null })).not.toContain(FIRST_KEY);
    expect((error as Error).cause).toBeUndefined();
  });

  it("states in the statement that a different end ends the row's window, so the table's check fails the whole statement", async () => {
    answerWith([hitRow(FIRST_KEY, 1), hitRow(SECOND_KEY, 1)]);

    await newStore().recordHits(BUCKETS);

    expect(driver.statements[0]?.text).toMatch(
      /when counter\.window_end = excluded\.window_end then counter\.window_end\s+else counter\.window_start/,
    );
  });

  it("does not repeat a hit after an empty reply, which may follow a hit that committed", async () => {
    failWith(emptyReply());
    answerWith([hitRow(FIRST_KEY, 2), hitRow(SECOND_KEY, 2)]);

    const error = await rejectionOf(newStore().recordHits(BUCKETS));

    expect(error).toBeInstanceOf(RateLimitStoreError);
    expect(driver.statements).toHaveLength(1);
    expect((error as Error).cause).toEqual({ name: "SyntaxError" });
  });

  it("repeats a hit the proxy refused for a suspended compute, so the first request after a sleep is not refused", async () => {
    vi.useFakeTimers();
    failWith(coldStartRefusal());
    answerWith([hitRow(FIRST_KEY, 1), hitRow(SECOND_KEY, 1)]);

    const pending = newStore().recordHits(BUCKETS);
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

    expect(await pending).toEqual([1, 1]);
    expect(driver.statements).toHaveLength(2);
  });
});

describe("NeonRateLimitStore.pruneExpired", () => {
  it("deletes from the counters table alone, up to the instant given", async () => {
    answerWith([{ removed: 3 }]);
    const now = new Date("2026-10-09T21:00:00.000Z");

    const removed = await newStore().pruneExpired(now);

    expect(removed).toBe(3);
    expect(driver.statements[0]?.values).toEqual([now.toISOString()]);
    expect(driver.statements[0]?.text).toContain("rate_limit_counters");
    expect(driver.statements[0]?.text).not.toMatch(/\bdesigns\b/);
  });

  it("locks the expired rows by key, then start, as a hit does, and skips none that is locked", async () => {
    answerWith([{ removed: 0 }]);

    await newStore().pruneExpired(WINDOW_END);

    const text = driver.statements[0]?.text ?? "";
    expect(text).toMatch(/order by bucket_key, window_start\s+for update/);
    expect(text).not.toMatch(/skip locked|nowait/);
  });

  it("reports nothing removed on the run after, and sends the same statement", async () => {
    answerWith([{ removed: 3 }]);
    answerWith([{ removed: 0 }]);
    const store = newStore();
    const now = new Date("2026-10-09T21:00:00.000Z");

    const runs = [await store.pruneExpired(now), await store.pruneExpired(now)];

    expect(runs).toEqual([3, 0]);
    expect(driver.statements[1]).toEqual(driver.statements[0]);
  });

  it("repeats a prune after an empty reply, because a delete run twice ends the same", async () => {
    vi.useFakeTimers();
    failWith(emptyReply());
    answerWith([{ removed: 2 }]);

    const pending = newStore().pruneExpired(WINDOW_END);
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

    expect(await pending).toBe(2);
    expect(driver.statements).toHaveLength(2);
  });

  it("rejects with the typed error when the database fails, and on a reply that is not a count", async () => {
    failWith(Object.assign(new Error("boom"), { code: "57P01" }));
    answerWith([{ removed: "many" }]);
    answerWith([null]);
    const store = newStore();

    const failed = await rejectionOf(store.pruneExpired(WINDOW_END));
    const malformed = await rejectionOf(store.pruneExpired(WINDOW_END));
    const nullRow = await rejectionOf(store.pruneExpired(WINDOW_END));

    expect([failed, malformed, nullRow]).toEqual([
      expect.any(RateLimitStoreError),
      expect.any(RateLimitStoreError),
      expect.any(RateLimitStoreError),
    ]);
    expect((failed as RateLimitStoreError).operation).toBe(
      "prune expired windows",
    );
    expect((failed as Error).cause).toEqual({ name: "Error", code: "57P01" });
  });

  it("refuses an invalid instant before any statement is sent", async () => {
    await expect(newStore().pruneExpired(new Date(NaN))).rejects.toThrow(
      /Refusing/,
    );

    expect(driver.statements).toHaveLength(0);
  });
});
