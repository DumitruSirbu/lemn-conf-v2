// How a book states its materials and its depth (ADR 0177 A-5, ADR 0092 Amendment of 2026-10-25): whole percentages,
// within bounds, in one form throughout. The old flat form keeps parsing; a book carrying both forms is refused.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import { DEPTH_RULE_ID, type PriceBook } from "../../src/pricing/price-book.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../../src/pricing/price-bounds.js";
import {
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
