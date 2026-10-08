// A price that cannot be computed is our fault, and the rule now carries why it failed (criterion 15). The
// review prints none of it: its refusal is a code and no bodies, whatever the failure said.
import {
  KITCHEN_L_DESIGN,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeReview } from "@/review/review-model";

import { priceAndProject } from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";

const SECRET_DETAIL = "SECRET-PRICING-DETAIL-7f3a";
const SECRET_ID = "SECRET-RULE-ID-91bc";

const UNPRICED: PricingResult = {
  ok: false,
  failure: {
    code: "NO_RULE_FOR_BODY",
    detail: SECRET_DETAIL,
    placementId: "p0",
    id: SECRET_ID,
  },
};

describe("the review of a kitchen whose price cannot be computed", () => {
  const kitchen = priceAndProject(KITCHEN_L_DESIGN);
  const view = describeReview({
    content: ro,
    design: kitchen.design,
    pricing: UNPRICED,
    groups: kitchen.groups,
  });

  it("refuses with the code and no bodies, as it always did", () => {
    expect(view).toEqual({
      kind: "unavailable",
      submit: { kind: "refused", code: "PRICING_FAILED", bodies: [] },
    });
  });

  it("holds nothing of the failure anywhere in what it publishes", () => {
    const published = JSON.stringify(view);

    expect(published).not.toContain(SECRET_DETAIL);
    expect(published).not.toContain(SECRET_ID);
    expect(published).not.toContain("NO_RULE_FOR_BODY");
    expect(published).not.toContain("failure");
  });
});
