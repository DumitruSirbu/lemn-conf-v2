import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { paletteFinish } from "@lemnaria/configurator-domain";

import { GET, HEAD } from "@/app/api/staff/prices/defaults/route";
import { STAFF_PRICES_READ_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  availabilityHead,
  defaultsRevision,
  saveDefaults,
  switchItem,
} from "../../../support/availability-route-world";
import {
  FIXED_DEFAULTS,
  saveWhole,
} from "../../../support/kitchen-defaults-route-world";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
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
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

/**
 * `GET /api/staff/prices/defaults` (M10 R4b2, ADR 0178). The route is called with `Request` objects over the persistence
 * package's fakes; the session, the capability check, both limiters and the response builders are the real ones. It is
 * admitted, limited and audited as `GET /api/staff/prices` is, through the one read pipeline of the service.
 */

const STATE_MEMBERS = ["availabilityRevision", "defaults", "revision", "saved"];
const SIX_MEMBERS = [
  "cabinetDepthMm",
  "finish",
  "handle",
  "hardwareTierId",
  "materialTierId",
  "topRowHandle",
];
const VENEER = { kind: "material", tierId: "material.veneer" } as const;

let staffWorld: StaffWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function readDefaults(init: { cookie?: string; secFetchSite?: string } = {}) {
  return GET(
    accountRequest("/api/staff/prices/defaults", {
      method: "GET",
      headers: { "x-forwarded-for": "192.0.2.10" },
      ...init,
    }),
  );
}

function viewedRows() {
  return staffWorld.audit
    .heldEvents()
    .filter(({ action }) => action === "price-catalogue-viewed");
}

describe("the defaults an administrator reads", () => {
  it("are the fixed fallbacks with saved false while nothing is saved, and revisions a save can be made against", async () => {
    const { cookie } = await administrator();

    const answer = await readDefaults({ cookie });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({
      revision: await defaultsRevision(),
      availabilityRevision: await availabilityHead(),
      saved: false,
      defaults: FIXED_DEFAULTS,
    });
  });

  it("are the saved whole with saved true once a save has been made, and no more members than the wire declares", async () => {
    const { cookie } = await administrator();
    await saveWhole(cookie, {
      materialTierId: VENEER.tierId,
      finish: paletteFinish("veneer.stejar"),
    });

    const answer = await readDefaults({ cookie });

    const body = (await jsonOf(answer)) as {
      saved: boolean;
      defaults: Record<string, unknown>;
    };
    expect(Object.keys(body).sort()).toEqual(STATE_MEMBERS);
    expect(Object.keys(body.defaults).sort()).toEqual(SIX_MEMBERS);
    expect(body.saved).toBe(true);
    expect(body.defaults).toEqual({
      ...FIXED_DEFAULTS,
      materialTierId: VENEER.tierId,
      finish: paletteFinish("veneer.stejar"),
    });
  });

  it("carry the revisions of the one head the read took, so that a save made from them is accepted", async () => {
    const { cookie } = await administrator();
    await switchItem(cookie, VENEER, false);

    const body = (await jsonOf(await readDefaults({ cookie }))) as {
      revision: string;
      availabilityRevision: string;
    };

    expect(body.availabilityRevision).toBe(await availabilityHead());
    expect(body.revision).toBe(await defaultsRevision());
    const saved = await saveWhole(cookie);
    expect(saved.status).toBe(200);
  });

  it("answer 409 no-active-version while none was ever published, and write no audit row", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const { cookie } = await administrator();

    const answer = await readDefaults({ cookie });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
    expect(viewedRows()).toEqual([]);
  });
});

