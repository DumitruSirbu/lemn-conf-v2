// What a person may type as an accessory's price per unit against what the book accepts: every amount the field reads is
// one the domain takes (as a creation and as a change of a price), whole tens of lei only, from zero up to the greatest
// the draft's own judgement takes, and nothing else reads. Swept over the whole range rather than at a few examples.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  MAX_PRICE_COEFFICIENT_MINOR,
  SAMPLE_PRICE_BOOK,
  TEN_LEI_MINOR,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import {
  readLeiInput,
  readLeiInputOverHeld,
} from "@/price-dashboard/price-field-input";

import {
  bookWithLinked,
  LINKED_BUILD_ID,
  PUBLISHED_RULE,
} from "./accessory-harness";

const BANI_PER_LEU = 100;
const LEI_PER_TEN = 10;
const GREATEST_TENS_LEI = Math.floor(
  MAX_PRICE_COEFFICIENT_MINOR / TEN_LEI_MINOR,
);
const GREATEST_MINOR = GREATEST_TENS_LEI * TEN_LEI_MINOR;

const refused = (refusal: string) => ({ kind: "refused", refusal });
const amount = (minor: number) => ({ kind: "amount", minor });

function creationWith(perUnitMinor: number): DraftChange {
  return {
    address: { kind: "accessory-created", accessoryId: "created-1" },
    value: { linkedBuildId: LINKED_BUILD_ID, perUnitMinor, name: "Suport" },
  };
}

function priceChangeWith(perUnitMinor: number): DraftChange {
  return {
    address: {
      kind: "accessory",
      accessoryId: "dishDryingRack",
      field: "perUnitMinor",
    },
    value: perUnitMinor,
  };
}

describe("the price of an accessory as typed", () => {
  it.each([
    ["0", amount(0)],
    ["10", amount(1_000)],
    ["  10  ", amount(1_000)],
    ["10,00", amount(1_000)],
    ["10.0", amount(1_000)],
    ["0010", amount(1_000)],
    ["1 000", amount(100_000)],
    ["15", refused("notMultipleOfTen")],
    ["9", refused("notMultipleOfTen")],
    ["10,5", refused("notMultipleOfTen")],
    ["10.001", refused("tooManyDecimals")],
    ["", refused("empty")],
    ["   ", refused("empty")],
    ["-10", refused("negative")],
    ["-0", refused("negative")],
    ["−10", refused("negative")],
    ["abc", refused("notNumber")],
    ["1e3", refused("notNumber")],
    ["+10", refused("notNumber")],
    ["10 lei", refused("notNumber")],
    ["١٠", refused("notNumber")],
    ["１０", refused("notNumber")],
    ["NaN", refused("notNumber")],
    ["Infinity", refused("notNumber")],
    ["99999999999999999999", refused("tooBig")],
    ["9".repeat(400), refused("tooBig")],
  ])("reads %j as %j", (typed, expected) => {
    expect(readLeiInput(typed)).toEqual(expected);
  });

  it("reads the greatest whole ten lei the book takes, and refuses the next ten", () => {
    expect(readLeiInput(String(GREATEST_TENS_LEI * LEI_PER_TEN))).toEqual(
      amount(GREATEST_MINOR),
    );
    expect(readLeiInput(String((GREATEST_TENS_LEI + 1) * LEI_PER_TEN))).toEqual(
      refused("tooBig"),
    );
  });

  it("reads a whole number of lei as an amount exactly when it is a multiple of ten, over the whole range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (lei) => {
        const reading = readLeiInput(String(lei));

        if (lei % LEI_PER_TEN === 0) {
          expect(reading).toEqual(amount(lei * BANI_PER_LEU));
        } else {
          expect(reading).toEqual(refused("notMultipleOfTen"));
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("reads nothing as an amount that is not whole bani, not a multiple of ten lei, or not a number", () => {
    fc.assert(
      fc.property(fc.string(), (typed) => {
        const reading = readLeiInput(typed);

        if (reading.kind === "amount") {
          expect(Number.isSafeInteger(reading.minor)).toBe(true);
          expect(reading.minor).toBeGreaterThanOrEqual(0);
          expect(reading.minor % TEN_LEI_MINOR).toBe(0);
          expect(reading.minor).toBeLessThanOrEqual(
            MAX_PRICE_COEFFICIENT_MINOR,
          );
        }
      }),
      { numRuns: 2_000 },
    );
  });

  it("keeps an amount the screen already holds typeable in any size, and no other off-grain one", () => {
    const held = [12_345, 0];

    expect(readLeiInputOverHeld("123,45", held)).toEqual(amount(12_345));
    expect(readLeiInputOverHeld("123,46", held)).toEqual(
      refused("notMultipleOfTen"),
    );
    expect(readLeiInputOverHeld("15", held)).toEqual(
      refused("notMultipleOfTen"),
    );
  });
});

describe("what the field reads against what the book takes", () => {
  const books: readonly [string, PriceBook][] = [
    ["the sample book", SAMPLE_PRICE_BOOK],
    ["a book that holds a linked accessory", bookWithLinked([PUBLISHED_RULE])],
  ];

  it.each(books)(
    "takes every amount the field reads, as a created accessory's price and as a built-in's change, in %s",
    (_label, book) => {
      const probes = [
        0,
        TEN_LEI_MINOR,
        GREATEST_MINOR - TEN_LEI_MINOR,
        GREATEST_MINOR,
      ];
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constantFrom(...probes),
            fc
              .integer({ min: 0, max: GREATEST_TENS_LEI })
              .map((tens) => tens * TEN_LEI_MINOR),
          ),
          (minor) => {
            expect(readLeiInput(String(minor / BANI_PER_LEU))).toEqual(
              amount(minor),
            );
            expect(applyChanges(book, [creationWith(minor)]).ok).toBe(true);
            expect(applyChanges(book, [priceChangeWith(minor)]).ok).toBe(true);
          },
        ),
        { numRuns: 500 },
      );
    },
  );

  it("refuses, as the field does, one ten lei past the greatest and a negative price", () => {
    expect(
      applyChanges(SAMPLE_PRICE_BOOK, [
        creationWith(GREATEST_MINOR + TEN_LEI_MINOR),
      ]).ok,
    ).toBe(false);
    expect(
      applyChanges(SAMPLE_PRICE_BOOK, [creationWith(-TEN_LEI_MINOR)]).ok,
    ).toBe(false);
    expect(
      applyChanges(SAMPLE_PRICE_BOOK, [priceChangeWith(-TEN_LEI_MINOR)]).ok,
    ).toBe(false);
  });
});
