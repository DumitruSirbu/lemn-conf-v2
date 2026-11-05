import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { forgetHeldPriceStores } from "../../../support/held-price-stores";
import { readUsage } from "../../../support/price-dashboard-requests";
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
 * `POST /api/staff/prices/usage` in production with no database to connect to, through the real `getPriceStores`: the
 * stores are the unavailable ones, so nothing is read and no count is made up.
 */

const ITEMS = [
  { kind: "material", tierId: "material.veneer" },
  { kind: "finish", finishId: "veneer.nuc" },
];

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

describe("a count in production with no database", () => {
  it("answers 503 with no detail and no count for an administrator, and writes no audit row", async () => {
    const { session } = await signedInAs({ role: "administrator" });

    const answer = await readUsage({
      cookie: session.cookie,
      json: { items: ITEMS },
    });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toMatch(/designCount|sample|seed/i);
  });

  it("still refuses an operator with 403 and an anonymous caller with 401", async () => {
    const { session } = await signedInAs({ role: "operator" });

    const operator = await readUsage({
      cookie: session.cookie,
      json: { items: ITEMS },
    });
    const anonymous = await readUsage({ json: { items: ITEMS } });

    expect([operator.status, anonymous.status]).toEqual([403, 401]);
  });
});
