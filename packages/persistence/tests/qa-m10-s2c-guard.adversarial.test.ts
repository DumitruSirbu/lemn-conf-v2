import { describe, expect, it } from "vitest";

import {
  aDeletedItem,
  aNewItem,
  publishRequestFor,
} from "./support/dashboard-contract-support.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { describeS2cGuardArms } from "./support/qa-m10-s2c-guard-arms.js";
import type { DeletionGuardWorld } from "./support/price-book-deletion-guard-contract.js";

function newGuardWorld(): DeletionGuardWorld &
  ReturnType<typeof newFakeDashboardWorld> {
  const world = newFakeDashboardWorld();
  return { ...world, store: world.priceBook };
}

describeS2cGuardArms("FakePriceBookStore", () =>
  Promise.resolve(newGuardWorld()),
);

describe("FakePriceBookStore: a saved design the product cannot open", () => {
  it("still names the tier its stored document names, as the live statement reads the document as written", async () => {
    const world = newGuardWorld();
    const staff = await world.aStaffMember();
    const item = aNewItem("material");
    world.defaults.plantDesign({
      designId: "unopenable",
      uses: [item],
      isDeletedByClient: false,
      isUnreadable: true,
    });
    const head = await world.availability.readCurrent();

    const result = await world.store.publish(
      await publishRequestFor(world.store, world.availability, staff, {
        changeSummary: [
          { address: { kind: "item-deleted", item }, value: true },
        ] as never,
        deletedItems: [aDeletedItem(item)],
        expectedAvailabilityRevision: await world.aRevisionAfter(
          head.revision,
          1,
        ),
      }),
    );

    expect(result).toEqual({ kind: "item-in-use", items: [item] });
  });
});
