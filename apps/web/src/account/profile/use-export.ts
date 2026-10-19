"use client";

import { useCallback, useRef, useState } from "react";

import type { AccountRateLimitNotice } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import { rateLimitNoticeOf, type SignedInOutcome } from "../account-answer";
import type { FocusRequest } from "../account-focus";
import { loginPathWithReason } from "../login-arrival";
import { leaveFor } from "../on-signed-in";
import { sendExportRequest } from "../send-account-request";
import { saveFile } from "./save-file";

// What the export page remembers, and the one thing it does with it: asks for the account's data and hands the browser
// the file (Lot 2 frames A12A to A12E). The file is held only while it is handed over: no feedback carries it, and the
// page shows nothing of its content.

/** What the last attempt left on the page. `too-large` and `forbidden` replace the request, which cannot succeed. */
export type ExportFeedback =
  | { readonly kind: "none" }
  /** The file was handed to the browser. Pressing again asks the server again. */
  | { readonly kind: "downloaded" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "request-failed" }
  /** The account holds more than one file carries: final, since repeating the request cannot succeed. */
  | { readonly kind: "too-large" }
  /** A live session whose role may not export: the screen draws the 403 page in its place. */
  | { readonly kind: "forbidden" };

const NO_FEEDBACK: ExportFeedback = { kind: "none" };
const DOWNLOADED_FEEDBACK: ExportFeedback = { kind: "downloaded" };

/** Where focus goes after an answer: the notice that now heads the page. */
export type ExportFocusRequest = FocusRequest<"notice">;

export interface AccountExport {
  readonly feedback: ExportFeedback;
  readonly focusRequest: ExportFocusRequest | undefined;
  readonly isBusy: boolean;
  readonly download: () => void;
}

/** What a request for the file came to: a thing to draw, or the person being sent to sign in. */
type ExportStep =
  | { readonly kind: "answered"; readonly feedback: ExportFeedback }
  | { readonly kind: "sign-in" };

export function useExport(locale: AppLocale): AccountExport {
  const [feedback, setFeedback] = useState(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<ExportFocusRequest>();
  const [isBusy, setIsBusy] = useState(false);
  const isSendingRef = useRef(false);

  const showAnswer = useCallback((answer: ExportFeedback) => {
    setFeedback(answer);
    setFocusRequest({ target: isNoticeAnswer(answer) ? "notice" : "nowhere" });
  }, []);

  const download = useCallback(() => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void requestFile().then((step) => {
      isSendingRef.current = false;
      setIsBusy(false);
      if (step.kind === "sign-in") {
        leaveFor(loginPathWithReason(locale, "session-expired"));
        return;
      }
      showAnswer(step.feedback);
    });
  }, [locale, showAnswer]);

  return { feedback, focusRequest, isBusy, download };
}

/** A failure or a refusal takes focus, since it can replace the button the person pressed. A success leaves focus on
 *  the button, which stays. */
function isNoticeAnswer(feedback: ExportFeedback): boolean {
  switch (feedback.kind) {
    case "rate-limited":
    case "unavailable":
    case "unanswered":
    case "request-failed":
    case "too-large":
      return true;
    default:
      return false;
  }
}

async function requestFile(): Promise<ExportStep> {
  const answer = await sendExportRequest();
  if (answer.kind === "file") {
    saveFile(answer.blob, answer.fileName);
    return answered(DOWNLOADED_FEEDBACK);
  }
  return stepOf(answer.outcome, Date.now());
}

/** Every outcome the page can be given. A server error no word explains is told as a request that got no answer, which
 *  keeps the button for a retry; the classes the request never answers with are, like any unlisted answer, a failed
 *  request. */
function stepOf(outcome: SignedInOutcome, nowMs: number): ExportStep {
  switch (outcome.kind) {
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
    case "export-too-large":
      return answered({ kind: "too-large" });
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return answered({ kind: "forbidden" });
    default:
      return answered({ kind: "request-failed" });
  }
}

function answered(feedback: ExportFeedback): ExportStep {
  return { kind: "answered", feedback };
}
