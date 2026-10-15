import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { insertBody } from "../src/commands/insert-body.js";
import {
  MAX_DESIGN_BYTES,
  MAX_DESIGN_DIMENSION_MM,
  MAX_EMPTY_COLUMNS,
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
  MAX_ROOM_WIDTH_MM,
} from "../src/design-bounds.js";
import { DesignSchema } from "../src/design.js";
import type { Design, DesignPlacement, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import { InvalidDesignError } from "../src/repository.js";
import { createFakeProbe } from "./support/fake-probe.js";
import { canonicalSerializeDesign } from "../src/serialize-design.js";
import {
  validateDesignForCatalog,
  type DesignValidationCode,
} from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
  type Column,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

const SINK: DesignPlacement = {
  id: "p0",
  wall: "A",
  alongMm: 1300,
  y0Mm: 0,
  body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
};

/** The 150 mm strip a 600 → 450 shrink leaves behind, at 3500..3650 on wall A's base run. */
const FREED_STRIP: EmptyColumn = {
  wall: "A",
  alongMm: 3575,
  widthMm: 150,
  y0Mm: 0,
  topMm: 820,
  depthMm: 580,
};

/** 4200 mm, not the seeded 3600: `FREED_STRIP` reaches 3650 and an empty column is held to its wall run.
 *  4200 is the width the scene shell is built at (`kitchen-parts.ts`). */
const BASE_DESIGN: Design = {
  room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [SINK],
  createdAt: NOW,
  updatedAt: NOW,
};

function withEmptyColumns(entries: EmptyColumn[]): Design {
  return { ...BASE_DESIGN, emptyColumns: entries };
}

function codesFor(design: Design): DesignValidationCode[] {
  return validateDesignForCatalog(design, CATALOG).map((issue) => issue.code);
}

function columnsOf(design: Design): ReadonlyMap<string, Column> {
  return deriveColumns(
    derivePlacementRecords(design, CATALOG),
    { emptyColumns: design.emptyColumns },
    design.room,
  );
}

/** A load through the wire is the only comparison that proves a field survives persistence: the in-memory
 *  object skips the schema. */
function throughTheWire(design: Design): Design {
  return DesignSchema.parse(JSON.parse(canonicalSerializeDesign(design)));
}

describe("the cap and the byte budget carry each other", () => {
  /** The largest document the schema accepts: every value at its ceiling and every identifier at
   *  `MAX_IDENTIFIER_LENGTH`. With short ids the document stays under the old 87040-byte budget, so only
   *  full-length identifiers make the byte-budget derivation falsifiable. */
  it("admits a document at both caps with every value at its widest", () => {
    const longestIdentifier = "x".repeat(MAX_IDENTIFIER_LENGTH);
    const widestPlacement = (index: number): DesignPlacement => ({
      id: `${longestIdentifier.slice(String(index).length)}${String(index)}`,
      wall: index % 2 === 0 ? "A" : "B",
      alongMm: MAX_DESIGN_DIMENSION_MM,
      y0Mm: MAX_DESIGN_DIMENSION_MM,
      body: {
        buildId: longestIdentifier,
        widthMm: MAX_DESIGN_DIMENSION_MM,
        heightMm: MAX_DESIGN_DIMENSION_MM,
      },
    });
    const widestEmptyColumn = (index: number): EmptyColumn => ({
      wall: index % 2 === 0 ? "A" : "B",
      alongMm: MAX_DESIGN_DIMENSION_MM,
      widthMm: MAX_DESIGN_DIMENSION_MM,
      y0Mm: MAX_DESIGN_DIMENSION_MM - 1,
      topMm: MAX_DESIGN_DIMENSION_MM,
      depthMm: MAX_DESIGN_DIMENSION_MM,
    });
    const design: Design = {
      ...BASE_DESIGN,
      placements: Array.from({ length: MAX_PLACEMENTS }, (_, index) =>
        widestPlacement(index),
      ),
      emptyColumns: Array.from({ length: MAX_EMPTY_COLUMNS }, (_, index) =>
        widestEmptyColumn(index),
      ),
    };

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(
      Buffer.byteLength(canonicalSerializeDesign(design), "utf8"),
    ).toBeLessThanOrEqual(MAX_DESIGN_BYTES);
  });

  it("accepts a wall run of 1 mm strips at every distinct key", () => {
    // One per key, 10 mm apart, the last pulled inside the run: a centre of 6301 keys as 6.30 too but stands
    // past the wall.
    const strips = Array.from({ length: 631 }, (_, index) => ({
      ...FREED_STRIP,
      alongMm: index < 630 ? index * 10 + 1 : MAX_ROOM_WIDTH_MM - 1,
      widthMm: 1,
    }));
    const design = {
      ...withEmptyColumns(strips),
      room: { ...BASE_DESIGN.room, widthMm: MAX_ROOM_WIDTH_MM },
      placements: [],
    };

    expect(strips.length * 2).toBeLessThanOrEqual(MAX_EMPTY_COLUMNS);
    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(codesFor(design)).toStrictEqual([]);
  });

  it("accepts a full wall run of 50 mm strips as one document", () => {
    const strips = Array.from({ length: 126 }, (_, index) => ({
      ...FREED_STRIP,
      alongMm: 25 + index * 50,
      widthMm: 50,
    }));
    // The room must be the one the cap is derived from: containment holds every strip inside its wall.
    const design = {
      ...withEmptyColumns(strips),
      room: { ...BASE_DESIGN.room, widthMm: MAX_ROOM_WIDTH_MM },
      placements: [],
    };

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(codesFor(design)).toStrictEqual([]);
  });

  it("names the field on the issue when one entry past the cap arrives", () => {
    const overCap = Array.from({ length: MAX_EMPTY_COLUMNS + 1 }, (_, i) => ({
      ...FREED_STRIP,
      alongMm: 25 + i,
    }));

    const result = DesignSchema.safeParse(withEmptyColumns(overCap));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toStrictEqual(["emptyColumns"]);
  });
});

describe("the overlap rule at and around its boundary", () => {
  const SINK_END_MM = 1700;

  function stripCentredSoItStartsAt(startMm: number): EmptyColumn {
    return { ...FREED_STRIP, alongMm: startMm + FREED_STRIP.widthMm / 2 };
  }

  propertyTest.prop([fc.integer({ min: -100, max: 100 })], {
    // Pinned examples: a sampled sweep may skip the one value the rule turns on (a `>=` mutant survived some
    // seeds without them).
    examples: [[-1], [0], [1]],
  })(
    "refuses exactly the starts strictly inside the sink's run",
    (offsetMm) => {
      const startMm = SINK_END_MM + offsetMm;
      const codes = codesFor(
        withEmptyColumns([stripCentredSoItStartsAt(startMm)]),
      );

      expect(codes).toStrictEqual(
        startMm < SINK_END_MM ? ["EMPTY_COLUMN_OVERLAPS_PLACEMENT"] : [],
      );
    },
  );

  /** Touching the sink's top at 820 is contact, not overlap. */
  propertyTest.prop([fc.integer({ min: 780, max: 860 })], {
    examples: [[819], [820], [821]],
  })("refuses exactly the floors strictly below the sink's top", (floorMm) => {
    // 10 mm off the sink's centre is the smallest offset that reaches a different column key; an entry on an
    // occupied key is refused outright.
    const overhead: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: SINK.alongMm + 10,
      widthMm: 800,
      y0Mm: floorMm,
      topMm: 2200,
    };

    expect(codesFor(withEmptyColumns([overhead]))).toStrictEqual(
      floorMm < 820 ? ["EMPTY_COLUMN_OVERLAPS_PLACEMENT"] : [],
    );
  });

  /** A hostile document controls entry order, and a stateful sweep is where an ordering bug hides. */
  propertyTest.prop([
    fc.shuffledSubarray(
      Array.from({ length: 9 }, (_, index) => ({
        ...FREED_STRIP,
        alongMm: 2075 + index * 150,
      })),
      { minLength: 9, maxLength: 9 },
    ),
  ])("accepts a run of abutting strips in any listed order", (shuffled) => {
    expect(codesFor(withEmptyColumns([...shuffled]))).toStrictEqual([]);
  });

  /** Containment is overlap: a sweep that only compares neighbours would miss the far end. */
  it("names every entry a containing entry swallows", () => {
    // 800 rather than 1000: ADR 0052 caps an entry at the ceiling, and a wider one would also raise
    // `EMPTY_COLUMN_WIDER_THAN_CAP`.
    const wide: EmptyColumn = { ...FREED_STRIP, alongMm: 2600, widthMm: 800 };
    const inside = [2300, 2500, 2900].map((alongMm) => ({
      ...FREED_STRIP,
      alongMm,
      widthMm: 100,
    }));

    const issues = validateDesignForCatalog(
      withEmptyColumns([wide, ...inside]),
      CATALOG,
    );

    expect(new Set(issues.map((issue) => issue.path))).toStrictEqual(
      new Set([
        "emptyColumns.0",
        "emptyColumns.1",
        "emptyColumns.2",
        "emptyColumns.3",
      ]),
    );
  });

  /** Two walls are two places (§2): the same coordinates on wall B must change nothing. */
  it("keeps the same coordinates on both walls legal", () => {
    const onWallB = [FREED_STRIP, { ...FREED_STRIP, alongMm: 3725 }].map(
      (entry) => ({ ...entry, wall: "B" as const }),
    );

    // Wall B is bounded by the room's depth (ADR 0065 decision 5), so the room is deepened below to hold these.
    const design = withEmptyColumns([
      FREED_STRIP,
      { ...FREED_STRIP, alongMm: 3725 },
      ...onWallB,
    ]);

    expect(
      codesFor({ ...design, room: { ...design.room, depthMm: 4200 } }),
    ).toStrictEqual([]);
  });

  /** An inverted interval overlaps nothing vertically, so it needs its own refusal or an entry inside a
   *  cabinet goes unnoticed. */
  it("refuses an inverted entry that sits inside a placement", () => {
    const inverted: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: SINK.alongMm,
      y0Mm: 500,
      topMm: 100,
    };

    const codes = codesFor(withEmptyColumns([inverted]));

    expect(codes).toContain("EMPTY_COLUMN_INVERTED");
    expect(codes.length).toBeGreaterThan(0);
  });

  it("refuses a zero-height extent and accepts a one-millimetre one", () => {
    expect(
      codesFor(withEmptyColumns([{ ...FREED_STRIP, y0Mm: 300, topMm: 300 }])),
    ).toStrictEqual(["EMPTY_COLUMN_INVERTED"]);
    expect(
      codesFor(withEmptyColumns([{ ...FREED_STRIP, y0Mm: 300, topMm: 301 }])),
    ).toStrictEqual([]);
  });

  /** Both seams, and different documents at each, so neither test can pass on the other's gate. */
  it("refuses an overlapping document at the load seam and a different one at the write seam", () => {
    const forTheLoadSeam = withEmptyColumns([
      { ...FREED_STRIP, alongMm: 1600 },
    ]);
    const forTheWriteSeam = withEmptyColumns([
      FREED_STRIP,
      { ...FREED_STRIP, alongMm: 3600 },
    ]);

    expect(() => migrateDesign(1, forTheLoadSeam, CATALOG)).toThrow(
      /EMPTY_COLUMN_OVERLAPS_PLACEMENT/,
    );
    expect(codesFor(forTheWriteSeam)).toStrictEqual([
      "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN",
      "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN",
    ]);
    expect(codesFor(forTheLoadSeam)).toStrictEqual([
      "EMPTY_COLUMN_OVERLAPS_PLACEMENT",
    ]);
  });
});

