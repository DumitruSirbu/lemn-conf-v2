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
 * What the publish plan hands the store's guard on a deleted item. The draft routes refuse a deletion today, so the plan
 * is asked directly, with a draft that holds one.
 */
const LINKED_ROW = "base-3drawer";
const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: "plinth-light",
      ruleId: "accessory.plinth-light",
      linkedBuildId: LINKED_ROW,
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const REQUEST = {
  expectedDraftRevision: "1",
  expectedActiveSequence: 1,
  expectedAvailabilityRevision: "1",
  label: "L",
  note: "",
};

function deleting(...items: ItemRef[]): DraftChange[] {
  return items.map(
    (item) =>
      ({
        address: { kind: "item-deleted", item },
        value: true,
      }) as unknown as DraftChange,
  );
}

function planOf(changes: DraftChange[]) {
  const state = {
    version: { sequenceNumber: 1 },
    book: BOOK,
    draft: { draftRevision: "1", changes },
  } as unknown as ActiveDashboardState;
  return planPublish(REQUEST, state);
}

describe("the deleted items a publish plan hands the store", () => {
  it("is none for a draft that deletes nothing", () => {
    const plan = planOf([
      { address: { kind: "depth-rule" }, value: 40 } as DraftChange,
    ]);

    expect(plan).toMatchObject({ kind: "publish", deletedItems: [] });
  });

  it("names a tier alone, and a linked accessory with the rows the catalogue prices as the one it is linked to", () => {
    const plan = planOf(deleting(VENEER, PLINTH));

    expect(plan).toMatchObject({
      kind: "publish",
      deletedItems: [
        { item: VENEER },
        {
          item: PLINTH,
          buildIds: buildIdsPricedAs(shippedCatalogue(), LINKED_ROW),
        },
      ],
    });
  });

  it("refuses, before any deleted item is named, a draft that deletes an accessory the active book states no rule for", () => {
    const unstated: ItemRef = { kind: "accessory", accessoryId: "no-rule" };

    expect(planOf(deleting(unstated)).kind).toBe("refused");
  });
});
