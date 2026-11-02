"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";

// Taking a row back, or correcting a price to the active one with Enter, removes the button that had focus. Focus then
// goes to the button now standing where it stood (the next row's, or the previous one's when it was the last), and to
// the empty page's heading when no row is left. It moves only if focus was lost with the row, so a failed revert, or a
// press elsewhere meanwhile, leaves it where it is.

const REVERT_SELECTOR = '[data-testid="diff-revert"]';
const ROW_SELECTOR = '[data-testid="diff-row"]';

export function useFocusAfterRevert(
  pageRef: RefObject<HTMLElement | null>,
  draft: unknown,
): {
  readonly rememberRevertPosition: (event: MouseEvent<HTMLElement>) => void;
  /** Enter in a row's price field: the row may be taken out by it, and its arrow is where focus was. */
  readonly rememberEditPosition: (event: KeyboardEvent<HTMLElement>) => void;
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

  const rememberEditPosition = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (
        event.key !== "Enter" ||
        !(event.target instanceof HTMLInputElement)
      ) {
        return;
      }
      const ownArrow = event.target
        .closest(ROW_SELECTOR)
        ?.querySelector<HTMLElement>(REVERT_SELECTOR);
      if (ownArrow === null || ownArrow === undefined) return;
      positionRef.current = revertButtonsIn(pageRef.current).indexOf(ownArrow);
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

  return { rememberRevertPosition, rememberEditPosition, emptyHeadingRef };
}

function revertButtonsIn(page: HTMLElement | null): HTMLElement[] {
  return Array.from(page?.querySelectorAll<HTMLElement>(REVERT_SELECTOR) ?? []);
}
