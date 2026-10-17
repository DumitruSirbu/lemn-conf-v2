// ADR 0052's cut at 800 mm, and the uncapped merge that now follows it (8U plan §5): the cut still runs inside
// the commands and the store's funnel, and the merge after it makes every adjacent agreeing space one column.
//
// The domain half. The store's `resolveColumns` properties live in `apps/web/tests/store/empty-column-ceiling.test.ts`;
// what is here is the cut's arithmetic, the map-level normalisation, and 8U criterion 1 over generated sequences.
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
import { LEVEL_SNAP_M, MAX_EMPTY_COLUMN_WIDTH_MM } from "../src/module-grid.js";
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

/** A column's extent is a metre float derived from whole millimetres, so edges and widths are compared with the
 *  noise a unit conversion carries and with nothing wider. */
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

describe("a shrink beside an empty column frees one space of the summed width (8U criterion 11, E9)", () => {
  /** The seeded kitchen cannot reach it: `p6` is the one resizable column (ADR 0048) and shrinks by at most
   *  200 mm, so a space on its left tops out at 800. It is reachable from a **loaded** design: an 800 mm recorded
   *  space at 700–1500 abutting the pantry, with the fridge column standing on its right so the right side cannot
   *  fund. Shrinking 600 → 400 holds the pantry's right edge, so 700–1700 is free: one 1000 mm space, with no
   *  seam left where the command's own cut at 800 fell. */
  it("leaves one 1000 mm column over 700-1700 after a shrink funded from the left, not an 800 and a sliver", () => {
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
    expect(empties.map((column) => column.key)).toStrictEqual(["B|1.20"]);
    expect(empties.map((column) => Math.round(column.w * 1000))).toStrictEqual([
      1000,
    ]);
  });
});

describe("no command leaves two adjacent agreeing empty columns apart (8U criterion 1)", () => {
  /** After *every* command of a generated sequence, no two member-less columns on one wall abut and agree on
   *  floor, top and depth within `LEVEL_SNAP_M`, whatever their total. Judged here from the columns' own extents,
   *  not by calling the merge. A pair over a stretch of wall a body also stands on is excused, so a sequence that
   *  reaches the seeded corner's wall pair (the merge's B4 decline, 8U plan §4.1, pinned elsewhere) is no false red.
   *
   *  The sequence is applied exactly as the store applies it, `resolveColumns` and all, because that is where the
   *  cut at 800 and the merge meet.
   *
   *  **It asserts its own reach.** The seeded kitchen loads with zero empty columns, so the run counts the states
   *  holding one member-less column wider than any cabinet, which the cut alone would leave as pieces. */
  it("holds at every step of every generated sequence, and reaches a space wider than any cabinet", () => {
    let spacesWiderThanACabinet = 0;
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
            expect(unexcusedAdjacentAgreeingPairs(world)).toStrictEqual([]);
            spacesWiderThanACabinet += countSpacesWiderThanACabinet(world);
          }
        },
      ),
      { numRuns: 60 },
    );

    expect(spacesWiderThanACabinet).toBeGreaterThan(0);
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
    voids: world.voids,
    target: { kind: "void", id: opening.id },
    buildId: "base-bottle-cargo",
    probe: PROBE,
    occurredAt: NOW,
  });
  return result.ok ? advance(result.design, result.effect.columns) : world;
}

interface MeasuredSpaceMm {
  readonly key: string;
  readonly wall: ColumnExtent["wall"];
  readonly leftMm: number;
  readonly rightMm: number;
  readonly floorMm: number;
  readonly topMm: number;
  readonly depthMm: number;
}

const AGREEMENT_TOLERANCE_MM = LEVEL_SNAP_M * 1000;

/** Every pair of member-less columns on one wall that abut and agree, other than one over a body's stretch of
 *  wall, named by both keys so a counterexample says where it is. */
function unexcusedAdjacentAgreeingPairs(world: World): string[] {
  const spaces = memberLess(world.columns, world.records).map(measured);
  const pairs: string[] = [];
  for (const left of spaces) {
    for (const right of spaces) {
      if (!abutsOnTheRight(left, right) || !agrees(left, right)) continue;
      if (standsOverABody(world.records, left, right)) continue;
      pairs.push(`${left.key} + ${right.key}`);
    }
  }
  return pairs;
}

function abutsOnTheRight(
  left: MeasuredSpaceMm,
  right: MeasuredSpaceMm,
): boolean {
  return (
    left.wall === right.wall &&
    Math.abs(left.rightMm - right.leftMm) <= WIDTH_TOLERANCE_MM
  );
}

function agrees(left: MeasuredSpaceMm, right: MeasuredSpaceMm): boolean {
  return (
    Math.abs(left.floorMm - right.floorMm) <= AGREEMENT_TOLERANCE_MM &&
    Math.abs(left.topMm - right.topMm) <= AGREEMENT_TOLERANCE_MM &&
    Math.abs(left.depthMm - right.depthMm) <= AGREEMENT_TOLERANCE_MM
  );
}

/** Whether any body on the pair's wall overlaps the pair's joint stretch of wall, at any height. */
function standsOverABody(
  records: readonly PlacementRecord[],
  left: MeasuredSpaceMm,
  right: MeasuredSpaceMm,
): boolean {
  return records.some((record) => {
    if (record.wall !== left.wall) return false;
    const centreMm =
      (record.wall === "A" ? record.frame.x : record.frame.z) * 1000;
    const halfWidthMm = (record.frame.w * 1000) / 2;
    return (
      centreMm - halfWidthMm < right.rightMm - WIDTH_TOLERANCE_MM &&
      centreMm + halfWidthMm > left.leftMm + WIDTH_TOLERANCE_MM
    );
  });
}

function measured(column: ColumnExtent): MeasuredSpaceMm {
  const centreMm = alongOf(column) * 1000;
  const widthMm = column.w * 1000;
  return {
    key: column.key,
    wall: column.wall,
    leftMm: centreMm - widthMm / 2,
    rightMm: centreMm + widthMm / 2,
    floorMm: Math.min(...column.regions.map(([startM]) => startM)) * 1000,
    topMm: column.top * 1000,
    depthMm: column.d * 1000,
  };
}

/** The property's coverage measure: member-less columns wider than §7's widest cabinet, which the cut at 800
 *  leaves as pieces and only the uncapped merge after it makes one. */
function countSpacesWiderThanACabinet(world: World): number {
  return memberLess(world.columns, world.records).filter(
    (column) => column.w * 1000 > CABINETRY_MAX_WIDTH_MM + WIDTH_TOLERANCE_MM,
  ).length;
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
