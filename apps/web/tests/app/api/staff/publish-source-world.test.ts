// The publish screens' source over the worlds the dashboard's routes are tested in: the persistence package's fake stores
// with the app's own sessions. The source is called after the page's staff gate has admitted the reader, and a render must
// not write: it gets the page's facts and leaves no audit row, touches no session and spends no limiter bucket. Who is
// admitted is the gate's (`read-catalog-page.test.ts`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { PRICE_VERSION_PAGE_SIZE } from "@lemnaria/persistence";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { pendingPriceCountOf } from "@/price-dashboard/cabinet-list-model";
import {
  readPendingPriceCount,
  readPublishPage,
  readVersionDetail,
} from "@/price-dashboard/publish-source";
import { readDashboardStateWire } from "@/price-dashboard/price-dashboard-wire-reading";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import { readState } from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  ANCHOR_ADDRESS,
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

const OTHER_ANCHOR_MINOR = 500_000;
const DEPTH_RULE = { kind: "depth-rule" } as const;

let accountWorld: AccountWorld;
let staffWorld: StaffWorld;
let prices: PriceDashboardWorld;
let cookie: string;

beforeEach(async () => {
  accountWorld = freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  cookie = (await signedInAs({ role: "administrator" })).session.cookie;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function holdUnreadableDraft(draftRevision: string): void {
  vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
    draftRevision,
    changes: [{ address: { kind: "cabinet" }, value: "STORED-JUNK" }],
  });
}

describe("the publish page", () => {
  it("is the state the route sends, the first page of the history and the cabinets named in Romanian", async () => {
    await putChange(cookie, ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);
    await putChange(cookie, DEPTH_RULE, 20);

    const read = await readPublishPage();

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    const served = readDashboardStateWire(
      await jsonOf(await readState({ cookie })),
    );
    expect(read.input.state).toEqual(served);
    expect(read.input.state.draft.changes).toHaveLength(2);
    expect(read.input.versions).toMatchObject({
      total: 1,
      page: 1,
      pageSize: PRICE_VERSION_PAGE_SIZE,
    });
    expect(read.input.versions.versions.map(({ state }) => state)).toEqual([
      "active",
    ]);
    const names = Object.values(read.input.cabinetNames);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => name.trim() !== "")).toBe(true);
  });

  it("holds the history newest first once there are more versions", async () => {
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR, "Second");

    const read = await readPublishPage();

    expect(read.kind === "ready" && read.input.versions.versions).toMatchObject(
      [
        { label: "Second", state: "active", sequenceNumber: 2 },
        { label: "Version 1", state: "archived", sequenceNumber: 1 },
      ],
    );
  });

  it("is the unreadable draft, at the revision the store named, and states no book", async () => {
    holdUnreadableDraft("9");

    expect(await readPublishPage()).toEqual({
      kind: "draft-unreadable",
      draftRevision: "9",
    });
  });

  it("is unavailable for a store that cannot be read and for a dashboard with no version", async () => {
    vi.spyOn(prices.stores.priceBook, "readDraft").mockRejectedValue(
      new Error("the store is down"),
    );
    const failing = await readPublishPage();
    vi.restoreAllMocks();
    await freshPriceDashboardWorld({ isPublished: false });
    const unpublished = await readPublishPage();

    expect(failing).toEqual({ kind: "unavailable" });
    expect(unpublished).toEqual({ kind: "unavailable" });
  });

  it("is unavailable when only the history cannot be read, so no page claims a state beside a history it lacks", async () => {
    vi.spyOn(prices.stores.priceBook, "listVersions").mockRejectedValue(
      new Error("the store is down"),
    );

    expect(await readPublishPage()).toEqual({ kind: "unavailable" });
  });
});

