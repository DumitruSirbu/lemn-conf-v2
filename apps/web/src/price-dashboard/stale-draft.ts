import {
  applyChanges,
  type BookFieldAddress,
  changedRowOf,
  changedRowsOf,
  isCreationAddress,
  isStructuralAddress,
  type DraftChange,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import type { DraftRevertTargetWire } from "./price-dashboard-wire-contract";
import type { PendingDraftInput, RowSubject } from "./publish-model";
import { subjectOfAddress } from "./publish-refusals";

// A draft that no longer makes a book is listed change by change, so a valid change beside a refused one is not lost to
// giving the whole draft up. A bulk action is one line, since its changes stand or go together, and so is a row the
// draft creates or deletes, with its rates, price and words: a row goes whole, so ↺ is not offered on one of its fields.
// A created row's line takes the row back by its creation; a deleted row's line, by its deletion.

export interface StaleChangeView {
  readonly key: string;
  readonly subject: RowSubject;
  /** The change cannot be applied: it is the one to take back. */
  readonly isRefused: boolean;
  /**
   * What ↺ removes: the change, the bulk group, or a created or deleted row by its creation or deletion.
   */
  readonly revert: DraftRevertTargetWire | undefined;
}

export type StaleDraftView =
  | { readonly kind: "lines"; readonly lines: readonly StaleChangeView[] }
  /**
   * The book the changes make is refused whole, and no change is the one to blame: only the whole draft is given up.
   */
  | { readonly kind: "whole-book" };

export function staleDraftOf(input: PendingDraftInput): StaleDraftView {
  const applied = applyChanges(input.active, input.changes);
  if (!applied.ok && applied.reason === "candidate-refused") {
    return { kind: "whole-book" };
  }
  const refused = applied.ok
    ? new Set<number>()
    : new Set(applied.refusals.map(({ index }) => index));
  return { kind: "lines", lines: linesOf(input, refused) };
}

function linesOf(
  input: PendingDraftInput,
  refusedIndexes: ReadonlySet<number>,
): readonly StaleChangeView[] {
  const { active, changes, cabinetNames } = input;
  const books = { before: active, after: active };
  const rows = changedRowsOf(changes);
  const lines = new Map<string, StaleChangeView>();
  changes.forEach((change, index) => {
    const key = lineKeyOf(change, rows);
    const isRefused = refusedIndexes.has(index);
    const held = lines.get(key);
    if (held !== undefined) {
      lines.set(
        key,
        mergedLine(held, { isRefused, revert: revertOf(change, rows) }),
      );
      return;
    }
    lines.set(key, {
      key,
      subject:
        createdRowSubjectOf(change) ??
        subjectOfAddress(change.address, { books, changes, cabinetNames }),
      isRefused,
      revert: revertOf(change, rows),
    });
  });
  return [...lines.values()];
}

/** A later change of a line's row: it is refused if any is, and the creation, wherever it stands, is what ↺ takes back. */
function mergedLine(
  held: StaleChangeView,
  next: Pick<StaleChangeView, "isRefused" | "revert">,
): StaleChangeView {
  return {
    ...held,
    isRefused: held.isRefused || next.isRefused,
    revert: held.revert ?? next.revert,
  };
}

/** One key for a bulk action, for a created or deleted row and for each of the other changes. */
function lineKeyOf(change: DraftChange, rows: readonly ItemRef[]): string {
  const row = changedRowOf(change, rows);
  if (row !== undefined) return `row:${JSON.stringify(row)}`;
  return change.groupId ?? JSON.stringify(change.address);
}

function revertOf(
  change: DraftChange,
  rows: readonly ItemRef[],
): DraftRevertTargetWire | undefined {
  if (changedRowOf(change, rows) !== undefined) {
    return isOwnAddressOfRow(change.address)
      ? { kind: "change", address: change.address }
      : undefined;
  }
  if (change.groupId !== undefined) {
    return { kind: "group", groupId: change.groupId };
  }
  return isStructuralAddress(change.address)
    ? undefined
    : { kind: "change", address: change.address };
}

/** The address the revert route takes back a row by: its creation or its deletion, never one of its fields. */
function isOwnAddressOfRow(address: BookFieldAddress): boolean {
  return isCreationAddress(address) || address.kind === "item-deleted";
}

/** A row the draft creates is in no book yet, so it is named by the words its creation carries. */
function createdRowSubjectOf(change: DraftChange): RowSubject | undefined {
  const { name } = change.value as { readonly name?: unknown };
  return isCreationAddress(change.address) && typeof name === "string"
    ? { kind: "book-text", authored: name, key: undefined }
    : undefined;
}
