// Adversarial QA on AUD-005 — ADR 0090 Amendment B's addendum, as implemented by `ace64f3`:
// **the cap may narrow a column and may not rename it.**
//
// `clip-empty-columns-at-wall-end.test.ts` states that rule on one column at one width. This file
// attacks the properties the rule rests on rather than the examples it was stated with, because
// three of the addendum's claims are universal quantifications a fixed example cannot witness:
//
//   - *"Clipping can only ever shrink a column's width"* — the argument that lets the clip run
//     before the split. Asserted over the whole reachable range rather than at 600 mm.
//   - *"The far edge moves inward to the wall's own end and the near edge never moves."*
//   - *"A capped column is the same column, narrower"* — one key, both faces, at every width.
//
// It also attacks the boundaries the addendum's own prose names and the example file does not
// reach: a column narrowed to one millimetre, a cap applied twice, two caps on two walls of one
// map, and a cap standing on the column a document recorded — which is the case backlog 52 is
// about, seen one package below the store.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { DesignRoom } from "../src/design.js";
import { KITCHEN_L_DESIGN } from "../src/fixtures/kitchen-l-design.js";
import { toExactMillimetres } from "../src/millimetres.js";
import { alongWallCoordinate } from "../src/module-grid.js";
import { finishesAtMm } from "../src/occupied-depth.js";
import { wallLengthMm } from "../src/queries/overflowing-placements.js";
import {
  clipEmptyColumnsAtWallEnd,
  deriveColumns,
  recomputeVoids,
  type ColumnExtent,
  type PlacementRecord,
} from "../src/void-engine.js";

/** The seeded room, read rather than restated (ADR 0083 decision 1). Wall A is 3560 mm long here
 *  and wall B 2920, and every fixture below measures against those two rather than against a
 *  literal. */
const ROOM: DesignRoom = { ...KITCHEN_L_DESIGN.room };

const WALL_A_END_MM = wallLengthMm("A", ROOM);
const WALL_B_END_MM = wallLengthMm("B", ROOM);

/** A member-less column at a millimetre centre and width, on either wall — structurally what
 *  `deriveColumns` hands the pass. Millimetres in the signature rather than metres, because every
 *  boundary this file attacks is stated in millimetres and a metre literal is where a half-pixel of
 *  float noise would enter. */
