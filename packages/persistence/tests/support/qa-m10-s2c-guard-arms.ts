import type { DraftChange, ItemRef } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { DashboardStoreError } from "../../src/m10-ports.js";
import type {
  DeletedItem,
  PublishPriceBookRequest,
} from "../../src/m10-ports.js";
import {
  aBookLinking,
  aDeletedItem,
  aNewItem,
  aNewItemPair,
  dashboardFailureOf,
  linkedBuildIdOf,
  publishNextVersion,
  publishRequestFor,
} from "./dashboard-contract-support.js";
import type { DashboardStaffMember } from "./dashboard-contract-support.js";
import type { DeletionGuardWorld } from "./price-book-deletion-guard-contract.js";

// Counterexample arms for the publish's guard on a deleted item, run by the fake and by the live store alike. A verdict is
// read from a publish made at a stale availability head, so no arm that wants only the guard's answer appends a version.

type StoreKind = "material" | "hardware" | "accessory";

function deletion(item: ItemRef): DraftChange {
  return {
    address: { kind: "item-deleted", item },
    value: true,
  } as unknown as DraftChange;
}

function summaryOf(items: readonly ItemRef[]): DraftChange[] {
  return items.map(deletion);
}

async function aStaleHead(world: DeletionGuardWorld): Promise<string> {
  const head = await world.availability.readCurrent();
  return world.aRevisionAfter(head.revision, 1);
}

async function publishAtAStaleHead(
  world: DeletionGuardWorld,
  staff: DashboardStaffMember,
  overrides: Partial<PublishPriceBookRequest>,
) {
  return world.store.publish(
    await publishRequestFor(world.store, world.availability, staff, {
      label: "Deletion",
      note: "",
      expectedAvailabilityRevision: await aStaleHead(world),
      ...overrides,
    }),
  );
}

/** What a publish came to, as one word: its result's kind, or the store failure it was refused with. */
async function outcomeOf(pending: Promise<{ kind: string }>): Promise<string> {
  try {
    return (await pending).kind;
  } catch (failure) {
    if (failure instanceof DashboardStoreError) {
      return `failure:${failure.failure}`;
    }
    return `error:${String(failure)}`;
  }
}

async function aLinkedAccessory(
  world: DeletionGuardWorld,
  staff: DashboardStaffMember,
  accessoryIds: readonly string[],
): Promise<void> {
  await publishNextVersion(
    world.store,
    world.availability,
    staff,
    aBookLinking(accessoryIds),
  );
}

export function describeS2cGuardArms(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describeTheOrderOfTheAnswers(suiteName, newWorld);
  describeTheItemsItNames(suiteName, newWorld);
  describeAMalformedDeletedItem(suiteName, newWorld);
}

function describeTheOrderOfTheAnswers(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describe(`${suiteName}: what a caller learns of the designs`, () => {
    it.each([
      ["an operator", "aStaffMemberWhoIsNotAnAdministrator"],
      ["a client", "aClientWithALiveSession"],
      [
        "an administrator demoted after signing in",
        "aStaffMemberDemotedAfterSigningIn",
      ],
      [
        "an administrator whose session is revoked",
        "aStaffMemberWhoseSessionIsRevoked",
      ],
    ] as const)(
      "tells %s who deletes an item in use nothing of it: not-recorded",
      async (_who, caller) => {
        const world = await newWorld();
        const used = aNewItem("material");
        await world.aDesignNaming(used);
        const member = await world[caller]();

        await dashboardFailureOf(
          world.store.publish(
            await publishRequestFor(world.store, world.availability, member, {
              changeSummary: summaryOf([used]),
              deletedItems: [aDeletedItem(used)],
              expectedAvailabilityRevision: await aStaleHead(world),
            }),
          ),
          "not-recorded",
        );
      },
    );

    it.each([
      ["an operator", "aStaffMemberWhoIsNotAnAdministrator"],
      [
        "an administrator whose session is revoked",
        "aStaffMemberWhoseSessionIsRevoked",
      ],
    ] as const)(
      "tells %s who deletes an accessory the book does not link nothing either: not-recorded, not invalid-request",
      async (_who, caller) => {
        const world = await newWorld();
        const owner = await world.aStaffMember();
        await publishNextVersion(world.store, world.availability, owner);
        const unlinked = aNewItem("accessory");
        const member = await world[caller]();

        await dashboardFailureOf(
          world.store.publish(
            await publishRequestFor(world.store, world.availability, member, {
              changeSummary: summaryOf([unlinked]),
              deletedItems: [aDeletedItem(unlinked)],
              expectedAvailabilityRevision: await aStaleHead(world),
            }),
          ),
          "not-recorded",
        );
      },
    );

    it("answers invalid-request, not item-in-use, when an unlinked accessory is deleted beside an item in use", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await publishNextVersion(world.store, world.availability, staff);
      const used = aNewItem("hardware");
      const unlinked = aNewItem("accessory");
      await world.aDesignNaming(used);

      await dashboardFailureOf(
        publishAtAStaleHead(world, staff, {
          changeSummary: summaryOf([used, unlinked]),
          deletedItems: [aDeletedItem(used), aDeletedItem(unlinked)],
        }),
        "invalid-request",
      );
    });
  });
}

