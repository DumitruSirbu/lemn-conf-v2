// Wave 7F1 criterion 8: the customer sees a decimal comma and the URL keeps a dot, and neither form
// may lose a millimetre. The two are swept rather than sampled because the trailing-zero strip and
// the three-digit pad are per-value transitions: `3060` written as *"3,60"* reads back as 3600, a
// room the customer never entered and one a hand-picked example would not catch.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type MillimetreBounds,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";
import { formatMetresForDisplay, metresTextForUrl } from "@/room/metres-text";
import { parseMetresToMillimetres } from "@/room/parse-metres";

const SWEEP_RUNS = 1000;

/** Neither a product locale nor a locale this application serves: it is the probe that tells a
 *  derived separator from a comma somebody typed into the formatter, because `ro` and `ru` happen
 *  to agree and so cannot distinguish the two. */
const A_DECIMAL_POINT_LOCALE = "en-GB";

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

describe("the locales a length is written for", () => {
  // `describe.each` over an empty list would report a vacuous pass for the whole criterion.
  it("is more than one, which is why no separator may be written by hand", () => {
    expect(routing.locales.length).toBeGreaterThan(1);
  });
});

describe.each(routing.locales)(
  "formatMetresForDisplay — a field shown in %s",
  (locale) => {
    it.each(LENGTH_FIELDS)(
      "reads back to the exact millimetre for every approved length of %s",
      (_field, bounds) => {
        fc.assert(
          fc.property(everyMillimetreIn(bounds), (mm) => {
            expect(
              parseMetresToMillimetres(formatMetresForDisplay(mm, locale)),
            ).toEqual({ ok: true, mm });
          }),
          { numRuns: SWEEP_RUNS },
        );
      },
    );

    it.each(LENGTH_FIELDS)(
      "reads back at both ends of %s's range, which the sweep reaches only by chance",
      (_field, bounds) => {
        for (const mm of [bounds.minMm, bounds.maxMm]) {
          expect(
            parseMetresToMillimetres(formatMetresForDisplay(mm, locale)),
          ).toEqual({ ok: true, mm });
        }
      },
    );
  },
);

describe("formatMetresForDisplay — the separator is the locale's own", () => {
  it("writes a comma in Romanian and a point where the locale declares one", () => {
    expect(formatMetresForDisplay(3600, "ro")).toBe("3,60");
    expect(formatMetresForDisplay(3600, A_DECIMAL_POINT_LOCALE)).toBe("3.60");
  });
});

describe("formatMetresForDisplay — the frame's two decimals, and the third when it is needed", () => {
  // `3060` beside `3600` is the pair that matters: a formatter that stripped the middle zero would
  // draw them alike and silently widen the room by 540 mm.
  it.each([
    [2600, "2,60"],
    [3000, "3,00"],
    [3600, "3,60"],
    [3560, "3,56"],
    [3060, "3,06"],
    [3006, "3,006"],
    [3565, "3,565"],
    [900, "0,90"],
  ] as const)("shows %i mm as %s and reads it back", (mm, shown) => {
    expect(formatMetresForDisplay(mm, "ro")).toBe(shown);
    expect(parseMetresToMillimetres(shown)).toEqual({ ok: true, mm });
  });
});

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
