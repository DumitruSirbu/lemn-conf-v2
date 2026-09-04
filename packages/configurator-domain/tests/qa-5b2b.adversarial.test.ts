// Adversarial QA for M5B wave 5B2b — ADR 0044's write half.
//
// Two things are attacked here. First the projection's own guarantees, which the wave states as
// "correct by construction" rather than "checked afterwards": no entry may address an occupied
// column's key, no two entries may share a restored key, and every entry the projection emits must
// be a document `DesignSchema` and `validateDesignForCatalog` accept. Second the wave's third
// requirement — the claim that `resolveSnapY0M` cannot tell a restored column's single region from
// the several a session held — re-derived here as an executable sweep rather than as an argument.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  toInsertableBody,
  INSERTABLE_BODY_DEFINITIONS,
  type InsertableBody,
} from "../src/catalog.js";
import {
  evaluateInsertFit,
  type InsertOpening,
} from "../src/commands/insert-fit.js";
import {
  DesignSchema,
  EmptyColumnSchema,
  type Design,
  type DesignRoom,
} from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { toMetres } from "../src/millimetres.js";
import { recordedClearanceM } from "../src/occupied-depth.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  derivePlacementRecords,
  FIT_TOLERANCE_M,
  LEVELS,
  mergeAdjacentEmptyColumns,
  projectEmptyColumns,
  UnprojectableColumnError,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** Wide enough that the 6300 mm sweeps below never reach the wall's own end — this file is
 *  about the projection/restoration round trip, not `clipEmptyColumnsAtWallEnd`, which has its
 *  own test file. */
const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 7000,
  depthMm: 7000,
  heightMm: 2600,
};

function columnAt(alongM: number, overrides: Partial<Column> = {}): Column {
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

const KITCHEN_RECORDS: readonly PlacementRecord[] = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  CATALOG,
);

