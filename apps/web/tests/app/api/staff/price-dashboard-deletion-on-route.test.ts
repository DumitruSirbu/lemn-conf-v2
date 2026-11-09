import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALWAYS_PRESENT_ACCESSORY_ID,
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { ItemUsageProbe } from "@lemnaria/persistence";

import { readPublishPage } from "@/price-dashboard/publish-source";
import { STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  createClassAs,
  revertAs,
  storedChangesOf,
} from "../../../support/creation-world";
import {
  saveBody,
  putDefaults,
} from "../../../support/kitchen-defaults-route-world";
import {
  changeDraft,
  currentDraftRevision,
  publishBody,
  publishDraft,
  readUsage,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
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

/**
 * R4c2: the draft route takes `item-deleted`. Over the world's price-book fake (a write and its audit row commit together
 * or neither) with the real session, capability, limiter, `applyChanges` and request readers. The check order is the
 * route's own checks, the stale draft revision, the plan, the saved defaults and then one count in SQL, so every refusal
 * below also asserts what the reader was and was not asked, and that nothing was written.
 */

const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: "plinth-light",
      ruleId: "accessory.plinth-light",
      linkedBuildId: "base-3drawer",
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const FIXED_DEFAULT_MATERIAL: ItemRef = {
  kind: "material",
  tierId: BOOK.material.defaultTierId,
};
const FIXED_DEFAULT_HARDWARE: ItemRef = {
  kind: "hardware",
  tierId: BOOK.hardware.defaultTierId,
};

const ITEM_IN_USE_BODY = {
  status: "invalid-input",
  issues: [{ field: "change", code: "ITEM_IN_USE" }],
};
const ITEM_IS_DEFAULT_BODY = {
  status: "invalid-input",
  issues: [{ field: "change", code: "ITEM_IS_DEFAULT" }],
};

let prices: PriceDashboardWorld;
let cookie: string;
let tokenHash: string;
let console_: ReturnType<typeof captureConsole>;
let designCount = 0;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK });
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  tokenHash = session.tokenHash;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function deletion(item: ItemRef): { address: unknown; value: unknown } {
  return { address: { kind: "item-deleted", item }, value: true };
}

async function deleteRow(
  item: ItemRef,
  change: { address: unknown; value: unknown } = deletion(item),
): Promise<Response> {
  return changeDraft({
    cookie,
    json: { expectedDraftRevision: await currentDraftRevision(), change },
  });
}

function aDesignNaming(item: ItemRef, isDeletedByClient = false): string {
  designCount += 1;
  const designId = `design-${String(designCount)}`;
  prices.designs.plant({ designId, uses: [item], isDeletedByClient });
  return designId;
}

