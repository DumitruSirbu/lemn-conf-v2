import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALWAYS_PRESENT_ACCESSORY_ID,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { ItemUsageProbe, KitchenUsageReader } from "@lemnaria/persistence";

import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  saveDefaults,
  switchItem,
} from "../../../support/availability-route-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
import {
  changeDraft,
  currentDraftRevision,
  publishBody,
  publishDraft,
  revertDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import {
  itemAt,
  linkedAccessory,
  widestBook,
} from "../../../support/wide-price-book";

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
 * Adversarial QA of `POST /api/staff/prices/publish` over stored drafts that delete rows: chunk boundaries, answers of the
 * reader that are partial or malformed, writes that land between the count and the store's guard, and the draft route's
 * refusal of a deletion on every path. Deletions can only be planted straight into the store.
 */

type CountEach = KitchenUsageReader["countEach"];
type CountResult = Awaited<ReturnType<CountEach>>;

const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const SOFT_CLOSE: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const FIXED_MATERIAL: ItemRef = {
  kind: "material",
  tierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
};
const FIXED_HARDWARE: ItemRef = {
  kind: "hardware",
  tierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
};

const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [linkedAccessory(PLINTH.accessoryId)],
};

function keysOf(items: readonly ItemRef[]): string[] {
  return items.map((item) => JSON.stringify(item)).sort();
}

let prices: PriceDashboardWorld;
let designCount = 0;
let cookie: string;
let tokenHash: string;

async function useBook(book: PriceBook): Promise<void> {
  freshAccountWorld();
  freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  prices = await freshPriceDashboardWorld({ book });
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  tokenHash = session.tokenHash;
}

