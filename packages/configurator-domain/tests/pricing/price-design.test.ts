// Wave 6B: the pure pricing query.
//
// The failures this file exists to detect are the ones that would look green under a weaker suite:
// a price that is really a width lookup, an order pricing arrived at by itself, a seeded body priced
// through the literal `buildId` the projection resolves, a handle line counting meshes, and a total
// that quietly drops the bodies that do not fit.
import { describe, expect, it } from "vitest";

import {
  cabinetHandleCount,
  widthDerivedDoorLeafCount,
} from "../../src/cabinet-handles.js";
import { deriveDoorCount, TWO_DOOR_MIN_WIDTH_MM } from "../../src/catalog.js";
import {
  DesignSchema,
  type CabinetBody,
  type DesignPlacement,
} from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import {
  pricedFlat,
  type CabinetPriceRule,
  type PriceBook,
} from "../../src/pricing/price-book.js";
import type {
  CabinetPriceLine,
  PriceLine,
  PricedDesign,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;

/** The seeded design with its placements replaced, so a test writes only the document it is about
 *  while the room and the timestamps stay the ones the product ships. */
function designOf(placements: readonly DesignPlacement[]) {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

function placedAt(
  overrides: Omit<Partial<DesignPlacement>, "body"> & {
    readonly id: string;
    readonly body?: Partial<CabinetBody>;
  },
): DesignPlacement {
  return {
    wall: "A",
    alongMm: 1300,
    y0Mm: 1500,
    ...overrides,
    body: {
      buildId: "wall-cabinet",
      widthMm: 600,
      heightMm: 700,
      ...overrides.body,
    },
  };
}

/** The success branch, or a failure message that names what refused instead of an undefined read. */
function priceOrFail(request: Parameters<typeof priceDesign>[0]): PricedDesign {
  const result = priceDesign(request);
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result.priced;
}

function pricedSeededKitchen(
  overrides: Partial<Parameters<typeof priceDesign>[0]> = {},
): PricedDesign {
  return priceOrFail({
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    book: BOOK,
    pricingVersion: BOOK.version,
    ...overrides,
  });
}

function cabinetLinesOf(priced: PricedDesign): readonly CabinetPriceLine[] {
  return priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function lineFor(priced: PricedDesign, placementId: string): CabinetPriceLine {
  const line = cabinetLinesOf(priced).find(
    (candidate) => candidate.placementId === placementId,
  );
  if (!line) throw new Error(`no cabinet line for "${placementId}"`);
  return line;
}

function ruleFor(buildId: string): CabinetPriceRule {
  const rule = BOOK.cabinetRules.find(
    (candidate) => candidate.buildId === buildId,
  );
  if (!rule) throw new Error(`the sample book prices no "${buildId}"`);
  return rule;
}

/** The sample book with one rule replaced or removed, so a test can construct the case it is about
 *  without authoring a second book and without touching the shipped one. */
function bookWithout(buildId: string): PriceBook {
  return {
    ...BOOK,
    cabinetRules: BOOK.cabinetRules.filter((rule) => rule.buildId !== buildId),
  };
}

/** The seeded catalogue with one entry amended. Used to construct the divergence the shipped
 *  catalogue does not currently exhibit — see the handle-count block below. */
function catalogWith(
  buildId: string,
  amendment: Partial<BodyDefinition>,
): BodyCatalog {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  return new Map(CATALOG).set(buildId, { ...definition, ...amendment });
}

/** The seeded catalogue with one entry's handle declaration **absent** — the shape a definition
 *  assembled outside TypeScript arrives in, which is the case ADR 0061 decision 4 requires to fail
 *  loudly. The key is removed rather than set to `undefined`, because those are different documents
 *  and only the first is reachable through the `BodyCatalog` port. */
function catalogDeclaringNoHandles(buildId: string): BodyCatalog {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  const undeclared: {
    -readonly [K in keyof BodyDefinition]: BodyDefinition[K];
  } = { ...definition };
  delete undeclared.cabinetHandles;
  return new Map(CATALOG).set(buildId, undeclared);
}

/** The amount the sample book's own coefficients say a body of this row, width and height comes to,
 *  applied by hand rather than by a second call into the query's arithmetic. The door leaves are the
 *  one number read from production code, and deliberately: the whole point of the count is that
 *  pricing and the handle line derive it in exactly one place. */
function expectedAmountFor(
  buildId: string,
  body: { readonly widthMm: number; readonly heightMm: number },
): number {
  const { formula } = ruleFor(buildId);
  const width =
    formula.baseMinor + formula.perWidthMillimetreMinor * body.widthMm;
  const height =
    "perHeightMillimetreMinor" in formula
      ? formula.perHeightMillimetreMinor * body.heightMm
      : 0;
  const doors =
    "perDoorLeafMinor" in formula
      ? formula.perDoorLeafMinor *
        widthDerivedDoorLeafCount({
          buildId,
          rule: CATALOG.get(buildId)?.cabinetHandles,
          widthMm: body.widthMm,
        })
      : 0;
  return width + height + doors;
}

function amountOfOneBody(body: Partial<CabinetBody>): number {
  return lineFor(
    priceOrFail({
      design: designOf([placedAt({ id: "x", body })]),
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
    }),
    "x",
  ).amountMinor;
}

describe("a price is a formula over width, never a table keyed on the ladder", () => {
  it("prices a 575 mm body, which no width row in any book covers", () => {
    expect(
      amountOfOneBody({ buildId: "wall-cabinet", widthMm: 575, heightMm: 700 }),
    ).toBe(expectedAmountFor("wall-cabinet", { widthMm: 575, heightMm: 700 }));
  });

  it("prices every whole millimetre across a cabinetry row's range", () => {
    for (let widthMm = 200; widthMm <= 800; widthMm += 1) {
      expect(
        amountOfOneBody({ buildId: "wall-cabinet", widthMm, heightMm: 700 }),
      ).toBe(expectedAmountFor("wall-cabinet", { widthMm, heightMm: 700 }));
    }
  });

  it("carries the placement, the rule and the projection's label and width on every line", () => {
    const line = lineFor(pricedSeededKitchen(), "p0");

    expect(line).toMatchObject({
      lineId: "placement:p0:cabinet",
      placementId: "p0",
      buildId: "base-sink-800",
      label: "Corp spălător",
      widthMm: 800,
      quantity: 1,
    });
    expect(line.amountMinor).toBe(line.unitAmountMinor * line.quantity);
  });
});

describe("the price steps where the door count does, and nowhere else", () => {
  // Owner, 2026-09-03: another door is another handle, another set of mechanisms and more
  // processing margin, so the amount **steps** at `deriveDoorCount`'s threshold instead of sliding
  // through it. Front material is roughly unchanged, so the width term stays beside the step.

  it("changes by exactly the width coefficient at every width but the threshold", () => {
    const { formula } = ruleFor("wall-cabinet");
    if (!("perDoorLeafMinor" in formula)) {
      throw new Error(
        "the sample book no longer steps the hinged wall cabinet",
      );
    }

    for (let widthMm = 201; widthMm <= 800; widthMm += 1) {
      const rise =
        amountOfOneBody({ buildId: "wall-cabinet", widthMm, heightMm: 700 }) -
        amountOfOneBody({
          buildId: "wall-cabinet",
          widthMm: widthMm - 1,
          heightMm: 700,
        });
      const stepsHere = widthMm === TWO_DOOR_MIN_WIDTH_MM;

      expect(rise).toBe(
        formula.perWidthMillimetreMinor +
          (stepsHere ? formula.perDoorLeafMinor : 0),
      );
    }
  });

  it("steps twice for a two-band column and once for a one-band cabinet", () => {
    // Wave 6G's recorded trap: `deriveDoorCount` answers leaves **per band**, so a pantry that
    // gains two leaves at the threshold must gain two steps. A step read straight off
    // `deriveDoorCount` would under-charge every banded cabinet by half.
    const oneBand = ruleFor("wall-cabinet").formula;
    const twoBands = ruleFor("tall-pantry").formula;
    if (!("perDoorLeafMinor" in oneBand) || !("perDoorLeafMinor" in twoBands)) {
      throw new Error("the sample book no longer steps both hinged rows");
    }

    const stepOf = (buildId: string, perLeafMinor: number) =>
      (amountOfOneBody({ buildId, widthMm: 500, heightMm: 2200 }) -
        amountOfOneBody({ buildId, widthMm: 499, heightMm: 2200 }) -
        ruleFor(buildId).formula.perWidthMillimetreMinor) /
      perLeafMinor;

    expect(stepOf("wall-cabinet", oneBand.perDoorLeafMinor)).toBe(1);
    expect(stepOf("tall-pantry", twoBands.perDoorLeafMinor)).toBe(2);
    expect(deriveDoorCount(500) - deriveDoorCount(499)).toBe(1);
  });

  it("steps a resized seeded body exactly as it steps the row it is priced as", () => {
    // Every seeded row declares `carriesHandles(n)` frozen at the size it was built, so a step read
    // off the placement's own entry would give a widened seeded wall cabinet no step at all while
    // an inserted `wall-cabinet` beside it got one — two identical bodies at two prices.
    for (const widthMm of [400, 600]) {
      expect(
        amountOfOneBody({ buildId: "wall-2door-600", widthMm, heightMm: 700 }),
      ).toBe(
        amountOfOneBody({ buildId: "wall-cabinet", widthMm, heightMm: 700 }),
      );
    }
  });

  it("does not step a row whose front population is fixed at every width", () => {
    // `base-sink` has two doors and neither of them follows its width, so its price is flat in
    // leaves and the whole fact folds into its base coefficient — which is why one shape covered
    // the catalogue before either of these decisions.
    expect(
      widthDerivedDoorLeafCount({
        buildId: "base-sink",
        rule: CATALOG.get("base-sink")?.cabinetHandles,
        widthMm: 800,
      }),
    ).toBe(0);
    expect(ruleFor("base-sink").formula.shape).toBe("linear-in-width");
  });
});

describe("a body built to its opening is priced by the height it was built to", () => {
  // Owner, 2026-09-03: `wall-lift` and `open-shelf` build to the opening, so two instances of one
  // catalogue row stand at two heights. Height is an input **beside** width, not a front area.

  it("prices two heights of one row differently, at one width", () => {
    const short = amountOfOneBody({
      buildId: "wall-lift",
      widthMm: 600,
      heightMm: 400,
    });
    const tall = amountOfOneBody({
      buildId: "wall-lift",
      widthMm: 600,
      heightMm: 700,
    });

    expect(tall).toBeGreaterThan(short);
    expect(tall).toBe(
      expectedAmountFor("wall-lift", { widthMm: 600, heightMm: 700 }),
    );
  });

  it("changes by exactly the height coefficient across the whole built range", () => {
    const { formula } = ruleFor("open-shelf");
    if (formula.shape !== "linear-in-width-and-height") {
      throw new Error("the sample book no longer prices the shelf by height");
    }

    for (let heightMm = 301; heightMm <= 900; heightMm += 1) {
      expect(
        amountOfOneBody({ buildId: "open-shelf", widthMm: 600, heightMm }) -
          amountOfOneBody({
            buildId: "open-shelf",
            widthMm: 600,
            heightMm: heightMm - 1,
          }),
      ).toBe(formula.perHeightMillimetreMinor);
    }
  });

  it("is not a front area: the width term is unchanged by the height", () => {
    // The rejected alternative, made falsifiable. Under an area model the amount added by 100 mm of
    // width would be three times larger at 900 mm tall than at 300; under the ruled model it is the
    // same number, because the two terms are added and not multiplied.
    const widthRiseAt = (heightMm: number) =>
      amountOfOneBody({ buildId: "open-shelf", widthMm: 700, heightMm }) -
      amountOfOneBody({ buildId: "open-shelf", widthMm: 600, heightMm });

    expect(widthRiseAt(900)).toBe(widthRiseAt(300));
  });

  it("leaves a row of fixed height priced identically at every height", () => {
    // `base-cabinet` is hinged and is **not** `heightFlex`, so it takes the step term and no height
    // term. The pair of assertions is what stops the height term being given to every row.
    const amounts = new Set(
      [700, 720, 900].map((heightMm) =>
        amountOfOneBody({ buildId: "base-cabinet", widthMm: 600, heightMm }),
      ),
    );

    expect(amounts.size).toBe(1);
    expect(ruleFor("base-cabinet").formula.shape).toBe(
      "linear-in-width-and-door-leaves",
    );
  });

  it("prices the one row that is height-flexible AND hinged by both terms", () => {
    // ADR 0068's population correction, as behaviour: `wall-cabinet` must move on **both** axes.
    const at = (widthMm: number, heightMm: number) =>
      amountOfOneBody({ buildId: "wall-cabinet", widthMm, heightMm });

    expect(at(600, 900)).toBeGreaterThan(at(600, 700));
    expect(at(600, 700)).toBeGreaterThan(
      at(499, 700) +
        (600 - 499) * ruleFor("wall-cabinet").formula.perWidthMillimetreMinor,
    );
  });
});

describe("the line order is the projection's, which is row-major", () => {
  it("lists placements in the one display order and nothing of its own", () => {
    const expected = projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG)
      .flatMap((group) => group.entries)
      .map((entry) => entry.placementId);

    expect(
      cabinetLinesOf(pricedSeededKitchen()).map((line) => line.placementId),
    ).toEqual(expected);
  });

  it("lists wall A's hanging row before its top row (ADR 0063), not each column in turn", () => {
    const wallASuspended = cabinetLinesOf(pricedSeededKitchen())
      .map((line) => line.placementId)
      .filter((placementId) =>
        [
          "p8",
          "p10",
          "p11",
          "p12",
          "p13",
          "p14",
          "p15",
          "p16",
          "p17",
          "p18",
          "p19",
          "p20",
        ].includes(placementId),
      );

    // The whole hanging row left to right, then the whole top row. The column-major order wave 6A
    // first shipped would read p8, p15, p10, p16, …
    expect(wallASuspended).toEqual([
      "p8",
      "p10",
      "p11",
      "p12",
      "p13",
      "p14",
      "p15",
      "p16",
      "p17",
      "p18",
      "p19",
      "p20",
    ]);
  });

  it("prices the same design identically however its placements are stored", () => {
    // The order is a function of the design, not of the array the document happens to hold — which
    // holds only because the comparator is total, and it is total only because placement ids are
    // unique (`findDuplicatePlacementIds`, the validator's guarantee and not the schema's).
    // Swept over every rotation rather than over one shuffle, so a pair that ties on four keys is
    // reached from both sides.
    const lines = cabinetLinesOf(pricedSeededKitchen()).map(
      (line) => line.placementId,
    );
    const placements = KITCHEN_L_DESIGN.placements;

    for (let rotation = 1; rotation < placements.length; rotation += 1) {
      const rotated = [
        ...placements.slice(rotation),
        ...placements.slice(0, rotation),
      ];
      const priced = priceOrFail({
        design: designOf(rotated),
        catalog: CATALOG,
        book: BOOK,
        pricingVersion: BOOK.version,
      });

      expect(cabinetLinesOf(priced).map((line) => line.placementId)).toEqual(
        lines,
      );
    }
  });

  it("puts both whole-kitchen lines after every placement line, hardware first", () => {
    const kinds = pricedSeededKitchen().lines.map((line) => line.kind);

    expect(kinds.slice(-2)).toEqual(["hardware", "material"]);
    expect(kinds.slice(0, -2).every((kind) => kind === "cabinet")).toBe(true);
  });
});

describe("rule resolution goes through catalogEquivalentId", () => {
  it("prices a seeded body as the catalogue row it is named after", () => {
    const line = lineFor(pricedSeededKitchen(), "p0");

    expect(line.pricedAsBuildId).toBe("base-sink");
    expect(line.ruleId).toBe(ruleFor("base-sink").ruleId);
  });

  it("prices every seeded placement through the equivalent its entry declares", () => {
    const priced = pricedSeededKitchen();
    const lines = cabinetLinesOf(priced);

    expect(lines).toHaveLength(KITCHEN_L_DESIGN.placements.length);

    // The projection resolves the literal `buildId`, which is right for a label and would fail
    // whole here: the sample book names not one seeded id, because §7's rows are what a price rule
    // belongs to. This is the assertion that a lookup copied from 6A would fail.
    const namedByTheBook = new Set(
      BOOK.cabinetRules.map((rule) => rule.buildId),
    );
    const throughAnEquivalent = lines.filter(
      (line) => line.pricedAsBuildId !== line.buildId,
    );
    expect(throughAnEquivalent.length).toBeGreaterThan(0);
    for (const line of throughAnEquivalent) {
      expect(namedByTheBook.has(line.buildId)).toBe(false);
      expect(line.pricedAsBuildId).toBe(
        CATALOG.get(line.buildId)?.catalogEquivalentId,
      );
    }
  });

  it("prices a structural corner under its own id, having no equivalent to resolve", () => {
    const line = lineFor(pricedSeededKitchen(), "p9");

    expect(line.buildId).toBe("wall-corner-return-570");
    expect(line.pricedAsBuildId).toBe("wall-corner-return-570");
  });
});

describe("the handle line counts cabinet handles, from the placement's own entry", () => {
  const PREMIUM = { hardwareTierId: "hardware.premium" } as const;

  function hardwareLineOf(priced: PricedDesign): PriceLine {
    const line = priced.lines.find(
      (candidate) => candidate.kind === "hardware",
    );
    if (!line) throw new Error("no hardware line");
    return line;
  }

  it("bills the oven tower for two handles, not the four bars its builder draws", () => {
    const priced = priceOrFail({
      design: designOf([
        {
          id: "t",
          wall: "B",
          alongMm: 1200,
          y0Mm: 0,
          body: {
            buildId: "tall-oven-tower-600",
            widthMm: 600,
            heightMm: 2200,
          },
        },
      ]),
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
      selections: PREMIUM,
    });

    expect(hardwareLineOf(priced).quantity).toBe(2);
  });

  it("reads a seeded corner's count off its own row even when that row names an equivalent", () => {
    // `wall-corner-return-570` declares one handle; `wall-cabinet`'s per-door rule at 570 mm yields
    // two. The two agree today only because the corner declares no equivalent — one plausible edit
    // away, and the sibling rows all carry that spread already. So the divergence is constructed
    // here rather than waited for.
    const named = catalogWith("wall-corner-return-570", {
      catalogEquivalentId: "wall-cabinet",
    });
    const corner = designOf([
      {
        id: "c",
        wall: "B",
        alongMm: 615,
        y0Mm: 1500,
        body: {
          buildId: "wall-corner-return-570",
          widthMm: 570,
          heightMm: 700,
        },
      },
    ]);

    const priced = priceOrFail({
      design: corner,
      catalog: named,
      book: BOOK,
      pricingVersion: BOOK.version,
      selections: PREMIUM,
    });

    // The rule resolved through the equivalent…
    expect(lineFor(priced, "c").pricedAsBuildId).toBe("wall-cabinet");
    // …and the count did not. Two would be the defect.
    expect(hardwareLineOf(priced).quantity).toBe(1);
    expect(
      cabinetHandleCount({
        buildId: "wall-cabinet",
        rule: CATALOG.get("wall-cabinet")?.cabinetHandles,
        widthMm: 570,
      }),
    ).toBe(2);
  });

  it("sums the seeded kitchen's declared counts and nothing else", () => {
    const expected = KITCHEN_L_DESIGN.placements.reduce(
      (handles, placement) =>
        handles +
        cabinetHandleCount({
          buildId: placement.body.buildId,
          rule: CATALOG.get(placement.body.buildId)?.cabinetHandles,
          widthMm: placement.body.widthMm,
        }),
      0,
    );

    expect(
      hardwareLineOf(pricedSeededKitchen({ selections: PREMIUM })).quantity,
    ).toBe(expected);
  });

  it("refuses a body whose entry declares no count, rather than billing zero", () => {
    const undeclared = catalogDeclaringNoHandles("wall-cabinet");
    const result = priceDesign({
      design: designOf([placedAt({ id: "x" })]),
      catalog: undeclared,
      book: BOOK,
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("UNDECLARED_HANDLE_COUNT");
    expect(result.failure.placementId).toBe("x");
  });
});

describe("a tier that costs nothing is a line, and a missing rule is never a zero", () => {
  it("emits both whole-kitchen lines at zero for the default tiers", () => {
    const priced = pricedSeededKitchen();
    const wholeKitchen = priced.lines.filter((line) => line.kind !== "cabinet");

    expect(wholeKitchen.map((line) => line.amountMinor)).toEqual([0, 0]);
    expect(wholeKitchen).toHaveLength(2);
  });

  it("refuses a selection naming a tier the book does not hold", () => {
    const result = priceDesign({
      design: designOf([placedAt({ id: "x" })]),
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
      selections: { materialTierId: "material.invented" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "UNKNOWN_TIER",
      id: "material.invented",
    });
  });
});

describe("fail whole", () => {
  it("refuses a design whose body resolves no rule, naming the id", () => {
    const result = priceDesign({
      design: designOf([placedAt({ id: "x" }), placedAt({ id: "y" })]),
      catalog: CATALOG,
      book: bookWithout("wall-cabinet"),
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "NO_RULE_FOR_BODY",
      placementId: "x",
      id: "wall-cabinet",
    });
    // No partial line set and no partial total: the failure branch carries neither.
    expect(result).not.toHaveProperty("priced");
  });

  it("refuses a body the catalogue does not hold", () => {
    const result = priceDesign({
      design: designOf([placedAt({ id: "x", body: { buildId: "invented" } })]),
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "UNKNOWN_BODY",
      id: "invented",
    });
  });

  it("refuses a book whose version is not the one asked for, with no fallback", () => {
    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: "some-other-version",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("PRICING_VERSION_MISMATCH");
  });

  it("refuses a book that uses one rule id twice", () => {
    const duplicated: PriceBook = {
      ...BOOK,
      cabinetRules: [
        ...BOOK.cabinetRules,
        {
          ruleId: ruleFor("wall-cabinet").ruleId,
          buildId: "invented",
          formula: pricedFlat(1),
        },
      ],
    };

    const result = priceDesign({
      design: designOf([placedAt({ id: "x" })]),
      catalog: CATALOG,
      book: duplicated,
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  });

  it("refuses a formula shape this build does not know", () => {
    const unknownShape: PriceBook = {
      ...BOOK,
      cabinetRules: BOOK.cabinetRules.map((rule) =>
        rule.buildId === "wall-cabinet"
          ? {
              ...rule,
              formula: {
                shape: "percentage-of-total",
              } as unknown as CabinetPriceRule["formula"],
            }
          : rule,
      ),
    };

    const result = priceDesign({
      design: designOf([placedAt({ id: "x" })]),
      catalog: CATALOG,
      book: unknownShape,
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("UNKNOWN_FORMULA_SHAPE");
  });
});

describe("an overflowing design is priced in full and the total is flagged", () => {
  const OVERFLOWING = ["p7", "p24"] as const;

  it("prices every body, including the ones that do not fit", () => {
    const fitting = pricedSeededKitchen();
    const overflowing = pricedSeededKitchen({
      overflowingPlacementIds: [...OVERFLOWING],
    });

    // The defect this asserts against: excluding the marked bodies would drop the total at the
    // moment part of the kitchen became unbuildable, and read as a cheaper kitchen.
    expect(overflowing.lines).toEqual(fitting.lines);
    expect(overflowing.totalMinor).toBe(fitting.totalMinor);
    expect(cabinetLinesOf(overflowing).map((line) => line.placementId)).toEqual(
      expect.arrayContaining([...OVERFLOWING]),
    );
  });

  it("flags the total and echoes the marked placements", () => {
    const overflowing = pricedSeededKitchen({
      overflowingPlacementIds: [...OVERFLOWING],
    });

    expect(overflowing.totalIsFlagged).toBe(true);
    expect(overflowing.overflowingPlacementIds).toEqual([...OVERFLOWING]);
  });

  it("leaves a fitting design unflagged", () => {
    expect(pricedSeededKitchen().totalIsFlagged).toBe(false);
  });

  it("refuses an overflow report naming a placement the design does not contain", () => {
    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
      overflowingPlacementIds: ["p999"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "UNKNOWN_OVERFLOW_PLACEMENT",
      placementId: "p999",
    });
  });
});

describe("nothing is rounded and nothing is stored", () => {
  it("returns the exact sum of its lines in minor units", () => {
    const priced = pricedSeededKitchen({
      selections: {
        hardwareTierId: "hardware.soft-close",
        materialTierId: "material.painted-mdf",
      },
    });

    expect(priced.totalMinor).toBe(
      priced.lines.reduce((sum, line) => sum + line.amountMinor, 0),
    );
    expect(Number.isSafeInteger(priced.totalMinor)).toBe(true);
    // The hardware line is the tier's per-handle amount times the count, exact and unrounded — a
    // query that rounded anywhere would not reproduce it.
    const hardware = priced.lines.find((line) => line.kind === "hardware");
    expect(hardware?.amountMinor).toBe(
      (hardware?.quantity ?? 0) * (hardware?.unitAmountMinor ?? 0),
    );
  });

  it("carries the book's currency, version and status forward", () => {
    expect(pricedSeededKitchen()).toMatchObject({
      currency: "MDL",
      pricingVersion: BOOK.version,
      status: BOOK.status,
    });
  });

  it("gains no price field on the design document", () => {
    const withATotal = { ...KITCHEN_L_DESIGN, totalMinor: 1 };

    expect(DesignSchema.safeParse(withATotal).success).toBe(false);
    expect(DesignSchema.safeParse(KITCHEN_L_DESIGN).success).toBe(true);
  });

  it("prices an empty design as its two whole-kitchen lines and no cabinet line", () => {
    const priced = priceOrFail({
      design: designOf([]),
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
    });

    expect(cabinetLinesOf(priced)).toEqual([]);
    expect(priced.lines).toHaveLength(2);
    expect(priced.totalMinor).toBe(0);
  });
});
