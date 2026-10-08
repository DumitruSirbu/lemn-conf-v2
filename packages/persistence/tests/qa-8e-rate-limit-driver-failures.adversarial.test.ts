import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeRateLimitStore } from "../src/fake-rate-limit-store.js";
import {
  NeonRateLimitStore,
  RateLimitStoreError,
  RateLimitWindowConflictError,
} from "../src/rate-limit-store.js";
import type { RateLimitBucket } from "../src/rate-limit-store.js";
import { NOT_A_DIGEST } from "./support/qa-8e-not-a-digest.js";
import {
  FAKE_HOST,
  FAKE_MARKERS,
  FAKE_PASSWORD,
  FAKE_USER,
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

/**
 * Adversarial QA of M8 wave 8E, criteria 3, 6 and 8, with the driver replaced: every shape a driver can fail or
 * answer in must leave as `RateLimitStoreError` and never as a count, carrying nothing the driver threw.
 */
const driver = vi.hoisted(
  (): {
    statements: { text: string; values: readonly unknown[] }[];
    replies: (() => unknown)[];
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
const LEAKING_TEXT = `postgres://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/db`;
const ATTEMPTS_IN_THE_RETRY_BUDGET = 3;
const LONGER_THAN_EVERY_BACKOFF_MS = 5_000;

function answerWith(rows: unknown): void {
  driver.replies.push(() => Promise.resolve(rows));
}

function failWith(error: unknown): void {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a driver may reject with anything.
  driver.replies.push(() => Promise.reject(error));
}

function throwSynchronously(error: unknown): void {
  driver.replies.push(() => {
    throw error;
  });
}

function hitRow(key: string, hits: unknown): object {
  return { bucket_key: key, window_start: WINDOW_START, hits };
}

function coldStartRefusal(): NeonDbError {
  return new NeonDbError(
    'Server error (HTTP status 500): {"message":"Couldn\'t connect to compute node","neon:retryable":true}',
  );
}

function emptyReply(): SyntaxError {
  return new SyntaxError("Unexpected end of JSON input");
}

function errorWithLeakingGetters(): Error {
  const error = new Error(LEAKING_TEXT);
  Object.defineProperty(error, "code", {
    get: () => {
      throw new Error(LEAKING_TEXT);
    },
  });
  return error;
}

async function outcomeOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    return { resolvedWith: await pending };
  } catch (error) {
    return error;
  }
}

async function settleThroughEveryBackoff(
  pending: Promise<unknown>,
): Promise<unknown> {
  const outcome = outcomeOf(pending);
  await vi.advanceTimersByTimeAsync(LONGER_THAN_EVERY_BACKOFF_MS);
  return outcome;
}

function newStore(): NeonRateLimitStore {
  return new NeonRateLimitStore(WELL_FORMED_UNREACHABLE_VALUE);
}

beforeEach(() => {
  driver.statements.length = 0;
  driver.replies.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const FAILURE_SHAPES: readonly [string, () => unknown][] = [
  ["a string holding the connection string", () => LEAKING_TEXT],
  ["null", () => null],
  ["undefined", () => undefined],
  ["a number", () => 42],
  ["a plain object holding the password", () => ({ message: LEAKING_TEXT })],
  [
    "a fetch failure whose cause holds the host",
    () => new TypeError("fetch failed", { cause: new Error(LEAKING_TEXT) }),
  ],
  [
    "a driver error that is not retryable",
    () =>
      new NeonDbError(
        `Server error (HTTP status 500): {"neon:retryable":false} ${LEAKING_TEXT}`,
      ),
  ],
  [
    "a rejected fetch as the driver wraps it",
    () => new NeonDbError(`Error connecting to database: ${LEAKING_TEXT}`),
  ],
  [
    "a reply cut mid-body",
    () => Object.assign(new TypeError("terminated"), { url: LEAKING_TEXT }),
  ],
  [
    "an error whose name is the connection string",
    () => Object.assign(new Error("clean"), { name: LEAKING_TEXT }),
  ],
  [
    "an error whose code is the connection string",
    () => Object.assign(new Error("clean"), { code: LEAKING_TEXT }),
  ],
  ["an error whose code getter throws", errorWithLeakingGetters],
  [
    "a deadlock the database resolved by refusing this statement",
    () =>
      Object.assign(new NeonDbError("deadlock detected"), { code: "40P01" }),
  ],
  [
    "an integer overflow of the count",
    () =>
      Object.assign(new NeonDbError("integer out of range"), { code: "22003" }),
  ],
];

describe("QA 8E: every driver failure is the typed error, never a count, and carries nothing the driver threw", () => {
  describe.each(FAILURE_SHAPES)("%s", (_label, buildFailure) => {
    it.each([
      ["rejected", failWith],
      ["thrown before a promise exists", throwSynchronously],
    ])("on a hit, %s", async (_how, fail) => {
      fail(buildFailure());

      const outcome = await settleThroughEveryBackoff(
        newStore().recordHits(BUCKETS),
      );

      expect(outcome).toBeInstanceOf(RateLimitStoreError);
      expect((outcome as RateLimitStoreError).operation).toBe("record hits");
      expect(markersFoundOn(outcome)).toEqual([]);
      expect(driver.statements).toHaveLength(1);
    });

    it("on a prune", async () => {
      failWith(buildFailure());

      const outcome = await settleThroughEveryBackoff(
        newStore().pruneExpired(WINDOW_END),
      );

      expect(outcome).toBeInstanceOf(RateLimitStoreError);
      expect((outcome as RateLimitStoreError).operation).toBe(
        "prune expired windows",
      );
      expect(markersFoundOn(outcome)).toEqual([]);
    });
  });

  it("keeps a cause of a name and at most a code, and no other property of the failure", async () => {
    failWith(
      Object.assign(new NeonDbError(LEAKING_TEXT), {
        code: "42501",
        detail: LEAKING_TEXT,
        sourceError: new Error(LEAKING_TEXT),
      }),
    );

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect((outcome as Error).cause).toEqual({
      name: "NeonDbError",
      code: "42501",
    });
    expect(Reflect.ownKeys((outcome as Error).cause as object).sort()).toEqual([
      "code",
      "name",
    ]);
  });

  it("says nothing of the keys or the windows in its message", async () => {
    failWith(new Error("boom"));

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(markersFoundOn(outcome, [FIRST_KEY, SECOND_KEY])).toEqual([]);
  });
});

describe("QA 8E: the retry budget", () => {
  it("gives up on a hit after three cold-start refusals, as the typed error", async () => {
    for (let attempt = 0; attempt < ATTEMPTS_IN_THE_RETRY_BUDGET; attempt += 1)
      failWith(coldStartRefusal());
    answerWith([hitRow(FIRST_KEY, 9), hitRow(SECOND_KEY, 9)]);

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(outcome).toBeInstanceOf(RateLimitStoreError);
    expect((outcome as Error).cause).toEqual({ name: "NeonDbError" });
    expect(driver.statements).toHaveLength(ATTEMPTS_IN_THE_RETRY_BUDGET);
  });

  it("does not repeat a hit whose retry, after a cold start, got an empty reply", async () => {
    failWith(coldStartRefusal());
    failWith(emptyReply());
    answerWith([hitRow(FIRST_KEY, 2), hitRow(SECOND_KEY, 2)]);

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(outcome).toBeInstanceOf(RateLimitStoreError);
    expect(driver.statements).toHaveLength(2);
  });

  it("does not repeat a hit on an empty reply built in another realm", async () => {
    const foreign = Object.create(Error.prototype) as Error;
    Object.defineProperties(foreign, {
      name: { value: "SyntaxError" },
      message: { value: "Unexpected end of JSON input" },
    });
    failWith(foreign);
    answerWith([hitRow(FIRST_KEY, 2), hitRow(SECOND_KEY, 2)]);

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(outcome).toBeInstanceOf(RateLimitStoreError);
    expect(driver.statements).toHaveLength(1);
  });

  it("gives up on a prune after three empty replies, as the typed error", async () => {
    for (let attempt = 0; attempt < ATTEMPTS_IN_THE_RETRY_BUDGET; attempt += 1)
      failWith(emptyReply());
    answerWith([{ removed: 4 }]);

    const outcome = await settleThroughEveryBackoff(
      newStore().pruneExpired(WINDOW_END),
    );

    expect(outcome).toBeInstanceOf(RateLimitStoreError);
    expect(driver.statements).toHaveLength(ATTEMPTS_IN_THE_RETRY_BUDGET);
  });
});

const WINDOW_CHECK = "rate_limit_counters_window_is_not_empty";

function checkViolation(fields: Record<string, unknown>): NeonDbError {
  return Object.assign(new NeonDbError(LEAKING_TEXT), fields);
}

describe("QA 8E criterion 10: only the table's window check, as the driver reports it, is a window conflict", () => {
  it("is the conflict error, with no cause and nothing the driver threw, and is not repeated", async () => {
    failWith(
      checkViolation({
        code: "23514",
        constraint: WINDOW_CHECK,
        detail: `Failing row contains (${FIRST_KEY}, ${LEAKING_TEXT}).`,
      }),
    );

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(outcome).toBeInstanceOf(RateLimitWindowConflictError);
    expect((outcome as Error).cause).toBeUndefined();
    expect(markersFoundOn(outcome)).toEqual([]);
    expect(markersFoundOn(outcome, [FIRST_KEY, SECOND_KEY, "2026"])).toEqual(
      [],
    );
    expect(driver.statements).toHaveLength(1);
  });

  it("is the conflict error when it answers the repeat of a hit a cold start refused", async () => {
    failWith(coldStartRefusal());
    failWith(checkViolation({ code: "23514", constraint: WINDOW_CHECK }));

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(outcome).toBeInstanceOf(RateLimitWindowConflictError);
    expect(driver.statements).toHaveLength(2);
  });

  it.each([
    [
      "the count's check",
      { code: "23514", constraint: "rate_limit_counters_hits_is_positive" },
    ],
    [
      "the key's check",
      { code: "23514", constraint: "rate_limit_counters_bucket_key_is_sha256" },
    ],
    ["a check violation naming no constraint", { code: "23514" }],
    [
      "a check violation whose constraint is not text",
      { code: "23514", constraint: { name: WINDOW_CHECK } },
    ],
    [
      "another table's check of a longer name",
      { code: "23514", constraint: `other_${WINDOW_CHECK}` },
    ],
    [
      "the window check's name in another case",
      { code: "23514", constraint: WINDOW_CHECK.toUpperCase() },
    ],
    [
      "a unique violation naming the window check",
      { code: "23505", constraint: WINDOW_CHECK },
    ],
    [
      "the window check named only in the message",
      { code: "23514", message: WINDOW_CHECK },
    ],
  ])("%s is the store's error, not a conflict", async (_label, fields) => {
    failWith(checkViolation(fields));

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(outcome).toBeInstanceOf(RateLimitStoreError);
    expect(outcome).not.toBeInstanceOf(RateLimitWindowConflictError);
  });

  it("takes a window check violation that is not the driver's own error as the store's error", async () => {
    failWith(
      Object.assign(new Error("lookalike"), {
        code: "23514",
        constraint: WINDOW_CHECK,
      }),
    );

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(outcome).toBeInstanceOf(RateLimitStoreError);
  });
});

const WRONG_WINDOW_ROW = {
  bucket_key: FIRST_KEY,
  window_start: WINDOW_END,
  hits: 1,
};

const UNTRUSTWORTHY_HIT_REPLIES: readonly [string, unknown][] = [
  ["a bigint count", [hitRow(FIRST_KEY, 3n), hitRow(SECOND_KEY, 1)]],
  ["a count as text", [hitRow(FIRST_KEY, "3"), hitRow(SECOND_KEY, 1)]],
  ["a negative count", [hitRow(FIRST_KEY, -1), hitRow(SECOND_KEY, 1)]],
  ["NaN", [hitRow(FIRST_KEY, Number.NaN), hitRow(SECOND_KEY, 1)]],
  ["Infinity", [hitRow(FIRST_KEY, Infinity), hitRow(SECOND_KEY, 1)]],
  ["a count that is true", [hitRow(FIRST_KEY, true), hitRow(SECOND_KEY, 1)]],
  ["a count in an array", [hitRow(FIRST_KEY, [3]), hitRow(SECOND_KEY, 1)]],
  ["a count that is undefined", [hitRow(FIRST_KEY, undefined)]],
  [
    "the right key in another window",
    [WRONG_WINDOW_ROW, hitRow(SECOND_KEY, 1)],
  ],
  [
    "a window start that is not a date",
    [
      { bucket_key: FIRST_KEY, window_start: "not a date", hits: 1 },
      hitRow(SECOND_KEY, 1),
    ],
  ],
  ["null", null],
  ["undefined", undefined],
  ["a number", 2],
  ["text", "2"],
  ["a row that is null", [null, hitRow(SECOND_KEY, 1)]],
  ["a row that is a number", [7, hitRow(SECOND_KEY, 1)]],
  ["a row that is undefined", [undefined, hitRow(SECOND_KEY, 1)]],
];

describe("QA 8E: a reply that is not a count for every bucket is the typed error", () => {
  it.each(UNTRUSTWORTHY_HIT_REPLIES)("on a hit: %s", async (_label, reply) => {
    answerWith(reply);

    const outcome = await settleThroughEveryBackoff(
      newStore().recordHits(BUCKETS),
    );

    expect(outcome).toBeInstanceOf(RateLimitStoreError);
  });

  it.each([
    ["a bigint", [{ removed: 3n }]],
    ["text", [{ removed: "3" }]],
    ["a negative number", [{ removed: -1 }]],
    ["a fraction", [{ removed: 0.5 }]],
    ["NaN", [{ removed: Number.NaN }]],
    ["no rows", []],
    ["a row that is null", [null]],
    ["null", null],
    ["a bare number", 3],
  ])("on a prune: %s", async (_label, reply) => {
    answerWith(reply);

    const outcome = await settleThroughEveryBackoff(
      newStore().pruneExpired(WINDOW_END),
    );

    expect(outcome).toBeInstanceOf(RateLimitStoreError);
  });

  it("takes the largest count Postgres's integer column can hold as a count", async () => {
    answerWith([hitRow(FIRST_KEY, 2_147_483_647), hitRow(SECOND_KEY, 1)]);

    expect(await newStore().recordHits(BUCKETS)).toEqual([2_147_483_647, 1]);
  });
});

describe("QA 8E: one request is one statement, whatever its size", () => {
  it.each([1, 2, 500])("for %i buckets", async (bucketCount) => {
    const buckets = Array.from({ length: bucketCount }, (_unused, index) => ({
      key: index.toString(16).padStart(64, "0"),
      window: WINDOW,
    }));
    answerWith(buckets.map((bucket) => hitRow(bucket.key, 1)));

    const counts = await newStore().recordHits(buckets);

    expect(counts).toHaveLength(bucketCount);
    expect(driver.statements).toHaveLength(1);
  });

  it("sends one statement for one key in several windows, and tells their counts apart", async () => {
    const nextWindow = {
      startsAt: WINDOW_END,
      endsAt: new Date(WINDOW_END.getTime() + 3_600_000),
    };
    answerWith([
      { bucket_key: FIRST_KEY, window_start: WINDOW_END, hits: 1 },
      { bucket_key: FIRST_KEY, window_start: WINDOW_START, hits: 7 },
    ]);

    const counts = await newStore().recordHits([
      { key: FIRST_KEY, window: WINDOW },
      { key: FIRST_KEY, window: nextWindow },
    ]);

    expect(counts).toEqual([7, 1]);
    expect(driver.statements).toHaveLength(1);
  });
});

describe("QA 8E: a key that is not a digest is refused before any statement, by both stores", () => {
  it.each(NOT_A_DIGEST)("%s", async (_label, key) => {
    vi.useRealTimers();
    const request = [{ key, window: WINDOW }];

    const neonOutcome = await outcomeOf(newStore().recordHits(request));
    const fakeOutcome = await outcomeOf(
      new FakeRateLimitStore().recordHits(request),
    );

    expect(neonOutcome).toBeInstanceOf(Error);
    expect(fakeOutcome).toBeInstanceOf(Error);
    expect(driver.statements).toHaveLength(0);
    expect(markersFoundOn(neonOutcome, [key].filter(Boolean))).toEqual([]);
  });

  it("names no connection marker when the store is built on a value the opener refuses", () => {
    let thrown: unknown;
    try {
      new NeonRateLimitStore(`${FAKE_PASSWORD} ${FAKE_HOST} not a url`);
    } catch (error) {
      thrown = error;
    }

    expect(markersFoundOn(thrown, FAKE_MARKERS)).toEqual([]);
  });
});
