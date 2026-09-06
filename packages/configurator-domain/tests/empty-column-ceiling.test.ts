// M5 wave 5G — ADR 0052: 800 mm is the ceiling on any empty column, and a shrink that frees more
// splits it.
//
// The domain half. Criteria 5G-1, 5G-2 and 5G-5 are properties of the store's `resolveColumns` and
// live in `apps/web/tests/store/empty-column-ceiling.test.ts`; what is here is the arithmetic those
// rest on, the map-level normalisation, and criterion 5G-3's invariant over generated sequences.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { CABINETRY_MAX_WIDTH_MM } from "../src/catalog.js";
import { insertBody } from "../src/commands/insert-body.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import { setWidth } from "../src/commands/set-width.js";
import type { Design } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../src/module-grid.js";
import { splitEmptySpanAtCap } from "../src/split-empty-span.js";
import {
  deriveColumns,
  derivePlacementRecords,
  mergeAdjacentEmptyColumns,
  recomputeVoids,
  splitOversizedEmptyColumns,
  withCurrentFullHeightMembers,
  type Column,
  type ColumnExtent,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";
import { createFakeProbe } from "./support/fake-probe.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";
const PROBE = createFakeProbe({ catalog: CATALOG });

/** The tolerance criterion 5G-3 states, and the only one it may use: a column's width is a metre
 *  float derived from whole millimetres, so it is compared to the ceiling with the noise a unit
 *  conversion carries and with nothing wider. */
const WIDTH_TOLERANCE_MM = 1e-6;

describe("the two 800s, and which one depends on which", () => {
  /** Work item 1. `CABINETRY_MAX_WIDTH_MM` is §7's widest *cabinet*; `MAX_EMPTY_COLUMN_WIDTH_MM` is
   *  ADR 0052's widest *empty column*. They are separate constants because they are separate rules,
   *  and this is the one relation that must hold between them: the ceiling on a space exists so that
   *  any space the customer is left with is one the catalogue can fill, so it may never exceed the
   *  widest thing the catalogue builds.
   *
   *  Asserted rather than imported, because `module-grid.ts` is a dependency-free leaf and reading
   *  the catalogue from it is the cycle that once made `LEVEL_SNAP_M` resolve to `NaN`. */
  it("never lets the empty-column ceiling exceed the widest cabinet", () => {
    expect(MAX_EMPTY_COLUMN_WIDTH_MM).toBeLessThanOrEqual(
      CABINETRY_MAX_WIDTH_MM,
    );
  });
});

describe("splitting a span at the ceiling", () => {
  it("leaves a span at or under the ceiling as the one column it already was", () => {
    expect(splitEmptySpanAtCap(0, MAX_EMPTY_COLUMN_WIDTH_MM)).toStrictEqual([
      { centreMm: 400, widthMm: MAX_EMPTY_COLUMN_WIDTH_MM },
    ]);
  });

  /** A resize that consumes an empty column exactly removes its key (ADR 0031 rule 6) rather than
   *  recording a column of zero width, so an empty span is no pieces at all. */
  it("yields no pieces for an empty span", () => {
    expect(splitEmptySpanAtCap(1900, 1900)).toStrictEqual([]);
  });

  /** **The near end fills first.** Passing the far edge on the left is how a shrink funded from its
   *  left side asks for the same rule, and the ceiling-sized piece must still land against the run
   *  rather than at the wall. */
  it("fills from the near edge whichever way the span runs", () => {
    expect(splitEmptySpanAtCap(2800, 1900)).toStrictEqual([
      { centreMm: 2400, widthMm: 800 },
      { centreMm: 1950, widthMm: 100 },
    ]);
  });

  /** Conservation, over a swept sequence of widths rather than a chosen one: no piece exceeds the
   *  ceiling, the pieces meet at their edges, and the outermost two are the edges passed in — so no
   *  millimetre of wall is stranded. Stranding is the outcome ADR 0046 rejected by name. */
  propertyTest.prop([fc.integer({ min: 1, max: 5000 })])(
    "tiles the span exactly, at every width",
    (totalMm) => {
      const pieces = splitEmptySpanAtCap(1000, 1000 + totalMm);

      expect(
        pieces.every((piece) => piece.widthMm <= MAX_EMPTY_COLUMN_WIDTH_MM),
      ).toBe(true);
      expect(pieces.every((piece) => piece.widthMm > 0)).toBe(true);
      expect(pieces.reduce((sum, piece) => sum + piece.widthMm, 0)).toBe(
        totalMm,
      );
      const edges = pieces.map((piece) => [
        piece.centreMm - piece.widthMm / 2,
        piece.centreMm + piece.widthMm / 2,
      ]);
      expect(edges[0]?.[0]).toBe(1000);
      expect(edges[edges.length - 1]?.[1]).toBe(1000 + totalMm);
      expect(
        edges.every(([, right], index) => {
          const next = edges[index + 1];
          return next === undefined || next[0] === right;
        }),
      ).toBe(true);
    },
  );
});

describe("normalising a frozen map that already holds an oversized column", () => {
  /** The state the map-level normaliser exists for, and the one no command produces on the shipped
   *  kitchen: a member-less column wider than the ceiling, arriving from a design whose recorded
   *  space predates the rule or from a delete of a wide column. `resolveColumns` runs this after
   *  every command precisely because a **delete** never reaches the width command — it is not given
   *  the frozen map at all. */
  it("cuts a 1400 mm member-less column into an 800 and a 600", () => {
    const world = loadWide(1400);

    const split = splitOversizedEmptyColumns(world.columns, world.records);

    const pieces = memberLess(split, world.records);
    expect(pieces.map((column) => Math.round(column.w * 1000))).toStrictEqual([
      800, 600,
    ]);
    expect(pieces.map((column) => column.key)).toStrictEqual([
      "A|2.30",
      "A|3.00",
    ]);
    expect(
      pieces.reduce((sum, column) => sum + Math.round(column.w * 1000), 0),
    ).toBe(1400);
  });

  /** An occupied column is never cut, however wide: its width is its members' and it publishes no
   *  opening of its own, so the ceiling has nothing to say about it. The shipped kitchen's 900 mm
   *  corner base is the live instance, and cutting it would move a cabinet. */
  it("leaves an occupied column alone and returns the map by identity", () => {
    const records = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG);
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);

    expect(splitOversizedEmptyColumns(columns, records)).toBe(columns);
    expect(columns.get("A|0.45")?.w).toBeCloseTo(0.9, 12);
  });
});

