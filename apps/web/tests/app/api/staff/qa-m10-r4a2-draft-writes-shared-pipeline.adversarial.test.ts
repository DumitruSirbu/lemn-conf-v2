// The draft writes held to their own bucket, event and 401 after their pipeline was shared with the usage read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DashboardStoreError,
  type KitchenUsageReader,
} from "@lemnaria/persistence";

import {
  STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY,
  STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  type Administrator,
} from "../../../support/availability-route-world";
import {
  readUsage,
  setAvailability,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";

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
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

const VENEER = { kind: "material", tierId: "material.veneer" } as const;
const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;
const THE_BUCKET = STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY.name;
const THE_DRAFT_BUCKET = STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name;

let prices: PriceDashboardWorld;
let admin: Administrator;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  admin = await administrator();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function askedFor(items: unknown): Promise<Response> {
  return readUsage({ cookie: admin.cookie, json: { items } });
}

function budgetOf(name: string): number {
  return limiterLedger.counted.filter((counted) => counted === name).length;
}

function readerAnswering(result: unknown): void {
  vi.spyOn(prices.defaults, "countEach").mockReturnValue(
    result as ReturnType<KitchenUsageReader["countEach"]>,
  );
}

function accountLinesOf(event: string) {
  return console_.accountLines().filter((line) => line.event === event);
}

describe("the draft writes, after their pipeline was shared with the usage read", () => {
  async function aSwitchOff() {
    return setAvailability({
      cookie: admin.cookie,
      json: {
        expectedRevision: (await prices.stores.availability.readCurrent())
          .revision,
        item: SOFT_CLOSE,
        active: false,
      },
    });
  }

  it("spend the draft bucket and never the usage one, and log under the draft's event", async () => {
    limiterLedger.counted.length = 0;

    const answer = await aSwitchOff();

    expect(answer.status).toBe(200);
    expect(budgetOf(THE_DRAFT_BUCKET)).toBeGreaterThan(0);
    expect(budgetOf(THE_BUCKET)).toBe(0);
    expect(accountLinesOf("staff-price-usage")).toEqual([]);
    expect(accountLinesOf("staff-price-draft").length).toBeGreaterThan(0);
  });

  it("are refused 429 by the draft bucket, and not by a drained usage one", async () => {
    limiterLedger.refusing.set(THE_DRAFT_BUCKET, 5);

    const draft = await aSwitchOff();
    limiterLedger.refusing.clear();
    limiterLedger.refusing.set(THE_BUCKET, 5);
    const usage = await askedFor([VENEER]);

    expect([draft.status, usage.status]).toEqual([429, 429]);
    expect(accountLinesOf("staff-price-usage").length).toBeGreaterThan(0);
    expect(accountLinesOf("staff-price-draft").length).toBeGreaterThan(0);
  });

  it("answer 401 for a store that found no live session behind the write, logged under the draft's event", async () => {
    vi.spyOn(prices.stores.availability, "setActive").mockRejectedValue(
      new DashboardStoreError("set an item's availability", "not-recorded"),
    );

    const answer = await aSwitchOff();

    expect(answer.status).toBe(401);
    expect(accountLinesOf("staff-price-usage")).toEqual([]);
    expect(accountLinesOf("staff-price-draft").length).toBeGreaterThan(0);
  });

  it("are not made by a read: a usage read that fails leaves no draft line", async () => {
    readerAnswering(Promise.reject(new Error("down")));

    const answer = await askedFor([VENEER]);

    expect(answer.status).toBe(503);
    expect(accountLinesOf("staff-price-draft")).toEqual([]);
    expect(accountLinesOf("staff-price-usage").length).toBeGreaterThan(0);
  });
});
