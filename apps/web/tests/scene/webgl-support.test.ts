import { describe, expect, it } from "vitest";

import {
  detectWebGLSupport,
  type ProbeCanvasFactory,
} from "../../src/scene/webgl-support";

function canvasReturning(
  contexts: Record<string, unknown>,
): ProbeCanvasFactory {
  return () =>
    ({ getContext: (id: string) => contexts[id] ?? null }) as Pick<
      HTMLCanvasElement,
      "getContext"
    >;
}

describe("detectWebGLSupport", () => {
  it("reports support when the browser hands back a webgl2 context", () => {
    expect(detectWebGLSupport(canvasReturning({ webgl2: {} }))).toBe(true);
  });

  it("falls back to webgl1 before giving up", () => {
    expect(detectWebGLSupport(canvasReturning({ webgl: {} }))).toBe(true);
  });

  it("reports no support when every context request comes back null", () => {
    expect(detectWebGLSupport(canvasReturning({}))).toBe(false);
  });

  it("reports no support when asking for a context throws", () => {
    const throwingCanvas: ProbeCanvasFactory = () =>
      ({
        getContext: () => {
          throw new Error("context creation blocked");
        },
      }) as Pick<HTMLCanvasElement, "getContext">;
    expect(detectWebGLSupport(throwingCanvas)).toBe(false);
  });
});
