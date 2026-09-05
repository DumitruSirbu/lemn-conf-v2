// Adversarial QA for M5 wave 5H — ADR 0053's `columnExtents`, attacked at the domain seam.
//
// The wave replaces a *disjointness proof* with **precedence plus monotone containment**: a stored
// extent overwrites the column its own placements imply, and `validateDesignForCatalog` is what
// makes the overwrite safe by proving every member lies inside the extent. The whole safety
// argument is one sentence in `addStoredColumnExtents` — a restore "can never lose a member, and it
// can never publish an opening over a body". These tests ask whether a **validated** document can
// still do the second thing.
//
// Two of them say it can. `extentContains` asks two of the four clauses the plan named — the floor
// and the top — and leaves the along-wall footprint and the depth to the room bound alone. The room
// is four orders of magnitude looser than the members, and containment is scoped to *this* column's
// members while columns overlap each other along the wall, so both gaps publish an opening standing
// in a body that is filed under a different key.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  MAX_COLUMN_EXTENTS,
  MAX_DESIGN_BYTES,
  MAX_EMPTY_COLUMNS,
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
} from "../src/design-bounds.js";
import {
  EmptyColumnSchema,
  type Design,
  type StoredColumnExtent,
} from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  assertDesignValidForCatalog,
  validateDesignForCatalog,
} from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  projectColumnExtents,
  projectEmptyColumns,
  projectFrozenMap,
  recomputeVoids,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

function withColumnExtents(
  columnExtents: readonly StoredColumnExtent[],
  design: Design = KITCHEN_L_DESIGN,
): Design {
  return { ...design, columnExtents: [...columnExtents] };
}

function codesFor(design: Design): string[] {
  return validateDesignForCatalog(design, CATALOG).map((issue) => issue.code);
}

function loadOf(design: Design): {
  records: readonly PlacementRecord[];
  columns: ReadonlyMap<string, Column>;
  voids: readonly VoidRecord[];
} {
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveColumns(
    records,
    {
      emptyColumns: design.emptyColumns,
      columnExtents: design.columnExtents,
    },
    design.room,
  );
  return { records, columns, voids: recomputeVoids(records, columns) };
}

const inMm = (metres: number): number => Math.round(metres * 1000);

/** A record's and a void's along-wall span in whole millimetres, on the **centre** convention the
 *  column map uses: `toEmptyColumn` writes `column.x` (wall A) or `column.z` (wall B) as `alongMm`,
 *  and both are the centre of the run. Two spans that overlap here are two things standing in the
 *  same place on the same wall. */
interface AlongSpan {
  readonly wall: string;
  readonly startMm: number;
  readonly endMm: number;
  readonly floorMm: number;
  readonly topMm: number;
}

function spanOfRecord(record: PlacementRecord): AlongSpan {
  const centreMm = inMm(record.wall === "A" ? record.frame.x : record.frame.z);
  const halfMm = inMm(record.frame.w) / 2;
  return {
    wall: record.wall,
    startMm: centreMm - halfMm,
    endMm: centreMm + halfMm,
    floorMm: inMm(record.frame.y0),
    topMm: inMm(record.frame.y0 + record.frame.h),
  };
}

function spanOfVoid(record: VoidRecord): AlongSpan {
  const centreMm = inMm(record.wall === "A" ? record.x : record.z);
  const halfMm = inMm(record.w) / 2;
  return {
    wall: record.wall,
    startMm: centreMm - halfMm,
    endMm: centreMm + halfMm,
    floorMm: inMm(record.y0),
    topMm: inMm(record.y0 + record.h),
  };
}

function overlaps(left: AlongSpan, right: AlongSpan): boolean {
  return (
    left.wall === right.wall &&
    Math.min(left.endMm, right.endMm) > Math.max(left.startMm, right.startMm) &&
    Math.min(left.topMm, right.topMm) > Math.max(left.floorMm, right.floorMm)
  );
}

/** Every (opening, body) pair the derivation publishes in the same physical space. The wave's own
 *  safety sentence says this list is empty for any document validation accepts. */
