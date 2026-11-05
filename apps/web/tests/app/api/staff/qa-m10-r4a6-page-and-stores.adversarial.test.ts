import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALWAYS_PRESENT_ACCESSORY_ID,
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";

import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import type { PriceStores } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  UNAVAILABLE_KITCHEN_DEFAULTS_STORE,
  UNAVAILABLE_KITCHEN_USAGE_READER,
} from "@/lib/server/unavailable-price-stores";
import { judgePendingDeletions } from "@/price-dashboard/publish-deletions";
import { readPublishPage } from "@/price-dashboard/publish-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import { saveDefaults } from "../../../support/availability-route-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
import {
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { ANCHOR_ADDRESS, putChange } from "../../../support/price-versions";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import {
  itemAt,
  linkedAccessory,
  widestBook,
} from "../../../support/wide-price-book";

const heldInstead = vi.hoisted(() => ({
  stores: {} as Partial<PriceStores>,
}));

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
  import("../../../support/price-dashboard-world").then((world) => ({
    getPriceStores: () =>
      Promise.resolve({
        ...world.currentPriceDashboardWorld().stores,
        ...heldInstead.stores,
      }),
  })),
);

/**
 * The publish route and the publish page over a world whose usage reader and defaults store answer "unavailable" while
 * the price book is live, and the page over counts that are slow, failing or chunked. A render writes nothing and spends
 * no bucket on any of them.
 */

const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };

const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [linkedAccessory(PLINTH.accessoryId)],
};

let prices: PriceDashboardWorld;
let cookie: string;
let tokenHash: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  captureConsole();
  heldInstead.stores = {};
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  prices = await freshPriceDashboardWorld({ book: BOOK });
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

async function stateOfTheWorld() {
  return {
    versions: (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    draft: await prices.stores.priceBook.readDraft(),
    auditRows: prices.ledger.heldEvents().length,
    availability: (await prices.stores.availability.readCurrent()).revision,
  };
}

async function judgedOnThePage() {
  const read = await readPublishPage();
  if (read.kind !== "ready") throw new Error("the page was not ready");
  const { state, deletionFacts } = read.input;
  return {
    deletionFacts,
    judgement: judgePendingDeletions({
      book: state.active.book,
      changes: state.draft.changes,
      facts: deletionFacts,
    }),
  };
}

describe("a publish whose usage reader and saved defaults are unavailable", () => {
  beforeEach(() => {
    heldInstead.stores = {
      usage: UNAVAILABLE_KITCHEN_USAGE_READER,
      defaults: UNAVAILABLE_KITCHEN_DEFAULTS_STORE,
    };
  });

  it("is a 503 that writes nothing for a draft that deletes a row the book states", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const before = await stateOfTheWorld();
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is a 503 that writes nothing for a deleted linked accessory", async () => {
    await plantDraft(tokenHash, deleting(PLINTH));
    const before = await stateOfTheWorld();

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(503);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("still publishes a draft that deletes nothing, which asks neither store", async () => {
    await putChange(cookie, ANCHOR_ADDRESS, 500_000);

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(200);
  });

  it("draws the page, and judges nothing, over a draft that deletes a row the book states", async () => {
    await plantDraft(tokenHash, deleting(VENEER));

    const { deletionFacts, judgement } = await judgedOnThePage();

    expect(deletionFacts).toBeUndefined();
    expect(judgement).toEqual({ kind: "cannot-judge" });
  });

  it("draws the page, with every deletion judged, over a draft that deletes nothing", async () => {
    const { judgement } = await judgedOnThePage();

    expect(judgement).toEqual({ kind: "none" });
  });
});

describe("the publish page over counts that do not come", () => {
  async function expectAWriteFreeRender(render: () => Promise<unknown>) {
    const rows = prices.ledger.heldEvents().length;
    const buckets = limiterLedger.counted.length;
    const before = await stateOfTheWorld();

    await render();

    expect(prices.ledger.heldEvents()).toHaveLength(rows);
    expect(limiterLedger.counted.slice(buckets)).toEqual([]);
    expect(await stateOfTheWorld()).toEqual(before);
  }

  it("writes nothing and spends no bucket when the count fails", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    vi.spyOn(prices.defaults, "countEach").mockRejectedValue(
      new DashboardStoreError("count the kitchens using an item", "database"),
    );

    await expectAWriteFreeRender(judgedOnThePage);
  });

  it("writes nothing and spends no bucket when the count passes its deadline", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    vi.spyOn(prices.defaults, "countEach").mockReturnValue(
      new Promise(() => undefined),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const rendering = expectAWriteFreeRender(judgedOnThePage);
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    await rendering;
  });

  it("shows no number, and judges nothing, when the reader answers what it cannot read as a count", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    vi.spyOn(prices.defaults, "countEach").mockRejectedValue(
      new DashboardStoreError(
        "count the kitchens using an item",
        "unexpected-answer",
      ),
    );

    const { deletionFacts, judgement } = await judgedOnThePage();

    expect(deletionFacts).toBeUndefined();
    expect(judgement).toEqual({ kind: "cannot-judge" });
  });

  it("never starts the walk, and is not drawn as judged, for a draft that also holds a deletion no count can clear", async () => {
    await plantDraft(tokenHash, [
      ...deleting(VENEER),
      ...deleting({
        kind: "accessory",
        accessoryId: ALWAYS_PRESENT_ACCESSORY_ID,
      }),
    ]);
    const counting = vi.spyOn(prices.defaults, "countEach");

    const read = await readPublishPage();

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    expect(
      judgePendingDeletions({
        book: read.input.state.active.book,
        changes: read.input.state.draft.changes,
        facts: read.input.deletionFacts,
      }),
    ).toEqual({ kind: "cannot-judge" });
    expect(counting).toHaveBeenCalledTimes(1);
    const probes = counting.mock.calls.flatMap(([asked]) => [...asked]);
    expect(probes).toHaveLength(1);
    expect(probes.every(({ via }) => via !== "migrated-design")).toBe(true);
  });

  it("is drawn, and judges nothing, when the saved defaults never answer, at the deadline", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    vi.spyOn(prices.defaults, "read").mockReturnValue(
      new Promise(() => undefined),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const rendering = judgedOnThePage();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);

    expect(await rendering).toMatchObject({
      deletionFacts: undefined,
      judgement: { kind: "cannot-judge" },
    });
  });
});

