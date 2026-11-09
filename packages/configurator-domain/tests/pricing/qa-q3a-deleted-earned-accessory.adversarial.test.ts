// M10 Q3a QA: `removedAccessoriesSince` against a hand-written oracle over every combination of the five facts that can
// decide a linked accessory (ADR 0178, Amendment of 2026-11-04, decision 1; plan, Q3 split, ruling 3). The implementer's
// suite pins six examples; this sweeps the product, so a branch it did not think of has nowhere to hide.
//
// The oracle is written from the rule in words, not from the filter in the source: an accessory is reported when the
// kitchen earned it under the seen book, the customer did not see it switched off, and it is gone now, gone meaning the
// active book no longer states it or `current` switches it off.
import { describe, expect, it } from "vitest";

import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import { removedAccessoriesSince } from "../../src/pricing/earned-accessories.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  accessory,
  availabilityOf,
  CATALOG,
} from "../support/availability-kitchens.js";
import {
  bookWithLinked,
  linkedRule,
  suppliedRowNotPlacedIn,
} from "../support/linked-accessory-books.js";

const ACCESSORY_ID = "accessory.shelf";
const PLACED_ROW = "base-3drawer";
const UNPLACED_ROW = suppliedRowNotPlacedIn(KITCHEN_L_DESIGN);
const SHELF = accessory(ACCESSORY_ID);
const RACK = accessory("dishDryingRack");

interface Facts {
  /** The book the customer saw states the accessory. */
  readonly seenStatesIt: boolean;
  /** Under the seen book its row is one the kitchen places. */
  readonly seenRowIsPlaced: boolean;
  /** The active book states the accessory (on a row the kitchen places or not). */
  readonly activeStatesIt: boolean;
  /** Availability when the customer looked switched it off. */
  readonly seenOff: boolean;
  /** Availability now switches it off. */
  readonly currentOff: boolean;
}

const EVERY_COMBINATION: readonly Facts[] = [true, false].flatMap(
  (seenStatesIt) =>
    [true, false].flatMap((seenRowIsPlaced) =>
      [true, false].flatMap((activeStatesIt) =>
        [true, false].flatMap((seenOff) =>
          [true, false].map((currentOff) => ({
            seenStatesIt,
            seenRowIsPlaced,
            activeStatesIt,
            seenOff,
            currentOff,
          })),
        ),
      ),
    ),
);

function bookStating(isStated: boolean, linkedBuildId: string): PriceBook {
  return bookWithLinked(
    isStated ? [linkedRule(ACCESSORY_ID, { linkedBuildId })] : [],
  );
}

function whatIsReported(facts: Facts): readonly ItemRef[] {
  return removedAccessoriesSince({
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    seenBook: bookStating(
      facts.seenStatesIt,
      facts.seenRowIsPlaced ? PLACED_ROW : UNPLACED_ROW,
    ),
    activeBook: bookStating(facts.activeStatesIt, PLACED_ROW),
    seen: availabilityOf(facts.seenOff ? [SHELF] : [], "seen"),
    current: availabilityOf(facts.currentOff ? [SHELF] : [], "current"),
  });
}

function isReportedByTheRuleInWords(facts: Facts): boolean {
  const kitchenEarnedItUnderTheSeenBook =
    facts.seenStatesIt && facts.seenRowIsPlaced;
  const customerSawItSwitchedOff = facts.seenOff;
  const goneNow = !facts.activeStatesIt || facts.currentOff;
  return (
    kitchenEarnedItUnderTheSeenBook && !customerSawItSwitchedOff && goneNow
  );
}

describe("a linked accessory is reported exactly by the rule, over every combination of the five facts", () => {
  it("covers all thirty-two combinations", () => {
    expect(EVERY_COMBINATION).toHaveLength(32);
  });

  it.each(EVERY_COMBINATION)("agrees with the rule for %o", (facts) => {
    expect(whatIsReported(facts)).toEqual(
      isReportedByTheRuleInWords(facts) ? [SHELF] : [],
    );
  });

  it("reports a deleted earned accessory at least once in the sweep, so the sweep is not vacuous", () => {
    expect(
      EVERY_COMBINATION.filter(
        (facts) => !facts.activeStatesIt && isReportedByTheRuleInWords(facts),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("a deleted earned accessory beside the built-ins", () => {
  const seenBook = bookWithLinked([linkedRule(ACCESSORY_ID)]);
  const activeBook = bookWithLinked([]);

  it("is reported once with a built-in the kitchen lost, in the one order of items, whatever order current lists them", () => {
    const orderings = [
      [RACK, SHELF],
      [SHELF, RACK],
    ];

    for (const listed of orderings) {
      expect(
        removedAccessoriesSince({
          design: KITCHEN_L_DESIGN,
          catalog: CATALOG,
          seenBook,
          activeBook,
          seen: availabilityOf([], "seen"),
          current: availabilityOf(listed, "current"),
        }),
      ).toEqual([SHELF, RACK]);
    }
  });

  it("never reports the always-present cover, deleted book or not", () => {
    expect(
      removedAccessoriesSince({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        seenBook,
        activeBook,
        seen: availabilityOf([], "seen"),
        current: availabilityOf([accessory("sinkProtectiveCover")], "current"),
      }),
    ).toEqual([SHELF]);
  });

  it("reports nothing when the seen and active books are the same book and nothing is switched off", () => {
    expect(
      removedAccessoriesSince({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        seenBook,
        activeBook: seenBook,
        seen: availabilityOf([], "seen"),
        current: availabilityOf([], "current"),
      }),
    ).toEqual([]);
  });

  it("reports each of two deleted earned accessories once, ordered by id, whatever order the books state them", () => {
    const second = linkedRule("accessory.drawer-divider");
    const forward = bookWithLinked([linkedRule(ACCESSORY_ID), second]);
    const backward = bookWithLinked([second, linkedRule(ACCESSORY_ID)]);

    for (const seen of [forward, backward]) {
      expect(
        removedAccessoriesSince({
          design: KITCHEN_L_DESIGN,
          catalog: CATALOG,
          seenBook: seen,
          activeBook,
          seen: availabilityOf([], "seen"),
          current: availabilityOf([], "current"),
        }),
      ).toEqual([
        accessory("accessory.drawer-divider"),
        accessory(ACCESSORY_ID),
      ]);
    }
  });
});
