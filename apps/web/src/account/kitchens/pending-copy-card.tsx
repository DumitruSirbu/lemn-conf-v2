"use client";

import { useAccountKitchensCopy } from "@/i18n/use-content";

import styles from "./kitchens.module.css";
import type { PendingCopy } from "./use-kitchen-actions";

// The copy that is being made (Lot 2 frame A9F): a draft card at the head of the list with its name, until the server
// answers and the real card takes its place.

export function PendingCopyCard({
  pending,
}: {
  readonly pending: PendingCopy;
}) {
  const copy = useAccountKitchensCopy();
  return (
    <li className={styles.item}>
      <article className={styles.card} aria-busy="true">
        <div className={styles.cardMain}>
          <span className={styles.thumb} aria-hidden="true" />
          <div className={styles.cardInfo}>
            <span className={styles.badge} data-kind="draft">
              {copy.draftBadge}
            </span>
            <h2 className={styles.name}>{pending.name}</h2>
          </div>
        </div>
        <div role="status" className={styles.busyLine}>
          <span className={styles.busySpinner} aria-hidden="true" />
          {copy.duplicate.pending}
        </div>
      </article>
    </li>
  );
}
