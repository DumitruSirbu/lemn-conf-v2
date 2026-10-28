// @vitest-environment happy-dom
//
// Adversarial QA for M10 wave Q1, the depth line in the customer breakdown (P2-c, Q1-b, A-1, ADR 0177 A-1, ADR 0100
// decision 5).
//
// What the wave's own tests (`q1-depth-line.dom.test.ts`) do not reach, and what this file takes:
//   1. the percent is the published rule's across its WHOLE range (0 to the parser's bound), not two sampled
//      values, and the label states no other figure than the depth and that percent;
//   2. the amount is the priced line's own: a synthetic result whose depth amount matches no percent still prints
//      verbatim;
//   3. across generated rooms, tier pairs and percentages built at 700 mm through the store's real depth command,
//      every priced line is printed exactly once, the depth line sits straight after the material row, and the figure
//      restates the total the lines sum to;
//   4. at 0 % the line is present and reads *inclus* (ADR 0177 A-1), the one behaviour the plan leaves implicit.
import { fc } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  MAX_DEEP_CABINET_PERCENT,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type PricedDesign,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  describePriceBreakdown,
  type AvailableBreakdown,
} from "@/price/price-breakdown-model";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import { describeStartingPrice } from "@/price/starting-price";
import { createConfiguratorStore } from "@/store/configurator-store";

import { listedDepthLineOf } from "../support/listed-depth-line";
import { bookPublishingDeepCabinetPercent } from "../support/book-with-deep-cabinet-percent";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { ro } from "../support/romanian-content";
import { ARMS } from "../support/swept-kitchens";
import { generatePricedKitchen } from "../support/generated-kitchens";
import { TIER_PAIRS, withTiers } from "../support/varied-kitchens";

const SWEEP_SEED = 20_261_028;
const OCCURRED_AT = "2026-10-28T09:00:00.000Z";

const publishedPercent = fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT });

function priceAt(design: Design, deepCabinetPercent: number): PricingResult {
  const book = bookPublishingDeepCabinetPercent(deepCabinetPercent);
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: buildKitchenLBodyCatalog(
      design.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM,
    ),
    book,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function describeAt(
  design: Design,
  pricing: PricingResult,
): AvailableBreakdown {
  const view = describePriceBreakdown({
    content: ro,
    pricing,
    groups: projectDesignForDisplay(
      design,
      buildKitchenLBodyCatalog(
        design.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM,
      ),
    ),
  });
  if (view.kind !== "available") throw new Error("the fixture should price");
  return view;
}

function pricedOf(pricing: PricingResult): PricedDesign {
  if (!pricing.ok) throw new Error("the fixture kitchen should price");
  return pricing.priced;
}

function deepShippedKitchen(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      cabinetDepthMm: DEEP_CABINET_DEPTH_MM,
    },
  };
}

function markupOf(view: AvailableBreakdown): HTMLElement {
  const dom = document.createElement("div");
  dom.innerHTML = renderToStaticMarkup(
    createElement(PriceBreakdownSurface, {
      id: "breakdown",
      view,
      onClose: () => undefined,
    }),
  );
  return dom;
}

interface PrintedRow {
  readonly testId: string;
  readonly text: string;
}

function printedRowsOf(dom: HTMLElement): readonly PrintedRow[] {
  return Array.from(
    dom.querySelectorAll(
      '[data-testid="breakdown-row"], [data-testid="breakdown-depth-row"]',
    ),
  ).map((row) => ({
    testId: row.getAttribute("data-testid") ?? "",
    text: row.textContent,
  }));
}

/** The depth, in whole millimetres, and the percent: the only two figures the depth label may state. */
function figuresIn(text: string): readonly string[] {
  return text.match(/\d+/gu) ?? [];
}

describe("the depth line states the published percent and nothing else (Q1-b)", () => {
  it("across the rule's whole range, the label is the accessor's and carries the depth and that percent only", () => {
    fc.assert(
      fc.property(publishedPercent, (percent) => {
        const design = deepShippedKitchen();
        const view = describeAt(design, priceAt(design, percent));

        expect(listedDepthLineOf(view)?.label).toBe(
          ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, percent),
        );
        expect(figuresIn(listedDepthLineOf(view)?.label ?? "")).toEqual([
          String(DEEP_CABINET_DEPTH_MM),
          String(percent),
        ]);
        expect(figuresIn(listedDepthLineOf(view)?.scope ?? "")).toEqual([]);
      }),
      { seed: SWEEP_SEED, numRuns: 120 },
    );
  });

  it("never reads the percent from the priced amount: the same percent labels any amount alike", () => {
    fc.assert(
      fc.property(
        publishedPercent,
        fc.integer({ min: 0, max: 400 }),
        (percent, tensOfLei) => {
          const design = deepShippedKitchen();
          const real = priceAt(design, percent);
          const forged = withDepthAmount(real, tensOfLei * 1000);

          expect(listedDepthLineOf(describeAt(design, forged))?.label).toBe(
            listedDepthLineOf(describeAt(design, real))?.label,
          );
        },
      ),
      { seed: SWEEP_SEED, numRuns: 80 },
    );
  });
});

