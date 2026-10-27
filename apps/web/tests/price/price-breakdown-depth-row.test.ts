// The breakdown model publishes the depth line as a row of its own (M10 P3 item 3, ADR 0177 A-1): present exactly when
// the query published one, never folded into the whole-kitchen rows and never dropped while the total counts it. The
// model words nothing of it: the label is the surface's, because the percentage is the book's rule and no line carries it.
import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describePriceBreakdown } from "@/price/price-breakdown-model";
import { describeRoundedAmount } from "@/price/starting-price";

import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { ro as content } from "../support/romanian-content";

function kitchenAt(depthMm: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: depthMm },
  };
}

function breakdownAt(
  depthMm: number,
  depthPercent = SAMPLE_PRICE_BOOK.depthRule.deepCabinetPercent,
) {
  const design = kitchenAt(depthMm);
  const catalog = buildKitchenLBodyCatalog(depthMm);
  const book = {
    ...SAMPLE_PRICE_BOOK,
    depthRule: { deepCabinetPercent: depthPercent },
  };
  const pricing: PricingResult = priceDesign({
    design,
    catalog,
    book,
    pricingVersion: book.version,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
  const view = describePriceBreakdown({
    content,
    pricing,
    groups: projectDesignForDisplay(design, catalog),
  });
  if (view.kind !== "available" || !pricing.ok) throw new Error("no breakdown");
  return { view, priced: pricing.priced };
}

describe("the depth row", () => {
  it("is absent at the default depth, where the query publishes no depth line", () => {
    const { view } = breakdownAt(DEFAULT_CABINET_DEPTH_MM);

    expect(view.depthRow).toBeUndefined();
    expect(view).not.toHaveProperty("depthRow");
  });

  it("is present at the deep depth, naming the depth and printing the line's amount as every other row does", () => {
    const { view, priced } = breakdownAt(DEEP_CABINET_DEPTH_MM);
    const line = priced.lines.find((candidate) => candidate.kind === "depth");

    expect(line).toBeDefined();
    expect(view.depthRow).toEqual({
      key: line?.lineId,
      depthMm: DEEP_CABINET_DEPTH_MM,
      amountText: describeRoundedAmount(line?.amountMinor ?? 0),
    });
  });

  it("reads inclus at 0 %, which the query still publishes as a line", () => {
    const { view } = breakdownAt(DEEP_CABINET_DEPTH_MM, 0);

    expect(view.depthRow?.amountText).toBe(content.priceBreakdown.included);
  });

  it("is kept out of the whole-kitchen rows, which stay the tiers and the accessories", () => {
    const { view } = breakdownAt(DEEP_CABINET_DEPTH_MM);

    expect(view.wholeKitchenRows.map((row) => row.key)).not.toContain(
      view.depthRow?.key,
    );
    expect(view.wholeKitchenRows.map((row) => row.key)).toEqual(
      expect.arrayContaining(["kitchen:hardware", "kitchen:material"]),
    );
  });

  it("leaves no priced line unaccounted for: every line is a placement row, a whole-kitchen row or the depth row", () => {
    const { view, priced } = breakdownAt(DEEP_CABINET_DEPTH_MM);
    const shown = new Set([
      ...view.groups.flatMap((group) => group.rows.map((row) => row.key)),
      ...view.wholeKitchenRows.map((row) => row.key),
      ...(view.depthRow === undefined ? [] : [view.depthRow.key]),
    ]);
    const lineKeys = priced.lines.map((line) =>
      line.kind === "cabinet" ? line.placementId : line.lineId,
    );

    expect(lineKeys.filter((key) => !shown.has(key))).toEqual([]);
  });
});
