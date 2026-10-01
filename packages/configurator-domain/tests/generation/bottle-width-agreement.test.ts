// The U reads the bottle's width from the catalogue (`declaredColumnSizes`), and the L composes it from
// a literal in `optional-run-items.ts`. Two sources for one figure, and nothing else compares them: this
// pins that they cannot drift apart silently. The L's side is read off a plan the L composer made, so
// the figure it is compared against is the one the L actually places.
import { describe, expect, it } from "vitest";

import {
  BOTTLE_CARGO_BUILD_ID,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { DECLARED_COLUMNS } from "../support/u-plan-fixtures.js";

const L_WALL_A_MM = [3000, 3600, 4200, 4800, 5400, 6000];
const L_WALL_B_MM = [2100, 2600, 3000, 3500, 4000, 5000];

function lRooms(): readonly DesignRoom[] {
  return L_WALL_A_MM.flatMap((widthMm) =>
    L_WALL_B_MM.map(
      (depthMm): DesignRoom => ({
        shape: "L",
        widthMm,
        depthMm,
        heightMm: 2600,
      }),
    ),
  );
}

function bottlesTheLComposes(): readonly PlannedGenerationBase[] {
  return lRooms().flatMap((room) =>
    planKitchenComposition({
      room,
      runs: lShellFloorRuns(room),
      columns: DECLARED_COLUMNS,
    }).bases.filter((base) => base.buildId === BOTTLE_CARGO_BUILD_ID),
  );
}

describe("the bottle's width has two sources, and they agree", () => {
  it("the width the L places is the width the catalogue declares for the U", () => {
    const bottles = bottlesTheLComposes();

    expect(bottles.length).toBeGreaterThan(0);
    expect(new Set(bottles.map((base) => base.widthMm))).toStrictEqual(
      new Set([DECLARED_COLUMNS.bottleWidthMm]),
    );
  });
});
