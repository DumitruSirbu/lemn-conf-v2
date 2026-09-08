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

/** 4200 mm rather than the seeded 3600: `FREED_STRIP` reaches 3650, and an empty column is now
 *  contained by its wall run exactly as a placement is, so a 3600 mm room would make the fixture
 *  itself the thing under test. 4200 is the width the scene shell is built at
 *  (`kitchen-parts.ts`). */
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

/** A load through the wire, which is the only comparison that proves a field survives persistence:
 *  the in-memory object skips the schema and any non-serialisable value passes. */
function throughTheWire(design: Design): Design {
  return DesignSchema.parse(JSON.parse(canonicalSerializeDesign(design)));
}

describe("the cap and the byte budget carry each other", () => {
  /** The at-cap document the byte budget has to admit is the *largest* one the schema accepts, not
   *  a convenient one: 168 placements and 684 empty columns, every millimetre value at its ceiling
   *  and every identifier at `MAX_IDENTIFIER_LENGTH`.
   *
   *  The identifiers are what make this falsifiable. With the product's own short ids the widest
   *  document is about 80 kB and the pre-wave budget of 87040 already admitted it — so an at-cap
   *  document built from small numbers stays green with the budget left underived, and criterion 7's
   *  second half proves nothing. At full identifier length the same document is past the old budget,
   *  which is the case SEC-002's counter actually has to admit. */
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

  /** The cap is the number of distinct column keys two walls can present, and the entries below
   *  prove why that and not a width: 1 mm strips 10 mm apart are legal, non-overlapping and
   *  distinctly keyed, so any cap derived from a width floor or from §2's bands refuses a document
   *  the domain's own rules accept. Pinned as the arithmetic, not as 1262 alone. */
  it("is derived from the key resolution, not from a width or a band count", () => {
    expect(MAX_EMPTY_COLUMNS).toBe((6300 / 10 + 1) * 2);
    expect(MAX_EMPTY_COLUMNS).toBeGreaterThan(MAX_PLACEMENTS);
  });

  it("accepts a wall run of 1 mm strips at every distinct key", () => {
    // One per key, 10 mm apart, with the last pulled inside the run — a centre of 6301 would key
    // as 6.30 too but stand half a millimetre past the wall.
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

  /** A wall run filled edge to edge with 50 mm strips is the document the cap exists to admit. */
  it("accepts a full wall run of 50 mm strips as one document", () => {
    const strips = Array.from({ length: 126 }, (_, index) => ({
      ...FREED_STRIP,
      alongMm: 25 + index * 50,
      widthMm: 50,
    }));
    // The run the cap is derived from, so the room has to be the one it is derived from too: the
    // containment rule holds every strip inside the wall it is recorded on.
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

  /** The transition, swept rather than sampled: every start from 100 mm before the sink's end to
   *  100 mm after it, refused exactly while it is strictly inside. A `>=` comparison moves the
   *  transition by one millimetre and a `>` on the vertical predicate moves it too. */
  propertyTest.prop([fc.integer({ min: -100, max: 100 })], {
    // Pinned, because a sampled sweep may skip the one value the rule turns on and a boundary
    // nobody visits is a boundary nobody tests: measured, a `>=` mutant survived this sweep on
    // some seeds until these three were named.
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

  /** Vertically the same question: a wall-band space is legal only while it clears the sink's top,
   *  and touching it at 820 is contact, not overlap. */
  propertyTest.prop([fc.integer({ min: 780, max: 860 })], {
    examples: [[819], [820], [821]],
  })("refuses exactly the floors strictly below the sink's top", (floorMm) => {
    // 10 mm off the sink's own centre, which is the smallest offset that reaches a different
    // column key: an entry keyed to a column the placements own is refused outright now, and
    // this sweep is about the vertical boundary, not that one.
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

  /** The sweep sorts, so the answer must not depend on the order the document lists its entries
   *  in — a hostile document controls that order and a stateful sweep is where an ordering bug
   *  hides. Nine abutting strips, shuffled, must always be accepted. */
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

  /** One entry swallowing several others: containment is overlap, and a sweep that only compares
   *  neighbours would miss the far end of it. */
  it("names every entry a containing entry swallows", () => {
    // 800 rather than the 1000 this was written with: ADR 0052 caps an entry at the ceiling, and a
    // wider one would raise `EMPTY_COLUMN_WIDER_THAN_CAP` as well, which is a different rule than
    // the one under test. The three entries sit inside 2200–3000 so the swallowing is unchanged.
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

  /** Two walls are two places (§2). Every entry duplicated onto wall B at the same coordinate must
   *  change nothing, or the sweep is comparing runs that never meet. */
  it("keeps the same coordinates on both walls legal", () => {
    const onWallB = [FREED_STRIP, { ...FREED_STRIP, alongMm: 3725 }].map(
      (entry) => ({ ...entry, wall: "B" as const }),
    );

    // Wall B is bounded by the room's **depth** since ADR 0065 decision 5, and `BASE_DESIGN`'s is
    // 2400 while these entries reach 3800 — deepened here so the assertion measures the sweep and
    // not the fixture.
    const design = withEmptyColumns([
      FREED_STRIP,
      { ...FREED_STRIP, alongMm: 3725 },
      ...onWallB,
    ]);

    expect(
      codesFor({ ...design, room: { ...design.room, depthMm: 4200 } }),
    ).toStrictEqual([]);
  });

  /** An inverted interval vertically overlaps nothing, so without its own refusal it is a way to
   *  store an entry standing inside a cabinet and have the overlap sweep say nothing. The document
   *  must be refused, and the inversion is the code that says why. */
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

  /** Zero height is the boundary of the inversion rule; one millimetre above the floor is the
   *  thinnest legal extent. */
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
  /** Criterion 6's pinned answer. Recomputing both sides with `deriveColumns` would compare a
   *  mutant against itself; these are the seeded kitchen's columns as they stand before this wave,
   *  written down. */
  const PINNED_SEEDED_KEYS = [
    "A|0.30",
    "A|0.45",
    "A|0.75",
    "A|1.30",
    "A|2.00",
    "A|2.60",
    "A|3.20",
    "B|0.61",
    "B|0.74",
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
      // ADR 0073 decision 1: the member that won §3.2's MAX, recorded as the MAX is taken — the
      // fridge's 742 mm, which no cabinet-depth setting moves.
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

  /** §10's signature flow, through the wire: clear the column, and the opening it freed must still
   *  be the frozen 0..2600 extent rather than anything the neighbours suggest. The sink next to it
   *  tops out at 820, so a neighbour-derived answer is a different number. */
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

  /** The `regions` claim, checked against the derivation instead of taken on faith: `recomputeVoids`
   *  reads `min(regions)` and `top` and takes its occupied intervals from the current members, so a
   *  member-less column with one region `[y0, top]` publishes the same voids as one that kept its
   *  former members' intervals. Both maps here are member-less; only their `regions` differ. */
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

  /** …and the claim has a floor in it. `min(regions)` is the only part of `regions` that is read,
   *  so an entry whose `y0Mm` differs from the lowest former member moves where the opening starts.
   *  This is what 5B2b's projection must get right; recorded here as the contract it has to meet. */
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
  /** **The gap this file first pinned open, now closed.** A placement is held to the room
   *  (`PLACEMENT_PAST_WALL_END`, `PLACEMENT_ABOVE_ROOM`); an empty column used to be held to
   *  nothing but `MAX_DESIGN_DIMENSION_MM` and the overlap rule, so a hostile document could record
   *  a 2 m space nine metres along a 4.2 m wall, five metres up a 2.6 m room, and both seams
   *  accepted it — `deriveColumns` then put a column there, outside the shell, publishing openings
   *  a body can be offered into. It is refused now, at the wall and at the ceiling. */
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
      // ADR 0052, since wave 5G: 2000 mm is over the ceiling too. The containment codes are what
      // this test is about and they are unaffected — an entry outside the room is refused whether
      // or not it also breaks the width rule.
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

  /** The three bounds swept from two millimetres inside to two past, each with the transition
   *  pinned as an example: `findContainmentBreaches` decides all three with a single comparison
   *  apiece, and a comparison is only tested at the value it changes on. */
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

  /** **The other caller of the same helper, which had no acceptance boundary of its own.** The
   *  placement path asserted only its three refusals, so a helper loosened at the boundary — `>`
   *  to `>=`, `< 0` to `<= 0` — would have been red for empty columns and green for bodies, which
   *  is precisely the failure mode of one rule with two callers and one of them covered. */
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

  /** A body and a space with the same run get the same answer, or the two callers have drifted
   *  apart again whatever the helper says. */
  it("answers a body and a space standing in the same place the same way", () => {
    const pastTheEnd = WALL_RUN_MM + 1;
    const asAnEmptyColumn = codesFor(
      withEmptyColumns([
        { ...FREED_STRIP, alongMm: pastTheEnd - FREED_STRIP.widthMm / 2 },
      ]),
    );
    const asAPlacement = codesFor({
      ...BASE_DESIGN,
      placements: [{ ...SINK, alongMm: pastTheEnd - SINK.body.widthMm / 2 }],
    });

    expect(asAnEmptyColumn).toStrictEqual(["EMPTY_COLUMN_PAST_WALL_END"]);
    expect(asAPlacement).toStrictEqual(["PLACEMENT_PAST_WALL_END"]);
  });
});

describe("the floor a restored entry restores", () => {
  /** `y0Mm` is not decoration: `recomputeVoids` reads `min(regions)` as the column's floor, so an
   *  entry whose floor is not zero must restore *its own* floor. A wall-band space freed at 1500
   *  publishes an opening starting at 1500; starting it at the ground would hand the customer an
   *  opening through the base cabinets that are not there. */
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
  /** `deriveColumnKeyAt` rounds a metre value to two places, so the key is 10 mm granular while
   *  `alongMm` is not. Two entries 2 mm apart are legally non-overlapping — ADR 0043 leaves an
   *  empty column no width floor — and they address one key. Both are named: whichever lost the key
   *  would be a space the document records and the map does not have. */
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

  /** The same collision with a placement on the other side of it, which is the reachable half: a
   *  hostile document may record a wall-band space at the centre of an occupied base column, and
   *  the overlap rule accepts it because the two never meet vertically. It is refused on the key
   *  instead, at both seams — silently letting the placements win discarded a recorded space with
   *  no issue raised anywhere. */
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

  /** The refusal does not depend on where the offending entry sits in the array — a hostile
   *  document controls that order, and a rule that only reads the first entry is one a reordering
   *  walks straight through. */
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

  /** Every placement-derived column survives beside the stored entries, which is only true while
   *  no key collides — `addStoredEmptyColumns` no longer has a tie-break, so a colliding entry now
   *  *replaces* the column the placements built rather than being dropped. The refusal above is the
   *  only thing standing between a hostile document and that replacement. */
  it("keeps every placement-derived column intact beside the stored entries", () => {
    // Inside the seeded wall A, which ADR 0065 corrected to 3560 mm: the placements end at 3500,
    // so the strip takes the 60 mm that are left rather than the 100 it used to claim past the
    // wall's end.
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

  /** What the deleted drop branch became, stated so nobody restores it by accident and nobody
   *  mistakes it for harmless: with no tie-break, a stored entry at an occupied key **overwrites**
   *  the column the placements derived, and its bodies are left addressing a key whose extent is
   *  now the empty space. `deriveColumns` is a pure function with no validator inside it, so this
   *  is reachable from any caller that skips `validateDesignForCatalog` — both of today's seams do
   *  call it, and 5B2b's store seam must not be the one that does not. */
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
  /** The 900 mm entry this file recorded as Q5's durable half. It is still what a version 1 row may
   *  hold — every document written before wave 5G was written under a rule that bounded a merge and
   *  not a column — so it is the exact input the load path has to carry forward. */
  const OVERSIZED: EmptyColumn = {
    ...FREED_STRIP,
    alongMm: 3000,
    widthMm: 900,
    y0Mm: 0,
    topMm: 2600,
  };

  /** Its left edge is 2550, so the ceiling-sized piece is centred at 2950 and the 100 mm overflow at
   *  3400 — filled left to right, which is what `migrateFromV1` does to a span no command claimed. */
  const NEAR_PIECE: EmptyColumn = { ...OVERSIZED, alongMm: 2950, widthMm: 800 };
  const OVERFLOW_PIECE: EmptyColumn = {
    ...OVERSIZED,
    alongMm: 3400,
    widthMm: 100,
  };

  /** Criterion 5G-4. **The stored share link is what this protects.** A 900 mm column is executable
   *  — it renders, and all it does wrong is refuse `'fit'` inserts — so refusing the row would brick
   *  a link to close a bug that costs its holder nothing. It is normalised instead, before the
   *  validator sees it, and every millimetre is kept: the two pieces span 2550–3450 exactly as the
   *  one entry did. */
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

  /** The other half of criterion 5G-4, and DOM-001's rule that both seams refuse together: a
   *  version **2** document was written under ADR 0052, so an oversized entry in one is not a legacy
   *  shape to carry forward. Normalising it here as well would make the invariant unenforceable —
   *  nothing would ever be refused — which is the mutant this assertion exists to redden. */
  it("refuses the same entry in a version 2 document, at both seams", () => {
    const design = withEmptyColumns([OVERSIZED]);

    expect(codesFor(design)).toStrictEqual(["EMPTY_COLUMN_WIDER_THAN_CAP"]);
    expect(() => migrateDesign(2, throughTheWire(design), CATALOG)).toThrow(
      InvalidDesignError,
    );
  });

  /** What the customer gets out of the ceiling, measured rather than argued: the 900 mm opening no
   *  catalogue body could ever fill (`WIDTH_NOT_SUPPORTED`, every insertable width topping out at
   *  800) becomes an 800 mm opening a `base-cabinet` is built into. The narrow one is left as it is,
   *  which ADR 0037 says is a legal outcome. */
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
