// M10 M2-b2: the judgement reads the whole grid of a row, not one point of it. A property holds it to an oracle written
// from A-2 and A-3 alone, over every whole millimetre the row can be built at; a sabotage shows the coordinator's witness
// passes when the judgement is cut back to the anchor width.
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { judgeBookAgainstCatalog } from "../../src/price-dashboard/judge-book.js";
import { MAX_CABINET_AMOUNT_MINOR } from "../../src/pricing/percentage-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

import { CATALOG, withFormula } from "./m2-support.js";

const NUM_RUNS = 200;
const NARROWEST_MM = 200;
const WIDEST_MM = 800;
const ANCHOR_MM = 600;
const PRICE_STEP_MM = 50;
const TWO_DOORS_FROM_MM = 500;

const sabotage = vi.hoisted(() => ({ isAnchorOnly: false }));

vi.mock("../../src/price-dashboard/priced-row.js", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../src/price-dashboard/priced-row.js")
    >();
  return {
    ...original,
    buildableWidthsMm: (
      ...args: Parameters<typeof original.buildableWidthsMm>
    ) =>
      args[0].buildId === "base-cabinet" && sabotage.isAnchorOnly
        ? [ANCHOR_MM]
        : original.buildableWidthsMm(...args),
  };
});

interface Coefficients {
  readonly anchorMinor: number;
  readonly perStepWiderMinor: number;
  readonly perStepNarrowerMinor: number;
  readonly perExtraDoorLeafMinor: number;
}

function bookOf(coefficients: Coefficients) {
  return withFormula(SAMPLE_PRICE_BOOK, "base-cabinet", {
    shape: "anchored-width-and-door-leaves",
    anchorWidthMm: ANCHOR_MM,
    ...coefficients,
  });
}

/** The oracle: A-2's steps from the anchor at the width rounded up, A-3's leaves at the width built (one below 500 mm). */
function priceAt(widthMm: number, c: Coefficients): number {
  const steps =
    (Math.ceil(widthMm / PRICE_STEP_MM) * PRICE_STEP_MM - ANCHOR_MM) /
    PRICE_STEP_MM;
  const leaves = (mm: number) => (mm >= TWO_DOORS_FROM_MM ? 2 : 1);
  return (
    c.anchorMinor +
    (steps > 0 ? steps * c.perStepWiderMinor : steps * c.perStepNarrowerMinor) +
    (leaves(widthMm) - leaves(ANCHOR_MM)) * c.perExtraDoorLeafMinor
  );
}

function cheapestAndDearest(c: Coefficients): {
  cheapest: number;
  dearest: number;
} {
  const prices: number[] = [];
  for (let widthMm = NARROWEST_MM; widthMm <= WIDEST_MM; widthMm += 1) {
    prices.push(priceAt(widthMm, c));
  }
  return { cheapest: Math.min(...prices), dearest: Math.max(...prices) };
}

const coefficients = fc.record({
  anchorMinor: fc.integer({ min: 1, max: 600_000 }),
  perStepWiderMinor: fc.integer({ min: 0, max: 80_000 }),
  perStepNarrowerMinor: fc.integer({ min: 0, max: 80_000 }),
  perExtraDoorLeafMinor: fc.integer({ min: 0, max: 80_000 }),
});

describe("judgeBookAgainstCatalog over a row's whole grid", () => {
  it("refuses a book exactly when some whole millimetre the row is built at prices at or below zero", () => {
    fc.assert(
      fc.property(coefficients, (c) => {
        const { cheapest, dearest } = cheapestAndDearest(c);
        const judgement = judgeBookAgainstCatalog(bookOf(c), CATALOG);

        const isAcceptable =
          cheapest > 0 && dearest <= MAX_CABINET_AMOUNT_MINOR;
        expect(judgement.ok).toBe(isAcceptable);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("the coordinator's witness", () => {
  const witness = bookOf({
    anchorMinor: 100_000,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 30_000,
    perExtraDoorLeafMinor: 20_000,
  });

  it("prices well at its anchor width and is refused for its narrowest", () => {
    expect(
      priceAt(ANCHOR_MM, {
        anchorMinor: 100_000,
        perStepWiderMinor: 0,
        perStepNarrowerMinor: 30_000,
        perExtraDoorLeafMinor: 20_000,
      }),
    ).toBe(100_000);

    expect(judgeBookAgainstCatalog(witness, CATALOG).ok).toBe(false);
  });

  it("goes unrefused when the judgement is cut back to the anchor width: only the grid catches it", () => {
    sabotage.isAnchorOnly = true;
    try {
      expect(judgeBookAgainstCatalog(witness, CATALOG).ok).toBe(true);
    } finally {
      sabotage.isAnchorOnly = false;
    }
  });
});