describe("a document with no emptyColumns key", () => {
  /** The seeded kitchen's columns, written down: recomputing both sides with `deriveColumns` would compare a
   *  mutant against itself. */
  const PINNED_SEEDED_KEYS = [
    "A|0.30",
    "A|0.45",
    "A|0.75",
    "A|1.30",
    "A|2.00",
    "A|2.60",
    "A|3.20",
    "B|0.61",
    "B|0.73",
    "B|1.20",
    "B|1.80",
    "B|2.45",
  ] as const;

  it("derives exactly the pinned column keys", () => {
    expect(
      [...columnsOf(throughTheWire(KITCHEN_L_DESIGN)).keys()].sort(),
    ).toStrictEqual([...PINNED_SEEDED_KEYS]);
  });

  it("derives the pinned extent for the seeded fridge column", () => {
    expect(
      columnsOf(throughTheWire(KITCHEN_L_DESIGN)).get("B|2.45"),
    ).toStrictEqual({
      key: "B|2.45",
      wall: "B",
      ry: Math.PI / 2,
      x: 0.371,
      z: 2.45,
      w: 0.7,
      d: 0.742,
      // The member that won §3.2's MAX: the fridge's 742 mm, which no cabinet-depth setting moves (ADR 0073).
      depthFromBuildId: "fridge-free-700",
      top: 2.6,
      regions: [
        [0, 1.85],
        [1.85, 2.6],
      ],
      hasFullHeightUnder: true,
    });
  });

  it("leaves the key absent rather than defaulting it to an empty array on the wire", () => {
    const reloaded = throughTheWire(KITCHEN_L_DESIGN);

    expect("emptyColumns" in reloaded).toBe(false);
    expect(canonicalSerializeDesign(reloaded)).not.toContain("emptyColumns");
  });
});