describe("the projection's uniqueness guarantee, attacked", () => {
  // The occupied-key skip, swept rather than exampled: whatever the frozen map holds, no entry may
  // ever address a key a placement is filed under. Removing the skip has to be red here and not
  // only in a fixture that happens to overlap.
  propertyTest.prop([
    fc.uniqueArray(fc.integer({ min: 0, max: 630 }), {
      minLength: 1,
      maxLength: 12,
    }),
  ])(
    "never emits an entry at a key a placement is filed under",
    (centimetres) => {
      const occupiedKeys = new Set(KITCHEN_RECORDS.map((record) => record.col));
      // Every column of the seeded kitchen, plus strips at swept centres. The strips that land on an
      // occupied key are the ones that matter — the projection must drop those and keep the rest.
      const strips = centimetres.map((cm) => columnAt(cm / 100));
      const frozen = new Map(
        deriveColumns(KITCHEN_RECORDS, {}, KITCHEN_L_DESIGN.room),
      );
      for (const strip of strips) frozen.set(strip.key, strip);

      const projected = projectEmptyColumns(frozen, KITCHEN_RECORDS);

      for (const entry of projected) {
        const restoredKey = deriveColumnKeyAt(
          entry.wall,
          toMetres(entry.alongMm),
        );
        expect(occupiedKeys.has(restoredKey)).toBe(false);
      }
    },
  );

  // The other half of the same guarantee. Two entries that restore to one key would silently lose a
  // space at load, because 5B2a made a stored entry overwrite rather than be dropped.
  propertyTest.prop([
    fc.uniqueArray(fc.integer({ min: 0, max: 6300 }), {
      minLength: 2,
      maxLength: 20,
    }),
  ])("emits no two entries that restore to one key", (millimetres) => {
    const frozen = mapOf(
      millimetres.map((mm) =>
        columnAt(mm / 1000, {
          key: deriveColumnKeyAt("A", mm / 1000),
        }),
      ),
    );

    const projected = projectEmptyColumns(frozen, []);

    const restoredKeys = projected.map((entry) =>
      deriveColumnKeyAt(entry.wall, toMetres(entry.alongMm)),
    );
    expect(new Set(restoredKeys).size).toBe(restoredKeys.length);
  });

  // A stronger statement than "no collisions": the map the projection restores to must be the map
  // it was projected from, on every key. A projection that dropped an entry, or moved one, is red.
  //
  // **Restated 2026-09-02 by wave 5B4b, which made the literal reading false.** `deriveColumns` now
  // merges adjacent empty columns (ADR 0046 part 2), and this fixture's columns are 150 mm wide at
  // swept centres, so two of them 150 mm apart abut and come back as one 300 mm column. The
  // comparison is therefore against the **merged** map — the same map the store holds, since
  // `resolveColumns` merges too — which keeps every mutant this was written for red: a dropped entry
  // is a missing key and a moved one is a key neither map has.
  propertyTest.prop([
    fc.uniqueArray(fc.integer({ min: 0, max: 6300 }), {
      minLength: 1,
      maxLength: 12,
    }),
  ])("restores the same key set it was projected from", (millimetres) => {
    const columns = millimetres.map((mm) =>
      columnAt(mm / 1000, { key: deriveColumnKeyAt("A", mm / 1000) }),
    );
    // Distinct millimetres can share a key — `toFixed(2)` buckets at 10 mm — so the map dedupes,
    // and the map's key set is the answer this compares against, not the input's length.
    const frozen = mapOf(columns);

    const restored = deriveColumns(
      [],
      { emptyColumns: projectEmptyColumns(frozen, []) },
      ROOM,
    );

    expect([...restored.keys()].sort()).toStrictEqual(
      [...mergeAdjacentEmptyColumns(frozen, []).keys()].sort(),
    );
  });

  // Determinism as a total order, not as one reversal. `compareEmptyColumns` broken to `return 0`
  // survives a two-element fixture on a stable sort; it does not survive shuffling.
  propertyTest.prop([
    // Distinct 10 mm buckets, which is what a map can actually hold: `deriveColumnKeyAt` renders
    // metres with `toFixed(2)`, so two centres 1 mm apart are one slot and the map would keep only
    // whichever the insertion order wrote last.
    fc.uniqueArray(fc.integer({ min: 0, max: 630 }), {
      minLength: 3,
      maxLength: 15,
    }),
    fc.integer({ min: 0, max: 2 ** 30 }),
  ])(
    "serialises one state one way, whatever order the map holds it in",
    (buckets, seed) => {
      const millimetres = buckets.map((bucket) => bucket * 10);
      const onWallA = millimetres.map((mm) =>
        columnAt(mm / 1000, { key: deriveColumnKeyAt("A", mm / 1000) }),
      );
      const onWallB = millimetres.map((mm) =>
        columnAt(mm / 1000, {
          wall: "B",
          key: deriveColumnKeyAt("B", mm / 1000),
          x: 0.29,
          z: mm / 1000,
        }),
      );
      const columns = [...onWallA, ...onWallB];
      const shuffled = shuffle(columns, seed);

      const forwards = projectEmptyColumns(mapOf(columns), []);
      const shuffledAnswer = projectEmptyColumns(mapOf(shuffled), []);

      expect(JSON.stringify(shuffledAnswer)).toBe(JSON.stringify(forwards));
      // And the order is the one the comparator claims, not merely a stable one: wall first, then
      // centre ascending.
      const ordered = [...forwards].sort((left, right) =>
        left.wall === right.wall
          ? left.alongMm - right.alongMm
          : left.wall.localeCompare(right.wall),
      );
      expect(forwards).toStrictEqual(ordered);
    },
  );
});

