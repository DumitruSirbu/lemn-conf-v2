// M10 P4b, adversarial: the linked accessories a book holds survive every dashboard path that makes a book from a book
// (apply a change, a bulk action, a restore). The list is required, so a path that rebuilt the book without it would
// publish a book the parser refuses, and the site would lose every price.
import { describe, expect, it } from "vitest";

import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import { planBulkChange } from "../../src/price-dashboard/bulk-change.js";
import {
  changeFromReading,
  readEditableFields,
} from "../../src/price-dashboard/editable-fields.js";
import { restoreChanges } from "../../src/price-dashboard/restore.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

import { CATALOG } from "./m2-support.js";

const LINKED = [
  linkedRule("organiser", {
    linkedBuildId: "base-3drawer",
    description: "Pentru un sertar.",
  }),
  linkedRule("plinth-light", { linkedBuildId: "base-sink" }),
];
const BOOK = bookWithLinked(LINKED);

function expectBookIntact(result: ReturnType<typeof applyChanges>): PriceBook {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  expect(result.book.linkedAccessories).toEqual(LINKED);
  expect(parsePriceBook(result.book).ok).toBe(true);
  return result.book;
}

describe("a change to any editable field leaves the linked accessories in the book", () => {
  const readings = readEditableFields(BOOK);

  it("has editable fields to try", () => {
    expect(readings.length).toBeGreaterThan(20);
  });

  it("restating every field at once gives the same book", () => {
    const restated = applyChanges(BOOK, readings.map(changeFromReading));

    expect(expectBookIntact(restated)).toEqual(BOOK);
  });

  it.each(readings.map((reading, index) => [index, reading] as const))(
    "keeps the list when field %i changes on its own",
    (_, reading) => {
      const changed =
        typeof reading.value === "number"
          ? reading.value + 1_000
          : !reading.value;

      const result = applyChanges(BOOK, [
        changeFromReading({ address: reading.address, value: changed }),
      ]);

      if (!result.ok && result.reason === "changes-refused") return;
      expectBookIntact(result);
    },
  );
});

describe("the single-field sweep is not vacuous", () => {
  it("lets most single-field changes through, so most of the cases above test the book that is made", () => {
    const readings = readEditableFields(BOOK);
    const accepted = readings.filter((reading) => {
      const value =
        typeof reading.value === "number"
          ? reading.value + 1_000
          : !reading.value;
      return applyChanges(BOOK, [
        changeFromReading({ address: reading.address, value }),
      ]).ok;
    });

    expect(accepted.length).toBeGreaterThan(readings.length / 2);
  });
});

describe("a bulk action and a restore leave the linked accessories in the book", () => {
  it("applies a planned bulk change to a book that still holds them", () => {
    const plan = planBulkChange({
      book: BOOK,
      catalog: CATALOG,
      target: { scope: "all" },
      percent: 10,
    });
    if (plan.kind === "refused") throw new Error(plan.code);

    const result = applyChanges(
      BOOK,
      plan.changes.map((change) => changeFromReading(change)),
    );

    expect(plan.changes.length).toBeGreaterThan(0);
    expectBookIntact(result);
  });

  it("restores an archived book over an active one without touching either's list", () => {
    const changes = restoreChanges(SAMPLE_PRICE_BOOK, BOOK);

    expectBookIntact(applyChanges(BOOK, changes));
    expect(BOOK.linkedAccessories).toEqual(LINKED);
  });
});
