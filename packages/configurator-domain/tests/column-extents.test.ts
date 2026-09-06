// M5 wave 5H, the domain half of ADR 0053: the frozen extent of a column that still holds a member
// is recorded in the document, and a restore can only ever widen a column.
//
// The three things under test are the three that make the second array safe. It is the exact
// complement of `emptyColumns` (so the two can never collide); every placement filed under a stored
// key lies inside the extent (so a restore cannot lose a member); and the caps still hold the
// largest legal document inside `MAX_DESIGN_BYTES`.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  MAX_COLUMN_EXTENTS,
  MAX_DESIGN_BYTES,
  MAX_DESIGN_DIMENSION_MM,
  MAX_EMPTY_COLUMNS,
  MAX_PLACEMENTS,
} from "../src/design-bounds.js";
import {
  DesignSchema,
  type Design,
  type DesignPlacement,
  type EmptyColumn,
  type StoredColumnExtent,
} from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import { canonicalSerializeDesign } from "../src/serialize-design.js";
import {
  assertDesignValidForCatalog,
  validateDesignForCatalog,
} from "../src/validate-design.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  MAX_EMPTY_COLUMN_WIDTH_MM,
  derivePlacementRecords,
  projectColumnExtents,
  projectEmptyColumns,
  type Column,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const CURRENT_SCHEMA_VERSION = 2;

/** `A|2.60`: the base with the hob on it, a wall unit and a top box — the column backlog 22's
 *  three-tap route clears and refills, and the one every fixture here is measured on. */
const REFILLED_COLUMN_ALONG_MM = 2600;
const FULL_HEIGHT_TOP_MM = 2600;

function recordsOf(design: Design) {
  return derivePlacementRecords(design, CATALOG);
}

function codesFor(design: Design): string[] {
  return validateDesignForCatalog(design, CATALOG).map((issue) => issue.code);
}

function withColumnExtents(
  entries: readonly StoredColumnExtent[],
  design: Design = KITCHEN_L_DESIGN,
): Design {
  return { ...design, columnExtents: [...entries] };
}

/** The extent the seeded `A|2.60` column has: full height, and every one of its members inside it.
 *  Overridden field by field so a fixture states exactly the one thing it makes wrong. */
function fullHeightExtent(
  overrides: Partial<StoredColumnExtent> = {},
): StoredColumnExtent {
  return {
    wall: "A",
    alongMm: REFILLED_COLUMN_ALONG_MM,
    widthMm: 600,
    y0Mm: 0,
    topMm: FULL_HEIGHT_TOP_MM,
    depthMm: 620,
    ...overrides,
  };
}

describe("the projection partitions the frozen map", () => {
  it("records the occupied columns the empty projection skips", () => {
    const records = recordsOf(KITCHEN_L_DESIGN);
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);

    const extents = projectColumnExtents(columns, records);

    expect(projectEmptyColumns(columns, records)).toStrictEqual([]);
    expect(extents).toHaveLength(columns.size);
    expect(
      extents.some(
        (entry) =>
          entry.wall === "A" && entry.alongMm === REFILLED_COLUMN_ALONG_MM,
      ),
    ).toBe(true);
  });

  it("restores an extent its own placements no longer imply", () => {
    // Backlog 22's route, in one derivation: the placements say the column reaches 820 mm, the
    // stored extent says 2600, and the stored one wins on the extent fields.
    const oneBody: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.id === "p2",
      ),
    };
    const records = recordsOf(oneBody);
    const key = deriveColumnKeyAt("A", REFILLED_COLUMN_ALONG_MM / 1000);

    const derived = deriveColumns(records, {}, KITCHEN_L_DESIGN.room).get(key);
    const restored = deriveColumns(
      records,
      {
        emptyColumns: [],
        columnExtents: [fullHeightExtent()],
      },
      KITCHEN_L_DESIGN.room,
    ).get(key);

    expect(Math.round((derived?.top ?? 0) * 1000)).toBe(820);
    expect(Math.round((restored?.top ?? 0) * 1000)).toBe(FULL_HEIGHT_TOP_MM);
    // Membership is not part of the extent, so the body is still where it was.
    expect(recordsOf(oneBody).map((record) => record.col)).toStrictEqual([key]);
  });
});

