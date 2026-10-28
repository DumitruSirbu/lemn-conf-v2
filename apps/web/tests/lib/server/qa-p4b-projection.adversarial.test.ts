import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  parsePriceBook,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  type LinkedAccessoryRule,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readBookOf } from "@/lib/server/active-price-book";
import { projectPriceBook } from "@/lib/server/project-price-book";
import { NOTHING_DISABLED } from "../../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../../support/deepening-rows";

// M10 P4b, adversarial: the projection hands the browser the book it prices with, so every member of a linked accessory
// must cross, and nothing the book does not declare may. The members are read off the book itself, not off the
// projection's own list, so a member added to the rule and left out of the projection is caught here.

const MAX_LINKED_ACCESSORIES = 50;

function aLinkedRule(index: number, described: boolean): LinkedAccessoryRule {
  return {
    accessoryId: `accessory-${String(index)}`,
    ruleId: `rule.accessory-${String(index)}`,
    linkedBuildId: "base-3drawer",
    perUnitMinor: 1_000 * (index + 1),
    name: `Accesoriu ${String(index)}`,
    ...(described ? { description: `Descriere ${String(index)}.` } : {}),
  };
}

function bookWith(rules: readonly LinkedAccessoryRule[]): PriceBook {
  return { ...SAMPLE_PRICE_BOOK, linkedAccessories: rules };
}

function priced(book: PriceBook) {
  return priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: buildKitchenLBodyCatalog(600),
    book,
    pricingVersion: book.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    selections: KITCHEN_L_DESIGN.settings,
  });
}

describe("the projection carries every linked accessory across, whole", () => {
  it("keeps every member of every row, with and without a description, up to the bound", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { maxLength: MAX_LINKED_ACCESSORIES }),
        (described) => {
          const book = bookWith(
            described.map((withDescription, index) =>
              aLinkedRule(index, withDescription),
            ),
          );

          const projected = projectPriceBook(book);

          expect(projected).toEqual(book);
          expect(parsePriceBook(projected).ok).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("keeps a row's own order, which is the order its lines are published in", () => {
    const rules = [3, 1, 2].map((index) => aLinkedRule(index, true));

    expect(
      projectPriceBook(bookWith(rules)).linkedAccessories.map(
        (rule) => rule.accessoryId,
      ),
    ).toEqual(rules.map((rule) => rule.accessoryId));
  });

  it("omits a description the row does not state rather than carrying an undefined one", () => {
    const projected = projectPriceBook(bookWith([aLinkedRule(0, false)]));

    expect(Object.keys(projected.linkedAccessories[0] ?? {})).not.toContain(
      "description",
    );
  });

  it("carries every key the book's own type lists for a linked row, read from a fully stated row", () => {
    const row = aLinkedRule(0, true);
    const projected = projectPriceBook(bookWith([row])).linkedAccessories[0];

    expect(Object.keys(projected ?? {}).sort()).toEqual(
      Object.keys(row).sort(),
    );
  });

  it("carries every top-level section of the book: none is dropped by name", () => {
    const projected = projectPriceBook(bookWith([aLinkedRule(0, true)]));

    expect(Object.keys(projected).sort()).toEqual(
      Object.keys(bookWith([aLinkedRule(0, true)])).sort(),
    );
  });

  it("copies the rows, so editing the projection never edits the book it was made from", () => {
    const book = bookWith([aLinkedRule(0, true)]);

    const projected = projectPriceBook(book) as unknown as {
      linkedAccessories: { perUnitMinor: number }[];
    };
    const row = projected.linkedAccessories[0];
    if (row === undefined) throw new Error("the projection lost the row");
    row.perUnitMinor = 1;

    expect(book.linkedAccessories[0]?.perUnitMinor).toBe(1_000);
  });

  it("prices every kitchen the book prices, line for line, with a linked accessory on", () => {
    const book = bookWith([aLinkedRule(0, true), aLinkedRule(1, false)]);

    expect(JSON.stringify(priced(projectPriceBook(book)))).toBe(
      JSON.stringify(priced(book)),
    );
  });

  it("refuses to carry a key a created row does not declare, in any spelling of the Russian", () => {
    const stray = { nameRu: "x", descriptionRu: "y", ru: "z", nameKey: "k" };
    const book = {
      ...bookWith([aLinkedRule(0, true)]),
      linkedAccessories: [{ ...aLinkedRule(0, true), ...stray }],
    } as unknown as PriceBook;

    const projected = JSON.stringify(projectPriceBook(book));

    for (const value of Object.values(stray)) {
      expect(projected).not.toContain(`"${value}"`);
    }
  });
});

describe("the stored book reaches the browser with its linked accessories (the one read path)", () => {
  const versionOf = (book: unknown) => ({
    versionId: "stored-version",
    sequenceNumber: 1,
    label: "A label",
    publishedAt: new Date(0),
    book,
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads a stored book after a JSON round trip, keeping every linked row", () => {
    const book = {
      ...bookWith([aLinkedRule(0, true), aLinkedRule(1, false)]),
      version: "stored-version",
    };

    const read = readBookOf(versionOf(JSON.parse(JSON.stringify(book))));

    expect(read).toEqual(book);
  });

  it("reads no book from a stored one that lacks the list, since none may be read as an empty list", () => {
    const { linkedAccessories, ...beforeP4b } = SAMPLE_PRICE_BOOK;
    void linkedAccessories;

    expect(
      readBookOf(versionOf({ ...beforeP4b, version: "stored-version" })),
    ).toBeUndefined();
  });
});