beforeEach(async () => {
  await useBook(BOOK);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function aDesignNaming(item: ItemRef): void {
  designCount += 1;
  prices.designs.plant({
    designId: `design-${String(designCount)}`,
    uses: [item],
    isDeletedByClient: false,
  });
}

async function stateOfTheWorld() {
  return {
    versions: (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    draft: await prices.stores.priceBook.readDraft(),
    auditRows: prices.ledger.heldEvents().length,
    availability: (await prices.stores.availability.readCurrent()).revision,
    defaults: await prices.stores.defaults.read(),
  };
}

async function publish() {
  return publishDraft({ cookie, json: await publishBody() });
}

function storeAskedToPublish() {
  return vi.spyOn(prices.stores.priceBook, "publish");
}

/** The reader answers as the fake does, except where `answer` takes over a call (zero-based). */
function readerAnswering(
  answer: (
    call: number,
    probes: readonly ItemUsageProbe[],
    honest: () => CountResult,
  ) => Promise<CountResult> | CountResult,
) {
  const chunks: ItemUsageProbe[][] = [];
  const honest = (probes: readonly ItemUsageProbe[]): CountResult => ({
    counts: probes.map(({ item }) => ({
      item,
      designCount: prices.designs.countUsing(item),
    })),
    unreadableDesigns: 0,
  });
  vi.spyOn(prices.defaults, "countEach").mockImplementation((probes) => {
    const call = chunks.length;
    chunks.push([...probes]);
    return new Promise<CountResult>((resolve) => {
      resolve(answer(call, probes, () => honest(probes)));
    });
  });
  return chunks;
}

function spyOnChunks() {
  const chunks: ItemUsageProbe[][] = [];
  const counting = prices.defaults.countEach.bind(prices.defaults);
  vi.spyOn(prices.defaults, "countEach").mockImplementation(
    (probes, signal) => {
      chunks.push([...probes]);
      return counting(probes, signal);
    },
  );
  return chunks;
}

async function useTheWidestBook(): Promise<readonly ItemRef[]> {
  const { book, deletable } = widestBook();
  await useBook(book);
  return deletable;
}

describe("a draft that deletes as many rows as one count may ask", () => {
  const BOUNDARY_SIZES: readonly [number, readonly number[]][] = [
    [1, [1]],
    [49, [49]],
    [50, [50]],
    [51, [50, 1]],
    [88, [50, 38]],
  ];

  it.each(BOUNDARY_SIZES)(
    "publishes %i unused deletions, asking the reader in chunks %j",
    async (count, chunkSizes) => {
      const deleted = (await useTheWidestBook()).slice(0, count);
      await plantDraft(tokenHash, deleting(...deleted));
      const chunks = spyOnChunks();

      const answer = await publish();

      expect(answer.status).toBe(200);
      expect(chunks.map((chunk) => chunk.length)).toEqual(chunkSizes);
      expect(keysOf(chunks.flat().map(({ item }) => item))).toEqual(
        keysOf(deleted),
      );
    },
  );

  it.each(BOUNDARY_SIZES)(
    "refuses, writing nothing, %i deletions of which only the last is used",
    async (count) => {
      const deleted = (await useTheWidestBook()).slice(0, count);
      await plantDraft(tokenHash, deleting(...deleted));
      const last = itemAt(deleted, count - 1);
      aDesignNaming(last);
      const before = await stateOfTheWorld();
      const storeAsked = storeAskedToPublish();

      const answer = await publish();

      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({
        status: "item-in-use",
        items: [last],
      });
      expect(storeAsked).not.toHaveBeenCalled();
      expect(await stateOfTheWorld()).toEqual(before);
    },
  );

  it.each(BOUNDARY_SIZES.filter(([count]) => count > 1))(
    "names, in draft order, the first and the last of %i deletions when both are used",
    async (count) => {
      const deleted = (await useTheWidestBook()).slice(0, count);
      await plantDraft(tokenHash, deleting(...deleted));
      const first = itemAt(deleted, 0);
      const last = itemAt(deleted, count - 1);
      aDesignNaming(last);
      aDesignNaming(first);

      const answer = await publish();

      expect(await jsonOf(answer)).toEqual({
        status: "item-in-use",
        items: [first, last],
      });
    },
  );

  it("refuses the used linked accessories at both ends of the second chunk", async () => {
    const deleted = await useTheWidestBook();
    await plantDraft(tokenHash, deleting(...deleted));
    const firstOfSecond = itemAt(deleted, 50);
    const last = itemAt(deleted, 87);
    aDesignNaming(firstOfSecond);
    aDesignNaming(last);

    const answer = await publish();

    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [firstOfSecond, last],
    });
  });

  it("names a default of the second chunk ahead of a use in the first", async () => {
    const deleted = await useTheWidestBook();
    await plantDraft(tokenHash, deleting(...deleted));
    aDesignNaming(itemAt(deleted, 3));
    await saveDefaults({ tokenHash }, { hardwareTierId: PREMIUM.tierId });

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-is-default",
      item: PREMIUM,
    });
  });
});

