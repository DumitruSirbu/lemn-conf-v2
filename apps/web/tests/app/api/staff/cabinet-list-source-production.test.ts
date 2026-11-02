// The cabinet list's source where the price stores are the unavailable ones (production, until the database-backed
// stores exist): the store throws, the source says `unavailable`, and no price is claimed. This is how the list handles
// the stub: a production build never shows a sample. The real `getPriceStores` is used here, and a deployment variable
// is how production is chosen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readCabinetDetail,
  readCabinetList,
} from "@/price-dashboard/cabinet-list-source";
import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import { freshStaffWorld, type StaffWorld } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  (globalThis as Record<symbol, unknown>)[PRICE_STORES_GLOBAL_KEY] = undefined;
});

afterEach(() => {
  (globalThis as Record<symbol, unknown>)[PRICE_STORES_GLOBAL_KEY] = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the list's source in production", () => {
  it("answers unavailable, every time, and leaves no audit row and no word of a sample", async () => {
    for (let ask = 0; ask < 3; ask += 1) {
      expect(await readCabinetList()).toEqual({ kind: "unavailable" });
    }

    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toMatch(/sample|seed/i);
  });
});

describe("one cabinet's page in production", () => {
  it("answers unavailable, and not not-found, for a rule that exists and one that does not: no price is claimed and no cabinet is denied", async () => {
    for (const ruleId of ["cabinet.base-cabinet", "cabinet.stranger"]) {
      expect(await readCabinetDetail(ruleId), ruleId).toEqual({
        kind: "unavailable",
      });
    }

    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toMatch(/sample|seed/i);
  });
});
