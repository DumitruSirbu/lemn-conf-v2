// The number of prices a draft holds, which the screens show while it waits and the store keeps with the version it
// becomes.
import { describe, expect, it } from "vitest";

import { countPendingPrices, type DraftChange } from "../../src/index.js";

function change(address: object, value: unknown): DraftChange {
  return { address, value } as DraftChange;
}

const ANCHOR = change(
  { kind: "cabinet", ruleId: "cabinet.base-cabinet", field: "anchorMinor" },
  400_000,
);
const CREATED_CLASS: readonly DraftChange[] = [
  change(
    { kind: "hardware-tier-created", tierId: "created" },
    { name: "N", description: "D" },
  ),
  ...["perHingeMinor", "perDrawerMinor", "perLiftMinor"].map((field) =>
    change({ kind: "hardware", tierId: "created", field }, 1_000),
  ),
];
const deletes = (tierId: string) =>
  change({ kind: "item-deleted", item: { kind: "hardware", tierId } }, true);

describe("the count of prices a draft holds", () => {
  it("is zero for an empty draft and one for each price set", () => {
    expect(countPendingPrices([])).toBe(0);
    expect(
      countPendingPrices([ANCHOR, change({ kind: "depth-rule" }, 18)]),
    ).toBe(2);
  });

  it("counts a bulk action's every price", () => {
    const bulk = [1, 2, 3].map(
      (n) =>
        ({
          address: {
            kind: "cabinet",
            ruleId: `cabinet.r${String(n)}`,
            field: "anchorMinor",
          },
          value: 1_000,
          groupId: "g",
          bulk: { percent: 5, scope: "all" },
        }) as DraftChange,
    );

    expect(countPendingPrices(bulk)).toBe(3);
  });

  it("counts a created class with its rates once, beside the prices around it", () => {
    expect(CREATED_CLASS.length).toBeGreaterThan(1);
    expect(countPendingPrices(CREATED_CLASS)).toBe(1);
    expect(countPendingPrices([ANCHOR, ...CREATED_CLASS])).toBe(2);
  });

  it("counts a row created and deleted again once, and a deleted row of the book once", () => {
    expect(countPendingPrices([...CREATED_CLASS, deletes("created")])).toBe(1);
    expect(countPendingPrices([deletes("hardware.soft-close")])).toBe(1);
  });

  it("counts a price set on a row the draft deletes with the deletion, once, and a price on another row beside it", () => {
    const rate = change(
      {
        kind: "hardware",
        tierId: "hardware.soft-close",
        field: "perHingeMinor",
      },
      2_000,
    );
    const percent = change(
      { kind: "material", tierId: "material.mdf", field: "percentOfCabinets" },
      30,
    );
    const deletesMaterial = change(
      {
        kind: "item-deleted",
        item: { kind: "material", tierId: "material.mdf" },
      },
      true,
    );

    expect(countPendingPrices([rate, deletes("hardware.soft-close")])).toBe(1);
    expect(countPendingPrices([percent, deletesMaterial])).toBe(1);
    expect(
      countPendingPrices([rate, deletes("hardware.soft-close"), ANCHOR]),
    ).toBe(2);
    expect(countPendingPrices([rate, deletes("hardware.other")])).toBe(2);
  });

  it("counts a change whose address is no object as a price of its own, so a summary read from storage never throws", () => {
    expect(
      countPendingPrices([{ value: 1 } as unknown as DraftChange, ANCHOR]),
    ).toBe(2);
  });

  describe("never throws on a summary read from storage, and never counts more prices than it has entries", () => {
    const createdClass = change(
      { kind: "hardware-tier-created", tierId: "created" },
      { name: "N", description: "D" },
    );
    const textOf = (item: unknown) =>
      change({ kind: "created-row-text", item, field: "name" }, "words");
    const deletionOf = (item: unknown) =>
      change({ kind: "item-deleted", item }, true);

    it.each([
      ["null", [null]],
      ["undefined", [undefined]],
      ["a number", [42]],
      ["a string", ["x"]],
      ["an array", [[ANCHOR]]],
      ["a deletion naming no row", [deletionOf(null)]],
      ["a deletion naming a string", [deletionOf("hardware")]],
      [
        "a deletion naming a row of unknown kind",
        [deletionOf({ kind: "bogus" })],
      ],
      ["the text of a created row naming no row", [createdClass, textOf(null)]],
    ])("%s", (_name, entries) => {
      const summary = entries as unknown as readonly DraftChange[];

      const counted = countPendingPrices(summary);

      expect(counted).toBeLessThanOrEqual(summary.length);
    });

    it("counts two deletions of an item with no id as two prices", () => {
      const summary = [
        deletionOf({ kind: "material" }),
        deletionOf({ kind: "material" }),
      ];

      expect(countPendingPrices(summary)).toBe(2);
    });

    it("does not absorb a price set on a tier with no id into the deletion of an item with no id", () => {
      const summary = [
        deletionOf({ kind: "hardware" }),
        change(
          { kind: "hardware", tierId: undefined, field: "perHingeMinor" },
          1_000,
        ),
      ];

      expect(countPendingPrices(summary)).toBe(2);
    });

    it("counts each entry it cannot address as one price of its own, joining no row", () => {
      const summary = [
        null,
        undefined,
        deletionOf(null),
        createdClass,
        textOf(null),
      ] as unknown as readonly DraftChange[];

      expect(countPendingPrices(summary)).toBe(5);
    });
  });
});
