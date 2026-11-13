// Adversarial QA of the lifecycle client in a production build with no database to connect to, through the real
// `getPriceStores`: the routes answer 503 and the client may not turn that into a figure, a switch or a state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { createFetchingItemLifecycleClient } from "@/price-dashboard/fetching-item-lifecycle-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import { forgetHeldPriceStores } from "../../../support/held-price-stores";
import { fetchAnsweredByTheStaffRoutes } from "../../../support/staff-route-fetch";
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

const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const SOFT_CLOSE: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };

let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;
let statuses: number[];

beforeEach(async () => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("DATABASE_URL", "");
  forgetHeldPriceStores();
  resetStaffSessionExpiryForTests();
  const { session } = await signedInAs({ role: "administrator" });
  const routes = fetchAnsweredByTheStaffRoutes(() => session.cookie);
  statuses = [];
  vi.stubGlobal("fetch", async (address: string, init?: RequestInit) => {
    const answer = await routes(address, init);
    statuses.push(answer.status);
    return answer;
  });
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the lifecycle client where the server has no database", () => {
  it("cannot count: every item is unknown, the routes said 503, and no figure is made up", async () => {
    const read = await createFetchingItemLifecycleClient().readUsage([
      VENEER,
      SOFT_CLOSE,
    ]);

    expect(read).toEqual({ kind: "unavailable" });
    expect(statuses).toEqual([503]);
    expect(console_.everything()).not.toMatch(/designCount|sample|seed/i);
  });

  it("cannot switch: every switch fails whatever the item and the flag, and the audit holds no row", async () => {
    const client = createFetchingItemLifecycleClient();

    const outcomes = [];
    for (const active of [true, false]) {
      for (const item of [VENEER, SOFT_CLOSE]) {
        outcomes.push(
          await client.setActive({ expectedRevision: "0", item, active }),
        );
      }
    }

    expect(new Set(outcomes.map(({ kind }) => kind))).toEqual(
      new Set(["failed"]),
    );
    expect(new Set(statuses)).toEqual(new Set([503]));
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("cannot say what is switched off: it is absent, and not an empty list", async () => {
    expect(
      await createFetchingItemLifecycleClient().readAvailability(),
    ).toBeUndefined();
    expect(statuses).toEqual([503]);
  });
});
