// M10 P4b-d, adversarial: `pricesChangedBetween` against an oracle written from `priceDesign` alone, over (book,
// availability) pairs that move prices every way the product moves them without a new version: a built-in or a linked
// accessory switched on or off, a rate changed, a link moved, a row the kitchen does not use changed, a revision
// restamped. The property is symmetric, and a refused side throws rather than reading as no change.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import { resolveCatalogEquivalent } from "../../src/catalog.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { CatalogueAvailability } from "../../src/pricing/catalogue-availability.js";
import type {
  LinkedAccessoryRule,
  PriceBook,
} from "../../src/pricing/price-book.js";
import {
  PriceChangeNotComparableError,
  pricesChangedBetween,
} from "../../src/pricing/price-change-notice.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
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
} from "../support/linked-accessory-books.js";

interface Pair {
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
}

const THE_KITCHEN_ROWS = new Set(
  KITCHEN_L_DESIGN.placements.map((placement) => placement.body.buildId),
);

function requestFor(seen: Pair, active: Pair, design: Design) {
  return {
    design,
    catalog: CATALOG,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    seenBook: seen.book,
    seenAvailability: seen.availability,
    activeBook: active.book,
    currentAvailability: active.availability,
  };
}

function priceUnder(pair: Pair, design: Design) {
  return priceDesign({
    design,
    catalog: CATALOG,
    book: pair.book,
    pricingVersion: pair.book.version,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: pair.availability,
  });
}

/** What a customer pays for, line by line: a line absent and a line at zero are the same price. */
function paidByLine(
  pair: Pair,
  design: Design,
): Map<string, number> | undefined {
  const result = priceUnder(pair, design);
  if (!result.ok) return undefined;
  return new Map(
    result.priced.lines
      .filter((line) => line.amountMinor !== 0)
      .map((line) => [line.lineId, line.amountMinor]),
  );
}

function oracleSaysChanged(
  seen: Pair,
  active: Pair,
  design: Design,
): boolean | undefined {
  const before = paidByLine(seen, design);
  const after = paidByLine(active, design);
  if (before === undefined || after === undefined) return undefined;
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids].some((id) => before.get(id) !== after.get(id));
}

const withRevision = (revision: string): CatalogueAvailability =>
  availabilityOf([], revision);

const ROWS_THE_KITCHEN_DOES_NOT_USE = SAMPLE_PRICE_BOOK.cabinetRules.filter(
  (rule) =>
    !THE_KITCHEN_ROWS.has(rule.buildId) &&
    rule.suppliedBy !== "customer" &&
    rule.formula.shape !== "price-per-size",
);

type Amendment = (pair: Pair) => Pair;

const bookAmendment =
  (change: (book: PriceBook) => PriceBook): Amendment =>
  (pair) => ({ ...pair, book: change(pair.book) });

