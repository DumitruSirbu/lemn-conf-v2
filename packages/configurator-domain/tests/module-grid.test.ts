// M7B U1 slice S3, AC8: `deriveColumnKeyAt`'s prefix is the wall letter itself. Before ADR 0132 a
// wall-C key would have rendered `A|…` — anything that was not `"B"` fell to `"A|"` — and collided
// with a real wall-A key at the same along value.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { DesignWall } from "../src/design.js";
import {
  alongWallCoordinate,
  alongWallPosition,
  deriveColumnKeyAt,
} from "../src/module-grid.js";

const WALLS: readonly DesignWall[] = ["A", "B", "C"];

describe("deriveColumnKeyAt", () => {
  it("prefixes the key with the wall itself, not a two-way fallback", () => {
    expect(deriveColumnKeyAt("A", 1.3)).toBe("A|1.30");
    expect(deriveColumnKeyAt("B", 1.3)).toBe("B|1.30");
    expect(deriveColumnKeyAt("C", 1.3)).toBe("C|1.30");
  });

  propertyTest.prop([
    fc.constantFrom(...WALLS),
    fc.constantFrom(...WALLS),
    fc.float({ min: 0, max: 10, noNaN: true }),
  ])(
    "answers two different walls' keys distinctly at the same along value (AC8)",
    (left, right, alongM) => {
      const same =
        deriveColumnKeyAt(left, alongM) === deriveColumnKeyAt(right, alongM);
      expect(same).toBe(left === right);
    },
  );
});

describe("alongWallPosition / alongWallCoordinate — wall C shares wall B's axis", () => {
  it("both read and write z for wall C, exactly as they do for wall B", () => {
    const centreM = 1.6;
    expect(alongWallPosition("C", centreM)).toEqual({ z: centreM });
    expect(alongWallPosition("C", centreM)).toEqual(
      alongWallPosition("B", centreM),
    );
    expect(alongWallCoordinate("C", { x: 9, z: centreM })).toBe(centreM);
  });

  it("round-trips through both functions for every wall", () => {
    for (const wall of WALLS) {
      const centreM = 2.4;
      const position = { x: 0, z: 0, ...alongWallPosition(wall, centreM) };
      expect(alongWallCoordinate(wall, position)).toBe(centreM);
    }
  });
});
