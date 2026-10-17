"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** How long *Copiat* stands after a copy: long enough to read, short enough that a later copy shows it again. */
const COPIED_FEEDBACK_MS = 2000;

export interface CopyText {
  /** Whether *Copiat* is showing: from each accepted copy for `COPIED_FEEDBACK_MS`, restarted by the next one. */
  readonly isCopied: boolean;
  /** Writes exactly the text to the clipboard; where the clipboard is missing or refuses, selects the shown text. */
  readonly copy: () => void;
  /** The element that shows the text, selected whole when the clipboard does not take the write. */
  readonly shownTextRef: RefObject<HTMLSpanElement | null>;
}

/**
 * Copies one text, never parsed or interpreted. *Copiat* is shown only once the clipboard accepted the write; where it
 * did not, the shown text is selected so it can be copied by hand.
 */
export function useCopyText(text: string): CopyText {
  const shownTextRef = useRef<HTMLSpanElement>(null);
  const { isCopied, showCopied } = useCopiedFeedback();

  function selectShownText(): void {
    const element = shownTextRef.current;
    if (element !== null) document.getSelection()?.selectAllChildren(element);
  }

  function copy(): void {
    const clipboard = clipboardOfThisBrowser();
    if (clipboard === undefined) {
      selectShownText();
      return;
    }
    // The write is issued inside the press: a browser that wants a gesture for it would refuse a later one.
    new Promise<void>((resolve) => {
      resolve(clipboard.writeText(text));
    }).then(showCopied, selectShownText);
  }

  return { isCopied, copy, shownTextRef };
}

/** `lib.dom.d.ts` declares the clipboard as always there; outside a secure context it is `undefined`. */
function clipboardOfThisBrowser(): Clipboard | undefined {
  return (navigator as { clipboard?: Clipboard }).clipboard;
}

/** Never past the caller's own unmounting: the timer is cleared with the effect. */
function useCopiedFeedback(): {
  readonly isCopied: boolean;
  readonly showCopied: () => void;
} {
  const [copyCount, setCopyCount] = useState(0);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (copyCount === 0) return;
    const timer = setTimeout(() => {
      setIsCopied(false);
    }, COPIED_FEEDBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copyCount]);

  return {
    isCopied,
    showCopied: () => {
      setIsCopied(true);
      setCopyCount((count) => count + 1);
    },
  };
}
