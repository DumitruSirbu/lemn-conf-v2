"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";

import type { DiffSection } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import { isolated } from "@/staff/bidi-isolate";

import type { DraftRevertTargetWire } from "./price-dashboard-wire-contract";
import { PriceEditor } from "./price-editor";
import { useRowWords } from "./publish-row-words";
import type {
  FieldRowView,
  GroupRowView,
  ItemRowView,
  LinkRowView,
  RowView,
  SectionView,
  TextRowView,
} from "./publish-model";
import styles from "./publish.module.css";
import type { PriceDraft } from "./use-price-draft";

// One markup: cards on a phone, a table from 900 px. Each cell carries its own label; the column titles are for the eye.

const SECTION_HEADING_KEYS = {
  cabinets: "priceDashboard.publish.sectionCabinets",
  "price-rules": "priceDashboard.publish.sectionRules",
  materials: "priceDashboard.publish.sectionMaterials",
  hardware: "priceDashboard.publish.sectionHardware",
  accessories: "priceDashboard.publish.sectionAccessories",
  provisional: "priceDashboard.publish.provisionalLabel",
} as const satisfies Record<DiffSection, string>;

type Translate = ContentTranslator;

/** The titles of the two value columns: "Activ acum" and "Nou", or the two versions an archived diff compares. */
export interface DiffColumns {
  readonly before: string;
  readonly after: string;
}

/** What the pending list is given where a "Nou" amount can be corrected; an archived version's rows have none. */
export type SaveAmount = PriceDraft["changeOrRevert"];

export interface DiffSectionsProps {
  readonly sections: readonly SectionView[];
  readonly columns: DiffColumns;
  /** Present on the pending list only: what ↺ asks for. Absent, the rows are read-only. */
  readonly onRevert: ((target: DraftRevertTargetWire) => void) | undefined;
  /** Present on the pending list only: the write a corrected "Nou" amount goes through. */
  readonly onSaveAmount: SaveAmount | undefined;
  readonly isBusy: boolean;
}

export function DiffSections({
  sections,
  columns,
  onRevert,
  onSaveAmount,
  isBusy,
}: DiffSectionsProps) {
  const translate = useTranslations();
  return (
    <div className={styles.diffScroll}>
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
            onSaveAmount={onSaveAmount}
            isBusy={isBusy}
          />
        ))}
      </div>
    </div>
  );
}

function DiffSectionBlock({
  section,
  columns,
  onRevert,
  onSaveAmount,
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
        {section.rows.map((row) => (
          <DiffRow
            key={row.key}
            row={row}
            columns={columns}
            onRevert={onRevert}
            onSaveAmount={onSaveAmount}
            isBusy={isBusy}
          />
        ))}
      </ul>
    </section>
  );
}

interface RowProps<Row extends RowView> {
  readonly row: Row;
  readonly columns: DiffColumns;
  readonly onRevert: ((target: DraftRevertTargetWire) => void) | undefined;
  readonly onSaveAmount: SaveAmount | undefined;
  readonly isBusy: boolean;
}

function DiffRow(props: RowProps<RowView>) {
  const { row } = props;
  switch (row.kind) {
    case "field":
      return <FieldRow {...props} row={row} />;
    case "group":
      return <GroupRow {...props} row={row} />;
    case "row":
      return <ItemRow {...props} row={row} />;
    case "text":
      return <TextRow {...props} row={row} />;
    case "link":
      return <LinkRow {...props} row={row} />;
  }
}

function FieldRow({
  row,
  columns,
  onRevert,
  onSaveAmount,
  isBusy,
}: RowProps<FieldRowView>) {
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
      <Cell
        label={columns.after}
        value={
          <NewValue
            row={row}
            text={words.value(row.after, row)}
            name={name}
            field={field}
            onSaveAmount={onSaveAmount}
            isBusy={isBusy}
          />
        }
      />
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
            onSaveAmount={undefined}
            isBusy={isBusy}
          />
        ))}
      </ul>
    </li>
  );
}

/** The corrected value of a pending amount: a field from 900 px, the figure as text on a phone, and the figure alone for
 *  every row whose amount is not a price of this draft. */
