// @vitest-environment happy-dom
// M8D wave W3: `matchesMedia` in a browser-like page. The `node` half (no `window` at all) is `matches-media.test.ts`.
import { afterEach, describe, expect, it, vi } from "vitest";

import { matchesMedia } from "@/lib/matches-media";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function answerWith(matches: boolean): ReturnType<typeof vi.fn> {
  const matchMedia = vi.fn((query: string) => ({ matches, media: query }));
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
  return matchMedia;
}

describe("matchesMedia in a page", () => {
  it("answers true when the browser says the query matches", () => {
    answerWith(true);

    expect(matchesMedia("(pointer: fine)")).toBe(true);
  });

  it("answers false when the browser says the query does not match", () => {
    answerWith(false);

    expect(matchesMedia("(pointer: fine)")).toBe(false);
  });

  it("asks the browser the very query it was given", () => {
    const matchMedia = answerWith(true);

    matchesMedia("(prefers-reduced-motion: reduce)");

    expect(matchMedia).toHaveBeenCalledExactlyOnceWith(
      "(prefers-reduced-motion: reduce)",
    );
  });

  it("answers false, and does not throw, where the browser has no matchMedia", () => {
    (window as { matchMedia?: unknown }).matchMedia = undefined;

    expect(matchesMedia("(pointer: fine)")).toBe(false);
  });

  it("answers false where matchMedia is not a function", () => {
    (window as { matchMedia?: unknown }).matchMedia = { matches: true };

    expect(matchesMedia("(pointer: fine)")).toBe(false);
  });
});
