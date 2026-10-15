"use client";

import { useEffect, useState, type ReactNode } from "react";

import { clockTimeOf, isToldOnALaterDay } from "@/i18n/clock-time";
import type { ContactOutcomeNotice } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";

import type {
  ContactFormErrors,
  ContactFormValues,
} from "./contact-form-model";
import styles from "./contact.module.css";
import { isFinalOutcome } from "./send-contact-request";
import { failureScreenOf } from "./contact-answer";
import type {
  ContactSubmission,
  ContactSubmissionPhase,
  UnsentOutcome,
} from "./use-contact-submission";

// What the screen says, beside the form, of an answer that was not a send: one sentence for its class, and what the
// class offers. The sentences are the catalogue's, found by class and never by a code; this file holds no wording. The
// two classes that have a screen of their own (`unanswered` and `failed`, frame 5B) are not told here.

/** The classes whose sentence stands beside the form: every unsent one but the two that leave the form for 5B. */
type OutcomeBesideForm = Exclude<
  UnsentOutcome,
  { readonly kind: "failed" | "unanswered" }
>;

export interface PhaseBesideForm {
  readonly outcome: OutcomeBesideForm;
  readonly waitsUntilMs: number | undefined;
}

const MILLISECONDS_PER_SECOND = 1000;

/** The answer to tell beside the form, if there is one: not one 5B tells, and not a limited one whose wait has passed. */
export function outcomeToShow(
  phase: ContactSubmissionPhase,
  isLimitWaiting: boolean,
): PhaseBesideForm | undefined {
  if (phase.kind !== "failed") return undefined;
  const { outcome, waitsUntilMs } = phase;
  if (!isBesideForm(outcome)) return undefined;
  if (outcome.kind === "limited" && !isLimitWaiting) return undefined;
  return { outcome, waitsUntilMs };
}

function isBesideForm(outcome: UnsentOutcome): outcome is OutcomeBesideForm {
  return failureScreenOf(outcome) === undefined;
}

/**
 * Whether a limited send's wait is still running. The hook ignores a press until the time it was told, and uses no
 * timer; this is the one timer, so that the sentence goes and the button comes on when the time comes. Cleared when the
 * answer changes or the screen goes.
 */
export function useIsWaitingForTheLimit(
  phase: ContactSubmissionPhase,
): boolean {
  const waitsUntilMs = phase.kind === "failed" ? phase.waitsUntilMs : undefined;
  const [passedMs, setPassedMs] = useState<number | undefined>();
  useEffect(() => {
    if (waitsUntilMs === undefined) return;
    const remainingMs = Math.max(0, waitsUntilMs - Date.now());
    const timer = setTimeout(() => {
      setPassedMs(waitsUntilMs);
    }, remainingMs);
    return () => {
      clearTimeout(timer);
    };
  }, [waitsUntilMs]);
  return waitsUntilMs !== undefined && passedMs !== waitsUntilMs;
}

/**
 * The fields the server refused, placed beside them, for as long as each field holds what was sent: the answer was
 * about that text, and an edit makes it stale. Read from the values at the render the answer arrived in; the inputs
 * are inert while a request is out, so they are the values that were sent.
 */
export function useIssuesBesideFields(
  phase: ContactSubmissionPhase,
  values: ContactFormValues,
): ContactFormErrors {
  const [answered, setAnswered] = useState({ phase, values });
  if (answered.phase !== phase) setAnswered({ phase, values });
  if (phase.kind !== "failed" || phase.outcome.kind !== "refused") return {};
  return Object.fromEntries(
    phase.outcome.issues
      .filter(({ field }) => values[field] === answered.values[field])
      .map(({ field, code }) => [field, code]),
  );
}

/** Nothing is sent from the button while a request is out, an edit is unsaved, the answer was final, or a limit is
 *  being waited out. */
export function isSendOff(
  submission: ContactSubmission,
  isLimitWaiting: boolean,
): boolean {
  const { phase, saveWait } = submission;
  return (
    saveWait.kind === "waiting" ||
    phase.kind === "sending" ||
    (phase.kind === "failed" && isFinalOutcome(phase.outcome)) ||
    isLimitWaiting
  );
}

export interface ContactOutcomeProps {
  readonly phase: PhaseBesideForm;
  readonly id: string;
  /** The way to the review that fetches it, for the answers that send the customer there. */
  readonly reviewLink: ReactNode;
}

export function ContactOutcome({ phase, id, reviewLink }: ContactOutcomeProps) {
  const content = useContent();
  return (
    <div
      className={styles.outcome}
      data-testid="contact-outcome"
      data-outcome={phase.outcome.kind}
    >
      <p id={id} className={styles.refusal} role="alert">
        {content.contactOutcome(noticeOf(phase))}
      </p>
      {actionFor(phase.outcome.kind, reviewLink)}
    </div>
  );
}

function noticeOf({
  outcome,
  waitsUntilMs,
}: PhaseBesideForm): ContactOutcomeNotice {
  if (outcome.kind !== "limited") return { kind: outcome.kind };
  const nowMs = Date.now();
  const waitsUntil =
    waitsUntilMs ?? nowMs + outcome.waitSeconds * MILLISECONDS_PER_SECOND;
  return {
    kind: "limited",
    time: clockTimeOf(waitsUntil),
    isTomorrow: isToldOnALaterDay(waitsUntil, nowMs),
  };
}

function actionFor(
  kind: PhaseBesideForm["outcome"]["kind"],
  reviewLink: ReactNode,
): ReactNode {
  switch (kind) {
    case "design-not-current":
    case "does-not-fit":
      return reviewLink;
    case "refused":
    case "conflict":
    case "limited":
      return null;
  }
}
