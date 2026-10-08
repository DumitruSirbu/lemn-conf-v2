import { randomBytes } from "node:crypto";

import { neon, neonConfig } from "@neondatabase/serverless";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { runMigrations } from "../src/migrate.js";
import {
  NeonRateLimitStore,
  RateLimitStoreError,
  RateLimitWindowConflictError,
} from "../src/rate-limit-store.js";
import type {
  RateLimitBucket,
  RateLimitWindow,
} from "../src/rate-limit-store.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { loseTheFirstReply } from "./support/lose-the-first-reply.js";
import type { LossPoint, LostReply } from "./support/lose-the-first-reply.js";
import { NOT_A_DIGEST } from "./support/qa-8e-not-a-digest.js";
import { hourWindowContaining } from "./support/rate-limit-store-contract.js";
import {
  CONTRACT_SUITE_ERA,
  QA_8E_ERA,
} from "./support/rate-limit-test-eras.js";
import {
  TABLE_PRIVILEGES_EVERY_SERVER_KNOWS,
  privilegesHeldOn,
  tablePrivilegesTheServerKnows,
} from "./support/table-privileges.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes counter rows under random keys and needs the schema intact while it does.
holdSharedTestSchemaLock();

/**
 * Adversarial QA of M8 wave 8E on the live test database: criteria 1, 2, 3, 4, 5, 8 and 9.
 *
 * Every window here lies in 1990, eleven years before the developer's contract suite's, and every prune is at an
 * instant in 1990. A prune therefore reaches only rows this file wrote, and its returned count can be asserted exactly.
 */
const SUITE_NAME = "QA 8E: NeonRateLimitStore (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const QA_ERA_START_MS = QA_8E_ERA.startsAtMs;
const QA_ERA_END_MS = QA_8E_ERA.endsAtMs;
const LARGEST_POSTGRES_INTEGER = 2_147_483_647;
const INTEGER_OUT_OF_RANGE = "22003";
const CONCURRENCY_TIMEOUT_MS = 120_000;
/** Stands in for a count a reply did not hold: no run of 1 to N contains it, so the comparison fails. */
const MISSING_COUNT = 0;
const RACE_ROUNDS = 3;
const SHARED_EXPIRED_ROWS = 150;
const RACING_HITS = 16;
const RACING_PRUNES = 8;
const END_RACE_ROUNDS = 6;
const END_RACE_CALLERS = 12;
const LONGER_LOSS_SEQUENCES = 12;
const LONGER_LOSS_SEQUENCE_LENGTH = 6;
const LOST_REPLY_TIMEOUT_MS = 480_000;

interface Loss {
  readonly reply: LostReply;
  readonly point: LossPoint;
}

type Step = Loss | "no loss";

interface StoredRow {
  bucket_key: string;
  window_start: Date;
  window_end: Date;
  hits: number;
}

const keysIssued: string[] = [];
let windowsIssued = 0;

function newKey(): string {
  const key = randomBytes(32).toString("hex");
  keysIssued.push(key);
  return key;
}

/** An hour window no earlier call returned, each a day after the last, so no test's prune reaches another's rows. */
function newHourWindow(): RateLimitWindow {
  windowsIssued += 1;
  const startsAtMs = QA_ERA_START_MS + windowsIssued * DAY_MS;
  if (startsAtMs + DAY_MS > QA_ERA_END_MS) {
    throw new Error("This file issued more windows than its era holds.");
  }
  return {
    startsAt: new Date(startsAtMs),
    endsAt: new Date(startsAtMs + HOUR_MS),
  };
}

function windowAfter(window: RateLimitWindow): RateLimitWindow {
  return {
    startsAt: window.endsAt,
    endsAt: new Date(window.endsAt.getTime() + HOUR_MS),
  };
}

function oneToN(n: number): number[] {
  return Array.from({ length: n }, (_unused, index) => index + 1);
}

function ascending(counts: readonly number[]): number[] {
  return [...counts].sort((left, right) => left - right);
}

/** Mulberry32: a fixed seed gives the same request orders on every run. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<Item>(items: readonly Item[], random: () => number): Item[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [
      result[other] as Item,
      result[index] as Item,
    ];
  }
  return result;
}

/** Postgres text cannot hold a NUL, so such a key can never be a row and cannot be named in a cleanup either. */
function isStorableText(key: string): boolean {
  return !key.includes("\u0000");
}

function rejectionsOf(
  settled: readonly PromiseSettledResult<unknown>[],
): unknown[] {
  return settled.flatMap((result) =>
    result.status === "rejected" ? [result.reason as unknown] : [],
  );
}

function causesOf(errors: readonly unknown[]): unknown[] {
  return errors.map((error) => (error as Error).cause ?? String(error));
}

async function outcomeOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    return { resolvedWith: await pending };
  } catch (error) {
    return error;
  }
}

