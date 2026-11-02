"use client";

import { useCallback, useRef, useState } from "react";

import { orFailed } from "./async-seams";
import type { DashboardDraftWire } from "./price-dashboard-wire-contract";
import type { DiscardOutcome, PublishClient } from "./publish-client";

// Giving up the whole draft is asked before it is sent, because it cannot be taken back. The question has a request
// out only while `discarding`; a refusal as `changed-meanwhile` leaves it open with the reason, so the person decides again.

const DISCARD_FAILED: DiscardOutcome = { kind: "failed" };

export type DiscardPhase = "idle" | "confirming" | "discarding";

export type DiscardFailure = "conflict" | "failed";

export interface DiscardControl {
  readonly phase: DiscardPhase;
  readonly failure: DiscardFailure | undefined;
  readonly ask: () => void;
  readonly cancel: () => void;
  readonly confirm: () => void;
}

export interface DiscardInput {
  readonly client: PublishClient;
  /** The draft revision the page last read: the write names it, and a draft that moved since is not discarded. */
  readonly draftRevision: string;
  readonly onDiscarded: (draft: DashboardDraftWire) => void;
  /** The draft moved since the page read it: nothing was discarded. */
  readonly onConflict: () => void;
}

export function useDiscardDraft({
  client,
  draftRevision,
  onDiscarded,
  onConflict,
}: DiscardInput): DiscardControl {
  const [phase, setPhase] = useState<DiscardPhase>("idle");
  const [failure, setFailure] = useState<DiscardFailure | undefined>(undefined);
  const isOutRef = useRef(false);

  const ask = useCallback(() => {
    setFailure(undefined);
    setPhase("confirming");
  }, []);

  const cancel = useCallback(() => {
    if (!isOutRef.current) setPhase("idle");
  }, []);

  const confirm = useCallback(() => {
    if (isOutRef.current) return;
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
      if (outcome.kind === "changed") {
        setPhase("idle");
        onDiscarded(outcome.draft);
        return;
      }
      setPhase("confirming");
      setFailure(outcome.kind);
      if (outcome.kind === "conflict") onConflict();
    });
  }, [client, draftRevision, onDiscarded, onConflict]);

  return { phase, failure, ask, cancel, confirm };
}
