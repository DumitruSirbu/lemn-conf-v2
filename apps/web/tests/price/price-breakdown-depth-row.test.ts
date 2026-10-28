// The breakdown model publishes the depth line as a row of its own (M10 P3 item 3, ADR 0177 A-1): present exactly when
// the query published one, never folded into the whole-kitchen rows and never dropped while the total counts it. It is
// worded from the priced line alone (its depth, its amount, the percent it was priced with), and listed directly after
// the material row it multiplies with; a depth line with no material row to follow is refused, not dropped.
import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  type Design,
  type PriceLine,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  describeBreakdownRows,
  describePriceBreakdown,
  DepthLineWithoutMaterialRowError,
  listWholeKitchenRows,
} from "@/price/price-breakdown-model";
import { describeRoundedAmount } from "@/price/starting-price";

import { bookPublishingDeepCabinetPercent } from "../support/book-with-deep-cabinet-percent";
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
  const book = bookPublishingDeepCabinetPercent(depthPercent);
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

    expect(view.depthLine).toBeUndefined();
    expect(view).not.toHaveProperty("depthLine");
    expect(view.wholeKitchenListing).toBe(view.wholeKitchenRows);
  });

  it("is present at the deep depth, naming the depth and printing the line's amount as every other row does", () => {
    const { view, priced } = breakdownAt(DEEP_CABINET_DEPTH_MM);
    const line = priced.lines.find((candidate) => candidate.kind === "depth");

    expect(line).toBeDefined();
    expect(view.depthLine).toEqual({
      key: line?.lineId,
      label: content.priceBreakdown.depthLine(
        DEEP_CABINET_DEPTH_MM,
        depthPercentOf(line),
      ),
      scope: content.priceBreakdown.depthLineScope,
      amountText: describeRoundedAmount(line?.amountMinor ?? 0),
    });
  });

  it("reads inclus at 0 %, which the query still publishes as a line", () => {
    const { view } = breakdownAt(DEEP_CABINET_DEPTH_MM, 0);

    expect(view.depthLine?.amountText).toBe(content.priceBreakdown.included);
  });

  it("is kept out of the whole-kitchen rows, which stay the tiers and the accessories", () => {
    const { view } = breakdownAt(DEEP_CABINET_DEPTH_MM);

    expect(view.wholeKitchenRows.map((row) => row.key)).not.toContain(
      view.depthLine?.key,
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
      ...(view.depthLine === undefined ? [] : [view.depthLine.key]),
    ]);
    const lineKeys = priced.lines.map((line) =>
      line.kind === "cabinet" ? line.placementId : line.lineId,
    );

    expect(lineKeys.filter((key) => !shown.has(key))).toEqual([]);
  });
});

describe("the depth line's place among the whole-kitchen rows", () => {
  it("is directly after the material row, the other rows keeping their order", () => {
    const { view } = breakdownAt(DEEP_CABINET_DEPTH_MM);
    const keys = view.wholeKitchenListing.map((row) => row.key);

    expect(keys[keys.indexOf("kitchen:material") + 1]).toBe(
      view.depthLine?.key,
    );
    expect(keys.filter((key) => key !== view.depthLine?.key)).toEqual(
      view.wholeKitchenRows.map((row) => row.key),
    );
  });

  it("is refused when the rows built hold no material row, not dropped and not put first", () => {
    const { view } = breakdownAt(DEEP_CABINET_DEPTH_MM);
    const withoutMaterial = view.wholeKitchenRows.filter(
      (row) => row.key !== "kitchen:material",
    );

    expect(() =>
      listWholeKitchenRows({
        wholeKitchenRows: withoutMaterial,
        ...(view.depthLine === undefined ? {} : { depthLine: view.depthLine }),
        depthLineAfterKey: "kitchen:material",
      }),
    ).toThrow(DepthLineWithoutMaterialRowError);
  });

  it("takes its anchor from the rows built: a priced design with a depth line and no material line builds none", () => {
    const { priced } = breakdownAt(DEEP_CABINET_DEPTH_MM);
    const design = kitchenAt(DEEP_CABINET_DEPTH_MM);
    const catalog = buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM);
    const rows = describeBreakdownRows({
      content,
      priced: {
        ...priced,
        lines: priced.lines.filter((line) => line.kind !== "material"),
      },
      groups: projectDesignForDisplay(design, catalog),
    });

    expect(rows.depth.depthLine).toBeDefined();
    expect(rows.depth).not.toHaveProperty("depthLineAfterKey");
    expect(() =>
      listWholeKitchenRows({
        wholeKitchenRows: rows.wholeKitchenRows,
        ...rows.depth,
      }),
    ).toThrow(DepthLineWithoutMaterialRowError);
  });
});

function depthPercentOf(line: PriceLine | undefined): number {
  if (line?.kind !== "depth") throw new Error("expected a depth line");
  return line.deepCabinetPercent;
}
