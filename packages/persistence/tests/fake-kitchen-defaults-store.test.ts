import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { NONE_SAVED } from "../src/m10-ports.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { describeKitchenDefaultsStoreContract } from "./support/kitchen-defaults-store-contract.js";
import type { DefaultsWorld } from "./support/kitchen-defaults-store-contract.js";

/**
 * The fake, which is also the usage reader, with the fake availability log behind it, as the contract's world. The same
 * contract runs against `NeonKitchenDefaultsStore` and `NeonKitchenUsageReader` when lane S builds them.
 */
function newDefaultsWorld(): DefaultsWorld {
  const world = newFakeDashboardWorld();
  return {
    ...world,
    store: world.defaults,
    usage: world.defaults,
    aDesignUsing({ uses, isDeletedByClient = false }) {
      world.defaults.plantDesign({
        designId: nanoid(),
        uses,
        isDeletedByClient,
      });
      return Promise.resolve();
    },
  };
}

describeKitchenDefaultsStoreContract("FakeKitchenDefaultsStore", () =>
  Promise.resolve(newDefaultsWorld()),
);

describe("FakeKitchenDefaultsStore, before a first save (a table with no row)", () => {
  it("reads as none saved", async () => {
    const world = newDefaultsWorld();

    expect(await world.store.read()).toBe(NONE_SAVED);
  });
});
