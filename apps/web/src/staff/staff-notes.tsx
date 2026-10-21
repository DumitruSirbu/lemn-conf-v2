"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { NOTE_TEXT_MAX_LENGTH } from "@lemnaria/configurator-domain";

import {
  FormNotice,
  InlineRefusal,
  RateLimitNotice,
  SubmitButton,
  fullWaitOfFeedback,
} from "@/account/account-form-parts";
import {
  formatRelativeAge,
  relativeAgeOf,
} from "@/account/kitchens/relative-age";
import type { AppLocale } from "@/i18n/routing";
import {
  useAccountKitCopy,
  useStaffKitchensCopy,
  useStaffNotesCopy,
} from "@/i18n/use-content";

import styles from "./staff-kitchen.module.css";
import { dayAndTimeOf } from "./staff-kitchen-dates";
import { noteLengthOf } from "./staff-note-rules";
import type { StaffKitchenNoteWire } from "./staff-kitchens-wire-contract";
import {
  useNoteComposer,
  type KitchenEditing,
  type NoteComposer,
  type NoteFeedback,
} from "./use-staff-kitchen-actions";

// The notes of one client's kitchen (Lot 3 frames S3B, S3F, S3F2 and S3F3): the list, newest first, and the field that adds
// one. A note is never edited or deleted, so the list has no control. Every note, name and address is a React text child in an
// element of its own, isolated from what is beside it by the stylesheet; a line feed in a note is kept by `white-space`.

export interface StaffNotesProps {
  readonly locale: AppLocale;
  readonly designId: string;
  /** Newest first. */
  readonly notes: readonly StaffKitchenNoteWire[];
  /** The kitchen holds notes that `notes` does not carry, and the list says so. */
  readonly isTruncated: boolean;
  readonly editing: KitchenEditing;
}

export function StaffNotes({
  locale,
  designId,
  notes,
  isTruncated,
  editing,
}: StaffNotesProps) {
  const copy = useStaffNotesCopy();
  const composer = useNoteComposer(designId, editing);
  const headingId = useId();
  return (
    <section
      className={styles.notesColumn}
      aria-labelledby={headingId}
      data-testid="staff-notes"
    >
      <h2 id={headingId} className={styles.cardTitle}>
        {copy.title}
      </h2>
      <NotesSummary count={notes.length} isTruncated={isTruncated} />
      <SavedOrFailedNotice feedback={composer.feedback} />
      <NoteList
        locale={locale}
        notes={notes}
        freshNoteId={
          composer.feedback.kind === "saved"
            ? composer.feedback.noteId
            : undefined
        }
      />
      <NoteField composer={composer} />
    </section>
  );
}

/** How many notes are shown. When the kitchen holds more, the count would read as the total, so the sentence says what is
 *  shown and that the rest is not. */
function NotesSummary({
  count,
  isTruncated,
}: {
  readonly count: number;
  readonly isTruncated: boolean;
}) {
  const copy = useStaffNotesCopy();
  if (count === 0) return null;
  return (
    <div className={styles.notesSummary}>
      <span className={styles.notesCount} data-testid="staff-notes-count">
        {isTruncated ? copy.truncated(count) : copy.count(count)}
      </span>
      <span className={styles.notesSort}>{copy.newestFirst}</span>
    </div>
  );
}

/** "Nota a fost salvată" above the list, where the new note stands, and the refusals that are not about the text. */
function SavedOrFailedNotice({
  feedback,
}: {
  readonly feedback: NoteFeedback;
}) {
  const copy = useStaffNotesCopy();
  switch (feedback.kind) {
    case "saved":
      return <FormNotice tone="success">{copy.saved}</FormNotice>;
    case "rate-limited":
      return <RateLimitNotice notice={feedback.notice} />;
    case "failed":
      return (
        <FormNotice tone="error" title={copy.errorTitle}>
          {copy.errorBody}
        </FormNotice>
      );
    case "forbidden":
      return (
        <FormNotice tone="error" title={copy.errorTitle}>
          {copy.forbiddenBody}
        </FormNotice>
      );
    case "kitchen-unavailable":
      return (
        <FormNotice tone="error" title={copy.errorTitle}>
          {copy.kitchenGoneBody}
        </FormNotice>
      );
    case "none":
    case "text-refused":
      return null;
  }
}