function columnAtMm(
  wall: "A" | "B",
  centreMm: number,
  widthMm: number,
  overrides: Partial<ColumnExtent> = {},
): ColumnExtent {
  const centreM = centreMm / 1000;
  return {
    key: `${wall}|${centreM.toFixed(2)}`,
    wall,
    ry: 0,
    x: wall === "A" ? centreM : 0.29,
    z: wall === "A" ? 0.29 : centreM,
    w: widthMm / 1000,
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

function centreMmOf(column: ColumnExtent): number {
  const centre = toExactMillimetres(alongWallCoordinate(column.wall, column));
  if (centre === undefined)
    throw new Error(`${column.key} does not stand on a whole millimetre`);
  return centre;
}

function widthMmOf(column: ColumnExtent): number {
  const width = toExactMillimetres(column.w);
  if (width === undefined)
    throw new Error(`${column.key} is not a whole millimetre wide`);
  return width;
}

function nearEdgeMmOf(column: ColumnExtent): number {
  return centreMmOf(column) - widthMmOf(column) / 2;
}

function farEdgeMmOf(column: ColumnExtent): number {
  return centreMmOf(column) + widthMmOf(column) / 2;
}

describe("the cap narrows a column and does not rename it, at every width", () => {
  // The addendum's rule as a quantified property rather than as one example. Every column here
  // overflows wall A by construction — the near edge is on the wall and the far edge is past its
  // end — so the pass has something to say about all of them, which is what stops the sweep passing
  // by never entering the branch.
  const anOverflowingColumn = fc
    .record({
      nearEdgeMm: fc.integer({ min: 0, max: WALL_A_END_MM - 2 }),
      overhangMm: fc.integer({ min: 1, max: 900 }),
    })
    .map(({ nearEdgeMm, overhangMm }) => {
      // Even, so the centre lands on a whole millimetre before the clip as well as after it: an odd
      // width is `landsOnWholeMillimetres`'s own declined case and has its own test below.
      const widthMm =
        2 * Math.ceil((WALL_A_END_MM - nearEdgeMm + overhangMm) / 2);
      return columnAtMm("A", nearEdgeMm + widthMm / 2, widthMm);
    });

  propertyTest.prop([anOverflowingColumn])(
    "keeps the key it arrived on",
    (column) => {
      const clipped = clipEmptyColumnsAtWallEnd(mapOf([column]), [], ROOM);
      const survivor = clipped.get(column.key);

      // A column wholly off the wall is dropped rather than renamed, which is still "no second
      // key": the map holds either this column under its own key or nothing at all.
      expect([...clipped.keys()]).toStrictEqual(
        survivor === undefined ? [] : [column.key],
      );
      if (survivor) expect(survivor.key).toBe(column.key);
    },
  );

  propertyTest.prop([anOverflowingColumn])(
    "only ever shrinks, which is what lets it run before the split",
    (column) => {
      const survivor = clipEmptyColumnsAtWallEnd(mapOf([column]), [], ROOM).get(
        column.key,
      );
      if (!survivor) return;

      expect(widthMmOf(survivor)).toBeLessThanOrEqual(widthMmOf(column));
    },
  );

  propertyTest.prop([anOverflowingColumn])(
    "holds the near edge, whether it clips the column or declines to",
    (column) => {
      // Weaker than "and brings the far edge to the wall's end" **on purpose**: that stronger claim
      // is false today, and the case is its own test at the end of this file rather than folded in
      // here, so a reader meets the hole by name instead of inside a sweep.
      const survivor = clipEmptyColumnsAtWallEnd(mapOf([column]), [], ROOM).get(
        column.key,
      );
      if (!survivor) return;

      expect(nearEdgeMmOf(survivor)).toBe(nearEdgeMmOf(column));
    },
  );

  propertyTest.prop([anOverflowingColumn])(
    "carries every frozen fact but the along-wall extent across untouched",
    (column) => {
      const survivor = clipEmptyColumnsAtWallEnd(mapOf([column]), [], ROOM).get(
        column.key,
      );
      if (!survivor) return;

      expect(survivor.wall).toBe(column.wall);
      expect(survivor.d).toBe(column.d);
      expect(survivor.top).toBe(column.top);
      expect(survivor.ry).toBe(column.ry);
      expect(survivor.regions).toStrictEqual(column.regions);
      // Wall A's along-wall axis is `x`, so `z` — the off-wall coordinate — may not move.
      expect(survivor.z).toBe(column.z);
    },
  );

  // A second pass over the pass's own output must change nothing: after the first clip the far edge
  // is at the wall's end, which ADR 0067's equality-fits rule says is not past it. Idempotence is
  // what makes it safe for the funnel to run this ahead of a split that may itself re-enter the
  // map, and it is asserted **by value** — the pass allocates a fresh map whenever any column
  // overflowed, including when every one of them was declined, so identity is not the claim.
  propertyTest.prop([anOverflowingColumn])(
    "is idempotent, so applying it twice changes nothing",
    (column) => {
      const once = clipEmptyColumnsAtWallEnd(mapOf([column]), [], ROOM);
      const twice = clipEmptyColumnsAtWallEnd(once, [], ROOM);

      expect([...twice.entries()]).toStrictEqual([...once.entries()]);
    },
  );
});

describe("the boundaries the cap's own prose names", () => {
  it("keeps a column the wall covers by one millimetre, rather than dropping it", () => {
    // The narrowest column this pass can publish: a near edge one millimetre inside the wall's own
    // end. `nearEdgeMm >= wallEndMm` drops; one below it does not, and the result is a 1 mm column
    // whose centre lands on a half millimetre — so `landsOnWholeMillimetres` declines it and the
    // column is left exactly as it was rather than published at 1 mm.
    const original = columnAtMm("A", WALL_A_END_MM - 1 + 100, 200);
    const clipped = clipEmptyColumnsAtWallEnd(mapOf([original]), [], ROOM);

    expect(clipped.get(original.key)).toBe(original);
  });

  it("keeps a column the wall covers by two millimetres, at two millimetres wide", () => {
    // The same boundary one millimetre further in, where the clipped centre *does* land on a whole
    // millimetre. Near-zero is publishable and is published — under the original key.
    const original = columnAtMm("A", WALL_A_END_MM - 2 + 100, 200);
    const survivor = clipEmptyColumnsAtWallEnd(mapOf([original]), [], ROOM).get(
      original.key,
    );
    if (!survivor) throw new Error("a 2 mm remainder on the wall was dropped");

    expect(widthMmOf(survivor)).toBe(2);
    expect(survivor.key).toBe(original.key);
    expect(nearEdgeMmOf(survivor)).toBe(WALL_A_END_MM - 2);
  });

  it("caps both ends of one map, once per wall, under both original keys", () => {
    // Two walls, two overflows, one pass. The addendum's "one column, one identity" has to survive
    // a map where more than one column is rewritten, because `clipped` is built by mutation and a
    // second write is where a key collision would first appear.
    const onWallA = columnAtMm("A", WALL_A_END_MM - 100, 600);
    const onWallB = columnAtMm("B", WALL_B_END_MM - 100, 600);

    const clipped = clipEmptyColumnsAtWallEnd(
      mapOf([onWallA, onWallB]),
      [],
      ROOM,
    );

    expect([...clipped.keys()].sort()).toStrictEqual(
      [onWallA.key, onWallB.key].sort(),
    );
    expect(farEdgeMmOf(clipped.get(onWallA.key) ?? onWallA)).toBe(
      WALL_A_END_MM,
    );
    expect(farEdgeMmOf(clipped.get(onWallB.key) ?? onWallB)).toBe(
      WALL_B_END_MM,
    );
    for (const [slot, column] of clipped) expect(slot).toBe(column.key);
  });

  it("leaves an occupied column alone however far it reaches, at every width", () => {
    // The fact the whole key-preserving argument rests on: *"an occupied column is never clipped"*,
    // so `key = deriveColumnKeyAt(centre)` is never load-bearing for a capped one. Swept rather
    // than shown once, because a single example cannot distinguish "never clips an occupied
    // column" from "does not clip this one".
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 2000 }), (overhangMm) => {
        const widthMm = 2 * Math.ceil(overhangMm / 2) + 200;
        const column = columnAtMm("A", WALL_A_END_MM, widthMm);
        const columns = mapOf([column]);

        expect(
          clipEmptyColumnsAtWallEnd(columns, [recordIn(column.key)], ROOM),
        ).toBe(columns);
      }),
    );
  });
});

