"use client";

import { useEffect, useId, useRef, type RefObject } from "react";

import { REQUEST_STATUSES } from "@lemnaria/configurator-domain";

import {
  FormNotice,
  InlineRefusal,
  RateLimitNotice,
  fullWaitOfFeedback,
  useSecondsUntil,
} from "@/account/account-form-parts";
import {
  useAccountKitCopy,
  useStaffActionsCopy,
  useStaffKitchensCopy,
} from "@/i18n/use-content";

import styles from "./staff-kitchen.module.css";
import type { StaffKitchenStatusWire } from "./staff-kitchens-wire-contract";
import {
  useStatusControl,
  type KitchenEditing,
  type StatusControl,
  type StatusFeedback,
} from "./use-staff-kitchen-actions";

// The select and the button that set a sent request's status (Lot 3 frames S3B and S3G). Any listed status may follow any
// other. A status the stored text names but this build does not is shown by the page as the neutral badge, and the select
// then shows nothing chosen: it never pretends to hold a status it cannot name. Only a sent kitchen has this control; the
// page says why a draft has none.

export interface StaffStatusControlProps {
  readonly designId: string;
  /** What the page read: `null` while no status was ever saved, and then the kitchen shows as new. */
  readonly status: StaffKitchenStatusWire | null;
  readonly editing: KitchenEditing;
}

export function StaffStatusControl({
  designId,
  status,
  editing,
}: StaffStatusControlProps) {
  const control = useStatusControl({
    designId,
    initial: listedStatusOf(status),
    editing,
  });
  return (
    <div className={styles.statusControl} data-testid="staff-status-control">
      <StatusFields control={control} />
      <StatusNotice feedback={control.feedback} />
    </div>
  );
}

/** The status the select holds at first: the one the page read when this build names it, and nothing for a stored text it
 *  does not name or for none at all, so the select never says what the badge beside it does not. */
function listedStatusOf(
  status: StaffKitchenStatusWire | null,
): StatusControl["selected"] {
  if (status === null || status.value === "unrecognised") return null;
  return status.value;
}

function StatusFields({ control }: { readonly control: StatusControl }) {
  const copy = useStaffActionsCopy();
  const lists = useStaffKitchensCopy();
  const kit = useAccountKitCopy();
  const selectId = useId();
  const errorId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  useFocusOnRequest(control.focusRequest, selectRef);
  const { feedback } = control;
  const issue = feedback.kind === "status-refused" ? feedback.issue : undefined;
  return (
    <div
      className={styles.statusField}
      data-invalid={issue === undefined ? undefined : "true"}
    >
      <label htmlFor={selectId} className={styles.composerLabel}>
        {copy.status.selectLabel}
      </label>
      <div className={styles.statusRow}>
        <select
          ref={selectRef}
          id={selectId}
          className={styles.select}
          value={control.selected ?? ""}
          disabled={control.isBusy}
          aria-invalid={issue === undefined ? undefined : true}
          aria-describedby={issue === undefined ? undefined : errorId}
          onChange={(event) => {
            control.choose(event.target.value);
          }}
        >
          {control.selected === null ? (
            <option value="" disabled>
              {copy.status.placeholder}
            </option>
          ) : null}
          {REQUEST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {lists.statuses[value]}
            </option>
          ))}
        </select>
        <SaveButton control={control} />
      </div>
      {issue === undefined ? null : (
        <InlineRefusal id={errorId}>{kit.fieldError(issue)}</InlineRefusal>
      )}
    </div>
  );
}

/** "Salvează", then "Se salvează…", then "✓ Status salvat" until the choice changes. The button stays the same element in all
 *  three, so the focus a press left on it is not dropped; it is `aria-disabled` and not `disabled` for the same reason. */
function SaveButton({ control }: { readonly control: StatusControl }) {
  const copy = useStaffActionsCopy();
  const { feedback, isBusy } = control;
  const isSaved = feedback.kind === "saved";
  const waitEndsAtMs = fullWaitOfFeedback(feedback)?.endsAtMs;
  const isWaiting = useSecondsUntil(waitEndsAtMs) > 0;
  const isOff = isBusy || isSaved || isWaiting;
  return (
    <button
      type="button"
      className={styles.statusButton}
      data-state={isSaved ? "saved" : isBusy ? "busy" : "idle"}
      aria-disabled={isOff ? true : undefined}
      aria-busy={isBusy ? true : undefined}
      onClick={isOff ? undefined : control.save}
    >
      {isBusy ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {isSaved
        ? copy.status.saved
        : isBusy
          ? copy.status.saving
          : copy.status.save}
    </button>
  );
}

/** The words under the select: the saved confirmation for a screen reader, and every answer that is not about the choice. */
function StatusNotice({ feedback }: { readonly feedback: StatusFeedback }) {
  const copy = useStaffActionsCopy();
  switch (feedback.kind) {
    case "saved":
      return (
        <p role="status" className={styles.visuallyHidden}>
          {copy.status.saved}
        </p>
      );
    case "conflict":
      return (
        <FormNotice tone="warning">
          {conflictSentence(copy.status, feedback)}
        </FormNotice>
      );
    case "rate-limited":
      return <RateLimitNotice notice={feedback.notice} />;
    case "failed":
      return (
        <FormNotice tone="error" title={copy.status.errorTitle}>
          {copy.status.errorBody}
        </FormNotice>
      );
    case "forbidden":
      return (
        <FormNotice tone="error" title={copy.status.errorTitle}>
          {copy.status.forbiddenBody}
        </FormNotice>
      );
    case "kitchen-unavailable":
      return (
        <FormNotice tone="error" title={copy.status.errorTitle}>
          {copy.status.kitchenGoneBody}
        </FormNotice>
      );
    case "none":
    case "status-refused":
      return null;
  }
}

/** The sentence that says the kitchen was read again is told only when it was; else the one that sends the person to the page. */
function conflictSentence(
  status: ReturnType<typeof useStaffActionsCopy>["status"],
  { conflict, isReread }: Extract<StatusFeedback, { kind: "conflict" }>,
): string {
  switch (conflict) {
    case "changed-meanwhile":
      return isReread ? status.changedMeanwhile : status.changedMeanwhileUnread;
    case "status-not-recognised":
      return status.notRecognised;
    case "not-sent":
      return isReread ? status.notSent : status.notSentUnread;
  }
}

function useFocusOnRequest(
  focusRequest: number,
  selectRef: RefObject<HTMLSelectElement | null>,
): void {
  useEffect(() => {
    if (focusRequest > 0) selectRef.current?.focus();
  }, [focusRequest, selectRef]);
}
