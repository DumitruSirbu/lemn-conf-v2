// Adversarial QA of ADR 0068 and plan A-3: the signed door term must count leaves the way hardware does.
//
// The door term is the leaves the BUILT body carries (the count hardware bills hinges over) minus the priced-as
// row's leaves at its anchor width. This file holds it to that for EVERY insertable row (a row that does not follow
// width must price a zero delta, and hardware must agree it has none), against the hardware path itself
// (`countHardwareMechanisms`), and for resized SEEDED bodies, which are priced as another row
// (ADR 0092 decision 1) while hardware counts the body that stands in the kitchen.
import { describe, expect, it } from "vitest";

import {
  INSERTABLE_BODY_DEFINITIONS,
  resolveCatalogEquivalent,
} from "../../src/catalog.js";
import type { DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  doorLeafHeightsMm,
  frontPopulationQueryFor,
  UnbuildableDoorBandError,
  UndeclaredFrontPopulationError,
} from "../../src/front-population.js";
import {
  countHardwareMechanisms,
  HINGES_PER_DOOR_LEAF,
  HINGES_PER_TALL_DOOR_LEAF,
  TALL_DOOR_LEAF_THRESHOLD_MM,
} from "../../src/hardware-mechanisms.js";
import type { AnchoredFormula } from "../../src/pricing/anchored-price-formula.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import {
  pricedByWidth,
  pricedByWidthAndDoorLeaves,
  type CabinetPriceRule,
  type PriceBook,
  type PriceFormula,
} from "../../src/pricing/price-book.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const ONE_BANI_PER_LEAF_ANCHOR_MM = 600;
const ONE_BANI_PER_LEAF: Omit<AnchoredFormula, "shape"> = {
  anchorWidthMm: ONE_BANI_PER_LEAF_ANCHOR_MM,
  anchorMinor: 1_000_000,
  perStepWiderMinor: 0,
  perStepNarrowerMinor: 0,
  perExtraDoorLeafMinor: 1,
};

const INSERTABLE_BUILD_IDS = [...INSERTABLE_BODY_DEFINITIONS].map(
  ([buildId]) => buildId,
);

function placementOf(
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return {
    id: "x",
    wall: "A",
    alongMm: 1300,
    y0Mm: 0,
    body: { buildId, widthMm, heightMm },
  };
}

function bookWithOneRule(rule: CabinetPriceRule): PriceBook {
  return { ...SAMPLE_PRICE_BOOK, cabinetRules: [rule] };
}

type DoorTermResult =
  | { readonly ok: true; readonly deltaBani: number }
  | {
      readonly ok: false;
      readonly code: string;
      readonly placementId?: string;
    };

/** The door term as a result, so a refusal can be asserted instead of thrown. */
function priceDoorTerm(
  ruleBuildId: string,
  placement: DesignPlacement,
): DoorTermResult {
  const rule: CabinetPriceRule = {
    ruleId: "cabinet.anchored-door",
    buildId: ruleBuildId,
    formula: { shape: "anchored-width-and-door-leaves", ...ONE_BANI_PER_LEAF },
  };
  const book = bookWithOneRule(rule);
  const result = priceDesign({
    design: { ...KITCHEN_L_DESIGN, placements: [placement] },
    catalog: CATALOG,
    book,
    pricingVersion: book.version,
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.failure.code,
      ...(result.failure.placementId === undefined
        ? {}
        : { placementId: result.failure.placementId }),
    };
  }
  const line = result.priced.lines.find(
    (candidate) => candidate.kind === "cabinet",
  );
  if (line?.kind !== "cabinet") throw new Error("no cabinet line");
  return {
    ok: true,
    deltaBani: line.amountMinor - ONE_BANI_PER_LEAF.anchorMinor,
  };
}

