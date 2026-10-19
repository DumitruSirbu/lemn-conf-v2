"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AppLocale } from "@/i18n/routing";
import {
  useAccountControlCopy,
  useAccountPasswordCopy,
  useAccountProfileCopy,
} from "@/i18n/use-content";

import { accountPathOf } from "../account-shell";
import { LogoutEverywhereDialog } from "../session/logout-everywhere-dialog";
import styles from "./profile.module.css";

// The rows under the profile's fields (Lot 2 frame A10A): the pages and acts that belong to the account and are not a
// detail of it. A row appears once what it opens is built (plan C8), so "Exportă datele mele" and "Șterge contul" are
// not here yet. Every link is a plain anchor, as on every account page.

/** The notice's page: its own document, opened beside the form so what was typed survives. */
const PRIVACY_NOTICE_PATH_SEGMENT = "privacy-notice";

export function ProfileRows({ locale }: { readonly locale: AppLocale }) {
  return (
    <nav className={styles.rows}>
      <ChangePasswordRow locale={locale} />
      <SignOutEverywhereRow />
      <PrivacyNoticeRow locale={locale} />
    </nav>
  );
}

function ChangePasswordRow({ locale }: { readonly locale: AppLocale }) {
  const copy = useAccountPasswordCopy();
  return (
    <a className={styles.row} href={accountPathOf(locale, "password")}>
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>{copy.title}</span>
      </span>
      <span className={styles.rowMark} aria-hidden="true" />
    </a>
  );
}

/** The row that asks the "everywhere" question, in the screen's `<main>` so the card behind it goes inert. It is a
 *  button of type `button`: it sits in the profile's form and must not submit it. */
function SignOutEverywhereRow() {
  const copy = useAccountControlCopy();
  const rowRef = useRef<HTMLButtonElement>(null);
  const [screen, setScreen] = useState<HTMLElement | undefined>(undefined);
  return (
    <>
      <button
        ref={rowRef}
        type="button"
        className={styles.rowButton}
        aria-haspopup="dialog"
        aria-expanded={screen !== undefined}
        onClick={() => {
          setScreen(rowRef.current?.closest("main") ?? document.body);
        }}
      >
        <span className={styles.rowText}>
          <span className={styles.rowLabel}>{copy.signOutEverywhere}</span>
        </span>
        <span className={styles.rowMark} aria-hidden="true" />
      </button>
      {screen === undefined
        ? null
        : createPortal(
            <LogoutEverywhereDialog
              onClose={() => {
                setScreen(undefined);
              }}
              returnFocusFallbackRef={rowRef}
            />,
            screen,
          )}
    </>
  );
}

function PrivacyNoticeRow({ locale }: { readonly locale: AppLocale }) {
  const copy = useAccountProfileCopy();
  return (
    <a
      className={styles.row}
      href={`/${locale}/${PRIVACY_NOTICE_PATH_SEGMENT}`}
      target="_blank"
      rel="noopener"
    >
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>{copy.privacyNotice}</span>
        <span className={styles.rowSub}>{copy.privacyNoticeNewTab}</span>
      </span>
      <span className={styles.rowMark} aria-hidden="true" />
    </a>
  );
}
