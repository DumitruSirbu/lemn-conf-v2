"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

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
import type { KitchenEditing } from "./use-one-write-at-a-time";
import {
  useStatusControl,
  type StatusControl,
  type StatusFeedback,
} from "./use-status-control";

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
          <StatusOptions hasNothingChosen={control.selected === null} />
        </select>
        <SaveButton control={control} />
      </div>
      {issue === undefined ? null : (
        <InlineRefusal id={errorId}>{kit.fieldError(issue)}</InlineRefusal>
      )}
    </div>
  );
}

function StatusOptions({
  hasNothingChosen,
}: {
  readonly hasNothingChosen: boolean;
}) {
  const copy = useStaffActionsCopy();
  const lists = useStaffKitchensCopy();
  return (
    <>
      {hasNothingChosen ? (
        <option value="" disabled>
          {copy.status.placeholder}
        </option>
      ) : null}
      {REQUEST_STATUSES.map((value) => (
        <option key={value} value={value}>
          {lists.statuses[value]}
        </option>
      ))}
    </>
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
      data-state={stateOf({ isSaved, isBusy })}
      aria-disabled={isOff ? true : undefined}
      aria-busy={isBusy ? true : undefined}
      onClick={isOff ? undefined : control.save}
    >
      {isBusy ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {copy.status[LABEL_OF_STATE[stateOf({ isSaved, isBusy })]]}
    </button>
  );
}

type ButtonState = "saved" | "busy" | "idle";

const LABEL_OF_STATE = {
  saved: "saved",
  busy: "saving",
  idle: "save",
} as const satisfies Record<ButtonState, string>;

function stateOf({
  isSaved,
  isBusy,
}: {
  readonly isSaved: boolean;
  readonly isBusy: boolean;
}): ButtonState {
  if (isSaved) return "saved";
  return isBusy ? "busy" : "idle";
}

/**
 * The words under the select. What is announced politely (the saved word, a conflict, a limit being waited out) stands in a
 * status region that is mounted before any of it comes; a region that appears together with its words is not reliably
 * announced. The refusals that are not about the choice are alerts.
 */
function StatusNotice({ feedback }: { readonly feedback: StatusFeedback }) {
  return (
    <>
      <div
        role="status"
        className={
          feedback.kind === "saved"
            ? `${styles.liveRegion ?? ""} ${styles.visuallyHidden ?? ""}`
            : styles.liveRegion
        }
      >
        <StatusAnnouncement feedback={feedback} />
      </div>
      <StatusAlert feedback={feedback} />
    </>
  );
}

function StatusAnnouncement({
  feedback,
}: {
  readonly feedback: StatusFeedback;
}): ReactNode {
  const copy = useStaffActionsCopy();
  switch (feedback.kind) {
    case "saved":
      return copy.status.saved;
    case "conflict":
      return (
        <FormNotice tone="warning" isInLiveRegion>
          {conflictSentence(copy.status, feedback)}
        </FormNotice>
      );
    case "rate-limited":
      return <RateLimitNotice notice={feedback.notice} isInLiveRegion />;
    default:
      return null;
  }
}

function StatusAlert({ feedback }: { readonly feedback: StatusFeedback }) {
  const copy = useStaffActionsCopy();
  switch (feedback.kind) {
    case "failed":
      return <ErrorNotice body={copy.status.errorBody} />;
    case "forbidden":
      return <ErrorNotice body={copy.status.forbiddenBody} />;
    case "kitchen-unavailable":
      return <ErrorNotice body={copy.status.kitchenGoneBody} />;
    default:
      return null;
  }
}

function ErrorNotice({ body }: { readonly body: string }) {
  const copy = useStaffActionsCopy();
  return (
    <FormNotice tone="error" title={copy.status.errorTitle}>
      {body}
    </FormNotice>
  );
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
