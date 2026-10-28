// Adversarial QA for P3-c on the web side: a stored contact-submission snapshot reaches the review (and so the shop's
// lead notice, which prints the review of the stored snapshot) with the total it was stored with. The figure is rounded
// up to a thousand lei for display, so a total rounded to ten lei, or re-added from the stored lines, would be invisible
// at a total a few bani above a thousand-lei boundary only; the sweep puts the stored total there, and puts it out of
// step with the sum of its stored lines, so the figure can only be the stored one.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  type Design,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { describe, expect } from "vitest";

import { describeStartingPrice } from "@/price/starting-price";
import { describeReview } from "@/review/review-model";

import { ro } from "../support/romanian-content";

const THOUSAND_LEI_MINOR = 100_000;
const DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.filter(
    (placement) => placement.id === "p0",
  ),
};

function storedWithTotal(totalMinor: number): PricedDesign {
  return JSON.parse(`{
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
    "totalMinor": ${String(totalMinor)}, "overflowingPlacementIds": [], "totalIsFlagged": false
  }`) as PricedDesign;
}

function figureOfReview(stored: PricedDesign): unknown {
  const groups = projectDesignForDisplay(
    DESIGN,
    buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
  );
  const review = describeReview({
    content: ro,
    design: DESIGN,
    pricing: { ok: true, priced: stored },
    groups,
  });
  if (review.kind !== "available") throw new Error("the review is available");
  return review.figure;
}

describe("P3-c: the review's figure is the stored total, whatever its lines add up to", () => {
  const JUST_ABOVE_A_BOUNDARY = fc
    .tuple(fc.integer({ min: 5, max: 90 }), fc.integer({ min: 1, max: 499 }))
    .map(([thousands, bani]) => thousands * THOUSAND_LEI_MINOR + bani);

  propertyTest.prop([JUST_ABOVE_A_BOUNDARY], { numRuns: 300 })(
    "shows describeStartingPrice of the stored total when it falls just above a thousand-lei boundary",
    (totalMinor) => {
      const stored = storedWithTotal(totalMinor);

      expect(figureOfReview(stored)).toEqual(
        describeStartingPrice({ totalMinor, copy: ro.price }),
      );
      expect(stored.totalMinor).toBe(totalMinor);
    },
  );
});
