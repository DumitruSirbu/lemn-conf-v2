// **What the cut-over kept and what it changed** (M10 P3 item 1; ADR 0177 A-2, A-3, A-7).
//
// The sample book was converted from the retired linear shapes to anchored and listed-size ones. Every figure in it is
// invented (ADR 0001 decision 4), so this file asserts no price as right; it asserts that the conversion did not change
// one. The retired coefficients are recorded below as data, so that a row's cabinet price before and after can be
// compared at every width the catalogue builds it at, and the two differences the owner ruled are asserted where they
// are: a width rounds up to the next 50 mm step, and a door counts at the width the body is built at.
//
// The material amount is not compared. It moved from one amount per kitchen to a percentage of the cabinets, which is
// a change of kind and not of value, and ADR 0177 A-1 owns its arithmetic.
import { describe, expect, it } from "vitest";

import { widthDerivedDoorLeafCount } from "../../src/cabinet-handles.js";
import { INSERTABLE_BODY_DEFINITIONS } from "../../src/catalog.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { CabinetPriceLine } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";

/** What a retired linear rule charged: `base + perMm × width`, plus a height and a door term where its shape had one. */
interface RetiredRule {
  readonly baseMinor: number;
  readonly perWidthMillimetreMinor: number;
  readonly perHeightMillimetreMinor?: number;
  readonly perDoorLeafMinor?: number;
}

/** The retired book's cabinet rules, as they stood before the cut-over. A flat row is a base and no width term. */
const RETIRED_RULES: Readonly<Record<string, RetiredRule>> = {
  "base-cabinet": {
    baseMinor: 120_000,
    perWidthMillimetreMinor: 400,
    perDoorLeafMinor: 18_000,
  },
  "base-3drawer": { baseMinor: 180_000, perWidthMillimetreMinor: 500 },
  "base-panbank": { baseMinor: 160_000, perWidthMillimetreMinor: 480 },
  "base-hob-2drawer": { baseMinor: 350_000, perWidthMillimetreMinor: 0 },
  "base-hob-oven": { baseMinor: 420_000, perWidthMillimetreMinor: 0 },
  "base-bottle-cargo": { baseMinor: 90_000, perWidthMillimetreMinor: 450 },
  "base-sink": { baseMinor: 150_000, perWidthMillimetreMinor: 420 },
  "base-dishwasher": { baseMinor: 140_000, perWidthMillimetreMinor: 300 },
  "wall-cabinet": {
    baseMinor: 40_000,
    perWidthMillimetreMinor: 300,
    perHeightMillimetreMinor: 70,
    perDoorLeafMinor: 14_000,
  },
  "wall-lift": {
    baseMinor: 70_000,
    perWidthMillimetreMinor: 350,
    perHeightMillimetreMinor: 100,
  },
  "open-shelf": {
    baseMinor: 30_000,
    perWidthMillimetreMinor: 200,
    perHeightMillimetreMinor: 50,
  },
  "tall-pantry": {
    baseMinor: 300_000,
    perWidthMillimetreMinor: 700,
    perDoorLeafMinor: 22_000,
  },
  "tall-oven-tower": { baseMinor: 900_000, perWidthMillimetreMinor: 0 },
  "tall-fridge-housing": { baseMinor: 700_000, perWidthMillimetreMinor: 0 },
};

/** The structural corners, flat in the retired book: each priced under its own id at the one width it is made. */
const RETIRED_CORNERS: Readonly<Record<string, number>> = {
  "base-corner-x-900": 400_000,
  "base-corner-return-320": 120_000,
  "wall-corner-return-570": 160_000,
  "wall-corner-return-570-top": 90_000,
  "wall-corner-x-900": 160_000,
  "wall-corner-x-900-top": 90_000,
};

const STEP_MM = 50;
const STANDARD_HEIGHT_MM = 700;

const TEN_LEI_MINOR = 1_000;

/** A retired amount as a cabinet line carries it now: rounded half up to ten lei (ADR 0177 A-1). Restated, as an oracle
 *  must not import the rounding it checks. The retired rates were not all whole tens of lei, so a line can differ from
 *  the retired amount by that rounding and by nothing else. */
function tenLeiOf(exactMinor: number): number {
  return Math.round(exactMinor / TEN_LEI_MINOR) * TEN_LEI_MINOR;
}

function roundedUpToTheStep(millimetres: number): number {
  return Math.ceil(millimetres / STEP_MM) * STEP_MM;
}

