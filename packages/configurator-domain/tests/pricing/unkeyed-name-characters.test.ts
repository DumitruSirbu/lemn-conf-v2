// M10 M4 fix wave: a row that names no catalogue key is held to the characters a created linked accessory's name is,
// in its name and in its description.
import { describe, expect, it } from "vitest";

import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

function withFirstHardwareTier(row: Record<string, unknown>): PriceBook {
  const [first, ...rest] = SAMPLE_PRICE_BOOK.hardware.tiers;
  if (first === undefined) throw new Error("the sample book has no hardware");
  return {
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: [{ ...first, ...row }, ...rest],
    },
  } as PriceBook;
}

describe("an unkeyed tier's name", () => {
  it.each([
    ["a line feed", "Nou\nrand"],
    ["a direction override", "Nou\u202eabc"],
    ["a decomposed letter", "Nou a\u0306"],
  ])("is refused with %s", (_label, name) => {
    const book = withFirstHardwareTier({
      nameKey: undefined,
      name,
    });

    expect(parsePriceBook(book).ok).toBe(false);
  });

  it("may hold any character when the tier names its catalogue key", () => {
    const book = withFirstHardwareTier({
      nameKey: "priceBook.hardware.soft-close.name",
      name: "Nou\nrand",
    });

    expect(parsePriceBook(book).ok).toBe(true);
  });

  it("is accepted when it is plain text", () => {
    const book = withFirstHardwareTier({ nameKey: undefined, name: "Nou" });

    expect(parsePriceBook(book).ok).toBe(true);
  });
});

describe("an unkeyed tier's description", () => {
  it.each([
    ["a line feed", "Nou\nrand"],
    ["a direction override", "Nou\u202eabc"],
    ["a decomposed letter", "Nou a\u0306"],
  ])(
    "is refused with %s, though the tier names its name key",
    (_label, description) => {
      const book = withFirstHardwareTier({
        descriptionKey: undefined,
        description,
      });

      expect(parsePriceBook(book).ok).toBe(false);
    },
  );

  it("may hold any character when the tier names its description key", () => {
    const book = withFirstHardwareTier({
      descriptionKey: "priceBook.hardware.soft-close.description",
      description: "Nou\nrand",
    });

    expect(parsePriceBook(book).ok).toBe(true);
  });

  it("is plain in every row of the shipped sample book", () => {
    expect(parsePriceBook(SAMPLE_PRICE_BOOK).ok).toBe(true);
  });

  it("may be empty, as a created class's is", () => {
    const book = withFirstHardwareTier({
      nameKey: undefined,
      descriptionKey: undefined,
      description: "",
    });

    expect(parsePriceBook(book).ok).toBe(true);
  });
});
