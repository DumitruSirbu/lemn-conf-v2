// M6 — the owner's ruling on ADR 0069's open question: an empty column must never be offered as an
// insertable opening that reaches past the end of its own wall.
//
// Mirrors `empty-column-ceiling.test.ts`'s split-half structure: direct calls to the pass for its
// own arithmetic, plus a `deriveColumns`-level fixture for the load-seam wiring. No dedicated
// `split-oversized-empty-columns.test.ts` exists to follow instead — that pass's own tests live in
// `empty-column-ceiling.test.ts` — so this file is this pass's equivalent home.
import { describe, expect, it } from "vitest";

import type { DesignRoom } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { finishesAtMm } from "../src/occupied-depth.js";
import {
  clipEmptyColumnsAtWallEnd,
  deriveColumns,
  derivePlacementRecords,
  mergeAdjacentEmptyColumns,
  type ColumnExtent,
  type PlacementRecord,
} from "../src/void-engine.js";

/** ADR 0065 §2's corrected pair: wall A is 3560 mm and wall B is 2830 mm — the same room the seeded
 *  kitchen carries, used here directly so the fixtures below read against the real bound. */
const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3560,
  depthMm: 2830,
  heightMm: 2600,
};

/** A member-less column at the given along-wall centre and width, on wall A unless overridden —
 *  structurally the `ColumnExtent` `deriveColumns` would hand this pass. */
function columnAt(
  alongM: number,
  widthM: number,
  overrides: Partial<ColumnExtent> = {},
): ColumnExtent {
  return {
    key: `A|${alongM.toFixed(2)}`,
    wall: "A",
    ry: 0,
    x: alongM,
    z: 0.29,
    w: widthM,
    d: 0.58,
    top: 0.82,
    regions: [[0, 0.82]],
    ...overrides,
  };
}

function mapOf(
  columns: readonly ColumnExtent[],
): ReadonlyMap<string, ColumnExtent> {
  return new Map(columns.map((column) => [column.key, column]));
}

/** A minimal occupied record, so a test can assert a column with a member is never touched. Only
 *  `col` is read by this pass; the rest exists to satisfy `PlacementRecord`'s shape. */
function recordAt(col: string): PlacementRecord {
  return {
    id: "p0",
    buildId: "base-600",
    kind: "base_cabinet",
    frame: { x: 0, z: 0.29, ry: 0, y0: 0, w: 0.6, h: 0.82, d: 0.58 },
    occupiedDepth: finishesAtMm(580),
    col,
    wall: "A",
    rotated: false,
    band: "base",
    widthMm: 600,
    heightMm: 820,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
  };
}

describe("clipping a member-less column to the wall it stands on", () => {
  it("leaves a column entirely within the wall untouched, by identity", () => {
    const columns = mapOf([columnAt(3.0, 0.4)]);

    expect(clipEmptyColumnsAtWallEnd(columns, [], ROOM)).toBe(columns);
  });

  // ADR 0067's one-sided rule, the same equality `findOverflowingPlacementIds` and
  // `EMPTY_COLUMN_PAST_WALL_END` are built on: a far edge exactly at the wall's own end still fits.
  it("leaves a column whose far edge lands exactly on the wall's own end untouched", () => {
    // 3.36 + 0.40 / 2 = 3.56, wall A's own length under `ROOM`.
    const columns = mapOf([columnAt(3.36, 0.4)]);

    expect(clipEmptyColumnsAtWallEnd(columns, [], ROOM)).toBe(columns);
  });

  it("clips a column whose far edge reaches past the wall, keeping its near edge fixed", () => {
    // Near edge 3.30 - 0.30 = 3.00, far edge 3.30 + 0.30 = 3.60 — 40 mm past the 3.56 m wall.
    const columns = mapOf([columnAt(3.3, 0.6)]);

    const clipped = clipEmptyColumnsAtWallEnd(columns, [], ROOM);

    expect(clipped).not.toBe(columns);
    expect([...clipped.keys()]).toStrictEqual(["A|3.28"]);
    const column = clipped.get("A|3.28");
    expect(column?.w).toBeCloseTo(0.56, 9);
    expect(column?.x).toBeCloseTo(3.28, 9);
    // Every frozen fact but the along-wall extent carries across untouched.
    expect(column?.d).toBe(0.58);
    expect(column?.top).toBe(0.82);
    expect(column?.regions).toStrictEqual([[0, 0.82]]);
  });

  it("drops a column that starts wholly past the wall, rather than publishing it empty", () => {
    const columns = mapOf([columnAt(3.8, 0.2)]);

    const clipped = clipEmptyColumnsAtWallEnd(columns, [], ROOM);

    expect(clipped.has("A|3.80")).toBe(false);
    expect(clipped.size).toBe(0);
  });

  // The boundary the owner's ruling names explicitly: a column landing exactly at the wall's own
  // end has zero clipped width — nothing insertable — so it is dropped rather than kept as an
  // empty, zero-width point.
  it("drops a column whose near edge lands exactly on the wall's own end", () => {
    // Near edge 3.66 - 0.10 = 3.56, the wall's own length.
    const columns = mapOf([columnAt(3.66, 0.2)]);

    const clipped = clipEmptyColumnsAtWallEnd(columns, [], ROOM);

    expect(clipped.size).toBe(0);
  });

  it("never touches an occupied column, however far its extent reaches past the wall", () => {
    const overflowing = columnAt(3.4, 0.9, { key: "A|3.40" });
    const columns = mapOf([overflowing]);
    const records = [recordAt("A|3.40")];

    expect(clipEmptyColumnsAtWallEnd(columns, records, ROOM)).toBe(columns);
  });

  it("leaves a column already off the millimetre grid untouched, rather than declining loudly", () => {
    // 3.4001 metres is not within a millimetre of an integer, so `toExactMillimetres` answers
    // `undefined` and this pass has nothing to say about it — the same choice `isWiderThanCap`
    // makes in `split-oversized-empty-columns.ts`.
    const columns = mapOf([columnAt(3.4001, 0.9)]);

    expect(clipEmptyColumnsAtWallEnd(columns, [], ROOM)).toBe(columns);
  });

  // **Reachable, not defence in depth.** Every catalogue width is even, so an even-width column
  // never puts this off the grid by itself — but the room's own along-wall length is not held to
  // that parity, and an odd one still lands the clipped centre on a half millimetre.
  it("declines a clip that would land off the millimetre grid, leaving the column as it was", () => {
    const oddRoom: DesignRoom = { ...ROOM, widthMm: 3561 };
    const original = columnAt(3.5, 0.4);
    const columns = mapOf([original]);

    const clipped = clipEmptyColumnsAtWallEnd(columns, [], oddRoom);

    expect(clipped.get(original.key)).toBe(original);
  });
});

