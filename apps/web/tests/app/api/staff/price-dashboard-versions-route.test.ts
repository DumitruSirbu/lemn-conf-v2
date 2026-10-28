import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRICE_VERSION_PAGE_SIZE } from "@lemnaria/persistence";

import { STAFF_PRICES_READ_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { HEAD as HEAD_LIST } from "@/app/api/staff/prices/versions/route";
import { HEAD as HEAD_ONE } from "@/app/api/staff/prices/versions/[id]/route";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  readVersion,
  readVersions,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  ANCHOR_ADDRESS,
  VERSIONED_BOOK,
  publishAnchor,
  putChange,
} from "../../../support/price-versions";
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
 * `GET /api/staff/prices/versions` and `…/versions/{id}` (M10 R3, ADR 0178). An archived version is served to an
 * administrator only, after its `price-catalogue-viewed` row has committed; a draft or an archive reaches no other route.
 */

let staffWorld: StaffWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: VERSIONED_BOOK });
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administrator() {
  const { session, account } = await signedInAs({ role: "administrator" });
  return { cookie: session.cookie, accountId: account.id };
}

interface VersionListBody {
  total: number;
  page: number;
  pageSize: number;
  versions: {
    versionId: string;
    sequenceNumber: number;
    label: string;
    state: string;
    publishedAt: string;
    changeCount: number;
  }[];
}

