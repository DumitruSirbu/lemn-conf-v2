import { useCallback, useRef, useState } from "react";

import type {
  AccountFieldIssue,
  AccountIssueField,
  AccountRateLimitNotice,
} from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import {
  countdownSecondsOf,
  rateLimitNoticeOf,
  type AccountOutcome,
} from "./account-answer";
import {
  judgeRegistration,
  type AcceptedRegistration,
} from "./judge-registration";
import { currentPrivacyNoticeVersion } from "./privacy-notice-version";
import { sendAccountRequest } from "./send-account-request";

// What the register page remembers, and the one thing it does with it: asks the server for an account. Every value
// lives in memory here and nowhere else. The page never learns whether an address was already registered: the
// accepted answer is one class, and the address it shows is the one the person typed.

/** What the last attempt left on the page. Only `check-inbox` and `request-failed` replace the form. Everything stays
 *  until the next submit, a refused challenge included: a widget that solves itself returns a token at once, and the
 *  message would be gone before it could be read. */
export type RegisterFeedback =
  | { readonly kind: "none" }
  | {
      readonly kind: "fields-refused";
      readonly issues: readonly AccountFieldIssue[];
    }
  | { readonly kind: "challenge-failed" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
      readonly countdownSeconds: number | undefined;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "check-inbox"; readonly address: string }
  | { readonly kind: "request-failed" };

const NO_FEEDBACK: RegisterFeedback = { kind: "none" };

/** Where focus goes after an answer: the one refused field, or the notice that now heads the form. */
export type RegisterFocusTarget = AccountIssueField | "notice" | "nowhere";

/** A new object for every answer, so the page moves focus once per answer and never while the person types. */
export interface FocusRequest {
  readonly target: RegisterFocusTarget;
}

export interface RegisterAccount {
  readonly email: string;
  readonly password: string;
  readonly phone: string;
  readonly feedback: RegisterFeedback;
  readonly focusRequest: FocusRequest | undefined;
  readonly isBusy: boolean;
  /** Whether a challenge token is held. The server refuses a request without one. */
  readonly hasToken: boolean;
  /** Whether the challenge slot says it cannot load: no token will come, and the page must not say one is awaited. */
  readonly isChallengeUnavailable: boolean;
  /** Bumped after every answer, because the server spends the token on nearly all of them. */
  readonly resetCount: number;
  readonly editField: (field: AccountIssueField, value: string) => void;
  readonly receiveToken: (token: string | null) => void;
  readonly markChallengeUnavailable: () => void;
  readonly submit: () => void;
  readonly clearFeedback: () => void;
  /** Back from "check your e-mail" to the form, with the address and the phone kept. */
  readonly editAgain: () => void;
}