describe("a reader that answers a chunk badly", () => {
  async function plantFiftyOneDeletions() {
    const deleted = (await useTheWidestBook()).slice(0, 51);
    await plantDraft(tokenHash, deleting(...deleted));
    return deleted;
  }

  async function expectUnjudgedAndUnwritten(): Promise<void> {
    const before = await stateOfTheWorld();
    const storeAsked = storeAskedToPublish();

    const answer = await publish();

    expect(answer.status).toBe(503);
    expect(JSON.stringify(await jsonOf(answer))).not.toMatch(
      /material\.extra|UsageNotCounted|designCount|reader/i,
    );
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
  }

  it("is a 503 that writes nothing when the second chunk fails after the first was counted", async () => {
    await plantFiftyOneDeletions();
    readerAnswering((call, _probes, honest) => {
      if (call === 1) throw new Error("the second chunk failed");
      return honest();
    });

    await expectUnjudgedAndUnwritten();
  });

  it("is a 503 that writes nothing when the second chunk leaves out the used row", async () => {
    const materials = await plantFiftyOneDeletions();
    aDesignNaming(itemAt(materials, 50));
    readerAnswering((call, _probes, honest) =>
      call === 1 ? { counts: [], unreadableDesigns: 0 } : honest(),
    );

    await expectUnjudgedAndUnwritten();
  });

  it.each([
    ["NaN", Number.NaN],
    ["negative", -1],
    ["fractional", 1.5],
    ["infinite", Number.POSITIVE_INFINITY],
    ["not a number", "3" as unknown as number],
  ])(
    "is a 503 that writes nothing when a count is %s",
    async (_name, designCount) => {
      await plantFiftyOneDeletions();
      readerAnswering((call, probes, honest) =>
        call === 1
          ? {
              counts: probes.map(({ item }) => ({ item, designCount })),
              unreadableDesigns: 0,
            }
          : honest(),
      );

      await expectUnjudgedAndUnwritten();
    },
  );

  it("is a 503 that writes nothing when a row is counted twice, so that which count is true is unknown", async () => {
    await plantFiftyOneDeletions();
    readerAnswering((call, probes, honest) => {
      if (call !== 1) return honest();
      const [only] = probes;
      const counts = [...probes, ...(only === undefined ? [] : [only])].map(
        ({ item }) => ({ item, designCount: 0 }),
      );
      return { counts, unreadableDesigns: 0 };
    });

    await expectUnjudgedAndUnwritten();
  });

  it.each([Number.NaN, -1, 2.5])(
    "is a 503 that writes nothing when the designs left out number %s",
    async (unreadableDesigns) => {
      await plantFiftyOneDeletions();
      readerAnswering((_call, _probes, honest) => ({
        ...honest(),
        unreadableDesigns,
      }));

      await expectUnjudgedAndUnwritten();
    },
  );

  it("still refuses the used row when the reader answers in another order than it was asked", async () => {
    const materials = await plantFiftyOneDeletions();
    const used = itemAt(materials, 7);
    aDesignNaming(used);
    readerAnswering((_call, _probes, honest) => {
      const answered = honest();
      return { ...answered, counts: [...answered.counts].reverse() };
    });

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [used],
    });
  });

  it("ignores, in one chunk, a count of a row that only another chunk asked about", async () => {
    await plantFiftyOneDeletions();
    readerAnswering((call, probes, honest) => {
      if (call !== 1) return honest();
      return {
        counts: [
          ...probes.map(({ item }) => ({ item, designCount: 0 })),
          { item: VENEER, designCount: 4 },
        ],
        unreadableDesigns: 0,
      };
    });

    const answer = await publish();

    expect(answer.status).toBe(200);
  });
});

