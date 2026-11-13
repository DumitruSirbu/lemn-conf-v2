// The percentage seam's arithmetic on its own (ADR 0177 A-1): the rounding to 10 lei, the three nested stages and the
// two lines that are sums of their differences. Every assertion is a rule drawn over random amounts and percentages;
// none states a price or a percentage anybody approved (P2-f). The oracle is BigInt and shares no code with the seam.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  percentageStagesOf,
  roundHalfUpToTenLei,
  splitCabinetsByPercentage,
  TEN_LEI_MINOR,
} from "../../src/pricing/percentage-lines.js";
import { InexactPriceArithmeticError } from "../../src/pricing/price-book.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../../src/pricing/price-bounds.js";

const NUM_RUNS = 400;

/** An exact amount a cabinet might have: whole bani, from nothing to far past any real price but inside the bound the
 *  percentage form is held to. */
const exactAmount = fc.integer({ min: 0, max: 600_000 });
const materialPercent = fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT });
const depthPercent = fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT });

/** `numerator / denominator` rounded half-up to a multiple of 1 000, for a non-negative numerator, by BigInt. */
function oracleRoundedToTenLei(numerator: bigint, denominator: bigint): bigint {
  const grain = 1_000n * denominator;
  return ((numerator * 2n + grain) / (grain * 2n)) * 1_000n;
}

function oracleStages(exact: number, material: number, depth: number) {
  const b = BigInt(exact);
  const withMaterial = b * (100n + BigInt(material));
  return {
    cabinet: oracleRoundedToTenLei(b, 1n),
    withMaterial: oracleRoundedToTenLei(withMaterial, 100n),
    withDepth: oracleRoundedToTenLei(
      withMaterial * (100n + BigInt(depth)),
      10_000n,
    ),
  };
}

