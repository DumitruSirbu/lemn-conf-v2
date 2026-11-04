"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { SignedInOutcome } from "@/account/account-answer";
import { sendSignedInRequest } from "@/account/send-account-request";

import { raiseStaffSessionExpired } from "./staff-session-expiry";

// Opening a kitchen that reads as changed marks it seen, with the revision the page displayed (frame D10B). The mark is
// this client's request on open and never a write of a server render. It is sent once for the page the person opened:
// a quiet read behind the page, a note or a status saved there never sends it again, and a React effect that runs twice
// finds the guard already set. The request is not aborted when the effect is cleaned up, so the one send that was made
// is the one that lands. A kitchen that does not read as changed is not marked: there is nothing the mark would change.

export type SeenMark =
  /** Nothing was sent: the kitchen did not read as changed, or the answer is not in yet. */
  | { readonly kind: "idle" }
  | { readonly kind: "marked" }
  /** The client saved again between the page's read and the mark: the page still shows the earlier revision. */
  | { readonly kind: "changed-again" }
  | { readonly kind: "failed" };

export interface SeenMarkSeed {
  readonly designId: string;
  readonly displayedRevision: string;
  readonly isChangedAfterSeen: boolean;
}

const IDLE: SeenMark = { kind: "idle" };

export function useMarkSeen({
  designId,
  displayedRevision,
  isChangedAfterSeen,
}: SeenMarkSeed): SeenMark {
  const [mark, setMark] = useState<SeenMark>(IDLE);
  const hasSent = useRef(false);

  const send = useCallback(
    function send(): void {
      void sendSignedInRequest({
        flow: "staff-seen",
        id: designId,
        displayedRevision,
      }).then((outcome) => {
        if (outcome.kind === "unauthenticated") {
          raiseStaffSessionExpired({ askAgain: send });
          return;
        }
        setMark(markAfter(outcome));
      });
    },
    [designId, displayedRevision],
  );

  useEffect(() => {
    if (!isChangedAfterSeen || hasSent.current) return;
    hasSent.current = true;
    send();
  }, [isChangedAfterSeen, send]);

  return mark;
}

function markAfter(outcome: SignedInOutcome): SeenMark {
  if (outcome.kind !== "seen-marked") return { kind: "failed" };
  return outcome.changedAfterSeen
    ? { kind: "changed-again" }
    : { kind: "marked" };
}
