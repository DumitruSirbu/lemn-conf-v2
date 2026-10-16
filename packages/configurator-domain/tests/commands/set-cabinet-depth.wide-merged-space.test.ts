// 8U §12 (ADR 0088, 0090): a depth change over a merged 1800 mm space slides it on the chain of its template, the
// leftmost of its shallowest members (ADR 0079 decision 7), and keeps it one space.
//
// The three stored spaces are equally deep and declare two chains 30 mm apart at 700 (the leftmost `base-formula`,
// the other two `wall-map`), so the template is the only thing that decides where the space lands.
// R6, through a mocked copy of the merge: the template taken from the rightmost of equal depths turns it red.
import { describe, expect, it } from "vitest";

import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import {
  DesignSchema,
  type Design,
  type EmptyColumn,
} from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const NOW = "2026-10-16T12:00:00.000Z";
const DEEP_MM = 700;
const BASE_FORMULA_SOURCE = "wall-2door-600-deep-top";
const WALL_MAP_SOURCE = "wall-corner-return-570-top";
/** `base-formula`'s slide from 600 to 700 on wall B (`set-cabinet-depth.frozen-map.test.ts`). */
const BASE_FORMULA_SLIDE_MM = 100;
const MERGED_CENTRE_MM = 1900;

describe("a depth change over a merged 1800 mm top-row space on wall B (8U §12)", () => {
  it("records one 1800 mm space, slid on its leftmost member's chain and carrying its source", () => {
    const result = setCabinetDepth({
      design: designWithThreeTopRowSpaces(),
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: DEEP_MM,
      probeAt: createFakeProbeFactory(),
      occurredAt: NOW,
    });
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);

    expect(
      result.design.emptyColumns?.map(
        ({ wall, alongMm, widthMm, depthFromBuildId }) => ({
          wall,
          alongMm,
          widthMm,
          depthFromBuildId,
        }),
      ),
    ).toEqual([
      {
        wall: "B",
        alongMm: MERGED_CENTRE_MM + BASE_FORMULA_SLIDE_MM,
        widthMm: 1800,
        depthFromBuildId: BASE_FORMULA_SOURCE,
      },
    ]);
  });
});

/** Three abutting 600 mm top-row spaces at 1000-2800 on wall B, equally deep, the leftmost declaring the other chain. */
function designWithThreeTopRowSpaces(): Design {
  const sources = [BASE_FORMULA_SOURCE, WALL_MAP_SOURCE, WALL_MAP_SOURCE];
  return DesignSchema.parse({
    room: { shape: "L", widthMm: 4200, depthMm: 4000, heightMm: 2600 },
    presetId: null,
    placements: [],
    emptyColumns: sources.map(
      (depthFromBuildId, index): EmptyColumn => ({
        wall: "B",
        alongMm: 1300 + 600 * index,
        widthMm: 600,
        y0Mm: 2200,
        topMm: 2600,
        depthMm: 600,
        depthFromBuildId,
      }),
    ),
    createdAt: NOW,
    updatedAt: NOW,
  });
}
