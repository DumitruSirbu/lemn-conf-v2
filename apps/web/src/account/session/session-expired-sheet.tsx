"use client";

import { useLocale } from "next-intl";
import { useId, useRef } from "react";

import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import { useSessionExpiredSheetCopy } from "@/i18n/use-content";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "../account.module.css";
import { FormNotice } from "../account-form-parts";
import { loginPathWithReturn, returnPathOfDesign } from "../return-path";

// "Sesiunea a expirat" (Lot 2 frame A20B): the sheet the editor shows when the signed-in session ended while the person
// was working. It is a sheet on a phone and a dialog on a desktop, by the stylesheet.
//
// "Intră în cont" is a plain link, so the full-document load to the login page is the browser's own, and nothing is
// left behind on the way: the person's unsaved work is on this page, and it goes only when they press it. "Mai târziu"
// keeps the page as it is. The sheet is drawn from the shared dialog pieces rather than `AccountDialog`, whose
// confirmation is a button.
//
// Mount it as a direct child of the screen's `<main>`: the modal behaviour marks the other children of the `<main>`
// inert, the top bar among them.

export interface SessionExpiredSheetProps {
  /** "Mai târziu", Escape and the scrim. */
  readonly onLater: () => void;
}

export function SessionExpiredSheet({ onLater }: SessionExpiredSheetProps) {
  const copy = useSessionExpiredSheetCopy();
  const locale = useLocale();
  const designId = useConfiguratorStore((state) => state.designId);
  const returnPath = returnPathOfDesign(locale, designId);
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const signInRef = useRef<HTMLAnchorElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const returnNoteId = useId();

  useModalFocus({
    hostRef,
    initialFocusRef: signInRef,
    focusFallbackRef: surfaceRef,
    dismiss: onLater,
    // Focus goes back to what had it on open, which no press put there: the sheet is opened by a refused save, not by
    // a control, so there is no opener to name as a fallback.
    returnFocus: {},
  });

  return (
    <div className={styles.dialogHost} ref={hostRef}>
      <div
        className={styles.dialogScrim}
        aria-hidden="true"
        onClick={onLater}
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={
          returnPath === undefined ? bodyId : `${bodyId} ${returnNoteId}`
        }
        tabIndex={-1}
        className={styles.dialogSurface}
        data-testid="session-expired-sheet"
        onKeyDown={trapTab}
      >
        <span className={styles.dialogGrabber} aria-hidden="true" />
        <h2 id={titleId} className={styles.dialogTitle}>
          {copy.title}
        </h2>
        <p id={bodyId} className={styles.dialogBody}>
          {copy.body}
        </p>
        {returnPath === undefined ? null : (
          <FormNotice id={returnNoteId} tone="info">
            {copy.returnNote}
          </FormNotice>
        )}
        <div className={styles.dialogActions}>
          <a
            ref={signInRef}
            className={styles.dialogPrimary}
            href={loginPathWithReturn(locale, "session-expired", returnPath)}
            data-testid="session-expired-sign-in"
          >
            {copy.signIn}
          </a>
          <button
            type="button"
            className={styles.dialogSecondary}
            onClick={onLater}
          >
            {copy.later}
          </button>
        </div>
      </div>
    </div>
  );
}
