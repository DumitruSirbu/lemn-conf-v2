// Wave 6A: the one projection every surface that lists bodies reads.
//
// The failure this file exists to detect is not a wrong sort — it is a *second* sort. M6's largest
// recorded risk is the scene, the breakdown and the review summary drifting apart, so the last
// describe block names the comparator structurally rather than trusting a convention. The
// repository-wide sweep that proves no second sort exists lives in the adversarial file beside this
// one, which reads every shipped source tree rather than this package alone.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { entryLabel, labelWithDoors } from "../../src/catalog.js";

import { describeBodyLabelAt } from "../../src/catalog.js";
import type { CabinetBody, DesignPlacement } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  compareDisplayOrder,
  projectDesignForDisplay,
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

const SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
);
const PROJECTION_MODULE = path.join("queries", "design-projection.ts");

describe("the display-order comparator is the only one", () => {
  // That it is the ONLY one is swept repository-wide by `design-projection.adversarial.test.ts`,
  // across all four shipped source trees. This file keeps the half that is about this module: that
  // the projection reaches the comparator by name.
  it("is what the projection itself reaches", () => {
    // Names the comparator, so deleting it from `projectDesignForDisplay` breaks this file rather
    // than quietly leaving the surfaces to sort for themselves. Asserts on the extracted calls, so
    // a failure reads as the sort that is actually there instead of as the whole source file.
    const source = readFileSync(
      path.join(SOURCE_ROOT, PROJECTION_MODULE),
      "utf8",
    );

    expect(source.match(/\.sort\([^)]*\)/g)).toEqual([
      ".sort(compareDisplayOrder)",
    ]);
  });
});
