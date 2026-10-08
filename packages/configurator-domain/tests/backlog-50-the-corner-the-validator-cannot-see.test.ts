// Backlog 50 / M6-AUD-008: `findWallOverlaps` never compares the same along-wall coordinate on wall A and wall B (§2),
// which is right everywhere except at the corner, where a wall-A body's depth is measured along wall B
// (`along-wall-chain-shift.ts`): wall B's first several hundred millimetres are inside wall A's corner body.
//
// The severity is `mark`: a new refusal code makes a stored document unloadable (ADR 0052, ADR 0065), so the overlap
// is reported and carried and the document still loads. Severity is declared per code (ADR 0069).
//
// The third block is a witness for a different gap: `findWallOverlaps` returns early with no frozen map, and two
// placements in one span are never named on either wall (a placement carries no reportable path, `overlapCodeFor`).
//
// `alongMm` is a centre, not a left edge (§12), so every span is derived through `spanOf`.
//
// The reach is the corner body's carcass seat (550 mm), not its occupied depth (620; 560 and 630 before ADR 0135 moved
// the joint): the 70 mm between is the leg's 20 mm behind the wall plane and its worktop's 50 mm overhang (ADR 0025).
// Against 620 the gate marks the shipped kitchen, whose two corner legs' worktops meet at the L-joint; against 550 it
// is silent there and reproduces both defects backlog 50 was opened for, as the block at the foot shows.
import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
} from "../src/fixtures/kitchen-l-design.js";
import { occupiedDepthOfEntryM } from "../src/occupied-depth.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import {
  assertDesignValidForCatalog,
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../src/validate-design.js";

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

/** And how far it reaches **along wall B**: its carcass, measured from the wall plane, which starts
 *  at the shared corner — so `0 .. seat`. */
function cornerBodyReachOnWallB(): SpanMm {
  return { startMm: 0, endMm: seatOf(cornerBody().body.buildId) };
}

/** The one crossing this file makes from a `buildId` to a distance, so every number below is the
 *  catalogue's and none is typed here. */
function seatOf(buildId: string): number {
  const definition = catalog.get(buildId);
  if (!definition) throw new Error(`${buildId} left the catalogue`);
  return definition.frameDepthMm;
}

/** A recorded space, on whichever wall, in the base band — the shape the frozen map stores and the
 *  sweep reads. */
function spaceAt(
  wall: "A" | "B" | "C",
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

/** One width for every space this file constructs, so a block that moves a space along a wall is
 *  moving one thing and not two. Wider than `NARROWEST_CATALOG_WIDTH_MM`, which the gate refuses
 *  under a different code. */
const WIDTH_OF_A_TEST_SPACE_MM = 300;

describe("the same-wall sweep, which works", () => {
  const space = spaceAt(
    "A",
    INSIDE_THE_CORNER_BODY_MM,
    WIDTH_OF_A_TEST_SPACE_MM,
  );

  // The finding below is the corner body's and no other's: the same space is reported by nothing once that body is
  // out of the design.
  it("is quiet about the same space once the body it stands in is gone", () => {
    const withoutTheCornerBody: Design = {
      ...designHolding(space),
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.id !== CORNER_BODY_ID,
      ),
    };

    expect(validateDesignForCatalog(withoutTheCornerBody, catalog)).toEqual([]);
  });

  it("reports a recorded space standing where a body stands", () => {
    expect(validateDesignForCatalog(designHolding(space), catalog)).toEqual([
      { code: "EMPTY_COLUMN_OVERLAPS_PLACEMENT", path: "emptyColumns.0" },
    ]);
  });
});

