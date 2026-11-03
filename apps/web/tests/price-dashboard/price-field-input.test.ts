// What a person types into a price or a percentage field is read before anything is sent: an amount in lei as whole
// bani, the depth rule's percentage from 0 to the book's greatest, and a bulk percentage that is whole, signed, not 0,
// and within the action's bounds. A value that is not one of these is a refusal with a closed reason, never a number.
import { describe, expect, it } from "vitest";

import {
  MAX_BULK_PERCENT,
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
  MIN_BULK_PERCENT,
} from "@lemnaria/configurator-domain";

import {
  readBulkPercentInput,
  readDepthPercentInput,
  readLeiInput,
  readMaterialPercentInput,
  plainLeiOf,
  readLeiInputOverHeld,
} from "@/price-dashboard/price-field-input";

const NBSP = " ";

describe("an amount in lei", () => {
  it.each([
    ["10", 1_000],
    ["100", 10_000],
    ["450", 45_000],
    ["450,", 45_000],
    ["450,00", 45_000],
    ["450.0", 45_000],
    ["0", 0],
    ["010", 1_000],
    [`1${NBSP}450`, 145_000],
    [" 1 450 ", 145_000],
  ])("reads %j as %i bani", (typed, minor) => {
    expect(readLeiInput(typed)).toEqual({ kind: "amount", minor });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["-5", "negative"],
    ["−5", "negative"],
    ["21oo", "notNumber"],
    ["12,3,4", "notNumber"],
    [",5", "notNumber"],
    ["1e3", "notNumber"],
    ["450,255", "tooManyDecimals"],
    ["15", "notMultipleOfTen"],
    ["1", "notMultipleOfTen"],
    ["100,50", "notMultipleOfTen"],
    ["100.50", "notMultipleOfTen"],
    ["450,5", "notMultipleOfTen"],
    ["450,25", "notMultipleOfTen"],
    ["0,05", "notMultipleOfTen"],
    [`1${NBSP}455`, "notMultipleOfTen"],
    ["9".repeat(14), "tooBig"],
    ["9".repeat(40), "tooBig"],
  ])("refuses %j as %s", (typed, refusal) => {
    expect(readLeiInput(typed)).toEqual({ kind: "refused", refusal });
  });

  it("accepts exactly the amounts that are whole tens of lei, for every bani count in a sweep", () => {
    for (let bani = 0; bani <= 5_000; bani += 1) {
      const typed = `${String(Math.floor(bani / 100))},${String(bani % 100).padStart(2, "0")}`;
      const isWholeTensOfLei = bani % 1_000 === 0;

      expect(readLeiInput(typed).kind).toBe(
        isWholeTensOfLei ? "amount" : "refused",
      );
    }
  });

  it("reads the same bani whatever the grouping spaces, for every multiple of 10 lei in a sweep", () => {
    for (let lei = 0; lei <= 200_000; lei += 9_970) {
      const grouped = String(lei).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

      expect(readLeiInput(grouped)).toEqual({
        kind: "amount",
        minor: lei * 100,
      });
    }
  });
});

describe("the depth rule's percentage", () => {
  it.each([
    ["0", 0],
    ["18", 18],
    [String(MAX_DEEP_CABINET_PERCENT), MAX_DEEP_CABINET_PERCENT],
    [" 007 ", 7],
  ])("reads %j as %i", (typed, percent) => {
    expect(readDepthPercentInput(typed)).toEqual({ kind: "percent", percent });
  });

  it.each([
    ["", "empty"],
    ["-1", "negative"],
    ["−3", "negative"],
    ["abc", "notWhole"],
    ["12,5", "notWhole"],
    ["+5", "notWhole"],
    [String(MAX_DEEP_CABINET_PERCENT + 1), "tooBig"],
    ["99999999999999999999999", "tooBig"],
  ])(
    "refuses %j as %s: the four variants of frame D2E3 and the two a number cannot be",
    (typed, refusal) => {
      expect(readDepthPercentInput(typed)).toEqual({
        kind: "refused",
        refusal,
      });
    },
  );

  it("accepts exactly the whole numbers from 0 to the greatest", () => {
    for (
      let percent = -5;
      percent <= MAX_DEEP_CABINET_PERCENT + 5;
      percent += 1
    ) {
      const isInRange = percent >= 0 && percent <= MAX_DEEP_CABINET_PERCENT;

      expect(readDepthPercentInput(String(percent)).kind, String(percent)).toBe(
        isInRange ? "percent" : "refused",
      );
    }
  });
});

