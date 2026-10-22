// What a kitchen action does to the pages already shown (Lot 2 criteria 3 and 4: a hidden or deleted kitchen leaves the
// list, a refused delete or hide changes nothing but the card's kind). Pure: a listing in, a listing out.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { listingAfter } from "@/account/kitchens/listing-change";
import type { Listing } from "@/account/kitchens/use-kitchens";

import { designIdOf, listedKitchen } from "../support/account-kitchens-wire";

function listingOf(
  serials: readonly number[],
  overrides: Partial<Listing> = {},
): Listing {
  return {
    kitchens: serials.map((serial) => listedKitchen(serial)),
    total: serials.length,
    nextCursor: undefined,
    readAtMs: 1_000,
    focusRequest: undefined,
    ...overrides,
  };
}

const idsOf = (listing: Listing): string[] =>
  listing.kitchens.map((kitchen) => kitchen.id);

describe("rename", () => {
  it("changes the name of that kitchen alone", () => {
    const listing = listingOf([1, 2, 3]);
    const after = listingAfter(listing, {
      kind: "rename",
      id: designIdOf(2),
      name: "Casa",
    });
    expect(after.kitchens.map((kitchen) => kitchen.name)).toEqual([
      undefined,
      "Casa",
      undefined,
    ]);
    expect(after.kitchens[1]).toEqual({ ...listing.kitchens[1], name: "Casa" });
    expect(idsOf(after)).toEqual(idsOf(listing));
  });

  it("leaves the total, the cursor and the focus request as they were", () => {
    const listing = listingOf([1, 2], {
      total: 9,
      nextCursor: "next",
      focusRequest: { kitchenId: designIdOf(1) },
    });
    const after = listingAfter(listing, {
      kind: "rename",
      id: designIdOf(1),
      name: "n",
    });
    expect(after.total).toBe(9);
    expect(after.nextCursor).toBe("next");
    expect(after.focusRequest).toBe(listing.focusRequest);
    expect(after.readAtMs).toBe(listing.readAtMs);
  });

  it("changes nothing for a kitchen that is not shown", () => {
    const listing = listingOf([1, 2]);
    const after = listingAfter(listing, {
      kind: "rename",
      id: designIdOf(99),
      name: "Casa",
    });
    expect(after.kitchens).toEqual(listing.kitchens);
  });
});

describe("mark-sent", () => {
  it("corrects the kind of the card both ways and touches nothing else", () => {
    const listing = listingOf([1, 2]);
    const sent = listingAfter(listing, {
      kind: "mark-sent",
      id: designIdOf(1),
      isSent: true,
    });
    expect(sent.kitchens.map((kitchen) => kitchen.isSent)).toEqual([
      true,
      false,
    ]);
    const unsent = listingAfter(sent, {
      kind: "mark-sent",
      id: designIdOf(1),
      isSent: false,
    });
    expect(unsent.kitchens).toEqual(listing.kitchens);
    expect(sent.total).toBe(listing.total);
  });
});

describe("remove", () => {
  it("takes the kitchen off and counts one fewer, keeping the order of the rest", () => {
    const after = listingAfter(listingOf([1, 2, 3, 4], { total: 10 }), {
      kind: "remove",
      id: designIdOf(2),
    });
    expect(idsOf(after)).toEqual([1, 3, 4].map(designIdOf));
    expect(after.total).toBe(9);
  });

  it("returns the very same listing when the kitchen is not shown, and does not touch the total", () => {
    const listing = listingOf([1, 2], { total: 10 });
    const after = listingAfter(listing, {
      kind: "remove",
      id: designIdOf(99),
    });
    expect(after).toBe(listing);
  });

  it("never takes the total below zero", () => {
    const listing = listingOf([1], { total: 0 });
    const after = listingAfter(listing, { kind: "remove", id: designIdOf(1) });
    expect(after.total).toBe(0);
    expect(after.kitchens).toEqual([]);
  });

  it("removes the last kitchen to an empty listing", () => {
    const after = listingAfter(listingOf([1]), {
      kind: "remove",
      id: designIdOf(1),
    });
    expect(after.kitchens).toEqual([]);
    expect(after.total).toBe(0);
  });

  it("removing every shown kitchen in any order empties the list and zeroes a total that counted only them", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([1, 2, 3, 4, 5, 6, 7], { minLength: 7 }),
        (order) => {
          let listing = listingOf([1, 2, 3, 4, 5, 6, 7]);
          for (const serial of order) {
            listing = listingAfter(listing, {
              kind: "remove",
              id: designIdOf(serial),
            });
          }
          expect(listing.kitchens).toEqual([]);
          expect(listing.total).toBe(0);
        },
      ),
    );
  });
});

describe("prepend", () => {
  it("stands the new copy first and counts one more", () => {
    const copy = listedKitchen(50, { name: "Casa (copie)" });
    const after = listingAfter(listingOf([1, 2], { total: 2 }), {
      kind: "prepend",
      kitchen: copy,
    });
    expect(idsOf(after)).toEqual([
      designIdOf(50),
      designIdOf(1),
      designIdOf(2),
    ]);
    expect(after.total).toBe(3);
    expect(after.kitchens[0]).toBe(copy);
  });

  it("works on an empty listing", () => {
    const after = listingAfter(listingOf([]), {
      kind: "prepend",
      kitchen: listedKitchen(1),
    });
    expect(idsOf(after)).toEqual([designIdOf(1)]);
    expect(after.total).toBe(1);
  });
});

describe("no change mutates its input", () => {
  it("leaves the listing it was given exactly as it was", () => {
    const listing = listingOf([1, 2, 3], { total: 3 });
    const snapshot = structuredClone(listing);
    listingAfter(listing, { kind: "rename", id: designIdOf(1), name: "x" });
    listingAfter(listing, {
      kind: "mark-sent",
      id: designIdOf(2),
      isSent: true,
    });
    listingAfter(listing, { kind: "remove", id: designIdOf(3) });
    listingAfter(listing, { kind: "prepend", kitchen: listedKitchen(9) });
    expect(listing).toEqual(snapshot);
  });
});
