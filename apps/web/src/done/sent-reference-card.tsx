"use client";

import { useContent } from "@/i18n/use-content";

import styles from "./done.module.css";
import { useCopyText } from "./use-copy-text";

/**
 * The request's reference as text, with the control that copies exactly that text. *Copiat* is announced politely and
 * shown only once the clipboard accepted the write; where it did not, the reference is selected so it can be copied by
 * hand.
 */
export function SentReferenceCard({
  reference,
}: {
  readonly reference: string;
}) {
  const content = useContent().submissionResult;
  const { isCopied, copy, shownTextRef } = useCopyText(reference);

  return (
    <div className={styles.referenceCard} data-testid="done-reference-card">
      <div className={styles.referenceText}>
        <span className={styles.referenceLabel}>{content.referenceLabel}</span>
        <span
          ref={shownTextRef}
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
          onClick={copy}
        >
          {content.copy}
        </button>
      </div>
    </div>
  );
}
