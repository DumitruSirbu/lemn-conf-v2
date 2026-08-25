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

  it("ignores a slot in another column", () => {
    const voids = [slot({ id: "elsewhere", col: "A|2.00", y0: 0 })];
    expect(findVacatedVoid(voids, { col: "A|1.30", y0: 0 })).toBeUndefined();
  });

  it("returns nothing when the removal created no opening at all", () => {
    expect(findVacatedVoid([], { col: "A|1.30", y0: 0 })).toBeUndefined();
  });
});
