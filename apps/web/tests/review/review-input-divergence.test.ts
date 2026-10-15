// The model is handed a design, its price and its projection. It cannot re-derive the price (the book is named
// only in `use-priced-design.ts`), so it asserts what it can see and throws, never renders, when they disagree.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  type Design,
  type DesignPlacement,
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
import {
  ownWallLengthMm,
  pastTheWall,
  withAnUnofferedTier,
} from "../support/review-edits";
import { ro } from "../support/romanian-content";

const SEEDED = priceAndProject(KITCHEN_L_DESIGN);
const [FIRST, SECOND, THIRD] = KITCHEN_L_DESIGN.placements;
if (FIRST === undefined || SECOND === undefined || THIRD === undefined) {
  throw new Error("the seeded design holds bodies");
}

function describeWith(
  kitchen: PricedKitchen,
  design: Design = kitchen.design,
): unknown {
  return describeReview({
    content: ro,
    design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
}

function withPlacements(placements: Design["placements"]): Design {
  return { ...KITCHEN_L_DESIGN, placements };
}

describe("inputs that are not one design's", () => {
  it("throws for a design holding a body the rows do not list", () => {
    const stray: DesignPlacement = { ...FIRST, id: "stray-body" };

    expect(() =>
      describeWith(
        SEEDED,
        withPlacements([...KITCHEN_L_DESIGN.placements, stray]),
      ),
    ).toThrow(ReviewInputDivergenceError);
    expect(() =>
      describeWith(
        SEEDED,
        withPlacements([...KITCHEN_L_DESIGN.placements, stray]),
      ),
    ).toThrow(/stray-body/);
  });

  it("throws for rows listing a body the design does not hold", () => {
    const withoutSecond = withPlacements(
      KITCHEN_L_DESIGN.placements.filter(({ id }) => id !== SECOND.id),
    );

    expect(() => describeWith(SEEDED, withoutSecond)).toThrow(
      ReviewInputDivergenceError,
    );
    expect(() => describeWith(SEEDED, withoutSecond)).toThrow(
      new RegExp(SECOND.id),
    );
  });

  it("throws for a design that repeats an id the rows list once", () => {
    expect(() =>
      describeWith(
        SEEDED,
        withPlacements([...KITCHEN_L_DESIGN.placements, { ...FIRST }]),
      ),
    ).toThrow(ReviewInputDivergenceError);
  });

  it("throws when the price says nothing is past a wall and the query finds a body there", () => {
    const moved = pastTheWall(KITCHEN_L_DESIGN, new Set([THIRD.id]));

    expect(() => describeWith(SEEDED, moved)).toThrow(
      ReviewInputDivergenceError,
    );
    expect(() => describeWith(SEEDED, moved)).toThrow(new RegExp(THIRD.id));
  });

  it("throws when the price flags a body the design no longer has past a wall", () => {
    const overflowing = priceAndProject(
      pastTheWall(KITCHEN_L_DESIGN, new Set([THIRD.id])),
    );

    expect(() => describeWith(overflowing, KITCHEN_L_DESIGN)).toThrow(
      ReviewInputDivergenceError,
    );
  });

  it("throws, with no price to compare, when the rows and the design differ", () => {
    const unpriced = priceAndProject(withAnUnofferedTier(KITCHEN_L_DESIGN));
    const stray: DesignPlacement = {
      ...FIRST,
      id: "stray-body",
      alongMm: ownWallLengthMm(KITCHEN_L_DESIGN, FIRST.wall) + 1,
    };

    expect(unpriced.pricing.ok).toBe(false);
    expect(() =>
      describeWith(
        unpriced,
        withPlacements([...KITCHEN_L_DESIGN.placements, stray]),
      ),
    ).toThrow(ReviewInputDivergenceError);
  });

  it("throws its own error, not the breakdown's, for a priced body no group holds", () => {
    const rowsOfNothing = {
      content: ro,
      design: SEEDED.design,
      pricing: SEEDED.pricing,
      groups: [],
    };

    expect(() => describeReview(rowsOfNothing)).toThrow(
      ReviewInputDivergenceError,
    );
  });

  it("throws its own error for a price that lacks a body the design and the rows hold", () => {
    const withoutSecond = priceAndProject({
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        ({ id }) => id !== SECOND.id,
      ),
    });

    expect(() =>
      describeReview({
        content: ro,
        design: SEEDED.design,
        pricing: withoutSecond.pricing,
        groups: SEEDED.groups,
      }),
    ).toThrow(new RegExp(`the price and the rows differ over: ${SECOND.id}`));
  });

  it("throws, with no price, for ids that repeat differently in the design and the rows", () => {
    const catalog = buildKitchenLBodyCatalog(
      cabinetDepthMmOf(KITCHEN_L_DESIGN),
    );
    const [a, b, c] = KITCHEN_L_DESIGN.placements;
    if (a === undefined || b === undefined || c === undefined) {
      throw new Error("the seeded design holds three bodies");
    }
    const asIds = (...ids: string[]): Design => ({
      ...KITCHEN_L_DESIGN,
      placements: [a, b, c].map((placement, index) => ({
        ...placement,
        id: ids[index] ?? "",
      })),
    });
    const unpriced = priceAndProject(withAnUnofferedTier(KITCHEN_L_DESIGN));

    expect(() =>
      describeReview({
        content: ro,
        design: asIds("x", "x", "y"),
        pricing: unpriced.pricing,
        groups: projectDesignForDisplay(asIds("x", "y", "y"), catalog),
      }),
    ).toThrow(ReviewInputDivergenceError);
  });

  it("does not throw for the inputs of one design, priced or not", () => {
    expect(() => describeWith(SEEDED)).not.toThrow();
    expect(() =>
      describeWith(priceAndProject(withAnUnofferedTier(KITCHEN_L_DESIGN))),
    ).not.toThrow();
  });
});
