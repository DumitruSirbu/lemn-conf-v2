// The cabinet list's source where the price stores are the unavailable ones (production, until the database-backed stores
// exist): the dashboard's read answers 503, the source says `unavailable`, and no price is claimed. This is how the list
// handles the stub: a production build never shows a sample. The real `getPriceStores` is used here, and a
// deployment variable is how production is chosen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readCabinetList } from "@/price-dashboard/cabinet-list-source";
import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import { readRequest } from "../../../support/price-dashboard-requests";
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
  it("answers unavailable to an administrator, every time, and leaves no audit row and no word of a sample", async () => {
    const { session } = await signedInAs({ role: "administrator" });

    for (let ask = 0; ask < 3; ask += 1) {
      const request = readRequest({ cookie: session.cookie });
      expect(
        await readCabinetList({
          cookies: request.cookies,
          headers: request.headers,
        }),
      ).toEqual({ kind: "unavailable" });
    }

    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toMatch(/sample|seed/i);
  });
});
