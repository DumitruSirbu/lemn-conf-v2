// Wave 6A: the one projection every surface that lists bodies reads.
//
// The failure this file exists to detect is not a wrong sort — it is a *second* sort. M6's largest
// recorded risk is the scene, the breakdown and the review summary drifting apart, so the last
// describe block names the comparator structurally rather than trusting a convention. The
// repository-wide sweep that proves no second sort exists lives in the adversarial file beside this
// one, which reads every shipped source tree rather than this package alone.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { entryLabel, labelWithDoors } from "../../src/catalog.js";

import { describeBodyLabelAt } from "../../src/catalog.js";
import type { CabinetBody, DesignPlacement } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  compareDisplayOrder,
  projectDesignForDisplay,
  type DisplayEntry,
} from "../../src/queries/design-projection.js";
import {
  bodyOf,
  designOf,
  headingsOf,
  PROJECTION_CATALOG as CATALOG,
} from "../support/display-projection.js";

/** A placement of an entry the customer can actually insert, so the width is free to move. */
function placedAt(
  overrides: Omit<Partial<DesignPlacement>, "body"> & {
    readonly id: string;
    readonly body?: Partial<CabinetBody>;
  },
): DesignPlacement {
  return {
    wall: "A",
    alongMm: 1300,
    y0Mm: 1500,
    ...overrides,
    body: {
      buildId: "wall-cabinet",
      widthMm: 600,
      heightMm: 700,
      ...overrides.body,
    },
  };
}

describe("projectDesignForDisplay grouping", () => {
  it("orders the seeded kitchen wall, then band, then along the wall", () => {
    const groups = projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG);

    expect(headingsOf(groups)).toEqual([
      "A·base",
      "A·wall",
      "B·base",
      "B·wall",
      "B·column",
    ]);
  });

  it("orders each group along its wall, from the corner outwards", () => {
    const groups = projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG);
    const baseA = groups.find(
      (group) => group.wall === "A" && group.band === "base",
    );

    expect(baseA?.entries.map((entry) => entry.alongMm)).toEqual([
      450, 1300, 2000, 2600, 3200,
    ]);
  });

  it("folds the seeded top row into its wall's suspended group", () => {
    const groups = projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG);
    const wallA = groups.find(
      (group) => group.wall === "A" && group.band === "wall",
    );

    // `p8` is a `wall-2door-600` and `p15` a `wall-2door-600-top`, so their raw bands differ and
    // both stand at 300 mm along wall A: the group holds both rows, and ADR 0063's order reads the
    // hanging row whole before the top row rather than pairing each cabinet with the box above it.
    expect(wallA?.entries.map((entry) => entry.placementId)).toEqual([
      "p8",
      "p10",
      "p11",
      "p12",
      "p13",
      "p14",
      "p15",
      "p16",
      "p17",
      "p18",
      "p19",
      "p20",
    ]);
    expect(groups.every((group) => group.band !== ("top" as never))).toBe(true);
  });
});

// M7B U1 slice S4: wall C's display rank, set alongside A and B in S1 and confirmed here — the
// reading order the mockup counts in (ADR 0132 decision 1: A, then B, then C).
describe("compareDisplayOrder — wall rank (ADR 0132 decision 1)", () => {
  function entryOn(wall: DesignPlacement["wall"]): DisplayEntry {
    return {
      placementId: "p0",
      buildId: "wall-cabinet",
      label: { kind: "entry", buildId: "wall-cabinet" },
      wall,
      band: "wall",
      rawBand: "wall",
      alongMm: 0,
      y0Mm: 0,
      widthMm: 600,
      heightMm: 700,
    };
  }

  it("ranks wall A before wall B before wall C", () => {
    const a = entryOn("A");
    const b = entryOn("B");
    const c = entryOn("C");

    expect(compareDisplayOrder(a, b)).toBeLessThan(0);
    expect(compareDisplayOrder(b, c)).toBeLessThan(0);
    expect(compareDisplayOrder(a, c)).toBeLessThan(0);
    expect(compareDisplayOrder(c, a)).toBeGreaterThan(0);
  });
});

describe("projectDesignForDisplay labels", () => {
  it("derives every label through describeBodyLabelAt", () => {
    const groups = projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG);
    const entries = groups.flatMap((group) => group.entries);

    expect(entries).not.toHaveLength(0);
    for (const entry of entries) {
      expect(entry.label).toEqual(
        describeBodyLabelAt(bodyOf(entry.buildId), entry.widthMm),
      );
    }
  });

  it("reads a resized hinged cabinet at the width it now has, as the panel header does", () => {
    // Backlog entry 20: a resize rewrites the width, not the entry. The projection and the panel
    // header must therefore reach the same door count, or the two have already diverged.
    const narrow = designOf([placedAt({ id: "x", body: { widthMm: 400 } })]);
    const wide = designOf([placedAt({ id: "x", body: { widthMm: 600 } })]);

    expect(
      projectDesignForDisplay(narrow, CATALOG)[0]?.entries[0]?.label,
    ).toEqual(labelWithDoors(entryLabel("wall-cabinet"), 1));
    expect(
      projectDesignForDisplay(wide, CATALOG)[0]?.entries[0]?.label,
    ).toEqual(labelWithDoors(entryLabel("wall-cabinet"), 2));
  });
});

describe("projectDesignForDisplay is a function of the design, not of its array order", () => {
  const expected = projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG);

  propertyTest.prop([
    fc.shuffledSubarray(KITCHEN_L_DESIGN.placements, {
      minLength: KITCHEN_L_DESIGN.placements.length,
    }),
  ])("projects any permutation of the placements identically", (permuted) => {
    expect(projectDesignForDisplay(designOf(permuted), CATALOG)).toEqual(
      expected,
    );
  });

  propertyTest.prop([
    fc.shuffledSubarray(KITCHEN_L_DESIGN.placements, {
      minLength: KITCHEN_L_DESIGN.placements.length,
    }),
  ])(
    "orders two placements the same way whichever side they arrive on",
    (permuted) => {
      // The comparator is total, so no pair ever compares equal — that is what makes the permutation
      // invariance above hold rather than merely pass on this fixture.
      const entries = projectDesignForDisplay(
        designOf(permuted),
        CATALOG,
      ).flatMap((group) => group.entries);
      for (const [index, entry] of entries.entries()) {
        for (const other of entries.slice(index + 1)) {
          expect(compareDisplayOrder(entry, other)).toBeLessThan(0);
          expect(compareDisplayOrder(other, entry)).toBeGreaterThan(0);
        }
      }
    },
  );
});

describe("the display-order comparator is the only one", () => {
  // That it is the ONLY one is swept repository-wide by `design-projection.adversarial.test.ts`,
  // across all four shipped source trees. This file keeps the half that is about this module: that
  // the projection orders by it, whatever order the document holds its placements in.
  it("is what the projection itself reaches", () => {
    const reversed = {
      ...KITCHEN_L_DESIGN,
      placements: [...KITCHEN_L_DESIGN.placements].reverse(),
    };
    const idsOf = (design: typeof KITCHEN_L_DESIGN) =>
      projectDesignForDisplay(design, CATALOG).map((group) =>
        group.entries.map((entry) => entry.placementId),
      );

    for (const group of projectDesignForDisplay(reversed, CATALOG)) {
      expect(group.entries).toEqual(
        [...group.entries].sort(compareDisplayOrder),
      );
    }
    expect(idsOf(reversed)).toEqual(idsOf(KITCHEN_L_DESIGN));
    expect(idsOf(reversed).flat()).toHaveLength(
      KITCHEN_L_DESIGN.placements.length,
    );
  });
});
