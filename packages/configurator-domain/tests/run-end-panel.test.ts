// ADR 0083 decision 5: the run-end panel's seat is a domain fact with exactly one definition, so
// wall A's occupied width and the panel on screen cannot part.
//
// **This suite's job is to be non-vacuous about a value-preserving move.** The rule was lifted out
// of `three-adapter/src/kitchen-shell.ts` unchanged, so every existing test passes by construction
// and would keep passing if the constants had been swapped on the way across. `SHIPPED_*` below is
// the pre-move adapter rule transcribed from its literals and kept deliberately independent of the
// module under test — no import of `RUN_END_PANEL_*` reaches it. A domain constant that drifts from
// what the adapter shipped shows up as a disagreement on the sweep, not as a green suite.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_HEIGHT_M,
  RUN_END_PANEL_THICKNESS_M,
  runEndPanelSeatM,
} from "../src/run-end-panel.js";
import type { DesignRoom } from "../src/design.js";
import {
  derivePlacementRecords,
  type PlacementRecord,
} from "../src/void-engine.js";

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

/** The room those records stand in: every run this file builds ends at or inside the seeded one's. */
const SEEDED_ROOM = KITCHEN_L_DESIGN.room;

/** `p4` — `base-drawer3-600` at 3200 — is the right-most wall-A base placement, so it is the
 *  cabinet the panel closes. */
const RIGHT_MOST_BASE_ID = "p4";

const RIGHT_MOST_BASE = requireRecord(RIGHT_MOST_BASE_ID);
const RUN_END_M = RIGHT_MOST_BASE.frame.x + RIGHT_MOST_BASE.frame.w / 2;

function requireRecord(id: string): PlacementRecord {
  const record = SEEDED_RECORDS.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`no seeded record ${id}`);
  return record;
}

function requireSeatM(records: readonly PlacementRecord[]): number {
  const seatM = runEndPanelSeatM(records, SEEDED_ROOM);
  if (seatM === undefined) throw new Error("expected a visible panel");
  return seatM;
}

describe("the shipped numbers, pinned as literals", () => {
  // A named constant asserted against itself is the vacuous guard this milestone keeps finding.
  // These compare against the digits `kitchen-shell.ts` shipped before the move, written out.
  it("carries the reference room's slab, gap and base height", () => {
    expect(RUN_END_PANEL_THICKNESS_M).toBe(0.018);
    expect(RUN_END_PANEL_GAP_M).toBe(0.001);
    expect(RUN_END_PANEL_HEIGHT_M).toBe(0.82);
  });

  /** **A redefinition guard on the composition, not a claim about coordinates.** What must stay
   *  true is that the offset is *composed from the slab and the gap* rather than frozen as one
   *  number: the 10 mm is authored, so a bare literal would survive a change to `TH` by moving the
   *  gap instead of keeping the overhang. This fails the moment someone collapses the expression,
   *  whatever value they collapse it to.
   *
   *  It deliberately says nothing about the millimetre form, which reaches the same double at every
   *  reachable run end. An accompanying `not.toBe(0.01)` was removed rather than reworded: the line
   *  below already pins the constant to `0.009999999999999998`, one ULP from `0.01`, so the extra
   *  assertion could never fail while this one passed — no discriminating power against any mutant,
   *  including the flat-`0.01` redeclaration it was named for.
   *
   *  Nor would 10 mm be the wrong number. ADR 0045's *superseded* arithmetic was `TH/2` = 9 mm,
   *  which evaluates to 3.509; its 2026-09-01 correction endorsed the measured 10 mm. */
  it("composes the edge offset from the slab and the gap", () => {
    expect(RUN_END_PANEL_EDGE_OFFSET_M).toBe(0.018 / 2 + 0.001);
  });

  it("seats the seeded panel on M1's parity number", () => {
    expect(requireSeatM(SEEDED_RECORDS)).toBeCloseTo(3.51, 9);
  });

  /** ADR 0083 decision 5's 3519, not the reference panel's rounded 3520: the outer face is
   *  `3500 + 1 mm gap + 18 mm slab`. Pinned here because the obvious "fix" is a flat 20 mm
   *  constant, which would pin the rounding and stop the finished end tracking its run. */
  it("puts the finished end's outer face 19 mm past the run, not 20", () => {
    const outerFaceMm =
      (requireSeatM(SEEDED_RECORDS) + RUN_END_PANEL_THICKNESS_M / 2) * 1000;

    expect(outerFaceMm).toBeCloseTo(3519, 6);
    expect(outerFaceMm - RUN_END_M * 1000).toBeCloseTo(19, 6);
  });
});

