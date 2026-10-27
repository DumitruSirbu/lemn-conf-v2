import "server-only";

import { randomUUID } from "node:crypto";

import type { NextResponse } from "next/server";

import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  revertChange,
  type PriceBook,
  type AppliedAddress,
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
import type { BulkPlanner } from "@/lib/server/price-dashboard/bulk-planner";
import { readAppliedAddress } from "@/lib/server/price-dashboard/draft-address";
import { judgeDraft } from "@/lib/server/price-dashboard/draft-judgement";
import type {
  BulkRequest,
  BulkTarget,
  DraftChangeRequest,
  RevertRequest,
} from "@/lib/server/price-dashboard/draft-requests";
import type {
  BulkRefusalCode,
  DashboardIssue,
} from "@/price-dashboard/price-dashboard-wire-contract";

// What each draft write does to the stored draft, decided before anything is written: the changes the draft becomes, the
// audit entry that goes with them in the same transaction, and the answer once they are stored. A write that cannot be made
// is the response that says why. The draft keeps one change per address (X0-4): a later change of an address replaces the
// earlier and goes last, since changes apply in order.

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

export function planChange(
  { address, value }: DraftChangeRequest,
  { draft, book }: ActiveDashboardState,
): DraftPlan {
  const kept = draft.changes.filter(
    (stored) => !isSameAddress(stored.address, address),
  );
  const changes = [...kept, { address, value } as DraftChange];
  const judgement = judgeDraft(book, changes, kept.length);
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
        entry: draftChangedEntry(address),
        answer: (draftRevision) =>
          draftChangedResponse(draftWireOf(draftRevision, changes)),
      };
  }
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
  const judgement = judgeDraft(
    book,
    removal.remaining,
    removal.remaining.length,
  );
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

/** A revert of what the draft does not hold writes nothing, and so no audit row either. */
function removalOfChange(
  changes: readonly DraftChange[],
  address: AppliedAddress,
): Removal {
  const remaining = revertChange(changes, address);
  if (remaining.length === changes.length) {
    return nothingToRemove("address");
  }
  return { kind: "removes", remaining, entry: draftRevertedEntry(address) };
}

function removalOfGroup(
  changes: readonly DraftChange[],
  groupId: string,
): Removal {
  const remaining = changes.filter((stored) => stored.groupId !== groupId);
  const revertedCount = changes.length - remaining.length;
  if (revertedCount === 0) return nothingToRemove("groupId");
  return {
    kind: "removes",
    remaining,
    entry: groupRevertedEntry(revertedCount),
  };
}

function nothingToRemove(field: "address" | "groupId"): Removal {
  return {
    kind: "nothing-to-remove",
    response: dashboardInvalidInputResponse([
      { field, code: "UNKNOWN_ADDRESS" },
    ]),
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
  if (plan.kind === "refused") {
    return refused(issueResponse(fieldOfBulkRefusal(plan.code), plan.code));
  }
  if (plan.changes.length === 0) {
    return refused(
      issueResponse(fieldOfEmptyTarget(request.target), "NO_CABINETS_SELECTED"),
    );
  }
  const changed = plan.changes.filter(
    ({ address, value }) => value !== currentValueOf(candidate.book, address),
  );
  if (changed.length === 0) {
    return refused(issueResponse("percent", "PERCENT_OUT_OF_RANGE"));
  }
  return writeBulk(request, state, mintedGroup(request, changed));
}

/** The member the person corrects when a target holds no cabinet the manufacturer prices. */
function fieldOfEmptyTarget(
  target: BulkTarget,
): DashboardIssue<string>["field"] {
  return target.scope === "selection" ? "ruleIds" : "scope";
}

/** A price as the candidate holds it: what a scaled amount that equals it leaves unchanged (A-14, ruling R2-Q7). */
function currentValueOf(book: PriceBook, address: unknown): unknown {
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
  planned: readonly { readonly address: unknown; readonly value: number }[],
): MintedGroup {
  const groupId = randomUUID();
  const bulk: DraftBulk =
    target.scope === "group"
      ? { percent, scope: "group", groupCode: target.groupCode }
      : { percent, scope: target.scope };
  const changes = planned.map(({ address, value }) => {
    const reading = readAppliedAddress(address);
    if (reading.kind !== "address") {
      throw new Error("The bulk planner named an address no draft can hold.");
    }
    return { address: reading.address, value, groupId, bulk } as DraftChange;
  });
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
  const judgement = judgeDraft(book, changes, kept.length);
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

function fieldOfBulkRefusal(
  code: BulkRefusalCode,
): DashboardIssue<string>["field"] {
  switch (code) {
    case "UNKNOWN_GROUP":
      return "groupCode";
    case "UNKNOWN_RULE":
    case "NO_CABINETS_SELECTED":
      return "ruleIds";
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
