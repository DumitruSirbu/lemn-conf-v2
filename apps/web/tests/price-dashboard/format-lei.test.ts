import { describe, expect, it } from "vitest";

import { formatLei, formatLeiAmount } from "@/price-dashboard/format-lei";

const NBSP = " ";

describe("the dashboard's amount", () => {
  it.each([
    [0, "0"],
    [100, "1"],
    [99_900, `999`],
    [100_000, `1${NBSP}000`],
    [145_000, `1${NBSP}450`],
    [123_456_700, `1${NBSP}234${NBSP}567`],
  ])("writes %i bani as whole lei, grouped by thousands: %s", (minor, text) => {
    expect(formatLeiAmount(minor)).toBe(text);
  });

  it.each([
    [1, "0,01"],
    [5, "0,05"],
    [150, "1,50"],
    [145_005, `1${NBSP}450,05`],
  ])("keeps the bani of %i, in two digits after a comma: %s", (minor, text) => {
    expect(formatLeiAmount(minor)).toBe(text);
  });

  it("never rounds: an amount with bani is not shown as the lei beside it", () => {
    expect(formatLeiAmount(145_001)).not.toBe(formatLeiAmount(145_000));
  });

  it("joins the currency's word with a space a line cannot break at", () => {
    expect(formatLei(150_000, "lei")).toBe(`1${NBSP}500${NBSP}lei`);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuses %s, which is not a count of bani",
    (minor) => {
      expect(() => formatLeiAmount(minor)).toThrow(RangeError);
    },
  );
});
