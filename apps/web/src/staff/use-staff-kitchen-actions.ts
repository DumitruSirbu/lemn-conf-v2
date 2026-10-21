"use client";

import { useCallback, useRef, useState } from "react";

import {
  isRequestStatus,
  judgeNoteText,
  type RequestStatus,
} from "@lemnaria/configurator-domain";

import {
  rateLimitNoticeOf,
  type SignedInOutcome,
} from "@/account/account-answer";
import { fullWaitOfFeedback } from "@/account/account-form-parts";
import {
  sendSignedInRequest,
  type SignedInRequest,
} from "@/account/send-account-request";
import type { AccountFieldIssue, AccountRateLimitNotice } from "@/i18n/content";

import { withNoteAdded } from "./staff-note-rules";
import { raiseStaffSessionExpired } from "./staff-session-expiry";
import type {
  StaffKitchenWire,
  StaffStatusSavedWire,
} from "./staff-kitchens-wire-contract";
import type { StaffKitchenReading } from "./use-staff-kitchen";

// What staff write on one client's kitchen (Lot 3 frames S3D to S3G): a note, a request status, and making a hidden kitchen
// visible again. Each is one request made from a press and never again on its own: a `429` or `503` waits for the person, and
// a press while the request is out, or the wait of a `429` is not over, does nothing. What was typed is held here and
// nowhere else: not in the address, the browser's storage or a log, and a refusal of any kind leaves it where it is. An
// answer that says the session ended raises the staff frame's sheet and changes nothing on the page.

