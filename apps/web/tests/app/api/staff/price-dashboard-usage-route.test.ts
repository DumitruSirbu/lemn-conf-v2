import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  pricedAsBuildId,
  usesItem,
  type Design,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  type ItemUsageProbe,
  type KitchenUsageReader,
} from "@lemnaria/persistence";

import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import {
  STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY,
  STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY,
  STAFF_PRICE_USAGE_PER_ACCOUNT_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

import {
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  allRows,
  type Administrator,
} from "../../../support/availability-route-world";
import {
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  VENEER_TIER_ID,
} from "../../../support/mdf-kitchen-wearing-chosen-colours";
import { builtDeep } from "../../../support/deep-priced-kitchens";
import {
  readUsage,
  setAvailability,
} from "../../../support/price-dashboard-requests";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
  type PriceDashboardWorldOptions,
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
 * `POST /api/staff/prices/usage`: how many saved designs use each of up to 50 items. The route is called with `Request`
 * objects over the persistence package's fakes; the session lookup, the capability check, the limiter and the probes the
 * domain builds are the real ones.
 */

const VENEER = { kind: "material", tierId: "material.veneer" } as const;
const MELAMINE = { kind: "material", tierId: "material.melamine" } as const;
const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;
const NUT_FINISH = { kind: "finish", finishId: "veneer.nuc" } as const;
const BLACK_HANDLE = { kind: "handle", handle: "black" } as const;
const SINK_COVER = {
  kind: "accessory",
  accessoryId: "sinkProtectiveCover",
} as const;
const THE_BUCKET = STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY.name;
const LINKED_ROW = "wall-cabinet";
const LINKED_ACCESSORY = "linked-to-a-wall-cabinet";

let prices: PriceDashboardWorld;
let admin: Administrator;
let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

async function startWorld(options?: PriceDashboardWorldOptions): Promise<void> {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld(options);
  admin = await administrator();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
}

beforeEach(async () => {
  await startWorld();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function count(items: unknown, extra: Record<string, unknown> = {}) {
  const { cookie } = admin;
  return readUsage({ cookie, json: { items, ...extra } });
}

function plant(designId: string, uses: readonly ItemRef[]): void {
  prices.designs.plant({ designId, uses, isDeletedByClient: false });
}

function accessoryIds(howMany: number): ItemRef[] {
  return Array.from({ length: howMany }, (_, index) => ({
    kind: "accessory",
    accessoryId: `accessory-${String(index)}`,
  }));
}

function bookLinking(accessoryId: string, linkedBuildId: string): PriceBook {
  return {
    ...ANCHORED_BOOK,
    linkedAccessories: [
      {
        accessoryId,
        ruleId: `accessory.${accessoryId}`,
        linkedBuildId,
        perUnitMinor: 1_000,
        name: "Linked",
      },
    ],
  };
}

/** The probes the route hands the reader for one request: the argument itself, captured at the hand-over. */
async function probesAskedFor(
  items: readonly ItemRef[],
): Promise<readonly ItemUsageProbe[]> {
  const asked = vi.spyOn(prices.defaults, "countEach");
  const answer = await count(items);
  expect(answer.status).toBe(200);
  const [probes] = asked.mock.calls[0] ?? [];
  if (probes === undefined) throw new Error("the reader was not asked");
  return probes;
}

function budgetOf(name: string): number {
  return limiterLedger.counted.filter((counted) => counted === name).length;
}

describe("a count that is answered", () => {
  it("is the designs that use each item, one entry per item in the domain's order, and private", async () => {
    plant("d1", [VENEER, SOFT_CLOSE]);
    plant("d2", [VENEER]);
    plant("d3", [MELAMINE]);

    const answer = await count([SOFT_CLOSE, VENEER, MELAMINE]);

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({
      counts: [
        { item: MELAMINE, count: 1 },
        { item: VENEER, count: 2 },
        { item: SOFT_CLOSE, count: 1 },
      ],
    });
  });

  it("counts an item named twice once and answers it once", async () => {
    plant("d1", [VENEER]);
    const asked = vi.spyOn(prices.defaults, "countEach");

    const answer = await count([VENEER, SOFT_CLOSE, VENEER, VENEER]);

    expect(await jsonOf(answer)).toEqual({
      counts: [
        { item: VENEER, count: 1 },
        { item: SOFT_CLOSE, count: 0 },
      ],
    });
    expect(asked.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("answers 50 distinct items and a request whose 50 names are carried 3 times each", async () => {
    const fifty = accessoryIds(MAX_USAGE_ITEMS);

    const once = await count(fifty);
    const repeated = await count([...fifty, ...fifty, ...fifty]);

    expect(once.status).toBe(200);
    expect(((await jsonOf(once)) as { counts: unknown[] }).counts).toHaveLength(
      MAX_USAGE_ITEMS,
    );
    expect(repeated.status).toBe(200);
  });

  it("answers 50 refs of the longest ids the shape allows, which a body bound must not turn into a 413", async () => {
    const longest = Array.from({ length: MAX_USAGE_ITEMS }, (_, index) => ({
      kind: "accessory",
      accessoryId: `${String(index).padStart(2, "0")}${"a".repeat(62)}`,
    }));

    const answer = await count(longest);

    expect(answer.status).toBe(200);
  });

  it("counts only what the designs name: an item no design uses is 0, not missing", async () => {
    plant("d1", [VENEER]);

    const answer = await count([BLACK_HANDLE, NUT_FINISH, SINK_COVER]);

    expect(await jsonOf(answer)).toEqual({
      counts: [
        { item: NUT_FINISH, count: 0 },
        { item: BLACK_HANDLE, count: 0 },
        { item: SINK_COVER, count: 0 },
      ],
    });
  });

  it("leaves the draft, the availability and every audit row as they were", async () => {
    const rowsBefore = allRows().length;
    const asked = prices.stores.availability.readCurrent();

    const answer = await count([VENEER]);

    expect(answer.status).toBe(200);
    expect(allRows()).toHaveLength(rowsBefore);
    expect(await prices.stores.availability.readCurrent()).toEqual(await asked);
  });
});

describe("a body this route does not read", () => {
  const MALFORMED_BODIES: readonly (readonly [string, unknown])[] = [
    ["text that is not JSON", "{nope"],
    ["a list", [VENEER]],
    ["no items member", {}],
    ["a member beside items", { items: [VENEER], probes: [] }],
    ["a build-id member beside items", { items: [VENEER], buildIds: ["x"] }],
    ["a fallback member beside items", { items: [VENEER], isFallback: true }],
    ["items that is not a list", { items: VENEER }],
    ["items that is null", { items: null }],
    ["a ref that is null", { items: [null] }],
    ["a ref that is a string", { items: ["material.veneer"] }],
    ["a ref without a kind", { items: [{ tierId: "material.veneer" }] }],
    [
      "a ref of a kind that is not one",
      { items: [{ kind: "cabinet", id: "x" }] },
    ],
    [
      "a ref with a build-id member",
      { items: [{ ...VENEER, buildIds: ["wall-cabinet"] }] },
    ],
    [
      "a ref with a fallback flag",
      { items: [{ ...VENEER, isFallback: true }] },
    ],
    [
      "a ref with a predicate",
      { items: [{ ...VENEER, isUsedBy: "() => true" }] },
    ],
    [
      "a ref with a via member",
      { items: [{ ...VENEER, via: "placed-bodies" }] },
    ],
    [
      "a ref whose id member is another kind's",
      { items: [{ kind: "finish", tierId: "veneer.nuc" }] },
    ],
    ["a ref with an empty id", { items: [{ kind: "material", tierId: "" }] }],
    [
      "a ref with an id past the bound",
      { items: [{ kind: "material", tierId: "m".repeat(65) }] },
    ],
    [
      "a ref with an id that is not text",
      { items: [{ kind: "material", tierId: 7 }] },
    ],
    [
      "a handle the design does not list",
      { items: [{ kind: "handle", handle: "gold" }] },
    ],
    [
      "one good ref and one bad",
      { items: [VENEER, { kind: "material", tierId: "" }] },
    ],
  ];

  it.each(MALFORMED_BODIES)(
    "refuses %s with 400, touches no store and spends no bucket",
    async (_name, json) => {
      const { cookie } = admin;
      limiterLedger.counted.length = 0;

      const answer = await readUsage({ cookie, json });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(priceStoreAsks.count).toBe(0);
      expect(budgetOf(THE_BUCKET)).toBe(0);
    },
  );

  it("names items when it asks about nothing", async () => {
    const answer = await count([]);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "items", code: "MISSING_VALUE" }],
    });
    expect(priceStoreAsks.count).toBe(0);
  });

  it("names items when it asks about 51 distinct ones, and echoes none of them", async () => {
    const { cookie } = admin;
    limiterLedger.counted.length = 0;

    const answer = await readUsage({
      cookie,
      json: { items: accessoryIds(MAX_USAGE_ITEMS + 1) },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "items", code: "TOO_LARGE" }],
    });
    expect(priceStoreAsks.count).toBe(0);
    expect(budgetOf(THE_BUCKET)).toBe(0);
  });
});

