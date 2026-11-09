import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { FETCHING_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/fetching-item-lifecycle-client";
import {
  deleteStandOf,
  switchStandOf,
  type LifecycleContext,
} from "@/price-dashboard/item-lifecycle-model";
import { readItemPage } from "@/price-dashboard/item-page-read";

import { captureConsole, freshAccountWorld } from "../support/account-world";
import { freshStaffWorld } from "../support/staff-world";

// The pages the e2e server renders (a production build over `seedFakePriceStores`), reproduced over the same stores in one
// process: this is unit-level evidence for the six `*.e2e.spec.ts` blocks that assert `cannotJudge` for a switch-off, which
// the browser could not be run to confirm.
const seeded = vi.hoisted(() => ({
  stores: undefined as Promise<unknown> | undefined,
}));
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () => ({
  getPriceStores: () => {
    seeded.stores ??= import("@/lib/server/price-book-test-seed").then(
      ({ seedFakePriceStores }) => seedFakePriceStores(),
    );
    return seeded.stores;
  },
}));

const HETTICH: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const BLUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const MDF: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const DRYING_RACK: ItemRef = {
  kind: "accessory",
  accessoryId: "dishDryingRack",
};
const SINK_COVER: ItemRef = {
  kind: "accessory",
  accessoryId: "sinkProtectiveCover",
};

beforeEach(() => {
  freshAccountWorld();
  freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function contextOfThePage(): Promise<LifecycleContext> {
  const read = await readItemPage({
    canDerive: () => true,
    loadSampleUsage: () => Promise.resolve([]),
  });
  if (read.kind !== "ready") throw new Error("the item page is unavailable");
  const { state, defaults } = read.page;
  return {
    book: state.active.book,
    availability: state.active.availability,
    defaults,
    isCreatedInDraft: () => false,
    canWrite: FETCHING_ITEM_LIFECYCLE_CLIENT.canWrite,
    canDeleteStatedItems: FETCHING_ITEM_LIFECYCLE_CLIENT.canDeleteStatedItems,
  };
}

describe("the seeded world a CI end-to-end server renders, with the saved defaults now readable", () => {
  it.each([
    ["Hettich", HETTICH],
    ["Blum", BLUM],
    ["MDF", MDF],
    ["veneer", VENEER],
    ["the drying rack", DRYING_RACK],
  ])(
    "offers %s its switch-off dialog (it was cannot-judge), where the e2e specs still assert aria-disabled",
    async (_name, item) => {
      const context = await contextOfThePage();

      expect(context.defaults).toEqual({});
      expect(switchStandOf(item, context).kind).toBe("disable");
    },
  );

  it("still refuses the cover (always present) and the fixed defaults, as the e2e specs' other rows say", async () => {
    const context = await contextOfThePage();

    expect(switchStandOf(SINK_COVER, context)).toEqual({
      kind: "off",
      reason: "item-always-present",
    });
    for (const item of [
      { kind: "hardware", tierId: "hardware.standard" },
      { kind: "material", tierId: "material.melamine" },
    ] as const) {
      expect(switchStandOf(item, context)).toEqual({
        kind: "off",
        reason: "item-is-fixed-default",
      });
    }
  });

  it.each([
    ["Hettich", HETTICH],
    ["Blum", BLUM],
    ["MDF", MDF],
    ["veneer", VENEER],
  ] as const)(
    "offers the deletion of the stated row %s, to be counted first (it was cannot-judge before R4c3)",
    async (_name, item) => {
      const context = await contextOfThePage();

      expect(deleteStandOf(item, context)).toEqual({ kind: "count-first" });
    },
  );

  it("keeps the deletion of the built-in drying rack off, as a built-in accessory", async () => {
    const context = await contextOfThePage();

    expect(deleteStandOf(DRYING_RACK, context)).toEqual({
      kind: "off",
      reason: "built-in-accessory",
    });
  });

  it.each([
    ["the cover", SINK_COVER, "always-present-accessory"],
    [
      "the fixed hardware default",
      { kind: "hardware", tierId: "hardware.standard" },
      "item-is-fixed-default",
    ],
    [
      "the fixed material default",
      { kind: "material", tierId: "material.melamine" },
      "item-is-fixed-default",
    ],
  ] as const)(
    "keeps the deletion of %s off for what it is",
    async (_name, item, reason) => {
      const context = await contextOfThePage();

      expect(deleteStandOf(item, context)).toEqual({ kind: "off", reason });
    },
  );
});
