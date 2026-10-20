// @vitest-environment happy-dom
// A popover anchored to a cell that moves with the row can have its left edge off the screen at any width the row is
// tight. The hook measures the surface and shifts it right by exactly what keeps `--safe-gap` of the viewport; happy-dom
// has no layout, so the surface's box is stubbed to move with the shift it is given, the way a `translate` does.
import { act, createElement, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POPOVER_SHIFT_PROPERTY,
  rightwardShiftPx,
  useKeepSurfaceInsideViewport,
} from "@/price/use-keep-surface-inside-viewport";

const INSET_PX = 16;

describe("the shift that keeps a surface inside the viewport", () => {
  it.each([
    [-8.17, 24.17],
    [0, 16],
    [15.5, 0.5],
    [16, 0],
    [40, 0],
  ])("a left edge at %s px is moved right by %s px", (leftPx, expected) => {
    expect(rightwardShiftPx({ leftPx, insetPx: INSET_PX })).toBeCloseTo(
      expected,
      6,
    );
  });
});

describe("the hook that applies it", () => {
  let container: HTMLDivElement;
  let root: Root;
  let surface: HTMLDivElement;
  let baseLeftPx: number;

  function Probe(props: {
    readonly surfaceRef: RefObject<HTMLDivElement | null>;
    readonly isActive: boolean;
  }) {
    useKeepSurfaceInsideViewport(props.surfaceRef, props.isActive);
    return createElement("div", { ref: props.surfaceRef });
  }

  function mount(isActive: boolean): void {
    const surfaceRef = createRef<HTMLDivElement>();
    act(() => {
      root.render(createElement(Probe, { surfaceRef, isActive }));
    });
    surface = container.firstElementChild as HTMLDivElement;
    surface.getBoundingClientRect = () => {
      const shiftPx = Number.parseFloat(
        surface.style.getPropertyValue(POPOVER_SHIFT_PROPERTY) || "0",
      );
      return new DOMRect(baseLeftPx + shiftPx, 0, 520, 300);
    };
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    baseLeftPx = -8.17;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => ` ${String(INSET_PX)}px`,
    } as unknown as CSSStyleDeclaration);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  function shiftApplied(): number {
    return Number.parseFloat(
      surface.style.getPropertyValue(POPOVER_SHIFT_PROPERTY),
    );
  }

  it("moves a surface that stands off the screen's left edge to the inset", () => {
    mount(false);
    act(() => {
      root.render(
        createElement(Probe, {
          surfaceRef: { current: surface },
          isActive: true,
        }),
      );
    });

    expect(shiftApplied()).toBeCloseTo(24.17, 6);
    expect(surface.getBoundingClientRect().left).toBeCloseTo(INSET_PX, 6);
  });

  it("leaves a surface that already keeps the inset where it is", () => {
    baseLeftPx = 120;
    mount(false);
    act(() => {
      root.render(
        createElement(Probe, {
          surfaceRef: { current: surface },
          isActive: true,
        }),
      );
    });

    expect(shiftApplied()).toBe(0);
  });

  it("measures again when the window is resized, from the unshifted position", () => {
    mount(false);
    act(() => {
      root.render(
        createElement(Probe, {
          surfaceRef: { current: surface },
          isActive: true,
        }),
      );
    });
    baseLeftPx = 8;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(shiftApplied()).toBeCloseTo(8, 6);
    baseLeftPx = 300;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(shiftApplied()).toBe(0);
  });

  it("does nothing while the surface is not open", () => {
    mount(false);

    expect(surface.style.getPropertyValue(POPOVER_SHIFT_PROPERTY)).toBe("");
  });
});
