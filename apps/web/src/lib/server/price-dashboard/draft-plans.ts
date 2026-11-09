import "server-only";

import { randomUUID } from "node:crypto";

import type { NextResponse } from "next/server";

import {
  applyChanges,
  countPendingPrices,
  isCreationAddress,
  isSameAddress,
  readEditableFields,
  revertChange,
  type AppliedAddress,
  type PriceBook,
  type ChangeRefusalCode,
  type DashboardAuditEntry,
  type DraftBulk,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  bulkChangedEntry,
  draftChangedEntry,
  draftRevertedEntry,
  groupRevertedEntry,
} from "@/lib/server/price-dashboard/dashboard-audit-entries";
import {
  bulkChangedResponse,
  dashboardConflictResponse,
  dashboardInvalidInputResponse,
  draftChangedResponse,
  draftWireOf,
} from "@/lib/server/price-dashboard/dashboard-responses";
import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import type {
  BulkPlanner,
  PlannedCabinetPrice,
} from "@/lib/server/price-dashboard/bulk-planner";
import { judgeDraft } from "@/price-dashboard/draft-judgement";
import type {
  BulkRequest,
  BulkTarget,
  RevertAddress,
  RevertRequest,
} from "@/lib/server/price-dashboard/draft-requests";
import type {
  BulkRefusalCode,
  DashboardIssue,
} from "@/price-dashboard/price-dashboard-wire-contract";

// What each draft write does to the stored draft, decided before anything is written: the changes the draft becomes, the
// audit entry that goes with them in the same transaction, and the answer once they are stored. A write that cannot be made
// is the response that says why. The draft keeps one change per address (X0-4): a later change of an address replaces the
// earlier and goes last, since changes apply in order. A creation is the exception: the changes that depend on it stand
// after it, so it is replaced where it stands.

export type DraftPlan =
  | { readonly kind: "refused"; readonly response: NextResponse }
  | {
      readonly kind: "write";
      readonly changes: readonly DraftChange[];
      readonly entry: DashboardAuditEntry;
      readonly answer: (draftRevision: string) => NextResponse;
    };

function refused(response: NextResponse): DraftPlan {
  return { kind: "refused", response };
}

function candidateRefused(): DraftPlan {
  return refused(dashboardConflictResponse("candidate-refused"));
}

// ---------------------------------------------------------------------------------------------------------------------
// One change

/** A change to put in the draft: also a creation, which only a creation route puts. */
export interface PutRequest {
  readonly address: RevertAddress;
  readonly value: unknown;
}

export function planChange(
  request: PutRequest,
  state: ActiveDashboardState,
): DraftPlan {
  return planChanges([request], state);
}

/**
 * Several changes in one write, judged once; the first is the one the audit row names. A change of an address the draft
 * holds replaces it and goes last, except a creation, which is replaced where it stands.
 */
export function planChanges(
  requests: readonly [PutRequest, ...PutRequest[]],
  { draft, book }: ActiveDashboardState,
): DraftPlan {
  const put = putChanges(draft.changes, requests);
  const { changes } = put;
  const judgement = judgeDraft({
    book,
    changes,
    newIndexes: put.newIndexes,
    stored: draft.changes,
  });
  switch (judgement.kind) {
    case "candidate-refused":
      return candidateRefused();
    case "refused-new-change":
      return refused(
        dashboardInvalidInputResponse([
          { field: "change", code: judgement.code },
        ]),
      );
    case "applies":
      return {
        kind: "write",
        changes,
        entry: draftChangedEntry(requests[0].address),
        answer: (draftRevision) =>
          draftChangedResponse(draftWireOf(draftRevision, changes)),
      };
  }
}

interface PutChanges {
  readonly changes: readonly DraftChange[];
  /** Where the put changes stand. */
  readonly newIndexes: ReadonlySet<number>;
}

interface Placed {
  readonly change: DraftChange;
  readonly isPut: boolean;
}

function putChanges(
  stored: readonly DraftChange[],
  requests: readonly PutRequest[],
): PutChanges {
  let placed: readonly Placed[] = stored.map((change) => ({
    change,
    isPut: false,
  }));
  for (const { address, value } of requests) {
    placed = putChange(placed, { address, value } as DraftChange);
  }
  return {
    changes: placed.map(({ change }) => change),
    newIndexes: new Set(
      placed.flatMap(({ isPut }, index) => (isPut ? [index] : [])),
    ),
  };
}

