"use client";

import type { DesignId } from "@lemnaria/configurator-domain";

import styles from "@/app/d/[id]/review/review.module.css";
import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import type {
  BreakdownGroup,
  BreakdownRow,
} from "@/price/price-breakdown-model";

import type { ReviewRowDetail } from "./review-model";

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
            {...(rowDetails[row.key] === undefined
              ? {}
              : { detail: rowDetails[row.key] })}
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
  /** The body's two lines; a row without one (a whole-kitchen tier) is its label alone. */
  readonly detail?: ReviewRowDetail | undefined;
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