const aPairAmendment: fc.Arbitrary<Amendment> = fc.oneof(
  fc
    .constantFrom(
      "sinkProtectiveCover",
      "dishDryingRack",
      "organiser",
      "plinth-light",
      "ghost",
    )
    .chain((id) =>
      fc.boolean().map(
        (on): Amendment =>
          (pair) => {
            const disabled = pair.availability.disabled.filter(
              (item) => !(item.kind === "accessory" && item.accessoryId === id),
            );
            return {
              ...pair,
              availability: availabilityOf(
                on ? disabled : [...disabled, accessory(id)],
                pair.availability.revision,
              ),
            };
          },
      ),
    ),
  fc.integer({ min: 0, max: 60_000 }).map((perUnitMinor) =>
    bookAmendment((book) =>
      bookWithLinked(
        [
          linkedRule("organiser", {
            linkedBuildId: "base-3drawer",
            perUnitMinor,
          }),
          ...book.linkedAccessories.filter(
            (rule) => rule.accessoryId !== "organiser",
          ),
        ],
        book,
      ),
    ),
  ),
  fc
    .constantFrom(...SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => rule.buildId))
    .map((linkedBuildId) =>
      bookAmendment((book) =>
        book.cabinetRules.some(
          (rule) =>
            rule.buildId === linkedBuildId && rule.suppliedBy === "customer",
        )
          ? book
          : bookWithLinked(
              [
                linkedRule("plinth-light", {
                  linkedBuildId,
                  perUnitMinor: 12_000,
                }),
                ...book.linkedAccessories.filter(
                  (rule) => rule.accessoryId !== "plinth-light",
                ),
              ],
              book,
            ),
      ),
    ),
  fc
    .integer({ min: 0, max: ROWS_THE_KITCHEN_DOES_NOT_USE.length - 1 })
    .map((index) =>
      bookAmendment((book) => ({
        ...book,
        cabinetRules: book.cabinetRules.map((rule) =>
          rule === ROWS_THE_KITCHEN_DOES_NOT_USE[index] &&
          rule.formula.shape !== "price-per-size"
            ? {
                ...rule,
                formula: {
                  ...rule.formula,
                  anchorMinor: rule.formula.anchorMinor + 40_000,
                },
              }
            : rule,
        ),
      })),
    ),
  fc.integer({ min: 0, max: 40_000 }).map((rise) =>
    bookAmendment((book) => ({
      ...book,
      accessories: {
        ...book.accessories,
        dishDryingRack: {
          ...book.accessories.dishDryingRack,
          perUnitMinor: book.accessories.dishDryingRack.perUnitMinor + rise,
        },
      },
    })),
  ),
  fc.string({ minLength: 1, maxLength: 8 }).map(
    (version): Amendment =>
      (pair) => ({ ...pair, book: { ...pair.book, version } }),
  ),
  fc.string({ minLength: 1, maxLength: 8 }).map(
    (revision): Amendment =>
      (pair) => ({
        ...pair,
        availability: {
          ...pair.availability,
          revision,
        },
      }),
  ),
  fc.constant(
    bookAmendment((book) => ({
      ...book,
      linkedAccessories: [...book.linkedAccessories].reverse(),
    })),
  ),
  fc.constant(
    bookAmendment((book) => ({
      ...book,
      amountsProvisional: !book.amountsProvisional,
    })),
  ),
);

const aPair = fc.array(aPairAmendment, { maxLength: 6 }).map(
  (amendments): Pair =>
    amendments.reduce<Pair>((pair, amend) => amend(pair), {
      book: bookWithLinked([
        linkedRule("plinth-light", {
          linkedBuildId: "base-sink",
          perUnitMinor: 12_000,
        }),
      ]),
      availability: withRevision("0"),
    }),
);

