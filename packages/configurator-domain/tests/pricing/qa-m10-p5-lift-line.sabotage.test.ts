// M10 P5 sabotage: the oracle of `qa-m10-p5-lift-line.adversarial.test.ts` can fail. Each wrong counter below is one a
// careless build of A-20 would be, swapped in under the shipped pricing query; the oracle must disagree with it at some
// width, and agree with the shipped counter at every one.
import { describe, expect, it, vi } from "vitest";

import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { DEEPENING_ROWS } from "../price-dashboard/m2-support.js";

type Counter = "shipped" | "no-lift" | "height-rule" | "inclusive-500";

const sabotage = vi.hoisted(() => ({ counter: "shipped" as Counter }));

vi.mock("../../src/hardware-mechanisms.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/hardware-mechanisms.js")>();
  return {
    ...original,
    countHardwareMechanisms: (
      ...args: Parameters<typeof original.countHardwareMechanisms>
    ) => {
      const shipped = original.countHardwareMechanisms(...args);
      const [entries] = args;
      const lift = entries.find((entry) => entry.buildId === "wall-lift");
      if (lift === undefined) return shipped;
      switch (sabotage.counter) {
        case "shipped":
          return shipped;
        case "no-lift":
          return { ...shipped, lifts: 0 };
        case "height-rule":
          return { ...shipped, hinges: lift.heightMm > 900 ? 3 : 2 };
        case "inclusive-500":
          return { ...shipped, hinges: lift.widthMm >= 500 ? 3 : 2 };
      }
    },
  };
});

const WIDTHS_MM = [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800];
const HINGE_MINOR = 1_760;
const LIFT_MINOR = 20_000;

function hardwareLineAt(widthMm: number): number {
  const design: Design = {
    ...KITCHEN_L_DESIGN,
    settings: { cabinetDepthMm: 600 },
    placements: [
      {
        id: "lift",
        wall: "A",
        alongMm: 1_000,
        y0Mm: 1_500,
        body: { buildId: "wall-lift", widthMm, heightMm: 700 },
      },
    ],
  };
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(600),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
    selections: { hardwareTierId: "hardware.standard" },
    deepeningRows: DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) throw new Error(result.failure.code);
  const line = result.priced.lines.find(({ kind }) => kind === "hardware");
  return line?.amountMinor ?? 0;
}

function oracleLineAt(widthMm: number): number {
  const hinges = widthMm > 500 ? 3 : 2;
  const exactMinor = hinges * HINGE_MINOR + LIFT_MINOR;
  return Math.floor((exactMinor + 500) / 1_000) * 1_000;
}

function widthsWhereTheOracleDisagrees(): readonly number[] {
  return WIDTHS_MM.filter(
    (widthMm) => hardwareLineAt(widthMm) !== oracleLineAt(widthMm),
  );
}

describe("the oracle of the lift hardware line tells a wrong counter from the shipped one", () => {
  it("rests on the standard tier's rates the sample book states", () => {
    const standard = SAMPLE_PRICE_BOOK.hardware.tiers.find(
      (tier) => tier.tierId === "hardware.standard",
    );

    expect(standard?.perHingeMinor).toBe(HINGE_MINOR);
    expect(standard?.perLiftMinor).toBe(LIFT_MINOR);
  });

  it("agrees with the shipped counter at every width", () => {
    sabotage.counter = "shipped";

    expect(widthsWhereTheOracleDisagrees()).toEqual([]);
  });

  it("disagrees with a counter that bills no lift, at every width", () => {
    sabotage.counter = "no-lift";
    const disagreements = widthsWhereTheOracleDisagrees();
    sabotage.counter = "shipped";

    expect(disagreements).toEqual(WIDTHS_MM);
  });

  it("disagrees with the height rule, which gives a 700 mm lift door two hinges at every width", () => {
    sabotage.counter = "height-rule";
    const disagreements = widthsWhereTheOracleDisagrees();
    sabotage.counter = "shipped";

    expect(disagreements.length).toBeGreaterThan(0);
  });

  it("disagrees with an inclusive 500 mm boundary at exactly 500 mm", () => {
    sabotage.counter = "inclusive-500";
    const disagreements = widthsWhereTheOracleDisagrees();
    sabotage.counter = "shipped";

    expect(disagreements).toEqual([500]);
  });
});
