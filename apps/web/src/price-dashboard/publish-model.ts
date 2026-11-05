import {
  ACCESSORY_IDS,
  applyChanges,
  changedRowsOf,
  DIFF_SECTIONS,
  diffBooks,
  isCabinetAddress,
  isSameAddress,
  isSameItem,
  readEditableFields,
  restoreChanges,
  type AbsentValue,
  type AppliedAddress,
  type BookDiffRow,
  type BookFieldAddress,
  type CreatedRowTextField,
  type DiffSection,
  type DiffValue,
  type DraftBulk,
  type DraftChange,
  type FieldDiffRow,
  type FieldUnit,
  type GroupDiffRow,
  type ItemRef,
  type LinkDiffRow,
  type PriceBook,
  type PriceGroupCode,
  type RowDiffRow,
  type TextDiffRow,
} from "@lemnaria/configurator-domain";

import { pendingPriceCountOf } from "./cabinet-list-model";
import type {
  DashboardStateWire,
  DraftRevertTargetWire,
  PriceVersionListWire,
  PriceVersionWire,
} from "./price-dashboard-wire-contract";
import type { DeletionFacts } from "./publish-deletions";

// Rows are the domain's `diffBooks`, named from address and book. No words, and no price arithmetic beyond the size
// of a difference.

/** Everything the publish screens are given: the dashboard's state, the versions so far, and the cabinets' names. */
export interface PublishPageInput {
  readonly state: DashboardStateWire;
  /** The versions, newest first, as one page of the history. */
  readonly versions: PriceVersionListWire;
  /** The catalogue's Romanian names by build id, as the cabinet list has them. */
  readonly cabinetNames: Readonly<Record<string, string>>;
  /** What judging a deleted row needs; absent where the saved kitchens' use of a row cannot be counted. */
  readonly deletionFacts?: DeletionFacts | undefined;
}

/** An archived (or active) version with the book it replaced, and the draft a restore adds to. */
export interface VersionDetailInput {
  readonly version: PriceVersionWire;
  /** The version before it; absent for the first. */
  readonly predecessor:
    | { readonly sequenceNumber: number; readonly book: PriceBook }
    | undefined;
  readonly active: {
    readonly sequenceNumber: number;
    readonly book: PriceBook;
  };
  readonly draft: DashboardStateWire["draft"];
  readonly cabinetNames: Readonly<Record<string, string>>;
}

/** What a row is about, as the screen names it. */
export type RowSubject =
  | { readonly kind: "name"; readonly name: string }
  /** A tier or accessory: its authored text, with the catalogue key that renders it (`content.bookText`). */
  | {
      readonly kind: "book-text";
      readonly authored: string;
      readonly key: string | undefined;
    }
  | { readonly kind: "depth-rule" }
  | { readonly kind: "provisional" };

/** How a row's change reads: an amount (with its size against the old one), points of a percentage, or nothing. */
export type DifferenceView =
  | { readonly kind: "none" }
  | {
      readonly kind: "amount";
      readonly deltaMinor: number;
      /** Whole percent of the old amount; absent when the old amount is 0 or absent. */
      readonly percent: number | undefined;
      /** The change is smaller than one percent but not nothing. */
      readonly isUnderOnePercent: boolean;
    }
  | { readonly kind: "points"; readonly delta: number };

export interface FieldRowView {
  readonly kind: "field";
  readonly key: string;
  readonly section: DiffSection;
  readonly subject: RowSubject;
  readonly address: AppliedAddress;
  readonly unit: FieldUnit;
  readonly before: DiffValue;
  readonly after: DiffValue;
  readonly difference: DifferenceView;
  /** The change restates the value the book already has: it is drawn, and it changes nothing. */
  readonly isUnchanged: boolean;
  /** The width a cabinet's "Preț la … mm" is quoted at. */
  readonly anchorWidthMm: number | undefined;
  /** What ↺ removes; absent where the row cannot be taken back on its own. */
  readonly revert: DraftRevertTargetWire | undefined;
}

/** What a bulk action covered, in the terms its row names it. */
export type BulkScopeView =
  | { readonly kind: "group"; readonly code: PriceGroupCode }
  | { readonly kind: "all" }
  | { readonly kind: "selection"; readonly count: number };

