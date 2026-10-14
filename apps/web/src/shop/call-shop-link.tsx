"use client";

import { useContent } from "@/i18n/use-content";

import styles from "./call-shop-link.module.css";
import { shopTelAddress } from "./shop-phone";

/**
 * The one way to ring the shop: frame 5B's card, a link whose address comes from `shop-phone.ts` and nowhere else
 * (8M2.1, 8M2.8). Drawn on the already-sent view, on frame 5B and on the page that cannot take a request, and on no
 * other screen.
 */
export function CallShopLink() {
  const content = useContent().submissionResult;
  return (
    <a
      className={styles.callShop}
      href={shopTelAddress()}
      data-testid="call-shop-link"
    >
      <span>{content.callShop}</span>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
    </a>
  );
}
