"use client";

import { useCallback, useState } from "react";

import {
  isRequestStatus,
  type RequestStatus,
} from "@lemnaria/configurator-domain";

import type { SignedInOutcome } from "@/account/account-answer";
import { sendSignedInRequest } from "@/account/send-account-request";
import type { AccountFieldIssue } from "@/i18n/content";

import { raiseStaffSessionExpired } from "./staff-session-expiry";
import type {
  StaffKitchenWire,
  StaffStatusSavedWire,
} from "./staff-kitchens-wire-contract";
import {
  afterChange,
  useFocusRequest,
  useOneWriteAtATime,
  writeFailureOf,
  type KitchenEditing,
  type WriteFailure,
} from "./use-one-write-at-a-time";

// The select and the button that set a sent request's status (frames S3B and S3G). Any listed status may follow any other. A
// press sends one request and never another by itself; a `409` keeps the choice and reads the kitchen once behind the page.

/** A `409` of a status save, each a state of the data and not a failure to answer. */
export type StatusConflict =
  | "changed-meanwhile"
  | "status-not-recognised"
  | "not-sent";

export type StatusFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "saved" }
  | { readonly kind: "status-refused"; readonly issue: AccountFieldIssue }
  | {
      readonly kind: "conflict";
      readonly conflict: StatusConflict;
      /** The kitchen was read again and the page now shows that reading. Until it is, the sentence promises nothing. */
      readonly isReread: boolean;
    }
  | WriteFailure;

export interface StatusControl {
  /** The status the select shows: the one the person chose, else the one the kitchen has when this build names it. */
  readonly selected: RequestStatus | null;
  readonly feedback: StatusFeedback;
  readonly isBusy: boolean;
  readonly focusRequest: number;
  readonly choose: (value: string) => void;
  readonly save: () => void;
}

export interface StatusControlSeed {
  readonly designId: string;
  /** What the select shows at first: the status the page read, when it is one this build names. */
  readonly initial: RequestStatus | null;
  readonly editing: KitchenEditing;
}

const NO_FEEDBACK: StatusFeedback = { kind: "none" };

export function useStatusControl({
  designId,
  initial,
  editing,
}: StatusControlSeed): StatusControl {
  const [selected, setSelected] = useState<RequestStatus | null>(initial);
  const [feedback, setFeedback] = useState<StatusFeedback>(NO_FEEDBACK);
  const [isBusy, setIsBusy] = useState(false);
  const [focusRequest, askFocus] = useFocusRequest();
  const { isHeld, begin, settle } = useOneWriteAtATime();

  const choose = useCallback((value: string) => {
    if (!isRequestStatus(value)) return;
    setSelected(value);
    setFeedback((current) => afterChange(current, NO_FEEDBACK));
  }, []);

  const answer = useStatusAnswer({
    editing,
    setFeedback,
    setIsBusy,
    settle,
    askFocus,
  });

  const save = useCallback(() => {
    if (isHeld()) return;
    if (selected === null) {
      setFeedback({
        kind: "status-refused",
        issue: { field: "status", code: "REQUIRED" },
      });
      askFocus();
      return;
    }
    if (!begin()) return;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void sendSignedInRequest({
      flow: "staff-status",
      id: designId,
      status: selected,
    }).then(answer);
  }, [answer, askFocus, begin, designId, isHeld, selected]);

  return { selected, feedback, isBusy, focusRequest, choose, save };
}

interface StatusAnswerParts {
  readonly editing: KitchenEditing;
  readonly setFeedback: (
    feedback: StatusFeedback | ((current: StatusFeedback) => StatusFeedback),
  ) => void;
  readonly setIsBusy: (isBusy: boolean) => void;
  readonly settle: (feedback: StatusFeedback) => void;
  readonly askFocus: () => void;
}

/** What the page does with the answer to a save. */
function useStatusAnswer({
  editing,
  setFeedback,
  setIsBusy,
  settle,
  askFocus,
}: StatusAnswerParts): (outcome: SignedInOutcome) => void {
  const { edit, refresh } = editing;
  return useCallback(
    (outcome) => {
      setIsBusy(false);
      const next = statusFeedbackAfter(outcome);
      settle(next);
      if (outcome.kind === "status-saved") {
        edit((kitchen) => withStatusSaved(kitchen, outcome.saved));
      }
      if (outcome.kind === "unauthenticated") raiseStaffSessionExpired();
      if (isStaleKitchen(next))
        void markRereadWhenShown(refresh(), setFeedback);
      if (next.kind === "status-refused") askFocus();
      setFeedback(next);
    },
    [askFocus, edit, refresh, setFeedback, setIsBusy, settle],
  );
}

/** The conflict's sentence says the kitchen was read again only once the page shows that reading. */
async function markRereadWhenShown(
  reread: Promise<boolean>,
  setFeedback: StatusAnswerParts["setFeedback"],
): Promise<void> {
  if (!(await reread)) return;
  setFeedback((current) =>
    current.kind === "conflict" ? { ...current, isReread: true } : current,
  );
}

function statusFeedbackAfter(outcome: SignedInOutcome): StatusFeedback {
  switch (outcome.kind) {
    case "status-saved":
      return { kind: "saved" };
    case "unauthenticated":
      return NO_FEEDBACK;
    case "invalid-input":
      return refusedStatusFrom(outcome.issues);
    default:
      return conflictFeedbackOf(outcome) ?? writeFailureOf(outcome);
  }
}

function refusedStatusFrom(
  issues: Extract<SignedInOutcome, { kind: "invalid-input" }>["issues"],
): StatusFeedback {
  const issue = issues.find(({ field }) => field === "status");
  return issue === undefined
    ? { kind: "failed" }
    : { kind: "status-refused", issue };
}

const CONFLICT_OF_OUTCOME: Readonly<
  Partial<Record<SignedInOutcome["kind"], StatusConflict>>
> = {
  "conflict-changed-meanwhile": "changed-meanwhile",
  "conflict-status-not-recognised": "status-not-recognised",
  "conflict-not-sent": "not-sent",
};

function conflictFeedbackOf(
  outcome: SignedInOutcome,
): StatusFeedback | undefined {
  const conflict = CONFLICT_OF_OUTCOME[outcome.kind];
  return conflict === undefined
    ? undefined
    : { kind: "conflict", conflict, isReread: false };
}

/** The page shows the kitchen as it was; the answer says it is not that any more, or that it is gone. */
function isStaleKitchen(feedback: StatusFeedback): boolean {
  return (
    feedback.kind === "conflict" || feedback.kind === "kitchen-unavailable"
  );
}

function withStatusSaved(
  kitchen: StaffKitchenWire,
  saved: StaffStatusSavedWire,
): StaffKitchenWire {
  return {
    ...kitchen,
    status: {
      value: saved.status,
      changedBy: saved.changedBy,
      changedAt: saved.changedAt,
    },
  };
}