async function stateOfTheWorld() {
  return {
    versions: (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    draft: await prices.stores.priceBook.readDraft(),
    auditRows: prices.ledger.heldEvents().length,
    availability: (await prices.stores.availability.readCurrent()).revision,
  };
}

function theReaderCounting(countOf: (item: ItemRef) => number = () => 0) {
  const asked: ItemUsageProbe[][] = [];
  const counting = vi
    .spyOn(prices.defaults, "countEach")
    .mockImplementation((probes) => {
      asked.push([...probes]);
      return Promise.resolve({
        counts: probes.map(({ item }) => ({
          item,
          designCount: countOf(item),
        })),
        unreadableDesigns: 0,
      });
    });
  return { asked, counting };
}

function auditRowsOf(action: string) {
  return prices.ledger.heldEvents().filter((row) => row.action === action);
}

describe("a deletion of an unused row the active book states", () => {
  it.each([
    ["a material", VENEER],
    ["a hardware class", PREMIUM],
    ["a linked accessory", PLINTH],
  ])(
    "is stored in the draft as %s, after one count in SQL",
    async (_name, item) => {
      const { asked } = theReaderCounting();

      const answer = await deleteRow(item);

      expect(answer.status).toBe(200);
      expect(await storedChangesOf(prices)).toEqual(deleting(item));
      expect(asked).toHaveLength(1);
      expect(asked[0]).toHaveLength(1);
      expect(asked[0]?.[0]?.via).not.toBe("migrated-design");
    },
  );

  it("writes one price-draft-changed row naming the deletion, in the write's own transaction", async () => {
    await deleteRow(VENEER);

    expect(auditRowsOf("price-draft-changed")).toHaveLength(1);
    expect(auditRowsOf("price-draft-changed")[0]?.detail).toMatchObject({
      changeKind: "item-deleted",
      itemKind: "material",
    });
  });

  it("answers 503 with the change absent when the audit row cannot be staged", async () => {
    const before = await stateOfTheWorld();
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is counted once, whatever else the draft already deletes", async () => {
    await plantDraft(tokenHash, deleting(PREMIUM));
    aDesignNaming(PREMIUM);
    const { asked } = theReaderCounting((item) => (item === PREMIUM ? 1 : 0));

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(200);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveLength(1);
  });

  it("is stored again over itself as one deletion, since a draft keeps one change per address", async () => {
    await deleteRow(VENEER);

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(200);
    expect(await storedChangesOf(prices)).toEqual(deleting(VENEER));
  });
});

describe("a deletion of a row a saved design uses", () => {
  it.each([
    ["a material", VENEER],
    ["a hardware class", PREMIUM],
    ["a linked accessory", PLINTH],
  ])(
    "is 400 ITEM_IN_USE on the change, with no count and no design, for %s",
    async (_name, item) => {
      const designId = aDesignNaming(item);
      const before = await stateOfTheWorld();

      const answer = await deleteRow(item);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual(ITEM_IN_USE_BODY);
      const text = await answer.clone().text();
      expect(text).not.toContain(designId);
      expect(text).not.toMatch(/\d/);
      expect(await stateOfTheWorld()).toEqual(before);
      expect(auditRowsOf("price-draft-changed")).toEqual([]);
    },
  );

  it("is allowed when every design naming the row was deleted by its client", async () => {
    aDesignNaming(VENEER, true);

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(200);
  });

  it("is refused on the count of the active book, whatever the draft holds besides", async () => {
    await plantDraft(tokenHash, deleting(PLINTH));
    aDesignNaming(VENEER);

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual(ITEM_IN_USE_BODY);
  });
});

describe("a deletion beside a page that counted the same row", () => {
  it("is judged on the count of its own request, never on what the publish page remembers", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const page = await readPublishPage();
    expect(page.kind).toBe("ready");
    aDesignNaming(VENEER);

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual(ITEM_IN_USE_BODY);
  });
});

