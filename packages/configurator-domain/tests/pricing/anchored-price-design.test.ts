// The anchored shapes through `priceDesign`: what a customer's body is charged (P1-b, P1-c, P1-d), against a
// test-local book. The sample book still states the linear shapes, so nothing here reads a shipped amount, and every
// rate is chosen to make the rule legible rather than to look like a price.
import { describe, expect, it } from "vitest";

import {
  INSERTABLE_BODY_DEFINITIONS,
  resolveCatalogEquivalent,
} from "../../src/catalog.js";
import type { CabinetBody, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  doorLeafCount,
  frontPopulationQueryFor,
} from "../../src/front-population.js";
import type { PricingFailure } from "../../src/pricing/price-lines.js";
import {
  PRICE_STEP_MM,
  type AnchoredFormula,
  type PricePerSizeFormula,
} from "../../src/pricing/anchored-price-formula.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import {
  type CabinetPriceRule,
  type PriceBook,
  type PriceFormula,
} from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { NOTHING_DISABLED } from "../support/availability.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const RULE_ID = "cabinet.test-anchored";

/** A one-cabinet design; the room and timestamps stay as shipped. */
function designOf(body: Partial<CabinetBody> & { readonly buildId: string }) {
  const placement: DesignPlacement = {
    id: "x",
    wall: "A",
    alongMm: 1300,
    y0Mm: 0,
    body: { widthMm: 600, heightMm: 700, ...body },
  };
  return { ...KITCHEN_L_DESIGN, placements: [placement] };
}

function bookPricing(buildId: string, formula: PriceFormula): PriceBook {
  const rule: CabinetPriceRule = { ruleId: RULE_ID, buildId, formula };
  return { ...SAMPLE_PRICE_BOOK, cabinetRules: [rule] };
}

function resultOf(
  book: PriceBook,
  body: Partial<CabinetBody> & { buildId: string },
) {
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design: designOf(body),
    catalog: CATALOG,
    book,
    pricingVersion: book.version,
  });
}

function cabinetLineOf(
  book: PriceBook,
  body: Partial<CabinetBody> & { buildId: string },
) {
  const result = resultOf(book, body);
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  const line = result.priced.lines.find(
    (candidate) => candidate.kind === "cabinet",
  );
  if (line?.kind !== "cabinet") throw new Error("no cabinet line");
  return line;
}

function refusalOf(
  book: PriceBook,
  body: Partial<CabinetBody> & { buildId: string },
): PricingFailure {
  const result = resultOf(book, body);
  if (result.ok) throw new Error("expected a refusal");
  return result.failure;
}

const WIDTH_ONLY: AnchoredFormula = {
  shape: "anchored-width",
  anchorWidthMm: 600,
  anchorMinor: 1_000_000,
  perStepWiderMinor: 70_000,
  perStepNarrowerMinor: 30_000,
};

describe("an anchored body is priced as its width rounded up (P1-b)", () => {
  const book = bookPricing("base-3drawer", WIDTH_ONLY);
  const amountAt = (widthMm: number) =>
    cabinetLineOf(book, { buildId: "base-3drawer", widthMm }).amountMinor;

  it("prices a body at 575 and one at 560 as the body at 600", () => {
    expect(amountAt(575)).toBe(amountAt(600));
    expect(amountAt(560)).toBe(amountAt(600));
    expect(amountAt(600)).toBe(WIDTH_ONLY.anchorMinor);
  });

  it("prices one millimetre past a step as the next step", () => {
    expect(amountAt(601)).toBe(amountAt(650));
    expect(amountAt(650)).toBe(
      WIDTH_ONLY.anchorMinor + WIDTH_ONLY.perStepWiderMinor,
    );
  });

  it("still shows the width the body was built at, not the width it was priced at", () => {
    expect(
      cabinetLineOf(book, { buildId: "base-3drawer", widthMm: 575 }),
    ).toMatchObject({
      widthMm: 575,
    });
  });

  it("refuses a rule stating a shape the cut-over retired, rather than pricing it at the width it was built", () => {
    const retired = {
      shape: "linear-in-width",
      baseMinor: 1_000,
      perWidthMillimetreMinor: 7,
    } as unknown as PriceFormula;

    expect(
      refusalOf(bookPricing("base-3drawer", retired), {
        buildId: "base-3drawer",
        widthMm: 575,
      }),
    ).toMatchObject({ code: "UNKNOWN_FORMULA_SHAPE", id: RULE_ID });
  });

  it("refuses a price that would fall below zero at the narrow end, never publishing it", () => {
    const steepNarrowing: AnchoredFormula = {
      ...WIDTH_ONLY,
      perStepNarrowerMinor: WIDTH_ONLY.anchorMinor,
    };

    expect(
      refusalOf(bookPricing("base-3drawer", steepNarrowing), {
        buildId: "base-3drawer",
        widthMm: 200,
      }).code,
    ).toBe("INVALID_AMOUNT");
  });
});

