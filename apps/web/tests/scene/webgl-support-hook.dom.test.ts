// @vitest-environment happy-dom
//
// `useWebGLSupport`: the three states a screen draws. A server render and the first client render are `probing`; the
// answer arrives from an effect, so the server and the hydration pass cannot disagree.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWebGLSupport } from "../../src/scene/webgl-support";

function SupportReadout() {
  return createElement("span", null, useWebGLSupport());
}

let container: HTMLDivElement;
let root: Root | undefined;

function mountWithContext(context: unknown): string {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as never,
  );
  container = document.createElement("div");
  const mounted = createRoot(container);
  root = mounted;
  act(() => {
    mounted.render(createElement(SupportReadout));
  });
  return container.textContent;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  vi.restoreAllMocks();
});

describe("useWebGLSupport", () => {
  it("is probing in a render that runs no effect", () => {
    expect(renderToString(createElement(SupportReadout))).toContain("probing");
  });

  it("settles on supported when the browser hands back a context", () => {
    expect(mountWithContext({})).toBe("supported");
  });

  it("settles on unsupported when it does not", () => {
    expect(mountWithContext(null)).toBe("unsupported");
  });
});
