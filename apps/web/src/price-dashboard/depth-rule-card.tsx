"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type RefObject } from "react";

import {
  DEEP_CABINET_DEPTH_MM,
  TEN_LEI_MINOR,
} from "@lemnaria/configurator-domain";

import { formatLei } from "./format-lei";
import { PERCENT_UNIT, PriceUnitField } from "./price-unit-field";
import {
  depthPercentRefusalWords,
  depthWriteFailureWords,
  type FailedFieldWrite,
} from "./price-input-words";
import { readDepthPercentInput } from "./price-field-input";
import styles from "./price-edit.module.css";
import type { FieldWriteResult } from "./use-price-draft";

// Frames D2E1 to D2E3: the percentage the deep kitchen adds to the cabinets that get deeper, from 0 to the book's greatest.
// The field says why a value is wrong as it is typed and keeps Save off until it is right; a saved value goes to "De
// publicat" and the card says so. The card also carries the way to the bulk dialog, as the frame draws it.

export interface DepthRuleCardProps {
  /** The percentage in the active version. */
  readonly activePercent: number;
  /** The percentage once the draft is applied. */
  readonly pendingPercent: number;
  readonly isBusy: boolean;
  readonly onSave: (percent: number) => Promise<FieldWriteResult>;
  readonly onOpenBulk: () => void;
  /** The button that opens the bulk dialog, for the focus to return to when a press did not focus it. */
  readonly bulkButtonRef: RefObject<HTMLButtonElement | null>;
}

type SaveFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "saved" }
  | { readonly kind: "failed"; readonly failure: FailedFieldWrite };

export function DepthRuleCard({
  activePercent,
  pendingPercent,
  isBusy,
  onSave,
  onOpenBulk,
  bulkButtonRef,
}: DepthRuleCardProps) {
  const translate = useTranslations();
  const titleId = useId();
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<SaveFeedback>({ kind: "none" });
  const isPending = pendingPercent !== activePercent;
  const value = typed ?? String(pendingPercent);
  const reading = readDepthPercentInput(value);
  const isChanged =
    typed !== undefined &&
    !(reading.kind === "percent" && reading.percent === pendingPercent);
  const error =
    reading.kind === "refused"
      ? depthPercentRefusalWords(translate, reading.refusal)
      : feedback.kind === "failed"
        ? depthWriteFailureWords(translate, feedback.failure)
        : undefined;

  const save = async () => {
    if (reading.kind !== "percent" || isBusy) return;
    const result = await onSave(reading.percent);
    if (result.kind === "busy") return;
    if (result.kind === "unchanged") {
      setTyped(undefined);
    } else if (result.kind === "saved") {
      setTyped(undefined);
      setFeedback({ kind: "saved" });
    } else {
      setFeedback({ kind: "failed", failure: result });
    }
  };

  return (
    <section
      className={styles.ruleCard}
      data-pending={isPending}
      data-testid="depth-rule-card"
      aria-labelledby={titleId}
    >
      <div className={styles.ruleHead}>
        <div className={styles.ruleTitles}>
          <h2 id={titleId} className={styles.ruleTitle}>
            {translate("priceDashboard.rule.title")}
          </h2>
          <p className={styles.ruleSubtitle}>
            {translate("priceDashboard.rule.subtitle")}
          </p>
        </div>
        {isPending ? (
          <span className={styles.ruleChip}>
            {translate("priceDashboard.chips.pending")}
          </span>
        ) : null}
        <button
          ref={bulkButtonRef}
          type="button"
          className={styles.action}
          onClick={onOpenBulk}
        >
          {translate("priceDashboard.cabinets.bulkAction")}
        </button>
      </div>

      <div className={styles.ruleBody}>
        <div className={styles.ruleField}>
          <PriceUnitField
            label={translate("priceDashboard.rule.deepKitchenLabel", {
              depthMm: DEEP_CABINET_DEPTH_MM,
            })}
            unit={PERCENT_UNIT}
            inputMode="numeric"
            value={value}
            hint={`${translate("priceDashboard.rule.activeValue", {
              percent: String(activePercent),
            })} ${translate("priceDashboard.rule.hint", {
              roundTo: formatLei(
                TEN_LEI_MINOR,
                translate("priceDashboard.units.currency"),
              ),
            })}`}
            error={error}
            isPending={isChanged || isPending}
            onChange={(next) => {
              setTyped(next);
              setFeedback({ kind: "none" });
            }}
          />
        </div>
        {isChanged ? (
          <div className={styles.ruleActions}>
            <button
              type="button"
              className={styles.action}
              data-tone="primary"
              disabled={reading.kind === "refused" || isBusy}
              onClick={() => {
                void save();
              }}
            >
              {translate("priceDashboard.common.save")}
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setTyped(undefined);
                setFeedback({ kind: "none" });
              }}
            >
              {translate("priceDashboard.common.cancel")}
            </button>
          </div>
        ) : null}
      </div>

      {feedback.kind === "saved" && !isChanged ? (
        <p className={styles.ruleNotice} role="status">
          {translate("priceDashboard.rule.savedNotice")}
        </p>
      ) : null}
    </section>
  );
}
