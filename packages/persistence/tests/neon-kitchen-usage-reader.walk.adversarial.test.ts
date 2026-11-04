import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { ItemRef } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "../src/m10-ports.js";
import type { ItemUsageProbe } from "../src/m10-ports.js";
import {
  NeonKitchenUsageReader,
  USAGE_DESIGN_PAGE_SIZE,
} from "../src/neon-kitchen-usage-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
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

/**
 * The reader's keyset walk against a table that answers as `designs` does: `id > afterId`, in id order, at most
 * `limit` rows. The recording driver's queued answers cannot show a walk that skips or repeats a design, because they
 * ignore what the walk asked for; here each answer is computed from the statement just sent, so a wrong cursor, a wrong
 * stop, or a page counted before the unreadable rows leave it shows as a wrong count or a wrong statement.
 */
const COLOUR: ItemRef = { kind: "finish", finishId: "veneer.nuc" };
const EVERY_DESIGN: ItemUsageProbe = {
  via: "migrated-design",
  item: COLOUR,
  isUsedBy: () => true,
};

const READABLE_DOCUMENT = JSON.parse(
  JSON.stringify({ ...KITCHEN_L_DESIGN, placements: [] }),
) as unknown;

interface StoredRow {
  readonly id: string;
  readonly schema_version: unknown;
  readonly document: unknown;
}

function idAt(position: number): string {
  return `d${String(position).padStart(6, "0")}`;
}

function readableRows(count: number, from = 0): StoredRow[] {
  return Array.from({ length: count }, (_, offset) => ({
    id: idAt(from + offset),
    schema_version: 5,
    document: READABLE_DOCUMENT,
  }));
}

function withLastRowAmended(
  rows: readonly StoredRow[],
  amendment: Partial<StoredRow>,
): StoredRow[] {
  return rows.map((row, position) =>
    position === rows.length - 1 ? { ...row, ...amendment } : row,
  );
}

/** Queues `answers` replies, each the page of `table` after the cursor the statement it answers carried. */
function serveKeysetPagesFrom(
  table: StoredRow[],
  onServed: (pageNumber: number) => void = () => undefined,
): void {
  let pageNumber = 0;
  for (let answer = 0; answer < 40; answer += 1) {
    queryDriver.replies.push(() => {
      const sent = queryDriver.statements.at(-1);
      const [afterId, limit] = sent?.values as [string, number];
      const page = table
        .filter(({ id }) => id > afterId)
        .sort((left, right) => (left.id < right.id ? -1 : 1))
        .slice(0, limit);
      pageNumber += 1;
      onServed(pageNumber);
      return Promise.resolve(page);
    });
  }
}

function cursorsSent(): unknown[] {
  return queryDriver.statements.map(({ values }) => values[0]);
}

