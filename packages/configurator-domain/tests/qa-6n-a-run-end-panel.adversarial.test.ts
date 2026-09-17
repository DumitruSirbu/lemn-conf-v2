// Wave 6N-a, adversarial: the halves of `runEndPanelSeatM` that a value-preserving move leaves
// unguarded. `run-end-panel.test.ts` pins the shipped numbers and the veto's two axes; everything
// here is a mutant that survived that suite and the whole 4162-test tree.
//
// Three clauses of the rule carry a documented intent that nothing asserted: `blocksSeat`'s
// `record.wall !== "A"` filter, the touching tolerance on the *second* half of `overlaps`, and the
// vertical interval's own boundary above and below 820 mm. Each is exercised here by the case that
// separates it from its negation, not by the shipped kitchen — which agrees with every one of them.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_HEIGHT_M,
  RUN_END_PANEL_THICKNESS_M,
  runEndPanelSeatM,
} from "../src/run-end-panel.js";
import { type DesignRoom, type DesignWall } from "../src/design.js";
import { MAX_ROOM_WIDTH_MM } from "../src/design-bounds.js";
import {
  derivePlacementRecords,
  type Band,
  type PlacementRecord,
} from "../src/void-engine.js";

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

/** The room those records stand in: every seeded-based case below ends its run inside it. */
const SEEDED_ROOM = KITCHEN_L_DESIGN.room;

/** A wall A twice as long as any a design can store, so no run this file sweeps comes near its end.
 *  These cases pin the seat's arithmetic and the column veto at every run length; the wall-end veto
 *  (ADR 0045 Amendment A) has its own cases in `run-end-panel.test.ts`. */
const WALL_A_PAST_EVERY_RUN: DesignRoom = {
  ...SEEDED_ROOM,
  widthMm: MAX_ROOM_WIDTH_MM * 2,
};

/** `p4` — `base-drawer3-600` at 3200 — is the right-most wall-A base placement. */
const RIGHT_MOST_BASE = requireRecord("p4");
const RUN_END_M = RIGHT_MOST_BASE.frame.x + RIGHT_MOST_BASE.frame.w / 2;
const SEEDED_SEAT_M = requireSeatM(SEEDED_RECORDS, SEEDED_ROOM);

/** The panel's own along-wall interval, which is what `blocksSeat` tests a body against. */
const SEAT_INNER_FACE_M = SEEDED_SEAT_M - RUN_END_PANEL_THICKNESS_M / 2;

/** Half of the rule's 1e-6 m float-artefact allowance: inside it, two faces touch. */
const WITHIN_TOLERANCE_M = 5e-7;

/** Ten microns — an order of magnitude outside the allowance, so it is an intersection. */
const PAST_TOLERANCE_M = 1e-5;

function requireRecord(id: string): PlacementRecord {
  const record = SEEDED_RECORDS.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`no seeded record ${id}`);
  return record;
}

function requireSeatM(
  records: readonly PlacementRecord[],
  room: DesignRoom,
): number {
  const seatM = runEndPanelSeatM(records, room);
  if (seatM === undefined) throw new Error("expected a visible panel");
  return seatM;
}

interface BodyPlacement {
  readonly wall: DesignWall;
  readonly band: Band;
  readonly leftEdgeM: number;
  readonly y0M: number;
  readonly heightM: number;
  readonly widthM?: number;
}

/** A body placed by its *left* edge rather than its centre, so a case can be written in terms of
 *  the face that meets the panel. Every other field is the seeded drawer unit's. */
function bodyAt(placement: BodyPlacement): PlacementRecord {
  const widthM = placement.widthM ?? RIGHT_MOST_BASE.frame.w;
  return {
    ...RIGHT_MOST_BASE,
    id: [
      "probe",
      placement.wall,
      placement.band,
      String(placement.leftEdgeM),
      String(placement.y0M),
      String(placement.heightM),
    ].join("-"),
    wall: placement.wall,
    band: placement.band,
    heightMm: placement.heightM * 1000,
    widthMm: widthM * 1000,
    frame: {
      ...RIGHT_MOST_BASE.frame,
      x: placement.leftEdgeM + widthM / 2,
      y0: placement.y0M,
      h: placement.heightM,
      w: widthM,
    },
  };
}

function seatWith(...extras: readonly PlacementRecord[]): number | undefined {
  return runEndPanelSeatM([...SEEDED_RECORDS, ...extras], SEEDED_ROOM);
}

