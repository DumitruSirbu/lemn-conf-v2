// Wave H1b item (0): a review row names the handle its body wears, resolved as the price and the scene resolve it
// (its own, else the kitchen's below the top row, else steel; the top row is push-to-open), so the review never
// omits a handle the price bills a latch for. The words are the panel's, from the catalogue.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  countHardwareMechanisms,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  KITCHEN_L_DESIGN,
  type Design,
  type DisplayEntry,
  type Handle,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeReview, type AvailableReview } from "@/review/review-model";

import roMessages from "../../src/messages/ro.json";
import { contentFor } from "../support/catalogues";
import { priceAndProject } from "../support/generated-kitchens";

const HANDLE_WORDS = roMessages.panel.handleLabels;
const ALL_HANDLE_WORDS: readonly string[] = Object.values(HANDLE_WORDS);
const KITCHEN_HANDLES: readonly Handle[] = ["steel", "black", "push"];

/** Bodies of the seeded kitchen by kind (none chose a handle), each named with its build and floor. */
const BELOW_TOP_ROW_TAKING_A_HANDLE = "p0"; // base-sink-800, y0 0
const TOP_ROW_TAKING_A_HANDLE = "p15"; // wall-2door-600-top, y0 2200
const TOP_ROW_TAKING_NONE = "p21"; // wall-corner-return-570-top, y0 2200
const BELOW_TOP_ROW_TAKING_NONE = "p25"; // base-corner-x-900, y0 0

function withKitchenHandle(design: Design, handle: Handle): Design {
  return { ...design, settings: { ...design.settings, handle } };
}

function withOwnHandle(design: Design, id: string, handle: Handle): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id
        ? { ...placement, body: { ...placement.body, handle } }
        : placement,
    ),
  };
}

function reviewOf(design: Design): AvailableReview {
  const view = describeReview({
    content: contentFor("ro", roMessages),
    ...priceAndProject(design),
  });
  if (view.kind !== "available") throw new Error("the kitchen has no review");
  return view;
}

/** The handle words a row's second line carries: the width and the finish are not among them. */
function handleFactsOf(design: Design, id: string): readonly string[] {
  const detail = reviewOf(design).rowDetails[id];
  if (detail === undefined) throw new Error(`no row detail for ${id}`);
  return detail.facts.filter((fact) => ALL_HANDLE_WORDS.includes(fact));
}

describe("a body that chose no handle", () => {
  it("reads steel when the kitchen has no handle either", () => {
    expect(
      handleFactsOf(KITCHEN_L_DESIGN, BELOW_TOP_ROW_TAKING_A_HANDLE),
    ).toEqual([HANDLE_WORDS.steel]);
  });

  it.each(KITCHEN_HANDLES)("reads the kitchen's handle, %s", (kitchen) => {
    const design = withKitchenHandle(KITCHEN_L_DESIGN, kitchen);

    expect(handleFactsOf(design, BELOW_TOP_ROW_TAKING_A_HANDLE)).toEqual([
      HANDLE_WORDS[kitchen],
    ]);
  });
});

describe("a body with a handle of its own", () => {
  it.each(KITCHEN_HANDLES)(
    "keeps it under a kitchen that is not push-to-open and under one that is (kitchen: %s)",
    (kitchen) => {
      const design = withOwnHandle(
        withKitchenHandle(KITCHEN_L_DESIGN, kitchen),
        BELOW_TOP_ROW_TAKING_A_HANDLE,
        "black",
      );

      expect(handleFactsOf(design, BELOW_TOP_ROW_TAKING_A_HANDLE)).toEqual([
        HANDLE_WORDS.black,
      ]);
    },
  );
});

describe("a body on the top row", () => {
  it.each(KITCHEN_HANDLES)(
    "reads push-to-open under every kitchen handle, %s",
    (kitchen) => {
      const design = withKitchenHandle(KITCHEN_L_DESIGN, kitchen);

      expect(handleFactsOf(design, TOP_ROW_TAKING_A_HANDLE)).toEqual([
        HANDLE_WORDS.push,
      ]);
    },
  );

  it("reads push-to-open although its definition takes no handle, because the price bills it a latch", () => {
    expect(handleFactsOf(KITCHEN_L_DESIGN, TOP_ROW_TAKING_NONE)).toEqual([
      HANDLE_WORDS.push,
    ]);
  });

  it("keeps a handle of its own", () => {
    const design = withOwnHandle(
      KITCHEN_L_DESIGN,
      TOP_ROW_TAKING_A_HANDLE,
      "steel",
    );

    expect(handleFactsOf(design, TOP_ROW_TAKING_A_HANDLE)).toEqual([
      HANDLE_WORDS.steel,
    ]);
  });
});

describe("a body below the top row whose definition takes no handle", () => {
  it.each(KITCHEN_HANDLES)(
    "names none under the kitchen handle %s, though one is recorded on it",
    (kitchen) => {
      const design = withOwnHandle(
        withKitchenHandle(KITCHEN_L_DESIGN, kitchen),
        BELOW_TOP_ROW_TAKING_NONE,
        "black",
      );

      expect(handleFactsOf(design, BELOW_TOP_ROW_TAKING_NONE)).toEqual([]);
    },
  );
});

/** Latches the review's rows imply: one per opening front on each row that reads push-to-open. */
function latchesTheReviewImplies(design: Design): number {
  const { groups } = priceAndProject(design);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const review = reviewOf(design);
  return groups
    .flatMap((group) => group.entries)
    .filter((entry) =>
      review.rowDetails[entry.placementId]?.facts.includes(HANDLE_WORDS.push),
    )
    .reduce((total, entry) => total + openingFrontsOf(entry, catalog), 0);
}

function openingFrontsOf(
  entry: DisplayEntry,
  catalog: ReturnType<typeof buildKitchenLBodyCatalog>,
): number {
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length + drawerCount(query);
}

/** The latches the price bills: the count `priceDesign` multiplies by the book's rate. */
function latchesThePriceBills(design: Design): number {
  const { groups } = priceAndProject(design);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return countHardwareMechanisms(
    groups.flatMap((group) => group.entries),
    catalog,
  ).pushToOpen;
}

describe("the review against the price's latch count", () => {
  const MIXED_OWN_HANDLES: Readonly<Record<string, Handle>> = {
    p0: "push",
    p1: "black",
    p2: "steel",
    p8: "push",
    p10: "black",
    p15: "steel",
  };
  const mixed = Object.entries(MIXED_OWN_HANDLES).reduce(
    (design, [id, handle]) => withOwnHandle(design, id, handle),
    KITCHEN_L_DESIGN,
  );

  it.each([undefined, ...KITCHEN_HANDLES])(
    "implies exactly the latches the price bills, on a mixed design under kitchen handle %s",
    (kitchen) => {
      const design =
        kitchen === undefined ? mixed : withKitchenHandle(mixed, kitchen);

      expect(latchesTheReviewImplies(design)).toBe(
        latchesThePriceBills(design),
      );
    },
  );

  it("is not vacuous: the count moves with the kitchen handle and with the bodies' own", () => {
    const counts = new Set(
      KITCHEN_HANDLES.map((kitchen) =>
        latchesThePriceBills(withKitchenHandle(mixed, kitchen)),
      ),
    );

    expect(counts.size).toBeGreaterThan(1);
    expect(latchesThePriceBills(mixed)).not.toBe(
      latchesThePriceBills(KITCHEN_L_DESIGN),
    );
  });
});
