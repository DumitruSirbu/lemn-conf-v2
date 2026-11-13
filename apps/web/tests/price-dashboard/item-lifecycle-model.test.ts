// What a screen offers for an item, as the domain's own verdicts say it: the order of the guards is the domain's, so each case
// names the item's circumstances and the control that follows, and none restates the order.
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  UsageNotCountedError,
  type CatalogueAvailability,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import {
  countedDeletionOf,
  countOfUse,
  deleteStandOf,
  isDefaultItem,
  switchStandOf,
  type LifecycleContext,
} from "@/price-dashboard/item-lifecycle-model";

const STANDARD: ItemRef = { kind: "hardware", tierId: "hardware.standard" };
const HETTICH: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const BLUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const STRANGER: ItemRef = { kind: "hardware", tierId: "hardware.stranger" };
const NOTHING_OFF: CatalogueAvailability = { revision: "1", disabled: [] };

function contextOf(
  overrides: Partial<LifecycleContext> = {},
): LifecycleContext {
  return {
    book: SAMPLE_PRICE_BOOK,
    availability: NOTHING_OFF,
    defaults: {},
    canWrite: true,
    isCreatedInDraft: () => false,
    ...overrides,
  };
}

describe("the switch of an item", () => {
  it("opens the dialog that lists what remains, without the item itself or what is already off, for an item that may go", () => {
    const stand = switchStandOf(
      HETTICH,
      contextOf({ availability: { revision: "1", disabled: [BLUM] } }),
    );

    expect(stand).toEqual({ kind: "disable", remaining: [STANDARD] });
  });

  it("is off, as not judged, where nothing can be written, though the item may go and the defaults are known", () => {
    expect(switchStandOf(HETTICH, contextOf({ canWrite: false }))).toEqual({
      kind: "off",
      reason: "cannot-judge",
    });
  });

  it("still names what the book alone refuses where nothing can be written", () => {
    expect(switchStandOf(STANDARD, contextOf({ canWrite: false }))).toEqual({
      kind: "off",
      reason: "item-is-fixed-default",
    });
  });

  it("is off, named a fixed default, for the book's fallback while another class is on", () => {
    expect(switchStandOf(STANDARD, contextOf())).toEqual({
      kind: "off",
      reason: "item-is-fixed-default",
    });
  });

  it("is off, named a saved default, for a class only the saved defaults name", () => {
    expect(
      switchStandOf(
        HETTICH,
        contextOf({ defaults: { hardwareTierId: HETTICH.tierId } }),
      ),
    ).toEqual({ kind: "off", reason: "item-is-default" });
  });

  it("opens the block, not the off state, for the only class that is on, though it is also the fallback", () => {
    const stand = switchStandOf(
      STANDARD,
      contextOf({ availability: { revision: "1", disabled: [HETTICH, BLUM] } }),
    );

    expect(stand).toEqual({ kind: "last-active-option" });
  });

  it("is off, unjudged, for an item that is on when the saved defaults could not be read", () => {
    expect(switchStandOf(BLUM, contextOf({ defaults: undefined }))).toEqual({
      kind: "off",
      reason: "cannot-judge",
    });
  });

  it("is off, named a fixed default, for the fallback class when the saved defaults could not be read: no saved default changes that", () => {
    expect(switchStandOf(STANDARD, contextOf({ defaults: undefined }))).toEqual(
      { kind: "off", reason: "item-is-fixed-default" },
    );
  });

  it("opens the block for the only class that is on when the saved defaults could not be read: no saved default changes that", () => {
    const stand = switchStandOf(
      BLUM,
      contextOf({
        defaults: undefined,
        availability: { revision: "1", disabled: [STANDARD, HETTICH] },
      }),
    );

    expect(stand).toEqual({ kind: "last-active-option" });
  });

  it("opens the enabling dialog for a switched-off item even where the saved defaults could not be read", () => {
    const stand = switchStandOf(
      BLUM,
      contextOf({
        defaults: undefined,
        availability: { revision: "1", disabled: [BLUM] },
      }),
    );

    expect(stand).toEqual({ kind: "enable" });
  });

  it("is off, as not in the active book, for an item the book does not state, so it cannot be enabled", () => {
    expect(switchStandOf(STRANGER, contextOf())).toEqual({
      kind: "off",
      reason: "item-not-in-active-book",
    });
  });
});