export interface GroupRowView {
  readonly kind: "group";
  readonly key: string;
  readonly section: DiffSection;
  readonly groupId: string;
  readonly ruleCount: number;
  readonly amountCount: number;
  /** The percentage and its scope as asked; absent when the changes carry no `bulk`. */
  readonly bulk:
    | { readonly percent: number; readonly scope: BulkScopeView }
    | undefined;
  readonly items: readonly FieldRowView[];
  readonly revert: DraftRevertTargetWire | undefined;
}

/** A hardware class or a linked accessory the book gains or loses. */
export interface ItemRowView {
  readonly kind: "row";
  readonly key: string;
  readonly section: DiffSection;
  readonly change: RowDiffRow["change"];
  readonly itemKind: ItemRef["kind"];
  readonly subject: RowSubject;
  /** What ↺ removes: the creation with the changes that cannot stand without it. A deletion has none, as the revert
   *  route takes no address of one. */
  readonly revert: DraftRevertTargetWire | undefined;
}

/** The words of a created row, as each book states them; a side the book does not state is `undefined`. */
export interface TextRowView {
  readonly kind: "text";
  readonly key: string;
  readonly section: DiffSection;
  readonly subject: RowSubject;
  readonly field: CreatedRowTextField;
  readonly before: string | undefined;
  readonly after: string | undefined;
  readonly revert: DraftRevertTargetWire | undefined;
}

/** The catalogue row a linked accessory follows, named as the cabinet list names it. It has no ↺ of its own: the one
 *  change that sets a link is the accessory's creation. */
export interface LinkRowView {
  readonly kind: "link";
  readonly key: string;
  readonly section: DiffSection;
  readonly subject: RowSubject;
  readonly before: string;
  readonly after: string;
  readonly revert: undefined;
}

export type RowView =
  | FieldRowView
  | GroupRowView
  | ItemRowView
  | TextRowView
  | LinkRowView;

export interface SectionView {
  readonly section: DiffSection;
  readonly rows: readonly RowView[];
}

export interface PendingDraftView {
  readonly sections: readonly SectionView[];
  /** The changes make a book that shows a row against the active one. A class created and deleted again shows none. */
  readonly hasRows: boolean;
  /** The prices the draft waits to publish: the number the header and the menu show. */
  readonly changeCount: number;
  /** The candidate book differs from the active one. A draft of restated values has rows and cannot be published. */
  readonly canPublish: boolean;
  /** The draft holds a `provisional = false` change, which publishing needs a second confirmation for (D7C). */
  readonly holdsProvisionalOff: boolean;
  /** The `amountsProvisional` the published book would carry. */
  readonly candidateIsProvisional: boolean;
  readonly candidateBook: PriceBook;
}

export type PendingDraftReading =
  | { readonly kind: "empty" }
  | { readonly kind: "ready"; readonly view: PendingDraftView }
  /** The draft does not make a book: a defect, not a person's mistake. */
  | { readonly kind: "candidate-refused" };

export interface PendingDraftInput {
  readonly active: PriceBook;
  readonly changes: readonly DraftChange[];
  readonly cabinetNames: Readonly<Record<string, string>>;
}

export function readPendingDraft(
  input: PendingDraftInput,
): PendingDraftReading {
  const { active, changes, cabinetNames } = input;
  if (changes.length === 0) return { kind: "empty" };
  const applied = applyChanges(active, changes);
  if (!applied.ok) return { kind: "candidate-refused" };
  const candidate = applied.book;
  const rows = diffBooks(active, candidate, { changes });
  const changedRows = changedRowsOf(changes);
  return {
    kind: "ready",
    view: {
      sections: sectionsOf(
        rows.map((row) =>
          rowViewOf(row, {
            books: { before: active, after: candidate },
            cabinetNames,
            isRevertable: true,
            changedRows,
          }),
        ),
      ),
      hasRows: rows.length > 0,
      changeCount: pendingPriceCountOf({ changes }),
      canPublish: diffBooks(active, candidate).length > 0,
      holdsProvisionalOff: changes.some(isProvisionalOff),
      candidateIsProvisional: candidate.amountsProvisional,
      candidateBook: candidate,
    },
  };
}