function openingsStandingInABody(design: Design): string[] {
  const { records, voids } = loadOf(design);
  const collisions: string[] = [];
  for (const opening of voids) {
    for (const record of records) {
      if (overlaps(spanOfVoid(opening), spanOfRecord(record))) {
        collisions.push(`${opening.id} stands in ${record.id}`);
      }
    }
  }
  return collisions;
}

/** The openings a **validated** document publishes inside a body. A document validation refuses
 *  never becomes one, so it contributes nothing here — which is what makes the pair of assertions
 *  below say "either this document is refused, or it is clean", with no branch at the call site.
 *  Delete the refusal that catches it and both assertions redden together. */
function openingsOfAValidatedDocument(design: Design): string[] {
  return codesFor(design).length > 0 ? [] : openingsStandingInABody(design);
}

describe("a validated document must not publish an opening standing in a body", () => {
  // **Defect.** Containment bounds the floor only from below, and it asks about *this* column's
  // members only. `A|0.30` holds a wall unit and a top box; the corner base `p25` is filed under
  // `A|0.45` and physically stands underneath it (0–900 mm along wall A, 0–820 mm up). An extent
  // declaring `A|0.30`'s floor at 0 contains both its own members, passes every refusal, and the
  // reload publishes a 600 × 860 opening inside the corner base.
  //
  // `emptyColumns` has refused exactly this shape since 5B2a (`EMPTY_COLUMN_OVERLAPS_PLACEMENT`).
  // `columnExtents` has no counterpart, so 5H reopens the hole on a new field — review finding F2's
  // shape, which the wave's own comment says the room bound closes and it does not.
  it("refuses an extent whose declared floor reaches down through a neighbouring column's body", () => {
    const design = withColumnExtents([
      {
        wall: "A",
        alongMm: 300,
        widthMm: 600,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 330,
      },
    ]);

    expect(openingsOfAValidatedDocument(design)).toStrictEqual([]);
    expect(codesFor(design)).not.toStrictEqual([]);
  });

  // **Defect.** The along-wall clause the plan named (`the along-wall footprint contains each
  // member's`) was dropped, so `widthMm` is held only by the room. `A|2.00` holds 600 mm members;
  // an extent claiming 1600 mm is inside a 3560 mm wall and passes, and the opening it publishes
  // spans 1200–2800 mm — straight through the hood in `A|2.60`.
  //
  // Nothing else bounds it: `EMPTY_COLUMN_WIDER_THAN_CAP` (ADR 0052's 800 mm ceiling) governs
  // `emptyColumns` only.
  it("refuses an extent wider than the column its own members occupy", () => {
    const design = withColumnExtents(
      [
        {
          wall: "A",
          alongMm: 2000,
          widthMm: 1600,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 620,
        },
      ],
      // `p12` removed so `A|2.00` has an opening for the width lie to be published into.
      {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.filter(
          (placement) => placement.id !== "p12",
        ),
      },
    );

    expect(openingsOfAValidatedDocument(design)).toStrictEqual([]);
    expect(codesFor(design)).not.toStrictEqual([]);
  });

  // The seeded design with no extents at all, as the control: the assertion above is about the new
  // field, not about a collision the derivation has always had.
  it("publishes no such opening on the seeded design", () => {
    expect(openingsStandingInABody(KITCHEN_L_DESIGN)).toStrictEqual([]);
  });
});

