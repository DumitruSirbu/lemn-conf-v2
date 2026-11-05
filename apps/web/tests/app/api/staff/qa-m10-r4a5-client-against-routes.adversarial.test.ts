// Adversarial QA of the lifecycle client against the routes themselves. A stub of `fetch` hands each request to the real
// availability, usage and state handlers over the persistence package's fakes, so the client is held to what the routes
// really answer: the items a book does not state, the refusals, the end of a session, a count already in flight on the
// account, and a bucket that refuses. Nothing here is a stand-in for the server's reply.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ItemRef,
  type PriceBook,
  type ItemUsageCounts,
} from "@lemnaria/configurator-domain";
import type { KitchenUsageReader } from "@lemnaria/persistence";

import { STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { createFetchingItemLifecycleClient } from "@/price-dashboard/fetching-item-lifecycle-client";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  captureConsole,
  freshAccountWorld,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  availabilityHead,
  disabledNow,
  type Administrator,
} from "../../../support/availability-route-world";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { fetchAnsweredByTheStaffRoutes } from "../../../support/staff-route-fetch";
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

const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const MELAMINE: ItemRef = { kind: "material", tierId: "material.melamine" };
const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const SOFT_CLOSE: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const SINK_COVER: ItemRef = {
  kind: "accessory",
  accessoryId: "sinkProtectiveCover",
};
const DROPPED_TIER: ItemRef = { kind: "material", tierId: "material.dropped" };
const UNLINKED_ACCESSORY: ItemRef = {
  kind: "accessory",
  accessoryId: "linked-to-nothing",
};
const LINKED_ACCESSORY_ID = "linked-to-a-wall-cabinet";
const LINKED_ACCESSORY: ItemRef = {
  kind: "accessory",
  accessoryId: LINKED_ACCESSORY_ID,
};
const THE_BUCKET = STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY.name;
const BUSY_SECONDS_ON_THE_ROUTE = "10";

interface Exchange {
  readonly address: string;
  readonly status: number;
  readonly retryAfter: string | null;
}

let prices: PriceDashboardWorld;
let admin: Administrator;
let cookie: string | undefined;
let exchanges: Exchange[];

function bookLinkingAccessory(): PriceBook {
  return {
    ...ANCHORED_BOOK,
    linkedAccessories: [
      {
        accessoryId: LINKED_ACCESSORY_ID,
        ruleId: `accessory.${LINKED_ACCESSORY_ID}`,
        linkedBuildId: "wall-cabinet",
        perUnitMinor: 1_000,
        name: "Linked",
      },
    ],
  };
}

async function startWorld(book?: PriceBook): Promise<void> {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld(book === undefined ? {} : { book });
  admin = await administrator();
  cookie = admin.cookie;
  exchanges = [];
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  resetStaffSessionExpiryForTests();
  const routes = fetchAnsweredByTheStaffRoutes(() => cookie);
  vi.stubGlobal("fetch", async (address: string, init?: RequestInit) => {
    const answer = await routes(address, init);
    exchanges.push({
      address,
      status: answer.status,
      retryAfter: answer.headers.get("retry-after"),
    });
    return answer;
  });
}

beforeEach(async () => {
  await startWorld();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  limiterLedger.reset();
});

function plant(designId: string, uses: readonly ItemRef[]): void {
  prices.designs.plant({ designId, uses, isDeletedByClient: false });
}

const usageExchanges = () =>
  exchanges.filter(({ address }) => address.endsWith("/usage"));

function counted(counts: ItemUsageCounts) {
  return { kind: "counted", counts };
}

