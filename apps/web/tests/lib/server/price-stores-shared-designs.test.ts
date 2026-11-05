import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";
import {
  FakeKitchenDefaultsStore,
  type PublishPriceBookRequest,
} from "@lemnaria/persistence";

import { seedFakePriceStores } from "@/lib/server/price-book-test-seed";
import type { PriceStores } from "@/lib/server/price-stores";

import { freshAccountWorld } from "../../support/account-world";
import { freshPriceDashboardWorld } from "../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

// The saved designs the usage side counts and the saved designs a publish's deleted items are checked against are one table,
// as the database's are. A design planted through the defaults fake therefore makes a publish that deletes the item it uses
// answer `item-in-use`, in the test world and in the seeded one.

const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const IDLE_LIFETIME_SECONDS = { client: 60, operator: 60, administrator: 60 };

beforeEach(() => {
  freshAccountWorld();
  freshStaffWorld();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function aPublishDeleting(
  stores: PriceStores,
  deleted: ItemRef,
): Promise<PublishPriceBookRequest> {
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("the world has no version");
  return {
    expectedDraftRevision: (await stores.priceBook.readDraft()).draftRevision,
    expectedActiveSequence: active.version.sequenceNumber,
    expectedAvailabilityRevision: (await stores.availability.readCurrent())
      .revision,
    createdItems: [],
    deletedItems: [
      { item: deleted } as PublishPriceBookRequest["deletedItems"][number],
    ],
    label: "Next",
    note: "",
    book: active.version.book,
    changeSummary: [
      { address: { kind: "item-deleted", item: deleted }, value: true },
    ],
    audit: {
      session: {
        sessionTokenHash: session.tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS,
      },
      entry: { action: "price-published", detail: { provisional: false } },
    },
  };
}

function plantADesignUsing(stores: PriceStores, item: ItemRef): void {
  (stores.defaults as FakeKitchenDefaultsStore).plantDesign({
    designId: "design-planted-through-the-usage-side",
    uses: [item],
    isDeletedByClient: false,
  });
}

describe.each([
  [
    "the dashboard world",
    async () => (await freshPriceDashboardWorld()).stores,
  ],
  ["the seeded world", () => seedFakePriceStores()],
])("in %s", (_name, makeStores) => {
  it("a publish that deletes an item a planted design uses answers item-in-use and writes nothing", async () => {
    const stores = await makeStores();
    plantADesignUsing(stores, VENEER);
    const request = await aPublishDeleting(stores, VENEER);

    const answer = await stores.priceBook.publish(request);

    expect(answer).toEqual({ kind: "item-in-use", items: [VENEER] });
    const active = await stores.priceBook.readActive();
    expect(active.kind === "found" && active.version.sequenceNumber).toBe(1);
  });

  it("the same publish goes through when no design uses the item", async () => {
    const stores = await makeStores();
    const request = await aPublishDeleting(stores, VENEER);

    const answer = await stores.priceBook.publish(request);

    expect(answer.kind).toBe("ok");
  });

  it("the usage side counts the planted design as well", async () => {
    const stores = await makeStores();
    plantADesignUsing(stores, VENEER);

    const counted = await stores.usage.countEach([
      { item: VENEER, via: "settings-tier", isFallback: false },
    ]);

    expect(counted.counts).toEqual([{ item: VENEER, designCount: 1 }]);
  });
});