describe("ADR 0045's veto, both halves", () => {
  /** A full-height pantry butted against the last base cabinet — reachable from the shipped design
   *  by deleting `p4`, `p14` and `p20`, letting §10 merge the opening and inserting
   *  `tall-pantry-600`. Its left face is the run's end, so the seat 10 mm past that is inside it. */
  function bodyRightOfTheRun(
    band: PlacementRecord["band"],
    y0M: number,
    heightM: number,
  ): PlacementRecord {
    return {
      ...RIGHT_MOST_BASE,
      id: `right-of-the-run-${band}-${String(y0M)}`,
      band,
      heightMm: heightM * 1000,
      frame: {
        ...RIGHT_MOST_BASE.frame,
        x: RUN_END_M + RIGHT_MOST_BASE.frame.w / 2,
        y0: y0M,
        h: heightM,
      },
    };
  }

  it("hides the panel rather than burying it in a full-height column's side", () => {
    const withColumn = [...SEEDED_RECORDS, bodyRightOfTheRun("column", 0, 2.2)];

    expect(runEndPanelSeatM(withColumn, SEEDED_ROOM)).toBeUndefined();
  });

  /** The vertical half on its own. A wall cabinet shares the along-wall line but hangs at 1500 mm,
   *  nowhere near a panel that ends at 820 — an `x`-only veto would hide the panel here. */
  it("keeps the panel under a wall cabinet hanging on the same along-wall line", () => {
    const withHangingBody = [
      ...SEEDED_RECORDS,
      bodyRightOfTheRun("wall", 1.5, 0.7),
    ];

    expect(requireSeatM(withHangingBody)).toBe(requireSeatM(SEEDED_RECORDS));
  });

  /** The along-wall half on its own. A floor-standing column far down wall A occupies the panel's
   *  vertical band and none of its along-wall one — a `y`-only veto would hide the panel for every
   *  wall-A body in the room. */
  it("keeps the panel for a floor-standing column nowhere near the seat", () => {
    const farAway = {
      ...bodyRightOfTheRun("column", 0, 2.2),
      id: "far-column",
      frame: { ...bodyRightOfTheRun("column", 0, 2.2).frame, x: 0.3 },
    };

    expect(requireSeatM([...SEEDED_RECORDS, farAway])).toBe(
      requireSeatM(SEEDED_RECORDS),
    );
  });

  /** Only the seat is contested, never the run: shrinking the last base cabinet frees the seat and
   *  the panel returns at the *shrunk* cabinet's edge, not at the column's — which a filter that
   *  let a column extend the run would have made the run's end. */
  it("does not let a vetoing column extend the run it is not part of", () => {
    const column = bodyRightOfTheRun("column", 0, 2.2);
    const shortened = [
      ...replaceRecord(
        SEEDED_RECORDS,
        narrowedFromTheRight(RIGHT_MOST_BASE, 100),
      ),
      column,
    ];

    expect(
      runEndPanelSeatM([...SEEDED_RECORDS, column], SEEDED_ROOM),
    ).toBeUndefined();
    expect(requireSeatM(shortened)).toBeCloseTo(3.41, 9);
  });

  it("hides the panel when wall A carries no base run at all", () => {
    expect(
      runEndPanelSeatM(withoutWallABases(SEEDED_RECORDS), SEEDED_ROOM),
    ).toBeUndefined();
  });
});