/** The result with its depth line's amount replaced and the total moved with it, as a stale or hand-built result would
 *  be: an amount that matches no percentage of anything. */
function withDepthAmount(
  pricing: PricingResult,
  amountMinor: number,
): PricingResult {
  const priced = pricedOf(pricing);
  const old = priced.lines.find((line) => line.kind === "depth");
  if (old === undefined)
    throw new Error("the fixture should hold a depth line");
  return {
    ...pricing,
    priced: {
      ...priced,
      totalMinor: priced.totalMinor - old.amountMinor + amountMinor,
      lines: priced.lines.map((line) =>
        line.kind === "depth"
          ? {
              ...line,
              unitAmountMinor: amountMinor,
              amountMinor,
            }
          : line,
      ),
    },
  } as PricingResult;
}

describe("the depth line's amount is the priced line's own, never recomputed (P2-c)", () => {
  it("prints whatever amount the line carries, for amounts no percentage of the cabinets explains", () => {
    fc.assert(
      fc.property(
        publishedPercent,
        fc.integer({ min: 1, max: 400 }),
        (percent, tensOfLei) => {
          const design = deepShippedKitchen();
          const forged = withDepthAmount(
            priceAt(design, percent),
            tensOfLei * 1000,
          );

          const view = describeAt(design, forged);
          const printed = markupOf(view).querySelector(
            '[data-testid="breakdown-depth-amount"]',
          );

          expect(printed?.textContent).toBe(
            listedDepthLineOf(view)?.amountText,
          );
          expect(listedDepthLineOf(view)?.amountText).not.toBe(
            ro.priceBreakdown.included,
          );
        },
      ),
      { seed: SWEEP_SEED, numRuns: 80 },
    );
  });

  it("prints an amount of 0 as inclus, whatever the percent says", () => {
    const design = deepShippedKitchen();
    const forged = withDepthAmount(priceAt(design, 40), 0);

    const view = describeAt(design, forged);

    expect(listedDepthLineOf(view)?.amountText).toBe(
      ro.priceBreakdown.included,
    );
    expect(listedDepthLineOf(view)?.label).toContain("40 %");
  });
});

describe("at 0 % the depth line is present and reads inclus (ADR 0177 A-1: 'At 0 % it renders inclus')", () => {
  it("is shown at 700 mm with 'adaos 0 %' and inclus, and not at 600 mm", () => {
    const deep = deepShippedKitchen();
    const view = describeAt(deep, priceAt(deep, 0));
    const rows = printedRowsOf(markupOf(view));
    const depthRow = rows.find((row) => row.testId === "breakdown-depth-row");

    expect(depthRow?.text).toContain(
      ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, 0),
    );
    expect(depthRow?.text).toContain(ro.priceBreakdown.included);

    const shallow = KITCHEN_L_DESIGN;
    const shallowView = describeAt(shallow, priceAt(shallow, 0));
    expect(listedDepthLineOf(shallowView)).toBeUndefined();
  });
});

