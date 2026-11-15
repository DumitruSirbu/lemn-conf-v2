"use client";

import { useMemo } from "react";

import type { Design } from "@lemnaria/configurator-domain";

import {
  useContent,
  useStaffChangesCopy,
  useStaffKitchenCopy,
  useStaffKitchensCopy,
} from "@/i18n/use-content";
import { usePriceBookRoot } from "@/price/price-book-provider";

import styles from "./staff-cabinet-list.module.css";
import {
  describeStaffSummaryRows,
  type StaffSummaryRow,
} from "./staff-kitchen-view";

// What the copy on screen is made of, in the header of the cabinet list (ADR 0185 decision 6): the room, the settings
// of the whole kitchen and the count of cabinets. The words are `describeStaffSummaryRows`'s, the card's own before the
// card folded into the list.

/** The settings of the whole kitchen, which a change of the cabinets does not show, are the facts the two copies are
 *  compared by. */
const COMPARED_FACTS: readonly StaffSummaryRow["key"][] = [
  "shape",
  "walls",
  "material",
  "hardware",
  "finish",
];

export interface KitchenSettingsProps {
  readonly design: Design;
  /** The other copy of the kitchen, when the page holds both and they differ, so the facts that differ are marked. */
  readonly other: Design | undefined;
  /** The copy on screen is the one as it stands now, which is the one that tells what the sent copy had. */
  readonly isShownCurrent: boolean;
  /** Leaves out the starting price of the copy on screen (and the note that it is not an offer). Only a draft states
   *  one: a kitchen that was ever sent has the price card's estimates, and a copy as sent was not priced with today's
   *  book, so a starting price beside them would be a figure to contradict them. */
  readonly omitsStartingPrice: boolean;
}

export function KitchenSettings({
  design,
  other,
  isShownCurrent,
  omitsStartingPrice,
}: KitchenSettingsProps) {
  const copy = useStaffKitchenCopy();
  const { noValue } = useStaffKitchensCopy();
  const designRows = useSummaryRowsOf(design);
  const otherRows = useSummaryRowsOf(other);
  const rows = useMemo(
    () =>
      designRows.filter((row) => !(omitsStartingPrice && row.key === "price")),
    [designRows, omitsStartingPrice],
  );
  const differing = useMemo(
    () => differingFactsOf({ rows, otherRows, noValue }),
    [rows, otherRows, noValue],
  );
  return (
    <>
      <dl className={styles.settings} data-testid="staff-kitchen-settings">
        {rows.map((row) => (
          <SettingFact
            key={row.key}
            row={row}
            sentValue={isShownCurrent ? differing.get(row.key) : undefined}
            isDiffering={differing.has(row.key)}
          />
        ))}
      </dl>
      {omitsStartingPrice ? null : (
        <p className={styles.note}>{copy.summary.priceNote}</p>
      )}
    </>
  );
}

/** The facts of one copy, worked out with the price book on screen; none for a copy there is not. */
function useSummaryRowsOf(
  design: Design | undefined,
): readonly StaffSummaryRow[] {
  const copy = useStaffKitchenCopy();
  const content = useContent();
  const priceBook = usePriceBookRoot();
  const { noValue } = useStaffKitchensCopy();
  return useMemo(
    () =>
      design === undefined
        ? []
        : describeStaffSummaryRows({
            design,
            priceBook,
            copy,
            content,
            noValue,
          }),
    [design, priceBook, copy, content, noValue],
  );
}

/**
 * The settings of the kitchen that read differently in the other copy, by fact, with what the other copy says. A fact
 * either copy cannot tell (the dash) is not compared: a kitchen the price book cannot price would otherwise differ from
 * every one it can.
 */
function differingFactsOf({
  rows,
  otherRows,
  noValue,
}: {
  readonly rows: readonly StaffSummaryRow[];
  readonly otherRows: readonly StaffSummaryRow[];
  readonly noValue: string;
}): ReadonlyMap<StaffSummaryRow["key"], string> {
  const differing = new Map<StaffSummaryRow["key"], string>();
  for (const row of rows) {
    const other = otherRows.find(({ key }) => key === row.key)?.value;
    const isDiffering =
      COMPARED_FACTS.includes(row.key) &&
      other !== undefined &&
      row.value !== noValue &&
      other !== noValue &&
      other !== row.value;
    if (isDiffering) differing.set(row.key, other);
  }
  return differing;
}

/** One fact of the header. A fact that differs between the copies takes a mark, and beside the current copy it says
 *  what the sent one had (`sentValue`). */
function SettingFact({
  row,
  isDiffering,
  sentValue,
}: {
  readonly row: StaffSummaryRow;
  readonly isDiffering: boolean;
  readonly sentValue: string | undefined;
}) {
  const changes = useStaffChangesCopy().cabinets;
  return (
    <div
      className={styles.setting}
      data-fact={row.key}
      data-differs={isDiffering ? "true" : undefined}
    >
      <dt className={styles.settingLabel}>{row.label}</dt>
      <dd className={styles.settingValue}>
        {row.value}
        {row.sub === undefined ? null : (
          <span className={styles.settingSub}>{row.sub}</span>
        )}
        {isDiffering ? (
          <span className={styles.mark}>{changes.differs}</span>
        ) : null}
        {sentValue === undefined ? null : (
          <span className={styles.settingSub}>
            {changes.wasInSent(sentValue)}
          </span>
        )}
      </dd>
    </div>
  );
}
