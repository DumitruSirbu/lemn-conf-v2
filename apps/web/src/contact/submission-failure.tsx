"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useContent } from "@/i18n/use-content";
import { CallShopLink } from "@/shop/call-shop-link";

import { failureScreenOf, type FailureScreen } from "./contact-answer";
import styles from "./contact.module.css";
import { useIsOnline } from "./retry-when-online";
import type { ContactSubmissionPhase } from "./use-contact-submission";

// Frame 5B: a state of the contact page, not a route, because it must keep what was typed and send it again. The
// frame's bar (*Cerere trimisă*) is not drawn, since it claims a send.

/**
 * The failure screen the page is on, given the one it was on and the phase now. A press made from 5B, or the automatic
 * retry, puts the phase to `sending` without leaving it: the screen stays, with its retry in its sending state. Any
 * other answer, or a press made from the form, leaves it.
 */
export function failureScreenAfter(
  shown: FailureScreen | undefined,
  phase: ContactSubmissionPhase,
): FailureScreen | undefined {
  switch (phase.kind) {
    case "sending":
      return shown;
    case "failed":
      return failureScreenOf(phase.outcome);
    case "idle":
    case "sent":
      return undefined;
  }
}

/** What the page knows of frame 5B: the screen it is on now, if any, and whether it has been on one, which tells a form
 *  drawn again after 5B from the first drawing of the form. */
interface FailureView {
  readonly screen: FailureScreen | undefined;
  readonly hasShownFailure: boolean;
}

const NO_FAILURE_YET: FailureView = {
  screen: undefined,
  hasShownFailure: false,
};

function failureViewAfter(
  view: FailureView,
  phase: ContactSubmissionPhase,
): FailureView {
  const screen = failureScreenAfter(view.screen, phase);
  const hasShownFailure = view.hasShownFailure || screen !== undefined;
  const isUnchanged =
    screen === view.screen && hasShownFailure === view.hasShownFailure;
  return isUnchanged ? view : { screen, hasShownFailure };
}

/** Which failure screen the page is on, kept across the `sending` phase a retry from it passes through. */
export function useFailureView(phase: ContactSubmissionPhase): FailureView {
  const [view, setView] = useState(() =>
    failureViewAfter(NO_FAILURE_YET, phase),
  );
  const now = failureViewAfter(view, phase);
  if (now !== view) setView(now);
  return now;
}

export interface SubmissionFailureProps {
  readonly screen: FailureScreen;
  /** A retry is out: the retry says so, and is off. */
  readonly isRetrying: boolean;
  /** Nothing can be sent now: a retry is out or an edit is unsaved. The retry says so and stays where it is. */
  readonly isRetryOff: boolean;
  /** What stays: the design and the details, or the details alone for a request with no design. */
  readonly keptSentence: string;
  /** The design's card, or nothing for a request with no design. */
  readonly keptCard: ReactNode;
  /** The one typed value the shop would have used, as the request carries it. */
  readonly contactValue: string;
  readonly onRetry: () => void;
}

export function SubmissionFailure({
  screen,
  isRetrying,
  isRetryOff,
  keptSentence,
  keptCard,
  contactValue,
  onRetry,
}: SubmissionFailureProps) {
  const isConnectionLost = screen === "lost-connection";
  return (
    <div
      className={styles.failure}
      data-testid="submission-failure"
      data-screen={screen}
    >
      <FailureHead screen={screen} keptSentence={keptSentence} />
      <div className={styles.failureActions}>
        <RetryButton
          isRetrying={isRetrying}
          isOff={isRetryOff}
          onRetry={onRetry}
        />
        <CallShopLink />
      </div>
      {isConnectionLost ? <AutomaticRetryNote /> : null}
      <KeptBox card={keptCard} contactValue={contactValue} />
      {isConnectionLost ? <WaitingForConnection /> : null}
    </div>
  );
}

/** The `!` disc, the `h1`, which takes focus when this screen replaces the form and keeps it through every answer on
 *  it, and the sentence for the class, which is a polite live region so that a changed sentence is read out. */
function FailureHead({
  screen,
  keptSentence,
}: {
  readonly screen: FailureScreen;
  readonly keptSentence: string;
}) {
  const content = useContent().submissionResult;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={styles.failureHead}>
      <span className={styles.failureDisc} aria-hidden="true" />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className={styles.failureHeading}
        data-testid="failure-heading"
      >
        {content.failureHeading}
      </h1>
      <p className={styles.failureText}>
        <span role="status" data-testid="failure-sentence">
          {screen === "lost-connection"
            ? content.failureLostConnection
            : content.failureNotSent}
        </span>{" "}
        <span data-testid="failure-kept-sentence">{keptSentence}</span>
      </p>
    </div>
  );
}

/** Sends the same request again, with the same id and body; off, it stays and says why by its label and
 *  `aria-disabled`, rather than going. In its sending state it is the one thing that shows a retry is out. */
function RetryButton({
  isRetrying,
  isOff,
  onRetry,
}: {
  readonly isRetrying: boolean;
  readonly isOff: boolean;
  readonly onRetry: () => void;
}) {
  const content = useContent().contact;
  return (
    <button
      type="button"
      className={styles.failureRetry}
      aria-disabled={isOff ? "true" : undefined}
      data-testid="contact-retry"
      onClick={() => {
        if (!isOff) onRetry();
      }}
    >
      {isRetrying ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : null}
      {isRetrying ? content.sending : content.retry}
    </button>
  );
}

function AutomaticRetryNote() {
  const content = useContent().submissionResult;
  return (
    <p className={styles.failureNote} data-testid="failure-automatic-retry">
      {content.retryAutomatically}
    </p>
  );
}

/** What was kept: the design as the form's card shows it, and the one typed value, so the customer sees that nothing
 *  has to be written again. */
function KeptBox({
  card,
  contactValue,
}: {
  readonly card: ReactNode;
  readonly contactValue: string;
}) {
  const content = useContent().submissionResult;
  const titleId = useId();
  return (
    <section
      className={styles.kept}
      aria-labelledby={titleId}
      data-testid="failure-kept"
    >
      <h2 id={titleId} className={styles.keptTitle}>
        {content.keptTitle}
      </h2>
      {card}
      <div className={styles.keptContact}>
        <span className={styles.keptContactLabel}>{content.keptContact}</span>
        <span
          className={styles.keptContactValue}
          data-testid="failure-contact-value"
        >
          {contactValue}
        </span>
      </div>
    </section>
  );
}

/** Present only while the browser says it is offline, when the retry is waiting on the connection's return. */
function WaitingForConnection() {
  const content = useContent().submissionResult;
  const isOnline = useIsOnline();
  if (isOnline) return null;
  return (
    <p
      className={styles.failureWaiting}
      role="status"
      data-testid="failure-waiting"
    >
      <span className={styles.waitingSpinner} aria-hidden="true" />
      {content.waitingForConnection}
    </p>
  );
}