function NoteList({
  locale,
  notes,
  freshNoteId,
}: {
  readonly locale: AppLocale;
  readonly notes: readonly StaffKitchenNoteWire[];
  readonly freshNoteId: string | undefined;
}) {
  const copy = useStaffNotesCopy();
  const lists = useStaffKitchensCopy();
  const [readAtMs] = useState(Date.now);
  if (notes.length === 0) return <p className={styles.muted}>{copy.empty}</p>;
  return (
    <ul className={styles.noteList}>
      {notes.map((note) => (
        <li
          key={note.id}
          className={styles.note}
          data-fresh={note.id === freshNoteId ? "true" : undefined}
        >
          <div className={styles.noteHead}>
            <span className={styles.noteAuthor}>
              {note.author.name ?? note.author.email ?? lists.noValue}
            </span>
            <time className={styles.noteWhen} dateTime={note.createdAt}>
              {copy.when({
                date: dayAndTimeOf(note.createdAt, locale),
                ago: formatRelativeAge(
                  locale,
                  relativeAgeOf(Date.parse(note.createdAt), readAtMs),
                ),
              })}
            </time>
          </div>
          <p className={styles.noteText}>{note.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** The label, the counter, the field, its refusal and the button. The field stays editable until a request is out, and keeps
 *  what was typed through every refusal. */
function NoteField({ composer }: { readonly composer: NoteComposer }) {
  const copy = useStaffNotesCopy();
  const kit = useAccountKitCopy();
  const fieldId = useId();
  const counterId = useId();
  const errorId = useId();
  const dataLineId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useFocusOnRequest(composer.focusRequest, fieldRef);
  const { feedback } = composer;
  const issue = feedback.kind === "text-refused" ? feedback.issue : undefined;
  const length = noteLengthOf(composer.text);
  const wait = fullWaitOfFeedback(feedback);
  return (
    <form
      method="post"
      noValidate
      className={styles.composer}
      aria-busy={composer.isBusy ? true : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        composer.submit();
      }}
    >
      <div className={styles.composerHead}>
        <label htmlFor={fieldId} className={styles.composerLabel}>
          {copy.fieldLabel}
        </label>
        <span
          id={counterId}
          className={styles.counter}
          data-over={length > NOTE_TEXT_MAX_LENGTH ? "true" : undefined}
        >
          {copy.counter(length)}
        </span>
      </div>
      <p id={dataLineId} className={styles.hint}>
        {copy.dataLine}
      </p>
      <textarea
        ref={fieldRef}
        id={fieldId}
        name="text"
        className={styles.textarea}
        rows={4}
        autoComplete="off"
        placeholder={copy.fieldPlaceholder}
        value={composer.text}
        readOnly={composer.isBusy}
        aria-invalid={issue === undefined ? undefined : true}
        aria-describedby={describedBy(
          issue === undefined ? undefined : errorId,
          dataLineId,
          counterId,
        )}
        data-invalid={issue === undefined ? undefined : "true"}
        onChange={(event) => {
          composer.typeText(event.target.value);
        }}
      />
      {issue === undefined ? null : (
        <InlineRefusal id={errorId}>{kit.fieldError(issue)}</InlineRefusal>
      )}
      <SubmitButton
        label={copy.submit}
        busyLabel={copy.submitting}
        isBusy={composer.isBusy}
        isOff={false}
        {...(wait === undefined ? {} : { wait })}
      />
    </form>
  );
}

/** A refusal about the text takes focus to the field, where the person corrects it. */
function useFocusOnRequest(
  focusRequest: number,
  fieldRef: RefObject<HTMLTextAreaElement | null>,
): void {
  useEffect(() => {
    if (focusRequest > 0) fieldRef.current?.focus();
  }, [focusRequest, fieldRef]);
}

/** The ids that describe the field, in reading order: the refusal first, then what a note is, then the counter. */
function describedBy(...ids: readonly (string | undefined)[]): string {
  return ids.filter((id) => id !== undefined).join(" ");
}
