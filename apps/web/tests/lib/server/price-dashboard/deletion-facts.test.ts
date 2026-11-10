import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALWAYS_PRESENT_ACCESSORY_ID,
  SAMPLE_PRICE_BOOK,
  buildIdsPricedAs,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  NONE_SAVED,
  usageProbesFor,
  type DeletedItem,
  type ItemUsageProbe,
  type KitchenUsageReader,
} from "@lemnaria/persistence";

import {
  WalkedDeletionProbeError,
  deletedItemsOf,
  readDeletionFacts,
  type DeletionBasis,
} from "@/lib/server/price-dashboard/deletion-facts";
import {
  USAGE_READ_DEADLINE_MS,
  UsageReadDeadlineError,
} from "@/lib/server/price-dashboard/item-usage-read";
import {
  UnansweredDeletionRefusalError,
  refusalOfDeletions,
} from "@/lib/server/price-dashboard/deletion-refusal";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

import { deleting } from "../../../support/planted-draft";

/**
 * The deletions a publish counts, with a reader that records what it is asked. The route tests cannot tell the build ids
 * of a probe apart (the fake reader counts by item), nor reach a book linked to a row the catalogue no longer ships, nor
 * a draft of more than 50 deletions, so these ask the module directly.
 */

const LINKED_ROW = "base-3drawer";
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const LINKED_PLINTH = {
  accessoryId: PLINTH.accessoryId,
  ruleId: "accessory.plinth-light",
  name: "Soclu luminos",
  perUnitMinor: 1_000,
};

function bookLinkedTo(linkedBuildId: string): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    linkedAccessories: [{ ...LINKED_PLINTH, linkedBuildId }],
  };
}

function bookWithMaterialTiers(count: number): {
  book: PriceBook;
  items: ItemRef[];
} {
  const [template] = SAMPLE_PRICE_BOOK.material.tiers;
  if (template === undefined) throw new Error("the sample book has no tier");
  const added = Array.from({ length: count }, (_, index) => ({
    ...template,
    tierId: `material.extra-${String(index)}`,
  }));
  return {
    book: {
      ...SAMPLE_PRICE_BOOK,
      material: {
        ...SAMPLE_PRICE_BOOK.material,
        tiers: [...SAMPLE_PRICE_BOOK.material.tiers, ...added],
      },
    },
    items: added.map(({ tierId }) => ({ kind: "material", tierId })),
  };
}

type KitchenUsageResult = Awaited<ReturnType<KitchenUsageReader["countEach"]>>;

function tierIdsOf(items: readonly ItemRef[]): string[] {
  return items
    .map((item) => (item.kind === "material" ? item.tierId : ""))
    .sort();
}

function guardedIdsOf(deleted: DeletedItem | undefined): readonly string[] {
  return deleted !== undefined && "buildIds" in deleted ? deleted.buildIds : [];
}

function isSame(item: ItemRef, other: ItemRef | undefined): boolean {
  return JSON.stringify(item) === JSON.stringify(other);
}