/** Criterion 5H-5. A generated design is a subset of the seeded placements plus a set of
 *  member-less columns at centres nothing stands at, which is the only way an empty column exists in
 *  a map at all. The reach is asserted, not assumed: a run with no empty column would satisfy
 *  "exactly one" under a projection that put every key in both halves. */
describe("criterion 5H-5 — every key is in exactly one half", () => {
  const EMPTY_COLUMN_CENTRES_MM = [3800, 3900, 4000, 4100];

  function memberLessColumnAt(alongMm: number): Column {
    const alongM = alongMm / 1000;
    return {
      key: deriveColumnKeyAt("A", alongM),
      wall: "A",
      ry: 0,
      x: alongM,
      z: 0.29,
      w: 0.6,
      d: 0.58,
      top: 0.82,
      regions: [[0, 0.82]],
      hasFullHeightUnder: false,
    };
  }

  propertyTest.prop([
    fc.subarray([...KITCHEN_L_DESIGN.placements], { minLength: 4 }),
    fc.subarray(EMPTY_COLUMN_CENTRES_MM, { minLength: 1 }),
  ])(
    "splits the map into the empty columns and the occupied extents, and nothing else",
    (placements: readonly DesignPlacement[], centres: readonly number[]) => {
      const records = recordsOf({
        ...KITCHEN_L_DESIGN,
        placements: [...placements],
      });
      const columns = new Map(
        deriveColumns(records, {}, KITCHEN_L_DESIGN.room),
      );
      for (const centreMm of centres) {
        const column = memberLessColumnAt(centreMm);
        columns.set(column.key, column);
      }

      const emptyKeys = projectEmptyColumns(columns, records).map((entry) =>
        deriveColumnKeyAt(entry.wall, entry.alongMm / 1000),
      );
      const extentKeys = projectColumnExtents(columns, records).map((entry) =>
        deriveColumnKeyAt(entry.wall, entry.alongMm / 1000),
      );

      // Non-vacuity, inside the property: both halves are reached on every generated design.
      expect(emptyKeys.length).toBeGreaterThan(0);
      expect(extentKeys.length).toBeGreaterThan(0);
      expect(emptyKeys.filter((key) => extentKeys.includes(key))).toStrictEqual(
        [],
      );
      expect([...emptyKeys, ...extentKeys].sort()).toStrictEqual(
        [...columns.keys()].sort(),
      );
    },
  );
});

/** Criterion 5H-4, the DOM-001 criterion: containment is enforced, not assumed. Each fixture carries
 *  exactly one fault, so the code asserted is the only one the document can answer with. */