describe("the four refusals, each on the document that earns it", () => {
  // Wall A's last column ends at 3500 mm, so this entry stands in free wall and its only fault is
  // the one under test: no placement is filed under its key.
  it("refuses an entry on a key no placement is filed under", () => {
    expect(
      codesFor(
        withColumnExtents([
          {
            wall: "A",
            alongMm: 3550,
            widthMm: 100,
            y0Mm: 0,
            topMm: 2600,
            depthMm: 600,
          },
        ]),
      ),
    ).toStrictEqual(["COLUMN_EXTENT_HAS_NO_MEMBER"]);
  });

  it("refuses an entry whose top is below a member's top", () => {
    expect(
      codesFor(
        withColumnExtents([
          {
            wall: "A",
            alongMm: 2600,
            widthMm: 600,
            y0Mm: 0,
            topMm: 2599,
            depthMm: 620,
          },
        ]),
      ),
    ).toStrictEqual(["COLUMN_EXTENT_EXCLUDES_MEMBER"]);
  });

  it("refuses an entry whose floor is above a member's floor", () => {
    expect(
      codesFor(
        withColumnExtents([
          {
            wall: "A",
            alongMm: 2600,
            widthMm: 600,
            y0Mm: 1,
            topMm: 2600,
            depthMm: 620,
          },
        ]),
      ),
    ).toStrictEqual(["COLUMN_EXTENT_EXCLUDES_MEMBER"]);
  });

  // The key is 10 mm granular while `alongMm` is whole millimetres, so two entries 5 mm apart are
  // two entries in the document and one slot in the map. Both are named, because moving either one
  // alone fixes it.
  it("refuses two entries that address one slot in the map", () => {
    expect(
      codesFor(
        withColumnExtents([
          {
            wall: "A",
            alongMm: 2600,
            widthMm: 600,
            y0Mm: 0,
            topMm: 2600,
            depthMm: 620,
          },
          {
            wall: "A",
            alongMm: 2604,
            widthMm: 600,
            y0Mm: 0,
            topMm: 2600,
            depthMm: 620,
          },
        ]),
      ).filter(
        (code) => code === "COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT",
      ),
    ).toHaveLength(2);
  });

  it("refuses an entry that rises above the room", () => {
    const design = withColumnExtents([
      {
        wall: "A",
        alongMm: 2600,
        widthMm: 600,
        y0Mm: 0,
        topMm: 2601,
        depthMm: 620,
      },
    ]);

    expect(codesFor(design)).toContain("COLUMN_EXTENT_ABOVE_ROOM");
    // Through the ceiling is a refusal and not the demoted past-the-wall-end mark (ADR 0069): the
    // reported code is not enough, the load path has to fail.
    expect(() => {
      assertDesignValidForCatalog(design, CATALOG);
    }).toThrow(/COLUMN_EXTENT_ABOVE_ROOM/);
  });

  it("refuses an entry that reaches out through the shell", () => {
    const design = withColumnExtents([
      {
        wall: "A",
        alongMm: 2600,
        widthMm: 600,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 2831,
      },
    ]);

    expect(codesFor(design)).toStrictEqual(["COLUMN_EXTENT_DEEPER_THAN_ROOM"]);
    expect(() => {
      assertDesignValidForCatalog(design, CATALOG);
    }).toThrow(/COLUMN_EXTENT_DEEPER_THAN_ROOM/);
  });

  // An inverted entry is refused without an inversion rule, because no member of positive height
  // fits inside it. Pinned so a later edit that relaxes containment cannot silently admit one.
  it("refuses an inverted entry through the containment rule alone", () => {
    expect(
      codesFor(
        withColumnExtents([
          {
            wall: "A",
            alongMm: 2600,
            widthMm: 600,
            y0Mm: 2600,
            topMm: 0,
            depthMm: 620,
          },
        ]),
      ),
    ).toContain("COLUMN_EXTENT_EXCLUDES_MEMBER");
  });

  // A document the catalogue cannot answer for reports one fault, not two, and — the part that
  // matters — the containment rule must not throw out of the validator on the way past.
  it("reports only the unknown build id when the catalogue cannot answer", () => {
    const [first, ...rest] = KITCHEN_L_DESIGN.placements;
    if (!first) throw new Error("the seeded design has no placements");
    const design = withColumnExtents(
      [
        {
          wall: "A",
          alongMm: 2600,
          widthMm: 600,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 620,
        },
      ],
      {
        ...KITCHEN_L_DESIGN,
        placements: [
          { ...first, body: { ...first.body, buildId: "no-such-body" } },
          ...rest,
        ],
      },
    );

    expect(codesFor(design)).toStrictEqual(["UNKNOWN_BUILD_ID"]);
  });
});

