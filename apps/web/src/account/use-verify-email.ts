import { useCallback, useRef, useState } from "react";

import type { AccountRateLimitNotice } from "@/i18n/content";

import { rateLimitNoticeOf, type AccountOutcome } from "./account-answer";
import { useFragmentToken, type FragmentTokenStatus } from "./fragment-token";
import { sendAccountRequest } from "./send-account-request";

// What the confirm page remembers, and the one thing it does with it: sends the token from the address and the typed
// password. The password lives in memory here and nowhere else; the token lives in the fragment hook's ref and goes
// into the request body and nowhere else. Every refused confirmation is one class, so the only inputs to what the page
// shows are that class and the wait it states.

/** What the last attempt left on the page. `signed-in` and `request-failed` replace the form. */
export type VerifyFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "password-required" }
  | { readonly kind: "link-or-password-invalid" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "signed-in"; readonly claimable: number }
  | { readonly kind: "request-failed" };

const NO_FEEDBACK: VerifyFeedback = { kind: "none" };

/** Where focus goes after an answer: the password to retype, or the notice that now heads the form. */
export type VerifyFocusTarget = "password" | "notice" | "nowhere";

/** A new object for every answer, so the page moves focus once per answer and never while the person types. */
export interface VerifyFocusRequest {
  readonly target: VerifyFocusTarget;
}

export interface VerifyEmail {
  /** Whether the address held a token: `reading` until the page has looked, which is what the server renders. */
  readonly tokenStatus: FragmentTokenStatus;
  readonly password: string;
  readonly feedback: VerifyFeedback;
  readonly focusRequest: VerifyFocusRequest | undefined;
  readonly isBusy: boolean;
  readonly editPassword: (value: string) => void;
  readonly submit: () => void;
}

export function useVerifyEmail(): VerifyEmail {
  const { status: tokenStatus, tokenRef, discard } = useFragmentToken();
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<VerifyFeedback>(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<VerifyFocusRequest>();
  const isSendingRef = useRef(false);

  const showAnswer = useCallback((answer: VerifyFeedback) => {
    setFeedback(answer);
    setFocusRequest({ target: focusTargetOf(answer) });
  }, []);

  const editPassword = useCallback((value: string) => {
    setPassword(value);
    setFeedback((current) =>
      current.kind === "password-required" ? NO_FEEDBACK : current,
    );
  }, []);

  const submit = useCallback(() => {
    const token = tokenRef.current;
    if (token === undefined || isSendingRef.current) return;
    if (password === "") {
      showAnswer({ kind: "password-required" });
      return;
    }
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void sendAndAnswer({ token, password }).then((answer) => {
      if (isPasswordSpentBy(answer)) setPassword("");
      if (isTokenSpentBy(answer)) discard();
      // A confirmed page is on its way out: the guard stays shut until the document is replaced.
      if (answer.kind !== "signed-in") {
        isSendingRef.current = false;
        setIsBusy(false);
      }
      showAnswer(answer);
    });
  }, [discard, password, showAnswer, tokenRef]);

  return {
    tokenStatus,
    password,
    feedback,
    focusRequest,
    isBusy,
    editPassword,
    submit,
  };
}

/** A refused confirmation sends the person back to the password, which was emptied; a notice that heads the form takes
 *  focus for the rest. A confirmed page and a failed request replace the form and move focus themselves. */
function focusTargetOf(feedback: VerifyFeedback): VerifyFocusTarget {
  switch (feedback.kind) {
    case "password-required":
    case "link-or-password-invalid":
      return "password";
    case "rate-limited":
    case "unavailable":
    case "unanswered":
      return "notice";
    default:
      return "nowhere";
  }
}

/** A password is not kept across the answers that ask it to be typed again: a refused confirmation, a service that was
 *  not there to take it, and a confirmed one. A limit and a lost connection keep it. */
function isPasswordSpentBy(feedback: VerifyFeedback): boolean {
  return (
    feedback.kind === "link-or-password-invalid" ||
    feedback.kind === "unavailable" ||
    feedback.kind === "signed-in"
  );
}

/** The token stays for every answer a retry can mend, a wrong password and a platform failure included: the server
 *  spends it only on a confirmation. After one, or after a refusal no retry mends, there is nothing left to send. */
function isTokenSpentBy(feedback: VerifyFeedback): boolean {
  return feedback.kind === "signed-in" || feedback.kind === "request-failed";
}

interface VerifyEmailSending {
  readonly token: string;
  readonly password: string;
}

async function sendAndAnswer(
  sending: VerifyEmailSending,
): Promise<VerifyFeedback> {
  const outcome = await sendAccountRequest({
    flow: "verify-email",
    body: sending,
  });
  return feedbackFrom(outcome, Date.now());
}

/** Every outcome the page can be given. The request is the confirmation, so the classes it never answers with (a
 *  challenge, a registered address, a refused field) are, like any unlisted answer, a failed request. A server error
 *  is told as a request that got no answer, which keeps the form, the password and the token for a retry: it says
 *  nothing about the link. */
function feedbackFrom(outcome: AccountOutcome, nowMs: number): VerifyFeedback {
  switch (outcome.kind) {
    case "signed-in":
      return { kind: "signed-in", claimable: outcome.claimable };
    case "link-invalid":
      return { kind: "link-or-password-invalid" };
    case "rate-limited":
      return {
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, nowMs),
      };
    case "unavailable":
      return { kind: "unavailable" };
    case "unanswered":
    case "platform-failed":
      return { kind: "unanswered" };
    case "request-failed":
    case "check-inbox":
    case "password-changed":
    case "invalid-input":
    case "invalid-credentials":
    case "challenge-failed":
      return { kind: "request-failed" };
  }
}