describe("a deletion of a default", () => {
  async function savedAsDefault(defaults: Record<string, unknown>) {
    const saved = await putDefaults({
      cookie,
      json: await saveBody(defaults),
    });
    expect(saved.status).toBe(200);
  }

  it("is 400 ITEM_IS_DEFAULT for a saved default, with no count, and writes nothing", async () => {
    await savedAsDefault({ hardwareTierId: PREMIUM.tierId });
    const { asked } = theReaderCounting();
    const before = await stateOfTheWorld();

    const answer = await deleteRow(PREMIUM);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual(ITEM_IS_DEFAULT_BODY);
    expect(asked).toEqual([]);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("names the default before the use when a saved default is also used", async () => {
    await savedAsDefault({ hardwareTierId: PREMIUM.tierId });
    aDesignNaming(PREMIUM);

    const answer = await deleteRow(PREMIUM);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual(ITEM_IS_DEFAULT_BODY);
  });

  it.each([
    ["material", FIXED_DEFAULT_MATERIAL],
    ["hardware class", FIXED_DEFAULT_HARDWARE],
  ])(
    "is 400 ITEM_IS_DEFAULT for the book's fixed %s, through applyChanges, before the defaults or the usage are read",
    async (_name, item) => {
      const { asked } = theReaderCounting();
      const readDefaults = vi.spyOn(prices.defaults, "read");
      const before = await stateOfTheWorld();

      const answer = await deleteRow(item);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual(ITEM_IS_DEFAULT_BODY);
      expect(asked).toEqual([]);
      expect(readDefaults).not.toHaveBeenCalled();
      expect(await stateOfTheWorld()).toEqual(before);
    },
  );
});

describe("a deletion whose facts cannot be read in time", () => {
  it("is 503 when the saved defaults are not settings, and writes nothing", async () => {
    vi.spyOn(prices.defaults, "read").mockResolvedValue({
      kind: "saved",
      saved: { revision: "3", defaults: { materialTierId: 7 } },
    } as never);
    const { asked } = theReaderCounting();
    const before = await stateOfTheWorld();

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(VENEER.tierId);
    expect(asked).toEqual([]);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is 503 when the count fails, and writes nothing", async () => {
    vi.spyOn(prices.defaults, "countEach").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );
    const before = await stateOfTheWorld();

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.everything()).not.toContain(VENEER.tierId);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is 503 when the count answers a number that is not a count of designs, never read as 0", async () => {
    vi.spyOn(prices.defaults, "countEach").mockResolvedValue({
      counts: [{ item: VENEER, designCount: Number.NaN }],
      unreadableDesigns: 0,
    });
    const before = await stateOfTheWorld();

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(console_.everything()).not.toContain(VENEER.tierId);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is 503 when the count answers nothing for the row, never read as unused", async () => {
    vi.spyOn(prices.defaults, "countEach").mockResolvedValue({
      counts: [],
      unreadableDesigns: 0,
    });
    const before = await stateOfTheWorld();

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(console_.everything()).not.toContain(VENEER.tierId);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is 503 at the deadline when the count never answers, and writes nothing", async () => {
    vi.spyOn(prices.defaults, "countEach").mockReturnValue(
      new Promise(() => undefined),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const before = await stateOfTheWorld();

    const answering = deleteRow(VENEER);
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    const answer = await answering;

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(VENEER.tierId);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is 503 when the count answers 0 after the deadline: a late answer is never the row being unused", async () => {
    vi.spyOn(prices.defaults, "countEach").mockImplementation(
      (probes) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              counts: probes.map(({ item }) => ({ item, designCount: 0 })),
              unreadableDesigns: 0,
            });
          }, USAGE_READ_DEADLINE_MS + 1);
        }),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const before = await stateOfTheWorld();

    const answering = deleteRow(VENEER);
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS + 5);
    const answer = await answering;

    expect(answer.status).toBe(503);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is 503 when the defaults never answer, at the same deadline", async () => {
    vi.spyOn(prices.defaults, "read").mockReturnValue(
      new Promise(() => undefined),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const before = await stateOfTheWorld();

    const answering = deleteRow(VENEER);
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    const answer = await answering;

    expect(answer.status).toBe(503);
    expect(await stateOfTheWorld()).toEqual(before);
  });
});

