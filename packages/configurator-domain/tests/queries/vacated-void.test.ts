import { describe, expect, it } from "vitest";

import { findVacatedVoid } from "../../src/queries/vacated-void.js";
import type { VoidRecord } from "../../src/void-engine.js";

function slot(overrides: Partial<VoidRecord>): VoidRecord {
  return {
    id: "A|1.30:v0:0.00",
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

describe("findVacatedVoid", () => {
  it("finds the slot containing where the body stood", () => {
    const voids = [
      slot({ id: "base", y0: 0, h: 0.86 }),
      slot({ id: "middle", y0: 1.5, h: 0.7 }),
    ];
    expect(findVacatedVoid(voids, { col: "A|1.30", y0: 1.5 })?.id).toBe(
      "middle",
    );
  });

  // §5.1: after a merge, the vacated frame's own start sits *inside* a bigger opening whose id
  // never existed before the recompute.
  it("finds a merged opening that starts below the vacated frame", () => {
    const voids = [slot({ id: "merged", y0: 1.5, h: 0.7 })];
    expect(findVacatedVoid(voids, { col: "A|1.30", y0: 1.85 })?.id).toBe(
      "merged",
    );
  });

  // R2.1 / F1. Two level-adjacent slots share the 2.20 module line. Widening the search at the top
  // made them overlap by `FIT_TOLERANCE_M`, and `find` returned the lower one — so deleting a
  // top-row unit selected the wall slot beneath it (§11 row 2's failure shape, one level up).
  it("gives the boundary to the slot above it, not to the one that ends there", () => {
    const voids = [
      slot({ id: "wall", y0: 1.5, h: 0.7 }),
      slot({ id: "top", y0: 2.2, h: 0.4 }),
    ];
    expect(findVacatedVoid(voids, { col: "A|1.30", y0: 2.2 })?.id).toBe("top");
  });

  // The same boundary from below: a body standing just under the line belongs to the lower slot.
  it("keeps a frame just below the boundary in the slot that ends there", () => {
    const voids = [
      slot({ id: "wall", y0: 1.5, h: 0.7 }),
      slot({ id: "top", y0: 2.2, h: 0.4 }),
    ];
    expect(findVacatedVoid(voids, { col: "A|1.30", y0: 2.19 })?.id).toBe(
      "wall",
    );
  });

  // The float slack the fix needs and the reason it cannot be `FIT_TOLERANCE_M` (ADR 0015): a
  // slot's height is a difference of module lines, so 2.20 − 1.50 is 0.7000000000000002 and the
  // computed top lands *above* the line the body stood on.
  it("survives a slot height that accumulated float error above its module line", () => {
    const voids = [
      slot({ id: "wall", y0: 1.5, h: 2.2 - 1.5 }),
      slot({ id: "top", y0: 2.2, h: 0.4 }),
    ];
    expect(2.2 - 1.5).toBeGreaterThan(0.7);
    expect(findVacatedVoid(voids, { col: "A|1.30", y0: 2.2 })?.id).toBe("top");
  });

  it("ignores a slot in another column", () => {
    const voids = [slot({ id: "elsewhere", col: "A|2.00", y0: 0 })];
    expect(findVacatedVoid(voids, { col: "A|1.30", y0: 0 })).toBeUndefined();
  });

  it("returns nothing when the removal created no opening at all", () => {
    expect(findVacatedVoid([], { col: "A|1.30", y0: 0 })).toBeUndefined();
  });
});
