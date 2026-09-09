// **Wave 6A's fifth criterion, closed.** *"Exactly one display-order comparator exists in the
// repository, and a test names it and asserts the scene and the breakdown both reach it."*
//
// It shipped met in its first half only, and the milestone records why: the first half is
// falsifiable repository-wide by a structural guard — `design-projection.adversarial.test.ts`'s
// *"finds no ordering of a body list outside the projection"*, which sweeps all four `src` roots
// including this application's — but the second half had no second surface to be about. The scene
// syncs bodies through a `Map` keyed by placement id and orders nothing; the breakdown did not
// exist. **Wave 6D is where it closes**, and this file is that close.
//
// **What "both reach it" means, stated exactly, because the two surfaces reach it differently:**
//
// - The **breakdown** reaches it by rendering `projectDesignForDisplay`'s answer verbatim. Asserted
//   below against the comparator *by name* — the projection's order is `compareDisplayOrder`'s
//   order, and the rendered order is the projection's.
// - The **scene** reaches it by mounting exactly the population the projection groups, so that the
//   one comparator is all it takes to put what the customer is looking at into the order they read
//   it in. It does not sort, and nothing here pretends it does; what would break this assertion is
//   the two surfaces coming to hold different bodies, which is the drift wave 6A exists to prevent.
//
// **Neither assertion is allowed to be vacuous**, so both are paired with the transposed comparator
// ADR 0063 rejected — along-the-wall before height. If the sweep below stopped distinguishing the
// two orders, every assertion here would be about nothing, and the counterfactual tests say so.
import {
  compareDisplayOrder,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  WORKTOP_DEPTH_MM,
  type DisplayEntry,
} from "@lemnaria/configurator-domain";
import {
  buildKitchenShell,
  makeKit,
  syncSolidBodies,
} from "@lemnaria/three-adapter";
import * as THREE from "three";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import {
  describePriceBreakdown,
  type AvailableBreakdown,
} from "@/price/price-breakdown-model";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import { ro } from "../support/romanian-content";

import { createHeadlessCanvas } from "../support/headless-canvas";

/** **The one display-order comparator**, named here rather than reimplemented, which is the whole
 *  point of the criterion. Everything below is an assertion about *this function*. */
const THE_COMPARATOR = compareDisplayOrder;

/** The order ADR 0063 rejected: the same chain with its two middle keys transposed, so each
 *  column's cabinet is followed by the box standing above it. Written out here as the
 *  **counterfactual** and nowhere else — it is not shipped source, and the repository-wide guard
 *  that forbids a second display-order comparator reads `src` roots only. It exists for the reason
 *  a counterfactual always does: a negative assertion that cannot fail proves nothing. */
const WALL_RANK: Readonly<Record<DisplayEntry["wall"], number>> = {
  A: 0,
  B: 1,
};
const BAND_RANK: Readonly<Record<DisplayEntry["band"], number>> = {
  base: 0,
  wall: 1,
  column: 2,
};

function compareColumnMajor(left: DisplayEntry, right: DisplayEntry): number {
  return (
    WALL_RANK[left.wall] - WALL_RANK[right.wall] ||
    BAND_RANK[left.band] - BAND_RANK[right.band] ||
    left.alongMm - right.alongMm ||
    left.y0Mm - right.y0Mm
  );
}

const GROUPS = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

const ENTRIES: readonly DisplayEntry[] = GROUPS.flatMap(
  (group) => group.entries,
);

function labelOf(entry: DisplayEntry): string {
  return ro.priceBreakdown.placementLabel(entry.label, entry.widthMm);
}

function breakdownView(): AvailableBreakdown {
  const view = describePriceBreakdown({
    content: ro,
    pricing: priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    }),
    groups: GROUPS,
  });
  if (view.kind !== "available")
    throw new Error("the seeded design was expected to price");
  return view;
}

/** The labels the surface actually puts on the page, in the order the markup puts them. Read from
 *  the rendered markup rather than from the view, because "a rendered order that reads column-major
 *  is a defect in 6D even though the comparator is 6A's" is a claim about the page. */
