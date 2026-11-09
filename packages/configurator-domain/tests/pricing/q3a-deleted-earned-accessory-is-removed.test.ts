// A linked accessory the kitchen earned under the book the customer saw, and the active book no longer states, is a
// removed accessory (see ADR 0178 decision 1).
import { describe, expect, it } from "vitest";

import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import { removedAccessoriesSince } from "../../src/pricing/earned-accessories.js";
import {
  accessory,
  availabilityOf,
  CATALOG,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  bookWithLinked,
  linkedRule,
  suppliedRowNotPlacedIn,
} from "../support/linked-accessory-books.js";

const EARNED = linkedRule("on-drawers", { linkedBuildId: "base-3drawer" });
const NOT_EARNED = linkedRule("on-a-row-not-placed", {
  linkedBuildId: suppliedRowNotPlacedIn(KITCHEN_L_DESIGN),
});
const SEEN_BOOK = bookWithLinked([EARNED, NOT_EARNED]);
const ACTIVE_BOOK_WITHOUT_BOTH = bookWithLinked([]);

function removedAfterDeletion(
  seen: readonly ItemRef[],
  current: readonly ItemRef[] = [],
) {
  return removedAccessoriesSince({
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    seenBook: SEEN_BOOK,
    activeBook: ACTIVE_BOOK_WITHOUT_BOTH,
    seen: availabilityOf(seen, "seen"),
    current: availabilityOf(current, "current"),
  });
}

describe("removedAccessoriesSince names an earned linked accessory the active book deleted", () => {
  it("names it though nothing switched it off", () => {
    expect(removedAfterDeletion([])).toEqual([accessory(EARNED.accessoryId)]);
  });

  it("names it whatever current says about it", () => {
    expect(removedAfterDeletion([], [accessory(EARNED.accessoryId)])).toEqual([
      accessory(EARNED.accessoryId),
    ]);
  });

  it("does not name one the customer already saw removed", () => {
    expect(removedAfterDeletion([accessory(EARNED.accessoryId)])).toEqual([]);
  });

  it("does not name a deleted accessory the kitchen never earned", () => {
    expect(removedAfterDeletion([])).not.toContainEqual(
      accessory(NOT_EARNED.accessoryId),
    );
  });

  it("does not name one the seen book never stated, deleted or not", () => {
    expect(
      removedAccessoriesSince({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        seenBook: bookWithLinked([]),
        activeBook: bookWithLinked([]),
        seen: NOTHING_DISABLED,
        current: NOTHING_DISABLED,
      }),
    ).toEqual([]);
  });

  it("still names nothing for a linked accessory the active book states and nothing switched off", () => {
    expect(
      removedAccessoriesSince({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        seenBook: SEEN_BOOK,
        activeBook: SEEN_BOOK,
        seen: NOTHING_DISABLED,
        current: NOTHING_DISABLED,
      }),
    ).toEqual([]);
  });
});
