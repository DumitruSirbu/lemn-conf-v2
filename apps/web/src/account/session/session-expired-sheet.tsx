"use client";

import { useLocale } from "next-intl";
import { useId, useRef } from "react";

import { useSessionExpiredSheetCopy } from "@/i18n/use-content";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "../account.module.css";
import { FormNotice } from "../account-form-parts";
import { loginPathWithReturn, returnPathOfDesign } from "../return-path";
import { SessionSheetShell } from "./session-sheet-shell";

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
  const signInRef = useRef<HTMLAnchorElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const returnNoteId = useId();
  return (
    <SessionSheetShell
      titleId={titleId}
      describedBy={
        returnPath === undefined ? bodyId : `${bodyId} ${returnNoteId}`
      }
      testId="session-expired-sheet"
      initialFocusRef={signInRef}
      dismiss={onLater}
    >
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
    </SessionSheetShell>
  );
}
