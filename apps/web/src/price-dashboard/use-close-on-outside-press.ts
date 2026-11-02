"use client";

import { useEffect, type RefObject } from "react";

/** A press outside the element closes it and moves nothing: focus is wherever the press put it. */
export function useCloseOnOutsidePress(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) {
        return;
      }
      close();
    };
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("pointerdown", onPress);
    };
  }, [ref, isOpen, close]);
}
