import { describe, expect, it, vi } from "vitest";

import {
  linkTargetBuildIdsOf,
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { ItemUsageProbe, KitchenUsageReader } from "@lemnaria/persistence";

import {
  countItemUsage,
  countUsageProbes,
  isWithinUsageBound,
  itemsStatedIn,
  MalformedUsageAnswerError,
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

/** A book that states each of the accessories as one linked to the first cabinet type the manufacturer supplies. */
function bookLinking(items: readonly ItemRef[]): PriceBook {
  const linkedBuildId = linkTargetBuildIdsOf(SAMPLE_PRICE_BOOK)[0] ?? "";
  return {
    ...SAMPLE_PRICE_BOOK,
    linkedAccessories: items.flatMap((item) =>
      item.kind === "accessory"
        ? [
            {
              accessoryId: item.accessoryId,
              ruleId: `rule.${item.accessoryId}`,
              linkedBuildId,
              perUnitMinor: 1_000,
              name: item.accessoryId,
              description: "",
            },
          ]
        : [],
    ),
  };
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

    const { usage } = await countItemUsage(
      [VENEER, SOFT_CLOSE, VENEER, VENEER],
      {
        stores: { usage: readerRecording(asked) },
        book: SAMPLE_PRICE_BOOK,
      },
    );

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
      book: bookLinking(accessories(MAX_USAGE_ITEMS + 1)),
    };

    const { usage: atTheBound } = await countItemUsage(
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

describe("countItemUsage, as the data it returns", () => {
  it("hands the unreadable-design count back and writes no line itself", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stores = {
      usage: {
        countEach: (probes: readonly ItemUsageProbe[]) =>
          Promise.resolve({
            counts: probes.map(({ item }) => ({ item, designCount: 1 })),
            unreadableDesigns: 3,
          }),
      },
    };

    const counted = await countItemUsage([VENEER], {
      stores,
      book: SAMPLE_PRICE_BOOK,
    });

    expect(counted.unreadableDesigns).toBe(3);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves out a tier the given book does not state and never probes it, though a reader would count it", async () => {
    const asked: ItemUsageProbe[][] = [];
    const unstated = { kind: "material", tierId: "material.dropped" } as const;

    const { usage } = await countItemUsage([unstated], {
      stores: { usage: readerRecording(asked) },
      book: SAMPLE_PRICE_BOOK,
    });

    expect(usage).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("names the items a book can speak of: a tier or linked accessory it does not state is left out, a built-in accessory and a finish are kept", () => {
    const unstatedTier = {
      kind: "material",
      tierId: "material.dropped",
    } as const;
    const unlinked = { kind: "accessory", accessoryId: "accessory-0" } as const;
    const builtIn = {
      kind: "accessory",
      accessoryId: "sinkProtectiveCover",
    } as const;
    const finish = { kind: "finish", finishId: "veneer.nuc" } as const;

    expect(
      itemsStatedIn(
        [VENEER, unstatedTier, unlinked, builtIn, finish],
        SAMPLE_PRICE_BOOK,
      ),
    ).toEqual([VENEER, builtIn, finish]);
  });

  it("leaves the deadline to a caller that passes its own signal, and hands the reader that signal", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const mine = new AbortController().signal;
    const stores = {
      usage: {
        countEach: (
          probes: readonly ItemUsageProbe[],
          signal?: AbortSignal,
        ) => {
          seen.push(signal);
          return Promise.resolve({
            counts: probes.map(({ item }) => ({ item, designCount: 1 })),
            unreadableDesigns: 0,
          });
        },
      },
    };

    await countItemUsage([VENEER], {
      stores,
      book: SAMPLE_PRICE_BOOK,
      signal: mine,
    });

    expect(seen).toEqual([mine]);
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

describe("countUsageProbes", () => {
  const A_TIER_PROBE: ItemUsageProbe = {
    via: "settings-tier",
    item: VENEER,
    isFallback: false,
  };

  it("answers one entry per probe in the probes' order, and asks no reader for no probes", async () => {
    const asked: ItemUsageProbe[][] = [];
    const stores = { usage: readerRecording(asked) };

    const counted = await countUsageProbes([A_TIER_PROBE], stores);
    const nothing = await countUsageProbes([], stores);

    expect(counted).toEqual({
      usage: [{ item: VENEER, designCount: 2 }],
      unreadableDesigns: 0,
    });
    expect(nothing).toEqual({ usage: [], unreadableDesigns: 0 });
    expect(asked).toHaveLength(1);
  });

  it("hands the unreadable-design count back and writes no log line itself", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stores = {
      usage: {
        countEach: () =>
          Promise.resolve({
            counts: [{ item: VENEER, designCount: 1 }],
            unreadableDesigns: 4,
          }),
      },
    };

    const counted = await countUsageProbes([A_TIER_PROBE], stores);

    expect(counted.unreadableDesigns).toBe(4);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY, "3"])(
    "refuses an unreadable-design count of %s",
    async (unreadableDesigns) => {
      const stores = {
        usage: {
          countEach: () =>
            Promise.resolve({
              counts: [{ item: VENEER, designCount: 1 }],
              unreadableDesigns: unreadableDesigns as number,
            }),
        },
      };

      await expect(
        countUsageProbes([A_TIER_PROBE], stores),
      ).rejects.toBeInstanceOf(MalformedUsageAnswerError);
    },
  );
});
