// M10 P4b-a, P4b-b and P4a-d for linked accessories (ADR 0177 A-19): a linked accessory earns one unit for every
// placement priced as its row, bills rounded to ten lei, comes after the built-ins in book order, leaves every other line
// exactly as it was, and is removed, not refused, when availability switches it off.
//
// The kitchens are random subsets of the seeded kitchen's placements, which holds seeded bodies priced through an
// equivalent (`wall-2door-600` as `wall-cabinet`) and corners priced under their own id.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { LinkedAccessoryRule } from "../../src/pricing/price-book.js";
import type {
  AccessoryPriceLine,
  CabinetPriceLine,
  PriceLine,
  PricedDesign,
} from "../../src/pricing/price-lines.js";
import {
  accessory,
  availabilityOf,
  priceUnder,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  bookWithLinked,
  linkedRule,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

const TEN_LEI_MINOR = 1_000;
const BUILT_IN_ACCESSORY_IDS = ["sinkProtectiveCover", "dishDryingRack"];

const aKitchen = fc
  .subarray([...KITCHEN_L_DESIGN.placements])
  .map((placements) => ({ ...KITCHEN_L_DESIGN, placements }));

const aLinkedList = fc
  .uniqueArray(fc.constantFrom(...SUPPLIED_ROW_IDS), { maxLength: 6 })
  .chain((rows) =>
    fc.tuple(
      ...rows.map((row) =>
        fc
          .integer({ min: 0, max: 400_000 })
          .map((perUnitMinor) => ({ row, perUnitMinor })),
      ),
    ),
  )
  .map((rows) =>
    rows.map(({ row, perUnitMinor }, index) =>
      linkedRule(`linked-${String(index)}`, {
        linkedBuildId: row,
        perUnitMinor,
      }),
    ),
  );

function pricedOrThrow(result: ReturnType<typeof priceUnder>): PricedDesign {
  if (!result.ok)
    throw new Error(`refused: ${result.failure.code} ${result.failure.detail}`);
  return result.priced;
}

function accessoryLinesOf(priced: PricedDesign): readonly AccessoryPriceLine[] {
  return priced.lines.filter(
    (line): line is AccessoryPriceLine => line.kind === "accessory",
  );
}

function cabinetLinesOf(priced: PricedDesign): readonly CabinetPriceLine[] {
  return priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function isLinkedLine(
  line: PriceLine,
  rules: readonly LinkedAccessoryRule[],
): boolean {
  return rules.some((rule) => line.lineId === `accessory:${rule.accessoryId}`);
}

/** Half-up to ten lei, written here so the rounding seam is not asked to vouch for itself. */
function roundedToTenLei(amountMinor: number): number {
  return Math.round(amountMinor / TEN_LEI_MINOR) * TEN_LEI_MINOR;
}

describe("a linked accessory's quantity is the count of placements priced as its row (P4b-a)", () => {
  it("equals the cabinet lines whose priced-as row is the linked row, over random kitchens and links", () => {
    fc.assert(
      fc.property(aKitchen, aLinkedList, (design, rules) => {
        const priced = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, design, bookWithLinked(rules)),
        );
        const cabinetLines = cabinetLinesOf(priced);

        for (const rule of rules) {
          const expected = cabinetLines.filter(
            (line) => line.pricedAsBuildId === rule.linkedBuildId,
          ).length;
          const line = accessoryLinesOf(priced).find(
            (candidate) => candidate.accessoryId === rule.accessoryId,
          );

          expect(line?.quantity ?? 0).toBe(expected);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("publishes no line for a quantity of zero, so a zero never reads as included", () => {
    fc.assert(
      fc.property(aKitchen, aLinkedList, (design, rules) => {
        const priced = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, design, bookWithLinked(rules)),
        );

        for (const line of accessoryLinesOf(priced)) {
          expect(line.quantity).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("counts a seeded body through its equivalent and a corner through its own id", () => {
    const seededWall = bookWithLinked([
      linkedRule("wall-link", { linkedBuildId: "wall-cabinet" }),
    ]);
    const corner = bookWithLinked([
      linkedRule("corner-link", { linkedBuildId: "base-corner-x-900" }),
    ]);
    const seededPlacements = KITCHEN_L_DESIGN.placements.filter(
      (placement) =>
        placement.body.buildId.startsWith("wall-2door") ||
        placement.body.buildId.startsWith("wall-1door") ||
        placement.body.buildId === "wall-2door-700-over-fridge",
    );

    const wallLine = accessoryLinesOf(
      pricedOrThrow(priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, seededWall)),
    );
    const cornerLine = accessoryLinesOf(
      pricedOrThrow(priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, corner)),
    );

    expect(seededPlacements.length).toBeGreaterThan(1);
    expect(
      wallLine.find((line) => line.accessoryId === "wall-link")?.quantity,
    ).toBe(seededPlacements.length);
    expect(
      cornerLine.find((line) => line.accessoryId === "corner-link")?.quantity,
    ).toBe(1);
  });

  it("bills each line at the book's exact rate, rounded to ten lei, as a whole number of ten lei", () => {
    fc.assert(
      fc.property(aKitchen, aLinkedList, (design, rules) => {
        const priced = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, design, bookWithLinked(rules)),
        );

        for (const line of accessoryLinesOf(priced)) {
          const rule = rules.find(
            (candidate) => candidate.accessoryId === line.accessoryId,
          );
          if (rule === undefined) continue;
          expect(line.unitAmountMinor).toBe(rule.perUnitMinor);
          expect(line.amountMinor).toBe(
            roundedToTenLei(line.quantity * rule.perUnitMinor),
          );
          expect(line.amountMinor % TEN_LEI_MINOR).toBe(0);
        }
        expect(priced.totalMinor).toBe(
          priced.lines.reduce((sum, line) => sum + line.amountMinor, 0),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("rounds half up at the ten lei seam", () => {
    const row = "base-3drawer";
    const book = (perUnitMinor: number) =>
      bookWithLinked([
        linkedRule("edge", { linkedBuildId: row, perUnitMinor }),
      ]);
    const amountAt = (perUnitMinor: number) =>
      accessoryLinesOf(
        pricedOrThrow(
          priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book(perUnitMinor)),
        ),
      ).find((line) => line.accessoryId === "edge")?.amountMinor;

    expect(amountAt(499)).toBe(0);
    expect(amountAt(500)).toBe(1_000);
    expect(amountAt(1_499)).toBe(1_000);
    expect(amountAt(1_500)).toBe(2_000);
  });

  it("publishes the lines after the built-ins, in book order, under the line id accessory:<id>", () => {
    fc.assert(
      fc.property(aKitchen, aLinkedList, (design, rules) => {
        const priced = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, design, bookWithLinked(rules)),
        );
        const accessoryIds = accessoryLinesOf(priced).map(
          (line) => line.accessoryId,
        );
        const builtIns = accessoryIds.filter((id) =>
          BUILT_IN_ACCESSORY_IDS.includes(id),
        );
        const linked = accessoryIds.filter(
          (id) => !BUILT_IN_ACCESSORY_IDS.includes(id),
        );

        expect(accessoryIds).toEqual([...builtIns, ...linked]);
        expect(linked).toEqual(
          rules
            .map((rule) => rule.accessoryId)
            .filter((id) => linked.includes(id)),
        );
        for (const line of accessoryLinesOf(priced)) {
          expect(line.lineId).toBe(`accessory:${line.accessoryId}`);
        }
        expect(
          priced.lines
            .slice(priced.lines.length - accessoryIds.length)
            .map((line) => line.kind),
        ).toEqual(accessoryIds.map(() => "accessory"));
      }),
      { numRuns: 200 },
    );
  });

  it("carries the authored name, the rule id, and an empty description where none was authored", () => {
    const book = bookWithLinked([
      linkedRule("bare", { linkedBuildId: "base-3drawer" }),
      linkedRule("described", {
        linkedBuildId: "base-3drawer",
        description: "Pentru un sertar.",
      }),
    ]);

    const lines = accessoryLinesOf(
      pricedOrThrow(priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book)),
    );
    const bare = lines.find((line) => line.accessoryId === "bare");
    const described = lines.find((line) => line.accessoryId === "described");

    expect(bare).toMatchObject({
      ruleId: "accessory.bare",
      name: "Accesoriu bare",
      description: "",
    });
    expect(described?.description).toBe("Pentru un sertar.");
    expect(bare).not.toHaveProperty("nameKey");
  });
});

describe("a linked accessory leaves every other line as it was (P4b-b)", () => {
  it("keeps every line that is not a linked accessory's byte for byte, over random kitchens and links", () => {
    fc.assert(
      fc.property(aKitchen, aLinkedList, (design, rules) => {
        const without = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, design, bookWithLinked([])),
        );
        const withLinked = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, design, bookWithLinked(rules)),
        );

        const others = withLinked.lines.filter(
          (line) => !isLinkedLine(line, rules),
        );

        expect(JSON.stringify(others)).toBe(JSON.stringify(without.lines));
        expect(withLinked.totalMinor - without.totalMinor).toBe(
          withLinked.lines
            .filter((line) => isLinkedLine(line, rules))
            .reduce((sum, line) => sum + line.amountMinor, 0),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("does not alter a built-in's quantity, even linked to the sink's own row", () => {
    const sinkRow = "base-sink";
    const book = bookWithLinked([
      linkedRule("on-the-sink", { linkedBuildId: sinkRow }),
    ]);

    const before = pricedOrThrow(
      priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN),
    );
    const after = pricedOrThrow(
      priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book),
    );
    const quantityOf = (priced: PricedDesign, id: string) =>
      accessoryLinesOf(priced).find((line) => line.accessoryId === id)
        ?.quantity;

    for (const id of BUILT_IN_ACCESSORY_IDS) {
      expect(quantityOf(after, id)).toBe(quantityOf(before, id));
    }
    expect(quantityOf(after, "on-the-sink")).toBe(
      quantityOf(before, "sinkProtectiveCover"),
    );
  });
});

describe("a switched-off linked accessory is removed, not refused, and switching it on restores the line (P4a-d)", () => {
  const aSwitchOffOf = (rules: readonly LinkedAccessoryRule[]) =>
    fc.subarray(rules.map((rule) => rule.accessoryId));

  it("bills exactly the accessories that are on, whatever the book states for the ones that are off", () => {
    fc.assert(
      fc.property(
        aKitchen,
        aLinkedList.chain((rules) =>
          fc.tuple(fc.constant(rules), aSwitchOffOf(rules)),
        ),
        (design, [rules, off]) => {
          const book = bookWithLinked(rules);
          const allOn = pricedOrThrow(
            priceUnder(NOTHING_DISABLED, design, book),
          );

          const switchedOff = pricedOrThrow(
            priceUnder(availabilityOf(off.map(accessory)), design, book),
          );

          expect(switchedOff.lines).toEqual(
            allOn.lines.filter(
              (line) =>
                !(line.kind === "accessory" && off.includes(line.accessoryId)),
            ),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("restores the lines exactly when the accessory is switched on again", () => {
    fc.assert(
      fc.property(
        aKitchen,
        aLinkedList.chain((rules) =>
          fc.tuple(fc.constant(rules), aSwitchOffOf(rules)),
        ),
        (design, [rules, off]) => {
          const book = bookWithLinked(rules);
          const before = priceUnder(NOTHING_DISABLED, design, book);

          priceUnder(availabilityOf(off.map(accessory)), design, book);
          const after = priceUnder(NOTHING_DISABLED, design, book);

          expect(after).toEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("is not refused for a book that states a rule it never reads: an accessory that is off needs no rule", () => {
    const book = bookWithLinked([
      linkedRule("organiser", { perUnitMinor: 1_000 }),
    ]);

    const result = priceUnder(
      availabilityOf([accessory("organiser")]),
      KITCHEN_L_DESIGN,
      book,
    );

    expect(result.ok).toBe(true);
  });
});