describe("a count of items the active book does or does not state", () => {
  it("is given for the stated item only: an unstated tier and an unstated linked accessory have no count, and none is a zero", async () => {
    plant("d1", [VENEER]);
    plant("d2", [VENEER]);

    const read = await createFetchingItemLifecycleClient().readUsage([
      DROPPED_TIER,
      VENEER,
      UNLINKED_ACCESSORY,
    ]);

    expect(read).toEqual(counted([{ item: VENEER, designCount: 2 }]));
    expect(usageExchanges().map(({ status }) => status)).toEqual([200]);
  });

  it("is unavailable, and never zero, when every item asked is one the book does not state", async () => {
    plant("d1", [DROPPED_TIER]);

    const read = await createFetchingItemLifecycleClient().readUsage([
      DROPPED_TIER,
      UNLINKED_ACCESSORY,
    ]);

    expect(read).toEqual({ kind: "unavailable" });
  });

  it("gives a linked accessory its count only while the book states it", async () => {
    await startWorld(bookLinkingAccessory());

    const stated = await createFetchingItemLifecycleClient().readUsage([
      LINKED_ACCESSORY,
    ]);
    await startWorld();
    const notStated = await createFetchingItemLifecycleClient().readUsage([
      LINKED_ACCESSORY,
    ]);

    expect(stated).toEqual(
      counted([{ item: LINKED_ACCESSORY, designCount: 0 }]),
    );
    expect(notStated).toEqual({ kind: "unavailable" });
  });

  it("finds each count by its item across requests: 120 materials, three of them stated and placed in three different requests", async () => {
    plant("d1", [VENEER]);
    plant("d2", [MELAMINE]);
    plant("d3", [MELAMINE]);
    const unstated = (place: number): ItemRef => ({
      kind: "material",
      tierId: `material.unstated-${String(place)}`,
    });
    const asked: ItemRef[] = Array.from({ length: 120 }, (_, place) =>
      unstated(place),
    );
    asked[0] = VENEER;
    asked[MAX_USAGE_ITEMS + 5] = MELAMINE;
    asked[119] = PAINTED;

    const read = await createFetchingItemLifecycleClient().readUsage(asked);

    expect(usageExchanges()).toHaveLength(3);
    expect(read).toEqual(
      counted([
        { item: VENEER, designCount: 1 },
        { item: MELAMINE, designCount: 2 },
        { item: PAINTED, designCount: 0 },
      ]),
    );
  });

  it("gives a hardware class and a material their own counts when asked together", async () => {
    plant("d1", [SOFT_CLOSE]);
    plant("d2", [SOFT_CLOSE]);
    plant("d3", [VENEER]);

    const read = await createFetchingItemLifecycleClient().readUsage([
      VENEER,
      SOFT_CLOSE,
    ]);

    expect(read).toEqual(
      counted([
        { item: VENEER, designCount: 1 },
        { item: SOFT_CLOSE, designCount: 2 },
      ]),
    );
  });
});

describe("a switch against the real route", () => {
  it("is set with the revision the store now holds, and the item is switched off there", async () => {
    const client = createFetchingItemLifecycleClient();
    const head = await availabilityHead();

    const outcome = await client.setActive({
      expectedRevision: head,
      item: VENEER,
      active: false,
    });

    expect(outcome.kind).toBe("set");
    expect(outcome).toEqual({
      kind: "set",
      revision: await availabilityHead(),
    });
    expect(await disabledNow()).toEqual([VENEER]);
    expect(await availabilityHead()).not.toBe(head);
  });

  it("is refused item-always-present for the sink cover, and nothing is written", async () => {
    const head = await availabilityHead();

    const outcome = await createFetchingItemLifecycleClient().setActive({
      expectedRevision: head,
      item: SINK_COVER,
      active: false,
    });

    expect(outcome).toEqual({ kind: "refused", code: "item-always-present" });
    expect(await availabilityHead()).toBe(head);
  });

  it("is refused item-not-in-active-book for an item the book does not state, switching on as well as off", async () => {
    const client = createFetchingItemLifecycleClient();

    const outcomes = [];
    for (const active of [true, false]) {
      outcomes.push(
        await client.setActive({
          expectedRevision: await availabilityHead(),
          item: DROPPED_TIER,
          active,
        }),
      );
    }

    expect(outcomes).toEqual([
      { kind: "refused", code: "item-not-in-active-book" },
      { kind: "refused", code: "item-not-in-active-book" },
    ]);
  });

  it("is a conflict when the revision it holds is one the store has moved on from, and nothing is written", async () => {
    const client = createFetchingItemLifecycleClient();
    const stale = await availabilityHead();
    await client.setActive({
      expectedRevision: stale,
      item: VENEER,
      active: false,
    });
    const head = await availabilityHead();

    const outcome = await client.setActive({
      expectedRevision: stale,
      item: PAINTED,
      active: false,
    });

    expect(outcome).toEqual({ kind: "conflict" });
    expect(await availabilityHead()).toBe(head);
    expect(await disabledNow()).toEqual([VENEER]);
  });

  it("is the end of the session on a 401 with no cookie, and failed for an operator, who may not switch", async () => {
    const client = createFetchingItemLifecycleClient();
    const request = {
      expectedRevision: await availabilityHead(),
      item: VENEER,
      active: false,
    };

    cookie = undefined;
    const anonymous = await client.setActive(request);
    cookie = (await signedInAs({ role: "operator" }, "operator@example.test"))
      .session.cookie;
    const operator = await client.setActive(request);

    expect(anonymous).toEqual({ kind: "session-ended" });
    expect(operator).toEqual({ kind: "failed" });
    expect(exchanges.map(({ status }) => status)).toEqual([401, 403]);
    expect(await disabledNow()).toEqual([]);
  });
});