describe("the probes the reader is handed", () => {
  it("are built on the server for the items named, one per distinct item, in the domain's order", async () => {
    const probes = await probesAskedFor([SOFT_CLOSE, NUT_FINISH, VENEER]);

    expect(probes.map(({ item, via }) => [item, via])).toEqual([
      [VENEER, "settings-tier"],
      [SOFT_CLOSE, "settings-tier"],
      [NUT_FINISH, "migrated-design"],
    ]);
  });

  it("flag a tier as the fallback by the active book's default, not by anything sent", async () => {
    const defaultTier = ANCHORED_BOOK.material.defaultTierId;
    const otherTier = ANCHORED_BOOK.material.tiers.find(
      ({ tierId }) => tierId !== defaultTier,
    )?.tierId;
    if (otherTier === undefined) throw new Error("the book has one tier");

    const probes = await probesAskedFor([
      { kind: "material", tierId: defaultTier },
      { kind: "material", tierId: otherTier },
    ]);

    const flagOf = (tierId: string) =>
      probes.find(
        (probe) =>
          probe.item.kind === "material" && probe.item.tierId === tierId,
      );
    expect(flagOf(defaultTier)).toMatchObject({ isFallback: true });
    expect(flagOf(otherTier)).toMatchObject({ isFallback: false });
  });

  it("give a linked accessory the build ids priced as its row in the other depth's catalogue, and none for a name the book lacks", async () => {
    await startWorld({ book: bookLinking(LINKED_ACCESSORY, LINKED_ROW) });
    const deep = buildKitchenLBodyCatalog(700);
    const pricedAsTheRow = [...deep.keys()].filter(
      (buildId) => pricedAsBuildId(deep, buildId) === LINKED_ROW,
    );

    const probes = await probesAskedFor([
      { kind: "accessory", accessoryId: LINKED_ACCESSORY },
      { kind: "accessory", accessoryId: "not-in-the-book" },
    ]);

    const byAccessory = new Map(
      probes.map((probe) => [
        probe.item.kind === "accessory" ? probe.item.accessoryId : "",
        probe.via === "placed-bodies" ? [...probe.buildIds].sort() : undefined,
      ]),
    );
    expect(pricedAsTheRow.length).toBeGreaterThan(1);
    expect(byAccessory.get(LINKED_ACCESSORY)).toEqual(
      [...pricedAsTheRow].sort(),
    );
    expect(byAccessory.get("not-in-the-book")).toEqual([]);
  });

  it("read a colour and a built-in accessory the same in a kitchen of either depth, so neither is dropped", async () => {
    const veneered: Design = {
      ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      settings: {
        ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS.settings,
        materialTierId: VENEER_TIER_ID,
      },
    };
    const kitchens = [veneered, builtDeep(veneered)];
    const items: ItemRef[] = [NUT_FINISH, SINK_COVER];

    const probes = await probesAskedFor(items);

    const verdicts = probes.map((probe) => {
      if (probe.via !== "migrated-design") throw new Error("not walked");
      return kitchens.map((design) => probe.isUsedBy(design));
    });
    const oracle = items.map((item) =>
      kitchens.map((design) =>
        usesItem({
          design,
          item,
          catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
          book: ANCHORED_BOOK,
        }),
      ),
    );
    expect(oracle.flat()).toContain(true);
    expect(verdicts).toEqual(oracle);
  });
});

