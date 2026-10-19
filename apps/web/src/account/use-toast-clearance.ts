"use client";

import { useEffect, type RefObject } from "react";

/** The variable `account.module.css` reads to lift the status toast; unset it is 0. */
const TOAST_CLEAR_BOTTOM_PROPERTY = "--toast-clear-bottom";

/**
 * Lifts the status toast above a bar the page pins at the foot, so the toast never covers its action. The height is the
 * bar's own as it changes (one sentence or three, any language). A bar that is not pinned (the desktop card keeps it in
 * the flow) lifts nothing. Removed when the screen goes.
 */
export function useToastClearance(bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = bar.current;
    if (element === null) return;
    const root = document.documentElement;
    const reserve = () => {
      const clearance = isPinned(element)
        ? element.getBoundingClientRect().height
        : 0;
      root.style.setProperty(
        TOAST_CLEAR_BOTTOM_PROPERTY,
        `${String(clearance)}px`,
      );
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(element);
    window.addEventListener("resize", reserve);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reserve);
      root.style.removeProperty(TOAST_CLEAR_BOTTOM_PROPERTY);
    };
  }, [bar]);
}

function isPinned(element: HTMLElement): boolean {
  return getComputedStyle(element).position === "sticky";
}
