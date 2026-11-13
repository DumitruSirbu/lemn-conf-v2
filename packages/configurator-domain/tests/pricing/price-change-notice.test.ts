// M10 P4b-d: `pricesChangedBetween` is true if and only if some line amount differs between the kitchen priced under the
// pair the customer last saw and the pair in force (ADR 0062 Amendment 5, A-11). The pair is a book and an availability,
// because switching a linked accessory on changes a price with no new book version.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { CatalogueAvailability } from "../../src/pricing/catalogue-availability.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import {
  PriceChangeNotComparableError,
  pricesChangedBetween,
  type PriceChangeRequest,
} from "../../src/pricing/price-change-notice.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { Design } from "../../src/design.js";
import {
  accessory,
  availabilityOf,
  CATALOG,
  kitchenNamingEverything,
  material,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import {
  bookWithLinked,
  linkedRule,
  suppliedRowNotPlacedIn,
} from "../support/linked-accessory-books.js";

interface Pair {
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
}

const SAMPLE_PAIR: Pair = {
  book: SAMPLE_PRICE_BOOK,
  availability: NOTHING_DISABLED,
};

function changed(
  seen: Pair,
  active: Pair,
  design: Design = KITCHEN_L_DESIGN,
): boolean {
  const request: PriceChangeRequest = {
    design,
    catalog: CATALOG,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    seenBook: seen.book,
    seenAvailability: seen.availability,
    activeBook: active.book,
    currentAvailability: active.availability,
  };
  return pricesChangedBetween(request);
}

/** The amounts a pair prices the kitchen at, by line, written without the function under test: a line that is absent
 *  and one that is zero are the same price. */
function nonZeroAmountsUnder(pair: Pair, design: Design): string {
  const result = priceDesign({
    design,
    catalog: CATALOG,
    book: pair.book,
    pricingVersion: pair.book.version,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: pair.availability,
  });
  if (!result.ok) throw new Error(result.failure.code);
  return JSON.stringify(
    result.priced.lines
      .filter((line) => line.amountMinor !== 0)
      .map((line) => [line.lineId, line.amountMinor])
      .sort(([one], [other]) => String(one).localeCompare(String(other))),
  );
}

const KITCHENS: readonly Design[] = [
  KITCHEN_L_DESIGN,
  kitchenNamingEverything(),
];

/** Raises one amount of the sample book. Increases only, and by amounts three of them cannot carry past a bound: a lower
 *  anchor can price a body below zero, and a percentage past its maximum is a book the parser refuses. */
const aBookAmendment = fc.oneof(
  fc.integer({ min: 0, max: 80_000 }).map(
    (rise) =>
      (book: PriceBook): PriceBook => ({
        ...book,
        cabinetRules: book.cabinetRules.map((rule, index) =>
          index === 0 && rule.formula.shape !== "price-per-size"
            ? {
                ...rule,
                formula: {
                  ...rule.formula,
                  anchorMinor: rule.formula.anchorMinor + rise,
                },
              }
            : rule,
        ),
      }),
  ),
  fc.integer({ min: 0, max: 20_000 }).map(
    (rise) =>
      (book: PriceBook): PriceBook => ({
        ...book,
        hardware: {
          ...book.hardware,
          tiers: book.hardware.tiers.map((tier) => ({
            ...tier,
            perHingeMinor: tier.perHingeMinor + rise,
          })),
        },
      }),
  ),
  fc.integer({ min: 0, max: 50 }).map(
    (rise) =>
      (book: PriceBook): PriceBook => ({
        ...book,
        material: {
          ...book.material,
          tiers: book.material.tiers.map((tier) =>
            tier.tierId === book.material.defaultTierId
              ? tier
              : { ...tier, percentOfCabinets: tier.percentOfCabinets + rise },
          ),
        },
      }),
  ),
  fc.integer({ min: 0, max: 90_000 }).map(
    (rise) =>
      (book: PriceBook): PriceBook => ({
        ...book,
        accessories: {
          ...book.accessories,
          sinkProtectiveCover: {
            ...book.accessories.sinkProtectiveCover,
            perUnitMinor:
              book.accessories.sinkProtectiveCover.perUnitMinor + rise,
          },
        },
      }),
  ),
  fc.integer({ min: 0, max: 28 }).map(
    (rise) =>
      (book: PriceBook): PriceBook => ({
        ...book,
        depthRule: {
          deepCabinetPercent: book.depthRule.deepCabinetPercent + rise,
        },
      }),
  ),
  fc.integer({ min: 0, max: 90_000 }).map(
    (perUnitMinor) =>
      (book: PriceBook): PriceBook =>
        bookWithLinked([linkedRule("organiser", { perUnitMinor })], book),
  ),
);

describe("pricesChangedBetween is true if and only if some line amount differs (P4b-d)", () => {
  it("agrees with pricing the kitchen under both pairs and comparing the amounts, for any amended book", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KITCHENS),
        fc.array(aBookAmendment, { maxLength: 3 }),
        fc.string({ minLength: 1, maxLength: 6 }),
        (design, amendments, versionSuffix) => {
          const amended = amendments.reduce(
            (book, amend) => amend(book),
            SAMPLE_PRICE_BOOK,
          );
          const active: Pair = {
            book: {
              ...amended,
              version: `${amended.version}-${versionSuffix}`,
            },
            availability: NOTHING_DISABLED,
          };
          const expected =
            nonZeroAmountsUnder(SAMPLE_PAIR, design) !==
            nonZeroAmountsUnder(active, design);

          expect(changed(SAMPLE_PAIR, active, design)).toBe(expected);
          expect(changed(active, SAMPLE_PAIR, design)).toBe(expected);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("gives false for identical inputs, and for a new version that prices the kitchen alike", () => {
    expect(changed(SAMPLE_PAIR, SAMPLE_PAIR)).toBe(false);
    expect(
      changed(SAMPLE_PAIR, {
        book: { ...SAMPLE_PRICE_BOOK, version: "a-newer-version" },
        availability: availabilityOf([], "a-newer-revision"),
      }),
    ).toBe(false);
  });

  it("gives false for a change to a row the kitchen does not use", () => {
    const unusedHardwareTier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
      (tier) => tier.tierId !== SAMPLE_PRICE_BOOK.hardware.defaultTierId,
    );
    const usedRowIds = new Set(
      KITCHEN_L_DESIGN.placements.map((placement) => placement.body.buildId),
    );
    const unusedCabinetRule = SAMPLE_PRICE_BOOK.cabinetRules.find(
      (rule) =>
        !usedRowIds.has(rule.buildId) &&
        rule.formula.shape !== "price-per-size",
    );
    if (unusedHardwareTier === undefined || unusedCabinetRule === undefined) {
      throw new Error(
        "the sample book has no row the seeded kitchen leaves unused",
      );
    }
    const dearer: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) =>
          tier === unusedHardwareTier
            ? { ...tier, perHingeMinor: tier.perHingeMinor + 5_000 }
            : tier,
        ),
      },
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) =>
        rule === unusedCabinetRule && rule.formula.shape !== "price-per-size"
          ? {
              ...rule,
              formula: {
                ...rule.formula,
                anchorMinor: rule.formula.anchorMinor + 90_000,
              },
            }
          : rule,
      ),
    };

    expect(
      changed(SAMPLE_PAIR, { book: dearer, availability: NOTHING_DISABLED }),
    ).toBe(false);
  });

  it("gives true for a change to a row the kitchen uses", () => {
    const usedRule = SAMPLE_PRICE_BOOK.cabinetRules.find(
      (rule) => rule.buildId === "base-3drawer",
    );
    if (usedRule === undefined || usedRule.formula.shape === "price-per-size") {
      throw new Error("the sample book has no anchored rule for base-3drawer");
    }
    const dearer: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) =>
        rule === usedRule && rule.formula.shape !== "price-per-size"
          ? {
              ...rule,
              formula: {
                ...rule.formula,
                anchorMinor: rule.formula.anchorMinor + 90_000,
              },
            }
          : rule,
      ),
    };

    expect(
      changed(SAMPLE_PAIR, { book: dearer, availability: NOTHING_DISABLED }),
    ).toBe(true);
  });

  it("gives true when two lines move in opposite directions and the total does not", () => {
    const { sinkProtectiveCover, dishDryingRack } =
      SAMPLE_PRICE_BOOK.accessories;
    const swapped: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      accessories: {
        sinkProtectiveCover: {
          ...sinkProtectiveCover,
          perUnitMinor: sinkProtectiveCover.perUnitMinor + 10_000,
        },
        dishDryingRack: {
          ...dishDryingRack,
          perUnitMinor: dishDryingRack.perUnitMinor - 10_000,
        },
      },
    };

    expect(
      changed(SAMPLE_PAIR, { book: swapped, availability: NOTHING_DISABLED }),
    ).toBe(true);
  });
});

