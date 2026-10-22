"use client";

import { useCallback, useRef, useState } from "react";

import {
  rateLimitNoticeOf,
  type SignedInOutcome,
} from "@/account/account-answer";
import { fullWaitOfFeedback } from "@/account/account-form-parts";
import type { AccountRateLimitNotice } from "@/i18n/content";

import type { StaffKitchenReading } from "./use-staff-kitchen";

// What the three staff writes (a note, a status, an unhide) have in common: one request at a time, a `429` that holds the
// button for its whole wait, and the classes of answer that are not the write's own. Nothing here sends a request.

/** How a write changes the page's kitchen, or reads it again behind the page. */
export type KitchenEditing = Pick<StaffKitchenReading, "edit" | "refresh">;

/** Why a write was not done, in the classes every write shares. The words are told by the screen. */
export type WriteFailure =
  /** The service was not there, the request got no answer, or the answer was not one of the route's. */
  | { readonly kind: "failed" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  /** A live session that holds no right to this write. */
  | { readonly kind: "forbidden" }
  /** The one `404`: the kitchen is gone or is not one staff may open. */
  | { readonly kind: "kitchen-unavailable" };

/** The shared classes of an answer that is not the write's own success, conflict or refusal of its input. */
export function writeFailureOf(outcome: SignedInOutcome): WriteFailure {
  switch (outcome.kind) {
    case "rate-limited":
      return {
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, Date.now()),
      };
    case "forbidden":
      return { kind: "forbidden" };
    case "kitchen-unavailable":
      return { kind: "kitchen-unavailable" };
    default:
      return { kind: "failed" };
  }
}

/** What `fullWaitOfFeedback` reads of a feedback: a `429` states the instant it ends. */
export type WaitingFeedback = Parameters<typeof fullWaitOfFeedback>[0];

/** Whether a `429` is still being waited out. */
export function isWaitingOut(feedback: WaitingFeedback): boolean {
  const wait = fullWaitOfFeedback(feedback);
  return wait !== undefined && wait.endsAtMs > Date.now();
}

/** What a change of the field, the choice or the dialog leaves of the feedback: a wait still running stays, so the button and
 *  its notice keep saying so; anything else is cleared. */
export function afterChange<Feedback extends WaitingFeedback>(
  current: Feedback,
  cleared: Feedback,
): Feedback {
  return isWaitingOut(current) ? current : cleared;
}

/**
 * One write at a time. `isHeld` says a request is out or a `429` has not run out; `begin` claims the turn; `settle` ends it.
 * They read refs, not state, so two presses in one tick cannot both pass.
 */
export function useOneWriteAtATime() {
  const isOutRef = useRef(false);
  const heldUntilMsRef = useRef(0);
  const isHeld = useCallback(
    () => isOutRef.current || Date.now() < heldUntilMsRef.current,
    [],
  );
  const begin = useCallback((): boolean => {
    if (isHeld()) return false;
    isOutRef.current = true;
    return true;
  }, [isHeld]);
  const settle = useCallback((feedback: WaitingFeedback) => {
    isOutRef.current = false;
    heldUntilMsRef.current = fullWaitOfFeedback(feedback)?.endsAtMs ?? 0;
  }, []);
  return { isHeld, begin, settle };
}

/** A count that rises each time the screen should move focus to a field. */
export function useFocusRequest(): readonly [number, () => void] {
  const [count, setCount] = useState(0);
  const ask = useCallback(() => {
    setCount((current) => current + 1);
  }, []);
  return [count, ask];
}
