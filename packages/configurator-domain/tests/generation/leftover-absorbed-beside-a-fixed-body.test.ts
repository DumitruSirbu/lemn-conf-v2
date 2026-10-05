// M7C wave C5 slice S1, criterion 1: the arithmetic of the owner's Q6 (2026-10-01), on its own. A fixed-width
// end body (the fridge) leaves `r` mm of free run beyond it; the fit-width base inboard *"grows in 50 mm steps
// up to 800 mm"*: it takes whole steps of `r` and whole steps of the room under 800, when `r` is under 300, and
// nothing otherwise. Every figure below is the owner's, written as a literal and not read from the rule.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { CABINETRY_MAX_WIDTH_MM } from "../../src/catalog.js";
import {
  headroomBelowTheCeilingMm,
  leftoverAbsorbedBesideAFixedBody,
} from "../../src/generation/leftover-rule.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";

const CEILING_MM = 800;
const ONE_MODULE_MM = 600;
const SMALLEST_BASE_MM = 200;

function absorbedAtAModule(leftoverMm: number): number {
  return leftoverAbsorbedBesideAFixedBody({
    neighbourWidthMm: ONE_MODULE_MM,
    leftoverMm,
  });
}

describe("the leftover a base takes beside a fixed-width end body", () => {
  it.each([
    // r, what the 600 base takes
    [0, 0],
    [49, 0],
    [50, 50],
    [51, 50],
    [99, 50],
    [100, 100],
    [149, 100],
    [150, 150],
    [199, 150],
    [200, 200],
    [249, 200],
    [250, 200],
    [299, 200],
    [300, 0],
    [301, 0],
    [599, 0],
  ])(
    "takes %i mm of leftover as %i mm for a 600 mm base",
    (leftoverMm, taken) => {
      expect(absorbedAtAModule(leftoverMm)).toBe(taken);
    },
  );

  it("takes nothing where the neighbour already stands at the ceiling", () => {
    for (const leftoverMm of [50, 150, 299]) {
      expect(
        leftoverAbsorbedBesideAFixedBody({
          neighbourWidthMm: CEILING_MM,
          leftoverMm,
        }),
      ).toBe(0);
    }
  });

  it("takes only what the ceiling leaves, not a whole step more", () => {
    expect(
      leftoverAbsorbedBesideAFixedBody({
        neighbourWidthMm: 750,
        leftoverMm: 250,
      }),
    ).toBe(50);
    expect(
      leftoverAbsorbedBesideAFixedBody({
        neighbourWidthMm: 770,
        leftoverMm: 250,
      }),
    ).toBe(0);
  });

  // The owner's words are *"grows in 50 mm steps up to 800 mm"*: a width that is not a whole step stops
  // short of 800 by the part of a step, and a width past 800 takes nothing and is never shrunk.
  it.each([
    // neighbour, leftover, taken
    [601, 200, 150],
    [625, 299, 150],
    [651, 150, 100],
    [799, 299, 0],
    [750, 299, 50],
    [850, 150, 0],
    [600, -50, 0],
  ])(
    "beside a %i mm cabinet takes %i mm of leftover as %i mm in whole steps",
    (neighbourWidthMm, leftoverMm, taken) => {
      expect(
        leftoverAbsorbedBesideAFixedBody({ neighbourWidthMm, leftoverMm }),
      ).toBe(taken);
    },
  );

  it("gives E6's tower opening 200 mm of room beside a module, and none at or past the ceiling", () => {
    expect(headroomBelowTheCeilingMm(ONE_MODULE_MM)).toBe(200);
    expect(headroomBelowTheCeilingMm(CEILING_MM)).toBe(0);
    expect(headroomBelowTheCeilingMm(CEILING_MM + 50)).toBe(0);
  });

  // The cap reads the empty-space ceiling (ADR 0052) and the owner's "up to 800" is the cabinet ceiling (§7); a
  // widened cabinet is also a floor tile, so both bind. The space ceiling must never be the higher one, or a
  // plan could size a cabinet the catalogue cannot build.
  it("never sizes a cabinet past what the catalogue can build: the cabinet ceiling is at least the space ceiling", () => {
    expect(CABINETRY_MAX_WIDTH_MM).toBeGreaterThanOrEqual(
      MAX_EMPTY_COLUMN_WIDTH_MM,
    );
    expect(CEILING_MM).toBeLessThanOrEqual(CABINETRY_MAX_WIDTH_MM);
  });

  it("takes whole steps, within the window and under 800, over every neighbour width and leftover", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: SMALLEST_BASE_MM, max: CEILING_MM }),
        fc.integer({ min: 0, max: ONE_MODULE_MM - 1 }),
        (neighbourWidthMm, leftoverMm) => {
          const taken = leftoverAbsorbedBesideAFixedBody({
            neighbourWidthMm,
            leftoverMm,
          });

          expect(taken).toBeGreaterThanOrEqual(0);
          expect(taken).toBeLessThanOrEqual(leftoverMm);
          expect(neighbourWidthMm + taken).toBeLessThanOrEqual(CEILING_MM);
          expect(taken % 50).toBe(0);
          if (leftoverMm >= 300) expect(taken).toBe(0);
          if (leftoverMm < 50) expect(taken).toBe(0);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("leaves under one step bare beside a module unless the ceiling stopped it", () => {
    fc.assert(
      fc.property(fc.integer({ min: 50, max: 299 }), (leftoverMm) => {
        const taken = absorbedAtAModule(leftoverMm);
        const bare = leftoverMm - taken;
        const ceilingStoppedIt = taken === 200;

        expect(taken % 50).toBe(0);
        expect(ceilingStoppedIt || bare < 50).toBe(true);
      }),
    );
  });
});
