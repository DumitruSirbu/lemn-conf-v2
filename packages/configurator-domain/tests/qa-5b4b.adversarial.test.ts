import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { VacatedOpening } from "../src/commands/command-result.js";
import {
  DesignSchema,
  type Design,
  type DesignRoom,
  type EmptyColumn,
} from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../src/module-grid.js";
import { toExactMillimetres } from "../src/millimetres.js";
import { alongWallCoordinate, deriveColumnKeyAt } from "../src/module-grid.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { findVacatedVoid } from "../src/queries/vacated-void.js";
import { COMPOSITION_WIDTH_LIMIT_MM } from "../src/generation/leftover-rule.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import {
  deriveColumns,
  derivePlacementRecords,
  mergeAdjacentEmptyColumns,
  projectEmptyColumns,
  recomputeVoids,
  withCurrentFullHeightMembers,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

/** A full-height cleared space, so a fixture that varies one frozen fact says which one. */
const FULL_HEIGHT_SPACE = { y0Mm: 0, topMm: 2600, depthMm: 580 } as const;

function emptySpace(
  alongMm: number,
  widthMm: number,
  overrides: Partial<EmptyColumn> = {},
): EmptyColumn {
  return { wall: "A", alongMm, widthMm, ...FULL_HEIGHT_SPACE, ...overrides };
}

function designWith(
  emptyColumns: readonly EmptyColumn[],
  placements: readonly unknown[] = [],
): Design {
  return DesignSchema.parse({
    room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements,
    emptyColumns,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Loaded {
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
}

/** `mergeWidthLimitMm` omitted is the editor's load; composition's limit is passed to pin the capped scan. */
function load(design: Design, mergeWidthLimitMm?: number): Loaded {
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveColumns(
    records,
    { emptyColumns: design.emptyColumns },
    design.room,
    mergeWidthLimitMm,
  );
  return { columns, records, voids: recomputeVoids(records, columns) };
}

/** Wide enough that `loadStored`'s widest sweep (buckets up to 27, at 150 mm cells) never reaches the wall's
 *  own end; wall-end clipping has its own test. */
const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 7000,
  depthMm: 7000,
  heightMm: 2600,
};

/** The stored spaces straight into `deriveColumns`, with no placements: a round trip on a frozen map. */
function loadStored(emptyColumns: readonly EmptyColumn[]): Loaded {
  const columns = deriveColumns([], { emptyColumns: emptyColumns }, ROOM);
  return { columns, records: [], voids: recomputeVoids([], columns) };
}

interface ExtentMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

function extentMmOf(column: Column): ExtentMm {
  const centreMm = toExactMillimetres(
    column.wall === "A" ? column.x : column.z,
  );
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined) {
    throw new Error(`Column ${column.key} is not on whole millimetres`);
  }
  return { centreMm, widthMm };
}

/** Key and extent together, over the empty columns only — a widths-only answer is green under a
 *  scan running the other way, and a keys-only one is green under a merge that forgets to vacate. */
function emptyExtentsOf(loaded: Loaded): Record<string, ExtentMm> {
  const occupied = new Set(loaded.records.map((record) => record.col));
  const extents: Record<string, ExtentMm> = {};
  for (const [key, column] of loaded.columns) {
    if (occupied.has(key)) continue;
    extents[key] = extentMmOf(column);
  }
  return extents;
}

/** Abutting spaces laid from one edge: each centre is the running edge plus half the width. */
function layOutFromLeftEdge(
  widths: readonly number[],
  firstEdgeMm: number,
  overrides: Partial<EmptyColumn> = {},
): EmptyColumn[] {
  const spaces: EmptyColumn[] = [];
  let edgeMm = firstEdgeMm;
  for (const widthMm of widths) {
    spaces.push(emptySpace(edgeMm + widthMm / 2, widthMm, overrides));
    edgeMm += widthMm;
  }
  return spaces;
}

describe("a block is the widest run under the limit, not the first pair under it", () => {
  // ADR 0046 rule 1 is *widest*: a scan that stops every block at two members passes every pair-plus-leftover
  // fixture, and four 200s is the shortest run where two-at-a-time and widest part company.
  it("merges four abutting 200s into one 800, not into two 400s", () => {
    const loaded = load(
      designWith(layOutFromLeftEdge([200, 200, 200, 200], 1000)),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.40": { centreMm: 1400, widthMm: 800 },
    });
  });

  // Iterated to a fixpoint, a pair-at-a-time scan reaches the widest block whenever every pair fits; at a finite
  // limit it parts company with it once the pairs it took no longer fit together.
  it("takes the widest run at composition's 800 mm limit: 200 + 200 + 300 + 300 is 700 + 300, not 400 + 600", () => {
    const loaded = load(
      designWith(layOutFromLeftEdge([200, 200, 300, 300], 1000)),
      COMPOSITION_WIDTH_LIMIT_MM,
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.35": { centreMm: 1350, widthMm: 700 },
      "A|1.85": { centreMm: 1850, widthMm: 300 },
    });
  });

  // A mutant seeding each run with the previous block's accumulated total leaves three 300s and 300 + 500 + 300
  // unchanged and stays a fixpoint. Six 200s shows it: carrying 800 forward makes the second block a single 200
  // instead of a 400. Only a finite limit has a first block that hits it, so this runs at composition's.
  it("takes a second block at its own full width after a first block hit composition's 800 mm limit", () => {
    const loaded = load(
      designWith(layOutFromLeftEdge([200, 200, 200, 200, 200, 200], 1000)),
      COMPOSITION_WIDTH_LIMIT_MM,
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.40": { centreMm: 1400, widthMm: 800 },
      "A|2.00": { centreMm: 2000, widthMm: 400 },
    });
  });

  it("derives six abutting 200s at the load seam as one 1200 mm column", () => {
    const loaded = load(
      designWith(layOutFromLeftEdge([200, 200, 200, 200, 200, 200], 1000)),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.60": { centreMm: 1600, widthMm: 1200 },
    });
  });

  // A block capped at two members is a fixpoint on two three-column chains, so this chain is longer.
  it("returns its own output unchanged on a six-column chain", () => {
    const first = load(
      designWith(layOutFromLeftEdge([200, 200, 200, 200, 200, 200], 1000)),
    );

    const again = load(designWith(projectEmptyColumns(first.columns, [])));

    expect(emptyExtentsOf(again)).toEqual(emptyExtentsOf(first));
  });
});

