// ADR 0108 decision 4: the metres a customer types become whole millimetres once, at the form
// boundary, on the digit string — refused rather than rounded (wave 7A criterion 8).
import { describe, expect, it } from "vitest";

import {
  parseMetresToMillimetres,
  type MetresRefusal,
} from "@/room/parse-metres";

/** The widest millimetre value the round-trip sweep covers: every length up to five digits. */
const LARGEST_SWEPT_MM = 99_999;

const MILLIMETRES_PER_METRE = 1000;

/** `mm` as metres with a decimal comma and all three decimals, built from integers so the test
 *  cannot share the float error the parser exists to avoid: 2605 → `2,605`, 3000 → `3,000`. */
function metresWithTrailingZeros(mm: number): string {
  const wholeMetres = Math.floor(mm / MILLIMETRES_PER_METRE);
  const decimals = String(mm % MILLIMETRES_PER_METRE).padStart(3, "0");
  return `${String(wholeMetres)},${decimals}`;
}

/** The same value as a person writes it: 4100 → `4,1`, 3000 → `3`. */
function metresWithoutTrailingZeros(mm: number): string {
  return metresWithTrailingZeros(mm).replace(/0+$/, "").replace(/,$/, "");
}

describe("parseMetresToMillimetres — the lengths a customer types", () => {
  it.each([
    ["3,60", 3600],
    ["3,6", 3600],
    ["3.60", 3600],
    [" 2,605 ", 2605],
    ["3", 3000],
    ["0,45", 450],
    ["4,1", 4100],
    ["3,6000", 3600],
  ])("reads %j as %i mm", (text, mm) => {
    expect(parseMetresToMillimetres(text)).toEqual({ ok: true, mm });
  });
});

describe("parseMetresToMillimetres — refusals, each with its reason", () => {
  it.each([
    ["3,6005", "notWholeMillimetres"],
    ["3 600", "notANumber"],
    ["3.600,5", "notANumber"],
    ["3e3", "notANumber"],
    ["-3", "notANumber"],
    ["+3", "notANumber"],
    ["abc", "notANumber"],
    ["0", "notPositive"],
    ["0,000", "notPositive"],
    ["", "empty"],
    ["  ", "empty"],
  ] as const satisfies readonly (readonly [string, MetresRefusal])[])(
    "refuses %j as %s",
    (text, reason) => {
      expect(parseMetresToMillimetres(text)).toEqual({ ok: false, reason });
    },
  );

  it("refuses a digit string too long to read back exactly, rather than rounding it", () => {
    expect(parseMetresToMillimetres("9007199254740993")).toEqual({
      ok: false,
      reason: "notANumber",
    });
  });
});

describe("parseMetresToMillimetres — every whole millimetre survives the round trip", () => {
  // Every value in the range rather than a sample: 99 999 parses is a few milliseconds, and an
  // exhaustive sweep leaves no value for a float shortcut to get wrong unseen.
  it("reads back every value from 1 to 99 999 mm written with a decimal comma, with and without trailing zeros", () => {
    const misread: string[] = [];
    for (let mm = 1; mm <= LARGEST_SWEPT_MM; mm += 1) {
      for (const text of [
        metresWithTrailingZeros(mm),
        metresWithoutTrailingZeros(mm),
      ]) {
        const parsed = parseMetresToMillimetres(text);
        if (!parsed.ok || parsed.mm !== mm) misread.push(text);
      }
    }

    expect(misread).toEqual([]);
  });

  it("renders the sweep's two spellings the way a person would write them", () => {
    expect([
      metresWithTrailingZeros(4100),
      metresWithoutTrailingZeros(4100),
    ]).toEqual(["4,100", "4,1"]);
    expect([
      metresWithTrailingZeros(3000),
      metresWithoutTrailingZeros(3000),
    ]).toEqual(["3,000", "3"]);
    expect([metresWithTrailingZeros(1), metresWithoutTrailingZeros(1)]).toEqual(
      ["0,001", "0,001"],
    );
  });
});
