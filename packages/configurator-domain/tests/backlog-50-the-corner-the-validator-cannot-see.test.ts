// **Backlog 50 / M6-AUD-008, first half: the one overlap the load and write gate cannot see.**
//
// `findWallOverlaps` groups spans by wall, and `groupSpansByWall` says why:
//
//   > "Both walls originate at the same corner and walk their own axis (§2), so the same along-wall
//   > coordinate on wall A and on wall B are two different places and are never compared."
//
// True everywhere except at the corner, where a wall-A body's **depth** is measured along wall B —
// the exact fact `along-wall-chain-shift.ts` is built on. `cornerReachAlongWallMm` puts the base
// run's reach at 560 mm at a 600 mm setting, so wall B's first 560 mm are inside wall A's corner
// body, and a span recorded there overlaps a solid.
//
// **This file is a witness, not an invariant.** It pins the gap as an executable fact so that the
// wave which closes it starts from a red test rather than from a paragraph, and so nobody mistakes
// today's silence for coverage. Its assertions say "reports nothing", which is what a fix will
// break — deliberately. **Whoever adds the corner comparison should invert the second and third
// blocks rather than delete them**, and the severity that comparison reports under is the unruled
// decision backlog 50 and 51 share: a new refusal code can make an already-stored document
// unloadable, which is ADR 0052's dead link.
//
// The geometry is computed here rather than asserted as a number, so a change to the reach or to
// the fixture cannot leave this file claiming an overlap it no longer constructs.
import { describe, expect, it } from "vitest";

import { cornerReachAlongWallMm } from "../src/along-wall-chain-shift.js";
import type { Design, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
} from "../src/fixtures/kitchen-l-design.js";
import { validateDesignForCatalog } from "../src/validate-design.js";

const CABINET_DEPTH_MM = 600;
const catalog = buildKitchenLBodyCatalog(CABINET_DEPTH_MM);

/** Wall A's corner body, and the two facts this file needs about it: the span it occupies on its own
 *  wall, and how far it reaches along wall B. */
const CORNER_BODY_ID = "p25";
const CORNER_REACH_ALONG_WALL_B_MM = cornerReachAlongWallMm({
  cabinetDepthMm: CABINET_DEPTH_MM,
  chain: "base-formula",
});

function cornerBody() {
  const placement = KITCHEN_L_DESIGN.placements.find(
    (candidate) => candidate.id === CORNER_BODY_ID,
  );
  if (!placement) throw new Error(`${CORNER_BODY_ID} left the fixture`);
  return placement;
}

/** A recorded space, on whichever wall, spanning `alongMm .. alongMm + widthMm` in the base band —
 *  the same shape the frozen map stores and the sweep reads. */
function spaceAt(
  wall: "A" | "B",
  alongMm: number,
  widthMm: number,
): EmptyColumn {
  return {
    wall,
    alongMm,
    widthMm,
    y0Mm: 0,
    topMm: 820,
    depthMm: CORNER_REACH_ALONG_WALL_B_MM,
  };
}

function designHolding(space: EmptyColumn): Design {
  return { ...KITCHEN_L_DESIGN, emptyColumns: [space] };
}

describe("the same-wall sweep, which works", () => {
  it("reports a recorded space standing where a body stands", () => {
    const body = cornerBody();
    // Squarely inside the corner body's own span on wall A, so the sweep has something real to find.
    const space = spaceAt("A", body.alongMm + 150, 300);
    expect(space.alongMm).toBeGreaterThan(body.alongMm);
    expect(space.alongMm + space.widthMm).toBeLessThan(
      body.alongMm + body.body.widthMm,
    );

    expect(validateDesignForCatalog(designHolding(space), catalog)).toEqual([
      { code: "EMPTY_COLUMN_OVERLAPS_PLACEMENT", path: "emptyColumns.0" },
    ]);
  });
});

describe("the corner, which it cannot see", () => {
  // The same overlap, moved to the other side of the corner. Wall B's coordinates 0..560 are
  // occupied by wall A's corner body; this space sits at 300..600 and therefore shares 260 mm of
  // solid with it. The only difference from the block above is which wall the span is filed under.
  const space = spaceAt("B", 300, 300);
  const overlapMm =
    Math.min(space.alongMm + space.widthMm, CORNER_REACH_ALONG_WALL_B_MM) -
    space.alongMm;

  it("really does construct an overlap, in millimetres, before claiming one is missed", () => {
    expect(CORNER_REACH_ALONG_WALL_B_MM).toBeGreaterThan(space.alongMm);
    expect(overlapMm).toBeGreaterThan(0);
    // Not a rounding sliver: a quarter of a metre of shared solid.
    expect(overlapMm).toBeGreaterThanOrEqual(250);
  });

  it("reports nothing at all — the gap this file exists to pin", () => {
    expect(validateDesignForCatalog(designHolding(space), catalog)).toEqual([]);
  });
});

describe("and the sweep it skips entirely", () => {
  // A second fact, wider than backlog 50 states it and measured here: `findWallOverlaps` returns
  // early when a document carries neither `emptyColumns` nor `columnExtents`, so two **placements**
  // occupying one span are never compared — on either wall, corner or not. Shipped documents always
  // carry a frozen map (ADR 0090 decision 1, commands return it), so this is about a hand-crafted
  // document at the load seam, which is the same seam the severity ruling is about.
  it("says nothing about two bodies in one span when the document carries no frozen map", () => {
    const body = cornerBody();
    const overlapping: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p26"
          ? { ...placement, wall: "A" as const, alongMm: body.alongMm + 150 }
          : placement,
      ),
    };
    expect(overlapping.emptyColumns).toBeUndefined();
    expect(overlapping.columnExtents).toBeUndefined();
    expect(validateDesignForCatalog(overlapping, catalog)).toEqual([]);
  });
});