describe("generated rooms built at 700 mm through the real depth command", () => {
  const deepRooms = fc.record({
    room: fc.oneof(...ARMS.map((arm) => arm.rooms)),
    tiers: fc.constantFrom(...TIER_PAIRS),
    percent: publishedPercent,
  });

  function builtAtSevenHundred(
    room: Parameters<typeof generatePricedKitchen>[0],
  ) {
    const generated = generatePricedKitchen(room);
    if (generated.kind === "refused") return undefined;
    const store = createConfiguratorStore({
      design: generated.kitchen.design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => OCCURRED_AT,
    });
    store.getState().setCabinetDepth(DEEP_CABINET_DEPTH_MM);
    const design = store.getState().design;
    return design.settings?.cabinetDepthMm === DEEP_CABINET_DEPTH_MM
      ? design
      : undefined;
  }

  it("prints every priced line once, the depth line straight after the material row, and restates the total", () => {
    let deepKitchensWithADepthLine = 0;
    fc.assert(
      fc.property(deepRooms, ({ room, tiers, percent }) => {
        const built = builtAtSevenHundred(room);
        if (built === undefined) return;
        const design = withTiers(built, tiers);
        const pricing = priceAt(design, percent);
        if (!pricing.ok) return;
        const priced = pricing.priced;
        const view = describeAt(design, pricing);
        const rows = printedRowsOf(markupOf(view));

        // P2-a restated at the surface: the lines the screen is built from add to the figure's total.
        expect(
          priced.lines.reduce((sum, line) => sum + line.amountMinor, 0),
        ).toBe(priced.totalMinor);
        expect(view.figure).toEqual(
          describeStartingPrice({
            totalMinor: priced.totalMinor,
            copy: ro.price,
          }),
        );

        // Every priced line is printed once: the rows are the lines, counted, and the depth row is one of them.
        expect(rows).toHaveLength(priced.lines.length);
        const depthLines = priced.lines.filter((line) => line.kind === "depth");
        const depthRows = rows.filter(
          (row) => row.testId === "breakdown-depth-row",
        );
        expect(depthRows).toHaveLength(depthLines.length);
        expect(listedDepthLineOf(view) !== undefined).toBe(
          depthLines.length === 1,
        );
        if (depthLines.length === 0) return;

        deepKitchensWithADepthLine += 1;
        expect(depthRows[0]?.text).toContain(
          ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, percent),
        );
        const depthAt = rows.findIndex(
          (row) => row.testId === "breakdown-depth-row",
        );
        expect(
          rows[depthAt - 1]?.text.startsWith(
            ro.priceBreakdown.wholeKitchenCategories.material,
          ),
        ).toBe(true);
      }),
      { seed: SWEEP_SEED, numRuns: 60 },
    );

    // Not vacuous: the sweep did reach kitchens that carry a depth line.
    expect(deepKitchensWithADepthLine).toBeGreaterThan(10);
  });
});

describe("the amounts as printed (a spec conflict, reported and not Q1's to settle)", () => {
  // KNOWN CONFLICT, named and loud. The domain's lines are multiples of 10 lei and add to the total exactly (A-1, P2-a;
  // ADR 0175 decision 5 calls 10 lei "the customer's display unit"), but `describeRoundedAmount` rounds every printed
  // line UP to the thousand MDL (`starting-price.ts:78-96`, ADR 0001 decision 4), so the printed rows cannot add to the
  // printed total: at 12 % the shipped L kitchen prints the depth line of 9 510 lei as "10 000" and the total of 94 630
  // as "95 000". Q1b-a ("on each surface the lines sum to the total shown") cannot hold for printed text while this
  // stands. `it.fails` passes while the printed rows do not add up; the day a wave settles the display unit it goes
  // red, and the instruction is to delete `.fails`.
  // The guard that keeps the `it.fails` below honest: it fails for the stated reason only if every priced line has a
  // printed amount that parses, so a renamed test id or a throw cannot keep it green for the wrong one.
  it("prints one parseable amount per priced line, so the sum below is over every line", () => {
    const design = deepShippedKitchen();
    const pricing = priceAt(design, 12);
    const dom = markupOf(describeAt(design, pricing));

    const printedAmounts = Array.from(
      dom.querySelectorAll(
        '[data-testid="breakdown-row-amount"], [data-testid="breakdown-depth-amount"]',
      ),
    );

    expect(printedAmounts).toHaveLength(pricedOf(pricing).lines.length);
    for (const amount of printedAmounts)
      expect(amount.textContent).toMatch(
        new RegExp(`\\d|${ro.priceBreakdown.included}`, "u"),
      );
  });

  it.fails("printed rows add up to the printed total", () => {
    const design = deepShippedKitchen();
    const view = describeAt(design, priceAt(design, 12));
    const dom = markupOf(view);

    const printedAmounts = Array.from(
      dom.querySelectorAll(
        '[data-testid="breakdown-row-amount"], [data-testid="breakdown-depth-amount"]',
      ),
    ).map((amount) => amountOfText(amount.textContent));

    expect(printedAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(
      amountOfText(view.figure.amountText),
    );
  });
});

/** The whole-MDL figure in a printed amount; *inclus* and any other wording without a digit is 0. */
function amountOfText(text: string): number {
  const digits = text.replace(/\D/gu, "");
  return digits === "" ? 0 : Number(digits);
}
