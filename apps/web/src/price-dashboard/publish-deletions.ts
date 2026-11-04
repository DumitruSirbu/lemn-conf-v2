import {
  deletedItemsOf,
  isItemStated,
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
  const deleted = deletedItemsOf(changes);
  if (deleted.length === 0) return { kind: "none" };
  const judged = facts ?? factsWithoutCounts(deleted, book);
  if (judged === undefined) return { kind: "cannot-judge" };
  const refusals = refusalsOf({ book, changes, ...judged });
  return refusals === undefined ? { kind: "cannot-judge" } : blockOf(refusals);
}

/**
 * What a draft that deletes only rows the book does not state is judged by: such a row, one the draft created, has no user
 * and needs no count. `undefined` when a deleted row is one the book states, whose use only a count can tell.
 */
function factsWithoutCounts(
  deleted: readonly ItemRef[],
  book: PriceBook,
): DeletionFacts | undefined {
  const needsCount = deleted.some((item) => isItemStated(item, book));
  return needsCount ? undefined : { usage: [], defaults: {} };
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