describe("the publish page over the draft with the most deletions it can hold", () => {
  async function planting88Deletions(): Promise<readonly ItemRef[]> {
    const { book, deletable } = widestBook();
    freshAccountWorld();
    freshStaffWorld();
    captureConsole();
    prices = await freshPriceDashboardWorld({ book });
    const { session } = await signedInAs(
      { role: "administrator" },
      "administrator@example.test",
    );
    tokenHash = session.tokenHash;
    await plantDraft(tokenHash, deleting(...deletable));
    return deletable;
  }

  it("asks in chunks of at most 50 and blocks on a row only the last chunk counts", async () => {
    const deleted = await planting88Deletions();
    const used = itemAt(deleted, 87);
    prices.designs.plant({
      designId: "d-1",
      uses: [used],
      isDeletedByClient: false,
    });
    const asked: number[] = [];
    const counting = prices.defaults.countEach.bind(prices.defaults);
    vi.spyOn(prices.defaults, "countEach").mockImplementation(
      (probes, signal) => {
        asked.push(probes.length);
        return counting(probes, signal);
      },
    );

    const { judgement } = await judgedOnThePage();

    expect(asked).toEqual([50, 38]);
    expect(judgement).toEqual({
      kind: "blocked",
      block: { kind: "in-use", items: [used] },
    });
  });

  it("blocks on the saved default before a use, whichever chunk each is counted in", async () => {
    const deleted = await planting88Deletions();
    prices.designs.plant({
      designId: "d-1",
      uses: [itemAt(deleted, 0)],
      isDeletedByClient: false,
    });
    await saveDefaults({ tokenHash }, { hardwareTierId: "hardware.premium" });

    const { judgement } = await judgedOnThePage();

    expect(judgement).toEqual({
      kind: "blocked",
      block: {
        kind: "is-default",
        item: { kind: "hardware", tierId: "hardware.premium" },
      },
    });
  });
});
