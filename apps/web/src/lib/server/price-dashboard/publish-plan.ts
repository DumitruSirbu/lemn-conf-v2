import "server-only";

import type { NextResponse } from "next/server";

import {
  applyChanges,
  judgeBookAgainstCatalog,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { DeletedItem } from "@lemnaria/persistence";

import {
  refusalOfBook,
  refusalsOfApplication,
} from "@/lib/server/price-dashboard/candidate-refusals";
import {
  candidateRefusedResponse,
  dashboardConflictResponse,
} from "@/lib/server/price-dashboard/dashboard-responses";
import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import { deletedItemsOf } from "@/lib/server/price-dashboard/deletion-facts";
import type { PublishRequest } from "@/lib/server/price-dashboard/publish-requests";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";
import type { CandidateRefusalWire } from "@/price-dashboard/price-dashboard-wire-contract";

// The book a publish stores is computed here from the stored draft, never taken from the request, and is judged whole
// against the shipped catalogue before the store is asked (see ADR 0178 F10). Every refusal writes nothing.

export type PublishPlan =
  | { readonly kind: "refused"; readonly response: NextResponse }
  | {
      readonly kind: "publish";
      readonly book: PriceBook;
      /** The published changes, as the draft held them: stored beside the book as its change summary. */
      readonly changes: readonly DraftChange[];
      /** The deletions of rows the active book holds, as the store's guard on a used item is asked about them. */
      readonly deletedItems: readonly DeletedItem[];
    };

export function planPublish(
  request: PublishRequest,
  { draft, book, version }: ActiveDashboardState,
): PublishPlan {
  const isStale =
    draft.draftRevision !== request.expectedDraftRevision ||
    version.sequenceNumber !== request.expectedActiveSequence;
  if (isStale) return refused("changed-meanwhile");
  if (draft.changes.length === 0) return refused("nothing-to-publish");
  const candidate = candidateOf(book, draft.changes);
  if (!candidate.ok) {
    return {
      kind: "refused",
      response: candidateRefusedResponse(candidate.refusals),
    };
  }
  return {
    kind: "publish",
    book: candidate.book,
    changes: draft.changes,
    deletedItems: deletedItemsOf(draft.changes, book),
  };
}

/** A publish plan that went through: the book to store, and the deletions the store's guard is asked about. */
export type PublishingPlan = Extract<PublishPlan, { readonly kind: "publish" }>;

type Candidate =
  | { readonly ok: true; readonly book: PriceBook }
  | { readonly ok: false; readonly refusals: readonly CandidateRefusalWire[] };

/** The book the changes make, parsed and judged against the catalogue, or every reason either refuses it. */
function candidateOf(
  book: PriceBook,
  changes: readonly DraftChange[],
): Candidate {
  const applied = applyChanges(book, changes);
  if (!applied.ok)
    return { ok: false, refusals: refusalsOfApplication(applied) };
  const judged = judgeBookAgainstCatalog(applied.book, shippedCatalogue());
  return judged.ok
    ? { ok: true, book: applied.book }
    : { ok: false, refusals: judged.refusals.map(refusalOfBook) };
}

function refused(
  word: Parameters<typeof dashboardConflictResponse>[0],
): PublishPlan {
  return { kind: "refused", response: dashboardConflictResponse(word) };
}