describe("only wall A's own bodies contest wall A's seat", () => {
  // A wall-B body at 3.51 m along wall B is reachable: `MAX_ROOM_DEPTH_MM` is 6300, so wall B can
  // be more than twice as long as the seeded 2920 mm room's. Dropping the `wall` filter in the veto
  // would hide wall A's finished end for a column standing on the opposite wall.
  const VETOING_BANDS: readonly Band[] = ["column", "wall", "top"];

  it.each(VETOING_BANDS)(
    "keeps the panel when a wall-B %s body stands on the same along-wall coordinate",
    (band) => {
      const onWallB = bodyAt({
        wall: "B",
        band,
        leftEdgeM: RUN_END_M,
        y0M: 0,
        heightM: 2.2,
      });

      expect(seatWith(onWallB)).toBe(SEEDED_SEAT_M);
    },
  );

  /** Wall B carries no finished end of its own, and its run is not wall A's: a longer base run on
   *  wall B must not drag wall A's panel along it. */
  it("does not move the panel when wall B's base run reaches further than wall A's", () => {
    const longWallBRun = bodyAt({
      wall: "B",
      band: "base",
      leftEdgeM: RUN_END_M + 1,
      y0M: 0,
      heightM: 0.82,
    });

    expect(seatWith(longWallBRun)).toBe(SEEDED_SEAT_M);
  });
});

describe("the touching tolerance holds at both faces of the seat", () => {
  /** The seat's *inner* face, which `run-end-panel.test.ts` does not reach: its probes all sit to
   *  the right of the panel and so only ever exercise the first half of `overlaps`. A tolerance
   *  present on one half and absent on the other passes every other test in the tree. */
  function columnEndingAt(rightEdgeM: number): PlacementRecord {
    const widthM = RIGHT_MOST_BASE.frame.w;
    return bodyAt({
      wall: "A",
      band: "column",
      leftEdgeM: rightEdgeM - widthM,
      y0M: 0,
      heightM: 2.2,
      widthM,
    });
  }

  it("keeps the panel for a column touching the inner face within tolerance", () => {
    const touching = columnEndingAt(SEAT_INNER_FACE_M + WITHIN_TOLERANCE_M);

    expect(seatWith(touching)).toBe(SEEDED_SEAT_M);
  });

  it("hides the panel for a column ten microns past the inner face", () => {
    const overlapping = columnEndingAt(SEAT_INNER_FACE_M + PAST_TOLERANCE_M);

    expect(seatWith(overlapping)).toBeUndefined();
  });
});

describe("the veto's vertical boundary at the panel's top edge", () => {
  function columnFromTheFloor(heightM: number): PlacementRecord {
    return bodyAt({
      wall: "A",
      band: "column",
      leftEdgeM: RUN_END_M,
      y0M: 0,
      heightM,
    });
  }

  function bodyHangingFrom(y0M: number): PlacementRecord {
    return bodyAt({
      wall: "A",
      band: "column",
      leftEdgeM: RUN_END_M,
      y0M,
      heightM: 1.2,
    });
  }

  it("hides the panel behind a column exactly the panel's own height", () => {
    expect(
      seatWith(columnFromTheFloor(RUN_END_PANEL_HEIGHT_M)),
    ).toBeUndefined();
  });

  it("hides the panel behind a column one millimetre taller than it", () => {
    expect(
      seatWith(columnFromTheFloor(RUN_END_PANEL_HEIGHT_M + 0.001)),
    ).toBeUndefined();
  });

  it("keeps the panel under a body whose underside touches its top within tolerance", () => {
    const justAbove = bodyHangingFrom(
      RUN_END_PANEL_HEIGHT_M - WITHIN_TOLERANCE_M,
    );

    expect(seatWith(justAbove)).toBe(SEEDED_SEAT_M);
  });

  it("hides the panel under a body dipping ten microns below its top", () => {
    const dipping = bodyHangingFrom(RUN_END_PANEL_HEIGHT_M - PAST_TOLERANCE_M);

    expect(seatWith(dipping)).toBeUndefined();
  });

  /** Once a column is tall enough to reach the panel it stays blocking, at every millimetre above.
   *  A height comparison inverted anywhere in the interval arithmetic breaks the monotonicity even
   *  where it keeps the two ends right. */
  it("blocks at every height from one millimetre up to twice the panel's", () => {
    const heightsMm = Array.from({ length: 1640 }, (_, index) => index + 1);

    const unblocked = heightsMm.filter(
      (heightMm) => seatWith(columnFromTheFloor(heightMm / 1000)) !== undefined,
    );

    expect(unblocked).toEqual([]);
  });

  /** The floor of the panel's own interval. A body wholly below the floor line occupies none of the
   *  panel, and a zero-height one occupies nothing at all. */
  it("keeps the panel for a body of no height standing in the seat", () => {
    expect(seatWith(columnFromTheFloor(0))).toBe(SEEDED_SEAT_M);
  });
});

