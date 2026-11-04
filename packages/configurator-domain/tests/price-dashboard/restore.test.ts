// The change-set laws. `archived` and `active` are made by writing JSON by path (`setSlots`), never
// through `applyChanges`, and the property compares the whole book, so a field the module skipped fails the equality.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  revertChange,
} from "../../src/price-dashboard/apply-changes.js";
import type { DraftChange } from "../../src/price-dashboard/book-field-address.js";
import { isSameAddress } from "../../src/price-dashboard/address-key.js";
import { restoreChanges } from "../../src/price-dashboard/restore.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";

import {
  changeOf,
  editSlotsOf,
  FIXTURE_BOOKS,
  PRE_CUTOVER_BOOK,
  otherValueAt,
  PERCENTAGE_BOOK,
  setSlots,
  valueAt,
  valueForSeed,
  type EditSlot,
  type SlotEdit,
} from "./change-set-books.js";

/** The arms of editable field each form states. */
const ARMS_BY_FORM = {
  percentage: [
    "accessory",
    "cabinet-size",
    "cabinet.anchored-width",
    "cabinet.anchored-width-and-door-leaves",
    "cabinet.anchored-width-and-height",
    "cabinet.anchored-width-height-and-door-leaves",
    "depth-rule",
    "hardware",
    "material",
    "provisional",
  ],
} as const;

const NUMBER_OF_RUNS = 300;
const MOST_EDITS = 14;

