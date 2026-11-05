import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  buildIdsPricedAs,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import { planPublish } from "@/lib/server/price-dashboard/publish-plan";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";

/**
 * The deleted items a publish plan hands the store, asked of drafts the first tests did not build: a row the draft made and
 * unmade, an item deleted twice, a link the catalogue does not hold, a kind that is never deleted.
 */
const LINKED_ROW = "base-3drawer";
const RULE = {
  ruleId: "accessory.plinth-light",
  linkedBuildId: LINKED_ROW,
  perUnitMinor: 1_000,
  name: "Soclu luminos",
};
const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [{ accessoryId: "plinth-light", ...RULE }],
};
const REQUEST = {
  expectedDraftRevision: "1",
  expectedActiveSequence: 1,
  expectedAvailabilityRevision: "1",
  label: "L",
  note: "",
};

function deletion(item: unknown): DraftChange {
  return {
    address: { kind: "item-deleted", item },
    value: true,
  } as unknown as DraftChange;
}

function planOf(changes: DraftChange[], book: PriceBook = BOOK) {
  const state = {
    version: { sequenceNumber: 1 },
    book,
    draft: { draftRevision: "1", changes },
  } as unknown as ActiveDashboardState;
  return planPublish(REQUEST, state);
}

describe("the deleted items a publish plan hands the store, over drafts of every shape", () => {
  it("refuses a draft that deletes a material twice, so the store is never asked about it twice", () => {
    const veneer: ItemRef = { kind: "material", tierId: "material.veneer" };

    expect(planOf([deletion(veneer), deletion(veneer)]).kind).toBe("refused");
  });

  it("names nothing for a class the draft creates and then deletes", () => {
    const created = {
      address: { kind: "hardware-tier-created", tierId: "hardware.fresh" },
      value: { name: "Clasa", description: "O clasa." },
    } as unknown as DraftChange;

    const plan = planOf([
      created,
      deletion({ kind: "hardware", tierId: "hardware.fresh" }),
    ]);

    expect(plan).toMatchObject({ kind: "publish", deletedItems: [] });
  });

  it("names a deleted shipped class and a deleted linked accessory in the order the draft deletes them", () => {
    const premium: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
    const plinth: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };

    const plan = planOf([deletion(plinth), deletion(premium)]);

    expect(plan).toMatchObject({
      kind: "publish",
      deletedItems: [
        {
          item: plinth,
          buildIds: buildIdsPricedAs(shippedCatalogue(), LINKED_ROW),
        },
        { item: premium },
      ],
    });
  });

  it("always hands an accessory its own linked row among the build ids, so the store's check on them holds", () => {
    const plan = planOf([
      deletion({ kind: "accessory", accessoryId: "plinth-light" }),
    ]);

    expect(plan.kind).toBe("publish");
    if (plan.kind !== "publish") return;
    const [accessory] = plan.deletedItems;
    expect(accessory).toBeDefined();
    expect(
      accessory !== undefined && "buildIds" in accessory
        ? accessory.buildIds
        : [],
    ).toContain(LINKED_ROW);
  });

  it.each([
    ["a finish", { kind: "finish", finishId: "veneer.nuc" }],
    ["a handle", { kind: "handle", handle: "push" }],
    [
      "a built-in accessory",
      { kind: "accessory", accessoryId: "dishDryingRack" },
    ],
    ["a number", 5],
    ["nothing", undefined],
  ])(
    "never lets %s be deleted into a publish that goes to the store",
    (_what, item) => {
      const plan = planOf([deletion(item)]);

      if (plan.kind === "publish") {
        expect(plan.deletedItems).toEqual([]);
      }
      expect(plan.kind).toBe("refused");
    },
  );

  it("hands an accessory linked to a row the catalogue does not hold build ids that hold that row, which the store requires, or refuses the publish", () => {
    const orphaned: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      linkedAccessories: [
        { accessoryId: "plinth-light", ...RULE, linkedBuildId: "no-such-row" },
      ],
    };

    const plan = planOf(
      [deletion({ kind: "accessory", accessoryId: "plinth-light" })],
      orphaned,
    );

    if (plan.kind === "publish") {
      const [accessory] = plan.deletedItems;
      expect(
        accessory !== undefined && "buildIds" in accessory
          ? accessory.buildIds
          : [],
      ).toContain("no-such-row");
    }
    expect(["publish", "refused"]).toContain(plan.kind);
  });
});
