import {
  applyChanges,
  changedRowOf,
  changedRowsOf,
  isStructuralAddress,
  type DraftChange,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import type { DraftRevertTargetWire } from "./price-dashboard-wire-contract";
import type { PendingDraftInput, RowSubject } from "./publish-model";
import { subjectOfAddress } from "./publish-refusals";

// A draft that no longer makes a book is listed change by change, so a valid change beside a refused one is not lost to
// giving the whole draft up. A bulk action is one line, since its changes stand or go together, and so is a row the
// draft creates or deletes, with its rates, price and words: the revert route takes such a row away whole, so it is not
// offered on one of its fields.

export interface StaleChangeView {
  readonly key: string;
  readonly subject: RowSubject;
  /** The change cannot be applied: it is the one to take back. */
  readonly isRefused: boolean;
  /**
   * What ↺ removes. Absent for a created or deleted row, which only the whole draft gives up: the revert route does not
   * take them.
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
      if (isRefused && !held.isRefused) lines.set(key, { ...held, isRefused });
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
  if (changedRowOf(change, rows) !== undefined) return undefined;
  if (change.groupId !== undefined) {
    return { kind: "group", groupId: change.groupId };
  }
  return isStructuralAddress(change.address)
    ? undefined
    : { kind: "change", address: change.address };
}

/** A row the draft creates is in no book yet, so it is named by the words its creation carries. */
function createdRowSubjectOf(change: DraftChange): RowSubject | undefined {
  const { kind } = change.address;
  const isCreation =
    kind === "hardware-tier-created" || kind === "accessory-created";
  const { name } = change.value as { readonly name?: unknown };
  return isCreation && typeof name === "string"
    ? { kind: "book-text", authored: name, key: undefined }
    : undefined;
}