describe("ADR 0045 Amendment A: no panel where the run reaches wall A's end", () => {
  /** The panel's gap and slab, written out: a run ending this far short of the wall keeps it. */
  const FOOTPRINT_MM = 19;
  const SEEDED_RUN_END_MM = Math.round(RUN_END_M * 1000);

  function roomEndingAt(wallAMm: number): DesignRoom {
    return { ...SEEDED_ROOM, widthMm: wallAMm };
  }

  it("keeps the seeded seat byte for byte, visible, at M1's parity number", () => {
    const seatM = runEndPanelSeatM(SEEDED_RECORDS, SEEDED_ROOM);

    expect(seatM).toBe(shippedSeatM(SEEDED_RECORDS));
    expect(seatM).toBeCloseTo(3.51, 9);
  });

  it("keeps the panel for a run ending exactly its footprint short of the wall", () => {
    const room = roomEndingAt(SEEDED_RUN_END_MM + FOOTPRINT_MM);

    expect(runEndPanelSeatM(SEEDED_RECORDS, room)).toBe(
      shippedSeatM(SEEDED_RECORDS),
    );
  });

  it("hides the panel for a run ending one millimetre closer than that", () => {
    const room = roomEndingAt(SEEDED_RUN_END_MM + FOOTPRINT_MM - 1);

    expect(runEndPanelSeatM(SEEDED_RECORDS, room)).toBeUndefined();
  });

  it("hides the panel for a run flush with the wall's end", () => {
    const room = roomEndingAt(SEEDED_RUN_END_MM);

    expect(runEndPanelSeatM(SEEDED_RECORDS, room)).toBeUndefined();
  });

  /** A lone base cabinet as `derivePlacementRecords` frames one: centre and width in metres, from
   *  whole millimetres. About one run end in ten then lands a few ULPs past the wall at exact
   *  equality (0.176 as 0.17600000000000002 at a 150 mm cabinet centred on 82), which is what the
   *  rule's float allowance is for — measured over 422 979 run ends on the approved wall. */
  const LONE_BASE = fc
    .tuple(
      fc.integer({ min: 0, max: 5900 }),
      fc.integer({ min: 75, max: 400 }).map((half) => half * 2),
    )
    .map(([leftEdgeMm, widthMm]) => ({ leftEdgeMm, widthMm }));

  function loneBase(leftEdgeMm: number, widthMm: number): PlacementRecord {
    return {
      ...RIGHT_MOST_BASE,
      id: "lone-base",
      widthMm,
      frame: {
        ...RIGHT_MOST_BASE.frame,
        x: (leftEdgeMm + widthMm / 2) / 1000,
        w: widthMm / 1000,
      },
    };
  }

  propertyTest.prop([LONE_BASE], { numRuns: 300 })(
    "keeps the panel for any whole-millimetre run ending exactly its footprint short, float noise included",
    ({ leftEdgeMm, widthMm }: { leftEdgeMm: number; widthMm: number }) => {
      const records = [loneBase(leftEdgeMm, widthMm)];
      const runEndMm = leftEdgeMm + widthMm;

      expect(
        runEndPanelSeatM(records, roomEndingAt(runEndMm + FOOTPRINT_MM)),
      ).toBe(shippedSeatM(records));
      expect(
        runEndPanelSeatM(records, roomEndingAt(runEndMm + FOOTPRINT_MM - 1)),
      ).toBeUndefined();
    },
  );

  it("keeps the panel at the measured noisy case", () => {
    const records = [loneBase(7, 150)];

    expect(runEndPanelSeatM(records, roomEndingAt(176))).toBe(
      shippedSeatM(records),
    );
  });

  /** Equality is decided in metres, so it is swept at every whole-millimetre run end the seeded
   *  cabinet can be narrowed to: a comparison that let float noise decide would part here. */
  propertyTest.prop([fc.integer({ min: 0, max: 590 })], { numRuns: 200 })(
    "keeps the panel at the footprint and hides it a millimetre inside, at every run end",
    (narrowedByMm: number) => {
      const records = replaceRecord(
        SEEDED_RECORDS,
        narrowedFromTheRight(RIGHT_MOST_BASE, narrowedByMm),
      );
      const runEndMm = SEEDED_RUN_END_MM - narrowedByMm;

      expect(
        runEndPanelSeatM(records, roomEndingAt(runEndMm + FOOTPRINT_MM)),
      ).toBe(shippedSeatM(records));
      expect(
        runEndPanelSeatM(records, roomEndingAt(runEndMm + FOOTPRINT_MM - 1)),
      ).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// The pre-move adapter rule, transcribed from `kitchen-shell.ts` at `2073b2a`.
// Nothing below imports a `RUN_END_PANEL_*` constant: that independence is the whole point.
// ---------------------------------------------------------------------------

const SHIPPED_THICKNESS_M = 0.018;
const SHIPPED_GAP_M = 0.001;
const SHIPPED_HEIGHT_M = 0.82;
const SHIPPED_TOUCHING_TOLERANCE_M = 1e-6;
const SHIPPED_EDGE_OFFSET_M = SHIPPED_THICKNESS_M / 2 + SHIPPED_GAP_M;
const SHIPPED_HALF_THICKNESS_M = SHIPPED_THICKNESS_M / 2;

function shippedSeatM(records: readonly PlacementRecord[]): number | undefined {
  const runEndM = shippedBaseRunRightEdgeM(records);
  if (runEndM === undefined) return undefined;

  const seatM = runEndM + SHIPPED_EDGE_OFFSET_M;
  return records.some((record) => shippedBlocksSeat(record, seatM))
    ? undefined
    : seatM;
}

function shippedBaseRunRightEdgeM(
  records: readonly PlacementRecord[],
): number | undefined {
  let rightEdgeM: number | undefined;
  for (const record of records) {
    if (record.wall !== "A" || record.band !== "base") continue;
    const edgeM = record.frame.x + record.frame.w / 2;
    if (rightEdgeM === undefined || edgeM > rightEdgeM) rightEdgeM = edgeM;
  }
  return rightEdgeM;
}

function shippedBlocksSeat(record: PlacementRecord, seatM: number): boolean {
  if (record.wall !== "A" || record.band === "base") return false;
  return (
    shippedOverlaps(
      [
        record.frame.x - record.frame.w / 2,
        record.frame.x + record.frame.w / 2,
      ],
      [seatM - SHIPPED_HALF_THICKNESS_M, seatM + SHIPPED_HALF_THICKNESS_M],
    ) &&
    shippedOverlaps(
      [record.frame.y0, record.frame.y0 + record.frame.h],
      [0, SHIPPED_HEIGHT_M],
    )
  );
}

function shippedOverlaps(
  [leftLow, leftHigh]: readonly [number, number],
  [rightLow, rightHigh]: readonly [number, number],
): boolean {
  return (
    leftLow < rightHigh - SHIPPED_TOUCHING_TOLERANCE_M &&
    rightLow < leftHigh - SHIPPED_TOUCHING_TOLERANCE_M
  );
}

function narrowedFromTheRight(
  record: PlacementRecord,
  byMm: number,
): PlacementRecord {
  const deltaM = byMm / 1000;
  return {
    ...record,
    widthMm: record.widthMm - byMm,
    frame: {
      ...record.frame,
      x: record.frame.x - deltaM / 2,
      w: record.frame.w - deltaM,
    },
  };
}

function replaceRecord(
  records: readonly PlacementRecord[],
  replacement: PlacementRecord,
): PlacementRecord[] {
  return records.map((record) =>
    record.id === replacement.id ? replacement : record,
  );
}

function withoutWallABases(
  records: readonly PlacementRecord[],
): PlacementRecord[] {
  return records.filter(
    (record) => !(record.wall === "A" && record.band === "base"),
  );
}

/** An obstruction placed relative to the seat rather than to the run, so each entry exercises one
 *  of the constants the move carried across. `deltaFromSeatM` is where the body's *left* edge sits
 *  relative to the panel's outer face. */
interface SeatProbe {
  readonly label: string;
  readonly build: () => readonly PlacementRecord[];
}

const SEEDED_SEAT_M = RUN_END_M + SHIPPED_EDGE_OFFSET_M;

function probeBody(
  band: PlacementRecord["band"],
  leftEdgeM: number,
  y0M: number,
  heightM: number,
): PlacementRecord {
  const widthM = RIGHT_MOST_BASE.frame.w;
  return {
    ...RIGHT_MOST_BASE,
    id: `probe-${band}-${String(leftEdgeM)}-${String(y0M)}`,
    band,
    heightMm: heightM * 1000,
    frame: {
      ...RIGHT_MOST_BASE.frame,
      x: leftEdgeM + widthM / 2,
      y0: y0M,
      h: heightM,
    },
  };
}

const SEAT_PROBES: readonly SeatProbe[] = [
  { label: "the seeded design", build: () => SEEDED_RECORDS },
  {
    label: "wall A stripped of its base run",
    build: () => withoutWallABases(SEEDED_RECORDS),
  },
  {
    label: "a full-height column butted against the run",
    build: () => [...SEEDED_RECORDS, probeBody("column", RUN_END_M, 0, 2.2)],
  },
  {
    label: "a wall cabinet hanging over the seat",
    build: () => [...SEEDED_RECORDS, probeBody("wall", RUN_END_M, 1.5, 0.7)],
  },
  {
    // Exercises the height: a column stopping 1 mm below the panel's top still blocks it.
    label: "a column one millimetre shorter than the panel",
    build: () => [...SEEDED_RECORDS, probeBody("column", RUN_END_M, 0, 0.819)],
  },
  {
    // Exercises the height from the other side: a body starting exactly at the panel's top.
    label: "a column seated exactly on the panel's top edge",
    build: () => [...SEEDED_RECORDS, probeBody("column", RUN_END_M, 0.82, 1.2)],
  },
  {
    // Exercises the tolerance: a shared face arriving half a micron proud is not an overlap.
    label: "a column touching the panel's outer face within tolerance",
    build: () => [
      ...SEEDED_RECORDS,
      probeBody(
        "column",
        SEEDED_SEAT_M + SHIPPED_HALF_THICKNESS_M - 5e-7,
        0,
        2.2,
      ),
    ],
  },
  {
    // Exercises the tolerance from the other side: ten microns is an overlap.
    label: "a column overlapping the panel's outer face past tolerance",
    build: () => [
      ...SEEDED_RECORDS,
      probeBody(
        "column",
        SEEDED_SEAT_M + SHIPPED_HALF_THICKNESS_M - 1e-5,
        0,
        2.2,
      ),
    ],
  },
  {
    // Exercises the offset: shrink the run and the seat must travel with it.
    label: "the last base cabinet narrowed by 100 mm",
    build: () =>
      replaceRecord(SEEDED_RECORDS, narrowedFromTheRight(RIGHT_MOST_BASE, 100)),
  },
  {
    label: "a narrowed run with the column no longer reaching it",
    build: () => [
      ...replaceRecord(
        SEEDED_RECORDS,
        narrowedFromTheRight(RIGHT_MOST_BASE, 100),
      ),
      probeBody("column", RUN_END_M, 0, 2.2),
    ],
  },
];

describe("the domain rule against the numbers the adapter shipped", () => {
  it.each(SEAT_PROBES)(
    "agrees with the pre-move adapter rule on $label",
    ({ build }) => {
      const records = build();

      expect(runEndPanelSeatM(records, SEEDED_ROOM)).toBe(
        shippedSeatM(records),
      );
    },
  );

  /** The sweep is only evidence if it actually contains both answers. A probe list that had
   *  drifted into all-visible or all-hidden would agree with anything. */
  it("sweeps both answers rather than one of them", () => {
    const answers = SEAT_PROBES.map((probe) =>
      runEndPanelSeatM(probe.build(), SEEDED_ROOM),
    );

    expect(answers.filter((seat) => seat === undefined).length).toBeGreaterThan(
      1,
    );
    expect(answers.filter((seat) => seat !== undefined).length).toBeGreaterThan(
      1,
    );
    expect(new Set(answers.filter((seat) => seat !== undefined)).size).toBe(2);
  });
});

describe("ADR 0045's anti-invariant: the seat is a pure function of the records", () => {
  const SHUFFLED_SEEDED = fc
    .shuffledSubarray([...SEEDED_RECORDS], {
      minLength: SEEDED_RECORDS.length,
    })
    .map((records) => records as readonly PlacementRecord[]);

  /** Order is not a fact about a design. A rule that answered from the *first* wall-A base rather
   *  than the furthest would pass on the seeded ordering and fail here. */
  propertyTest.prop([SHUFFLED_SEEDED])(
    "reads the same seat however the records are ordered",
    (records: readonly PlacementRecord[]) => {
      expect(runEndPanelSeatM(records, SEEDED_ROOM)).toBe(
        runEndPanelSeatM(SEEDED_RECORDS, SEEDED_ROOM),
      );
    },
  );

  /** `db9c402`'s own anti-invariant, at the level the rule lives: a design reached by deleting
   *  placements one at a time and one holding the surviving set outright are one answer. A seat
   *  carrying history — the defect that commit fixed, one seam over — parts here. */
  propertyTest.prop([fc.subarray([...SEEDED_RECORDS], { minLength: 1 })])(
    "answers identically whether a state is loaded or deleted into",
    (surviving: readonly PlacementRecord[]) => {
      const survivingIds = new Set(surviving.map((record) => record.id));
      let deletedInto: readonly PlacementRecord[] = SEEDED_RECORDS;
      const seatsAlongTheWay: (number | undefined)[] = [];
      for (const record of SEEDED_RECORDS) {
        if (survivingIds.has(record.id)) continue;
        deletedInto = deletedInto.filter(
          (candidate) => candidate.id !== record.id,
        );
        seatsAlongTheWay.push(runEndPanelSeatM(deletedInto, SEEDED_ROOM));
      }

      expect(deletedInto.map((record) => record.id)).toEqual(
        surviving.map((record) => record.id),
      );
      expect(runEndPanelSeatM(deletedInto, SEEDED_ROOM)).toBe(
        runEndPanelSeatM(surviving, SEEDED_ROOM),
      );
      // The history is computed rather than discarded, so a rule that memoised across calls would
      // have had somewhere to hide it.
      expect(seatsAlongTheWay.length).toBe(
        SEEDED_RECORDS.length - surviving.length,
      );
    },
  );
});
