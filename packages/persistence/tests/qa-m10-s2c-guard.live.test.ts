import type { DraftChange, ItemRef } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DeletedItem, ItemUsageProbe } from "../src/m10-ports.js";
import { DashboardStoreError } from "../src/m10-ports.js";
import { runMigrations } from "../src/migrate.js";
import { NeonCatalogueAvailabilityStore } from "../src/neon-catalogue-availability-store.js";
import { NeonKitchenUsageReader } from "../src/neon-kitchen-usage-reader.js";
import { NeonPriceBookStore } from "../src/neon-price-book-store.js";
import {
  A_BOOK,
  aBookLinking,
  aDeletedItem,
  aNewItem,
  aNewItemPair,
  linkedBuildIdOf,
  publishNextVersion,
  publishRequestFor,
} from "./support/dashboard-contract-support.js";
import type { DashboardStaffMember } from "./support/dashboard-contract-support.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { createNeonDashboardStaffWorld } from "./support/neon-dashboard-world.js";
import { createNeonSavedDesigns } from "./support/neon-saved-designs.js";
import type { PriceBookWorld } from "./support/price-book-store-contract.js";
import { describeS2cGuardArms } from "./support/qa-m10-s2c-guard-arms.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: a publish appends a version no test can remove, and the arms below read the newest version and the head.
holdExclusiveTestSchemaLock();

const SUITE_NAME = "the publish's guard on a deleted item (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