describe("precedence — the stored extent wins, and only over the frozen half", () => {
  const STORED: StoredColumnExtent = {
    wall: "A",
    alongMm: 2600,
    widthMm: 600,
    y0Mm: 0,
    topMm: 2600,
    depthMm: 620,
  };

  /** `A|2.60` with only its base left: the placements imply a column 820 mm tall, and the stored
   *  extent says 2600. This is the shape backlog 22 is made of, and the one that tells a restore
   *  that happened from one that quietly fell through to the derivation. */
  function baseOnlyDesign(): Design {
    return withColumnExtents([STORED], {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.id !== "p13" && placement.id !== "p19",
      ),
    });
  }

  it("takes the stored top over the one the members reach", () => {
    const design = baseOnlyDesign();

    expect(codesFor(design)).toStrictEqual([]);
    expect(inMm(loadOf(design).columns.get("A|2.60")?.top ?? 0)).toBe(2600);
    // The mutant that drops the restore, asserted as the number it produces rather than as a
    // difference: 820 is what the placements alone imply.
    const withoutTheArray = { ...design };
    delete withoutTheArray.columnExtents;
    expect(inMm(loadOf(withoutTheArray).columns.get("A|2.60")?.top ?? 0)).toBe(
      820,
    );
  });

  // The mutant that restores **before** the grouping: the placements would overwrite the stored
  // entry and the column would come back at 820. Asserted through the observable the ordering
  // decides, because the order itself is not reachable from a test.
  it("is not overwritten by the placements that share its key", () => {
    const columns = loadOf(baseOnlyDesign()).columns;

    expect(inMm(columns.get("A|2.60")?.d ?? 0)).toBe(620);
    expect(
      inMm(Math.min(...(columns.get("A|2.60")?.regions ?? []).map(([s]) => s))),
    ).toBe(0);
  });

  // ADR 0011 Gap D's own correction: the extent is frozen, the live predicates are re-answered.
  // A stored entry must not carry a stale `hasFullHeightUnder` into the session.
  it("leaves hasFullHeightUnder answered from the current records", () => {
    const design = baseOnlyDesign();

    expect(loadOf(design).columns.get("A|2.60")?.hasFullHeightUnder).toBe(
      false,
    );
    expect(
      loadOf(KITCHEN_L_DESIGN).columns.get("B|1.20")?.hasFullHeightUnder,
    ).toBe(true);
  });
});

describe("5H-5 — the two halves partition the frozen map", () => {
  const mutationArbitrary = fc.array(
    fc.record({
      dropPlacement: fc.nat({ max: 26 }),
    }),
    { minLength: 0, maxLength: 8 },
  );

  propertyTest.prop([mutationArbitrary])(
    "files every key in exactly one half, and their union is the map",
    (drops: readonly { dropPlacement: number }[]) => {
      const dropped = new Set(
        drops.map((drop) => `p${String(drop.dropPlacement)}`),
      );
      const design: Design = {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.filter(
          (placement) => !dropped.has(placement.id),
        ),
      };
      const records = derivePlacementRecords(design, CATALOG);
      const columns = deriveColumns(records, {}, design.room);

      const empty = projectEmptyColumns(columns, records);
      const occupied = projectColumnExtents(columns, records);
      const emptyKeys = empty.map(keyOf);
      const occupiedKeys = occupied.map(keyOf);

      expect(new Set([...emptyKeys, ...occupiedKeys]).size).toBe(
        emptyKeys.length + occupiedKeys.length,
      );
      expect(
        [...new Set([...emptyKeys, ...occupiedKeys])].sort(),
      ).toStrictEqual([...columns.keys()].sort());
    },
  );

  // The two projections and the partition are one loop, so they must not be able to disagree.
  it("returns the same two arrays as the single-pass projection", () => {
    const records = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG);
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);
    const frozen = projectFrozenMap(columns, records);

    expect(frozen.emptyColumns).toStrictEqual(
      projectEmptyColumns(columns, records),
    );
    expect(frozen.columnExtents).toStrictEqual(
      projectColumnExtents(columns, records),
    );
  });

  // One state, one document. `Map` iteration follows insertion order, so a map reached by a
  // different route must still serialise to the same array.
  propertyTest.prop([
    fc.array(fc.nat({ max: 1000 }), { minLength: 12, maxLength: 12 }),
  ])(
    "orders the occupied half independently of the map's insertion order",
    (shuffleKeys: readonly number[]) => {
      const records = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG);
      const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);
      const entries = [...columns.entries()];
      const shuffled = new Map(
        entries
          .map((entry, index) => ({
            entry,
            order: shuffleKeys[index] ?? index,
          }))
          .sort((left, right) => left.order - right.order)
          .map(({ entry }) => entry),
      );

      expect(projectColumnExtents(shuffled, records)).toStrictEqual(
        projectColumnExtents(columns, records),
      );
    },
  );
});

