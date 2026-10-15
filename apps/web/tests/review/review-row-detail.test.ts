// The lookup the review screen calls for a row's second line. What the lines say, over swept kitchens and both
// locales, is `qa-8d2-row-second-line.adversarial.test.ts`'s.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  describeReview,
  MissingRowDetailError,
  rowDetailOf,
  type AvailableReview,
} from "@/review/review-model";

import roMessages from "../../src/messages/ro.json";
import { priceAndProject } from "../support/generated-kitchens";
import { contentFor } from "../support/catalogues";

function reviewOf(design: Design): AvailableReview {
  const kitchen = priceAndProject(design);
  const view = describeReview({
    content: contentFor("ro", roMessages),
    ...kitchen,
  });
  if (view.kind !== "available") throw new Error("the kitchen has no review");
  return view;
}

describe("the lookup the screen calls", () => {
  const details = reviewOf(KITCHEN_L_DESIGN).rowDetails;
  const heldId = KITCHEN_L_DESIGN.placements[0]?.id ?? "";

  it("returns the detail of a body the review holds", () => {
    expect(rowDetailOf(details, heldId)).toBe(details[heldId]);
  });

  it.each(["no-such-body", "constructor", "__proto__"])(
    "throws a named error carrying the id for %s, which the review does not hold",
    (placementId) => {
      expect(() => rowDetailOf(details, placementId)).toThrow(
        MissingRowDetailError,
      );
      expect(() => rowDetailOf(details, placementId)).toThrow(
        `"${placementId}"`,
      );
    },
  );
});
