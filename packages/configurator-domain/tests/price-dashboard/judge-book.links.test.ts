// M10 M4 (2), M4-c: a linked accessory's `linkedBuildId` names a catalogue row the book prices and the manufacturer
// supplies (A-19). The parser already holds a book to the last two; the catalogue is only known here.
import { describe, expect, it } from "vitest";

import {
  judgeBookAgainstCatalog,
  type BookRefusal,
} from "../../src/price-dashboard/judge-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";
import {
  bookWithLinked,
  CUSTOMER_ROW_IDS,
  linkedRule,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

import { CATALOG } from "./m2-support.js";

function refusalsOf(
  book: PriceBook,
  catalog: BodyCatalog = CATALOG,
): readonly BookRefusal[] {
  const judgement = judgeBookAgainstCatalog(book, catalog);
  return judgement.ok ? [] : judgement.refusals;
}

describe("a link to a row the catalogue prices and the manufacturer supplies", () => {
  it("is accepted for every such row of the shipped book, which is a floor of rows", () => {
    expect(SUPPLIED_ROW_IDS.length).toBeGreaterThanOrEqual(10);
    for (const linkedBuildId of SUPPLIED_ROW_IDS) {
      const book = bookWithLinked([linkedRule("organiser", { linkedBuildId })]);

      expect(refusalsOf(book)).toEqual([]);
    }
  });
});

describe("a link the catalogue cannot honour", () => {
  it("is refused when the book prices no row of that id, naming the accessory and the link", () => {
    const book = bookWithLinked([
      linkedRule("organiser", { linkedBuildId: "no-such-row" }),
    ]);

    expect(refusalsOf(book)).toEqual([
      {
        code: "LINK_TARGET_UNKNOWN",
        accessoryId: "organiser",
        linkedBuildId: "no-such-row",
      },
    ]);
  });

  it("is refused when the book has a rule for an id the catalogue does not price as itself", () => {
    const base = CATALOG.get("base-cabinet");
    if (base === undefined) throw new Error("no base-cabinet");
    const variant: BodyDefinition = {
      ...base,
      catalogEquivalentId: "base-cabinet",
      insertable: false,
    };
    const catalog: BodyCatalog = new Map([
      ...CATALOG,
      ["base-variant", variant],
    ]);
    const baseRule = SAMPLE_PRICE_BOOK.cabinetRules.find(
      (rule) => rule.buildId === "base-cabinet",
    );
    if (baseRule === undefined) throw new Error("no base-cabinet rule");
    const book: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: [
        ...SAMPLE_PRICE_BOOK.cabinetRules,
        {
          ...baseRule,
          ruleId: "cabinet.base-variant",
          buildId: "base-variant",
        },
      ],
      linkedAccessories: [
        linkedRule("organiser", { linkedBuildId: "base-variant" }),
      ],
    };

    expect(catalog.has("base-variant")).toBe(true);
    expect(
      refusalsOf(book, catalog).filter(
        ({ code }) => code === "LINK_TARGET_UNKNOWN",
      ),
    ).toEqual([
      {
        code: "LINK_TARGET_UNKNOWN",
        accessoryId: "organiser",
        linkedBuildId: "base-variant",
      },
    ]);
  });

  it("is refused for every row the customer supplies", () => {
    expect(CUSTOMER_ROW_IDS.length).toBeGreaterThan(0);
    for (const linkedBuildId of CUSTOMER_ROW_IDS) {
      const book = bookWithLinked([linkedRule("organiser", { linkedBuildId })]);

      expect(refusalsOf(book)).toEqual([
        {
          code: "LINK_TARGET_CUSTOMER_SUPPLIED",
          accessoryId: "organiser",
          linkedBuildId,
        },
      ]);
    }
  });

  it("names each linked accessory that fails, in book order, and not the ones that pass", () => {
    const book = bookWithLinked([
      linkedRule("first", { linkedBuildId: "no-such-row" }),
      linkedRule("fine", { linkedBuildId: "base-3drawer" }),
      linkedRule("last", { linkedBuildId: "other-missing-row" }),
    ]);

    expect(refusalsOf(book).map((refusal) => refusal.code)).toEqual([
      "LINK_TARGET_UNKNOWN",
      "LINK_TARGET_UNKNOWN",
    ]);
    expect(
      refusalsOf(book).flatMap((refusal) =>
        "accessoryId" in refusal ? [refusal.accessoryId] : [],
      ),
    ).toEqual(["first", "last"]);
  });
});
