import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNeonPriceDashboardRowSource } from "../src/price-dashboard-row-source.js";
import {
  answerFromTables,
  fakeDatabase,
  resetFakeDatabase,
} from "./support/fake-price-dashboard-database.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (
    await import("./support/fake-price-dashboard-database.js")
  ).withFakePriceDashboardDriver(await importOriginal<object>()),
);

/**
 * A keyset walk of the production source against a table interpreter that sorts and compares the way PostgreSQL does
 * (see the support file). The counterexamples are the transitions: 9 before 10 before 100, a page that ends exactly at
 * the page size (the next page is then empty), and revisions past 2^53 that a JavaScript number cannot hold.
 */
const source = createNeonPriceDashboardRowSource(WELL_FORMED_UNREACHABLE_VALUE);

const VERSION_COUNT = 120;
const BEYOND_SAFE_INTEGER = 9007199254740991n;
const LOG_REVISION_COUNT = 23;

/** Newest first, the order a naive insert-order read would get wrong. */
function versionRows() {
  return Array.from({ length: VERSION_COUNT }, (_, index) => ({
    id: `version-${String(VERSION_COUNT - index)}`,
    sequence_number: String(VERSION_COUNT - index),
  }));
}

function logRows() {
  return Array.from({ length: LOG_REVISION_COUNT }, (_, index) => ({
    revision: String(BEYOND_SAFE_INTEGER + BigInt(LOG_REVISION_COUNT - index)),
    item_id: `item-${String(index)}`,
  }));
}

/** A source that ignores its bound would walk forever; a walk this long is the failure. */
const MAX_ROUND_TRIPS = 1_000;
const RUNAWAY_WALK = "the walk never reached a short page";

const PAGE_SIZES = [
  1, 2, 3, 7, 10, 11, 23, 24, 40, 119, 120, 121, 500,
] as const;

async function walkVersions(pageSize: number) {
  const pages: Awaited<ReturnType<typeof source.fetchVersionPage>>[] = [];
  let afterSequenceNumber: string | undefined;
  for (;;) {
    const page = await source.fetchVersionPage({
      ...(afterSequenceNumber === undefined ? {} : { afterSequenceNumber }),
      pageSize,
    });
    pages.push(page);
    if (page.length < pageSize) return pages;
    if (pages.length > MAX_ROUND_TRIPS) throw new Error(RUNAWAY_WALK);
    afterSequenceNumber = page.at(-1)?.sequence_number;
  }
}

async function walkLog(pageSize: number) {
  const pages: Awaited<
    ReturnType<typeof source.fetchAvailabilityChangePage>
  >[] = [];
  let afterRevision: string | undefined;
  for (;;) {
    const page = await source.fetchAvailabilityChangePage({
      ...(afterRevision === undefined ? {} : { afterRevision }),
      pageSize,
    });
    pages.push(page);
    if (page.length < pageSize) return pages;
    if (pages.length > MAX_ROUND_TRIPS) throw new Error(RUNAWAY_WALK);
    afterRevision = page.at(-1)?.revision;
  }
}

beforeEach(() => {
  resetFakeDatabase({
    price_book_versions: versionRows(),
    catalogue_availability_changes: logRows(),
  });
});

describe("walking the price book versions page by page", () => {
  it.each(PAGE_SIZES)(
    "at page size %i reads every version once, in numeric order (9 before 10 before 100)",
    async (pageSize) => {
      const walked = (await walkVersions(pageSize)).flat();

      expect(walked.map((row) => row.sequence_number)).toEqual(
        Array.from({ length: VERSION_COUNT }, (_, index) => String(index + 1)),
      );
    },
  );

  it.each(PAGE_SIZES)(
    "at page size %i takes floor(rows / size) + 1 round trips: a page that ends exactly at the size is followed by an empty one",
    async (pageSize) => {
      const pages = await walkVersions(pageSize);

      expect(pages).toHaveLength(Math.floor(VERSION_COUNT / pageSize) + 1);
      expect(pages.at(-1)).toHaveLength(VERSION_COUNT % pageSize);
    },
  );

  it("sends the last row of a page, verbatim, as the next page's exclusive bound", async () => {
    await walkVersions(7);

    const bounds = fakeDatabase.sent.slice(1).map(({ values }) => values[0]);
    expect(bounds.slice(0, 3)).toEqual(["7", "14", "21"]);
  });

  it("is deterministic: two walks of the same table read the same rows", async () => {
    expect(await walkVersions(10)).toEqual(await walkVersions(10));
  });

  it("reads an empty table as one empty page", async () => {
    resetFakeDatabase({ price_book_versions: [] });

    expect(await walkVersions(5)).toEqual([[]]);
  });
});

describe("walking the availability log page by page", () => {
  it.each(PAGE_SIZES)(
    "at page size %i reads every revision once, past 2^53, in numeric order",
    async (pageSize) => {
      const walked = (await walkLog(pageSize)).flat();

      expect(walked.map((row) => row.revision)).toEqual(
        Array.from({ length: LOG_REVISION_COUNT }, (_, index) =>
          String(BEYOND_SAFE_INTEGER + BigInt(index + 1)),
        ),
      );
    },
  );

  it("takes the next page's bound from the digits of the last row, so no revision is skipped or repeated at 2^53", async () => {
    const walked = (await walkLog(1)).flat();

    expect(new Set(walked.map((row) => row.revision)).size).toBe(
      LOG_REVISION_COUNT,
    );
  });
});

describe("the table interpreter these walks stand on can fail", () => {
  const ROWS = {
    price_book_versions: ["1", "9", "10", "100"].map((sequence_number) => ({
      sequence_number,
    })),
  };

  it("sorts a bare name that is also the text output column as text, which is the defect it exists to show", () => {
    const sorted = answerFromTables(
      ROWS,
      "select v.sequence_number::text as sequence_number from price_book_versions v order by sequence_number limit ?",
      [10],
    );

    expect(sorted.map((row) => row["sequence_number"])).toEqual([
      "1",
      "10",
      "100",
      "9",
    ]);
  });

  it("sorts the qualified input column numerically", () => {
    const sorted = answerFromTables(
      ROWS,
      "select v.sequence_number::text as sequence_number from price_book_versions v order by v.sequence_number limit ?",
      [10],
    );

    expect(sorted.map((row) => row["sequence_number"])).toEqual([
      "1",
      "9",
      "10",
      "100",
    ]);
  });

  it("repeats the boundary row under >=, and drops it under >", () => {
    const text = (operator: string) =>
      `select v.sequence_number::text as sequence_number from price_book_versions v where v.sequence_number ${operator} ?::bigint order by v.sequence_number limit ?`;

    expect(
      answerFromTables(ROWS, text(">="), ["9", 10]).map(
        (row) => row["sequence_number"],
      ),
    ).toEqual(["9", "10", "100"]);
    expect(
      answerFromTables(ROWS, text(">"), ["9", 10]).map(
        (row) => row["sequence_number"],
      ),
    ).toEqual(["10", "100"]);
  });

  it("refuses a statement shape it cannot read, instead of answering it", () => {
    expect(() =>
      answerFromTables(ROWS, "select 1 from somewhere_else", []),
    ).toThrow(/cannot interpret/);
  });
});
