import { useCallback, useEffect, useRef, useState } from "react";

import type { AccountRateLimitNotice } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import { rateLimitNoticeOf } from "./account-answer";
import { startPathOf } from "./account-shell";
import { loginPathWithReason } from "./login-arrival";
import { leaveFor, leaveForStart } from "./on-signed-in";
import { sendSignedInRequest } from "./send-account-request";

// The one act of the claim dialog (Lot 2 frames A18A to A18E): asking the server to give this browser's designs to the
// signed-in account. Claiming cannot be undone, so the act is sent once per press and only on the person's press, and a
// success is told with the number the server gave, which may differ from the one the question named.

/** Where the dialog stands. Every state but `busy` and `claimed` is a question the person may still answer. */
export type ClaimStatus =
  | { readonly kind: "asking" }
  | { readonly kind: "busy" }
  | { readonly kind: "claimed"; readonly count: number }
  | {
      readonly kind: "rate-limited";
      /** Told once, when the answer came, so the sentence does not drift as the page redraws. */
      readonly notice: AccountRateLimitNotice;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "offline" };

export interface Claim {
  readonly status: ClaimStatus;
  /** "Atașează". Sends the claim; a second press while one is out, or after it was answered, does nothing. */
  readonly claim: () => void;
  /** "Nu acum", and "Continuă" once the claim is made: a full load to the start of the configurator. */
  readonly leave: () => void;
}

/** What an answer comes to: the dialog changes what it says, or the document leaves. */
type ClaimStep =
  | { readonly kind: "stay"; readonly status: ClaimStatus }
  | { readonly kind: "leave"; readonly path: string };

export function useClaim(locale: AppLocale): Claim {
  const [status, setStatus] = useState<ClaimStatus>({ kind: "asking" });
  const isSendingRef = useRef(false);
  const isLeavingRef = useRef(false);
  useReloadOnPageRestore();

  const claim = useCallback(() => {
    if (isSendingRef.current || isLeavingRef.current) return;
    isSendingRef.current = true;
    setStatus({ kind: "busy" });
    void askServerToClaim(locale).then((step) => {
      if (step.kind === "leave") {
        // The guard stays shut: the document is on its way out and a second press must send nothing.
        isLeavingRef.current = true;
        leaveFor(step.path);
        return;
      }
      // A made claim is not sent again; any other answer leaves the question open to be asked once more.
      const isClaimMade = step.status.kind === "claimed";
      isSendingRef.current = isClaimMade;
      setStatus(step.status);
    });
  }, [locale]);

  // Not latched: a second assign to the same path is harmless, and a leave that did not take (a blocked navigation)
  // must stay possible. Leaving only closes the claim, which must never be sent from a page on its way out.
  const leave = useCallback(() => {
    isLeavingRef.current = true;
    leaveForStart(locale);
  }, [locale]);

  return { status, claim, leave };
}

/** A page restored from the back-forward cache keeps this dialog's state, whose exits have already been taken and whose
 *  claim would still be live. It is loaded again instead, so the dialog is never shown in that half-spent state. */
function useReloadOnPageRestore(): void {
  useEffect(() => {
    function reloadWhenRestored(event: PageTransitionEvent): void {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", reloadWhenRestored);
    return () => {
      window.removeEventListener("pageshow", reloadWhenRestored);
    };
  }, []);
}

async function askServerToClaim(locale: AppLocale): Promise<ClaimStep> {
  const outcome = await sendSignedInRequest({
    flow: "claim",
    intent: "claim",
  });
  switch (outcome.kind) {
    case "counted":
      return stay({ kind: "claimed", count: outcome.count });
    case "unauthenticated":
      return {
        kind: "leave",
        path: loginPathWithReason(locale, "session-expired"),
      };
    case "forbidden":
      return { kind: "leave", path: startPathOf(locale) };
    case "rate-limited":
      return stay({
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, Date.now()),
      });
    case "unanswered":
      return stay({ kind: "offline" });
    default:
      // A refusal the dialog has no sentence for reads as the service being unavailable: "reload the page" would throw
      // the question away (and on the confirm page land on the invalid-link screen), while a retry costs nothing.
      return stay({ kind: "unavailable" });
  }
}

function stay(status: ClaimStatus): ClaimStep {
  return { kind: "stay", status };
}
