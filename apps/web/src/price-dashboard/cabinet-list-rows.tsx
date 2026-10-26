"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import styles from "./cabinet-list.module.css";
import { findCabinetListImage } from "./cabinet-list-image";
import {
  hasPendingPrice,
  type CabinetGroup,
  type CabinetRow,
  type CabinetWidthFacts,
} from "./cabinet-list-model";
import { formatLei, formatLeiAmount } from "./format-lei";

// One group of the list and its rows (frames D2A, D2B, D2M). The same markup is the table on a desktop and the cards on a
// phone: the stylesheet lays the row out, so no script chooses between two trees and nothing flips after hydration.
// Every string here is the catalogue's or the message file's, drawn as a text child.

const GROUP_HEADING_KEYS = {
  base: "priceDashboard.cabinets.groupBase",
  wall: "priceDashboard.cabinets.groupWall",
  tall: "priceDashboard.cabinets.groupTall",
  corner: "priceDashboard.cabinets.groupCorner",
} as const;

export interface CabinetGroupSectionProps {
  readonly group: CabinetGroup;
  readonly isOpen: boolean;
  /** Absent while a search or the "Doar modificate" filter is on: the groups with a match are then all open. */
  readonly onToggle: (() => void) | undefined;
}

export function CabinetGroupSection({
  group,
  isOpen,
  onToggle,
}: CabinetGroupSectionProps) {
  const translate = useTranslations();
  const listId = useId();
  const heading = (
    <>
      <span className={styles.caret} aria-hidden="true" data-open={isOpen} />
      <span className={styles.groupName}>
        {translate(GROUP_HEADING_KEYS[group.code])}
      </span>
      <span className={styles.groupCount}>
        {translate("priceDashboard.cabinets.groupCount", {
          count: group.rows.length,
        })}
      </span>
      {group.modifiedCount === 0 ? null : (
        <span className={styles.chip} data-tone="warm">
          {translate("priceDashboard.cabinets.groupPending", {
            count: group.modifiedCount,
          })}
        </span>
      )}
    </>
  );
  return (
    <section
      className={styles.group}
      data-testid={`cabinet-group-${group.code}`}
    >
      <h2 className={styles.groupHeading}>
        {onToggle === undefined ? (
          <span className={styles.groupHeader}>{heading}</span>
        ) : (
          <button
            type="button"
            className={styles.groupHeader}
            aria-expanded={isOpen}
            aria-controls={listId}
            onClick={onToggle}
          >
            {heading}
          </button>
        )}
      </h2>
      <ul id={listId} className={styles.rows} hidden={!isOpen}>
        {group.rows.map((row) => (
          <CabinetRowItem key={row.facts.ruleId} row={row} />
        ))}
      </ul>
    </section>
  );
}

function CabinetRowItem({ row }: { readonly row: CabinetRow }) {
  const translate = useTranslations();
  const { facts } = row;
  return (
    <li
      className={styles.row}
      data-modified={row.isModified}
      data-rule-id={facts.ruleId}
      data-testid="cabinet-row"
    >
      <CabinetPicture
        url={findCabinetListImage(facts.buildId, facts.widths.defaultMm)}
      />
      <div className={styles.rowName}>
        <span className={styles.name}>{facts.name}</span>
        <span className={styles.chips}>
          {row.isModified ? (
            <span className={styles.chip} data-tone="warm">
              {translate("priceDashboard.chips.modified")}
            </span>
          ) : null}
          {facts.isCustomerSupplied ? (
            <span className={styles.chip}>
              {translate("priceDashboard.chips.customerSupplied")}
            </span>
          ) : null}
          {facts.isStructural ? (
            <span className={styles.chip}>
              {translate("priceDashboard.chips.structural")}
            </span>
          ) : null}
        </span>
        <RowNote row={row} />
      </div>
      <CabinetWidths widths={facts.widths} />
      <CabinetPrice row={row} />
    </li>
  );
}

/** §13.4 of the development spec: a CSS background, so a drawing that does not resolve paints an empty tile and not a broken
 *  image. Decorative: the row's name is beside it. */
function CabinetPicture({ url }: { readonly url: string | undefined }) {
  return (
    <span
      className={styles.picture}
      style={
        url === undefined ? undefined : { backgroundImage: `url("${url}")` }
      }
      aria-hidden="true"
    />
  );
}

/** What the row says about the cabinet beyond its name: the two kinds that do not follow the price list. */
function RowNote({ row }: { readonly row: CabinetRow }) {
  const translate = useTranslations();
  const { facts } = row;
  if (facts.isCustomerSupplied) {
    return (
      <span className={styles.note}>
        {translate("priceDashboard.cabinets.customerSuppliedShort")}
      </span>
    );
  }
  if (!facts.isStructural) return null;
  return (
    <span className={styles.note}>
      {translate("priceDashboard.cabinets.structuralShort")}
    </span>
  );
}

function CabinetWidths({ widths }: { readonly widths: CabinetWidthFacts }) {
  const translate = useTranslations();
  const mm = translate("priceDashboard.units.mm");
  const { range } = widths;
  return (
    <div className={styles.rowWidth}>
      <span className={styles.strong}>
        {range.kind === "fixed"
          ? translate("priceDashboard.cabinets.widthFixed", {
              widths: range.widthsMm.join(" / "),
            })
          : `${String(range.minMm)}–${String(range.maxMm)} ${mm}`}
      </span>
      {range.kind === "fixed" ? null : (
        <span className={styles.muted}>
          {widths.isDefaultFollowingBase
            ? translate("priceDashboard.cabinets.widthFollowsBase")
            : translate("priceDashboard.cabinets.widthDefault", {
                widthMm: widths.defaultMm,
              })}
        </span>
      )}
      {widths.isDefaultProposed ? (
        <span className={styles.proposed}>
          {translate("priceDashboard.cabinets.proposed")}
        </span>
      ) : null}
    </div>
  );
}

function CabinetPrice({ row }: { readonly row: CabinetRow }) {
  const translate = useTranslations();
  const { price } = row.facts;
  if (price === undefined) {
    return (
      <div className={styles.rowPrice}>
        <span className={styles.noPrice} aria-hidden="true" />
        <span className={styles.muted}>
          {translate("priceDashboard.cabinets.noEffectOnPrice")}
        </span>
      </div>
    );
  }
  const currency = translate("priceDashboard.units.currency");
  const basis =
    price.heightMm === undefined
      ? translate("priceDashboard.cabinets.priceBasis", {
          widthMm: price.widthMm,
        })
      : translate("priceDashboard.cabinets.priceBasisHeight", {
          widthMm: price.widthMm,
          heightMm: price.heightMm,
        });
  return (
    <div className={styles.rowPrice} data-testid="cabinet-price">
      <span className={styles.strong}>
        {formatLei(price.pendingMinor, currency)}
      </span>
      <span className={styles.muted}>
        {hasPendingPrice(row)
          ? `${basis} · ${translate("priceDashboard.common.activeShort", {
              amount: formatLeiAmount(price.activeMinor),
            })}`
          : basis}
      </span>
    </div>
  );
}
