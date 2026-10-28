// M10 P4b, adversarial: `removedAccessoriesSince` against the price itself. What a customer is told was removed is
// exactly what their price carried and `current` has switched off since `seen`, for any kitchen, any list of linked
// accessories (including several on one row, and a free one) and any two switch-off sets.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import { removedAccessoriesSince } from "../../src/pricing/earned-accessories.js";
import {
  accessory,
  availabilityOf,
  CATALOG,
  hardware,
  material,
  priceUnder,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  bookWithLinked,
  linkedRule,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

const ACCESSORY_NAMES = [
  "sinkProtectiveCover",
  "dishDryingRack",
  "linked-0",
  "linked-1",
  "linked-2",
  "linked-3",
  "never-in-the-book",
];

const aList = fc
  .array(
    fc.record({
      row: fc.constantFrom("base-3drawer", "base-sink", ...SUPPLIED_ROW_IDS),
      perUnitMinor: fc.constantFrom(0, 400, 25_000),
    }),
    { maxLength: 4 },
  )
  .map((entries) =>
    entries.map(({ row, perUnitMinor }, index) =>
      linkedRule(`linked-${String(index)}`, {
        linkedBuildId: row,
        perUnitMinor,
      }),
    ),
  );

const aSwitchOffSet = fc.subarray(ACCESSORY_NAMES);

describe("removedAccessoriesSince is what the price carried and availability took away", () => {
  it("names exactly the accessory lines of the price that current switches off and seen did not, in the one order", () => {
    fc.assert(
      fc.property(
        fc.subarray([...KITCHEN_L_DESIGN.placements]),
        aList,
        aSwitchOffSet,
        aSwitchOffSet,
        (placements, rules, seenOff, currentOff) => {
          const design = { ...KITCHEN_L_DESIGN, placements };
          const book = bookWithLinked(rules);
          const priced = priceUnder(NOTHING_DISABLED, design, book);
          if (!priced.ok) throw new Error(priced.failure.code);
          const carried = priced.priced.lines.flatMap((line) =>
            line.kind === "accessory" ? [line.accessoryId] : [],
          );

          const removed = removedAccessoriesSince({
            design,
            catalog: CATALOG,
            book,
            seen: availabilityOf(seenOff.map(accessory), "s"),
            current: availabilityOf(currentOff.map(accessory), "c"),
          });

          const expected = carried
            .filter((id) => currentOff.includes(id) && !seenOff.includes(id))
            .sort();
          expect(
            removed.map((item) =>
              item.kind === "accessory" ? item.accessoryId : item.kind,
            ),
          ).toEqual(expected);
          for (const item of removed) {
            expect(item.kind).toBe("accessory");
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it("names nothing for items of other kinds that spell an accessory's id", () => {
    const book = bookWithLinked([
      linkedRule("linked-0", { linkedBuildId: "base-3drawer" }),
    ]);
    const lookalikes: readonly ItemRef[] = [
      material("linked-0"),
      hardware("linked-0"),
      { kind: "finish", finishId: "linked-0" },
    ];

    expect(
      removedAccessoriesSince({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        book,
        seen: availabilityOf([], "s"),
        current: availabilityOf(lookalikes, "c"),
      }),
    ).toEqual([]);
  });

  it("is the same list however the book orders its linked accessories", () => {
    const rules = [0, 1, 2].map((index) =>
      linkedRule(`linked-${String(index)}`, { linkedBuildId: "base-3drawer" }),
    );
    const current = availabilityOf(
      rules.map((rule) => accessory(rule.accessoryId)),
      "c",
    );
    const namedFor = (ordered: typeof rules) =>
      removedAccessoriesSince({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        book: bookWithLinked(ordered),
        seen: availabilityOf([], "s"),
        current,
      });

    expect(namedFor([...rules].reverse())).toEqual(namedFor(rules));
  });
});