describe("criterion 5H-4 — a stored extent that excludes its own member is refused", () => {
  it("refuses an extent whose top is below a member's, at both seams", () => {
    // `p19`, the top box, stands 2200–2600 in this column. An extent that stops at 1000 would
    // publish the space that body occupies as free.
    const design = withColumnExtents([fullHeightExtent({ topMm: 1000 })]);

    expect(codesFor(design)).toStrictEqual(["COLUMN_EXTENT_EXCLUDES_MEMBER"]);
    expect(() =>
      migrateDesign(CURRENT_SCHEMA_VERSION, JSON.parse(JSON.stringify(design))),
    ).toThrow(/COLUMN_EXTENT_EXCLUDES_MEMBER/);
  });

  it("refuses an extent whose floor is above a member's", () => {
    const design = withColumnExtents([fullHeightExtent({ y0Mm: 900 })]);

    expect(codesFor(design)).toStrictEqual(["COLUMN_EXTENT_EXCLUDES_MEMBER"]);
  });

  it("refuses an extent on a key no placement is filed under, at both seams", () => {
    // 3900 mm on wall A: past `p4`, where the seeded kitchen has nothing at all.
    const design = withColumnExtents([fullHeightExtent({ alongMm: 3900 })]);

    expect(codesFor(design)).toStrictEqual(["COLUMN_EXTENT_HAS_NO_MEMBER"]);
    expect(() =>
      migrateDesign(CURRENT_SCHEMA_VERSION, JSON.parse(JSON.stringify(design))),
    ).toThrow(/COLUMN_EXTENT_HAS_NO_MEMBER/);
  });

  /** The fixture's own control: the same document with the extent the column actually has is
   *  accepted and loads. Without this, a refusal above could be coming from anything. */
  it("accepts the extent the column's own members stand inside", () => {
    const design = withColumnExtents([fullHeightExtent()]);

    expect(codesFor(design)).toStrictEqual([]);
    expect(
      migrateDesign(CURRENT_SCHEMA_VERSION, JSON.parse(JSON.stringify(design)))
        .columnExtents,
    ).toHaveLength(1);
  });

  it("refuses two extents that address one column key", () => {
    // 2600 and 2596 are one key at `toFixed(2)`, so the second would overwrite the first in the map
    // and the document would record a space the derivation does not have. The narrower second entry
    // stands inside the first, which is unavoidable — two entries on one key are two runs at the
    // same place — so the overlap sweep names them as well, and both refusals are asserted rather
    // than one of them being engineered away.
    const design = withColumnExtents([
      fullHeightExtent(),
      fullHeightExtent({ alongMm: 2596, widthMm: 400 }),
    ]);

    expect(codesFor(design).sort()).toStrictEqual([
      "COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT",
      "COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT",
      "COLUMN_EXTENT_OVERLAPS_COLUMN_EXTENT",
      "COLUMN_EXTENT_OVERLAPS_COLUMN_EXTENT",
    ]);
  });

  /** Containment bounds an extent from below and the room bounds it from above. Without this an
   *  entry could contain its members and still publish openings out through the ceiling, which is
   *  review finding F2's defect arriving on a new field. */
  it("refuses an extent that reaches above the room it is recorded in", () => {
    const design = withColumnExtents([
      fullHeightExtent({ topMm: KITCHEN_L_DESIGN.room.heightMm + 1 }),
    ]);

    expect(codesFor(design)).toStrictEqual(["COLUMN_EXTENT_ABOVE_ROOM"]);
    // The ceiling edge keeps refusing after ADR 0069 split the code per edge — only the wall-end
    // edge was demoted — so this asserts the throw and not merely the reported code.
    expect(() => {
      assertDesignValidForCatalog(design, CATALOG);
    }).toThrow(/COLUMN_EXTENT_ABOVE_ROOM/);
  });
});

/** The blocker both reviews found, from two directions, as two tests.
 *
 * `recomputeVoids` subtracts the members of the column's **own key** and nothing else, so an extent
 * that reaches across its neighbours publishes openings straight through their bodies — real,
 * selectable, insertable. Containment cannot see it: it is a per-key vertical proof. The wall-span
 * overlap sweep is what refuses it, and these are the exact documents that were accepted before it
 * existed. */