describe("a write that lands between the count and the store's guard", () => {
  it("never publishes a deletion of the default saved after the count, and writes none of it", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const body = await publishBody();
    vi.spyOn(prices.defaults, "countEach").mockImplementation(
      async (probes) => {
        await saveDefaults({ tokenHash }, { materialTierId: VENEER.tierId });
        return {
          counts: probes.map(({ item }) => ({ item, designCount: 0 })),
          unreadableDesigns: 0,
        };
      },
    );
    const versionsBefore = (
      await prices.stores.priceBook.listVersions({ page: 1 })
    ).total;

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(409);
    expect(
      (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(versionsBefore);
    expect((await prices.stores.priceBook.readDraft()).changes).toHaveLength(1);
  });

  it("never publishes a deletion of the hardware default saved after the count", async () => {
    await plantDraft(tokenHash, deleting(PREMIUM));
    const body = await publishBody();
    vi.spyOn(prices.defaults, "countEach").mockImplementation(
      async (probes) => {
        await saveDefaults({ tokenHash }, { hardwareTierId: PREMIUM.tierId });
        return {
          counts: probes.map(({ item }) => ({ item, designCount: 0 })),
          unreadableDesigns: 0,
        };
      },
    );

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(409);
    expect(
      (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(1);
  });

  it("refuses by the store's guard a design that names a deleted linked accessory, saved after a count of none", async () => {
    await plantDraft(tokenHash, deleting(PLINTH));
    vi.spyOn(prices.defaults, "countEach").mockImplementation((probes) => {
      aDesignNaming(PLINTH);
      return Promise.resolve({
        counts: probes.map(({ item }) => ({ item, designCount: 0 })),
        unreadableDesigns: 0,
      });
    });
    const before = await stateOfTheWorld();

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [PLINTH],
    });
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("refuses by the store's guard a design that names a deleted row in a later chunk, saved after a count of none", async () => {
    const deleted = (await useTheWidestBook()).slice(0, 51);
    await plantDraft(tokenHash, deleting(...deleted));
    const last = itemAt(deleted, 50);
    readerAnswering((call, probes) => {
      if (call === 1) aDesignNaming(last);
      return {
        counts: probes.map(({ item }) => ({ item, designCount: 0 })),
        unreadableDesigns: 0,
      };
    });

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [last],
    });
    expect(
      (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(1);
  });

  it("is changed-meanwhile when another publish of the same draft lands during the count", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const body = await publishBody();
    const counting = prices.defaults.countEach.bind(prices.defaults);
    vi.spyOn(prices.defaults, "countEach").mockImplementationOnce(
      async (probes, signal) => {
        const rival = await publishDraft({ cookie, json: body });
        expect(rival.status).toBe(200);
        return counting(probes, signal);
      },
    );

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(
      (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(2);
  });

  it("publishes exactly one of two publishes of the same deleting draft sent together", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PREMIUM));
    const body = await publishBody();

    const answers = await Promise.all([
      publishDraft({ cookie, json: body }),
      publishDraft({ cookie, json: body }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(2);
  });

  it("is changed-meanwhile when a switch lands during the count, whatever the count answered", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const body = await publishBody();
    vi.spyOn(prices.defaults, "countEach").mockImplementationOnce(
      async (probes) => {
        const switched = await switchItem(cookie, PAINTED, false);
        expect(switched.status).toBe(200);
        return {
          counts: probes.map(({ item }) => ({ item, designCount: 0 })),
          unreadableDesigns: 0,
        };
      },
    );

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(409);
    expect(
      (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(1);
  });

  it("is changed-meanwhile when the draft is rewritten during the count, and publishes none of the old one", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PAINTED));
    const body = await publishBody();
    vi.spyOn(prices.defaults, "countEach").mockImplementationOnce(
      async (probes) => {
        await plantDraft(tokenHash, deleting(PAINTED));
        return {
          counts: probes.map(({ item }) => ({ item, designCount: 0 })),
          unreadableDesigns: 0,
        };
      },
    );

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(
      (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(1);
  });
});

describe("a publish that never reaches the count", () => {
  it("asks the reader nothing when its draft revision is stale", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const stale = await publishBody({ expectedDraftRevision: "0" });
    const counting = vi.spyOn(prices.defaults, "countEach");
    const reading = vi.spyOn(prices.defaults, "read");

    const answer = await publishDraft({ cookie, json: stale });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(counting).not.toHaveBeenCalled();
    expect(reading).not.toHaveBeenCalled();
  });

  it("asks the reader nothing when its active sequence is stale", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const stale = await publishBody({ expectedActiveSequence: 99 });
    const counting = vi.spyOn(prices.defaults, "countEach");

    const answer = await publishDraft({ cookie, json: stale });

    expect(answer.status).toBe(409);
    expect(counting).not.toHaveBeenCalled();
  });
});

describe("a deletion that must never be published", () => {
  async function expectRefusedWithoutWriting(
    changes: readonly DraftChange[],
  ): Promise<Response> {
    await plantDraft(tokenHash, changes);
    const before = await stateOfTheWorld();
    const storeAsked = storeAskedToPublish();

    const answer = await publish();

    expect(answer.status).not.toBe(200);
    expect(answer.status).not.toBe(500);
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await stateOfTheWorld()).toEqual(before);
    return answer;
  }

  it.each([
    ["the fixed material default", FIXED_MATERIAL],
    ["the fixed hardware default", FIXED_HARDWARE],
  ])("is refused at the candidate for %s", async (_name, item) => {
    const answer = await expectRefusedWithoutWriting(deleting(item));

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "candidate-refused",
      refusals: [{ source: "changes", index: 0, code: "ITEM_IS_DEFAULT" }],
    });
  });

  it.each([
    ["a colour", { kind: "finish", finishId: "white" }],
    ["a handle", { kind: "handle", handle: "steel" }],
  ])("is unreadable as a stored draft for %s", async (_name, item) => {
    const answer = await expectRefusedWithoutWriting(
      deleting(item as unknown as ItemRef),
    );

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "draft-unreadable",
      draftRevision: await currentDraftRevision(),
    });
  });

  it("is refused at the candidate for the accessory every kitchen carries", async () => {
    const answer = await expectRefusedWithoutWriting(
      deleting({ kind: "accessory", accessoryId: ALWAYS_PRESENT_ACCESSORY_ID }),
    );

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "candidate-refused",
      refusals: [{ source: "changes", index: 0, code: "NOT_EDITABLE" }],
    });
  });

  it("is refused at the candidate for a draft that holds one such deletion beside a deletion that could go", async () => {
    const answer = await expectRefusedWithoutWriting(
      deleting(VENEER, {
        kind: "accessory",
        accessoryId: ALWAYS_PRESENT_ACCESSORY_ID,
      }),
    );

    expect(await jsonOf(answer)).toEqual({
      status: "candidate-refused",
      refusals: [{ source: "changes", index: 1, code: "NOT_EDITABLE" }],
    });
  });

  it("is refused for the fixed default beside rows that could go", async () => {
    await expectRefusedWithoutWriting(
      deleting(VENEER, FIXED_MATERIAL, PREMIUM),
    );
  });
});

