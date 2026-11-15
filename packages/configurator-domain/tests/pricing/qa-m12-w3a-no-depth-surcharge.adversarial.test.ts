// M12 wave W3a, adversarial QA (owner ruling: no 700 depth surcharge; ADR 0177 A-6, ADR 0183 decision 4). A wall body
// over the freestanding fridge is built 700 deep in a 600 kitchen, but the depth percentage is the *kitchen's* (the
// setting decides it) and never a body's recorded seat: pricing the same kitchen with that body recorded at 600 or at
// 700 must give the same lines and the same total, and a 600 kitchen must carry no depth line at all.
import { describe, expect, it } from "vitest";

import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { cabinetDepthMmOf } from "../../src/design.js";
import type { Design } from "../../src/design.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { WALL_FRONT_ASSEMBLY_MM } from "../../src/worktop-depth.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import {
  generate,
  OPENING_TOP_MM,
  OVER_BODY_STEP_ID,
  placementOf,
  stepNamed,
} from "../support/over-the-fridge.js";
import { anchoredRules, percentageBookOf } from "./percentage-book-support.js";

type Priced = Extract<ReturnType<typeof priceDesign>, { ok: true }>;

const DEEP_CABINET_PERCENT = 15;
const MATERIAL_PERCENT = 10;
const ANCHOR_MINOR = 120_000;

function pricedAt(design: Design): Priced {
  const book = percentageBookOf({
    materialPercent: MATERIAL_PERCENT,
    deepCabinetPercent: DEEP_CABINET_PERCENT,
    cabinetRules: anchoredRules(() => ANCHOR_MINOR),
  });
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book,
    pricingVersion: book.version,
    selections: { materialTierId: undefined },
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result;
}

const ROOMS = [
  { shape: "L", widthMm: 4000, depthMm: 3400, heightMm: OPENING_TOP_MM },
  { shape: "linear", widthMm: 4200, depthMm: 3400, heightMm: OPENING_TOP_MM },
  { shape: "L", widthMm: 6000, depthMm: 5000, heightMm: 2800 },
] as const;

function withOverBodySeatAt(
  design: Design,
  placementId: string,
  finishedDepthMm: number,
): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === placementId
        ? {
            ...placement,
            body: {
              ...placement.body,
              seatDepthMm: finishedDepthMm - WALL_FRONT_ASSEMBLY_MM,
            },
          }
        : placement,
    ),
  };
}

describe("the 700 over the fridge adds no price at a 600 kitchen", () => {
  for (const room of ROOMS) {
    it(`prices ${JSON.stringify(room)} identically with the body recorded at 600 and at 700, and carries no depth line`, () => {
      const result = generate(room, 600);
      if (!result.ok) throw new Error("room not generated");
      const step = stepNamed(result, OVER_BODY_STEP_ID);
      if (!step) throw new Error("no over-the-fridge step");
      const over = placementOf(result.design, step);
      expect(over.body.seatDepthMm).toBe(700 - WALL_FRONT_ASSEMBLY_MM);

      const asBuilt = pricedAt(result.design);
      const asRecordedBefore = pricedAt(
        withOverBodySeatAt(result.design, over.id, 600),
      );

      expect(JSON.stringify(asBuilt)).toBe(JSON.stringify(asRecordedBefore));
      expect(asBuilt.priced.lines.map(({ kind }) => kind)).not.toContain(
        "depth",
      );
    });
  }

  it("prices the body over the fridge as it prices any other wall-cabinet of its width", () => {
    const room = ROOMS[0];
    const result = generate(room, 600);
    if (!result.ok) throw new Error("room not generated");
    const step = stepNamed(result, OVER_BODY_STEP_ID);
    if (!step) throw new Error("no over-the-fridge step");
    const over = placementOf(result.design, step);
    const cabinets = pricedAt(result.design).priced.lines.filter(
      (line) => line.kind === "cabinet",
    );
    const sameBuild = cabinets.filter(
      (line) => line.pricedAsBuildId === over.body.buildId,
    );

    expect(
      new Set(sameBuild.map(({ unitAmountMinor }) => unitAmountMinor)).size,
    ).toBeLessThanOrEqual(1);
  });
});
