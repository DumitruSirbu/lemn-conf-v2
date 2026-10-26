// How a book states its materials and its depth (ADR 0177 A-5, ADR 0092 Amendment of 2026-10-25): whole percentages,
// within bounds, in one form throughout. The old flat form keeps parsing; a book carrying both forms is refused.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_DESIGN_DIMENSION_MM,
  MAX_PLACEMENTS,
} from "../../src/design-bounds.js";
import { MAX_PERCENTAGE_FORM_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import {
  MAX_PRICE_COEFFICIENT_MINOR,
  parsePriceBook,
} from "../../src/pricing/parse-price-book.js";
import { DEPTH_RULE_ID, type PriceBook } from "../../src/pricing/price-book.js";
import { splitCabinetsByPercentage } from "../../src/pricing/percentage-lines.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
  PRICE_STEP_MM,
} from "../../src/pricing/price-bounds.js";
import {
  anchoredAt,
  anchoredRules,
  percentageBookOf,
  REFERENCE_TIER_ID,
  UPGRADE_TIER_ID,
} from "./percentage-book-support.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const ANY_ANCHOR = () => 100_000;

function validBook(
  overrides: { materialPercent?: number; deepCabinetPercent?: number } = {},
): PriceBook {
  return percentageBookOf({
    materialPercent: overrides.materialPercent ?? 35,
    deepCabinetPercent: overrides.deepCabinetPercent ?? 15,
    cabinetRules: anchoredRules(ANY_ANCHOR),
  });
}

function refusalDetailOf(book: unknown): string {
  const parsed = parsePriceBook(book);
  if (parsed.ok) throw new Error("expected the book to be refused");
  expect(parsed.failure.code).toBe("INVALID_PRICE_BOOK");
  return parsed.failure.detail;
}

/** A copy of the valid book with its upgrade tier replaced by an edited copy of itself. */
function withUpgradeTier(
  edit: (tier: Record<string, unknown>) => void,
): unknown {
  const book = validBook();
  const tiers = book.material.tiers.map((tier) => ({ ...tier }));
  const upgrade = tiers.find((tier) => tier.tierId === UPGRADE_TIER_ID);
  if (!upgrade) throw new Error("no upgrade tier");
  edit(upgrade as unknown as Record<string, unknown>);
  return { ...book, material: { ...book.material, tiers } };
}

describe("a book in percentage form parses (P2 item 1)", () => {
  it("accepts whole percentages anywhere in their ranges, the bounds included", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT }),
        fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
        (materialPercent, deepCabinetPercent) => {
          expect(
            parsePriceBook(validBook({ materialPercent, deepCabinetPercent }))
              .ok,
          ).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
    expect(
      parsePriceBook(validBook({ materialPercent: 0, deepCabinetPercent: 0 }))
        .ok,
    ).toBe(true);
    expect(
      parsePriceBook(
        validBook({
          materialPercent: MAX_MATERIAL_PERCENT,
          deepCabinetPercent: MAX_DEEP_CABINET_PERCENT,
        }),
      ).ok,
    ).toBe(true);
  });

  it("keeps parsing the flat form, which states no depth rule", () => {
    expect(parsePriceBook(SAMPLE_PRICE_BOOK).ok).toBe(true);
  });
});

describe("a material percentage is whole and within 0..MAX_MATERIAL_PERCENT", () => {
  it.each([
    ["negative", -1],
    ["past the bound", MAX_MATERIAL_PERCENT + 1],
    ["a fraction", 12.5],
    ["not a number", "35"],
    ["not finite", Number.POSITIVE_INFINITY],
    ["not a safe integer", 2 ** 60],
    ["null", null],
  ])(
    "refuses a tier percentage that is %s, naming the field",
    (_why, declared) => {
      const detail = refusalDetailOf(
        withUpgradeTier((tier) => {
          tier["percentOfCabinets"] = declared;
        }),
      );
      expect(detail).toContain("percentOfCabinets");
      expect(detail).toContain(UPGRADE_TIER_ID);
    },
  );
});