function NewValue({
  row,
  text,
  name,
  field,
  onSaveAmount,
  isBusy,
}: {
  readonly row: FieldRowView;
  readonly text: string;
  readonly name: string;
  readonly field: string;
  readonly onSaveAmount: SaveAmount | undefined;
  readonly isBusy: boolean;
}) {
  const translate = useTranslations();
  const { before, after } = row;
  const isCorrectable =
    onSaveAmount !== undefined &&
    row.unit === "amount" &&
    typeof before === "number" &&
    typeof after === "number";
  if (!isCorrectable) return text;
  const label = translate("priceDashboard.publish.newValueAria", {
    name,
    field,
  });
  return (
    <PriceEditor
      label={label}
      openAriaLabel={label}
      activeMinor={before}
      pendingMinor={after}
      isBusy={isBusy}
      sendAmount={(minor) =>
        onSaveAmount({ address: row.address, value: minor }, before)
      }
      figure={text}
    />
  );
}

function ItemRow({ row, columns, onRevert, isBusy }: RowProps<ItemRowView>) {
  const translate = useTranslations();
  const words = useRowWords();
  const name = words.subject(row.subject);
  return (
    <li
      className={styles.row}
      data-testid="diff-row"
      data-row-kind={`${row.itemKind}-${row.change}`}
    >
      <RowName name={name} field={itemRowNote(translate, row)} />
      <Cell label={columns.before} value="" />
      <Cell label={columns.after} value="" />
      <Cell
        label={translate("priceDashboard.publish.columnDifference")}
        value=""
      />
      <RevertButton
        target={row.revert}
        name={name}
        onRevert={onRevert}
        isBusy={isBusy}
      />
    </li>
  );
}

function itemRowNote(translate: Translate, row: ItemRowView): string {
  if (row.change === "deleted") {
    return translate("priceDashboard.publish.rowDeleted");
  }
  return row.itemKind === "hardware"
    ? translate("priceDashboard.hardware.newTitle")
    : translate("priceDashboard.accessories.newTitle");
}

function TextRow({ row, columns, onRevert, isBusy }: RowProps<TextRowView>) {
  const translate = useTranslations();
  const words = useRowWords();
  const name = words.subject(row.subject);
  return (
    <li className={styles.row} data-testid="diff-row" data-row-kind="text">
      <RowName name={name} field={textFieldWords(translate, row)} />
      <Cell label={columns.before} value={textSideWords(row.before, words)} />
      <Cell label={columns.after} value={textSideWords(row.after, words)} />
      <Cell
        label={translate("priceDashboard.publish.columnDifference")}
        value=""
      />
      <RevertButton
        target={row.revert}
        name={name}
        onRevert={onRevert}
        isBusy={isBusy}
      />
    </li>
  );
}

function textFieldWords(translate: Translate, row: TextRowView): string {
  const isHardware = row.section === "hardware";
  if (row.field === "name") {
    return isHardware
      ? translate("priceDashboard.hardware.nameLabel")
      : translate("priceDashboard.accessories.nameLabel");
  }
  return isHardware
    ? translate("priceDashboard.hardware.descriptionLabel")
    : translate("priceDashboard.accessories.descriptionLabel");
}

function textSideWords(
  side: string | undefined,
  words: ReturnType<typeof useRowWords>,
): string {
  return side === undefined ? words.noValue : isolated(side);
}

function LinkRow({ row, columns }: RowProps<LinkRowView>) {
  const translate = useTranslations();
  const words = useRowWords();
  return (
    <li className={styles.row} data-testid="diff-row" data-row-kind="link">
      <RowName
        name={words.subject(row.subject)}
        field={translate("priceDashboard.accessories.linkLabel")}
      />
      <Cell label={columns.before} value={row.before} />
      <Cell label={columns.after} value={row.after} />
      <Cell
        label={translate("priceDashboard.publish.columnDifference")}
        value=""
      />
      <span className={styles.revertPlaceholder} />
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
  hiddenNote,
}: {
  readonly label: string;
  readonly value: ReactNode;
  /** Words for a reader when the cell shows a dash: the dash itself is drawn by the stylesheet and read by nobody. */
  readonly hiddenNote?: string | undefined;
}) {
  return (
    <div className={styles.cell} data-empty={value === ""}>
      <span className={styles.cellLabel}>{label}</span>
      <div className={styles.cellValue}>{value}</div>
      {hiddenNote === undefined ? null : (
        <span className={styles.visuallyHidden}>{hiddenNote}</span>
      )}
    </div>
  );
}

/** The size of a change. A row that restates the value the book already has shows a dash, as a table keeps the place. */
function DifferenceCell({ text }: { readonly text: string }) {
  const translate = useTranslations();
  return (
    <Cell
      label={translate("priceDashboard.publish.columnDifference")}
      value={text}
      hiddenNote={
        text === ""
          ? translate("priceDashboard.publish.noDifference")
          : undefined
      }
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
