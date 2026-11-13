import { freeColourFinish, paletteFinish } from "@lemnaria/configurator-domain";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { freshAccountWorld } from "../support/account-world";
import {
  administrator,
  saveDefaults,
} from "../support/availability-route-world";
import { freshPriceDashboardWorld } from "../support/price-dashboard-world";
import { freshStaffWorld } from "../support/staff-world";

/** `connection()` reads Next's request store and throws without one; the route's use of it is `room-page.test.ts`'s. */
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(() => Promise.resolve()),
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
vi.mock("@/lib/server/price-stores", () =>
  import("../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

import RoomPage from "../../src/app/[locale]/configurator/room/page";

/**
 * U6-a, the page's half (M10 R4b3): after a defaults save, the next Step 1 load hands the screen the saved six, and with
 * nothing saved the fixed fallbacks. The read is the real one, over the persistence package's fakes.
 */
const FIXED_FALLBACKS = {
  materialTierId: "material.melamine",
  hardwareTierId: "hardware.standard",
  cabinetDepthMm: 600,
  finish: paletteFinish("pal.alb"),
  handle: "steel",
  topRowHandle: "push",
};

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function newKitchenSettingsOfTheNextLoad(): Promise<unknown> {
  const page = await RoomPage({ params: Promise.resolve({ locale: "ro" }) });
  if (!isValidElement<{ newKitchenSettings: unknown }>(page)) {
    throw new Error("Room route returned no element");
  }
  return page.props.newKitchenSettings;
}

describe("the room page hands the screen the saved defaults at its load", () => {
  it("hands the fixed fallbacks while nothing is saved", async () => {
    expect(await newKitchenSettingsOfTheNextLoad()).toEqual(FIXED_FALLBACKS);
  });

  it("hands the saved six on the load after a save, and the earlier load's value is not changed by it", async () => {
    const staff = await administrator();
    const earlier = await newKitchenSettingsOfTheNextLoad();
    const saved = {
      materialTierId: "material.painted-mdf",
      hardwareTierId: "hardware.premium",
      cabinetDepthMm: 700,
      finish: freeColourFinish("#336699"),
      handle: "black",
      topRowHandle: "steel",
    } as const;

    await saveDefaults(staff, saved);

    expect(await newKitchenSettingsOfTheNextLoad()).toEqual(saved);
    expect(earlier).toEqual(FIXED_FALLBACKS);
  });
});