/** The draft has changes and no row to take back one by one, so the one way out is giving the whole draft up. */
export function offersOnlyDiscard(reading: PendingDraftReading): boolean {
  return (
    reading.kind === "candidate-refused" ||
    (reading.kind === "ready" && !reading.view.hasRows)
  );
}

function isProvisionalOff(change: DraftChange): boolean {
  return change.address.kind === "provisional" && change.value === false;
}

/** The rows by which `after` differs from `before`, for the changes that made it, in D7's sections (D8's detail). */
export function describeVersionDiff(input: {
  readonly before: PriceBook;
  readonly after: PriceBook;
  readonly changes: readonly DraftChange[];
  readonly cabinetNames: Readonly<Record<string, string>>;
}): readonly SectionView[] {
  const { before, after, changes, cabinetNames } = input;
  return sectionsOf(
    diffBooks(before, after, { changes }).map((row) =>
      rowViewOf(row, {
        books: { before, after },
        cabinetNames,
        isRevertable: false,
        changedRows: [],
      }),
    ),
  );
}

/** The two books a screen reads against: a row the draft creates is only in `after`, one it deletes only in `before`. */
export interface BookPair {
  readonly before: PriceBook;
  readonly after: PriceBook;
}

interface RowContext {
  readonly books: BookPair;
  readonly cabinetNames: Readonly<Record<string, string>>;
  readonly isRevertable: boolean;
  /** The rows the draft creates or deletes: the row's own ↺ takes back everything the draft says of one. */
  readonly changedRows: readonly ItemRef[];
}

function rowViewOf(row: BookDiffRow, context: RowContext): RowView {
  switch (row.kind) {
    case "field":
      return fieldRowViewOf(row, context, {
        isRevertable: context.isRevertable,
      });
    case "group":
      return groupRowViewOf(row, context);
    case "row":
      return itemRowViewOf(row, context);
    case "text":
      return textRowViewOf(row, context);
    case "link":
      return linkRowViewOf(row, context);
  }
}

function groupRowViewOf(row: GroupDiffRow, context: RowContext): GroupRowView {
  const items = row.items.map((item) =>
    fieldRowViewOf(item, context, { isRevertable: false }),
  );
  return {
    kind: "group",
    key: `group:${row.groupId}`,
    section: row.section,
    groupId: row.groupId,
    ruleCount: row.ruleCount,
    amountCount: row.amountCount,
    bulk: bulkViewOf(row.bulk, row.ruleCount),
    items,
    revert: context.isRevertable
      ? { kind: "group", groupId: row.groupId }
      : undefined,
  };
}

function itemRowViewOf(row: RowDiffRow, context: RowContext): ItemRowView {
  return {
    kind: "row",
    key: JSON.stringify(row.address),
    section: row.section,
    change: row.change,
    itemKind: row.item.kind,
    subject: itemSubjectOf(row.item, context.books),
    revert:
      row.change === "created" ? ownRevertOf(row.address, context) : undefined,
  };
}

function textRowViewOf(row: TextDiffRow, context: RowContext): TextRowView {
  return {
    kind: "text",
    key: JSON.stringify(row.address),
    section: row.section,
    subject: itemSubjectOf(row.item, context.books),
    field: row.field,
    before: textSideOf(row.before),
    after: textSideOf(row.after),
    revert: ownRevertOf(row.address, context),
  };
}

function linkRowViewOf(row: LinkDiffRow, context: RowContext): LinkRowView {
  const { cabinetNames } = context;
  return {
    kind: "link",
    key: `link:${JSON.stringify(row.address)}`,
    section: row.section,
    subject: itemSubjectOf(row.item, context.books),
    before: cabinetNames[row.before] ?? row.before,
    after: cabinetNames[row.after] ?? row.after,
    revert: undefined,
  };
}

function ownRevertOf(
  address: BookFieldAddress,
  context: RowContext,
): DraftRevertTargetWire | undefined {
  return context.isRevertable ? { kind: "change", address } : undefined;
}

function textSideOf(side: string | AbsentValue): string | undefined {
  return typeof side === "string" ? side : undefined;
}