describe("what a publish judges, whatever order the draft lists it in", () => {
  function orderingsOf<Element>(items: readonly Element[]): Element[][] {
    if (items.length <= 1) return [[...items]];
    return items.flatMap((item, index) =>
      orderingsOf([...items.slice(0, index), ...items.slice(index + 1)]).map(
        (rest) => [item, ...rest],
      ),
    );
  }

  it.each(orderingsOf([VENEER, PREMIUM, PLINTH]).map((order) => [order]))(
    "names the saved default before the uses for %j",
    async (order) => {
      await plantDraft(tokenHash, deleting(...order));
      await saveDefaults({ tokenHash }, { materialTierId: VENEER.tierId });
      aDesignNaming(PREMIUM);
      aDesignNaming(PLINTH);

      const answer = await publish();

      expect(await jsonOf(answer)).toEqual({
        status: "item-is-default",
        item: VENEER,
      });
    },
  );

  it.each(orderingsOf([PREMIUM, PLINTH, SOFT_CLOSE]).map((order) => [order]))(
    "lists the used rows in draft order for %j",
    async (order) => {
      await plantDraft(tokenHash, deleting(...order));
      aDesignNaming(PREMIUM);
      aDesignNaming(PLINTH);

      const answer = await publish();

      expect(await jsonOf(answer)).toEqual({
        status: "item-in-use",
        items: order.filter((item) => item !== SOFT_CLOSE),
      });
    },
  );

  it("does not let a design that names a row the draft keeps refuse the deletion of another", async () => {
    await plantDraft(tokenHash, deleting(PAINTED));
    aDesignNaming(VENEER);
    aDesignNaming(PREMIUM);

    const answer = await publish();

    expect(answer.status).toBe(200);
  });

  it("does not let a saved default naming a row the draft keeps refuse the deletion of another", async () => {
    await plantDraft(tokenHash, deleting(PAINTED, SOFT_CLOSE));
    await saveDefaults(
      { tokenHash },
      { materialTierId: VENEER.tierId, hardwareTierId: PREMIUM.tierId },
    );

    const answer = await publish();

    expect(answer.status).toBe(200);
  });

  it("answers a saved hardware default as the default", async () => {
    await plantDraft(tokenHash, deleting(PREMIUM));
    await saveDefaults({ tokenHash }, { hardwareTierId: PREMIUM.tierId });

    const answer = await publish();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-is-default",
      item: PREMIUM,
    });
  });

  it.each([true, false])(
    "refuses a draft that deletes a row twice, and writes nothing (used: %s)",
    async (isUsed) => {
      await plantDraft(tokenHash, deleting(VENEER, VENEER));
      if (isUsed) aDesignNaming(VENEER);
      const before = await stateOfTheWorld();
      const storeAsked = storeAskedToPublish();

      const answer = await publish();

      expect(answer.status).toBe(409);
      expect(storeAsked).not.toHaveBeenCalled();
      expect(await stateOfTheWorld()).toEqual(before);
    },
  );
});

