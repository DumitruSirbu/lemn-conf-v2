// The comparisons every availability consumer shares (M10 P4a): equality, the one order and the no-repeats rule. The
// order is what lets a refusal and a sheet be compared byte for byte, so it must depend on the items alone.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  distinctItemsInOrder,
  isItemDisabled,
  isSameItem,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import {
  accessory,
  availabilityOf,
  colour,
  handle,
  hardware,
  material,
} from "../support/availability-kitchens.js";

const anItem: fc.Arbitrary<ItemRef> = fc.oneof(
  fc.constantFrom("a", "b", "m").map(material),
  fc.constantFrom("a", "b", "h").map(hardware),
  fc.constantFrom("a", "b", "pal.alb").map(colour),
  fc.constantFrom("steel", "black", "push" as const).map(handle),
  fc.constantFrom("a", "b", "rack").map(accessory),
);

describe("two items are the same when they are of one kind and name one thing", () => {
  it("tells apart one id under two kinds", () => {
    expect(isSameItem(material("a"), hardware("a"))).toBe(false);
    expect(isSameItem(accessory("a"), material("a"))).toBe(false);
  });

  it("is reflexive and symmetric over every pair", () => {
    fc.assert(
      fc.property(anItem, anItem, (one, other) => {
        expect(isSameItem(one, one)).toBe(true);
        expect(isSameItem(one, other)).toBe(isSameItem(other, one));
      }),
    );
  });

  it("finds an item in availability by value, not by identity", () => {
    expect(
      isItemDisabled(availabilityOf([handle("black")]), {
        kind: "handle",
        handle: "black",
      }),
    ).toBe(true);
    expect(
      isItemDisabled(availabilityOf([handle("black")]), handle("push")),
    ).toBe(false);
  });
});

describe("distinctItemsInOrder gives one list whatever order its items arrive in", () => {
  it("is the same list for any permutation, with repeats dropped", () => {
    fc.assert(
      fc.property(
        fc.array(anItem, { maxLength: 12 }),
        fc.nat(),
        (items, seed) => {
          const rotated = [
            ...items.slice(seed % (items.length + 1)),
            ...items.slice(0, seed % (items.length + 1)),
          ];

          expect(
            JSON.stringify(distinctItemsInOrder([...items].reverse())),
          ).toBe(JSON.stringify(distinctItemsInOrder(items)));
          expect(JSON.stringify(distinctItemsInOrder(rotated))).toBe(
            JSON.stringify(distinctItemsInOrder(items)),
          );
        },
      ),
    );
  });

  it("holds no item twice and is stable when applied again", () => {
    fc.assert(
      fc.property(fc.array(anItem, { maxLength: 12 }), (items) => {
        const once = distinctItemsInOrder(items);

        expect(distinctItemsInOrder([...once, ...items])).toEqual(once);
        once.forEach((item, position) => {
          expect(once.findIndex((other) => isSameItem(other, item))).toBe(
            position,
          );
        });
        items.forEach((item) => {
          expect(once.some((kept) => isSameItem(kept, item))).toBe(true);
        });
      }),
    );
  });

  it("orders by kind (material, hardware, colour, handle, accessory) and then by id", () => {
    const shuffled = [
      accessory("b"),
      handle("steel"),
      colour("b"),
      colour("a"),
      hardware("z"),
      handle("black"),
      material("m"),
      accessory("a"),
    ];

    expect(distinctItemsInOrder(shuffled)).toEqual([
      material("m"),
      hardware("z"),
      colour("a"),
      colour("b"),
      handle("black"),
      handle("steel"),
      accessory("a"),
      accessory("b"),
    ]);
  });
});
