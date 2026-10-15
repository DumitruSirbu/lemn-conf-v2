"use client";

import { useContent } from "@/i18n/use-content";

import styles from "./call-shop-link.module.css";
import { shopTelAddress } from "./shop-phone";

/** The one way to ring the shop: frame 5B's card, a link whose address comes from `shop-phone.ts` and nowhere else. */
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
