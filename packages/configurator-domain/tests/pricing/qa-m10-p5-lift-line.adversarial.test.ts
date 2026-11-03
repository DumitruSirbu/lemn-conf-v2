// ADR 0177 A-20, adversarial: the hardware line of a kitchen with lift-up doors, against an oracle written from
// the rule's own words (a lift door counts one lift and two hinges, or three when its door is wider than 500 mm; the
// line is `r10` of the rates times the counts), and against the cabinet preview. Neither the oracle's counts nor its
// rounding come from the module under test, so its 500 mm boundary and the door's 6 mm reveal are typed here and not
// imported.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { countHardwareMechanisms } from "../../src/hardware-mechanisms.js";
import { previewCabinet } from "../../src/price-dashboard/cabinet-preview.js";
import {
  buildableHeightsMm,
  pricedRowOf,
} from "../../src/price-dashboard/priced-row.js";
import { HARDWARE_RATE_FIELDS } from "../../src/price-dashboard/book-field-address.js";
import type { HardwareTier, PriceBook } from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PricedDesign } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  DEEP_DEPTH_MM,
  DEEPENING_ROWS,
  priceOneCabinet,
  REFERENCE_MATERIAL_ID,
  ruleOf,
  SHALLOW_DEPTH_MM,
} from "../price-dashboard/m2-support.js";
import { CABINETRY_CHIPS_MM } from "../support/width-model.js";

const LIFT_DOOR_THIRD_HINGE_ABOVE_MM = 500;
const BUILT_LIFT_DOOR_REVEAL_MM = 6;
const HINGES_ON_A_NARROW_LIFT_DOOR = 2;
const HINGES_ON_A_WIDE_LIFT_DOOR = 3;
const TEN_LEI_MINOR = 1_000;
const WALL_ROW_FLOOR_MM = 1_500;
const WALL_LIFT_HEIGHT_MM = 700;

/** Half up to ten lei in integer arithmetic, so the seam does not vouch for itself. */
function r10(exactMinor: number): number {
  return (
    Math.floor((exactMinor + TEN_LEI_MINOR / 2) / TEN_LEI_MINOR) * TEN_LEI_MINOR
  );
}

/** The hinges on a lift door, judged by the door's width: the body's less its reveal. */
function oracleHingesOnLiftDoor(bodyWidthMm: number): number {
  return bodyWidthMm - BUILT_LIFT_DOOR_REVEAL_MM >
    LIFT_DOOR_THIRD_HINGE_ABOVE_MM
    ? HINGES_ON_A_WIDE_LIFT_DOOR
    : HINGES_ON_A_NARROW_LIFT_DOOR;
}

interface Rates {
  readonly perHingeMinor: number;
  readonly perDrawerMinor: number;
  readonly perPushToOpenMinor: number;
  readonly perLiftMinor: number;
  readonly perPushRunnerMinor: number;
}

function bookWithRates(
  tierId: string,
  rates: Rates,
  base: PriceBook = SAMPLE_PRICE_BOOK,
): PriceBook {
  return {
    ...base,
    hardware: {
      ...base.hardware,
      tiers: base.hardware.tiers.map(
        (tier): HardwareTier =>
          tier.tierId === tierId ? { ...tier, ...rates } : tier,
      ),
    },
  };
}

function liftAt(index: number, widthMm: number): Design["placements"][number] {
  return {
    id: `lift-${String(index)}`,
    wall: "A",
    alongMm: 400 + 800 * index,
    y0Mm: WALL_ROW_FLOOR_MM,
    body: {
      buildId: "wall-lift",
      widthMm,
      heightMm: WALL_LIFT_HEIGHT_MM,
    },
  };
}

function kitchenOf(
  placements: Design["placements"],
  settings: NonNullable<Design["settings"]> = {},
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { cabinetDepthMm: SHALLOW_DEPTH_MM, ...settings },
    placements,
  };
}

function pricedOrThrow(
  design: Design,
  book: PriceBook,
  selections: { hardwareTierId: string; materialTierId?: string },
): PricedDesign {
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(
      design.settings?.cabinetDepthMm ?? SHALLOW_DEPTH_MM,
    ),
    book,
    pricingVersion: book.version,
    selections,
    deepeningRows: DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) {
    throw new Error(`refused: ${result.failure.code} ${result.failure.detail}`);
  }
  return result.priced;
}