describe("a count without a session", () => {
  it("is unavailable for no cookie and for an operator, which may not count", async () => {
    plant("d1", [VENEER]);
    const client = createFetchingItemLifecycleClient();

    cookie = undefined;
    const anonymous = await client.readUsage([VENEER]);
    cookie = (await signedInAs({ role: "operator" }, "operator@example.test"))
      .session.cookie;
    const operator = await client.readUsage([VENEER]);

    expect([anonymous, operator]).toEqual([
      { kind: "unavailable" },
      { kind: "unavailable" },
    ]);
    expect(usageExchanges().map(({ status }) => status)).toEqual([401, 403]);
  });

  it("reads what is switched off from the state the same session reads", async () => {
    const client = createFetchingItemLifecycleClient();
    await client.setActive({
      expectedRevision: await availabilityHead(),
      item: VENEER,
      active: false,
    });

    const read = await client.readAvailability();

    expect(read).toEqual({
      revision: await availabilityHead(),
      disabled: [VENEER],
    });
  });
});

describe("a count the route finds busy, as two tabs of one account meet it", () => {
  function holdTheFirstCount() {
    let release: () => void = () => undefined;
    const held = new Promise<
      Awaited<ReturnType<KitchenUsageReader["countEach"]>>
    >((resolve) => {
      release = () => {
        resolve({
          counts: [{ item: VENEER, designCount: 0 }],
          unreadableDesigns: 0,
        });
      };
    });
    const asked = vi
      .spyOn(prices.defaults, "countEach")
      .mockReturnValueOnce(held);
    return { asked, release };
  }

  it("answers 429 with the wait the client is willing to take, so the second tab is counted once the first has ended", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    plant("d1", [SOFT_CLOSE]);
    const { asked, release } = holdTheFirstCount();
    const firstTab = createFetchingItemLifecycleClient().readUsage([VENEER]);
    await vi.waitFor(() => {
      expect(asked).toHaveBeenCalledTimes(1);
    });

    const secondTab = createFetchingItemLifecycleClient().readUsage([
      SOFT_CLOSE,
    ]);
    await vi.waitFor(() => {
      expect(usageExchanges()).toHaveLength(1);
    });
    expect(usageExchanges()[0]).toEqual({
      address: "/api/staff/prices/usage",
      status: 429,
      retryAfter: BUSY_SECONDS_ON_THE_ROUTE,
    });
    release();
    await firstTab;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await secondTab).toEqual(
      counted([{ item: SOFT_CLOSE, designCount: 1 }]),
    );
  });

  it("is counted on the first retry when the first tab's count never ends, since the server gives that count up within the wait it named", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    plant("d1", [SOFT_CLOSE]);
    const { asked } = holdTheFirstCount();
    const firstTab = createFetchingItemLifecycleClient().readUsage([VENEER]);
    await vi.waitFor(() => {
      expect(asked).toHaveBeenCalledTimes(1);
    });
    const secondTab = createFetchingItemLifecycleClient().readUsage([
      SOFT_CLOSE,
    ]);

    await vi.advanceTimersByTimeAsync(25_000);

    expect(await firstTab).toEqual({ kind: "unavailable" });
    expect(await secondTab).toEqual(
      counted([{ item: SOFT_CLOSE, designCount: 1 }]),
    );
    expect(usageExchanges().map(({ status }) => status)).toEqual([
      429, 503, 200,
    ]);
  });

  it("sends no more than three requests when the account's bucket refuses, whatever wait the route names", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const read = createFetchingItemLifecycleClient().readUsage([VENEER]);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await read).toEqual({ kind: "unavailable" });
    expect(usageExchanges().length).toBeLessThanOrEqual(3);
    expect(usageExchanges().every(({ status }) => status === 429)).toBe(true);
  });
});
