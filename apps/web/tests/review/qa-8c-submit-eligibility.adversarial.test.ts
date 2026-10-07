// A kitchen may be submitted exactly when it prices, holds a body and the domain's query finds nothing past a
// wall; otherwise the review says which of the three, and for the last names the query's bodies.
//
// The overflowing kitchens are made the ways a kitchen comes to overflow (`varied-kitchens.ts`): a wall
// shortened under its bodies, a body widened, a body added, a hanging body alone. Which bodies are past a wall
// is the query's answer and nothing here measures one; each making only names the bodies it put there for
// certain, so a query that reported nothing would fail the sweep before the review were asked.
import {
  findOverflowingPlacementIds,
  KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
import { describePriceBar } from "@/price/price-bar-model";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import {
  describeReview,
  type RefusedSubmit,
  type ReviewView,
} from "@/review/review-model";

import { CATALOGUES, contentFor } from "../support/catalogues";
import {
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";
import {
  OVERFLOW_MAKERS,
  VARIED_ARMS,
  VARIED_U_ARM,
  variedKitchensOf,
  type OverflowMaker,
  type VariedArm,
} from "../support/varied-kitchens";

const FITTING_FLOOR_PER_ARM = 80;
const MADE_FLOOR_PER_MAKER = 80;
const AGAINST_THE_QUERYS_ORDER_FLOOR = 20;

const CONTENTS: readonly (readonly [string, Content])[] = CATALOGUES.map(
  ([locale, messages]) => [locale, contentFor(locale, messages)] as const,
);

interface MadeToOverflow {
  readonly kitchen: PricedKitchen;
  readonly mustOverflow: readonly string[];
}

function madeBy(maker: OverflowMaker, arm: VariedArm): MadeToOverflow[] {
  return variedKitchensOf(arm).flatMap((kitchen) => {
    const made = maker.make(kitchen);
    if (made === undefined) return [];
    return [
      {
        kitchen: priceAndProject(made.design),
        mustOverflow: made.mustOverflow,
      },
    ];
  });
}

function viewOf(kitchen: PricedKitchen, content: Content = ro): ReviewView {
  return describeReview({
    content,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
}

function refusalOf(kitchen: PricedKitchen, content: Content = ro) {
  const view = viewOf(kitchen, content);
  if (view.submit.kind !== "refused") throw new Error("expected a refusal");
  return view.submit;
}

function namedIdsOf(refusal: RefusedSubmit): readonly string[] {
  return refusal.bodies.map((body) => body.placementId);
}

/** The projection's own order, flattened: what "display order" means on every surface that lists bodies. */
function displayOrderOf(kitchen: PricedKitchen): readonly string[] {
  return kitchen.groups.flatMap((group) =>
    group.entries.map((entry) => entry.placementId),
  );
}

function wallOf(design: Design, placementId: string): string {
  const placement = design.placements.find(({ id }) => id === placementId);
  if (placement === undefined) throw new Error(`no placement ${placementId}`);
  return placement.wall;
}

function appliesTo(maker: OverflowMaker, arm: VariedArm): boolean {
  return variedKitchensOf(arm).some(
    (kitchen) => maker.make(kitchen) !== undefined,
  );
}

describe.each(VARIED_ARMS)("over varied $name kitchens", (arm) => {
  const fitting = variedKitchensOf(arm);

  it("allows every kitchen the generator composed, none of which the query faults", () => {
    expect(fitting.length).toBeGreaterThanOrEqual(FITTING_FLOOR_PER_ARM);
    for (const kitchen of fitting) {
      expect(findOverflowingPlacementIds(kitchen.design)).toEqual([]);
      expect(viewOf(kitchen).submit).toEqual({ kind: "allowed" });
    }
  });

  describe.each(OVERFLOW_MAKERS.filter((maker) => appliesTo(maker, arm)))(
    "with $name",
    (maker) => {
      const made = madeBy(maker, arm);

      it("makes enough kitchens, each with a body the query reports past its wall", () => {
        expect(made.length).toBeGreaterThanOrEqual(MADE_FLOOR_PER_MAKER);
        for (const { kitchen, mustOverflow } of made) {
          expect(mustOverflow.length).toBeGreaterThan(0);
          expect(findOverflowingPlacementIds(kitchen.design)).toEqual(
            expect.arrayContaining([...mustOverflow]),
          );
        }
      });

      it("refuses for bodies past a wall while still showing the review", () => {
        for (const { kitchen } of made) {
          const view = viewOf(kitchen);

          expect(view.kind).toBe("available");
          expect(view.submit).toMatchObject({
            kind: "refused",
            code: "BODIES_PAST_WALL",
          });
        }
      });

      it("names the query's bodies, all of them and no other, in the order the list shows them", () => {
        for (const { kitchen } of made) {
          const reported = new Set(findOverflowingPlacementIds(kitchen.design));

          expect(namedIdsOf(refusalOf(kitchen))).toEqual(
            displayOrderOf(kitchen).filter((id) => reported.has(id)),
          );
          expect(namedIdsOf(refusalOf(kitchen)).length).toBe(reported.size);
        }
      });

      it.each(CONTENTS)(
        "names each body in %s as its own row and the breakdown's row name it",
        (_locale, content) => {
          for (const { kitchen } of made) {
            const view = viewOf(kitchen, content);
            const breakdown = describePriceBreakdown({
              content,
              pricing: kitchen.pricing,
              groups: kitchen.groups,
            });
            if (view.kind !== "available" || breakdown.kind !== "available") {
              throw new Error("expected a review and a breakdown");
            }
            const reviewLabels = new Map(
              view.groups.flatMap((group) =>
                group.rows.map((row) => [row.key, row.label] as const),
              ),
            );
            const breakdownLabels = new Map(
              breakdown.groups.flatMap((group) =>
                group.rows.map((row) => [row.key, row.label] as const),
              ),
            );

            for (const body of refusalOf(kitchen, content).bodies) {
              expect(body.label).toBe(reviewLabels.get(body.placementId));
              expect(body.label).toBe(breakdownLabels.get(body.placementId));
              expect(body.label.trim()).not.toBe("");
            }
          }
        },
      );
    },
  );

  it("orders the named bodies as the list does where that is not the query's order of ids", () => {
    const againstTheQuery = OVERFLOW_MAKERS.flatMap((maker) =>
      madeBy(maker, arm),
    ).filter(({ kitchen }) => {
      const reported = findOverflowingPlacementIds(kitchen.design);
      const inDisplayOrder = displayOrderOf(kitchen).filter((id) =>
        reported.includes(id),
      );
      return inDisplayOrder.join() !== reported.join();
    });

    expect(againstTheQuery.length).toBeGreaterThanOrEqual(
      AGAINST_THE_QUERYS_ORDER_FLOOR,
    );
    for (const { kitchen } of againstTheQuery) {
      const named = namedIdsOf(refusalOf(kitchen));

      expect(named).not.toEqual(findOverflowingPlacementIds(kitchen.design));
      expect(named).not.toEqual([...named].sort());
    }
  });
});

function makerNamed(name: string): OverflowMaker {
  const maker = OVERFLOW_MAKERS.find((candidate) => candidate.name === name);
  if (maker === undefined) throw new Error(`no making named ${name}`);
  return maker;
}

describe("where the bodies past a wall stand", () => {
  it("names bodies on wall C of a U when wall C is the short one", () => {
    const made = madeBy(
      makerNamed("the last wall most of a body short"),
      VARIED_U_ARM,
    );

    expect(made.length).toBeGreaterThanOrEqual(MADE_FLOOR_PER_MAKER);
    for (const { kitchen } of made) {
      const walls = namedIdsOf(refusalOf(kitchen)).map((id) =>
        wallOf(kitchen.design, id),
      );

      expect(new Set(walls)).toEqual(new Set(["C"]));
    }
  });

  it("names bodies on every wall of a U, wall A's first and wall C's last, when all three are short", () => {
    const made = madeBy(makerNamed("every wall short at once"), VARIED_U_ARM);

    expect(made.length).toBeGreaterThanOrEqual(MADE_FLOOR_PER_MAKER);
    for (const { kitchen } of made) {
      const walls = namedIdsOf(refusalOf(kitchen)).map((id) =>
        wallOf(kitchen.design, id),
      );

      expect([...new Set(walls)]).toEqual(["A", "B", "C"]);
      expect(walls).toEqual([...walls].sort());
    }
  });

  it("names one hanging body and nothing beneath it when only that body is past the wall", () => {
    for (const arm of VARIED_ARMS) {
      const made = madeBy(
        makerNamed("one hanging body alone slid past its wall"),
        arm,
      );

      expect(made.length).toBeGreaterThanOrEqual(MADE_FLOOR_PER_MAKER);
      for (const { kitchen, mustOverflow } of made) {
        const hangingIds = kitchen.groups
          .filter((group) => group.band === "wall")
          .flatMap((group) => group.entries.map((entry) => entry.placementId));

        expect(namedIdsOf(refusalOf(kitchen))).toEqual(mustOverflow);
        expect(hangingIds).toEqual(expect.arrayContaining([...mustOverflow]));
      }
    }
  });

  it("names a body standing on a wall its room's shape does not have", () => {
    const [first] = KITCHEN_L_DESIGN.placements;
    if (first === undefined) throw new Error("the seeded design has bodies");
    const onAMissingWall = priceAndProject({
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === first.id ? { ...placement, wall: "C" } : placement,
      ),
    });

    expect(namedIdsOf(refusalOf(onAMissingWall))).toEqual([first.id]);
  });
});

/** A selection the book does not offer: the pricing query itself refuses, nothing is injected. */
function withAnUnofferedTier(design: Design): Design {
  return {
    ...design,
    settings: { ...design.settings, materialTierId: "material.not-offered" },
  };
}

function emptied(design: Design): Design {
  return { ...design, placements: [], emptyColumns: [], columnExtents: [] };
}

describe("when more than one reason to refuse holds", () => {
  const [fitting] = variedKitchensOf(VARIED_U_ARM);
  if (fitting === undefined) throw new Error("no U kitchen");
  const overflowing = OVERFLOW_MAKERS[0]?.make(fitting);
  if (overflowing === undefined) throw new Error("no overflowing U kitchen");

  it("states the pricing failure, and names no body, for an overflowing kitchen the book cannot price", () => {
    const unpriced = priceAndProject(withAnUnofferedTier(overflowing.design));

    expect(unpriced.pricing.ok).toBe(false);
    expect(findOverflowingPlacementIds(unpriced.design)).not.toEqual([]);
    expect(viewOf(unpriced)).toEqual({
      kind: "unavailable",
      submit: { kind: "refused", code: "PRICING_FAILED", bodies: [] },
    });
  });

  it("states the pricing failure for an empty kitchen the book cannot price", () => {
    const unpriced = priceAndProject(
      withAnUnofferedTier(emptied(fitting.design)),
    );

    expect(unpriced.pricing.ok).toBe(false);
    expect(viewOf(unpriced).submit).toEqual({
      kind: "refused",
      code: "PRICING_FAILED",
      bodies: [],
    });
  });

  it("gives an empty kitchen in a room too short for anything its own reason", () => {
    const empty = priceAndProject(emptied(overflowing.design));

    expect(viewOf(empty)).toEqual({
      kind: "unavailable",
      submit: { kind: "refused", code: "NO_CABINET", bodies: [] },
    });
  });
});

describe("the review's state beside the price bar's and the breakdown's", () => {
  const [fitting] = variedKitchensOf(VARIED_U_ARM);
  if (fitting === undefined) throw new Error("no U kitchen");
  const overflowing = OVERFLOW_MAKERS[0]?.make(fitting);
  if (overflowing === undefined) throw new Error("no overflowing U kitchen");

  const STATES = [
    ["a fitting kitchen", fitting, "priced", "available", "allowed"],
    [
      "an overflowing kitchen",
      priceAndProject(overflowing.design),
      "priced",
      "available",
      "BODIES_PAST_WALL",
    ],
    [
      "an empty kitchen",
      priceAndProject(emptied(fitting.design)),
      "empty",
      "unavailable",
      "NO_CABINET",
    ],
    [
      "a kitchen the book cannot price",
      priceAndProject(withAnUnofferedTier(fitting.design)),
      "unpriced",
      "unavailable",
      "PRICING_FAILED",
    ],
  ] as const;

  it.each(STATES)(
    "for %s: the bar is %s, the breakdown and the review %s, the submission %s",
    (_name, kitchen, barKind, listKind, submission) => {
      const view = viewOf(kitchen);
      const bar = describePriceBar({ content: ro, pricing: kitchen.pricing });
      const breakdown = describePriceBreakdown({
        content: ro,
        pricing: kitchen.pricing,
        groups: kitchen.groups,
      });

      expect(bar.kind).toBe(barKind);
      expect(breakdown.kind).toBe(listKind);
      expect(view.kind).toBe(listKind);
      expect(
        view.submit.kind === "refused" ? view.submit.code : view.submit.kind,
      ).toBe(submission);
    },
  );
});

describe("the review as a value", () => {
  function deeplyFrozen<T>(value: T): T {
    if (
      value !== null &&
      typeof value === "object" &&
      !Object.isFrozen(value)
    ) {
      Object.freeze(value);
      for (const inner of Object.values(value)) deeplyFrozen(inner);
    }
    return value;
  }

  it("changes nothing it was handed and answers the same twice", () => {
    const [kitchen] = variedKitchensOf(VARIED_U_ARM);
    if (kitchen === undefined) throw new Error("no U kitchen");
    const made = OVERFLOW_MAKERS[0]?.make(kitchen);
    if (made === undefined) throw new Error("no overflowing U kitchen");
    const frozen = deeplyFrozen(structuredClone(priceAndProject(made.design)));

    const first = viewOf(frozen);
    const second = viewOf(frozen);

    expect(second).toEqual(first);
    expect(first.submit.kind).toBe("refused");
  });
});