describe("the seat over the range, not at the shipped point", () => {
  /** A lone base unit somewhere along a wall as long as `MAX_ROOM_WIDTH_MM` allows, at every
   *  millimetre of along-wall position and every catalogue width the domain accepts. */
  const SOLE_BASE_ARBITRARY = fc
    .tuple(
      fc.integer({ min: 0, max: 5100 }),
      fc.integer({ min: 150, max: 1200 }),
    )
    .map(([leftEdgeMm, widthMm]) =>
      bodyAt({
        wall: "A",
        band: "base",
        leftEdgeM: leftEdgeMm / 1000,
        y0M: 0,
        heightM: 0.82,
        widthM: widthMm / 1000,
      }),
    );

  /** The offset is added to whatever the run's right edge is, so the finished end tracks the run at
   *  every length rather than at the one the reference room ships. */
  propertyTest.prop([SOLE_BASE_ARBITRARY])(
    "stands the panel exactly one offset past the run's right edge",
    (soleBase: PlacementRecord) => {
      const runEndM = soleBase.frame.x + soleBase.frame.w / 2;

      expect(runEndPanelSeatM([soleBase], WALL_A_PAST_EVERY_RUN)).toBe(
        runEndM + RUN_END_PANEL_EDGE_OFFSET_M,
      );
    },
  );

  /** ADR 0083 decision 5's 19 mm, swept: the outer face is `run + 1 mm gap + 18 mm slab` at every
   *  run length, so no wave can recover the reference's rounded 20 by pinning one number. */
  propertyTest.prop([SOLE_BASE_ARBITRARY])(
    "leaves the outer face 19 mm past the run at every run length",
    (soleBase: PlacementRecord) => {
      const runEndM = soleBase.frame.x + soleBase.frame.w / 2;

      const seatM = requireSeatM([soleBase], WALL_A_PAST_EVERY_RUN);
      const outerFaceM = seatM + RUN_END_PANEL_THICKNESS_M / 2;

      expect((outerFaceM - runEndM) * 1000).toBeCloseTo(19, 9);
      expect(seatM).toBeGreaterThan(runEndM);
    },
  );
});

describe("the smallest record sets the rule can be handed", () => {
  it("hides the panel for no records at all", () => {
    expect(runEndPanelSeatM([], SEEDED_ROOM)).toBeUndefined();
  });

  it("seats the panel on a lone base placement", () => {
    const soleBase = bodyAt({
      wall: "A",
      band: "base",
      leftEdgeM: 1,
      y0M: 0,
      heightM: 0.82,
      widthM: 0.6,
    });

    expect(runEndPanelSeatM([soleBase], SEEDED_ROOM)).toBe(
      1.6 + RUN_END_PANEL_EDGE_OFFSET_M,
    );
  });

  // The veto needs a run to veto: `runEndPanelSeatM` returns before `blocksSeat` when wall A carries
  // no base at all, so a fixture of vetoing bodies alone hides the panel for the *other* reason and
  // leaves `blocksSeat` unexecuted. This is the smallest set that reaches it — one base to end the
  // run, one column standing in the seat that run's finished end would take.
  it("hides the panel when a column stands in the seat past the smallest run", () => {
    const soleBase = bodyAt({
      wall: "A",
      band: "base",
      leftEdgeM: 1,
      y0M: 0,
      heightM: 0.82,
      widthM: 0.6,
    });
    const columnInTheSeat = bodyAt({
      wall: "A",
      band: "column",
      leftEdgeM: 1.6,
      y0M: 0,
      heightM: 2.2,
    });

    // Non-vacuity: the run alone seats the panel, so the `undefined` below is the veto's answer and
    // not the missing-run branch's.
    expect(runEndPanelSeatM([soleBase], SEEDED_ROOM)).toBe(
      1.6 + RUN_END_PANEL_EDGE_OFFSET_M,
    );
    expect(
      runEndPanelSeatM([soleBase, columnInTheSeat], SEEDED_ROOM),
    ).toBeUndefined();
  });
});
