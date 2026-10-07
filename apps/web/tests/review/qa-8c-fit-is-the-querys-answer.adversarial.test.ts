// Whether a body fits is the domain query's answer, asked and believed.
//
// The query is replaced here by one whose answer the test chooses, so its answer can disagree with where the
// bodies stand. A review that measured a wall itself, or that read fit off anything but the query, sides with
// the geometry and fails; reading the source for a forbidden word cannot tell the two apart.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { describeReview, type ReviewView } from "@/review/review-model";

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

describe("the review, asking a query whose answer the test chooses", () => {
  const FITTING = priceAndProject(KITCHEN_L_DESIGN);
  const PAST_EVERY_WALL = priceAndProject(
    withEveryBodyPastItsWall(KITCHEN_L_DESIGN),
  );

  beforeEach(() => {
    queryAnswer.ids = [];
    queryAnswer.askedAbout = [];
  });

  it("allows a kitchen whose bodies all stand past their walls when the query reports none", () => {
    expect(viewOf(PAST_EVERY_WALL).submit).toEqual({ kind: "allowed" });
  });

  it("refuses a kitchen that fits, naming the bodies the query reports", () => {
    const [first, second] = FITTING.groups.flatMap((group) =>
      group.entries.map((entry) => entry.placementId),
    );
    if (first === undefined || second === undefined) {
      throw new Error("the seeded kitchen lists two bodies");
    }
    queryAnswer.ids = [second, first];

    const { submit } = viewOf(FITTING);

    expect(submit).toMatchObject({ kind: "refused", code: "BODIES_PAST_WALL" });
    expect(
      submit.kind === "refused" &&
        submit.bodies.map((body) => body.placementId),
    ).toEqual([first, second]);
  });

  it("asks the query about the design it was handed, once", () => {
    viewOf(FITTING);

    expect(queryAnswer.askedAbout).toEqual([FITTING.design]);
    expect(queryAnswer.askedAbout[0]).toBe(FITTING.design);
  });

  it("does not ask the query at all when there is nothing to review", () => {
    viewOf({
      ...FITTING,
      pricing: {
        ok: false,
        failure: { code: "INVALID_PRICE_BOOK", detail: "unreadable" },
      },
    });

    expect(queryAnswer.askedAbout).toEqual([]);
  });
});
