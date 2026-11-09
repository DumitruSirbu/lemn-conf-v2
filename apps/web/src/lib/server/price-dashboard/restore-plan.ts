import "server-only";

import {
  applyChanges,
  deletedItemsOf,
  isSameAddress,
  isSameItem,
  readEditableFields,
  restoreChanges,
  type BookFieldAddress,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { StoredPriceVersion } from "@lemnaria/persistence";

import { restoredToDraftEntry } from "@/lib/server/price-dashboard/dashboard-audit-entries";
import {
  dashboardConflictResponse,
  draftWireOf,
  restoredResponse,
} from "@/lib/server/price-dashboard/dashboard-responses";
import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import type { DraftPlan } from "@/lib/server/price-dashboard/draft-plans";
import { readVersionBook } from "@/lib/server/price-dashboard/version-wire";

// `restoreChanges(archived, active)` is exact only relative to its second argument: against the active book alone, a
// field the draft already edits emits nothing and the candidate keeps the pending value. So a restore is made against
// the candidate the draft makes, and replaces by address: the pending changes of every field the archived book states
// are dropped, the archived values that differ from the active book are added, and a pending change to anything else
// stays. A row the draft deletes is outside the restore (OQ-44): the book its earlier changes make no longer states it,
// so a price added for it would make the draft refuse itself.

/**
 * What restoring `version` writes: the draft it becomes, or the refusal. The active version has nothing to restore (the
 * draft's own edits are reverted one by one), and a restore that would change no field is `nothing-differs`. A draft the
 * restore leaves unable to apply, which a stale pending change can cause, is `candidate-refused`: the person heals it by
 * reverting that change, as for any other write.
 */
export function planRestore(
  version: StoredPriceVersion,
  { draft, book }: ActiveDashboardState,
): DraftPlan {
  if (version.state === "active") return refused("nothing-differs");
  const plan = planRestoreToDraft({
    archived: readVersionBook(version),
    active: book,
    draft: draft.changes,
  });
  if (plan.differingCount === 0) return refused("nothing-differs");
  if (!applyChanges(book, plan.draft).ok) return refused("candidate-refused");
  return {
    kind: "write",
    changes: plan.draft,
    entry: restoredToDraftEntry({
      fromSequenceNumber: version.sequenceNumber,
      changedFieldCount: plan.differingCount,
    }),
    answer: (draftRevision) =>
      restoredResponse({
        draft: draftWireOf(draftRevision, plan.draft),
        addedChangeCount: plan.addedChangeCount,
      }),
  };
}

function refused(
  word: Parameters<typeof dashboardConflictResponse>[0],
): DraftPlan {
  return { kind: "refused", response: dashboardConflictResponse(word) };
}

export interface RestorePlan {
  /** The draft the restore writes. */
  readonly draft: readonly DraftChange[];
  /** What the restore adds to the active book: the archived values that differ from it. */
  readonly addedChangeCount: number;
  /** The fields the restore changes in the candidate: those the archived book states differently. The audit count. */
  readonly differingCount: number;
}

export interface RestoreInput {
  readonly archived: PriceBook;
  readonly active: PriceBook;
  readonly draft: readonly DraftChange[];
}

export function planRestoreToDraft({
  archived,
  active,
  draft,
}: RestoreInput): RestorePlan {
  const deleted = deletedItemsOf(draft);
  const isOutsideDeletedRows = ({ address }: { address: BookFieldAddress }) =>
    !isOnDeletedRow(address, deleted);
  const candidate = applyChanges(active, draft);
  const differing = restoreChanges(
    archived,
    candidate.ok ? candidate.book : active,
  ).filter(isOutsideDeletedRows);
  const added = restoreChanges(archived, active).filter(isOutsideDeletedRows);
  const survivors = survivorsOfRestore(archived, draft, deleted);
  return {
    draft: [...survivors, ...added],
    addedChangeCount: added.length,
    differingCount: differing.length,
  };
}

/** The pending changes of fields the archived book does not state, or states on a row the draft deletes. A bulk group
 *  that lost a member is no group any more: `groupId` and `bulk` come together, so a survivor of it becomes an ordinary
 *  change. */
function survivorsOfRestore(
  archived: PriceBook,
  draft: readonly DraftChange[],
  deleted: readonly ItemRef[],
): readonly DraftChange[] {
  const statedAddresses = readEditableFields(archived)
    .map(({ address }) => address)
    .filter((address) => !isOnDeletedRow(address, deleted));
  const isStated = (change: DraftChange): boolean =>
    statedAddresses.some((address) => isSameAddress(address, change.address));
  const brokenGroupIds = new Set(
    draft.filter(isStated).flatMap(({ groupId }) => groupId ?? []),
  );
  return draft
    .filter((change) => !isStated(change))
    .map((change) =>
      change.groupId !== undefined && brokenGroupIds.has(change.groupId)
        ? withoutGroup(change)
        : change,
    );
}

function isOnDeletedRow(
  address: BookFieldAddress,
  deleted: readonly ItemRef[],
): boolean {
  const row = rowOfPriceAddress(address);
  return row !== undefined && deleted.some((item) => isSameItem(item, row));
}

function rowOfPriceAddress(address: BookFieldAddress): ItemRef | undefined {
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

function withoutGroup(change: DraftChange): DraftChange {
  const { groupId, bulk, ...ordinary } = change;
  void groupId;
  void bulk;
  return ordinary;
}
