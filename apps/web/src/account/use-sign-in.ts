import { judgeAccountEmail } from "@lemnaria/configurator-domain";
import { useCallback, useRef, useState } from "react";

import type {
  AccountFieldIssue,
  AccountIssueField,
  AccountRateLimitNotice,
} from "@/i18n/content";

import {
  countdownSecondsOf,
  rateLimitNoticeOf,
  type AccountOutcome,
} from "./account-answer";
import { onSignedIn, type AskToClaim, type Destination } from "./on-signed-in";
import { sendAccountRequest } from "./send-account-request";

// What the login page remembers, and the one thing it does with it: asks the server to sign the person in. Both values
// live in memory here and nowhere else. The page never learns which of its two values was wrong: a refused sign-in is
// one class, and the only inputs to what it shows are that class, the fields it marks and the wait it states.

/** The two things a person types on this page. */
export type LoginField = Extract<AccountIssueField, "email" | "password">;

/** What the last attempt left on the page. Only `request-failed` replaces the form. Everything stays until the next
 *  submit, a refused challenge included: a widget that solves itself returns a token at once, and the message would be
 *  gone before it could be read. A sign-in that succeeded leaves nothing: the page is on its way out. */
export type LoginFeedback =
  | { readonly kind: "none" }
  | {
      readonly kind: "fields-refused";
      readonly issues: readonly AccountFieldIssue[];
    }
  | { readonly kind: "invalid-credentials" }
  | { readonly kind: "challenge-failed" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
      readonly countdownSeconds: number | undefined;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "request-failed" };

/** What an answer to the sign-in request comes to: the page's feedback, or the sign-in itself. */
type SignInAnswer =
  | LoginFeedback
  | { readonly kind: "signed-in"; readonly claimable: number };

const NO_FEEDBACK: LoginFeedback = { kind: "none" };

/** Where focus goes after an answer: the field to correct or retype, or the notice that now heads the form. */
export type LoginFocusTarget = LoginField | "notice" | "nowhere";

/** A new object for every answer, so the page moves focus once per answer and never while the person types. */
export interface FocusRequest {
  readonly target: LoginFocusTarget;
}

export interface SignIn {
  readonly email: string;
  readonly password: string;
  readonly feedback: LoginFeedback;
  readonly focusRequest: FocusRequest | undefined;
  readonly isBusy: boolean;
  /** Whether the person has pressed the button once; what the page said on arrival is said only until they have. */
  readonly hasSubmitted: boolean;
  /** Whether a challenge token is held. The server refuses a request without one. */
  readonly hasToken: boolean;
  /** Whether the challenge slot says it cannot load: no token will come, and the page must not say one is awaited. */
  readonly isChallengeUnavailable: boolean;
  /** Bumped after every answer, because the server spends the token on nearly all of them. */
  readonly resetCount: number;
  readonly editField: (field: LoginField, value: string) => void;
  readonly receiveToken: (token: string | null) => void;
  readonly markChallengeUnavailable: () => void;
  readonly submit: () => void;
  readonly clearFeedback: () => void;
}

const EMPTY_VALUES = { email: "", password: "" };

/** `askToClaim` is how the page draws the claim dialog, when the sign-in found designs the account could claim.
 *  `destination` is where a finished sign-in goes. */
export function useSignIn(
  destination: Destination,
  askToClaim: AskToClaim,
): SignIn {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [token, setToken] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isChallengeUnavailable, setIsChallengeUnavailable] = useState(false);
  const [feedback, setFeedback] = useState<LoginFeedback>(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>();
  const isSendingRef = useRef(false);

  const showAnswer = useCallback((answer: LoginFeedback) => {
    setFeedback(answer);
    setFocusRequest({ target: focusTargetOf(answer) });
  }, []);

  const editField = useCallback((field: LoginField, value: string) => {
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
    setHasSubmitted(true);
    const judgement = judgeSignIn(values);
    if (judgement.kind === "refused") {
      showAnswer({ kind: "fields-refused", issues: judgement.issues });
      return;
    }
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    setToken(null);
    void sendAndAnswer({
      email: judgement.email,
      password: values.password,
      turnstileToken: token,
    }).then((answer) => {
      if (answer.kind === "signed-in") {
        // The page is on its way out, or asks about the designs to claim before it goes: either way the form stays busy
        // and the guard stays shut until the document is replaced, and the challenge is not reset because no widget is
        // drawn again.
        setValues((current) => ({ ...current, password: "" }));
        onSignedIn({ ...destination, claimable: answer.claimable }, askToClaim);
        return;
      }
      isSendingRef.current = false;
      setIsBusy(false);
      setResetCount((count) => count + 1);
      showAnswer(answer);
      if (isPasswordSpentBy(answer)) {
        setValues((current) => ({ ...current, password: "" }));
      }
    });
  }, [askToClaim, destination, showAnswer, token, values]);

  const clearFeedback = useCallback(() => {
    setFeedback(NO_FEEDBACK);
  }, []);

  return {
    ...values,
    feedback,
    focusRequest,
    isBusy,
    hasSubmitted,
    hasToken: token !== null,
    isChallengeUnavailable,
    resetCount,
    editField,
    receiveToken,
    markChallengeUnavailable,
    submit,
    clearFeedback,
  };
}