describe("a depth percentage is whole and within 0..MAX_DEEP_CABINET_PERCENT", () => {
  it.each([
    ["negative", -1],
    ["past the bound", MAX_DEEP_CABINET_PERCENT + 1],
    ["a fraction", 0.5],
    ["not a number", "15"],
    ["absent", undefined],
  ])(
    "refuses a depth percentage that is %s, naming the field",
    (_why, declared) => {
      const book = {
        ...validBook(),
        depthRule: { deepCabinetPercent: declared },
      };

      expect(refusalDetailOf(book)).toContain("deepCabinetPercent");
    },
  );

  it("refuses a depth rule that is not an object, and a field the rule does not read", () => {
    expect(refusalDetailOf({ ...validBook(), depthRule: 15 })).toContain(
      "depthRule",
    );
    expect(
      refusalDetailOf({
        ...validBook(),
        depthRule: { deepCabinetPercent: 15, perMillimetre: 3 },
      }),
    ).toContain("perMillimetre");
  });
});

describe("a book carrying both the old and the new material fields is refused (P2 item 5)", () => {
  it("refuses a tier that states a flat amount and a percentage", () => {
    const detail = refusalDetailOf(
      withUpgradeTier((tier) => {
        tier["wholeKitchenMinor"] = 130_000;
      }),
    );

    expect(detail).toContain("wholeKitchenMinor");
    expect(detail).toContain("percentOfCabinets");
  });

  it("refuses tiers that disagree: one a percentage, one a flat amount", () => {
    const book = validBook();
    const tiers = book.material.tiers.map((tier) => ({ ...tier }));
    const [reference] = tiers;
    if (!reference) throw new Error("no reference tier");
    delete (reference as { percentOfCabinets?: number }).percentOfCabinets;
    (reference as unknown as Record<string, unknown>)["wholeKitchenMinor"] = 0;

    expect(
      refusalDetailOf({ ...book, material: { ...book.material, tiers } }),
    ).toContain("two ways");
  });

  it("refuses a depth rule beside flat tiers, which nothing would price", () => {
    expect(
      refusalDetailOf({
        ...SAMPLE_PRICE_BOOK,
        depthRule: { deepCabinetPercent: 10 },
      }),
    ).toContain("depthRule");
  });

  it("refuses percentage tiers with no depth rule, since the book would price a depth nobody states", () => {
    const withoutDepthRule = { ...validBook(), depthRule: undefined };

    expect(refusalDetailOf(withoutDepthRule)).toContain("depthRule");
  });
});

describe("the default material is the 0 % reference (A-5, A-8)", () => {
  it("refuses a default tier above 0 %", () => {
    const book = validBook();
    const detail = refusalDetailOf({
      ...book,
      material: { ...book.material, defaultTierId: UPGRADE_TIER_ID },
    });

    expect(detail).toContain(UPGRADE_TIER_ID);
    expect(detail).toContain("0 %");
  });

  it("accepts the reference as the default, which is the book's own shape", () => {
    expect(validBook().material.defaultTierId).toBe(REFERENCE_TIER_ID);
    expect(parsePriceBook(validBook()).ok).toBe(true);
  });
});

describe("the depth rule's reserved rule id is swept with the others", () => {
  it("refuses a cabinet rule that reuses it, since a line could no longer be traced to one rule", () => {
    const book = validBook();
    const [first, ...rest] = book.cabinetRules;
    if (!first) throw new Error("no rules");
    const collided = {
      ...book,
      cabinetRules: [{ ...first, ruleId: DEPTH_RULE_ID }, ...rest],
    };

    expect(refusalDetailOf(collided)).toContain(DEPTH_RULE_ID);
  });
});

