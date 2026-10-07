// M7C wave C7 slice S1 (M7-FB-013): `overlapsAlongWall` compares SPANS, each run from its centre less half
// its width to its centre plus half — and the three modules that say they follow it do.
//
// The predicate used to read each run's centre as its start, so a 700 fridge and the 600 column beside it
// overlapped by 50 mm, and a narrow column over the low end of a wider tall member read as clear of it.
// Every run here is told in whole millimetres, and the expectation is plain interval arithmetic.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { splitColumn } from "../src/commands/split-column.js";
import { bodiesUnderOpenings } from "../src/commands/validate-width-result.js";
import { mergeAdjacentEmptyColumns } from "../src/merge-empty-columns.js";
import {
  overlapsAlongWall,
  type Column,
  type ColumnExtent,
} from "../src/void-engine.js";
import {
  extentOver,
  recordOver,
  spansOverlapByMoreThanNothing,
  WALLS,
  type Run,
} from "./support/span-overlap-fixtures.js";

const BASE_HEIGHT_M = 0.86;

const runArb: fc.Arbitrary<Run> = fc
  .record({
    startMm: fc.integer({ min: 0, max: 6000 }),
    widthMm: fc.integer({ min: 50, max: 1200 }),
  })
  .map(({ startMm, widthMm }) => ({ startMm, endMm: startMm + widthMm }));

describe("overlapsAlongWall compares spans", () => {
  propertyTest.prop([fc.constantFrom(...WALLS), runArb, runArb], {
    numRuns: 1000,
  })(
    "is true exactly when the two spans overlap by a positive length, whatever the widths or the order",
    (wall, bodyRun, columnRun) => {
      const answer = overlapsAlongWall(
        recordOver(wall, bodyRun),
        extentOver(wall, columnRun),
      );

      expect(answer).toBe(spansOverlapByMoreThanNothing(bodyRun, columnRun));
    },
  );

  propertyTest.prop(
    [
      fc.constantFrom(...WALLS),
      runArb,
      fc.integer({ min: 50, max: 1200 }),
      fc.integer({ min: -1, max: 1 }),
      fc.boolean(),
    ],
    { numRuns: 500 },
  )(
    "is exact at the seam: a neighbour that abuts, or is 1 mm inside or clear of it, on either side",
    (wall, bodyRun, widthMm, offsetMm, isOnTheRight) => {
      const columnRun: Run = isOnTheRight
        ? {
            startMm: bodyRun.endMm + offsetMm,
            endMm: bodyRun.endMm + offsetMm + widthMm,
          }
        : {
            startMm: bodyRun.startMm - offsetMm - widthMm,
            endMm: bodyRun.startMm - offsetMm,
          };

      expect(
        overlapsAlongWall(
          recordOver(wall, bodyRun),
          extentOver(wall, columnRun),
        ),
      ).toBe(offsetMm < 0);
    },
  );

  it.each(WALLS)(
    "reads an exact abutment as no overlap and a 1 mm overlap as one, unequal widths, either order (wall %s)",
    (wall) => {
      const fridge: Run = { startMm: 0, endMm: 700 };
      const neighbour = (startMm: number): Run => ({
        startMm,
        endMm: startMm + 600,
      });

      expect(
        overlapsAlongWall(
          recordOver(wall, fridge),
          extentOver(wall, neighbour(700)),
        ),
      ).toBe(false);
      expect(
        overlapsAlongWall(
          recordOver(wall, fridge),
          extentOver(wall, neighbour(699)),
        ),
      ).toBe(true);
      // The same pair the other way round: the 600 body, the 700 column.
      expect(
        overlapsAlongWall(
          recordOver(wall, neighbour(700)),
          extentOver(wall, fridge),
        ),
      ).toBe(false);
      expect(
        overlapsAlongWall(
          recordOver(wall, neighbour(699)),
          extentOver(wall, fridge),
        ),
      ).toBe(true);
    },
  );

  it("sees a narrow column over the low end of a wider tall member as overlapping it", () => {
    const tall: Run = { startMm: 0, endMm: 800 };
    const narrow: Run = { startMm: 0, endMm: 200 };

    expect(
      overlapsAlongWall(recordOver("A", tall), extentOver("A", narrow)),
    ).toBe(true);
  });
});

