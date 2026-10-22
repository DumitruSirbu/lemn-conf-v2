"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { SaveStatus } from "@/persistence/save-coalescer";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  isSessionAnswerDefinite,
  isSignedOutByPerson,
  refreshSession,
  useAccountSession,
  type AccountSessionState,
} from "./use-account-session";

// When to tell the editor that a signed-in session has ended (plan Lot 2 P16, frame A20B).
//
// The save route gives one answer for "this is not yours" and "your session ended", so a refused save cannot say which
// it was. The hook asks the session route instead, and only when a save is refused while the editor shows a signed-in
// client: a visitor, who was never signed in, has no session to lose and is never told of one. It tells the person
// only on an answer the server gave, that the session is gone, that the person did not end it themselves. The session
// route answers `503` when its store cannot say, and a request that failed or was refused reads as anonymous on the
// client with no definite answer behind it (`isSessionAnswerDefinite`), so a flaky network or a store that is down is
// not an expired session. In every other case the editor stays as it was, read-only.
//
// Two choices are accepted, not oversights:
// - The trigger does not ask which way the design was opened. A client whose session ended on a design nobody has
//   claimed sees the sheet too, and after signing in lands on it read-only (ADR 0172 D9), as they would have anyway.
// - The check is made once per mount. A re-ask that came back without a definite answer ends it: the sheet is not
//   shown on that mount, deliberately, since a blip is not an expiry and asking again would only repeat the guess.
//
// It only says so. Nothing here navigates: a visitor's unsaved work is on this page, and the way to the login page is
// a link the person presses.

export interface SessionExpiry {
  /** Whether the sheet that says the session expired is on screen. */
  readonly isSheetOpen: boolean;
  /** "Mai târziu": the sheet goes and the editor stays read-only. It is not shown again on this mount. */
  readonly closeSheet: () => void;
}

export function useSessionExpiry(): SessionExpiry {
  const session = useAccountSession();
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // The signed-in state the session route was asked about: set from asking until the answer replaces it. An answer is
  // always a new state object, so "it is no longer this one" is how an answer is told from the state that was asked.
  const askedAboutRef = useRef<AccountSessionState | undefined>(undefined);
  const hasSettledRef = useRef(false);

  useEffect(() => {
    const askedAbout = askedAboutRef.current;
    if (askedAbout === undefined) {
      if (isRefusedAsUnauthorized(saveStatus, session, hasSettledRef.current)) {
        askedAboutRef.current = session;
        refreshSession();
      }
      return;
    }
    if (session === askedAbout) return;
    askedAboutRef.current = undefined;
    hasSettledRef.current = true;
    if (hasSessionExpired(session)) setIsSheetOpen(true);
  }, [saveStatus, session]);

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  return { isSheetOpen, closeSheet };
}

/** A refused save while a client is shown signed in, which has not been asked about before. */
function isRefusedAsUnauthorized(
  saveStatus: SaveStatus,
  session: AccountSessionState,
  hasSettled: boolean,
): boolean {
  return (
    saveStatus === "unauthorized" && session.kind === "client" && !hasSettled
  );
}

/** The server said nobody is signed in, and the person did not sign out on this document. */
function hasSessionExpired(answer: AccountSessionState): boolean {
  return (
    answer.kind === "anonymous" &&
    isSessionAnswerDefinite() &&
    !isSignedOutByPerson()
  );
}