describe("the bound is re-derived for the percentage form (P2 item 4, A-5)", () => {
  /** The five multipliers of the widest anchored formula, written out here from the formula's own terms. */
  const STEPS = MAX_DESIGN_DIMENSION_MM / PRICE_STEP_MM;
  const CABINET_IN_COEFFICIENTS = 1 + STEPS + STEPS + STEPS + STEPS;
  const PERCENT_PRODUCT =
    (100 + MAX_MATERIAL_PERCENT) * (100 + MAX_DEEP_CABINET_PERCENT);

  it("is the largest coefficient whose worst sum over every placement is a safe integer, and no larger", () => {
    const sumAt = (coefficient: bigint) =>
      BigInt(MAX_PLACEMENTS) *
      coefficient *
      BigInt(CABINET_IN_COEFFICIENTS) *
      BigInt(PERCENT_PRODUCT);
    const bound = BigInt(MAX_PERCENTAGE_FORM_COEFFICIENT_MINOR);

    expect(sumAt(bound) <= BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(sumAt(bound + 1n) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("is tighter than the flat form's, which did not count the percentage product", () => {
    expect(MAX_PERCENTAGE_FORM_COEFFICIENT_MINOR).toBeLessThan(
      MAX_PRICE_COEFFICIENT_MINOR,
    );
  });

  it("evaluates its worst case exactly: every placement at the dearest cabinet, material and depth", () => {
    const worstCabinetMinor =
      MAX_PERCENTAGE_FORM_COEFFICIENT_MINOR * CABINET_IN_COEFFICIENTS;
    const everyPlacement = Array.from({ length: MAX_PLACEMENTS }, () => ({
      exactMinor: worstCabinetMinor,
      deepens: true,
    }));

    const split = splitCabinetsByPercentage(everyPlacement, {
      materialPercent: MAX_MATERIAL_PERCENT,
      deepCabinetPercent: MAX_DEEP_CABINET_PERCENT,
    });
    const computed =
      split.cabinetMinors.reduce((sum, amount) => sum + amount, 0) +
      split.materialLineMinor +
      split.depthLineMinor;

    const numerator = BigInt(worstCabinetMinor) * BigInt(PERCENT_PRODUCT);
    const roundedOracle =
      ((2n * numerator + 10_000_000n) / 20_000_000n) * 1_000n;
    expect(BigInt(computed)).toBe(roundedOracle * BigInt(MAX_PLACEMENTS));
    expect(Number.isSafeInteger(computed)).toBe(true);
  });

  it("refuses a cabinet amount past it in a percentage book while the flat form still accepts it", () => {
    const pastTheSeam = MAX_PERCENTAGE_FORM_COEFFICIENT_MINOR + 1;
    const percentageBook = percentageBookOf({
      materialPercent: 10,
      deepCabinetPercent: 10,
      cabinetRules: anchoredRules(() => pastTheSeam),
    });
    const [first, ...rest] = SAMPLE_PRICE_BOOK.cabinetRules;
    if (!first) throw new Error("no rules");
    const flatBook = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: [{ ...first, formula: anchoredAt(pastTheSeam) }, ...rest],
    };

    expect(refusalDetailOf(percentageBook)).toContain(
      String(MAX_PERCENTAGE_FORM_COEFFICIENT_MINOR),
    );
    expect(parsePriceBook(flatBook).ok).toBe(true);
  });

  it("holds a fixed-size row's listed prices to it too", () => {
    const book = validBook();
    const [first, ...rest] = book.cabinetRules;
    if (!first) throw new Error("no rules");
    const sized = {
      ...first,
      formula: {
        shape: "price-per-size",
        sizes: [
          {
            widthMm: 600,
            amountMinor: MAX_PERCENTAGE_FORM_COEFFICIENT_MINOR + 1,
          },
        ],
      },
    };

    expect(
      refusalDetailOf({ ...book, cabinetRules: [sized, ...rest] }),
    ).toContain(String(MAX_PERCENTAGE_FORM_COEFFICIENT_MINOR));
  });
});