function aReader(countOf: (item: ItemRef) => number = () => 0) {
  const asked: ItemUsageProbe[][] = [];
  const countEach = vi.fn(
    (probes: readonly ItemUsageProbe[]): Promise<KitchenUsageResult> => {
      asked.push([...probes]);
      return Promise.resolve({
        counts: probes.map(({ item }) => ({
          item,
          designCount: countOf(item),
        })),
        unreadableDesigns: 0,
      });
    },
  );
  const stores: DeletionBasis["stores"] = {
    defaults: {
      read: () => Promise.resolve(NONE_SAVED),
      save: () => Promise.reject(new Error("a count never saves")),
    },
    usage: { countEach },
  };
  return { asked, countEach, stores };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the deleted items a publish counts and guards", () => {
  it("are one list: the count asks the build ids the guard is given, aliases and the rule's own row included", async () => {
    const aliased = [...shippedCatalogue().keys()].find(
      (buildId) => buildIdsPricedAs(shippedCatalogue(), buildId).length > 1,
    );
    if (aliased === undefined) throw new Error("the catalogue prices no alias");
    const gone = "no-such-row";
    const unshipped = shippedCatalogue().has(gone);
    expect(unshipped).toBe(false);

    for (const linkedRow of [aliased, LINKED_ROW, gone]) {
      const book = bookLinkedTo(linkedRow);
      const deleted = deletedItemsOf(deleting(PLINTH), book);
      const { asked, stores } = aReader();

      await readDeletionFacts({ stores, book, deleted });

      const [guarded] = deleted;
      expect(guarded && "buildIds" in guarded).toBe(true);
      expect(asked[0]).toMatchObject([
        { via: "placed-bodies", item: PLINTH, buildIds: guardedIdsOf(guarded) },
      ]);
      expect(guardedIdsOf(guarded)).toContain(linkedRow);
    }
  });

  it("include the rule's own row where the catalogue prices nothing as it, which the probes alone would drop", async () => {
    const book = bookLinkedTo("no-such-row");
    const [guarded] = deletedItemsOf(deleting(PLINTH), book);
    const { asked, stores } = aReader();

    await readDeletionFacts({
      stores,
      book,
      deleted: guarded ? [guarded] : [],
    });

    expect(
      usageProbesFor([PLINTH], { catalog: shippedCatalogue(), book }),
    ).toMatchObject([{ buildIds: [] }]);
    expect(asked[0]).toMatchObject([{ buildIds: ["no-such-row"] }]);
  });

  it("are counted against the active book's fallback tier, not a book the draft would make", async () => {
    const [deleted] = deletedItemsOf(
      deleting({
        kind: "material",
        tierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
      }),
      SAMPLE_PRICE_BOOK,
    );
    const { asked, stores } = aReader();

    await readDeletionFacts({
      stores,
      book: SAMPLE_PRICE_BOOK,
      deleted: deleted ? [deleted] : [],
    });

    expect(asked[0]).toMatchObject([
      { via: "settings-tier", isFallback: true },
    ]);
  });

  it("leave out a row the draft creates and then deletes", () => {
    const created = {
      address: { kind: "accessory-created", accessoryId: "drawer-light" },
      value: { linkedBuildId: LINKED_ROW, perUnitMinor: 1, name: "Lumina" },
    } as unknown as DraftChange;
    const row: ItemRef = { kind: "accessory", accessoryId: "drawer-light" };

    expect(
      deletedItemsOf([created, ...deleting(row)], SAMPLE_PRICE_BOOK),
    ).toEqual([]);
  });
});

