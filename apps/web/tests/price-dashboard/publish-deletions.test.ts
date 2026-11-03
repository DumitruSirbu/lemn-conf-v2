// Whether the deletions a draft holds can be published: judged by the domain from counts the page is given, and `cannot-judge`
// whenever a count is missing, never a count made up or a deletion allowed for want of one.
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

import { change } from "./publish-structural-rows.support";

const BOOK = SAMPLE_PRICE_BOOK;
const DEFAULT_TIER = BOOK.hardware.defaultTierId;
const OTHER_TIER = BOOK.hardware.tiers.find(
  ({ tierId }) => tierId !== DEFAULT_TIER,
)?.tierId;

function deletes(tierId: string | undefined): DraftChange {
  if (tierId === undefined) throw new Error("the sample has one class only");
  return change(
    { kind: "item-deleted", item: { kind: "hardware", tierId } },
    true,
  );
}

function factsWith(usage: ItemUsageCounts): DeletionFacts {
  return { usage, defaults: {} };
}

const judge = (changes: readonly DraftChange[], facts?: DeletionFacts) =>
  judgePendingDeletions({ book: BOOK, changes, facts });

describe("the deletions of a draft", () => {
  it("need no judging when the draft deletes nothing, with or without counts", () => {
    expect(judge([])).toEqual({ kind: "none" });
    expect(judge([], factsWith([]))).toEqual({ kind: "none" });
  });

  it("cannot be judged without counts, and a draft that deletes is then not allowed through", () => {
    expect(judge([deletes(OTHER_TIER)])).toEqual({ kind: "cannot-judge" });
  });

  it("cannot be judged when a deleted row has no count: no count is read as unused", () => {
    expect(judge([deletes(OTHER_TIER)], factsWith([]))).toEqual({
      kind: "cannot-judge",
    });
  });

  it("are blocked by use, naming the rows, when saved kitchens use a deleted row", () => {
    const item = { kind: "hardware", tierId: OTHER_TIER ?? "" } as const;

    expect(
      judge([deletes(OTHER_TIER)], factsWith([{ item, designCount: 3 }])),
    ).toEqual({ kind: "blocked", block: { kind: "in-use", items: [item] } });
  });

  it("are clear when every deleted row is counted unused", () => {
    const item = { kind: "hardware", tierId: OTHER_TIER ?? "" } as const;

    expect(
      judge([deletes(OTHER_TIER)], factsWith([{ item, designCount: 0 }])),
    ).toEqual({ kind: "none" });
  });

  it("are blocked by the default before they are by use, whatever the count of the default", () => {
    const item = { kind: "hardware", tierId: DEFAULT_TIER } as const;
    const other = { kind: "hardware", tierId: OTHER_TIER ?? "" } as const;

    expect(
      judge(
        [deletes(OTHER_TIER), deletes(DEFAULT_TIER)],
        factsWith([
          { item: other, designCount: 5 },
          { item, designCount: 0 },
        ]),
      ),
    ).toEqual({ kind: "blocked", block: { kind: "is-default", item } });
  });
});
