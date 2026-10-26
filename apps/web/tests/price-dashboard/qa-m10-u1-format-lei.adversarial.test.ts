// Adversarial QA of M10 wave U1: the manufacturer's amount is written exactly, for every count of bani a price can be,
// and is refused, never bent into a figure, for every count it cannot be.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { formatLei, formatLeiAmount } from "@/price-dashboard/format-lei";

const NBSP = "\u00a0";

/** The count of bani a written amount stands for, read back with integer arithmetic only. */
function baniOf(written: string): bigint {
  const [leiPart = "", baniPart = ""] = written.split(",");
  const lei = BigInt(leiPart.replaceAll(NBSP, ""));
  const bani = baniPart === "" ? 0n : BigInt(baniPart);
  return lei * 100n + bani;
}

describe("the dashboard's amount over every count of bani", () => {
  propertyTest.prop([fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })], {
    numRuns: 3000,
  })("reads back as exactly the count it was written from", (totalBani) => {
    expect(baniOf(formatLeiAmount(totalBani))).toBe(BigInt(totalBani));
  });

  propertyTest.prop([fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })], {
    numRuns: 3000,
  })(
    "groups by three digits, writes two digits of bani or none, and carries no sign or stray space",
    (totalBani) => {
      const written = formatLeiAmount(totalBani);

      expect(written).toMatch(/^\d{1,3}(\u00a0\d{3})*(,\d{2})?$/);
      expect(written.endsWith(",00")).toBe(false);
      expect(written.includes(",")).toBe(totalBani % 100 !== 0);
    },
  );

  propertyTest.prop([fc.integer({ min: 0, max: 5_000_000 })])(
    "never writes two different counts the same",
    (totalBani) => {
      expect(formatLeiAmount(totalBani)).not.toBe(
        formatLeiAmount(totalBani + 1),
      );
    },
  );

  it.each([
    [0, "0"],
    [1, "0,01"],
    [99, "0,99"],
    [100, "1"],
    [101, "1,01"],
    [99_999, `999,99`],
    [100_000, `1${NBSP}000`],
    [100_001, `1${NBSP}000,01`],
    [Number.MAX_SAFE_INTEGER, `90${NBSP}071${NBSP}992${NBSP}547${NBSP}409,91`],
  ])("writes the boundary %i as %s", (totalBani, written) => {
    expect(formatLeiAmount(totalBani)).toBe(written);
  });

  it("writes minus zero as zero, with no sign", () => {
    expect(formatLeiAmount(-0)).toBe("0");
  });

  it.each([
    -1,
    -100,
    Number.MIN_SAFE_INTEGER,
    Number.NEGATIVE_INFINITY,
    0.5,
    99.99,
    Number.NaN,
    2 ** 53,
    1e21,
  ])("refuses %s and writes no figure for it", (totalBani) => {
    expect(() => formatLeiAmount(totalBani)).toThrow(RangeError);
    expect(() => formatLei(totalBani, "lei")).toThrow(RangeError);
  });

  it("keeps the currency's word whole, whatever it is, after one space no line can break", () => {
    expect(formatLei(1, "lei")).toBe(`0,01${NBSP}lei`);
    expect(formatLei(1, "")).toBe(`0,01${NBSP}`);
  });
});
