import {
  rateLimitNoticeOf,
  type AccountAnswer,
  type SignedInOutcome,
} from "@/account/account-answer";
import { NO_REFERRER_POLICY } from "@/account/send-account-request";
import type { AccountRateLimitNotice } from "@/i18n/content";

// The one way the staff screens ask a staff route for something to read: a GET with no referrer, an abort the caller can
// make, and the answer as the classifier takes it (a status, a `Retry-After`, a body that is JSON or nothing). Client-safe.

/** Why something could not be had, as a staff screen tells it. */
export type StaffReadFailure =
  | { readonly kind: "unavailable" }
  | { readonly kind: "offline" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "failed" };

export type StaffReading =
  | { readonly kind: "answered"; readonly answer: AccountAnswer }
  | { readonly kind: "offline" }
  | { readonly kind: "aborted" };

export async function askStaffRoute(
  address: string,
  signal: AbortSignal,
): Promise<StaffReading> {
  try {
    const response = await fetch(address, {
      method: "GET",
      referrerPolicy: NO_REFERRER_POLICY,
      signal,
    });
    const body = await readJsonOrNothing(response);
    if (signal.aborted) return { kind: "aborted" };
    return {
      kind: "answered",
      answer: {
        status: response.status,
        retryAfter: response.headers.get("retry-after"),
        body,
      },
    };
  } catch {
    return signal.aborted ? { kind: "aborted" } : { kind: "offline" };
  }
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** What an answer that is not the data and not a refusal of the session or of the kitchen comes to: a limit with its wait, the
 *  service being down, or an answer the screen cannot use. */
export function failureOf(outcome: SignedInOutcome): StaffReadFailure {
  switch (outcome.kind) {
    case "rate-limited":
      return {
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, Date.now()),
      };
    case "unavailable":
      return { kind: "unavailable" };
    default:
      return { kind: "failed" };
  }
}
