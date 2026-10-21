"use client";

import { useId, type RefObject } from "react";

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
  type StaffAudit,
} from "./use-staff-audit";

// The bar over the log (frames S8B and S8D): the person, the action and the two days, each asked for the moment it is
// chosen. The people offered are the ones the rows shown so far named, and they stay offered when one is chosen. A day is
// a Chișinău calendar day, both ends included, in the form a date field holds (`YYYY-MM-DD`); what the field cannot say
// the page says before asking, so a request that the server would refuse is not made.

const FIRST_DAY_ALLOWED = `${String(EARLIEST_FILTER_YEAR)}-01-01`;
const LAST_DAY_ALLOWED = `${String(LATEST_FILTER_YEAR)}-12-31`;

export interface AuditFilterFocusTargets {
  readonly personRef: RefObject<HTMLSelectElement | null>;
}

export type StaffAuditFiltersProps = AuditFilterFocusTargets &
  Pick<
    StaffAudit,
    | "filters"
    | "dateProblem"
    | "actors"
    | "chooseActor"
    | "chooseAction"
    | "chooseFrom"
    | "chooseTo"
  >;

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
  chooseActor,
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
          chooseActor(chosen === undefined ? null : chosen.id);
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
  chooseAction,
}: Pick<StaffAuditFiltersProps, "filters" | "chooseAction">) {
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
          chooseAction(isStaffAuditAction(chosen) ? chosen : null);
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
  chooseFrom,
  chooseTo,
}: Pick<
  StaffAuditFiltersProps,
  "filters" | "dateProblem" | "chooseFrom" | "chooseTo"
>) {
  const copy = useStaffAuditCopy().filters;
  const fromId = useId();
  const toId = useId();
  const problemId = useId();
  const problemText =
    dateProblem?.kind === "inverted"
      ? copy.rangeInverted
      : copy.dayInvalid({
          first: EARLIEST_FILTER_YEAR,
          last: LATEST_FILTER_YEAR,
        });
  const isInvalid = (field: "from" | "to"): true | undefined =>
    dateProblem?.kind === "inverted" ||
    (dateProblem?.kind === "invalid-day" && dateProblem.field === field)
      ? true
      : undefined;
  const describedBy = dateProblem === undefined ? undefined : problemId;
  return (
    <>
      <div className={styles.field} data-width="day">
        <label htmlFor={fromId} className={listStyles.fieldLabel}>
          {copy.from}
        </label>
        <input
          id={fromId}
          type="date"
          className={styles.dayInput}
          min={FIRST_DAY_ALLOWED}
          max={LAST_DAY_ALLOWED}
          value={filters.from}
          aria-invalid={isInvalid("from")}
          aria-describedby={describedBy}
          onChange={(event) => {
            chooseFrom(event.target.value);
          }}
        />
      </div>
      <div className={styles.field} data-width="day">
        <label htmlFor={toId} className={listStyles.fieldLabel}>
          {copy.to}
        </label>
        <input
          id={toId}
          type="date"
          className={styles.dayInput}
          min={FIRST_DAY_ALLOWED}
          max={LAST_DAY_ALLOWED}
          value={filters.to}
          aria-invalid={isInvalid("to")}
          aria-describedby={describedBy}
          onChange={(event) => {
            chooseTo(event.target.value);
          }}
        />
      </div>
      {dateProblem === undefined ? null : (
        <p id={problemId} role="alert" className={styles.problem}>
          {problemText}
        </p>
      )}
    </>
  );
}
