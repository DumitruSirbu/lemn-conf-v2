import { describe, expect, it } from "vitest";

import {
  holdsNothingLemnariaSupplies,
  judgeSubmissionEligibility,
  SubmissionFactsContradictionError,
  KITCHEN_L_DESIGN,
  priceDesign,
  type Design,
  type PricedDesign,
  type PricingResult,
  type SubmissionEligibility,
} from "../../src/index.js";

import { catalogOf, SAMPLE_BOOK } from "./support/submission-kitchens.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";

const NO_BODIES: Design = { ...KITCHEN_L_DESIGN, placements: [] };

const PRICED_SEEDED = priceDesign({
  deepeningRows: MEASURED_DEEPENING_ROWS,
  design: KITCHEN_L_DESIGN,
  catalog: catalogOf(KITCHEN_L_DESIGN),
  book: SAMPLE_BOOK,
  pricingVersion: SAMPLE_BOOK.version,
  selections: KITCHEN_L_DESIGN.settings,
});

const PRICING_FAILURE = {
  code: "INVALID_PRICE_BOOK",
  detail: "unreadable",
} as const;

const PRICING_REFUSED: PricingResult = { ok: false, failure: PRICING_FAILURE };

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

function pricedUnder(design: Design): PricedDesign {
  return pricedOf(
    priceDesign({
      deepeningRows: MEASURED_DEEPENING_ROWS,
      design,
      catalog: catalogOf(design),
      book: SAMPLE_BOOK,
      pricingVersion: SAMPLE_BOOK.version,
      selections: design.settings,
    }),
  );
}

const SUPPLIED_IDS = new Set(
  pricedOf(PRICED_SEEDED).lines.flatMap((line) =>
    line.kind === "cabinet" && line.suppliedBy === "customer"
      ? [line.placementId]
      : [],
  ),
);

/** Only these bodies kept, and the recorded spaces dropped with the rest. */
function keepingOnly(ids: ReadonlySet<string>): Design {
  return {
    ...NO_BODIES,
    emptyColumns: [],
    columnExtents: [],
    placements: KITCHEN_L_DESIGN.placements.filter(({ id }) => ids.has(id)),
  };
}

describe("judgeSubmissionEligibility: the order of the three refusals (ADR 0148 decision 1)", () => {
  const PLACEMENT_IDS = KITCHEN_L_DESIGN.placements.map(({ id }) => id);
  const [FIRST, SECOND] = PLACEMENT_IDS;
  if (FIRST === undefined || SECOND === undefined) {
    throw new Error("the seeded kitchen holds two bodies");
  }

  /** The same price, as it would be had pricing found these bodies past their wall. */
  function flagging(
    priced: PricedDesign,
    ids: readonly string[],
  ): PricingResult {
    return {
      ok: true,
      priced: {
        ...priced,
        overflowingPlacementIds: [...ids],
        totalIsFlagged: true,
      },
    };
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
      flagging(pricedAllSuppliedByCustomer(), [FIRST]),
    ],
    [
      "a body past its wall and a price that is fine",
      [FIRST],
      flagging(pricedOf(PRICED_SEEDED), [FIRST]),
    ],
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
      pricing: flagging(pricedOf(PRICED_SEEDED), [FIRST, SECOND]),
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
    ).toEqual({
      kind: "refused",
      refusal: { code: "PRICING_FAILED", failure: PRICING_FAILURE },
    });
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
  it("sees, in the seeded kitchen, bodies the customer supplies and bodies Lemnaria sells", () => {
    expect(SUPPLIED_IDS.size).toBeGreaterThan(0);
    expect(SUPPLIED_IDS.size).toBeLessThan(KITCHEN_L_DESIGN.placements.length);
  });

  it("is true for a kitchen priced from bodies the customer supplies alone", () => {
    const supplied = pricedUnder(keepingOnly(SUPPLIED_IDS));

    expect(supplied.lines.some((line) => line.kind === "cabinet")).toBe(true);
    expect(holdsNothingLemnariaSupplies(supplied)).toBe(true);
  });

  it("is true for a kitchen priced with no body, which holds nothing to supply either", () => {
    expect(
      holdsNothingLemnariaSupplies(pricedUnder(keepingOnly(new Set()))),
    ).toBe(true);
  });

  it("is false once one body is sold, however many are supplied beside it", () => {
    const sold = KITCHEN_L_DESIGN.placements.find(
      ({ id }) => !SUPPLIED_IDS.has(id),
    );
    if (sold === undefined) throw new Error("the seeded kitchen sells a body");

    const mixed = pricedUnder(keepingOnly(new Set([...SUPPLIED_IDS, sold.id])));

    expect(holdsNothingLemnariaSupplies(mixed)).toBe(false);
  });

  it("is true for supplied bodies whatever their amount says", () => {
    const supplied = pricedUnder(keepingOnly(SUPPLIED_IDS));

    expect(
      holdsNothingLemnariaSupplies({
        ...supplied,
        lines: supplied.lines.map((line) =>
          line.kind === "cabinet"
            ? { ...line, unitAmountMinor: 50_000, amountMinor: 50_000 }
            : line,
        ),
      }),
    ).toBe(true);
  });

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

describe("judgeSubmissionEligibility: facts that cannot all be true throw", () => {
  const [FIRST, SECOND] = KITCHEN_L_DESIGN.placements.map(({ id }) => id);
  if (FIRST === undefined || SECOND === undefined) {
    throw new Error("the seeded kitchen holds two bodies");
  }
  const priced = pricedOf(PRICED_SEEDED);

  function judge(
    overflowingPlacementIds: readonly string[],
    flagged: readonly string[],
  ) {
    return judgeSubmissionEligibility({
      design: KITCHEN_L_DESIGN,
      overflowingPlacementIds,
      pricing: {
        ok: true,
        priced: {
          ...priced,
          overflowingPlacementIds: [...flagged],
          totalIsFlagged: flagged.length > 0,
        },
      },
    });
  }

  it.each([
    ["flags a body the list lacks", [], [FIRST]],
    ["lacks a body the list names", [FIRST], []],
    ["flags one body where the list names another", [FIRST], [SECOND]],
    ["flags one of the two the list names", [FIRST, SECOND], [FIRST]],
  ])("throws when the price %s", (_name, list, flagged) => {
    expect(() => judge(list, flagged)).toThrow(
      SubmissionFactsContradictionError,
    );
  });

  it("names the offending body in the error", () => {
    expect(() => judge([], [FIRST])).toThrow(FIRST);
  });
});