describe("the order of the checks", () => {
  it("refuses a stale draft revision before anything is read of the defaults or the usage", async () => {
    const { asked } = theReaderCounting();
    const readDefaults = vi.spyOn(prices.defaults, "read");
    const before = await stateOfTheWorld();

    const answer = await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: `${await currentDraftRevision()}0`,
        change: deletion(VENEER),
      },
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(asked).toEqual([]);
    expect(readDefaults).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("refuses a row the book does not state before any probe: UNKNOWN_ITEM", async () => {
    const { asked } = theReaderCounting();

    const answer = await deleteRow({
      kind: "hardware",
      tierId: "hardware.ghost",
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "UNKNOWN_ITEM" }],
    });
    expect(asked).toEqual([]);
  });

  it("refuses the always-present built-in accessory before any probe: NOT_EDITABLE", async () => {
    const { asked } = theReaderCounting();

    const answer = await deleteRow({
      kind: "accessory",
      accessoryId: ALWAYS_PRESENT_ACCESSORY_ID,
    });

    expect(answer.status).toBe(400);
    expect(asked).toEqual([]);
    expect(auditRowsOf("price-draft-changed")).toEqual([]);
  });

  it.each([
    ["false", false],
    ["the text true", "true"],
    ["1", 1],
    ["null", null],
    ["no value", undefined],
  ])("refuses a value of %s before any probe", async (_name, value) => {
    const { asked } = theReaderCounting();
    const before = await stateOfTheWorld();

    const answer = await deleteRow(VENEER, {
      address: deletion(VENEER).address,
      value,
    });

    expect(answer.status).toBe(400);
    expect(asked).toEqual([]);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it.each([
    ["a colour", { kind: "finish", finishId: "pal.alb" }],
    ["a handle", { kind: "handle", handle: "black" }],
    ["no item", undefined],
  ])("refuses a deletion of %s before any probe", async (_name, item) => {
    const { asked } = theReaderCounting();

    const answer = await deleteRow(VENEER, {
      address: { kind: "item-deleted", item },
      value: true,
    });

    expect(answer.status).toBe(400);
    expect(asked).toEqual([]);
  });
});

describe("a body that is not read", () => {
  it.each([
    ["a member beside the address and the value", { extra: 1 }],
    ["a bulk marker", { bulk: { percent: 5 } }],
    ["a group id", { groupId: "g" }],
  ])("is 400 before any count for %s on the change", async (_name, extra) => {
    const { asked } = theReaderCounting();
    const before = await stateOfTheWorld();

    const answer = await deleteRow(VENEER, { ...deletion(VENEER), ...extra });

    expect(answer.status).toBe(400);
    expect(asked).toEqual([]);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is 400 before any count for a member the address does not name", async () => {
    const { asked } = theReaderCounting();

    const answer = await deleteRow(VENEER, {
      address: { kind: "item-deleted", item: VENEER, note: "x" },
      value: true,
    });

    expect(answer.status).toBe(400);
    expect(asked).toEqual([]);
  });

  it("is 400 before any count for an item that names its id by a member of another kind", async () => {
    const { asked } = theReaderCounting();

    const answer = await deleteRow(VENEER, {
      address: {
        kind: "item-deleted",
        item: { kind: "material", accessoryId: "plinth-light" },
      },
      value: true,
    });

    expect(answer.status).toBe(400);
    expect(asked).toEqual([]);
  });
});

describe("who may delete", () => {
  it("answers an operator 403, spends no bucket and asks no store", async () => {
    const operator = await signedInAs(
      { role: "operator" },
      "operator@example.test",
    );
    limiterLedger.counted.length = 0;
    const asksBefore = priceStoreAsks.count;
    const { asked } = theReaderCounting();

    const answer = await changeDraft({
      cookie: operator.session.cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: deletion(VENEER),
      },
    });

    expect(answer.status).toBe(403);
    expect(asked).toEqual([]);
    expect(priceStoreAsks.count).toBe(asksBefore);
    expect(
      limiterLedger.counted.filter(
        (name) => name === STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name,
      ),
    ).toEqual([]);
  });

  it("answers a request with no session 401 and asks no usage", async () => {
    const { asked } = theReaderCounting();

    const answer = await changeDraft({
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: deletion(VENEER),
      },
    });

    expect(answer.status).toBe(401);
    expect(asked).toEqual([]);
  });
});

describe("the usage route's one read at a time", () => {
  it("is not held by the pre-check, and the pre-check does not wait on it", async () => {
    let releaseUsageRoute: () => void = () => undefined;
    const counting = vi
      .spyOn(prices.defaults, "countEach")
      .mockImplementationOnce(
        (probes) =>
          new Promise((resolve) => {
            releaseUsageRoute = () => {
              resolve({
                counts: probes.map(({ item }) => ({ item, designCount: 0 })),
                unreadableDesigns: 0,
              });
            };
          }),
      )
      .mockImplementation((probes) =>
        Promise.resolve({
          counts: probes.map(({ item }) => ({ item, designCount: 0 })),
          unreadableDesigns: 0,
        }),
      );
    const usageRoute = readUsage({ cookie, json: { items: [VENEER] } });
    await vi.waitFor(() => {
      expect(counting).toHaveBeenCalledTimes(1);
    });

    const answer = await deleteRow(PREMIUM);
    const second = await deleteRow(VENEER);

    expect(answer.status).toBe(200);
    expect(second.status).toBe(200);
    releaseUsageRoute();
    expect((await usageRoute).status).toBe(200);
  });
});