describe("a publish whose count or defaults pass the deadline", () => {
  it("is a 503 that writes nothing when the count never answers", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    vi.spyOn(prices.defaults, "countEach").mockReturnValue(
      new Promise(() => undefined),
    );
    const before = await stateOfTheWorld();
    const storeAsked = storeAskedToPublish();
    const body = await publishBody();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const answering = publishDraft({ cookie, json: body });
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    const answer = await answering;

    expect(answer.status).toBe(503);
    expect(storeAsked).not.toHaveBeenCalled();
    vi.useRealTimers();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is a 503 that writes nothing when the saved defaults never answer, however fast the count", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const before = await stateOfTheWorld();
    vi.spyOn(prices.defaults, "read").mockReturnValue(
      new Promise(() => undefined),
    );
    const storeAsked = storeAskedToPublish();
    const body = await publishBody();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const answering = publishDraft({ cookie, json: body });
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    const answer = await answering;

    expect(answer.status).toBe(503);
    expect(storeAsked).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.restoreAllMocks();
    expect(await stateOfTheWorld()).toEqual(before);
  });
});

describe("the draft route, while a draft holds a deletion", () => {
  const DELETABLE_AND_NOT: readonly [string, unknown][] = [
    ["a material the book states", VENEER],
    ["the fixed material default", FIXED_MATERIAL],
    ["a hardware class the book states", PREMIUM],
    ["a linked accessory", PLINTH],
    [
      "a built-in accessory",
      { kind: "accessory", accessoryId: "always-present" },
    ],
    ["a colour", { kind: "finish", finishId: "white" }],
    ["a handle", { kind: "handle", handleId: "bar" }],
    [
      "a row the book does not state",
      { kind: "material", tierId: "material.gone" },
    ],
  ];

  async function snapshot() {
    return stateOfTheWorld();
  }

  it.each(DELETABLE_AND_NOT)(
    "refuses to take %s as a change, whatever its value, and leaves the stored deletion as it was",
    async (_name, item) => {
      await plantDraft(tokenHash, deleting(PAINTED));
      const before = await snapshot();

      for (const value of [true, false, null, "yes", 1]) {
        const answer = await changeDraft({
          cookie,
          json: {
            expectedDraftRevision: await currentDraftRevision(),
            change: { address: { kind: "item-deleted", item }, value },
          },
        });
        expect(answer.status).toBe(400);
      }

      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(DELETABLE_AND_NOT)(
    "refuses to revert %s, and leaves the stored deletion as it was",
    async (_name, item) => {
      await plantDraft(tokenHash, deleting(item as ItemRef));
      const before = await snapshot();

      const answer = await revertDraft({
        cookie,
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          target: { kind: "change", address: { kind: "item-deleted", item } },
        },
      });

      expect(answer.status).toBe(400);
      expect(await snapshot()).toEqual(before);
    },
  );

  it("refuses a deletion carried beside a change it would accept, and writes neither", async () => {
    await plantDraft(tokenHash, []);
    const before = await snapshot();

    const answer = await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: {
          address: { kind: "item-deleted", item: VENEER },
          value: true,
        },
        changes: [
          {
            address: { kind: "item-deleted", item: PAINTED },
            value: true,
          },
        ],
      },
    });

    expect(answer.status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });
});