describe("a restored empty column against the space it replaced", () => {
  const CLEARED_KEY = "A|3.20";

  const THREE_BAND_COLUMN: DesignPlacement[] = [
    {
      id: "c0",
      wall: "A",
      alongMm: 3200,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 600, heightMm: 820 },
    },
    {
      id: "c1",
      wall: "A",
      alongMm: 3200,
      y0Mm: 1500,
      body: { buildId: "wall-2door-600", widthMm: 600, heightMm: 700 },
    },
  ];

  function designWith(placements: DesignPlacement[]): Design {
    return { ...BASE_DESIGN, placements: [SINK, ...placements] };
  }

  /** §10's signature flow, through the wire: the freed opening must be the frozen 0..2600 extent, not what the
   *  neighbours suggest; the sink next to it tops out at 820. */
  it("keeps the frozen extent of a fully cleared column across a reload", () => {
    const occupied = columnsOf(designWith(THREE_BAND_COLUMN));
    const frozen = occupied.get(CLEARED_KEY);
    const cleared = throughTheWire(
      withEmptyColumns([
        {
          wall: "A",
          alongMm: 3200,
          widthMm: 600,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
      ]),
    );

    const restored = columnsOf(cleared).get(CLEARED_KEY);

    expect(frozen?.top).toBe(2.2);
    expect(restored?.top).toBe(2.6);
    expect(restored?.w).toBe(0.6);
    expect(restored?.regions).toStrictEqual([[0, 2.6]]);
  });

  /** `recomputeVoids` reads only `min(regions)` and `top`, taking occupied intervals from current members.
   *  Both maps here are member-less and differ only in `regions`. */
  it("publishes identical voids whether regions are one interval or the former members'", () => {
    const singleInterval: Column = {
      key: CLEARED_KEY,
      wall: "A",
      ry: 0,
      x: 3.2,
      z: 0.29,
      w: 0.6,
      d: 0.58,
      top: 2.6,
      regions: [[0, 2.6]],
      hasFullHeightUnder: false,
    };
    const formerMembers: Column = {
      ...singleInterval,
      regions: [
        [0, 0.82],
        [1.5, 2.2],
      ],
    };

    const fromSingle = recomputeVoids(
      [],
      new Map([[CLEARED_KEY, singleInterval]]),
    );
    const fromMembers = recomputeVoids(
      [],
      new Map([[CLEARED_KEY, formerMembers]]),
    );

    expect(fromSingle).toStrictEqual(fromMembers);
    expect(fromSingle.length).toBe(3);
    expect(fromSingle.every((slot) => slot.spanH === 2.6)).toBe(true);
  });

  /** `min(regions)` is the only part of `regions` that is read, so an entry whose `y0Mm` differs from the
   *  lowest former member's floor moves where the opening starts. */
  it("moves the freed opening when y0 is not the lowest former member's floor", () => {
    const raised: Column = {
      key: CLEARED_KEY,
      wall: "A",
      ry: 0,
      x: 3.2,
      z: 0.29,
      w: 0.6,
      d: 0.58,
      top: 2.6,
      regions: [[1.5, 2.6]],
      hasFullHeightUnder: false,
    };

    const voids = recomputeVoids([], new Map([[CLEARED_KEY, raised]]));

    expect(voids[0]?.spanY0).toBe(1.5);
    expect(voids.every((slot) => slot.spanH === 1.1)).toBe(true);
  });
});

