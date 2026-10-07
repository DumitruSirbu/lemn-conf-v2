import { describe, expect, it } from "vitest";

import { entryLabel } from "../../src/catalog.js";

import {
  cabinetHandleCount,
  widthDerivedDoorLeafCount,
} from "../../src/cabinet-handles.js";
import { deriveDoorCount, TWO_DOOR_MIN_WIDTH_MM } from "../../src/catalog.js";
import {
  DesignSchema,
  type CabinetBody,
  type Design,
  type DesignPlacement,
} from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { WALL_DOOR_BAND_INSET_MM } from "../../src/front-population.js";
import {
  countHardwareMechanisms,
  type HardwareMechanismCounts,
} from "../../src/hardware-mechanisms.js";
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
import { findOverflowingPlacementIds } from "../../src/queries/overflowing-placements.js";
import {
  declaresASink,
  type BodyCatalog,
  type BodyDefinition,
} from "../../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;

/** What the default hardware tier charges the seeded kitchen, recomposed from the tier's three rates and the
 *  design's three counts. Never a literal: the reconciliation to ADR 0092 decision 6 is another file's job. */
function hardwareAmountOfDefaultTier(): number {
  const tier = BOOK.hardware.tiers.find(
    (candidate) => candidate.tierId === BOOK.hardware.defaultTierId,
  );
  if (!tier) throw new Error("the book offers no default hardware tier");
  const mechanisms = countHardwareMechanisms(
    projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG).flatMap(
      (group) => group.entries,
    ),
    CATALOG,
  );

  return (
    tier.perHingeMinor * mechanisms.hinges +
    tier.perDrawerMinor * mechanisms.drawers +
    tier.perPushToOpenMinor * mechanisms.pushToOpen
  );
}

/** The seeded design with its placements replaced; the room and timestamps stay as shipped. */
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

function bookWithout(buildId: string): PriceBook {
  return {
    ...BOOK,
    cabinetRules: BOOK.cabinetRules.filter((rule) => rule.buildId !== buildId),
  };
}

/** The seeded catalogue with one entry amended, to construct a divergence the shipped catalogue lacks. */
function catalogWith(
  buildId: string,
  amendment: Partial<BodyDefinition>,
): BodyCatalog {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  return new Map(CATALOG).set(buildId, { ...definition, ...amendment });
}

/** One entry's handle declaration **absent**, as a definition assembled outside TypeScript arrives (ADR 0061
 *  decision 4). The key is removed, not set to `undefined`: only the first is reachable through `BodyCatalog`. */
function catalogDeclaringNoHandles(buildId: string): BodyCatalog {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  const undeclared: {
    -readonly [K in keyof BodyDefinition]: BodyDefinition[K];
  } = { ...definition };
  delete undeclared.cabinetHandles;
  return new Map(CATALOG).set(buildId, undeclared);
}

/** The amount the sample book's coefficients give a body, applied by hand rather than through the query's
 *  arithmetic. The door leaves are the one number read from production code, so both derive it in one place. */
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
      label: entryLabel("base-sink"),
      widthMm: 800,
      quantity: 1,
    });
    expect(line.amountMinor).toBe(line.unitAmountMinor * line.quantity);
  });
});

