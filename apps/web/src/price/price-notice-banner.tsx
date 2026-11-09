"use client";

import { usePriceNoticeCopy } from "@/i18n/use-content";

import styles from "./price-notice-banner.module.css";
import type { PriceNoticeBanner as PriceNoticeBannerModel } from "./use-price-notice";

/**
 * Frame C1: the one calm notice a saved kitchen's owner is shown after the prices moved, or after an accessory was taken
 * out of the kitchen (ADR 0178 A-11; no red and no old price). *Am înțeles* records that they saw it. Whether there is a
 * notice, and what the accessories are called, are `use-price-notice.ts`'s; this draws what it is given.
 *
 * The region is mounted whether or not there is a notice in it, for the reason `flagged-total-warning.tsx` gives: a
 * region created together with its first message is announced late or not at all.
 */
export function PriceNoticeBanner({
  banner,
  onAcknowledge,
}: {
  readonly banner: PriceNoticeBannerModel | undefined;
  readonly onAcknowledge: () => void;
}) {
  const copy = usePriceNoticeCopy();

  return (
    <div
      className={styles.region}
      role="status"
      data-testid="price-notice-region"
    >
      {banner !== undefined && (
        <section className={styles.card} data-testid="price-notice">
          <span className={styles.glyph} aria-hidden="true" />
          <div className={styles.lines}>
            {banner.pricesChanged && (
              <p className={styles.line} data-testid="price-notice-prices">
                {copy.body}
              </p>
            )}
            {banner.accessoryNames.map((name) => (
              <p
                key={name}
                className={styles.line}
                data-testid="price-notice-accessory"
              >
                {copy.accessoryRemoved(name)}
              </p>
            ))}
          </div>
          <button
            type="button"
            className={styles.acknowledge}
            data-testid="price-notice-acknowledge"
            onClick={onAcknowledge}
          >
            {copy.acknowledge}
          </button>
        </section>
      )}
    </div>
  );
}
