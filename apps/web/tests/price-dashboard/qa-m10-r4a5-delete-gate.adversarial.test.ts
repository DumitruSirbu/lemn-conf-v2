// Adversarial QA of the delete gate: with no leave to delete a row the book states, a deletion is offered for a row the
// draft created and for no other, whatever the saved defaults say, and never where nothing can be written.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  isItemStated,
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

const defaultsArb: fc.Arbitrary<NewKitchenSettings | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant({}),
  fc.constant({ materialTierId: "material.veneer" }),
  fc.constant({ hardwareTierId: "hardware.premium" }),
);

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
    canDeleteStatedItems: false,
    isCreatedInDraft: (item) =>
      createdInDraft.some(
        (held) => JSON.stringify(held) === JSON.stringify(item),
      ),
  };
}

describe("a deletion, where no row the book states may be deleted", () => {
  it("is offered only for a row the draft created that the book does not state, whatever the defaults make readable", () => {
    fc.assert(
      fc.property(defaultsArb, (defaults) => {
        const context = contextOf(CREATED_HERE, defaults, true);

        for (const item of EVERY_ITEM) {
          const stand = deleteStandOf(item, context);
          const isOffered = stand.kind === "count-first";
          const isCreated = CREATED_HERE.includes(item);
          expect(isOffered, JSON.stringify(item)).toBe(isCreated);
          if (isItemStated(item, SAMPLE_PRICE_BOOK)) {
            expect(isOffered, `stated ${JSON.stringify(item)}`).toBe(false);
          }
        }
      }),
    );
  });

  it("is never offered for a row the book does not state and the draft did not create, whatever else the draft created", () => {
    fc.assert(
      fc.property(
        defaultsArb,
        fc.subarray([...CREATED_HERE], { minLength: 0 }),
        (defaults, created) => {
          const context = contextOf(created, defaults, true);

          for (const item of NOT_IN_THE_BOOK) {
            expect(
              deleteStandOf(item, context).kind,
              JSON.stringify(item),
            ).toBe("off");
          }
        },
      ),
    );
  });

  it("is never offered where nothing can be written, not even for a row the draft created", () => {
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
    const context = contextOf([], {}, true);

    expect(
      deleteStandOf(
        { kind: "hardware", tierId: "hardware.soft-close" },
        context,
      ),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
  });
});
