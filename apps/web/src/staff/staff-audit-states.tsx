"use client";

import { useStaffAuditCopy } from "@/i18n/use-content";

import styles from "./staff-audit.module.css";
import listStyles from "./staff-kitchens.module.css";
import { FailedList, useTextAfterFirstPaint } from "./staff-kitchens-states";

// What the audit page shows in place of rows (frames S8A, S8C, S8D, S8E): the skeleton while a page is out, the words of a
// log with nothing in it, of filters that matched nothing, and of a page that could not be shown.

const SKELETON_ROW_COUNT = 7;

/** The words are a live region for a screen reader; the rows are only for the eye (frame S8A). */
export function LoadingAudit() {
  const copy = useStaffAuditCopy();
  const announcement = useTextAfterFirstPaint(copy.loading);
  return (
    <>
      <p role="status" className={listStyles.visuallyHidden}>
        {announcement}
      </p>
      <ul
        className={styles.skeletonRows}
        aria-hidden="true"
        data-testid="staff-audit-skeleton"
      >
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
          <li key={index} className={styles.skeletonRow}>
            <span className={styles.skeletonLine} data-size="when" />
            <span className={styles.skeletonLine} data-size="who" />
            <span className={styles.skeletonLine} data-size="action" />
            <span className={styles.skeletonLine} data-size="object" />
          </li>
        ))}
      </ul>
    </>
  );
}

/** A log with nothing in it, at all (frame S8C): one sentence and no call to action. */
export function EmptyLog() {
  const copy = useStaffAuditCopy().empty;
  return (
    <section className={listStyles.state} data-testid="staff-audit-empty">
      <span className={listStyles.stateMark} aria-hidden="true" />
      <h2 className={listStyles.stateTitle}>{copy.title}</h2>
      <p className={listStyles.stateBody}>{copy.body}</p>
    </section>
  );
}

/** Filters that matched nothing, and the one press that drops them (frame S8D). */
export function NoResults({
  onClearFilters,
}: {
  readonly onClearFilters: () => void;
}) {
  const copy = useStaffAuditCopy();
  return (
    <section className={listStyles.state} data-testid="staff-audit-no-results">
      <span
        className={listStyles.stateMark}
        data-mark="search"
        aria-hidden="true"
      />
      <h2 className={listStyles.stateTitle}>{copy.noResults.title}</h2>
      <p className={listStyles.stateBody}>{copy.noResults.body}</p>
      <button
        type="button"
        className={listStyles.stateAction}
        onClick={onClearFilters}
      >
        {copy.filters.clear}
      </button>
    </section>
  );
}

/** A page that holds no row though the log holds some: the page could not be shown, and the way on is the first page. */
export function PageWithoutEvents({
  onShowFirstPage,
}: {
  readonly onShowFirstPage: () => void;
}) {
  return (
    <div data-testid="staff-audit-page-unshown">
      <FailedList failure={{ kind: "failed" }} onRetry={onShowFirstPage} />
    </div>
  );
}
