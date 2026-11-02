"use client";

import { useTranslations } from "next-intl";
import type { RefObject } from "react";

import { FormNotice } from "@/account/account-form-parts";

import styles from "./publish.module.css";

/** A draft that cannot be shown or published, told with the one way out: giving it up, which is asked before it is sent. */
export function DiscardNotice({
  title,
  body,
  buttonRef,
  onDiscard,
}: {
  readonly title: string;
  readonly body: string;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly onDiscard: () => void;
}) {
  const translate = useTranslations();
  return (
    <div data-testid="publish-discard-notice">
      <FormNotice tone="error" title={title}>
        {body}
        <span className={styles.noticeActions}>
          <button
            ref={buttonRef}
            type="button"
            className={styles.secondary}
            onClick={onDiscard}
          >
            {translate("priceDashboard.publish.discardAction")}
          </button>
        </span>
      </FormNotice>
    </div>
  );
}
