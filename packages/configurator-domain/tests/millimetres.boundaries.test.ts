// `toExactMillimetres` is the guard that stands between a derived coordinate and the `Design`
// document. `millimetres.test.ts` proves it accepts the module lines and refuses a value that is
// genuinely off the grid; this file attacks the values a guard of that shape usually lets through.
//
// Its own doc comment states the contract: "the whole millimetre this value sits on, or
// `undefined` when it does not sit on one". `NaN` and `Infinity` sit on no millimetre.
import { describe, expect, it } from "vitest";

import { DesignSchema } from "../src/design.js";
import { toExactMillimetres, toMillimetres } from "../src/millimetres.js";
import { syntheticDesign } from "./support/synthetic-world.js";

/** The values a bounding-box measurement produces when there was nothing to measure. Three.js
 *  reports an empty `Box3` as ±Infinity, and any arithmetic on two of those is `NaN`. */
const NON_FINITE_METRES = [NaN, Infinity, -Infinity] as const;

describe("toExactMillimetres — values that sit on no millimetre", () => {
  it.each(NON_FINITE_METRES)(
    "refuses %s, which is not a whole millimetre and cannot be written into a Design",
    (valueM) => {
      expect(toExactMillimetres(valueM)).toBeUndefined();
    },
  );

  it("refuses half a millimetre in either direction", () => {
    expect(toExactMillimetres(0.6005)).toBeUndefined();
    expect(toExactMillimetres(-0.6005)).toBeUndefined();
  });

  it("accepts the tolerance boundary and refuses one micron past it", () => {
    // EXACT_MILLIMETRE_TOLERANCE_MM is 1e-3 mm, which is 1e-9 m at the metre scale of the input.
    expect(toExactMillimetres(0.6 + 1e-9)).toBe(600);
    expect(toExactMillimetres(0.6 + 2e-6)).toBeUndefined();
  });

  it("converts negative zero to a millimetre count that serialises like any other zero", () => {
    // It returns -0 rather than 0, which `toEqual` and `Object.is` distinguish. JSON does not, so
    // a persisted round trip survives it; a structural comparison against a reloaded design
    // would not. Pinned at the level that matters — the wire form.
    expect(JSON.stringify(toExactMillimetres(-0))).toBe("0");
  });

  it("keeps a very large but exact value integral", () => {
    const converted = toExactMillimetres(1e9);
    expect(converted).toBeDefined();
    expect(Number.isSafeInteger(converted)).toBe(true);
  });
});

describe("toMillimetres — the display and seat rounding", () => {
  it("rounds a real measurement", () => {
    expect(toMillimetres(0.6005)).toBe(601);
  });

  it.each(NON_FINITE_METRES)(
    "does not produce %s as a millimetre count a Design would then carry",
    (valueM) => {
      expect(Number.isFinite(toMillimetres(valueM))).toBe(true);
    },
  );
});

describe("the schema the millimetre guards protect", () => {
  it("rejects a placement carrying a non-finite millimetre, which is what makes the guard load-bearing", () => {
    const design = syntheticDesign([
      {
        id: "s0",
        wall: "A",
        alongMm: 600,
        y0Mm: 0,
        body: { buildId: "base-2door", widthMm: 600, heightMm: NaN },
      },
    ]);
    expect(DesignSchema.safeParse(design).success).toBe(false);
  });
});