function hardwareLineOf(priced: PricedDesign): number {
  const line = priced.lines.find(({ kind }) => kind === "hardware");
  if (line === undefined) throw new Error("no hardware line");
  return line.amountMinor;
}

const rateArbitrary = fc.integer({ min: 0, max: 400_000 });

const ratesArbitrary: fc.Arbitrary<Rates> = fc.record({
  perHingeMinor: rateArbitrary,
  perDrawerMinor: rateArbitrary,
  perPushToOpenMinor: rateArbitrary,
  perLiftMinor: rateArbitrary,
  perPushRunnerMinor: rateArbitrary,
});

describe("a one-lift kitchen: the whole-kitchen hardware line, the oracle and the cabinet preview agree", () => {
  const settings = fc.record({
    widthMm: fc.constantFrom(...CABINETRY_CHIPS_MM),
    tier: fc.constantFrom(
      ...SAMPLE_PRICE_BOOK.hardware.tiers.map(({ tierId }) => tierId),
    ),
    material: fc.constantFrom(
      ...SAMPLE_PRICE_BOOK.material.tiers.map(({ tierId }) => tierId),
    ),
    depthMm: fc.constantFrom(SHALLOW_DEPTH_MM, DEEP_DEPTH_MM),
    rates: ratesArbitrary,
  });

  it("holds at every width, tier, depth, material and set of rates", () => {
    fc.assert(
      fc.property(settings, (s) => {
        const book = bookWithRates(s.tier, s.rates);
        const priced = priceOneCabinet(
          {
            buildId: "wall-lift",
            widthMm: s.widthMm,
            heightMm: WALL_LIFT_HEIGHT_MM,
            y0Mm: WALL_ROW_FLOOR_MM,
          },
          {
            book,
            depthMm: s.depthMm,
            materialTierId: s.material,
            hardwareTierId: s.tier,
          },
        );
        const expectedMinor = r10(
          oracleHingesOnLiftDoor(s.widthMm) * s.rates.perHingeMinor +
            1 * s.rates.perLiftMinor,
        );
        const preview = previewCabinet({
          rule: ruleOf("wall-lift", book),
          catalog: buildKitchenLBodyCatalog(s.depthMm),
          book,
          material: s.material,
          depth: s.depthMm,
          deepeningRows: DEEPENING_ROWS,
          hardwareTier: s.tier,
        });
        if (!preview.ok) throw new Error(preview.code);
        const cell = preview.rows.find((row) => row.widthMm === s.widthMm);

        expect(hardwareLineOf(priced)).toBe(expectedMinor);
        expect(cell?.hardwareMinor).toBe(expectedMinor);
      }),
      { numRuns: 300 },
    );
  });

  it("is moved by a lift rate and by nothing else it does not charge: the cabinet, material and depth lines hold still", () => {
    const withoutLiftRate = bookWithRates("hardware.soft-close", {
      ...ratesOf("hardware.soft-close"),
      perLiftMinor: 0,
    });
    const withLiftRate = bookWithRates("hardware.soft-close", {
      ...ratesOf("hardware.soft-close"),
      perLiftMinor: 90_000,
    });
    const priceAt = (book: PriceBook) =>
      priceOneCabinet(
        {
          buildId: "wall-lift",
          widthMm: 600,
          heightMm: WALL_LIFT_HEIGHT_MM,
          y0Mm: WALL_ROW_FLOOR_MM,
        },
        {
          book,
          depthMm: DEEP_DEPTH_MM,
          materialTierId: SAMPLE_PRICE_BOOK.material.tiers.at(-1)?.tierId ?? "",
          hardwareTierId: "hardware.soft-close",
        },
      );

    const before = priceAt(withoutLiftRate);
    const after = priceAt(withLiftRate);

    expect(hardwareLineOf(after) - hardwareLineOf(before)).toBe(90_000);
    expect(after.totalMinor - before.totalMinor).toBe(90_000);
    const otherLines = (priced: PricedDesign) =>
      priced.lines.filter(({ kind }) => kind !== "hardware");
    expect(otherLines(after)).toEqual(otherLines(before));
  });

  it("would be told apart from a three-rate line: at the sample rates the lift term is not rounded away", () => {
    for (const tier of SAMPLE_PRICE_BOOK.hardware.tiers) {
      const priced = pricedOrThrow(
        kitchenOf([liftAt(0, 600)]),
        SAMPLE_PRICE_BOOK,
        { hardwareTierId: tier.tierId },
      );

      expect(hardwareLineOf(priced)).not.toBe(r10(3 * tier.perHingeMinor));
      expect(hardwareLineOf(priced)).toBe(
        r10(3 * tier.perHingeMinor + tier.perLiftMinor),
      );
    }
  });
});

