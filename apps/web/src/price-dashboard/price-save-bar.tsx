"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import type { AppLocale } from "@/i18n/routing";

import styles from "./item-screen.module.css";
import editStyles from "./price-edit.module.css";
import { publishPathOf } from "./publish-paths";

// The Save and Cancel of an item's own page, and the notice that replaces them once the price is in "De publicat".

export interface PriceSaveBarProps {
  readonly locale: AppLocale;
  /** The last Save landed and nothing has been typed since: the notice stands in place of the buttons. */
  readonly isSaved: boolean;
  readonly canSave: boolean;
  /** Something typed cannot be sent as it stands: the page says to correct it before saving. */
  readonly mustFix: boolean;
  /** There is something to take back: a change typed, a refused value or a failed Save. */
  readonly canCancel: boolean;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

export function PriceSaveBar({
  locale,
  isSaved,
  canSave,
  mustFix,
  canCancel,
  onSave,
  onCancel,
}: PriceSaveBarProps) {
  const translate = useTranslations();
  const savedNoticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Save leaves the page with the notice that replaces it; focus lost with it goes to the notice, not the body.
    if (isSaved && document.activeElement === document.body) {
      savedNoticeRef.current?.focus();
    }
  }, [isSaved]);
  if (isSaved) {
    return (
      <div
        ref={savedNoticeRef}
        tabIndex={-1}
        className={styles.saved}
        role="status"
      >
        <p>{translate("priceDashboard.common.priceSavedNotice")}</p>
        <a className={styles.savedLink} href={publishPathOf(locale)}>
          {translate("priceDashboard.nav.publish")}
        </a>
      </div>
    );
  }
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={editStyles.action}
        data-tone="primary"
        disabled={!canSave}
        onClick={onSave}
      >
        {translate("priceDashboard.common.save")}
      </button>
      {canCancel ? (
        <button type="button" className={editStyles.action} onClick={onCancel}>
          {translate("priceDashboard.common.cancel")}
        </button>
      ) : null}
      {mustFix ? (
        <p className={styles.fixToSave}>
          {translate("priceDashboard.errors.fixToSave")}
        </p>
      ) : null}
    </div>
  );
}
