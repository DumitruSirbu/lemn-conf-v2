import { describe, expect, it } from "vitest";

import { toExactMillimetres, toMillimetres } from "../src/millimetres.js";

describe("toExactMillimetres", () => {
  it("accepts a module line that does not survive binary floating point exactly", () => {
    // 2.2 * 1000 is 2200.0000000000005, which is a conversion artefact and not a real 0.5 µm.
    expect(toExactMillimetres(2.2)).toBe(2200);
    expect(toExactMillimetres(0.57)).toBe(570);
  });

  it("refuses a value that is genuinely off the millimetre grid", () => {
    expect(toExactMillimetres(0.6005)).toBeUndefined();
  });

  it("accepts zero and the boundary of the tolerance", () => {
    expect(toExactMillimetres(0)).toBe(0);
    expect(toExactMillimetres(0.6 + 1e-6)).toBe(600);
  });
});

describe("toMillimetres", () => {
  it("rounds a measurement that never lands on a whole millimetre", () => {
    expect(toMillimetres(0.6005)).toBe(601);
  });
});
