import {
  UnknownBodyError,
  isSameItem,
  migrateDesign,
  usesItem,
} from "@lemnaria/configurator-domain";
import type { Design, ItemRef } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usageProbesFor } from "../src/item-usage-probes.js";
import type { ItemUsageProbe } from "../src/m10-ports.js";
import { DashboardStoreError } from "../src/m10-ports.js";
import { NeonKitchenUsageReader } from "../src/neon-kitchen-usage-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";
import {
  BUILD_IDS_OF_THE_EQUIVALENT_ROW,
  LINKED_THROUGH_EQUIVALENT,
  LINKED_TO_AN_UNPLACED_ROW,
  NOT_IN_THE_BOOK,
  USAGE_BASIS,
  USAGE_FIXTURES,
  USAGE_ITEMS,
} from "./support/usage-fixture-designs.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The usage reader against the domain's `usesItem`, over the fixture designs every parity check shares (current and older stored
 * versions, a colour on a cabinet alone, a cabinet that cannot wear its colour, a tier the book no longer holds, a seeded
 * body earning a linked accessory through its equivalent, a deleted design).
 *
 * **What this file does and does not run.** The reader's walk (a colour, a handle, a built-in accessory) runs here for
 * real: the recording driver hands it the stored rows, and it migrates them and asks `usesItem`. The two SQL counts (a
 * tier, a linked accessory) cannot run without a database, so each is checked here as a model written in TypeScript from
 * the statement's own condition, evaluated over the stored document, against `usesItem` over the migrated design: that
 * proves the condition is the right one for these designs, and not that the SQL says it. The SQL itself runs in
 * `neon-kitchen-usage-reader.live.test.ts`, which skips without the test database. A design its client deleted is
 * left out by the statement's own `where`, pinned in `neon-kitchen-usage-reader.statements.test.ts`, so the rows fed here
 * are the ones such a statement returns.
 */
const STORED = USAGE_FIXTURES.filter(
  ({ isDeletedByClient }) => !isDeletedByClient,
);

const ROWS = STORED.map(({ schemaVersion, document }, position) => ({
  id: `fixture-${String(position).padStart(12, "0")}`,
  schema_version: schemaVersion,
  document,
}));

const MIGRATED: readonly Design[] = STORED.map(({ schemaVersion, document }) =>
  migrateDesign(schemaVersion, document),
);

function designsUsing(item: ItemRef): number {
  return MIGRATED.filter((design) => usesItem({ design, item, ...USAGE_BASIS }))
    .length;
}

function newReader(): NeonKitchenUsageReader {
  return new NeonKitchenUsageReader(WELL_FORMED_UNREACHABLE_VALUE);
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the fixture designs", () => {
  it("are all designs the product reads, so a parity failure is the reader's and not a fixture's", () => {
    expect(MIGRATED).toHaveLength(STORED.length);
  });

  it("make the checks bite: some item is used by more than one design, some by one, and some by none", () => {
    const counts = USAGE_ITEMS.map(designsUsing);

    expect(Math.max(...counts)).toBeGreaterThan(1);
    expect(counts).toContain(1);
    expect(counts).toContain(0);
  });
});

describe("the reader's walk, which serves a colour, a handle and a built-in accessory", () => {
  const WALKED_ITEMS = USAGE_ITEMS.filter(
    ({ kind }) => kind === "finish" || kind === "handle",
  ).concat(
    USAGE_ITEMS.filter(
      (item) =>
        item.kind === "accessory" &&
        (item.accessoryId === "sinkProtectiveCover" ||
          item.accessoryId === "dishDryingRack"),
    ),
  );

  it("counts what usesItem says for each, over every fixture", async () => {
    answerQueryWith(ROWS);

    const counts = (
      await newReader().countEach(usageProbesFor(WALKED_ITEMS, USAGE_BASIS))
    ).counts;

    for (const item of WALKED_ITEMS) {
      const counted = counts.find((count) => isSameItem(count.item, item));
      expect(counted?.designCount, JSON.stringify(item)).toBe(
        designsUsing(item),
      );
    }
  });

  it("does not count a colour migration rewrote away: two stored documents name it and one design uses it", async () => {
    answerQueryWith(ROWS);
    const stejar: ItemRef = { kind: "finish", finishId: "veneer.stejar" };
    const documentsNamingIt = STORED.filter(({ document }) =>
      JSON.stringify(document).includes("veneer.stejar"),
    );

    const [counted] = (
      await newReader().countEach(usageProbesFor([stejar], USAGE_BASIS))
    ).counts;

    expect(documentsNamingIt).toHaveLength(2);
    expect(counted?.designCount).toBe(1);
    expect(counted?.designCount).toBe(designsUsing(stejar));
  });

  it("is the same walk whatever the order the items are asked in", async () => {
    answerQueryWith(ROWS);
    const forward = (
      await newReader().countEach(usageProbesFor(WALKED_ITEMS, USAGE_BASIS))
    ).counts;
    answerQueryWith(ROWS);

    const backward = (
      await newReader().countEach(
        usageProbesFor([...WALKED_ITEMS].reverse(), USAGE_BASIS),
      )
    ).counts;

    expect(
      [...backward].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
    ).toEqual(
      [...forward].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
    );
  });
});

