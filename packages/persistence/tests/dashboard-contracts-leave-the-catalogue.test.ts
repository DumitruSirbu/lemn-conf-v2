import type { ItemRef } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { itemKeyOf } from "../src/fake-dashboard-support.js";
import { describeCatalogueAvailabilityStoreContract } from "./support/catalogue-availability-store-contract.js";
import {
  activationEntryFor,
  auditRecordOf,
} from "./support/dashboard-contract-support.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { describeKitchenDefaultsStoreContract } from "./support/kitchen-defaults-store-contract.js";
import { describePriceBookStoreContract } from "./support/price-book-store-contract.js";
import { describePriceNoticeStoreContract } from "./support/price-notice-store-contract.js";

// The contracts also run against a shared test database whose catalogue log is append-only and holds the real items
// (ADR 0151). A contract that switches a real item off, or back on, changes what every later reader of that database
// sees. So every contract may switch only items it minted. This file lets the contracts run against one world whose real
// items already stand in a known state, and then reads every one of them again.

const REAL_ITEMS: readonly ItemRef[] = [
  { kind: "material", tierId: "pal" },
  { kind: "material", tierId: "mdf" },
  { kind: "material", tierId: "fenix" },
  { kind: "hardware", tierId: "standard" },
  { kind: "hardware", tierId: "premium" },
  { kind: "finish", finishId: "walnut" },
  { kind: "handle", handle: "steel" },
  { kind: "accessory", accessoryId: "plinth-light" },
  { kind: "accessory", accessoryId: "sinkProtectiveCover" },
  { kind: "accessory", accessoryId: "dishDryingRack" },
];

/** Switched off before the contracts run; every other real item is on. */
const REAL_ITEMS_SWITCHED_OFF: readonly ItemRef[] = [
  { kind: "material", tierId: "fenix" },
  { kind: "handle", handle: "steel" },
];

const world = newFakeDashboardWorld();

async function realItemsSwitchedOff(): Promise<string[]> {
  const { disabled } = await world.availability.readCurrent();
  const off = new Set(disabled.map(itemKeyOf));
  return REAL_ITEMS.map(itemKeyOf).filter((key) => off.has(key));
}

describe("the dashboard contracts, run against a world whose real catalogue items already stand", () => {
  it("starts with the real items in the state the contracts must leave them in", async () => {
    const staff = await world.aStaffMember();
    for (const item of REAL_ITEMS_SWITCHED_OFF) {
      const result = await world.availability.setActive({
        item,
        active: false,
        expectedRevision: (await world.availability.readCurrent()).revision,
        audit: auditRecordOf(staff, activationEntryFor(item, false)),
      });
      expect(result.kind).toBe("ok");
    }

    expect(await realItemsSwitchedOff()).toEqual(
      REAL_ITEMS_SWITCHED_OFF.map(itemKeyOf),
    );
  });
});

describeCatalogueAvailabilityStoreContract("on a shared catalogue", () =>
  Promise.resolve({ ...world, store: world.availability }),
);
describePriceBookStoreContract("on a shared catalogue", () =>
  Promise.resolve({ ...world, store: world.priceBook }),
);
describeKitchenDefaultsStoreContract("on a shared catalogue", () =>
  Promise.resolve({
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
  }),
);
describePriceNoticeStoreContract("on a shared catalogue", () =>
  Promise.resolve({
    ...world,
    store: world.notice,
    aDesignId: () => Promise.resolve(nanoid()),
  }),
);

describe("after the contracts have run", () => {
  it("leaves every real catalogue item as it stood: no contract switched one it did not mint", async () => {
    expect(await realItemsSwitchedOff()).toEqual(
      REAL_ITEMS_SWITCHED_OFF.map(itemKeyOf),
    );
  });
});