describe("a recorded space the cap narrows", () => {
  /** The document backlog 52 is about, one package below the store: a space recorded flush to the
   *  end of wall B, wide enough that the wall no longer covers it. `deriveColumns` restores it
   *  under the key its own `alongMm` derives (`toColumnExtent`), then caps it. */
  function aSpacePastTheEndOfWallB(widthMm: number) {
    return [
      {
        wall: "B" as const,
        alongMm: WALL_B_END_MM - 100,
        widthMm,
        y0Mm: 0,
        topMm: 820,
        depthMm: 580,
      },
    ];
  }

  it("publishes it under the key the document restores it at, not under its clipped centre", () => {
    // The addendum's own measurement, stated as the relationship rather than as the two numbers:
    // the record stands at `alongMm`, `toColumnExtent` keys it from `alongMm`, and the capped
    // column must publish under that same key — otherwise a command handed the recorded map cannot
    // find the column a published void names (`COLUMN_MISMATCH`).
    const recordedCentreMm = WALL_B_END_MM - 100;
    const recordedKey = `B|${(recordedCentreMm / 1000).toFixed(2)}`;

    const columns = deriveColumns(
      [],
      { emptyColumns: aSpacePastTheEndOfWallB(600) },
      ROOM,
    );

    expect(columns.has(recordedKey)).toBe(true);
    const published = columns.get(recordedKey);
    if (!published) throw new Error("the recorded space published no column");
    // Narrowed — the record runs 2520 to 3120 and the wall covers 400 of it — and still keyed at
    // the recorded 2820 rather than at the clipped centre of 2720.
    expect(widthMmOf(published)).toBe(400);
    expect(published.key).toBe(recordedKey);
    expect(farEdgeMmOf(published)).toBe(WALL_B_END_MM);
  });

  it("publishes no column reaching past either wall, at every recorded width", () => {
    // ADR 0069's owner ruling, swept over the widths a document can record rather than at the one
    // the addendum measured: whatever the record says, nothing offered may cross a wall's end.
    //
    // **This is red, on the same defect the last block of this file names**, reached on wall B
    // instead of wall A: every width whose half is odd leaves the clip an odd remainder, which
    // `landsOnWholeMillimetres` declines. It is kept as a sweep as well as an example because the
    // example alone reads as one unlucky number and the sweep shows the whole residue class.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), (halfStepMm) => {
        const widthMm = 2 * halfStepMm;
        const columns = deriveColumns(
          [],
          { emptyColumns: aSpacePastTheEndOfWallB(widthMm) },
          ROOM,
        );

        for (const column of columns.values()) {
          expect(
            farEdgeMmOf(column),
            `${column.key} at recorded width ${String(widthMm)}`,
          ).toBeLessThanOrEqual(wallLengthMm(column.wall, ROOM));
        }
      }),
    );
  });
});