const UNPLACED_ROW = suppliedRowNotPlacedIn(KITCHEN_L_DESIGN);

describe("activating a linked accessory the kitchen earns changes the price with no new book version (P4b-d)", () => {
  const book = bookWithLinked([
    linkedRule("on-drawers", {
      linkedBuildId: "base-3drawer",
      perUnitMinor: 25_000,
    }),
    linkedRule("on-nothing-placed", {
      linkedBuildId: UNPLACED_ROW,
      perUnitMinor: 25_000,
    }),
    linkedRule("free", { linkedBuildId: "base-3drawer", perUnitMinor: 0 }),
  ]);
  const off = (...ids: string[]): Pair => ({
    book,
    availability: availabilityOf(ids.map(accessory), "r"),
  });

  it("is true when it is switched on, and when it is switched off, over the same version", () => {
    const created = off("on-drawers");
    const activated = off();

    expect(changed(created, activated)).toBe(true);
    expect(changed(activated, created)).toBe(true);
    expect(created.book.version).toBe(activated.book.version);
  });

  it("is false for one the kitchen does not earn, and for one that costs nothing", () => {
    expect(changed(off("on-nothing-placed"), off())).toBe(false);
    expect(changed(off("free"), off())).toBe(false);
  });

  it("is false when what changed is only the revision", () => {
    const sameItems = (revision: string): Pair => ({
      book,
      availability: availabilityOf([accessory("on-drawers")], revision),
    });

    expect(changed(sameItems("r1"), sameItems("r2"))).toBe(false);
  });
});

describe("a refusal on either side is carried, not read as no change", () => {
  const veneerOff: Pair = {
    book: SAMPLE_PRICE_BOOK,
    availability: availabilityOf([material("material.veneer")]),
  };

  function thrownBy(seen: Pair, active: Pair): PriceChangeNotComparableError {
    try {
      changed(seen, active, kitchenNamingEverything());
    } catch (error) {
      if (error instanceof PriceChangeNotComparableError) return error;
      throw error;
    }
    throw new Error("expected pricesChangedBetween to throw");
  }

  it("names the active side and the replacement the kitchen needs", () => {
    const error = thrownBy(SAMPLE_PAIR, veneerOff);

    expect(error.side).toBe("active");
    expect(error.failure.code).toBe("REPLACEMENT_REQUIRED");
  });

  it("names the seen side when that is the pair that cannot price the kitchen", () => {
    const error = thrownBy(veneerOff, SAMPLE_PAIR);

    expect(error.side).toBe("seen");
    expect(error.failure.code).toBe("REPLACEMENT_REQUIRED");
  });
});
