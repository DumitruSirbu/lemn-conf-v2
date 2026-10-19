"use client";

import { useLocale } from "next-intl";
import { useCallback, useRef, useState } from "react";

import type { AppLocale } from "@/i18n/routing";

import { loginPathWithReason, type LoginArrival } from "../login-arrival";
import { sendSignedInRequest } from "../send-account-request";
import { markSignedOutByPerson } from "./use-account-session";

// The two ways out of a signed-in session (Lot 2 frames A14A to A14F).
//
// Neither claims the session is gone before the server has said so. A `503` from "this device" leaves the cookie in
// place, and a screen that already showed the person as anonymous would be lying about a session that still opens their
// kitchens.
//
// Sign-out from an account page (a full load to the start of the configurator, plan P14) is not here: no account page
// mounts the control yet, and the wave that adds one writes that variant against a caller.

/** Whether the person ended the session on this document, for the editor's session-expiry notice: a session that is
 *  gone because its owner chose so has not expired. The mark itself lives with the session it describes. */
export { isSignedOutByPerson as hasPersonSignedOutHere } from "./use-account-session";

/** What the last attempt to end this device's session came to; `undefined` before any. */
export type SignOutHereOutcome = "signed-out" | "failed";

export interface SignOutHere {
  readonly outcome: SignOutHereOutcome | undefined;
  /** Whether a request is out. The menu's two rows do nothing meanwhile: a second sign-out would race the first. */
  readonly isSending: boolean;
  readonly signOut: () => void;
  readonly clearOutcome: () => void;
}

/** "Ieși din cont" on the configurator, which keeps the screen and says so. */
export function useSignOutHere(): SignOutHere {
  const isSendingRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const [outcome, setOutcome] = useState<SignOutHereOutcome | undefined>(
    undefined,
  );

  const signOut = useCallback(() => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    setIsSending(true);
    // A repeated failure must read as a new message, so the toast announces it again and restarts its clock.
    setOutcome(undefined);
    void endThisDevice().then((result) => {
      isSendingRef.current = false;
      setIsSending(false);
      settleSignOut(result);
      setOutcome(result);
    });
  }, []);

  const clearOutcome = useCallback(() => {
    setOutcome(undefined);
  }, []);

  return { outcome, isSending, signOut, clearOutcome };
}

/** A sign-out the server confirmed makes the document anonymous before the confirmation is set, so no e-mail is in the
 *  document when it is announced. A failed one changes nothing: the session is still live. */
function settleSignOut(result: SignOutHereOutcome): void {
  if (result === "signed-out") markSignedOutByPerson();
}

async function endThisDevice(): Promise<SignOutHereOutcome> {
  const answer = await sendSignedInRequest({
    flow: "logout",
    body: { scope: "this-device" },
  });
  return answer.kind === "succeeded" ? "signed-out" : "failed";
}

/** Where the "everywhere" dialog stands. `unavailable` is the server saying it could not end the sessions (nothing was
 *  changed); `offline` is no answer at all. */
export type SignOutEverywhereStatus =
  | "ready"
  | "busy"
  | "unavailable"
  | "offline";

export interface SignOutEverywhere {
  readonly status: SignOutEverywhereStatus;
  readonly confirm: () => void;
}

/** What the server's answer comes to: leave for the login page with a reason, or stay in the dialog. */
type EverywhereResult =
  | { readonly kind: "leave"; readonly arrival: LoginArrival }
  | { readonly kind: "stay"; readonly status: "unavailable" | "offline" };

/** A success leaves the dialog busy: the document is on its way to the login page, and a second press must do nothing. */
export function useSignOutEverywhere(): SignOutEverywhere {
  const locale = useLocale();
  const isSendingRef = useRef(false);
  const [status, setStatus] = useState<SignOutEverywhereStatus>("ready");

  const confirm = useCallback(() => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    setStatus("busy");
    void endEverySession().then((result) => {
      if (result.kind === "leave") {
        leaveForLogin(locale, result.arrival);
        return;
      }
      isSendingRef.current = false;
      setStatus(result.status);
    });
  }, [locale]);

  return { status, confirm };
}

/** The document is anonymous from here on, whatever the page it is being replaced shows meanwhile. */
function leaveForLogin(locale: AppLocale, arrival: LoginArrival): void {
  markSignedOutByPerson();
  window.location.assign(loginPathWithReason(locale, arrival));
}

/** `204` is every session of the account ended. `401` is no live session to name an account: nothing else was ended,
 *  and the person is told their session had expired rather than that they were signed out everywhere. */
async function endEverySession(): Promise<EverywhereResult> {
  const answer = await sendSignedInRequest({
    flow: "logout",
    body: { scope: "everywhere" },
  });
  switch (answer.kind) {
    case "succeeded":
      return { kind: "leave", arrival: "signed-out-everywhere" };
    case "unauthenticated":
      return { kind: "leave", arrival: "session-expired" };
    case "unanswered":
      return { kind: "stay", status: "offline" };
    default:
      return { kind: "stay", status: "unavailable" };
  }
}