/** `change` last, in the place of any change of its address; a creation stays where it stands. */
function putChange(
  placed: readonly Placed[],
  change: DraftChange,
): readonly Placed[] {
  const put: Placed = { change, isPut: true };
  const isSame = (held: Placed) =>
    isSameAddress(held.change.address, change.address);
  if (isCreationAddress(change.address) && placed.some(isSame)) {
    return placed.map((held) => (isSame(held) ? put : held));
  }
  return [...placed.filter((held) => !isSame(held)), put];
}

// ---------------------------------------------------------------------------------------------------------------------
// A revert

export function planRevert(
  { target }: RevertRequest,
  { draft, book }: ActiveDashboardState,
): DraftPlan {
  const removal =
    target.kind === "change"
      ? removalOfChange(draft.changes, target.address)
      : removalOfGroup(draft.changes, target.groupId);
  if (removal.kind === "nothing-to-remove") return refused(removal.response);
  const judgement = judgeDraft({
    book,
    changes: removal.remaining,
    firstNewIndex: removal.remaining.length,
    stored: draft.changes,
  });
  if (judgement.kind !== "applies") return candidateRefused();
  return {
    kind: "write",
    changes: removal.remaining,
    entry: removal.entry,
    answer: (draftRevision) =>
      draftChangedResponse(draftWireOf(draftRevision, removal.remaining)),
  };
}

type Removal =
  | {
      readonly kind: "removes";
      readonly remaining: readonly DraftChange[];
      readonly entry: DashboardAuditEntry;
    }
  | { readonly kind: "nothing-to-remove"; readonly response: NextResponse };

/**
 * A revert names a change the draft holds. The domain's `revertChange` takes a whole created row for a field it has no
 * change of, so an address the draft does not hold is refused here: it writes nothing, and no audit row either. A field
 * of an item the draft deletes is not taken back by naming it, since what leaves is the deletion: the deletion is taken
 * back by its own address. The audit row names what left the draft: a created row's creation, with the count of changes
 * that went with it.
 */
function removalOfChange(
  changes: readonly DraftChange[],
  address: RevertAddress,
): Removal {
  const isHeld = changes.some((held) => isSameAddress(held.address, address));
  if (!isHeld) return nothingToRemove("address");
  const remaining = revertChange(changes, address);
  const kept = new Set(remaining);
  const removed = changes.filter((held) => !kept.has(held));
  if (namesAField(address) && removed.some(isDeletion)) {
    return notEditable("address");
  }
  return {
    kind: "removes",
    remaining,
    entry: revertedEntryOf(address, removed),
  };
}

/** A creation and a deletion are taken back by their own addresses; any other address names a field of a row. */
function namesAField(address: RevertAddress): boolean {
  return !isCreationAddress(address) && address.kind !== "item-deleted";
}

function isDeletion({ address }: DraftChange): boolean {
  return address.kind === "item-deleted";
}

function revertedEntryOf(
  address: RevertAddress,
  removed: readonly DraftChange[],
): DashboardAuditEntry {
  const creation = removed.find(({ address: gone }) => isCreationAddress(gone));
  return creation === undefined
    ? draftRevertedEntry(address, 1)
    : draftRevertedEntry(creation.address, removed.length);
}

function removalOfGroup(
  changes: readonly DraftChange[],
  groupId: string,
): Removal {
  const remaining = changes.filter((stored) => stored.groupId !== groupId);
  if (remaining.length === changes.length) return nothingToRemove("groupId");
  const revertedCount = countPendingPrices(
    changes.filter((stored) => stored.groupId === groupId),
  );
  return {
    kind: "removes",
    remaining,
    entry: groupRevertedEntry(revertedCount),
  };
}

function nothingToRemove(field: "address" | "groupId"): Removal {
  return refusedRemoval(field, "UNKNOWN_ADDRESS");
}

function notEditable(field: "address"): Removal {
  return refusedRemoval(field, "NOT_EDITABLE");
}

