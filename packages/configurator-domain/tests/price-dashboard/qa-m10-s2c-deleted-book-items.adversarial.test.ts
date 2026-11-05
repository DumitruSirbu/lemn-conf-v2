import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { DraftChange } from "../../src/price-dashboard/book-field-address.js";
import {
  createdItemsOf,
  deletedBookItemsOf,
  deletedItemsOf,
} from "../../src/price-dashboard/draft-structure.js";
import { isSameItem } from "../../src/pricing/catalogue-availability.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";

import {
  accessoryItem,
  change,
  createAccessory,
  createTier,
  deleteItem,
  hardwareItem,
  materialItem,
  setRate,
} from "./qa-m4-support.js";

// The items a publish owes the usage guard, swept over drafts that create, delete and re-delete a few rows in every order,
// against a reading of the rule written here: a deletion is owed unless a creation of the same item stands before it, and
// an item is owed once, where its first owed deletion stands.

const POOL = ["a", "b", "c"] as const;

type Step =
  | { readonly kind: "create-tier" | "create-accessory"; readonly id: string }
  | { readonly kind: "delete"; readonly item: ItemRef }
  | { readonly kind: "other" };

const ITEMS: readonly ItemRef[] = POOL.flatMap((id) => [
  hardwareItem(id),
  materialItem(id),
  accessoryItem(id),
]);

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  fc.record({
    kind: fc.constantFrom("create-tier" as const, "create-accessory" as const),
    id: fc.constantFrom(...POOL),
  }),
  fc.record({
    kind: fc.constant("delete" as const),
    item: fc.constantFrom(...ITEMS),
  }),
  fc.constant({ kind: "other" as const }),
);

const draftArbitrary = fc.array(stepArbitrary, { maxLength: 14 });

function changeOf(step: Step): DraftChange {
  switch (step.kind) {
    case "create-tier":
      return createTier(step.id);
    case "create-accessory":
      return createAccessory(step.id);
    case "delete":
      return deleteItem(step.item);
    case "other":
      return setRate("hardware.soft-close", "perHingeMinor", 5);
  }
}

function createdItemOf(step: Step): ItemRef | undefined {
  if (step.kind === "create-tier") return hardwareItem(step.id);
  if (step.kind === "create-accessory") return accessoryItem(step.id);
  return undefined;
}

function theRuleRead(steps: readonly Step[]): readonly ItemRef[] {
  const owed: ItemRef[] = [];
  steps.forEach((step, index) => {
    if (step.kind !== "delete") return;
    const isCreatedBefore = steps.slice(0, index).some((earlier) => {
      const created = createdItemOf(earlier);
      return created !== undefined && isSameItem(created, step.item);
    });
    const isOwedAlready = owed.some((item) => isSameItem(item, step.item));
    if (!isCreatedBefore && !isOwedAlready) owed.push(step.item);
  });
  return owed;
}

describe("the items a draft deletes that its book held, over every order of creations and deletions", () => {
  it("is what the rule says, in the order the deletions stand", () => {
    fc.assert(
      fc.property(draftArbitrary, (steps) => {
        expect(deletedBookItemsOf(steps.map(changeOf))).toEqual(
          theRuleRead(steps),
        );
      }),
      { numRuns: 2_000 },
    );
  });

  it("names each item once, and only items the draft deletes", () => {
    fc.assert(
      fc.property(draftArbitrary, (steps) => {
        const changes = steps.map(changeOf);
        const owed = deletedBookItemsOf(changes);

        owed.forEach((item, position) => {
          expect(owed.findIndex((other) => isSameItem(other, item))).toBe(
            position,
          );
          expect(
            deletedItemsOf(changes).some((deleted) =>
              isSameItem(deleted, item),
            ),
          ).toBe(true);
        });
      }),
      { numRuns: 1_000 },
    );
  });

  it("owes nothing for an item the draft creates and leaves standing, and everything it deletes without creating", () => {
    fc.assert(
      fc.property(draftArbitrary, (steps) => {
        const changes = steps.map(changeOf);
        const owed = deletedBookItemsOf(changes);

        for (const standing of createdItemsOf(changes)) {
          const firstDeletion = steps.findIndex(
            (step) => step.kind === "delete" && isSameItem(step.item, standing),
          );
          const firstCreation = steps.findIndex((step) => {
            const created = createdItemOf(step);
            return created !== undefined && isSameItem(created, standing);
          });
          const isDeletedBeforeItsCreation =
            firstDeletion !== -1 && firstDeletion < firstCreation;
          expect(owed.some((item) => isSameItem(item, standing))).toBe(
            isDeletedBeforeItsCreation,
          );
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("does not change when the draft is read twice or its other changes are taken out", () => {
    fc.assert(
      fc.property(draftArbitrary, (steps) => {
        const changes = steps.map(changeOf);
        const withoutOthers = steps
          .filter((step) => step.kind !== "other")
          .map(changeOf);

        expect(deletedBookItemsOf(changes)).toEqual(
          deletedBookItemsOf(changes),
        );
        expect(deletedBookItemsOf(withoutOthers)).toEqual(
          deletedBookItemsOf(changes),
        );
      }),
      { numRuns: 500 },
    );
  });

  it("owes the same items when the whole draft is written twice", () => {
    fc.assert(
      fc.property(draftArbitrary, (steps) => {
        const once = deletedBookItemsOf(steps.map(changeOf));
        const twice = deletedBookItemsOf([...steps, ...steps].map(changeOf));

        expect(twice).toEqual(once);
      }),
      { numRuns: 500 },
    );
  });
});

describe("a stored draft that holds things that are not changes", () => {
  it.each([
    ["null", null],
    ["a number", 5],
    ["a text", "item-deleted"],
    ["an empty object", {}],
    ["an address that is a text", { address: "item-deleted", value: true }],
    ["a deletion of a number", change({ kind: "item-deleted", item: 5 }, true)],
    ["a deletion with no item", change({ kind: "item-deleted" }, true)],
    [
      "a deletion of an item of no kind",
      change({ kind: "item-deleted", item: { tierId: "t" } }, true),
    ],
  ])("owes nothing for %s, and does not throw", (_what, stored) => {
    expect(deletedBookItemsOf([stored as DraftChange])).toEqual([]);
  });

  it("still owes the deletion that stands among them", () => {
    const stored = [null, deleteItem(materialItem("m")), 5] as DraftChange[];

    expect(deletedBookItemsOf(stored)).toEqual([materialItem("m")]);
  });
});