describe("the deletion of an item", () => {
  it("is off, named a fixed default, for the fallback class, before any use is counted", () => {
    expect(
      deleteStandOf({ kind: "hardware", tierId: STANDARD.tierId }, contextOf()),
    ).toEqual({ kind: "off", reason: "item-is-fixed-default" });
  });

  it("is off, named a saved default, for the class the saved defaults name", () => {
    expect(
      deleteStandOf(
        { kind: "hardware", tierId: HETTICH.tierId },
        contextOf({ defaults: { hardwareTierId: HETTICH.tierId } }),
      ),
    ).toEqual({ kind: "off", reason: "item-is-default" });
  });

  it("waits for a count for any other class", () => {
    expect(
      deleteStandOf({ kind: "hardware", tierId: BLUM.tierId }, contextOf()),
    ).toEqual({ kind: "count-first" });
  });

  it("is off, unjudged, where the saved defaults could not be read", () => {
    expect(
      deleteStandOf(
        { kind: "hardware", tierId: BLUM.tierId },
        contextOf({ defaults: undefined }),
      ),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
  });

  it("is off, named a fixed default, for the fallback class when the saved defaults could not be read", () => {
    expect(
      deleteStandOf(
        { kind: "hardware", tierId: STANDARD.tierId },
        contextOf({ defaults: undefined }),
      ),
    ).toEqual({ kind: "off", reason: "item-is-fixed-default" });
  });

  it("waits for a count for a class the active book does not state, where the saved defaults could not be read: none can name it", () => {
    expect(
      deleteStandOf(
        { kind: "hardware", tierId: STRANGER.tierId },
        contextOf({ defaults: undefined }),
      ),
    ).toEqual({ kind: "count-first" });
  });

  it("is forbidden, with the count, when a used class is judged without its saved defaults, and unjudged when none uses it", () => {
    const item = { kind: "hardware", tierId: BLUM.tierId } as const;
    const unreadable = contextOf({ defaults: undefined });

    expect(
      countedDeletionOf(item, unreadable, [{ item, designCount: 3 }]),
    ).toEqual({ kind: "in-use", count: 3 });
    expect(
      countedDeletionOf(item, unreadable, [{ item, designCount: 0 }]),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
  });

  it("is forbidden, with the count, when any saved kitchen uses the class, and allowed when none does", () => {
    const item = { kind: "hardware", tierId: BLUM.tierId } as const;

    expect(
      countedDeletionOf(item, contextOf(), [{ item, designCount: 3 }]),
    ).toEqual({ kind: "in-use", count: 3 });
    expect(
      countedDeletionOf(item, contextOf(), [{ item, designCount: 0 }]),
    ).toEqual({ kind: "allowed" });
  });

  it("is never read as allowed where the reader left the class out", () => {
    const item = { kind: "hardware", tierId: BLUM.tierId } as const;

    expect(() => countedDeletionOf(item, contextOf(), [])).toThrow(
      UsageNotCountedError,
    );
  });
});

describe("the deletion of an item where nothing can be written", () => {
  it.each([
    ["a hardware class", BLUM],
    ["a hardware class only the draft holds", STRANGER],
    ["a material", { kind: "material", tierId: "material.veneer" } as const],
  ])("is off, as not judged, for %s", (_kind, item) => {
    expect(
      deleteStandOf(
        item as Parameters<typeof deleteStandOf>[0],
        contextOf({ canWrite: false }),
      ),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
  });

  it("still names what the book alone refuses before it says nothing can be checked", () => {
    expect(
      deleteStandOf(
        STANDARD as Parameters<typeof deleteStandOf>[0],
        contextOf({ canWrite: false }),
      ),
    ).toEqual({ kind: "off", reason: "item-is-fixed-default" });
  });

  it("is offered, with its count to come, where something can be written", () => {
    expect(
      deleteStandOf(BLUM as Parameters<typeof deleteStandOf>[0], contextOf()),
    ).toEqual({ kind: "count-first" });
  });
});

describe("the deletion of a row the client can write, whatever the book states", () => {
  it.each([
    ["a hardware class", BLUM],
    ["a material", { kind: "material", tierId: "material.veneer" } as const],
  ])(
    "is offered, with its count to come, for %s the book states, with nothing else asked of the client than a write",
    (_kind, item) => {
      const deletable = item as Parameters<typeof deleteStandOf>[0];

      expect(deleteStandOf(deletable, contextOf({ defaults: {} }))).toEqual({
        kind: "count-first",
      });
    },
  );

  it("is offered, with its count to come, for a class the draft created", () => {
    expect(
      deleteStandOf(
        STRANGER as Parameters<typeof deleteStandOf>[0],
        contextOf({ isCreatedInDraft: () => true }),
      ),
    ).toEqual({ kind: "count-first" });
  });

  it("is offered, with its count to come, for a class the book does not state and the draft did not create either: the server judges it", () => {
    expect(
      deleteStandOf(
        STRANGER as Parameters<typeof deleteStandOf>[0],
        contextOf({ isCreatedInDraft: () => false }),
      ),
    ).toEqual({ kind: "count-first" });
  });

  it("is off, as not judged, for a class only the draft holds where nothing can be written", () => {
    expect(
      deleteStandOf(
        STRANGER as Parameters<typeof deleteStandOf>[0],
        contextOf({ canWrite: false, isCreatedInDraft: () => true }),
      ),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
  });

  it("still names what the book alone refuses before anything else, with or without a write", () => {
    for (const canWrite of [true, false]) {
      expect(
        deleteStandOf(
          STANDARD as Parameters<typeof deleteStandOf>[0],
          contextOf({ canWrite }),
        ),
      ).toEqual({ kind: "off", reason: "item-is-fixed-default" });
    }
  });
});

describe("what a count says", () => {
  it("is the reader's number, and undefined, never zero, for an item it did not count or counted twice", () => {
    expect(countOfUse([{ item: BLUM, designCount: 4 }], BLUM)).toBe(4);
    expect(countOfUse([], BLUM)).toBeUndefined();
    expect(
      countOfUse(
        [
          { item: BLUM, designCount: 4 },
          { item: BLUM, designCount: 4 },
        ],
        BLUM,
      ),
    ).toBeUndefined();
  });
});

describe("which items are defaults", () => {
  it("names the fixed one without the saved defaults, and the saved one with them", () => {
    expect(isDefaultItem(STANDARD, contextOf({ defaults: undefined }))).toBe(
      true,
    );
    expect(isDefaultItem(HETTICH, contextOf({ defaults: undefined }))).toBe(
      false,
    );
    expect(
      isDefaultItem(
        HETTICH,
        contextOf({ defaults: { hardwareTierId: HETTICH.tierId } }),
      ),
    ).toBe(true);
  });
});