/** The two ways the page's kitchen is changed or read again, as the writes use them. */
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
function writeFailureOf(outcome: SignedInOutcome): WriteFailure {
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
type WaitingFeedback = Parameters<typeof fullWaitOfFeedback>[0];

/** Whether a `429` is still being waited out. A change of the field, the choice or the dialog must not end it: the button and
 *  its notice say so for the whole wait, whatever the person does meanwhile. */
function isWaitingOut(feedback: WaitingFeedback): boolean {
  const wait = fullWaitOfFeedback(feedback);
  return wait !== undefined && wait.endsAtMs > Date.now();
}

/** What a change leaves of the feedback: a wait still running stays, anything else is cleared. */
function afterChange<Feedback extends WaitingFeedback>(
  current: Feedback,
  cleared: Feedback,
): Feedback {
  return isWaitingOut(current) ? current : cleared;
}

/**
 * One write at a time. `begin` answers `false` while a request is out or a `429` has not run out, and the press then does
 * nothing; `settle` ends the request. It is a ref, not state, so two presses in one tick cannot both pass.
 */
function useOneWriteAtATime() {
  const isOutRef = useRef(false);
  const heldUntilMsRef = useRef(0);
  const begin = useCallback((): boolean => {
    if (isOutRef.current || Date.now() < heldUntilMsRef.current) return false;
    isOutRef.current = true;
    return true;
  }, []);
  const settle = useCallback((feedback: WaitingFeedback) => {
    isOutRef.current = false;
    heldUntilMsRef.current = fullWaitOfFeedback(feedback)?.endsAtMs ?? 0;
  }, []);
  return { begin, settle };
}

// ---------------------------------------------------------------------------------------------------------------------
// A note

export type NoteFeedback =
  | { readonly kind: "none" }
  /** The note is stored; `noteId` is the one the list marks as new. */
  | { readonly kind: "saved"; readonly noteId: string }
  /** The text was refused, here before anything was sent or by the server; the issue is the one placed at the field. */
  | { readonly kind: "text-refused"; readonly issue: AccountFieldIssue }
  | WriteFailure;

export interface NoteComposer {
  readonly text: string;
  readonly feedback: NoteFeedback;
  readonly isBusy: boolean;
  /** A new number each time the field should take focus: a refusal that is about what it holds. */
  readonly focusRequest: number;
  readonly typeText: (text: string) => void;
  readonly submit: () => void;
}

export function useNoteComposer(
  designId: string,
  editing: KitchenEditing,
): NoteComposer {
  const { edit } = editing;
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<NoteFeedback>({ kind: "none" });
  const [isBusy, setIsBusy] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const { begin, settle } = useOneWriteAtATime();

  const typeText = useCallback((next: string) => {
    setText(next);
    setFeedback((current) => afterChange(current, { kind: "none" }));
  }, []);

  const submit = useCallback(() => {
    const judged = judgeNoteText(text);
    if (!judged.ok) {
      setFeedback({
        kind: "text-refused",
        issue: { field: "text", code: judged.code },
      });
      setFocusRequest((count) => count + 1);
      return;
    }
    if (!begin()) return;
    setIsBusy(true);
    setFeedback({ kind: "none" });
    const hasTypedText = text.trim() !== "";
    void sendSignedInRequest({
      flow: "staff-note",
      id: designId,
      text: judged.text,
    }).then((outcome) => {
      setIsBusy(false);
      const next = noteFeedbackAfter(outcome);
      settle(next);
      if (outcome.kind === "note-added") {
        setText("");
        edit((kitchen) => withNoteAdded(kitchen, outcome.note));
      }
      if (outcome.kind === "unauthenticated") {
        raiseStaffSessionExpired({ keepsTypedText: hasTypedText });
      }
      if (next.kind === "text-refused") setFocusRequest((count) => count + 1);
      setFeedback(next);
    });
  }, [begin, designId, edit, settle, text]);

  return { text, feedback, isBusy, focusRequest, typeText, submit };
}

function noteFeedbackAfter(outcome: SignedInOutcome): NoteFeedback {
  switch (outcome.kind) {
    case "note-added":
      return { kind: "saved", noteId: outcome.note.id };
    case "unauthenticated":
      return { kind: "none" };
    case "invalid-input": {
      const issue = outcome.issues.find(({ field }) => field === "text");
      return issue === undefined
        ? { kind: "failed" }
        : { kind: "text-refused", issue };
    }
    default:
      return writeFailureOf(outcome);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// A request status

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

export function useStatusControl({
  designId,
  initial,
  editing,
}: StatusControlSeed): StatusControl {
  const { edit, refresh } = editing;
  const [selected, setSelected] = useState<RequestStatus | null>(initial);
  const [feedback, setFeedback] = useState<StatusFeedback>({ kind: "none" });
  const [isBusy, setIsBusy] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const { begin, settle } = useOneWriteAtATime();

  const choose = useCallback((value: string) => {
    if (!isRequestStatus(value)) return;
    setSelected(value);
    setFeedback((current) => afterChange(current, { kind: "none" }));
  }, []);

  const save = useCallback(() => {
    if (selected === null) {
      setFeedback({
        kind: "status-refused",
        issue: { field: "status", code: "REQUIRED" },
      });
      setFocusRequest((count) => count + 1);
      return;
    }
    if (!begin()) return;
    setIsBusy(true);
    setFeedback({ kind: "none" });
    void sendSignedInRequest({
      flow: "staff-status",
      id: designId,
      status: selected,
    }).then((outcome) => {
      setIsBusy(false);
      const next = statusFeedbackAfter(outcome);
      settle(next);
      if (outcome.kind === "status-saved") {
        edit((kitchen) => withStatusSaved(kitchen, outcome.saved));
      }
      if (outcome.kind === "unauthenticated") raiseStaffSessionExpired();
      if (isStaleKitchen(next))
        void markRereadWhenShown(refresh(), setFeedback);
      if (next.kind === "status-refused") {
        setFocusRequest((count) => count + 1);
      }
      setFeedback(next);
    });
  }, [begin, designId, edit, refresh, selected, settle]);

  return { selected, feedback, isBusy, focusRequest, choose, save };
}

/** The conflict's sentence says the kitchen was read again only once the page shows that reading. */
async function markRereadWhenShown(
  reread: Promise<boolean>,
  setFeedback: (change: (current: StatusFeedback) => StatusFeedback) => void,
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
      return { kind: "none" };
    case "conflict-changed-meanwhile":
      return {
        kind: "conflict",
        conflict: "changed-meanwhile",
        isReread: false,
      };
    case "conflict-status-not-recognised":
      return {
        kind: "conflict",
        conflict: "status-not-recognised",
        isReread: false,
      };
    case "conflict-not-sent":
      return { kind: "conflict", conflict: "not-sent", isReread: false };
    case "invalid-input": {
      const issue = outcome.issues.find(({ field }) => field === "status");
      return issue === undefined
        ? { kind: "failed" }
        : { kind: "status-refused", issue };
    }
    default:
      return writeFailureOf(outcome);
  }
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

// ---------------------------------------------------------------------------------------------------------------------
// Making a hidden kitchen visible again

/** What the page says once the dialog has gone: the kitchen is visible, or it already was. */
export type UnhideAnnouncement = "done" | "not-hidden";

export interface UnhideAction {
  readonly isDialogOpen: boolean;
  readonly isBusy: boolean;
  /** Why the last confirmation did nothing; shown in the dialog, which stays open. */
  readonly failure: WriteFailure | undefined;
  readonly announcement: UnhideAnnouncement | undefined;
  readonly openDialog: () => void;
  readonly closeDialog: () => void;
  readonly confirm: () => void;
}

export function useUnhide(
  designId: string,
  editing: KitchenEditing,
): UnhideAction {
  const { edit, refresh } = editing;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<WriteFailure>();
  const [announcement, setAnnouncement] = useState<UnhideAnnouncement>();
  const { begin, settle } = useOneWriteAtATime();

  const openDialog = useCallback(() => {
    setFailure((current) =>
      current !== undefined && isWaitingOut(current) ? current : undefined,
    );
    setIsDialogOpen(true);
  }, []);
  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const confirm = useCallback(() => {
    if (!begin()) return;
    setIsBusy(true);
    setFailure(undefined);
    const request: SignedInRequest = { flow: "staff-unhide", id: designId };
    void sendSignedInRequest(request).then((outcome) => {
      setIsBusy(false);
      const next = unhideResultOf(outcome);
      settle(next.kind === "stays-open" ? next.failure : next);
      if (next.kind === "unhidden") {
        edit(withKitchenVisible);
        setAnnouncement("done");
        setIsDialogOpen(false);
      }
      if (next.kind === "already-visible") {
        void refresh();
        setAnnouncement("not-hidden");
        setIsDialogOpen(false);
      }
      if (next.kind === "gone") {
        void refresh();
        setIsDialogOpen(false);
      }
      if (next.kind === "session-ended") raiseStaffSessionExpired();
      if (next.kind === "stays-open") setFailure(next.failure);
    });
  }, [begin, designId, edit, refresh, settle]);

  return {
    isDialogOpen,
    isBusy,
    failure,
    announcement,
    openDialog,
    closeDialog,
    confirm,
  };
}

type UnhideResult =
  | { readonly kind: "unhidden" }
  | { readonly kind: "already-visible" }
  | { readonly kind: "gone" }
  | { readonly kind: "session-ended" }
  | { readonly kind: "stays-open"; readonly failure: WriteFailure };

function unhideResultOf(outcome: SignedInOutcome): UnhideResult {
  switch (outcome.kind) {
    case "succeeded":
      return { kind: "unhidden" };
    case "conflict-not-hidden":
      return { kind: "already-visible" };
    case "kitchen-unavailable":
      return { kind: "gone" };
    case "unauthenticated":
      return { kind: "session-ended" };
    default:
      return { kind: "stays-open", failure: writeFailureOf(outcome) };
  }
}

function withKitchenVisible(kitchen: StaffKitchenWire): StaffKitchenWire {
  return { ...kitchen, kitchen: { ...kitchen.kitchen, isHidden: false } };
}
