// M10 M4-a, M4-e adversarial QA: `judgeDeletionsAtPublish`. Written from A-18 ("an item that gained a user between
// draft and publish refuses the whole publish, naming the item"), the M3 hand-offs (a fixed default and a saved one are
// told apart; built-in accessories are never deleted) and the coordinator's rulings.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { NewKitchenSettings } from "../../src/generation/new-kitchen-settings.js";
import type { DraftChange } from "../../src/price-dashboard/book-field-address.js";
import { createdItemsOf } from "../../src/price-dashboard/draft-structure.js";
import { judgeDeletion } from "../../src/price-dashboard/item-lifecycle.js";
import {
  UsageNotCountedError,
  type ItemUsageCounts,
} from "../../src/price-dashboard/item-usage.js";
import {
  judgeDeletionsAtPublish,
  type PublishDeletionRefusal,
} from "../../src/price-dashboard/publish-deletions.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

import {
  COLOUR_ITEMS,
  deepFrozen,
  elementAt,
  HANDLE_ITEMS,
  BUILT_IN_ACCESSORY_ITEMS,
} from "./qa-m3-support.js";
import {
  accessoryItem,
  createAccessory,
  deleteItem,
  hardwareItem,
  materialItem,
  tierDraft,
} from "./qa-m4-support.js";

const BOOK: PriceBook = bookWithLinked([
  linkedRule("organiser"),
  linkedRule("plinth-light", { linkedBuildId: "base-sink" }),
]);

const FALLBACK_HARDWARE = hardwareItem(BOOK.hardware.defaultTierId);
const FALLBACK_MATERIAL = materialItem(BOOK.material.defaultTierId);

/** Every deletable item the book states that is not a fallback. */
const DELETABLE: readonly ItemRef[] = [
  hardwareItem("hardware.soft-close"),
  hardwareItem("hardware.premium"),
  materialItem("material.painted-mdf"),
  materialItem("material.veneer"),
  accessoryItem("organiser"),
  accessoryItem("plinth-light"),
];

function counted(item: ItemRef, designCount: number) {
  return { item, designCount };
}

function judge(
  deleted: readonly ItemRef[],
  usage: ItemUsageCounts,
  defaults: NewKitchenSettings = {},
  book: PriceBook = BOOK,
): readonly PublishDeletionRefusal[] {
  return judgeDeletionsAtPublish({
    changes: deleted.map((item) => deleteItem(item)),
    usage,
    book,
    defaults,
  });
}

describe("each deletable kind, as its usage arrives", () => {
  it.each(DELETABLE.map((item) => [JSON.stringify(item), item] as const))(
    "%s is allowed unused and refused item-in-use once any kitchen holds it",
    (_label, item) => {
      for (const designCount of [0, 1, 2, 1_000_000]) {
        expect(judge([item], [counted(item, designCount)])).toEqual(
          designCount === 0 ? [] : [{ item, code: "item-in-use" }],
        );
      }
    },
  );

  it.each(DELETABLE.map((item) => [JSON.stringify(item), item] as const))(
    "%s: a count that arrives zero and then one flips the verdict both ways, with nothing remembered between calls",
    (_label, item) => {
      const draft = [item];

      expect(judge(draft, [counted(item, 0)])).toEqual([]);
      expect(judge(draft, [counted(item, 1)])).toHaveLength(1);
      expect(judge(draft, [counted(item, 0)])).toEqual([]);
      expect(judge(draft, [counted(item, 1)])).toHaveLength(1);
    },
  );

  it.each(DELETABLE.map((item) => [JSON.stringify(item), item] as const))(
    "%s: throws UsageNotCountedError, naming it, when no count, a repeated count or a count that is not a number of designs arrives",
    (_label, item) => {
      const unusable: readonly ItemUsageCounts[] = [
        [],
        [counted(item, 0), counted(item, 0)],
        [counted(item, 0), counted(item, 1)],
        [counted(item, Number.NaN)],
        [counted(item, -1)],
        [counted(item, 1.5)],
        [counted(item, Number.POSITIVE_INFINITY)],
      ];

      for (const usage of unusable) {
        const attempt = () => judge([item], usage);
        expect(attempt).toThrow(UsageNotCountedError);
        try {
          attempt();
        } catch (error) {
          expect((error as UsageNotCountedError).item).toEqual(item);
        }
      }
    },
  );

  it("takes a count for another item as no count for this one", () => {
    const item = elementAt(DELETABLE, 0);
    const other = elementAt(DELETABLE, 1);

    expect(() => judge([item], [counted(other, 0)])).toThrow(
      UsageNotCountedError,
    );
  });

  it("ignores counts for items the draft does not delete", () => {
    const item = elementAt(DELETABLE, 0);
    const usage = DELETABLE.slice(1).map((other) => counted(other, 9));

    expect(judge([item], [counted(item, 0), ...usage])).toEqual([]);
  });
});

