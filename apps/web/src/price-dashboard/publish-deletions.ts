import {
  deletedItemsOf,
  judgeDeletionsAtPublish,
  UsageNotCountedError,
  type DraftChange,
  type ItemRef,
  type ItemUsageCounts,
  type NewKitchenSettings,
  type PriceBook,
  type PublishDeletionRefusal,
} from "@lemnaria/configurator-domain";

import type { PublishBlock } from "./publish-client";

// Whether the deletions a draft holds can be published, judged on the page before a publish is asked for. Which saved
// kitchens use a deleted row is counted by a reader that is not available everywhere: without its counts the judgement is
// `cannot-judge`, never a count made up and never an allowance.

/** What judging a deletion needs besides the draft: the saved kitchens' use of each deleted row, and the saved defaults. */
export interface DeletionFacts {
  readonly usage: ItemUsageCounts;
  readonly defaults: NewKitchenSettings;
}

export type DeletionJudgement =
  | { readonly kind: "none" }
  | { readonly kind: "cannot-judge" }
  | { readonly kind: "blocked"; readonly block: PublishBlock };

export interface PendingDeletions {
  readonly book: PriceBook;
  readonly changes: readonly DraftChange[];
  /** Absent where the counts cannot be had. */
  readonly facts: DeletionFacts | undefined;
}

export function judgePendingDeletions({
  book,
  changes,
  facts,
}: PendingDeletions): DeletionJudgement {
  if (deletedItemsOf(changes).length === 0) return { kind: "none" };
  if (facts === undefined) return { kind: "cannot-judge" };
  const refusals = refusalsOf({ book, changes, ...facts });
  return refusals === undefined ? { kind: "cannot-judge" } : blockOf(refusals);
}

/** `undefined` when a deleted row has no count: the judgement throws rather than read it as unused. */
function refusalsOf(
  request: Parameters<typeof judgeDeletionsAtPublish>[0],
): readonly PublishDeletionRefusal[] | undefined {
  try {
    return judgeDeletionsAtPublish(request);
  } catch (failure) {
    if (failure instanceof UsageNotCountedError) return undefined;
    throw failure;
  }
}

/** A default is named before a use, as the publish names the cause nothing can be done about by waiting. A row that is
 *  never deleted has no words here, so it is not judged. */
function blockOf(
  refusals: readonly PublishDeletionRefusal[],
): DeletionJudgement {
  if (refusals.length === 0) return { kind: "none" };
  const defaulted = refusals.find(({ code }) => isDefaultCode(code));
  if (defaulted !== undefined) {
    return {
      kind: "blocked",
      block: { kind: "is-default", item: defaulted.item },
    };
  }
  const items: ItemRef[] = refusals
    .filter(({ code }) => code === "item-in-use")
    .map(({ item }) => item);
  return items.length === 0
    ? { kind: "cannot-judge" }
    : { kind: "blocked", block: { kind: "in-use", items } };
}

function isDefaultCode(code: PublishDeletionRefusal["code"]): boolean {
  return code === "item-is-default" || code === "item-is-fixed-default";
}
