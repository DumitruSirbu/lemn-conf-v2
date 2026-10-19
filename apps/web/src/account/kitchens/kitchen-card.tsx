"use client";

import { useEffect, useId, useRef } from "react";

import type { AppLocale } from "@/i18n/routing";
import { useAccountKitchensCopy } from "@/i18n/use-content";

import type { ListedKitchen } from "./kitchens-answer";
import {
  formatRelativeAge,
  IS_SENT_MARK_WRITTEN,
  relativeAgeOf,
} from "./kitchen-summary";
import styles from "./kitchens.module.css";

// One kitchen of the list (ContBlocks2's card). It opens the kitchen by a full document load: the editor is a page with
// a policy of its own, and an account page never makes a client-side navigation. The thumbnail is a placeholder until the
// product renders pictures (plan C2).

export interface KitchenCardProps {
  readonly kitchen: ListedKitchen;
  readonly locale: AppLocale;
  /** The moment the list was read, which "modified 2 days ago" is told against. */
  readonly readAtMs: number;
  /** Takes focus once, when it appears: the first kitchen of a page the person asked for. */
  readonly takesFocus: boolean;
}

export function KitchenCard({
  kitchen,
  locale,
  readAtMs,
  takesFocus,
}: KitchenCardProps) {
  const copy = useAccountKitchensCopy();
  const nameId = useId();
  const openRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (takesFocus) openRef.current?.focus();
  }, [takesFocus]);
  const name = kitchen.name ?? copy.kitchenName(kitchen.summary);
  const age = relativeAgeOf(kitchen.updatedAtMs, readAtMs);
  return (
    <li className={styles.item}>
      <article className={styles.card} aria-labelledby={nameId}>
        <div className={styles.cardMain}>
          <span className={styles.thumb} aria-hidden="true" />
          <div className={styles.cardInfo}>
            <StatusBadge isSent={kitchen.isSent} />
            <h2 id={nameId} className={styles.name}>
              {name}
            </h2>
            <span className={styles.meta}>{copy.meta(kitchen.summary)}</span>
            <time className={styles.modified} dateTime={kitchen.updatedAtIso}>
              {copy.modified(formatRelativeAge(locale, age))}
            </time>
          </div>
        </div>
        <a
          ref={openRef}
          className={styles.open}
          href={`/${locale}/d/${kitchen.id}`}
          aria-label={copy.openNamed(name)}
        >
          {copy.open}
        </a>
      </article>
    </li>
  );
}

/** "Trimisă" for a kitchen whose request was sent. A kitchen that was not sent is a draft only once the product can tell
 *  the two apart (`IS_SENT_MARK_WRITTEN`); before that it carries no badge. */
function StatusBadge({ isSent }: { readonly isSent: boolean }) {
  const copy = useAccountKitchensCopy();
  if (isSent) {
    return (
      <span className={styles.badge} data-kind="sent">
        {copy.sentBadge}
      </span>
    );
  }
  return IS_SENT_MARK_WRITTEN ? (
    <span className={styles.badge} data-kind="draft">
      {copy.draftBadge}
    </span>
  ) : null;
}