describe("the corner, which it now sees", () => {
  // The same overlap filed under wall B: its first millimetres are inside wall A's corner body.
  const space = spaceAt("B", 300, WIDTH_OF_A_TEST_SPACE_MM);

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

  it("reports the recorded space standing inside the body across the corner", () => {
    expect(validateDesignForCatalog(designHolding(space), catalog)).toEqual([
      { code: "RECORDED_SPAN_OVERLAPS_CORNER_BODY", path: "emptyColumns.0" },
    ]);
  });

  // Non-vacuity (ADR 0093): take the corner body out and the same space is reported by nothing, so the comparison
  // reads wall A's placements.
  it("goes quiet when the body it names is not in the design", () => {
    const withoutTheCornerBody: Design = {
      ...designHolding(space),
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.id !== CORNER_BODY_ID,
      ),
    };
    expect(validateDesignForCatalog(withoutTheCornerBody, catalog)).toEqual([]);
  });

  // Where the reach ends is a decision, asserted as one: the corner body has a carcass front at 550 and a corner
  // worktop at 620 (ADR 0135; 560 and 630 under ADR 0025). The gate reads the first, so the 70 mm between are outside
  // the reach: `base-corner-return-320` stands at 570, inside the worktop and clear of the carcass.
  it("takes its reach from the corner body's carcass and not from its worktop", () => {
    const definition = catalog.get(cornerBody().body.buildId);
    if (!definition) throw new Error("the corner body left the catalogue");

    // Both numbers off the catalogue, so this states the gap rather than restating either value.
    expect(cornerBodyReachOnWallB().endMm).toBe(definition.frameDepthMm);
    expect(
      occupiedDepthOfEntryM({
        buildId: cornerBody().body.buildId,
        definition,
      }) * 1000,
    ).toBeGreaterThan(cornerBodyReachOnWallB().endMm);
  });

  // The boundary: a space starting exactly where the carcass ends abuts it and is not inside it (the same `<`-not-`<=`
  // rule as the same-wall sweep), which is why the shipped corner returns report nothing.
  it("says nothing about a space that starts exactly where the carcass ends", () => {
    const reachEndMm = cornerBodyReachOnWallB().endMm;
    const abutting = spaceAt(
      "B",
      reachEndMm + WIDTH_OF_A_TEST_SPACE_MM / 2,
      WIDTH_OF_A_TEST_SPACE_MM,
    );
    expect(spanOf(abutting.alongMm, abutting.widthMm).startMm).toBe(reachEndMm);
    expect(
      validateDesignForCatalog(
        {
          ...designHolding(abutting),
          // The shipped wall-B run stands in the way of a space this far along, and a second,
          // same-wall finding would not isolate the one this block is about.
          placements: KITCHEN_L_DESIGN.placements.filter(
            (placement) => placement.wall !== "B",
          ),
        },
        catalog,
      ),
    ).toEqual([]);
  });
});

describe("and the sweep it still skips entirely", () => {
  // A second fact: `findWallOverlaps` returns early when a document carries neither `emptyColumns` nor
  // `columnExtents`, so two placements in one span are never compared on either wall. Shipped documents always carry
  // a frozen map (ADR 0090 decision 1), so this is about a hand-crafted document at the load seam.
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

  // The silence below is the early return's and not the fixture's: the sweep names the corner body under the moved
  // one the moment the same document carries a frozen extent over the moved body's own span.
  it("really does put two bodies in one span: a frozen extent over the moved one is reported against the other", () => {
    const overlapping = movedOntoTheCornerBody();
    const moved = overlapping.placements.find(
      (placement) => placement.id === MOVED_ID,
    );
    if (!moved) throw new Error(`${MOVED_ID} left the fixture`);
    const extentOfTheMovedBody: EmptyColumn = {
      wall: moved.wall,
      alongMm: moved.alongMm,
      widthMm: moved.body.widthMm,
      y0Mm: moved.y0Mm,
      topMm: moved.y0Mm + moved.body.heightMm,
      depthMm: seatOf(moved.body.buildId),
    };

    expect(
      validateDesignForCatalog(
        { ...overlapping, columnExtents: [extentOfTheMovedBody] },
        catalog,
      ),
    ).toEqual([
      { code: "COLUMN_EXTENT_OVERLAPS_PLACEMENT", path: "columnExtents.0" },
    ]);
  });

  it("says nothing about them when the document carries no frozen map", () => {
    const overlapping = movedOntoTheCornerBody();
    expect(overlapping.emptyColumns).toBeUndefined();
    expect(overlapping.columnExtents).toBeUndefined();
    expect(validateDesignForCatalog(overlapping, catalog)).toEqual([]);
  });
});

describe("and the document still loads, which is what the severity buys", () => {
  // What a severity ruling is about (ADR 0052): a new refusal code makes a stored document unloadable, so the seam
  // that throws on a bad document must not throw on this one.
  const space = spaceAt("B", 300, WIDTH_OF_A_TEST_SPACE_MM);

  it("reports the finding and carries none of it into the fatal half", () => {
    const issues = validateDesignForCatalog(designHolding(space), catalog);

    // Non-vacuity, ADR 0093: the empty list below is empty *because* the one finding present was
    // demoted, not because nothing was found.
    expect(issues.map((issue) => issue.code)).toEqual([
      "RECORDED_SPAN_OVERLAPS_CORNER_BODY",
    ]);
    expect(fatalDesignValidationIssues(issues)).toEqual([]);
  });

  it("passes the assertion the load path and the write path both run", () => {
    expect(() => {
      assertDesignValidForCatalog(designHolding(space), catalog);
    }).not.toThrow();
  });

  it("survives the whole loader, not merely the validator it ends with", () => {
    // `migrateDesign` is the seam a stored row arrives through and would throw an `InvalidDesignError` mid-hydration;
    // run at the version this build writes, so only the gate can fail.
    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      designHolding(space),
      catalog,
    );

    expect(loaded.emptyColumns).toEqual([space]);
  });
});