function ratesOf(tierId: string): Rates {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (tier === undefined) throw new Error(`no tier ${tierId}`);
  return {
    perHingeMinor: tier.perHingeMinor,
    perDrawerMinor: tier.perDrawerMinor,
    perPushToOpenMinor: tier.perPushToOpenMinor,
    perLiftMinor: tier.perLiftMinor,
    perPushRunnerMinor: tier.perPushRunnerMinor,
  };
}

describe("the rounding seam: the hardware line is rounded once over every lift of the kitchen", () => {
  const ONLY_LIFTS: Rates = {
    perHingeMinor: 0,
    perDrawerMinor: 0,
    perPushToOpenMinor: 0,
    perLiftMinor: 500,
    perPushRunnerMinor: 0,
  };
  const HALF_OF_TEN_LEI_MINOR = 500;

  it.each([
    [1, 1_000],
    [2, 1_000],
    [3, 2_000],
    [5, 3_000],
  ])(
    "bills %i lifts at half of ten lei each as r10 of their sum, %i bani, not the sum of r10 each",
    (liftCount, expectedMinor) => {
      const book = bookWithRates("hardware.standard", ONLY_LIFTS);
      const placements = Array.from({ length: liftCount }, (_, index) =>
        liftAt(index, 300),
      );

      const line = hardwareLineOf(
        pricedOrThrow(kitchenOf(placements), book, {
          hardwareTierId: "hardware.standard",
        }),
      );

      expect(line).toBe(r10(liftCount * HALF_OF_TEN_LEI_MINOR));
      expect(line).toBe(expectedMinor);
      if (liftCount === 3) {
        expect(line).not.toBe(liftCount * r10(HALF_OF_TEN_LEI_MINOR));
      }
    },
  );

  it.each([499, 500, 501, 1_499, 1_500, 1_501])(
    "rounds a lone lift of %i bani half up to ten lei",
    (liftMinor) => {
      const book = bookWithRates("hardware.standard", {
        ...ONLY_LIFTS,
        perLiftMinor: liftMinor,
      });

      const line = hardwareLineOf(
        pricedOrThrow(kitchenOf([liftAt(0, 300)]), book, {
          hardwareTierId: "hardware.standard",
        }),
      );

      expect(line).toBe(r10(liftMinor));
    },
  );

  it("sums lifts and hinges of several doors exactly before it rounds, over a swept kitchen", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...CABINETRY_CHIPS_MM), {
          minLength: 1,
          maxLength: 6,
        }),
        ratesArbitrary,
        (widths, rates) => {
          const book = bookWithRates("hardware.standard", rates);
          const placements = widths.map((widthMm, index) =>
            liftAt(index, widthMm),
          );
          const exactMinor = widths.reduce(
            (sum, widthMm) =>
              sum +
              oracleHingesOnLiftDoor(widthMm) * rates.perHingeMinor +
              rates.perLiftMinor,
            0,
          );

          const line = hardwareLineOf(
            pricedOrThrow(kitchenOf(placements), book, {
              hardwareTierId: "hardware.standard",
            }),
          );

          expect(line).toBe(r10(exactMinor));
        },
      ),
    );
  });
});

describe("the width a lift door is judged by, at every width the cabinet is built at", () => {
  it("has two hinges up to and including 500 mm and three from 550 mm, one lift at each", () => {
    for (const widthMm of CABINETRY_CHIPS_MM) {
      const counts = countOf(kitchenOf([liftAt(0, widthMm)]));

      expect(counts).toEqual({
        hinges: oracleHingesOnLiftDoor(widthMm),
        drawers: 0,
        pushRunners: 0,
        pushToOpen: 0,
        lifts: 1,
      });
    }
  });

  it("judges the door and not the body: a body of 501 to 506 mm hangs a door of 500 mm or less, so it takes two", () => {
    for (let widthMm = 495; widthMm <= 520; widthMm += 1) {
      const counts = countOf(kitchenOf([liftAt(0, widthMm)]));

      expect(counts.hinges).toBe(widthMm <= 506 ? 2 : 3);
    }
  });

  it("does not depend on the height the body is built at, as the height rule it replaces does", () => {
    for (const heightMm of [300, 400, 694, 700, 750, 1_000, 1_200, 2_200]) {
      const design = kitchenOf([
        {
          ...liftAt(0, 400),
          body: { buildId: "wall-lift", widthMm: 400, heightMm },
        },
      ]);

      expect(countOf(design)).toMatchObject({ hinges: 2, lifts: 1 });
    }
  });
});