function describeTheItemsItNames(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describe(`${suiteName}: the items a refusal names`, () => {
    it("names a material and not the hardware class of the same id when only the material is in use", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const id = aNewItem("material") as { tierId: string };
      const material: ItemRef = { kind: "material", tierId: id.tierId };
      const hardware: ItemRef = { kind: "hardware", tierId: id.tierId };
      await world.aDesignNaming(material);

      const result = await publishAtAStaleHead(world, staff, {
        changeSummary: summaryOf([hardware, material]),
        deletedItems: [aDeletedItem(hardware), aDeletedItem(material)],
      });

      expect(result).toEqual({ kind: "item-in-use", items: [material] });
    });

    it("names a hardware class and not the material of the same id when only the hardware class is in use", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const id = aNewItem("material") as { tierId: string };
      const material: ItemRef = { kind: "material", tierId: id.tierId };
      const hardware: ItemRef = { kind: "hardware", tierId: id.tierId };
      await world.aDesignNaming(hardware);

      const result = await publishAtAStaleHead(world, staff, {
        changeSummary: summaryOf([material, hardware]),
        deletedItems: [aDeletedItem(material), aDeletedItem(hardware)],
      });

      expect(result).toEqual({ kind: "item-in-use", items: [hardware] });
    });

    it("names, of tiers and linked accessories deleted together, only those in use, in the request's order", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const [unusedTier, usedTier] = [
        aNewItem("material"),
        aNewItem("hardware"),
      ];
      const [unusedAccessory, usedAccessory] = [
        aNewItem("accessory"),
        aNewItem("accessory"),
      ];
      await aLinkedAccessory(world, staff, [
        (unusedAccessory as { accessoryId: string }).accessoryId,
        (usedAccessory as { accessoryId: string }).accessoryId,
      ]);
      const aliasOfTheRow = "a-body-priced-as-the-row";
      await world.aDesignNaming(usedAccessory, { viaBuildId: aliasOfTheRow });
      await world.aDesignNaming(usedTier);
      const deleted: DeletedItem[] = [
        aDeletedItem(unusedAccessory),
        {
          item: usedAccessory,
          buildIds: [
            aliasOfTheRow,
            linkedBuildIdOf(
              (usedAccessory as { accessoryId: string }).accessoryId,
            ),
          ],
        } as DeletedItem,
        aDeletedItem(unusedTier),
        aDeletedItem(usedTier),
      ];

      const result = await publishAtAStaleHead(world, staff, {
        changeSummary: summaryOf(deleted.map(({ item }) => item)),
        deletedItems: deleted,
      });

      expect(result).toEqual({
        kind: "item-in-use",
        items: [usedAccessory, usedTier],
      });
    });

    it("finds the one used item among many deleted ones, whichever place it holds in the request", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const items = Array.from({ length: 40 }, () => aNewItem("material"));
      const usedIndexes = [0, 17, 39];
      const used = items.filter((_, index) => usedIndexes.includes(index));
      for (const item of used) await world.aDesignNaming(item);

      const result = await publishAtAStaleHead(world, staff, {
        changeSummary: summaryOf(items),
        deletedItems: items.map(aDeletedItem),
      });

      expect(result).toEqual({
        kind: "item-in-use",
        items: used,
      });
    });

    it.each([
      ["a quote", "mat'erial"],
      ["a double quote", 'mat"erial'],
      ["a backslash", "mat\\erial"],
      ["a percent sign and an underscore", "mat%_erial"],
      ["a statement", "x'); drop table designs; --"],
      ["a json object", '{"a":1}'],
      ["a multibyte letter", "mat\u00E9rial-\u{1F373}"],
      ["a space", "  spaced  "],
    ])(
      "keeps a tier id with %s as data: in use when a design names it, not when one names another",
      async (_what, tierId) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const item: ItemRef = { kind: "material", tierId };
        const another: ItemRef = { kind: "material", tierId: `${tierId}-x` };
        await world.aDesignNaming(another);
        const unused = await publishAtAStaleHead(world, staff, {
          changeSummary: summaryOf([item]),
          deletedItems: [aDeletedItem(item)],
        });
        await world.aDesignNaming(item);

        const used = await publishAtAStaleHead(world, staff, {
          changeSummary: summaryOf([item]),
          deletedItems: [aDeletedItem(item)],
        });

        expect(unused.kind).toBe("availability-changed-meanwhile");
        expect(used).toEqual({ kind: "item-in-use", items: [item] });
      },
    );

    it("guards a linked accessory whose id holds a quote, through a build id that does", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const accessory: ItemRef = {
        kind: "accessory",
        accessoryId: "acc'\"\\x",
      };
      await aLinkedAccessory(world, staff, ["acc'\"\\x"]);
      await world.aDesignNaming(accessory, { viaBuildId: "row-acc'\"\\x" });

      const result = await publishAtAStaleHead(world, staff, {
        changeSummary: summaryOf([accessory]),
        deletedItems: [
          { item: accessory, buildIds: ["row-acc'\"\\x"] } as DeletedItem,
        ],
      });

      expect(result).toEqual({ kind: "item-in-use", items: [accessory] });
    });
  });
}