describe("a row the draft created", () => {
  it("is deleted with no count and no read of the defaults", async () => {
    const created = await createClassAs(cookie);
    expect(created.status).toBe(200);
    const { created: row } = (await jsonOf(created)) as { created: ItemRef };
    const { asked } = theReaderCounting();
    const readDefaults = vi.spyOn(prices.defaults, "read");

    const answer = await deleteRow(row);

    expect(answer.status).toBe(200);
    expect(asked).toEqual([]);
    expect(readDefaults).not.toHaveBeenCalled();
    expect(
      (await storedChangesOf(prices)).some(
        ({ address }) => address.kind === "item-deleted",
      ),
    ).toBe(true);
  });

  it("is deleted when the reader cannot be asked at all", async () => {
    const created = await createClassAs(cookie);
    const { created: row } = (await jsonOf(created)) as { created: ItemRef };
    vi.spyOn(prices.defaults, "countEach").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );
    vi.spyOn(prices.defaults, "read").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await deleteRow(row);

    expect(answer.status).toBe(200);
  });
});

describe("taking a deletion back", () => {
  async function draftDeleting(...items: ItemRef[]) {
    await plantDraft(tokenHash, deleting(...items));
  }

  it("is 200 by the deletion's own address, and the draft no longer deletes the row", async () => {
    await draftDeleting(VENEER, PREMIUM);
    const { asked } = theReaderCounting();

    const answer = await revertAs(cookie, {
      kind: "change",
      address: { kind: "item-deleted", item: VENEER },
    });

    expect(answer.status).toBe(200);
    expect(await storedChangesOf(prices)).toEqual(deleting(PREMIUM));
    expect(asked).toEqual([]);
  });

  it("writes one price-draft-reverted row naming the deletion", async () => {
    await draftDeleting(VENEER);

    await revertAs(cookie, {
      kind: "change",
      address: { kind: "item-deleted", item: VENEER },
    });

    expect(auditRowsOf("price-draft-reverted")).toHaveLength(1);
    expect(auditRowsOf("price-draft-reverted")[0]?.detail).toMatchObject({
      changeKind: "item-deleted",
      itemKind: "material",
      revertedCount: 1,
    });
  });

  it("is 400 NOT_EDITABLE for a field of a row the draft deletes, and the deletion stays", async () => {
    await draftDeleting(VENEER);
    const before = await stateOfTheWorld();

    const answer = await revertAs(cookie, {
      kind: "change",
      address: {
        kind: "material",
        tierId: VENEER.tierId,
        field: "percentOfCabinets",
      },
    });

    expect(answer.status).toBe(400);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is 400 UNKNOWN_ADDRESS for a deletion the draft does not hold, and writes nothing", async () => {
    await draftDeleting(PREMIUM);
    const before = await stateOfTheWorld();

    const answer = await revertAs(cookie, {
      kind: "change",
      address: { kind: "item-deleted", item: VENEER },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
    });
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("answers 503 with the deletion still held when the audit row cannot be staged", async () => {
    await draftDeleting(VENEER);
    const before = await stateOfTheWorld();
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await revertAs(cookie, {
      kind: "change",
      address: { kind: "item-deleted", item: VENEER },
    });

    expect(answer.status).toBe(503);
    expect(await stateOfTheWorld()).toEqual(before);
  });
});

describe("R-i again, with deletion on, through the real draft route", () => {
  it("refuses the publish naming the item when a design is saved after the deletion, and writes nothing (the domain's arm)", async () => {
    expect((await deleteRow(VENEER)).status).toBe(200);
    aDesignNaming(VENEER);
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("refuses the same publish at the store when the route's count answered 0 and a design was saved meanwhile (the store's arm)", async () => {
    expect((await deleteRow(VENEER)).status).toBe(200);
    aDesignNaming(VENEER);
    theReaderCounting();
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(storeAsked).toHaveBeenCalledTimes(1);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("publishes the deletion of a row no design uses", async () => {
    expect((await deleteRow(VENEER)).status).toBe(200);

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(200);
  });
});

describe("R-d's M5 arm, end to end", () => {
  it("refuses the publish with item-is-default and writes nothing when defaults are saved naming the deleted row", async () => {
    expect((await deleteRow(PREMIUM)).status).toBe(200);
    const saved = await putDefaults({
      cookie,
      json: await saveBody({ hardwareTierId: PREMIUM.tierId }),
    });
    expect(saved.status).toBe(200);
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-is-default",
      item: PREMIUM,
    });
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  });
});
