import { describe, expect, it } from "vitest";

import {
  holdsNothingLemnariaSupplies,
  judgeSubmissionEligibility,
  KITCHEN_L_DESIGN,
  priceDesign,
  type Design,
  type PricedDesign,
  type PricingResult,
  type SubmissionEligibility,
} from "../../src/index.js";

import { catalogOf, SAMPLE_BOOK } from "./support/submission-kitchens.js";

const NO_BODIES: Design = { ...KITCHEN_L_DESIGN, placements: [] };

const PRICED_SEEDED = priceDesign({
  design: KITCHEN_L_DESIGN,
  catalog: catalogOf(KITCHEN_L_DESIGN),
  book: SAMPLE_BOOK,
  pricingVersion: SAMPLE_BOOK.version,
  selections: KITCHEN_L_DESIGN.settings,
});

const PRICING_REFUSED: PricingResult = {
  ok: false,
  failure: { code: "INVALID_PRICE_BOOK", detail: "unreadable" },
};

function pricedOf(result: PricingResult): PricedDesign {
  if (!result.ok) throw new Error("expected the seeded kitchen to price");
  return result.priced;
}

/** The seeded price with every cabinet line handed to the customer: the amounts stay, the supplier moves. */
function pricedAllSuppliedByCustomer(): PricedDesign {
  const priced = pricedOf(PRICED_SEEDED);
  return {
    ...priced,
    lines: priced.lines.map((line) =>
      line.kind === "cabinet" ? { ...line, suppliedBy: "customer" } : line,
    ),
  };
}

function refusalCodeOf(eligibility: SubmissionEligibility): string {
  return eligibility.kind === "refused" ? eligibility.refusal.code : "allowed";
}

describe("judgeSubmissionEligibility: the order of the three refusals (ADR 0148 decision 1)", () => {
  const PLACEMENT_IDS = KITCHEN_L_DESIGN.placements.map(({ id }) => id);
  const [FIRST, SECOND] = PLACEMENT_IDS;
  if (FIRST === undefined || SECOND === undefined) {
    throw new Error("the seeded kitchen holds two bodies");
  }

  const SUPPLIED_BY_CUSTOMER: PricingResult = {
    ok: true,
    priced: pricedAllSuppliedByCustomer(),
  };

  it.each([
    [
      "a body past its wall, whatever pricing answered",
      [FIRST],
      PRICING_REFUSED,
    ],
    [
      "a body past its wall and a kitchen of nothing Lemnaria supplies",
      [FIRST],
      SUPPLIED_BY_CUSTOMER,
    ],
    ["a body past its wall and a price that is fine", [FIRST], PRICED_SEEDED],
  ])(
    "says BODIES_PAST_WALL for %s",
    (_name, overflowingPlacementIds, pricing) => {
      const eligibility = judgeSubmissionEligibility({
        design: KITCHEN_L_DESIGN,
        overflowingPlacementIds,
        pricing,
      });

      expect(eligibility).toEqual({
        kind: "refused",
        refusal: {
          code: "BODIES_PAST_WALL",
          placementIds: overflowingPlacementIds,
        },
      });
    },
  );

  it("names the bodies exactly as the fit query gave them, in its order", () => {
    const eligibility = judgeSubmissionEligibility({
      design: KITCHEN_L_DESIGN,
      overflowingPlacementIds: [SECOND, FIRST],
      pricing: PRICED_SEEDED,
    });

    expect(eligibility).toMatchObject({
      refusal: { placementIds: [SECOND, FIRST] },
    });
  });

  it("says NO_CABINET when every body is the customer's, though the amounts are not zero", () => {
    expect(
      refusalCodeOf(
        judgeSubmissionEligibility({
          design: KITCHEN_L_DESIGN,
          overflowingPlacementIds: [],
          pricing: SUPPLIED_BY_CUSTOMER,
        }),
      ),
    ).toBe("NO_CABINET");
  });

  it("says NO_CABINET for a design with no body even when the price failed", () => {
    expect(
      refusalCodeOf(
        judgeSubmissionEligibility({
          design: NO_BODIES,
          overflowingPlacementIds: [],
          pricing: PRICING_REFUSED,
        }),
      ),
    ).toBe("NO_CABINET");
  });

  it("says PRICING_FAILED only when the design holds bodies, none is past its wall and the price failed", () => {
    expect(
      judgeSubmissionEligibility({
        design: KITCHEN_L_DESIGN,
        overflowingPlacementIds: [],
        pricing: PRICING_REFUSED,
      }),
    ).toEqual({ kind: "refused", refusal: { code: "PRICING_FAILED" } });
  });

  it("allows a kitchen that fits, is priced and holds a body Lemnaria supplies, carrying the price it judged", () => {
    const eligibility = judgeSubmissionEligibility({
      design: KITCHEN_L_DESIGN,
      overflowingPlacementIds: [],
      pricing: PRICED_SEEDED,
    });

    expect(eligibility).toEqual({
      kind: "allowed",
      priced: pricedOf(PRICED_SEEDED),
    });
  });

  it("believes the fit answer it is handed and measures no wall itself", () => {
    const past: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
        ...placement,
        alongMm: 100_000,
      })),
    };

    expect(
      refusalCodeOf(
        judgeSubmissionEligibility({
          design: past,
          overflowingPlacementIds: [],
          pricing: PRICED_SEEDED,
        }),
      ),
    ).toBe("allowed");
  });
});

describe("holdsNothingLemnariaSupplies: read off the supplier, never off an amount", () => {
  it("is false for a kitchen with manufacturer bodies", () => {
    expect(holdsNothingLemnariaSupplies(pricedOf(PRICED_SEEDED))).toBe(false);
  });

  it("is true when every cabinet line is the customer's", () => {
    expect(holdsNothingLemnariaSupplies(pricedAllSuppliedByCustomer())).toBe(
      true,
    );
  });

  it("is true for a priced design with no cabinet line at all", () => {
    const priced = pricedOf(PRICED_SEEDED);

    expect(
      holdsNothingLemnariaSupplies({
        ...priced,
        lines: priced.lines.filter((line) => line.kind !== "cabinet"),
      }),
    ).toBe(true);
  });

  it("is false for a manufacturer body that prices to zero", () => {
    const priced = pricedOf(PRICED_SEEDED);

    expect(
      holdsNothingLemnariaSupplies({
        ...priced,
        lines: priced.lines.map((line) =>
          line.kind === "cabinet"
            ? { ...line, amountMinor: 0, unitAmountMinor: 0 }
            : line,
        ),
      }),
    ).toBe(false);
  });
});