describe("the count of the deleted items", () => {
  it("asks nothing, and touches no store, for a draft that deletes no row the book states", async () => {
    const stores = new Proxy(
      {},
      {
        get: () => {
          throw new Error("a store was touched");
        },
      },
    ) as DeletionBasis["stores"];
    const unstated: ItemRef = { kind: "material", tierId: "material.gone" };

    const facts = await readDeletionFacts({
      stores,
      book: SAMPLE_PRICE_BOOK,
      deleted: deletedItemsOf(deleting(unstated), SAMPLE_PRICE_BOOK),
    });

    expect(facts).toEqual({ usage: [], defaults: {} });
  });

  it.each([
    [1, [1]],
    [MAX_USAGE_ITEMS - 1, [MAX_USAGE_ITEMS - 1]],
    [MAX_USAGE_ITEMS, [MAX_USAGE_ITEMS]],
    [MAX_USAGE_ITEMS + 1, [MAX_USAGE_ITEMS, 1]],
    [2 * MAX_USAGE_ITEMS + 5, [MAX_USAGE_ITEMS, MAX_USAGE_ITEMS, 5]],
  ])(
    "asks the reader in chunks of at most 50: %i deletions in %j",
    async (count, chunkSizes) => {
      const { book, items } = bookWithMaterialTiers(count);
      const { asked, stores } = aReader();

      const facts = await readDeletionFacts({
        stores,
        book,
        deleted: deletedItemsOf(deleting(...items), book),
      });

      expect(asked.map((chunk) => chunk.length)).toEqual(chunkSizes);
      expect(tierIdsOf(facts.usage.map(({ item }) => item))).toEqual(
        tierIdsOf(items),
      );
    },
  );

  it("refuses in the request an item counted in a later chunk", async () => {
    const { book, items } = bookWithMaterialTiers(MAX_USAGE_ITEMS + 5);
    const used = items[MAX_USAGE_ITEMS + 2];
    const changes = deleting(...items);
    const { stores, asked } = aReader((item) => (isSame(item, used) ? 3 : 0));

    const refusal = await refusalOfDeletions(
      {
        kind: "publish",
        book,
        changes,
        deletedItems: deletedItemsOf(changes, book),
      },
      { stores, book },
    );

    expect(asked).toHaveLength(2);
    expect(refusal?.status).toBe(409);
    expect(await refusal?.json()).toEqual({
      status: "item-in-use",
      items: [used],
    });
  });

  it("is given one deadline for every chunk, which stops the reader of each", async () => {
    vi.useFakeTimers();
    const { book, items } = bookWithMaterialTiers(MAX_USAGE_ITEMS + 1);
    const signals: AbortSignal[] = [];
    const slowChunk = (
      probes: readonly ItemUsageProbe[],
      signal?: AbortSignal,
    ): Promise<KitchenUsageResult> =>
      new Promise((resolve) => {
        if (signal !== undefined) signals.push(signal);
        setTimeout(() => {
          resolve({
            counts: probes.map(({ item }) => ({ item, designCount: 0 })),
            unreadableDesigns: 0,
          });
        }, USAGE_READ_DEADLINE_MS * 0.6);
      });
    const stores = {
      defaults: { read: () => Promise.resolve(NONE_SAVED), save: vi.fn() },
      usage: { countEach: vi.fn(slowChunk) },
    } as unknown as DeletionBasis["stores"];

    const facts = readDeletionFacts({
      stores,
      book,
      deleted: deletedItemsOf(deleting(...items), book),
    });
    const settled = expect(facts).rejects.toBeInstanceOf(
      UsageReadDeadlineError,
    );
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);

    await settled;
    expect(signals).toHaveLength(2);
    expect(signals.every(({ aborted }) => aborted)).toBe(true);
  });

  describe("never starts the walk: a probe that would read every design is thrown", () => {
    const BUILT_IN: DeletedItem = {
      item: { kind: "accessory", accessoryId: ALWAYS_PRESENT_ACCESSORY_ID },
      buildIds: [LINKED_ROW],
    };
    const ORDINARY: DeletedItem = {
      item: { kind: "material", tierId: "material.painted-mdf" },
    };

    it.each([
      ["alone", [BUILT_IN]],
      ["after an ordinary item", [ORDINARY, BUILT_IN]],
      ["before an ordinary item", [BUILT_IN, ORDINARY]],
    ])(
      "with the built-in accessory deleted %s",
      async (_placement, deleted) => {
        const { countEach, stores } = aReader();

        await expect(
          readDeletionFacts({ stores, book: SAMPLE_PRICE_BOOK, deleted }),
        ).rejects.toBeInstanceOf(WalkedDeletionProbeError);
        expect(countEach).not.toHaveBeenCalled();
      },
    );
  });
});

describe("the answer to a deletion the judgement refuses", () => {
  function planDeleting(item: ItemRef) {
    const changes = deleting(item);
    return {
      kind: "publish",
      book: SAMPLE_PRICE_BOOK,
      changes,
      deletedItems: deletedItemsOf(changes, SAMPLE_PRICE_BOOK),
    } as const;
  }

  it("names a fixed default as the default, though no save of the defaults names it", async () => {
    const fallback: ItemRef = {
      kind: "material",
      tierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
    };
    const { stores } = aReader();

    const refusal = await refusalOfDeletions(planDeleting(fallback), {
      stores,
      book: SAMPLE_PRICE_BOOK,
    });

    expect(refusal?.status).toBe(409);
    expect(await refusal?.json()).toEqual({
      status: "item-is-default",
      item: fallback,
    });
  });

  it("is thrown, never an allowance, for a kind that is never deleted", async () => {
    const colour: ItemRef = { kind: "finish", finishId: "white" } as ItemRef;
    const { stores } = aReader();

    await expect(
      refusalOfDeletions(planDeleting(colour), {
        stores,
        book: SAMPLE_PRICE_BOOK,
      }),
    ).rejects.toBeInstanceOf(UnansweredDeletionRefusalError);
  });
});
