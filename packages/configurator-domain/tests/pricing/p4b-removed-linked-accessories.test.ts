// M10 P4a-d, extended by P4b: `removedAccessoriesSince` names a linked accessory the kitchen earns and availability has
// switched off since the customer last looked, by the same count the price bills (ADR 0177 A-19).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { removedAccessoriesSince } from "../../src/pricing/earned-accessories.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import type { LinkedAccessoryRule } from "../../src/pricing/price-book.js";
import {
  accessory,
  availabilityOf,
  CATALOG,
  priceUnder,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  bookWithLinked,
  linkedRule,
  suppliedRowNotPlacedIn,
} from "../support/linked-accessory-books.js";

const COVER = accessory("sinkProtectiveCover");
const RACK = accessory("dishDryingRack");

const EARNED = linkedRule("on-drawers", { linkedBuildId: "base-3drawer" });
const NOT_EARNED = linkedRule("on-a-row-not-placed", {
  linkedBuildId: suppliedRowNotPlacedIn(KITCHEN_L_DESIGN),
});
const BOOK = bookWithLinked([EARNED, NOT_EARNED]);

function removed(seen: readonly ItemRef[], current: readonly ItemRef[]) {
  return removedAccessoriesSince({
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    book: BOOK,
    seen: availabilityOf(seen, "seen"),
    current: availabilityOf(current, "current"),
  });
}

describe("removedAccessoriesSince takes in linked accessories (P4a-d, P4b)", () => {
  it("names a linked accessory the kitchen earns that is now off and was on", () => {
    expect(removed([], [accessory(EARNED.accessoryId)])).toEqual([
      accessory(EARNED.accessoryId),
    ]);
  });

  it("does not name one linked to a row the kitchen has no placement of", () => {
    expect(removed([], [accessory(NOT_EARNED.accessoryId)])).toEqual([]);
  });

  it("does not name one the customer already saw removed, nor one switched back on", () => {
    const earned = accessory(EARNED.accessoryId);

    expect(removed([earned], [earned])).toEqual([]);
    expect(removed([earned], [])).toEqual([]);
  });

  it("names the built-ins and the linked ones in the one order of items, by id, whatever the order listed", () => {
    const earned = accessory(EARNED.accessoryId);

    expect(removed([], [earned, COVER, RACK])).toEqual([RACK, earned, COVER]);
    expect(removed([], [RACK, earned, COVER])).toEqual([RACK, earned, COVER]);
  });

  it("names nothing for a linked accessory the book does not state, even if availability lists it", () => {
    expect(
      removedAccessoriesSince({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        book: bookWithLinked([]),
        seen: NOTHING_DISABLED,
        current: availabilityOf([accessory(EARNED.accessoryId)]),
      }),
    ).toEqual([]);
  });

  it("agrees with the price over every subset: what it names is exactly the earned lines the price no longer bills", () => {
    const rules: readonly LinkedAccessoryRule[] = [
      EARNED,
      NOT_EARNED,
      linkedRule("on-the-sink", { linkedBuildId: "base-sink" }),
    ];
    const book = bookWithLinked(rules);
    const universe = [
      COVER,
      RACK,
      ...rules.map((rule) => accessory(rule.accessoryId)),
    ];
    const billed = (disabled: readonly ItemRef[]) => {
      const result = priceUnder(
        availabilityOf(disabled),
        KITCHEN_L_DESIGN,
        book,
      );
      if (!result.ok) throw new Error(result.failure.code);
      return result.priced.lines.flatMap((line) =>
        line.kind === "accessory" ? [line.accessoryId] : [],
      );
    };

    fc.assert(
      fc.property(fc.subarray(universe), (disabled) => {
        const noLongerBilled = billed([]).filter(
          (id) => !billed(disabled).includes(id),
        );

        const named = removedAccessoriesSince({
          design: KITCHEN_L_DESIGN,
          catalog: CATALOG,
          book,
          seen: NOTHING_DISABLED,
          current: availabilityOf(disabled),
        }).map((item) => (item.kind === "accessory" ? item.accessoryId : ""));

        expect([...named].sort()).toEqual([...noLongerBilled].sort());
      }),
    );
  });
});