describe("an item that gained a user between the draft and the publish refuses the whole publish", () => {
  it("names every such item and no other, in draft order", () => {
    const [first, second, third, fourth] = DELETABLE as [
      ItemRef,
      ItemRef,
      ItemRef,
      ItemRef,
    ];

    const refusals = judge(
      [first, second, third, fourth],
      [
        counted(first, 0),
        counted(second, 4),
        counted(third, 0),
        counted(fourth, 1),
      ],
    );

    expect(refusals).toEqual([
      { item: second, code: "item-in-use" },
      { item: fourth, code: "item-in-use" },
    ]);
  });

  it("gives the same refusals whatever the order of the changes beside it", () => {
    const usage = DELETABLE.map((item, index) => counted(item, index % 2));
    const reference = new Set(
      judge(DELETABLE, usage).map(({ item }) => JSON.stringify(item)),
    );

    fc.assert(
      fc.property(
        fc.shuffledSubarray([...DELETABLE], { minLength: 1 }),
        (subset) => {
          const refused = judge(subset, usage);

          expect(
            new Set(refused.map(({ item }) => JSON.stringify(item))),
          ).toEqual(
            new Set(
              subset
                .map((item) => JSON.stringify(item))
                .filter((key) => reference.has(key)),
            ),
          );
          expect(refused.map(({ code }) => code)).toEqual(
            refused.map(() => "item-in-use"),
          );
        },
      ),
      { numRuns: 100, seed: 20261102 },
    );
  });

  it("is not decided by changes that are not deletions", () => {
    const item = elementAt(DELETABLE, 1);
    const noise: readonly DraftChange[] = [
      ...tierDraft("hw.noise"),
      createAccessory("acc.noise"),
    ];

    expect(
      judgeDeletionsAtPublish({
        changes: [...noise, deleteItem(item), ...noise.slice().reverse()],
        usage: [counted(item, 3)],
        book: BOOK,
        defaults: {},
      }),
    ).toEqual([{ item, code: "item-in-use" }]);
  });

  it("refuses once an item that is deleted twice, however its reference is spelled", () => {
    const item = elementAt(DELETABLE, 0);

    const refusals = judgeDeletionsAtPublish({
      changes: [
        deleteItem(item),
        deleteItem({ ...item, ignored: "x" }),
        deleteItem(JSON.parse(JSON.stringify(item))),
      ],
      usage: [counted(item, 2)],
      book: BOOK,
      defaults: {},
    });

    expect(refusals).toEqual([{ item, code: "item-in-use" }]);
  });
});

describe("a default is refused before a use, and a fixed default is told apart from a saved one", () => {
  it.each([
    ["the fallback hardware class", FALLBACK_HARDWARE],
    ["the fallback material", FALLBACK_MATERIAL],
  ])(
    "refuses %s item-is-fixed-default, used or not, counted or not",
    (_label, item) => {
      for (const usage of [[], [counted(item, 0)], [counted(item, 5)]]) {
        expect(judge([item], usage)).toEqual([
          { item, code: "item-is-fixed-default" },
        ]);
      }
    },
  );

  it.each([
    [
      "hardware",
      hardwareItem("hardware.premium"),
      { hardwareTierId: "hardware.premium" },
    ],
    [
      "material",
      materialItem("material.veneer"),
      { materialTierId: "material.veneer" },
    ],
  ] as const)(
    "refuses a %s class the saved defaults name item-is-default, used or not, and releases it when D9 moves",
    (_label, item, defaults) => {
      for (const usage of [[], [counted(item, 0)], [counted(item, 5)]]) {
        expect(judge([item], usage, defaults)).toEqual([
          { item, code: "item-is-default" },
        ]);
      }
      expect(judge([item], [counted(item, 0)], {})).toEqual([]);
    },
  );

  it("keeps naming a fallback fixed when the saved defaults name it too", () => {
    expect(
      judge([FALLBACK_HARDWARE], [], {
        hardwareTierId: BOOK.hardware.defaultTierId,
      }),
    ).toEqual([{ item: FALLBACK_HARDWARE, code: "item-is-fixed-default" }]);
  });

  it("leaves a class the saved defaults do not name to its use alone", () => {
    const named = hardwareItem("hardware.premium");
    const other = hardwareItem("hardware.soft-close");

    expect(
      judge([named, other], [counted(named, 0), counted(other, 2)], {
        hardwareTierId: "hardware.premium",
      }),
    ).toEqual([
      { item: named, code: "item-is-default" },
      { item: other, code: "item-in-use" },
    ]);
  });

  it("agrees, for every deletable item, count and defaults, with the verdict of M3's judgement", () => {
    const defaultsChoices: readonly NewKitchenSettings[] = [
      {},
      { hardwareTierId: "hardware.premium" },
      {
        hardwareTierId: "hardware.soft-close",
        materialTierId: "material.veneer",
      },
      { materialTierId: "material.painted-mdf" },
    ];
    const everyItem = [...DELETABLE, FALLBACK_HARDWARE, FALLBACK_MATERIAL];

    for (const item of everyItem) {
      if (item.kind === "finish" || item.kind === "handle") continue;
      for (const designCount of [0, 1, 3]) {
        for (const defaults of defaultsChoices) {
          const usage = [counted(item, designCount)];
          const verdict = judgeDeletion({ item, usage, book: BOOK, defaults });

          expect(judge([item], usage, defaults)).toEqual(
            verdict.kind === "allowed" ? [] : [{ item, code: verdict.code }],
          );
        }
      }
    }
  });
});

