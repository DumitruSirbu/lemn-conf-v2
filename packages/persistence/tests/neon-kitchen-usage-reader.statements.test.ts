import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, ItemRef } from "@lemnaria/configurator-domain";

import { DashboardStoreError } from "../src/m10-ports.js";
import type {
  DashboardStoreFailure,
  ItemUsageProbe,
} from "../src/m10-ports.js";
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
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the statements `NeonKitchenUsageReader` sends, read as the driver receives them, with no database, and what
 * the reader does with each reply. What a statement counts is the live file's to show
 * (`neon-kitchen-usage-reader.live.test.ts`); this file pins the clauses that are conditions: a design its client deleted
 * is never read, a tier is compared where migration rewrites nothing, a linked accessory is given the build ids and keeps
 * none of its own, the walk is keyset-paged, a read is retried, and a count that is not a count is refused.
 */
const SECRET = "DRIVER-TEXT-SECRET-3b7e";
const MATERIAL: ItemRef = { kind: "material", tierId: "material.veneer" };
const HARDWARE: ItemRef = { kind: "hardware", tierId: "hardware.standard" };
const LINKED: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const COLOUR: ItemRef = { kind: "finish", finishId: "veneer.nuc" };

const tierProbe = (
  item: ItemRef & { kind: "material" | "hardware" },
  isFallback = false,
): ItemUsageProbe => ({ via: "settings-tier", item, isFallback });

const bodiesProbe = (buildIds: readonly string[]): ItemUsageProbe => ({
  via: "placed-bodies",
  item: LINKED as ItemRef & { kind: "accessory" },
  buildIds,
});

const walkProbe = (
  isUsedBy: (design: Design) => boolean = () => false,
  item: ItemRef = COLOUR,
): ItemUsageProbe => ({ via: "migrated-design", item, isUsedBy });

const EMPTY_KITCHEN = JSON.parse(
  JSON.stringify({ ...KITCHEN_L_DESIGN, placements: [] }),
) as unknown;

function storedIdOf(position: number): string {
  return `d${String(position).padStart(20, "0")}`;
}

/** `count` stored rows of a kitchen the product can read, with ids in order from `from`. */
function storedDesigns(from: number, count: number) {
  return Array.from({ length: count }, (_, offset) => ({
    id: storedIdOf(from + offset),
    schema_version: 5,
    document: EMPTY_KITCHEN,
  }));
}

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newReader(): NeonKitchenUsageReader {
  return new NeonKitchenUsageReader(WELL_FORMED_UNREACHABLE_VALUE);
}

function loneStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (statement === undefined || others.length > 0) {
    throw new Error("the call did not send exactly one lone statement");
  }
  expect(queryDriver.transactions).toHaveLength(0);
  return statement;
}