export function useRegisterAccount(locale: AppLocale): RegisterAccount {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [token, setToken] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [isChallengeUnavailable, setIsChallengeUnavailable] = useState(false);
  const [feedback, setFeedback] = useState<RegisterFeedback>(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>();
  const isSendingRef = useRef(false);

  const showAnswer = useCallback((answer: RegisterFeedback) => {
    setFeedback(answer);
    setFocusRequest({ target: focusTargetOf(answer) });
  }, []);

  const editField = useCallback((field: AccountIssueField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFeedback((current) => withoutRefusalOf(current, field));
  }, []);

  const receiveToken = useCallback((newToken: string | null) => {
    setToken(newToken);
  }, []);

  const markChallengeUnavailable = useCallback(() => {
    setIsChallengeUnavailable(true);
  }, []);

  const submit = useCallback(() => {
    if (token === null || isSendingRef.current) return;
    const judgement = judgeRegistration(values, locale);
    if (judgement.kind === "refused") {
      showAnswer(refusalFeedbackOf(judgement.issues));
      return;
    }
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    setToken(null);
    void sendAndAnswer({
      registration: judgement.registration,
      password: values.password,
      locale,
      turnstileToken: token,
    }).then((answer) => {
      isSendingRef.current = false;
      setIsBusy(false);
      setResetCount((count) => count + 1);
      showAnswer(answer);
      if (isPasswordSpentBy(answer)) {
        setValues((current) => ({ ...current, password: "" }));
      }
    });
  }, [locale, showAnswer, token, values]);

  const clearFeedback = useCallback(() => {
    setFeedback(NO_FEEDBACK);
  }, []);

  // The form is gone while "check your e-mail" is shown, so its challenge slot starts over on the way back, and focus,
  // which fell with the button pressed, goes to the address the person came back to correct.
  const editAgain = useCallback(() => {
    setIsChallengeUnavailable(false);
    setFeedback(NO_FEEDBACK);
    setFocusRequest({ target: "email" });
  }, []);

  return {
    ...values,
    feedback,
    focusRequest,
    isBusy,
    hasToken: token !== null,
    isChallengeUnavailable,
    resetCount,
    editField,
    receiveToken,
    markChallengeUnavailable,
    submit,
    clearFeedback,
    editAgain,
  };
}

const EMPTY_VALUES = { email: "", password: "", phone: "" };

/** Several refused fields are summarised in a notice, which takes focus; one refused field takes it itself. A refused
 *  challenge is announced where it stands and leaves focus where it was. */
function focusTargetOf(feedback: RegisterFeedback): RegisterFocusTarget {
  switch (feedback.kind) {
    case "fields-refused":
      return refusedFieldOf(feedback.issues) ?? "notice";
    case "rate-limited":
    case "unavailable":
    case "unanswered":
      return "notice";
    default:
      return "nowhere";
  }
}

/** The field, when exactly one is refused. */
function refusedFieldOf(
  issues: readonly AccountFieldIssue[],
): AccountIssueField | undefined {
  const fields = new Set(issues.map((issue) => issue.field));
  const [only] = fields;
  return fields.size === 1 ? only : undefined;
}

function refusalFeedbackOf(
  issues: readonly AccountFieldIssue[],
): RegisterFeedback {
  return issues.length === 0
    ? { kind: "request-failed" }
    : { kind: "fields-refused", issues };
}

/** Editing a field takes back that field's refusal and leaves the others standing. */
function withoutRefusalOf(
  feedback: RegisterFeedback,
  field: AccountIssueField,
): RegisterFeedback {
  if (feedback.kind !== "fields-refused") return feedback;
  const remaining = feedback.issues.filter((issue) => issue.field !== field);
  return remaining.length === 0
    ? NO_FEEDBACK
    : { kind: "fields-refused", issues: remaining };
}

/** A password is not kept across the answers that end with it spent or that ask for the form again: a registration
 *  that was accepted, and a service that was not there to take it. A refusal, a limit and a lost connection keep it. */
function isPasswordSpentBy(feedback: RegisterFeedback): boolean {
  return feedback.kind === "check-inbox" || feedback.kind === "unavailable";
}

interface RegisterSending {
  readonly registration: AcceptedRegistration;
  readonly password: string;
  readonly locale: AppLocale;
  readonly turnstileToken: string;
}

async function sendAndAnswer({
  registration,
  password,
  locale,
  turnstileToken,
}: RegisterSending): Promise<RegisterFeedback> {
  const outcome = await sendAccountRequest({
    flow: "register",
    body: {
      email: registration.email,
      password,
      ...(registration.phone === undefined
        ? {}
        : { phone: registration.phone }),
      locale,
      privacyNoticeVersion: currentPrivacyNoticeVersion(),
      turnstileToken,
    },
  });
  return feedbackFrom(outcome, registration.email, Date.now());
}

/** Every outcome the page can be given. The request is the registration, so the classes it never answers with (a
 *  session, a changed password, a refused login or link) are, like any unlisted answer, a failed request. */
function feedbackFrom(
  outcome: AccountOutcome,
  address: string,
  nowMs: number,
): RegisterFeedback {
  switch (outcome.kind) {
    case "check-inbox":
      return { kind: "check-inbox", address };
    case "invalid-input":
      return { kind: "fields-refused", issues: outcome.issues };
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
    case "platform-failed":
    case "signed-in":
    case "password-changed":
    case "invalid-credentials":
    case "link-invalid":
      return { kind: "request-failed" };
  }
}
