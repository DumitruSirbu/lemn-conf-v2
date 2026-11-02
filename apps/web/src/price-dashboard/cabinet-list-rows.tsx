"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import type { AppLocale } from "@/i18n/routing";

import styles from "./cabinet-list.module.css";
import { cabinetPathOf } from "./cabinet-paths";
import { findCabinetListImage } from "./cabinet-list-image";
import {
  GROUP_HEADING_KEYS,
  priceOfRow,
  type CabinetGroup,
  type CabinetRow,
  type CabinetWidthFacts,
} from "./cabinet-list-model";
import { EditablePrice, type PriceEditing } from "./cabinet-list-inline-edit";
import { formatLei, formatLeiAmount } from "./format-lei";

// One group of the list and its rows. The same markup is the table on a desktop and the cards on a phone: the stylesheet
// lays the row out, so no script chooses between two trees and nothing flips after hydration.

export interface CabinetGroupSectionProps {
  readonly locale: AppLocale;
  readonly group: CabinetGroup;
  readonly isOpen: boolean;
  /** Absent while a search or the "Doar modificate" filter is on: the groups with a match are then all open. */
  readonly onToggle: (() => void) | undefined;
  /** Present where the list can change a price in place; absent, the price is read and nothing more. */
  readonly editing?: PriceEditing | undefined;
}

export function CabinetGroupSection({
  locale,
  group,
  isOpen,
  onToggle,
  editing,
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
          <CabinetRowItem
            key={row.facts.ruleId}
            locale={locale}
            row={row}
            editing={editing}
          />
        ))}
      </ul>
    </section>
  );
}

function CabinetRowItem({
  locale,
  row,
  editing,
}: {
  readonly locale: AppLocale;
  readonly row: CabinetRow;
  readonly editing: PriceEditing | undefined;
}) {
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
        <a
          className={styles.name}
          href={cabinetPathOf(locale, facts.ruleId)}
          data-testid="cabinet-link"
        >
          {facts.name}
        </a>
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
      <CabinetPrice row={row} editing={editing} />
      <span className={styles.chevron} aria-hidden="true" />
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

/** What a structural row says beyond its chip. A customer-supplied row says all it has to in its chip and its price cell. */
function RowNote({ row }: { readonly row: CabinetRow }) {
  const translate = useTranslations();
  const { facts } = row;
  if (!facts.isStructural || facts.isCustomerSupplied) return null;
  return (
    <span className={styles.note}>
      {translate("priceDashboard.cabinets.structuralNote")}
    </span>
  );
}

function CabinetWidths({ widths }: { readonly widths: CabinetWidthFacts }) {
  const translate = useTranslations();
  const { range } = widths;
  return (
    <div className={styles.rowWidth}>
      <span className={styles.strong}>
        {range.kind === "fixed"
          ? translate("priceDashboard.cabinets.widthFixed", {
              widths: range.widthsMm.map(String).reduce((head, tail) =>
                translate("priceDashboard.cabinets.widthsJoined", {
                  head,
                  tail,
                }),
              ),
            })
          : translate("priceDashboard.cabinets.widthRange", {
              minMm: range.minMm,
              maxMm: range.maxMm,
            })}
      </span>
      {range.kind === "fixed" && !widths.isDefaultProposed ? null : (
        <span className={styles.defaultLine}>
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
        </span>
      )}
    </div>
  );
}

function CabinetPrice({
  row,
  editing,
}: {
  readonly row: CabinetRow;
  readonly editing: PriceEditing | undefined;
}) {
  const translate = useTranslations();
  const shown = priceOfRow(row);
  if (shown.kind === "none") {
    return (
      <div className={styles.rowPrice}>
        <span className={styles.noPrice} aria-hidden="true" />
        <span className={styles.muted}>
          {translate("priceDashboard.cabinets.noEffectOnPrice")}
        </span>
      </div>
    );
  }
  const { price } = shown;
  const basis =
    price.heightMm === undefined
      ? translate("priceDashboard.cabinets.priceBasis", {
          widthMm: price.widthMm,
        })
      : translate("priceDashboard.cabinets.priceBasisHeight", {
          widthMm: price.widthMm,
          heightMm: price.heightMm,
        });
  if (shown.kind === "unreadable") {
    return (
      <div className={styles.rowPrice} data-testid="cabinet-price-unreadable">
        <span className={styles.noPrice} aria-hidden="true" />
        <span className={styles.muted}>{basis}</span>
      </div>
    );
  }
  const currency = translate("priceDashboard.units.currency");
  const figure = formatLei(shown.headlineMinor, currency);
  const basisLine = (
    <span className={styles.muted}>
      {shown.activeBesideMinor === undefined
        ? basis
        : translate("priceDashboard.cabinets.priceBasisWithActive", {
            basis,
            active: translate("priceDashboard.common.activeShort", {
              amount: formatLeiAmount(shown.activeBesideMinor),
            }),
          })}
    </span>
  );
  const { anchorField } = row.facts;
  return (
    <div className={styles.rowPrice} data-testid="cabinet-price">
      {editing === undefined || anchorField === undefined ? (
        <>
          <span className={styles.strong}>{figure}</span>
          {basisLine}
        </>
      ) : (
        <EditablePrice
          cabinetName={row.facts.name}
          widthMm={price.widthMm}
          field={anchorField}
          editing={editing}
          figure={figure}
          basis={basisLine}
        />
      )}
    </div>
  );
}