describe("the merge conserves the wall it merges, which is what the restated round trip rests on", () => {
  // What survives a correct merge is conservation: the millimetres of wall the frozen columns own equal those the
  // restored ones own, and every frozen span lies inside exactly one restored span. A dropped or moved column is
  // red whatever the merge does, so the restated round-trip property is not weakened to fit.
  propertyTest.prop([
    fc.uniqueArray(fc.integer({ min: 0, max: 27 }), {
      minLength: 1,
      maxLength: 12,
    }),
  ])("owns the same millimetres of wall after a round trip", (buckets) => {
    // 150 mm cells on a 150 mm lattice, so neighbouring buckets abut and merge while the rest do not.
    const frozen = loadStored(
      buckets.map((bucket) => emptySpace(bucket * 150 + 75, 150)),
    );

    const restored = loadStored(projectEmptyColumns(frozen.columns, []));

    expect(coveredMillimetresOf(restored)).toStrictEqual(
      coveredMillimetresOf(frozen),
    );
    for (const span of spansOf(frozen)) {
      expect(
        spansOf(restored).filter(
          (candidate) =>
            candidate.leftMm <= span.leftMm &&
            candidate.rightMm >= span.rightMm,
        ),
      ).toHaveLength(1);
    }
  });
});

interface SpanMm {
  readonly leftMm: number;
  readonly rightMm: number;
}

function spansOf(loaded: Loaded): readonly SpanMm[] {
  return Object.values(emptyExtentsOf(loaded)).map((extent) => ({
    leftMm: extent.centreMm - extent.widthMm / 2,
    rightMm: extent.centreMm + extent.widthMm / 2,
  }));
}

/** Every whole millimetre of wall the empty columns cover, as a sorted list — a set rather than a
 *  sum, so a merge that both lost a column and widened another is still red. */
function coveredMillimetresOf(loaded: Loaded): readonly number[] {
  const covered = new Set<number>();
  for (const span of spansOf(loaded)) {
    for (let mm = Math.ceil(span.leftMm); mm < span.rightMm; mm += 1) {
      covered.add(mm);
    }
  }
  return [...covered].sort((left, right) => left - right);
}