describe("one version's page", () => {
  it("is the version, the one before it, the active book and the draft", async () => {
    const second = await publishAnchor(cookie, OTHER_ANCHOR_MINOR, "Second");
    await putChange(cookie, DEPTH_RULE, 20);

    const read = await readVersionDetail(prices.versionId ?? "");
    const readSecond = await readVersionDetail(second);

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    expect(read.input.version).toMatchObject({
      versionId: prices.versionId,
      sequenceNumber: 1,
      state: "archived",
    });
    expect(read.input.predecessor).toBeUndefined();
    expect(read.input.active.sequenceNumber).toBe(2);
    expect(read.input.draft.changes).toHaveLength(1);
    expect(
      readSecond.kind === "ready" && readSecond.input.predecessor,
    ).toMatchObject({ sequenceNumber: 1 });
  });

  it("finds the version before the first of a page in the last of the page before it", async () => {
    for (
      let published = 2;
      published <= PRICE_VERSION_PAGE_SIZE + 1;
      published += 1
    ) {
      await publishAnchor(cookie, OTHER_ANCHOR_MINOR + published * 10_000);
    }
    const listed = await prices.stores.priceBook.listVersions({ page: 2 });
    expect(listed.versions.map(({ sequenceNumber }) => sequenceNumber)).toEqual(
      [1],
    );

    const secondVersion = (
      await prices.stores.priceBook.listVersions({ page: 1 })
    ).versions.at(-1);
    const read = await readVersionDetail(secondVersion?.versionId ?? "");

    expect(secondVersion?.sequenceNumber).toBe(2);
    expect(read.kind === "ready" && read.input.predecessor).toMatchObject({
      sequenceNumber: 1,
    });
  });

  it("is not-found for an id no store holds and for one no store could hold", async () => {
    expect(await readVersionDetail("A".repeat(21))).toEqual({
      kind: "not-found",
    });
    expect(await readVersionDetail("../prices")).toEqual({ kind: "not-found" });
  });

  it("is the unreadable draft when the draft cannot be read, since a restore has no draft to add to", async () => {
    holdUnreadableDraft("9");

    expect(await readVersionDetail(prices.versionId ?? "")).toEqual({
      kind: "draft-unreadable",
      draftRevision: "9",
    });
  });
});

describe("the count of waiting prices", () => {
  it("is the draft's, the same number the route's state gives the cabinet screens", async () => {
    await putChange(cookie, ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);
    await putChange(cookie, DEPTH_RULE, 20);

    const served = readDashboardStateWire(
      await jsonOf(await readState({ cookie })),
    );

    expect(await readPendingPriceCount()).toBe(2);
    expect(await readPendingPriceCount()).toBe(
      pendingPriceCountOf(served?.draft ?? { draftRevision: "", changes: [] }),
    );
  });

  it("is a known zero for an empty draft, and nothing for a draft or a store that cannot be read", async () => {
    expect(await readPendingPriceCount()).toBe(0);
    holdUnreadableDraft("9");
    expect(await readPendingPriceCount()).toBeUndefined();
    vi.restoreAllMocks();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockRejectedValue(
      new Error("the store is down"),
    );
    expect(await readPendingPriceCount()).toBeUndefined();
  });
});

describe("a page render writes nothing and spends nothing", () => {
  it("leaves no audit row, touches no session and counts no limiter bucket, on any of the reads", async () => {
    staffWorld.auditBehaviour = "reject";
    const callsBefore = accountWorld.calls.length;
    const bucketsBefore = limiterLedger.counted.length;

    expect((await readPublishPage()).kind).toBe("ready");
    expect((await readVersionDetail(prices.versionId ?? "")).kind).toBe(
      "ready",
    );
    expect(await readPendingPriceCount()).toBe(0);

    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(
      prices.ledger
        .heldEvents()
        .filter(({ action }) => action === "price-catalogue-viewed"),
    ).toEqual([]);
    expect(accountWorld.calls.slice(callsBefore)).toEqual([]);
    expect(limiterLedger.counted.slice(bucketsBefore)).toEqual([]);
  });
});
