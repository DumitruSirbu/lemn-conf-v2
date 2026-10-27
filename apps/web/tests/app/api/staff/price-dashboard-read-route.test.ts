import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAFF_PRICES_READ_BY_ACCOUNT_POLICY,
  STAFF_PRICES_READ_PER_ACCOUNT_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import {
  changeDraft,
  currentDraftRevision,
  readState,
} from "../../../support/price-dashboard-requests";
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

const { HEAD } = await import("@/app/api/staff/prices/route");

/**
 * `GET /api/staff/prices` (M10 R2, ADR 0173, ADR 0178). The route is called with `Request` objects over the persistence
 * package's price-book and audit store fakes; the session lookup, the capability check, both limiters' decisions and the
 * response builders are the real ones. Reading the dashboard commits a `price-catalogue-viewed` row before the state is served.
 */

let world: AccountWorld;
let staffWorld: StaffWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administratorCookie(email = "administrator@example.test") {
  const { session, account } = await signedInAs(
    { role: "administrator" },
    email,
  );
  return { cookie: session.cookie, accountId: account.id };
}

interface StateWire {
  active: {
    versionId: string;
    book: { version: string; cabinetRules: unknown[] };
    availability: { revision: string; disabled: unknown[] };
    sequenceNumber: number;
    label: string;
    publishedAt: string;
  };
  draft: { draftRevision: string; changes: unknown[] };
}

describe("the state an administrator reads", () => {
  it("is the active version with its book and availability, and the draft beside it, field by field", async () => {
    const { cookie } = await administratorCookie();

    const answer = await readState({ cookie });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const body = (await jsonOf(answer)) as StateWire;
    expect(Object.keys(body).sort()).toEqual(["active", "draft"]);
    expect(Object.keys(body.active).sort()).toEqual([
      "availability",
      "book",
      "label",
      "publishedAt",
      "sequenceNumber",
      "versionId",
    ]);
    expect(body.active.versionId).toBe(prices.versionId);
    expect(body.active.book.version).toBe(prices.versionId);
    expect(body.active.sequenceNumber).toBe(1);
    expect(body.active.availability).toEqual({
      ...(await prices.stores.availability.readCurrent()),
      disabled: [],
    });
    expect(body.active.publishedAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(body.draft).toEqual({
      draftRevision: await currentDraftRevision(),
      changes: [],
    });
  });

  it("holds the draft as it is stored, every change rebuilt with only its own members", async () => {
    const { cookie } = await administratorCookie();
    await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: { kind: "depth-rule" }, value: 20 },
      },
    });

    const body = (await jsonOf(await readState({ cookie }))) as StateWire;

    expect(body.draft.changes).toEqual([
      { address: { kind: "depth-rule" }, value: 20 },
    ]);
  });

  it("answers 409 no-active-version while none was ever published, and writes no audit row", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const { cookie } = await administratorCookie();

    const answer = await readState({ cookie });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});

describe("the audit row of a read", () => {
  it("is one price-catalogue-viewed row naming the catalogue and the administrator, and no value", async () => {
    const { cookie, accountId } = await administratorCookie();

    await readState({ cookie });

    expect(
      staffWorld.audit
        .heldEvents()
        .map(({ action, detail, actorAccountId }) => ({
          action,
          detail,
          actorAccountId,
        })),
    ).toEqual([
      {
        action: "price-catalogue-viewed",
        detail: { section: "catalogue" },
        actorAccountId: accountId,
      },
    ]);
  });

  it("is committed or the state is not served: a row that cannot be written is 503 with no book in the answer", async () => {
    const { cookie } = await administratorCookie();
    staffWorld.auditBehaviour = "reject";

    const answer = await readState({ cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await answer.clone().text()).not.toContain(prices.versionId ?? "");
    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("is 503 when the session ended between the route's read and the row, and nothing is served", async () => {
    const { cookie, accountId } = await administratorCookie();
    staffWorld.auditBehaviour = "lose-session";
    staffWorld.signedOutAccountId = accountId;

    const answer = await readState({ cookie });

    expect(answer.status).toBe(503);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});

describe("a store that cannot answer", () => {
  it("is 503 with no detail when the version cannot be read", async () => {
    const { cookie } = await administratorCookie();
    vi.spyOn(prices.stores.priceBook, "readActive").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await readState({ cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("is 503 when the stored draft is not what a draft holds, and the draft is not served in part", async () => {
    const { cookie } = await administratorCookie();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: "1",
      changes: [{ address: { kind: "cabinet" }, value: "STORED-JUNK-4471" }],
    });

    const answer = await readState({ cookie });

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain("STORED-JUNK-4471");
    expect(console_.everything()).not.toContain("STORED-JUNK-4471");
  });

  it("is 503 when the availability head cannot be read", async () => {
    const { cookie } = await administratorCookie();
    vi.spyOn(prices.stores.availability, "readCurrent").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await readState({ cookie });

    expect(answer.status).toBe(503);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});

describe("the guards", () => {
  it("refuses a cross-site read before any session or store is read", async () => {
    const { cookie } = await administratorCookie();

    const answer = await readState({ cookie, secFetchSite: "cross-site" });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    expect(priceStoreAsks.count).toBe(0);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("answers HEAD 405 with Allow: GET and runs nothing: no bucket, no store, no row", () => {
    limiterLedger.counted.length = 0;

    const answer = HEAD();

    expect(answer.status).toBe(405);
    expect(answer.headers.get("allow")).toBe("GET");
    expect(limiterLedger.counted).toEqual([]);
    expect(priceStoreAsks.count).toBe(0);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});

describe("the account's bucket", () => {
  it("is 300 an hour, provisional", () => {
    expect(STAFF_PRICES_READ_PER_ACCOUNT_HOUR_FIGURE).toBe(300);
    expect(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.figure).toBe(300);
  });

  it("refuses with 429 and a whole-second wait above the figure, without asking a store or writing a row", async () => {
    const { cookie } = await administratorCookie();
    limiterLedger.refusing.set(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name, 5);

    const answer = await readState({ cookie });

    expect(answer.status).toBe(429);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expectAWaitWithinTheWindowOf(
      answer,
      STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name,
    );
    expect(priceStoreAsks.count).toBe(0);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("fails closed: a bucket that cannot be counted serves no state", async () => {
    const { cookie } = await administratorCookie();
    limiterLedger.unavailable.add(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name);

    const answer = await readState({ cookie });

    expect(answer.status).toBe(503);
    expect(priceStoreAsks.count).toBe(0);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("counts a refused caller in no bucket of the account", async () => {
    const operator = await signedInAs({ role: "operator" });
    limiterLedger.counted.length = 0;

    const answer = await readState({ cookie: operator.session.cookie });

    expect(answer.status).toBe(403);
    expect(limiterLedger.counted).not.toContain(
      STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name,
    );
    expect(world.calls).not.toContain("sessions.touch");
  });
});
