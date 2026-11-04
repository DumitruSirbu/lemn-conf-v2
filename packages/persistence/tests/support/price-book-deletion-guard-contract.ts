import type { DraftChange, ItemRef } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type {
  CatalogueAvailabilityStore,
  DeletedItem,
  PriceBookStore,
  PublishPriceBookRequest,
} from "../../src/m10-ports.js";
import {
  aBookLinking,
  aDeletedItem,
  aNewItem,
  dashboardFailureOf,
  linkedBuildIdOf,
  publishNextVersion,
  publishRequestFor,
} from "./dashboard-contract-support.js";
import type {
  DashboardStaffMember,
  DashboardStaffWorld,
  SavedDesignsWorld,
} from "./dashboard-contract-support.js";

// The publish's guard on a deleted item, run by the fake and by the live store alike. The shared test database keeps every
// version a publish appends, so an arm that wants a verdict and not a version reads it from a publish made against a
// stale availability head: a guard that finds a user answers `item-in-use` over that staleness, and one that finds none
// leaves the publish refused as stale, writing nothing.

export interface DeletionGuardWorld
  extends DashboardStaffWorld,
    SavedDesignsWorld {
  readonly store: PriceBookStore;
  readonly availability: CatalogueAvailabilityStore;
}

type DeletableKind = "material" | "hardware" | "accessory";

const DELETABLE_KINDS: readonly DeletableKind[] = [
  "material",
  "hardware",
  "accessory",
];

/** The domain types a deletion to the kinds it can be; the store's refusal of the others is what some arms ask of it. */
function itemDeleted(item: ItemRef): DraftChange {
  return {
    address: { kind: "item-deleted", item },
    value: true,
  } as unknown as DraftChange;
}

/** A publish that deletes the items, naming each to the guard as a caller that left nothing out does. */
function deleting(
  items: readonly ItemRef[],
  overrides: Partial<PublishPriceBookRequest> = {},
): Partial<PublishPriceBookRequest> {
  return {
    changeSummary: items.map(itemDeleted),
    deletedItems: items.map(aDeletedItem),
    ...overrides,
  };
}

async function publishWith(
  world: DeletionGuardWorld,
  staff: DashboardStaffMember,
  overrides: Partial<PublishPriceBookRequest>,
) {
  return world.store.publish(
    await publishRequestFor(world.store, world.availability, staff, {
      label: "Deletion",
      note: "",
      ...overrides,
    }),
  );
}

/** The head one write ahead of the current one: a compare-and-set no publish can pass. */
async function aStaleHead(world: DeletionGuardWorld): Promise<string> {
  const head = await world.availability.readCurrent();
  return world.aRevisionAfter(head.revision, 1);
}

/** Everything a refused publish must leave as it found it. */
async function stateOf(world: DeletionGuardWorld, staff: DashboardStaffMember) {
  return {
    draft: await world.store.readDraft(),
    active: await world.store.readActive(),
    versions: (await world.store.listVersions({ page: 1 })).total,
    availability: await world.availability.readCurrent(),
    audited: await world.auditEventsOf(staff.accountId),
  };
}

/** A new item of the kind and, for an accessory, an active version that states it as linked to the row it is placed by. */
async function aDeletableItem(
  world: DeletionGuardWorld,
  staff: DashboardStaffMember,
  kind: DeletableKind,
): Promise<ItemRef> {
  const item = aNewItem(kind);
  if (item.kind === "accessory") {
    await publishNextVersion(
      world.store,
      world.availability,
      staff,
      aBookLinking([item.accessoryId]),
    );
  }
  return item;
}

function namedThrough(item: ItemRef) {
  return item.kind === "accessory"
    ? { viaBuildId: linkedBuildIdOf(item.accessoryId) }
    : {};
}

export function describeDeletionGuardContract(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describeWhatTheGuardRefuses(suiteName, newWorld);
  describeWhatTheGuardLetsThrough(suiteName, newWorld);
  describeTheRequestsItTurnsAway(suiteName, newWorld);
  describeAgreementWithTheCount(suiteName, newWorld);
}