describe("the depth envelope neither invents depth nor merges across a real difference", () => {
  // A cleared wall-depth column beside a cleared base-depth one, a case ADR 0046 rule 2 does not name: 270 mm
  // apart is far past `LEVEL_SNAP_M`, so they stay two and each keeps its depth.
  it("keeps a 330 mm wall column out of a 600 mm base column", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300, { depthMm: 330 }),
        emptySpace(2300, 300, { depthMm: 600 }),
      ]),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "A|2.30",
    ]);
    expect(depthMmOfOpeningIn(loaded, "A|2.00")).toBe(330);
    expect(depthMmOfOpeningIn(loaded, "A|2.30")).toBe(600);
  });

  // The envelope is `min(d)`, not `max(d)`: columns 20 mm apart in depth merge and publish the shallower,
  // because offering the extra 20 mm would be depth invented (ADR 0046's note). A switch to `max` must be red.
  it("publishes the shallower depth when two columns merge inside the tolerance", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300, { depthMm: 580 }),
        emptySpace(2300, 300, { depthMm: 600 }),
      ]),
    );

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|2.15": { centreMm: 2150, widthMm: 600 },
    });
    expect(depthMmOfOpeningIn(loaded, "A|2.15")).toBe(580);
  });

  // One millimetre past the tolerance they are two columns again: the predicate compares against `LEVEL_SNAP_M`.
  it("keeps two columns 21 mm apart in depth separate", () => {
    const loaded = load(
      designWith([
        emptySpace(2000, 300, { depthMm: 580 }),
        emptySpace(2300, 300, { depthMm: 601 }),
      ]),
    );

    expect(Object.keys(emptyExtentsOf(loaded)).sort()).toEqual([
      "A|2.00",
      "A|2.30",
    ]);
  });
});

function depthMmOfOpeningIn(loaded: Loaded, key: string): number {
  const opening = loaded.voids.find((record) => record.col === key);
  if (!opening) throw new Error(`No opening published in ${key}`);
  return Math.round(opening.d * 1000);
}

describe("geometry, and not the cap, is what stops a merge across a standing body", () => {
  /** A real 800 mm sink seated across 1900–2700. The seeded corner cannot demonstrate this: `A|0.30` + `A|0.75`
   *  stand above the corner base and key onto its column, so the key guard, not `standsIn`, turns them away. */
  const SINK_ACROSS_THE_RUN = [
    {
      id: "p0",
      wall: "A",
      alongMm: 2300,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
    },
  ];
  const RUN_OVER_THE_SINK = [emptySpace(1700, 300), emptySpace(2000, 300)];

  it("merges the run when nothing stands in it", () => {
    const loaded = load(designWith(RUN_OVER_THE_SINK));

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.85": { centreMm: 1850, widthMm: 600 },
    });
    expect(600).toBeLessThanOrEqual(MAX_EMPTY_COLUMN_WIDTH_MM);
  });

  // Same run, same widths, same cap; only a body standing under it differs. Touching edges alone would merge.
  it("declines the identical run once a body stands across it", () => {
    const loaded = load(designWith(RUN_OVER_THE_SINK, SINK_ACROSS_THE_RUN));

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.70": { centreMm: 1700, widthMm: 300 },
      "A|2.00": { centreMm: 2000, widthMm: 300 },
    });
    expect(loaded.voids.some((record) => record.col === "A|1.85")).toBe(false);
  });
});

