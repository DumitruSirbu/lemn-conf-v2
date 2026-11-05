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
// not created.

export function planHardwareClassCreation(
  { value, rates }: CreateHardwareClassRequest,
  state: ActiveDashboardState,
): DraftPlan {
  const tierId = mintedIdFor(state);
  const creation: PutRequest = {
    address: { kind: "hardware-tier-created", tierId },
    value,
  };
  const plan = planChanges(
    [creation, ...ratesOf(tierId, rates, state.book)],
    state,
  );
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
  const refusal = refusalOfLink(state.book, plan.changes, accessoryId);
  if (refusal === undefined) {
    return answeringWithCreated(plan, { kind: "accessory", accessoryId });
  }
  return { kind: "refused", response: responseOfLinkRefusal(refusal) };
}

function responseOfLinkRefusal(
  refusal: LinkTargetRefusalCode | "candidate-refused",
): NextResponse {
  return refusal === "candidate-refused"
    ? dashboardConflictResponse(refusal)
    : dashboardInvalidInputResponse([{ field: "change", code: refusal }]);
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

/**
 * The code the creation's link is refused for in the candidate, judged against the catalogue; `undefined` for a link
 * that holds. Only the new accessory's own refusals count: whatever else the catalogue finds in the book is the
 * publish's to say.
 */
function refusalOfLink(
  book: PriceBook,
  changes: readonly DraftChange[],
  accessoryId: string,
): LinkTargetRefusalCode | "candidate-refused" | undefined {
  const candidate = applyChanges(book, changes);
  if (!candidate.ok) return "candidate-refused";
  const judged = judgeBookAgainstCatalog(candidate.book, shippedCatalogue());
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
