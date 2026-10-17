"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useId } from "react";

import { useContent } from "@/i18n/use-content";
import { useAbsoluteEditorAddress } from "@/review/use-absolute-editor-address";

import styles from "./done.module.css";
import { useCopyText } from "./use-copy-text";

/**
 * The customer's own address of this design's editor as text, the control that copies exactly that text, and the note
 * that it opens the design for editing in this browser only. *Copiat* is announced politely once the clipboard accepted
 * the write, on a line of its own that is held open while empty, so neither the address nor the note moves when it
 * appears; where the write was refused, the address is selected so it can be copied by hand. The address is shown
 * without its scheme, which is noise on a phone, and wraps; the copy still takes the whole address.
 */
export function DesignLinkCard({ designId }: { readonly designId: DesignId }) {
  const content = useContent().submissionResult;
  const address = useAbsoluteEditorAddress(designId);
  const { isCopied, copy, shownTextRef } = useCopyText(address);
  const labelId = useId();
  const shownAddress = withoutScheme(address);

  return (
    <div className={styles.linkCard} data-testid="done-design-link-card">
      <div className={styles.linkRow}>
        <div className={styles.linkText}>
          <span id={labelId} className={styles.linkLabel}>
            {content.designLinkLabel}
          </span>
          <span
            ref={shownTextRef}
            dir="ltr"
            className={styles.designLink}
            data-testid="done-design-link"
          >
            {shownAddress}
          </span>
        </div>
        <button
          type="button"
          className={styles.copyButton}
          aria-describedby={labelId}
          data-testid="done-copy"
          onClick={copy}
        >
          {content.copy}
        </button>
      </div>
      <p role="status" className={styles.linkCopied} data-testid="done-copied">
        {isCopied ? content.copied : null}
      </p>
      <p className={styles.linkNote} data-testid="done-design-link-note">
        {content.designLinkNote}
      </p>
    </div>
  );
}

function withoutScheme(address: string): string {
  return address.replace(/^https?:\/\//, "");
}