describe("what holds an empty column to the room", () => {
  it("refuses an entry that stands entirely outside the room", () => {
    const outsideTheRoom: EmptyColumn = {
      wall: "A",
      alongMm: 9000,
      widthMm: 2000,
      y0Mm: 5000,
      topMm: 9999,
      depthMm: 5000,
    };
    const design = withEmptyColumns([outsideTheRoom]);

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(codesFor(design)).toStrictEqual([
      "EMPTY_COLUMN_PAST_WALL_END",
      "EMPTY_COLUMN_ABOVE_ROOM",
      "EMPTY_COLUMN_DEEPER_THAN_ROOM",
      // 2000 mm also exceeds the width ceiling (ADR 0052).
      "EMPTY_COLUMN_WIDER_THAN_CAP",
    ]);
    expect(() => migrateDesign(1, throughTheWire(design), CATALOG)).toThrow(
      InvalidDesignError,
    );
  });
});

describe("the containment boundary, for both callers of the one helper", () => {
  const WALL_RUN_MM = 4200;
  const ROOM_HEIGHT_MM = 2600;

  /** The three bounds swept from two millimetres inside to two past, with the transition pinned: a comparison
   *  is only tested at the value it changes on. */
  propertyTest.prop([fc.integer({ min: -2, max: 2 })], {
    examples: [[-1], [0], [1]],
  })("holds an empty column's far end to the wall run", (offsetMm) => {
    const endMm = WALL_RUN_MM + offsetMm;
    const strip: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: endMm - FREED_STRIP.widthMm / 2,
    };

    expect(codesFor(withEmptyColumns([strip]))).toStrictEqual(
      endMm > WALL_RUN_MM ? ["EMPTY_COLUMN_PAST_WALL_END"] : [],
    );
  });

  propertyTest.prop([fc.integer({ min: -2, max: 2 })], {
    examples: [[-1], [0], [1]],
  })("holds an empty column's near end to the wall start", (offsetMm) => {
    const startMm = offsetMm;
    const strip: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: startMm + FREED_STRIP.widthMm / 2,
    };

    expect(codesFor(withEmptyColumns([strip]))).toStrictEqual(
      startMm < 0 ? ["EMPTY_COLUMN_BEFORE_WALL_START"] : [],
    );
  });

  propertyTest.prop([fc.integer({ min: -2, max: 2 })], {
    examples: [[-1], [0], [1]],
  })("holds an empty column's top to the room height", (offsetMm) => {
    const topMm = ROOM_HEIGHT_MM + offsetMm;

    expect(
      codesFor(withEmptyColumns([{ ...FREED_STRIP, alongMm: 3000, topMm }])),
    ).toStrictEqual(topMm > ROOM_HEIGHT_MM ? ["EMPTY_COLUMN_ABOVE_ROOM"] : []);
  });

  /** The placement path is the other caller of the helper: a loosened boundary (`>` to `>=`) would be red for
   *  empty columns and green for bodies unless it has its own acceptance boundary. */
  propertyTest.prop([fc.integer({ min: -2, max: 2 })], {
    examples: [[-1], [0], [1]],
  })("holds a placement's far end to the same wall run", (offsetMm) => {
    const endMm = WALL_RUN_MM + offsetMm;
    const design: Design = {
      ...BASE_DESIGN,
      placements: [{ ...SINK, alongMm: endMm - SINK.body.widthMm / 2 }],
    };

    expect(codesFor(design)).toStrictEqual(
      endMm > WALL_RUN_MM ? ["PLACEMENT_PAST_WALL_END"] : [],
    );
  });

  propertyTest.prop([fc.integer({ min: -2, max: 2 })], {
    examples: [[-1], [0], [1]],
  })("holds a placement's near end to the same wall start", (offsetMm) => {
    const startMm = offsetMm;
    const design: Design = {
      ...BASE_DESIGN,
      placements: [{ ...SINK, alongMm: startMm + SINK.body.widthMm / 2 }],
    };

    expect(codesFor(design)).toStrictEqual(
      startMm < 0 ? ["PLACEMENT_BEFORE_WALL_START"] : [],
    );
  });

  propertyTest.prop([fc.integer({ min: -2, max: 2 })], {
    examples: [[-1], [0], [1]],
  })("holds a placement's top to the same room height", (offsetMm) => {
    const topMm = ROOM_HEIGHT_MM + offsetMm;
    const design: Design = {
      ...BASE_DESIGN,
      placements: [{ ...SINK, y0Mm: topMm - SINK.body.heightMm }],
    };

    expect(codesFor(design)).toStrictEqual(
      topMm > ROOM_HEIGHT_MM ? ["PLACEMENT_ABOVE_ROOM"] : [],
    );
  });
});

