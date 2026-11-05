import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { NONE_SAVED } from "../src/m10-ports.js";
import {
  newFakeDashboardWorld,
  probeTheFakeAccepts,
} from "./support/fake-dashboard-world.js";
import { describeKitchenDefaultsStoreContract } from "./support/kitchen-defaults-store-contract.js";
import type { DefaultsWorld } from "./support/kitchen-defaults-store-contract.js";

/**
 * The fake, which is also the usage reader, with the fake availability log behind it, as the contract's world. The same
 * contract runs against `NeonKitchenDefaultsStore` and `NeonKitchenUsageReader` in
 * `neon-kitchen-defaults-store.live.test.ts`.
 */
function newDefaultsWorld(): DefaultsWorld {
  const world = newFakeDashboardWorld();
  return {
    ...world,
    store: world.defaults,
    usage: world.defaults,
    probeFor: probeTheFakeAccepts,
    anUnreadableDesign({ isDeletedByClient = false } = {}) {
      world.defaults.plantDesign({
        designId: nanoid(),
        uses: [],
        isDeletedByClient,
        isUnreadable: true,
      });
      return Promise.resolve();
    },
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

describe("FakeKitchenDefaultsStore, asked to count with an aborted signal", () => {
  it("rejects and counts nothing, as the Neon reader does", async () => {
    const world = newDefaultsWorld();
    const item = { kind: "material", tierId: "material.veneer" } as const;
    await world.aDesignUsing({ uses: [item] });
    const controller = new AbortController();
    controller.abort();

    const counting = world.usage.countEach(
      [world.probeFor(item)],
      controller.signal,
    );

    await expect(counting).rejects.toBeInstanceOf(Error);
    expect(
      (await world.usage.countEach([world.probeFor(item)])).counts,
    ).toEqual([{ item, designCount: 1 }]);
  });
});
