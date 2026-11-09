import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  NONE_SAVED,
  type ItemUsageProbe,
  type KitchenUsageReader,
} from "@lemnaria/persistence";

import { refusalOfDeletions } from "@/lib/server/price-dashboard/deletion-refusal";
import {
  DELETION_FACTS_MEMO_TTL_MS,
  deletedItemsOf,
  forgetRememberedDeletionFacts,
  readDeletionFactsOfPage,
  type DeletionMemoKey,
} from "@/lib/server/price-dashboard/deletion-facts";
import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import type { PriceStores } from "@/lib/server/price-stores";

import { deleting } from "../../../support/planted-draft";

const held = vi.hoisted(() => ({ stores: {} as PriceStores }));

vi.mock("@/lib/server/price-stores", () => ({
  getPriceStores: () => Promise.resolve(held.stores),
}));

/**
 * What a publish page remembers of its count (R4c2, ruling 11): one set of counts for two renders at one key inside the
 * TTL, a fresh count after any part of the key moves, nothing kept of a read that failed or ran late, and never a
 * publish's own count answered from it.
 */

const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const BOOK: PriceBook = SAMPLE_PRICE_BOOK;
const CHANGES = deleting(VENEER);
const KEY: DeletionMemoKey = {
  draftRevision: "4",
  activeSequence: 2,
  availabilityRevision: "9",
};

type CountResult = Awaited<ReturnType<KitchenUsageReader["countEach"]>>;

let usedBy = 0;
let counted: ItemUsageProbe[][];

function aWorldOfStores(): PriceStores {
  counted = [];
  return {
    defaults: {
      read: () => Promise.resolve(NONE_SAVED),
      save: () => Promise.reject(new Error("a count never saves")),
    },
    usage: {
      countEach: (probes: readonly ItemUsageProbe[]): Promise<CountResult> => {
        counted.push([...probes]);
        return Promise.resolve({
          counts: probes.map(({ item }) => ({ item, designCount: usedBy })),
          unreadableDesigns: 0,
        });
      },
    },
  } as unknown as PriceStores;
}

function render(key: DeletionMemoKey = KEY) {
  return readDeletionFactsOfPage({
    book: BOOK,
    changes: CHANGES,
    memoKey: key,
  });
}

beforeEach(() => {
  usedBy = 0;
  held.stores = aWorldOfStores();
  forgetRememberedDeletionFacts();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("two renders of the publish page at one key, inside the TTL", () => {
  it("issue one set of counts and answer the same facts", async () => {
    const first = await render();
    usedBy = 3;
    const second = await render();

    expect(counted).toHaveLength(1);
    expect(second).toEqual(first);
    expect(second?.usage.map(({ designCount }) => designCount)).toEqual([0]);
  });

  it("count again once the TTL has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await render();

    vi.setSystemTime(Date.now() + DELETION_FACTS_MEMO_TTL_MS - 1);
    await render();
    expect(counted).toHaveLength(1);

    vi.setSystemTime(Date.now() + 1);
    usedBy = 2;
    const later = await render();

    expect(counted).toHaveLength(2);
    expect(later?.usage.map(({ designCount }) => designCount)).toEqual([2]);
  });
});

describe("a render at another key", () => {
  it.each<[string, Partial<DeletionMemoKey>]>([
    ["the draft revision moved", { draftRevision: "5" }],
    ["a version was published", { activeSequence: 3 }],
    ["the availability head moved", { availabilityRevision: "10" }],
  ])("recounts when %s", async (_what, moved) => {
    await render();
    usedBy = 1;

    const after = await render({ ...KEY, ...moved });

    expect(counted).toHaveLength(2);
    expect(after?.usage.map(({ designCount }) => designCount)).toEqual([1]);
  });

  it("recounts when the facts would be read from other stores, whatever the key holds", async () => {
    await render();
    held.stores = aWorldOfStores();

    await render();

    expect(counted).toHaveLength(1);
  });

  it("does not take a key's parts for one another", async () => {
    await render({
      draftRevision: "1",
      activeSequence: 2,
      availabilityRevision: "3",
    });

    await render({
      draftRevision: "1",
      activeSequence: 23,
      availabilityRevision: "",
    });

    expect(counted).toHaveLength(2);
  });
});

describe("a read that is not a whole answer", () => {
  it("is not remembered when it ran past the deadline: the next render asks again", async () => {
    const counting = vi
      .spyOn(held.stores.usage, "countEach")
      .mockReturnValueOnce(new Promise(() => undefined));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const late = render();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    expect(await late).toBeUndefined();
    const next = await render();

    expect(next).toBeDefined();
    expect(counting).toHaveBeenCalledTimes(2);
  });

  it("is not remembered when a store failed: the failure is thrown and the next render asks again", async () => {
    const counting = vi
      .spyOn(held.stores.usage, "countEach")
      .mockRejectedValueOnce(new Error("down"));

    await expect(render()).rejects.toThrow("down");
    const next = await render();

    expect(next).toBeDefined();
    expect(counting).toHaveBeenCalledTimes(2);
  });
});

describe("a publish, whatever a page remembers", () => {
  it("counts in its own request and judges on the usage it reads", async () => {
    const remembered = await render();
    expect(remembered?.usage.map(({ designCount }) => designCount)).toEqual([
      0,
    ]);
    usedBy = 1;

    const refusal = await refusalOfDeletions(
      {
        changes: CHANGES,
        deletedItems: deletedItemsOf(CHANGES, BOOK),
      } as never,
      { stores: held.stores, book: BOOK },
    );

    expect(counted).toHaveLength(2);
    expect(refusal?.status).toBe(409);
    expect(await refusal?.json()).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
  });

  it("is not made to count again by a page that read the same key, nor does it stock the page's memory", async () => {
    usedBy = 1;
    await refusalOfDeletions(
      {
        changes: CHANGES,
        deletedItems: deletedItemsOf(CHANGES, BOOK),
      } as never,
      { stores: held.stores, book: BOOK },
    );
    usedBy = 0;

    const page = await render();

    expect(page?.usage.map(({ designCount }) => designCount)).toEqual([0]);
    expect(counted).toHaveLength(2);
  });
});
