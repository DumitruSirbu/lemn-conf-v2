// What a person types into a price or a percentage field is read before anything is sent: an amount in lei as whole bani, the
// depth rule's percentage from 0 to the book's greatest, and a bulk percentage that is whole, signed, not 0, and within the
// action's bounds. A value that is not one of these is a refusal with a closed reason, never a number.
import { describe, expect, it } from "vitest";

import {
  MAX_BULK_PERCENT,
  MAX_DEEP_CABINET_PERCENT,
  MIN_BULK_PERCENT,
} from "@lemnaria/configurator-domain";

import {
  readBulkPercentInput,
  readDepthPercentInput,
  readLeiInput,
} from "@/price-dashboard/price-field-input";

const NBSP = " ";

describe("an amount in lei", () => {
  it.each([
    ["450", 45_000],
    ["450,5", 45_050],
    ["450,25", 45_025],
    ["450.25", 45_025],
    ["450,", 45_000],
    ["0", 0],
    ["0,05", 5],
    ["007", 700],
    [`1${NBSP}450,25`, 145_025],
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
    ["9".repeat(14), "tooBig"],
    ["9".repeat(40), "tooBig"],
  ])("refuses %j as %s", (typed, refusal) => {
    expect(readLeiInput(typed)).toEqual({ kind: "refused", refusal });
  });

  it("reads the same bani whatever the grouping spaces, for every whole-lei amount in a sweep", () => {
    for (let lei = 0; lei <= 200_000; lei += 997) {
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
