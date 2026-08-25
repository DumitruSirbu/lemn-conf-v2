// §4's constants at their boundaries, not at example values, plus §4 rule 4's collapse taken to
// the case where it meets rule 3.
//
// `void-engine.test.ts` proves the four rules on representative geometry. This file sits one
// micron either side of `MIN_SPAN_M`, at zero, and at the level lines themselves — and asks the
// same geometric question twice, from two different subtractions, because that is where a `>`
// comparison on floats stops being a rule and starts being an accident.
import { describe, expect, it } from "vitest";

import {
  LEVEL_SNAP_M,
  MIN_SPAN_M,
  type VoidRecord,
} from "../src/void-engine.js";
import {
  BACKSPLASH_ZONE,
  findInvariantViolations,
  intersectsNoModuleLine,
} from "./support/invariants.js";
import { columnWorld } from "./support/synthetic-world.js";

const ONE_MICRON_MM = 0.001;
const BASE_LEVEL_TOP_MM = 860;
const WALL_LEVEL_TOP_MM = 2200;

/** A gap of `gapMm` immediately below the 860 line: the body under it stops short by that much. */
function gapInBaseLevel(gapMm: number): readonly VoidRecord[] {
  const world = columnWorld(600, [
    { id: "s0", y0Mm: 0, heightMm: BASE_LEVEL_TOP_MM - gapMm },
    { id: "s1", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600" },
    { id: "s2", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
  ]);
  return world.voids;
}

/** The same gap of `gapMm`, immediately below the 2200 line instead. Geometrically the identical
 *  question: is a free span of this size an opening? */
function gapInWallLevel(gapMm: number): readonly VoidRecord[] {
  const world = columnWorld(600, [
    { id: "s0", y0Mm: 0, heightMm: BASE_LEVEL_TOP_MM },
    {
      id: "s1",
      y0Mm: 1500,
      heightMm: WALL_LEVEL_TOP_MM - 1500 - gapMm,
      buildId: "wall-2door-600",
    },
    { id: "s2", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
  ]);
  return world.voids;
}

describe("MIN_SPAN_M at its boundary (§2, §4)", () => {
  it("is the value the spec's tolerance table states", () => {
    expect(MIN_SPAN_M).toBe(0.3);
  });

  it("gives the same answer for a 300 mm free span wherever it occurs", () => {
    // §2 calls MIN_SPAN "smallest span that becomes a void"; §4's pseudocode compares with `>`.
    // Whichever reading is right, a 300 mm gap must be an opening in both levels or in neither:
    // the two differ only in which pair of numbers the engine subtracted to reach 0.30.
    expect(gapInBaseLevel(300).length).toBe(gapInWallLevel(300).length);
  });

  it("emits no void one micron below MIN_SPAN_M, in either level", () => {
    expect(gapInBaseLevel(300 - ONE_MICRON_MM)).toEqual([]);
    expect(gapInWallLevel(300 - ONE_MICRON_MM)).toEqual([]);
  });

  it("emits a void one micron above MIN_SPAN_M, in either level", () => {
    expect(gapInBaseLevel(300 + ONE_MICRON_MM)).toHaveLength(1);
    expect(gapInWallLevel(300 + ONE_MICRON_MM)).toHaveLength(1);
  });

  it("emits no void for a free span of zero", () => {
    expect(gapInBaseLevel(0)).toEqual([]);
    expect(gapInWallLevel(0)).toEqual([]);
  });
});

describe("the level lines themselves", () => {
  it("gives a body ending exactly on the 860 line no base void and a full wall void", () => {
    const world = columnWorld(600, [
      { id: "s0", y0Mm: 0, heightMm: 860 },
      { id: "s1", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
    ]);
    expect(
      world.voids.map((record) => [
        Number(record.y0.toFixed(3)),
        Number(record.h.toFixed(3)),
      ]),
    ).toEqual([[1.5, 0.7]]);
  });
});

describe("§4 rule 4's collapse crossing the backsplash gap (§11 row 17)", () => {
  // A body 300 mm tall on the floor, nothing again until the top row. The free span is
  // 0.30 → 2.20, and it starts mid-level in the base level, so rule 4 keeps it as ONE opening
  // that runs from the base level up into the wall level, crossing the backsplash gap on the way.
  //
  // That crossing is legal. Rule 3 forbids "an interval intersecting no level", and its WHY names
  // the defect it was written for: the 640 mm gap offered on its own as a slot with zero valid
  // contents. A tall opening that touches two real module lines is not that slot — and §4's own
  // worked result for a cleared column has three slots that all report `spanH = 2.6`, a span that
  // crosses the same gap.
  const world = columnWorld(600, [
    { id: "s0", y0Mm: 0, heightMm: 300 },
    { id: "s2", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
  ]);

  it("produces exactly one opening for the span, from 0.30 to 2.20", () => {
    expect(
      world.voids.map((record) => [
        Number(record.y0.toFixed(3)),
        Number((record.y0 + record.h).toFixed(3)),
      ]),
    ).toEqual([[0.3, 2.2]]);
  });

  it("emits no opening that touches no module line — the slot rule 3 forbids", () => {
    expect(world.voids.filter(intersectsNoModuleLine)).toEqual([]);
  });

  it("never offers the backsplash gap on its own as a selectable opening", () => {
    const [zoneStart, zoneEnd] = BACKSPLASH_ZONE;
    const gapSlots = world.voids.filter(
      (record) =>
        record.y0 >= zoneStart - LEVEL_SNAP_M &&
        record.y0 + record.h <= zoneEnd + LEVEL_SNAP_M,
    );
    expect(gapSlots).toEqual([]);
  });

  it("satisfies every §3/§4 invariant", () => {
    expect(findInvariantViolations(world)).toEqual([]);
  });
});
