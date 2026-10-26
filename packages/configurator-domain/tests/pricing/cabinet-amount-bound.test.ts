// The bound on one cabinet's exact amount (ADR 0177 A-5, re-ruled 2026-10-26): derived in code from named constants,
// refused above, and exact at its worst case. The coefficient bound is untouched and holds for every form of book.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_PLACEMENTS } from "../../src/design-bounds.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  MAX_PRICE_COEFFICIENT_MINOR,
  parsePriceBook,
} from "../../src/pricing/parse-price-book.js";
import {
  DEEP_CABINET_DEPTH_MM,
  MAX_CABINET_AMOUNT_MINOR,
  percentageStagesOf,
  splitCabinetsByPercentage,
} from "../../src/pricing/percentage-lines.js";
import { amountForBody } from "../../src/pricing/price-book.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../../src/pricing/price-bounds.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  anchoredRules,
  percentageBookOf,
  UPGRADE_TIER_ID,
} from "./percentage-book-support.js";

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const THIRD_STAGE_FACTOR = BigInt(
  (100 + MAX_MATERIAL_PERCENT) * (100 + MAX_DEEP_CABINET_PERCENT),
);

describe("MAX_CABINET_AMOUNT_MINOR is derived from named constants and is the largest that keeps the sum safe", () => {
  it("is the largest amount whose worst third-stage numerator, over every placement, is a safe integer", () => {
    const worstSum = (amount: bigint) =>
      BigInt(MAX_PLACEMENTS) * amount * THIRD_STAGE_FACTOR;
    const bound = BigInt(MAX_CABINET_AMOUNT_MINOR);

    expect(worstSum(bound) <= SAFE).toBe(true);
    expect(worstSum(bound + 1n) > SAFE).toBe(true);
  });

  it("leaves the coefficient bound untouched, for every form of book", () => {
    expect(MAX_PRICE_COEFFICIENT_MINOR).toBe(
      Math.floor(Number.MAX_SAFE_INTEGER / (4 * 10_000)),
    );
  });

  it("is at least a hundred times the dearest row the sample book prices at a 1 200 mm body: a defence, not a business limit", () => {
    const body = {
      widthMm: 1_200,
      heightMm: 2_200,
      doorLeafCount: 4,
      doorLeafCountAt: () => 2,
    };
    const dearestSampleRow = Math.max(
      ...SAMPLE_PRICE_BOOK.cabinetRules.map(
        (rule) => amountForBody(rule.formula, body) ?? 0,
      ),
    );

    expect(dearestSampleRow).toBeGreaterThan(0);
    expect(MAX_CABINET_AMOUNT_MINOR).toBeGreaterThan(100 * dearestSampleRow);
  });
});

describe("the worst case is exact: every placement at the bound, both percentages at their maxima", () => {
  const rates = {
    materialPercent: MAX_MATERIAL_PERCENT,
    deepCabinetPercent: MAX_DEEP_CABINET_PERCENT,
  };

  it("keeps every stage numerator a safe integer and every line equal to the BigInt oracle", () => {
    const everyPlacement = Array.from({ length: MAX_PLACEMENTS }, () => ({
      exactMinor: MAX_CABINET_AMOUNT_MINOR,
      deepens: true,
    }));

    const split = splitCabinetsByPercentage(everyPlacement, rates);
    const stages = percentageStagesOf(MAX_CABINET_AMOUNT_MINOR, rates);

    const numerator = BigInt(MAX_CABINET_AMOUNT_MINOR) * THIRD_STAGE_FACTOR;
    const oracleThirdStage =
      ((2n * numerator + 10_000_000n) / 20_000_000n) * 1_000n;
    expect(BigInt(stages.withDepthMinor)).toBe(oracleThirdStage);
    const sumOfLines =
      split.cabinetMinors.reduce((sum, amount) => sum + amount, 0) +
      split.materialLineMinor +
      split.depthLineMinor;
    expect(BigInt(sumOfLines)).toBe(oracleThirdStage * BigInt(MAX_PLACEMENTS));
    expect(Number.isSafeInteger(sumOfLines)).toBe(true);
    expect(numerator * BigInt(MAX_PLACEMENTS) <= SAFE).toBe(true);
  });

  it("holds for any amount up to the bound, at any percentages", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_CABINET_AMOUNT_MINOR }),
        fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT }),
        fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
        (amount, materialPercent, deepCabinetPercent) => {
          const stages = percentageStagesOf(amount, {
            materialPercent,
            deepCabinetPercent,
          });
          const numerator =
            BigInt(amount) *
            BigInt(100 + materialPercent) *
            BigInt(100 + deepCabinetPercent);
          const oracle =
            ((2n * numerator + 10_000_000n) / 20_000_000n) * 1_000n;

          expect(BigInt(stages.withDepthMinor)).toBe(oracle);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("a cabinet above the bound is refused, one at it is priced", () => {
  const pricingOneCabinetAt = (anchorMinor: number) => {
    const book = percentageBookOf({
      materialPercent: MAX_MATERIAL_PERCENT,
      deepCabinetPercent: MAX_DEEP_CABINET_PERCENT,
      cabinetRules: anchoredRules(() => anchorMinor),
    });
    const catalog = buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM);
    const onlyBase = KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.body.buildId === "base-drawer3-600",
    );
    expect(onlyBase).toHaveLength(1);
    return priceDesign({
      design: {
        ...KITCHEN_L_DESIGN,
        placements: onlyBase,
        settings: {
          ...KITCHEN_L_DESIGN.settings,
          cabinetDepthMm: DEEP_CABINET_DEPTH_MM,
        },
      },
      catalog,
      book,
      pricingVersion: book.version,
      selections: { materialTierId: UPGRADE_TIER_ID },
      deepeningRows: new Set(["base-3drawer"]),
    });
  };

  it("prices a cabinet exactly at the bound, with every line a multiple of ten lei", () => {
    const result = pricingOneCabinetAt(MAX_CABINET_AMOUNT_MINOR);

    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const line of result.priced.lines) {
        expect(line.amountMinor % 1_000).toBe(0);
      }
    }
  });

  it("refuses a cabinet one bani above it with INVALID_AMOUNT, naming the placement, never publishing a line", () => {
    const result = pricingOneCabinetAt(MAX_CABINET_AMOUNT_MINOR + 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("INVALID_AMOUNT");
      expect(result.failure.placementId).toBeDefined();
    }
  });

  it("still parses such a book, since the coefficient bound is the parser's and this one is evaluation's", () => {
    const book = percentageBookOf({
      materialPercent: 10,
      deepCabinetPercent: 10,
      cabinetRules: anchoredRules(() => MAX_CABINET_AMOUNT_MINOR + 1),
    });

    expect(parsePriceBook(book).ok).toBe(true);
  });
});