function newReader(): NeonKitchenUsageReader {
  return new NeonKitchenUsageReader(WELL_FORMED_UNREACHABLE_VALUE);
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the walk over a table that answers by keyset", () => {
  it.each([0, 1, 99, 100, 101, 199, 200, 201, 250, 301])(
    "counts each of %i designs once, and asks for exactly the pages they fill",
    async (designCount) => {
      serveKeysetPagesFrom(readableRows(designCount));

      const [counted] = await newReader().countEach([EVERY_DESIGN]);

      expect(counted?.designCount).toBe(designCount);
      expect(queryDriver.statements).toHaveLength(
        Math.floor(designCount / USAGE_DESIGN_PAGE_SIZE) + 1,
      );
    },
  );

  it("moves the cursor to the last id of each full page and never back", async () => {
    serveKeysetPagesFrom(readableRows(2 * USAGE_DESIGN_PAGE_SIZE + 1));

    await newReader().countEach([EVERY_DESIGN]);

    expect(cursorsSent()).toEqual([
      "",
      idAt(USAGE_DESIGN_PAGE_SIZE - 1),
      idAt(2 * USAGE_DESIGN_PAGE_SIZE - 1),
    ]);
    expect(
      queryDriver.statements.every(
        ({ values }) => values[1] === USAGE_DESIGN_PAGE_SIZE,
      ),
    ).toBe(true);
  });

  it("walks once for any number of probes, and gives each probe the count of its own predicate", async () => {
    serveKeysetPagesFrom(readableRows(150));
    let asked = 0;
    const everyThird: ItemUsageProbe = {
      via: "migrated-design",
      item: { kind: "handle", handle: "steel" },
      isUsedBy: () => (asked += 1) % 3 === 0,
    };

    const counts = await newReader().countEach([EVERY_DESIGN, everyThird]);

    expect(counts.map(({ designCount }) => designCount)).toEqual([150, 50]);
    expect(queryDriver.statements).toHaveLength(2);
  });

  it("counts a design saved during the walk past the cursor, and no design twice", async () => {
    const table = readableRows(150);
    serveKeysetPagesFrom(table, (pageNumber) => {
      if (pageNumber === 1) table.push(...readableRows(1, 500));
    });

    const [counted] = await newReader().countEach([EVERY_DESIGN]);

    expect(counted?.designCount).toBe(151);
  });

  it("neither skips nor repeats a design when one is saved behind the cursor during the walk", async () => {
    const table = readableRows(150, 1000);
    serveKeysetPagesFrom(table, (pageNumber) => {
      if (pageNumber === 1) table.push(...readableRows(1, 0));
    });

    const [counted] = await newReader().countEach([EVERY_DESIGN]);

    expect(counted?.designCount).toBe(150);
  });

  it("keeps walking past a full page of designs it cannot read, and moves the cursor over them", async () => {
    const unreadable: StoredRow[] = readableRows(USAGE_DESIGN_PAGE_SIZE).map(
      (row) => ({ ...row, document: { notADesign: true } }),
    );
    serveKeysetPagesFrom([...unreadable, ...readableRows(5, 1000)]);

    const [counted] = await newReader().countEach([EVERY_DESIGN]);

    expect(counted?.designCount).toBe(5);
    expect(cursorsSent()).toEqual(["", idAt(USAGE_DESIGN_PAGE_SIZE - 1)]);
  });

  it("moves the cursor over an unreadable design that ends a full page", async () => {
    const page = withLastRowAmended(readableRows(USAGE_DESIGN_PAGE_SIZE), {
      schema_version: 99,
    });
    serveKeysetPagesFrom([...page, ...readableRows(3, 1000)]);

    const [counted] = await newReader().countEach([EVERY_DESIGN]);

    expect(counted?.designCount).toBe(USAGE_DESIGN_PAGE_SIZE - 1 + 3);
    expect(cursorsSent()[1]).toBe(idAt(USAGE_DESIGN_PAGE_SIZE - 1));
  });

  it("answers no count at all when a later page fails, and never the count of the pages before it", async () => {
    answerQueryWith(readableRows(USAGE_DESIGN_PAGE_SIZE));
    failQueryWith(
      Object.assign(new Error("denied"), {
        name: "NeonDbError",
        code: "42501",
      }),
    );

    const failure = await rejectionOf(newReader().countEach([EVERY_DESIGN]));

    expect(failure).toBeInstanceOf(DashboardStoreError);
    expect((failure as DashboardStoreError).failure).toBe("unavailable");
  });

  it("refuses a page whose last id is not text, rather than walk on from nothing", async () => {
    const page = withLastRowAmended(readableRows(USAGE_DESIGN_PAGE_SIZE), {
      id: 7 as unknown as string,
    });
    answerQueryWith(page);
    answerQueryWith([]);

    const failure = await rejectionOf(newReader().countEach([EVERY_DESIGN]));

    expect((failure as DashboardStoreError).failure).toBe("unexpected-answer");
  });
});

describe("a call with probes of every way of reading", () => {
  const MATERIAL: ItemRef = { kind: "material", tierId: "material.veneer" };
  const LINKED: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
  const UNSTATED: ItemRef = { kind: "accessory", accessoryId: "never-stated" };

  it("owes one count per probe, in the order the probes were given, with nothing counted for an unstated accessory", async () => {
    answerQueryWith(readableRows(3));
    answerQueryWith([{ designs: 4 }]);
    answerQueryWith([{ designs: 2 }]);

    const counts = await newReader().countEach([
      {
        via: "settings-tier",
        item: MATERIAL as ItemUsageProbe["item"] & { kind: "material" },
        isFallback: false,
      },
      {
        via: "placed-bodies",
        item: LINKED as ItemUsageProbe["item"] & { kind: "accessory" },
        buildIds: ["base-sink"],
      },
      {
        via: "placed-bodies",
        item: UNSTATED as ItemUsageProbe["item"] & { kind: "accessory" },
        buildIds: [],
      },
      EVERY_DESIGN,
    ]);

    expect(counts).toEqual([
      { item: MATERIAL, designCount: 4 },
      { item: LINKED, designCount: 2 },
      { item: UNSTATED, designCount: 0 },
      { item: COLOUR, designCount: 3 },
    ]);
  });
});

describe("a probe that is not one", () => {
  it.each([
    ["null", [null]],
    ["an empty object", [{}]],
    [
      "a probe with no item",
      [{ via: "migrated-design", isUsedBy: () => true }],
    ],
    ["a probe with a null item", [{ via: "settings-tier", item: null }]],
    ["a probe of a way nobody reads", [{ via: "by-magic", item: COLOUR }]],
  ])(
    "is turned away as an invalid request, before a statement, for %s",
    async (_name, probes) => {
      const failure = await rejectionOf(
        newReader().countEach(probes as unknown as readonly ItemUsageProbe[]),
      );

      expect(failure).toBeInstanceOf(DashboardStoreError);
      expect((failure as DashboardStoreError).failure).toBe("invalid-request");
      expect(queryDriver.statements).toHaveLength(0);
    },
  );
});
