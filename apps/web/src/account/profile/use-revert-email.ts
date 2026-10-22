import { judgePassword } from "@lemnaria/configurator-domain";
import { useCallback, useRef, useState } from "react";

import type { AccountFieldIssue, AccountRateLimitNotice } from "@/i18n/content";

import { rateLimitNoticeOf, type SignedInOutcome } from "../account-answer";
import type { FocusRequest } from "../account-focus";
import { useFragmentToken, type FragmentTokenStatus } from "../fragment-token";
import { sendSignedInRequest } from "../send-account-request";

// What the undo page remembers, and the one thing it does with it: sends the token from the address and the new
// password the person chose, when they press the button. It never sends on its own, so a mail scanner that opens the
// link reverts nothing. The password lives in memory here and nowhere else; the token lives in the fragment hook's ref
// and goes into the request body and nowhere else. The page never learns why a link is not good: every refusal of the
// link is one class.

/** What the last attempt left on the page. `reverted`, `link-invalid` and `request-failed` replace the form. */
export type RevertEmailFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "password-refused"; readonly issue: AccountFieldIssue }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "reverted" }
  | { readonly kind: "link-invalid" }
  | { readonly kind: "request-failed" };

const NO_FEEDBACK: RevertEmailFeedback = { kind: "none" };

/** Where focus goes after an answer: the password to correct, or the notice that now heads the form. */
export type RevertEmailFocusRequest = FocusRequest<"password" | "notice">;

export interface RevertEmail {
  /** Whether the address held a token: `reading` until the page has looked, which is what the server renders. */
  readonly tokenStatus: FragmentTokenStatus;
  readonly password: string;
  readonly feedback: RevertEmailFeedback;
  readonly focusRequest: RevertEmailFocusRequest | undefined;
  readonly isBusy: boolean;
  readonly editPassword: (value: string) => void;
  readonly submit: () => void;
}

export function useRevertEmail(): RevertEmail {
  const { status: tokenStatus, tokenRef, discard } = useFragmentToken();
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<RevertEmailFeedback>(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<RevertEmailFocusRequest>();
  const isSendingRef = useRef(false);

  const showAnswer = useCallback((answer: RevertEmailFeedback) => {
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

/**
 * What the form can say without asking: nothing typed, or a length the rule can never accept. The server judges again
 * and alone judges the rest, the address the link restores and the breach check; that address is not known here, so a
 * password is never refused locally for being it. A refusal sends nothing, so the link is untouched.
 */
function localRefusalOf(password: string): AccountFieldIssue | undefined {
  if (password === "") {
    return { field: "newPassword", code: "PASSWORD_REQUIRED" };
  }
  const judgement = judgePassword({ password, email: "" });
  if (judgement.ok || judgement.code === "PASSWORD_IS_EMAIL") return undefined;
  return { field: "newPassword", code: judgement.code };
}

/** A refused password sends the person back to the password; a notice that heads the form takes focus for the rest.
 *  A restored address and a link that is no longer good replace the form and move focus themselves. */
function focusTargetOf(
  feedback: RevertEmailFeedback,
): RevertEmailFocusRequest["target"] {
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

/** The password is not kept once the form is gone with it spent or refused for good: a restored address and a link that
 *  is no longer good. Every other answer keeps it, so the same button retries with what was typed. */
function isPasswordSpentBy(feedback: RevertEmailFeedback): boolean {
  return feedback.kind === "reverted" || feedback.kind === "link-invalid";
}

/** The token stays for every answer a retry can mend: the server spends it only on a revert, so a refused password, a
 *  limit, an unavailable service, a lost connection and a platform failure (told as `unanswered`) leave it whole. After
 *  a revert, a link it no longer honours or a refusal no retry mends, there is nothing left to send. */
function isTokenSpentBy(feedback: RevertEmailFeedback): boolean {
  return (
    feedback.kind === "reverted" ||
    feedback.kind === "link-invalid" ||
    feedback.kind === "request-failed"
  );
}

interface RevertEmailSending {
  readonly token: string;
  readonly newPassword: string;
}

async function sendAndAnswer(
  sending: RevertEmailSending,
): Promise<RevertEmailFeedback> {
  const outcome = await sendSignedInRequest({
    flow: "revert-email",
    body: sending,
  });
  return feedbackFrom(outcome, Date.now());
}

/** Every outcome the page can be given. The page has no session, so the classes of a signed-in request (`401`, `403`)
 *  are, like any unlisted answer, a failed request; so is `400 invalid-request`. A server error no word explains is
 *  told as a request that got no answer, which keeps the form, the password and the token for a retry: it says nothing
 *  about the link. */
function feedbackFrom(
  outcome: SignedInOutcome,
  nowMs: number,
): RevertEmailFeedback {
  switch (outcome.kind) {
    case "email-reverted":
      return { kind: "reverted" };
    case "link-invalid":
      return { kind: "link-invalid" };
    case "invalid-input":
      return passwordRefusalFrom(outcome.issues);
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
    default:
      return { kind: "request-failed" };
  }
}

/** The classifier keeps only issues this flow can place, and the one field is the new password; the first is shown. */
function passwordRefusalFrom(
  issues: readonly AccountFieldIssue[],
): RevertEmailFeedback {
  const [issue] = issues;
  return issue === undefined
    ? { kind: "request-failed" }
    : { kind: "password-refused", issue };
}
