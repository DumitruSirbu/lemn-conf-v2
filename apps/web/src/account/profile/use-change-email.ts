import { judgeAccountEmail } from "@lemnaria/configurator-domain";
import { useCallback, useRef, useState } from "react";

import type { AccountFieldIssue, AccountRateLimitNotice } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import { rateLimitNoticeOf, type SignedInOutcome } from "../account-answer";
import type { FocusRequest } from "../account-focus";
import { loginPathWithReason } from "../login-arrival";
import { leaveFor } from "../on-signed-in";
import {
  sendSignedInRequest,
  type ChangeEmailBody,
} from "../send-account-request";

// What the change-address sheet remembers, and the one thing it does with it: asks the server to send a confirmation
// link to the new address (Lot 2 frames A10E to A10G and A10H). Both values live in memory here and nowhere else. The
// server answers alike for a free address, one that has an account and the account's own, so the only inputs to what the
// sheet shows are the answer's class, the fields it marks and the wait it states.

/** The two request members, named as the body and the server's refusals name them. */
export type ChangeEmailField = "newEmail" | "currentPassword";

const CHANGE_EMAIL_FIELDS: readonly ChangeEmailField[] = [
  "newEmail",
  "currentPassword",
];

export type ChangeEmailValues = Readonly<Record<ChangeEmailField, string>>;

const EMPTY_VALUES: ChangeEmailValues = { newEmail: "", currentPassword: "" };

/** What the last attempt left in the sheet. Only `sent` replaces the fields. */
export type ChangeEmailFeedback =
  | { readonly kind: "none" }
  | {
      readonly kind: "fields-refused";
      readonly issues: readonly AccountFieldIssue[];
    }
  /** The server's one word for a current password that is not the account's. Said beside that field. */
  | { readonly kind: "wrong-password" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the sheet redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "request-failed" }
  | { readonly kind: "sent" };

const NO_FEEDBACK: ChangeEmailFeedback = { kind: "none" };
const WRONG_PASSWORD_FEEDBACK: ChangeEmailFeedback = { kind: "wrong-password" };
const SENT_FEEDBACK: ChangeEmailFeedback = { kind: "sent" };

/** Where focus goes after an answer: the field to correct, or the notice that now heads the fields. */
export type ChangeEmailFocusTarget = ChangeEmailField | "notice";
export type ChangeEmailFocusRequest = FocusRequest<ChangeEmailFocusTarget>;

export interface ChangeEmail {
  readonly values: ChangeEmailValues;
  readonly feedback: ChangeEmailFeedback;
  readonly focusRequest: ChangeEmailFocusRequest | undefined;
  readonly isBusy: boolean;
  readonly editField: (field: ChangeEmailField, value: string) => void;
  readonly submit: () => void;
}

/** What a request for the change came to: a thing to draw, or the person being sent to sign in. */
type ChangeStep =
  | { readonly kind: "answered"; readonly feedback: ChangeEmailFeedback }
  | { readonly kind: "sign-in" };

export function useChangeEmail(locale: AppLocale): ChangeEmail {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [feedback, setFeedback] = useState(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<ChangeEmailFocusRequest>();
  const [isBusy, setIsBusy] = useState(false);
  const isSendingRef = useRef(false);

  const showAnswer = useCallback((answer: ChangeEmailFeedback) => {
    setFeedback(answer);
    setFocusRequest({ target: focusTargetOf(answer) });
  }, []);

  const editField = useCallback((field: ChangeEmailField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFeedback((current) => withoutRefusalOf(current, field));
  }, []);

  const submit = useCallback(() => {
    if (isSendingRef.current) return;
    const body = bodyOf(values);
    if (body.kind === "refused") {
      showAnswer({ kind: "fields-refused", issues: body.issues });
      return;
    }
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void sendChange(body.body).then((step) => {
      isSendingRef.current = false;
      setIsBusy(false);
      if (step.kind === "sign-in") {
        leaveFor(loginPathWithReason(locale, "session-expired"));
        return;
      }
      if (step.feedback.kind === "sent") setValues(EMPTY_VALUES);
      showAnswer(step.feedback);
    });
  }, [locale, showAnswer, values]);

  return { values, feedback, focusRequest, isBusy, editField, submit };
}

type JudgedBody =
  | { readonly kind: "ready"; readonly body: ChangeEmailBody }
  | { readonly kind: "refused"; readonly issues: AccountFieldIssue[] };

/** What the sheet can say without asking: an address that cannot be one, or no password. A refusal sends nothing. */
function bodyOf(values: ChangeEmailValues): JudgedBody {
  const issues: AccountFieldIssue[] = [];
  const address = judgeAccountEmail(values.newEmail);
  if (!address.ok) issues.push({ field: "newEmail", code: address.issue.code });
  if (values.currentPassword === "") {
    issues.push({ field: "currentPassword", code: "PASSWORD_REQUIRED" });
  }
  return address.ok && issues.length === 0
    ? {
        kind: "ready",
        body: {
          newEmail: address.email,
          currentPassword: values.currentPassword,
        },
      }
    : { kind: "refused", issues };
}

/** The first refused field takes focus, in the order the sheet draws them; every other answer takes the notice. */
function focusTargetOf(
  feedback: ChangeEmailFeedback,
): ChangeEmailFocusTarget | "nowhere" {
  switch (feedback.kind) {
    case "fields-refused":
      return firstRefusedFieldOf(feedback.issues) ?? "notice";
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

function firstRefusedFieldOf(
  issues: readonly AccountFieldIssue[],
): ChangeEmailField | undefined {
  return CHANGE_EMAIL_FIELDS.find((field) =>
    issues.some((issue) => issue.field === field),
  );
}

/** Editing a field takes back that field's refusal and leaves the other's standing. */
function withoutRefusalOf(
  feedback: ChangeEmailFeedback,
  field: ChangeEmailField,
): ChangeEmailFeedback {
  if (feedback.kind === "wrong-password") {
    return field === "currentPassword" ? NO_FEEDBACK : feedback;
  }
  if (feedback.kind !== "fields-refused") return feedback;
  const remaining = feedback.issues.filter((issue) => issue.field !== field);
  return remaining.length === 0
    ? NO_FEEDBACK
    : { kind: "fields-refused", issues: remaining };
}

async function sendChange(body: ChangeEmailBody): Promise<ChangeStep> {
  const outcome = await sendSignedInRequest({ flow: "email-change", body });
  return stepOf(outcome, Date.now());
}

/** Every outcome the sheet can be given. The request is the change request, so the classes it never answers with are,
 *  like any unlisted answer, a failed request, and a `403` is one too: the page that opened the sheet was gated on the
 *  same capability. A server error no word explains is told as a request that got no answer. */
function stepOf(outcome: SignedInOutcome, nowMs: number): ChangeStep {
  switch (outcome.kind) {
    case "check-inbox":
      return answered(SENT_FEEDBACK);
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
    default:
      return answered({ kind: "request-failed" });
  }
}

function answered(feedback: ChangeEmailFeedback): ChangeStep {
  return { kind: "answered", feedback };
}
