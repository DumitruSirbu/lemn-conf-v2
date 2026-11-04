import {
  isSameItem,
  migrateDesign,
  usesItem,
} from "@lemnaria/configurator-domain";
import type { Design, ItemRef } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { usageProbesFor } from "../src/item-usage-probes.js";
import type { ItemUsageProbe } from "../src/m10-ports.js";
import { runMigrations } from "../src/migrate.js";
import {
  NeonKitchenUsageReader,
  USAGE_DESIGN_PAGE_SIZE,
} from "../src/neon-kitchen-usage-reader.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { createNeonDashboardStaffWorld } from "./support/neon-dashboard-world.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";
import {
  USAGE_BASIS,
  USAGE_FIXTURES,
  USAGE_ITEMS,
} from "./support/usage-fixture-designs.js";

// Exclusive: a count reads the whole `designs` table, so no other run may write designs meanwhile, and the walk's before
// and after readings must differ by the designs this file plants and by nothing else.
holdExclusiveTestSchemaLock();

const SUITE_NAME = "NeonKitchenUsageReader (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/** Marks the designs planted to read the walk across pages, so a predicate can pick out exactly those. */
const PLANTED_MARK = "2001-01-01T00:00:00.000Z";

/**
 * `NeonKitchenUsageReader` against the test database: the SQL counts and the walk, each over the shared fixture designs
 * written as stored rows, against `usesItem` over the migrated designs. This is the half of the parity the offline test
 * (`neon-kitchen-usage-reader.parity.test.ts`) cannot run: the statements themselves, the exclusion of a design its client
 * deleted, and the keyset walk over real ids. Every reading is a difference from one taken before the rows were planted,
 * so designs the database already holds do not matter, and the walk leaves out any it cannot read.
 *
 * Every planted design names an id this file minted at random, and `afterAll` deletes by those ids alone (ADR 0151).
 */
describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const staff = createNeonDashboardStaffWorld(liveTestDatabaseUrl);
  const plantedIds: string[] = [];
  const reader = () => new NeonKitchenUsageReader(liveTestDatabaseUrl);

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    if (plantedIds.length > 0) {
      await staff.sql()`delete from designs where id = any(${plantedIds})`;
    }
  });

  async function plant(
    schemaVersion: number,
    document: unknown,
    isDeletedByClient: boolean,
  ): Promise<void> {
    const designId = nanoid();
    plantedIds.push(designId);
    await staff.sql()`
      insert into designs (id, schema_version, document, deleted_by_client_at)
      values (${designId}, ${schemaVersion}, ${JSON.stringify(document)}::jsonb,
        case when ${isDeletedByClient}::boolean then now() end)
    `;
  }

  async function plantEveryFixture(): Promise<void> {
    for (const fixture of USAGE_FIXTURES) {
      await plant(
        fixture.schemaVersion,
        fixture.document,
        fixture.isDeletedByClient,
      );
    }
  }

  function countsOf(items: readonly ItemRef[]) {
    return reader()
      .countEach(usageProbesFor(items, USAGE_BASIS))
      .then(({ counts }) => counts);
  }

  function designsUsing(item: ItemRef): number {
    return USAGE_FIXTURES.filter(
      ({ isDeletedByClient }) => !isDeletedByClient,
    ).filter(({ schemaVersion, document }) =>
      usesItem({
        design: migrateDesign(schemaVersion, document),
        item,
        ...USAGE_BASIS,
      }),
    ).length;
  }

  async function expectPlantingMovesEachCountByWhatUsesItemSays(
    items: readonly ItemRef[],
  ): Promise<void> {
    const before = await countsOf(items);
    await plantEveryFixture();
    const after = await countsOf(items);

    for (const item of items) {
      const was = before.find((count) => isSameItem(count.item, item));
      const is = after.find((count) => isSameItem(count.item, item));
      expect(
        (is?.designCount ?? NaN) - (was?.designCount ?? NaN),
        JSON.stringify(item),
      ).toBe(designsUsing(item));
    }
  }

  it("counts the tiers and the linked accessories in SQL as usesItem counts them over the fixture designs, leaving out a deleted design", async () => {
    await expectPlantingMovesEachCountByWhatUsesItemSays(
      USAGE_ITEMS.filter(
        (item) =>
          item.kind === "material" ||
          item.kind === "hardware" ||
          (item.kind === "accessory" &&
            item.accessoryId !== "sinkProtectiveCover" &&
            item.accessoryId !== "dishDryingRack"),
      ),
    );
  });

  it("counts the colours, the handles and the built-in accessories as usesItem counts them over the fixture designs, leaving out a deleted design", async () => {
    await expectPlantingMovesEachCountByWhatUsesItemSays(
      USAGE_ITEMS.filter(
        (item) =>
          item.kind === "finish" ||
          item.kind === "handle" ||
          (item.kind === "accessory" &&
            (item.accessoryId === "sinkProtectiveCover" ||
              item.accessoryId === "dishDryingRack")),
      ),
    );
  });

  it("answers every item of one call in a single reading, each exactly once", async () => {
    const counts = await countsOf(USAGE_ITEMS);

    expect(counts).toHaveLength(USAGE_ITEMS.length);
    for (const item of USAGE_ITEMS) {
      expect(
        counts.filter((count) => isSameItem(count.item, item)),
      ).toHaveLength(1);
    }
  });

  it("walks across pages by id, counting each design once, whatever the number of designs", async () => {
    const isPlanted = (design: Design) => design.createdAt === PLANTED_MARK;
    const probe: ItemUsageProbe = {
      via: "migrated-design",
      item: { kind: "finish", finishId: "veneer.nuc" },
      isUsedBy: isPlanted,
    };
    const markedKitchen = JSON.parse(
      JSON.stringify({
        ...migrateDesign(5, USAGE_FIXTURES[0]?.document),
        createdAt: PLANTED_MARK,
      }),
    ) as unknown;
    const [before] = (await reader().countEach([probe])).counts;

    for (let planted = 0; planted < USAGE_DESIGN_PAGE_SIZE + 5; planted += 1) {
      await plant(5, markedKitchen, false);
    }
    const [after] = (await reader().countEach([probe])).counts;

    expect((after?.designCount ?? NaN) - (before?.designCount ?? NaN)).toBe(
      USAGE_DESIGN_PAGE_SIZE + 5,
    );
  });
});
