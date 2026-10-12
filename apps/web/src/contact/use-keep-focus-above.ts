"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keeps whatever takes keyboard focus clear of a pinned region. The page scrolls under a sticky region, and a browser
 * scrolls a focused box only until it is in the viewport, which is under the region's top edge. The viewport's
 * `scroll-padding-bottom` is that edge, read from the region's own height as it changes (one sentence or three, any
 * language), so no number is kept in step with the layout. Restored when the screen goes.
 *
 * The review screen holds the same rule privately; this one is the contact screen's own until the two are joined.
 */
export function useKeepFocusAbove(region: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = region.current;
    if (element === null) return;
    const viewport = document.documentElement;
    const reserve = () => {
      viewport.style.scrollPaddingBottom = `calc(${String(element.getBoundingClientRect().height)}px + var(--safe-gap))`;
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(element);
    return () => {
      observer.disconnect();
      viewport.style.removeProperty("scroll-padding-bottom");
    };
  }, [region]);
}
