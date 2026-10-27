import { isRecord } from "../pricing/book-reading.js";
import type { PriceBook } from "../pricing/price-book.js";

import { addressKey } from "./address-key.js";
import { readBulk } from "./apply-changes.js";
import type { DraftBulk, DraftChange } from "./book-field-address.js";
import {
  anchoredFormulaOf,
  isCabinetAddress,
  readEditableFields,
  type AppliedAddress,
  type EditableFieldReading,
  type FieldUnit,
  type FieldValue,
} from "./editable-fields.js";

// What differs between two price books, as the rows D7 (draft against active) and D8 (archived against its
// predecessor) draw. Rows hold field codes and numbers, never words: the web names a row from its address and the book.
//
// Two books cannot say which differences were one bulk action, so the grouping comes from the changes that made them.
// A field a change names has a row even when the change restated its value, so the row can be reverted; the fields of
// one `groupId` fold into one `group` row that expands to every member and carries the group's `bulk` as stored.

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

/** One bulk action: every member of the group, counted as the audit counts them (rules touched, prices touched). */
export interface GroupDiffRow {
  readonly kind: "group";
  readonly groupId: string;
  readonly section: DiffSection;
  readonly ruleCount: number;
  readonly amountCount: number;
  /** What the action was asked as, exactly as stored on the group's changes; never derived from the amounts. */
  readonly bulk?: DraftBulk;
  readonly items: readonly FieldDiffRow[];
}

export type BookDiffRow = FieldDiffRow | GroupDiffRow;

export interface DiffBooksOptions {
  /** The changes that made `after` from `before`, which name the bulk groups. Without them every field is its own row,
   *  and only a field that differs has one. */
  readonly changes?: readonly DraftChange[];
}

/** The rows by which `after` differs from `before`, sectioned in D7's order, and for each change given the row of the
 *  field it names. Equal books and no changes give none. */
export function diffBooks(
  before: PriceBook,
  after: PriceBook,
  options: DiffBooksOptions = {},
): readonly BookDiffRow[] {
  const membership = membershipOf(options.changes ?? []);
  const fieldRows = changedFieldRows({ before, after }, membership.changedKeys);
  return foldBulkGroups(fieldRows, membership);
}

function changedFieldRows(
  books: BookPair,
  changedKeys: ReadonlySet<string>,
): readonly FieldDiffRow[] {
  const beforeFields = readingsByAddress(books.before);
  const afterFields = readingsByAddress(books.after);
  const addresses = new Map([...beforeFields, ...afterFields]);
  return [...addresses.keys()]
    .flatMap((key) =>
      rowOf(
        { before: beforeFields.get(key), after: afterFields.get(key) },
        { books, isNamedByAChange: changedKeys.has(key) },
      ),
    )
    .sort(bySection);
}

interface BookPair {
  readonly before: PriceBook;
  readonly after: PriceBook;
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
  readings: {
    readonly before: EditableFieldReading | undefined;
    readonly after: EditableFieldReading | undefined;
  },
  context: { readonly books: BookPair; readonly isNamedByAChange: boolean },
): readonly FieldDiffRow[] {
  const reading = readings.after ?? readings.before;
  if (reading === undefined) return [];
  const before = readings.before?.value ?? ABSENT_VALUE;
  const after = readings.after?.value ?? ABSENT_VALUE;
  if (before === after && !context.isNamedByAChange) return [];
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
      ...cabinetContextOf(address, context.books),
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
  books: BookPair,
): { readonly cabinet?: CabinetRowContext } {
  if (!isCabinetAddress(address)) return {};
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

interface GroupMembership {
  /** Every address a change names, in a draft that holds one change per address. */
  readonly changedKeys: ReadonlySet<string>;
  readonly groupIdByAddress: ReadonlyMap<string, string>;
  readonly bulkByGroup: ReadonlyMap<string, DraftBulk>;
}

/** The addresses the changes name, the group each belongs to, and what each group was asked as. A later change of an
 *  address replaces the earlier, so it may also leave a group. A `bulk` that is not the shape of one is dropped. */
function membershipOf(changes: readonly DraftChange[]): GroupMembership {
  const changedKeys = new Set<string>();
  const groupIdByAddress = new Map<string, string>();
  const bulkByGroup = new Map<string, DraftBulk>();
  for (const stored of changes as readonly unknown[]) {
    if (!isRecord(stored)) continue;
    const key = addressKey(stored["address"]);
    changedKeys.add(key);
    const groupId = stored["groupId"];
    if (typeof groupId !== "string") {
      groupIdByAddress.delete(key);
      continue;
    }
    groupIdByAddress.set(key, groupId);
    const bulk = readBulk(stored["bulk"]);
    if (bulk !== undefined && !bulkByGroup.has(groupId))
      bulkByGroup.set(groupId, bulk);
  }
  return { changedKeys, groupIdByAddress, bulkByGroup };
}

/** Each group becomes one row at the place its first item held; ungrouped rows stay as they are. */
function foldBulkGroups(
  rows: readonly FieldDiffRow[],
  membership: GroupMembership,
): readonly BookDiffRow[] {
  const { groupIdByAddress, bulkByGroup } = membership;
  const itemsByGroup = new Map<string, FieldDiffRow[]>();
  for (const row of rows) {
    const groupId = groupIdByAddress.get(addressKey(row.address));
    if (groupId === undefined) continue;
    itemsByGroup.set(groupId, [...(itemsByGroup.get(groupId) ?? []), row]);
  }
  const placed = new Set<string>();
  return rows.flatMap((row): readonly BookDiffRow[] => {
    const groupId = groupIdByAddress.get(addressKey(row.address));
    if (groupId === undefined) return [row];
    if (placed.has(groupId)) return [];
    placed.add(groupId);
    return [
      groupRowOf({
        groupId,
        items: itemsByGroup.get(groupId) ?? [],
        bulk: bulkByGroup.get(groupId),
      }),
    ];
  });
}

function groupRowOf(group: {
  readonly groupId: string;
  readonly items: readonly FieldDiffRow[];
  readonly bulk: DraftBulk | undefined;
}): GroupDiffRow {
  const { groupId, items, bulk } = group;
  const ruleIds = new Set(
    items.flatMap(({ address }) =>
      isCabinetAddress(address) ? [address.ruleId] : [],
    ),
  );
  return {
    kind: "group",
    groupId,
    section: items[0]?.section ?? "cabinets",
    ruleCount: ruleIds.size,
    amountCount: items.length,
    ...(bulk === undefined ? {} : { bulk }),
    items,
  };
}