function refusedRemoval(
  field: "address" | "groupId",
  code: "UNKNOWN_ADDRESS" | "NOT_EDITABLE",
): Removal {
  return {
    kind: "nothing-to-remove",
    response: dashboardInvalidInputResponse([{ field, code }]),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// A bulk action

export function planBulk(
  request: BulkRequest,
  state: ActiveDashboardState,
  planner: BulkPlanner,
): DraftPlan {
  const candidate = applyChanges(state.book, state.draft.changes);
  if (!candidate.ok) return candidateRefused();
  const isRuleUnknown = hasUnknownRule(
    request.target,
    candidate.book.cabinetRules,
  );
  if (isRuleUnknown) return refused(issueResponse("ruleIds", "UNKNOWN_RULE"));
  const plan = planner.plan({
    book: candidate.book,
    target: request.target,
    percent: request.percent,
  });
  if (plan.kind === "refused") return refusedBulk(plan.code, request.target);
  if (plan.changes.length === 0) {
    return refusedBulk("NO_CABINETS_SELECTED", request.target);
  }
  const changed = plan.changes.filter(
    ({ address, value }) => value !== currentValueOf(candidate.book, address),
  );
  if (changed.length === 0) {
    return refused(issueResponse("percent", "PERCENT_OUT_OF_RANGE"));
  }
  return writeBulk(request, state, mintedGroup(request, changed));
}

/** A price as the candidate holds it: what a scaled amount that equals it leaves unchanged (A-14, ruling R2-Q7). */
function currentValueOf(book: PriceBook, address: AppliedAddress): unknown {
  return readEditableFields(book).find((reading) =>
    isSameAddress(reading.address, address),
  )?.value;
}

function hasUnknownRule(
  target: BulkTarget,
  rules: readonly { readonly ruleId: string }[],
): boolean {
  if (target.scope !== "selection") return false;
  const known = new Set(rules.map(({ ruleId }) => ruleId));
  return target.ruleIds.some((ruleId) => !known.has(ruleId));
}

interface MintedGroup {
  readonly changes: readonly DraftChange[];
  readonly bulk: DraftBulk;
}

/** Each planned price becomes a change of one new group, every one carrying the same `bulk` as it was asked. */
function mintedGroup(
  { target, percent }: BulkRequest,
  planned: readonly PlannedCabinetPrice[],
): MintedGroup {
  const groupId = randomUUID();
  const bulk: DraftBulk =
    target.scope === "group"
      ? { percent, scope: "group", groupCode: target.groupCode }
      : { percent, scope: target.scope };
  const changes = planned.map(
    ({ address, value }) => ({ address, value, groupId, bulk }) as DraftChange,
  );
  return { changes, bulk };
}

function writeBulk(
  request: BulkRequest,
  { draft, book }: ActiveDashboardState,
  { changes: minted, bulk }: MintedGroup,
): DraftPlan {
  const kept = draft.changes.filter(
    (stored) =>
      !minted.some((change) => isSameAddress(stored.address, change.address)),
  );
  const changes = [...kept, ...minted];
  const judgement = judgeDraft({ book, changes, firstNewIndex: kept.length });
  if (judgement.kind === "candidate-refused") return candidateRefused();
  if (judgement.kind === "refused-new-change") {
    return refused(refusalOfPlannedPrice(judgement.code));
  }
  const counts = countsOf(minted);
  return {
    kind: "write",
    changes,
    entry: bulkChangedEntry({ ...bulk, ...counts }),
    answer: (draftRevision) =>
      bulkChangedResponse({
        draft: draftWireOf(draftRevision, changes),
        ...counts,
      }),
  };
}

/** Cabinets touched, and prices touched, as the diff counts a group (`diffBooks`). */
function countsOf(minted: readonly DraftChange[]): {
  readonly ruleCount: number;
  readonly amountCount: number;
} {
  const ruleIds = new Set(
    minted.flatMap(({ address }) =>
      "ruleId" in address ? [address.ruleId] : [],
    ),
  );
  return { ruleCount: ruleIds.size, amountCount: minted.length };
}

/** A price the scaling pushed past the book's bounds is the percentage's fault; any other refusal is the planner's. */
function refusalOfPlannedPrice(code: ChangeRefusalCode): NextResponse {
  if (code === "TOO_LARGE")
    return issueResponse("percent", "PERCENT_OUT_OF_RANGE");
  if (code === "NEGATIVE")
    return issueResponse("percent", "PRICE_WOULD_BE_NEGATIVE");
  return dashboardConflictResponse("candidate-refused");
}

function refusedBulk(code: BulkRefusalCode, target: BulkTarget): DraftPlan {
  return refused(issueResponse(fieldOfBulkRefusal(code, target), code));
}

/** The member of the request the person corrects. A target that holds no cabinet is named by the target's own member:
 *  the ids a selection listed, else the scope. */
function fieldOfBulkRefusal(
  code: BulkRefusalCode,
  target: BulkTarget,
): DashboardIssue<string>["field"] {
  switch (code) {
    case "UNKNOWN_GROUP":
      return "groupCode";
    case "UNKNOWN_RULE":
      return "ruleIds";
    case "NO_CABINETS_SELECTED":
      return target.scope === "selection" ? "ruleIds" : "scope";
    default:
      return "percent";
  }
}

function issueResponse(
  field: DashboardIssue<string>["field"],
  code: BulkRefusalCode,
): NextResponse {
  return dashboardInvalidInputResponse([{ field, code }]);
}
