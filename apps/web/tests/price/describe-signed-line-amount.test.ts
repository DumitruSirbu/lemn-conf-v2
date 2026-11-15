import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import roMessages from "../../src/messages/ro.json";
import { contentFor } from "../support/catalogues";

import {
  describeSignedDifference,
  describeSignedLineAmount,
} from "@/price/starting-price";

// The difference of two exact totals, shown to the ten lei with its sign in text (M12 W6b; ADR 0185 decision 5).

const BANI_PER_MDL = 100;
const TEN_LEI = 10;
const MINUS_SIGN = "−";
const SAFE_DIFFERENCE = fc.integer({ min: -100_000_000, max: 100_000_000 });

describe("a signed line amount", () => {
  it.each([
    ["one bani up, rounded up to ten lei", 1, "+10"],
    ["ten lei", 10 * BANI_PER_MDL, "+10"],
    [
      "ten lei and one bani, rounded up to twenty",
      10 * BANI_PER_MDL + 1,
      "+20",
    ],
    ["the owner's 710 lei", 71_000, "+710"],
    ["990 lei", 990 * BANI_PER_MDL, "+990"],
    ["1 000 lei, grouped", 1_000 * BANI_PER_MDL, "+1 000"],
    ["one bani down", -1, `${MINUS_SIGN}10`],
    ["the owner's 710 lei down", -71_000, `${MINUS_SIGN}710`],
    ["1 000 lei down", -1_000 * BANI_PER_MDL, `${MINUS_SIGN}1 000`],
  ])("writes %s", (_name, differenceMinor, expected) => {
    expect(describeSignedLineAmount(differenceMinor)).toBe(expected);
  });

  it("writes an exact zero with no sign", () => {
    expect(describeSignedLineAmount(0)).toBe("0");
    expect(describeSignedLineAmount(-0)).toBe("0");
  });

  it("writes a negative with the arithmetic minus, never the hyphen", () => {
    expect(describeSignedLineAmount(-71_000).startsWith(MINUS_SIGN)).toBe(true);
    expect(describeSignedLineAmount(-71_000)).not.toContain("-");
  });

  it.each([
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    "refuses %s, which is not a whole count of minor units",
    (differenceMinor) => {
      expect(() => describeSignedLineAmount(differenceMinor)).toThrow(
        RangeError,
      );
    },
  );

  propertyTest.prop([SAFE_DIFFERENCE])(
    "carries the sign of the difference and a magnitude on the ten-lei step, at or above the exact one and never a step too high",
    (differenceMinor) => {
      const text = describeSignedLineAmount(differenceMinor);

      if (differenceMinor === 0) {
        expect(text).toBe("0");
        return;
      }
      const expectedSign = differenceMinor > 0 ? "+" : MINUS_SIGN;
      const shownMdl = Number(text.slice(1).replaceAll(" ", ""));
      const exactMinor = Math.abs(differenceMinor);
      expect(text.startsWith(expectedSign)).toBe(true);
      expect(shownMdl % TEN_LEI).toBe(0);
      expect(shownMdl * BANI_PER_MDL).toBeGreaterThanOrEqual(exactMinor);
      expect((shownMdl - TEN_LEI) * BANI_PER_MDL).toBeLessThan(exactMinor);
    },
  );

  propertyTest.prop([SAFE_DIFFERENCE.filter((difference) => difference !== 0)])(
    "never shows a difference that exists as nothing",
    (differenceMinor) => {
      expect(describeSignedLineAmount(differenceMinor)).not.toMatch(/^[+−]0$/u);
    },
  );
});

describe("a signed difference joined to the currency", () => {
  const { price } = contentFor("ro", roMessages);

  it.each([
    [71_000, "+710 MDL"],
    [-71_000, `${MINUS_SIGN}710 MDL`],
  ])("reads %i minor units as %s", (differenceMinor, expected) => {
    expect(describeSignedDifference({ differenceMinor, copy: price })).toBe(
      expected,
    );
  });
});
