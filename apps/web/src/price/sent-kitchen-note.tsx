"use client";

import { useState } from "react";

import { useSentKitchenNoteCopy } from "@/i18n/use-content";

import styles from "./sent-kitchen-note.module.css";

/**
 * Frames C5A / C5AD: the soft note above the price of a kitchen the customer has already sent (ADR 0062 Amendment 5,
 * point 3). It informs and gets out of the way: it takes no focus, blocks nothing and does not touch the price.
 *
 * Closing is this view's own state. It writes nothing, so the note is back on the next open of the editor, and it stays
 * gone for as long as this screen stays mounted. Whether the kitchen is sent is `use-price-notice.ts`'s answer; this
 * draws what it is told.
 */
export function SentKitchenNote({ isSent }: { readonly isSent: boolean }) {
  const copy = useSentKitchenNoteCopy();
  const [isClosed, setIsClosed] = useState(false);

  if (!isSent || isClosed) return null;

  return (
    <div className={styles.note} role="note" data-testid="sent-kitchen-note">
      <span className={styles.glyph} aria-hidden="true" />
      <p className={styles.body}>{copy.body}</p>
      <button
        type="button"
        className={styles.close}
        aria-label={copy.close}
        data-testid="sent-kitchen-note-close"
        onClick={() => {
          setIsClosed(true);
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
