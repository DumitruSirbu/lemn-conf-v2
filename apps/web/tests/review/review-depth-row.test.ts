// Q1b-a on the review model: the depth line the total counts is listed, worded by the published percent, directly
// after the material row; a kitchen with no depth line (600 mm, or a snapshot stored before the cut-over) lists
// exactly the rows it always did.
import {
  DEEP_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  DepthRowWithoutMaterialRowError,
  describeReview,
  listWholeKitchenRows,
  type AvailableReview,
} from "@/review/review-model";

import {
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";

const PUBLISHED_PERCENT = 12;

function wordedAt(depthMm: number): string {
  return ro.priceBreakdown.depthLine(depthMm, PUBLISHED_PERCENT);
}

function availableReviewOf(kitchen: PricedKitchen): AvailableReview {
  const view = describeReview({
    content: ro,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") throw new Error("expected a review");
  return view;
}

const DEFAULT_DEPTH = priceAndProject(KITCHEN_L_DESIGN);
const DEEP = priceAndProject({
  ...KITCHEN_L_DESIGN,
  settings: {
    ...KITCHEN_L_DESIGN.settings,
    cabinetDepthMm: DEEP_CABINET_DEPTH_MM,
  },
});

describe("the review's whole-kitchen rows with the depth row", () => {
  it("lists the depth row right after the material row, worded with the published percent and the line's own amount", () => {
    const review = availableReviewOf(DEEP);
    const rows = listWholeKitchenRows(review, wordedAt);
    const materialAt = rows.findIndex((row) => row.key === "kitchen:material");

    expect(review.depthRow).toBeDefined();
    expect(rows[materialAt + 1]).toEqual({
      key: "kitchen:depth",
      label: wordedAt(DEEP_CABINET_DEPTH_MM),
      amountText: review.depthRow?.amountText,
    });
    expect(rows.filter((row) => row.key !== "kitchen:depth")).toEqual(
      review.wholeKitchenRows,
    );
  });

  it("words the row with whatever percent the caller publishes", () => {
    const review = availableReviewOf(DEEP);

    for (const percent of [0, 7, 12, 25]) {
      const rows = listWholeKitchenRows(review, (depthMm) =>
        ro.priceBreakdown.depthLine(depthMm, percent),
      );

      expect(rows.map((row) => row.label)).toContain(
        ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, percent),
      );
    }
  });

  it("lists the rows untouched, and never asks for the wording, when the design carries no depth line", () => {
    const review = availableReviewOf(DEFAULT_DEPTH);

    const rows = listWholeKitchenRows(review, () => {
      throw new Error("no depth line, so no wording is asked for");
    });

    expect(review).not.toHaveProperty("depthRow");
    expect(rows).toBe(review.wholeKitchenRows);
  });

  it("lists a snapshot stored before the cut-over, which has no depth line, exactly as it was", () => {
    const storedBeforeTheCutOver = JSON.parse(`{
      "currency": "MDL", "pricingVersion": "sample-2026-09", "status": "estimate", "amountsProvisional": true,
      "lines": [
        { "lineId": "placement:p0:cabinet", "kind": "cabinet", "ruleId": "cabinet.base-sink", "placementId": "p0",
          "buildId": "base-sink-800", "pricedAsBuildId": "base-sink", "label": "base-sink", "widthMm": 800,
          "suppliedBy": "manufacturer", "quantity": 1, "unitAmountMinor": 485600, "amountMinor": 485600 },
        { "lineId": "kitchen:hardware", "kind": "hardware", "ruleId": "hardware.standard", "tierId": "hardware.standard",
          "name": "Standard", "description": "d", "quantity": 1, "unitAmountMinor": 1760, "amountMinor": 1760 },
        { "lineId": "kitchen:material", "kind": "material", "ruleId": "material.painted-mdf", "tierId": "material.painted-mdf",
          "name": "MDF", "description": "d", "quantity": 1, "unitAmountMinor": 900000, "amountMinor": 900000 }
      ],
      "totalMinor": 1387360, "overflowingPlacementIds": [], "totalIsFlagged": false
    }`) as PricedDesign;
    const onlyP0 = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter((p) => p.id === "p0"),
    };
    const kitchen = priceAndProject(onlyP0);

    const review = availableReviewOf({
      ...kitchen,
      pricing: { ok: true, priced: storedBeforeTheCutOver },
    });

    expect(review).not.toHaveProperty("depthRow");
    expect(listWholeKitchenRows(review, wordedAt)).toBe(
      review.wholeKitchenRows,
    );
    expect(review.wholeKitchenRows.map((row) => row.key)).toEqual([
      "kitchen:hardware",
      "kitchen:material",
    ]);
  });

  it("refuses to place a depth row when there is no material row to follow", () => {
    const review = availableReviewOf(DEEP);
    const withoutMaterial: AvailableReview = {
      ...review,
      wholeKitchenRows: review.wholeKitchenRows.filter(
        (row) => row.key !== "kitchen:material",
      ),
    };

    expect(() => listWholeKitchenRows(withoutMaterial, wordedAt)).toThrow(
      DepthRowWithoutMaterialRowError,
    );
  });
});