describe("an unmergeable run is declined, and stays projectable on every field", () => {
  // Two 51 mm spaces laid from a half-millimetre edge are each on an integer centre (what a document stores)
  // while their merged centre is 1050.5, so the merge leaves them alone.
  it("leaves an odd-total run of two unmerged rather than keying it half a millimetre out", () => {
    const loaded = load(designWith(layOutFromLeftEdge([51, 51], 999.5)));

    expect(emptyExtentsOf(loaded)).toEqual({
      "A|1.02": { centreMm: 1025, widthMm: 51 },
      "A|1.08": { centreMm: 1076, widthMm: 51 },
    });
    expect(() =>
      projectEmptyColumns(loaded.columns, loaded.records),
    ).not.toThrow();
  });

  // Every projected field is whole: `landsOnWholeMillimetres` guards centre and width, while `y0Mm`, `topMm` and
  // `depthMm` are whole only because `measure` refused every column that was not; swept, so that is asserted.
  propertyTest.prop([
    fc.boolean(),
    fc.array(fc.integer({ min: 25, max: 400 }), { minLength: 2, maxLength: 5 }),
    fc.integer({ min: 300, max: 620 }),
    fc.integer({ min: 1200, max: 2600 }),
  ])(
    "projects every field of every column it publishes, merged or not",
    (odd, halfWidths, depthMm, topMm) => {
      const widths = halfWidths.map((half) => (odd ? 2 * half + 1 : 2 * half));
      const design = designWith(
        layOutFromLeftEdge(widths, odd ? 999.5 : 1000, { depthMm, topMm }),
      );
      // Conservation, not wall-end clipping, is the subject: widened so five 800 mm columns from a 1000 mm edge
      // never reach wall A's own end.
      const loaded = load({
        ...design,
        room: { ...design.room, widthMm: 6000 },
      });

      const projected = projectEmptyColumns(loaded.columns, loaded.records);

      for (const entry of projected) {
        expect(Number.isInteger(entry.alongMm)).toBe(true);
        expect(Number.isInteger(entry.widthMm)).toBe(true);
        expect(Number.isInteger(entry.y0Mm)).toBe(true);
        expect(Number.isInteger(entry.topMm)).toBe(true);
        expect(Number.isInteger(entry.depthMm)).toBe(true);
        // Never invented: the merge takes the conservative envelope, so no column is deeper or taller than its members.
        expect(entry.depthMm).toBe(depthMm);
        expect(entry.topMm).toBe(topMm);
      }
      expect(projected.reduce((sum, entry) => sum + entry.widthMm, 0)).toBe(
        widths.reduce((sum, width) => sum + width, 0),
      );
    },
  );
});

/** The seeded kitchen is fully occupied and publishes no openings, so the hob column (all three members
 *  deletable) is freed first. The frozen map is the loaded one: ADR 0011 Gap D leaves a delete's extents alone. */
function clearedHobColumn(): Loaded {
  const cleared = ["p2", "p13", "p19"].reduce((current: Design, id) => {
    const result = removePlacement({
      design: current,
      catalog: CATALOG,
      target: { kind: "placement", id },
      occurredAt: NOW,
    });
    if (!result.ok)
      throw new Error(`Could not remove ${id}: ${result.reason.code}`);
    return result.design;
  }, KITCHEN_L_DESIGN);
  const frozen = deriveColumns(
    derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG),
    {},
    KITCHEN_L_DESIGN.room,
  );
  const records = derivePlacementRecords(cleared, CATALOG);
  // The store's `resolveColumns` in one line: merge over the published map, then re-answer `hasFullHeightUnder`.
  const columns = withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(frozen, records),
    records,
  );
  return { columns, records, voids: recomputeVoids(records, columns) };
}

describe("a void's key and a void's coordinate are one fact, which is what the restatement rests on", () => {
  // `recomputeVoids` derives a void's `col` and its along-wall coordinate from the same column, so
  // `deriveColumnKeyAt` over a void's own coordinate is always its own `col`; a fixture whose key disagrees with
  // its coordinate is a record no derivation produces.
  it.each([
    ["a cleared column of the seeded kitchen", clearedHobColumn()],
    [
      "a merged chain",
      load(
        designWith(layOutFromLeftEdge([200, 200, 200, 200, 200, 200], 1000)),
      ),
    ],
    ["a declined run", load(designWith(layOutFromLeftEdge([51, 51], 999.5)))],
  ])(
    "keys every void it publishes at that void's own coordinate (%s)",
    (_name, loaded) => {
      expect(loaded.voids.length).toBeGreaterThan(0);
      for (const record of loaded.voids) {
        expect(
          deriveColumnKeyAt(
            record.wall,
            alongWallCoordinate(record.wall, record),
          ),
        ).toBe(record.col);
      }
    },
  );
});

