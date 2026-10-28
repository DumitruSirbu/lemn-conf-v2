// A tier or an accessory row states exactly the members its type declares (M10 P3-e, P3-Q3). A key outside the list is
// refused with a detail naming the row, so a stray flat amount beside a percentage cannot be silently dropped from
// every price. The retired field is planted from this file; production names it nowhere.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const RETIRED_FLAT_FIELD = "wholeKitchenMinor";

type Plant = (
  book: typeof SAMPLE_PRICE_BOOK,
  key: string,
  value: unknown,
) => unknown;

interface RowUnderTest {
  readonly rowName: string;
  /** The id the refusal carries: a tier id, or the accessory's name in the book. */
  readonly rowId: string;
  readonly plantIn: Plant;
}

const plantInTier =
  (group: "hardware" | "material", tierIndex: number): Plant =>
  (book, key, value) => ({
    ...book,
    [group]: {
      ...book[group],
      tiers: book[group].tiers.map((tier, index) =>
        index === tierIndex ? { ...tier, [key]: value } : tier,
      ),
    },
  });

const plantInAccessory =
  (accessoryId: keyof typeof SAMPLE_PRICE_BOOK.accessories): Plant =>
  (book, key, value) => ({
    ...book,
    accessories: {
      ...book.accessories,
      [accessoryId]: { ...book.accessories[accessoryId], [key]: value },
    },
  });

const ROWS: readonly RowUnderTest[] = [
  {
    rowName: `hardware tier "${SAMPLE_PRICE_BOOK.hardware.tiers[1]?.tierId ?? ""}"`,
    rowId: SAMPLE_PRICE_BOOK.hardware.tiers[1]?.tierId ?? "",
    plantIn: plantInTier("hardware", 1),
  },
  {
    rowName: `material tier "${SAMPLE_PRICE_BOOK.material.tiers[1]?.tierId ?? ""}"`,
    rowId: SAMPLE_PRICE_BOOK.material.tiers[1]?.tierId ?? "",
    plantIn: plantInTier("material", 1),
  },
  {
    rowName: 'accessory "sinkProtectiveCover"',
    rowId: "sinkProtectiveCover",
    plantIn: plantInAccessory("sinkProtectiveCover"),
  },
  {
    rowName: 'accessory "dishDryingRack"',
    rowId: "dishDryingRack",
    plantIn: plantInAccessory("dishDryingRack"),
  },
];

function refusalOf(book: unknown) {
  const parsed = parsePriceBook(book);
  if (parsed.ok) throw new Error("expected the book to be refused");
  return parsed.failure;
}

describe("a row carrying a key outside its declared list is refused, naming the row (P3-e)", () => {
  it("accepts the sample book, whose rows state only declared members", () => {
    expect(parsePriceBook(SAMPLE_PRICE_BOOK).ok).toBe(true);
  });

  for (const { rowName, rowId, plantIn } of ROWS) {
    it(`refuses a stray flat amount on the ${rowName}`, () => {
      const failure = refusalOf(
        plantIn(SAMPLE_PRICE_BOOK, RETIRED_FLAT_FIELD, 130_000),
      );

      expect(failure.code).toBe("INVALID_PRICE_BOOK");
      expect(failure.detail).toContain(rowName);
      expect(failure.detail).toContain(RETIRED_FLAT_FIELD);
      expect(failure.id).toBe(rowId);
    });

    it(`refuses any undeclared key on the ${rowName}, whatever it holds`, () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][A-Za-z0-9]{0,24}$/),
          fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null)),
          (key, value) => {
            const failure = refusalOf(
              plantIn(SAMPLE_PRICE_BOOK, `stray${key}`, value),
            );

            expect(failure.detail).toContain(rowName);
            expect(failure.detail).toContain(`stray${key}`);
          },
        ),
        { numRuns: 100 },
      );
    });

    it(`treats an undeclared key holding undefined on the ${rowName} as absent`, () => {
      const book = plantIn(SAMPLE_PRICE_BOOK, "strayField", undefined);

      expect(parsePriceBook(book).ok).toBe(true);
    });
  }
});