describe("the order of checks", () => {
  it("answers a cross-site request before the session is read", async () => {
    const answer = await readUsage({
      secFetchSite: "cross-site",
      json: { items: [VENEER] },
    });

    expect(answer.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers a body that is not JSON with 415 and one past its bound with 413, before the session", async () => {
    const notJson = await readUsage({ contentType: "text/plain", json: "{}" });
    const tooLarge = await readUsage({
      json: JSON.stringify({ padding: "x".repeat(20_000) }),
    });

    expect([notJson.status, tooLarge.status]).toEqual([415, 413]);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers an anonymous request 401 and an operator's 403 before the body is read, and spends nothing", async () => {
    const operator = await signedInAs({ role: "operator" }, "op@example.test");
    limiterLedger.counted.length = 0;

    const anonymous = await readUsage({ json: "{nope" });
    const operatorAnswer = await readUsage({
      cookie: operator.session.cookie,
      json: { items: [VENEER] },
    });

    expect([anonymous.status, operatorAnswer.status]).toEqual([401, 403]);
    expect(budgetOf(THE_BUCKET)).toBe(0);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers a client 403 and reaches no store", async () => {
    const client = await signedInAs({ role: "client" }, "client@example.test");

    const answer = await readUsage({
      cookie: client.session.cookie,
      json: { items: [VENEER] },
    });

    expect(answer.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("reads the members before the bucket: a body it cannot read is 400 and spends nothing, though the bucket is spent", async () => {
    const { cookie } = admin;
    limiterLedger.counted.length = 0;
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const answer = await readUsage({ cookie, json: { items: [VENEER], x: 1 } });

    expect(answer.status).toBe(400);
    expect(budgetOf(THE_BUCKET)).toBe(0);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("asks the bucket before any store: a refused bucket is 429 with a wait and no store is asked", async () => {
    const { cookie } = admin;
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const answer = await readUsage({ cookie, json: { items: [VENEER] } });

    expect(answer.status).toBe(429);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expectAWaitWithinTheWindowOf(answer, THE_BUCKET);
    expect(priceStoreAsks.count).toBe(0);
  });
});

describe("the bucket", () => {
  it("is 120 an hour, a policy of its own, and not the draft's", () => {
    expect(STAFF_PRICE_USAGE_PER_ACCOUNT_HOUR_FIGURE).toBe(120);
    expect(STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY.figure).toBe(120);
    expect(THE_BUCKET).not.toBe(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name);
  });

  it("fails closed: a limiter store that is down is 503 with no store asked and no count", async () => {
    const { cookie } = admin;
    limiterLedger.unavailable.add(THE_BUCKET);

    const answer = await readUsage({ cookie, json: { items: [VENEER] } });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(priceStoreAsks.count).toBe(0);
  });

  it("counts a request that is admitted and valid once, in its own bucket and not the draft's", async () => {
    const { cookie } = admin;
    limiterLedger.counted.length = 0;

    await readUsage({ cookie, json: { items: [VENEER, VENEER] } });

    expect(budgetOf(THE_BUCKET)).toBe(1);
    expect(budgetOf(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name)).toBe(0);
  });

  it("is not spent by a draft write, and a drained usage bucket does not stop one", async () => {
    const { cookie } = admin;
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const answer = await setAvailability({
      cookie,
      json: {
        expectedRevision: (await prices.stores.availability.readCurrent())
          .revision,
        item: SOFT_CLOSE,
        active: false,
      },
    });

    expect(answer.status).toBe(200);
  });
});

describe("a read that writes no audit row", () => {
  it("leaves the audit ledger and the staff audit log empty of anything the read made", async () => {
    const rowsBefore = allRows().length;

    const answer = await count([VENEER, NUT_FINISH]);

    expect(answer.status).toBe(200);
    expect(allRows()).toHaveLength(rowsBefore);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});

describe("the designs a walk could not read", () => {
  it("are logged as a bare count when there are some, and are not in the answer", async () => {
    prices.designs.plant({
      designId: "unreadable",
      uses: [],
      isDeletedByClient: false,
      isUnreadable: true,
    });

    const answer = await count([NUT_FINISH]);

    expect(answer.status).toBe(200);
    expect(Object.keys((await jsonOf(answer)) as object)).toEqual(["counts"]);
    expect(
      console_.accountLines().filter((line) => "unreadableDesigns" in line),
    ).toEqual([{ event: "staff-price-usage", unreadableDesigns: 1 }]);
  });

  it("write no line when none were left out, and none when no item is walked", async () => {
    prices.designs.plant({
      designId: "unreadable",
      uses: [],
      isDeletedByClient: false,
      isUnreadable: true,
    });

    await count([VENEER]);
    prices.designs.plant({
      designId: "unreadable",
      uses: [],
      isDeletedByClient: true,
      isUnreadable: true,
    });
    await count([NUT_FINISH]);

    expect(
      console_.accountLines().filter((line) => "unreadableDesigns" in line),
    ).toEqual([]);
  });
});

describe("a count that cannot be given", () => {
  function readerAnswering(
    result: ReturnType<KitchenUsageReader["countEach"]>,
  ): void {
    vi.spyOn(prices.defaults, "countEach").mockReturnValue(result);
  }

  function sevenArrivingAt(
    milliseconds: number,
  ): ReturnType<KitchenUsageReader["countEach"]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          counts: [{ item: VENEER, designCount: 7 }],
          unreadableDesigns: 0,
        });
      }, milliseconds);
    });
  }

  function failureArrivingAt(
    milliseconds: number,
  ): ReturnType<KitchenUsageReader["countEach"]> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("late failure"));
      }, milliseconds);
    });
  }

  /** The answer once the clock has run to the deadline, read without awaiting it: a count with no deadline never settles. */
  async function answeredAtTheDeadline(
    pending: Promise<Response>,
  ): Promise<Response> {
    let answer: Response | undefined;
    void pending.then((settled) => {
      answer = settled;
    });
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    if (answer === undefined) throw new Error("no answer by the deadline");
    return answer;
  }

  async function expectNoCounts(
    answer: Response,
    expected: number,
  ): Promise<void> {
    expect(answer.status).toBe(expected);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
  }

  it("is 503 past the deadline, and the counts that arrive afterwards are sent to no one", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    readerAnswering(sevenArrivingAt(USAGE_READ_DEADLINE_MS + 1));

    const answer = await answeredAtTheDeadline(count([VENEER]));
    await vi.advanceTimersByTimeAsync(10);

    await expectNoCounts(answer, 503);
    expect(JSON.stringify(console_.everything())).not.toContain("designCount");
    expect(
      console_.accountLines().map(({ event, outcome }) => [event, outcome]),
    ).toContainEqual(["staff-price-usage", "unavailable"]);
  });

  it("is answered when the count arrives the instant before the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    readerAnswering(sevenArrivingAt(USAGE_READ_DEADLINE_MS - 1));

    const answer = await answeredAtTheDeadline(count([VENEER]));

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({
      counts: [{ item: VENEER, count: 7 }],
    });
  });

  it("is 503 for a walk that fails after the deadline passed, and raises no unhandled rejection", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    readerAnswering(failureArrivingAt(USAGE_READ_DEADLINE_MS + 1));

    const answer = await answeredAtTheDeadline(count([VENEER]));
    await vi.advanceTimersByTimeAsync(10);

    await expectNoCounts(answer, 503);
  });

  it("is 503 and no count when the reader fails", async () => {
    readerAnswering(
      Promise.reject(
        new DashboardStoreError(
          "count the kitchens using an item",
          "unavailable",
        ),
      ),
    );

    const answer = await count([VENEER]);

    await expectNoCounts(answer, 503);
  });

  it.each([
    ["leaves an item out", [{ item: VENEER, designCount: 3 }]],
    [
      "counts an item twice",
      [
        { item: VENEER, designCount: 3 },
        { item: VENEER, designCount: 3 },
        { item: SOFT_CLOSE, designCount: 0 },
      ],
    ],
    [
      "answers a count that is not a number of designs",
      [
        { item: VENEER, designCount: -1 },
        { item: SOFT_CLOSE, designCount: 0 },
      ],
    ],
    ["answers nothing", []],
  ])("is 503 and no count when the reader %s", async (_name, counts) => {
    readerAnswering(Promise.resolve({ counts, unreadableDesigns: 0 }));

    const answer = await count([VENEER, SOFT_CLOSE]);

    await expectNoCounts(answer, 503);
  });
});

describe("a store with no active version", () => {
  it("is 409 no-active-version and counts nothing", async () => {
    await startWorld({ isPublished: false });
    const asked = vi.spyOn(prices.defaults, "countEach");

    const answer = await count([VENEER]);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
    expect(asked).not.toHaveBeenCalled();
  });
});
