import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";

import { readItemPage } from "@/price-dashboard/item-page-read";
import {
  switchStandOf,
  type LifecycleContext,
  type SwitchStand,
} from "@/price-dashboard/item-lifecycle-model";
import { readKitchenDefaults } from "@/price-dashboard/kitchen-defaults-source";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
} from "../support/account-world";
import {
  administrator,
  saveDefaults,
  switchItem,
  writeWithoutJudgement,
  type Administrator,
} from "../support/availability-route-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../support/price-dashboard-world";
import { freshStaffWorld } from "../support/staff-world";

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
vi.mock("@/lib/server/price-stores", () =>
  import("../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

/**
 * What a production build reads for the defaults screen and for every item screen's `defaults`, over the fake stores: the
 * saved defaults with the book's tiers and the head they were read at, never a sample. A saved row that does not parse
 * turns nothing on: the defaults screen is unavailable, and an item screen keeps the switch-off it cannot judge.
 */

const VENEER = { kind: "material", tierId: "material.veneer" } as const;
const PAINTED = { kind: "material", tierId: "material.painted-mdf" } as const;
const MELAMINE = { kind: "material", tierId: "material.melamine" } as const;
const NO_USAGE = { canDeleteStatedItems: false, canWrite: true } as const;

let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;
let admin: Administrator;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("NODE_ENV", "production");
  admin = await administrator();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function plantAnUnreadableRow(): void {
  vi.spyOn(prices.defaults, "read").mockResolvedValue({
    kind: "saved",
    saved: {
      revision: "3",
      defaults: { handle: "STORED-JUNK-4471" },
      savedAt: new Date(0),
    },
  });
}

async function standOfSwitchingOff(item: ItemRef): Promise<SwitchStand> {
  const read = await readItemPage({
    canDerive: () => true,
    loadSampleUsage: () => Promise.resolve([]),
  });
  if (read.kind !== "ready") throw new Error("the item page is unavailable");
  const { state, defaults } = read.page;
  const context: LifecycleContext = {
    book: state.active.book,
    availability: state.active.availability,
    defaults,
    isCreatedInDraft: () => false,
    ...NO_USAGE,
  };
  return switchStandOf(item, context);
}

describe("the defaults screen's read in a production build", () => {
  it("is ready with the fixed fallbacks and the book's tiers while nothing is saved, and invents nothing", async () => {
    const read = await readKitchenDefaults();

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    expect(read.input.state.saved).toBe(false);
    expect(read.input.state.revision).toBe("0");
    expect(read.input.materials.map(({ tierId }) => tierId)).toContain(
      VENEER.tierId,
    );
    expect(read.input.disabled).toEqual([]);
  });

  it("is ready with the saved whole, and what is switched off at the head it was read at", async () => {
    await saveDefaults(admin, { handle: "black" });
    await switchItem(admin.cookie, VENEER, false);

    const read = await readKitchenDefaults();

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    expect(read.input.state.saved).toBe(true);
    expect(read.input.state.defaults.handle).toBe("black");
    expect(read.input.disabled).toEqual([VENEER]);
    const head = await prices.stores.availability.readCurrent();
    expect(read.input.state.availabilityRevision).toBe(head.revision);
  });

  it("is unavailable while no version was ever published", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });

    expect(await readKitchenDefaults()).toEqual({ kind: "unavailable" });
  });

  it("is unavailable, and says nothing of the row, when the saved row does not parse", async () => {
    plantAnUnreadableRow();

    expect(await readKitchenDefaults()).toEqual({ kind: "unavailable" });
    expect(console_.everything()).not.toContain("STORED-JUNK-4471");
  });

  it("is unavailable, and writes no driver detail, when a store fails", async () => {
    vi.spyOn(prices.defaults, "read").mockRejectedValue(
      new DashboardStoreError("read the kitchen defaults", "unavailable"),
    );

    expect(await readKitchenDefaults()).toEqual({ kind: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("is not caught when the failure is a defect of ours: it is thrown on, as the other page reads throw it", async () => {
    vi.spyOn(prices.stores.availability, "readCurrent").mockRejectedValue(
      new TypeError("a defect"),
    );

    await expect(readKitchenDefaults()).rejects.toThrow("a defect");
  });
});

describe("an item screen's switch-off in a production build", () => {
  it("is offered for an item that is not a default once the saved defaults are read, with the options that stay on", async () => {
    const stand = await standOfSwitchingOff(VENEER);

    expect(stand.kind).toBe("disable");
  });

  it("keeps the refusal for a material the saved defaults name", async () => {
    await saveDefaults(admin, { materialTierId: PAINTED.tierId });

    expect(await standOfSwitchingOff(PAINTED)).toEqual({
      kind: "off",
      reason: "item-is-default",
    });
  });

  it("keeps the refusal for the fixed default when nothing is saved", async () => {
    const stand = await standOfSwitchingOff(MELAMINE);

    expect(stand).toEqual({ kind: "off", reason: "item-is-fixed-default" });
  });

  it("keeps the refusal for the last option that is on, which switching the others off leaves as the only one", async () => {
    await writeWithoutJudgement(admin, MELAMINE, false);
    await writeWithoutJudgement(admin, PAINTED, false);

    expect(await standOfSwitchingOff(VENEER)).toEqual({
      kind: "last-active-option",
    });
  });

  it("stays cannot-judge when the saved row does not parse: nothing is turned on", async () => {
    plantAnUnreadableRow();

    expect(await standOfSwitchingOff(VENEER)).toEqual({
      kind: "off",
      reason: "cannot-judge",
    });
  });
});

describe("the saved defaults an item page is handed", () => {
  const read = async () =>
    readItemPage({
      canDerive: () => true,
      loadSampleUsage: () => Promise.resolve([]),
    });

  it("are the empty settings while nothing is saved: known, and naming no default", async () => {
    const page = await read();

    expect(page.kind === "ready" && page.page.defaults).toEqual({});
  });

  it("are the saved whole, completed from the fixed fallbacks the way the defaults screen shows it", async () => {
    await saveDefaults(admin, { handle: "black" });

    const page = await read();

    expect(page.kind === "ready" && page.page.defaults).toMatchObject({
      handle: "black",
      materialTierId: "material.melamine",
      hardwareTierId: "hardware.standard",
      cabinetDepthMm: 600,
    });
  });

  it("are absent when the saved row does not parse, and the page is still ready", async () => {
    plantAnUnreadableRow();

    const page = await read();

    expect(page.kind).toBe("ready");
    expect(page.kind === "ready" && page.page.defaults).toBeUndefined();
  });
});
