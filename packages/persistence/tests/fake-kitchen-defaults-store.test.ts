import { nanoid } from "nanoid";

import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { describeKitchenDefaultsStoreContract } from "./support/kitchen-defaults-store-contract.js";
import type { DefaultsWorld } from "./support/kitchen-defaults-store-contract.js";

/**
 * The fake, which is also the usage reader, with the fake availability log behind it, as the contract's world. The same
 * contract runs against `NeonKitchenDefaultsStore` and `NeonKitchenUsageReader` when lane S builds them.
 */
describeKitchenDefaultsStoreContract("FakeKitchenDefaultsStore", () => {
  const world = newFakeDashboardWorld();
  const defaultsWorld: DefaultsWorld = {
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
  return Promise.resolve(defaultsWorld);
});
