// ADR 0044's write half (M5B wave 5B2b): the projection that turns the frozen map's member-less
// columns into the array the document carries.
//
// The pairing with `deriveColumns` is what these tests are about. A projection that emits an entry
// the loader keys somewhere else, or drops one, is worse than no projection at all — the space is
// recorded and then lands in the wrong place.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { Design, DesignRoom } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  derivePlacementRecords,
  projectEmptyColumns,
  UnprojectableColumnError,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** Wide enough that no fixture in this file, including the 6300 mm sweep below, ever reaches
 *  the wall's own end — this file is about the projection/restoration round trip, not about
 *  `clipEmptyColumnsAtWallEnd`, which has its own test file. */
const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 7000,
  depthMm: 7000,
  heightMm: 2600,
};

/** A member-less column exactly as `moveFrozenColumns` leaves one: a frozen extent whose members
 *  are gone, at a whole-millimetre centre. */
function emptyColumnAt(
  alongM: number,
  overrides: Partial<Column> = {},
): Column {
  return {
    key: deriveColumnKeyAt("A", alongM),
    wall: "A",
    ry: 0,
    x: alongM,
    z: 0.29,
    w: 0.15,
    d: 0.58,
    top: 0.82,
    regions: [[0, 0.82]],
    hasFullHeightUnder: false,
    ...overrides,
  };
}

function mapOf(columns: readonly Column[]): ReadonlyMap<string, Column> {
  return new Map(columns.map((column) => [column.key, column]));
}

function recordsOf(design: Design): readonly PlacementRecord[] {
  return derivePlacementRecords(design, CATALOG);
}

