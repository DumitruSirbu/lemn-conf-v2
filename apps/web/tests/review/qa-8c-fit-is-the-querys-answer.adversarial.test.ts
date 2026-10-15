// Whether a body fits is the domain query's answer, asked and believed.
//
// The query is replaced here by one whose answer the test chooses, so its answer can disagree with where the
// bodies stand. A review that measured a wall itself, or that read fit off anything but the query, sides with
// the geometry and fails; reading the source for a forbidden word cannot tell the two apart.
//
// The price handed in carries the same chosen answer, because pricing publishes the query's own list and a
// price that disagreed with the query would be another design's, which the review refuses to render.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  describeReview,
  ReviewInputDivergenceError,
  type ReviewView,
} from "@/review/review-model";

import {
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";

const queryAnswer = vi.hoisted(() => ({
  ids: [] as readonly string[],
  askedAbout: [] as unknown[],
}));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/configurator-domain")>()),
  findOverflowingPlacementIds: (design: unknown) => {
    queryAnswer.askedAbout.push(design);
    return [...queryAnswer.ids];
  },
}));

function viewOf(kitchen: PricedKitchen): ReviewView {
  return describeReview({
    content: ro,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
}

/** The kitchen as pricing would hand it over had the query answered `ids` when it was priced. */
function pricedUnderTheAnswer(
  kitchen: PricedKitchen,
  ids: readonly string[],
): PricedKitchen {
  if (!kitchen.pricing.ok) throw new Error("expected a priced kitchen");
  return {
    ...kitchen,
    pricing: {
      ok: true,
      priced: {
        ...kitchen.pricing.priced,
        overflowingPlacementIds: [...ids],
        totalIsFlagged: ids.length > 0,
      },
    },
  };
}

/** The query answers `ids`, and so did the query the price was computed with. */
function underTheAnswer(
  kitchen: PricedKitchen,
  ids: readonly string[],
): PricedKitchen {
  queryAnswer.ids = ids;
  return pricedUnderTheAnswer(kitchen, ids);
}

/** Every body pushed a whole wall's length further along: by any measurement, none of them fits. */
function withEveryBodyPastItsWall(design: Design): Design {
  return {
    ...design,
    placements: design.placements.map((placement) => ({
      ...placement,
      alongMm: placement.alongMm + design.room.widthMm + design.room.depthMm,
    })),
  };
}

const UNPRICED = {
  ok: false,
  failure: { code: "INVALID_PRICE_BOOK", detail: "unreadable" },
} as const;

describe("the review, asking a query whose answer the test chooses", () => {
  const FITTING = priceAndProject(KITCHEN_L_DESIGN);
  const PAST_EVERY_WALL = priceAndProject(
    withEveryBodyPastItsWall(KITCHEN_L_DESIGN),
  );
  const [FIRST, SECOND] = FITTING.groups.flatMap((group) =>
    group.entries.map((entry) => entry.placementId),
  );
  if (FIRST === undefined || SECOND === undefined) {
    throw new Error("the seeded kitchen lists two bodies");
  }

  beforeEach(() => {
    queryAnswer.ids = [];
    queryAnswer.askedAbout = [];
  });

  it("allows a kitchen whose bodies all stand past their walls when the query reports none", () => {
    const view = viewOf(underTheAnswer(PAST_EVERY_WALL, []));

    expect(view.submit).toEqual({ kind: "allowed" });
    expect(view).not.toHaveProperty("overflowWarning");
  });

  it("refuses a kitchen that fits, naming the bodies the query reports", () => {
    const { submit } = viewOf(underTheAnswer(FITTING, [SECOND, FIRST]));

    expect(submit).toMatchObject({ kind: "refused", code: "BODIES_PAST_WALL" });
    expect(
      submit.kind === "refused" &&
        submit.bodies.map((body) => body.placementId),
    ).toEqual([FIRST, SECOND]);
  });

  it("asks the query about the design it was handed, once", () => {
    viewOf(FITTING);

    expect(queryAnswer.askedAbout).toEqual([FITTING.design]);
    expect(queryAnswer.askedAbout[0]).toBe(FITTING.design);
  });

  it("asks the query when the price could not be computed, and names the bodies it reports", () => {
    queryAnswer.ids = [SECOND, FIRST];

    const view = viewOf({ ...FITTING, pricing: UNPRICED });

    expect(queryAnswer.askedAbout).toEqual([FITTING.design]);
    expect(view.kind).toBe("unavailable");
    expect(view.submit).toMatchObject({
      kind: "refused",
      code: "BODIES_PAST_WALL",
    });
    expect(
      view.submit.kind === "refused" &&
        view.submit.bodies.map((body) => body.placementId),
    ).toEqual([FIRST, SECOND]);
  });

  it("states the pricing failure for an unpriced kitchen whose bodies stand past their walls when the query reports none", () => {
    expect(viewOf({ ...PAST_EVERY_WALL, pricing: UNPRICED }).submit).toEqual({
      kind: "refused",
      code: "PRICING_FAILED",
      bodies: [],
    });
  });
});

describe("a price computed under another answer than the query now gives", () => {
  const FITTING = priceAndProject(KITCHEN_L_DESIGN);
  const [FIRST, SECOND] = FITTING.design.placements.map(({ id }) => id);
  if (FIRST === undefined || SECOND === undefined) {
    throw new Error("the seeded kitchen holds two bodies");
  }

  beforeEach(() => {
    queryAnswer.ids = [];
    queryAnswer.askedAbout = [];
  });

  it.each([
    ["flags a body the query does not report", [FIRST], []],
    ["flags nothing while the query reports a body", [], [FIRST]],
    ["flags one body while the query reports another", [FIRST], [SECOND]],
    ["flags one of the two bodies the query reports", [FIRST], [FIRST, SECOND]],
  ])("is refused as another design's when it %s", (_case, priced, asked) => {
    queryAnswer.ids = asked;

    expect(() => viewOf(pricedUnderTheAnswer(FITTING, priced))).toThrow(
      ReviewInputDivergenceError,
    );
  });

  it("is accepted when it flags the query's bodies in another order", () => {
    queryAnswer.ids = [FIRST, SECOND];

    expect(
      viewOf(pricedUnderTheAnswer(FITTING, [SECOND, FIRST])).submit,
    ).toMatchObject({ kind: "refused", code: "BODIES_PAST_WALL" });
  });
});
