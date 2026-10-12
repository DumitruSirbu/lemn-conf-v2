// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { absoluteShareAddress } from "@/share/absolute-share-address";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("absoluteShareAddress", () => {
  it.each([
    ["https://lemnaria.example", "https://lemnaria.example/s/AbCdEfGhIjKl"],
    ["http://localhost:4320", "http://localhost:4320/s/AbCdEfGhIjKl"],
  ])(
    "joins the page's origin %s to the path and nothing else",
    (origin, expected) => {
      vi.stubGlobal("location", { origin });

      expect(absoluteShareAddress("/s/AbCdEfGhIjKl")).toBe(expected);
    },
  );
});