function countOf(design: Design) {
  return countHardwareMechanisms(
    projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG).flatMap(
      (group) => group.entries,
    ),
    KITCHEN_L_BODY_CATALOG,
  );
}

describe("a lift door in a push-to-open kitchen", () => {
  const PUSH_KITCHEN = { handle: "push" as const };

  it("keeps its hinges and its lift, and is billed the one latch its door leaf takes", () => {
    for (const widthMm of CABINETRY_CHIPS_MM) {
      const counts = countOf(kitchenOf([liftAt(0, widthMm)], PUSH_KITCHEN));

      expect(counts).toEqual({
        hinges: oracleHingesOnLiftDoor(widthMm),
        drawers: 0,
        pushRunners: 0,
        pushToOpen: 1,
        lifts: 1,
      });
    }
  });

  it("is billed every term of the line, the latch beside the lift", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CABINETRY_CHIPS_MM),
        ratesArbitrary,
        (widthMm, rates) => {
          const book = bookWithRates("hardware.soft-close", rates);

          const line = hardwareLineOf(
            pricedOrThrow(kitchenOf([liftAt(0, widthMm)], PUSH_KITCHEN), book, {
              hardwareTierId: "hardware.soft-close",
            }),
          );

          expect(line).toBe(
            r10(
              oracleHingesOnLiftDoor(widthMm) * rates.perHingeMinor +
                rates.perPushToOpenMinor +
                rates.perLiftMinor,
            ),
          );
        },
      ),
    );
  });

  it("leaves the cabinet preview's body floor-standing and unlatched: its cell is the default-handle kitchen's, not the push one", () => {
    const rates = ratesOf("hardware.soft-close");
    expect(rates.perPushToOpenMinor).toBeGreaterThan(0);
    const preview = previewCabinet({
      rule: ruleOf("wall-lift"),
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      material: REFERENCE_MATERIAL_ID,
      depth: SHALLOW_DEPTH_MM,
      deepeningRows: DEEPENING_ROWS,
      hardwareTier: "hardware.soft-close",
    });
    if (!preview.ok) throw new Error(preview.code);
    const cell = preview.rows.find((row) => row.widthMm === 600);

    expect(cell?.hardwareMinor).toBe(
      r10(3 * rates.perHingeMinor + rates.perLiftMinor),
    );
  });
});

describe("each rate is charged over its own count, in a kitchen carrying every mechanism", () => {
  const MIXED_KITCHEN: Design = kitchenOf(
    [
      liftAt(0, 600),
      liftAt(1, 400),
      {
        id: "drawers",
        wall: "A",
        alongMm: 4_000,
        y0Mm: 0,
        body: { buildId: "base-3drawer", widthMm: 600, heightMm: 820 },
      },
      {
        id: "top",
        wall: "A",
        alongMm: 5_000,
        y0Mm: 2_200,
        body: { buildId: "wall-2door-600-top", widthMm: 600, heightMm: 400 },
      },
      {
        id: "push-drawers",
        wall: "A",
        alongMm: 6_000,
        y0Mm: 0,
        body: {
          buildId: "base-3drawer",
          widthMm: 600,
          heightMm: 820,
          handle: "push",
        },
      },
    ],
    {},
  );

  it.each(HARDWARE_RATE_FIELDS)(
    "moves the line by %s times the number of mechanisms it is charged over",
    (field) => {
      const counts = countOf(MIXED_KITCHEN);
      const countOfField: Record<
        (typeof HARDWARE_RATE_FIELDS)[number],
        number
      > = {
        perHingeMinor: counts.hinges,
        perDrawerMinor: counts.drawers,
        perPushToOpenMinor: counts.pushToOpen,
        perLiftMinor: counts.lifts,
        perPushRunnerMinor: counts.pushRunners,
      };
      const BASE: Rates = {
        perHingeMinor: 0,
        perDrawerMinor: 0,
        perPushToOpenMinor: 0,
        perLiftMinor: 0,
        perPushRunnerMinor: 0,
      };
      const STEP_MINOR = 1_000;
      const lineAt = (rates: Rates) =>
        hardwareLineOf(
          pricedOrThrow(
            MIXED_KITCHEN,
            bookWithRates("hardware.standard", rates),
            {
              hardwareTierId: "hardware.standard",
            },
          ),
        );

      expect(countOfField[field]).toBeGreaterThan(0);
      expect(lineAt({ ...BASE, [field]: STEP_MINOR })).toBe(
        STEP_MINOR * countOfField[field],
      );
    },
  );

  it("counts the mixed kitchen as the oracle does: 3 + 2 + 4 hinges, 3 drawers, 3 push runners, 2 lifts and 2 latches", () => {
    expect(countOf(MIXED_KITCHEN)).toEqual({
      hinges: 3 + 2 + 4,
      drawers: 3,
      pushRunners: 3,
      pushToOpen: 2,
      lifts: 2,
    });
  });
});

