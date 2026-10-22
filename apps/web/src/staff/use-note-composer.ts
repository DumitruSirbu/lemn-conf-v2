"use client";

import { useCallback, useState } from "react";

import { judgeNoteText } from "@lemnaria/configurator-domain";

import type { SignedInOutcome } from "@/account/account-answer";
import { sendSignedInRequest } from "@/account/send-account-request";
import type { AccountFieldIssue } from "@/i18n/content";

import { withNoteAdded } from "./staff-note-rules";
import { raiseStaffSessionExpired } from "./staff-session-expiry";
import {
  afterChange,
  useFocusRequest,
  useOneWriteAtATime,
  writeFailureOf,
  type KitchenEditing,
  type WriteFailure,
} from "./use-one-write-at-a-time";

// The note field of one client's kitchen (frames S3F to S3F3). A press sends one request and never another by itself; what
// was typed stays in the field through every refusal and is cleared only by the note being stored.

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

const NO_FEEDBACK: NoteFeedback = { kind: "none" };

export function useNoteComposer(
  designId: string,
  editing: KitchenEditing,
): NoteComposer {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<NoteFeedback>(NO_FEEDBACK);
  const [isBusy, setIsBusy] = useState(false);
  const [focusRequest, askFocus] = useFocusRequest();
  const { isHeld, begin, settle } = useOneWriteAtATime();
  const answer = useNoteAnswer({
    edit: editing.edit,
    setText,
    setFeedback,
    setIsBusy,
    settle,
    askFocus,
  });

  const typeText = useCallback((next: string) => {
    setText(next);
    setFeedback((current) => afterChange(current, NO_FEEDBACK));
  }, []);

  const submit = useCallback(() => {
    // The hold comes first: a refusal here must not replace the feedback a running wait is shown by.
    if (isHeld()) return;
    const judged = judgeNoteText(text);
    if (!judged.ok) {
      setFeedback({
        kind: "text-refused",
        issue: { field: "text", code: judged.code },
      });
      askFocus();
      return;
    }
    if (!begin()) return;
    setIsBusy(true);
    setFeedback(NO_FEEDBACK);
    void sendSignedInRequest({
      flow: "staff-note",
      id: designId,
      text: judged.text,
    }).then(answer);
  }, [answer, askFocus, begin, designId, isHeld, text]);

  return { text, feedback, isBusy, focusRequest, typeText, submit };
}

interface NoteAnswerParts {
  readonly edit: KitchenEditing["edit"];
  readonly setText: (text: string) => void;
  readonly setFeedback: (feedback: NoteFeedback) => void;
  readonly setIsBusy: (isBusy: boolean) => void;
  readonly settle: (feedback: NoteFeedback) => void;
  readonly askFocus: () => void;
}

/** What the page does with the answer to a note. */
function useNoteAnswer({
  edit,
  setText,
  setFeedback,
  setIsBusy,
  settle,
  askFocus,
}: NoteAnswerParts): (outcome: SignedInOutcome) => void {
  return useCallback(
    (outcome) => {
      setIsBusy(false);
      const next = noteFeedbackAfter(outcome);
      settle(next);
      if (outcome.kind === "note-added") {
        setText("");
        edit((kitchen) => withNoteAdded(kitchen, outcome.note));
      }
      if (outcome.kind === "unauthenticated") {
        raiseStaffSessionExpired({ keepsTypedText: true });
      }
      if (next.kind === "text-refused") askFocus();
      setFeedback(next);
    },
    [askFocus, edit, setFeedback, setIsBusy, setText, settle],
  );
}

function noteFeedbackAfter(outcome: SignedInOutcome): NoteFeedback {
  switch (outcome.kind) {
    case "note-added":
      return { kind: "saved", noteId: outcome.note.id };
    case "unauthenticated":
      return NO_FEEDBACK;
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
