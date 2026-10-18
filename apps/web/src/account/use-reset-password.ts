import { judgePassword } from "@lemnaria/configurator-domain";
import { useCallback, useRef, useState } from "react";

import type { AccountFieldIssue, AccountRateLimitNotice } from "@/i18n/content";

import {
  countdownSecondsOf,
  rateLimitNoticeOf,
  type AccountOutcome,
} from "./account-answer";
import { useFragmentToken, type FragmentTokenStatus } from "./fragment-token";
import { sendAccountRequest } from "./send-account-request";

// What the new-password page remembers, and the one thing it does with it: sends the token from the address and the
// password the person chose. The password lives in memory here and nowhere else; the token lives in the fragment
// hook's ref and goes into the request body and nowhere else. The page never learns why a link is not good: every
// refusal of the link is one class.

/** What the last attempt left on the page. `password-changed`, `link-invalid` and `request-failed` replace the form. */
export type ResetFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "password-refused"; readonly issue: AccountFieldIssue }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
      readonly countdownSeconds: number | undefined;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "password-changed" }
  | { readonly kind: "link-invalid" }
  | { readonly kind: "request-failed" };

const NO_FEEDBACK: ResetFeedback = { kind: "none" };

/** Where focus goes after an answer: the password to correct, or the notice that now heads the form. */
export type ResetFocusTarget = "password" | "notice" | "nowhere";

/** A new object for every answer, so the page moves focus once per answer and never while the person types. */
export interface ResetFocusRequest {
  readonly target: ResetFocusTarget;
}

export interface ResetPassword {
  /** Whether the address held a token: `reading` until the page has looked, which is what the server renders. */
  readonly tokenStatus: FragmentTokenStatus;
  readonly password: string;
  readonly feedback: ResetFeedback;
  readonly focusRequest: ResetFocusRequest | undefined;
  readonly isBusy: boolean;
  readonly editPassword: (value: string) => void;
  readonly submit: () => void;
  readonly clearFeedback: () => void;
}

export function useResetPassword(): ResetPassword {
  const { status: tokenStatus, tokenRef, discard } = useFragmentToken();
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<ResetFeedback>(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<ResetFocusRequest>();
  const isSendingRef = useRef(false);

  const showAnswer = useCallback((answer: ResetFeedback) => {
    setFeedback(answer);
    setFocusRequest({ target: focusTargetOf(answer) });
  }, []);

  const editPassword = useCallback((value: string) => {
    setPassword(value);
    setFeedback((current) =>
      current.kind === "password-refused" ? NO_FEEDBACK : current,
    );
  }, []);

  const submit = useCallback(() => {
    const token = tokenRef.current;
    if (token === undefined || isSendingRef.current) return;
    const refusal = localRefusalOf(password);
    if (refusal !== undefined) {
      showAnswer({ kind: "password-refused", issue: refusal });
      return;
    }
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void sendAndAnswer({ token, newPassword: password }).then((answer) => {
      if (isPasswordSpentBy(answer)) setPassword("");
      if (isTokenSpentBy(answer)) discard();
      isSendingRef.current = false;
      setIsBusy(false);
      showAnswer(answer);
    });
  }, [discard, password, showAnswer, tokenRef]);

  const clearFeedback = useCallback(() => {
    setFeedback(NO_FEEDBACK);
  }, []);

  return {
    tokenStatus,
    password,
    feedback,
    focusRequest,
    isBusy,
    editPassword,
    submit,
    clearFeedback,
  };
}

/**
 * What the form can say without asking: nothing typed, or a length the rule can never accept. The server judges again
 * and alone judges the rest (the address, the breach check), so the address is not known here and a password is never
 * refused locally for being it. A refusal sends nothing, so the link is untouched.
 */
function localRefusalOf(password: string): AccountFieldIssue | undefined {
  if (password === "") return { field: "password", code: "PASSWORD_REQUIRED" };
  const judgement = judgePassword({ password, email: "" });
  if (judgement.ok) return undefined;
  return judgement.code === "PASSWORD_IS_EMAIL"
    ? undefined
    : { field: "password", code: judgement.code };
}

/** A refused password sends the person back to the password; a notice that heads the form takes focus for the rest.
 *  A changed password and a link that is no longer good replace the form and move focus themselves. */
function focusTargetOf(feedback: ResetFeedback): ResetFocusTarget {
  switch (feedback.kind) {
    case "password-refused":
      return "password";
    case "rate-limited":
    case "unavailable":
    case "unanswered":
      return "notice";
    default:
      return "nowhere";
  }
}

/** A password is not kept across the answers that end with it spent or that ask it to be typed again: a changed one, a
 *  link that is no longer good, and a service that was not there to take it. A refusal of the password itself, a limit
 *  and a lost connection keep it: nothing was lost, and the person has only to mend or retry. */
function isPasswordSpentBy(feedback: ResetFeedback): boolean {
  return (
    feedback.kind === "password-changed" ||
    feedback.kind === "link-invalid" ||
    feedback.kind === "unavailable"
  );
}

/** The token stays for every answer a retry can mend: the server spends it only on a change, and a refused password,
 *  a limit, a lost connection and a platform failure (told as `unanswered`) leave it whole. After a change, a link it
 *  no longer honours or a refusal no retry mends, there is nothing left to send. */
function isTokenSpentBy(feedback: ResetFeedback): boolean {
  return (
    feedback.kind === "password-changed" ||
    feedback.kind === "link-invalid" ||
    feedback.kind === "request-failed"
  );
}

interface ResetPasswordSending {
  readonly token: string;
  readonly newPassword: string;
}

async function sendAndAnswer(
  sending: ResetPasswordSending,
): Promise<ResetFeedback> {
  const outcome = await sendAccountRequest({
    flow: "reset-password",
    body: sending,
  });
  return feedbackFrom(outcome, Date.now());
}

/** Every outcome the page can be given. The request is the change, so the classes it never answers with (a session,
 *  a challenge, a registered address) are, like any unlisted answer, a failed request. A server error is told as a
 *  request that got no answer, which keeps the form, the password and the token for a retry: it says nothing about
 *  the link. */
function feedbackFrom(outcome: AccountOutcome, nowMs: number): ResetFeedback {
  switch (outcome.kind) {
    case "password-changed":
      return { kind: "password-changed" };
    case "link-invalid":
      return { kind: "link-invalid" };
    case "invalid-input":
      return passwordRefusalFrom(outcome.issues);
    case "rate-limited":
      return {
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, nowMs),
        countdownSeconds: countdownSecondsOf(outcome.wait),
      };
    case "unavailable":
      return { kind: "unavailable" };
    case "unanswered":
    case "platform-failed":
      return { kind: "unanswered" };
    case "request-failed":
    case "check-inbox":
    case "signed-in":
    case "invalid-credentials":
    case "challenge-failed":
      return { kind: "request-failed" };
  }
}

/** The classifier keeps only issues this flow can place, and the one field is the password; the first is shown. */
function passwordRefusalFrom(
  issues: readonly AccountFieldIssue[],
): ResetFeedback {
  const [issue] = issues;
  return issue === undefined
    ? { kind: "request-failed" }
    : { kind: "password-refused", issue };
}
