"use client";

import { useLayoutEffect, type RefObject } from "react";

/** The custom property the stylesheet turns into a `translate` on the popover; unset it is `0px`. */
export const POPOVER_SHIFT_PROPERTY = "--popover-shift";

/** The token every viewport-clamped surface keeps clear of the screen's edges (`globals.css`). */
const INSET_TOKEN = "--safe-gap";

/** How far a surface hanging from its right edge moves right so that its left edge keeps `insetPx` of the viewport. */
export function rightwardShiftPx(query: {
  readonly leftPx: number;
  readonly insetPx: number;
}): number {
  return Math.max(0, query.insetPx - query.leftPx);
}

/**
 * Holds a popover that is anchored to a cell inside the viewport: the cell moves with the row, so the popover's left
 * edge can fall off the screen at any width the row is tight. Measured, not declared, and re-measured on resize.
 */
export function useKeepSurfaceInsideViewport(
  surfaceRef: RefObject<HTMLElement | null>,
  isActive: boolean,
): void {
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!isActive || !surface) return undefined;

    function clamp(): void {
      if (!surface) return;
      surface.style.setProperty(POPOVER_SHIFT_PROPERTY, "0px");
      const inset = Number.parseFloat(
        getComputedStyle(surface).getPropertyValue(INSET_TOKEN),
      );
      const shift = rightwardShiftPx({
        leftPx: surface.getBoundingClientRect().left,
        insetPx: Number.isNaN(inset) ? 0 : inset,
      });
      surface.style.setProperty(POPOVER_SHIFT_PROPERTY, `${String(shift)}px`);
    }

    clamp();
    window.addEventListener("resize", clamp);
    return () => {
      window.removeEventListener("resize", clamp);
    };
  }, [surfaceRef, isActive]);
}
