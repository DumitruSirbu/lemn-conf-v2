// Adversarial QA of the count of waiting prices: drafts mixing bulk actions, single prices, created and deleted rows, in
// every order, are counted by what the person did, and a draft never counts a thing twice or loses one.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { pendingPriceCountOf } from "@/price-dashboard/cabinet-list-model";
import { countPendingPrices } from "@/price-dashboard/pending-price-count";

const change = (address: object, value: unknown, extra: object = {}) =>
  ({ address, value, ...extra }) as DraftChange;

const cabinetPrice = (ruleId: string) =>
  change({ kind: "cabinet", ruleId, field: "anchorMinor" }, 100_000);
const hardwareRate = (tierId: string, field: string) =>
  change({ kind: "hardware", tierId, field }, 1_000);
const accessoryPrice = (accessoryId: string) =>
  change({ kind: "accessory", accessoryId, field: "perUnitMinor" }, 9_000);
const deletion = (item: object) => change({ kind: "item-deleted", item }, true);

const FIELDS = ["perHingeMinor", "perDrawerMinor", "perLiftMinor"] as const;

interface Scenario {
  readonly changes: readonly DraftChange[];
  readonly expected: number;
}

const rangeOf = (length: number): readonly number[] =>
  Array.from({ length }, (_, index) => index);

/** A draft built from parts whose count the person would say: each part carries the number it stands for. */
const scenario = fc
  .record({
    singlePrices: fc.integer({ min: 0, max: 5 }),
    bulkSizes: fc.array(fc.integer({ min: 1, max: 6 }), { maxLength: 3 }),
    createdTiers: fc.array(
      fc.record({
        rates: fc.integer({ min: 0, max: 3 }),
        isDeletedAgain: fc.boolean(),
      }),
      { maxLength: 3 },
    ),
    createdAccessories: fc.array(
      fc.record({
        prices: fc.integer({ min: 0, max: 2 }),
        words: fc.integer({ min: 0, max: 2 }),
        isDeletedAgain: fc.boolean(),
      }),
      { maxLength: 3 },
    ),
    deletedBookRows: fc.integer({ min: 0, max: 2 }),
    pricesOnDeletedRows: fc.integer({ min: 0, max: 2 }),
    order: fc.array(fc.nat(1_000), { minLength: 120, maxLength: 120 }),
  })
  .map((parts): Scenario => {
    const changes: DraftChange[] = [];
    rangeOf(parts.singlePrices).forEach((n) => {
      changes.push(cabinetPrice(`cabinet.single-${String(n)}`));
    });
    parts.bulkSizes.forEach((size, group) => {
      rangeOf(size).forEach((member) => {
        changes.push(
          change(
            {
              kind: "cabinet",
              ruleId: `cabinet.bulk-${String(group)}-${String(member)}`,
              field: "anchorMinor",
            },
            100_000,
            {
              groupId: `group-${String(group)}`,
              bulk: { percent: 5, scope: "all" },
            },
          ),
        );
      });
    });
    parts.createdTiers.forEach(({ rates, isDeletedAgain }, n) => {
      const tierId = `hardware.created-${String(n)}`;
      changes.push(
        change(
          { kind: "hardware-tier-created", tierId },
          { name: "T", description: "D" },
        ),
      );
      rangeOf(rates).forEach((rate) => {
        changes.push(hardwareRate(tierId, FIELDS[rate] ?? "perHingeMinor"));
      });
      if (isDeletedAgain) changes.push(deletion({ kind: "hardware", tierId }));
    });
    parts.createdAccessories.forEach(({ prices, words, isDeletedAgain }, n) => {
      const accessoryId = `acc-created-${String(n)}`;
      const item = { kind: "accessory", accessoryId };
      changes.push(
        change(
          { kind: "accessory-created", accessoryId },
          { linkedBuildId: "b", perUnitMinor: 1, name: "N", description: "D" },
        ),
      );
      rangeOf(prices).forEach(() => changes.push(accessoryPrice(accessoryId)));
      rangeOf(words).forEach((word) => {
        changes.push(
          change(
            {
              kind: "created-row-text",
              item,
              field: word === 0 ? "name" : "description",
            },
            "words",
          ),
        );
      });
      if (isDeletedAgain) changes.push(deletion(item));
    });
    rangeOf(parts.deletedBookRows).forEach((n) => {
      const tierId = `hardware.book-${String(n)}`;
      changes.push(deletion({ kind: "hardware", tierId }));
      rangeOf(parts.pricesOnDeletedRows).forEach((rate) => {
        changes.push(hardwareRate(tierId, FIELDS[rate] ?? "perHingeMinor"));
      });
    });
    const expected =
      parts.singlePrices +
      parts.bulkSizes.reduce((sum, size) => sum + size, 0) +
      parts.createdTiers.length +
      parts.createdAccessories.length +
      parts.deletedBookRows * (1 + parts.pricesOnDeletedRows);
    return { changes: shuffled(changes, parts.order), expected };
  });

function shuffled<Item>(
  items: readonly Item[],
  keys: readonly number[],
): readonly Item[] {
  return items
    .map((item, at) => ({ item, key: keys[at] ?? 0 }))
    .sort((left, right) => left.key - right.key)
    .map(({ item }) => item);
}

describe("the count of waiting prices over drafts of every mix", () => {
  it("is what the person did, wherever the draft stores each part", () => {
    fc.assert(
      fc.property(scenario, ({ changes, expected }) => {
        expect(countPendingPrices(changes)).toBe(expected);
      }),
      { numRuns: 400 },
    );
  });

  it("is the number the dashboard's screens draw, whatever the draft holds", () => {
    fc.assert(
      fc.property(scenario, ({ changes }) => {
        expect(pendingPriceCountOf({ draftRevision: "1", changes })).toBe(
          countPendingPrices(changes),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("never exceeds what the draft stores, and never loses a created row", () => {
    fc.assert(
      fc.property(scenario, ({ changes }) => {
        const created = changes.filter(
          ({ address }) =>
            address.kind === "hardware-tier-created" ||
            address.kind === "accessory-created",
        ).length;

        const count = countPendingPrices(changes);

        expect(count).toBeLessThanOrEqual(changes.length);
        expect(count).toBeGreaterThanOrEqual(created);
      }),
      { numRuns: 200 },
    );
  });

  it("gains one for a price on another row and nothing for a part of a row it already counts", () => {
    fc.assert(
      fc.property(scenario, ({ changes }) => {
        const before = countPendingPrices(changes);

        const withOther = countPendingPrices([
          ...changes,
          cabinetPrice("cabinet.not-in-the-draft"),
        ]);
        const createdTier = changes.find(
          ({ address }) => address.kind === "hardware-tier-created",
        );
        const tierId =
          createdTier?.address.kind === "hardware-tier-created"
            ? createdTier.address.tierId
            : undefined;
        const withPartOfCreated =
          tierId === undefined
            ? before
            : countPendingPrices([
                ...changes,
                hardwareRate(tierId, "perHardwareExtraMinor"),
              ]);

        expect(withOther).toBe(before + 1);
        expect(withPartOfCreated).toBe(before);
      }),
      { numRuns: 200 },
    );
  });

  it("keeps a created accessory and a created class of the same id apart, since they are two things", () => {
    const sameId = "shared-id";
    const changes = [
      change({ kind: "accessory-created", accessoryId: sameId }, {}),
      change({ kind: "hardware-tier-created", tierId: sameId }, {}),
      hardwareRate(sameId, "perHingeMinor"),
      accessoryPrice(sameId),
    ];

    expect(countPendingPrices(changes)).toBe(2);
  });
});
