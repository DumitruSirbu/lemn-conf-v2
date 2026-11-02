// M10 M4 (4), M4-a, M4-e: a deletion is judged again at publish, against the usage and the defaults read then (A-18).
import { describe, expect, it } from "vitest";

import type { DraftChange } from "../../src/price-dashboard/book-field-address.js";
import { judgeDeletionsAtPublish } from "../../src/price-dashboard/publish-deletions.js";
import { UsageNotCountedError } from "../../src/price-dashboard/item-usage.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const BOOK = bookWithLinked([
  linkedRule("organiser"),
  linkedRule("plinth-light", { linkedBuildId: "base-sink" }),
]);

const SOFT_CLOSE: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const ORGANISER: ItemRef = { kind: "accessory", accessoryId: "organiser" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const MELAMINE: ItemRef = {
  kind: "material",
  tierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
};

function deleting(item: ItemRef): DraftChange {
  return {
    address: { kind: "item-deleted", item },
    value: true,
  } as DraftChange;
}

function unusedBy(...items: readonly ItemRef[]) {
  return items.map((item) => ({ item, designCount: 0 }));
}

function usedBy(item: ItemRef, designCount: number) {
  return { item, designCount };
}

function judge(
  changes: readonly DraftChange[],
  usage: readonly { item: ItemRef; designCount: number }[],
  defaults: Parameters<typeof judgeDeletionsAtPublish>[0]["defaults"] = {},
) {
  return judgeDeletionsAtPublish({ changes, usage, book: BOOK, defaults });
}

describe("a deletion of an item that gained a user", () => {
  it("refuses the publish, naming the item and item-in-use", () => {
    expect(judge([deleting(SOFT_CLOSE)], [usedBy(SOFT_CLOSE, 3)])).toEqual([
      { item: SOFT_CLOSE, code: "item-in-use" },
    ]);
  });

  it("refuses a used item of every deletable kind, and passes the unused ones beside them", () => {
    const changes = [
      deleting(SOFT_CLOSE),
      deleting(VENEER),
      deleting(ORGANISER),
      deleting(PLINTH),
    ];
    const usage = [
      usedBy(SOFT_CLOSE, 1),
      usedBy(VENEER, 1),
      usedBy(ORGANISER, 1),
      usedBy(PLINTH, 0),
    ];

    expect(judge(changes, usage)).toEqual([
      { item: SOFT_CLOSE, code: "item-in-use" },
      { item: VENEER, code: "item-in-use" },
      { item: ORGANISER, code: "item-in-use" },
    ]);
  });

  it("refuses it whatever the order of the other changes", () => {
    const others: readonly DraftChange[] = [
      deleting(PLINTH),
      {
        address: { kind: "provisional" },
        value: false,
      } as DraftChange,
      {
        address: { kind: "depth-rule" },
        value: 20,
      } as DraftChange,
      deleting(VENEER),
    ];
    const usage = [usedBy(SOFT_CLOSE, 2), ...unusedBy(PLINTH, VENEER)];
    const everyPosition = Array.from({ length: others.length + 1 }, (_, at) => [
      ...others.slice(0, at),
      deleting(SOFT_CLOSE),
      ...others.slice(at),
    ]);

    expect(everyPosition).toHaveLength(5);
    for (const changes of everyPosition) {
      expect(judge(changes, usage)).toEqual([
        { item: SOFT_CLOSE, code: "item-in-use" },
      ]);
    }
  });

  it("passes when every deleted item is unused", () => {
    expect(
      judge(
        [deleting(SOFT_CLOSE), deleting(ORGANISER)],
        unusedBy(SOFT_CLOSE, ORGANISER),
      ),
    ).toEqual([]);
    expect(judge([], [])).toEqual([]);
  });
});

describe("a deletion of a default", () => {
  it("refuses the saved default (D9) with item-is-default, even when no kitchen uses it", () => {
    expect(
      judge([deleting(SOFT_CLOSE)], unusedBy(SOFT_CLOSE), {
        hardwareTierId: SOFT_CLOSE.tierId,
      }),
    ).toEqual([{ item: SOFT_CLOSE, code: "item-is-default" }]);
  });

  it("refuses a fallback tier as a fixed default", () => {
    expect(judge([deleting(MELAMINE)], unusedBy(MELAMINE))).toEqual([
      { item: MELAMINE, code: "item-is-fixed-default" },
    ]);
  });

  it("names a default before a use", () => {
    expect(
      judge([deleting(SOFT_CLOSE)], [usedBy(SOFT_CLOSE, 9)], {
        hardwareTierId: SOFT_CLOSE.tierId,
      }),
    ).toEqual([{ item: SOFT_CLOSE, code: "item-is-default" }]);
  });
});

describe("a deletion of an item that is never deleted", () => {
  it.each([
    { kind: "accessory", accessoryId: "sinkProtectiveCover" },
    { kind: "accessory", accessoryId: "dishDryingRack" },
    { kind: "finish", finishId: "white" },
    { kind: "handle", handle: "steel" },
  ] as const)("refuses %j without asking for a count", (item) => {
    expect(judge([deleting(item)], [])).toEqual([
      { item, code: "item-not-deletable" },
    ]);
  });
});

describe("an item the active book does not state", () => {
  it("is not counted: a row the draft created has no kitchen, and a count was never owed", () => {
    const created: ItemRef = { kind: "hardware", tierId: "hardware.created" };

    expect(judge([deleting(created)], [])).toEqual([]);
  });
});

describe("a count that was not read", () => {
  it("is thrown, never read as unused", () => {
    expect(() => judge([deleting(SOFT_CLOSE)], [])).toThrow(
      UsageNotCountedError,
    );
  });
});

describe("the same item named twice", () => {
  it("is refused once", () => {
    expect(
      judge(
        [deleting(SOFT_CLOSE), deleting(SOFT_CLOSE)],
        [usedBy(SOFT_CLOSE, 1)],
      ),
    ).toHaveLength(1);
  });
});