// The A∩C corner is swept exactly as A∩B and never merged with it (ADR 0132 D10); every design below is hand-built.
describe("the A∩C corner", () => {
  const ROOM_WIDTH_MM = 3600;
  // Centred so its mirrored span at A∩C — `W − (alongMm ± 450)` — is `[0, 900]`, exactly
  // the near corner body's span on wall A at A∩B: the far corner is the near one's mirror image.
  const FAR_CORNER_ALONG_MM = ROOM_WIDTH_MM - 450;
  const FAR_CORNER_BODY_ID = "far-corner";

  function uRoomDesign(placements: Design["placements"]): Design {
    return {
      room: {
        shape: "U",
        widthMm: ROOM_WIDTH_MM,
        depthMm: 2400,
        wallCMm: 2000,
        heightMm: 2600,
      },
      presetId: null,
      placements,
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    };
  }

  function withFarCornerBody(): DesignPlacement {
    return {
      id: FAR_CORNER_BODY_ID,
      wall: "A",
      alongMm: FAR_CORNER_ALONG_MM,
      y0Mm: 0,
      body: { buildId: "base-corner-x-900", widthMm: 900, heightMm: 820 },
    };
  }

  it("reports a wall-C space standing inside the far corner body's reach", () => {
    const space = spaceAt("C", 300, WIDTH_OF_A_TEST_SPACE_MM);
    const design: Design = {
      ...uRoomDesign([withFarCornerBody()]),
      emptyColumns: [space],
    };

    expect(validateDesignForCatalog(design, catalog)).toEqual([
      { code: "RECORDED_SPAN_OVERLAPS_CORNER_BODY", path: "emptyColumns.0" },
    ]);
  });

  it("goes quiet when the far corner body is not in the design", () => {
    const space = spaceAt("C", 300, WIDTH_OF_A_TEST_SPACE_MM);
    const design: Design = {
      ...uRoomDesign([]),
      emptyColumns: [space],
    };

    expect(validateDesignForCatalog(design, catalog)).toEqual([]);
  });

  // AC7: wall B and wall C are opposite side runs, never corner partners: shaped so a naive all-pairs sweep would flag
  // them, yet with no wall-A body to pair against nothing is reported.
  it("never compares a wall-B space against a wall-C body", () => {
    const wallBSpace = spaceAt("B", 300, WIDTH_OF_A_TEST_SPACE_MM);
    const wallCBody: DesignPlacement = {
      id: "wall-c-body",
      wall: "C",
      alongMm: 500,
      y0Mm: 0,
      body: { buildId: "base-corner-x-900", widthMm: 900, heightMm: 820 },
    };
    const design: Design = {
      ...uRoomDesign([wallCBody]),
      emptyColumns: [wallBSpace],
    };

    expect(validateDesignForCatalog(design, catalog)).toEqual([]);
  });
});

describe("the two overlaps backlog 50 was opened for, reproduced", () => {
  // The reach is the one the entry measured: entry 50's 80 mm and 31 mm overlaps (ADR 0089 decision 3) are carcass-seat
  // figures; off the occupied depths they would be 150 and 70, so a wave that changes the reach and leaves this green
  // has changed it to a number nobody measured.
  const BASE_RETURN_START_MM = 480;
  const WALL_RETURN_START_MM = 260;

  it("reproduces the wall return's 31 mm off the same reach, one band up", () => {
    // Wall A's body at the corner in the wall band, which is what the wall return stood in.
    expect(seatOf("wall-2door-600") - WALL_RETURN_START_MM).toBe(31);
  });

  it("reports a recorded space standing in either of them", () => {
    for (const band of [
      { startMm: BASE_RETURN_START_MM, widthMm: 320, y0Mm: 0, topMm: 820 },
      { startMm: WALL_RETURN_START_MM, widthMm: 570, y0Mm: 1500, topMm: 2200 },
    ]) {
      const space: EmptyColumn = {
        wall: "B",
        alongMm: band.startMm + band.widthMm / 2,
        widthMm: band.widthMm,
        y0Mm: band.y0Mm,
        topMm: band.topMm,
        // A wall-B column's own reach along wall A. It only has to be positive — wall A's corner
        // bodies both stand at coordinate 0 — but a real number keeps the fixture honest.
        depthMm: seatOf("base-corner-return-320"),
      };

      expect(
        validateDesignForCatalog(
          {
            ...designHolding(space),
            // Wall B's own run stands across both of these positions today, and a same-wall finding
            // would not isolate the one this block is about.
            placements: KITCHEN_L_DESIGN.placements.filter(
              (placement) => placement.wall !== "B",
            ),
          },
          catalog,
        ),
      ).toEqual([
        { code: "RECORDED_SPAN_OVERLAPS_CORNER_BODY", path: "emptyColumns.0" },
      ]);
    }
  });
});
