// **Two zeros that mean different things, and the seam that keeps them apart.**
//
// The owner's ruling of 2026-09-10: the extractor hood and the free-standing fridge are *"drawn,
// displayed, but not included in the price, and not provided by the manufacturer."* A book says so
// with `suppliedBy: "customer"`; `priceOnePlacement` carries it onto the line; the breakdown prints
// *nu este inclus* over it instead of *inclus*.
//
// **What this file exists to falsify is the shortcut**, which is to read `amountMinor === 0`. A
// cabinet that costs nothing is not the same fact as a cabinet nobody supplies, so the tests below
// build a **manufacturer** row priced at nothing and require it to stay a manufacturer row.
//
// PAL melaminat is usually cited here and is the wrong example: it is free, but it is a *material*
// row and never reaches the cabinet path. The row has to be built because the shipped kitchen
// contains no zero-priced manufacturer cabinet — which is also why the guard is unexercised in
// production and rests on cases like these.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import {
  CABINET_SUPPLIERS,
  DEFAULT_CABINET_SUPPLIER,
  drawnButNotSupplied,
  type CabinetPriceRule,
  type PriceBook,
} from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type {
  CabinetPriceLine,
  PricingFailure,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { NOTHING_DISABLED } from "../support/availability.js";

const BOOK = SAMPLE_PRICE_BOOK;

/** A formula that costs `anchorMinor` at every width, which is how an anchored shape says a row is flat. */
function costingAtEveryWidth(anchorMinor: number): CabinetPriceRule["formula"] {
  return {
    shape: "anchored-width",
    anchorWidthMm: 600,
    anchorMinor,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 0,
  };
}

/** The two catalogue rows the owner ruled are appliances rather than joinery. The housings around
 *  them — `tall-oven-tower`, `tall-fridge-housing`, the hob bases, the dishwasher base — are
 *  carpentry and are deliberately absent. */
const NOT_SUPPLIED_BUILD_IDS = ["fridge-free", "hood"] as const;

function bookWithRules(rules: readonly CabinetPriceRule[]): PriceBook {
  return { ...BOOK, cabinetRules: rules };
}

function cabinetLinesOf(book: PriceBook): readonly CabinetPriceLine[] {
  const result = priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: BOOK.version,
  });
  if (!result.ok)
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  return result.priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function refusalFrom(book: unknown): PricingFailure {
  const parsed = parsePriceBook(book);
  if (parsed.ok) throw new Error("the book was expected to be refused");
  return parsed.failure;
}

describe("the book states who supplies a row", () => {
  it("declares a customer supplier on the two appliances and on nothing else", () => {
    const declared = BOOK.cabinetRules
      .filter((rule) => rule.suppliedBy === "customer")
      .map((rule) => rule.buildId)
      .sort();

    expect(declared).toEqual([...NOT_SUPPLIED_BUILD_IDS]);
  });

  it("charges nothing for a row it does not supply", () => {
    // The claim on the screen and the arithmetic under the total, reconciled in the shipped data.
    for (const rule of BOOK.cabinetRules) {
      if (rule.suppliedBy !== "customer") continue;
      for (const [field, value] of Object.entries(rule.formula)) {
        // The millimetre fields say where a price is quoted, never what is charged.
        if (typeof value !== "number" || field.endsWith("Mm")) continue;
        expect(value, `${rule.ruleId}.${field}`).toBe(0);
      }
    }
  });

  it("leaves every other row silent, so joinery never has to say it is joinery", () => {
    const silent = BOOK.cabinetRules.filter(
      (rule) => rule.suppliedBy === undefined,
    );

    expect(silent).toHaveLength(
      BOOK.cabinetRules.length - NOT_SUPPLIED_BUILD_IDS.length,
    );
    expect(DEFAULT_CABINET_SUPPLIER).toBe("manufacturer");
  });
});

describe("a priced line carries the supplier rather than a reader inferring it", () => {
  it("publishes a supplier on every cabinet line the shipped kitchen produces", () => {
    for (const line of cabinetLinesOf(BOOK)) {
      expect(CABINET_SUPPLIERS, line.placementId).toContain(line.suppliedBy);
    }
  });

  it("marks the seeded hood and fridge as the customer's, at nothing", () => {
    const notSupplied = cabinetLinesOf(BOOK).filter(
      (line) => line.suppliedBy === "customer",
    );

    expect(notSupplied.map((line) => line.pricedAsBuildId).sort()).toEqual([
      ...NOT_SUPPLIED_BUILD_IDS,
    ]);
    for (const line of notSupplied) {
      expect(line.amountMinor, line.placementId).toBe(0);
    }
  });

  it("leaves a free cabinet the manufacturer's, so a zero cannot inherit the appliance fact", () => {
    // **The whole point of the field.** A row priced at nothing that never declared a supplier is
    // still built by the manufacturer, and the breakdown must go on saying *inclus* over it. Written
    // as `amountMinor === 0`, every line below would read as an appliance.
    const everythingFree = bookWithRules(
      BOOK.cabinetRules.map((rule) =>
        rule.suppliedBy === undefined
          ? { ...rule, formula: costingAtEveryWidth(0) }
          : rule,
      ),
    );

    const lines = cabinetLinesOf(everythingFree);
    const free = lines.filter((line) => line.suppliedBy === "manufacturer");

    expect(free.length).toBeGreaterThan(0);
    for (const line of free) {
      expect(line.amountMinor, line.placementId).toBe(0);
    }
  });
});

describe("a book assembled elsewhere is held to the same statement", () => {
  it("refuses a supplier this build does not know, rather than reading it as the default", () => {
    const failure = refusalFrom(
      bookWithRules([
        { ruleId: "cabinet.made-up", buildId: "hood", suppliedBy: "CUSTOMER" },
        ...BOOK.cabinetRules,
      ] as unknown as readonly CabinetPriceRule[]),
    );

    expect(failure.code).toBe("INVALID_PRICE_BOOK");
    expect(failure.detail).toContain("suppliedBy");
  });

  it("refuses a row that is not supplied and is charged for anyway", () => {
    const failure = refusalFrom(
      bookWithRules([
        {
          ruleId: "cabinet.charged-appliance",
          buildId: "hood",
          formula: costingAtEveryWidth(290_000),
          suppliedBy: "customer",
        },
        ...BOOK.cabinetRules,
      ]),
    );

    expect(failure.code).toBe("INVALID_PRICE_BOOK");
    expect(failure.detail).toContain("may not be charged for");
  });

  it("accepts the authoring helper, which cannot state one half without the other", () => {
    const rule: CabinetPriceRule = {
      ruleId: "cabinet.authored",
      buildId: "hood",
      ...drawnButNotSupplied(600),
    };

    expect(rule.suppliedBy).toBe("customer");
    expect(rule.formula).toEqual({
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 0,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
    });
  });
});
