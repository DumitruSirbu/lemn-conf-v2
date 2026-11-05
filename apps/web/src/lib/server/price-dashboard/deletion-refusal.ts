import "server-only";

import type { NextResponse } from "next/server";

import {
  isDefaultCode,
  judgeDeletionsAtPublish,
  type PublishDeletionRefusal,
} from "@lemnaria/configurator-domain";

import {
  itemInUseResponse,
  itemIsDefaultResponse,
} from "@/lib/server/price-dashboard/dashboard-responses";
import {
  readDeletionFacts,
  type DeletionBasis,
} from "@/lib/server/price-dashboard/deletion-facts";
import type { PublishingPlan } from "@/lib/server/price-dashboard/publish-plan";

/** The judgement refused a deletion for a reason the wire has no word for. */
export class UnansweredDeletionRefusalError extends Error {
  constructor(refusals: readonly PublishDeletionRefusal[]) {
    super(
      `No answer for the deletion refusals: ${refusals.map(({ code }) => code).join(", ")}.`,
    );
    this.name = "UnansweredDeletionRefusalError";
  }
}

/**
 * The refusal of the plan's deletions, judged against the usage and the saved defaults read in this request, or
 * `undefined` when each may go. Nothing a page counted earlier reaches it.
 */
export async function refusalOfDeletions(
  { changes, deletedItems }: PublishingPlan,
  { stores, book }: Omit<DeletionBasis, "deleted">,
): Promise<NextResponse | undefined> {
  const facts = await readDeletionFacts({
    stores,
    book,
    deleted: deletedItems,
  });
  const refusals = judgeDeletionsAtPublish({ changes, book, ...facts });
  return refusals.length === 0 ? undefined : answerOfRefusals(refusals);
}

/**
 * A default is named before a use, since waiting does not clear it. A refusal with neither word (a kind that is never
 * deleted) has no answer here and is thrown, so it can never be read as an allowance.
 */
function answerOfRefusals(
  refusals: readonly PublishDeletionRefusal[],
): NextResponse {
  const defaulted = refusals.find(({ code }) => isDefaultCode(code));
  if (defaulted !== undefined) return itemIsDefaultResponse(defaulted.item);
  const used = refusals.filter(({ code }) => code === "item-in-use");
  if (used.length === 0) throw new UnansweredDeletionRefusalError(refusals);
  return itemInUseResponse(used.map(({ item }) => item));
}
