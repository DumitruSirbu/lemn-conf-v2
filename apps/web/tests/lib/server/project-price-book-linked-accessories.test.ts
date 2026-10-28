import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  parsePriceBook,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { projectPriceBook } from "@/lib/server/project-price-book";
import { NOTHING_DISABLED } from "../../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../../support/deepening-rows";

// M10 P4b: the page is handed the book the projection copies, so a member it leaves out is a price the browser cannot
// form. The browser parses the projected book, so a projection that dropped `linkedAccessories` would refuse every price
// on every page, not only the ones that earn an accessory.

const LINKED_BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: "organiser",
      ruleId: "accessory.organiser",
      linkedBuildId: "base-3drawer",
      perUnitMinor: 25_000,
      name: "Organizator",
      description: "Pentru un sertar.",
    },
    {
      accessoryId: "plinth-light",
      ruleId: "accessory.plinth-light",
      linkedBuildId: "base-sink",
      perUnitMinor: 12_000,
      name: "Lumina de plinta",
    },
  ],
};

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

describe("the projection keeps the accessories the dashboard created", () => {
  it("returns a book holding them unchanged, which still parses", () => {
    expect(projectPriceBook(LINKED_BOOK)).toEqual(LINKED_BOOK);
    expect(parsePriceBook(projectPriceBook(LINKED_BOOK)).ok).toBe(true);
  });

  it("prices the kitchen as the book it projects does, including each linked accessory's line", () => {
    const projected = priced(projectPriceBook(LINKED_BOOK));

    expect(projected).toEqual(priced(LINKED_BOOK));
    expect(
      projected.ok &&
        projected.priced.lines
          .filter((line) => line.kind === "accessory")
          .map((line) => line.accessoryId),
    ).toEqual([
      "sinkProtectiveCover",
      "dishDryingRack",
      "organiser",
      "plinth-light",
    ]);
  });

  it("loses a member a created row does not declare, as it does on every other row", () => {
    const stored = {
      ...LINKED_BOOK,
      linkedAccessories: LINKED_BOOK.linkedAccessories.map((row) => ({
        ...row,
        nameRu: "leaked-text-7c41",
      })),
    };

    const projected = projectPriceBook(stored);

    expect(JSON.stringify(projected)).not.toContain("leaked-text-7c41");
    expect(projected).toEqual(LINKED_BOOK);
  });
});
