import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNeonPriceDashboardRowSource,
  type PriceDashboardRowSource,
} from "../src/price-dashboard-row-source.js";
import {
  REFUSED_VALUES,
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

const MIB = 1024 * 1024;
const AFTER_SEQUENCE_NUMBER = "SENTINEL-SEQ-41";
const AFTER_REVISION = "SENTINEL-REV-9007199254740993";
const PAGE_SIZE = 3;

interface Read {
  readonly name: string;
  readonly table: string;
  readonly isSingleton: boolean;
  readonly run: (source: PriceDashboardRowSource) => Promise<unknown>;
}

const READS: readonly Read[] = [
  {
    name: "the first page of versions",
    table: "price_book_versions",
    isSingleton: false,
    run: (source) => source.fetchVersionPage({ pageSize: PAGE_SIZE }),
  },
  {
    name: "a later page of versions",
    table: "price_book_versions",
    isSingleton: false,
    run: (source) =>
      source.fetchVersionPage({
        afterSequenceNumber: AFTER_SEQUENCE_NUMBER,
        pageSize: PAGE_SIZE,
      }),
  },
  {
    name: "the first page of the availability log",
    table: "catalogue_availability_changes",
    isSingleton: false,
    run: (source) =>
      source.fetchAvailabilityChangePage({ pageSize: PAGE_SIZE }),
  },
  {
    name: "a later page of the availability log",
    table: "catalogue_availability_changes",
    isSingleton: false,
    run: (source) =>
      source.fetchAvailabilityChangePage({
        afterRevision: AFTER_REVISION,
        pageSize: PAGE_SIZE,
      }),
  },
  {
    name: "the availability head",
    table: "catalogue_availability_head",
    isSingleton: true,
    run: (source) => source.fetchAvailabilityHead(),
  },
  {
    name: "the kitchen defaults",
    table: "kitchen_defaults",
    isSingleton: true,
    run: (source) => source.fetchKitchenDefaults(),
  },
];
const PAGED_READS = READS.filter((read) => !read.isSingleton);
const SINGLETON_READS = READS.filter((read) => read.isSingleton);

const sourceOf = (connectionUrl: string = WELL_FORMED_UNREACHABLE_VALUE) =>
  createNeonPriceDashboardRowSource(connectionUrl);

function normalised(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function coldStartRefusal(): NeonDbError {
  return new NeonDbError(
    'Server error (HTTP status 500): {"message":"Couldn\'t connect to compute node","neon:retryable":true}',
  );
}

beforeEach(() => {
  resetQueryDriver();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetQueryDriver();
});

describe("the price dashboard export's text: what a mutation of the statement must not survive", () => {
  async function textOf(read: Read): Promise<string> {
    answerQueryWith([{ revision: "1" }]);
    await read.run(sourceOf()).catch(() => undefined);
    return normalised(queryDriver.statements[0]?.text ?? "");
  }

  it.each(READS)(
    "$name reads every bigint as text: a number would lose the digits past 2^53 a restore needs",
    async (read) => {
      const text = await textOf(read);
      const bigintColumn = /(sequence_number|revision)/.exec(text)?.[1];

      expect(text).toMatch(
        new RegExp(
          `\\b[a-z]\\.${bigintColumn ?? "?"}::text as ${bigintColumn ?? "?"}\\b`,
        ),
      );
    },
  );

  it.each(PAGED_READS)(
    "$name ends in `limit ?` with the page size as the last value, and nothing follows",
    async (read) => {
      const text = await textOf(read);

      expect(text).toMatch(/ order by [a-z]\.[a-z_]+ limit \?$/);
      expect(queryDriver.statements[0]?.values.at(-1)).toBe(PAGE_SIZE);
    },
  );

  it.each(SINGLETON_READS)(
    "$name has no limit, order or grouping, so a second row is seen and refused rather than cut off",
    async (read) => {
      const text = await textOf(read);

      expect(text).not.toMatch(
        /\b(?:limit|order by|group by|distinct|offset)\b/,
      );
      expect(queryDriver.statements[0]?.values).toEqual([]);
    },
  );

  it.each(READS)("$name sends exactly one statement", async (read) => {
    await textOf(read);

    expect(queryDriver.statements).toHaveLength(1);
    expect(queryDriver.transactions).toHaveLength(0);
  });
});

describe("empty tables", () => {
  it.each(PAGED_READS)(
    "$name returns an empty page, not a failure",
    async (read) => {
      answerQueryWith([]);

      expect(await read.run(sourceOf())).toEqual([]);
    },
  );

  it.each(SINGLETON_READS)(
    "$name names its table and the count it found when the row is missing",
    async (read) => {
      answerQueryWith([]);

      const failure = await rejectionOf(read.run(sourceOf()));

      expect((failure as Error).message).toContain(read.table);
      expect((failure as Error).message).toContain("found 0 rows");
    },
  );

  it.each(SINGLETON_READS)(
    "$name names its table when it holds a second row",
    async (read) => {
      answerQueryWith([{ revision: "1" }, { revision: "1" }]);

      const failure = await rejectionOf(read.run(sourceOf()));

      expect((failure as Error).message).toContain(read.table);
      expect((failure as Error).message).toContain("found 2 rows");
    },
  );

  it.each(SINGLETON_READS)(
    "$name refuses a reply that is not one row even when the driver gives an undefined first element",
    async (read) => {
      answerQueryWith([undefined]);

      await expect(read.run(sourceOf())).rejects.toThrow(/found 1 rows/);
    },
  );
});

describe("boundaries of the page and of the bound", () => {
  it("passes a 4 MiB book and a 4 MiB change summary back untouched, one reference, no copy or truncation", async () => {
    const book = { padding: "x".repeat(4 * MIB - 16) };
    const changeSummary = [{ padding: "y".repeat(4 * MIB - 16) }];
    const row = {
      id: "v".repeat(21),
      sequence_number: "1",
      label: "l",
      note: "",
      book,
      change_summary: changeSummary,
      change_count: 1,
      published_at: "2026-01-01T00:00:00.000Z",
      published_by_account_id: "a".repeat(21),
    };
    answerQueryWith([row]);

    const page = await sourceOf().fetchVersionPage({ pageSize: 1 });

    expect(page).toHaveLength(1);
    expect(page[0]?.book).toBe(book);
    expect(page[0]?.change_summary).toBe(changeSummary);
  });

  it.each([1, 2, 1_000])(
    "sends page size %i as given: no clamp, no default",
    async (pageSize) => {
      answerQueryWith([]);

      await sourceOf().fetchVersionPage({ pageSize });

      expect(queryDriver.statements[0]?.values).toEqual([pageSize]);
    },
  );

  it.each(["0", "00", ""])(
    "reads the bound %j as a bound, not as 'no bound': the first page is chosen by absence alone",
    async (bound) => {
      answerQueryWith([]);
      answerQueryWith([]);

      await sourceOf().fetchVersionPage({
        afterSequenceNumber: bound,
        pageSize: 2,
      });
      await sourceOf().fetchAvailabilityChangePage({
        afterRevision: bound,
        pageSize: 2,
      });

      expect(queryDriver.statements.map(({ values }) => values)).toEqual([
        [bound, 2],
        [bound, 2],
      ]);
    },
  );

  it("hands back duplicate keys exactly as the database gave them, in the same order, without deduplicating", async () => {
    const rows = [
      { revision: "5", item_id: "a" },
      { revision: "5", item_id: "b" },
      { revision: "4", item_id: "c" },
    ];
    answerQueryWith(rows);

    const page = await sourceOf().fetchAvailabilityChangePage({ pageSize: 9 });

    expect(page).toEqual(rows);
  });
});

describe("a driver failure", () => {
  it.each(READS)(
    "$name rejects with the driver's own error, and is never answered with an empty export",
    async (read) => {
      const failure = new Error("driver refused");
      failQueryWith(failure);

      expect(await rejectionOf(read.run(sourceOf()))).toBe(failure);
    },
  );

  it.each(READS)(
    "$name does not repeat a statement the database rejected",
    async (read) => {
      failQueryWith(
        new NeonDbError(
          'Server error (HTTP status 500): {"neon:retryable":false}',
        ),
      );

      await rejectionOf(read.run(sourceOf()));

      expect(queryDriver.statements).toHaveLength(1);
    },
  );

  it.each(READS)(
    "$name repeats once after the compute's cold-start refusal and then answers",
    async (read) => {
      failQueryWith(coldStartRefusal());
      answerQueryWith(read.isSingleton ? [{ revision: "7" }] : []);

      const pending = read.run(sourceOf());
      await vi.runAllTimersAsync();

      await expect(pending).resolves.toBeDefined();
      expect(queryDriver.statements).toHaveLength(2);
      expect(queryDriver.statements[1]).toEqual(queryDriver.statements[0]);
    },
  );

  it.each(READS)(
    "$name carries neither the connection string's secrets nor the bound it was sent",
    async (read) => {
      failQueryWith(new Error("driver refused"));

      const failure = await rejectionOf(read.run(sourceOf()));

      expect(markersFoundOn(failure)).toEqual([]);
      expect(
        markersFoundOn(failure, [AFTER_SEQUENCE_NUMBER, AFTER_REVISION]),
      ).toEqual([]);
    },
  );

  it.each(
    READS.flatMap((read) => REFUSED_VALUES.map((value) => ({ read, value }))),
  )(
    "$read.name refused a connection string that is $value.label, with nothing of the value in the error",
    async ({ read, value }) => {
      const failure = await rejectionOf(read.run(sourceOf(value.value)));

      expect(markersFoundOn(failure)).toEqual([]);
      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it("builds the source without reading DATABASE_URL, and reports its absence on the first read instead", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const source = createNeonPriceDashboardRowSource();

    await expect(source.fetchKitchenDefaults()).rejects.toThrow(/DATABASE_URL/);
    vi.unstubAllEnvs();
  });
});