function editsArbitrary(slots: readonly EditSlot[]) {
  return fc
    .array(
      fc.tuple(
        fc.integer({ min: 0, max: slots.length - 1 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
      ),
      { maxLength: MOST_EDITS },
    )
    .map((picks) =>
      picks.flatMap(([at, seed]): SlotEdit[] => {
        const slot = slots[at];
        return slot === undefined
          ? []
          : [{ slot, value: valueForSeed(slot, seed) }];
      }),
    );
}

function appliedOrFail(
  book: PriceBook,
  changes: readonly DraftChange[],
): PriceBook {
  const result = applyChanges(book, changes);
  if (!result.ok) throw new Error(`the changes were refused: ${result.reason}`);
  return result.book;
}

describe.each(FIXTURE_BOOKS)(
  "the change-set laws in the $form form",
  ({ form, book }) => {
    const slots = editSlotsOf(book);

    it("draws its edits from every arm the form has", () => {
      const arms = new Set(slots.map((slot) => slot.arm));

      expect([...arms].sort()).toEqual([...ARMS_BY_FORM[form]].sort());
    });

    it.each(slots)(
      "restores a difference in $arm $path to exactly that one change, which applies to the archived book",
      (slot) => {
        const value = otherValueAt(book, slot);
        const archived = setSlots(book, [{ slot, value }]);

        const changes = restoreChanges(archived, book);

        expect(changes).toEqual([{ address: slot.address, value }]);
        expect(appliedOrFail(book, changes)).toEqual(archived);
      },
    );

    it("applying no changes gives the active book, for any active book", () => {
      fc.assert(
        fc.property(editsArbitrary(slots), (activeEdits) => {
          const active = setSlots(book, activeEdits);

          expect(appliedOrFail(active, [])).toEqual(active);
        }),
        { numRuns: NUMBER_OF_RUNS },
      );
    });

    it("applying the changes that restore an archived book gives that book, on every field", () => {
      fc.assert(
        fc.property(
          editsArbitrary(slots),
          editsArbitrary(slots),
          (archivedEdits, activeEdits) => {
            const archived = setSlots(book, archivedEdits);
            const active = setSlots(book, activeEdits);

            const restored = appliedOrFail(
              active,
              restoreChanges(archived, active),
            );

            expect(restored).toEqual(archived);
          },
        ),
        { numRuns: NUMBER_OF_RUNS },
      );
    });

    it("restores exactly the fields that differ: one change per differing field and none for the rest", () => {
      fc.assert(
        fc.property(
          editsArbitrary(slots),
          editsArbitrary(slots),
          (archivedEdits, activeEdits) => {
            const archived = setSlots(book, archivedEdits);
            const active = setSlots(book, activeEdits);

            const changes = restoreChanges(archived, active);

            const differingSlots = slots.filter(
              (slot) => valueAt(archived, slot) !== valueAt(active, slot),
            );
            expect(changes.map(({ address }) => address)).toEqual(
              differingSlots.map(({ address }) => address),
            );
            expect(restoreChanges(archived, archived)).toEqual([]);
          },
        ),
        { numRuns: NUMBER_OF_RUNS },
      );
    });

    it("reverting the only change gives the active book back, and reverting one of two keeps the other", () => {
      fc.assert(
        fc.property(
          editsArbitrary(slots),
          editsArbitrary(slots),
          (activeEdits, draftEdits) => {
            const active = setSlots(book, activeEdits);
            const drafted = draftEdits.map((edit) => changeOf(edit));
            const first = drafted[0];
            fc.pre(first !== undefined);
            const second = drafted.find(
              (change) => !isSameAddress(change.address, first.address),
            );

            const alone = revertChange([first], first.address);
            const remaining = revertChange(
              second === undefined ? [first] : [first, second],
              first.address,
            );

            expect(appliedOrFail(active, alone)).toEqual(active);
            expect(remaining).toEqual(second === undefined ? [] : [second]);
            expect(appliedOrFail(active, remaining)).toEqual(
              appliedOrFail(active, second === undefined ? [] : [second]),
            );
          },
        ),
        { numRuns: NUMBER_OF_RUNS },
      );
    });
  },
);

describe("restoring an archived version", () => {
  it("gives no changes when the books are equal", () => {
    for (const { book } of FIXTURE_BOOKS) {
      expect(restoreChanges(book, book)).toEqual([]);
    }
  });

  it("gives exactly the one change when one field differs, set to the archived value", () => {
    const slot = editSlotsOf(PERCENTAGE_BOOK).find(
      ({ address }) => address.kind === "depth-rule",
    );
    if (slot === undefined) throw new Error("no depth rule slot");
    const archived = setSlots(PERCENTAGE_BOOK, [{ slot, value: 18 }]);

    const changes = restoreChanges(archived, PERCENTAGE_BOOK);

    expect(changes).toEqual([{ address: { kind: "depth-rule" }, value: 18 }]);
  });

  it("carries no group id, so a restored field is a single edit", () => {
    const slot = editSlotsOf(PERCENTAGE_BOOK)[0];
    if (slot === undefined) throw new Error("no slot");
    const archived = setSlots(PERCENTAGE_BOOK, [{ slot, value: 1 }]);

    const [change] = restoreChanges(archived, PERCENTAGE_BOOK);

    expect(change).not.toHaveProperty("groupId");
  });

  it("restores the fields both books state and leaves out those only one states", () => {
    const hardwareSlot = editSlotsOf(PERCENTAGE_BOOK).find(
      ({ address }) => address.kind === "hardware",
    );
    if (hardwareSlot === undefined) throw new Error("no hardware slot");
    const archived = setSlots(PERCENTAGE_BOOK, [
      { slot: hardwareSlot, value: 1 },
    ]);

    const changes = restoreChanges(archived, PRE_CUTOVER_BOOK);

    const kinds = new Set(changes.map(({ address }) => address.kind));
    expect([...kinds].sort()).toEqual(["hardware"]);
    // The result cannot be applied: the book it would edit no longer parses, and that is the limit M1 recorded.
    expect(applyChanges(PRE_CUTOVER_BOOK, changes).ok).toBe(false);
  });

  it("emits 0 for a stored negative zero, which the parser accepts and applyChanges would refuse", () => {
    const hardwareSlot = editSlotsOf(PERCENTAGE_BOOK).find(
      ({ address }) =>
        address.kind === "hardware" && address.field === "perHingeMinor",
    );
    if (hardwareSlot === undefined) throw new Error("no hinge slot");
    const archived = setSlots(PERCENTAGE_BOOK, [
      { slot: hardwareSlot, value: -0 },
    ]);
    const active = setSlots(PERCENTAGE_BOOK, [
      { slot: hardwareSlot, value: 5 },
    ]);
    expect(parsePriceBook(archived).ok).toBe(true);

    const [change] = restoreChanges(archived, active);

    expect(Object.is(change?.value, 0)).toBe(true);
    expect(applyChanges(active, restoreChanges(archived, active)).ok).toBe(
      true,
    );
  });
});
