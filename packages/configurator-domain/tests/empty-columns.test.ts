import { describe, expect, it } from "vitest";

import { MAX_DESIGN_BYTES, MAX_EMPTY_COLUMNS } from "../src/design-bounds.js";
import { DesignSchema } from "../src/design.js";
import type { Design, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { canonicalSerializeDesign } from "../src/serialize-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import {
  validateDesignForCatalog,
  type DesignValidationCode,
} from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  type Column,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

/** The 150 mm strip a 600 → 450 shrink leaves behind on wall A's base run: ADR 0044's own example,
 *  and the space that used to disappear on reload. */
const FREED_STRIP: EmptyColumn = {
  wall: "A",
  alongMm: 3575,
  widthMm: 150,
  y0Mm: 0,
  topMm: 820,
  depthMm: 580,
};

/** Wider than the seeded 3600 mm room on purpose: `FREED_STRIP` reaches 3650 mm, and an empty
 *  column is now contained by its wall run exactly as a placement is. 4200 mm is the width the
 *  scene shell is actually built at (`kitchen-parts.ts`). */
const VALID_DESIGN: Design = {
  room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [
    {
      id: "p0",
      wall: "A",
      alongMm: 1300,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

function withEmptyColumns(entries: EmptyColumn[]): Design {
  return { ...VALID_DESIGN, emptyColumns: entries };
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

describe("DesignSchema.emptyColumns", () => {
  it("parses a document that has no emptyColumns key at all", () => {
    const parsed = DesignSchema.parse(
      JSON.parse(JSON.stringify(KITCHEN_L_DESIGN)),
    );

    expect(parsed.emptyColumns).toBeUndefined();
  });

  it("leaves the column map of a document without empty columns untouched", () => {
    const records = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG);

    expect([...columnsOf(KITCHEN_L_DESIGN)]).toStrictEqual([
      ...deriveColumns(records, {}, KITCHEN_L_DESIGN.room),
    ]);
  });

  it("round-trips an entry through the wire unchanged", () => {
    const design = withEmptyColumns([FREED_STRIP]);

    const reloaded = DesignSchema.parse(
      JSON.parse(canonicalSerializeDesign(design)),
    );

    expect(reloaded.emptyColumns).toStrictEqual([FREED_STRIP]);
  });

  it("refuses one entry past the cap, at the field's own path", () => {
    const design = withEmptyColumns(
      Array.from({ length: MAX_EMPTY_COLUMNS + 1 }, () => FREED_STRIP),
    );

    const result = DesignSchema.safeParse(design);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toStrictEqual(["emptyColumns"]);
  });

  it("accepts a document at the cap and keeps it inside MAX_DESIGN_BYTES", () => {
    const atCap = Array.from({ length: MAX_EMPTY_COLUMNS }, (_, index) => ({
      ...FREED_STRIP,
      alongMm: index,
    }));
    const design = withEmptyColumns(atCap);

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(
      Buffer.byteLength(canonicalSerializeDesign(design), "utf8"),
    ).toBeLessThanOrEqual(MAX_DESIGN_BYTES);
  });

  it("caps the array at the distinct column keys two walls can present", () => {
    // 6300 is the longer run's, and since ADR 0124 both runs are 6300, so the value did not move.
    expect(MAX_EMPTY_COLUMNS).toBe((6300 / 10 + 1) * 2);
  });
});

describe("deriveColumns with stored empty columns", () => {
  it("adds a column with no member at the recorded coordinate and extent", () => {
    const column = columnsOf(withEmptyColumns([FREED_STRIP])).get("A|3.58");

    expect(column).toStrictEqual({
      key: "A|3.58",
      wall: "A",
      ry: 0,
      x: 3.575,
      z: 0.29,
      w: 0.15,
      d: 0.58,
      top: 0.82,
      regions: [[0, 0.82]],
      hasFullHeightUnder: false,
    });
  });

  it("puts a wall-B entry on wall B's own axes", () => {
    const onWallB: EmptyColumn = { ...FREED_STRIP, wall: "B", alongMm: 3000 };
    // This is about the axis swap, not about wall length — `VALID_DESIGN`'s own wall B
    // (`depthMm: 2400`) is shorter than 3000, which would otherwise clip the very entry the test
    // means to read back untouched.
    const design: Design = {
      ...withEmptyColumns([onWallB]),
      room: { ...VALID_DESIGN.room, depthMm: 4200 },
    };

    const column = columnsOf(design).get("B|3.00");

    expect(column?.x).toBe(0.29);
    expect(column?.z).toBe(3);
    expect(column?.ry).toBeCloseTo(Math.PI / 2, 12);
  });

  it("carries no empty column when the document declares none", () => {
    expect(columnsOf(VALID_DESIGN).size).toBe(1);
  });
});

describe("validateDesignForCatalog, empty columns", () => {
  it("accepts an entry that abuts a placement, because ADR 0046 merges those", () => {
    const abutting: EmptyColumn = { ...FREED_STRIP, alongMm: 1775 };

    expect(codesFor(withEmptyColumns([abutting]))).toStrictEqual([]);
  });

  it("refuses an entry overlapping a placement by one millimetre", () => {
    const overlapping: EmptyColumn = { ...FREED_STRIP, alongMm: 1774 };

    expect(codesFor(withEmptyColumns([overlapping]))).toStrictEqual([
      "EMPTY_COLUMN_OVERLAPS_PLACEMENT",
    ]);
  });

  it("accepts an entry in the band above a placement it does not stand over", () => {
    const overhead: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: 2500,
      widthMm: 800,
      y0Mm: 1500,
      topMm: 2200,
    };

    expect(codesFor(withEmptyColumns([overhead]))).toStrictEqual([]);
  });

  it("refuses an entry that reaches past the end of its wall run", () => {
    const pastTheEnd: EmptyColumn = { ...FREED_STRIP, alongMm: 4150 };

    expect(codesFor(withEmptyColumns([pastTheEnd]))).toStrictEqual([
      "EMPTY_COLUMN_PAST_WALL_END",
    ]);
  });

  it("refuses an entry that starts before its wall does", () => {
    const beforeTheStart: EmptyColumn = { ...FREED_STRIP, alongMm: 50 };

    expect(codesFor(withEmptyColumns([beforeTheStart]))).toStrictEqual([
      "EMPTY_COLUMN_BEFORE_WALL_START",
    ]);
  });

  it("refuses an entry whose top stands above the room", () => {
    const throughTheCeiling: EmptyColumn = { ...FREED_STRIP, topMm: 2601 };

    expect(codesFor(withEmptyColumns([throughTheCeiling]))).toStrictEqual([
      "EMPTY_COLUMN_ABOVE_ROOM",
    ]);
  });

  it("refuses an entry deeper than the room it stands in", () => {
    const throughTheWall: EmptyColumn = { ...FREED_STRIP, depthMm: 2401 };

    expect(codesFor(withEmptyColumns([throughTheWall]))).toStrictEqual([
      "EMPTY_COLUMN_DEEPER_THAN_ROOM",
    ]);
  });

  it("measures a wall-B entry's depth against the room's width", () => {
    const onWallB: EmptyColumn = {
      ...FREED_STRIP,
      wall: "B",
      alongMm: 1000,
      depthMm: 3000,
    };

    expect(codesFor(withEmptyColumns([onWallB]))).toStrictEqual([]);
    expect(
      codesFor(withEmptyColumns([{ ...onWallB, depthMm: 4201 }])),
    ).toStrictEqual(["EMPTY_COLUMN_DEEPER_THAN_ROOM"]);
  });

  it("accepts an entry that reaches exactly the end of its wall run", () => {
    const flushWithTheEnd: EmptyColumn = { ...FREED_STRIP, alongMm: 4125 };

    expect(codesFor(withEmptyColumns([flushWithTheEnd]))).toStrictEqual([]);
  });

  it("refuses an entry keyed to a column the placements already own", () => {
    const overhead: EmptyColumn = {
      ...FREED_STRIP,
      alongMm: 1300,
      widthMm: 800,
      y0Mm: 1500,
      topMm: 2200,
    };

    expect(codesFor(withEmptyColumns([overhead]))).toStrictEqual([
      "EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT",
    ]);
  });

  it("refuses two entries whose centres round to one column key", () => {
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
    expect(
      issues.every(
        (issue) => issue.code === "EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN",
      ),
    ).toBe(true);
  });

  /** Wall B is bounded by the room's **depth** since ADR 0065 decision 5, and this fixture's is
   *  2400 while `FREED_STRIP` reaches 3650 — so a wall-B twin needs a room deep enough to hold it
   *  or the fixture, not the key rule, is what the assertion measures. */
  function deepEnoughForWallB(entries: EmptyColumn[]): Design {
    const design = withEmptyColumns(entries);
    return { ...design, room: { ...design.room, depthMm: 4200 } };
  }

  it("accepts the same along-coordinate on the other wall", () => {
    const onWallB: EmptyColumn = { ...FREED_STRIP, wall: "B" };

    expect(codesFor(deepEnoughForWallB([FREED_STRIP, onWallB]))).toStrictEqual(
      [],
    );
  });

  it("accepts two entries that abut each other", () => {
    const neighbour: EmptyColumn = { ...FREED_STRIP, alongMm: 3725 };

    expect(codesFor(withEmptyColumns([FREED_STRIP, neighbour]))).toStrictEqual(
      [],
    );
  });

  it("refuses two entries overlapping by one millimetre, naming both", () => {
    const neighbour: EmptyColumn = { ...FREED_STRIP, alongMm: 3724 };

    const issues = validateDesignForCatalog(
      withEmptyColumns([FREED_STRIP, neighbour]),
      CATALOG,
    );

    expect(issues.map((issue) => issue.path)).toStrictEqual([
      "emptyColumns.0",
      "emptyColumns.1",
    ]);
    expect(
      issues.every(
        (issue) => issue.code === "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN",
      ),
    ).toBe(true);
  });

  it("refuses an extent whose top is not above its floor", () => {
    const inverted: EmptyColumn = { ...FREED_STRIP, y0Mm: 820, topMm: 820 };

    expect(codesFor(withEmptyColumns([inverted]))).toStrictEqual([
      "EMPTY_COLUMN_INVERTED",
    ]);
  });

  it("refuses an overlapping entry at the load seam too", () => {
    const overlapping: EmptyColumn = { ...FREED_STRIP, alongMm: 1774 };

    expect(() =>
      migrateDesign(1, withEmptyColumns([overlapping]), CATALOG),
    ).toThrow(/EMPTY_COLUMN_OVERLAPS_PLACEMENT/);
  });

  it("loads a legal entry through the load seam", () => {
    const design = withEmptyColumns([FREED_STRIP]);

    expect(migrateDesign(1, design, CATALOG).emptyColumns).toStrictEqual([
      FREED_STRIP,
    ]);
  });
});