function doorTermBaniOf(
  ruleBuildId: string,
  placement: DesignPlacement,
): number {
  const rule: CabinetPriceRule = {
    ruleId: "cabinet.anchored-door",
    buildId: ruleBuildId,
    formula: { shape: "anchored-width-and-door-leaves", ...ONE_BANI_PER_LEAF },
  };
  const book = bookWithOneRule(rule);
  const result = priceDesign({
    design: { ...KITCHEN_L_DESIGN, placements: [placement] },
    catalog: CATALOG,
    book,
    pricingVersion: book.version,
  });
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  const line = result.priced.lines.find(
    (candidate) => candidate.kind === "cabinet",
  );
  if (line?.kind !== "cabinet") throw new Error("no cabinet line");
  return line.amountMinor - ONE_BANI_PER_LEAF.anchorMinor;
}

function entriesOf(placement: DesignPlacement) {
  return projectDesignForDisplay(
    { ...KITCHEN_L_DESIGN, placements: [placement] },
    CATALOG,
  ).flatMap((group) => group.entries);
}

/** The leaf list hardware reads for the body that stands in the kitchen. */
function builtLeafHeightsMm(placement: DesignPlacement): readonly number[] {
  const definition = CATALOG.get(placement.body.buildId);
  if (!definition) throw new Error(`no row ${placement.body.buildId}`);
  return doorLeafHeightsMm(
    frontPopulationQueryFor({ body: placement.body, definition }),
  );
}

function hingesOnLeaves(leafHeightsMm: readonly number[]): number {
  return leafHeightsMm
    .map((heightMm) =>
      heightMm > TALL_DOOR_LEAF_THRESHOLD_MM
        ? HINGES_PER_TALL_DOOR_LEAF
        : HINGES_PER_DOOR_LEAF,
    )
    .reduce((sum, hinges) => sum + hinges, 0);
}

function rowHeightMm(buildId: string): number {
  return CATALOG.get(buildId)?.nominalHeightMm ?? 700;
}

describe("every insertable row: the door term moves exactly as hardware's leaf list does (ADR 0068, A-3)", () => {
  it("covers all sixteen insertable rows, so the sweep is not vacuous", () => {
    expect(INSERTABLE_BUILD_IDS).toHaveLength(16);
  });

  it.each(INSERTABLE_BUILD_IDS)(
    "%s: price delta = leaves(w) - leaves(anchor) as hardware counts them, at every width 50..1200",
    (buildId) => {
      const heightMm = rowHeightMm(buildId);
      const anchorLeaves = builtLeafHeightsMm(
        placementOf(buildId, ONE_BANI_PER_LEAF_ANCHOR_MM, heightMm),
      ).length;

      for (let widthMm = 50; widthMm <= 1200; widthMm += 1) {
        const placement = placementOf(buildId, widthMm, heightMm);
        const hardwareLeaves = builtLeafHeightsMm(placement).length;

        expect(
          doorTermBaniOf(buildId, placement),
          `${buildId} at ${String(widthMm)} mm`,
        ).toBe(hardwareLeaves - anchorLeaves);
      }
    },
  );

  it.each(INSERTABLE_BUILD_IDS)(
    "%s: the hinges the hardware path bills are the hinge rule applied over the same leaf list the door term counts",
    (buildId) => {
      const heightMm = rowHeightMm(buildId);

      for (const widthMm of [200, 300, 450, 499, 500, 600, 800, 1000]) {
        const placement = placementOf(buildId, widthMm, heightMm);

        expect(
          countHardwareMechanisms(entriesOf(placement), CATALOG).hinges,
          `${buildId} at ${String(widthMm)} mm`,
        ).toBe(hingesOnLeaves(builtLeafHeightsMm(placement)));
      }
    },
  );
});

