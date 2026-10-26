import type { PriceBook } from "../pricing/price-book.js";

import type { DraftChange } from "./book-field-address.js";
import {
  addressKey,
  anchoredFormulaOf,
  readEditableFields,
  type AppliedAddress,
  type EditableFieldReading,
  type FieldUnit,
  type FieldValue,
} from "./editable-fields.js";

// What differs between two price books, as the rows D7 (draft against active) and D8 (archived against its
// predecessor) draw. Rows hold field codes and numbers, never words: the web names a row from its address and the book.
//
// Two books cannot say which differences were one bulk action, so the grouping comes from the changes that made them:
// the differing fields whose change carries a `groupId` fold into one `group` row that expands to its items.

/** The order D7 lists its sections in. */
export const DIFF_SECTIONS = Object.freeze([
  "cabinets",
  "price-rules",
  "materials",
  "hardware",
  "accessories",
  "provisional",
] as const);
export type DiffSection = (typeof DIFF_SECTIONS)[number];

/** A side of a row that has no value: the field is not in that book (D8's new depth rule reads "Regulă nouă", before "—"). */
export interface AbsentValue {
  readonly kind: "absent";
}
export const ABSENT_VALUE: AbsentValue = Object.freeze({ kind: "absent" });

export type DiffValue = FieldValue | AbsentValue;

/** What the web needs to name a cabinet row from the book: the catalogue row and where its price is quoted. */
export interface CabinetRowContext {
  readonly buildId: string;
  /** The width D7's "Preț la 600 mm" is quoted at: absent for a row that lists fixed sizes. */
  readonly anchorWidthMm?: number;
}

export interface FieldDiffRow {
  readonly kind: "field";
  readonly section: DiffSection;
  readonly address: AppliedAddress;
  readonly unit: FieldUnit;
  readonly before: DiffValue;
  readonly after: DiffValue;
  /** `after - before`: bani for an amount, points for a percent. Absent when a side is absent and for a flag. */
  readonly delta?: number;
  readonly cabinet?: CabinetRowContext;
}

/** One bulk action: its differing fields, counted as the audit counts them (rules touched, prices touched). */
export interface GroupDiffRow {
  readonly kind: "group";
  readonly groupId: string;
  readonly section: DiffSection;
  readonly ruleCount: number;
  readonly amountCount: number;
  readonly items: readonly FieldDiffRow[];
}

export type BookDiffRow = FieldDiffRow | GroupDiffRow;

export interface DiffBooksOptions {
  /** The changes that made `after` from `before`, which name the bulk groups. Without them every field is its own row. */
  readonly changes?: readonly DraftChange[];
}

/** The rows by which `after` differs from `before`, sectioned in D7's order. Equal books give none. */
export function diffBooks(
  before: PriceBook,
  after: PriceBook,
  options: DiffBooksOptions = {},
): readonly BookDiffRow[] {
  const fieldRows = changedFieldRows(before, after);
  return foldBulkGroups(fieldRows, groupIdsByAddress(options.changes ?? []));
}

function changedFieldRows(
  before: PriceBook,
  after: PriceBook,
): readonly FieldDiffRow[] {
  const beforeFields = readingsByAddress(before);
  const afterFields = readingsByAddress(after);
  const addresses = new Map([...beforeFields, ...afterFields]);
  return [...addresses.keys()]
    .flatMap((key) =>
      rowOf(beforeFields.get(key), afterFields.get(key), { before, after }),
    )
    .sort(bySection);
}

function readingsByAddress(
  book: PriceBook,
): ReadonlyMap<string, EditableFieldReading> {
  return new Map(
    readEditableFields(book).map((reading) => [
      addressKey(reading.address),
      reading,
    ]),
  );
}

