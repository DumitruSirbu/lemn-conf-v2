// Adversarial QA for P3-e (M10 P3-Q3): a tier or an accessory row is closed-key. `parse-row-members.test.ts` plants a stray
// key on one hardware tier, one material tier and two accessories; this file goes where it does not: every tier of both
// groups and every accessory the book can hold, a key that arrives as a JSON own property named like an object slot, a
// key the row inherits, the order of the two refusals on a book still in the retired form, and a value of every type.
// The retired field is planted from this file; production names it nowhere.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import { ACCESSORY_IDS } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const RETIRED_FLAT_FIELD = "wholeKitchenMinor";

type Row = Record<string, unknown>;

function bookWithRow(
  section: "hardware" | "material" | "accessory",
  at: number | string,
  edit: (row: Row) => Row,
): unknown {
  const book = structuredClone(SAMPLE_PRICE_BOOK) as unknown as Record<
    string,
    unknown
  >;
  const rows =
    section === "accessory"
      ? (book["accessories"] as Record<string, Row>)
      : (book[section] as { tiers: Record<string, Row> }).tiers;
  const row = rows[at];
  if (row === undefined) throw new Error(`the sample has no row ${String(at)}`);
  rows[at] = edit(row);
  return book;
}

function refusalDetail(book: unknown): string {
  const parsed = parsePriceBook(book);
  if (parsed.ok) throw new Error("expected the book to be refused");
  expect(parsed.failure.code).toBe("INVALID_PRICE_BOOK");
  return parsed.failure.detail;
}

const HARDWARE_ROWS = SAMPLE_PRICE_BOOK.hardware.tiers.map((tier, index) => ({
  index,
  tierId: tier.tierId,
}));
const MATERIAL_ROWS = SAMPLE_PRICE_BOOK.material.tiers.map((tier, index) => ({
  index,
  tierId: tier.tierId,
}));

describe("P3-e: every row the book can hold is closed-key, not a sample of them", () => {
  it("has the rows the sweep below assumes", () => {
    expect(HARDWARE_ROWS.length).toBeGreaterThanOrEqual(2);
    expect(MATERIAL_ROWS.length).toBeGreaterThanOrEqual(2);
    expect(ACCESSORY_IDS.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(SAMPLE_PRICE_BOOK.accessories).sort()).toEqual(
      [...ACCESSORY_IDS].sort(),
    );
  });

  it.each(HARDWARE_ROWS)(
    "refuses a stray flat amount on hardware tier $tierId, naming the tier",
    ({ index, tierId }) => {
      const detail = refusalDetail(
        bookWithRow("hardware", index, (row) => ({
          ...row,
          [RETIRED_FLAT_FIELD]: 130_000,
        })),
      );

      expect(detail).toContain(`hardware tier "${tierId}"`);
      expect(detail).toContain(RETIRED_FLAT_FIELD);
    },
  );

  it.each(MATERIAL_ROWS)(
    "refuses a stray flat amount on material tier $tierId, the default tier included, naming the tier",
    ({ index, tierId }) => {
      const detail = refusalDetail(
        bookWithRow("material", index, (row) => ({
          ...row,
          [RETIRED_FLAT_FIELD]: 130_000,
        })),
      );

      expect(detail).toContain(`material tier "${tierId}"`);
      expect(detail).toContain(RETIRED_FLAT_FIELD);
    },
  );

  it.each([...ACCESSORY_IDS])(
    "refuses a stray flat amount on accessory %s, naming the accessory",
    (accessoryId) => {
      const detail = refusalDetail(
        bookWithRow("accessory", accessoryId, (row) => ({
          ...row,
          [RETIRED_FLAT_FIELD]: 130_000,
        })),
      );

      expect(detail).toContain(`accessory "${accessoryId}"`);
      expect(detail).toContain(RETIRED_FLAT_FIELD);
    },
  );
});

describe("P3-e: the refusal does not depend on how the key got there", () => {
  it("refuses a key that is an own property named like an object slot (JSON.parse keeps __proto__ as data)", () => {
    const tierId = MATERIAL_ROWS[1]?.tierId ?? "";
    const tierJson = JSON.stringify(
      SAMPLE_PRICE_BOOK.material.tiers[1],
    ).replace(/^\{/, '{"__proto__":{"x":1},');
    const book = structuredClone(SAMPLE_PRICE_BOOK) as unknown as {
      material: { tiers: unknown[] };
    };
    book.material.tiers[1] = JSON.parse(tierJson);

    expect(Object.keys(book.material.tiers[1] as object)).toContain(
      "__proto__",
    );
    expect(refusalDetail(book)).toContain(`material tier "${tierId}"`);
  });

  it("refuses a key the row inherits from its prototype", () => {
    const inheriting = bookWithRow("hardware", 1, (row) =>
      Object.assign(
        Object.create({ [RETIRED_FLAT_FIELD]: 130_000 }) as Row,
        row,
      ),
    );

    expect(refusalDetail(inheriting)).toContain(RETIRED_FLAT_FIELD);
  });

  it("refuses the stray key on a row whose declared members are all present, whatever the type of its value", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.double({ noNaN: false }),
          fc.string(),
          fc.boolean(),
          fc.constant(null),
          fc.constant([]),
          fc.constant({}),
        ),
        fc.constantFrom("hardware", "material", "accessory" as const),
        (value, section) => {
          const at = section === "accessory" ? (ACCESSORY_IDS[0] as string) : 0;
          const detail = refusalDetail(
            bookWithRow(section, at, (row) => ({
              ...row,
              [RETIRED_FLAT_FIELD]: value,
            })),
          );

          expect(detail).toContain(RETIRED_FLAT_FIELD);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("does not let a stray key on a later tier hide behind a clean first tier", () => {
    const last = SAMPLE_PRICE_BOOK.hardware.tiers.length - 1;

    const detail = refusalDetail(
      bookWithRow("hardware", last, (row) => ({ ...row, strayRate: 1 })),
    );

    expect(detail).toContain("strayRate");
  });
});

describe("P3-e: a book still in the retired form is refused for what it lacks, not only for what it carries", () => {
  it("names the missing percentage on a material tier that carries the retired flat amount instead", () => {
    const retired = bookWithRow("material", 1, (row) => {
      const { percentOfCabinets, ...identity } = row;
      void percentOfCabinets;
      return { ...identity, [RETIRED_FLAT_FIELD]: 900_000 };
    });

    const detail = refusalDetail(retired);

    expect(detail).toContain("percentOfCabinets");
  });
});
