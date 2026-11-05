import "server-only";

import type { NextResponse } from "next/server";

import {
  applyChanges,
  hardwareRatesOf,
  judgeBookAgainstCatalog,
  type BookRefusal,
  type DraftChange,
  type ItemRef,
  type LinkTargetRefusalCode,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import {
  mintCreatedId,
  takenIdsOf,
} from "@/lib/server/price-dashboard/created-ids";
import {
  dashboardConflictResponse,
  dashboardInvalidInputResponse,
  draftChangeCreatedResponse,
  draftWireOf,
} from "@/lib/server/price-dashboard/dashboard-responses";
import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import {
  planChanges,
  type DraftPlan,
  type PutRequest,
} from "@/lib/server/price-dashboard/draft-plans";
import type {
  CreateAccessoryRequest,
  CreateHardwareClassRequest,
} from "@/lib/server/price-dashboard/draft-requests";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";

// What a creation does to the stored draft. The id is minted here, once the draft is known to be the one the page read,
// and the creation goes first so that the audit row is named after it. A class is written with a rate for each field the
// active book's classes state, in one judgement: the draft never holds a class without them, nor a rate for a row it has
// not created. Nothing is created while the draft beside it makes no book: `candidate-refused`.

export function planHardwareClassCreation(
  { value, rates }: CreateHardwareClassRequest,
  state: ActiveDashboardState,
): DraftPlan {
  if (hasRateOutsideTheBook(rates, state.book)) {
    return refused(dashboardInvalidInputResponse([notEditable]));
  }
  const tierId = mintedIdFor(state);
  const creation: PutRequest = {
    address: { kind: "hardware-tier-created", tierId },
    value,
  };
  const plan = planChanges(
    [creation, ...ratesOf(tierId, rates, state.book)],
    state,
  );
  if (plan.kind === "refused") return plan;
  if (candidateOf(state.book, plan.changes) === undefined) {
    return candidateRefused();
  }
  return answeringWithCreated(plan, { kind: "hardware", tierId });
}

export function planAccessoryCreation(
  { value }: CreateAccessoryRequest,
  state: ActiveDashboardState,
): DraftPlan {
  const accessoryId = mintedIdFor(state);
  const creation: PutRequest = {
    address: { kind: "accessory-created", accessoryId },
    value,
  };
  const plan = planChanges([creation], state);
  if (plan.kind === "refused") return plan;
  const candidate = candidateOf(state.book, plan.changes);
  if (candidate === undefined) return candidateRefused();
  const refusal = refusalOfLink(candidate, accessoryId);
  if (refusal !== undefined) {
    return refused(
      dashboardInvalidInputResponse([{ field: "change", code: refusal }]),
    );
  }
  return answeringWithCreated(plan, { kind: "accessory", accessoryId });
}

const notEditable = { field: "change", code: "NOT_EDITABLE" } as const;

function refused(response: NextResponse): DraftPlan {
  return { kind: "refused", response };
}

function candidateRefused(): DraftPlan {
  return refused(dashboardConflictResponse("candidate-refused"));
}

function mintedIdFor({ book, draft }: ActiveDashboardState): string {
  return mintCreatedId(takenIdsOf(book, draft.changes));
}

/** A rate for each field the book's classes state; one the request leaves out is left out here, so that the domain
 *  refuses the class for lacking it. */
function ratesOf(
  tierId: string,
  rates: CreateHardwareClassRequest["rates"],
  book: PriceBook,
): readonly PutRequest[] {
  return hardwareRatesOf(book).flatMap((field) =>
    Object.hasOwn(rates, field)
      ? [{ address: { kind: "hardware", tierId, field }, value: rates[field] }]
      : [],
  );
}

/** The book the draft makes, or `undefined` when the draft makes none. */
function candidateOf(
  book: PriceBook,
  changes: readonly DraftChange[],
): PriceBook | undefined {
  const applied = applyChanges(book, changes);
  return applied.ok ? applied.book : undefined;
}

/**
 * The code the creation's link is refused for in the candidate, judged against the catalogue; `undefined` for a link
 * that holds. Only the new accessory's own refusals count: whatever else the catalogue finds in the book is the
 * publish's to say.
 */
function refusalOfLink(
  candidate: PriceBook,
  accessoryId: string,
): LinkTargetRefusalCode | undefined {
  const judged = judgeBookAgainstCatalog(candidate, shippedCatalogue());
  if (judged.ok) return undefined;
  return judged.refusals.find(isLinkRefusalOf(accessoryId))?.code;
}

type LinkRefusal = Extract<
  BookRefusal,
  { readonly code: LinkTargetRefusalCode }
>;

function isLinkRefusalOf(
  accessoryId: string,
): (refusal: BookRefusal) => refusal is LinkRefusal {
  return (refusal): refusal is LinkRefusal =>
    (refusal.code === "LINK_TARGET_UNKNOWN" ||
      refusal.code === "LINK_TARGET_CUSTOMER_SUPPLIED") &&
    refusal.accessoryId === accessoryId;
}

function hasRateOutsideTheBook(
  rates: CreateHardwareClassRequest["rates"],
  book: PriceBook,
): boolean {
  const stated: readonly string[] = hardwareRatesOf(book);
  return Object.keys(rates).some((field) => !stated.includes(field));
}

/** The plan told as a creation: the draft it makes, and the row whose id the server minted. */
function answeringWithCreated(plan: DraftPlan, created: ItemRef): DraftPlan {
  if (plan.kind === "refused") return plan;
  return {
    ...plan,
    answer: (draftRevision) =>
      draftChangeCreatedResponse({
        draft: draftWireOf(draftRevision, plan.changes),
        created,
      }),
  };
}
