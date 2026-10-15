// The design, its price and its projection are one design's, or the review throws and renders nothing.
//
// Each mismatch is made from two real kitchens: one swept kitchen and the same kitchen after an edit, each
// priced and projected whole, then handed over with one input taken from the other. Nothing is hand-built, so
// what is refused is what a caller holding a stale input would actually pass.
import {
  type Design,
  type DisplayGroup,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  describeReview,
  ReviewInputDivergenceError,
} from "@/review/review-model";

import {
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";
import {
  OVERFLOW_MAKERS,
  VARIED_ARMS,
  variedKitchensOf,
} from "../support/varied-kitchens";

const KITCHEN_FLOOR_PER_ARM = 80;

const UNPRICED: PricingResult = {
  ok: false,
  failure: { code: "PRICING_VERSION_MISMATCH", detail: "another version" },
};

interface Inputs {
  readonly design: Design;
  readonly pricing: PricingResult;
  readonly groups: readonly DisplayGroup[];
}

function review(inputs: Inputs) {
  return describeReview({ content: ro, ...inputs });
}

function withoutItsLastBody(kitchen: PricedKitchen): PricedKitchen {
  return priceAndProject({
    ...kitchen.design,
    placements: kitchen.design.placements.slice(0, -1),
  });
}

/** The kitchen with wall A a millimetre short of its furthest body: the same bodies, one now past its wall. */
function shortened(kitchen: PricedKitchen): PricedKitchen {
  const made = OVERFLOW_MAKERS[0]?.make(kitchen);
  if (made === undefined) throw new Error("the kitchen has no body on wall A");
  return priceAndProject(made.design);
}

function withItsFirstRowTwice(
  groups: readonly DisplayGroup[],
): readonly DisplayGroup[] {
  return groups.map((group, index) =>
    index === 0
      ? { ...group, entries: [...group.entries, ...group.entries.slice(0, 1)] }
      : group,
  );
}

describe.each(VARIED_ARMS)("over varied $name kitchens", (arm) => {
  const kitchens = variedKitchensOf(arm);

  it("sweeps enough kitchens", () => {
    expect(kitchens.length).toBeGreaterThanOrEqual(KITCHEN_FLOOR_PER_ARM);
  });

  it.each([
    ["priced", (kitchen: PricedKitchen) => kitchen.pricing],
    ["unpriced", () => UNPRICED],
  ])(
    "refuses, %s, a design holding a body the rows were not built for",
    (_state, pricingOf) => {
      for (const kitchen of kitchens) {
        const stale = withoutItsLastBody(kitchen);

        expect(() =>
          review({
            design: kitchen.design,
            pricing: pricingOf(stale),
            groups: stale.groups,
          }),
        ).toThrow(ReviewInputDivergenceError);
      }
    },
  );

  it.each([
    ["priced", (kitchen: PricedKitchen) => kitchen.pricing],
    ["unpriced", () => UNPRICED],
  ])(
    "refuses, %s, rows built for a body the design no longer holds",
    (_state, pricingOf) => {
      for (const kitchen of kitchens) {
        const edited = withoutItsLastBody(kitchen);

        expect(() =>
          review({
            design: edited.design,
            pricing: pricingOf(kitchen),
            groups: kitchen.groups,
          }),
        ).toThrow(ReviewInputDivergenceError);
      }
    },
  );

  it("refuses, unpriced, rows that list one of the design's bodies twice", () => {
    for (const kitchen of kitchens) {
      expect(() =>
        review({
          design: kitchen.design,
          pricing: UNPRICED,
          groups: withItsFirstRowTwice(kitchen.groups),
        }),
      ).toThrow(ReviewInputDivergenceError);
    }
  });

  it("refuses a price computed before a wall was shortened under the same bodies", () => {
    for (const kitchen of kitchens) {
      const edited = shortened(kitchen);

      expect(() =>
        review({
          design: edited.design,
          pricing: kitchen.pricing,
          groups: edited.groups,
        }),
      ).toThrow(ReviewInputDivergenceError);
    }
  });

  it("refuses a price computed while a body was past a wall it now fits", () => {
    for (const kitchen of kitchens) {
      const stale = shortened(kitchen);

      expect(() =>
        review({
          design: kitchen.design,
          pricing: stale.pricing,
          groups: kitchen.groups,
        }),
      ).toThrow(ReviewInputDivergenceError);
    }
  });

  it("renders the three inputs of one design, priced or not, fitting or not", () => {
    for (const kitchen of kitchens) {
      const edited = shortened(kitchen);

      expect(review(kitchen).kind).toBe("available");
      expect(review(edited).kind).toBe("available");
      expect(review({ ...kitchen, pricing: UNPRICED }).kind).toBe(
        "unavailable",
      );
      expect(review({ ...edited, pricing: UNPRICED }).kind).toBe("unavailable");
    }
  });
});