function deletion(item: ItemRef): DraftChange {
  return {
    address: { kind: "item-deleted", item },
    value: true,
  } as unknown as DraftChange;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const staff = createNeonDashboardStaffWorld(liveTestDatabaseUrl);
  const designs = createNeonSavedDesigns(staff.sql, liveTestDatabaseUrl);

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await staff.removeTheRowsItMinted();
    await designs.removeTheRowsItPlanted();
  });

  function newWorld(): Promise<PriceBookWorld> {
    return Promise.resolve({
      ...staff.world,
      ...designs.world,
      store: new NeonPriceBookStore(liveTestDatabaseUrl),
      availability: new NeonCatalogueAvailabilityStore(liveTestDatabaseUrl),
    });
  }

  describeS2cGuardArms("NeonPriceBookStore", newWorld);

  async function isInUseAtAStaleHead(
    world: PriceBookWorld,
    member: DashboardStaffMember,
    deleted: DeletedItem,
  ): Promise<boolean> {
    const head = await world.availability.readCurrent();
    const result = await world.store.publish(
      await publishRequestFor(world.store, world.availability, member, {
        expectedAvailabilityRevision: await world.aRevisionAfter(
          head.revision,
          1,
        ),
        changeSummary: [deletion(deleted.item)],
        deletedItems: [deleted],
      }),
    );
    expect(result.kind).not.toBe("ok");
    return result.kind === "item-in-use";
  }

  type CountedItem = Extract<
    ItemRef,
    { readonly kind: "material" | "hardware" | "accessory" }
  >;

  function countOf(
    countedItem: ItemRef,
    buildIds: readonly string[],
    isFallback: boolean,
  ) {
    const item = countedItem as CountedItem;
    const probe: ItemUsageProbe =
      item.kind === "accessory"
        ? { via: "placed-bodies", item, buildIds }
        : { via: "settings-tier", item, isFallback };
    return new NeonKitchenUsageReader(liveTestDatabaseUrl)
      .countEach([probe])
      .then(({ counts }) => counts[0]?.designCount ?? NaN);
  }

  describe("a tier that is the active book's default", () => {
    const DEFAULT_MATERIAL = `default-material-${nanoid(8)}`;
    const DEFAULT_HARDWARE = `default-hardware-${nanoid(8)}`;
    const KINDS = [
      ["material", DEFAULT_MATERIAL, "materialTierId", "hardwareTierId"],
      ["hardware", DEFAULT_HARDWARE, "hardwareTierId", "materialTierId"],
    ] as const;

    async function worldWithDefaults() {
      const world = await newWorld();
      const member = await world.aStaffMember();
      await publishNextVersion(world.store, world.availability, member, {
        ...A_BOOK,
        material: { defaultTierId: DEFAULT_MATERIAL, tiers: [] },
        hardware: { defaultTierId: DEFAULT_HARDWARE, tiers: [] },
      });
      return { world, member };
    }

    async function theGuardAgreesWithTheCount(
      world: PriceBookWorld,
      member: DashboardStaffMember,
      item: ItemRef,
    ): Promise<number> {
      const count = await countOf(item, [], true);
      const verdict = await isInUseAtAStaleHead(world, member, {
        item,
      } as DeletedItem);
      expect(verdict, JSON.stringify(item)).toBe(count > 0);
      return count;
    }

    it.each(KINDS)(
      "counts a design that makes no choice of a %s tier as using it, in the guard as in the count",
      async (kind, defaultId, thisKey, otherKey) => {
        const { world, member } = await worldWithDefaults();
        const item = { kind, tierId: defaultId } as ItemRef;
        const noChoices = [
          { placements: [] },
          { settings: {}, placements: [] },
          { settings: { [thisKey]: null }, placements: [] },
          { settings: { [otherKey]: "something-else" }, placements: [] },
        ];
        let expected = await theGuardAgreesWithTheCount(world, member, item);

        for (const document of noChoices) {
          await designs.plantStoredDesign({
            schemaVersion: 5,
            document,
            isDeletedByClient: false,
          });
          expected += 1;
          expect(
            await theGuardAgreesWithTheCount(world, member, item),
            JSON.stringify(document),
          ).toBe(expected);
        }
        expect(
          await isInUseAtAStaleHead(world, member, { item } as DeletedItem),
        ).toBe(true);
      },
    );

    it.each(KINDS)(
      "leaves a %s default alone for a design that chose another tier, and for one its client deleted",
      async (kind, defaultId, thisKey) => {
        const { world, member } = await worldWithDefaults();
        const item = { kind, tierId: defaultId } as ItemRef;
        const before = await theGuardAgreesWithTheCount(world, member, item);

        await designs.plantStoredDesign({
          schemaVersion: 5,
          document: { settings: { [thisKey]: "another-tier" }, placements: [] },
          isDeletedByClient: false,
        });
        await designs.plantStoredDesign({
          schemaVersion: 5,
          document: { placements: [] },
          isDeletedByClient: true,
        });
        await designs.plantStoredDesign({
          schemaVersion: 5,
          document: { settings: { [thisKey]: "" }, placements: [] },
          isDeletedByClient: false,
        });

        expect(await theGuardAgreesWithTheCount(world, member, item)).toBe(
          before,
        );
      },
    );

    it("treats a tier that is not the default as chosen only by naming it, whatever designs make no choice", async () => {
      const { world, member } = await worldWithDefaults();
      const item = aNewItem("material");
      await designs.plantStoredDesign({
        schemaVersion: 5,
        document: { placements: [] },
        isDeletedByClient: false,
      });
      const guard = () =>
        isInUseAtAStaleHead(world, member, aDeletedItem(item));

      expect(await guard()).toBe(false);
      expect(await countOf(item, [], false)).toBe(0);

      await world.aDesignNaming(item);

      expect(await guard()).toBe(true);
    });

    it("reads the default of the same kind from the book, and not the other kind's", async () => {
      const { world, member } = await worldWithDefaults();
      await designs.plantStoredDesign({
        schemaVersion: 5,
        document: { placements: [] },
        isDeletedByClient: false,
      });
      const hardwareNamedLikeTheMaterialDefault = {
        kind: "hardware",
        tierId: DEFAULT_MATERIAL,
      } as ItemRef;

      const verdict = await isInUseAtAStaleHead(world, member, {
        item: hardwareNamedLikeTheMaterialDefault,
      } as DeletedItem);

      expect(verdict).toBe(
        (await countOf(hardwareNamedLikeTheMaterialDefault, [], false)) > 0,
      );
      expect(verdict).toBe(false);
    });
  });

  describe("stored documents of every odd shape", () => {
    const ROW = "row-for-odd-documents";
    const ODD_DOCUMENTS: readonly (readonly [string, unknown])[] = [
      ["a null", null],
      ["an array", []],
      ["a number", 5],
      ["a text", "settings"],
      ["an empty object", {}],
      ["a settings that is a text", { settings: "x", placements: [] }],
      ["a settings that is an array", { settings: [], placements: [] }],
      [
        "a tier id that is an object",
        { settings: { materialTierId: { a: 1 } } },
      ],
      ["a tier id that is a list", { settings: { materialTierId: ["t"] } }],
      [
        "placements that is an object",
        { placements: { body: { buildId: ROW } } },
      ],
      ["placements that is a text", { placements: ROW }],
      ["placements of nulls and numbers", { placements: [null, 5, "x", []] }],
      ["a body that is null", { placements: [{ id: "p", body: null }] }],
      [
        "a body id that is a number",
        { placements: [{ id: "p", body: { buildId: 5 } }] },
      ],
      [
        "a body id that is a list",
        { placements: [{ id: "p", body: { buildId: [ROW] } }] },
      ],
      [
        "a placed body of the row",
        { placements: [{ id: "p", body: { buildId: ROW } }] },
      ],
    ];

    it.each(ODD_DOCUMENTS)(
      "gives the guard and the count one verdict for a document with %s, and neither fails",
      async (_what, document) => {
        const world = await newWorld();
        const member = await world.aStaffMember();
        const accessory = {
          kind: "accessory",
          accessoryId: `odd-${nanoid(8)}`,
        } as const;
        const tier = aNewItem("material");
        await publishNextVersion(
          world.store,
          world.availability,
          member,
          aBookLinking([accessory.accessoryId]),
        );
        const accessoryRow: DeletedItem = {
          item: accessory,
          buildIds: [linkedBuildIdOf(accessory.accessoryId), ROW],
        };
        const accessoriesBefore = await countOf(
          accessory,
          accessoryRow.buildIds,
          false,
        );
        const tiersBefore = await countOf(tier, [], false);

        await designs.plantStoredDesign({
          schemaVersion: 5,
          document,
          isDeletedByClient: false,
        });

        const accessoryCount = await countOf(
          accessory,
          accessoryRow.buildIds,
          false,
        );
        const tierCount = await countOf(tier, [], false);
        const placesTheRow =
          typeof document === "object" &&
          document !== null &&
          Array.isArray((document as { placements?: unknown }).placements) &&
          (document as { placements: unknown[] }).placements.some(
            (placement) =>
              typeof placement === "object" &&
              placement !== null &&
              (placement as { body?: { buildId?: unknown } }).body?.buildId ===
                ROW,
          );
        expect(tierCount - tiersBefore).toBe(0);
        expect(accessoryCount - accessoriesBefore).toBe(placesTheRow ? 1 : 0);
        expect(await isInUseAtAStaleHead(world, member, accessoryRow)).toBe(
          accessoryCount > 0,
        );
        expect(
          await isInUseAtAStaleHead(world, member, aDeletedItem(tier)),
        ).toBe(tierCount > 0);
      },
    );
  });

  describe("a stored design the product cannot open", () => {
    it.each([
      ["a schema version no migration reads", 999],
      ["a schema version that is zero", 0],
    ])("still names its tier, through %s", async (_what, schemaVersion) => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const item = aNewItem("material") as { kind: "material"; tierId: string };

      await designs.plantStoredDesign({
        schemaVersion,
        document: { settings: { materialTierId: item.tierId } },
        isDeletedByClient: false,
      });

      expect(await countOf(item, [], false)).toBe(1);
      expect(await isInUseAtAStaleHead(world, member, aDeletedItem(item))).toBe(
        true,
      );
    });
  });

  describe("a tier id the database cannot hold in a json text", () => {
    it("is refused as an invalid request or found unused, and never reaches a driver error", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const item: ItemRef = { kind: "material", tierId: "tier-\u0000-nul" };
      const head = await world.availability.readCurrent();

      const outcome = await world.store
        .publish(
          await publishRequestFor(world.store, world.availability, member, {
            expectedAvailabilityRevision: await world.aRevisionAfter(
              head.revision,
              1,
            ),
            changeSummary: [deletion(item)],
            deletedItems: [aDeletedItem(item)],
          }),
        )
        .then(
          (result) => result.kind,
          (failure: unknown) =>
            failure instanceof DashboardStoreError
              ? `failure:${failure.failure}`
              : `error:${String(failure)}`,
        );

      expect([
        "availability-changed-meanwhile",
        "failure:invalid-request",
      ]).toContain(outcome);
    });
  });

  describe("the fake and the live store, given one request", () => {
    const STRAY_BUILD_IDS: readonly (readonly [string, unknown])[] = [
      ["an empty list", []],
      ["a list of ids", ["row-1"]],
      ["a text", "row-1"],
      ["null", null],
      ["a number", 5],
    ];

    async function answerOf(
      world: PriceBookWorld,
      deleted: unknown,
      item: ItemRef,
    ): Promise<string> {
      const member = await world.aStaffMember();
      await publishNextVersion(world.store, world.availability, member);
      const head = await world.availability.readCurrent();
      return world.store
        .publish(
          await publishRequestFor(world.store, world.availability, member, {
            expectedAvailabilityRevision: await world.aRevisionAfter(
              head.revision,
              1,
            ),
            changeSummary: [deletion(item)],
            deletedItems: [deleted] as DeletedItem[],
          }),
        )
        .then(
          (result) => result.kind,
          (failure: unknown) =>
            failure instanceof DashboardStoreError
              ? `failure:${failure.failure}`
              : `error:${String(failure)}`,
        );
    }

    function theFake(): PriceBookWorld {
      const fake = newFakeDashboardWorld();
      return { ...fake, store: fake.priceBook };
    }

    it.each(
      [true, false].flatMap((isUsed) =>
        STRAY_BUILD_IDS.map(([what, stray]) => [isUsed, what, stray] as const),
      ),
    )(
      "answers alike for a tier sent with stray build ids (used: %s; %s)",
      async (isUsed, _what, stray) => {
        const item = aNewItem("material");
        const request = { item, buildIds: stray };
        const live = await newWorld();
        const fake = theFake();
        if (isUsed) {
          await live.aDesignNaming(item);
          await fake.aDesignNaming(item);
        }

        const answers = {
          fake: await answerOf(fake, request, item),
          live: await answerOf(live, request, item),
        };

        expect(answers.fake).toBe(answers.live);
      },
    );
  });

  describe("what a refusal leaves in the tables", () => {
    async function tablesOf() {
      const rows = await staff.sql()`
        select (select count(*)::int from price_book_versions) as versions,
          (select revision::text from price_book_draft) as draft_revision,
          (select changes::text from price_book_draft) as draft_changes,
          (select revision::text from catalogue_availability_head) as head,
          (select count(*)::int from catalogue_availability_changes) as log_rows,
          (select count(*)::int from staff_audit_events where action = 'price-published') as published_rows
      `;
      return rows[0];
    }

    it("is nothing for an item in use refused at fresh revisions, with items to create", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const used = aNewItem("hardware");
      await world.aDesignNaming(used);
      const before = await tablesOf();

      const result = await world.store.publish(
        await publishRequestFor(world.store, world.availability, member, {
          changeSummary: [deletion(used)],
          deletedItems: [aDeletedItem(used)],
          createdItems: aNewItemPair(),
        }),
      );

      expect(result).toEqual({ kind: "item-in-use", items: [used] });
      expect(await tablesOf()).toEqual(before);
    });

    it("is nothing for an accessory the book does not link, refused at fresh revisions", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      await publishNextVersion(world.store, world.availability, member);
      const unlinked = aNewItem("accessory");
      const before = await tablesOf();

      const failure = await world.store
        .publish(
          await publishRequestFor(world.store, world.availability, member, {
            changeSummary: [deletion(unlinked)],
            deletedItems: [aDeletedItem(unlinked)],
            createdItems: aNewItemPair(),
          }),
        )
        .then(
          () => undefined,
          (rejection: unknown) => rejection,
        );

      expect(failure).toBeInstanceOf(DashboardStoreError);
      expect((failure as DashboardStoreError).failure).toBe("invalid-request");
      expect(await tablesOf()).toEqual(before);
    });

    it("is nothing for a caller who may not publish, and no design is read for them", async () => {
      const world = await newWorld();
      const operator = await world.aStaffMemberWhoIsNotAnAdministrator();
      const used = aNewItem("material");
      await world.aDesignNaming(used);
      const before = await tablesOf();

      const failure = await world.store
        .publish(
          await publishRequestFor(world.store, world.availability, operator, {
            changeSummary: [deletion(used)],
            deletedItems: [aDeletedItem(used)],
            createdItems: aNewItemPair(),
          }),
        )
        .then(
          () => undefined,
          (rejection: unknown) => rejection,
        );

      expect((failure as DashboardStoreError).failure).toBe("not-recorded");
      expect(await tablesOf()).toEqual(before);
    });
  });
});