describe("an extent that reaches across a column it does not own is refused", () => {
  it("refuses a 2000 mm extent lying across three columns of wall A", () => {
    const design = withColumnExtents([
      {
        wall: "A",
        alongMm: 1300,
        widthMm: 2000,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 600,
      },
    ]);

    expect(codesFor(design)).toContain("COLUMN_EXTENT_OVERLAPS_PLACEMENT");
  });

  it("refuses a 3200 mm extent spanning most of wall A", () => {
    const design = withColumnExtents([
      {
        wall: "A",
        alongMm: 2000,
        widthMm: 3200,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 620,
      },
    ]);

    expect(codesFor(design)).toContain("COLUMN_EXTENT_OVERLAPS_PLACEMENT");
  });

  /** The rule is about a *neighbour's* body, never about the extent's own. An extent holding the
   *  bodies filed under its own key is the ordinary case, and it is what the seeded kitchen's every
   *  column is — so this is the control that stops the sweep from being tightened into a rule that
   *  refuses the product's own documents. */
  it("accepts every extent the seeded kitchen's own map projects", () => {
    const records = recordsOf(KITCHEN_L_DESIGN);
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);

    const projected = withColumnExtents(
      projectColumnExtents(columns, records),
      KITCHEN_L_DESIGN,
    );

    expect(codesFor(projected)).toStrictEqual([]);
  });

  /** **ADR 0052's 800 mm ceiling is deliberately not applied to this array, and the seeded kitchen
   *  is why.** `A|0.45` holds `base-corner-x-900`, so its own frozen extent is 900 mm wide — an
   *  honest column the product ships. ADR 0052 is titled *the ceiling on any **empty** column* and
   *  its reason is a `widthFlex: 'fit'` insert refusing into an opening no body fits, which is a
   *  statement about a space with nothing in it. Applying it here would refuse the shipped design.
   *  What bounds an occupied extent instead is the overlap sweep above and the room. */
  it("keeps the 900 mm corner-base column, which the empty-column ceiling would refuse", () => {
    const records = recordsOf(KITCHEN_L_DESIGN);

    const corner = projectColumnExtents(
      deriveColumns(records, {}, KITCHEN_L_DESIGN.room),
      records,
    ).find((entry) => entry.wall === "A" && entry.alongMm === 450);

    expect(corner?.widthMm).toBe(900);
    expect(corner?.widthMm).toBeGreaterThan(MAX_EMPTY_COLUMN_WIDTH_MM);
  });
});

describe("criterion 5H-6 — the largest legal document still fits the byte cap", () => {
  it("accepts a document at all three caps and keeps it inside MAX_DESIGN_BYTES", () => {
    const longestIdentifier = "b".repeat(26);
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
    const widestEntry = (index: number): EmptyColumn => ({
      wall: index % 2 === 0 ? "A" : "B",
      alongMm: MAX_DESIGN_DIMENSION_MM,
      widthMm: MAX_DESIGN_DIMENSION_MM,
      y0Mm: MAX_DESIGN_DIMENSION_MM - 1,
      topMm: MAX_DESIGN_DIMENSION_MM,
      depthMm: MAX_DESIGN_DIMENSION_MM,
    });
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: Array.from({ length: MAX_PLACEMENTS }, (_, index) =>
        widestPlacement(index),
      ),
      emptyColumns: Array.from({ length: MAX_EMPTY_COLUMNS }, (_, index) =>
        widestEntry(index),
      ),
      columnExtents: Array.from({ length: MAX_COLUMN_EXTENTS }, (_, index) =>
        widestEntry(index),
      ),
    };

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(
      Buffer.byteLength(canonicalSerializeDesign(design), "utf8"),
    ).toBeLessThanOrEqual(MAX_DESIGN_BYTES);
  });

  it("refuses one entry past the cap, at the field's own path", () => {
    const design = withColumnExtents(
      Array.from({ length: MAX_COLUMN_EXTENTS + 1 }, () => fullHeightExtent()),
    );

    const result = DesignSchema.safeParse(design);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toStrictEqual(["columnExtents"]);
  });

  /** The cap is derived from the placements, not chosen and not shared with `MAX_EMPTY_COLUMNS`: an
   *  entry is only legal on a key a placement is filed under. */
  it("caps the array at the number of placements a document may carry", () => {
    expect(MAX_COLUMN_EXTENTS).toBe(MAX_PLACEMENTS);
  });
});

describe("a document written before ADR 0053 loads exactly as it did", () => {
  it("derives every occupied extent from the placements when the key is absent", () => {
    const withoutTheKey = JSON.parse(
      JSON.stringify(KITCHEN_L_DESIGN),
    ) as Design;

    const loaded = migrateDesign(CURRENT_SCHEMA_VERSION, withoutTheKey);

    expect(loaded).not.toHaveProperty("columnExtents");
    expect(codesFor(loaded)).toStrictEqual([]);
  });
});