function bulkViewOf(
  bulk: DraftBulk | undefined,
  ruleCount: number,
): GroupRowView["bulk"] {
  if (bulk === undefined) return undefined;
  return { percent: bulk.percent, scope: scopeViewOf(bulk, ruleCount) };
}

function scopeViewOf(bulk: DraftBulk, ruleCount: number): BulkScopeView {
  if (bulk.scope === "all") return { kind: "all" };
  if (bulk.scope === "group" && bulk.groupCode !== undefined) {
    return { kind: "group", code: bulk.groupCode };
  }
  return { kind: "selection", count: ruleCount };
}

function fieldRowViewOf(
  row: FieldDiffRow,
  context: RowContext,
  options: { readonly isRevertable: boolean },
): FieldRowView {
  return {
    kind: "field",
    key: JSON.stringify(row.address),
    section: row.section,
    subject: subjectOf(row, context),
    address: row.address,
    unit: row.unit,
    before: row.before,
    after: row.after,
    difference: differenceOf(row),
    isUnchanged: row.before === row.after,
    anchorWidthMm: row.cabinet?.anchorWidthMm,
    revert:
      options.isRevertable && !isOfChangedRow(row.address, context.changedRows)
        ? { kind: "change", address: row.address }
        : undefined,
  };
}

/**
 * Whether a field is a rate or price of a row the draft creates or deletes. A created accessory's price lies inside its
 * creation, so no change of it is held to take back, and a created class goes whole: both leave with the row's own ↺.
 */
function isOfChangedRow(
  address: AppliedAddress,
  changedRows: readonly ItemRef[],
): boolean {
  const row = rowOfField(address);
  return (
    row !== undefined && changedRows.some((changed) => isSameItem(changed, row))
  );
}

/** The row a field is of: a class's rate or a tier's amount, an accessory's price; a cabinet's price is of none. */
function rowOfField(address: AppliedAddress): ItemRef | undefined {
  switch (address.kind) {
    case "hardware":
    case "material":
      return { kind: address.kind, tierId: address.tierId };
    case "accessory":
      return { kind: "accessory", accessoryId: address.accessoryId };
    default:
      return undefined;
  }
}

function subjectOf(row: FieldDiffRow, context: RowContext): RowSubject {
  const { address } = row;
  const { books, cabinetNames } = context;
  if (isCabinetAddress(address)) {
    const buildId = row.cabinet?.buildId;
    return {
      kind: "name",
      name:
        buildId === undefined
          ? address.ruleId
          : (cabinetNames[buildId] ?? buildId),
    };
  }
  switch (address.kind) {
    case "depth-rule":
      return { kind: "depth-rule" };
    case "provisional":
      return { kind: "provisional" };
    case "hardware":
    case "material":
      return tierSubjectOf(
        tierIn(books, address.kind, address.tierId),
        address.tierId,
      );
    case "accessory":
      return accessorySubjectOf(address.accessoryId, books);
  }
}

interface NamedBookRow {
  readonly name: string;
  readonly nameKey?: string | undefined;
}

function tierSubjectOf(
  tier: NamedBookRow | undefined,
  fallbackId: string,
): RowSubject {
  return {
    kind: "book-text",
    authored: tier?.name ?? fallbackId,
    key: tier?.nameKey,
  };
}

function accessorySubjectOf(accessoryId: string, books: BookPair): RowSubject {
  const id = ACCESSORY_IDS.find((candidate) => candidate === accessoryId);
  const ruleIn = (book: PriceBook): NamedBookRow | undefined =>
    id === undefined
      ? linkedAccessoriesOf(book).find(
          (linked) => linked.accessoryId === accessoryId,
        )
      : book.accessories[id];
  return tierSubjectOf(
    ruleIn(books.after) ?? ruleIn(books.before),
    accessoryId,
  );
}

/** A book stored before linked accessories existed declares none, although `PriceBook` types the section as required. */
function linkedAccessoriesOf(
  book: Partial<Pick<PriceBook, "linkedAccessories">>,
): NonNullable<PriceBook["linkedAccessories"]> {
  return book.linkedAccessories ?? [];
}