function renderedLabels(): string[] {
  const markup = renderToStaticMarkup(
    createElement(PriceBreakdownSurface, {
      id: "breakdown",
      view: breakdownView(),
      onClose: () => undefined,
    }),
  );
  return [
    ...markup.matchAll(
      /data-row="placement"[\s\S]*?data-testid="breakdown-row-label"[^>]*>(.*?)<\/span>/g,
    ),
  ].map((match) => match[1] ?? "");
}

const solidsRoot = new THREE.Group();

beforeAll(() => {
  const kit = makeKit({
    cabinetDepthMm: WORKTOP_DEPTH_MM,
    createCanvas: createHeadlessCanvas,
  });
  solidsRoot.add(buildKitchenShell(kit));
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
  });
});

/** Every mounted body, by the placement id picking climbs to. The shell's own children carry none. */
function mountedPlacementIds(): string[] {
  return solidsRoot.children
    .map((child) => child.userData.placementId as string | undefined)
    .filter((placementId): placementId is string => placementId !== undefined);
}

describe("the projection's order is the named comparator's order", () => {
  it("reproduces the projection exactly when the comparator alone is applied", () => {
    const shuffled = [...ENTRIES].reverse();

    expect(
      [...shuffled].sort(THE_COMPARATOR).map((entry) => entry.placementId),
    ).toEqual(ENTRIES.map((entry) => entry.placementId));
  });

  it("is not the order the transposed comparator produces, so the assertion above is about something", () => {
    expect(
      [...ENTRIES].sort(compareColumnMajor).map((entry) => entry.placementId),
    ).not.toEqual(ENTRIES.map((entry) => entry.placementId));
  });
});

describe("the breakdown reaches the comparator", () => {
  it("renders every placement in the comparator's order, and only those", () => {
    expect(renderedLabels()).toEqual(
      [...ENTRIES].sort(THE_COMPARATOR).map(labelOf),
    );
  });

  it("does not render the transposed order, which is what ADR 0063 rules out", () => {
    // The whole hanging row left to right, then the whole top row — not each column's cabinet
    // followed by the box above it. 6D renders 6A's order; a rendered column-major order would be a
    // defect here even with 6A's comparator untouched.
    expect(renderedLabels()).not.toEqual(
      [...ENTRIES].sort(compareColumnMajor).map(labelOf),
    );
  });

  it("reads as whole rows inside a group: the hanging row finishes before the top row starts", () => {
    // Stated on the group ADR 0063 was decided about — wall A's suspended bodies, which fold the
    // seeded top row into the hanging one and are therefore the only place the two orders are
    // visible side by side.
    const wallA = GROUPS.find(
      (group) => group.wall === "A" && group.band === "wall",
    );
    const floors = wallA?.entries.map((entry) => entry.y0Mm) ?? [];

    expect(floors).toEqual([...floors].sort((left, right) => left - right));
    expect(new Set(floors).size).toBeGreaterThan(1);
  });
});

describe("the scene reaches the same comparator", () => {
  it("mounts exactly the bodies the projection groups", () => {
    // Neither surface may hold a body the other does not: that is the drift the one projection
    // exists to make unrepresentable, and it is what would make "both reach it" false while every
    // ordering assertion above stayed green.
    expect([...mountedPlacementIds()].sort()).toEqual(
      [...ENTRIES.map((entry) => entry.placementId)].sort(),
    );
  });

  it("needs nothing but that comparator to be in the breakdown's order", () => {
    const entryById = new Map(
      ENTRIES.map((entry) => [entry.placementId, entry]),
    );
    const asMounted = mountedPlacementIds().map((placementId) => {
      const entry = entryById.get(placementId);
      if (!entry) throw new Error(`the scene mounted ${placementId} unplaced`);
      return entry;
    });

    expect([...asMounted].sort(THE_COMPARATOR).map(labelOf)).toEqual(
      renderedLabels(),
    );
  });

  it("would land somewhere else under the transposed comparator, so the convergence is the comparator's doing", () => {
    const entryById = new Map(
      ENTRIES.map((entry) => [entry.placementId, entry]),
    );
    const asMounted = mountedPlacementIds().map((placementId) => {
      const entry = entryById.get(placementId);
      if (!entry) throw new Error(`the scene mounted ${placementId} unplaced`);
      return entry;
    });

    expect([...asMounted].sort(compareColumnMajor).map(labelOf)).not.toEqual(
      renderedLabels(),
    );
  });
});
