import "server-only";

import type { NextResponse } from "next/server";

import {
  applyChanges,
  buildIdsPricedAs,
  deletedBookItemsOf,
  judgeBookAgainstCatalog,
  type DraftChange,
  type ItemRef,
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

/**
 * Each deletion of a row the active book holds, a linked accessory with the build ids the catalogue prices as its row. A
 * kind a deletion cannot be, or an accessory the book states no rule for, goes with none, and the store refuses the
 * publish rather than leave it unguarded.
 */
function deletedItemsOf(
  changes: readonly DraftChange[],
  book: PriceBook,
): readonly DeletedItem[] {
  return deletedBookItemsOf(changes).flatMap((item) => {
    const deleted = deletedItemFor(item, book);
    return deleted === undefined ? [] : [deleted];
  });
}

function deletedItemFor(
  item: ItemRef,
  book: PriceBook,
): DeletedItem | undefined {
  if (item.kind === "material" || item.kind === "hardware") return { item };
  if (item.kind !== "accessory") return undefined;
  const rule = book.linkedAccessories.find(
    ({ accessoryId }) => accessoryId === item.accessoryId,
  );
  return rule === undefined
    ? undefined
    : {
        item,
        buildIds: withTheRulesOwnRow(rule.linkedBuildId),
      };
}

type Candidate =
  | { readonly ok: true; readonly book: PriceBook }
  | { readonly ok: false; readonly refusals: readonly CandidateRefusalWire[] };

/** The rows priced as the one an accessory is linked to, then that row itself where the catalogue no longer holds it. */
function withTheRulesOwnRow(linkedBuildId: string): readonly string[] {
  const priced = buildIdsPricedAs(shippedCatalogue(), linkedBuildId);
  return priced.includes(linkedBuildId) ? priced : [...priced, linkedBuildId];
}

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