describe("the history", () => {
  it("lists the versions newest first with the state each is in, the label, the date and the change count", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, { kind: "depth-rule" }, 20);
    const second = await publishAnchor(cookie, 510_000, "Second");

    const answer = await readVersions({ cookie });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const body = (await jsonOf(answer)) as VersionListBody;
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(PRICE_VERSION_PAGE_SIZE);
    expect(body.versions.map(({ sequenceNumber }) => sequenceNumber)).toEqual([
      2, 1,
    ]);
    expect(body.versions[0]).toMatchObject({
      versionId: second,
      sequenceNumber: 2,
      label: "Second",
      state: "active",
      changeCount: 2,
    });
    expect(body.versions[0]?.publishedAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(body.versions[1]).toMatchObject({
      versionId: prices.versionId,
      state: "archived",
      changeCount: 0,
    });
    expect(Object.keys(body.versions[0] ?? {}).sort()).toEqual([
      "changeCount",
      "label",
      "publishedAt",
      "sequenceNumber",
      "state",
      "versionId",
    ]);
  });

  it("serves the second page of a history longer than a page", async () => {
    const { cookie } = await administrator();
    for (let index = 0; index < PRICE_VERSION_PAGE_SIZE; index += 1) {
      await publishAnchor(cookie, 500_000 + index * 10_000);
    }

    const first = (await jsonOf(
      await readVersions({ cookie }),
    )) as VersionListBody;
    const second = (await jsonOf(
      await readVersions({ cookie, search: "?page=2" }),
    )) as VersionListBody;

    expect(first.total).toBe(PRICE_VERSION_PAGE_SIZE + 1);
    expect(first.versions).toHaveLength(PRICE_VERSION_PAGE_SIZE);
    expect(second.page).toBe(2);
    expect(second.versions.map(({ sequenceNumber }) => sequenceNumber)).toEqual(
      [1],
    );
  });

  it("serves a page past the end as an empty list, not an error", async () => {
    const { cookie } = await administrator();

    const body = (await jsonOf(
      await readVersions({ cookie, search: "?page=9" }),
    )) as VersionListBody;

    expect(body.versions).toEqual([]);
    expect(body.total).toBe(1);
  });

  it.each([
    ["zero", "?page=0", "NOT_A_WHOLE_NUMBER"],
    ["a leading zero", "?page=01", "NOT_A_WHOLE_NUMBER"],
    ["a sign", "?page=-1", "NOT_A_WHOLE_NUMBER"],
    ["a fraction", "?page=1.5", "NOT_A_WHOLE_NUMBER"],
    ["text", "?page=abc", "NOT_A_WHOLE_NUMBER"],
    ["nothing", "?page=", "NOT_A_WHOLE_NUMBER"],
    ["two pages", "?page=1&page=2", "NOT_A_WHOLE_NUMBER"],
    ["a page past any history", "?page=10001", "TOO_LARGE"],
    [
      "a number past the safe integers",
      `?page=${"9".repeat(400)}`,
      "TOO_LARGE",
    ],
  ])(
    "refuses %s as the page with 400, asks no store and writes no row",
    async (_title, search, code) => {
      const { cookie } = await administrator();
      priceStoreAsks.count = 0;

      const answer = await readVersions({ cookie, search });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "page", code }],
      });
      expect(priceStoreAsks.count).toBe(0);
      expect(staffWorld.audit.heldEvents()).toEqual([]);
    },
  );

  it("records one price-catalogue-viewed row naming the history, and no label", async () => {
    const { cookie, accountId } = await administrator();

    await readVersions({ cookie });

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
        detail: { section: "history" },
        actorAccountId: accountId,
      },
    ]);
  });

  it("is not served when its row cannot be committed: 503, with no version in the answer", async () => {
    const { cookie } = await administrator();
    staffWorld.auditBehaviour = "reject";

    const answer = await readVersions({ cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await answer.clone().text()).not.toContain(prices.versionId ?? "");
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("is 503 with no detail when the store cannot list", async () => {
    const { cookie } = await administrator();
    vi.spyOn(prices.stores.priceBook, "listVersions").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await readVersions({ cookie });

    expect(answer.status).toBe(503);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});

describe("one version", () => {
  it("is served with its book, its note and the changes it carried, read-only", async () => {
    const { cookie } = await administrator();
    const first = await publishAnchor(cookie, 500_000, "First");
    const second = await publishAnchor(cookie, 510_000, "Second");

    const answer = await readVersion(first, { cookie });

    expect(answer.status).toBe(200);
    const body = (await jsonOf(answer)) as {
      versionId: string;
      sequenceNumber: number;
      label: string;
      note: string;
      state: string;
      publishedAt: string;
      book: {
        version: string;
        cabinetRules: { ruleId: string; formula: unknown }[];
      };
      changes: unknown[];
    };
    expect(Object.keys(body).sort()).toEqual([
      "book",
      "changes",
      "label",
      "note",
      "publishedAt",
      "sequenceNumber",
      "state",
      "versionId",
    ]);
    expect(body).toMatchObject({
      versionId: first,
      sequenceNumber: 2,
      label: "First",
      state: "archived",
      changes: [{ address: ANCHOR_ADDRESS, value: 500_000 }],
    });
    expect(body.book.version).toBe(first);
    expect(
      body.book.cabinetRules.find(
        ({ ruleId }) => ruleId === ANCHOR_ADDRESS.ruleId,
      )?.formula,
    ).toMatchObject({ anchorMinor: 500_000 });
    expect(second).not.toBe(first);
    const active = (await jsonOf(await readVersion(second, { cookie }))) as {
      state: string;
    };
    expect(active.state).toBe("active");
  });

  it("records one row naming a version, and no label or note", async () => {
    const { cookie } = await administrator();
    const id = await publishAnchor(cookie, 500_000, "ETIQUETTE-7731");
    const rowsBefore = staffWorld.audit.heldEvents().length;

    await readVersion(id, { cookie });

    const rows = staffWorld.audit.heldEvents().slice(rowsBefore);
    expect(rows.map(({ action, detail }) => ({ action, detail }))).toEqual([
      { action: "price-catalogue-viewed", detail: { section: "version" } },
    ]);
    expect(JSON.stringify(staffWorld.audit.heldEvents())).not.toContain(
      "ETIQUETTE-7731",
    );
  });

  it.each([
    ["an id the store does not hold", "no-such-version"],
    ["an id longer than any id", "x".repeat(500)],
    ["an id with a path in it", "../../etc/passwd"],
    ["the empty id", ""],
  ])(
    "answers %s with 404, echoing nothing and writing no row",
    async (_title, id) => {
      const { cookie } = await administrator();

      const answer = await readVersion(id, { cookie });

      expect(answer.status).toBe(404);
      expect(await jsonOf(answer)).toEqual({ status: "version-not-found" });
      expect(await answer.clone().text()).not.toContain(
        id.slice(0, 20) || "\u0000",
      );
      expect(staffWorld.audit.heldEvents()).toEqual([]);
    },
  );

  it("asks no store, and spends no bucket, for an id that cannot be an id", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;
    priceStoreAsks.count = 0;

    await readVersion("x".repeat(500), { cookie });

    expect(priceStoreAsks.count).toBe(0);
    expect(limiterLedger.counted).not.toContain(
      STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name,
    );
  });

  it("is 503, never a half-version, when the stored book is not a book", async () => {
    const { cookie } = await administrator();
    const id = await publishAnchor(cookie, 500_000);
    const real = prices.stores.priceBook.readVersion.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "readVersion").mockImplementation(
      async (versionId) => {
        const read = await real(versionId);
        return read.kind === "found"
          ? {
              kind: "found",
              version: { ...read.version, book: { STORED: "JUNK-3341" } },
            }
          : read;
      },
    );

    const answer = await readVersion(id, { cookie });

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain("JUNK-3341");
    expect(console_.everything()).not.toContain("JUNK-3341");
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("is 503 when the stored change summary is not a list of changes", async () => {
    const { cookie } = await administrator();
    const id = await publishAnchor(cookie, 500_000);
    const real = prices.stores.priceBook.readVersion.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "readVersion").mockImplementation(
      async (versionId) => {
        const read = await real(versionId);
        return read.kind === "found"
          ? {
              kind: "found",
              version: { ...read.version, changeSummary: [{ STORED: "JUNK" }] },
            }
          : read;
      },
    );

    const answer = await readVersion(id, { cookie });

    expect(answer.status).toBe(503);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});

describe("the guards", () => {
  it("refuses a cross-site read before any session or store is read", async () => {
    const answer = await readVersions({ secFetchSite: "cross-site" });
    const one = await readVersion("anything", { secFetchSite: "cross-site" });

    expect(answer.status).toBe(403);
    expect(one.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers HEAD 405 on both routes and runs nothing", () => {
    limiterLedger.counted.length = 0;

    for (const answer of [HEAD_LIST(), HEAD_ONE()]) {
      expect(answer.status).toBe(405);
      expect(answer.headers.get("allow")).toBe("GET");
    }
    expect(limiterLedger.counted).toEqual([]);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("refuses with 429 above the read bucket and fails closed when it cannot be counted", async () => {
    const { cookie } = await administrator();
    limiterLedger.refusing.set(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name, 5);

    const limited = await readVersions({ cookie });
    const limitedOne = await readVersion(prices.versionId ?? "", { cookie });

    expect(limited.status).toBe(429);
    expect(limitedOne.status).toBe(429);
    expectAWaitWithinTheWindowOf(
      limited,
      STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name,
    );
    expect(priceStoreAsks.count).toBe(0);

    limiterLedger.refusing.clear();
    limiterLedger.unavailable.add(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name);
    expect((await readVersions({ cookie })).status).toBe(503);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});
