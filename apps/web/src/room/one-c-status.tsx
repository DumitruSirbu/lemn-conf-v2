"use client";

// **1C's two announcements** (QA finding F3, WCAG 4.1.3) — the room's reason and frame 1C's note,
// each drawn empty from 1B on inside its own polite status region, so a region inserted together
// with its content is never what a screen reader has to notice. They never carry a field's reason:
// those are described on their inputs, and a live one would speak on every pause of every field.
//
// **The linear suggestion no longer lives in either region** (wave 7L D9, closing 7F2 R1.4 / 7J
// D10): it used to render once, after the last reason, inside this file's single status region —
// where it could announce alone, with no reason beside it, the moment a field reason (which is never
// live) was what actually made it true. `ValidationSuggestion` (`validation-suggestion.tsx`) now
// arrives as `children`, drawn by the screen between the two regions below and inside neither, so it
// is described on each offending field instead of spoken on its own.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  ONE_C_NOTE_MESSAGE_KEY,
  type RoomIssueMessageKey,
} from "./room-issue-model";
import styles from "./room.module.css";

export interface OneCStatusProps {
  readonly roomReasons: readonly RoomIssueMessageKey[];
  readonly isNoteShown: boolean;
  /** The note's id, so *Continuă* can be described by it while inactive. */
  readonly noteId: string;
  /**
   * **F1 (7L QA):** the suggestion's id, when it shows over a room-level reason that names no field
   * of its own — `ROOM_TOO_SMALL_FOR_KITCHEN` and nothing else reaches `roomReasons` (`room-issue-
   * model.ts`'s `roomReasonOf`), and a room-level reason can never also carry a field reason (ADR
   * 0108 §7A2 criterion 1: the coupled rule is reported only once no field is already bad). Without
   * this wiring the suggestion sat between two live regions, inside neither, and no field's
   * `aria-describedby` named it either — reachable from nothing on screen. Each room reason's own
   * paragraph now describes it, so a screen reader's virtual cursor lands on the reference the
   * moment it reads the reason that made the suggestion true. Undefined while the suggestion does
   * not show, or while a field reason already carries the reference (`dimensions-form.tsx`).
   */
  readonly suggestionId?: string | undefined;
  /** The suggestion, placed between the two regions below (D9) and a live-region descendant of
   *  neither. */
  readonly children?: ReactNode;
}

export function OneCStatus({
  roomReasons,
  isNoteShown,
  noteId,
  suggestionId,
  children,
}: OneCStatusProps) {
  const translate = useTranslations();

  return (
    <div className={styles.oneCStatus} data-testid="room-one-c-status">
      <div
        className={styles.oneCReasons}
        role="status"
        data-testid="room-one-c-reasons"
      >
        {roomReasons.map((messageKey) => (
          <p
            key={messageKey}
            className={styles.reason}
            data-testid="room-room-reason"
            aria-describedby={suggestionId}
          >
            {translate(messageKey)}
          </p>
        ))}
      </div>
      {children}
      <div
        className={styles.oneCNote}
        role="status"
        data-testid="room-one-c-note"
      >
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
    </div>
  );
}
