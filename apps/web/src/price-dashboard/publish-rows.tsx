"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactNode } from "react";

import {
  DEEP_CABINET_DEPTH_MM,
  PRICE_STEP_MM,
  TWO_DOOR_MIN_WIDTH_MM,
  type CabinetRuleField,
  type DiffSection,
  type DiffValue,
  type HardwareRateField,
  type PriceGroupCode,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import { useContent, useStaffKitchensCopy } from "@/i18n/use-content";

import { formatLei } from "./format-lei";
import type { DraftRevertTargetWire } from "./price-dashboard-wire-contract";
import { signOf, signedLei, signedWholeNumber } from "./publish-format";
import type {
  BulkScopeView,
  DifferenceView,
  FieldRowView,
  GroupRowView,
  RowSubject,
  RowView,
  SectionView,
} from "./publish-model";
import styles from "./publish.module.css";

// The rows of a difference between two price books: the pending prices (D7) and an archived version's changes (D8B), as one
// markup. A phone draws each row as a card and from 900 px the rows line up as a table, as on the cabinet list. The cells say
// what they are in their own words, so the column titles are for the eye. A bulk action is one row that opens to its members.

const SECTION_HEADING_KEYS = {
  cabinets: "priceDashboard.publish.sectionCabinets",
  "price-rules": "priceDashboard.publish.sectionRules",
  materials: "priceDashboard.publish.sectionMaterials",
  hardware: "priceDashboard.publish.sectionHardware",
  accessories: "priceDashboard.publish.sectionAccessories",
  provisional: "priceDashboard.publish.provisionalLabel",
} as const satisfies Record<DiffSection, string>;

const GROUP_WORD_KEYS = {
  base: "priceDashboard.cabinets.groupBase",
  wall: "priceDashboard.cabinets.groupWall",
  tall: "priceDashboard.cabinets.groupTall",
  corner: "priceDashboard.cabinets.groupCorner",
} as const satisfies Record<PriceGroupCode, string>;

/** The titles of the two value columns: "Activ acum" and "Nou", or the two versions an archived diff compares. */
export interface DiffColumns {
  readonly before: string;
  readonly after: string;
}

export interface DiffSectionsProps {
  readonly sections: readonly SectionView[];
  readonly columns: DiffColumns;
  /** Present on the pending list only: what ↺ asks for. Absent, the rows are read-only. */
  readonly onRevert: ((target: DraftRevertTargetWire) => void) | undefined;
  readonly isBusy: boolean;
}

export function DiffSections({
  sections,
  columns,
  onRevert,
  isBusy,
}: DiffSectionsProps) {
  const translate = useTranslations();
  return (
    <div className={styles.diff} data-testid="diff-table">
      <div className={styles.columns} aria-hidden="true">
        <span>{translate("priceDashboard.publish.columnChange")}</span>
        <span>{columns.before}</span>
        <span>{columns.after}</span>
        <span>{translate("priceDashboard.publish.columnDifference")}</span>
        <span />
      </div>
      {sections.map((section) => (
        <DiffSectionBlock
          key={section.section}
          section={section}
          columns={columns}
          onRevert={onRevert}
          isBusy={isBusy}
        />
      ))}
    </div>
  );
}

function DiffSectionBlock({
  section,
  columns,
  onRevert,
  isBusy,
}: Omit<DiffSectionsProps, "sections"> & { readonly section: SectionView }) {
  const translate = useTranslations();
  return (
    <section
      className={styles.section}
      data-testid={`diff-section-${section.section}`}
    >
      <h2 className={styles.sectionHeading}>
        <span>{translate(SECTION_HEADING_KEYS[section.section])}</span>
        <span className={styles.sectionCount}>
          {translate("priceDashboard.publish.changeCount", {
            count: section.rows.length,
          })}
        </span>
      </h2>
      <ul className={styles.rows}>
        {section.rows.map((row) =>
          row.kind === "field" ? (
            <FieldRow
              key={row.key}
              row={row}
              columns={columns}
              onRevert={onRevert}
              isBusy={isBusy}
            />
          ) : (
            <GroupRow
              key={row.key}
              row={row}
              columns={columns}
              onRevert={onRevert}
              isBusy={isBusy}
            />
          ),
        )}
      </ul>
    </section>
  );
}

interface RowProps<Row extends RowView> {
  readonly row: Row;
  readonly columns: DiffColumns;
  readonly onRevert: ((target: DraftRevertTargetWire) => void) | undefined;
  readonly isBusy: boolean;
}

function FieldRow({ row, columns, onRevert, isBusy }: RowProps<FieldRowView>) {
  const words = useRowWords();
  const name = words.subject(row.subject);
  const field = words.field(row);
  return (
    <li
      className={styles.row}
      data-testid="diff-row"
      data-unchanged={row.isUnchanged}
    >
      <RowName name={name} field={field} />
      <Cell label={columns.before} value={words.value(row.before, row)} />
      <Cell label={columns.after} value={words.value(row.after, row)} />
      <DifferenceCell text={words.difference(row.difference)} />
      <RevertButton
        target={row.revert}
        name={field === "" ? name : `${name}, ${field}`}
        onRevert={onRevert}
        isBusy={isBusy}
      />
    </li>
  );
}

function GroupRow({ row, columns, onRevert, isBusy }: RowProps<GroupRowView>) {
  const translate = useTranslations();
  const words = useRowWords();
  const [isOpen, setIsOpen] = useState(true);
  const membersId = useId();
  const nameId = useId();
  const toggleId = useId();
  const signed =
    row.bulk === undefined ? undefined : words.bulkPercent(row.bulk.percent);
  return (
    <li
      className={styles.groupRow}
      data-testid="diff-group"
      data-group-id={row.groupId}
    >
      <div className={styles.row}>
        <div className={styles.rowName}>
          <span
            id={nameId}
            className={styles.name}
            data-testid="diff-group-name"
          >
            {words.bulkName(row)}
          </span>
          <span className={styles.field}>
            {translate("priceDashboard.publish.bulkRowSummary", {
              cabinetCount: row.ruleCount,
              priceCount: row.amountCount,
            })}
          </span>
          <button
            id={toggleId}
            type="button"
            className={styles.groupToggle}
            aria-expanded={isOpen}
            aria-controls={membersId}
            aria-labelledby={`${toggleId} ${nameId}`}
            onClick={() => {
              setIsOpen((wasOpen) => !wasOpen);
            }}
          >
            {isOpen
              ? translate("priceDashboard.publish.bulkRowHide")
              : translate("priceDashboard.publish.bulkRowShow")}
          </button>
        </div>
        <Cell label={columns.before} value={words.noValue} />
        <Cell label={columns.after} value={signed ?? ""} />
        <DifferenceCell text={signed ?? ""} />
        <RevertButton
          target={row.revert}
          name={words.bulkName(row)}
          onRevert={onRevert}
          isBusy={isBusy}
        />
      </div>
      <ul id={membersId} className={styles.members} hidden={!isOpen}>
        {row.items.map((item) => (
          <FieldRow
            key={item.key}
            row={item}
            columns={columns}
            onRevert={undefined}
            isBusy={isBusy}
          />
        ))}
      </ul>
    </li>
  );
}

function RowName({
  name,
  field,
}: {
  readonly name: string;
  readonly field: string;
}) {
  return (
    <div className={styles.rowName}>
      <span className={styles.name}>{name}</span>
      {field === "" ? null : <span className={styles.field}>{field}</span>}
    </div>
  );
}

function Cell({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className={styles.cell} data-empty={value === ""}>
      <span className={styles.cellLabel}>{label}</span>
      <span className={styles.cellValue}>{value}</span>
    </div>
  );
}

/** The size of a change. A row that restates the value the book already has shows none. */
function DifferenceCell({ text }: { readonly text: string }) {
  const translate = useTranslations();
  return (
    <Cell
      label={translate("priceDashboard.publish.columnDifference")}
      value={text}
    />
  );
}

/** ↺, drawn by the stylesheet: the button's name is its words alone. */
function RevertButton({
  target,
  name,
  onRevert,
  isBusy,
}: {
  readonly target: DraftRevertTargetWire | undefined;
  readonly name: string;
  readonly onRevert: ((target: DraftRevertTargetWire) => void) | undefined;
  readonly isBusy: boolean;
}) {
  const translate = useTranslations();
  if (target === undefined || onRevert === undefined) {
    return <span className={styles.revertPlaceholder} />;
  }
  return (
    <button
      type="button"
      className={styles.revert}
      data-testid="diff-revert"
      aria-label={translate("priceDashboard.publish.revertAria", { name })}
      aria-disabled={isBusy ? true : undefined}
      onClick={
        isBusy
          ? undefined
          : () => {
              onRevert(target);
            }
      }
    />
  );
}

/** The words a row is told in, resolved once per language. */
export function useRowWords() {
  const translate = useTranslations();
  const content = useContent();
  const { noValue } = useStaffKitchensCopy();
  return useMemo(() => {
    const currency = translate("priceDashboard.units.currency");
    const subject = (named: RowSubject): string => {
      switch (named.kind) {
        case "name":
          return named.name;
        case "book-text":
          return content.bookText(named.authored, named.key);
        case "depth-rule":
          return translate("priceDashboard.rule.deepKitchenLabel", {
            depthMm: DEEP_CABINET_DEPTH_MM,
          });
        case "provisional":
          return translate("priceDashboard.publish.provisionalLabel");
      }
    };
    const field = (row: FieldRowView): string => fieldWords(translate, row);
    const value = (shown: DiffValue, row: FieldRowView): string => {
      if (typeof shown === "object") return noValue;
      if (typeof shown === "boolean") {
        return shown
          ? translate("priceDashboard.publish.provisionalOn")
          : translate("priceDashboard.publish.provisionalOff");
      }
      return row.unit === "percent"
        ? translate("priceDashboard.common.percentPlus", {
            percent: String(shown),
          })
        : formatLei(shown, currency);
    };
    const difference = (shown: DifferenceView): string => {
      switch (shown.kind) {
        case "none":
          return "";
        case "points":
          return translate("priceDashboard.diff.points", {
            sign: signOf(shown.delta),
            count: Math.abs(shown.delta),
          });
        case "amount": {
          const signedAmount = signedLei(shown.deltaMinor, currency);
          if (shown.isUnderOnePercent) {
            return translate("priceDashboard.diff.amountUnderOne", {
              signedAmount,
            });
          }
          return shown.percent === undefined
            ? signedAmount
            : translate("priceDashboard.diff.amountPercent", {
                signedAmount,
                signedPercent: signedWholeNumber(shown.percent),
              });
        }
      }
    };
    const bulkPercent = (percent: number): string =>
      translate("priceDashboard.common.percent", {
        percent: signedWholeNumber(percent),
      });
    const bulkName = (row: GroupRowView): string =>
      row.bulk === undefined
        ? translate("priceDashboard.publish.changeCount", {
            count: row.amountCount,
          })
        : translate("priceDashboard.publish.bulkRowName", {
            signedPercent: signedWholeNumber(row.bulk.percent),
            group: scopeWords(translate, row.bulk.scope),
          });
    return {
      subject,
      field,
      value,
      difference,
      bulkPercent,
      bulkName,
      noValue,
    };
  }, [translate, content, noValue]);
}

type Translate = ContentTranslator;

function scopeWords(translate: Translate, scope: BulkScopeView): string {
  return scope.kind === "group"
    ? translate(GROUP_WORD_KEYS[scope.code])
    : translate("priceDashboard.cabinets.groupCount", { count: scope.count });
}

/** The name of the field a row changes, in the cabinet detail's and the hardware list's own words. */
function fieldWords(translate: Translate, row: FieldRowView): string {
  const { address } = row;
  switch (address.kind) {
    case "cabinet":
      return cabinetFieldWords(translate, row, address.field);
    case "cabinet-size":
      return translate("priceDashboard.cabinets.editPriceLabel", {
        widthMm: address.widthMm,
      });
    case "hardware":
      return hardwareFieldWords(translate, address.field);
    case "material":
      return translate("priceDashboard.materials.columnSurcharge");
    case "depth-rule":
      return typeof row.before === "object"
        ? translate("priceDashboard.rule.isNew")
        : translate("priceDashboard.rule.scope");
    case "accessory":
      return translate("priceDashboard.accessories.pricePerPiece");
    case "provisional":
      return "";
  }
}

function cabinetFieldWords(
  translate: Translate,
  row: FieldRowView,
  field: CabinetRuleField,
): string {
  switch (field) {
    case "anchorMinor":
      return row.anchorWidthMm === undefined
        ? translate("priceDashboard.cabinets.columnPrice")
        : translate("priceDashboard.cabinet.fieldAnchor", {
            widthMm: row.anchorWidthMm,
          });
    case "perStepWiderMinor":
      return translate("priceDashboard.cabinet.fieldPlus", {
        stepMm: PRICE_STEP_MM,
      });
    case "perStepNarrowerMinor":
      return translate("priceDashboard.cabinet.fieldMinus", {
        stepMm: PRICE_STEP_MM,
      });
    case "perExtraDoorLeafMinor":
      return translate("priceDashboard.cabinet.fieldDoor", {
        atMm: TWO_DOOR_MIN_WIDTH_MM,
      });
    case "perHeightStepMinor":
      return translate("priceDashboard.cabinet.fieldHeightStep", {
        stepMm: PRICE_STEP_MM,
      });
  }
}

function hardwareFieldWords(
  translate: Translate,
  field: HardwareRateField,
): string {
  switch (field) {
    case "perHingeMinor":
      return translate("priceDashboard.hardware.priceHinge");
    case "perDrawerMinor":
      return translate("priceDashboard.hardware.priceSlide");
    case "perPushToOpenMinor":
      return translate("priceDashboard.hardware.pricePush");
    case "perLiftMinor":
      return translate("priceDashboard.hardware.priceLift");
  }
}