describe("a resized SEEDED body is priced as another row and agrees with hardware on its own leaves (ADR 0068, ADR 0092 d1)", () => {
  const SEEDED = KITCHEN_L_DESIGN.placements.filter((placement) => {
    const priced = resolveCatalogEquivalent(CATALOG, placement.body.buildId);
    return priced !== undefined && priced.buildId !== placement.body.buildId;
  });
  const HEIGHTS_MM = [1, 20, 100, 350, 700, 900, 901, 2200];

  type Expectation =
    | { readonly kind: "leaves"; readonly delta: number }
    | { readonly kind: "refused"; readonly code: string };

  /** What hardware's own leaf count says about this body: a delta against the equivalent row's anchor leaves, or the
   *  refusal its fronts raise. Written against the hardware path, not the pricing one. */
  function expectedBy(
    seeded: DesignPlacement,
    pricedAsBuildId: string,
    size: { readonly widthMm: number; readonly heightMm: number },
  ): Expectation {
    try {
      const anchorLeaves = builtLeafHeightsMm({
        ...seeded,
        body: {
          buildId: pricedAsBuildId,
          widthMm: ONE_BANI_PER_LEAF_ANCHOR_MM,
          heightMm: size.heightMm,
        },
      }).length;
      const built = builtLeafHeightsMm({
        ...seeded,
        body: { ...seeded.body, ...size },
      });
      return { kind: "leaves", delta: built.length - anchorLeaves };
    } catch (error) {
      if (error instanceof UnbuildableDoorBandError) {
        return { kind: "refused", code: "UNBUILDABLE_DOOR_BAND" };
      }
      if (error instanceof UndeclaredFrontPopulationError) {
        return { kind: "refused", code: "UNDECLARED_FRONT_POPULATION" };
      }
      throw error;
    }
  }

  it("finds seeded placements that are priced as another row, so the claim is not vacuous", () => {
    expect(SEEDED.length).toBeGreaterThan(0);
  });

  it("charges every seeded body the leaf delta hardware sees, or refuses with the code its fronts raise, at every width 50..1200 and seven heights", () => {
    const disagreements: string[] = [];
    let compared = 0;
    for (const seeded of SEEDED) {
      const pricedAs = resolveCatalogEquivalent(CATALOG, seeded.body.buildId);
      if (!pricedAs) continue;
      for (const heightMm of HEIGHTS_MM) {
        for (let widthMm = 50; widthMm <= 1200; widthMm += 3) {
          const placement = {
            ...seeded,
            body: { ...seeded.body, widthMm, heightMm },
          };
          const expected = expectedBy(seeded, pricedAs.buildId, {
            widthMm,
            heightMm,
          });
          const result = priceDoorTerm(pricedAs.buildId, placement);
          compared += 1;
          const label = `${seeded.body.buildId} ${String(widthMm)}x${String(heightMm)}`;
          if (expected.kind === "leaves") {
            if (!result.ok || result.deltaBani !== expected.delta) {
              disagreements.push(
                `${label}: wanted ${String(expected.delta)}, got ${JSON.stringify(result)}`,
              );
            }
          } else if (result.ok || result.code !== expected.code) {
            disagreements.push(
              `${label}: wanted refusal ${expected.code}, got ${JSON.stringify(result)}`,
            );
          }
        }
      }
    }

    expect(compared).toBeGreaterThan(1_000);
    expect(disagreements.slice(0, 10)).toEqual([]);
  });

  it("does the same for every insertable row at every height, including the banded tall rows and a frame too short to hang a door", () => {
    const disagreements: string[] = [];
    for (const buildId of INSERTABLE_BUILD_IDS) {
      for (const heightMm of HEIGHTS_MM) {
        for (let widthMm = 50; widthMm <= 1200; widthMm += 7) {
          const placement = placementOf(buildId, widthMm, heightMm);
          const expected = expectedBy(placement, buildId, {
            widthMm,
            heightMm,
          });
          const result = priceDoorTerm(buildId, placement);
          const label = `${buildId} ${String(widthMm)}x${String(heightMm)}`;
          if (expected.kind === "leaves") {
            if (!result.ok || result.deltaBani !== expected.delta) {
              disagreements.push(
                `${label}: wanted ${String(expected.delta)}, got ${JSON.stringify(result)}`,
              );
            }
          } else if (result.ok || result.code !== expected.code) {
            disagreements.push(
              `${label}: wanted refusal ${expected.code}, got ${JSON.stringify(result)}`,
            );
          }
        }
      }
    }

    expect(disagreements.slice(0, 10)).toEqual([]);
  });

  it("never prices a body whose frame leaves no door band: the refusal is UNBUILDABLE_DOOR_BAND and names the placement", () => {
    const wall = SEEDED.find(
      (candidate) => candidate.body.buildId === "wall-2door-600",
    );
    if (!wall) throw new Error("no seeded wall-2door-600");
    const tooShort = { ...wall, body: { ...wall.body, heightMm: 1 } };

    const result = priceDoorTerm("wall-cabinet", tooShort);

    expect(result).toMatchObject({
      ok: false,
      code: "UNBUILDABLE_DOOR_BAND",
      placementId: tooShort.id,
    });
  });
});