describe("the audit row of a read of the defaults", () => {
  it("is one price-catalogue-viewed row naming the defaults section and the administrator, and no value", async () => {
    const { cookie, accountId } = await administrator();

    await readDefaults({ cookie });

    expect(
      viewedRows().map(({ detail, actorAccountId }) => ({
        detail,
        actorAccountId,
      })),
    ).toEqual([{ detail: { section: "defaults" }, actorAccountId: accountId }]);
  });

  it("is one row for each read", async () => {
    const { cookie } = await administrator();

    await readDefaults({ cookie });
    await readDefaults({ cookie });

    expect(viewedRows()).toHaveLength(2);
  });

  it("is committed or nothing is served: a row that cannot be written is 503 with no default in the answer", async () => {
    const { cookie } = await administrator();
    staffWorld.auditBehaviour = "reject";

    const answer = await readDefaults({ cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await answer.clone().text()).not.toContain("materialTierId");
    expect(viewedRows()).toEqual([]);
  });
});

describe("a caller who may not read the defaults", () => {
  it("is refused 403 for an operator, with no store asked and no row written", async () => {
    const operator = await signedInAs({ role: "operator" });
    priceStoreAsks.count = 0;

    const answer = await readDefaults({ cookie: operator.session.cookie });

    expect(answer.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
    expect(viewedRows()).toEqual([]);
  });

  it("is refused 401 without a session, with no store asked", async () => {
    priceStoreAsks.count = 0;

    const answer = await readDefaults();

    expect(answer.status).toBe(401);
    expect(priceStoreAsks.count).toBe(0);
    expect(viewedRows()).toEqual([]);
  });

  it("is refused 403 for a cross-site read before any session or store is read", async () => {
    const { cookie } = await administrator();
    priceStoreAsks.count = 0;

    const answer = await readDefaults({ cookie, secFetchSite: "cross-site" });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    expect(priceStoreAsks.count).toBe(0);
    expect(viewedRows()).toEqual([]);
  });
});

describe("the account's read bucket, which the defaults share with the dashboard", () => {
  it("refuses with 429 above the figure, asking no store and writing no row", async () => {
    const { cookie } = await administrator();
    limiterLedger.refusing.set(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name, 5);
    priceStoreAsks.count = 0;

    const answer = await readDefaults({ cookie });

    expect(answer.status).toBe(429);
    expect(priceStoreAsks.count).toBe(0);
    expect(viewedRows()).toEqual([]);
  });

  it("fails closed: a bucket that cannot be counted serves no defaults", async () => {
    const { cookie } = await administrator();
    limiterLedger.unavailable.add(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name);
    priceStoreAsks.count = 0;

    const answer = await readDefaults({ cookie });

    expect(answer.status).toBe(503);
    expect(priceStoreAsks.count).toBe(0);
    expect(viewedRows()).toEqual([]);
  });
});

describe("a store that cannot answer, or a saved row that is not settings", () => {
  it("is 503 with no detail when the availability head cannot be read, and no row is written", async () => {
    const { cookie } = await administrator();
    vi.spyOn(prices.stores.availability, "readCurrent").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await readDefaults({ cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(viewedRows()).toEqual([]);
  });

  it("is 503 and shows nothing of the row when the saved row is not settings: it is never read as nothing saved", async () => {
    const { cookie, tokenHash } = await administrator();
    await saveDefaults({ tokenHash }, { handle: "black" });
    vi.spyOn(prices.defaults, "read").mockResolvedValue({
      kind: "saved",
      saved: {
        revision: "3",
        defaults: { handle: "STORED-JUNK-4471" },
        savedAt: new Date(0),
      },
    });

    const answer = await readDefaults({ cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await answer.clone().text()).not.toContain("STORED-JUNK-4471");
    expect(console_.everything()).not.toContain("STORED-JUNK-4471");
    expect(viewedRows()).toEqual([]);
  });
});

describe("HEAD on the defaults", () => {
  it("answers 405 and runs nothing: no bucket, no store, no row", () => {
    limiterLedger.counted.length = 0;
    priceStoreAsks.count = 0;

    const answer = HEAD();

    expect(answer.status).toBe(405);
    expect(limiterLedger.counted).toEqual([]);
    expect(priceStoreAsks.count).toBe(0);
    expect(viewedRows()).toEqual([]);
  });
});