describe("rounding to 10 lei is half-up in integers, and its tie rule is stated", () => {
  it.each([
    [0, 0],
    [1, 0],
    [499, 0],
    [500, 1_000],
    [501, 1_000],
    [1_000, 1_000],
    [1_499, 1_000],
    [1_500, 2_000],
    [1_501, 2_000],
    [2_499, 2_000],
    [2_500, 3_000],
  ])("rounds %i bani to %i, a tie going up", (amount, rounded) => {
    expect(roundHalfUpToTenLei(amount)).toBe(rounded);
  });

  it("rounds a tie towards positive infinity at a negative amount too, so the rule is one rule", () => {
    expect(roundHalfUpToTenLei(-500)).toBe(0);
    expect(roundHalfUpToTenLei(-501)).toBe(-1_000);
    expect(roundHalfUpToTenLei(-1_500)).toBe(-1_000);
  });

  it("rounds a quotient without forming it: 1 499.5 bani is below the tie, 1 500 is on it", () => {
    expect(roundHalfUpToTenLei(14_995, 10)).toBe(1_000);
    expect(roundHalfUpToTenLei(15_000, 10)).toBe(2_000);
  });

  it("always answers a multiple of ten lei, within half a grain of the amount, and matches the BigInt oracle", () => {
    fc.assert(
      fc.property(exactAmount, fc.integer({ min: 1, max: 10_000 }), (n, d) => {
        const rounded = roundHalfUpToTenLei(n, d);
        expect(rounded % TEN_LEI_MINOR).toBe(0);
        expect(BigInt(rounded)).toBe(
          oracleRoundedToTenLei(BigInt(n), BigInt(d)),
        );
        // |rounded − n/d| ≤ 500, checked without a division
        const distance = BigInt(rounded) * BigInt(d) - BigInt(n);
        expect(distance <= 500n * BigInt(d)).toBe(true);
        expect(-distance < 500n * BigInt(d)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("refuses a fraction, a float or a sum past the safe range rather than rounding it silently", () => {
    expect(() => roundHalfUpToTenLei(1_500.5)).toThrow(
      InexactPriceArithmeticError,
    );
    expect(() => roundHalfUpToTenLei(Number.NaN)).toThrow(
      InexactPriceArithmeticError,
    );
    expect(() => roundHalfUpToTenLei(Number.MAX_SAFE_INTEGER)).toThrow(
      InexactPriceArithmeticError,
    );
    expect(() =>
      percentageStagesOf(1_000, {
        materialPercent: 0.5,
        deepCabinetPercent: 0,
      }),
    ).toThrow(InexactPriceArithmeticError);
    expect(() =>
      percentageStagesOf(1_000.25, {
        materialPercent: 10,
        deepCabinetPercent: 0,
      }),
    ).toThrow(InexactPriceArithmeticError);
  });
});

describe("a cabinet's three stages are nested rounded multiples (A-1)", () => {
  it("each stage is a multiple of ten lei and equals the BigInt oracle for any amount and percentages", () => {
    fc.assert(
      fc.property(exactAmount, materialPercent, depthPercent, (b, m, d) => {
        const stages = percentageStagesOf(b, {
          materialPercent: m,
          deepCabinetPercent: d,
        });
        const oracle = oracleStages(b, m, d);
        expect(BigInt(stages.cabinetMinor)).toBe(oracle.cabinet);
        expect(BigInt(stages.withMaterialMinor)).toBe(oracle.withMaterial);
        expect(BigInt(stages.withDepthMinor)).toBe(oracle.withDepth);
        for (const stage of Object.values(stages)) {
          expect(stage % TEN_LEI_MINOR).toBe(0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("never lets a later stage fall below an earlier one, so no line is negative", () => {
    fc.assert(
      fc.property(exactAmount, materialPercent, depthPercent, (b, m, d) => {
        const stages = percentageStagesOf(b, {
          materialPercent: m,
          deepCabinetPercent: d,
        });
        expect(stages.withMaterialMinor).toBeGreaterThanOrEqual(
          stages.cabinetMinor,
        );
        expect(stages.withDepthMinor).toBeGreaterThanOrEqual(
          stages.withMaterialMinor,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("multiplies the two percentages: swapping material and depth gives the same third stage", () => {
    fc.assert(
      fc.property(exactAmount, materialPercent, depthPercent, (b, m, d) => {
        const one = percentageStagesOf(b, {
          materialPercent: m,
          deepCabinetPercent: d,
        });
        const swapped = percentageStagesOf(b, {
          materialPercent: d,
          deepCabinetPercent: m,
        });
        expect(swapped.withDepthMinor).toBe(one.withDepthMinor);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("does not add the percentages: the third stage is not the first stage plus both uplifts", () => {
    const stages = percentageStagesOf(100_000, {
      materialPercent: 50,
      deepCabinetPercent: 50,
    });
    // 100 000 × 1.5 × 1.5 = 225 000, where adding the two would give 200 000
    expect(stages.withDepthMinor).toBe(225_000);
  });

  it("gives no amount at 0 %: with no material percentage the material part is zero, and with no depth the depth part", () => {
    fc.assert(
      fc.property(exactAmount, materialPercent, depthPercent, (b, m, d) => {
        const noMaterial = percentageStagesOf(b, {
          materialPercent: 0,
          deepCabinetPercent: d,
        });
        const noDepth = percentageStagesOf(b, {
          materialPercent: m,
          deepCabinetPercent: 0,
        });
        expect(noMaterial.withMaterialMinor - noMaterial.cabinetMinor).toBe(0);
        expect(noDepth.withDepthMinor - noDepth.withMaterialMinor).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("the lines are differences of the stages, so they add up exactly (P2-a)", () => {
  const cabinets = fc.array(
    fc.record({ exactMinor: exactAmount, deepens: fc.boolean() }),
    { maxLength: 40 },
  );

  it("adds the cabinet lines, the material line and the depth line to the sum of the third stage", () => {
    fc.assert(
      fc.property(cabinets, materialPercent, depthPercent, (list, m, d) => {
        const split = splitCabinetsByPercentage(list, {
          materialPercent: m,
          deepCabinetPercent: d,
        });
        const sumOfThirdStage = list.reduce(
          (sum, cabinet) =>
            sum +
            percentageStagesOf(cabinet.exactMinor, {
              materialPercent: m,
              deepCabinetPercent: cabinet.deepens ? d : 0,
            }).withDepthMinor,
          0,
        );
        const sumOfLines =
          split.cabinetMinors.reduce((sum, amount) => sum + amount, 0) +
          split.materialLineMinor +
          split.depthLineMinor;
        expect(sumOfLines).toBe(sumOfThirdStage);
        expect(split.materialLineMinor % TEN_LEI_MINOR).toBe(0);
        expect(split.depthLineMinor % TEN_LEI_MINOR).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("gives every cabinet the same three parts whatever order the cabinets are listed in", () => {
    fc.assert(
      fc.property(
        cabinets,
        materialPercent,
        depthPercent,
        fc.nat(),
        (list, m, d, rotation) => {
          const turn = list.length === 0 ? 0 : rotation % list.length;
          const reordered = [...list.slice(turn), ...list.slice(0, turn)];
          const rates = { materialPercent: m, deepCabinetPercent: d };
          const original = splitCabinetsByPercentage(list, rates);
          const other = splitCabinetsByPercentage(reordered, rates);
          expect(other.materialLineMinor).toBe(original.materialLineMinor);
          expect(other.depthLineMinor).toBe(original.depthLineMinor);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("takes no depth uplift from a cabinet that does not deepen, whatever the depth percentage", () => {
    fc.assert(
      fc.property(
        fc.array(exactAmount, { maxLength: 20 }),
        materialPercent,
        depthPercent,
        (amounts, m, d) => {
          const split = splitCabinetsByPercentage(
            amounts.map((exactMinor) => ({ exactMinor, deepens: false })),
            { materialPercent: m, deepCabinetPercent: d },
          );
          expect(split.depthLineMinor).toBe(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
