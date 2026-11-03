import {
  applyChanges,
  isStructuralAddress,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import type { DraftRevertTargetWire } from "./price-dashboard-wire-contract";
import type { PendingDraftInput, RowSubject } from "./publish-model";
import { subjectOfAddress } from "./publish-refusals";

// A draft that no longer makes a book is listed change by change, so a valid change beside a refused one is not lost to
// giving the whole draft up. A bulk action is one line, since its changes stand or go together.

export interface StaleChangeView {
  readonly key: string;
  readonly subject: RowSubject;
  /** The change cannot be applied: it is the one to take back. */
  readonly isRefused: boolean;
  /**
   * What ↺ removes. Absent for a creation, a deletion or a created row's words: the revert route does not take them, so
   * the line says that only the whole draft can be given up.
   */
  readonly revert: DraftRevertTargetWire | undefined;
}

export function staleChangesOf(
  input: PendingDraftInput,
): readonly StaleChangeView[] {
  const { active, changes, cabinetNames } = input;
  const refusedIndexes = refusedIndexesOf(applyChanges(active, changes));
  const books = { before: active, after: active };
  const lines: StaleChangeView[] = [];
  const listedGroups = new Set<string>();
  changes.forEach((change, index) => {
    const { groupId } = change;
    if (groupId !== undefined) {
      if (listedGroups.has(groupId)) return;
      listedGroups.add(groupId);
    }
    lines.push({
      key: groupId ?? JSON.stringify(change.address),
      subject: subjectOfAddress(change.address, {
        books,
        changes,
        cabinetNames,
      }),
      isRefused: isRefusedAt(index, change, { changes, refusedIndexes }),
      revert: revertOf(change),
    });
  });
  return lines;
}

function refusedIndexesOf(
  applied: ReturnType<typeof applyChanges>,
): ReadonlySet<number> {
  return applied.ok || applied.reason === "candidate-refused"
    ? new Set()
    : new Set(applied.refusals.map(({ index }) => index));
}

/** A bulk line is refused when any of its changes is. */
function isRefusedAt(
  index: number,
  change: DraftChange,
  {
    changes,
    refusedIndexes,
  }: {
    readonly changes: readonly DraftChange[];
    readonly refusedIndexes: ReadonlySet<number>;
  },
): boolean {
  if (change.groupId === undefined) return refusedIndexes.has(index);
  return changes.some(
    (member, at) => member.groupId === change.groupId && refusedIndexes.has(at),
  );
}

function revertOf(change: DraftChange): DraftRevertTargetWire | undefined {
  if (change.groupId !== undefined) {
    return { kind: "group", groupId: change.groupId };
  }
  return isStructuralAddress(change.address)
    ? undefined
    : { kind: "change", address: change.address };
}