describe("a body whose fronts cannot be read is refused, never priced, on every shape", () => {
  const FORMULAS: readonly (readonly [string, PriceFormula])[] = [
    [
      "anchored door shape",
      { shape: "anchored-width-and-door-leaves", ...ONE_BANI_PER_LEAF },
    ],
    [
      "anchored width shape",
      {
        shape: "anchored-width",
        anchorWidthMm: 600,
        anchorMinor: 1_000_000,
        perStepWiderMinor: 0,
        perStepNarrowerMinor: 0,
      },
    ],
    [
      "linear door shape",
      pricedByWidthAndDoorLeaves({
        baseMinor: 1_000_000,
        perWidthMillimetreMinor: 0,
        perDoorLeafMinor: 1,
      }),
    ],
    [
      "linear width shape",
      pricedByWidth({ baseMinor: 1_000_000, perWidthMillimetreMinor: 0 }),
    ],
  ];

  const DOOR_FORMULA: PriceFormula = {
    shape: "anchored-width-and-door-leaves",
    ...ONE_BANI_PER_LEAF,
  };

  function withoutFronts(buildId: string): BodyCatalog {
    const definition = CATALOG.get(buildId);
    if (!definition) throw new Error(`no row ${buildId}`);
    const withoutDeclaration: Record<string, unknown> = { ...definition };
    delete withoutDeclaration["fronts"];
    return new Map([
      ...CATALOG,
      [buildId, withoutDeclaration as unknown as BodyDefinition],
    ]);
  }

  function resultFor(
    formula: PriceFormula,
    catalog: BodyCatalog,
    heightMm: number,
  ) {
    const rule: CabinetPriceRule = {
      ruleId: "cabinet.undeclared",
      buildId: "wall-cabinet",
      formula,
    };
    const book = bookWithOneRule(rule);
    return priceDesign({
      design: {
        ...KITCHEN_L_DESIGN,
        placements: [placementOf("wall-cabinet", 700, heightMm)],
      },
      catalog,
      book,
      pricingVersion: book.version,
    });
  }

  it.each(FORMULAS)(
    "%s: a row with no fronts declaration is refused with UNDECLARED_FRONT_POPULATION",
    (_label, formula) => {
      const result = resultFor(formula, withoutFronts("wall-cabinet"), 700);

      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.failure.code).toBe("UNDECLARED_FRONT_POPULATION");
    },
  );

  it.each(FORMULAS)(
    "%s: a frame too short for a door is refused with UNBUILDABLE_DOOR_BAND",
    (_label, formula) => {
      const result = resultFor(formula, CATALOG, 1);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.code).toBe("UNBUILDABLE_DOOR_BAND");
    },
  );

  it("names the placement and the rule when the anchored door term is where the fronts failed", () => {
    const result = resultFor(DOOR_FORMULA, withoutFronts("wall-cabinet"), 700);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.failure).toMatchObject({
        placementId: "x",
        id: "cabinet.undeclared",
      });
  });

  it("prices a linear-shape design exactly as before for every ordinary body, so the new codes cost it nothing", () => {
    const linear = pricedByWidthAndDoorLeaves({
      baseMinor: 1_000_000,
      perWidthMillimetreMinor: 3,
      perDoorLeafMinor: 7,
    });
    for (let widthMm = 200; widthMm <= 900; widthMm += 25) {
      const result = resultFor(linear, CATALOG, 700);
      expect(result.ok, String(widthMm)).toBe(true);
    }
  });
});