describe("which side of the freed space takes the ceiling", () => {
  /** **The half of ADR 0052 the map-level normaliser cannot express, and the reason the width
   *  command cuts its own span.** The rule is *the column nearest the resized run fills first*; a
   *  frozen map has no near side, so `splitOversizedEmptyColumns` can only fill left to right. The
   *  two agree for a shrink funded from the right — there the near edge *is* the left one — and
   *  disagree for one funded from the left, which is what this builds.
   *
   *  The seeded kitchen cannot reach it: `p6` is the one resizable column (ADR 0048) and shrinks by
   *  at most 200 mm, so a space on its left tops out at 800 and never needs cutting. It is reachable
   *  from a **loaded** design, which is where the fixture comes from: an 800 mm recorded space at
   *  700–1500, legal under this very wave, abutting the pantry with the fridge column standing on
   *  its right so the right side cannot fund.
   *
   *  Shrinking 600 → 400 holds the pantry's right edge, so 700–1700 is free. Filled from the run
   *  outwards that is 800 at 900–1700 and 200 at 700–900; filled left to right it would be the other
   *  way about, and the customer would be left with the sliver against the cabinet they just
   *  resized. */
  it("puts the ceiling-sized column against the run, not against the far wall", () => {
    const world = load(withSpaceLeftOfThePantry());

    const result = setWidth({
      design: world.design,
      catalog: CATALOG,
      columns: world.columns,
      target: { kind: "placement", id: "p6" },
      widthMm: 400,
      probe: PROBE,
      occurredAt: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(result.design, result.effect.columns);
    const empties = memberLess(after.columns, after.records);
    expect(empties.map((column) => column.key)).toStrictEqual([
      "B|0.80",
      "B|1.30",
    ]);
    expect(empties.map((column) => Math.round(column.w * 1000))).toStrictEqual([
      200,
      MAX_EMPTY_COLUMN_WIDTH_MM,
    ]);
  });
});

describe("no command leaves an empty column wider than the ceiling", () => {
  /** **Criterion 5G-3.** The invariant over generated sequences of legal commands rather than over
   *  chosen ones: after *every* command, each member-less column is at or under the ceiling.
   *
   *  The sequence is applied exactly as the store applies it, `resolveColumns` and all, because that
   *  is where the split and the merge meet — a property run against the raw published map would be
   *  testing half the seam.
   *
   *  **It asserts its own reach.** The seeded kitchen loads with zero empty columns, so a generator
   *  that never frees a span wider than the ceiling would pass this vacuously; the run counts the
   *  states in which a contiguous member-less span *exceeds* the ceiling — which is exactly the
   *  pre-split span the rule is about — and fails if it never reached one. */
  it("holds at every step of every generated sequence, and reaches the state", () => {
    let overCapSpans = 0;
    fc.assert(
      fc.property(
        // **Weighted, and that is load-bearing.** Reaching a free span over the ceiling on the
        // seeded kitchen takes six specific taps — both members of the fridge column, then four
        // `−50`s on the pantry — and an evenly weighted draw of five steps reaches that
        // composition rarely enough that the coverage assertion below was flaky. Repeating the two
        // steps that open space is how the generator is aimed at the state without scripting it.
        fc.array(
          fc.constantFrom<Step>(
            "clear-fridge",
            "clear-fridge",
            "narrow-pantry",
            "narrow-pantry",
            "narrow-pantry",
            "widen-pantry",
            "fill-widest",
            "remove-any",
          ),
          { minLength: 8, maxLength: 16 },
        ),
        (steps) => {
          let world = load(KITCHEN_L_DESIGN);
          for (const step of steps) {
            world = apply(world, step);
            for (const column of memberLess(world.columns, world.records)) {
              expect(column.w * 1000).toBeLessThanOrEqual(
                MAX_EMPTY_COLUMN_WIDTH_MM + WIDTH_TOLERANCE_MM,
              );
            }
            overCapSpans += countSpansOverCap(world);
          }
        },
      ),
      { numRuns: 60 },
    );

    expect(overCapSpans).toBeGreaterThan(0);
  });
});

type Step =
  | "clear-fridge"
  | "narrow-pantry"
  | "widen-pantry"
  | "fill-widest"
  | "remove-any";

interface World {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
}

/** The store's `resolveColumns` in one function: cut what exceeds the ceiling, merge what fits under
 *  it, then re-answer `hasFullHeightUnder` over the extents the pair just wrote. */
function advance(
  design: Design,
  published: ReadonlyMap<string, Column>,
): World {
  const records = derivePlacementRecords(design, CATALOG);
  const columns = withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(
      splitOversizedEmptyColumns(published, records),
      records,
    ),
    records,
  );
  return { design, columns, records, voids: recomputeVoids(records, columns) };
}

function load(design: Design): World {
  const records = derivePlacementRecords(design, CATALOG);
  return advance(
    design,
    deriveColumns(records, { emptyColumns: design.emptyColumns }, design.room),
  );
}

/** One step, or the world unchanged. **A refusal is a legal step**: the commands under test refuse
 *  from ordinary input all the time — a pantry already at its floor, an opening no body fits — and a
 *  generator that threw on one would only ever explore its first few states. */
function apply(world: World, step: Step): World {
  switch (step) {
    case "clear-fridge":
      return removeFirst(world, ["p24", "p7"]);
    case "remove-any":
      return removeFirst(
        world,
        world.records.map((record) => record.id),
      );
    case "narrow-pantry":
      return resizePantry(world, -50);
    case "widen-pantry":
      return resizePantry(world, 50);
    case "fill-widest":
      return fillWidestOpening(world);
  }
}

function removeFirst(world: World, ids: readonly string[]): World {
  for (const id of ids) {
    const result = removePlacement({
      design: world.design,
      catalog: CATALOG,
      target: { kind: "placement", id },
      occurredAt: NOW,
    });
    if (result.ok) return advance(result.design, world.columns);
  }
  return world;
}

function resizePantry(world: World, deltaMm: number): World {
  const pantry = world.records.find((record) => record.id === "p6");
  if (!pantry) return world;
  const result = setWidth({
    design: world.design,
    catalog: CATALOG,
    columns: world.columns,
    target: { kind: "placement", id: "p6" },
    widthMm: Math.round(pantry.frame.w * 1000) + deltaMm,
    probe: PROBE,
    occurredAt: NOW,
  });
  return result.ok ? advance(result.design, result.effect.columns) : world;
}

/** An insert into the widest opening there is, which is the one most likely to leave a remainder the
 *  ceiling has to cut. */
function fillWidestOpening(world: World): World {
  const opening = [...world.voids].sort((left, right) => right.w - left.w)[0];
  if (!opening) return world;
  const result = insertBody({
    design: world.design,
    catalog: CATALOG,
    columns: world.columns,
    target: { kind: "void", id: opening.id },
    buildId: "base-bottle-cargo",
    probe: PROBE,
    occurredAt: NOW,
  });
  return result.ok ? advance(result.design, result.effect.columns) : world;
}

/** How many contiguous runs of member-less columns on one wall total more than the ceiling — the
 *  free span that, before this wave, would have been a single column the rule now forbids. It is the
 *  property's own coverage measure, and a run of two abutting pieces the split just made is exactly
 *  such a span. */
function countSpansOverCap(world: World): number {
  let found = 0;
  for (const wall of ["A", "B"] as const) {
    const onWall = memberLess(world.columns, world.records)
      .filter((column) => column.wall === wall)
      .map((column) => ({
        leftMm: Math.round((alongOf(column) - column.w / 2) * 1000),
        rightMm: Math.round((alongOf(column) + column.w / 2) * 1000),
      }))
      .sort((left, right) => left.leftMm - right.leftMm);

    let runStartMm: number | undefined;
    let runEndMm: number | undefined;
    for (const span of onWall) {
      if (runEndMm !== undefined && span.leftMm === runEndMm) {
        runEndMm = span.rightMm;
      } else {
        if (
          runStartMm !== undefined &&
          runEndMm !== undefined &&
          runEndMm - runStartMm > MAX_EMPTY_COLUMN_WIDTH_MM
        ) {
          found += 1;
        }
        runStartMm = span.leftMm;
        runEndMm = span.rightMm;
      }
    }
    if (
      runStartMm !== undefined &&
      runEndMm !== undefined &&
      runEndMm - runStartMm > MAX_EMPTY_COLUMN_WIDTH_MM
    ) {
      found += 1;
    }
  }
  return found;
}

function alongOf(column: ColumnExtent): number {
  return column.wall === "A" ? column.x : column.z;
}

function memberLess(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): readonly ColumnExtent[] {
  const occupied = new Set(records.map((record) => record.col));
  return [...columns.values()]
    .filter((column) => !occupied.has(column.key))
    .sort((left, right) => alongOf(left) - alongOf(right));
}

/** The pantry with a recorded 800 mm space on its left and the fridge column standing on its right,
 *  which is the one shape in which a shrink is funded leftwards and frees more than the ceiling. Only
 *  wall B's base run is kept, so nothing else on the wall can fund the move or key onto a piece. */
function withSpaceLeftOfThePantry(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter((placement) =>
      ["p6", "p7"].includes(placement.id),
    ),
    emptyColumns: [
      {
        wall: "B",
        alongMm: 1100,
        widthMm: MAX_EMPTY_COLUMN_WIDTH_MM,
        y0Mm: 0,
        topMm: 2200,
        depthMm: 600,
      },
    ],
  };
}

/** A design carrying one member-less column of the given width, parsed through `DesignSchema` at the
 *  seam a stored document arrives by — the only route such a column exists on at all, since no
 *  command produces one and the validator now refuses one in a version 2 row. */
function loadWide(widthMm: number): World {
  const design: Design = {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.wall === "B",
    ),
    emptyColumns: [
      {
        wall: "A",
        alongMm: 2600,
        widthMm,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 580,
      },
    ],
  };
  const records = derivePlacementRecords(design, CATALOG);
  return {
    design,
    columns: deriveColumns(
      records,
      { emptyColumns: design.emptyColumns },
      design.room,
    ),
    records,
    voids: [],
  };
}
