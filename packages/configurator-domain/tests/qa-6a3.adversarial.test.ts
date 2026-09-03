import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement, DesignRoom } from "../src/design.js";
import { DesignSchema } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import { projectDesignForDisplay } from "../src/queries/design-projection.js";
import { findOverflowingPlacementIds } from "../src/queries/overflowing-placements.js";
import { compareOpaqueIds } from "../src/opaque-id-order.js";
import { InvalidDesignError } from "../src/repository.js";
import {
  assertDesignValidForCatalog,
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  projectEmptyColumns,
  projectFrozenMap,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

/** The two runs the correction of 2026-09-03 gave the seeded kitchen, restated rather than read off
 *  `KITCHEN_L_DESIGN.room` so an accidental edit to the fixture cannot move this file's boundary. */
const WALL_A_RUN_MM = 3560;
const WALL_B_RUN_MM = 2830;

/** The room as every document up to schema version 2 carries it — the measurement the correction
 *  replaced. Wall B at 2400 is 430 mm short of the real wall. */
const PRE_CORRECTION_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3600,
  depthMm: 2400,
  heightMm: 2600,
};

function stored(design: Design): unknown {
  return JSON.parse(JSON.stringify(design)) as unknown;
}

function bodyOn(
  id: string,
  wall: "A" | "B",
  alongMm: number,
  widthMm = 800,
): DesignPlacement {
  return {
    id,
    wall,
    alongMm,
    y0Mm: 0,
    body: { buildId: "base-sink-800", widthMm, heightMm: 820 },
  };
}

/** A body whose far edge lands exactly on `endMm` — §12 stores the centre, so the caller states the
 *  edge it means and never the coordinate that produces it. */
function bodyEndingAt(
  id: string,
  wall: "A" | "B",
  endMm: number,
  widthMm = 800,
): DesignPlacement {
  return bodyOn(id, wall, endMm - widthMm / 2, widthMm);
}

