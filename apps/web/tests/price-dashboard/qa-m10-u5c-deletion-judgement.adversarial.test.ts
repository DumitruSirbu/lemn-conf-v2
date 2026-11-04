// Adversarial QA of the page's judgement of a draft's deletions: a row the draft itself created has no user and nothing to
// count, so deleting it again needs no count and must not stop a publish; a deletion the page cannot judge is never
// allowed through; and a mixed draft is judged by the rows that need it.
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type ItemUsageCounts,
} from "@lemnaria/configurator-domain";

import {
  judgePendingDeletions,
  type DeletionFacts,
} from "@/price-dashboard/publish-deletions";

import {
  change,
  createTierChanges,
  NEW_ACCESSORY,
  NEW_TIER,
} from "./publish-structural-rows.support";

const BOOK = SAMPLE_PRICE_BOOK;
const BOOK_TIER = BOOK.hardware.tiers.find(
  ({ tierId }) => tierId !== BOOK.hardware.defaultTierId,
)?.tierId;

const deletes = (item: object): DraftChange =>
  change({ kind: "item-deleted", item } as DraftChange["address"], true);
const CREATED_THEN_DELETED = [
  ...createTierChanges(),
  deletes({ kind: "hardware", tierId: NEW_TIER }),
];
const NOT_COUNTED: DeletionFacts = { usage: [], defaults: {} };

function usageOf(
  tierId: string | undefined,
  designCount: number,
): DeletionFacts {
  const usage: ItemUsageCounts = [
    { item: { kind: "hardware", tierId: tierId ?? "" }, designCount },
  ];
  return { usage, defaults: {} };
}

const judge = (changes: readonly DraftChange[], facts?: DeletionFacts) =>
  judgePendingDeletions({ book: BOOK, changes, facts });

describe("a class the draft creates and deletes again", () => {
  it("needs no count of the saved kitchens, since none can use a row that was never published", () => {
    expect(judge(CREATED_THEN_DELETED)).toEqual({ kind: "none" });
  });

  it("is clear with counts that hold nothing for it", () => {
    expect(judge(CREATED_THEN_DELETED, NOT_COUNTED)).toEqual({ kind: "none" });
  });

  it("is the same for a created accessory deleted again", () => {
    const changes = [
      change(
        { kind: "accessory-created", accessoryId: NEW_ACCESSORY },
        { linkedBuildId: "x", perUnitMinor: 1, name: "N", description: "D" },
      ),
      deletes({ kind: "accessory", accessoryId: NEW_ACCESSORY }),
    ];

    expect(judge(changes)).toEqual({ kind: "none" });
  });
});

describe("a draft deleting a row of the book beside a row it created and deleted", () => {
  it("is judged by the book's row alone: counted unused is clear, counted used is blocked", () => {
    const changes = [
      ...CREATED_THEN_DELETED,
      deletes({ kind: "hardware", tierId: BOOK_TIER }),
    ];

    expect(judge(changes, usageOf(BOOK_TIER, 0))).toEqual({ kind: "none" });
    expect(judge(changes, usageOf(BOOK_TIER, 2))).toEqual({
      kind: "blocked",
      block: {
        kind: "in-use",
        items: [{ kind: "hardware", tierId: BOOK_TIER }],
      },
    });
  });

  it("cannot be judged without counts, since the book's row needs one", () => {
    const changes = [
      ...CREATED_THEN_DELETED,
      deletes({ kind: "hardware", tierId: BOOK_TIER }),
    ];

    expect(judge(changes)).toEqual({ kind: "cannot-judge" });
  });
});

describe("a deletion that no count can clear", () => {
  it("is never allowed through: a colour, a handle or a built-in accessory is code's and cannot be deleted", () => {
    for (const item of [
      { kind: "finish", finishId: "mdf-white" },
      { kind: "accessory", accessoryId: "dishDryingRack" },
      { kind: "handle", handle: "bar" },
    ]) {
      expect(judge([deletes(item)], NOT_COUNTED).kind).not.toBe("none");
    }
  });
});
