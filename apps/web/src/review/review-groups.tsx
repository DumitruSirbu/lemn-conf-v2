"use client";

import type { DesignId } from "@lemnaria/configurator-domain";

import styles from "@/app/d/[id]/review/review.module.css";
import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import type {
  BreakdownGroup,
  BreakdownRow,
} from "@/price/price-breakdown-model";

/** What the editor is asked to do on arrival: select one body, or open the whole-kitchen settings. */
export interface EditorArrival {
  readonly select?: string;
  readonly settings?: "open";
}

/** The design's editor, optionally asking it to select a body or open its settings. The editor honours the
 *  parameters once, on arrival. */
export function editorHref(designId: DesignId, arrival: EditorArrival = {}) {
  return { pathname: `/d/${designId}`, query: { ...arrival } };
}

export interface ReviewGroupsProps {
  readonly designId: DesignId;
  readonly groups: readonly BreakdownGroup[];
  /** The rows of bodies the refusal names, which are marked and tied to the sentence that says why. */
  readonly markedPlacementIds: ReadonlySet<string>;
  readonly refusalSentenceId: string;
}

/** The rows exactly as the breakdown builds them, one per body, grouped as the editor groups them; each group's
 *  *Editează* opens the editor with the group's first body selected. */
export function ReviewGroups({
  designId,
  groups,
  markedPlacementIds,
  refusalSentenceId,
}: ReviewGroupsProps) {
  return groups.map((group) => (
    <ReviewGroup
      key={group.key}
      designId={designId}
      group={group}
      markedPlacementIds={markedPlacementIds}
      refusalSentenceId={refusalSentenceId}
    />
  ));
}

/** Hardware and material, then the accessories billed per sink, after every body's row. */
export function ReviewWholeKitchenRows({
  rows,
}: {
  readonly rows: readonly BreakdownRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <ul className={styles.wholeKitchen} data-testid="review-whole-kitchen">
      {rows.map((row) => (
        <ReviewRow key={row.key} row={row} />
      ))}
    </ul>
  );
}

function ReviewGroup({
  designId,
  group,
  markedPlacementIds,
  refusalSentenceId,
}: {
  readonly designId: DesignId;
  readonly group: BreakdownGroup;
  readonly markedPlacementIds: ReadonlySet<string>;
  readonly refusalSentenceId: string;
}) {
  const content = useContent();
  const headingId = `review-group-${group.key}`;
  const firstBody = group.rows[0];
  return (
    <section
      className={styles.group}
      aria-labelledby={headingId}
      data-testid="review-group"
    >
      <div className={styles.groupHead}>
        <h2 id={headingId} className={styles.groupHeading}>
          {group.heading}
        </h2>
        {firstBody === undefined ? null : (
          <Link
            prefetch={false}
            className={styles.action}
            href={editorHref(designId, { select: firstBody.key })}
            aria-describedby={headingId}
            data-testid="review-group-edit"
          >
            {content.reviewScreen.editGroup}
          </Link>
        )}
      </div>
      <ul className={styles.rows}>
        {group.rows.map((row) => (
          <ReviewRow
            key={row.key}
            row={row}
            {...(markedPlacementIds.has(row.key) ? { refusalSentenceId } : {})}
          />
        ))}
      </ul>
    </section>
  );
}

function ReviewRow({
  row,
  refusalSentenceId,
}: {
  readonly row: BreakdownRow;
  readonly refusalSentenceId?: string;
}) {
  const isMarked = refusalSentenceId !== undefined;
  return (
    <li
      className={styles.row}
      data-testid="review-row"
      data-marked={isMarked ? "true" : undefined}
      aria-describedby={refusalSentenceId}
    >
      <span className={styles.rowLabel} data-testid="review-row-label">
        {isMarked ? (
          <span className={styles.rowMark} aria-hidden="true">
            !
          </span>
        ) : null}
        {row.label}
      </span>
      <span className={styles.rowAmount} data-testid="review-row-amount">
        {row.amountText}
      </span>
    </li>
  );
}
