"use client";

import { useEffect, type RefObject } from "react";

/**
 * A click outside the element closes it, and moves nothing until the press is over. Closing on the press instead would
 * pull whatever stands below the closing element up under a finger that has not yet lifted, so a tap meant for a
 * control lower down would land on the one that took its place; the click is aimed at the control first, and the layout
 * changes after it.
 *
 * The listener is attached after the dispatch that opened the element is over: the click that opened it, or that closed
 * the dialog it asked, is still on its way to the document when the effect runs, and it is no click outside. Waiting
 * for the next task does not depend on the resolution of an event's time stamp, which a browser may coarsen.
 */
export function useCloseOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) {
        return;
      }
      close();
    };
    const attach = setTimeout(() => {
      document.addEventListener("click", onClick);
    }, 0);
    return () => {
      clearTimeout(attach);
      document.removeEventListener("click", onClick);
    };
  }, [ref, isOpen, close]);
}