function designOf(
  placements: readonly DesignPlacement[],
  room: DesignRoom = KITCHEN_L_DESIGN.room,
): Design {
  return {
    room,
    presetId: null,
    placements: [...placements],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function codesOf(design: Design): readonly string[] {
  return validateDesignForCatalog(design, CATALOG).map((issue) => issue.code);
}

function fatalCodesOf(design: Design): readonly string[] {
  return fatalDesignValidationIssues(
    validateDesignForCatalog(design, CATALOG),
  ).map((issue) => issue.code);
}

function pushedReachesMm(
  placements: readonly DesignPlacement[],
): readonly number[] {
  return placements.map(
    (placement) => placement.alongMm + placement.body.widthMm / 2,
  );
}

// ---------------------------------------------------------------------------
// The room correction, on documents the demotion has newly made loadable
// ---------------------------------------------------------------------------

describe("the room correction on a pre-correction row a customer has edited past its wall", () => {
  /** A real version 2 row: the seeded kitchen as it was stored before 2026-09-03, plus one body the
   *  customer dragged past the end of wall B. Every part of it was legal when it was written —
   *  the bound then was `max(widthMm, depthMm)` = 3600, and the edited body ends at 3600 exactly. */
  const SEEDED_ROW_WITH_ONE_EDITED_BODY: Design = {
    ...KITCHEN_L_DESIGN,
    room: { ...PRE_CORRECTION_ROOM },
    placements: [
      ...KITCHEN_L_DESIGN.placements,
      bodyEndingAt("edited", "B", 3600),
    ],
  };

  it("was legal under the bound in force when it was written", () => {
    const bound = Math.max(
      PRE_CORRECTION_ROOM.widthMm,
      PRE_CORRECTION_ROOM.depthMm,
    );
    for (const placement of SEEDED_ROW_WITH_ONE_EDITED_BODY.placements) {
      expect(
        placement.alongMm + placement.body.widthMm / 2,
      ).toBeLessThanOrEqual(bound);
    }
  });

  it.each([1, 2])(
    "loads it at version %i, as ADR 0065 decision 7 requires",
    (version) => {
      expect(() =>
        migrateDesign(version, stored(SEEDED_ROW_WITH_ONE_EDITED_BODY)),
      ).not.toThrow();
    },
  );

  /** **The correction has to fire on exactly this document.** Its whole reason for existing is that
   *  the stored 2400 mm is not wall B — the wall is 2830 — and every seeded body between them
   *  (`p7` and `p24`, both ending at 2800) is a body the milestone names as "an overrun at 600 that
   *  does not exist". One customer edit must not be able to veto the measurement correction for the
   *  twenty-five bodies that did not move. */
  it.each([1, 2])("corrects its room at version %i", (version) => {
    const loaded = migrateDesign(
      version,
      stored(SEEDED_ROW_WITH_ONE_EDITED_BODY),
    );

    expect(loaded.room).toStrictEqual({
      ...PRE_CORRECTION_ROOM,
      widthMm: WALL_A_RUN_MM,
      depthMm: WALL_B_RUN_MM,
    });
  });

  it.each([1, 2])(
    "marks only the body the customer moved at version %i",
    (version) => {
      const loaded = migrateDesign(
        version,
        stored(SEEDED_ROW_WITH_ONE_EDITED_BODY),
      );

      expect(findOverflowingPlacementIds(loaded)).toStrictEqual(["edited"]);
    },
  );
});

// ---------------------------------------------------------------------------
// One-sided: the exact boundary, on the runs the product actually ships
// ---------------------------------------------------------------------------

describe("the one-sided rule at the seeded kitchen's own runs", () => {
  it.each([
    ["A", WALL_A_RUN_MM],
    ["B", WALL_B_RUN_MM],
  ] as const)(
    "treats a far edge landing exactly on wall %s as fitting",
    (wall, runMm) => {
      const design = designOf([bodyEndingAt("flush", wall, runMm)]);

      expect(findOverflowingPlacementIds(design)).toStrictEqual([]);
      expect(codesOf(design)).toStrictEqual([]);
    },
  );

  it.each([
    ["A", WALL_A_RUN_MM],
    ["B", WALL_B_RUN_MM],
  ] as const)("reports one millimetre past wall %s", (wall, runMm) => {
    const design = designOf([bodyEndingAt("over", wall, runMm + 1)]);

    expect(findOverflowingPlacementIds(design)).toStrictEqual(["over"]);
    expect(codesOf(design)).toStrictEqual(["PLACEMENT_PAST_WALL_END"]);
  });

  /** ADR 0067: a remainder is the expected case. No check asserting that a run *reaches* its wall
   *  may exist, so the emptiest legal kitchen — one 800 mm body at the start of each wall, leaving
   *  2760 mm and 2030 mm bare — must produce not one diagnostic of any kind. */
  it("reports nothing at all about metres of bare wall on both runs", () => {
    const design = designOf([bodyOn("a", "A", 400), bodyOn("b", "B", 400)]);

    expect(codesOf(design)).toStrictEqual([]);
    expect(findOverflowingPlacementIds(design)).toStrictEqual([]);
  });

  /** And the emptiest design of all. A kitchen with no bodies underfills both walls completely. */
  it("reports nothing about a room holding no bodies", () => {
    const design = designOf([]);

    expect(codesOf(design)).toStrictEqual([]);
    expect(findOverflowingPlacementIds(design)).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Furthest reach, never a sum — stated against the shipped wall B
// ---------------------------------------------------------------------------

describe("the extent is the furthest reach and not a sum of widths", () => {
  /** Wall B's real base row: the corner return, two tall units and the fridge. Their widths add to
   *  far less than the wall, while the run reaches 2800 — so a sum answers "fits" for a design
   *  whose furthest body is 1030 mm beyond where a sum would put it. Pushed one millimetre past the
   *  wall, only the max-based rule notices. */
  const WALL_B_BASE_ROW = KITCHEN_L_DESIGN.placements.filter(
    (placement) => placement.wall === "B" && placement.y0Mm === 0,
  );

  it("answers by max where a sum and a max disagree by a metre", () => {
    const summedWidthsMm = WALL_B_BASE_ROW.reduce(
      (total, placement) => total + placement.body.widthMm,
      0,
    );
    const furthestReachMm = Math.max(
      ...WALL_B_BASE_ROW.map(
        (placement) => placement.alongMm + placement.body.widthMm / 2,
      ),
    );
    const pushedPastTheWall = WALL_B_BASE_ROW.map((placement) =>
      placement.alongMm + placement.body.widthMm / 2 === furthestReachMm
        ? { ...placement, alongMm: placement.alongMm + 31 }
        : placement,
    );

    // The sum still says "fits" after the push — it is 579 mm short of the wall — while the
    // furthest reach is one millimetre past it. Only the max-based rule can answer.
    expect(summedWidthsMm).toBeLessThan(WALL_B_RUN_MM);
    expect(furthestReachMm).toBeGreaterThan(summedWidthsMm);
    expect(Math.max(...pushedReachesMm(pushedPastTheWall))).toBeGreaterThan(
      WALL_B_RUN_MM,
    );
    expect(findOverflowingPlacementIds(designOf(pushedPastTheWall))).toEqual([
      "p7",
    ]);
  });

  /** The same disagreement built from nothing but a gap, so the fixture cannot be what carries it. */
  it("ignores the gap between two bodies entirely", () => {
    const contiguous = designOf([
      bodyEndingAt("first", "B", 800),
      bodyEndingAt("second", "B", WALL_B_RUN_MM),
    ]);
    const gapped = designOf([
      bodyEndingAt("first", "B", 800),
      bodyEndingAt("second", "B", WALL_B_RUN_MM + 1),
    ]);

    expect(findOverflowingPlacementIds(contiguous)).toStrictEqual([]);
    expect(findOverflowingPlacementIds(gapped)).toStrictEqual(["second"]);
  });
});

// ---------------------------------------------------------------------------
// Empty and degenerate input
// ---------------------------------------------------------------------------

describe("degenerate rooms and bodies", () => {
  it("refuses a zero or negative wall at the wire, and still answers about it", () => {
    for (const room of [
      { ...KITCHEN_L_DESIGN.room, depthMm: 0 },
      { ...KITCHEN_L_DESIGN.room, depthMm: -1 },
      { ...KITCHEN_L_DESIGN.room, widthMm: 0 },
      { ...KITCHEN_L_DESIGN.room, widthMm: -1 },
    ]) {
      const design = designOf(
        [bodyOn("a", "A", 500), bodyOn("b", "B", 500)],
        room,
      );

      expect(DesignSchema.safeParse(design).success).toBe(false);
      expect(() => findOverflowingPlacementIds(design)).not.toThrow();
      expect(findOverflowingPlacementIds(design).length).toBeGreaterThan(0);
    }
  });

  it("reports a body wider than the whole wall it stands on", () => {
    const wider = designOf([
      bodyOn("wider-than-wall-b", "B", WALL_B_RUN_MM / 2, WALL_B_RUN_MM + 200),
    ]);

    expect(findOverflowingPlacementIds(wider)).toStrictEqual([
      "wider-than-wall-b",
    ]);
  });

  /** The demotion is one code wide. A negative centre is `PLACEMENT_BEFORE_WALL_START` and stays a
   *  refusal, alone and beside an overflow — a body so wide it breaks both ends of the same wall. */
  it("keeps a body before the wall start fatal, alone and beside an overflow", () => {
    const beforeStart = designOf([bodyOn("before", "A", 399)]);
    // A wall shorter than the one body standing on it, so the same body breaks both ends at once.
    const bothEnds = designOf([bodyOn("both", "B", 300)], {
      ...KITCHEN_L_DESIGN.room,
      depthMm: 500,
    });

    expect(codesOf(beforeStart)).toStrictEqual(["PLACEMENT_BEFORE_WALL_START"]);
    expect(() => {
      assertDesignValidForCatalog(beforeStart, CATALOG);
    }).toThrow(InvalidDesignError);

    expect(codesOf(bothEnds)).toStrictEqual([
      "PLACEMENT_BEFORE_WALL_START",
      "PLACEMENT_PAST_WALL_END",
    ]);
    expect(() => {
      assertDesignValidForCatalog(bothEnds, CATALOG);
    }).toThrow(/PLACEMENT_BEFORE_WALL_START/);
  });

  it("reports every placement when every one of them overflows", () => {
    const ids = Array.from({ length: 12 }, (_unused, index) =>
      String(index).padStart(2, "0"),
    );
    const design = designOf(
      ids.map((id, index) =>
        bodyEndingAt(id, index % 2 === 0 ? "A" : "B", 9000 + index),
      ),
    );

    expect(findOverflowingPlacementIds(design)).toStrictEqual(ids);
  });
});

// ---------------------------------------------------------------------------
// The frozen map of an overflowing design
// ---------------------------------------------------------------------------

describe("an overflowing design whose column map has been frozen", () => {
  /** The seeded kitchen with its last wall-A column moved 100 mm along — **the whole column**, all
   *  three bands together, so the document stays a coherent kitchen and the only thing wrong with
   *  it is that the column now ends at 3600 on a 3560 mm wall. This is the shape ADR 0065 decision
   *  7 is about: a customer's edit that leaves a body past the end of its wall. */
  const OVERFLOWING_COLUMN: Design = {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.wall === "A" && placement.alongMm === 3200
        ? { ...placement, alongMm: 3300 }
        : placement,
    ),
  };

  /** Exactly what the store writes after any command (`apply-command-result.ts`): ADR 0053's
   *  frozen map, whose occupied half carries an entry for **every** column that holds a member —
   *  including the one that now reaches past the wall. */
  function withFrozenMap(design: Design): Design {
    const records = derivePlacementRecords(design, CATALOG);
    const frozen = projectFrozenMap(deriveColumns(records), records);
    return { ...design, columnExtents: [...(frozen.columnExtents ?? [])] };
  }

  it("is an overflow and nothing else before its map is frozen", () => {
    expect(findOverflowingPlacementIds(OVERFLOWING_COLUMN)).toStrictEqual([
      "p14",
      "p20",
      "p4",
    ]);
    expect(new Set(codesOf(OVERFLOWING_COLUMN))).toStrictEqual(
      new Set(["PLACEMENT_PAST_WALL_END"]),
    );
    expect(() => {
      assertDesignValidForCatalog(OVERFLOWING_COLUMN, CATALOG);
    }).not.toThrow();
  });

  /** **The demotion has to reach the extent of the very column the demoted body stands in.** The
   *  store freezes the map on every command, so a design that saves today stops saving the moment
   *  its owner touches anything else in the kitchen — and a row already carrying the frozen map
   *  answers 500 on load. "Saves and resumes with the warning intact" is not met for a design that
   *  has been edited once. */
  it("still saves and loads once its map is frozen", () => {
    const frozen = withFrozenMap(OVERFLOWING_COLUMN);

    expect(frozen.columnExtents?.length ?? 0).toBeGreaterThan(0);
    expect(fatalCodesOf(frozen)).toStrictEqual([]);
  });

  /** And the complement: the same column emptied leaves an `emptyColumns` entry past the wall end,
   *  whose `EMPTY_COLUMN_PAST_WALL_END` is the same rule under a different code. */
  it("still saves when the overflowing column is emptied instead", () => {
    const columns = deriveColumns(
      derivePlacementRecords(OVERFLOWING_COLUMN, CATALOG),
    );
    const remaining = OVERFLOWING_COLUMN.placements.filter(
      (placement) => placement.alongMm !== 3300,
    );
    const emptied: Design = {
      ...OVERFLOWING_COLUMN,
      placements: remaining,
      emptyColumns: [
        ...projectEmptyColumns(
          columns,
          derivePlacementRecords(
            { ...OVERFLOWING_COLUMN, placements: remaining },
            CATALOG,
          ),
        ),
      ],
    };

    expect(emptied.emptyColumns?.length ?? 0).toBeGreaterThan(0);
    expect(fatalCodesOf(emptied)).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Determinism, over generated documents rather than one shuffled fixture
// ---------------------------------------------------------------------------

describe("determinism", () => {
  const placementArbitrary = fc
    .uniqueArray(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 6 }),
        wall: fc.constantFrom("A" as const, "B" as const),
        alongMm: fc.integer({ min: 0, max: 5000 }),
        widthMm: fc.integer({ min: 1, max: 40 }).map((step) => step * 100),
      }),
      { selector: (candidate) => candidate.id, minLength: 0, maxLength: 12 },
    )
    .map((records) =>
      records.map((record) =>
        bodyOn(record.id, record.wall, record.alongMm, record.widthMm),
      ),
    );

  propertyTest.prop([
    placementArbitrary.chain((placements) =>
      fc.tuple(
        fc.constant(placements),
        fc.shuffledSubarray(placements, {
          minLength: placements.length,
          maxLength: placements.length,
        }),
      ),
    ),
  ])(
    "answers the same ids for every permutation of one document",
    ([original, permuted]) => {
      expect(findOverflowingPlacementIds(designOf(permuted))).toStrictEqual(
        findOverflowingPlacementIds(designOf(original)),
      );
    },
  );

  propertyTest.prop([placementArbitrary])(
    "answers in strictly ascending byte order",
    (placements) => {
      const reported = findOverflowingPlacementIds(designOf(placements));

      let previous: string | undefined;
      for (const id of reported) {
        if (previous !== undefined) {
          expect(compareOpaqueIds(previous, id)).toBeLessThan(0);
        }
        previous = id;
      }
    },
  );

  propertyTest.prop([placementArbitrary])(
    "never invents, drops or duplicates an id",
    (placements) => {
      const reported = findOverflowingPlacementIds(designOf(placements));
      const declared = new Set(placements.map((placement) => placement.id));

      expect(new Set(reported).size).toBe(reported.length);
      for (const id of reported) expect(declared.has(id)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// The extracted comparator changed nothing
// ---------------------------------------------------------------------------

describe("compareOpaqueIds, extracted from the projection", () => {
  /** The pair a locale-aware collation orders the other way: `"a".localeCompare("B")` is negative
   *  while `"a" < "B"` is false. If the extraction had reached for `localeCompare`, this is the
   *  document that would change order. */
  it("disagrees with localeCompare, and the projection follows the bytes", () => {
    expect("a".localeCompare("B")).toBeLessThan(0);
    expect(compareOpaqueIds("a", "B")).toBeGreaterThan(0);

    const groups = projectDesignForDisplay(
      designOf([bodyOn("a", "A", 1300), bodyOn("B", "A", 1300)]),
      CATALOG,
    );

    expect(
      groups.flatMap((group) =>
        group.entries.map((entry) => entry.placementId),
      ),
    ).toStrictEqual(["B", "a"]);
  });

  propertyTest.prop([fc.string({ maxLength: 8 }), fc.string({ maxLength: 8 })])(
    "is the sign of the raw code-unit comparison",
    (left, right) => {
      const expected = left === right ? 0 : left < right ? -1 : 1;

      expect(compareOpaqueIds(left, right)).toBe(expected);
    },
  );

  propertyTest.prop([
    fc.string({ maxLength: 6 }),
    fc.string({ maxLength: 6 }),
    fc.string({ maxLength: 6 }),
  ])("is a total order", (left, middle, right) => {
    expect(compareOpaqueIds(left, left)).toBe(0);
    // `|| 0` normalises `-0`, which `toBe` distinguishes from `0` and no comparator ever means.
    expect(Math.sign(compareOpaqueIds(left, middle)) || 0).toBe(
      -Math.sign(compareOpaqueIds(middle, left)) || 0,
    );
    if (
      compareOpaqueIds(left, middle) <= 0 &&
      compareOpaqueIds(middle, right) <= 0
    ) {
      expect(compareOpaqueIds(left, right)).toBeLessThanOrEqual(0);
    }
  });
});
