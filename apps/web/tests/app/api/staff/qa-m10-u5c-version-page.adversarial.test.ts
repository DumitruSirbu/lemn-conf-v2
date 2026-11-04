// Adversarial QA of the version page's facts over the fake stores the routes are tested on: the version before a version is
// found wherever the history's page boundaries fall, the first has none, a missing one is not-found, and a store that fails
// part-way through the walk is unavailable and never a first version.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "@lemnaria/persistence";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { PRICE_VERSION_PAGE_SIZE } from "@lemnaria/persistence";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { readVersionDetail } from "@/price-dashboard/publish-source";

import {
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { publishAnchor } from "../../../support/price-versions";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";

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

const VERSIONS_PUBLISHED = 2 * PRICE_VERSION_PAGE_SIZE + 3;

let prices: PriceDashboardWorld;
let cookie: string;
let versionIds: readonly string[];

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  cookie = (await signedInAs({ role: "administrator" })).session.cookie;
  const ids = [prices.versionId ?? ""];
  for (let published = 2; published <= VERSIONS_PUBLISHED; published += 1) {
    ids.push(await publishAnchor(cookie, 400_000 + published * 1_000));
  }
  versionIds = ids;
}, 120_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the version before a version, over a history of three pages", () => {
  it("is the version published just before it, for every version, whichever page each falls on", async () => {
    const found: (number | undefined)[] = [];
    for (const versionId of versionIds) {
      const read = await readVersionDetail(versionId);
      expect(read.kind).toBe("ready");
      if (read.kind !== "ready") return;
      expect(read.input.version.sequenceNumber).toBe(found.length + 1);
      found.push(read.input.predecessor?.sequenceNumber);
    }

    expect(found).toEqual([
      undefined,
      ...Array.from({ length: VERSIONS_PUBLISHED - 1 }, (_, at) => at + 1),
    ]);
  });

  it("is the book that version stated, not the active one's", async () => {
    const second = await readVersionDetail(versionIds[1] ?? "");
    const third = await readVersionDetail(versionIds[2] ?? "");

    expect(second.kind === "ready" && third.kind === "ready").toBe(true);
    if (second.kind !== "ready" || third.kind !== "ready") return;
    expect(third.input.predecessor?.book).toEqual(second.input.version.book);
    expect(second.input.version.book).not.toEqual(third.input.version.book);
  });

  it("is unavailable, and not a first version, when the history fails after its first page", async () => {
    const listVersions = prices.stores.priceBook.listVersions.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "listVersions").mockImplementation(
      (request) =>
        request.page >= 2
          ? Promise.reject(
              new DashboardStoreError("list the price versions", "unavailable"),
            )
          : listVersions(request),
    );
    const oldestOfThePage =
      versionIds[VERSIONS_PUBLISHED - PRICE_VERSION_PAGE_SIZE] ?? "";

    expect(await readVersionDetail(oldestOfThePage)).toEqual({
      kind: "unavailable",
    });
  });
});

describe("a version no page can show", () => {
  it("is not-found for a well-formed id the store does not hold, whatever the length of the history", async () => {
    expect(await readVersionDetail("Z".repeat(21))).toEqual({
      kind: "not-found",
    });
  });
});