describe("validate-width-result's own overlap, on unequal widths in both orders", () => {
  const OPENING: Run = { startMm: 700, endMm: 1300 };

  function openingColumn(run: Run): Column {
    return {
      ...extentOver("A", run, "A|opening"),
      hasFullHeightUnder: false,
    } as unknown as Column;
  }

  function covered(body: Run, opening: Run): boolean {
    const record = recordOver("A", body, {
      heightM: BASE_HEIGHT_M,
      col: "A|body",
    });
    const columns = new Map([["A|opening", openingColumn(opening)]]);

    return bodiesUnderOpenings([record], columns, new Set()).has(record.id);
  }

  it("treats a 700 body abutting a 600 opening as clear, and 1 mm into it as covering it", () => {
    expect(covered({ startMm: 0, endMm: 700 }, OPENING)).toBe(false);
    expect(covered({ startMm: 0, endMm: 701 }, OPENING)).toBe(true);
  });

  it("treats the same on the other side, a 800 body against the 600 opening", () => {
    expect(covered({ startMm: 1300, endMm: 2100 }, OPENING)).toBe(false);
    expect(covered({ startMm: 1299, endMm: 2099 }, OPENING)).toBe(true);
  });
});

describe("merge-empty-columns' own overlap, on unequal widths in both orders", () => {
  const LEFT_EMPTY: Run = { startMm: 700, endMm: 1000 };
  const RIGHT_EMPTY: Run = { startMm: 1000, endMm: 1300 };
  const MERGED_KEY = "A|1.00";

  function mergesAround(body: Run): boolean {
    const columns = new Map<string, ColumnExtent>([
      ["A|0.85", extentOver("A", LEFT_EMPTY, "A|0.85")],
      ["A|1.15", extentOver("A", RIGHT_EMPTY, "A|1.15")],
    ]);
    const merged = mergeAdjacentEmptyColumns(columns, [recordOver("A", body)]);

    return merged.has(MERGED_KEY);
  }

  it("merges two empty columns beside a 700 body that abuts them, and not beside one 1 mm inside", () => {
    expect(mergesAround({ startMm: 0, endMm: 700 })).toBe(true);
    expect(mergesAround({ startMm: 0, endMm: 701 })).toBe(false);
  });

  it("does the same on the other side, with a 800 body", () => {
    expect(mergesAround({ startMm: 1300, endMm: 2100 })).toBe(true);
    expect(mergesAround({ startMm: 1299, endMm: 2099 })).toBe(false);
  });
});

describe("split-column's full-height answer for the parts it writes, on unequal widths in both orders", () => {
  const COLUMN: Run = { startMm: 700, endMm: 1300 };
  const OCCUPIED_WIDTH_MM = 300;

  function fullHeightByPart(tall: Run): {
    occupied: boolean;
    remainder: boolean;
  } {
    const column: Column = {
      ...extentOver("A", COLUMN, "A|1.00"),
      hasFullHeightUnder: false,
    } as unknown as Column;
    const result = splitColumn({
      columns: new Map([["A|1.00", column]]),
      column,
      records: [recordOver("A", tall)],
      centreMm: COLUMN.startMm + OCCUPIED_WIDTH_MM / 2,
      widthMm: OCCUPIED_WIDTH_MM,
      remainderMm: COLUMN.endMm - COLUMN.startMm - OCCUPIED_WIDTH_MM,
    });
    if (!result.ok) throw new Error("the split was refused");
    const { columns, occupiedKey } = result.value;
    const remainderKey = [...columns.keys()].find((key) => key !== occupiedKey);

    return {
      occupied: columns.get(occupiedKey)?.hasFullHeightUnder === true,
      remainder:
        remainderKey !== undefined &&
        columns.get(remainderKey)?.hasFullHeightUnder === true,
    };
  }

  it("answers false for both parts beside a 700 tall body that abuts the column, and true for the part it overlaps", () => {
    expect(fullHeightByPart({ startMm: 0, endMm: 700 })).toEqual({
      occupied: false,
      remainder: false,
    });
    expect(fullHeightByPart({ startMm: 0, endMm: 701 })).toEqual({
      occupied: true,
      remainder: false,
    });
  });

  it("does the same with an 800 tall body on the other side of the column", () => {
    expect(fullHeightByPart({ startMm: 1300, endMm: 2100 })).toEqual({
      occupied: false,
      remainder: false,
    });
    expect(fullHeightByPart({ startMm: 1299, endMm: 2099 })).toEqual({
      occupied: false,
      remainder: true,
    });
  });
});
