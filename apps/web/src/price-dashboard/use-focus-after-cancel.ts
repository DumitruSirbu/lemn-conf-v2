"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

// Cancel leaves the page with the change it undoes, and the focus it had with it. Focus then goes to the target, but only
// if it was lost with the button: a press elsewhere meanwhile, or a page that opens with no focus, is left alone.

export function useFocusAfterCancel(
  cancel: () => void,
  target: RefObject<HTMLElement | null>,
): () => void {
  const hasCancelled = useRef(false);

  const cancelAndRemember = useCallback(() => {
    hasCancelled.current = true;
    cancel();
  }, [cancel]);

  useEffect(() => {
    if (!hasCancelled.current) return;
    hasCancelled.current = false;
    if (document.activeElement === document.body) target.current?.focus();
  });

  return cancelAndRemember;
}