function describeWhatTheGuardRefuses(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describe(`${suiteName}: a publish that deletes an item a saved design names`, () => {
    it.each(DELETABLE_KINDS)(
      "refuses a deleted %s, naming exactly it, and writes nothing",
      async (kind) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const item = await aDeletableItem(world, staff, kind);
        await world.aDesignNaming(item, namedThrough(item));
        const before = await stateOf(world, staff);

        const result = await publishWith(world, staff, deleting([item]));

        expect(result).toEqual({ kind: "item-in-use", items: [item] });
        expect(await stateOf(world, staff)).toEqual(before);
      },
    );

    it("names only the deleted items in use, in the order the request lists them", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const [first, unused, third] = [
        aNewItem("material"),
        aNewItem("hardware"),
        aNewItem("material"),
      ];
      await world.aDesignNaming(third);
      await world.aDesignNaming(first);

      const result = await publishWith(
        world,
        staff,
        deleting([first, unused, third]),
      );

      expect(result).toEqual({ kind: "item-in-use", items: [first, third] });
    });

    it("answers item-in-use, not a changed-meanwhile, over a stale availability head and over a stale draft revision", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const item = aNewItem("material");
      await world.aDesignNaming(item);
      const before = await stateOf(world, staff);
      const draft = await world.store.readDraft();

      const overStaleHead = await publishWith(
        world,
        staff,
        deleting([item], {
          expectedAvailabilityRevision: await aStaleHead(world),
        }),
      );
      const overStaleDraft = await publishWith(
        world,
        staff,
        deleting([item], {
          expectedDraftRevision: await world.aRevisionAfter(
            draft.draftRevision,
            1,
          ),
        }),
      );

      expect(overStaleHead).toEqual({ kind: "item-in-use", items: [item] });
      expect(overStaleDraft).toEqual({ kind: "item-in-use", items: [item] });
      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("tells nothing of the designs to a call with no live session behind it", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      const item = aNewItem("material");
      await world.aDesignNaming(item);
      const before = await stateOf(world, staff);

      await dashboardFailureOf(
        publishWith(world, gone, deleting([item])),
        "not-recorded",
      );

      expect(await stateOf(world, staff)).toEqual(before);
    });
  });
}

function describeWhatTheGuardLetsThrough(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describe(`${suiteName}: a publish that deletes an item no saved design names`, () => {
    it.each(DELETABLE_KINDS)(
      "publishes a deleted %s that only a design its client deleted names",
      async (kind) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const item = await aDeletableItem(world, staff, kind);
        await world.aDesignNaming(item, {
          ...namedThrough(item),
          isDeletedByClient: true,
        });

        const result = await publishWith(world, staff, deleting([item]));

        expect(result.kind).toBe("ok");
      },
    );

    it("publishes a linked accessory whose build ids hold its row among others", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const item = await aDeletableItem(world, staff, "accessory");
      const row = linkedBuildIdOf(
        (item as { accessoryId: string }).accessoryId,
      );

      const result = await publishWith(world, staff, {
        changeSummary: [itemDeleted(item)],
        deletedItems: [{ item, buildIds: ["another-row", row] } as DeletedItem],
      });

      expect(result.kind).toBe("ok");
    });

    it("needs no entry for a row the draft created and then deleted, a linked accessory included", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const tier = aNewItem("hardware") as { tierId: string };
      const accessory = aNewItem("accessory") as { accessoryId: string };

      const result = await publishWith(world, staff, {
        changeSummary: [
          {
            address: { kind: "hardware-tier-created", tierId: tier.tierId },
            value: { name: "Clasa", description: "O clasa." },
          },
          itemDeleted({ kind: "hardware", tierId: tier.tierId }),
          {
            address: {
              kind: "accessory-created",
              accessoryId: accessory.accessoryId,
            },
            value: { linkedBuildId: "build", perUnitMinor: 1_000, name: "N" },
          },
          itemDeleted({
            kind: "accessory",
            accessoryId: accessory.accessoryId,
          }),
        ] as DraftChange[],
        deletedItems: [],
        createdItems: [],
      });

      expect(result.kind).toBe("ok");
    });
  });
}