type SignInJudgement =
  | { readonly kind: "accepted"; readonly email: string }
  | { readonly kind: "refused"; readonly issues: readonly AccountFieldIssue[] };

/**
 * What the form checks before it sends: the address by the domain's rule, and that a password was typed. The password
 * is not judged by the password policy, as the server does not: one the policy would refuse is a wrong password and is
 * answered like any other, so a field error here would be a second answer that tells the two apart.
 */
function judgeSignIn(values: typeof EMPTY_VALUES): SignInJudgement {
  const address = judgeAccountEmail(values.email);
  const issues: AccountFieldIssue[] = [
    ...(address.ok
      ? []
      : [{ field: "email", code: address.issue.code } as const]),
    ...(values.password === ""
      ? [{ field: "password", code: "PASSWORD_REQUIRED" } as const]
      : []),
  ];
  return address.ok && issues.length === 0
    ? { kind: "accepted", email: address.email }
    : { kind: "refused", issues };
}

/** Several refused fields are summarised in a notice, which takes focus; one refused field takes it itself. A refused
 *  challenge is announced where it stands and leaves focus where it was. A refused sign-in sends the person back to
 *  the password, which was emptied. */
function focusTargetOf(feedback: LoginFeedback): LoginFocusTarget {
  switch (feedback.kind) {
    case "fields-refused":
      return refusedFieldOf(feedback.issues) ?? "notice";
    case "invalid-credentials":
      return "password";
    case "rate-limited":
    case "unavailable":
    case "unanswered":
      return "notice";
    default:
      return "nowhere";
  }
}

/** The field, when exactly one is refused and it is one this page has. */
function refusedFieldOf(
  issues: readonly AccountFieldIssue[],
): LoginField | undefined {
  const fields = new Set(issues.map((issue) => issue.field));
  const [only] = fields;
  return fields.size === 1 && (only === "email" || only === "password")
    ? only
    : undefined;
}

/** Editing a field takes back that field's refusal and leaves the others standing. */
function withoutRefusalOf(
  feedback: LoginFeedback,
  field: LoginField,
): LoginFeedback {
  if (feedback.kind !== "fields-refused") return feedback;
  const remaining = feedback.issues.filter((issue) => issue.field !== field);
  return remaining.length === 0
    ? NO_FEEDBACK
    : { kind: "fields-refused", issues: remaining };
}

/** A password is not kept across the answers that ask it to be typed again: a refused sign-in, and a service that was
 *  not there to take it. A refused challenge, a limit and a lost connection keep it. */
function isPasswordSpentBy(feedback: LoginFeedback): boolean {
  return (
    feedback.kind === "invalid-credentials" || feedback.kind === "unavailable"
  );
}

interface SignInSending {
  readonly email: string;
  readonly password: string;
  readonly turnstileToken: string;
}

async function sendAndAnswer(sending: SignInSending): Promise<SignInAnswer> {
  const outcome = await sendAccountRequest({ flow: "login", body: sending });
  return feedbackFrom(outcome, Date.now());
}

/** Every outcome the page can be given. The request is the sign-in, so the classes it never answers with (a registered
 *  address, a changed password, a refused link) are, like any unlisted answer, a failed request. */
function feedbackFrom(outcome: AccountOutcome, nowMs: number): SignInAnswer {
  switch (outcome.kind) {
    case "signed-in":
      return { kind: "signed-in", claimable: outcome.claimable };
    case "invalid-input":
      return { kind: "fields-refused", issues: outcome.issues };
    case "invalid-credentials":
      return { kind: "invalid-credentials" };
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
    case "check-inbox":
    case "password-changed":
    case "link-invalid":
      return { kind: "request-failed" };
  }
}
