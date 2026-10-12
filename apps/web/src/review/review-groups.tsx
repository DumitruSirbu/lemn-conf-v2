"use client";

import type { DesignId } from "@lemnaria/configurator-domain";

import styles from "@/app/d/[id]/review/review.module.css";
import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import type {
  BreakdownGroup,
  BreakdownRow,
} from "@/price/price-breakdown-model";

import { editorHref, type EditorArrival } from "./design-hrefs";
import { rowDetailOf, type ReviewRowDetail } from "./review-model";

export interface ReviewGroupsProps {
  readonly designId: DesignId;
  readonly groups: readonly BreakdownGroup[];
  /** Each body's two lines by placement id, the model's words. */
  readonly rowDetails: Readonly<Record<string, ReviewRowDetail>>;
  /** The rows of bodies the refusal names, which are marked and tied to the sentence that says why. */
  readonly markedPlacementIds: ReadonlySet<string>;
  readonly refusalSentenceId: string;
}

/** The rows exactly as the breakdown builds them, one per body, grouped as the editor groups them; each group's
 *  *Editează* opens the editor with the group's first body selected. */
export function ReviewGroups({
  designId,
  groups,
  rowDetails,
  markedPlacementIds,
  refusalSentenceId,
}: ReviewGroupsProps) {
  return groups.map((group) => (
    <ReviewGroup
      key={group.key}
      designId={designId}
      group={group}
      rowDetails={rowDetails}
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

/** The arrival that selects the first of these rows' bodies; with no row there is no body to name, and it is none. */
export function selectingTheFirstBody(
  rows: readonly BreakdownRow[],
): EditorArrival {
  const firstBody = rows[0];
  return firstBody === undefined ? {} : { select: firstBody.key };
}

function ReviewGroup({
  designId,
  group,
  rowDetails,
  markedPlacementIds,
  refusalSentenceId,
}: {
  readonly designId: DesignId;
  readonly group: BreakdownGroup;
  readonly rowDetails: Readonly<Record<string, ReviewRowDetail>>;
  readonly markedPlacementIds: ReadonlySet<string>;
  readonly refusalSentenceId: string;
}) {
  const content = useContent();
  const headingId = `review-group-${group.key}`;
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
        {group.rows.length === 0 ? null : (
          <Link
            prefetch={false}
            className={styles.action}
            href={editorHref(designId, selectingTheFirstBody(group.rows))}
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
            detail={rowDetailOf(rowDetails, row.key)}
            {...(markedPlacementIds.has(row.key) ? { refusalSentenceId } : {})}
          />
        ))}
      </ul>
    </section>
  );
}

function ReviewRow({
  row,
  detail,
  refusalSentenceId,
}: {
  readonly row: BreakdownRow;
  /** The body's two lines. A whole-kitchen row is not a body and has none: it is its label alone. */
  readonly detail?: ReviewRowDetail;
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
        {detail === undefined ? (
          row.label
        ) : (
          <span className={styles.rowText}>
            <span data-testid="review-row-name">{detail.name}</span>
            <span className={styles.rowFacts} data-testid="review-row-facts">
              {detail.facts.map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </span>
          </span>
        )}
      </span>
      <span className={styles.rowAmount} data-testid="review-row-amount">
        {row.amountText}
      </span>
    </li>
  );
}