describe("ADR 0069's 'never', against the clip that declines", () => {
  /** The counterexample the sweep above shrinks to, written out so it can be read without running
   *  fast-check: a member-less column of an **even** width, at an **even** centre, on the shipped
   *  room's **even** 3560 mm wall A.
   *
   *  `alongMm` 1782 and `widthMm` 3558 put the near edge at 3 and the far edge at 3561. The clip
   *  therefore wants a width of `3560 - 3 = 3557`, whose centre lands on a half millimetre, so
   *  `landsOnWholeMillimetres` declines and the column is published exactly as it arrived — 1 mm
   *  past the end of its wall — and `recomputeVoids` publishes an opening through it.
   *
   *  **`clip-empty-columns-at-wall-end.ts`'s own justification for the decline understates when it
   *  fires.** It says an even width *"never puts this off the grid by itself"* and attributes every
   *  reachable case to an odd `wallEndMm` from the room. What actually decides it is the parity of
   *  `wallEndMm - nearEdgeMm`, and a near edge is odd whenever the column's half-width is —
   *  `widthMm % 4 === 2`, which 3558 and, for instance, a 570 mm corner return's remainder both
   *  satisfy. The existing example test pins only the odd-room case, so this branch has never been
   *  measured against the ruling it breaks. */
  const AN_EVEN_COLUMN_THE_CLIP_DECLINES = {
    wall: "A" as const,
    alongMm: 1782,
    widthMm: 3558,
    y0Mm: 0,
    topMm: 820,
    depthMm: 580,
  };

  it("offers no opening past the end of a wall, even when the clip declines", () => {
    const columns = deriveColumns(
      [],
      { emptyColumns: [AN_EVEN_COLUMN_THE_CLIP_DECLINES] },
      ROOM,
    );

    for (const record of recomputeVoids([], columns)) {
      const farEdgeMm = Math.round(
        ((record.wall === "A" ? record.x : record.z) + record.w / 2) * 1000,
      );
      expect(farEdgeMm, record.id).toBeLessThanOrEqual(
        wallLengthMm(record.wall, ROOM),
      );
    }
  });
});

/** A minimal occupied record filed under one column key. Only `col` is read by the pass; the rest
 *  exists to satisfy `PlacementRecord`'s shape, exactly as the example file's own does. */
function recordIn(col: string): PlacementRecord {
  return {
    kitchenSettings: {},
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
