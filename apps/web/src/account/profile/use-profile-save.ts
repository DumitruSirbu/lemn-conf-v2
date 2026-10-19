"use client";

import { useCallback, useRef, useState } from "react";

import type { AccountFieldIssue, AccountRateLimitNotice } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import {
  countdownSecondsOf,
  rateLimitNoticeOf,
  type SignedInOutcome,
} from "../account-answer";
import type { FocusRequest } from "../account-focus";
import { loginPathWithReason } from "../login-arrival";
import { leaveFor } from "../on-signed-in";
import { sendSignedInRequest, type ProfileBody } from "../send-account-request";
import {
  changesBetween,
  PROFILE_FIELDS,
  trimmedValuesOf,
  type ProfileField,
  type ProfileValues,
} from "./profile-values";

// What the profile page remembers, and the one thing it does with it: saves the details that changed (Lot 2 frames A10A
// to A10D and A10H). Every value lives in memory here. What the server holds is kept beside what the person has typed,
// so a save sends only the difference, and "Salvat" stays true until the next edit. Both are held trimmed, as the server
// keeps them, and a save with nothing different sends no request and says so rather than "Salvat".

/** What the last attempt left on the page. Everything but `forbidden` stays until the next edit or save. */
export type ProfileFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "saved" }
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "fields-refused";
      readonly issues: readonly AccountFieldIssue[];
    }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
      readonly countdownSeconds: number | undefined;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "request-failed" }
  /** A live session whose role may not keep these details: the screen draws the 403 page in place of the form. */
  | { readonly kind: "forbidden" };

const NO_FEEDBACK: ProfileFeedback = { kind: "none" };
const SAVED_FEEDBACK: ProfileFeedback = { kind: "saved" };
const UNCHANGED_FEEDBACK: ProfileFeedback = { kind: "unchanged" };

/** Where focus goes after an answer: the one refused field, or the notice that now heads the form. */
export type ProfileFocusTarget = ProfileField | "notice";
export type ProfileFocusRequest = FocusRequest<ProfileFocusTarget>;

export interface ProfileSave {
  readonly values: ProfileValues;
  readonly feedback: ProfileFeedback;
  readonly focusRequest: ProfileFocusRequest | undefined;
  readonly isBusy: boolean;
  readonly editField: (field: ProfileField, value: string) => void;
  readonly submit: () => void;
  readonly clearFeedback: () => void;
}

/** What a request for the save came to: a thing to draw, or the person being sent to sign in. */
type SaveStep =
  | { readonly kind: "answered"; readonly feedback: ProfileFeedback }
  | { readonly kind: "sign-in" };

export function useProfileSave(
  stored: ProfileValues,
  locale: AppLocale,
): ProfileSave {
  const [savedValues, setSavedValues] = useState(() => trimmedValuesOf(stored));
  const [values, setValues] = useState(() => trimmedValuesOf(stored));
  const [feedback, setFeedback] = useState(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<ProfileFocusRequest>();
  const [isBusy, setIsBusy] = useState(false);
  const isSendingRef = useRef(false);

  const showAnswer = useCallback((answer: ProfileFeedback) => {
    setFeedback(answer);
    setFocusRequest({ target: focusTargetOf(answer) });
  }, []);

  const editField = useCallback((field: ProfileField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFeedback((current) => withoutRefusalOf(current, field));
  }, []);

  const submit = useCallback(() => {
    if (isSendingRef.current) return;
    const trimmed = trimmedValuesOf(values);
    const changes = changesBetween(savedValues, trimmed);
    setValues(trimmed);
    if (!hasChanges(changes)) {
      showAnswer(UNCHANGED_FEEDBACK);
      return;
    }
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void sendChanges(changes).then((step) => {
      isSendingRef.current = false;
      setIsBusy(false);
      if (step.kind === "sign-in") {
        leaveFor(loginPathWithReason(locale, "session-expired"));
        return;
      }
      if (step.feedback.kind === "saved") {
        setSavedValues((current) => ({ ...current, ...changes }));
      }
      showAnswer(step.feedback);
    });
  }, [locale, savedValues, showAnswer, values]);

  const clearFeedback = useCallback(() => {
    setFeedback(NO_FEEDBACK);
  }, []);

  return {
    values,
    feedback,
    focusRequest,
    isBusy,
    editField,
    submit,
    clearFeedback,
  };
}

function hasChanges(changes: ProfileBody): boolean {
  return Object.keys(changes).length > 0;
}

/** A single refused field takes focus itself; several are summarised in a notice, which takes it. A saved line is
 *  announced where it stands and leaves focus where it was. */
function focusTargetOf(
  feedback: ProfileFeedback,
): ProfileFocusTarget | "nowhere" {
  switch (feedback.kind) {
    case "fields-refused":
      return refusedFieldOf(feedback.issues) ?? "notice";
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
): ProfileField | undefined {
  const fields = new Set(issues.map((issue) => issue.field));
  const [only] = fields;
  return fields.size === 1 && only !== undefined && isProfileField(only)
    ? only
    : undefined;
}

function isProfileField(field: string): field is ProfileField {
  return PROFILE_FIELDS.some((profileField) => profileField === field);
}

/** Editing a field takes back that field's refusal and leaves the others standing; any edit makes "Salvat" and
 *  "Nimic de salvat" stale. */
function withoutRefusalOf(
  feedback: ProfileFeedback,
  field: ProfileField,
): ProfileFeedback {
  if (feedback.kind === "saved" || feedback.kind === "unchanged") {
    return NO_FEEDBACK;
  }
  if (feedback.kind !== "fields-refused") return feedback;
  const remaining = feedback.issues.filter((issue) => issue.field !== field);
  return remaining.length === 0
    ? NO_FEEDBACK
    : { kind: "fields-refused", issues: remaining };
}

async function sendChanges(changes: ProfileBody): Promise<SaveStep> {
  const outcome = await sendSignedInRequest({ flow: "profile", body: changes });
  return stepOf(outcome, Date.now());
}

/** Every outcome the page can be given. The request is the profile save, so the classes it never answers with (a
 *  kitchen's, a password's, a link's) are, like any unlisted answer, a failed request. */
function stepOf(outcome: SignedInOutcome, nowMs: number): SaveStep {
  switch (outcome.kind) {
    case "saved":
      return answered(SAVED_FEEDBACK);
    case "invalid-input":
      return answered({ kind: "fields-refused", issues: outcome.issues });
    case "rate-limited":
      return answered({
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, nowMs),
        countdownSeconds: countdownSecondsOf(outcome.wait),
      });
    case "unavailable":
      return answered({ kind: "unavailable" });
    case "unanswered":
      return answered({ kind: "unanswered" });
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return answered({ kind: "forbidden" });
    default:
      return answered({ kind: "request-failed" });
  }
}

function answered(feedback: ProfileFeedback): SaveStep {
  return { kind: "answered", feedback };
}