describe("the door term counts leaves as hardware does, at the built width (P1-c)", () => {
  const DOOR_FOLLOWING_ROWS = [...INSERTABLE_BODY_DEFINITIONS]
    .filter(([, definition]) => definition.doorCountFollowsWidth === true)
    .map(([buildId]) => buildId);
  /** One leaf is one ten-lei grain, so a priced line (rounded to ten lei, ADR 0177 A-1) shows the leaf count exactly. */
  const LEAF_MINOR = 1_000;
  const ONE_GRAIN_PER_LEAF: AnchoredFormula = {
    shape: "anchored-width-and-door-leaves",
    anchorWidthMm: 600,
    anchorMinor: 10_000,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 0,
    perExtraDoorLeafMinor: LEAF_MINOR,
  };

  function hardwareLeavesOf(buildId: string, widthMm: number): number {
    return doorLeafCount(
      frontPopulationQueryFor({
        body: { buildId, widthMm, heightMm: 700 },
        definition: CATALOG.get(buildId) ?? {},
      }),
    );
  }

  it("sweeps the three door-following rows, so the claim is not vacuous", () => {
    expect(DOOR_FOLLOWING_ROWS).toEqual([
      "base-cabinet",
      "wall-cabinet",
      "tall-pantry",
    ]);
  });

  it.each(DOOR_FOLLOWING_ROWS)(
    "charges %s the leaves hardware counts beyond the anchor's, at every width in its range",
    (buildId) => {
      const book = bookPricing(buildId, ONE_GRAIN_PER_LEAF);
      const anchorLeaves = hardwareLeavesOf(
        buildId,
        ONE_GRAIN_PER_LEAF.anchorWidthMm,
      );

      for (let widthMm = 200; widthMm <= 800; widthMm += 1) {
        const charged =
          cabinetLineOf(book, { buildId, widthMm, heightMm: 700 }).amountMinor -
          ONE_GRAIN_PER_LEAF.anchorMinor;

        expect(charged, `${buildId} at ${String(widthMm)} mm`).toBe(
          (hardwareLeavesOf(buildId, widthMm) - anchorLeaves) * LEAF_MINOR,
        );
      }
    },
  );

  it.each(DOOR_FOLLOWING_ROWS)(
    "charges %s no second leaf's panel anywhere from 451 to 499 mm, against an anchor of one leaf",
    (buildId) => {
      const doorRateMinor = 1_000_000;
      const oneLeaf: AnchoredFormula = {
        ...ONE_GRAIN_PER_LEAF,
        anchorWidthMm: 400,
        perExtraDoorLeafMinor: doorRateMinor,
        perStepWiderMinor: 1_000,
      };
      const book = bookPricing(buildId, oneLeaf);

      for (let widthMm = 451; widthMm <= 499; widthMm += 1) {
        const steps = Math.ceil(widthMm / PRICE_STEP_MM) - 400 / PRICE_STEP_MM;

        expect(
          cabinetLineOf(book, { buildId, widthMm, heightMm: 700 }).amountMinor,
          `${buildId} at ${String(widthMm)} mm`,
        ).toBe(oneLeaf.anchorMinor + steps * oneLeaf.perStepWiderMinor);
      }
      expect(
        cabinetLineOf(book, { buildId, widthMm: 500, heightMm: 700 })
          .amountMinor,
      ).toBeGreaterThanOrEqual(doorRateMinor);
    },
  );
});