describe("the price steps where the door count does, and nowhere else", () => {
  // Another door is another handle and more processing, so the amount steps at `deriveDoorCount`'s threshold
  // and the width term stays beside the step (ADR 0068).

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
    // `deriveDoorCount` answers leaves per band, so a pantry gaining two leaves at the threshold gains two steps;
    // a step read straight off it would under-charge every banded cabinet by half.
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
    // Seeded rows freeze `carriesHandles(n)` at their build size, so a step read off the placement's own entry
    // would price a widened seeded wall cabinet and an inserted `wall-cabinet` differently.
    for (const widthMm of [400, 600]) {
      expect(
        amountOfOneBody({ buildId: "wall-2door-600", widthMm, heightMm: 700 }),
      ).toBe(
        amountOfOneBody({ buildId: "wall-cabinet", widthMm, heightMm: 700 }),
      );
    }
  });

  it("does not step a row whose front population is fixed at every width", () => {
    // `base-sink` has two doors that do not follow its width, so its price is flat in leaves.
    expect(
      widthDerivedDoorLeafCount({
        buildId: "base-sink",
        rule: CATALOG.get("base-sink")?.cabinetHandles,
        widthMm: 800,
      }),
    ).toBe(0);
    expect(ruleFor("base-sink").formula.shape).toBe("linear-in-width");
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

describe("a body built to its opening is priced by the height it was built to", () => {
  // `wall-lift` and `open-shelf` build to the opening: height is an input beside width, not a front area (ADR 0068).

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
    // Falsifies the rejected area model: under it 100 mm of width would cost three times more at 900 mm tall than
    // at 300 mm; under the ruled additive model it costs the same.
    const widthRiseAt = (heightMm: number) =>
      amountOfOneBody({ buildId: "open-shelf", widthMm: 700, heightMm }) -
      amountOfOneBody({ buildId: "open-shelf", widthMm: 600, heightMm });

    expect(widthRiseAt(900)).toBe(widthRiseAt(300));
  });

  it("leaves a row of fixed height priced identically at every height", () => {
    // `base-cabinet` is hinged and not `heightFlex`: it takes the step term and no height term.
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
    // ADR 0068's population correction: `wall-cabinet` must move on both axes.
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

    // The whole hanging row left to right, then the whole top row, not column-major.
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
    // The order is a function of the design, not of the array order: the comparator is total only because
    // placement ids are unique (`findDuplicatePlacementIds`). Swept over every rotation so ties are reached
    // from both sides.
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

  /** Placements, hardware, material, accessories (ADR 0092 decision 11): accessories are appended, so
   *  "hardware then material" holds. The seeded kitchen earns both accessories. */
  it("puts the whole-kitchen and accessory lines after every placement line, in that order", () => {
    const kinds = pricedSeededKitchen().lines.map((line) => line.kind);

    expect(kinds.slice(-4)).toEqual([
      "hardware",
      "material",
      "accessory",
      "accessory",
    ]);
    expect(kinds.slice(0, -4).every((kind) => kind === "cabinet")).toBe(true);
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

    // The projection resolves the literal `buildId`; a lookup copied from it would fail here, because the sample
    // book names no seeded id.
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

/** The hardware line is one line at `quantity: 1` (ADR 0092 decision 4). `cabinetHandleCount` has no production
 *  reader, so it is asserted directly; the price is billed off the mechanism count, asserted through the amount. */
describe("the mechanism count comes from the placement's own entry", () => {
  const PREMIUM = { hardwareTierId: "hardware.premium" } as const;

  function hardwareLineOf(priced: PricedDesign): PriceLine {
    const line = priced.lines.find(
      (candidate) => candidate.kind === "hardware",
    );
    if (!line) throw new Error("no hardware line");
    return line;
  }

  /** What a tier charges for these mechanisms, recomposed from the book's own rates. */
  function hardwareAmountFor(
    tierId: string,
    mechanisms: HardwareMechanismCounts,
  ): number {
    const tier = BOOK.hardware.tiers.find(
      (candidate) => candidate.tierId === tierId,
    );
    if (!tier) throw new Error(`the book holds no "${tierId}"`);
    return (
      tier.perHingeMinor * mechanisms.hinges +
      tier.perDrawerMinor * mechanisms.drawers +
      tier.perPushToOpenMinor * mechanisms.pushToOpen
    );
  }

  /** What the design would be billed if `countHardwareMechanisms` read the same entries as the query, so a query
   *  that counted off another row goes red on the amount. */
  function expectedHardwareAmount(
    design: Design,
    catalog: BodyCatalog,
  ): number {
    return hardwareAmountFor(
      PREMIUM.hardwareTierId,
      countHardwareMechanisms(
        projectDesignForDisplay(design, catalog).flatMap(
          (group) => group.entries,
        ),
        catalog,
      ),
    );
  }

  it("holds the oven tower's declared handle count at two", () => {
    // The declared count the mesh parity gate holds (ADR 0061's two against the four bars the builder draws);
    // production no longer reads it.
    expect(
      cabinetHandleCount({
        buildId: "tall-oven-tower-600",
        rule: CATALOG.get("tall-oven-tower-600")?.cabinetHandles,
        widthMm: 600,
      }),
    ).toBe(2);
  });

  it("bills the oven tower off its own mechanisms", () => {
    const tower = designOf([
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
    ]);
    const priced = priceOrFail({
      design: tower,
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
      selections: PREMIUM,
    });

    const line = hardwareLineOf(priced);
    expect(line.quantity).toBe(1);
    expect(line.amountMinor).toBe(expectedHardwareAmount(tower, CATALOG));
    expect(line.amountMinor).toBeGreaterThan(0);
  });

  it("reads a seeded corner's count off its own row even when that row names an equivalent", () => {
    // `wall-corner-return-570` declares one handle where `wall-cabinet`'s per-door rule at 570 mm yields two; the
    // shipped catalogue does not exhibit that divergence, so it is constructed here.
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

    expect(lineFor(priced, "c").pricedAsBuildId).toBe("wall-cabinet");
    // The corner declares one leaf where `wall-cabinet` at 570 mm derives two; the hardware amount is the corner's.
    expect(hardwareLineOf(priced).amountMinor).toBe(
      expectedHardwareAmount(corner, named),
    );
    expect(hardwareLineOf(priced).amountMinor).not.toBe(
      expectedHardwareAmount(
        designOf([
          {
            id: "c",
            wall: "B",
            alongMm: 615,
            y0Mm: 1500,
            body: { buildId: "wall-cabinet", widthMm: 570, heightMm: 700 },
          },
        ]),
        CATALOG,
      ),
    );
    expect(
      cabinetHandleCount({
        buildId: "wall-cabinet",
        rule: CATALOG.get("wall-cabinet")?.cabinetHandles,
        widthMm: 570,
      }),
    ).toBe(2);
  });

  it("sums the seeded kitchen's declared counts and nothing else", () => {
    // The two halves of the split (ADR 0070) are different numbers on purpose: `base-panbank`'s two handles are
    // drawers and its leaves are none, so asserting one says nothing about the other.
    const declaredHandles = KITCHEN_L_DESIGN.placements.reduce(
      (handles, placement) =>
        handles +
        cabinetHandleCount({
          buildId: placement.body.buildId,
          rule: CATALOG.get(placement.body.buildId)?.cabinetHandles,
          widthMm: placement.body.widthMm,
        }),
      0,
    );
    expect(declaredHandles).toBe(41);

    const line = hardwareLineOf(pricedSeededKitchen({ selections: PREMIUM }));
    expect(line.quantity).toBe(1);
    expect(line.amountMinor).toBe(
      expectedHardwareAmount(KITCHEN_L_DESIGN, CATALOG),
    );
  });
});

describe("a tier that costs nothing is a line, and a missing rule is never a zero", () => {
  /** The default material tier costs nothing (an *inclus* zero line); the default hardware tier prices the seeded
   *  kitchen's mechanisms (ADR 0092 decision 15). A zero line is still not a missing rule, in either group. */
  it("emits a priced hardware line and a zero material line for the default tiers", () => {
    const priced = pricedSeededKitchen();
    const wholeKitchen = priced.lines.filter(
      (line) => line.kind === "hardware" || line.kind === "material",
    );

    expect(wholeKitchen.map((line) => line.kind)).toEqual([
      "hardware",
      "material",
    ]);
    expect(wholeKitchen.map((line) => line.amountMinor)).toEqual([
      hardwareAmountOfDefaultTier(),
      0,
    ]);
    expect(hardwareAmountOfDefaultTier()).toBeGreaterThan(0);
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
  /** Far enough along any wall that a body centred there passes its end. Applied as a shift, so relative order
   *  and the projection's line order are kept. */
  const PAST_EVERY_WALL_MM = 9_000;

  /** The body pushed past its wall: a base body that holds no sink and hosts no rack. Shifting a sink out from
   *  under its wall cabinet legitimately drops the drying-rack line, which would fail this block for another
   *  reason. */
  function movedBody(): DesignPlacement {
    const found = KITCHEN_L_DESIGN.placements.find((placement) => {
      const definition = CATALOG.get(placement.body.buildId);
      return !declaresASink(definition) && definition?.band === "base";
    });
    if (!found) throw new Error("the seeded kitchen has no such placement");
    return found;
  }

  /** The overflow is made in the document: `priceDesign` derives the fact from the design (ADR 0069 decision 5c). */
  function withOneBodyPastItsWall(): Design {
    const moved = movedBody();
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === moved.id
          ? { ...placement, alongMm: placement.alongMm + PAST_EVERY_WALL_MM }
          : placement,
      ),
    };
  }

  function withThatBodyDeleted(): Design {
    const overflowing = withOneBodyPastItsWall();
    const marked = new Set(findOverflowingPlacementIds(overflowing));
    return {
      ...overflowing,
      placements: overflowing.placements.filter(
        (placement) => !marked.has(placement.id),
      ),
    };
  }

  it("prices every body, including the one that does not fit", () => {
    // Pinned so a fixture change that moved the sink again is visible here.
    expect(movedBody().id).toBe("p1");

    const design = withOneBodyPastItsWall();
    const overflowing = pricedSeededKitchen({ design });
    const [marked] = findOverflowingPlacementIds(design);

    // Excluding the marked body would drop the total once part of the kitchen became unbuildable.
    expect(overflowing.totalMinor).toBe(pricedSeededKitchen().totalMinor);
    expect(cabinetLinesOf(overflowing)).toHaveLength(design.placements.length);
    expect(cabinetLinesOf(overflowing).map((line) => line.placementId)).toEqual(
      expect.arrayContaining([marked]),
    );
  });

  it("flags the total and names the placements the design itself overflows", () => {
    const design = withOneBodyPastItsWall();
    const overflowing = pricedSeededKitchen({ design });

    expect(overflowing.totalIsFlagged).toBe(true);
    expect(overflowing.overflowingPlacementIds).toEqual([
      ...findOverflowingPlacementIds(design),
    ]);
    expect(overflowing.overflowingPlacementIds).toHaveLength(1);
  });

  it("leaves a fitting design unflagged", () => {
    expect(pricedSeededKitchen().totalIsFlagged).toBe(false);
  });

  /** The overflow flag matches the document; it is derived, so the statement is about it following an edit. */
  it("clears the flag when the overflowing body is deleted", () => {
    const repaired = withThatBodyDeleted();

    expect(repaired.placements).toHaveLength(
      KITCHEN_L_DESIGN.placements.length - 1,
    );
    expect(pricedSeededKitchen({ design: repaired }).totalIsFlagged).toBe(
      false,
    );
    expect(
      pricedSeededKitchen({ design: repaired }).overflowingPlacementIds,
    ).toEqual([]);
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

  it("carries the book's provisional-amounts flag forward, and fabricates no value for it", () => {
    // The flag says whether anybody has costed these figures, which `status` does not: every shipped book is
    // `estimate` and provisional. Asserted both ways so a hard-coded `true` fails.
    const costed: PriceBook = { ...BOOK, amountsProvisional: false };

    expect(BOOK.amountsProvisional).toBe(true);
    expect(pricedSeededKitchen().amountsProvisional).toBe(true);
    expect(pricedSeededKitchen({ book: costed }).amountsProvisional).toBe(
      false,
    );
  });

  it("refuses a book that declares no provisional-amounts flag rather than reading it as false", () => {
    // A book assembled outside TypeScript can omit the flag; an absent one must not publish `undefined`, which every
    // surface reads as costed.
    const undeclared: Record<string, unknown> = { ...BOOK };
    delete undeclared["amountsProvisional"];

    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book: undeclared as unknown as PriceBook,
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.failure.code).toBe(
      "INVALID_PRICE_BOOK",
    );
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

/** The catch around the mechanism count converts two declared causes and relabels nothing (ADR 0092 decision 16);
 *  each of the three causes is asserted separately. */
describe("the pricing catch names its causes", () => {
  /** The tallest frame that leaves a `one-band-under-frame` row no door: at exactly the declared inset the band
   *  is zero. Read off the declaration, because the boundary is the constant's. */
  const NO_BAND_LEFT_FRAME_HEIGHT_MM = WALL_DOOR_BAND_INSET_MM;

  /** A `wall-cabinet` built too short to carry a door, so the placement's own height refuses, not the catalogue. */
  function priceAWallCabinetAt(frameHeightMm: number) {
    return priceDesign({
      design: designOf([
        placedAt({ id: "flat", body: { heightMm: frameHeightMm } }),
      ]),
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
    });
  }

  it("gives an unbuildable door band its own code, naming the placement and the build id", () => {
    const result = priceAWallCabinetAt(NO_BAND_LEFT_FRAME_HEIGHT_MM);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "UNBUILDABLE_DOOR_BAND",
      placementId: "flat",
      id: "wall-cabinet",
    });
    expect(result.failure.detail).toContain("0 mm door band");
  });

  /** One millimetre taller builds a 1 mm band, which counts as a door: the refusal above is the boundary. */
  it("prices the same row at the first frame height that leaves a band", () => {
    expect(priceAWallCabinetAt(NO_BAND_LEFT_FRAME_HEIGHT_MM + 1).ok).toBe(true);
  });

  it("still labels a missing front declaration as the cause it is named for", () => {
    const stripped: Record<string, unknown> = {
      ...definitionOf("wall-cabinet"),
    };
    delete stripped["fronts"];

    const result = priceDesign({
      design: designOf([placedAt({ id: "flat" })]),
      catalog: catalogWith(
        "wall-cabinet",
        stripped as unknown as BodyDefinition,
      ),
      book: BOOK,
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "UNDECLARED_FRONT_POPULATION",
      placementId: "flat",
      id: "wall-cabinet",
    });
  });

  /** A defect, not a data condition. A `fronts` accessor that throws (a `TypeError`) must come back out as the same
   *  instance: a refusal would report a bug to a customer as a fact about their kitchen. */
  it("lets an error it declares no cause for propagate as the same instance", () => {
    const thrownByThePort = new TypeError("fronts is not an object");
    const request = {
      design: designOf([placedAt({ id: "flat" })]),
      catalog: catalogWhoseFrontsThrow("wall-cabinet", thrownByThePort),
      book: BOOK,
      pricingVersion: BOOK.version,
    };

    expect(() => priceDesign(request)).toThrow(thrownByThePort);
    try {
      priceDesign(request);
      expect.unreachable("priceDesign refused instead of propagating");
    } catch (error) {
      expect(error).toBe(thrownByThePort);
    }
  });

  function definitionOf(buildId: string): BodyDefinition {
    const definition = CATALOG.get(buildId);
    if (!definition) throw new Error(`the catalogue holds no "${buildId}"`);
    return definition;
  }

  /** The shipped catalogue with one row replaced, so every other row prices as it ships. */
  function catalogWith(
    buildId: string,
    definition: BodyDefinition,
  ): BodyCatalog {
    return new Map(CATALOG).set(buildId, definition);
  }

  /** One row whose `fronts` cannot be read: an accessor, not a bad value, which the domain refuses by name. */
  function catalogWhoseFrontsThrow(
    buildId: string,
    thrown: unknown,
  ): BodyCatalog {
    const malformed = Object.defineProperty(
      { ...definitionOf(buildId) },
      "fronts",
      {
        get: (): never => {
          throw thrown;
        },
      },
    ) as BodyDefinition;

    return catalogWith(buildId, malformed);
  }
});
