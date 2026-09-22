"use client";

// **1C's announcement** (QA finding F3, WCAG 4.1.3): a polite status region carrying the room's
// reason and frame 1C's note. It is drawn **empty from 1B on**, so it is in the tree before its
// content changes — a region inserted together with its content is not reliably announced. It never
// carries a field's reason: those are described on their inputs, and a live one would speak on every
// pause of every field.
//
// **The linear suggestion is drawn here, once, after every reason** (7F2 section 8): frame 1C appends
// *"sau alege o formă liniară"* to a reason, and one clause below the last reason says it without
// repeating it per field. Whether it shows is the issue model's question to the domain; under the
// approved policy the answer is always no, and wave 7J turns it on without editing this file.
import { useTranslations } from "next-intl";

import {
  LINEAR_SUGGESTION_MESSAGE_KEY,
  ONE_C_NOTE_MESSAGE_KEY,
  type RoomIssueMessageKey,
} from "./room-issue-model";
import styles from "./room.module.css";

export interface OneCStatusProps {
  readonly roomReasons: readonly RoomIssueMessageKey[];
  readonly isLinearSuggested: boolean;
  readonly isNoteShown: boolean;
  /** The note's id, so *Continuă* can be described by it while inactive. */
  readonly noteId: string;
}

export function OneCStatus({
  roomReasons,
  isLinearSuggested,
  isNoteShown,
  noteId,
}: OneCStatusProps) {
  const translate = useTranslations();

  return (
    <div
      className={styles.oneCStatus}
      role="status"
      data-testid="room-one-c-status"
    >
      {roomReasons.map((messageKey) => (
        <p
          key={messageKey}
          className={styles.reason}
          data-testid="room-room-reason"
        >
          {translate(messageKey)}
        </p>
      ))}
      {isLinearSuggested ? (
        <p className={styles.suggestion} data-testid="room-linear-suggestion">
          {translate(LINEAR_SUGGESTION_MESSAGE_KEY)}
        </p>
      ) : null}
      {isNoteShown ? (
        <p
          id={noteId}
          className={styles.note}
          data-testid="room-presets-after-valid"
        >
          {translate(ONE_C_NOTE_MESSAGE_KEY)}
        </p>
      ) : null}
    </div>
  );
}
