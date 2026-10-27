"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from "react";

// Taking a row back removes the button that had focus. Focus then goes to the button now standing where it stood (the next
// row's, or the previous one's when it was the last), and to the empty page's heading when no row is left. It moves only if
// focus was lost with the row, so a failed revert, or a press elsewhere meanwhile, leaves it where it is.

const REVERT_SELECTOR = '[data-testid="diff-revert"]';

export function useFocusAfterRevert(
  pageRef: RefObject<HTMLElement | null>,
  draft: unknown,
): {
  readonly rememberRevertPosition: (event: MouseEvent<HTMLElement>) => void;
  readonly emptyHeadingRef: RefObject<HTMLElement | null>;
} {
  const positionRef = useRef<number | undefined>(undefined);
  const emptyHeadingRef = useRef<HTMLElement>(null);

  const rememberRevertPosition = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!(event.target instanceof Element)) return;
      const pressed = event.target.closest<HTMLElement>(REVERT_SELECTOR);
      if (pressed === null) return;
      positionRef.current = revertButtonsIn(pageRef.current).indexOf(pressed);
    },
    [pageRef],
  );

  useEffect(() => {
    const from = positionRef.current;
    if (from === undefined) return;
    positionRef.current = undefined;
    if (document.activeElement !== document.body) return;
    const buttons = revertButtonsIn(pageRef.current);
    const next = buttons[Math.min(from, buttons.length - 1)];
    (next ?? emptyHeadingRef.current)?.focus();
  }, [draft, pageRef]);

  return { rememberRevertPosition, emptyHeadingRef };
}

function revertButtonsIn(page: HTMLElement | null): HTMLElement[] {
  return Array.from(page?.querySelectorAll<HTMLElement>(REVERT_SELECTOR) ?? []);
}
