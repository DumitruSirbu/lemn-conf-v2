"use client";

import { useCallback, useId, useRef, useState } from "react";

import { FormNotice } from "@/account/account-form-parts";
import accountStyles from "@/account/account.module.css";
import { loginPathWithReason } from "@/account/login-arrival";
import { askSessionOnce } from "@/account/session/use-account-session";
import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import type { AppLocale } from "@/i18n/routing";
import { useStaffActionsCopy } from "@/i18n/use-content";

import {
  resolveStaffSessionExpired,
  type StaffSessionExpiry,
} from "./staff-session-expiry";

// "Sesiunea a expirat" over a staff page (Lot 3 frames S1C and S2F): a staff request was refused because the session ended.
// The page behind the sheet is not touched, so what was typed in it is still there. "Intră în cont" opens the login page in
// a new browsing context and leaves this page as it is; the person signs in there, comes back and says so, and the sheet asks
// the server once whether that is true. A signed-in answer takes the sheet away and asks again whatever was refused (a read);
// a write is pressed again by the person.
//
// There is no "later": every request of the page is refused until the person is signed in, so the sheet is left by signing
// in or by leaving the page. Escape therefore does nothing. Mount it as a direct child of the staff frame's `<main>`: the
// modal behaviour makes the other children of the `<main>` inert.

export interface StaffSessionSheetProps {
  readonly locale: AppLocale;
  readonly expiry: StaffSessionExpiry;
}

/** What asking the server whether the person is signed in again came to, until it is asked again. */
type Recheck = "idle" | "checking" | "still-signed-out" | "unanswered";

export function StaffSessionSheet({ locale, expiry }: StaffSessionSheetProps) {
  const copy = useStaffActionsCopy().session;
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const signInRef = useRef<HTMLAnchorElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const { recheck, askAgain } = useRecheck();

  useModalFocus({
    hostRef,
    initialFocusRef: signInRef,
    focusFallbackRef: surfaceRef,
    dismiss: doNothing,
    returnFocus: {},
  });

  return (
    <div className={accountStyles.dialogHost} ref={hostRef}>
      <div className={accountStyles.dialogScrim} aria-hidden="true" />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={accountStyles.dialogSurface}
        data-testid="staff-session-sheet"
        onKeyDown={trapTab}
      >
        <span className={accountStyles.dialogGrabber} aria-hidden="true" />
        <h2 id={titleId} className={accountStyles.dialogTitle}>
          {copy.title}
        </h2>
        <p id={bodyId} className={accountStyles.dialogBody}>
          {expiry.keepsTypedText ? copy.bodyKeepsText : copy.body}
        </p>
        <RecheckNotice recheck={recheck} />
        <div className={accountStyles.dialogActions}>
          <a
            ref={signInRef}
            className={accountStyles.dialogPrimary}
            href={loginPathWithReason(locale, "session-expired")}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="staff-session-sign-in"
          >
            {copy.signIn}
          </a>
          <button
            type="button"
            className={accountStyles.dialogSecondary}
            aria-busy={recheck === "checking" ? true : undefined}
            aria-disabled={recheck === "checking" ? true : undefined}
            onClick={askAgain}
          >
            {recheck === "checking" ? copy.rechecking : copy.recheck}
          </button>
        </div>
        <p className={accountStyles.dialogBody}>{copy.newTab}</p>
      </div>
    </div>
  );
}

function RecheckNotice({ recheck }: { readonly recheck: Recheck }) {
  const copy = useStaffActionsCopy().session;
  if (recheck === "still-signed-out") {
    return <FormNotice tone="error">{copy.stillSignedOut}</FormNotice>;
  }
  if (recheck === "unanswered") {
    return <FormNotice tone="error">{copy.recheckFailed}</FormNotice>;
  }
  return null;
}

/** One question at a time to the session route; a signed-in answer ends the sheet. */
function useRecheck(): {
  readonly recheck: Recheck;
  readonly askAgain: () => void;
} {
  const [recheck, setRecheck] = useState<Recheck>("idle");
  const isAskingRef = useRef(false);
  const askAgain = useCallback(() => {
    if (isAskingRef.current) return;
    isAskingRef.current = true;
    setRecheck("checking");
    void askSessionOnce().then((session) => {
      isAskingRef.current = false;
      if (session === undefined) {
        setRecheck("unanswered");
      } else if (session.kind === "anonymous") {
        setRecheck("still-signed-out");
      } else {
        resolveStaffSessionExpired();
      }
    });
  }, []);
  return { recheck, askAgain };
}

function doNothing(): void {
  // Escape does not leave this sheet; the lint rule against empty functions wants a body, and this one is the point.
}
