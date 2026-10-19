// M8D wave W3: `matchesMedia` on a server render, where there is no `window` at all. This file runs in the `node`
// environment on purpose; `matches-media.dom.test.ts` holds the browser half.
import { describe, expect, it } from "vitest";

import { matchesMedia } from "@/lib/matches-media";

describe("matchesMedia where there is no window (a server render)", () => {
  it("answers false, and does not throw, for any query", () => {
    expect(typeof window).toBe("undefined");

    expect(matchesMedia("(pointer: fine)")).toBe(false);
    expect(matchesMedia("(prefers-reduced-motion: reduce)")).toBe(false);
  });
});