function describeAMalformedDeletedItem(
  suiteName: string,
  newWorld: () => Promise<DeletionGuardWorld>,
): void {
  describe(`${suiteName}: a deleted item that is not shaped as the port says`, () => {
    const STRAY_BUILD_IDS = [
      ["an empty list", []],
      ["a list of ids", ["row-1"]],
      ["a text", "row-1"],
      ["null", null],
      ["a number", 5],
    ] as const;

    it.each(
      (["material", "hardware"] as const).flatMap((kind) =>
        STRAY_BUILD_IDS.map(([what, stray]) => [kind, what, stray] as const),
      ),
    )(
      "never lets a %s sent with %s as build ids past the guard or crash it, when a design names the item",
      async (kind, _what, stray) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const item = aNewItem(kind as StoreKind);
        await world.aDesignNaming(item);

        const outcome = await outcomeOf(
          publishAtAStaleHead(world, staff, {
            changeSummary: summaryOf([item]),
            deletedItems: [
              { item, buildIds: stray },
            ] as unknown as DeletedItem[],
          }),
        );

        expect(["item-in-use", "failure:invalid-request"]).toContain(outcome);
      },
    );

    it.each([
      ["a list of ids", ["row-1"]],
      ["a text", "row-1"],
      ["null", null],
    ] as const)(
      "answers one thing for a tier sent with %s as build ids when no design names it, whatever the store",
      async (_what, stray) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const item = aNewItem("material");

        const outcome = await outcomeOf(
          publishAtAStaleHead(world, staff, {
            changeSummary: summaryOf([item]),
            deletedItems: [
              { item, buildIds: stray },
            ] as unknown as DeletedItem[],
          }),
        );

        expect([
          "availability-changed-meanwhile",
          "failure:invalid-request",
        ]).toContain(outcome);
      },
    );

    it.each([
      ["a number for the item", { item: 5 }],
      ["no item", {}],
      ["a text for the item", { item: "material" }],
      ["an item of no kind", { item: { tierId: "t" } }],
      [
        "a material with a numeric id",
        { item: { kind: "material", tierId: 5 } },
      ],
      [
        "a material with an empty id",
        { item: { kind: "material", tierId: "" } },
      ],
    ])(
      "refuses a deleted item with %s as an invalid request, writing nothing",
      async (_what, malformed) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const before = await world.store.listVersions({ page: 1 });

        await dashboardFailureOf(
          publishAtAStaleHead(world, staff, {
            changeSummary: [],
            deletedItems: [malformed] as unknown as DeletedItem[],
          }),
          "invalid-request",
        );

        expect(await world.store.listVersions({ page: 1 })).toEqual(before);
      },
    );

    it.each([
      ["null", null],
      ["an object", {}],
      ["a text", "material"],
      ["undefined", undefined],
    ])(
      "refuses deleted items that are %s instead of a list, as an invalid request",
      async (_what, notAList) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();

        await dashboardFailureOf(
          publishAtAStaleHead(world, staff, {
            deletedItems: notAList as unknown as DeletedItem[],
          }),
          "invalid-request",
        );
      },
    );

    it("refuses a summary that deletes an item twice when the request lists it twice, as an invalid request", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const item = aNewItem("material");

      await dashboardFailureOf(
        publishAtAStaleHead(world, staff, {
          changeSummary: summaryOf([item, item]),
          deletedItems: [aDeletedItem(item), aDeletedItem(item)],
        }),
        "invalid-request",
      );
    });

    it("accepts a summary that deletes an item twice when the request lists it once", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const item = aNewItem("material");

      const outcome = await outcomeOf(
        publishAtAStaleHead(world, staff, {
          changeSummary: summaryOf([item, item]),
          deletedItems: [aDeletedItem(item)],
        }),
      );

      expect(outcome).toBe("availability-changed-meanwhile");
    });

    it("needs no entry for an item deleted after the draft created it, and refuses an entry for it", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const tier = aNewItem("hardware") as { tierId: string };
      const created: DraftChange = {
        address: { kind: "hardware-tier-created", tierId: tier.tierId },
        value: { name: "Clasa", description: "O clasa." },
      } as DraftChange;
      const summary = [
        created,
        deletion({ kind: "hardware", tierId: tier.tierId }),
      ];

      await dashboardFailureOf(
        publishAtAStaleHead(world, staff, {
          changeSummary: summary,
          deletedItems: [
            aDeletedItem({ kind: "hardware", tierId: tier.tierId }),
          ],
          createdItems: [],
        }),
        "invalid-request",
      );
    });

    it("guards an item the draft deletes and then creates again, since the book it started from held it", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const tier = aNewItem("hardware") as { tierId: string };
      const item: ItemRef = { kind: "hardware", tierId: tier.tierId };
      const created: DraftChange = {
        address: { kind: "hardware-tier-created", tierId: tier.tierId },
        value: { name: "Clasa", description: "O clasa." },
      } as DraftChange;
      await world.aDesignNaming(item);

      const result = await publishAtAStaleHead(world, staff, {
        changeSummary: [deletion(item), created],
        deletedItems: [aDeletedItem(item)],
        createdItems: [item],
      });

      expect(result).toEqual({ kind: "item-in-use", items: [item] });
    });

    it("writes no created item's log row when the guard refuses, even with items to create", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const used = aNewItem("material");
      await world.aDesignNaming(used);
      const headBefore = await world.availability.readCurrent();

      const result = await publishAtAStaleHead(world, staff, {
        changeSummary: summaryOf([used]),
        deletedItems: [aDeletedItem(used)],
        createdItems: aNewItemPair(),
      });

      expect(result.kind).toBe("item-in-use");
      expect(await world.availability.readCurrent()).toEqual(headBefore);
    });
  });
}