/** What the retired rule charged a body: the linear sum, with the door leaves its row's width rule gave. */
function retiredAmount(
  buildId: string,
  body: { readonly widthMm: number; readonly heightMm: number },
  leavesAtWidthMm: number,
): number {
  const rule = RETIRED_RULES[buildId];
  if (rule === undefined) throw new Error(`no retired rule for "${buildId}"`);
  return (
    rule.baseMinor +
    rule.perWidthMillimetreMinor * body.widthMm +
    (rule.perHeightMillimetreMinor ?? 0) * body.heightMm +
    (rule.perDoorLeafMinor ?? 0) *
      widthDerivedDoorLeafCount({
        buildId,
        rule: KITCHEN_L_BODY_CATALOG.get(buildId)?.cabinetHandles,
        widthMm: leavesAtWidthMm,
      })
  );
}

function designOfOne(body: DesignPlacement["body"]): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [{ id: "x", wall: "A", alongMm: 1300, y0Mm: 0, body }],
  };
}

/** The one cabinet line the sample book prices a single body at (material PAL, depth 600, so no uplift). */
function newAmount(body: DesignPlacement["body"]): number {
  const result = priceDesign({
    design: designOfOne(body),
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  const line = result.priced.lines.find(
    (candidate): candidate is CabinetPriceLine => candidate.kind === "cabinet",
  );
  if (line === undefined) throw new Error("no cabinet line");
  return line.amountMinor;
}

describe("the converted sample book prices every insertable row as the retired one did, at every width the catalogue builds it", () => {
  const priced = [...INSERTABLE_BODY_DEFINITIONS].filter(
    ([buildId]) => RETIRED_RULES[buildId] !== undefined,
  );

  it("converts every manufacturer-supplied insertable row and nothing more (the sweep is not empty)", () => {
    const manufacturerRows = SAMPLE_PRICE_BOOK.cabinetRules
      .filter((rule) => rule.suppliedBy !== "customer")
      .map((rule) => rule.buildId)
      .filter((buildId) =>
        INSERTABLE_BODY_DEFINITIONS.some(([id]) => id === buildId),
      );

    expect(priced.map(([buildId]) => buildId).sort()).toEqual(
      [...manufacturerRows].sort(),
    );
    expect(priced.length).toBe(Object.keys(RETIRED_RULES).length);
  });

  it.each(
    priced.map(([buildId, definition]) => [buildId, definition] as const),
  )(
    "%s: at a width on the 50 mm step the price is the retired price, and off it the price of the next step up",
    (buildId, definition) => {
      const heightMm = STANDARD_HEIGHT_MM;
      for (const widthMm of definition.sizesMm ?? []) {
        const pricedWidthMm = roundedUpToTheStep(widthMm);
        // The door count is the built width's (A-3); the width term is the rounded-up width's (A-2).
        const expected = tenLeiOf(
          retiredAmount(buildId, { widthMm: pricedWidthMm, heightMm }, widthMm),
        );

        expect(
          newAmount({ buildId, widthMm, heightMm }),
          `${buildId} ${String(widthMm)}`,
        ).toBe(expected);
      }
    },
  );

  it.each(["wall-cabinet", "wall-lift", "open-shelf"])(
    "%s: a height on the 50 mm step is priced as the retired price, and one off it as the next step up",
    (buildId) => {
      for (const heightMm of [300, 350, 400, 650, 700, 750, 900, 910, 975]) {
        const expected = tenLeiOf(
          retiredAmount(
            buildId,
            { widthMm: 600, heightMm: roundedUpToTheStep(heightMm) },
            600,
          ),
        );

        expect(
          newAmount({ buildId, widthMm: 600, heightMm }),
          `${buildId} ${String(heightMm)}`,
        ).toBe(expected);
      }
    },
  );
});

describe("the structural corners keep their retired prices at the widths they are made", () => {
  it.each(Object.entries(RETIRED_CORNERS))(
    "%s prices at the retired amount",
    (buildId, retiredMinor) => {
      expect(KITCHEN_L_BODY_CATALOG.has(buildId)).toBe(true);
      const widthMm = builtWidthOf(buildId);

      expect(
        newAmount({ buildId, widthMm, heightMm: STANDARD_HEIGHT_MM }),
      ).toBe(retiredMinor);
    },
  );
});

/** The width each structural corner is made at, which its id states ("base-corner-return-320", "wall-corner-x-900-top"). */
function builtWidthOf(buildId: string): number {
  const stated = /-(\d+)(?:-top)?$/.exec(buildId)?.[1];
  if (stated === undefined) throw new Error(`"${buildId}" states no width`);
  return Number(stated);
}
