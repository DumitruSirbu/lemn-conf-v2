import {
  ACCESSORY_IDS,
  applyChanges,
  DIFF_SECTIONS,
  diffBooks,
  isCabinetAddress,
  isSameAddress,
  readEditableFields,
  restoreChanges,
  type AppliedAddress,
  type BookDiffRow,
  type DiffSection,
  type DiffValue,
  type DraftBulk,
  type DraftChange,
  type FieldDiffRow,
  type FieldUnit,
  type ItemRef,
  type PriceBook,
  type PriceGroupCode,
} from "@lemnaria/configurator-domain";

import type {
  DashboardStateWire,
  DraftRevertTargetWire,
  PriceVersionListWire,
  PriceVersionWire,
} from "./price-dashboard-wire-contract";

// What the publish and history screens are drawn from, and the pure rules that turn it into rows. The rows are the
// domain's `diffBooks`; this module names each one from its address and the book, decides whether the draft would change
// anything, and says what a ↺ removes. It does no price arithmetic beyond the size of a difference, and holds no words:
// the screens turn a subject and a difference into a sentence.

/** The longest a version's name may be (the book's name bound; `parsePriceBook` holds the same figure). */
export const MAX_VERSION_NAME_LENGTH = 80;

/** Everything the publish screens are given: the dashboard's state, the versions so far, and the cabinets' names. */
export interface PublishPageInput {
  readonly state: DashboardStateWire;
  /** The versions, newest first, as one page of the history. */
  readonly versions: PriceVersionListWire;
  /** The catalogue's Romanian names by build id, as the cabinet list has them. */
  readonly cabinetNames: Readonly<Record<string, string>>;
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
  | { readonly kind: "cabinets"; readonly count: number };

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

export type RowView = FieldRowView | GroupRowView;

export interface SectionView {
  readonly section: DiffSection;
  readonly rows: readonly RowView[];
}

export interface PendingDraftView {
  readonly sections: readonly SectionView[];
  /** The draft's changes: the number the header and the menu show. */
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
  return {
    kind: "ready",
    view: {
      sections: sectionsOf(
        rows.map((row) =>
          rowViewOf(row, {
            books: { before: active, after: candidate },
            cabinetNames,
            isRevertable: true,
          }),
        ),
      ),
      changeCount: changes.length,
      canPublish: diffBooks(active, candidate).length > 0,
      holdsProvisionalOff: changes.some(isProvisionalOff),
      candidateIsProvisional: candidate.amountsProvisional,
      candidateBook: candidate,
    },
  };
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
      }),
    ),
  );
}

interface RowContext {
  readonly books: { readonly before: PriceBook; readonly after: PriceBook };
  readonly cabinetNames: Readonly<Record<string, string>>;
  readonly isRevertable: boolean;
}

function rowViewOf(row: BookDiffRow, context: RowContext): RowView {
  if (row.kind === "field") {
    return fieldRowViewOf(row, context, { isRevertable: context.isRevertable });
  }
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

function bulkViewOf(
  bulk: DraftBulk | undefined,
  ruleCount: number,
): GroupRowView["bulk"] {
  if (bulk === undefined) return undefined;
  const scope: BulkScopeView =
    bulk.scope === "group" && bulk.groupCode !== undefined
      ? { kind: "group", code: bulk.groupCode }
      : { kind: "cabinets", count: ruleCount };
  return { percent: bulk.percent, scope };
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
    revert: options.isRevertable
      ? { kind: "change", address: row.address }
      : undefined,
  };
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
      return tierSubjectOf(
        books.after.hardware.tiers.find(
          (tier) => tier.tierId === address.tierId,
        ) ??
          books.before.hardware.tiers.find(
            (tier) => tier.tierId === address.tierId,
          ),
        address.tierId,
      );
    case "material":
      return tierSubjectOf(
        books.after.material.tiers.find(
          (tier) => tier.tierId === address.tierId,
        ) ??
          books.before.material.tiers.find(
            (tier) => tier.tierId === address.tierId,
          ),
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

function accessorySubjectOf(
  accessoryId: string,
  books: RowContext["books"],
): RowSubject {
  const id = ACCESSORY_IDS.find((candidate) => candidate === accessoryId);
  const rule = id === undefined ? undefined : books.after.accessories[id];
  return tierSubjectOf(rule, accessoryId);
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

/** Whether a row, or any member of a group, shows a value other than the one the book already has. */
export function isRowEffective(row: RowView): boolean {
  return row.kind === "field"
    ? !row.isUnchanged
    : row.items.some((item) => !item.isUnchanged);
}

export interface RestorePlan {
  /** The draft after the restore. */
  readonly draft: readonly DraftChange[];
  /** The fields on which the archived prices differ from what the draft would publish: what a restore changes. */
  readonly differingCount: number;
  /** The changes the restore put in the draft. */
  readonly addedChangeCount: number;
}

/**
 * What a restore makes of the draft, so that applying it to the active book gives the archived value on every field both
 * books state. Draft changes on fields the archived version states are taken out, and the archived value is added wherever
 * it differs from the active book (`restoreChanges(archived, active)`): with active 100, draft 120 and archived 120 the
 * 120 is added again, and with archived 100 the draft change simply goes. The candidate (active plus draft) is only what
 * "differs" is counted against, so a restore that would change nothing is told as such.
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
  const kept = draft.filter(
    (change) =>
      !archivedReadings.some((reading) =>
        isSameAddress(reading.address, change.address),
      ),
  );
  return {
    draft: [...kept, ...added],
    differingCount: differingFromCandidate.length,
    addedChangeCount: added.length,
  };
}

/** What an item a publish was refused for is called: its tier or accessory text from the book, else its own code. */
export function itemSubjectOf(item: ItemRef, book: PriceBook): RowSubject {
  switch (item.kind) {
    case "material":
      return tierSubjectOf(
        book.material.tiers.find((tier) => tier.tierId === item.tierId),
        item.tierId,
      );
    case "hardware":
      return tierSubjectOf(
        book.hardware.tiers.find((tier) => tier.tierId === item.tierId),
        item.tierId,
      );
    case "accessory":
      return accessorySubjectOf(item.accessoryId, {
        before: book,
        after: book,
      });
    case "finish":
      return { kind: "name", name: item.finishId };
    case "handle":
      return { kind: "name", name: item.handle };
  }
}