/** A deterministic shuffle, so a failing sweep replays. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const shuffled = [...items];
  let state = seed + 1;
  for (let index = shuffled.length - 1; index > 0; index--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swapWith = state % (index + 1);
    const held = shuffled[index] as T;
    shuffled[index] = shuffled[swapWith] as T;
    shuffled[swapWith] = held;
  }
  return shuffled;
}

describe("what the projection emits is a document the seams accept", () => {
  // Requirement 1's end-to-end round trip. A rounded centre would produce entries the schema still
  // accepts and `validateDesignForCatalog` then refuses with `EMPTY_COLUMN_KEY_COLLIDES_WITH_*` —
  // the seam refusing its own output. Whatever the projection emits must survive both.
  const SWEPT_STRIP_WIDTH_MM = 50;

  propertyTest.prop([
    // Strips on their own 50 mm pitch, from 100 mm so the leftmost one's edge stays on the wall.
    // The pitch is not incidental: two 50 mm entries 6 mm apart are two distinct map keys that
    // *overlap*, which the validator refuses for a reason that belongs to the frozen map's own
    // consistency rather than to the projection. A map a command can reach never holds those — the
    // store sweep asserts exactly that after every mutation.
    fc.uniqueArray(fc.integer({ min: 2, max: 70 }), {
      minLength: 1,
      maxLength: 8,
    }),
  ])("emits entries the schema and the validator both accept", (pitches) => {
    const millimetres = pitches.map((pitch) => pitch * SWEPT_STRIP_WIDTH_MM);
    const frozen = mapOf(
      millimetres.map((mm) =>
        columnAt(mm / 1000, {
          key: deriveColumnKeyAt("A", mm / 1000),
          w: SWEPT_STRIP_WIDTH_MM / 1000,
        }),
      ),
    );

    const projected = projectEmptyColumns(frozen, []);

    for (const entry of projected) {
      expect(EmptyColumnSchema.safeParse(entry).success).toBe(true);
    }
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [],
      emptyColumns: [...projected],
    };
    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(validateDesignForCatalog(design, CATALOG)).toStrictEqual([]);
  });

  // ADR 0043: a 50 mm strip is a legal state, and criterion 4 names "drop entries narrower than
  // NARROWEST_CATALOG_WIDTH_MM as tidy-up" as a mutant. Swept from one millimetre up so no width
  // floor can hide anywhere in the projection.
  propertyTest.prop([fc.integer({ min: 1, max: 800 })])(
    "records a strip of any width, with no floor of its own",
    (widthMm) => {
      const strip = columnAt(1.5, { w: widthMm / 1000 });

      const projected = projectEmptyColumns(mapOf([strip]), []);

      expect(projected.map((entry) => entry.widthMm)).toStrictEqual([widthMm]);
    },
  );

  // The refusal's own boundary. `toExactMillimetres` forgives 1e-3 mm of float noise and refuses
  // anything further, and the projection must inherit exactly that line rather than a looser one.
  it("accepts the float noise a metre round trip picks up and refuses real drift", () => {
    const noisy = 3.42 + 9e-7;
    const drifted = 3.42 + 2e-6;

    expect(
      projectEmptyColumns(
        mapOf([columnAt(noisy, { key: deriveColumnKeyAt("A", noisy) })]),
        [],
      )[0]?.alongMm,
    ).toBe(3420);
    expect(() =>
      projectEmptyColumns(
        mapOf([columnAt(drifted, { key: deriveColumnKeyAt("A", drifted) })]),
        [],
      ),
    ).toThrow(UnprojectableColumnError);
  });

  /* `refuseUnreproducibleKey` is not decoration, and this is the arithmetic that reaches it: a
   * centre of 3425 mm sits on a `toFixed(2)` rounding boundary, and the double for 3.425 renders
   * "3.42" while the same value plus a fraction of a micrometre renders "3.43". A column carrying
   * that much noise is keyed one bucket above the millimetre the projection would write, so the
   * entry would be restored into its neighbour's slot. It is refused, not rounded and not moved. */
  it("refuses a centre whose noise keys it one bucket away from its own millimetre", () => {
    const onTheBoundary = 3.425 + 9e-7;
    const column = columnAt(onTheBoundary, {
      key: deriveColumnKeyAt("A", onTheBoundary),
    });

    expect(column.key).toBe("A|3.43");
    expect(deriveColumnKeyAt("A", toMetres(3425))).toBe("A|3.42");
    expect(() => projectEmptyColumns(mapOf([column]), [])).toThrow(
      /would be restored under key A\|3\.42/,
    );
  });

  // Each of the six wire fields refused on its own, so a guard removed from one of them cannot hide
  // behind another field's check.
  const SUB_MILLIMETRE_FIELDS: readonly (readonly [string, Partial<Column>])[] =
    [
      ["widthMm", { w: 0.1505 }],
      ["y0Mm", { regions: [[0.0005, 0.82]] }],
      ["topMm", { top: 0.8205 }],
      ["depthMm", { d: 0.5805 }],
    ];

  for (const [field, override] of SUB_MILLIMETRE_FIELDS) {
    it(`refuses a sub-millimetre ${field} rather than rounding it`, () => {
      expect(() =>
        projectEmptyColumns(mapOf([columnAt(1.5, override)]), []),
      ).toThrow(UnprojectableColumnError);
    });
  }

  it("refuses a non-finite coordinate, which sits on no millimetre at all", () => {
    expect(() =>
      projectEmptyColumns(mapOf([columnAt(1.5, { top: Number.NaN })]), []),
    ).toThrow(UnprojectableColumnError);
    expect(() =>
      projectEmptyColumns(
        mapOf([columnAt(1.5, { d: Number.POSITIVE_INFINITY })]),
        [],
      ),
    ).toThrow(UnprojectableColumnError);
  });
});

/**
 * Requirement 3, re-derived rather than restated.
 *
 * The claim under test: `resolveSnapY0M` answers `minY = takesSpan ? spanY0 : y0` whatever
 * `column.regions` holds, so a restored column's single interval cannot snap an insert anywhere an
 * in-session column's several would not.
 *
 * The argument has three joints and each is attacked by construction here rather than by reading:
 * `refuseHeight` runs first (so `minY + h <= spanTop + tol` always holds when the snap is reached),
 * `takesSpan` is the same expression in both places, and every other candidate is filtered to
 * `>= minY - ε`. The sweep generates regions that violate every shape the argument relies on —
 * starts below `minY`, starts above `top`, unsorted, duplicated, and empty — and compares against
 * the collapsed single interval a projection would have written.
 */
