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
import { formatRelativeAge } from "@/account/kitchens/relative-age";
import type { AppLocale } from "@/i18n/routing";
import {
  useAccountKitCopy,
  useStaffKitchensCopy,
  useStaffNotesCopy,
} from "@/i18n/use-content";

import styles from "./staff-kitchen.module.css";
import { dayAndTimeOf, shopRelativeAgeOf } from "./staff-kitchen-dates";
import { noteLengthOf } from "./staff-note-rules";
import type { StaffKitchenNoteWire } from "./staff-kitchens-wire-contract";
import {
  useNoteComposer,
  type NoteComposer,
  type NoteFeedback,
} from "./use-note-composer";
import type { KitchenEditing } from "./use-one-write-at-a-time";

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
      <NoteNotices feedback={composer.feedback} />
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

/**
 * Above the list, where the new note stands: the saved word and a limit being waited out, in a status region that is mounted
 * before either comes (a region that appears together with its words is not reliably announced), and the refusals that are
 * not about the text, as alerts.
 */
function NoteNotices({ feedback }: { readonly feedback: NoteFeedback }) {
  const copy = useStaffNotesCopy();
  return (
    <>
      <div role="status" className={styles.liveRegion}>
        {feedback.kind === "saved" ? (
          <FormNotice tone="success" isInLiveRegion>
            {copy.saved}
          </FormNotice>
        ) : null}
        {feedback.kind === "rate-limited" ? (
          <RateLimitNotice notice={feedback.notice} isInLiveRegion />
        ) : null}
      </div>
      <NoteAlert feedback={feedback} />
    </>
  );
}

function NoteAlert({ feedback }: { readonly feedback: NoteFeedback }) {
  const copy = useStaffNotesCopy();
  switch (feedback.kind) {
    case "failed":
      return <ErrorNotice body={copy.errorBody} />;
    case "forbidden":
      return <ErrorNotice body={copy.forbiddenBody} />;
    case "kitchen-unavailable":
      return <ErrorNotice body={copy.kitchenGoneBody} />;
    default:
      return null;
  }
}

function ErrorNotice({ body }: { readonly body: string }) {
  const copy = useStaffNotesCopy();
  return (
    <FormNotice tone="error" title={copy.errorTitle}>
      {body}
    </FormNotice>
  );
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
                  shopRelativeAgeOf(Date.parse(note.createdAt), readAtMs),
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

interface NoteFieldIds {
  readonly field: string;
  readonly counter: string;
  readonly error: string;
  readonly dataLine: string;
}

/** The label, the counter, the field, its refusal and the button. The field stays editable until a request is out, and keeps
 *  what was typed through every refusal. */
function NoteField({ composer }: { readonly composer: NoteComposer }) {
  const copy = useStaffNotesCopy();
  const kit = useAccountKitCopy();
  const ids: NoteFieldIds = {
    field: useId(),
    counter: useId(),
    error: useId(),
    dataLine: useId(),
  };
  const { feedback } = composer;
  const issue = feedback.kind === "text-refused" ? feedback.issue : undefined;
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
      <NoteFieldHead ids={ids} length={noteLengthOf(composer.text)} />
      <p id={ids.dataLine} className={styles.hint}>
        {copy.dataLine}
      </p>
      <NoteTextarea
        composer={composer}
        ids={ids}
        hasIssue={issue !== undefined}
      />
      {issue === undefined ? null : (
        <InlineRefusal id={ids.error}>{kit.fieldError(issue)}</InlineRefusal>
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

function NoteFieldHead({
  ids,
  length,
}: {
  readonly ids: NoteFieldIds;
  readonly length: number;
}) {
  const copy = useStaffNotesCopy();
  return (
    <div className={styles.composerHead}>
      <label htmlFor={ids.field} className={styles.composerLabel}>
        {copy.fieldLabel}
      </label>
      <span
        id={ids.counter}
        className={styles.counter}
        data-over={length > NOTE_TEXT_MAX_LENGTH ? "true" : undefined}
      >
        {copy.counter(length)}
      </span>
    </div>
  );
}

function NoteTextarea({
  composer,
  ids,
  hasIssue,
}: {
  readonly composer: NoteComposer;
  readonly ids: NoteFieldIds;
  readonly hasIssue: boolean;
}) {
  const copy = useStaffNotesCopy();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useFocusOnRequest(composer.focusRequest, fieldRef);
  return (
    <textarea
      ref={fieldRef}
      id={ids.field}
      name="text"
      className={styles.textarea}
      rows={4}
      autoComplete="off"
      placeholder={copy.fieldPlaceholder}
      value={composer.text}
      readOnly={composer.isBusy}
      aria-invalid={hasIssue ? true : undefined}
      aria-describedby={describedBy(
        hasIssue ? ids.error : undefined,
        ids.dataLine,
        ids.counter,
      )}
      data-invalid={hasIssue ? "true" : undefined}
      onChange={(event) => {
        composer.typeText(event.target.value);
      }}
    />
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
