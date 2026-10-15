// `holdsNoCabinets` is the question the price surfaces ask: does this priced design hold a cabinet line at all.
// Its neighbour, `holdsNothingLemnariaSupplies`, moved to the domain with the submission rule and is tested in
// `packages/configurator-domain/tests/contact/submission-eligibility.test.ts`.
import {
  KITCHEN_L_DESIGN,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { holdsNoCabinets } from "@/price/starting-price";

import { priceAndProject } from "../support/generated-kitchens";
import {
  customerSuppliedIds,
  emptied,
  keepingOnly,
} from "../support/review-edits";

function pricedOf(design: typeof KITCHEN_L_DESIGN): PricedDesign {
  const { pricing } = priceAndProject(design);
  if (!pricing.ok) throw new Error("expected a priced kitchen");
  return pricing.priced;
}

describe("holdsNoCabinets", () => {
  it("is true for a kitchen with no body", () => {
    expect(holdsNoCabinets(pricedOf(emptied(KITCHEN_L_DESIGN)))).toBe(true);
  });

  it("is false for a kitchen of supplied bodies, which are still cabinet lines", () => {
    const supplied = customerSuppliedIds(pricedOf(KITCHEN_L_DESIGN));

    expect(supplied.size).toBeGreaterThan(0);
    expect(
      holdsNoCabinets(pricedOf(keepingOnly(KITCHEN_L_DESIGN, supplied))),
    ).toBe(false);
  });
});