function differenceOf(row: FieldDiffRow): DifferenceView {
  if (row.delta === undefined || row.delta === 0 || row.unit === "flag") {
    return { kind: "none" };
  }
  if (row.unit === "percent") return { kind: "points", delta: row.delta };
  const before = typeof row.before === "number" ? row.before : 0;
  const percent = before === 0 ? undefined : wholePercentOf(row.delta, before);
  return {
    kind: "amount",
    deltaMinor: row.delta,
    percent: percent === 0 ? undefined : percent,
    isUnderOnePercent: percent === 0,
  };
}

/** How many whole percent `delta` is of `before` (positive), halves away from zero, by integer arithmetic only. */
function wholePercentOf(delta: number, before: number): number {
  const scaled = delta * 100;
  const remainder = scaled % before;
  const truncated = (scaled - remainder) / before;
  const isHalfOrMore = Math.abs(remainder) * 2 >= before;
  return isHalfOrMore ? truncated + Math.sign(delta) : truncated;
}

function sectionsOf(rows: readonly RowView[]): readonly SectionView[] {
  return DIFF_SECTIONS.flatMap((section) => {
    const inSection = rows.filter((row) => row.section === section);
    return inSection.length === 0 ? [] : [{ section, rows: inSection }];
  });
}

export interface RestorePlan {
  /** The draft after the restore. */
  readonly draft: readonly DraftChange[];
  /** The fields on which the archived prices differ from what the draft would publish: what a restore changes. */
  readonly differingCount: number;
  /** The changes the restore put in the draft. */
  readonly addedChangeCount: number;
  /** The pending changes on fields the archived version states: the ones it replaces or drops. */
  readonly replacedChangeCount: number;
}

/**
 * Applying `draft` to `active` gives the archived value on every field both books state. Draft changes on fields the
 * archived version states go, and `restoreChanges(archived, active)` is added; `differingCount` is against the candidate.
 * A survivor of a bulk group that lost members is an ordinary change: `groupId` and `bulk` go together.
 */
export function planRestore(input: {
  readonly archived: PriceBook;
  readonly active: PriceBook;
  readonly draft: readonly DraftChange[];
}): RestorePlan {
  const { archived, active, draft } = input;
  const applied = applyChanges(active, draft);
  const differingFromCandidate = restoreChanges(
    archived,
    applied.ok ? applied.book : active,
  );
  const added = restoreChanges(archived, active);
  const archivedReadings = readEditableFields(archived);
  const isStated = (change: DraftChange): boolean =>
    archivedReadings.some((reading) =>
      isSameAddress(reading.address, change.address),
    );
  const brokenGroupIds = new Set(
    draft.filter(isStated).flatMap(({ groupId }) => groupId ?? []),
  );
  const kept = draft
    .filter((change) => !isStated(change))
    .map((change) =>
      change.groupId !== undefined && brokenGroupIds.has(change.groupId)
        ? withoutGroup(change)
        : change,
    );
  return {
    draft: [...kept, ...added],
    differingCount: differingFromCandidate.length,
    addedChangeCount: added.length,
    replacedChangeCount: draft.filter(isStated).length,
  };
}

function withoutGroup(change: DraftChange): DraftChange {
  const { groupId, bulk, ...ordinary } = change;
  void groupId;
  void bulk;
  return ordinary as DraftChange;
}

/** What an item is called: its tier or accessory text from the book that states it (the later one first), else its own code. */
export function itemSubjectOf(item: ItemRef, books: BookPair): RowSubject {
  switch (item.kind) {
    case "material":
      return tierSubjectOf(tierIn(books, "material", item.tierId), item.tierId);
    case "hardware":
      return tierSubjectOf(tierIn(books, "hardware", item.tierId), item.tierId);
    case "accessory":
      return accessorySubjectOf(item.accessoryId, books);
    case "finish":
      return { kind: "name", name: item.finishId };
    case "handle":
      return { kind: "name", name: item.handle };
  }
}

function tierIn(
  books: BookPair,
  group: "hardware" | "material",
  tierId: string,
): NamedBookRow | undefined {
  const find = (book: PriceBook): NamedBookRow | undefined =>
    book[group].tiers.find((tier) => tier.tierId === tierId);
  return find(books.after) ?? find(books.before);
}
