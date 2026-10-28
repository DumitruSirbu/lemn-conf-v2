import "server-only";

import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  restoreChanges,
  type DraftChange,
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

// What a restore makes of the draft (M10 plan R3; ruling U5-Q6, 2026-10-27). `restoreChanges(archived, active)` is exact
// only relative to its second argument: against the active book alone, a field the draft already edits (active 100, draft
// 120, archived 100) emits nothing, and the candidate keeps 120. So the restore is made against the candidate the draft
// makes, and it replaces by address: every pending change of a field the archived book states is dropped, and the archived
// values that differ from the active book are added in its place. The candidate then equals the archived book on every
// field both books state ("puts the old prices in the draft", D8C), and a pending change to anything else stays.

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
  const { addedChangeCount } = plan;
  return {
    kind: "write",
    changes: plan.draft,
    entry: restoredToDraftEntry({
      fromSequenceNumber: version.sequenceNumber,
      addedChangeCount,
    }),
    answer: (draftRevision) =>
      restoredResponse({
        draft: draftWireOf(draftRevision, plan.draft),
        addedChangeCount,
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
  /** What the restore adds to the active book: the archived values that differ from it. The count the audit row keeps. */
  readonly addedChangeCount: number;
  /** How many fields the archived book states differently from the candidate; 0 means the restore changes nothing. */
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
  const candidate = applyChanges(active, draft);
  const differing = restoreChanges(
    archived,
    candidate.ok ? candidate.book : active,
  );
  const added = restoreChanges(archived, active);
  const survivors = survivorsOfRestore(archived, draft);
  return {
    draft: [...survivors, ...added],
    addedChangeCount: added.length,
    differingCount: differing.length,
  };
}

/** The pending changes of fields the archived book does not state. A bulk group that lost a member is no group any more:
 *  `groupId` and `bulk` come together, so a survivor of it becomes an ordinary change. */
function survivorsOfRestore(
  archived: PriceBook,
  draft: readonly DraftChange[],
): readonly DraftChange[] {
  const statedAddresses = readEditableFields(archived).map(
    ({ address }) => address,
  );
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

function withoutGroup(change: DraftChange): DraftChange {
  const { groupId, bulk, ...ordinary } = change;
  void groupId;
  void bulk;
  return ordinary as DraftChange;
}
