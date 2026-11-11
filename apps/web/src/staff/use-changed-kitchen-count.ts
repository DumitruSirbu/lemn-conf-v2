"use client";

import { useEffect, useState } from "react";

import { classifySignedInAnswer } from "@/account/account-answer";

import { CHANGED_COUNT_POLL_INTERVAL_SECONDS } from "./changed-count-poll-interval";
import { askStaffRoute } from "./staff-read-request";
import { raiseStaffSessionExpired } from "./staff-session-expiry";
import { isCount, ownValueOf } from "./staff-kitchens-wire-reading";
import type { StaffAreaPage } from "./staff-paths";

// How many sent kitchens changed after staff last saw them, for the menu's badge (ADR 0178 A-12). It asks the count
// route once when the frame opens and again every poll interval, so the badge can lag a seen mark by up to that long.
//
// A poll is no person's action, so the rules differ from a list's read:
//   - it pauses while the tab is hidden and asks again, once, when the tab is shown;
//   - a `401` stops it and raises the session sheet, which asks again once the person has signed in again;
//   - a `403` stops it and the badge goes, since the person may not see kitchens;
//   - a `429` stops it for good (the plan: never retried), and the badge stays as it was;
//   - any other failure keeps the last count and tries again at the next interval.
// The count is `undefined` until it is known and whenever it is unreadable, so no badge is ever drawn from a guess.

const CHANGED_COUNT_ENDPOINT = "/api/staff/kitchens/changed-count";
const POLL_INTERVAL_MS = CHANGED_COUNT_POLL_INTERVAL_SECONDS * 1000;

type PollStep =
  | { readonly kind: "count"; readonly count: number }
  | { readonly kind: "retry-later" }
  | { readonly kind: "sign-in" }
  | { readonly kind: "refused" }
  | { readonly kind: "rate-limited" }
  | { readonly kind: "aborted" };

/** The changed-kitchens count while `navigation` lists the kitchens page, else `undefined` and no request at all. */
export function useChangedKitchenCount(
  navigation: readonly StaffAreaPage[],
): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined);
  const isKitchensListed = navigation.includes("kitchens");

  useEffect(() => {
    if (!isKitchensListed) return undefined;
    return startPolling(setCount);
  }, [isKitchensListed]);

  return isKitchensListed ? count : undefined;
}

/** Runs the poll until the returned function is called. */
function startPolling(show: (count: number | undefined) => void): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isPausedHidden = false;

  const scheduleNext = (): void => {
    timer = setTimeout(pollIfShown, POLL_INTERVAL_MS);
  };

  function pollIfShown(): void {
    if (document.hidden) {
      isPausedHidden = true;
      return;
    }
    void poll();
  }

  async function poll(): Promise<void> {
    const step = await readCount(controller.signal);
    switch (step.kind) {
      case "count":
        show(step.count);
        scheduleNext();
        return;
      case "retry-later":
        scheduleNext();
        return;
      case "sign-in":
        raiseStaffSessionExpired({ askAgain: askAgainAfterSignIn });
        return;
      case "refused":
        show(undefined);
        return;
      case "rate-limited":
      case "aborted":
        return;
    }
  }

  function askAgainAfterSignIn(): void {
    if (!controller.signal.aborted) pollIfShown();
  }

  const resumeWhenShown = (): void => {
    if (!isPausedHidden || document.hidden) return;
    isPausedHidden = false;
    void poll();
  };

  document.addEventListener("visibilitychange", resumeWhenShown);
  pollIfShown();
  return () => {
    controller.abort();
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", resumeWhenShown);
  };
}

async function readCount(signal: AbortSignal): Promise<PollStep> {
  const reading = await askStaffRoute(CHANGED_COUNT_ENDPOINT, signal);
  if (reading.kind === "aborted") return { kind: "aborted" };
  if (reading.kind === "offline") return { kind: "retry-later" };
  const outcome = classifySignedInAnswer("kitchens", reading.answer);
  switch (outcome.kind) {
    case "received":
      return stepOfBody(outcome.body);
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return { kind: "refused" };
    case "rate-limited":
      return { kind: "rate-limited" };
    default:
      return { kind: "retry-later" };
  }
}

function stepOfBody(body: unknown): PollStep {
  const count = ownValueOf(body, "count");
  return isCount(count) ? { kind: "count", count } : { kind: "retry-later" };
}
