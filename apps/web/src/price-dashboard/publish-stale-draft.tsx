"use client";

import { useTranslations } from "next-intl";
import type { RefObject } from "react";

import { FormNotice } from "@/account/account-form-parts";
import { isolated } from "@/staff/bidi-isolate";

import type { DraftRevertTargetWire } from "./price-dashboard-wire-contract";
import { useRowWords } from "./publish-row-words";
import { RevertButton } from "./publish-rows";
import styles from "./publish.module.css";
import type { StaleChangeView, StaleDraftView } from "./stale-draft";

/** A draft that no longer makes a book: each change with its own ↺, and the one way out that always works. */
export function StaleDraft({
  stale,
  isBusy,
  onRevert,
  buttonRef,
  onDiscard,
}: {
  readonly stale: StaleDraftView;
  readonly isBusy: boolean;
  readonly onRevert: (target: DraftRevertTargetWire) => void;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly onDiscard: () => void;
}) {
  const translate = useTranslations();
  return (
    <div data-testid="publish-discard-notice">
      <FormNotice
        tone="error"
        title={translate("priceDashboard.publish.staleDraftTitle")}
      >
        {stale.kind === "whole-book"
          ? translate("priceDashboard.publish.staleDraftWholeBook")
          : translate("priceDashboard.publish.staleDraftBody")}
        {stale.kind === "whole-book" ? null : (
          <ul className={styles.staleList} data-testid="publish-stale-changes">
            {stale.lines.map((change) => (
              <StaleChangeLine
                key={change.key}
                change={change}
                isBusy={isBusy}
                onRevert={onRevert}
              />
            ))}
          </ul>
        )}
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

function StaleChangeLine({
  change,
  isBusy,
  onRevert,
}: {
  readonly change: StaleChangeView;
  readonly isBusy: boolean;
  readonly onRevert: (target: DraftRevertTargetWire) => void;
}) {
  const translate = useTranslations();
  const words = useRowWords();
  const name = isolated(words.subject(change.subject));
  return (
    <li className={styles.staleLine} data-refused={change.isRefused}>
      <span className={styles.staleLineText}>
        {translate(lineKeyOf(change), { name })}
      </span>
      <RevertButton
        target={change.revert}
        name={name}
        onRevert={onRevert}
        isBusy={isBusy}
      />
    </li>
  );
}

function lineKeyOf(change: StaleChangeView) {
  if (change.revert === undefined) {
    return "priceDashboard.publish.staleChangeWholeDraftOnly";
  }
  return change.isRefused
    ? "priceDashboard.publish.refusalChange"
    : "priceDashboard.publish.staleChangeKept";
}