describe("the §5.1 fallback, attacked", () => {
  function stoodAt(overrides: Partial<VacatedOpening> = {}): VacatedOpening {
    return { col: "A|1.30", y0: 0, wall: "A", alongM: 1.3, ...overrides };
  }

  function slot(overrides: Partial<VoidRecord>): VoidRecord {
    return {
      id: "slot",
      col: "A|1.30",
      wall: "A",
      x: 1.3,
      z: 0.29,
      ry: 0,
      w: 0.6,
      d: 0.58,
      y0: 0,
      h: 0.86,
      spanY0: 0,
      spanH: 2.6,
      ...overrides,
    };
  }

  // The key is the primary match and geometry the fallback, in that order, because columns overlap: `A|0.45`'s
  // 900 mm corner base spans the ground under both `A|0.30` and `A|0.75`. The wider one is listed first, so a
  // fallback running before the key match would take it.
  it("prefers the vacated column's own opening to a wider one that also contains it", () => {
    const wider = slot({ id: "wider", col: "A|0.45", x: 0.45, w: 0.9 });
    const own = slot({ id: "own", col: "A|0.30", x: 0.3, w: 0.6 });

    expect(
      findVacatedVoid([wider, own], stoodAt({ col: "A|0.30", alongM: 0.3 }))
        ?.id,
    ).toBe("own");
  });

  // Strict containment: an opening whose edge lands exactly on the vacated centre touches and does not contain
  // it; relaxing either comparison to `<=` lets the neighbour claim the selection.
  it.each([
    ["its right edge on the vacated centre", { x: 1.0, w: 0.6 }],
    ["its left edge on the vacated centre", { x: 1.6, w: 0.6 }],
  ])("ignores an opening touching the vacated centre with %s", (_name, at) => {
    const touching = slot({ id: "touching", col: "A|9.99", ...at });

    expect(findVacatedVoid([touching], stoodAt())).toBeUndefined();
  });

  // The fallback is geometric, so the wall is part of it: wall B's openings are measured on `z` and a wall-A
  // delete must never reach them.
  it("ignores an opening on the other wall at the same along-wall coordinate", () => {
    const otherWall = slot({
      id: "other-wall",
      col: "B|1.30",
      wall: "B",
      x: 0.29,
      z: 1.3,
    });

    expect(findVacatedVoid([otherWall], stoodAt())).toBeUndefined();
  });

  // The wall-B branch, which `alongWallCoordinate` keeps from being transposed: the coordinate read is `z`, so a
  // slot whose `x` would contain the centre is not a match.
  it("selects a containing opening on wall B by its own along-wall coordinate", () => {
    const onB = slot({
      id: "on-b",
      col: "B|1.60",
      wall: "B",
      x: 0.29,
      z: 1.6,
      w: 1.2,
    });

    expect(
      findVacatedVoid([onB], stoodAt({ col: "B|1.30", wall: "B", alongM: 1.3 }))
        ?.id,
    ).toBe("on-b");
  });
});

describe("the inversion guard, asserted as the document rather than as the map", () => {
  /** Two 1 mm-tall spaces whose floors are 20 mm apart agree on every condition within `LEVEL_SNAP_M`, and the
   *  conservative envelope (highest floor, lowest top) turns them inside out. */
  const SHORTER_THAN_THE_TOLERANCE_THEY_AGREE_WITHIN = [
    emptySpace(2000, 300, { y0Mm: 0, topMm: 1 }),
    emptySpace(2300, 300, { y0Mm: 20, topMm: 21 }),
  ];

  // Asserts only the document: an inverted interval overlaps nothing, so only `EMPTY_COLUMN_INVERTED` can see it,
  // and a merge without the guard writes a design the customer can no longer save, with nothing saying so.
  it("projects a document the validator accepts", () => {
    const design = designWith(SHORTER_THAN_THE_TOLERANCE_THEY_AGREE_WITHIN);
    const loaded = load(design);

    const saved = {
      ...design,
      emptyColumns: [...projectEmptyColumns(loaded.columns, loaded.records)],
    };

    expect(validateDesignForCatalog(saved, CATALOG)).toEqual([]);
  });
});

describe("wall B merges on its own axis", () => {
  // `alongWallPosition`'s other branch, which the shipped merge route never reaches: transposed, the merged
  // column steps off the wall and keys at its own depth.
  it("moves z and leaves x at the column's half-depth", () => {
    const design = designWith([
      emptySpace(2000, 300, { wall: "B" }),
      emptySpace(2300, 300, { wall: "B" }),
    ]);
    // The room's wall B (`depthMm: 2400`) is shorter than the merged run's 2450 mm far edge, which would clip the
    // column the test reads back untouched.
    const loaded = load({ ...design, room: { ...design.room, depthMm: 4200 } });

    const merged = loaded.columns.get("B|2.15");
    expect(merged).toBeDefined();
    expect(merged?.z).toBeCloseTo(2.15, 6);
    // The off-wall coordinate is the column's own half-depth, carried across untouched.
    expect(merged?.x).toBeCloseTo((merged?.d ?? 0) / 2, 6);
    expect(merged?.w).toBeCloseTo(0.6, 6);
  });
});
