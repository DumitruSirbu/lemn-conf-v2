"use client";

import { judgePassword } from "@lemnaria/configurator-domain";
import { useCallback, useRef, useState } from "react";

import type { AccountFieldIssue, AccountRateLimitNotice } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import { rateLimitNoticeOf, type SignedInOutcome } from "../account-answer";
import type { FocusRequest } from "../account-focus";
import { loginPathWithReason, type LoginArrival } from "../login-arrival";
import { leaveFor } from "../on-signed-in";
import {
  sendSignedInRequest,
  type ChangePasswordBody,
} from "../send-account-request";

// What the password-change page remembers, and the one thing it does with it: sends the current password and the new
// one (Lot 2 frames A11A to A11G). Both live in memory here and nowhere else. A success replaces the form, so both are
// emptied by it; every other answer keeps what was typed, since the person has only to mend or retry.

/** The two request members, named as the body and the server's refusals name them (plan P13). */
export type ChangePasswordField = "currentPassword" | "newPassword";

const CHANGE_PASSWORD_FIELDS: readonly ChangePasswordField[] = [
  "currentPassword",
  "newPassword",
];

export type PasswordValues = Readonly<Record<ChangePasswordField, string>>;

const EMPTY_VALUES: PasswordValues = { currentPassword: "", newPassword: "" };

/** What the last attempt left on the page. `changed` and `changed-sign-in` replace the form, and so does `forbidden`. */
export type ChangePasswordFeedback =
  | { readonly kind: "none" }
  | {
      readonly kind: "fields-refused";
      readonly issues: readonly AccountFieldIssue[];
    }
  /** The server's one word for a current password that is not the account's. Said beside the current password. */
  | { readonly kind: "wrong-password" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "request-failed" }
  /** Changed, and this device holds the replacing session. */
  | { readonly kind: "changed" }
  /** Changed, but the replacing session could not be started: the server cleared the cookie and the person signs in. */
  | { readonly kind: "changed-sign-in" }
  /** A live session whose role may not change its password: the screen draws the 403 page in place of the form. */
  | { readonly kind: "forbidden" };

const NO_FEEDBACK: ChangePasswordFeedback = { kind: "none" };
const WRONG_PASSWORD_FEEDBACK: ChangePasswordFeedback = {
  kind: "wrong-password",
};
const CHANGED_FEEDBACK: ChangePasswordFeedback = { kind: "changed" };
const CHANGED_SIGN_IN_FEEDBACK: ChangePasswordFeedback = {
  kind: "changed-sign-in",
};

/** Where focus goes after an answer: the one field to correct, or the notice that now heads the form. */
export type ChangePasswordFocusTarget = ChangePasswordField | "notice";
export type ChangePasswordFocusRequest =
  FocusRequest<ChangePasswordFocusTarget>;

export interface ChangePassword {
  readonly values: PasswordValues;
  readonly feedback: ChangePasswordFeedback;
  readonly focusRequest: ChangePasswordFocusRequest | undefined;
  readonly isBusy: boolean;
  readonly editField: (field: ChangePasswordField, value: string) => void;
  readonly submit: () => void;
}

/** What a request for the change came to: a thing to draw, or the person being sent to sign in. */
type ChangeStep =
  | { readonly kind: "answered"; readonly feedback: ChangePasswordFeedback }
  | { readonly kind: "sign-in" };

export function useChangePassword(locale: AppLocale): ChangePassword {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [feedback, setFeedback] = useState(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] =
    useState<ChangePasswordFocusRequest>();
  const [isBusy, setIsBusy] = useState(false);
  const isSendingRef = useRef(false);
  const mayHaveChangedRef = useRef(false);

  const showAnswer = useCallback((answer: ChangePasswordFeedback) => {
    setFeedback(answer);
    setFocusRequest({ target: focusTargetOf(answer) });
  }, []);

  const editField = useCallback((field: ChangePasswordField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFeedback((current) => withoutRefusalOf(current, field));
  }, []);

  const submit = useCallback(() => {
    if (isSendingRef.current) return;
    const refusals = localRefusalsOf(values);
    if (refusals.length > 0) {
      showAnswer({ kind: "fields-refused", issues: refusals });
      return;
    }
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void sendChange(values).then((step) => {
      isSendingRef.current = false;
      setIsBusy(false);
      if (step.kind === "sign-in") {
        leaveFor(
          loginPathWithReason(
            locale,
            arrivalAfterSignIn(mayHaveChangedRef.current),
          ),
        );
        return;
      }
      mayHaveChangedRef.current = mayHaveChangedAfter(
        mayHaveChangedRef.current,
        step.feedback,
      );
      if (isPasswordSpentBy(step.feedback)) setValues(EMPTY_VALUES);
      showAnswer(step.feedback);
    });
  }, [locale, showAnswer, values]);

  return {
    values,
    feedback,
    focusRequest,
    isBusy,
    editField,
    submit,
  };
}

/**
 * What the form can say without asking: nothing typed, or a new password of a length the rule can never accept. The
 * current password is not judged by length: the server treats one outside the bounds as a wrong password, since no
 * hash can match it. The address is not known here, so a new password is never refused locally for being it. A refusal
 * sends nothing.
 */
