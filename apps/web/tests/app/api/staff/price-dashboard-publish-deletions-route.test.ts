import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  buildIdsPricedAs,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { ItemUsageProbe } from "@lemnaria/persistence";

import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { judgePendingDeletions } from "@/price-dashboard/publish-deletions";
import { readPublishPage } from "@/price-dashboard/publish-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { saveDefaults } from "../../../support/availability-route-world";
import {
  changeDraft,
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
import { ANCHOR_ADDRESS, putChange } from "../../../support/price-versions";
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
 * `POST /api/staff/prices/publish` over a stored draft that deletes items, which no draft route can write and the tests
 * plant. The world's price-book fake keeps its own guard, which answers the same `409 item-in-use` as the request does, so
 * every refusal here also asserts that the store was never asked (or, for the second arm, that it was and refused).
 */

const LINKED_ROW = "base-3drawer";
const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: "plinth-light",
      ruleId: "accessory.plinth-light",
      linkedBuildId: LINKED_ROW,
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const NEW_ACCESSORY_ID = "drawer-light";

let prices: PriceDashboardWorld;
let designCount = 0;
let cookie: string;
let tokenHash: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  tokenHash = session.tokenHash;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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

async function judgedOnThePage(): Promise<{ kind: string }> {
  const read = await readPublishPage();
  if (read.kind !== "ready") throw new Error("the page was not ready");
  const { state, deletionFacts } = read.input;
  return judgePendingDeletions({
    book: state.active.book,
    changes: state.draft.changes,
    facts: deletionFacts,
  });
}

async function publish() {
  return publishDraft({ cookie, json: await publishBody() });
}

function probesAskedOfTheReader() {
  const asked: ItemUsageProbe[][] = [];
  const counting = vi
    .spyOn(prices.defaults, "countEach")
    .mockImplementation((probes) => {
      asked.push([...probes]);
      return Promise.resolve({
        counts: probes.map(({ item }) => ({
          item,
          designCount: prices.designs.countUsing(item),
        })),
        unreadableDesigns: 0,
      });
    });
  return { asked, counting };
}

describe("a publish whose draft deletes an item a saved design names", () => {
  it("is refused in the request, before the store is asked, naming exactly the item", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PAINTED));
    aDesignNaming(VENEER);
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is refused by the store when a design is saved after the count, which answered none", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");
    vi.spyOn(prices.defaults, "countEach").mockImplementation((probes) => {
      aDesignNaming(VENEER);
      return Promise.resolve({
        counts: probes.map(({ item }) => ({ item, designCount: 0 })),
        unreadableDesigns: 0,
      });
    });

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(storeAsked).toHaveBeenCalledTimes(1);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is judged on the usage at the publish when the page counted a use that has since gone", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const usedAtPageLoad = aDesignNaming(VENEER);
    expect((await judgedOnThePage()).kind).toBe("blocked");
    prices.designs.plant({
      designId: usedAtPageLoad,
      uses: [VENEER],
      isDeletedByClient: true,
    });

    const answer = await publish();

    expect(answer.status).toBe(200);
  });

  it("is judged on the usage at the publish when the page counted none and a design was saved after", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    expect((await judgedOnThePage()).kind).toBe("none");
    aDesignNaming(VENEER);
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(storeAsked).not.toHaveBeenCalled();
  });

  it("publishes when the designs naming the item were deleted by their clients", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PLINTH));
    aDesignNaming(VENEER, true);
    aDesignNaming(PLINTH, true);

    const answer = await publish();

    expect(answer.status).toBe(200);
  });
});

describe("a publish whose draft deletes the saved default", () => {
  it("answers item-is-default naming the item, before the store is asked, and writes nothing", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    await saveDefaults({ tokenHash }, { materialTierId: VENEER.tierId });
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-is-default",
      item: VENEER,
    });
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("names the default before the use when the item is both", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PREMIUM));
    await saveDefaults({ tokenHash }, { materialTierId: VENEER.tierId });
    aDesignNaming(VENEER);
    aDesignNaming(PREMIUM);

    const answer = await publish();

    expect(await jsonOf(answer)).toEqual({
      status: "item-is-default",
      item: VENEER,
    });
  });

  it("is a 503 that writes nothing when the saved defaults are not settings", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    await saveDefaults({ tokenHash }, {
      materialTierId: 7,
    } as unknown as Parameters<typeof saveDefaults>[1]);
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publish();

    expect(answer.status).toBe(503);
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("does not read the defaults for a publish that deletes nothing", async () => {
    await saveDefaults({ tokenHash }, {
      materialTierId: 7,
    } as unknown as Parameters<typeof saveDefaults>[1]);
    await putChange(cookie, ANCHOR_ADDRESS, 500_000);

    const answer = await publish();

    expect(answer.status).toBe(200);
  });
});

describe("what a publish asks the usage reader", () => {
  it("is the SQL probes of the active book's deletions and never the walk", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PREMIUM, PLINTH));
    const { asked } = probesAskedOfTheReader();

    const answer = await publish();

    expect(answer.status).toBe(200);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.map(({ via }) => via)).toEqual([
      "settings-tier",
      "settings-tier",
      "placed-bodies",
    ]);
  });

  it("counts a deleted linked accessory by the rows of the active book's rule, which the candidate no longer holds", async () => {
    await plantDraft(tokenHash, deleting(PLINTH));
    const { asked } = probesAskedOfTheReader();

    await publish();

    expect(asked[0]).toEqual([
      {
        via: "placed-bodies",
        item: PLINTH,
        buildIds: buildIdsPricedAs(shippedCatalogue(), LINKED_ROW),
      },
    ]);
  });

  it("asks nothing for a row the draft creates and deletes", async () => {
    const created = {
      address: { kind: "accessory-created", accessoryId: NEW_ACCESSORY_ID },
      value: { linkedBuildId: LINKED_ROW, perUnitMinor: 1_000, name: "Lumina" },
    } as unknown as DraftChange;
    const row: ItemRef = { kind: "accessory", accessoryId: NEW_ACCESSORY_ID };
    await plantDraft(tokenHash, [created, ...deleting(row)]);
    aDesignNaming(row);
    const { counting } = probesAskedOfTheReader();

    const answer = await publish();

    expect(counting).not.toHaveBeenCalled();
    expect(answer.status).toBe(200);
  });

  it("is a 503 that writes nothing when the reader fails", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    vi.spyOn(prices.defaults, "countEach").mockRejectedValue(
      new Error("the reader is down"),
    );
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publish();

    expect(answer.status).toBe(503);
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  });
});

describe("a draft that deletes an item, with the draft route", () => {
  it("takes a second deletion on the change route (R4c2), beside the stored one, which stays", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const before = await stateOfTheWorld();

    const answer = await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: before.draft.draftRevision,
        change: {
          address: { kind: "item-deleted", item: PAINTED },
          value: true,
        },
      },
    });

    expect(answer.status).toBe(200);
    expect((await stateOfTheWorld()).draft.changes).toEqual(
      deleting(VENEER, PAINTED),
    );
  });
});