describe("a material's surcharge", () => {
  it.each([
    ["0", 0],
    ["18", 18],
    [String(MAX_MATERIAL_PERCENT), MAX_MATERIAL_PERCENT],
    [" 007 ", 7],
  ])("reads %j as %i", (typed, percent) => {
    expect(readMaterialPercentInput(typed)).toEqual({
      kind: "percent",
      percent,
    });
  });

  it.each([
    ["", "empty"],
    ["-1", "negative"],
    ["−3", "negative"],
    ["abc", "notWhole"],
    ["12,5", "notWhole"],
    ["+5", "notWhole"],
    [String(MAX_MATERIAL_PERCENT + 1), "tooBig"],
    ["99999999999999999999999", "tooBig"],
  ])("refuses %j as %s", (typed, refusal) => {
    expect(readMaterialPercentInput(typed)).toEqual({
      kind: "refused",
      refusal,
    });
  });

  it("accepts exactly the whole numbers from 0 to its own greatest, which is not the depth rule's", () => {
    for (let percent = -5; percent <= MAX_MATERIAL_PERCENT + 5; percent += 1) {
      const isInRange = percent >= 0 && percent <= MAX_MATERIAL_PERCENT;

      expect(
        readMaterialPercentInput(String(percent)).kind,
        String(percent),
      ).toBe(isInRange ? "percent" : "refused");
    }
    expect(MAX_MATERIAL_PERCENT).not.toBe(MAX_DEEP_CABINET_PERCENT);
    expect(
      readMaterialPercentInput(String(MAX_DEEP_CABINET_PERCENT + 1)).kind,
    ).toBe("percent");
  });
});

describe("a bulk percentage", () => {
  it.each([
    ["5", 5],
    ["+5", 5],
    ["-3", -3],
    ["−3", -3],
    [String(MAX_BULK_PERCENT), MAX_BULK_PERCENT],
    [String(MIN_BULK_PERCENT), MIN_BULK_PERCENT],
    ["+ 5", 5],
  ])("reads %j as %i", (typed, percent) => {
    expect(readBulkPercentInput(typed)).toEqual({ kind: "percent", percent });
  });

  it.each([
    ["", "empty"],
    ["+", "notWhole"],
    ["5,5", "notWhole"],
    ["abc", "notWhole"],
    ["+-5", "notWhole"],
    ["--5", "notWhole"],
    ["0", "zero"],
    ["+0", "zero"],
    ["-0", "zero"],
    [String(MAX_BULK_PERCENT + 1), "outOfRange"],
    [String(MIN_BULK_PERCENT - 1), "outOfRange"],
    ["9".repeat(400), "outOfRange"],
  ])("refuses %j as %s", (typed, refusal) => {
    expect(readBulkPercentInput(typed)).toEqual({ kind: "refused", refusal });
  });

  it("accepts exactly the whole numbers within the bounds except 0, over a sweep around both ends", () => {
    for (
      let percent = MIN_BULK_PERCENT - 3;
      percent <= MAX_BULK_PERCENT + 3;
      percent += 1
    ) {
      const isAccepted =
        percent !== 0 &&
        percent >= MIN_BULK_PERCENT &&
        percent <= MAX_BULK_PERCENT;

      expect(readBulkPercentInput(String(percent)).kind, String(percent)).toBe(
        isAccepted ? "percent" : "refused",
      );
    }
  });

  it("never reads -0 as a percentage", () => {
    const reading = readBulkPercentInput("-0");

    expect(reading.kind).toBe("refused");
  });
});

describe("an amount in lei typed over the prices already held", () => {
  const LEGACY_ACTIVE_MINOR = 396_050;

  it("reads the active price as an amount although it is not a whole ten of lei", () => {
    expect(readLeiInputOverHeld("3960,50", [LEGACY_ACTIVE_MINOR])).toEqual({
      kind: "amount",
      minor: LEGACY_ACTIVE_MINOR,
    });
  });

  it("still refuses any other amount that is not a whole ten of lei, the active price beside it or not", () => {
    for (const typed of ["3960,60", "3961", "12,5"]) {
      expect(readLeiInputOverHeld(typed, [LEGACY_ACTIVE_MINOR]), typed).toEqual(
        { kind: "refused", refusal: "notMultipleOfTen" },
      );
    }
  });

  it("reads a whole ten of lei as it does without an active price", () => {
    expect(readLeiInputOverHeld("3960", [LEGACY_ACTIVE_MINOR])).toEqual(
      readLeiInput("3960"),
    );
  });

  it("reads every held amount as an amount, the draft's beside the active one, and no amount beside them", () => {
    const held = [LEGACY_ACTIVE_MINOR, 396_075];

    expect(readLeiInputOverHeld("3960,75", held)).toEqual({
      kind: "amount",
      minor: 396_075,
    });
    expect(readLeiInputOverHeld("3960,50", held).kind).toBe("amount");
    expect(readLeiInputOverHeld("3960,60", held)).toEqual({
      kind: "refused",
      refusal: "notMultipleOfTen",
    });
  });
});

describe("an amount as a person types it back", () => {
  it.each([
    [396_000, "3960"],
    [396_050, "3960,50"],
    [1_250_000, "12500"],
    [5, "0,05"],
  ])("writes %i bani as %s, without the grouping spaces", (minor, typed) => {
    expect(plainLeiOf(minor)).toBe(typed);
  });
});