describe("the floor a restored entry restores", () => {
  /** `recomputeVoids` reads `min(regions)` as the column's floor, so a wall-band entry restores its own floor. */
  it("restores a wall-band entry at its own floor, not at the ground", () => {
    const wallBand: EmptyColumn = {
      wall: "A",
      alongMm: 3000,
      widthMm: 600,
      y0Mm: 1500,
      topMm: 2200,
      depthMm: 350,
    };

    const column = columnsOf(withEmptyColumns([wallBand])).get("A|3.00");

    expect(column?.regions).toStrictEqual([[1.5, 2.2]]);
    expect(column?.top).toBe(2.2);
  });

  it("publishes the freed opening from that floor upwards", () => {
    const wallBand: EmptyColumn = {
      wall: "A",
      alongMm: 3000,
      widthMm: 600,
      y0Mm: 1500,
      topMm: 2200,
      depthMm: 350,
    };
    const design = withEmptyColumns([wallBand]);

    const voids = recomputeVoids(
      derivePlacementRecords(design, CATALOG),
      columnsOf(design),
    ).filter((slot) => slot.col === "A|3.00");

    expect(voids.length).toBe(1);
    expect(voids[0]?.spanY0).toBe(1.5);
    expect(voids[0]?.spanH).toBeCloseTo(0.7, 12);
  });
});