describe("projectEmptyColumns", () => {
  it("records the frozen extent of a column with no member", () => {
    const projected = projectEmptyColumns(mapOf([emptyColumnAt(3.425)]), []);

    expect(projected).toStrictEqual([
      {
        wall: "A",
        alongMm: 3425,
        widthMm: 150,
        y0Mm: 0,
        topMm: 820,
        depthMm: 580,
      },
    ]);
  });

  it("records the lowest region start as the floor, not the first one written", () => {
    const stacked = emptyColumnAt(1.3, {
      regions: [
        [1.5, 2.2],
        [0, 0.82],
      ],
      top: 2.6,
    });

    const [entry] = projectEmptyColumns(mapOf([stacked]), []);

    expect(entry?.y0Mm).toBe(0);
    expect(entry?.topMm).toBe(2600);
  });

  it("records nothing for a column its placements still occupy", () => {
    const records = recordsOf(KITCHEN_L_DESIGN);
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);

    expect(projectEmptyColumns(columns, records)).toStrictEqual([]);
  });

  it("records only the columns the placements left behind", () => {
    const records = recordsOf(KITCHEN_L_DESIGN);
    const occupied = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);
    const withStrip = new Map(occupied).set(
      deriveColumnKeyAt("A", 3.425),
      emptyColumnAt(3.425),
    );

    const projected = projectEmptyColumns(withStrip, records);

    expect(projected.map((entry) => entry.alongMm)).toStrictEqual([3425]);
  });

  // The two orderings of one state. `Map` iteration follows insertion order and a resize deletes
  // and re-adds the keys it moves, so without the sort the same kitchen would serialise two ways
  // depending on the route it was reached by.
  it("orders entries by wall and centre, whatever order the map holds them in", () => {
    const columns = [
      emptyColumnAt(2.5),
      // On wall B the along-wall coordinate is `z` and the half-depth is `x` — the projection
      // reads the one the wall says is along, which a fixture that only swapped the key would not
      // catch.
      emptyColumnAt(0.5, {
        wall: "B",
        key: deriveColumnKeyAt("B", 0.5),
        x: 0.29,
        z: 0.5,
      }),
      emptyColumnAt(1.5),
    ];

    const forwards = projectEmptyColumns(mapOf(columns), []);
    const backwards = projectEmptyColumns(mapOf([...columns].reverse()), []);

    expect(forwards).toStrictEqual(backwards);
    expect(forwards.map((entry) => `${entry.wall}${String(entry.alongMm)}`)) //
      .toStrictEqual(["A1500", "A2500", "B500"]);
  });

  it("refuses a centre between two millimetres rather than rounding it to one", () => {
    const drifted = emptyColumnAt(3.5751, {
      key: deriveColumnKeyAt("A", 3.5751),
    });

    expect(() => projectEmptyColumns(mapOf([drifted]), [])).toThrow(
      UnprojectableColumnError,
    );
  });

  // Rounding is criterion 4's named mutant, and this is what it would cost: 3.5751 m and 3.5749 m
  // are two columns 200 µm apart that `toFixed(2)` already renders as one key — so a rounded
  // projection would emit two entries the loader files in one slot, losing a space the document
  // says is there.
  it("refuses rather than emitting two entries that share one restored key", () => {
    const drifted = mapOf([
      emptyColumnAt(3.5751, { key: "A|3.5751" }),
      emptyColumnAt(3.5749, { key: "A|3.5749" }),
    ]);

    expect(() => projectEmptyColumns(drifted, [])).toThrow(
      /not a whole millimetre/,
    );
  });

  it("refuses a column with no region, which has no floor to record", () => {
    const floorless = emptyColumnAt(1.5, { regions: [] });

    expect(() => projectEmptyColumns(mapOf([floorless]), [])).toThrow(
      /no regions/,
    );
  });

  // The uniqueness guarantee, swept rather than argued: every entry has to key back to the slot it
  // came from, or `deriveColumns` would file it under a different one and the skip-the-occupied
  // rule above would be checking the wrong keys.
  propertyTest.prop([fc.integer({ min: 0, max: 6300 })], {
    // The half-centimetre boundaries `toFixed(2)` rounds at, pinned: a sampled sweep can miss all
    // of them, and they are the only places the metre and millimetre forms can disagree.
    examples: [[0], [5], [15], [3575], [6300]],
  })("restores every entry under the key it was projected from", (alongMm) => {
    const alongM = alongMm / 1000;
    const column = emptyColumnAt(alongM, {
      key: deriveColumnKeyAt("A", alongM),
    });

    const projected = projectEmptyColumns(mapOf([column]), []);
    const restored = deriveColumns([], { emptyColumns: projected }, ROOM);

    expect([...restored.keys()]).toStrictEqual([column.key]);
  });

  // Projection then derivation, over the frozen extent's whole observable surface. `regions` is
  // deliberately absent: ADR 0044's wire shape stores one interval per column, so a stack of two
  // is `[[0,0.82],[1.5,2.2]]` in session and `[[0,2.6]]` restored — two correct spellings of the
  // same free space, and `deriveFreeSpans` reads only the lowest start and the top.
  it("restores a column whose observable fields are the ones it was projected from", () => {
    const cleared = emptyColumnAt(1.3, {
      key: deriveColumnKeyAt("A", 1.3),
      w: 0.6,
      d: 0.6,
      // The off-wall coordinate is the column's own half-depth (§3.2), so a fixture states it the
      // way `deriveColumns` would.
      z: 0.3,
      top: 2.6,
      regions: [
        [0, 0.82],
        [1.5, 2.2],
      ],
    });

    const restored = deriveColumns(
      [],
      { emptyColumns: projectEmptyColumns(mapOf([cleared]), []) },
      ROOM,
    );

    const column = restored.get(cleared.key);
    expect(column).toBeDefined();
    expect({
      wall: column?.wall,
      ry: column?.ry,
      x: column?.x,
      z: column?.z,
      w: column?.w,
      d: column?.d,
      top: column?.top,
      floor: Math.min(...(column?.regions ?? []).map(([start]) => start)),
    }).toStrictEqual({
      wall: cleared.wall,
      ry: cleared.ry,
      x: cleared.x,
      z: cleared.z,
      w: cleared.w,
      d: cleared.d,
      top: cleared.top,
      floor: 0,
    });
  });
});