describe("pricesChangedBetween agrees with an oracle over pairs that move prices without a version", () => {
  it("is true exactly when some paid line differs, in both directions", () => {
    fc.assert(
      fc.property(
        aPair,
        aPair,
        fc.constantFrom(KITCHEN_L_DESIGN, kitchenNamingEverything()),
        (seen, active, design) => {
          const expected = oracleSaysChanged(seen, active, design);
          if (expected === undefined) return;

          expect(pricesChangedBetween(requestFor(seen, active, design))).toBe(
            expected,
          );
          expect(pricesChangedBetween(requestFor(active, seen, design))).toBe(
            expected,
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it("is false for a pair against itself and for any pair that differs only in its version, its revision, the order of the linked rows, or the provisional flag", () => {
    fc.assert(
      fc.property(aPair, (pair) => {
        const restamped: Pair = {
          book: {
            ...pair.book,
            version: `${pair.book.version}-next`,
            amountsProvisional: !pair.book.amountsProvisional,
            linkedAccessories: [...pair.book.linkedAccessories].reverse(),
          },
          availability: { ...pair.availability, revision: "restamped" },
        };

        expect(
          pricesChangedBetween(requestFor(pair, pair, KITCHEN_L_DESIGN)),
        ).toBe(false);
        expect(
          pricesChangedBetween(requestFor(pair, restamped, KITCHEN_L_DESIGN)),
        ).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("never throws for a pair the oracle prices on both sides", () => {
    fc.assert(
      fc.property(aPair, aPair, (seen, active) => {
        fc.pre(oracleSaysChanged(seen, active, KITCHEN_L_DESIGN) !== undefined);

        expect(() =>
          pricesChangedBetween(requestFor(seen, active, KITCHEN_L_DESIGN)),
        ).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
});

describe("a published line id is unique, which is what makes comparing by line id sound", () => {
  it("holds over crowded kitchens and linked lists that share rows", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...KITCHEN_L_DESIGN.placements), {
          maxLength: 20,
        }),
        fc.array(
          fc.constantFrom(...THE_KITCHEN_ROWS).map((row) => row),
          { maxLength: 8 },
        ),
        (placements, rows) => {
          const design: Design = {
            ...KITCHEN_L_DESIGN,
            placements: placements.map((placement, index) => ({
              ...placement,
              id: `${placement.id}#${String(index)}`,
            })),
          };
          const rules: LinkedAccessoryRule[] = rows.map((row, index) =>
            linkedRule(`link-${String(index)}`, { linkedBuildId: row }),
          );
          const result = priceUnder(
            { book: bookWithLinked(rules), availability: NOTHING_DISABLED },
            design,
          );
          if (!result.ok) return;

          const ids = result.priced.lines.map((line) => line.lineId);

          expect(new Set(ids).size).toBe(ids.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rests on a design that never lists one placement id twice, which the write seam refuses", () => {
    const first = KITCHEN_L_DESIGN.placements[0];
    if (first === undefined) throw new Error("the seeded kitchen is empty");
    const doubled: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [...KITCHEN_L_DESIGN.placements, { ...first }],
    };

    expect(
      validateDesignForCatalog(doubled, CATALOG).map((issue) => issue.code),
    ).toContain("DUPLICATE_PLACEMENT_ID");
  });
});

describe("activation and deactivation of a linked accessory, with no new book version", () => {
  const rate = 25_000;
  const book = bookWithLinked([
    linkedRule("earned", { linkedBuildId: "base-3drawer", perUnitMinor: rate }),
    linkedRule("unearned", {
      linkedBuildId: "base-3drawer",
      perUnitMinor: rate,
    }),
  ]);
  const rowTheKitchenLacks = ROWS_THE_KITCHEN_DOES_NOT_USE[0]?.buildId;

  it("is true for every sweep of rates that round to a non-zero amount, false for those that round to nothing", () => {
    for (let perUnitMinor = 0; perUnitMinor <= 1_600; perUnitMinor += 25) {
      const priced = bookWithLinked([
        linkedRule("earned", { linkedBuildId: "base-3drawer", perUnitMinor }),
      ]);
      const on: Pair = { book: priced, availability: availabilityOf([], "1") };
      const off: Pair = {
        book: priced,
        availability: availabilityOf([accessory("earned")], "2"),
      };
      const expected = oracleSaysChanged(off, on, KITCHEN_L_DESIGN);

      expect(
        pricesChangedBetween(requestFor(off, on, KITCHEN_L_DESIGN)),
        `rate ${String(perUnitMinor)}`,
      ).toBe(expected);
    }
  });

  it("is false for a linked accessory on a row the kitchen has no placement of, in both directions", () => {
    if (rowTheKitchenLacks === undefined)
      throw new Error("the sample book prices every row the kitchen uses");
    const elsewhere = bookWithLinked([
      linkedRule("elsewhere", {
        linkedBuildId: rowTheKitchenLacks,
        perUnitMinor: rate,
      }),
    ]);
    const on: Pair = { book: elsewhere, availability: availabilityOf([], "1") };
    const off: Pair = {
      book: elsewhere,
      availability: availabilityOf([accessory("elsewhere")], "2"),
    };

    expect(pricesChangedBetween(requestFor(off, on, KITCHEN_L_DESIGN))).toBe(
      false,
    );
    expect(pricesChangedBetween(requestFor(on, off, KITCHEN_L_DESIGN))).toBe(
      false,
    );
  });

  it("is true when the kitchen drops from earning one to earning none, and false when it already earned none", () => {
    const withDrawers = KITCHEN_L_DESIGN;
    const noDrawers: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) =>
          (resolveCatalogEquivalent(CATALOG, placement.body.buildId)?.buildId ??
            placement.body.buildId) !== "base-3drawer",
      ),
    };
    const on: Pair = { book, availability: availabilityOf([], "1") };
    const off: Pair = {
      book,
      availability: availabilityOf([accessory("earned")], "2"),
    };

    expect(pricesChangedBetween(requestFor(off, on, withDrawers))).toBe(true);
    expect(pricesChangedBetween(requestFor(off, on, noDrawers))).toBe(false);
  });

  it("is true when one accessory goes on and another goes off by the same amount", () => {
    const seen: Pair = {
      book,
      availability: availabilityOf([accessory("unearned")], "1"),
    };
    const active: Pair = {
      book,
      availability: availabilityOf([accessory("earned")], "2"),
    };

    expect(
      oracleSaysChanged(seen, active, KITCHEN_L_DESIGN),
      "the oracle sees two lines move by equal and opposite amounts of a total that did not",
    ).toBe(true);
    expect(
      pricesChangedBetween(requestFor(seen, active, KITCHEN_L_DESIGN)),
    ).toBe(true);
  });
});

describe("a side that cannot be priced is thrown, never read as no change", () => {
  const veneerOff: Pair = {
    book: SAMPLE_PRICE_BOOK,
    availability: availabilityOf([material("material.veneer")]),
  };
  const fine: Pair = {
    book: SAMPLE_PRICE_BOOK,
    availability: NOTHING_DISABLED,
  };

  function thrownBy(
    seen: Pair,
    active: Pair,
    design: Design = kitchenNamingEverything(),
  ): PriceChangeNotComparableError {
    try {
      pricesChangedBetween(requestFor(seen, active, design));
    } catch (error) {
      if (error instanceof PriceChangeNotComparableError) return error;
      throw error;
    }
    throw new Error("expected pricesChangedBetween to throw");
  }

  it("names the seen side when both sides are refused, the seen being priced first", () => {
    expect(thrownBy(veneerOff, veneerOff).side).toBe("seen");
  });

  it("carries the whole refusal and a message that names the side and the code", () => {
    const error = thrownBy(fine, veneerOff);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PriceChangeNotComparableError");
    expect(error.message).toContain("active");
    expect(error.message).toContain(error.failure.code);
    expect(error.failure.code).toBe("REPLACEMENT_REQUIRED");
  });

  it("names the side whose book cannot be read at all, as a refusal and not a TypeError", () => {
    const { linkedAccessories, ...unreadable } = SAMPLE_PRICE_BOOK;
    void linkedAccessories;
    const stored: Pair = {
      book: unreadable as unknown as PriceBook,
      availability: NOTHING_DISABLED,
    };

    const seenSide = thrownBy(stored, fine, KITCHEN_L_DESIGN);
    const activeSide = thrownBy(fine, stored, KITCHEN_L_DESIGN);

    expect(seenSide.side).toBe("seen");
    expect(seenSide.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(activeSide.side).toBe("active");
  });

  it("refuses a switched-off accessory the kitchen only earns, as a removal, never as a refusal of either side", () => {
    const earned = bookWithLinked([
      linkedRule("earned", { linkedBuildId: "base-3drawer" }),
    ]);
    const off: Pair = {
      book: earned,
      availability: availabilityOf([accessory("earned")]),
    };
    const on: Pair = { book: earned, availability: NOTHING_DISABLED };

    expect(() =>
      pricesChangedBetween(requestFor(off, on, KITCHEN_L_DESIGN)),
    ).not.toThrow();
  });
});