describe("a restored column's one region snaps where the session's several did", () => {
  const BODY = insertableBody("wall-cabinet");
  const TALL_BODY = insertableBody("tall-pantry");

  function insertableBody(buildId: string): InsertableBody {
    const entry = INSERTABLE_BODY_DEFINITIONS.find(([id]) => id === buildId);
    if (!entry) throw new Error(`no catalogue entry ${buildId}`);
    const body = toInsertableBody(entry[0], entry[1]);
    if (!body) throw new Error(`${buildId} is not insertable`);
    return body;
  }

  const regionsArbitrary = fc.array(
    fc
      .tuple(
        fc.integer({ min: -500, max: 2600 }),
        fc.integer({ min: 0, max: 2600 }),
      )
      .map(([startMm, endMm]): [number, number] => [
        startMm / 1000,
        Math.max(startMm, endMm) / 1000,
      ]),
    { maxLength: 6 },
  );

  function columnWith(regions: readonly [number, number][]): Column {
    return {
      key: "A|1.30",
      wall: "A",
      ry: 0,
      x: 1.3,
      z: 0.29,
      w: 0.6,
      d: 0.58,
      top: 2.6,
      regions: [...regions],
      hasFullHeightUnder: false,
    };
  }

  function openingIn(y0: number, h: number, spanY0: number, spanH: number) {
    const opening: InsertOpening = {
      col: "A|1.30",
      wall: "A",
      alongM: 1.3,
      w: 0.6,
      d: recordedClearanceM(0.58),
      y0,
      h,
      spanY0,
      spanH,
    };
    return opening;
  }

  // The core claim. Whatever the regions, a successful fit seats the body at `minY` exactly — so
  // no region start the projection drops can ever have been the answer.
  propertyTest.prop([
    regionsArbitrary,
    fc.constantFrom(...LEVELS.map(([start]) => start)),
    fc.integer({ min: 300, max: 2600 }),
  ])(
    "seats a fitting body at the opening's own floor, whatever the regions",
    (regions, levelStart, spanHeightMm) => {
      const opening = openingIn(
        levelStart,
        0.7,
        levelStart,
        spanHeightMm / 1000,
      );
      const fit = evaluateInsertFit({
        body: BODY,
        opening,
        column: columnWith(regions),
      });

      if (!fit.ok) return;
      const takesSpan = fit.plan.heightM > opening.h + FIT_TOLERANCE_M;
      const minY = takesSpan ? opening.spanY0 : opening.y0;
      expect(fit.plan.y0M).toBe(minY);
    },
  );

  // The wave's actual substitution, stated as an equality: a session column's regions against the
  // one interval `projectEmptyColumns` writes in their place.
  propertyTest.prop([
    regionsArbitrary.filter((regions) => regions.length > 0),
    fc.constantFrom(...LEVELS.map(([start]) => start)),
    fc.constantFrom(0.4, 0.7, 0.86, 2.0),
    fc.boolean(),
  ])(
    "answers identically for the collapsed interval a reload restores",
    (regions, levelStart, openingHeight, tall) => {
      const collapsed: [number, number][] = [
        [Math.min(...regions.map(([start]) => start)), 2.6],
      ];
      const opening = openingIn(levelStart, openingHeight, 0, 2.6);
      const body = tall ? TALL_BODY : BODY;

      const inSession = evaluateInsertFit({
        body,
        opening,
        column: columnWith(regions),
      });
      const restored = evaluateInsertFit({
        body,
        opening,
        column: columnWith(collapsed),
      });

      expect(restored).toStrictEqual(inSession);
    },
  );

  // The degenerate case the argument has to survive on its own: a column with no region at all
  // offers no region candidate, and `minY` still has to be the answer.
  it("still seats at the floor when the column offers no region candidate", () => {
    const opening = openingIn(1.5, 0.7, 1.5, 0.7);

    const fit = evaluateInsertFit({
      body: BODY,
      opening,
      column: columnWith([]),
    });

    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.plan.y0M).toBe(1.5);
  });

  // Non-vacuity: the sweep above would prove nothing if every generated fit were a refusal.
  it("accepts at least one insert per level start, so the sweep has content", () => {
    const accepted = LEVELS.filter(([levelStart]) => {
      const fit = evaluateInsertFit({
        body: BODY,
        opening: openingIn(levelStart, 0.7, levelStart, 0.7),
        column: columnWith([[0, 2.6]]),
      });
      return fit.ok;
    });

    expect(accepted.length).toBeGreaterThan(0);
  });
});
