"use client";

import { useCallback, useRef, useState } from "react";

import { raiseStaffSessionExpired } from "@/staff/staff-session-expiry";

import { orFailed } from "./async-seams";
import type { DashboardDraftWire } from "./price-dashboard-wire-contract";
import type { DiscardOutcome, PublishClient } from "./publish-client";

// Giving up the whole draft is asked before it is sent, because it cannot be taken back. The question has a request
// out only while `discarding`. A refusal as `changed-meanwhile` closes the question: the page reads the draft again, and
// the person asks again once they have seen what it now holds. Asked again at a revision that was refused, the
// confirmation is off, since sending it could only be refused again.

const DISCARD_FAILED: DiscardOutcome = { kind: "failed" };

export type DiscardPhase = "idle" | "confirming" | "discarding";

export type DiscardFailure = "conflict" | "failed";

export interface DiscardControl {
  readonly phase: DiscardPhase;
  readonly failure: DiscardFailure | undefined;
  readonly ask: () => void;
  readonly cancel: () => void;
  readonly confirm: () => void;
  /** Off while the page holds a revision the draft has already moved past. */
  readonly canConfirm: boolean;
}

export interface DiscardInput {
  readonly client: PublishClient;
  /** The draft revision the page last read: the write names it, and a draft that moved since is not discarded. */
  readonly draftRevision: string;
  /** The draft is still one the page offers to give up. When it stops being (a read drew a list), the question closes. */
  readonly isOffered: boolean;
  readonly onDiscarded: (draft: DashboardDraftWire) => void;
  /** The draft moved since the page read it: nothing was discarded. */
  readonly onConflict: () => void;
}

export function useDiscardDraft({
  client,
  draftRevision,
  isOffered,
  onDiscarded,
  onConflict,
}: DiscardInput): DiscardControl {
  const [phase, setPhase] = useState<DiscardPhase>("idle");
  const [failure, setFailure] = useState<DiscardFailure | undefined>(undefined);
  const [refusedRevision, setRefusedRevision] = useState<string | undefined>(
    undefined,
  );
  const isOutRef = useRef(false);
  const hasRefusedRevision = refusedRevision === draftRevision;
  if (phase === "confirming" && !isOffered) setPhase("idle");

  const ask = useCallback(() => {
    setFailure(undefined);
    setPhase("confirming");
  }, []);

  const cancel = useCallback(() => {
    if (!isOutRef.current) setPhase("idle");
  }, []);

  const settleDiscard = useCallback(
    (outcome: DiscardOutcome, sentRevision: string) => {
      switch (outcome.kind) {
        case "changed":
          setPhase("idle");
          onDiscarded(outcome.draft);
          return;
        case "conflict":
          setRefusedRevision(sentRevision);
          setPhase("idle");
          onConflict();
          return;
        case "session-ended":
          raiseStaffSessionExpired();
          setPhase("confirming");
          setFailure("failed");
          return;
        case "failed":
          setPhase("confirming");
          setFailure("failed");
      }
    },
    [onDiscarded, onConflict],
  );

  const confirm = useCallback(() => {
    if (isOutRef.current || hasRefusedRevision) return;
    isOutRef.current = true;
    setPhase("discarding");
    setFailure(undefined);
    void orFailed(
      () =>
        client.discardDraft({
          expectedDraftRevision: draftRevision,
          scope: "all",
        }),
      DISCARD_FAILED,
    ).then((outcome) => {
      isOutRef.current = false;
      settleDiscard(outcome, draftRevision);
    });
  }, [client, draftRevision, hasRefusedRevision, settleDiscard]);

  return {
    phase,
    failure: hasRefusedRevision ? "conflict" : failure,
    ask,
    cancel,
    confirm,
    canConfirm: !hasRefusedRevision,
  };
}
