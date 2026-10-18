"use client";

import { judgeAccountEmail } from "@lemnaria/configurator-domain";
import { useCallback, useRef, useState } from "react";

import type { AccountFieldIssue, AccountRateLimitNotice } from "@/i18n/content";

import {
  countdownSecondsOf,
  rateLimitNoticeOf,
  type AccountOutcome,
} from "./account-answer";
import { sendAccountRequest } from "./send-account-request";

// What the forgotten-password page remembers, and the one thing it does with it: asks the server for a link. The
// e-mail lives here in memory and nowhere else. The page never learns whether an account exists: the only inputs to
// what it shows are the answer's class, the field it marks and the wait it states.

/** What the last attempt left on the page. Only `sent` and `request-failed` replace the form. Everything stays until
 *  the next submit, a refused challenge included: a widget that solves itself returns a token at once, and the
 *  message would be gone before it could be read. */
export type ForgotFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "email-refused"; readonly issue: AccountFieldIssue }
  | { readonly kind: "challenge-failed" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
      readonly countdownSeconds: number | undefined;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "sent" }
  | { readonly kind: "request-failed" };

const NO_FEEDBACK: ForgotFeedback = { kind: "none" };

export interface ForgotPassword {
  readonly email: string;
  readonly feedback: ForgotFeedback;
  readonly isBusy: boolean;
  /** Whether a challenge token is held. The server refuses a request without one. */
  readonly hasToken: boolean;
  /** Bumped after every answer, because the server spends the token on nearly all of them. */
  readonly resetCount: number;
  readonly editEmail: (value: string) => void;
  readonly receiveToken: (token: string | null) => void;
  readonly submit: () => void;
  readonly clearFeedback: () => void;
}

export function useForgotPassword(): ForgotPassword {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<ForgotFeedback>(NO_FEEDBACK);
  const isSendingRef = useRef(false);

  const editEmail = useCallback((value: string) => {
    setEmail(value);
    setFeedback(withoutEmailRefusal);
  }, []);

  const receiveToken = useCallback((newToken: string | null) => {
    setToken(newToken);
  }, []);

  const submit = useCallback(() => {
    if (token === null || isSendingRef.current) return;
    const judged = judgeAccountEmail(email);
    if (!judged.ok) {
      setFeedback({
        kind: "email-refused",
        issue: { field: "email", code: judged.issue.code },
      });
      return;
    }
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    setToken(null);
    void sendAndAnswer(judged.email, token).then((answer) => {
      isSendingRef.current = false;
      setIsBusy(false);
      setResetCount((count) => count + 1);
      setFeedback(answer);
    });
  }, [email, token]);

  const clearFeedback = useCallback(() => {
    setFeedback(NO_FEEDBACK);
  }, []);

  return {
    email,
    feedback,
    isBusy,
    hasToken: token !== null,
    resetCount,
    editEmail,
    receiveToken,
    submit,
    clearFeedback,
  };
}

async function sendAndAnswer(
  email: string,
  turnstileToken: string,
): Promise<ForgotFeedback> {
  const outcome = await sendAccountRequest({
    flow: "forgot-password",
    body: { email, turnstileToken },
  });
  return feedbackFrom(outcome, Date.now());
}

function withoutEmailRefusal(feedback: ForgotFeedback): ForgotFeedback {
  return feedback.kind === "email-refused" ? NO_FEEDBACK : feedback;
}

/** Every outcome the page can be given. The request is the reset request, so the classes it never answers with
 *  (a session, a changed password, a refused login or link) are, like any unlisted answer, a failed request. */
function feedbackFrom(outcome: AccountOutcome, nowMs: number): ForgotFeedback {
  switch (outcome.kind) {
    case "check-inbox":
      return { kind: "sent" };
    case "invalid-input": {
      const [issue] = outcome.issues;
      return issue === undefined
        ? { kind: "request-failed" }
        : { kind: "email-refused", issue };
    }
    case "challenge-failed":
      return { kind: "challenge-failed" };
    case "rate-limited":
      return {
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, nowMs),
        countdownSeconds: countdownSecondsOf(outcome.wait),
      };
    case "unavailable":
      return { kind: "unavailable" };
    case "unanswered":
      return { kind: "unanswered" };
    case "request-failed":
    case "signed-in":
    case "password-changed":
    case "invalid-credentials":
    case "link-invalid":
      return { kind: "request-failed" };
  }
}
