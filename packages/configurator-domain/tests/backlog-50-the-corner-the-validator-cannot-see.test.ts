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
// **It was a witness until 2026-09-09, and the second block below is now an invariant.** It pinned
// the gap as an executable fact so that the wave closing it would start from a red test rather than
// from a paragraph; that wave added `findCornerOverlaps` and `RECORDED_SPAN_OVERLAPS_CORNER_BODY`,
// so the assertion that used to read "reports nothing" was inverted rather than deleted — it is the
// same document and the same arithmetic, and only the expected answer moved.
//
// **The severity is `mark`, ruled by the owner on 2026-09-09** for the reason `PLACEMENT_PAST_WALL_END`
// is one (ADR 0065): a new refusal code makes an already-stored document unloadable, which is
// ADR 0052's dead link. The overlap is reported and carried, the document still loads, and nothing
// is moved out from under the customer. Severity is declared per code (ADR 0069).
//
// **The third block is still a witness**, and deliberately so: it records a *different* gap —
// `findWallOverlaps` returns early when the document carries no frozen map at all, and two
// **placements** in one span are never named on either wall. The corner comparison does not close
// it and was not asked to: a placement carries no reportable path (`overlapCodeFor`), and backlog 50
// records that second fact as wider than the entry itself.
//
// **`alongMm` is a centre, not a left edge** — §12, and `validate-design.ts`'s own `toStoredSpan`
// and `toPlacementSpan` both read `alongMm ± widthMm / 2`. Every span below is derived through
// `spanOf` for that reason: the first version of this file did the arithmetic as though the field
// were an edge, and although the overlap it named was real, a computation on a convention the
// domain does not use cannot honestly claim to follow a fixture that moves.
//
// **The reach used is the corner body's carcass seat, not the space it fills** — ruled 2026-09-09,
// against this file's own first answer. The seat is 560 mm and the occupied depth is 630, and the
// 70 mm between them is `base-corner-x-900`'s corner worktop (ADR 0025). Measured against 630 the
// gate marks the **shipped** kitchen, whose two corner legs share 50 mm of plan area because their
// worktops meet at the L-joint; measured against 560 it is silent there and reproduces both defects
// backlog 50 was opened for, to the millimetre. The block at the foot of this file is that
// reproduction, and it is the reason the number is what it is.
import { describe, expect, it } from "vitest";

import type { Design, EmptyColumn } from "../src/design.js";
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
  DESIGN_ISSUE_SEVERITY_BY_CODE,
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

/** The span the corner body occupies **on its own wall**. */
function cornerBodySpanOnWallA(): SpanMm {
  const placement = cornerBody();
  return spanOf(placement.alongMm, placement.body.widthMm);
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

describe("the corner, which it now sees", () => {
  // The same overlap, moved to the other side of the corner. Wall B's first millimetres are
  // occupied by wall A's corner body; this space is filed under wall B and shares solid with it.
  // The only difference from the block above is which wall the span is filed under.
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

  // Non-vacuity, ADR 0093: the finding above has to be *about* the corner body. Take that body out
  // of the design and the same space on the same wall at the same height is reported by nothing —
  // so the comparison is reading wall A's placements and not merely firing on a wall-B entry.
  it("goes quiet when the body it names is not in the design", () => {
    const withoutTheCornerBody: Design = {
      ...designHolding(space),
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.id !== CORNER_BODY_ID,
      ),
    };
    expect(validateDesignForCatalog(withoutTheCornerBody, catalog)).toEqual([]);
  });

  // **Where the reach ends is a decision, so it is asserted as one rather than left as a number
  // that happened to change.** The corner body has two fronts: its carcass at 560 and its corner
  // worktop at 630, ten millimetres further than a straight run's slab reaches (ADR 0025). The gate
  // reads the first. The seventy millimetres between them are deliberately **outside** the reach,
  // because the shipped kitchen puts `base-corner-return-320` at 580 — inside the worktop and clear
  // of the carcass — and two worktop slabs meeting at an L-joint is what a corner is, not a finding.
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

  // And the boundary that reach is: a space starting exactly where the carcass ends abuts it and is
  // not inside it — the same `<`-not-`<=` rule the same-wall sweep uses, and the reason the shipped
  // corner returns report nothing. It stands inside the worktop line and is still silent, which is
  // the ruling above with a document behind it.
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

describe("and the document still loads, which is what the severity buys", () => {
  // **The half a severity ruling is actually about** (ADR 0052): a new *refusal* code makes an
  // already-stored document unloadable, and a customer whose saved kitchen stops opening has lost
  // it. So the proof this wave owes is not that the code exists — it is that the seam which throws
  // on a bad document does not throw on this one.
  const space = spaceAt("B", 300, WIDTH_OF_A_TEST_SPACE_MM);

  it("declares the code a mark, per code, as ADR 0069 requires", () => {
    expect(
      DESIGN_ISSUE_SEVERITY_BY_CODE.RECORDED_SPAN_OVERLAPS_CORNER_BODY,
    ).toBe("mark");
  });

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
    // `migrateDesign` is the seam a stored row actually arrives through, and it is what would throw
    // an `InvalidDesignError` mid-hydration. Run at the version this build writes, so the document
    // takes no migration arm and the only thing it can fail on is the gate this wave changed.
    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      designHolding(space),
      catalog,
    );

    expect(loaded.emptyColumns).toEqual([space]);
  });
});

describe("the two overlaps backlog 50 was opened for, reproduced", () => {
  // **The check that the reach is the one the entry measured**, and the reason the seat won the
  // 2026-09-09 ruling. Entry 50 records the pre-6J-c geometry as `base-corner-return-320` overlapping
  // wall A's corner by **80 mm** and `wall-corner-return-570` by **31 mm** (ADR 0089 decision 3, at
  // `14cef90`). Both fall straight out of the carcass seats the gate now reads. Off the occupied
  // depths they would have been 150 and 70, and the entry does not say that — so a wave that changes
  // the reach and leaves this block green has changed it to a number nobody measured.
  const BASE_RETURN_START_MM = 480;
  const WALL_RETURN_START_MM = 260;

  it("reproduces the base return's 80 mm off the reach the gate reads", () => {
    expect(seatOf("base-corner-x-900") - BASE_RETURN_START_MM).toBe(80);
  });

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