describe("the stored-document model of the tier statement", () => {
  const TIERS = USAGE_ITEMS.filter(
    ({ kind }) => kind === "material" || kind === "hardware",
  );

  function modelOf(probe: ItemUsageProbe, document: unknown): boolean {
    if (probe.via !== "settings-tier") throw new Error("not a tier probe");
    const key =
      probe.item.kind === "material" ? "materialTierId" : "hardwareTierId";
    const settings = (document as { settings?: Record<string, unknown> })
      .settings;
    const stored =
      settings?.[key] ?? (probe.isFallback ? probe.item.tierId : undefined);
    return stored === probe.item.tierId;
  }

  it.each(TIERS.map((item) => [JSON.stringify(item), item] as const))(
    "counts the designs usesItem counts for %s, including those that name no tier at all",
    (_name, item) => {
      const [probe] = usageProbesFor([item], USAGE_BASIS);
      if (probe === undefined) throw new Error("no probe");

      const modelled = STORED.filter(({ document }) =>
        modelOf(probe, document),
      );

      expect(modelled).toHaveLength(designsUsing(item));
    },
  );
});

describe("the stored-document model of the placed-bodies statement", () => {
  function modelOf(probe: ItemUsageProbe, document: unknown): boolean {
    if (probe.via !== "placed-bodies") throw new Error("not a body probe");
    const { placements } = document as {
      placements?: readonly { body: { buildId: string } }[];
    };
    return (placements ?? []).some(({ body }) =>
      probe.buildIds.includes(body.buildId),
    );
  }

  it.each([
    LINKED_THROUGH_EQUIVALENT,
    LINKED_TO_AN_UNPLACED_ROW,
    NOT_IN_THE_BOOK,
  ])(
    "counts the designs usesItem counts for the linked accessory %s",
    (accessoryId) => {
      const item: ItemRef = { kind: "accessory", accessoryId };
      const [probe] = usageProbesFor([item], USAGE_BASIS);
      if (probe === undefined) throw new Error("no probe");

      const modelled = STORED.filter(({ document }) =>
        modelOf(probe, document),
      );

      expect(modelled).toHaveLength(designsUsing(item));
    },
  );

  it("earns the accessory linked to an equivalent row through the seeded bodies priced as it, and only through them", () => {
    const item: ItemRef = {
      kind: "accessory",
      accessoryId: LINKED_THROUGH_EQUIVALENT,
    };
    const [probe] = usageProbesFor([item], USAGE_BASIS);

    expect(probe).toMatchObject({
      via: "placed-bodies",
      buildIds: BUILD_IDS_OF_THE_EQUIVALENT_ROW,
    });
    expect(BUILD_IDS_OF_THE_EQUIVALENT_ROW.length).toBeGreaterThan(1);
    expect(designsUsing(item)).toBeGreaterThan(0);
  });

  it("gives an accessory the book does not state no build ids, so it is never used", () => {
    const [probe] = usageProbesFor(
      [{ kind: "accessory", accessoryId: NOT_IN_THE_BOOK }],
      USAGE_BASIS,
    );

    expect(probe).toMatchObject({ via: "placed-bodies", buildIds: [] });
  });
});

describe("a stored design the product cannot read", () => {
  const COLOUR: ItemRef = { kind: "finish", finishId: "veneer.nuc" };

  function everyDesignProbe(): ItemUsageProbe {
    return { via: "migrated-design", item: COLOUR, isUsedBy: () => true };
  }

  it("is left out of the walk and counted as unreadable, while every readable design is still counted", async () => {
    answerQueryWith([
      ...ROWS,
      {
        id: "z-unreadable",
        schema_version: 5,
        document: { secret: "DOCUMENT-TEXT-SECRET" },
      },
    ]);

    const result = await newReader().countEach([everyDesignProbe()]);

    expect(result.counts).toEqual([{ item: COLOUR, designCount: ROWS.length }]);
    expect(result.unreadableDesigns).toBe(1);
    expect(JSON.stringify(result)).not.toContain("DOCUMENT-TEXT-SECRET");
  });

  it("is left out when its stored version is one this build never wrote, or is not a number", async () => {
    answerQueryWith([
      { ...ROWS[0], schema_version: 99 },
      { ...ROWS[0], schema_version: "5" },
      ...ROWS,
    ]);

    const result = await newReader().countEach([everyDesignProbe()]);

    expect(result.counts).toEqual([{ item: COLOUR, designCount: ROWS.length }]);
    expect(result.unreadableDesigns).toBe(2);
  });

  it("is a design a predicate could not place a body of, left out of every count and counted once as unreadable", async () => {
    answerQueryWith(ROWS);
    const placesNoBody = (): boolean => {
      throw new UnknownBodyError("a-body-the-catalogue-lacks");
    };

    const result = await newReader().countEach([
      { via: "migrated-design", item: COLOUR, isUsedBy: placesNoBody },
      {
        via: "migrated-design",
        item: { kind: "handle", handle: "steel" },
        isUsedBy: placesNoBody,
      },
    ]);

    expect(result.counts.map(({ designCount }) => designCount)).toEqual([0, 0]);
    expect(result.unreadableDesigns).toBe(ROWS.length);
  });

  it("fails the call when a predicate fails any other way, and leaks nothing of the failure", async () => {
    answerQueryWith(ROWS);
    const probe: ItemUsageProbe = {
      via: "migrated-design",
      item: COLOUR,
      isUsedBy: () => {
        throw new Error("DOCUMENT-TEXT-SECRET");
      },
    };

    const rejection = await rejectionOf(newReader().countEach([probe]));

    expect(rejection).toBeInstanceOf(DashboardStoreError);
    expect((rejection as DashboardStoreError).failure).toBe(
      "unexpected-answer",
    );
    expect(JSON.stringify(rejection)).not.toContain("DOCUMENT-TEXT-SECRET");
    expect((rejection as DashboardStoreError).cause).toBeUndefined();
  });

  it("reports no unreadable designs for a call that walks nothing", async () => {
    answerQueryWith([{ designs: 1 }]);

    const result = await newReader().countEach(
      usageProbesFor(
        [{ kind: "material", tierId: "material.veneer" }],
        USAGE_BASIS,
      ),
    );

    expect(result.unreadableDesigns).toBe(0);
  });
});
