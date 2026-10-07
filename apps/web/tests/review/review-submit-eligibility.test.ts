// Criterion 5: the kitchen may be submitted, or the review says why not and names the bodies.
//
// The expected side is not the model's: whether a body overflows is re-measured here from the room and the
// placement (`overflowingIdsOf`), the order and labels are rebuilt from the projection's entries, and the
// result is checked against the domain query only to keep this measurement honest. The model must ask the
// query and believe it; this file never asks the model how it decided.
import {
  findOverflowingPlacementIds,
  KITCHEN_L_DESIGN,
  type Design,
  type DesignPlacement,
  type DisplayEntry,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeReview, type ReviewView } from "@/review/review-model";

import { CATALOGUES, contentFor } from "../support/catalogues";
import {
  generatePricedKitchen,
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";
import { ownWallLengthMm, pastTheWall } from "../support/review-edits";
import { ARMS, composedKitchensOf, U_ARM } from "../support/swept-kitchens";

const FLOOR_PER_ARM = 80;

function overflowingIdsOf(design: Design): ReadonlySet<string> {
  return new Set(
    design.placements
      .filter(
        (placement) =>
          placement.alongMm + placement.body.widthMm / 2 >
          ownWallLengthMm(design, placement.wall),
      )
      .map((placement) => placement.id),
  );
}

function viewOf(kitchen: PricedKitchen, content = ro): ReviewView {
  return describeReview({
    content,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
}

function entriesInDisplayOrder(
  kitchen: PricedKitchen,
): readonly DisplayEntry[] {
  return kitchen.groups.flatMap((group) => group.entries);
}

function expectedNamedBodies(kitchen: PricedKitchen, content = ro) {
  const overflowing = overflowingIdsOf(kitchen.design);
  return entriesInDisplayOrder(kitchen)
    .filter((entry) => overflowing.has(entry.placementId))
    .map((entry) => ({
      placementId: entry.placementId,
      label: content.priceBreakdown.placementLabel(
        content.bodyLabel(entry.label),
        entry.widthMm,
      ),
    }));
}

/** Deterministic picks: a stride through the placements, so each kitchen loses different bodies. */
function placementIdsAt(
  design: Design,
  seed: number,
  count: number,
): ReadonlySet<string> {
  const { placements } = design;
  return new Set(
    Array.from(
      { length: count },
      (_, step) =>
        placements[(seed * 7 + step * 5) % placements.length]?.id ?? "",
    ),
  );
}

function wallIds(design: Design, wall: DesignPlacement["wall"]): string[] {
  return design.placements
    .filter((placement) => placement.wall === wall)
    .map((placement) => placement.id);
}

/** The kitchen as generated, plus three ways of pushing bodies past their wall. */
function variantsOf(kitchen: PricedKitchen, seed: number): PricedKitchen[] {
  const { design } = kitchen;
  const lastWall = design.room.shape === "U" ? "C" : "A";
  return [
    kitchen,
    priceAndProject(pastTheWall(design, placementIdsAt(design, seed, 1))),
    priceAndProject(pastTheWall(design, placementIdsAt(design, seed, 3))),
    priceAndProject(pastTheWall(design, new Set(wallIds(design, lastWall)))),
  ];
}

function isSubmittable(kitchen: PricedKitchen): boolean {
  return (
    kitchen.pricing.ok &&
    kitchen.design.placements.length > 0 &&
    overflowingIdsOf(kitchen.design).size === 0
  );
}

describe.each(ARMS)("over generated $name kitchens", (arm) => {
  const swept = composedKitchensOf(arm);
  const variants = swept.flatMap((kitchen, index) =>
    variantsOf(kitchen, index),
  );

  it("measures overflow as the domain query does, so the oracle below is the right one", () => {
    for (const variant of variants) {
      expect(findOverflowingPlacementIds(variant.design)).toEqual(
        [...overflowingIdsOf(variant.design)].sort(),
      );
    }
  });

  it("sweeps enough kitchens that fit and enough that do not", () => {
    expect(variants.filter(isSubmittable).length).toBeGreaterThanOrEqual(
      FLOOR_PER_ARM,
    );
    expect(
      variants.filter((variant) => !isSubmittable(variant)).length,
    ).toBeGreaterThanOrEqual(FLOOR_PER_ARM);
  });

  it("allows a kitchen if and only if it has a body, prices, and nothing reaches past its wall", () => {
    for (const variant of variants) {
      expect(viewOf(variant).submit.kind === "allowed").toBe(
        isSubmittable(variant),
      );
    }
  });

  it("refuses an overflowing kitchen with the past-the-wall reason and no other", () => {
    for (const variant of variants.filter((v) => !isSubmittable(v))) {
      expect(viewOf(variant).submit).toMatchObject({
        kind: "refused",
        code: "BODIES_PAST_WALL",
      });
    }
  });

  it("names exactly the overflowing bodies, in display order, by the review's own labels", () => {
    for (const variant of variants.filter((v) => !isSubmittable(v))) {
      const view = viewOf(variant);
      if (view.submit.kind !== "refused") throw new Error("expected a refusal");

      expect(view.submit.bodies).toEqual(expectedNamedBodies(variant));
    }
  });
});

describe("the bodies a refusal names, in display order", () => {
  const SEEDED = priceAndProject(KITCHEN_L_DESIGN);

  /** Two bodies whose display order is the reverse of the query's byte order of their ids. */
  function pairOrderedAgainstTheQuery(): ReadonlySet<string> {
    const ids = entriesInDisplayOrder(SEEDED).map((entry) => entry.placementId);
    for (const [first, firstId] of ids.entries()) {
      for (const secondId of ids.slice(first + 1)) {
        const moved = priceAndProject(
          pastTheWall(SEEDED.design, new Set([firstId, secondId])),
        );
        const inDisplay = entriesInDisplayOrder(moved)
          .map((entry) => entry.placementId)
          .filter((id) => id === firstId || id === secondId);
        const inQuery = findOverflowingPlacementIds(moved.design);
        if (inDisplay.join() !== inQuery.join()) {
          return new Set([firstId, secondId]);
        }
      }
    }
    throw new Error("no pair of seeded bodies is ordered against the query");
  }

  it("follow the projection, not the query's order of ids", () => {
    const pair = pairOrderedAgainstTheQuery();
    const moved = priceAndProject(pastTheWall(SEEDED.design, pair));
    const view = viewOf(moved);
    if (view.submit.kind !== "refused") throw new Error("expected a refusal");
    const named = view.submit.bodies.map((body) => body.placementId);

    expect(named).toEqual(
      entriesInDisplayOrder(moved)
        .map((entry) => entry.placementId)
        .filter((id) => pair.has(id)),
    );
    expect(named).not.toEqual(findOverflowingPlacementIds(moved.design));
  });

  it("include a body on wall C of a U, after those on walls A and B", () => {
    const uKitchen = composedKitchensOf(U_ARM)[0];
    if (uKitchen === undefined) throw new Error("no composed U");
    const { design } = uKitchen;
    const ids = new Set([
      ...wallIds(design, "C").slice(0, 1),
      ...wallIds(design, "B").slice(0, 1),
      ...wallIds(design, "A").slice(0, 1),
    ]);
    const moved = priceAndProject(pastTheWall(design, ids));
    const view = viewOf(moved);
    if (view.submit.kind !== "refused") throw new Error("expected a refusal");
    const walls = view.submit.bodies.map(
      (body) =>
        design.placements.find((placement) => placement.id === body.placementId)
          ?.wall,
    );

    expect(walls).toEqual(["A", "B", "C"]);
  });

  it.each(CATALOGUES)(
    "carry the review's row label in %s",
    (locale, messages) => {
      const content = contentFor(locale, messages);
      const moved = priceAndProject(
        pastTheWall(SEEDED.design, placementIdsAt(SEEDED.design, 3, 3)),
      );
      const view = viewOf(moved, content);
      if (view.kind !== "available") throw new Error("expected a review");
      if (view.submit.kind !== "refused") throw new Error("expected a refusal");
      const rowLabelOf = new Map(
        view.groups
          .flatMap((group) => group.rows)
          .map((row) => [row.key, row.label]),
      );

      expect(view.submit.bodies.length).toBeGreaterThan(0);
      for (const body of view.submit.bodies) {
        expect(body.label).toBe(rowLabelOf.get(body.placementId));
      }
    },
  );
});

describe("an empty kitchen, and a kitchen shown with its figure", () => {
  const SEEDED = priceAndProject(KITCHEN_L_DESIGN);
  const OVERFLOWING = priceAndProject(
    pastTheWall(SEEDED.design, placementIdsAt(SEEDED.design, 1, 2)),
  );
  const EMPTY = priceAndProject({
    ...KITCHEN_L_DESIGN,
    placements: [],
    emptyColumns: [],
    columnExtents: [],
  });

  function submitOf(kitchen: PricedKitchen) {
    return viewOf(kitchen).submit;
  }

  it("gives an empty kitchen its own reason, naming no body", () => {
    expect(submitOf(EMPTY)).toEqual({
      kind: "refused",
      code: "NO_CABINET",
      bodies: [],
    });
  });

  it("cannot meet an empty kitchen and an overflow at once: no body, no overflow", () => {
    expect(findOverflowingPlacementIds(EMPTY.design)).toEqual([]);
  });

  it("is a refusal of the submission and not of the review: an overflowing kitchen still shows its figure", () => {
    const view = viewOf(OVERFLOWING);

    expect(view.kind).toBe("available");
    expect(view.submit).toMatchObject({
      kind: "refused",
      code: "BODIES_PAST_WALL",
    });
  });

  it("allows the kitchen the generator composed for the room", () => {
    const generated = generatePricedKitchen({
      shape: "L",
      widthMm: 3560,
      depthMm: 2830,
      heightMm: 2600,
    });
    if (generated.kind !== "composed") throw new Error("expected a kitchen");

    expect(viewOf(generated.kitchen).submit).toEqual({ kind: "allowed" });
  });
});

describe("the sentence for each reason", () => {
  it.each(CATALOGUES)(
    "exists, apart from the others, in %s",
    (locale, messages) => {
      const reasons = contentFor(locale, messages).review.refusalReasons;
      const sentences = Object.values(reasons);

      expect(Object.keys(reasons).sort()).toEqual([
        "BODIES_PAST_WALL",
        "NO_CABINET",
        "PRICING_FAILED",
      ]);
      expect(new Set(sentences).size).toBe(sentences.length);
      for (const sentence of sentences) expect(sentence.trim()).not.toBe("");
    },
  );
});

describe("a refusal that names a body no row lists", () => {
  it("is refused loudly rather than naming fewer bodies than the query reports", () => {
    const seeded = priceAndProject(KITCHEN_L_DESIGN);
    const [first] = KITCHEN_L_DESIGN.placements;
    if (first === undefined) throw new Error("the seeded design has bodies");
    const stray: DesignPlacement = {
      ...first,
      id: "stray-body",
      alongMm: ownWallLengthMm(KITCHEN_L_DESIGN, first.wall) + 1,
    };

    expect(() =>
      viewOf({
        ...seeded,
        design: {
          ...KITCHEN_L_DESIGN,
          placements: [...KITCHEN_L_DESIGN.placements, stray],
        },
      }),
    ).toThrow(/stray-body/);
  });
});
