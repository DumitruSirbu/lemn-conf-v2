// Adversarial QA of the delete gate: a client that can write offers a deletion for every row the book states, bar what
// the book or the defaults refuse, and for a row the draft created; a client that cannot write offers none. The server,
// not the gate, judges a deletion that is sent.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DeletableItemRef,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import {
  deleteStandOf,
  type LifecycleContext,
} from "@/price-dashboard/item-lifecycle-model";

const STATED: readonly DeletableItemRef[] = [
  ...SAMPLE_PRICE_BOOK.hardware.tiers.map(
    ({ tierId }): DeletableItemRef => ({ kind: "hardware", tierId }),
  ),
  ...SAMPLE_PRICE_BOOK.material.tiers.map(
    ({ tierId }): DeletableItemRef => ({ kind: "material", tierId }),
  ),
  { kind: "accessory", accessoryId: "dishDryingRack" },
  { kind: "accessory", accessoryId: "sinkProtectiveCover" },
];
const CREATED_HERE: readonly DeletableItemRef[] = [
  { kind: "hardware", tierId: "hardware.created-1" },
  { kind: "material", tierId: "material.created-1" },
  { kind: "accessory", accessoryId: "created-1" },
];
const NOT_IN_THE_BOOK: readonly DeletableItemRef[] = [
  { kind: "hardware", tierId: "hardware.gone" },
  { kind: "material", tierId: "material.gone" },
  { kind: "accessory", accessoryId: "gone" },
];
const EVERY_ITEM = [...STATED, ...CREATED_HERE, ...NOT_IN_THE_BOOK];

const REFUSED_WHATEVER_THE_DEFAULTS: readonly DeletableItemRef[] = [
  { kind: "hardware", tierId: "hardware.standard" },
  { kind: "material", tierId: "material.melamine" },
  { kind: "accessory", accessoryId: "dishDryingRack" },
  { kind: "accessory", accessoryId: "sinkProtectiveCover" },
];

const READABLE_DEFAULTS: readonly NewKitchenSettings[] = [
  {},
  { materialTierId: "material.veneer" },
  { hardwareTierId: "hardware.premium" },
];

const defaultsArb: fc.Arbitrary<NewKitchenSettings | undefined> = fc.oneof(
  fc.constant(undefined),
  ...READABLE_DEFAULTS.map((defaults) => fc.constant(defaults)),
);

const readableDefaultsArb = fc.constantFrom(...READABLE_DEFAULTS);

function isSame(left: DeletableItemRef, right: DeletableItemRef): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRefused(
  item: DeletableItemRef,
  defaults: NewKitchenSettings,
): boolean {
  const savedDefaults: DeletableItemRef[] = [];
  if (defaults.materialTierId !== undefined) {
    savedDefaults.push({ kind: "material", tierId: defaults.materialTierId });
  }
  if (defaults.hardwareTierId !== undefined) {
    savedDefaults.push({ kind: "hardware", tierId: defaults.hardwareTierId });
  }
  return [...REFUSED_WHATEVER_THE_DEFAULTS, ...savedDefaults].some((held) =>
    isSame(held, item),
  );
}

function contextOf(
  createdInDraft: readonly DeletableItemRef[],
  defaults: NewKitchenSettings | undefined,
  canWrite: boolean,
): LifecycleContext {
  return {
    book: SAMPLE_PRICE_BOOK,
    availability: { revision: "1", disabled: [] },
    defaults,
    canWrite,
    isCreatedInDraft: (item) =>
      createdInDraft.some((held) => isSame(held, item)),
  };
}

describe("a deletion, where the client can write", () => {
  it("is offered for every row the book states that neither the book nor the readable defaults refuse, and for none that they refuse", () => {
    fc.assert(
      fc.property(readableDefaultsArb, (defaults) => {
        const context = contextOf([], defaults, true);

        for (const item of STATED) {
          const stand = deleteStandOf(item, context);
          expect(stand.kind === "count-first", JSON.stringify(item)).toBe(
            !isRefused(item, defaults),
          );
        }
      }),
    );
  });

  it("is offered for a row the draft created, whatever the defaults make readable", () => {
    fc.assert(
      fc.property(defaultsArb, (defaults) => {
        const context = contextOf(CREATED_HERE, defaults, true);

        for (const item of CREATED_HERE) {
          expect(deleteStandOf(item, context), JSON.stringify(item)).toEqual({
            kind: "count-first",
          });
        }
      }),
    );
  });

  it("is the same whether or not the draft created the row: that decides nothing where a write can be made", () => {
    fc.assert(
      fc.property(
        defaultsArb,
        fc.subarray([...EVERY_ITEM], { minLength: 0 }),
        (defaults, created) => {
          const withDraft = contextOf(created, defaults, true);
          const withoutDraft = contextOf([], defaults, true);

          for (const item of EVERY_ITEM) {
            expect(
              deleteStandOf(item, withDraft),
              JSON.stringify(item),
            ).toEqual(deleteStandOf(item, withoutDraft));
          }
        },
      ),
    );
  });

  it("is never offered for a row the book states while the saved defaults cannot be read: that stays unjudged", () => {
    const context = contextOf([], undefined, true);

    for (const item of STATED) {
      expect(deleteStandOf(item, context).kind, JSON.stringify(item)).toBe(
        "off",
      );
    }
  });
});

describe("a deletion, where the client cannot write", () => {
  it("is never offered, not even for a row the draft created, whatever the defaults make readable", () => {
    fc.assert(
      fc.property(defaultsArb, (defaults) => {
        const context = contextOf(CREATED_HERE, defaults, false);

        for (const item of EVERY_ITEM) {
          expect(deleteStandOf(item, context), JSON.stringify(item)).toEqual({
            kind: "off",
            reason: expect.any(String) as unknown,
          });
        }
      }),
    );
  });

  it("is off with the reason that it cannot be judged for a stated row that no refusal of the book names", () => {
    const context = contextOf([], {}, false);

    expect(
      deleteStandOf(
        { kind: "hardware", tierId: "hardware.soft-close" },
        context,
      ),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
  });
});
