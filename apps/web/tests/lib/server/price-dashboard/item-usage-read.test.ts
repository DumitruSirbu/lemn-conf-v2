import { describe, expect, it } from "vitest";

import { SAMPLE_PRICE_BOOK, type ItemRef } from "@lemnaria/configurator-domain";
import type { ItemUsageProbe, KitchenUsageReader } from "@lemnaria/persistence";

import {
  countItemUsage,
  isWithinUsageBound,
  TooManyUsageItemsError,
} from "@/lib/server/price-dashboard/item-usage-read";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

/**
 * The module the usage route and the publish judgement share: the bound and the one-entry-per-item guarantee hold for a
 * caller that never went through the route's body reader.
 */

const VENEER = { kind: "material", tierId: "material.veneer" } as const;
const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;

function accessories(howMany: number): ItemRef[] {
  return Array.from({ length: howMany }, (_, index) => ({
    kind: "accessory",
    accessoryId: `accessory-${String(index)}`,
  }));
}

function readerRecording(asked: ItemUsageProbe[][]): KitchenUsageReader {
  return {
    countEach: (probes) => {
      asked.push([...probes]);
      return Promise.resolve({
        counts: probes.map(({ item }) => ({ item, designCount: 2 })),
        unreadableDesigns: 0,
      });
    },
  };
}

describe("countItemUsage", () => {
  it("asks one probe per distinct item and answers one entry per distinct item, whatever repeats", async () => {
    const asked: ItemUsageProbe[][] = [];

    const usage = await countItemUsage([VENEER, SOFT_CLOSE, VENEER, VENEER], {
      stores: { usage: readerRecording(asked) },
      book: SAMPLE_PRICE_BOOK,
    });

    expect(asked[0]).toHaveLength(2);
    expect(usage).toEqual([
      { item: VENEER, designCount: 2 },
      { item: SOFT_CLOSE, designCount: 2 },
    ]);
  });

  it("answers exactly 50 distinct items and refuses 51 before the reader is asked", async () => {
    const asked: ItemUsageProbe[][] = [];
    const basis = {
      stores: { usage: readerRecording(asked) },
      book: SAMPLE_PRICE_BOOK,
    };

    const atTheBound = await countItemUsage(
      accessories(MAX_USAGE_ITEMS),
      basis,
    );
    asked.length = 0;
    const overTheBound = countItemUsage(
      accessories(MAX_USAGE_ITEMS + 1),
      basis,
    );

    expect(atTheBound).toHaveLength(MAX_USAGE_ITEMS);
    await expect(overTheBound).rejects.toBeInstanceOf(TooManyUsageItemsError);
    expect(asked).toEqual([]);
  });
});

describe("isWithinUsageBound", () => {
  it.each([
    ["no items", [], true],
    ["50 distinct", accessories(MAX_USAGE_ITEMS), true],
    ["51 distinct", accessories(MAX_USAGE_ITEMS + 1), false],
    [
      "100 refs of 50 distinct",
      [...accessories(MAX_USAGE_ITEMS), ...accessories(MAX_USAGE_ITEMS)],
      true,
    ],
  ])("judges %s", (_name, items, expected) => {
    expect(isWithinUsageBound(items)).toBe(expected);
  });
});