describe("an item that is never deleted", () => {
  const NEVER = [...COLOUR_ITEMS, ...HANDLE_ITEMS, ...BUILT_IN_ACCESSORY_ITEMS];

  it("sweeps a floor of colours, handles and built-in accessories, so the refusal is not vacuous", () => {
    expect(COLOUR_ITEMS.length).toBeGreaterThanOrEqual(8);
    expect(HANDLE_ITEMS).toHaveLength(3);
    expect(BUILT_IN_ACCESSORY_ITEMS).toHaveLength(2);
  });

  it.each(NEVER.map((item) => [JSON.stringify(item), item] as const))(
    "%s is refused item-not-deletable with no count, a zero count, a used count, or a default naming it",
    (_label, item) => {
      const defaults: NewKitchenSettings =
        item.kind === "handle"
          ? { handle: item.handle, topRowHandle: item.handle }
          : {};

      for (const usage of [[], [counted(item, 0)], [counted(item, 7)]]) {
        expect(judge([item], usage, defaults)).toEqual([
          { item, code: "item-not-deletable" },
        ]);
      }
    },
  );

  it("is named once beside the refusals of the deletions that are judged on use", () => {
    const used = elementAt(DELETABLE, 0);
    const handle = elementAt(HANDLE_ITEMS, 0);
    const cover = elementAt(BUILT_IN_ACCESSORY_ITEMS, 0);

    expect(judge([handle, used, cover, handle], [counted(used, 1)])).toEqual([
      { item: handle, code: "item-not-deletable" },
      { item: used, code: "item-in-use" },
      { item: cover, code: "item-not-deletable" },
    ]);
  });
});

describe("an item the active book does not state is never counted", () => {
  it("is neither refused nor owed a count: a row the draft created and deleted has no kitchen", () => {
    const created = hardwareItem("hw.gone");
    const draft = [
      ...tierDraft("hw.gone"),
      createAccessory("acc.gone"),
      deleteItem(accessoryItem("acc.gone")),
      deleteItem(created),
    ];

    expect(createdItemsOf(draft)).toEqual([]);
    expect(
      judgeDeletionsAtPublish({
        changes: draft,
        usage: [],
        book: BOOK,
        defaults: {},
      }),
    ).toEqual([]);
  });

  it("is not refused for a count it was given either: the book states no such row", () => {
    const ghosts = [
      hardwareItem("hw.nope"),
      materialItem("m.nope"),
      accessoryItem("a.nope"),
    ];

    expect(
      judge(
        ghosts,
        ghosts.map((item) => counted(item, 9)),
      ),
    ).toEqual([]);
  });

  it("still owes a count for a row the book states beside it", () => {
    const real = elementAt(DELETABLE, 0);

    expect(() => judge([hardwareItem("hw.nope"), real], [])).toThrow(
      UsageNotCountedError,
    );
  });
});

describe("a draft that is not a list of well-formed changes", () => {
  it("names nothing from a change that is not a deletion, has no address or names no item", () => {
    const hostile = [
      null,
      5,
      "x",
      [],
      {},
      { address: null },
      { address: { kind: "item-deleted" } },
      { address: { kind: "item-deleted", item: null } },
      { address: { kind: "item-deleted", item: { kind: "hardware" } } },
      {
        address: {
          kind: "item-deleted",
          item: { kind: "cabinet", buildId: "x" },
        },
      },
    ] as unknown as readonly DraftChange[];

    expect(() =>
      judgeDeletionsAtPublish({
        changes: hostile,
        usage: [],
        book: BOOK,
        defaults: {},
      }),
    ).not.toThrow();
    expect(
      judgeDeletionsAtPublish({
        changes: hostile,
        usage: [],
        book: BOOK,
        defaults: {},
      }),
    ).toEqual([]);
  });

  it("writes nothing into what it is given and answers the same twice", () => {
    const item = elementAt(DELETABLE, 0);
    const request = deepFrozen({
      changes: [deleteItem(item)],
      usage: [counted(item, 2)],
      book: structuredClone(BOOK),
      defaults: { hardwareTierId: "hardware.premium" } as NewKitchenSettings,
    });

    expect(judgeDeletionsAtPublish(request)).toEqual(
      judgeDeletionsAtPublish(request),
    );
  });

  it("does not count an accessory a book without linked accessories does not state", () => {
    expect(
      judge([accessoryItem("organiser")], [], {}, SAMPLE_PRICE_BOOK),
    ).toEqual([]);
  });
});