describe("clipping at the load seam, before the merge runs", () => {
  /** Two member-less columns — 3.20-3.40 and 3.40-3.70 — the second of which individually fits
   *  under ADR 0052's 800 mm ceiling but reaches 140 mm past the 3.56 m wall. Clipping first, as
   *  `deriveColumns` does, shrinks the second to 3.40-3.56 and leaves it abutting and agreeing with
   *  the first on every merge condition — proof the merge sees the clip's output rather than the
   *  other way around, since a merge run first would still need to be clipped afterwards and this
   *  map only ever runs the pass once. */
  function loadTwoAdjacentSpaces(): ReadonlyMap<string, ColumnExtent> {
    const design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.wall === "B",
      ),
      emptyColumns: [
        {
          wall: "A" as const,
          alongMm: 3300,
          widthMm: 200,
          y0Mm: 0,
          topMm: 820,
          depthMm: 580,
        },
        {
          wall: "A" as const,
          alongMm: 3550,
          widthMm: 300,
          y0Mm: 0,
          topMm: 820,
          depthMm: 580,
        },
      ],
    };
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
    return deriveColumns(
      records,
      { emptyColumns: design.emptyColumns },
      design.room,
    );
  }

  it("clips the far column first, so the merge joins the clipped run into one", () => {
    const columns = loadTwoAdjacentSpaces();

    expect(columns.has("A|3.30")).toBe(false);
    expect(columns.has("A|3.55")).toBe(false);
    const merged = columns.get("A|3.38");
    expect(merged?.w).toBeCloseTo(0.36, 9);
    expect(merged?.x).toBeCloseTo(3.38, 9);
  });

  // Confirms the merge alone, given the clip's own output directly, agrees — so the fixture above
  // is measuring the wiring inside `deriveColumns` and not a coincidence of its own arithmetic.
  it("agrees with running the merge directly over the clip's own output", () => {
    const clipped = clipEmptyColumnsAtWallEnd(
      mapOf([columnAt(3.3, 0.2), columnAt(3.55, 0.3)]),
      [],
      ROOM,
    );

    const merged = mergeAdjacentEmptyColumns(clipped, []);

    expect([...merged.keys()]).toStrictEqual(["A|3.38"]);
  });
});

describe("the seeded kitchen", () => {
  // Recorded rather than assumed: wall A's placements end at 3500 on a 3560 mm wall and wall B's
  // end exactly at 2800 on a 2830 mm wall (the fixture's own comment), so no delete of a seeded body
  // — at either the 600 mm or the 700 mm depth — leaves a member-less column reaching past its
  // wall. This pass is therefore never exercised by the shipped kitchen alone; the store-level test
  // in `apps/web` constructs the one realistic case instead: a delete on a wall shorter than the
  // body it held.
  it("derives with no column reaching past either wall, at load", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);

    expect(
      clipEmptyColumnsAtWallEnd(columns, records, KITCHEN_L_DESIGN.room),
    ).toBe(columns);
  });
});
