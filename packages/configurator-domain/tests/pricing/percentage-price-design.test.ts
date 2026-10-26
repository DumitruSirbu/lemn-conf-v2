// The percentage form through the query (ADR 0177 A-1; P2-a to P2-d, P2-f): every line a whole number of ten lei, the
// lines adding to the total exactly, material and depth multiplying, and which cabinets deepen taken as a parameter so
// that nothing here decides A-6. Every amount and percentage is drawn at random or named by the test; none is a price.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  percentageStagesOf,
  TEN_LEI_MINOR,
} from "../../src/pricing/percentage-lines.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../../src/pricing/price-bounds.js";
import {
  priceDesign,
  priceDesignWithDeepening,
} from "../../src/pricing/price-design.js";
import type {
  CabinetPriceLine,
  PriceLine,
  PricedDesign,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  anchoredRules,
  percentageBookOf,
  UPGRADE_TIER_ID,
} from "./percentage-book-support.js";

const NUM_RUNS = 120;
const SHALLOW_MM = 600;
const DEEP_MM = 700;

const SUPPLIED_BUILD_IDS = SAMPLE_PRICE_BOOK.cabinetRules
  .filter((rule) => rule.suppliedBy !== "customer")
  .map((rule) => rule.buildId);

/** The kitchen at a cabinet depth, with the catalogue built at that depth. */
function kitchenAt(depthMm: number): {
  readonly design: Design;
  readonly catalog: ReturnType<typeof buildKitchenLBodyCatalog>;
} {
  return {
    design: {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: depthMm },
    },
    catalog: buildKitchenLBodyCatalog(depthMm),
  };
}

/** An anchor for each row, from a list the test draws; the same row always gets the same anchor. */
function anchorFrom(anchors: readonly number[]): (buildId: string) => number {
  return (buildId) => {
    const index = SUPPLIED_BUILD_IDS.indexOf(buildId);
    return anchors[Math.max(index, 0) % anchors.length] ?? 0;
  };
}

interface Scenario {
  readonly anchors: readonly number[];
  readonly materialPercent: number;
  readonly deepCabinetPercent: number;
  readonly depthMm: number;
  readonly deepeningIds: ReadonlySet<string>;
}

const scenarios: fc.Arbitrary<Scenario> = fc.record({
  anchors: fc.array(fc.integer({ min: 0, max: 600_000 }), {
    minLength: 1,
    maxLength: 12,
  }),
  materialPercent: fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT }),
  deepCabinetPercent: fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
  depthMm: fc.constantFrom(SHALLOW_MM, DEEP_MM),
  deepeningIds: fc
    .subarray(SUPPLIED_BUILD_IDS)
    .map((ids): ReadonlySet<string> => new Set(ids)),
});

function bookOf(scenario: Scenario): PriceBook {
  return percentageBookOf({
    materialPercent: scenario.materialPercent,
    deepCabinetPercent: scenario.deepCabinetPercent,
    cabinetRules: anchoredRules(anchorFrom(scenario.anchors)),
  });
}

/** The material the design chose: the upgrade unless the test says it chose nothing, which prices at the reference. */
interface ChosenMaterial {
  readonly materialTierId: string | undefined;
}

const UPGRADE_CHOSEN: ChosenMaterial = { materialTierId: UPGRADE_TIER_ID };
const NOTHING_CHOSEN: ChosenMaterial = { materialTierId: undefined };

function pricedOf(
  scenario: Scenario,
  chosen: ChosenMaterial = UPGRADE_CHOSEN,
): PricedDesign {
  const book = bookOf(scenario);
  const { design, catalog } = kitchenAt(scenario.depthMm);
  const result = priceDesignWithDeepening(
    {
      design,
      catalog,
      book,
      pricingVersion: book.version,
      selections: chosen,
    },
    (pricedAsBuildId) => scenario.deepeningIds.has(pricedAsBuildId),
  );
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result.priced;
}

