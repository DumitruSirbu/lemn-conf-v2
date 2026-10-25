import { useCallback, useRef, useState } from "react";

import type { AccountRateLimitNotice } from "@/i18n/content";

import { rateLimitNoticeOf, type SignedInOutcome } from "../account-answer";
import type { FocusRequest } from "../account-focus";
import { useFragmentToken, type FragmentTokenStatus } from "../fragment-token";
import { sendSignedInRequest } from "../send-account-request";

// What the confirm-address page remembers, and the one thing it does with it: sends the token from the address when the
// person presses "Confirmă". It never sends on its own: a mail scanner that opens the link must not confirm. The token
// lives in the fragment hook's ref and goes into the request body and nowhere else. Every refused confirmation is one
// class, so the only inputs to what the page shows are that class and the wait it states.

/** What the last attempt left on the page. `confirmed`, `link-invalid` and `request-failed` replace the form. */
export type ConfirmEmailFeedback =
  | { readonly kind: "none" }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unanswered" }
  | { readonly kind: "confirmed" }
  | { readonly kind: "link-invalid" }
  | { readonly kind: "request-failed" };

const NO_FEEDBACK: ConfirmEmailFeedback = { kind: "none" };

export type ConfirmEmailFocusRequest = FocusRequest<"notice">;

export interface ConfirmEmail {
  /** Whether the address held a token: `reading` until the page has looked, which is what the server renders. */
  readonly tokenStatus: FragmentTokenStatus;
  readonly feedback: ConfirmEmailFeedback;
  readonly focusRequest: ConfirmEmailFocusRequest | undefined;
  readonly isBusy: boolean;
  readonly submit: () => void;
}

export function useConfirmEmail(): ConfirmEmail {
  const { status: tokenStatus, tokenRef, discard } = useFragmentToken();
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<ConfirmEmailFeedback>(NO_FEEDBACK);
  const [focusRequest, setFocusRequest] = useState<ConfirmEmailFocusRequest>();
  const isSendingRef = useRef(false);

  const submit = useCallback(() => {
    const token = tokenRef.current;
    if (token === undefined || isSendingRef.current) return;
    isSendingRef.current = true;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void sendConfirmation(token).then((answer) => {
      isSendingRef.current = false;
      setIsBusy(false);
      if (isTokenSpentBy(answer)) discard();
      setFeedback(answer);
      setFocusRequest({ target: focusTargetOf(answer) });
    });
  }, [discard, tokenRef]);

  return { tokenStatus, feedback, focusRequest, isBusy, submit };
}

/** A notice that heads the form takes focus; a screen that replaces the form moves focus itself. */
function focusTargetOf(feedback: ConfirmEmailFeedback): "notice" | "nowhere" {
  switch (feedback.kind) {
    case "rate-limited":
    case "unavailable":
    case "unanswered":
      return "notice";
    default:
      return "nowhere";
  }
}

/** The token stays for every answer a retry can mend, a platform failure included: the server spends it only on a
 *  confirmation. After one, or after a refusal no retry mends, there is nothing left to send. */
function isTokenSpentBy(feedback: ConfirmEmailFeedback): boolean {
  return (
    feedback.kind === "confirmed" ||
    feedback.kind === "link-invalid" ||
    feedback.kind === "request-failed"
  );
}

async function sendConfirmation(token: string): Promise<ConfirmEmailFeedback> {
  const outcome = await sendSignedInRequest({
    flow: "confirm-email",
    body: { token },
  });
  return feedbackFrom(outcome, Date.now());
}

/** Every outcome the page can be given. The page has no session, so the classes of a signed-in request (`401`, `403`)
 *  are, like any unlisted answer, a failed request; so is `400 invalid-request`. A server error no word explains is
 *  told as a request that got no answer, which keeps the token for a retry: it says nothing about the link. */
function feedbackFrom(
  outcome: SignedInOutcome,
  nowMs: number,
): ConfirmEmailFeedback {
  switch (outcome.kind) {
    case "email-changed":
      return { kind: "confirmed" };
    case "link-invalid":
      return { kind: "link-invalid" };
    case "rate-limited":
      return {
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, nowMs),
      };
    case "unavailable":
      return { kind: "unavailable" };
    case "unanswered":
    case "platform-failed":
      return { kind: "unanswered" };
    default:
      return { kind: "request-failed" };
  }
}