async function failureOf(
  call: () => Promise<unknown>,
  failure: DashboardStoreFailure,
): Promise<DashboardStoreError> {
  const rejection = await rejectionOf(call());
  expect(rejection).toBeInstanceOf(DashboardStoreError);
  expect((rejection as DashboardStoreError).failure).toBe(failure);
  return rejection as DashboardStoreError;
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("counting by the tier a design chose", () => {
  it("reads only designs their client has not deleted, and compares the stored tier where migration rewrites none", async () => {
    answerQueryWith([{ designs: 2 }]);

    const counts = (await newReader().countEach([tierProbe(MATERIAL, true)]))
      .counts;

    const statement = loneStatement();
    expect(counts).toEqual([{ item: MATERIAL, designCount: 2 }]);
    expect(normalised(statement)).toBe(
      "select count(*)::int as designs from designs d where d.deleted_by_client_at is null and coalesce( d.document #>> array['settings', ?::text], case when ?::boolean then ?::text end ) = ?::text",
    );
    expect(statement.values).toEqual([
      "materialTierId",
      true,
      "material.veneer",
      "material.veneer",
    ]);
  });

  it("names the hardware key for a hardware class and gives the fallback flag as it is", async () => {
    answerQueryWith([{ designs: 0 }]);

    await newReader().countEach([tierProbe(HARDWARE, false)]);

    expect(loneStatement().values).toEqual([
      "hardwareTierId",
      false,
      "hardware.standard",
      "hardware.standard",
    ]);
  });
});

describe("counting by the bodies a design places", () => {
  it("reads the placements of each design once, however many bodies of the set it places", async () => {
    answerQueryWith([{ designs: 3 }]);

    const counts = (
      await newReader().countEach([
        bodiesProbe(["base-3drawer", "base-3drawer-seeded"]),
      ])
    ).counts;

    const statement = loneStatement();
    expect(counts).toEqual([{ item: LINKED, designCount: 3 }]);
    expect(normalised(statement)).toBe(
      "select count(*)::int as designs from designs d where d.deleted_by_client_at is null and exists ( select 1 from jsonb_array_elements( case when jsonb_typeof(d.document -> 'placements') = 'array' then d.document -> 'placements' else '[]'::jsonb end ) as placement where placement #>> '{body,buildid}' = any(?::text[]) )",
    );
    expect(statement.values).toEqual([["base-3drawer", "base-3drawer-seeded"]]);
  });

  it("counts none, without a statement, for an accessory the book does not state", async () => {
    const counts = (await newReader().countEach([bodiesProbe([])])).counts;

    expect(counts).toEqual([{ item: LINKED, designCount: 0 }]);
    expect(queryDriver.statements).toHaveLength(0);
  });
});

describe("walking the stored designs", () => {
  it("sends no statement for a call that holds no probe of the walking kind, and no walk for none at all", async () => {
    expect((await newReader().countEach([])).counts).toEqual([]);
    answerQueryWith([{ designs: 1 }]);

    await newReader().countEach([tierProbe(MATERIAL)]);

    expect(queryDriver.statements).toHaveLength(1);
    expect(normalised(loneStatement())).not.toContain("schema_version");
  });

  it("reads the designs a client has not deleted, in id order, a bounded page at a time from the start", async () => {
    answerQueryWith([]);

    await newReader().countEach([walkProbe()]);

    const statement = loneStatement();
    expect(normalised(statement)).toBe(
      "select d.id, d.schema_version, d.document from designs d where d.deleted_by_client_at is null and d.id > ?::text order by d.id limit ?::int",
    );
    expect(statement.values).toEqual(["", USAGE_DESIGN_PAGE_SIZE]);
  });

  it("shares one walk between every probe of a call, counting each design once per probe", async () => {
    answerQueryWith(storedDesigns(0, 2));

    const counts = (
      await newReader().countEach([
        walkProbe(() => true),
        walkProbe(() => false, { kind: "handle", handle: "steel" }),
      ])
    ).counts;

    expect(queryDriver.statements).toHaveLength(1);
    expect(counts.map(({ designCount }) => designCount)).toEqual([2, 0]);
  });

  it("walks on from the last id of a full page and stops at the first page that is not full", async () => {
    answerQueryWith(storedDesigns(0, USAGE_DESIGN_PAGE_SIZE));
    answerQueryWith(storedDesigns(USAGE_DESIGN_PAGE_SIZE, 3));

    const counts = (await newReader().countEach([walkProbe(() => true)]))
      .counts;

    expect(counts).toEqual([
      { item: COLOUR, designCount: USAGE_DESIGN_PAGE_SIZE + 3 },
    ]);
    expect(queryDriver.statements.map(({ values }) => values)).toEqual([
      ["", USAGE_DESIGN_PAGE_SIZE],
      [storedIdOf(USAGE_DESIGN_PAGE_SIZE - 1), USAGE_DESIGN_PAGE_SIZE],
    ]);
  });

  it("asks once more after a page that is exactly full and finds nothing", async () => {
    answerQueryWith(storedDesigns(0, USAGE_DESIGN_PAGE_SIZE));
    answerQueryWith([]);

    await newReader().countEach([walkProbe()]);

    expect(queryDriver.statements).toHaveLength(2);
  });
});

describe("what the reader refuses", () => {
  it.each([
    ["one item named twice", [tierProbe(MATERIAL), tierProbe(MATERIAL, true)]],
    [
      "a tier probe naming an accessory",
      [{ via: "settings-tier", item: LINKED, isFallback: false }],
    ],
    [
      "a body probe naming a material",
      [{ via: "placed-bodies", item: MATERIAL, buildIds: [] }],
    ],
    ["a body probe with a build id that is not text", [bodiesProbe([""])]],
    [
      "a walking probe with no predicate",
      [{ via: "migrated-design", item: COLOUR }],
    ],
    [
      "a tier probe with no fallback flag",
      [{ via: "settings-tier", item: MATERIAL }],
    ],
    ["an item with no name", [tierProbe({ kind: "material", tierId: "" })]],
    [
      "a tier probe naming a colour",
      [{ via: "settings-tier", item: COLOUR, isFallback: false }],
    ],
    [
      "a body probe naming a built-in accessory",
      [
        {
          via: "placed-bodies",
          item: { kind: "accessory", accessoryId: "dishDryingRack" },
          buildIds: ["base-3drawer"],
        },
      ],
    ],
    [
      "a body probe naming a colour",
      [{ via: "placed-bodies", item: COLOUR, buildIds: [] }],
    ],
    [
      "a walking probe naming a material",
      [{ via: "migrated-design", item: MATERIAL, isUsedBy: () => false }],
    ],
    [
      "a walking probe naming a linked accessory",
      [{ via: "migrated-design", item: LINKED, isUsedBy: () => false }],
    ],
  ])("turns away %s before it sends anything", async (_name, probes) => {
    await failureOf(
      () => newReader().countEach(probes as readonly ItemUsageProbe[]),
      "invalid-request",
    );

    expect(queryDriver.statements).toHaveLength(0);
  });

  it.each([
    ["no row", []],
    ["two rows", [{ designs: 1 }, { designs: 1 }]],
    ["a count that is not a number", [{ designs: "1" }]],
    ["a negative count", [{ designs: -1 }]],
    ["a count that is not whole", [{ designs: 1.5 }]],
    ["a reply that is not rows", { designs: 1 }],
  ])("refuses %s as an unexpected answer", async (_name, reply) => {
    answerQueryWith(reply);

    await failureOf(
      () => newReader().countEach([tierProbe(MATERIAL)]),
      "unexpected-answer",
    );
  });

  it("retries a read after a lost acknowledgement, because a count writes nothing", async () => {
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([{ designs: 4 }]);

    const counts = (await newReader().countEach([tierProbe(MATERIAL)])).counts;

    expect(counts).toEqual([{ item: MATERIAL, designCount: 4 }]);
    expect(queryDriver.statements).toHaveLength(2);
  });

  it("says only a SQLSTATE of a failure, never the driver's text", async () => {
    failQueryWith(
      Object.assign(new Error(`driver text ${SECRET}`), {
        name: "NeonDbError",
        code: "42501",
      }),
    );

    const failure = await failureOf(
      () => newReader().countEach([tierProbe(MATERIAL)]),
      "unavailable",
    );

    expect(JSON.stringify([failure.message, failure.cause])).not.toContain(
      SECRET,
    );
  });
});