describe("the key a restored entry lands under", () => {
  /** `deriveColumnKeyAt` rounds to two places, so keys are 10 mm granular while `alongMm` is not: two entries
   *  2 mm apart are legal (ADR 0043 gives an empty column no width floor) yet address one key. */
  it("refuses two legal entries that round to one key, naming both", () => {
    const first: EmptyColumn = { ...FREED_STRIP, alongMm: 3576, widthMm: 2 };
    const second: EmptyColumn = { ...FREED_STRIP, alongMm: 3578, widthMm: 2 };

    const issues = validateDesignForCatalog(
      withEmptyColumns([first, second]),
      CATALOG,
    );

    expect(issues.map((issue) => issue.path)).toStrictEqual([
      "emptyColumns.0",
      "emptyColumns.1",
    ]);
    expect(new Set(issues.map((issue) => issue.code))).toStrictEqual(
      new Set(["EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN"]),
    );
  });

  /** The reachable half: a wall-band space at the centre of an occupied base column never meets the placement
   *  vertically, so the overlap rule accepts it and only the key rule refuses it, at both seams. */
  it("refuses a legal wall-band entry that shares its key with an occupied column", () => {
    const overhead: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: SINK.alongMm,
      widthMm: 800,
      y0Mm: 1500,
      topMm: 2200,
    };
    const design = withEmptyColumns([overhead]);

    expect(codesFor(design)).toStrictEqual([
      "EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT",
    ]);
    expect(() => migrateDesign(1, throughTheWire(design), CATALOG)).toThrow(
      InvalidDesignError,
    );
  });

  it("refuses the colliding entry whatever order the entries arrive in", () => {
    const overhead: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: SINK.alongMm,
      widthMm: 800,
      y0Mm: 1500,
      topMm: 2200,
    };
    const other: EmptyColumn = { ...FREED_STRIP };

    expect(codesFor(withEmptyColumns([overhead, other]))).toStrictEqual([
      "EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT",
    ]);
    expect(codesFor(withEmptyColumns([other, overhead]))).toStrictEqual([
      "EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT",
    ]);
  });

  /** Placement-derived columns survive beside stored entries only while no key collides:
   *  `addStoredEmptyColumns` has no tie-break, so a colliding entry replaces the column the placements built. */
  it("keeps every placement-derived column intact beside the stored entries", () => {
    // Inside the seeded wall A (3560 mm, ADR 0065): the placements end at 3500, leaving 60 mm for the strip.
    const design = {
      ...withEmptyColumns([{ ...FREED_STRIP, alongMm: 3530, widthMm: 60 }]),
      placements: KITCHEN_L_DESIGN.placements,
      room: KITCHEN_L_DESIGN.room,
    };

    const columns = columnsOf(design);

    expect(columns.get("B|2.45")?.w).toBe(0.7);
    expect(columns.get("A|3.53")?.w).toBe(0.06);
    expect(columns.size).toBe(13);
    expect(codesFor(design)).toStrictEqual([]);
  });

  /** With no tie-break a stored entry at an occupied key overwrites the derived column, and its bodies address
   *  a key whose extent is the empty space. `deriveColumns` has no validator inside it, so every caller must
   *  run `validateDesignForCatalog` first. */
  it("lets a colliding entry replace the derived column, which is why it is refused", () => {
    const colliding: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: SINK.alongMm,
      widthMm: 800,
      y0Mm: 1500,
      topMm: 2200,
    };

    const columns = columnsOf(withEmptyColumns([colliding]));

    expect(columns.get("A|1.30")?.top).toBe(2.2);
    expect(columns.get("A|1.30")?.regions).toStrictEqual([[1.5, 2.2]]);
    expect(codesFor(withEmptyColumns([colliding]))).toStrictEqual([
      "EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT",
    ]);
  });
});