describe("the declaration decides, in the catalogue the kitchen is priced against", () => {
  it("prices no lift and the height rule on a wall-lift row whose declaration is taken away", () => {
    const declaring = KITCHEN_L_BODY_CATALOG.get("wall-lift");
    if (declaring === undefined) throw new Error("no wall-lift row");
    const rule = declaring.fronts;
    if (rule === undefined || rule.countedFrom !== "declared-leaves") {
      throw new Error("the wall-lift row no longer declares its leaves");
    }
    const { liftUp: ignoredDeclaration, ...withoutLiftUp } = rule;
    expect(ignoredDeclaration).toBe(true);
    const undeclared = new Map(KITCHEN_L_BODY_CATALOG);
    undeclared.set("wall-lift", { ...declaring, fronts: withoutLiftUp });
    const entries = projectDesignForDisplay(
      kitchenOf([liftAt(0, 600)]),
      undeclared,
    ).flatMap((group) => group.entries);

    expect(countHardwareMechanisms(entries, undeclared)).toEqual({
      hinges: 2,
      drawers: 0,
      pushRunners: 0,
      pushToOpen: 0,
      lifts: 0,
    });
  });
});

describe("the hardware gap between two classes is the rate gaps times the counts, for any kitchen of lifts and what stands beside them", () => {
  type Stand = "lift" | "drawers" | "wall-door";

  const MENU = fc.oneof(
    fc.record({
      kind: fc.constant<Stand>("lift"),
      widthMm: fc.constantFrom(...CABINETRY_CHIPS_MM),
    }),
    fc.record({
      kind: fc.constant<Stand>("drawers"),
      widthMm: fc.constant(600),
    }),
    fc.record({
      kind: fc.constant<Stand>("wall-door"),
      widthMm: fc.constant(300),
    }),
  );

  function placementFor(
    stand: { kind: Stand; widthMm: number },
    index: number,
  ) {
    const along = 400 + 800 * index;
    switch (stand.kind) {
      case "lift":
        return liftAt(index, stand.widthMm);
      case "drawers":
        return {
          id: `drawers-${String(index)}`,
          wall: "A" as const,
          alongMm: along,
          y0Mm: 0,
          body: { buildId: "base-3drawer", widthMm: 600, heightMm: 820 },
        };
      case "wall-door":
        return {
          id: `door-${String(index)}`,
          wall: "A" as const,
          alongMm: along,
          y0Mm: WALL_ROW_FLOOR_MM,
          body: { buildId: "wall-cabinet", widthMm: 300, heightMm: 700 },
        };
    }
  }

  it("holds to within the two roundings, whichever class is dearer and whatever rates they carry", () => {
    fc.assert(
      fc.property(
        fc.array(MENU, { minLength: 1, maxLength: 8 }),
        ratesArbitrary,
        ratesArbitrary,
        (stands, ratesA, ratesB) => {
          const counts = stands.reduce(
            (sum, stand) => ({
              hinges:
                sum.hinges +
                (stand.kind === "lift"
                  ? oracleHingesOnLiftDoor(stand.widthMm)
                  : stand.kind === "wall-door"
                    ? 2
                    : 0),
              drawers: sum.drawers + (stand.kind === "drawers" ? 3 : 0),
              lifts: sum.lifts + (stand.kind === "lift" ? 1 : 0),
            }),
            { hinges: 0, drawers: 0, lifts: 0 },
          );
          const book = bookWithRates(
            "hardware.soft-close",
            ratesB,
            bookWithRates("hardware.standard", ratesA),
          );
          const design = kitchenOf(stands.map(placementFor));
          const lineAt = (tierId: string) =>
            hardwareLineOf(
              pricedOrThrow(design, book, { hardwareTierId: tierId }),
            );
          const exactGapMinor =
            (ratesB.perHingeMinor - ratesA.perHingeMinor) * counts.hinges +
            (ratesB.perDrawerMinor - ratesA.perDrawerMinor) * counts.drawers +
            (ratesB.perLiftMinor - ratesA.perLiftMinor) * counts.lifts;

          const gapMinor =
            lineAt("hardware.soft-close") - lineAt("hardware.standard");

          expect(Math.abs(gapMinor - exactGapMinor)).toBeLessThanOrEqual(
            TEN_LEI_MINOR,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("the preview's hardware cell for a lift cabinet, at every height the row is built at", () => {
  it("is the same at each, as the kitchen's is", () => {
    const rule = ruleOf("wall-lift");
    const row = pricedRowOf(KITCHEN_L_BODY_CATALOG, "wall-lift");
    if (row === undefined) throw new Error("no wall-lift row");
    const heights = buildableHeightsMm(row);
    expect(heights.length).toBeGreaterThan(0);
    const cellsAt = (heightMm: number) => {
      const preview = previewCabinet({
        rule,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: SAMPLE_PRICE_BOOK,
        material: REFERENCE_MATERIAL_ID,
        depth: SHALLOW_DEPTH_MM,
        deepeningRows: DEEPENING_ROWS,
        hardwareTier: "hardware.soft-close",
        heightMm,
      });
      if (!preview.ok) throw new Error(preview.code);
      return preview.rows.map(({ widthMm, hardwareMinor }) => [
        widthMm,
        hardwareMinor,
      ]);
    };

    for (const heightMm of heights) {
      expect(cellsAt(heightMm)).toEqual(cellsAt(heights[0] ?? heightMm));
    }
  });
});

describe("ADR 0092 Amendment C's quantifier with its lift term, derived from the sample book's declared rates", () => {
  const standard = ratesOf("hardware.standard");
  const hettich = ratesOf("hardware.soft-close");
  const hingeSurchargeMinor = hettich.perHingeMinor - standard.perHingeMinor;
  const liftSurchargeMinor = hettich.perLiftMinor - standard.perLiftMinor;
  const drawerSavingMinor = standard.perDrawerMinor - hettich.perDrawerMinor;

  it("prices Hettich below Standard exactly when the drawer saving outweighs the hinge and lift surcharges, over kitchens of 600 mm lift doors and three-drawer bases", () => {
    const HINGES_ON_A_600_LIFT = 3;
    const DRAWERS_ON_A_BASE = 3;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 40 }),
        (lifts, drawerBases) => {
          fc.pre(lifts + drawerBases > 0);
          const placements = [
            ...Array.from({ length: lifts }, (_, index) => liftAt(index, 600)),
            ...Array.from({ length: drawerBases }, (_, index) => ({
              id: `drawers-${String(index)}`,
              wall: "A" as const,
              alongMm: 400 + 800 * (lifts + index),
              y0Mm: 0,
              body: { buildId: "base-3drawer", widthMm: 600, heightMm: 820 },
            })),
          ];
          const design = kitchenOf(placements);
          const lineAt = (tierId: string) =>
            hardwareLineOf(
              pricedOrThrow(design, SAMPLE_PRICE_BOOK, {
                hardwareTierId: tierId,
              }),
            );
          const surchargeMinor =
            lifts *
            (HINGES_ON_A_600_LIFT * hingeSurchargeMinor + liftSurchargeMinor);
          const savingMinor =
            drawerBases * DRAWERS_ON_A_BASE * drawerSavingMinor;
          const clearOfRounding =
            Math.abs(surchargeMinor - savingMinor) > 2 * TEN_LEI_MINOR;
          fc.pre(clearOfRounding);

          const hettichIsBelow =
            lineAt("hardware.soft-close") < lineAt("hardware.standard");

          expect(hettichIsBelow).toBe(savingMinor > surchargeMinor);
        },
      ),
    );
  });
});
