import "server-only";

import type { NextResponse } from "next/server";

import {
  applyChanges,
  judgeBookAgainstCatalog,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { dashboardConflictResponse } from "@/lib/server/price-dashboard/dashboard-responses";
import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import type { PublishRequest } from "@/lib/server/price-dashboard/publish-requests";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";

// What a publish stores, decided before anything is written: the book the stored draft makes, judged whole. The book is
// computed here from the draft the store holds at the revision the page read, never taken from the request (F10), and the
// store is asked only for a book the domain has parsed and judged against the catalogue it will price (A-7, M2's
// `judgeBookAgainstCatalog`). Every refusal answers a state of the data, with nothing written.

export type PublishPlan =
  | { readonly kind: "refused"; readonly response: NextResponse }
  | {
      readonly kind: "publish";
      readonly book: PriceBook;
      /** The published changes, as the draft held them: stored beside the book as its change summary (m8). */
      readonly changes: readonly DraftChange[];
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
  if (candidate === undefined) return refused("candidate-refused");
  return { kind: "publish", book: candidate, changes: draft.changes };
}

/**
 * The book the changes make, parsed (`applyChanges` parses its result) and judged against the catalogue; `undefined` when
 * either refuses it. The wire's `candidate-refused` carries no member, so the code and the field the judgement names (D3C's
 * "0 sau negativ" is `PRICE_NOT_POSITIVE` with its rule, width and driving field) stay with the domain.
 */
function candidateOf(
  book: PriceBook,
  changes: readonly DraftChange[],
): PriceBook | undefined {
  const applied = applyChanges(book, changes);
  if (!applied.ok) return undefined;
  const judged = judgeBookAgainstCatalog(applied.book, shippedCatalogue());
  return judged.ok ? applied.book : undefined;
}

function refused(
  word: Parameters<typeof dashboardConflictResponse>[0],
): PublishPlan {
  return { kind: "refused", response: dashboardConflictResponse(word) };
}
