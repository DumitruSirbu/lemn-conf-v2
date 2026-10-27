import { describe, expect, it } from "vitest";

import { entryLabel } from "../../src/catalog.js";

import {
  cabinetHandleCount,
  widthDerivedDoorLeafCount,
} from "../../src/cabinet-handles.js";
import { deriveDoorCount, TWO_DOOR_MIN_WIDTH_MM } from "../../src/catalog.js";
import {
  type CabinetBody,
  type Design,
  type DesignPlacement,
} from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  doorLeafCount,
  frontPopulationQueryFor,
  WALL_DOOR_BAND_INSET_MM,
} from "../../src/front-population.js";
import {
  countHardwareMechanisms,
  type HardwareMechanismCounts,
} from "../../src/hardware-mechanisms.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import {
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
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";

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

  return tenLeiOf(
    tier.perHingeMinor * mechanisms.hinges +
      tier.perDrawerMinor * mechanisms.drawers +
      tier.perPushToOpenMinor * mechanisms.pushToOpen,
  );
}

/** An exact amount as its line carries it: rounded half up to ten lei. Restated, as the oracle must not import the
 *  rounding it checks. */
function tenLeiOf(exactMinor: number): number {
  const TEN_LEI_MINOR = 1_000;
  return Math.round(exactMinor / TEN_LEI_MINOR) * TEN_LEI_MINOR;
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

type PriceRequest = Omit<Parameters<typeof priceDesign>[0], "deepeningRows">;

/** The success branch, or a failure message that names what refused instead of an undefined read. */
function priceOrFail(request: PriceRequest): PricedDesign {
  const result = priceDesign({
    ...request,
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result.priced;
}

function pricedSeededKitchen(
  overrides: Partial<PriceRequest> = {},
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

/** The pricing step a width or height rounds up to: restated here, as the oracle must not import what it checks. */
const STEP_MM = 50;

function stepsAbove(builtMm: number, anchorMm: number): number {
  return (Math.ceil(builtMm / STEP_MM) * STEP_MM - anchorMm) / STEP_MM;
}

/** The anchored formula of a rule, or a failure naming the rule that is not one. */
function anchoredFormulaOf(buildId: string) {
  const { formula } = ruleFor(buildId);
  if (formula.shape === "price-per-size") {
    throw new Error(`"${buildId}" is a fixed-size row, not an anchored one`);
  }
  return formula;
}

/** The amount the sample book's rule gives a body, applied by hand rather than through the query's arithmetic: the
 *  anchor, then a signed number of 50 mm steps in width and height, then the leaves the body has beyond the anchor's,
 *  rounded to the ten lei a cabinet line carries. The door leaves are the one number read from production code, so both
 *  derive it in one place. */
function expectedAmountFor(
  buildId: string,
  body: { readonly widthMm: number; readonly heightMm: number },
): number {
  const formula = anchoredFormulaOf(buildId);
  const widthSteps = stepsAbove(body.widthMm, formula.anchorWidthMm);
  const width =
    widthSteps >= 0
      ? widthSteps * formula.perStepWiderMinor
      : widthSteps * formula.perStepNarrowerMinor;
  const height =
    formula.anchorHeightMm === undefined
      ? 0
      : stepsAbove(body.heightMm, formula.anchorHeightMm) *
        (formula.perHeightStepMinor ?? 0);
  const leavesAt = (widthMm: number) =>
    widthDerivedDoorLeafCount({
      buildId,
      rule: CATALOG.get(buildId)?.cabinetHandles,
      widthMm,
    });
  const doors =
    formula.perExtraDoorLeafMinor === undefined
      ? 0
      : formula.perExtraDoorLeafMinor *
        (leavesAt(body.widthMm) - leavesAt(formula.anchorWidthMm));
  return tenLeiOf(formula.anchorMinor + width + height + doors);
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

describe("a price is an anchor and steps over width, never a table keyed on the ladder", () => {
  it("prices every whole millimetre across a cabinetry row's range, rounded up to the 50 mm step", () => {
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
  // and the width term stays beside the step (ADR 0068). The threshold sits inside one 50 mm bracket, so across it the
  // width term does not move and the door step is the whole rise.

  it("changes by the door step only at the threshold and by a width step only at a bracket edge", () => {
    const formula = anchoredFormulaOf("wall-cabinet");
    if (formula.perExtraDoorLeafMinor === undefined) {
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
      const crossesABracket = (widthMm - 1) % STEP_MM === 0;
      const widthStep =
        widthMm <= formula.anchorWidthMm
          ? formula.perStepNarrowerMinor
          : formula.perStepWiderMinor;

      expect(rise).toBe(
        (crossesABracket ? widthStep : 0) +
          (stepsHere ? formula.perExtraDoorLeafMinor : 0),
      );
    }
  });

  it("steps twice for a two-band column and once for a one-band cabinet", () => {
    // `deriveDoorCount` answers leaves per band, so a pantry gaining two leaves at the threshold gains two steps;
    // a step read straight off it would under-charge every banded cabinet by half. 499 and 500 share a bracket, so
    // the whole difference is the door step.
    const oneBand = anchoredFormulaOf("wall-cabinet");
    const twoBands = anchoredFormulaOf("tall-pantry");
    if (
      oneBand.perExtraDoorLeafMinor === undefined ||
      twoBands.perExtraDoorLeafMinor === undefined
    ) {
      throw new Error("the sample book no longer steps both hinged rows");
    }

    const stepOf = (buildId: string, perLeafMinor: number) =>
      (amountOfOneBody({ buildId, widthMm: 500, heightMm: 2200 }) -
        amountOfOneBody({ buildId, widthMm: 499, heightMm: 2200 })) /
      perLeafMinor;

    expect(stepOf("wall-cabinet", oneBand.perExtraDoorLeafMinor)).toBe(1);
    expect(stepOf("tall-pantry", twoBands.perExtraDoorLeafMinor)).toBe(2);
    expect(deriveDoorCount(500) - deriveDoorCount(499)).toBe(1);
  });

  it("steps a resized seeded body by the leaves its own fronts carry, which hardware bills, and not by its priced-as row's", () => {
    // Seeded rows freeze `carriesHandles(n)` at their build size, so a widened seeded wall cabinet carries the leaves it
    // was built with. The door term counts those, as hardware does (ADR 0177 A-3), so the two bodies differ by exactly
    // the leaves they differ by.
    const perLeafMinor =
      anchoredFormulaOf("wall-cabinet").perExtraDoorLeafMinor;
    const leavesOf = (buildId: string, widthMm: number) =>
      doorLeafCount(
        frontPopulationQueryFor({
          body: { buildId, widthMm, heightMm: 700 },
          definition: CATALOG.get(buildId) ?? {},
        }),
      );
    if (perLeafMinor === undefined) throw new Error("no door step");

    for (const widthMm of [400, 600]) {
      expect(
        amountOfOneBody({ buildId: "wall-2door-600", widthMm, heightMm: 700 }) -
          amountOfOneBody({ buildId: "wall-cabinet", widthMm, heightMm: 700 }),
      ).toBe(
        (leavesOf("wall-2door-600", widthMm) -
          leavesOf("wall-cabinet", widthMm)) *
          perLeafMinor,
      );
    }
  });

  it("does not step a row whose front population is fixed at every width", () => {
    // `base-sink` has two doors that do not follow its width, so its price is flat in leaves.
    const widthsMm = CATALOG.get("base-sink")?.sizesMm ?? [];

    expect(widthsMm.length).toBeGreaterThan(1);
    expect(
      widthsMm.map((widthMm) => [
        widthMm,
        widthDerivedDoorLeafCount({
          buildId: "base-sink",
          rule: CATALOG.get("base-sink")?.cabinetHandles,
          widthMm,
        }),
      ]),
    ).toEqual(widthsMm.map((widthMm) => [widthMm, 0]));
    expect(ruleFor("base-sink").formula.shape).toBe("anchored-width");
  });

  it("refuses a body whose entry declares no count, rather than billing zero", () => {
    const undeclared = catalogDeclaringNoHandles("wall-cabinet");
    const result = priceDesign({
      deepeningRows: MEASURED_DEEPENING_ROWS,
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

  it("prices every built height as the 50 mm step it rounds up to, so the price moves at each edge and nowhere else", () => {
    const formula = anchoredFormulaOf("open-shelf");
    if (formula.shape !== "anchored-width-and-height") {
      throw new Error("the sample book no longer prices the shelf by height");
    }
    const amountAt = (heightMm: number) =>
      amountOfOneBody({ buildId: "open-shelf", widthMm: 600, heightMm });

    for (let heightMm = 301; heightMm <= 900; heightMm += 1) {
      expect(amountAt(heightMm), `${String(heightMm)} mm`).toBe(
        expectedAmountFor("open-shelf", { widthMm: 600, heightMm }),
      );
      if ((heightMm - 1) % STEP_MM !== 0) {
        expect(amountAt(heightMm)).toBe(amountAt(heightMm - 1));
      }
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
      "anchored-width-and-door-leaves",
    );
  });

  it("prices the one row that is height-flexible AND hinged by both terms", () => {
    // ADR 0068's population correction: `wall-cabinet` must move on both axes.
    const at = (widthMm: number, heightMm: number) =>
      amountOfOneBody({ buildId: "wall-cabinet", widthMm, heightMm });

    expect(at(600, 900)).toBeGreaterThan(at(600, 700));
    expect(at(500, 700) - at(499, 700)).toBe(
      anchoredFormulaOf("wall-cabinet").perExtraDoorLeafMinor,
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
    return tenLeiOf(
      tier.perHingeMinor * mechanisms.hinges +
        tier.perDrawerMinor * mechanisms.drawers +
        tier.perPushToOpenMinor * mechanisms.pushToOpen,
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
          formula: {
            shape: "price-per-size",
            sizes: [{ widthMm: 50, amountMinor: 1_000 }],
          },
        },
      ],
    };

    const result = priceDesign({
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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

describe("a book in the retired linear form is refused (P3 item 2)", () => {
  const retiredFormula = {
    shape: "linear-in-width",
    baseMinor: 100_000,
    perWidthMillimetreMinor: 400,
  } as unknown as CabinetPriceRule["formula"];

  it("refuses a book whose cabinet rules and material tiers are all in the retired form, before a placement is read", () => {
    const linear = {
      ...BOOK,
      cabinetRules: BOOK.cabinetRules.map((rule) => ({
        ...rule,
        formula: retiredFormula,
      })),
      material: {
        ...BOOK.material,
        tiers: BOOK.material.tiers.map((tier) => ({
          ...Object.fromEntries(
            Object.entries(tier).filter(
              ([field]) => field !== "percentOfCabinets",
            ),
          ),
          wholeKitchenMinor: 0,
        })),
      },
      depthRule: undefined,
    } as unknown as PriceBook;

    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book: linear,
      pricingVersion: BOOK.version,
      deepeningRows: MEASURED_DEEPENING_ROWS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  });

  it("refuses a design priced from a rule still in the retired shape, naming the rule and the placement", () => {
    const oneRuleRetired: PriceBook = {
      ...BOOK,
      cabinetRules: BOOK.cabinetRules.map((rule) =>
        rule.buildId === "wall-cabinet"
          ? { ...rule, formula: retiredFormula }
          : rule,
      ),
    };

    const result = priceDesign({
      design: designOf([placedAt({ id: "x" })]),
      catalog: CATALOG,
      book: oneRuleRetired,
      pricingVersion: BOOK.version,
      deepeningRows: MEASURED_DEEPENING_ROWS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "UNKNOWN_FORMULA_SHAPE",
      placementId: "x",
      id: ruleFor("wall-cabinet").ruleId,
    });
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

describe("every line is a whole ten lei, the total is their exact sum, and nothing is stored", () => {
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
    // Every line is rounded once, at its own seam (ADR 0177 A-1), so the lines add to the total with no rounding
    // left to do; a query that rounded the total instead would not reproduce the sum.
    expect(priced.lines.every((line) => line.amountMinor % 1_000 === 0)).toBe(
      true,
    );
    // A line that is not an accessory is its quantity times its unit; an accessory line keeps the book's exact rate
    // as its unit and rounds the amount.
    for (const line of priced.lines.filter(
      (candidate) => candidate.kind !== "accessory",
    )) {
      expect(line.amountMinor).toBe(line.quantity * line.unitAmountMinor);
    }
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
      deepeningRows: MEASURED_DEEPENING_ROWS,
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
