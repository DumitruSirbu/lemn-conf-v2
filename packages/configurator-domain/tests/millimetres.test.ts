import { describe, expect, it } from "vitest";

import { toExactMillimetres } from "../src/millimetres.js";

describe("toExactMillimetres", () => {
  it("accepts a module line that does not survive binary floating point exactly", () => {
    // 2.2 * 1000 is 2200.0000000000005, which is a conversion artefact and not a real 0.5 µm.
    expect(toExactMillimetres(2.2)).toBe(2200);
    expect(toExactMillimetres(0.57)).toBe(570);
  });

  it("accepts zero and the boundary of the tolerance", () => {
    expect(toExactMillimetres(0)).toBe(0);
    expect(toExactMillimetres(0.6 + 1e-6)).toBe(600);
  });
});
