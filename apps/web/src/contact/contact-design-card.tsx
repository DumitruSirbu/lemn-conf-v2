import type { AvailableReview } from "@/review/review-model";

import styles from "./contact.module.css";

/**
 * Frame 4A's card: what is being sent, in the review's own words and figure. Both come from the review value the
 * screen already holds, so the card shows the same copy the press sends and no price of its own. The square is the
 * frame's neutral stand-in and carries no meaning.
 */
export function ContactDesignCard({
  review,
}: {
  readonly review: AvailableReview;
}) {
  return (
    <div className={styles.card} data-testid="contact-design-card">
      <span className={styles.cardSquare} aria-hidden="true" />
      <div className={styles.cardText}>
        <span className={styles.cardRoom} data-section="roomLine">
          {review.roomLine}
        </span>
        <span className={styles.cardFigure} data-section="figure">
          {review.figure.label} {review.figure.amountText}
        </span>
      </div>
    </div>
  );
}
