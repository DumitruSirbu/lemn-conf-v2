"use client";

import { useId, useRef, useState, type RefObject } from "react";

import {
  STAFF_AUDIT_ACTIONS,
  isStaffAuditAction,
} from "@lemnaria/configurator-domain";

import { useStaffAuditCopy } from "@/i18n/use-content";

import { isolated } from "./bidi-isolate";
import styles from "./staff-audit.module.css";
import listStyles from "./staff-kitchens.module.css";
import {
  EARLIEST_FILTER_YEAR,
  LATEST_FILTER_YEAR,
  isProblemOnField,
} from "./staff-audit-days";
import type { StaffAudit } from "./use-staff-audit";

// The bar over the log (frames S8B and S8D): the person, the action and the two days. The person and the action are asked
// for the moment they are chosen; a day typed by keyboard is asked for when the field is left or Enter is pressed (see
// `DayField`). The people offered are the ones the rows shown so far named, and they stay offered when one is chosen. A day is
// a Chișinău calendar day, both ends included, in the form a date field holds (`YYYY-MM-DD`); what the field cannot say
// the page says before asking, so a request that the server would refuse is not made.

const FIRST_DAY_ALLOWED = `${String(EARLIEST_FILTER_YEAR)}-01-01`;
const LAST_DAY_ALLOWED = `${String(LATEST_FILTER_YEAR)}-12-31`;

export interface AuditFilterFocusTargets {
  readonly personRef: RefObject<HTMLSelectElement | null>;
}

export type StaffAuditFiltersProps = AuditFilterFocusTargets &
  Pick<StaffAudit, "filters" | "dateProblem" | "actors" | "patchFilters">;

export function StaffAuditFilters(props: StaffAuditFiltersProps) {
  return (
    <div className={styles.filters}>
      <PersonChoice {...props} />
      <ActionChoice {...props} />
      <DayChoices {...props} />
    </div>
  );
}

function PersonChoice({
  personRef,
  filters,
  actors,
  patchFilters,
}: StaffAuditFiltersProps) {
  const copy = useStaffAuditCopy().filters;
  const selectId = useId();
  return (
    <div className={styles.field} data-width="wide">
      <label htmlFor={selectId} className={listStyles.fieldLabel}>
        {copy.person}
      </label>
      <select
        ref={personRef}
        id={selectId}
        className={listStyles.statusSelect}
        value={filters.actorId ?? ""}
        onChange={(event) => {
          const chosen = actors.find(({ id }) => id === event.target.value);
          patchFilters({ actorId: chosen === undefined ? null : chosen.id });
        }}
      >
        <option value="">{copy.personAll}</option>
        {actors.map(({ id, email }) => (
          <option key={id} value={id}>
            {isolated(email)}
          </option>
        ))}
      </select>
    </div>
  );
}

function ActionChoice({
  filters,
  patchFilters,
}: Pick<StaffAuditFiltersProps, "filters" | "patchFilters">) {
  const copy = useStaffAuditCopy();
  const selectId = useId();
  return (
    <div className={styles.field} data-width="wide">
      <label htmlFor={selectId} className={listStyles.fieldLabel}>
        {copy.filters.action}
      </label>
      <select
        id={selectId}
        className={listStyles.statusSelect}
        value={filters.action ?? ""}
        onChange={(event) => {
          const chosen = event.target.value;
          patchFilters({ action: isStaffAuditAction(chosen) ? chosen : null });
        }}
      >
        <option value="">{copy.filters.actionAll}</option>
        {STAFF_AUDIT_ACTIONS.map((action) => (
          <option key={action} value={action}>
            {copy.actionLabels.get(action) ?? action}
          </option>
        ))}
      </select>
    </div>
  );
}

function DayChoices({
  filters,
  dateProblem,
  patchFilters,
}: Pick<StaffAuditFiltersProps, "filters" | "dateProblem" | "patchFilters">) {
  const copy = useStaffAuditCopy().filters;
  const problemId = useId();
  const describedBy = dateProblem === undefined ? undefined : problemId;
  const problemText =
    dateProblem?.kind === "inverted"
      ? copy.rangeInverted
      : copy.dayInvalid({
          first: EARLIEST_FILTER_YEAR,
          last: LATEST_FILTER_YEAR,
        });
  return (
    <>
      <DayField
        label={copy.from}
        value={filters.from}
        isInvalid={isProblemOnField(dateProblem, "from")}
        describedBy={describedBy}
        onCommit={(from) => {
          patchFilters({ from });
        }}
      />
      <DayField
        label={copy.to}
        value={filters.to}
        isInvalid={isProblemOnField(dateProblem, "to")}
        describedBy={describedBy}
        onCommit={(to) => {
          patchFilters({ to });
        }}
      />
      {dateProblem === undefined ? null : (
        <p
          id={problemId}
          role="status"
          className={styles.problem}
          data-testid="staff-audit-date-problem"
        >
          {problemText}
        </p>
      )}
    </>
  );
}

/**
 * A date field whose typed days are asked for when the person is done with them, not at each keystroke: every page the
 * server serves writes a row of the log, and a year typed digit by digit is a valid day at three of its four digits. A day
 * typed with the keyboard is held until the field is left or Enter is pressed; a day chosen from the browser's picker, or
 * set from outside (the clear button), is asked for at once.
 */
function DayField({
  label,
  value,
  isInvalid,
  describedBy,
  onCommit,
}: {
  readonly label: string;
  /** The day the log was last asked for, `""` for none. */
  readonly value: string;
  readonly isInvalid: boolean;
  readonly describedBy: string | undefined;
  readonly onCommit: (day: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);
  const [seenValue, setSeenValue] = useState(value);
  const isKeyboardTypingRef = useRef(false);
  if (value !== seenValue) {
    setSeenValue(value);
    setDraft(value);
  }
  const commit = (day: string) => {
    isKeyboardTypingRef.current = false;
    if (day !== value) onCommit(day);
  };
  return (
    <div className={styles.field} data-width="day">
      <label htmlFor={inputId} className={listStyles.fieldLabel}>
        {label}
      </label>
      <input
        id={inputId}
        type="date"
        className={styles.dayInput}
        min={FIRST_DAY_ALLOWED}
        max={LAST_DAY_ALLOWED}
        value={draft}
        aria-invalid={isInvalid ? true : undefined}
        aria-describedby={describedBy}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(draft);
          else isKeyboardTypingRef.current = true;
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!isKeyboardTypingRef.current) commit(event.target.value);
        }}
        onBlur={() => {
          commit(draft);
        }}
      />
    </div>
  );
}
