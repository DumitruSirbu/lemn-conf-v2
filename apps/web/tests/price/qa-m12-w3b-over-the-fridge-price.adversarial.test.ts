// **M12 wave W3b adversarial QA (ADR 0183 decision 6): the seeded cabinet over the fridge is built 700 deep at 600 and is
// billed exactly as an ordinary wall cabinet, with no deepening uplift.**
//
// `wall-2door-700-over-fridge` left `measureDeepeningRows` (it finishes at 700 at both settings), so the row is no longer
// "deeper at 700". What must not follow is a price move: `priceDesign` consults the deepening set by the *priced-as* id,
// and the row is priced as `wall-cabinet`. Asserted against the real price book, as relations a book edit cannot break:
// the priced body equals the same design with the cabinet renamed to the row it is priced as; the depth line exists at 700
// only; and the depth line's base still holds the cabinet over the fridge at 700, whichever id it carries there.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  measureDeepeningRows,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type PriceLine,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { NOTHING_DISABLED } from "../support/availability";

const OVER_THE_FRIDGE_ID = "p24";
const OVER_THE_FRIDGE_ROW = "wall-2door-700-over-fridge";
const ORDINARY_WALL_CABINET = "wall-cabinet";
const DEPTH_LINE_KIND = "depth";

const deepeningRows = measureDeepeningRows(
  buildKitchenLBodyCatalog(600),
  buildKitchenLBodyCatalog(700),
);

function atSetting(design: Design, cabinetDepthMm: number): Design {
  return { ...design, settings: { ...design.settings, cabinetDepthMm } };
}

function withOverTheFridgeAs(design: Design, buildId: string): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === OVER_THE_FRIDGE_ID
        ? { ...placement, body: { ...placement.body, buildId } }
        : placement,
    ),
  };
}

function priced(design: Design): PricingResult {
  const result = priceDesign({
    deepeningRows,
    availability: NOTHING_DISABLED,
    design,
    catalog: buildKitchenLBodyCatalog(design.settings?.cabinetDepthMm ?? 600),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
  if (!result.ok) throw new Error("the seeded kitchen could not be priced");
  return result;
}

function linesOf(result: PricingResult): readonly PriceLine[] {
  if (!result.ok) throw new Error("not priced");
  return result.priced.lines;
}

function lineOfTheCabinetOverTheFridge(result: PricingResult): PriceLine {
  const line = linesOf(result).find(
    (candidate) =>
      "placementId" in candidate &&
      candidate.placementId === OVER_THE_FRIDGE_ID,
  );
  if (!line) throw new Error("the cabinet over the fridge has no price line");
  return line;
}

function totalMinorOf(result: PricingResult): number {
  if (!result.ok) throw new Error("not priced");
  return result.priced.totalMinor;
}

describe("the deepening set no longer holds the seeded row, and still holds the row it is priced as", () => {
  it("leaves the over-fridge row out and wall-cabinet in", () => {
    expect(deepeningRows.has(OVER_THE_FRIDGE_ROW)).toBe(false);
    expect(deepeningRows.has(ORDINARY_WALL_CABINET)).toBe(true);
  });
});

describe.each([600, 700])(
  "the seeded cabinet over the fridge at %i mm is priced as the ordinary wall cabinet it is",
  (cabinetDepthMm) => {
    const seeded = atSetting(KITCHEN_L_DESIGN, cabinetDepthMm);
    const renamed = withOverTheFridgeAs(seeded, ORDINARY_WALL_CABINET);

    it("is priced as wall-cabinet, at the same line amount as the renamed twin", () => {
      const line = lineOfTheCabinetOverTheFridge(priced(seeded));
      const twin = lineOfTheCabinetOverTheFridge(priced(renamed));

      expect(line).toMatchObject({ pricedAsBuildId: ORDINARY_WALL_CABINET });
      expect(line.amountMinor).toBe(twin.amountMinor);
      expect(line.amountMinor).toBeGreaterThan(0);
    });

    it("moves the whole kitchen's total by nothing against the renamed twin", () => {
      expect(totalMinorOf(priced(seeded))).toBe(totalMinorOf(priced(renamed)));
    });
  },
);

describe("the deepening uplift", () => {
  it("is no line at 600: a 700 mm box in a 600 kitchen is billed as the kitchen's other wall cabinets (ADR 0183 decision 6)", () => {
    const lines = linesOf(priced(atSetting(KITCHEN_L_DESIGN, 600)));

    expect(lines.filter((line) => line.kind === DEPTH_LINE_KIND)).toStrictEqual(
      [],
    );
  });

  it("is one line at 700, and it is the same line whichever id the cabinet over the fridge carries", () => {
    const seeded = atSetting(KITCHEN_L_DESIGN, 700);
    const renamed = withOverTheFridgeAs(seeded, ORDINARY_WALL_CABINET);
    const depthLine = (result: PricingResult) =>
      linesOf(result).filter((line) => line.kind === DEPTH_LINE_KIND);

    expect(depthLine(priced(seeded))).toHaveLength(1);
    expect(depthLine(priced(seeded))).toStrictEqual(depthLine(priced(renamed)));
  });

  it("has a base at 700 that holds the cabinet over the fridge: leaving it out would lower the line", () => {
    const withIt = priced(atSetting(KITCHEN_L_DESIGN, 700));
    const without = priced({
      ...atSetting(KITCHEN_L_DESIGN, 700),
      placements: atSetting(KITCHEN_L_DESIGN, 700).placements.filter(
        ({ id }) => id !== OVER_THE_FRIDGE_ID,
      ),
    });
    const amountOf = (result: PricingResult) =>
      linesOf(result).find((line) => line.kind === DEPTH_LINE_KIND)
        ?.amountMinor ?? 0;

    expect(amountOf(withIt)).toBeGreaterThan(amountOf(without));
  });
});