function keyOf(entry: { wall: string; alongMm: number }): string {
  return `${entry.wall}|${(entry.alongMm / 1000).toFixed(2)}`;
}

describe("the caps", () => {
  it("bounds the occupied half by the placements, not by the wall's keys", () => {
    expect(MAX_COLUMN_EXTENTS).toBe(MAX_PLACEMENTS);
    expect(MAX_COLUMN_EXTENTS).toBe(168);
  });

  // The cap-left-behind mutant: leaving `MAX_DESIGN_BYTES` at 248 576 refuses the largest document
  // the schema accepts, which is the failure ADR 0044's own byte-cap comment names.
  //
  // It has moved twice and is re-derived rather than assumed each time: ADR 0053 added the second
  // array, and ADR 0073 widened the entry **both** arrays share, because `depthFromBuildId` does not
  // fit inside ADR 0053's 128-byte allowance. The per-entry allowance is read back out of the cap
  // rather than restated, so the two cannot be moved independently of each other.
  it("raises the byte cap by exactly the allowance both frozen-map arrays share", () => {
    const perEntryBytes =
      (MAX_DESIGN_BYTES - MAX_PLACEMENTS * 512 - 1024) /
      (MAX_EMPTY_COLUMNS + MAX_COLUMN_EXTENTS);

    expect(MAX_DESIGN_BYTES).toBe(337_290);
    expect(perEntryBytes).toBe(175);
  });

  // **The worst case is constructed, never hand-picked** — a boundary grep that matches nothing
  // while reporting green is a failure this project has shipped twice. The entry below is the longest
  // one `EmptyColumnSchema` can express: every coordinate at `MAX_DESIGN_DIMENSION_MM` and a
  // `depthFromBuildId` at `MAX_IDENTIFIER_LENGTH`, which is more than twice the longest `buildId`
  // the catalogue holds. It is **parsed before it is measured**, so a "worst case" the schema would
  // have refused cannot stand in for one.
  it("allows more bytes per entry than the longest entry the schema can express", () => {
    const longest = EmptyColumnSchema.parse({
      wall: "A",
      alongMm: 10_000,
      widthMm: 10_000,
      y0Mm: 10_000,
      topMm: 10_000,
      depthMm: 10_000,
      depthFromBuildId: "b".repeat(MAX_IDENTIFIER_LENGTH),
    });

    // The separating comma, which belongs to the array rather than to the entry.
    const bytes = Buffer.byteLength(JSON.stringify(longest), "utf8") + 1;

    expect(bytes).toBeGreaterThan(128);
    expect(bytes).toBeLessThanOrEqual(175);
  });

  it("holds a document at every cap inside the byte cap", () => {
    const entry = (index: number): StoredColumnExtent => ({
      wall: "A",
      alongMm: 10_000 + index,
      widthMm: 12_345,
      y0Mm: 12_345,
      topMm: 23_456,
      depthMm: 12_345,
      // The longest the schema accepts, not the longest the catalogue holds: this asks whether the
      // cap holds the largest *schema-valid* document, and the derivation deliberately budgets for
      // the catalogue's own 26 characters.
      depthFromBuildId: "b".repeat(MAX_IDENTIFIER_LENGTH),
    });
    const document = JSON.stringify({
      ...KITCHEN_L_DESIGN,
      emptyColumns: Array.from({ length: MAX_EMPTY_COLUMNS }, (_, index) =>
        entry(index),
      ),
      columnExtents: Array.from({ length: MAX_COLUMN_EXTENTS }, (_, index) =>
        entry(index),
      ),
    });

    expect(Buffer.byteLength(document, "utf8")).toBeLessThan(MAX_DESIGN_BYTES);
  });
});
