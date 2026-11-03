"use client";

import { useEffect, type RefObject } from "react";

/**
 * A click outside the element closes it, and moves nothing until the press is over. Closing on the press instead would
 * pull whatever stands below the closing element up under a finger that has not yet lifted, so a tap meant for a control
 * lower down would land on the one that took its place; the click is aimed at the control first, and the layout changes
 * after it.
 */
export function useCloseOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const listeningSince = performance.now();
    const onClick = (event: MouseEvent) => {
      // The click that opened the menu, or that closed the dialog it asked, is still on its way to the document when
      // this listener is added: it began before the menu could be left, so it is not a click outside.
      if (event.timeStamp < listeningSince) return;
      if (event.target instanceof Node && ref.current?.contains(event.target)) {
        return;
      }
      close();
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [ref, isOpen, close]);
}