function rowOf(
  beforeReading: EditableFieldReading | undefined,
  afterReading: EditableFieldReading | undefined,
  books: { readonly before: PriceBook; readonly after: PriceBook },
): readonly FieldDiffRow[] {
  const reading = afterReading ?? beforeReading;
  if (reading === undefined) return [];
  const before = beforeReading?.value ?? ABSENT_VALUE;
  const after = afterReading?.value ?? ABSENT_VALUE;
  if (before === after) return [];
  const { address, unit } = reading;
  return [
    {
      kind: "field",
      section: sectionOf(address),
      address,
      unit,
      before,
      after,
      ...deltaOf(unit, before, after),
      ...cabinetContextOf(address, books),
    },
  ];
}

function deltaOf(
  unit: FieldUnit,
  before: DiffValue,
  after: DiffValue,
): { readonly delta?: number } {
  if (unit === "flag" || typeof before !== "number") return {};
  return typeof after === "number" ? { delta: after - before } : {};
}

function cabinetContextOf(
  address: AppliedAddress,
  books: { readonly before: PriceBook; readonly after: PriceBook },
): { readonly cabinet?: CabinetRowContext } {
  if (address.kind !== "cabinet" && address.kind !== "cabinet-size") return {};
  const ruleId = address.ruleId;
  const rule =
    books.after.cabinetRules.find((row) => row.ruleId === ruleId) ??
    books.before.cabinetRules.find((row) => row.ruleId === ruleId);
  if (rule === undefined) return {};
  const anchored = anchoredFormulaOf(rule.formula);
  return {
    cabinet: {
      buildId: rule.buildId,
      ...(anchored === undefined
        ? {}
        : { anchorWidthMm: anchored.anchorWidthMm }),
    },
  };
}

function sectionOf(address: AppliedAddress): DiffSection {
  switch (address.kind) {
    case "cabinet":
    case "cabinet-size":
      return "cabinets";
    case "depth-rule":
      return "price-rules";
    case "material":
      return "materials";
    case "hardware":
      return "hardware";
    case "accessory":
      return "accessories";
    case "provisional":
      return "provisional";
  }
}

function bySection(left: FieldDiffRow, right: FieldDiffRow): number {
  return (
    DIFF_SECTIONS.indexOf(left.section) - DIFF_SECTIONS.indexOf(right.section)
  );
}

/** The group each address belongs to. A later change of an address replaces the earlier, so it may also leave a group. */
function groupIdsByAddress(
  changes: readonly DraftChange[],
): ReadonlyMap<string, string> {
  const groupIds = new Map<string, string>();
  for (const change of changes) {
    const key = addressKey(change.address);
    if (change.groupId === undefined) groupIds.delete(key);
    else groupIds.set(key, change.groupId);
  }
  return groupIds;
}

/** Each group becomes one row at the place its first item held; ungrouped rows stay as they are. */
function foldBulkGroups(
  rows: readonly FieldDiffRow[],
  groupIds: ReadonlyMap<string, string>,
): readonly BookDiffRow[] {
  const itemsByGroup = new Map<string, FieldDiffRow[]>();
  for (const row of rows) {
    const groupId = groupIds.get(addressKey(row.address));
    if (groupId === undefined) continue;
    itemsByGroup.set(groupId, [...(itemsByGroup.get(groupId) ?? []), row]);
  }
  const placed = new Set<string>();
  return rows.flatMap((row): readonly BookDiffRow[] => {
    const groupId = groupIds.get(addressKey(row.address));
    if (groupId === undefined) return [row];
    if (placed.has(groupId)) return [];
    placed.add(groupId);
    return [groupRowOf(groupId, itemsByGroup.get(groupId) ?? [])];
  });
}

function groupRowOf(
  groupId: string,
  items: readonly FieldDiffRow[],
): GroupDiffRow {
  const ruleIds = new Set(
    items.flatMap(({ address }) =>
      address.kind === "cabinet" || address.kind === "cabinet-size"
        ? [address.ruleId]
        : [],
    ),
  );
  return {
    kind: "group",
    groupId,
    section: items[0]?.section ?? "cabinets",
    ruleCount: ruleIds.size,
    amountCount: items.length,
    items,
  };
}
