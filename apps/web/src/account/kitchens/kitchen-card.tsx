"use client";

import { useEffect, useId, useMemo, useRef } from "react";

import type { Content } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useAccountKitchensCopy } from "@/i18n/use-content";
import { priceFloorOf } from "@/price/use-priced-design";

import type { ListedKitchen } from "./kitchens-answer";
import {
  describeKitchenPrice,
  formatRelativeAge,
  relativeAgeOf,
  type KitchenPrice,
} from "./kitchen-summary";
import styles from "./kitchens.module.css";
import type { CardFocusRequest } from "./use-kitchens";

// One kitchen of the list (ContBlocks2's card). It opens the kitchen by a full document load: the editor is a page with
// a policy of its own, and an account page never makes a client-side navigation. The thumbnail is a placeholder until the
// product renders pictures (plan C2). The price is the configurator bar's own, worked out from the kitchen's stored
// document in the browser; a kitchen whose document cannot be priced shows none.

export interface KitchenCardProps {
  readonly kitchen: ListedKitchen;
  readonly locale: AppLocale;
  /** The moment the list was read, which "modified 2 days ago" is told against. */
  readonly readAtMs: number;
  /** Takes focus once per request: the first kitchen of a page the person asked for, or the last one shown when that
   *  page added none. */
  readonly focusRequest: CardFocusRequest | undefined;
}

export function KitchenCard({
  kitchen,
  locale,
  readAtMs,
  focusRequest,
}: KitchenCardProps) {
  const copy = useAccountKitchensCopy();
  const nameId = useId();
  const openRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (focusRequest !== undefined) openRef.current?.focus();
  }, [focusRequest]);
  const name = kitchen.name ?? copy.kitchenName(kitchen.summary);
  const age = relativeAgeOf(kitchen.updatedAtMs, readAtMs);
  const price = useMemo(
    () => priceOfKitchen(kitchen, copy.price),
    [kitchen, copy.price],
  );
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
            <div className={styles.cardFoot}>
              <time className={styles.modified} dateTime={kitchen.updatedAtIso}>
                {copy.modified(formatRelativeAge(locale, age))}
              </time>
              {price === undefined ? null : <PriceLine price={price} />}
            </div>
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

function priceOfKitchen(
  kitchen: ListedKitchen,
  priceCopy: Content["price"],
): KitchenPrice | undefined {
  return kitchen.document === undefined
    ? undefined
    : describeKitchenPrice(priceFloorOf(kitchen.document), priceCopy);
}

/** "De la 28 000 MDL", and under it the configurator's own line when the total is flagged. */
function PriceLine({ price }: { readonly price: KitchenPrice }) {
  return (
    <div className={styles.priceBlock}>
      <span className={styles.price}>
        {price.figure.label} {price.figure.amountText}
      </span>
      {price.overflowWarning === undefined ? null : (
        <span className={styles.priceWarning}>{price.overflowWarning}</span>
      )}
    </div>
  );
}

/** "Trimisă" for a kitchen whose request was sent, "Ciornă" for every other. Kitchens sent before the sent mark was
 *  written carry no mark and read as drafts until the owner-run backfill (see the Lot 2 plan, O11). */
function StatusBadge({ isSent }: { readonly isSent: boolean }) {
  const copy = useAccountKitchensCopy();
  return isSent ? (
    <span className={styles.badge} data-kind="sent">
      {copy.sentBadge}
    </span>
  ) : (
    <span className={styles.badge} data-kind="draft">
      {copy.draftBadge}
    </span>
  );
}