function localRefusalsOf(values: PasswordValues): AccountFieldIssue[] {
  const refusals: AccountFieldIssue[] = [];
  if (values.currentPassword === "") {
    refusals.push({ field: "currentPassword", code: "PASSWORD_REQUIRED" });
  }
  const newPasswordRefusal = newPasswordRefusalOf(values.newPassword);
  if (newPasswordRefusal !== undefined) refusals.push(newPasswordRefusal);
  return refusals;
}

function newPasswordRefusalOf(
  newPassword: string,
): AccountFieldIssue | undefined {
  if (newPassword === "") {
    return { field: "newPassword", code: "PASSWORD_REQUIRED" };
  }
  const judgement = judgePassword({ password: newPassword, email: "" });
  if (judgement.ok || judgement.code === "PASSWORD_IS_EMAIL") return undefined;
  return { field: "newPassword", code: judgement.code };
}

/** A single refused field takes focus itself; both are summarised in a notice, which takes it. A wrong current
 *  password sends the person back to it. */
function focusTargetOf(
  feedback: ChangePasswordFeedback,
): ChangePasswordFocusTarget | "nowhere" {
  switch (feedback.kind) {
    case "fields-refused":
      return refusedFieldOf(feedback.issues) ?? "notice";
    case "wrong-password":
      return "currentPassword";
    case "rate-limited":
    case "unavailable":
    case "unanswered":
    case "request-failed":
      return "notice";
    default:
      return "nowhere";
  }
}

/** The field, when exactly one is refused. */
function refusedFieldOf(
  issues: readonly AccountFieldIssue[],
): ChangePasswordField | undefined {
  const fields = new Set(issues.map((issue) => issue.field));
  const [only] = fields;
  return fields.size === 1 && only !== undefined && isChangePasswordField(only)
    ? only
    : undefined;
}

function isChangePasswordField(field: string): field is ChangePasswordField {
  return CHANGE_PASSWORD_FIELDS.some(
    (changePasswordField) => changePasswordField === field,
  );
}

/** Editing a field takes back that field's refusal and leaves the other's standing. */
function withoutRefusalOf(
  feedback: ChangePasswordFeedback,
  field: ChangePasswordField,
): ChangePasswordFeedback {
  if (feedback.kind === "wrong-password") {
    return field === "currentPassword" ? NO_FEEDBACK : feedback;
  }
  if (feedback.kind !== "fields-refused") return feedback;
  const remaining = feedback.issues.filter((issue) => issue.field !== field);
  return remaining.length === 0
    ? NO_FEEDBACK
    : { kind: "fields-refused", issues: remaining };
}

/** A request that got no answer may have been carried out, which ended the session it was sent with. Only an answer
 *  from a live session says it was not; one that proves nothing (a service outage) leaves the doubt where it was. */
function mayHaveChangedAfter(
  wasInDoubt: boolean,
  feedback: ChangePasswordFeedback,
): boolean {
  if (feedback.kind === "unanswered") return true;
  return wasInDoubt && !isAnsweredByLiveSession(feedback);
}

function isAnsweredByLiveSession(feedback: ChangePasswordFeedback): boolean {
  switch (feedback.kind) {
    case "fields-refused":
    case "wrong-password":
    case "rate-limited":
    case "changed":
    case "changed-sign-in":
    case "forbidden":
      return true;
    default:
      return false;
  }
}

/** A refused session after a doubtful request is not told as an expired one: the person may have changed the password
 *  themselves, and the neutral note tells them which one to use. */
function arrivalAfterSignIn(mayHaveChanged: boolean): LoginArrival {
  return mayHaveChanged ? "password-maybe-changed" : "session-expired";
}

/** Neither password is kept once the change is made: the form is gone and nothing should hold them. */
function isPasswordSpentBy(feedback: ChangePasswordFeedback): boolean {
  return feedback.kind === "changed" || feedback.kind === "changed-sign-in";
}

async function sendChange(body: ChangePasswordBody): Promise<ChangeStep> {
  const outcome = await sendSignedInRequest({ flow: "password", body });
  return stepOf(outcome, Date.now());
}

/** Every outcome the page can be given. The request is the change, so the classes it never answers with (a kitchen's,
 *  a link's) are, like any unlisted answer, a failed request. A server error no word explains is told as a request that
 *  got no answer, which keeps the form and what was typed for a retry; a retry after a change that was in fact made
 *  carries a session the change ended, so it is answered `401 unauthenticated` and the person is sent to sign in. */
function stepOf(outcome: SignedInOutcome, nowMs: number): ChangeStep {
  switch (outcome.kind) {
    case "password-changed":
      return answered(CHANGED_FEEDBACK);
    case "password-changed-sign-in":
      return answered(CHANGED_SIGN_IN_FEEDBACK);
    case "wrong-password":
      return answered(WRONG_PASSWORD_FEEDBACK);
    case "invalid-input":
      return answered({ kind: "fields-refused", issues: outcome.issues });
    case "rate-limited":
      return answered({
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, nowMs),
      });
    case "unavailable":
      return answered({ kind: "unavailable" });
    case "unanswered":
    case "platform-failed":
      return answered({ kind: "unanswered" });
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return answered({ kind: "forbidden" });
    default:
      return answered({ kind: "request-failed" });
  }
}

function answered(feedback: ChangePasswordFeedback): ChangeStep {
  return { kind: "answered", feedback };
}