describe("a resized seeded body's door term is the leaves hardware bills for it, less its priced-as row's at the anchor (P1-c)", () => {
  const SEEDED = KITCHEN_L_DESIGN.placements.filter((placement) => {
    const pricedAs = resolveCatalogEquivalent(CATALOG, placement.body.buildId);
    return (
      pricedAs !== undefined && pricedAs.buildId !== placement.body.buildId
    );
  });
  const ANCHOR_WIDTH_MM = 600;
  const doorRule: AnchoredFormula = {
    shape: "anchored-width-and-door-leaves",
    anchorWidthMm: ANCHOR_WIDTH_MM,
    anchorMinor: 10_000,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 0,
    perExtraDoorLeafMinor: 1_000,
  };

  function hardwareLeaves(
    buildId: string,
    size: { readonly widthMm: number; readonly heightMm: number },
  ): number {
    return doorLeafCount(
      frontPopulationQueryFor({
        body: { buildId, ...size },
        definition: CATALOG.get(buildId) ?? {},
      }),
    );
  }

  it("finds seeded bodies priced as another row, including ones whose frozen leaf count differs from the row's", () => {
    expect(SEEDED.length).toBeGreaterThanOrEqual(9);
  });

  it.each(SEEDED.map((placement) => placement.body.buildId))(
    "charges %s the leaves hardware counts on it at every width from 200 to 800 mm",
    (seededId) => {
      const seeded = SEEDED.find(
        (placement) => placement.body.buildId === seededId,
      );
      const pricedAs = resolveCatalogEquivalent(CATALOG, seededId);
      if (!seeded || !pricedAs) throw new Error(`${seededId} is not seeded`);
      const book = bookPricing(pricedAs.buildId, doorRule);
      const anchorLeaves = hardwareLeaves(pricedAs.buildId, {
        widthMm: ANCHOR_WIDTH_MM,
        heightMm: seeded.body.heightMm,
      });

      for (let widthMm = 200; widthMm <= 800; widthMm += 1) {
        const body = { ...seeded.body, widthMm };
        const charged =
          cabinetLineOf(book, body).amountMinor - doorRule.anchorMinor;

        expect(charged, `${seededId} at ${String(widthMm)} mm`).toBe(
          (hardwareLeaves(seededId, body) - anchorLeaves) * 1_000,
        );
      }
    },
  );
});

describe("a fixed-size row is priced at a listed width and refused above every one (P1-d)", () => {
  const SIZES: PricePerSizeFormula = {
    shape: "price-per-size",
    sizes: [
      { widthMm: 200, amountMinor: 11_000 },
      { widthMm: 300, amountMinor: 17_000 },
    ],
  };
  const book = bookPricing("base-bottle-cargo", SIZES);
  const body = (widthMm: number) => ({ buildId: "base-bottle-cargo", widthMm });

  it("prices a body at a listed width at that size", () => {
    expect(cabinetLineOf(book, body(200)).amountMinor).toBe(11_000);
    expect(cabinetLineOf(book, body(300)).amountMinor).toBe(17_000);
  });

  it("prices a width between two listed sizes at the larger", () => {
    expect(cabinetLineOf(book, body(250)).amountMinor).toBe(17_000);
  });

  it("refuses a body wider than every listed size with NO_PRICE_FOR_SIZE naming the placement and the rule", () => {
    const failure = refusalOf(book, body(301));

    expect(failure).toMatchObject({
      code: "NO_PRICE_FOR_SIZE",
      placementId: "x",
      id: RULE_ID,
    });
    expect(failure.detail).toContain("301");
  });

  it("never answers a price for a refused body: no line, no total of zero", () => {
    expect(resultOf(book, body(800)).ok).toBe(false);
  });
});