describe.skipIf(!hasLiveDatabase)(SUITE_NAME, () => {
  const sql = hasLiveDatabase ? neon(liveTestDatabaseUrl) : undefined;
  const store = (): NeonRateLimitStore =>
    new NeonRateLimitStore(liveTestDatabaseUrl);

  async function storedRowsOf(keys: readonly string[]): Promise<StoredRow[]> {
    if (sql === undefined) throw new Error("no live test database");
    return (await sql`
      select bucket_key, window_start, window_end, hits
      from rate_limit_counters
      where bucket_key = any(${[...keys]})
      order by bucket_key, window_start
    `) as StoredRow[];
  }

  async function deleteIssuedRows(): Promise<void> {
    if (sql === undefined) throw new Error("no live test database");
    await sql`delete from rate_limit_counters where bucket_key = any(${keysIssued})`;
  }

  async function insertDirectly(row: {
    key: string;
    window: RateLimitWindow;
    hits: number;
  }): Promise<unknown> {
    if (sql === undefined) throw new Error("no live test database");
    return sql`
      insert into rate_limit_counters (bucket_key, window_start, window_end, hits)
      values (${row.key}, ${row.window.startsAt.toISOString()}, ${row.window.endsAt.toISOString()}, ${row.hits})
    `;
  }

  /**
   * A run that died before its cleanup leaves rows in this file's era, where a later run's exact prune counts would
   * include them. Their keys are read by that era, which `rate-limit-test-eras.ts` gives to this file alone, and the
   * rows go by those keys. It says how many went, so an interrupted run is seen and not healed in silence.
   */
  async function deleteRowsAnInterruptedRunLeft(): Promise<number> {
    if (sql === undefined) throw new Error("no live test database");
    const left = (await sql`
      select bucket_key
      from rate_limit_counters
      where window_start >= ${new Date(QA_ERA_START_MS).toISOString()}::timestamptz
        and window_start < ${new Date(QA_ERA_END_MS).toISOString()}::timestamptz
    `) as { bucket_key: string }[];
    const keys = left.map((row) => row.bucket_key);
    const removed = (await sql`
      delete from rate_limit_counters
      where bucket_key = any(${keys})
        and window_start >= ${new Date(QA_ERA_START_MS).toISOString()}::timestamptz
        and window_start < ${new Date(QA_ERA_END_MS).toISOString()}::timestamptz
      returning bucket_key
    `) as unknown[];
    return removed.length;
  }

  async function seedInDescendingKeyOrder(
    buckets: readonly RateLimitBucket[],
  ): Promise<void> {
    if (sql === undefined) throw new Error("no live test database");
    const keys = buckets.map((bucket) => bucket.key);
    const starts = buckets.map(({ window }) => window.startsAt.toISOString());
    const ends = buckets.map(({ window }) => window.endsAt.toISOString());
    await sql`
      insert into rate_limit_counters (bucket_key, window_start, window_end, hits)
      select seed.bucket_key, seed.window_start, seed.window_end, 1
      from unnest(${keys}::text[], ${starts}::timestamptz[], ${ends}::timestamptz[])
        as seed (bucket_key, window_start, window_end)
      order by seed.bucket_key desc
    `;
  }

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
    const removed = await deleteRowsAnInterruptedRunLeft();
    console.info(
      `[qa-8e] rows an interrupted run left in this file's era, removed before this run: ${String(removed)}`,
    );
  });

  afterEach(async () => {
    await deleteIssuedRows();
  });

  afterAll(async () => {
    await deleteIssuedRows();
    const left = await storedRowsOf(keysIssued);
    console.info(
      `[qa-8e] rows left in rate_limit_counters for the ${String(keysIssued.length)} keys this file issued: ${String(left.length)}`,
    );
    expect(left).toEqual([]);
  });

  describe("the eras the two live suites write in", () => {
    it("do not overlap, and the contract suite's first window starts its own era", () => {
      const contractFirstWindow = hourWindowContaining(
        CONTRACT_SUITE_ERA.startsAtMs,
      );

      expect(QA_8E_ERA.endsAtMs).toBeLessThanOrEqual(
        CONTRACT_SUITE_ERA.startsAtMs,
      );
      expect(contractFirstWindow.startsAt.getTime()).toBe(
        CONTRACT_SUITE_ERA.startsAtMs,
      );
    });
  });

  describe("criterion 1: no lost update, and no deadlock", () => {
    it(
      "returns 1 to 150 exactly once each for 150 concurrent hits on one bucket and window",
      async () => {
        const hits = 150;
        const bucket = { key: newKey(), window: newHourWindow() };
        const limiter = store();

        const answers = await Promise.all(
          oneToN(hits).map(() => limiter.recordHits([bucket])),
        );

        expect(ascending(answers.flat())).toEqual(oneToN(hits));
        expect(
          (await storedRowsOf([bucket.key])).map((row) => row.hits),
        ).toEqual([hits]);
      },
      CONCURRENCY_TIMEOUT_MS,
    );

    it(
      "gives each bucket 1 to k exactly once when 80 requests list overlapping subsets of six buckets in shuffled orders",
      async () => {
        const random = seededRandom(8);
        const window = newHourWindow();
        const buckets = oneToN(6).map(() => ({ key: newKey(), window }));
        const requests = oneToN(80).map(() =>
          shuffled(buckets, random).slice(0, 1 + Math.floor(random() * 6)),
        );
        const limiter = store();

        const settled = await Promise.allSettled(
          requests.map((request) => limiter.recordHits(request)),
        );

        expect(causesOf(rejectionsOf(settled))).toEqual([]);
        for (const bucket of buckets) {
          const counts = settled.flatMap((result, index) => {
            const position = (requests[index] ?? []).indexOf(bucket);
            if (result.status !== "fulfilled" || position < 0) return [];
            return [(result.value as number[])[position] ?? MISSING_COUNT];
          });
          const timesListed = requests.filter((request) =>
            request.includes(bucket),
          ).length;
          expect(ascending(counts)).toEqual(oneToN(timesListed));
        }
      },
      CONCURRENCY_TIMEOUT_MS,
    );

    it(
      "gives each window 1 to 30 when 30 requests list one key's four windows in opposite orders",
      async () => {
        const key = newKey();
        const first = newHourWindow();
        const windows = [first];
        for (let more = 0; more < 3; more += 1)
          windows.push(windowAfter(windows[windows.length - 1] ?? first));
        const forward = windows.map((window) => ({ key, window }));
        const backward = [...forward].reverse();
        const limiter = store();

        const answers = await Promise.all(
          oneToN(30).map((request) =>
            limiter
              .recordHits(request % 2 === 0 ? forward : backward)
              .then((counts) =>
                request % 2 === 0 ? [...counts] : [...counts].reverse(),
              ),
          ),
        );

        for (const position of [0, 1, 2, 3]) {
          expect(
            ascending(
              answers.map((counts) => counts[position] ?? MISSING_COUNT),
            ),
          ).toEqual(oneToN(30));
        }
      },
      CONCURRENCY_TIMEOUT_MS,
    );

    /**
     * The hit locks its rows by key. Rows seeded here in descending key order lie in the table in that order, which is
     * the order an unordered delete meets them in, so a prune and a hit over the same rows cross and one is refused
     * with a deadlock. Many shared rows per statement and several rounds make the crossing likely in every run.
     */
    it(
      "refuses no hit, and never touches a live window's count, while prunes of the expired rows race the hits",
      async () => {
        const limiter = store();
        const refusedHits: unknown[] = [];
        const refusedPrunes: unknown[] = [];
        const liveCountsOfEveryRound: number[][] = [];
        const expiredRowsLeft: StoredRow[] = [];
        const liveRows: StoredRow[] = [];

        for (let round = 0; round < RACE_ROUNDS; round += 1) {
          const expiredWindow = newHourWindow();
          const expired = oneToN(SHARED_EXPIRED_ROWS).map(() => ({
            key: newKey(),
            window: expiredWindow,
          }));
          const live = { key: newKey(), window: windowAfter(expiredWindow) };
          await seedInDescendingKeyOrder(expired);

          const [hits, prunes] = await Promise.all([
            Promise.allSettled(
              oneToN(RACING_HITS).map(() =>
                limiter.recordHits([live, ...expired]),
              ),
            ),
            Promise.allSettled(
              oneToN(RACING_PRUNES).map(() =>
                limiter.pruneExpired(expiredWindow.endsAt),
              ),
            ),
          ]);

          refusedHits.push(...causesOf(rejectionsOf(hits)));
          refusedPrunes.push(...causesOf(rejectionsOf(prunes)));
          await limiter.pruneExpired(expiredWindow.endsAt);
          expiredRowsLeft.push(
            ...(await storedRowsOf(expired.map(({ key }) => key))),
          );
          liveRows.push(...(await storedRowsOf([live.key])));
          liveCountsOfEveryRound.push(
            ascending(
              hits.flatMap((result) =>
                result.status === "fulfilled"
                  ? [(result.value as number[])[0] ?? MISSING_COUNT]
                  : [],
              ),
            ),
          );
        }

        expect(refusedHits).toEqual([]);
        expect(refusedPrunes).toEqual([]);
        expect(liveCountsOfEveryRound).toEqual(
          oneToN(RACE_ROUNDS).map(() => oneToN(RACING_HITS)),
        );
        expect(expiredRowsLeft).toEqual([]);
        expect(liveRows.map((row) => row.hits)).toEqual(
          oneToN(RACE_ROUNDS).map(() => RACING_HITS),
        );
      },
      CONCURRENCY_TIMEOUT_MS,
    );
  });

  describe("criteria 2 and 9: the window is the caller's, and a count is its own row's", () => {
    it("starts at 1 in a new window with three expired windows of the key still stored, and the late prune takes exactly those", async () => {
      const key = newKey();
      const first = newHourWindow();
      const second = windowAfter(first);
      const third = windowAfter(second);
      const current = windowAfter(third);
      const limiter = store();
      for (const window of [first, second, third, first, second, first])
        await limiter.recordHits([{ key, window }]);

      const firstOfCurrent = await limiter.recordHits([
        { key, window: current },
      ]);
      const removed = await limiter.pruneExpired(current.startsAt);
      const secondOfCurrent = await limiter.recordHits([
        { key, window: current },
      ]);

      expect([firstOfCurrent, removed, secondOfCurrent]).toEqual([[1], 3, [2]]);
    });

    it.each([
      [
        "the 23-hour day in Chisinau",
        "2026-03-29T00:00:00+02:00",
        "2026-03-30T00:00:00+03:00",
        23,
      ],
      [
        "the 25-hour day in Chisinau",
        "2026-10-25T00:00:00+03:00",
        "2026-10-26T00:00:00+02:00",
        25,
      ],
    ])(
      "stores %s as given by offset, and counts the day after it apart",
      async (_label, startsAtText, endsAtText, hours) => {
        const key = newKey();
        const day = {
          startsAt: new Date(startsAtText),
          endsAt: new Date(endsAtText),
        };
        const dayAfter = {
          startsAt: day.endsAt,
          endsAt: new Date(day.endsAt.getTime() + DAY_MS),
        };
        const limiter = store();

        const counts = [
          ...(await limiter.recordHits([{ key, window: day }])),
          ...(await limiter.recordHits([{ key, window: day }])),
          ...(await limiter.recordHits([{ key, window: dayAfter }])),
        ];

        const [storedDay] = await storedRowsOf([key]);
        expect(counts).toEqual([1, 2, 1]);
        expect(day.endsAt.getTime() - day.startsAt.getTime()).toBe(
          hours * HOUR_MS,
        );
        expect([
          new Date(storedDay?.window_start ?? 0).toISOString(),
          new Date(storedDay?.window_end ?? 0).toISOString(),
        ]).toEqual([day.startsAt.toISOString(), day.endsAt.toISOString()]);
      },
    );

    it.each([
      ["ends a millisecond before it starts", -1],
      ["ends where it starts", 0],
    ])("writes nothing for a window that %s", async (_label, lengthMs) => {
      const key = newKey();
      const { startsAt } = newHourWindow();
      const window = {
        startsAt,
        endsAt: new Date(startsAt.getTime() + lengthMs),
      };

      const outcome = await outcomeOf(store().recordHits([{ key, window }]));

      expect(outcome).toBeInstanceOf(Error);
      expect(await storedRowsOf([key])).toEqual([]);
    });

    it("keeps a window of one millisecond, the shortest the caller can state", async () => {
      const key = newKey();
      const { startsAt } = newHourWindow();
      const window = { startsAt, endsAt: new Date(startsAt.getTime() + 1) };

      expect(await store().recordHits([{ key, window }])).toEqual([1]);
    });
  });

  describe("criterion 10: one key and start has one end, and a hit stating another is refused with nothing counted", () => {
    function sameStartEndingAfter(
      window: RateLimitWindow,
      lengthMs: number,
    ): RateLimitWindow {
      return {
        startsAt: window.startsAt,
        endsAt: new Date(window.startsAt.getTime() + lengthMs),
      };
    }

    function storedAs(row: StoredRow | undefined): unknown {
      return row === undefined
        ? "no row"
        : { hits: row.hits, endsAt: new Date(row.window_end).toISOString() };
    }

    /** Everything that would identify the request: its keys, and its instants as text and as milliseconds. */
    function identifiersOf(request: readonly RateLimitBucket[]): string[] {
      return request.flatMap(({ key, window }) => [
        key,
        window.startsAt.toISOString(),
        window.endsAt.toISOString(),
        String(window.startsAt.getTime()),
        String(window.endsAt.getTime()),
      ]);
    }

    function expectAConflictNamingNothing(
      outcome: unknown,
      request: readonly RateLimitBucket[],
    ): void {
      expect(outcome).toBeInstanceOf(RateLimitWindowConflictError);
      expect(outcome).not.toBeInstanceOf(RateLimitStoreError);
      expect((outcome as Error).cause).toBeUndefined();
      expect(markersFoundOn(outcome, identifiersOf(request))).toEqual([]);
    }

    it("refuses a shorter end than the stored one, counts no bucket of the request, and a prune at the shorter end removes nothing", async () => {
      const hour = newHourWindow();
      const day = sameStartEndingAfter(hour, DAY_MS);
      const stored = { key: newKey(), window: day };
      const bystander = { key: newKey(), window: hour };
      const limiter = store();
      await limiter.recordHits([stored]);
      await limiter.recordHits([stored]);
      const request = [bystander, { key: stored.key, window: hour }];

      const outcome = await outcomeOf(limiter.recordHits(request));
      const removedAtTheShorterEnd = await limiter.pruneExpired(hour.endsAt);
      const rowsAfter = await storedRowsOf([stored.key, bystander.key]);
      const nextCount = await limiter.recordHits([stored]);

      expectAConflictNamingNothing(outcome, request);
      expect(removedAtTheShorterEnd).toBe(0);
      expect(rowsAfter.map(storedAs)).toEqual([
        { hits: 2, endsAt: day.endsAt.toISOString() },
      ]);
      expect(rowsAfter.map((row) => row.bucket_key)).toEqual([stored.key]);
      expect(nextCount).toEqual([3]);
    });

    it("refuses a longer end than the stored one, counts no bucket of the request, and the stored window still expires at its own end", async () => {
      const hour = newHourWindow();
      const day = sameStartEndingAfter(hour, DAY_MS);
      const stored = { key: newKey(), window: hour };
      const bystander = { key: newKey(), window: day };
      const limiter = store();
      await limiter.recordHits([stored]);
      await limiter.recordHits([stored]);
      const request = [{ key: stored.key, window: day }, bystander];

      const outcome = await outcomeOf(limiter.recordHits(request));
      const rowsAfter = await storedRowsOf([stored.key, bystander.key]);
      const removedJustBeforeItsEnd = await limiter.pruneExpired(
        new Date(hour.endsAt.getTime() - 1),
      );
      const removedAtItsEnd = await limiter.pruneExpired(hour.endsAt);

      expectAConflictNamingNothing(outcome, request);
      expect(rowsAfter.map(storedAs)).toEqual([
        { hits: 2, endsAt: hour.endsAt.toISOString() },
      ]);
      expect(rowsAfter.map((row) => row.bucket_key)).toEqual([stored.key]);
      expect([removedJustBeforeItsEnd, removedAtItsEnd]).toEqual([0, 1]);
    });

    it.each([
      ["a millisecond earlier", -1],
      ["a millisecond later", 1],
      ["an hour later", HOUR_MS],
      ["all but the first millisecond earlier", 1 - HOUR_MS],
      ["a year later", 365 * DAY_MS],
    ])(
      "refuses an end %s than the stored one, and leaves the row as it was",
      async (_label, differenceMs) => {
        const window = newHourWindow();
        const stored = { key: newKey(), window };
        const other = sameStartEndingAfter(window, HOUR_MS + differenceMs);
        const limiter = store();
        await limiter.recordHits([stored]);
        const request = [{ key: stored.key, window: other }];

        const outcome = await outcomeOf(limiter.recordHits(request));

        expectAConflictNamingNothing(outcome, request);
        expect((await storedRowsOf([stored.key])).map(storedAs)).toEqual([
          { hits: 1, endsAt: window.endsAt.toISOString() },
        ]);
      },
    );

    it("counts a hit that states the stored end as another Date, read from text with an offset", async () => {
      const window = newHourWindow();
      const key = newKey();
      const limiter = store();
      await limiter.recordHits([{ key, window }]);
      const sameInstants = {
        startsAt: new Date(
          window.startsAt.toISOString().replace("Z", "+00:00"),
        ),
        endsAt: new Date(window.endsAt.getTime()),
      };

      expect(await limiter.recordHits([{ key, window: sameInstants }])).toEqual(
        [2],
      );
    });

    it.each([0, 2, 4])(
      "counts none of five buckets when the one at position %i states another end",
      async (conflictingPosition) => {
        const window = newHourWindow();
        const stored = { key: newKey(), window };
        const limiter = store();
        await limiter.recordHits([stored]);
        const fresh = oneToN(4).map(() => ({ key: newKey(), window }));
        const request: RateLimitBucket[] = [...fresh];
        request.splice(conflictingPosition, 0, {
          key: stored.key,
          window: sameStartEndingAfter(window, 2 * HOUR_MS),
        });

        const outcome = await outcomeOf(limiter.recordHits(request));

        expectAConflictNamingNothing(outcome, request);
        expect(await storedRowsOf(fresh.map(({ key }) => key))).toEqual([]);
        expect((await storedRowsOf([stored.key])).map(storedAs)).toEqual([
          { hits: 1, endsAt: window.endsAt.toISOString() },
        ]);
      },
    );

    it(
      "lets exactly one end win when two callers race a fresh key with different ends, and never stores a mixed row",
      async () => {
        const limiter = store();

        for (let round = 0; round < END_RACE_ROUNDS; round += 1) {
          const hour = newHourWindow();
          const day = sameStartEndingAfter(hour, DAY_MS);
          const key = newKey();
          const statedEnds = oneToN(END_RACE_CALLERS).map((caller) =>
            caller % 2 === 0 ? hour : day,
          );

          const settled = await Promise.allSettled(
            statedEnds.map((window) => limiter.recordHits([{ key, window }])),
          );

          const [row] = await storedRowsOf([key]);
          const winningEndMs = new Date(row?.window_end ?? 0).getTime();
          const outcomes = settled.map((result, caller) => ({
            statedTheWinningEnd:
              statedEnds[caller]?.endsAt.getTime() === winningEndMs,
            wasCounted: result.status === "fulfilled",
            isAConflict:
              result.status === "rejected" &&
              result.reason instanceof RateLimitWindowConflictError,
          }));
          const counts = settled.flatMap((result) =>
            result.status === "fulfilled" ? [...result.value] : [],
          );
          expect([hour.endsAt.getTime(), day.endsAt.getTime()]).toContain(
            winningEndMs,
          );
          expect(
            outcomes.filter(
              (outcome) =>
                outcome.wasCounted !== outcome.statedTheWinningEnd ||
                outcome.isAConflict === outcome.statedTheWinningEnd,
            ),
          ).toEqual([]);
          expect(ascending(counts)).toEqual(oneToN(END_RACE_CALLERS / 2));
          expect(row?.hits).toBe(END_RACE_CALLERS / 2);
        }
      },
      CONCURRENCY_TIMEOUT_MS,
    );

    it("refuses, with either typed error and nothing counted, a hit that both states another end and would overflow the count", async () => {
      const window = newHourWindow();
      const full = { key: newKey(), window };
      const bystander = { key: newKey(), window };
      await insertDirectly({ ...full, hits: LARGEST_POSTGRES_INTEGER });
      const request = [
        bystander,
        { key: full.key, window: sameStartEndingAfter(window, DAY_MS) },
      ];

      const outcome = await outcomeOf(store().recordHits(request));

      expect(
        outcome instanceof RateLimitWindowConflictError ||
          outcome instanceof RateLimitStoreError,
      ).toBe(true);
      expect(markersFoundOn(outcome, identifiersOf(request))).toEqual([]);
      expect(
        (await storedRowsOf([full.key, bystander.key])).map(storedAs),
      ).toEqual([
        { hits: LARGEST_POSTGRES_INTEGER, endsAt: window.endsAt.toISOString() },
      ]);
    });

    it("answers a row the table itself refuses for its count with the store's error, not with a conflict", async () => {
      const bucket = { key: newKey(), window: newHourWindow() };

      const outcome = await outcomeOf(insertDirectly({ ...bucket, hits: 0 }));
      const overflow = await (async () => {
        await insertDirectly({ ...bucket, hits: LARGEST_POSTGRES_INTEGER });
        return outcomeOf(store().recordHits([bucket]));
      })();

      expect((outcome as Error).message).toMatch(
        /rate_limit_counters_hits_is_positive/,
      );
      expect(overflow).toBeInstanceOf(RateLimitStoreError);
    });

    it("refuses an empty window before any statement, as a plain refusal and not as a conflict, with a row of that key stored", async () => {
      const window = newHourWindow();
      const key = newKey();
      const limiter = store();
      await limiter.recordHits([{ key, window }]);
      const empty = { startsAt: window.startsAt, endsAt: window.startsAt };

      const outcome = await outcomeOf(
        limiter.recordHits([{ key, window: empty }]),
      );

      expect(outcome).toBeInstanceOf(Error);
      expect(outcome).not.toBeInstanceOf(RateLimitWindowConflictError);
      expect(outcome).not.toBeInstanceOf(RateLimitStoreError);
      expect((await storedRowsOf([key])).map(storedAs)).toEqual([
        { hits: 1, endsAt: window.endsAt.toISOString() },
      ]);
    });
  });

  describe("criterion 11: under lost replies a count errs high and never low", () => {
    const COLD_START_AFTER: Loss = {
      reply: "cold-start-refusal",
      point: "after-the-write-lands",
    };
    const COLD_START_BEFORE: Loss = {
      reply: "cold-start-refusal",
      point: "before-the-write-lands",
    };
    const EMPTY_REPLY_AFTER: Loss = {
      reply: "empty-reply",
      point: "after-the-write-lands",
    };
    const EMPTY_REPLY_BEFORE: Loss = {
      reply: "empty-reply",
      point: "before-the-write-lands",
    };
    const LOSSES: readonly Loss[] = [
      COLD_START_AFTER,
      COLD_START_BEFORE,
      EMPTY_REPLY_AFTER,
      EMPTY_REPLY_BEFORE,
    ];
    const STEPS: readonly Step[] = [...LOSSES, "no loss"];

    interface StepOutcome {
      readonly answeredWith: readonly number[] | "refused";
      readonly attemptsSent: number;
    }

    /** One request for `buckets` with the first reply lost as `step` says, through the harness's own lost-reply support. */
    async function hitLosing(
      step: Step,
      buckets: readonly RateLimitBucket[],
    ): Promise<StepOutcome> {
      if (step === "no loss") {
        return {
          answeredWith: await store().recordHits(buckets),
          attemptsSent: 1,
        };
      }
      const lost = loseTheFirstReply(step.reply, step.point);
      try {
        const answeredWith = await store()
          .recordHits(buckets)
          .catch((error: unknown) => {
            if (error instanceof RateLimitStoreError) return "refused" as const;
            throw error;
          });
        return { answeredWith, attemptsSent: lost.requestsSent() };
      } finally {
        lost.restore();
      }
    }

    async function storedCountsOf(
      buckets: readonly RateLimitBucket[],
    ): Promise<number[]> {
      const rows = await storedRowsOf(buckets.map(({ key }) => key));
      return buckets.map(
        ({ key }) => rows.find((row) => row.bucket_key === key)?.hits ?? 0,
      );
    }

    it.each([
      [
        COLD_START_AFTER,
        { answeredWith: [2, 2], attemptsSent: 2, stored: [2, 2] },
      ],
      [
        COLD_START_BEFORE,
        { answeredWith: [1, 1], attemptsSent: 2, stored: [1, 1] },
      ],
      [
        EMPTY_REPLY_AFTER,
        { answeredWith: "refused", attemptsSent: 1, stored: [1, 1] },
      ],
      [
        EMPTY_REPLY_BEFORE,
        { answeredWith: "refused", attemptsSent: 1, stored: [0, 0] },
      ],
    ])("for one request losing %o", async (loss, expected) => {
      const window = newHourWindow();
      const buckets = [
        { key: newKey(), window },
        { key: newKey(), window },
      ];

      const outcome = await hitLosing(loss, buckets);

      expect({ ...outcome, stored: await storedCountsOf(buckets) }).toEqual(
        expected,
      );
    });

    it(
      "keeps answered <= stored <= attempts after every step of every two-step sequence and of twelve longer seeded ones",
      async () => {
        const random = seededRandom(11);
        const sequences: Step[][] = [
          ...STEPS.flatMap((first) => STEPS.map((second) => [first, second])),
          ...oneToN(LONGER_LOSS_SEQUENCES).map(() =>
            oneToN(LONGER_LOSS_SEQUENCE_LENGTH).map(
              () => STEPS[Math.floor(random() * STEPS.length)] ?? "no loss",
            ),
          ),
        ];
        const violations: unknown[] = [];

        for (const sequence of sequences) {
          const window = newHourWindow();
          const buckets = [
            { key: newKey(), window },
            { key: newKey(), window },
          ];
          let answered = 0;
          let attempts = 0;
          for (const step of sequence) {
            const outcome = await hitLosing(step, buckets);
            const stored = await storedCountsOf(buckets);
            attempts += outcome.attemptsSent;
            if (outcome.answeredWith !== "refused") answered += 1;
            const holds =
              stored.every((count) => answered <= count && count <= attempts) &&
              (outcome.answeredWith === "refused" ||
                JSON.stringify(outcome.answeredWith) ===
                  JSON.stringify(stored));
            if (!holds)
              violations.push({
                sequence,
                step,
                outcome,
                stored,
                answered,
                attempts,
              });
          }
        }

        expect(violations).toEqual([]);
      },
      LOST_REPLY_TIMEOUT_MS,
    );
  });

  describe("criterion 3: one round trip for a request's buckets", () => {
    const driverFetch = neonConfig.fetchFunction as typeof fetch | undefined;
    let roundTrips = 0;

    beforeEach(() => {
      roundTrips = 0;
      neonConfig.fetchFunction = (
        ...request: Parameters<typeof fetch>
      ): Promise<Response> => {
        roundTrips += 1;
        return (driverFetch ?? fetch)(...request);
      };
    });

    afterEach(() => {
      neonConfig.fetchFunction = driverFetch;
    });

    it.each([0, 1, 2, 1000])(
      "makes at most one HTTP request for %i buckets, and counts every one of them",
      async (bucketCount) => {
        const window = newHourWindow();
        const buckets: RateLimitBucket[] = oneToN(bucketCount).map(() => ({
          key: newKey(),
          window,
        }));
        const limiter = store();

        const first = await limiter.recordHits(buckets);
        const roundTripsOfTheFirst = roundTrips;
        const second = await limiter.recordHits([...buckets].reverse());

        expect(roundTripsOfTheFirst).toBe(bucketCount === 0 ? 0 : 1);
        expect([...first]).toEqual(buckets.map(() => 1));
        expect([...second]).toEqual(buckets.map(() => 2));
      },
      CONCURRENCY_TIMEOUT_MS,
    );
  });

  describe("criterion 4: the constraint and the code refuse the same keys", () => {
    it.each(NOT_A_DIGEST)(
      "the table refuses %s, which the code refuses too",
      async (_label, key) => {
        if (isStorableText(key)) keysIssued.push(key);
        const window = newHourWindow();

        const outcome = await outcomeOf(
          insertDirectly({ key, window, hits: 1 }),
        );

        expect(outcome).toBeInstanceOf(Error);
        expect(await storedRowsOf(keysIssued)).toEqual([]);
      },
    );

    it.each(NOT_A_DIGEST.filter(([, key]) => isStorableText(key)))(
      "names the key constraint when it refuses %s",
      async (_label, key) => {
        keysIssued.push(key);

        await expect(
          insertDirectly({ key, window: newHourWindow(), hits: 1 }),
        ).rejects.toThrow(/rate_limit_counters_bucket_key_is_sha256/);
      },
    );

    it("admits every digest the code admits: all sixteen hex characters, lowercase", async () => {
      const everyHexCharacter = "0123456789abcdef".repeat(4);
      await deleteRowsOfTheFixedKey(everyHexCharacter);
      keysIssued.push(everyHexCharacter);

      expect(
        await store().recordHits([
          { key: everyHexCharacter, window: newHourWindow() },
        ]),
      ).toEqual([1]);
    });

    async function deleteRowsOfTheFixedKey(key: string): Promise<void> {
      if (sql === undefined) throw new Error("no live test database");
      await sql`delete from rate_limit_counters where bucket_key = ${key}`;
    }
  });

  describe("criterion 5: prune takes exactly the expired rows", () => {
    it("removes the rows that ended a millisecond ago and at this instant, not the one ending a millisecond on, and nothing the second time", async () => {
      const { startsAt, endsAt: now } = newHourWindow();
      const endingAt = (endsAtMs: number): RateLimitBucket => ({
        key: newKey(),
        window: { startsAt, endsAt: new Date(endsAtMs) },
      });
      const justExpired = oneToN(3).map(() => endingAt(now.getTime() - 1));
      const expiringNow = oneToN(3).map(() => endingAt(now.getTime()));
      const stillLive = oneToN(3).map(() => endingAt(now.getTime() + 1));
      const limiter = store();
      await limiter.recordHits([...justExpired, ...expiringNow, ...stillLive]);

      const removed = await limiter.pruneExpired(now);
      const removedAgain = await limiter.pruneExpired(now);

      const keysLeft = (
        await storedRowsOf(
          [...justExpired, ...expiringNow, ...stillLive].map(({ key }) => key),
        )
      ).map((row) => row.bucket_key);
      expect([removed, removedAgain]).toEqual([6, 0]);
      expect(keysLeft).toEqual(stillLive.map(({ key }) => key).sort());
    });

    it(
      "removes each of 200 expired rows exactly once across ten concurrent prunes",
      async () => {
        const window = newHourWindow();
        const expired = oneToN(200).map(() => ({ key: newKey(), window }));
        const limiter = store();
        await limiter.recordHits(expired);

        const removed = await Promise.all(
          oneToN(10).map(() => limiter.pruneExpired(window.endsAt)),
        );

        expect(removed.reduce((sum, count) => sum + count, 0)).toBe(200);
        expect(await storedRowsOf(expired.map(({ key }) => key))).toEqual([]);
      },
      CONCURRENCY_TIMEOUT_MS,
    );

    it("removes nothing at an instant before every row this file could have written", async () => {
      const bucket = { key: newKey(), window: newHourWindow() };
      const limiter = store();
      await limiter.recordHits([bucket]);

      const removed = await limiter.pruneExpired(new Date(QA_ERA_START_MS));

      expect(removed).toBe(0);
      expect(await storedRowsOf([bucket.key])).toHaveLength(1);
    });
  });

  describe("criterion 6: what the database refuses is the typed error, never a count", () => {
    it("refuses the hit after the largest count the column holds, and leaves that count as it was", async () => {
      const bucket = { key: newKey(), window: newHourWindow() };
      await insertDirectly({ ...bucket, hits: LARGEST_POSTGRES_INTEGER });

      const outcome = await outcomeOf(store().recordHits([bucket]));

      expect(outcome).toBeInstanceOf(RateLimitStoreError);
      expect((outcome as Error).cause).toMatchObject({
        code: INTEGER_OUT_OF_RANGE,
      });
      expect((await storedRowsOf([bucket.key])).map((row) => row.hits)).toEqual(
        [LARGEST_POSTGRES_INTEGER],
      );
    });

    it("counts none of a request's buckets when one of them overflows", async () => {
      const window = newHourWindow();
      const full = { key: newKey(), window };
      const fresh = { key: newKey(), window };
      await insertDirectly({ ...full, hits: LARGEST_POSTGRES_INTEGER });

      const outcome = await outcomeOf(store().recordHits([fresh, full]));

      expect(outcome).toBeInstanceOf(RateLimitStoreError);
      expect(await storedRowsOf([fresh.key])).toEqual([]);
    });

    it.each([
      ["the year 10000", Date.UTC(10_000, 0, 1)],
      ["the last instant a Date can hold", 8_640_000_000_000_000 - HOUR_MS],
      ["the year 5000 BC", Date.UTC(-5000, 0, 1)],
    ])(
      "answers a window starting in %s, which Postgres cannot read, with the typed error and no row",
      async (_label, startsAtMs) => {
        const key = newKey();
        const window = {
          startsAt: new Date(startsAtMs),
          endsAt: new Date(startsAtMs + HOUR_MS),
        };

        const outcome = await outcomeOf(store().recordHits([{ key, window }]));

        expect(outcome).toBeInstanceOf(RateLimitStoreError);
        expect(await storedRowsOf([key])).toEqual([]);
      },
    );
  });

  describe("criterion 7: the grant test's helpers, asked of tables whose answer can be stated here", () => {
    /** Every privilege keyword Postgres grants on anything, so a table privilege the helper's query misses is in it. */
    const PRIVILEGE_KEYWORDS = [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
      "MAINTAIN",
      "USAGE",
      "CREATE",
      "CONNECT",
      "TEMPORARY",
      "EXECUTE",
      "SET",
      "ALTER SYSTEM",
      "ALL",
      "ALL PRIVILEGES",
    ];

    async function isATablePrivilegeHere(keyword: string): Promise<boolean> {
      if (sql === undefined) throw new Error("no live test database");
      try {
        await sql`select has_table_privilege(current_user, 'pg_catalog.pg_class', ${keyword})`;
        return true;
      } catch {
        return false;
      }
    }

    it("lists exactly the keywords this server takes as a table privilege, by a second road than its own query", async () => {
      if (sql === undefined) throw new Error("no live test database");
      const accepted: string[] = [];
      for (const keyword of PRIVILEGE_KEYWORDS)
        if (await isATablePrivilegeHere(keyword)) accepted.push(keyword);

      const known = await tablePrivilegesTheServerKnows(sql);

      expect(known).toEqual(accepted.sort());
      expect(known).toEqual(
        expect.arrayContaining([...TABLE_PRIVILEGES_EVERY_SERVER_KNOWS]),
      );
    });

    it("would list the same privileges for every role on this server, so the role asking cannot shorten the list", async () => {
      if (sql === undefined) throw new Error("no live test database");

      const listsByRole = (await sql`
        select distinct array_agg(privilege order by privilege) as privileges
        from (
          select rolname, (aclexplode(acldefault('r', oid))).privilege_type as privilege
          from pg_roles
        ) as exploded
        group by rolname
      `) as { privileges: string[] }[];

      expect(listsByRole.map((row) => row.privileges)).toEqual([
        await tablePrivilegesTheServerKnows(sql),
      ]);
    });

    // `pg_maintain` holds MAINTAIN on every relation, and the test database's role may be a member of it. Neither is a
    // grant to the role itself, which is what the grant test's earlier query read and would have missed.
    it("reads SELECT, held only through PUBLIC, and MAINTAIN exactly when the role is in pg_maintain, and nothing else on a catalogue table", async () => {
      if (sql === undefined) throw new Error("no live test database");
      const known = await tablePrivilegesTheServerKnows(sql);

      const direct = (await sql`
        select privilege_type
        from information_schema.role_table_grants
        where grantee = current_user and table_schema = 'pg_catalog' and table_name = 'pg_class'
      `) as unknown[];
      const [membership] = (await sql`
        select coalesce(pg_has_role(current_user, to_regrole('pg_maintain'), 'USAGE'), false) as is_in_pg_maintain
      `) as { is_in_pg_maintain: boolean }[];
      const held = await privilegesHeldOn(sql, "pg_catalog.pg_class", known);

      expect(direct).toEqual([]);
      expect(held).toEqual(
        membership?.is_in_pg_maintain === true
          ? ["MAINTAIN", "SELECT"]
          : ["SELECT"],
      );
    });

    it("reads every privilege the server knows as held on a table the role owns", async () => {
      if (sql === undefined) throw new Error("no live test database");
      const known = await tablePrivilegesTheServerKnows(sql);

      const [ownership] = (await sql`
        select pg_get_userbyid(relowner) = current_user as is_owner
        from pg_class
        where oid = 'public.rate_limit_counters'::regclass
      `) as { is_owner: boolean }[];
      const held = await privilegesHeldOn(
        sql,
        "public.rate_limit_counters",
        known,
      );

      expect(ownership?.is_owner).toBe(true);
      expect(held).toEqual(known);
    });

    it("rejects for a table that does not exist, so an absent table cannot read as one on which nothing is held", async () => {
      if (sql === undefined) throw new Error("no live test database");
      const known = await tablePrivilegesTheServerKnows(sql);

      const outcome = await outcomeOf(
        privilegesHeldOn(sql, "public.qa_8e_no_such_table", known),
      );

      expect(outcome).toBeInstanceOf(Error);
    });

    it("holds nothing when asked about no privilege, which the grant test's floor is there to refuse", async () => {
      if (sql === undefined) throw new Error("no live test database");

      expect(await privilegesHeldOn(sql, "pg_catalog.pg_class", [])).toEqual(
        [],
      );
    });
  });

  describe("criterion 8: the table holds a digest and a count, and knows nothing of designs", () => {
    it("has exactly the four columns of a counter", async () => {
      if (sql === undefined) throw new Error("no live test database");

      const columns = (await sql`
        select column_name, data_type
        from information_schema.columns
        where table_schema = 'public' and table_name = 'rate_limit_counters'
        order by column_name
      `) as { column_name: string; data_type: string }[];

      expect(columns).toEqual([
        { column_name: "bucket_key", data_type: "text" },
        { column_name: "hits", data_type: "integer" },
        { column_name: "window_end", data_type: "timestamp with time zone" },
        { column_name: "window_start", data_type: "timestamp with time zone" },
      ]);
    });

    it("references no other table", async () => {
      if (sql === undefined) throw new Error("no live test database");

      const foreignKeys = (await sql`
        select constraint_name
        from information_schema.table_constraints
        where table_schema = 'public'
          and table_name = 'rate_limit_counters'
          and constraint_type = 'FOREIGN KEY'
      `) as { constraint_name: string }[];

      expect(foreignKeys).toEqual([]);
    });
  });
});