function describeTheRequestsItTurnsAway(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describe(`${suiteName}: a publish whose deleted items are not the deletions its summary holds`, () => {
    const asked = (item: ItemRef): DeletedItem => aDeletedItem(item);

    it.each([
      ["leaves a deletion out", (a: ItemRef) => [a], () => []],
      [
        "names an item the summary does not delete",
        (a: ItemRef) => [a],
        (a: ItemRef, b: ItemRef) => [asked(a), asked(b)],
      ],
      [
        "names a deleted item twice",
        (a: ItemRef) => [a],
        (a: ItemRef) => [asked(a), asked(a)],
      ],
      [
        "names a kind of item that is never deleted",
        () => [{ kind: "finish", finishId: "veneer.nuc" } as const],
        () => [
          {
            item: { kind: "finish", finishId: "veneer.nuc" },
          } as unknown as DeletedItem,
        ],
      ],
    ] as const)(
      "refuses one that %s, as an invalid request, writing nothing",
      async (_name, summaryItems, deletedItems) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const [first, second] = [aNewItem("material"), aNewItem("material")];
        const before = await stateOf(world, staff);

        await dashboardFailureOf(
          publishWith(world, staff, {
            changeSummary: summaryItems(first).map(itemDeleted),
            deletedItems: deletedItems(first, second),
          }),
          "invalid-request",
        );

        expect(await stateOf(world, staff)).toEqual(before);
      },
    );

    it.each([
      ["no build ids", () => []],
      ["build ids that lack its row", () => ["some-other-row"]],
    ])(
      "refuses a linked accessory sent with %s, as an invalid request, writing nothing",
      async (_name, buildIds) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const item = await aDeletableItem(world, staff, "accessory");
        await world.aDesignNaming(item, namedThrough(item));
        const before = await stateOf(world, staff);

        await dashboardFailureOf(
          publishWith(world, staff, {
            changeSummary: [itemDeleted(item)],
            deletedItems: [{ item, buildIds: buildIds() } as DeletedItem],
          }),
          "invalid-request",
        );

        expect(await stateOf(world, staff)).toEqual(before);
      },
    );

    it("refuses a deleted linked accessory the active book does not state, as an invalid request, writing nothing", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await publishNextVersion(world.store, world.availability, staff);
      const unstated = aNewItem("accessory");
      await world.aDesignNaming(unstated, namedThrough(unstated));
      const before = await stateOf(world, staff);

      await dashboardFailureOf(
        publishWith(world, staff, deleting([unstated])),
        "invalid-request",
      );

      expect(await stateOf(world, staff)).toEqual(before);
    });
  });
}

function describeAgreementWithTheCount(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describe(`${suiteName}: the guard and the usage count`, () => {
    const WORLDS_OF_DESIGNS = [
      ["no design", 0, 0],
      ["a design", 1, 0],
      ["only a design its client deleted", 0, 1],
      ["a design and a deleted one", 1, 1],
    ] as const;

    it.each(
      DELETABLE_KINDS.flatMap((kind) =>
        WORLDS_OF_DESIGNS.map(
          ([designs, live, deleted]) => [kind, designs, live, deleted] as const,
        ),
      ),
    )(
      "finds a deleted %s in use exactly when the usage count is not zero: %s",
      async (kind, _designs, live, deleted) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const item = await aDeletableItem(world, staff, kind);
        for (let planted = 0; planted < live; planted += 1) {
          await world.aDesignNaming(item, namedThrough(item));
        }
        for (let planted = 0; planted < deleted; planted += 1) {
          await world.aDesignNaming(item, {
            ...namedThrough(item),
            isDeletedByClient: true,
          });
        }
        const buildIds = aDeletedItem(item);

        const counted = await world.countDesignsUsing(
          item,
          "buildIds" in buildIds ? buildIds.buildIds : [],
        );
        const verdict = await publishWith(
          world,
          staff,
          deleting([item], {
            expectedAvailabilityRevision: await aStaleHead(world),
          }),
        );

        expect(counted).toBe(live);
        expect(verdict.kind === "item-in-use").toBe(counted > 0);
        expect(verdict.kind).not.toBe("ok");
      },
    );
  });
}
