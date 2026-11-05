import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  buildIdsPricedAs,
  isSameItem,
  judgeDeletionsAtPublish,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  NONE_SAVED,
  type ItemUsageProbe,
  type KitchenUsageReader,
} from "@lemnaria/persistence";

import {
  deletedItemsOf,
  readDeletionFacts,
  type DeletionBasis,
} from "@/lib/server/price-dashboard/deletion-facts";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";

import { deleting } from "../../../support/planted-draft";
import {
  itemAt,
  linkedAccessory,
  widestBook,
} from "../../../support/wide-price-book";

/**
 * The deleted items a publish counts and guards, swept over every row the catalogue ships and over every subset of the
 * rows a widest book can lose: the count asks what the guard is given, and every row the book states is counted once.
 */

type CountResult = Awaited<ReturnType<KitchenUsageReader["countEach"]>>;

function aReader() {
  const asked: ItemUsageProbe[][] = [];
  const stores: DeletionBasis["stores"] = {
    defaults: {
      read: () => Promise.resolve(NONE_SAVED),
      save: () => Promise.reject(new Error("a count never saves")),
    },
    usage: {
      countEach: (probes): Promise<CountResult> => {
        asked.push([...probes]);
        return Promise.resolve({
          counts: probes.map(({ item }) => ({ item, designCount: 0 })),
          unreadableDesigns: 0,
        });
      },
    },
  };
  return { asked, stores };
}

function bookLinkedTo(...links: readonly [string, string][]): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    linkedAccessories: links.map(([accessoryId, linkedBuildId]) => ({
      ...linkedAccessory(accessoryId),
      linkedBuildId,
    })),
  };
}

describe("a deleted linked accessory, whichever catalogue row it is linked to", () => {
  const rows = [...shippedCatalogue().keys()];

  it.each(rows)(
    "is counted by the rows priced as %s, itself among them, as the guard is given them",
    async (linkedBuildId) => {
      const accessory: ItemRef = { kind: "accessory", accessoryId: "linked-1" };
      const book = bookLinkedTo(["linked-1", linkedBuildId]);
      const deleted = deletedItemsOf(deleting(accessory), book);
      const { asked, stores } = aReader();

      await readDeletionFacts({ stores, book, deleted });

      const guarded = deleted.map((row) =>
        "buildIds" in row ? row.buildIds : [],
      );
      expect(guarded).toHaveLength(1);
      expect(guarded[0]).toEqual(
        expect.arrayContaining([
          ...buildIdsPricedAs(shippedCatalogue(), linkedBuildId),
        ]),
      );
      expect(guarded[0]).toContain(linkedBuildId);
      expect(
        asked
          .flat()
          .map((probe) => ("buildIds" in probe ? probe.buildIds : [])),
      ).toEqual(guarded);
    },
  );

  it("is counted by its own rule's rows when two accessories are linked to different rows", async () => {
    const [first, second] = rows;
    if (first === undefined || second === undefined) {
      throw new Error("the catalogue ships fewer than two rows");
    }
    const book = bookLinkedTo(["linked-1", first], ["linked-2", second]);
    const items: ItemRef[] = [
      { kind: "accessory", accessoryId: "linked-1" },
      { kind: "accessory", accessoryId: "linked-2" },
    ];
    const { asked, stores } = aReader();

    await readDeletionFacts({
      stores,
      book,
      deleted: deletedItemsOf(deleting(...items), book),
    });

    const buildIdsAskedFor = (item: ItemRef): readonly string[] =>
      asked
        .flat()
        .filter((probe) => isSameItem(probe.item, item))
        .flatMap((probe) => ("buildIds" in probe ? probe.buildIds : []));
    expect(buildIdsAskedFor(itemAt(items, 0))).toContain(first);
    expect(buildIdsAskedFor(itemAt(items, 1))).toContain(second);
  });
});

describe("the facts of any subset of the rows a widest book can lose", () => {
  const { book, deletable } = widestBook();

  it("count each deleted row once, ask in chunks of at most 50 and judge without a missing count", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray([...deletable], { minLength: 1 }),
        async (deletedRows) => {
          const changes = deleting(...deletedRows);
          const { asked, stores } = aReader();
          const countEach = vi.spyOn(stores.usage, "countEach");

          const facts = await readDeletionFacts({
            stores,
            book,
            deleted: deletedItemsOf(changes, book),
          });

          expect(
            countEach.mock.calls.every(([probes]) => probes.length <= 50),
          ).toBe(true);
          expect(asked.flat()).toHaveLength(deletedRows.length);
          expect(facts.usage).toHaveLength(deletedRows.length);
          const counted = facts.usage.map(({ item }) => item);
          expect(
            deletedRows.every(
              (row) =>
                counted.filter((item) => isSameItem(item, row)).length === 1,
            ),
          ).toBe(true);
          expect(judgeDeletionsAtPublish({ changes, book, ...facts })).toEqual(
            [],
          );
        },
      ),
      { numRuns: 60 },
    );
  });

  it("refuse exactly the used rows of the deleted subset, wherever each falls among the chunks", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray([...deletable], { minLength: 1 }),
        fc.subarray([...deletable]),
        async (deletedRows, usedRows) => {
          const changes = deleting(...deletedRows);
          const stores = aReader().stores;
          const counting = stores.usage.countEach.bind(stores.usage);
          stores.usage.countEach = async (probes, signal) => {
            const counted = await counting(probes, signal);
            return {
              ...counted,
              counts: counted.counts.map((count) => ({
                ...count,
                designCount: usedRows.some((used) =>
                  isSameItem(used, count.item),
                )
                  ? 2
                  : 0,
              })),
            };
          };

          const facts = await readDeletionFacts({
            stores,
            book,
            deleted: deletedItemsOf(changes, book),
          });
          const refused = judgeDeletionsAtPublish({ changes, book, ...facts });

          expect(refused.map(({ item }) => item)).toEqual(
            deletedRows.filter((row) =>
              usedRows.some((used) => isSameItem(used, row)),
            ),
          );
          expect(refused.every(({ code }) => code === "item-in-use")).toBe(
            true,
          );
        },
      ),
      { numRuns: 60 },
    );
  });
});
