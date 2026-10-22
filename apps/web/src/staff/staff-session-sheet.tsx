"use client";

import { useCallback, useId, useRef, useState } from "react";

import { FormNotice } from "@/account/account-form-parts";
import accountStyles from "@/account/account.module.css";
import { loginPathWithReason } from "@/account/login-arrival";
import { SessionSheetShell } from "@/account/session/session-sheet-shell";
import {
  askSessionOnce,
  type AccountSessionState,
} from "@/account/session/use-account-session";
import type { AppLocale } from "@/i18n/routing";
import { useStaffActionsCopy } from "@/i18n/use-content";

import {
  resolveStaffSessionExpired,
  type StaffSessionExpiry,
} from "./staff-session-expiry";

// "Sesiunea a expirat" over a staff page (Lot 3 frames S1C and S2F): a staff request was refused because the session ended.
// The page behind the sheet is not touched, so what was typed in it is still there. "Intră în cont" opens the login page in
// a new browsing context and leaves this page as it is; the person signs in there, comes back and says so, and the sheet asks
// the server once whether that is true.
//
// Only the same staff member signed in again takes the sheet away; the refused reads are then asked for once more, and a
// write is pressed again by the person. Anyone else (a client, another staff member) means the page was built for someone
// it no longer belongs to, so it is loaded again and the server decides what that person sees; what was typed is lost.
//
// There is no "later": every request of the page is refused until the person is signed in, so the sheet is left by signing
// in or by leaving the page. Escape therefore does nothing.

export interface StaffSessionSheetProps {
  readonly locale: AppLocale;
  /** The address the page was built for: the staff member the server let in. */
  readonly email: string;
  readonly expiry: StaffSessionExpiry;
}

/** What asking the server whether the person is signed in again came to, until it is asked again. */
type Recheck = "idle" | "checking" | "still-signed-out" | "unanswered";

export function StaffSessionSheet({
  locale,
  email,
  expiry,
}: StaffSessionSheetProps) {
  const copy = useStaffActionsCopy().session;
  const signInRef = useRef<HTMLAnchorElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const newTabId = useId();
  const otherAccountId = useId();
  const { recheck, askAgain } = useRecheck(email);
  return (
    <SessionSheetShell
      titleId={titleId}
      describedBy={`${bodyId} ${newTabId} ${otherAccountId}`}
      testId="staff-session-sheet"
      initialFocusRef={signInRef}
      dismiss={doNothing}
    >
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
          aria-describedby={newTabId}
          data-testid="staff-session-sign-in"
        >
          {copy.signIn}
        </a>
        <RecheckButton recheck={recheck} onPress={askAgain} />
      </div>
      <p id={newTabId} className={accountStyles.dialogBody}>
        {copy.newTab}
      </p>
      <p id={otherAccountId} className={accountStyles.dialogBody}>
        {copy.otherAccount}
      </p>
    </SessionSheetShell>
  );
}

function RecheckButton({
  recheck,
  onPress,
}: {
  readonly recheck: Recheck;
  readonly onPress: () => void;
}) {
  const copy = useStaffActionsCopy().session;
  const isChecking = recheck === "checking";
  return (
    <button
      type="button"
      className={accountStyles.dialogSecondary}
      aria-busy={isChecking ? true : undefined}
      aria-disabled={isChecking ? true : undefined}
      onClick={onPress}
    >
      {isChecking ? copy.rechecking : copy.recheck}
    </button>
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

/** One question at a time to the session route; the answer decides what the page does next. */
function useRecheck(email: string): {
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
      actOn(session, email, setRecheck);
    });
  }, [email]);
  return { recheck, askAgain };
}

function actOn(
  session: AccountSessionState | undefined,
  email: string,
  setRecheck: (recheck: Recheck) => void,
): void {
  if (session === undefined) {
    setRecheck("unanswered");
  } else if (session.kind === "anonymous") {
    setRecheck("still-signed-out");
  } else if (isSameStaffMember(session, email)) {
    resolveStaffSessionExpired();
  } else {
    window.location.reload();
  }
}

function isSameStaffMember(
  session: AccountSessionState,
  email: string,
): boolean {
  return (
    session.kind === "staff" &&
    session.canEnterStaffArea === true &&
    session.email === email
  );
}

function doNothing(): void {
  // Escape does not leave this sheet; the lint rule against empty functions wants a body, and this one is the point.
}
