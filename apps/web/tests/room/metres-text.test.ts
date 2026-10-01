// Wave 7F1 criterion 8: the URL keeps metres with a dot, and the wire form may not lose a millimetre.
// Swept rather than sampled because the trailing-zero strip and the three-digit pad are per-value
// transitions: `3060` written as *"3.6"* reads back as 3600, a room the customer never entered and one
// a hand-picked example would not catch. Since ADR 0126 the customer reads and types whole
// millimetres, so the metre reading form and its tests are gone: `parse-millimetres.test.ts` owns the
// field's notation, and `room-query-sync.test.ts` its round trip through this wire form.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type MillimetreBounds,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { metresTextForUrl } from "@/room/metres-text";
import { parseMetresToMillimetres } from "@/room/parse-metres";

const SWEEP_RUNS = 1000;

/** Every length a field can legitimately hold, read off the approved policy rather than restated,
 *  so the sweep cannot drift from the bounds the customer is judged against. */
const LENGTH_FIELDS: readonly (readonly [string, MillimetreBounds])[] = [
  ["wall A", approvedLWalls().wallA],
  ["wall B", approvedLWalls().wallB],
  ["the height", APPROVED_ROOM_POLICY.heightBounds],
];

function approvedLWalls() {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (walls === undefined) {
    throw new Error("the approved policy states no L walls to sweep");
  }
  return walls;
}

function everyMillimetreIn(bounds: MillimetreBounds): fc.Arbitrary<number> {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

describe("metresTextForUrl — a wire value, in no locale at all", () => {
  it.each(LENGTH_FIELDS)(
    "carries no comma and reads back exactly, over every approved length of %s",
    (_field, bounds) => {
      fc.assert(
        fc.property(everyMillimetreIn(bounds), (mm) => {
          const text = metresTextForUrl(mm);

          expect(text).not.toContain(",");
          expect(parseMetresToMillimetres(text)).toEqual({ ok: true, mm });
        }),
        { numRuns: SWEEP_RUNS },
      );
    },
  );

  // The same five values `qa-7e2-room-href.adversarial.test.ts` pins through the href, asserted on
  // the moved function itself so a change to it is caught here rather than one layer out.
  it.each([
    [3000, "3"],
    [3600, "3.6"],
    [3660, "3.66"],
    [3060, "3.06"],
    [3006, "3.006"],
  ] as const)("spells %i mm as %s", (mm, text) => {
    expect(metresTextForUrl(mm)).toBe(text);
  });
});
