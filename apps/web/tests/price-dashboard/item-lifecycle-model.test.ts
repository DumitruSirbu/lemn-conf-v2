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
