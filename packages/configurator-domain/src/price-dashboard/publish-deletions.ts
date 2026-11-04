import { isSameItem, type ItemRef } from "../pricing/catalogue-availability.js";
import { isBuiltInAccessoryId } from "../pricing/price-book.js";

import type { DraftChange } from "./book-field-address.js";
import type { DefaultsContext } from "./defaults-judgement.js";
import { deletedItemsOf } from "./draft-structure.js";
import { isItemStated } from "./item-groups.js";
import { judgeDeletion, type DeletionRefusalCode } from "./item-lifecycle.js";
import type { ItemUsageCounts } from "./item-usage.js";

// A deletion is a draft change, and the draft is older than the publish: an item judged unused when it was queued may
// have gained a kitchen since (A-18). The publish judges every deletion again, against the usage and the defaults read
// at the availability revision it compares and sets, and one refused deletion refuses the whole publish (D7G).

/** Why a deletion stops a publish: `judgeDeletion`'s words, and a kind of item that is never deleted. */
export type PublishDeletionRefusalCode =
  | DeletionRefusalCode
  | "item-not-deletable";

export interface PublishDeletionRefusal {
  readonly item: ItemRef;
  readonly code: PublishDeletionRefusalCode;
}

/** The draft, the usage counted for `deletedItemsOf(changes)`, and the active book and saved defaults the counts and
 *  the defaults were read against. */
export interface PublishDeletionsRequest extends DefaultsContext {
  readonly changes: readonly DraftChange[];
  readonly usage: ItemUsageCounts;
}

/**
 * Every deletion in the draft that cannot be published, in draft order, once per item; empty when all can. The result
 * does not depend on the order of the other changes. A colour, a handle and a built-in accessory are code's and are
 * never deleted. An item the active book does not state (one the draft created) has no user and is not counted. Throws
 * `UsageNotCountedError` when a deleted item the book states has no count: a missing count is never read as unused.
 */
export function judgeDeletionsAtPublish(
  request: PublishDeletionsRequest,
): readonly PublishDeletionRefusal[] {
  const refusals: PublishDeletionRefusal[] = [];
  for (const item of deletedItemsOf(request.changes)) {
    if (refusals.some((refusal) => isSameItem(refusal.item, item))) continue;
    const code = refusalCodeOf(item, request);
    if (code !== undefined) refusals.push({ item, code });
  }
  return refusals;
}

function refusalCodeOf(
  item: ItemRef,
  { book, defaults, usage }: PublishDeletionsRequest,
): PublishDeletionRefusalCode | undefined {
  if (!isDeletableKind(item)) return "item-not-deletable";
  if (!isItemStated(item, book)) return undefined;
  const verdict = judgeDeletion({ item, usage, book, defaults });
  return verdict.kind === "refused" ? verdict.code : undefined;
}

type DeletableItem = Extract<
  ItemRef,
  { readonly kind: "hardware" | "material" | "accessory" }
>;

function isDeletableKind(item: ItemRef): item is DeletableItem {
  if (item.kind === "accessory") return !isBuiltInAccessoryId(item.accessoryId);
  return item.kind === "hardware" || item.kind === "material";
}