describe("Q5, closed: 800 mm is the ceiling on any empty column (ADR 0052)", () => {
  /** The 900 mm entry a version 1 row may hold, written before the ceiling (ADR 0052); the load path must
   *  carry it forward. */
  const OVERSIZED: EmptyColumn = {
    ...FREED_STRIP,
    alongMm: 3000,
    widthMm: 900,
    y0Mm: 0,
    topMm: 2600,
  };

  /** Its left edge is 2550, so the ceiling-sized piece is centred at 2950 and the 100 mm overflow at 3400,
   *  filled left to right as `migrateFromV1` does. */
  const NEAR_PIECE: EmptyColumn = { ...OVERSIZED, alongMm: 2950, widthMm: 800 };
  const OVERFLOW_PIECE: EmptyColumn = {
    ...OVERSIZED,
    alongMm: 3400,
    widthMm: 100,
  };

  /** A stored share link holding a 900 mm column must still load: it is normalised before the validator sees
   *  it, keeping every millimetre (2550–3450). */
  it("loads a version 1 row's 900 mm entry as an 800 and a 100", () => {
    const reloaded = migrateDesign(
      1,
      throughTheWire(withEmptyColumns([OVERSIZED])),
      CATALOG,
    );

    expect(reloaded.emptyColumns).toStrictEqual([NEAR_PIECE, OVERFLOW_PIECE]);
    const columns = columnsOf(reloaded);
    expect(columns.get("A|2.95")?.w).toBeCloseTo(0.8, 12);
    expect(columns.get("A|3.40")?.w).toBeCloseTo(0.1, 12);
    expect(columns.get("A|3.00")).toBeUndefined();
  });

  /** A version 2 document was written under the ceiling, so an oversized entry is refused, not normalised;
   *  normalising it too would leave nothing ever refused. */
  it("refuses the same entry in a version 2 document, at both seams", () => {
    const design = withEmptyColumns([OVERSIZED]);

    expect(codesFor(design)).toStrictEqual(["EMPTY_COLUMN_WIDER_THAN_CAP"]);
    expect(() => migrateDesign(2, throughTheWire(design), CATALOG)).toThrow(
      InvalidDesignError,
    );
  });

  /** The 900 mm opening no catalogue body fills (`WIDTH_NOT_SUPPORTED`, widths top out at 800) becomes an
   *  800 mm opening a `base-cabinet` is built into. */
  it("publishes an opening the widest catalogue body now fits", () => {
    const design = migrateDesign(
      1,
      throughTheWire(withEmptyColumns([OVERSIZED])),
      CATALOG,
    );
    const columns = columnsOf(design);
    const records = derivePlacementRecords(design, CATALOG);
    const voids = recomputeVoids(records, columns);
    const opening = voids.find((slot) => slot.col === "A|2.95");

    const result = insertBody({
      design,
      catalog: CATALOG,
      columns,
      voids,
      target: { kind: "void", id: opening?.id ?? "" },
      buildId: "base-cabinet",
      probe: createFakeProbe({ catalog: CATALOG }),
      occurredAt: NOW,
    });

    expect(opening?.w).toBeCloseTo(0.8, 12);
    expect(result.ok).toBe(true);
  });
});
