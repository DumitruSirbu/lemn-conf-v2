// **Adversarial QA for wave 6B-f2: where a catalogue key stops being usable.**
//
// `parse-price-book.test.ts` covers a key that is empty, a number, an object, null, or 5 000
// characters long. None of those touch the boundary the module actually states —
// `MAX_TEXT_KEY_LENGTH`, at 80 — so an off-by-one there would be invisible: 5 000 is refused
// whether the bound reads `<`, `<=` or `< 79`.
//
// The bound exists for `MAX_IDENTIFIER_LENGTH`'s reason, which is that a book is data assembled
// outside TypeScript and an unbounded string it states is a free multiplier on every refusal message
// it reaches. So the two sides of the boundary are swept as a range rather than as one example.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const BOOK = SAMPLE_PRICE_BOOK;

/** The longest key `parse-price-book.ts` states a book may name, restated here so a change to the
 *  bound fails this file rather than silently widening it. */
const MAX_TEXT_KEY_LENGTH = 80;

/** The sample book with its first material tier naming `key` for its name. Chosen because
 *  that tier is `material.melamine`, the book's own default, so the seeded design prices through it
 *  and a refusal cannot come from the row being unreachable. */
function bookNamingKey(key: string, field: "nameKey" | "descriptionKey") {
  const [first, ...rest] = BOOK.material.tiers;
  if (!first) throw new Error("the sample offers no material tier");
  return {
    ...BOOK,
    material: {
      ...BOOK.material,
      tiers: [{ ...first, [field]: key }, ...rest],
    },
  } as unknown as PriceBook;
}

function pricesWith(book: PriceBook): boolean {
  return priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: BOOK.version,
  }).ok;
}

/** A key of exactly `length` characters that still looks like a catalogue path, so the only thing
 *  varying across the sweep is its length. */
function keyOfLength(length: number): string {
  const prefix = "priceBook.material.melamine.";
  if (length <= prefix.length) return "k".repeat(length);
  return prefix + "k".repeat(length - prefix.length);
}

describe("a catalogue key is bounded, and the boundary is where the module says", () => {
  it("states the bound this file sweeps", () => {
    // Anti-vacuity: the sweep below is only a boundary test while the two sides straddle 80.
    expect(keyOfLength(MAX_TEXT_KEY_LENGTH)).toHaveLength(80);
  });

  it.each([1, 40, 79, 80])(
    "accepts a %i-character key on both keyed fields",
    (length) => {
      for (const field of ["nameKey", "descriptionKey"] as const) {
        const book = bookNamingKey(keyOfLength(length), field);
        expect(parsePriceBook(book).ok, `${field}:${String(length)}`).toBe(
          true,
        );
        expect(pricesWith(book), `${field}:${String(length)}`).toBe(true);
      }
    },
  );

  it.each([81, 82, 240])(
    "refuses a %i-character key on both keyed fields",
    (length) => {
      for (const field of ["nameKey", "descriptionKey"] as const) {
        const book = bookNamingKey(keyOfLength(length), field);
        expect(parsePriceBook(book).ok, `${field}:${String(length)}`).toBe(
          false,
        );
        expect(pricesWith(book), `${field}:${String(length)}`).toBe(false);
      }
    },
  );

  it("names the field and the length it refused, rather than the book", () => {
    // A refusal that cannot be acted on is the failure `MAX_IDENTIFIER_LENGTH` was bounded to avoid
    // amplifying: the message has to say which of a book's rows and which of its two keyed fields.
    const result = parsePriceBook(bookNamingKey(keyOfLength(500), "nameKey"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(result.failure.detail).toContain("nameKey");
    expect(result.failure.detail).toContain("500");
  });
});