function cabinetLinesOf(priced: PricedDesign): readonly CabinetPriceLine[] {
  return priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function linesOfKind(
  priced: PricedDesign,
  kind: PriceLine["kind"],
): readonly PriceLine[] {
  return priced.lines.filter((line) => line.kind === kind);
}

const sum = (amounts: readonly number[]) =>
  amounts.reduce((total, amount) => total + amount, 0);

describe("every line is a whole number of ten lei and the lines are the total (P2-a)", () => {
  it("adds the lines to the total exactly, each a multiple of 1 000 bani", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const priced = pricedOf(scenario);

        expect(priced.totalMinor).toBe(
          sum(priced.lines.map((line) => line.amountMinor)),
        );
        for (const line of priced.lines) {
          expect(line.amountMinor % TEN_LEI_MINOR).toBe(0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("publishes hardware, then material, then any depth line, then the accessories, after every cabinet", () => {
    const priced = pricedOf({
      anchors: [100_000],
      materialPercent: 30,
      deepCabinetPercent: 20,
      depthMm: DEEP_MM,
      deepeningIds: new Set(SUPPLIED_BUILD_IDS),
    });
    const kinds = priced.lines.map((line) => line.kind);
    const firstNonCabinet = kinds.findIndex((kind) => kind !== "cabinet");

    expect(kinds.slice(firstNonCabinet, firstNonCabinet + 3)).toEqual([
      "hardware",
      "material",
      "depth",
    ]);
    expect(
      kinds.slice(0, firstNonCabinet).every((kind) => kind === "cabinet"),
    ).toBe(true);
    expect(
      kinds.slice(firstNonCabinet + 3).every((kind) => kind === "accessory"),
    ).toBe(true);
  });
});

describe("the three parts are differences of nested stages (P2-b)", () => {
  it("gives the cabinet line, the material line and the depth line as sums of each cabinet's stages", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const priced = pricedOf(scenario);
        const anchorOf = anchorFrom(scenario.anchors);
        const isDeep = scenario.depthMm === DEEP_MM;
        let expectedMaterial = 0;
        let expectedDepth = 0;
        for (const line of cabinetLinesOf(priced)) {
          const exactMinor =
            line.suppliedBy === "customer" ? 0 : anchorOf(line.pricedAsBuildId);
          const deepens =
            isDeep &&
            line.suppliedBy === "manufacturer" &&
            scenario.deepeningIds.has(line.pricedAsBuildId);
          const stages = percentageStagesOf(exactMinor, {
            materialPercent: scenario.materialPercent,
            deepCabinetPercent: deepens ? scenario.deepCabinetPercent : 0,
          });
          expect(line.amountMinor).toBe(stages.cabinetMinor);
          expectedMaterial += stages.withMaterialMinor - stages.cabinetMinor;
          expectedDepth += stages.withDepthMinor - stages.withMaterialMinor;
        }

        expect(linesOfKind(priced, "material")[0]?.amountMinor).toBe(
          expectedMaterial,
        );
        expect(linesOfKind(priced, "depth")[0]?.amountMinor ?? 0).toBe(
          expectedDepth,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("for one cabinet, the cabinet, material and depth lines add to the preview cell: one rounding of b × (100 + m) × (100 + d) / 10 000", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600_000 }),
        fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT }),
        fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
        (anchor, materialPercent, deepCabinetPercent) => {
          const scenario: Scenario = {
            anchors: [anchor],
            materialPercent,
            deepCabinetPercent,
            depthMm: DEEP_MM,
            deepeningIds: new Set(SUPPLIED_BUILD_IDS),
          };
          const { design, catalog } = kitchenAt(DEEP_MM);
          const oneBase = {
            ...design,
            placements: design.placements
              .filter(
                (placement) => placement.body.buildId === "base-drawer3-600",
              )
              .slice(0, 1),
          };
          expect(oneBase.placements).toHaveLength(1);
          const book = bookOf(scenario);
          const result = priceDesignWithDeepening(
            {
              design: oneBase,
              catalog,
              book,
              pricingVersion: book.version,
              selections: { materialTierId: UPGRADE_TIER_ID },
            },
            () => true,
          );
          if (!result.ok) throw new Error(result.failure.detail);

          const cabinet = cabinetLinesOf(result.priced)[0];
          const parts =
            (cabinet?.amountMinor ?? 0) +
            (linesOfKind(result.priced, "material")[0]?.amountMinor ?? 0) +
            (linesOfKind(result.priced, "depth")[0]?.amountMinor ?? 0);
          const numerator =
            BigInt(anchor) *
            BigInt(100 + materialPercent) *
            BigInt(100 + deepCabinetPercent);
          const cell = ((2n * numerator + 10_000_000n) / 20_000_000n) * 1_000n;

          expect(BigInt(parts)).toBe(cell);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("which cabinets take the depth line (P2-c)", () => {
  const everyRowDeepens = new Set(SUPPLIED_BUILD_IDS);
  const base: Scenario = {
    anchors: [100_000],
    materialPercent: 25,
    deepCabinetPercent: 40,
    depthMm: DEEP_MM,
    deepeningIds: everyRowDeepens,
  };

  it("has no depth line at 600, however many rows would deepen", () => {
    expect(
      linesOfKind(pricedOf({ ...base, depthMm: SHALLOW_MM }), "depth"),
    ).toEqual([]);
  });

  it("has no depth line at 700 when no manufacturer-supplied cabinet deepens", () => {
    expect(
      linesOfKind(pricedOf({ ...base, deepeningIds: new Set() }), "depth"),
    ).toEqual([]);
  });

  it("has one depth line at 700 when some cabinet deepens, tracing to the depth rule", () => {
    const [depth, ...others] = linesOfKind(pricedOf(base), "depth");

    expect(others).toEqual([]);
    expect(depth).toMatchObject({
      kind: "depth",
      lineId: "kitchen:depth",
      depthMm: DEEP_MM,
      quantity: 1,
    });
  });

  it("never takes the uplift from a customer-supplied row, even when the row is declared to deepen", () => {
    const priced = pricedOf({
      ...base,
      deepeningIds: new Set(["hood", "fridge-free"]),
    });

    expect(linesOfKind(priced, "depth")).toEqual([]);
    expect(
      cabinetLinesOf(priced).some((line) => line.suppliedBy === "customer"),
    ).toBe(true);
    for (const line of cabinetLinesOf(priced)) {
      if (line.suppliedBy === "customer") expect(line.amountMinor).toBe(0);
    }
  });

  it("changes neither the hardware nor the accessory lines with material or depth", () => {
    fc.assert(
      fc.property(scenarios, scenarios, (one, other) => {
        const sharedKitchen = {
          ...other,
          anchors: one.anchors,
          deepeningIds: one.deepeningIds,
        };
        const untouched = (priced: PricedDesign) =>
          priced.lines.filter(
            (line) => line.kind === "hardware" || line.kind === "accessory",
          );

        expect(untouched(pricedOf(sharedKitchen))).toEqual(
          untouched(pricedOf(one)),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("0 % gives no amount (P2-d)", () => {
  const deepeningEverything = new Set(SUPPLIED_BUILD_IDS);

  it("has a material line of 0 for the reference material, still present so it can read *inclus*", () => {
    const priced = pricedOf(
      {
        anchors: [123_456, 7_890],
        materialPercent: 70,
        deepCabinetPercent: 30,
        depthMm: DEEP_MM,
        deepeningIds: deepeningEverything,
      },
      NOTHING_CHOSEN,
    );
    const [material, ...others] = linesOfKind(priced, "material");

    expect(others).toEqual([]);
    expect(material?.amountMinor).toBe(0);
  });

  it("has a depth line of 0 at 0 %, present because the design is deep and a cabinet deepens", () => {
    const priced = pricedOf({
      anchors: [123_456, 7_890],
      materialPercent: 70,
      deepCabinetPercent: 0,
      depthMm: DEEP_MM,
      deepeningIds: deepeningEverything,
    });

    expect(linesOfKind(priced, "depth")[0]?.amountMinor).toBe(0);
  });
});

describe("the form decides how a book is priced", () => {
  const flatKitchen = kitchenAt(DEEP_MM);

  it("refuses a book in percentage form from the public query until A-6's answer is supplied to it", () => {
    const book = bookOf({
      anchors: [100_000],
      materialPercent: 10,
      deepCabinetPercent: 10,
      depthMm: DEEP_MM,
      deepeningIds: new Set(),
    });
    const result = priceDesign({
      ...flatKitchen,
      book,
      pricingVersion: book.version,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  });

  it("prices a book in the old flat form as it always did, whatever the seam is given", () => {
    const request = {
      ...flatKitchen,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK.version,
    };
    const publicResult = priceDesign(request);
    const withSeam = priceDesignWithDeepening(request, () => true);

    expect(withSeam).toEqual(publicResult);
    expect(publicResult.ok).toBe(true);
    if (publicResult.ok) {
      expect(
        publicResult.priced.lines.some((line) => line.kind === "depth"),
      ).toBe(false);
    }
  });
});
