"use client";

import { useEffect, type RefObject } from "react";

/**
 * A question closing takes the control that asked it along with the answer, and focus falls to the body. When `cause`
 * names what replaced that control, focus goes to its element instead; focus that is elsewhere is left where it is.
 */
export function useFocusWhenLost(
  targetRef: RefObject<HTMLElement | null>,
  cause: unknown,
): void {
  useEffect(() => {
    if (cause === undefined || document.activeElement !== document.body) return;
    targetRef.current?.focus();
  }, [cause, targetRef]);
}
