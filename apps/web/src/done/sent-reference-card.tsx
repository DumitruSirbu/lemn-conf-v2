"use client";

import { useEffect, useRef, useState } from "react";

import { useContent } from "@/i18n/use-content";

import styles from "./done.module.css";

/** How long *Copiat* stands after a copy: long enough to read, short enough that a later copy shows it again. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * The request's reference as text, with the control that copies exactly that text. The reference is never parsed or
 * interpreted. *Copiat* is announced politely and shown only once the clipboard accepted the write; where it did not,
 * the reference is selected so it can be copied by hand.
 */
export function SentReferenceCard({
  reference,
}: {
  readonly reference: string;
}) {
  const content = useContent().submissionResult;
  const referenceRef = useRef<HTMLSpanElement>(null);
  const { isCopied, showCopied } = useCopiedFeedback();

  function selectReference(): void {
    const element = referenceRef.current;
    if (element !== null) document.getSelection()?.selectAllChildren(element);
  }

  function copyReference(): void {
    const clipboard = clipboardOfThisBrowser();
    if (clipboard === undefined) {
      selectReference();
      return;
    }
    // The write is issued inside the press: a browser that wants a gesture for it would refuse a later one.
    new Promise<void>((resolve) => {
      resolve(clipboard.writeText(reference));
    }).then(showCopied, selectReference);
  }

  return (
    <div className={styles.referenceCard} data-testid="done-reference-card">
      <div className={styles.referenceText}>
        <span className={styles.referenceLabel}>{content.referenceLabel}</span>
        <span
          ref={referenceRef}
          className={styles.reference}
          data-testid="done-reference"
        >
          {reference}
        </span>
      </div>
      <div className={styles.copyArea}>
        <span role="status" className={styles.copied} data-testid="done-copied">
          {isCopied ? content.copied : null}
        </span>
        <button
          type="button"
          className={styles.copyButton}
          data-testid="done-copy"
          onClick={copyReference}
        >
          {content.copy}
        </button>
      </div>
    </div>
  );
}

/** `lib.dom.d.ts` declares the clipboard as always there; outside a secure context it is `undefined`. */
function clipboardOfThisBrowser(): Clipboard | undefined {
  return (navigator as { clipboard?: Clipboard }).clipboard;
}

/** Whether *Copiat* is showing: from each copy for `COPIED_FEEDBACK_MS`, restarted by the next one, and never past
 *  the card's own unmounting. */
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
