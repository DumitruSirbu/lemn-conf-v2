import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPriceStores } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { forgetHeldPriceStores } from "../../../support/held-price-stores";
import { setAvailability } from "../../../support/price-dashboard-requests";
import {
  freshStaffWorld,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

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

/**
 * `POST /api/staff/prices/availability` in production with no database to connect to, through the real `getPriceStores`:
 * the stores are the unavailable ones, so nothing is read, nothing is written, and nothing is made up.
 */

const A_SWITCH = {
  expectedRevision: "0",
  item: { kind: "material", tierId: "material.painted-mdf" },
  active: false,
};

let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("DATABASE_URL", "");
  forgetHeldPriceStores();
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a switch in production with no database", () => {
  it("answers 503 with no detail for an administrator, writes no audit row, and makes up no book", async () => {
    const { session } = await signedInAs({ role: "administrator" });

    const answer = await setAvailability({
      cookie: session.cookie,
      json: A_SWITCH,
    });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toMatch(/sample|seed/i);
  });

  it("answers 503 for every item and every flag, never a 200 or a 409 that would mean a book was consulted", async () => {
    const { session } = await signedInAs({ role: "administrator" });

    const statuses: number[] = [];
    for (const active of [true, false]) {
      for (const item of [
        A_SWITCH.item,
        { kind: "accessory", accessoryId: "sinkProtectiveCover" },
        { kind: "material", tierId: "material.unheard-of" },
      ]) {
        const answer = await setAvailability({
          cookie: session.cookie,
          json: { ...A_SWITCH, item, active },
        });
        statuses.push(answer.status);
      }
    }

    expect(new Set(statuses)).toEqual(new Set([503]));
  });

  it("still refuses an operator with 403 and an anonymous caller with 401, before any store is asked", async () => {
    const { session } = await signedInAs({ role: "operator" });

    const operator = await setAvailability({
      cookie: session.cookie,
      json: A_SWITCH,
    });
    const anonymous = await setAvailability({ json: A_SWITCH });

    expect([operator.status, anonymous.status]).toEqual([403, 401]);
  });

  it("holds stores whose every new member says unavailable, and fabricates no saved defaults and no count", async () => {
    const stores = await getPriceStores();

    await expect(stores.defaults.read()).rejects.toMatchObject({
      name: "DashboardStoreError",
    });
    await expect(stores.usage.countEach([])).rejects.toMatchObject({
      name: "DashboardStoreError",
    });
    await expect(stores.availability.readCurrent()).rejects.toMatchObject({
      name: "DashboardStoreError",
    });
  });
});
