// **Backlog 50 / M6-AUD-008, first half: the one overlap the load and write gate cannot see.**
//
// `findWallOverlaps` groups spans by wall, and `groupSpansByWall` says why:
//
//   > "Both walls originate at the same corner and walk their own axis (§2), so the same along-wall
//   > coordinate on wall A and on wall B are two different places and are never compared."
//
// True everywhere except at the corner, where a wall-A body's **depth** is measured along wall B —
// the exact fact `along-wall-chain-shift.ts` is built on. So wall B's first several hundred
// millimetres are inside wall A's corner body, and a span recorded there overlaps a solid.
//
// **This file is a witness, not an invariant.** It pins the gap as an executable fact so that the
// wave which closes it starts from a red test rather than from a paragraph, and so nobody mistakes
// today's silence for coverage. Its assertions say "reports nothing", which is what a fix will
// break — deliberately. **Whoever adds the corner comparison should invert the second and third
// blocks rather than delete them**, and the severity that comparison reports under is the unruled
// decision backlog 50 and 51 share: a new refusal code can make an already-stored document
// unloadable, which is ADR 0052's dead link.
//
// **`alongMm` is a centre, not a left edge** — §12, and `validate-design.ts`'s own `toStoredSpan`
// and `toPlacementSpan` both read `alongMm ± widthMm / 2`. Every span below is derived through
// `spanOf` for that reason: the first version of this file did the arithmetic as though the field
// were an edge, and although the overlap it named was real, a computation on a convention the
// domain does not use cannot honestly claim to follow a fixture that moves.
//
// **The reach used is the corner body's `occupiedDepth`, not its `frameDepthMm`.** The seat is
// 560 mm and the space it fills is 630; overlap is about solid, so the larger is the honest number
// and the smaller would understate the gap by 70 mm.
import { describe, expect, it } from "vitest";

import type { Design, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
} from "../src/fixtures/kitchen-l-design.js";
import { occupiedDepthOfEntryM } from "../src/occupied-depth.js";
import { validateDesignForCatalog } from "../src/validate-design.js";

const CABINET_DEPTH_MM = 600;
const catalog = buildKitchenLBodyCatalog(CABINET_DEPTH_MM);

/** Wall A's corner body. */
const CORNER_BODY_ID = "p25";

interface SpanMm {
  readonly startMm: number;
  readonly endMm: number;
}

/** §12's convention, in one place: a run is centred on its `alongMm`. */
function spanOf(alongMm: number, widthMm: number): SpanMm {
  return { startMm: alongMm - widthMm / 2, endMm: alongMm + widthMm / 2 };
}

function overlapMmOf(left: SpanMm, right: SpanMm): number {
  return (
    Math.min(left.endMm, right.endMm) - Math.max(left.startMm, right.startMm)
  );
}

function cornerBody() {
  const placement = KITCHEN_L_DESIGN.placements.find(
    (candidate) => candidate.id === CORNER_BODY_ID,
  );
  if (!placement) throw new Error(`${CORNER_BODY_ID} left the fixture`);
  return placement;
}

/** The span the corner body occupies **on its own wall**. */
function cornerBodySpanOnWallA(): SpanMm {
  const placement = cornerBody();
  return spanOf(placement.alongMm, placement.body.widthMm);
}

/** And how far it reaches **along wall B**: the space it fills, measured from the wall plane, which
 *  starts at the shared corner — so `0 .. occupiedDepth`. */
function cornerBodyReachOnWallB(): SpanMm {
  const placement = cornerBody();
  const definition = catalog.get(placement.body.buildId);
  if (!definition)
    throw new Error(`${placement.body.buildId} left the catalogue`);
  return {
    startMm: 0,
    endMm:
      occupiedDepthOfEntryM({
        buildId: placement.body.buildId,
        definition,
      }) * 1000,
  };
}

/** A recorded space, on whichever wall, in the base band — the shape the frozen map stores and the
 *  sweep reads. */
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
    depthMm: 560,
  };
}

function designHolding(space: EmptyColumn): Design {
  return { ...KITCHEN_L_DESIGN, emptyColumns: [space] };
}

/** Inside the corner body's span on wall A but **not** on its own centre: a space sharing the body's
 *  column key is refused by a second, different code (`EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`),
 *  and a control that fired two codes would not isolate the one this file is about. */
const INSIDE_THE_CORNER_BODY_MM = 600;

describe("the same-wall sweep, which works", () => {
  const space = spaceAt("A", INSIDE_THE_CORNER_BODY_MM, 300);

  it("really puts the space inside the body, on the body's own wall", () => {
    const overlapMm = overlapMmOf(
      spanOf(space.alongMm, space.widthMm),
      cornerBodySpanOnWallA(),
    );
    expect(overlapMm).toBe(space.widthMm);
  });

  it("reports a recorded space standing where a body stands", () => {
    expect(validateDesignForCatalog(designHolding(space), catalog)).toEqual([
      { code: "EMPTY_COLUMN_OVERLAPS_PLACEMENT", path: "emptyColumns.0" },
    ]);
  });
});

describe("the corner, which it cannot see", () => {
  // The same overlap, moved to the other side of the corner. Wall B's first millimetres are
  // occupied by wall A's corner body; this space is filed under wall B and shares solid with it.
  // The only difference from the block above is which wall the span is filed under.
  const space = spaceAt("B", 300, 300);

  it("really does construct an overlap, in millimetres, before claiming one is missed", () => {
    const overlapMm = overlapMmOf(
      spanOf(space.alongMm, space.widthMm),
      cornerBodyReachOnWallB(),
    );
    // Not a rounding sliver, and not a number typed here: the whole 300 mm of the space is inside
    // the corner body's reach at this setting.
    expect(overlapMm).toBe(space.widthMm);
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
  const MOVED_ID = "p26";

  function movedOntoTheCornerBody(): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === MOVED_ID
          ? {
              ...placement,
              wall: "A" as const,
              alongMm: INSIDE_THE_CORNER_BODY_MM,
            }
          : placement,
      ),
    };
  }

  it("really does put two bodies in one span, on one wall", () => {
    // The half the first version of this block left out: without it, "reports nothing" would keep
    // passing for the wrong reason the day the fixture's widths move.
    const moved = movedOntoTheCornerBody().placements.find(
      (placement) => placement.id === MOVED_ID,
    );
    if (!moved) throw new Error(`${MOVED_ID} left the fixture`);
    const overlapMm = overlapMmOf(
      spanOf(moved.alongMm, moved.body.widthMm),
      cornerBodySpanOnWallA(),
    );
    expect(overlapMm).toBe(moved.body.widthMm);
    expect(moved.wall).toBe(cornerBody().wall);
  });

  it("says nothing about them when the document carries no frozen map", () => {
    const overlapping = movedOntoTheCornerBody();
    expect(overlapping.emptyColumns).toBeUndefined();
    expect(overlapping.columnExtents).toBeUndefined();
    expect(validateDesignForCatalog(overlapping, catalog)).toEqual([]);
  });
});
