import "server-only";

import type { NextResponse } from "next/server";

import {
  defaultItemsOf,
  isItemStated,
  isSameItem,
  usageCountOf,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { DeletedItem } from "@lemnaria/persistence";

import { dashboardInvalidInputResponse } from "@/lib/server/price-dashboard/dashboard-responses";
import {
  countDeletedItems,
  deletedItemsOf,
} from "@/lib/server/price-dashboard/deletion-facts";
import type { PutRequest } from "@/lib/server/price-dashboard/draft-plans";
import { withinUsageDeadline } from "@/lib/server/price-dashboard/item-usage-read";
import { readSavedDefaults } from "@/lib/server/price-dashboard/saved-defaults";
import type { PriceStores } from "@/lib/server/price-stores";
import type { DraftChangeRefusalCode } from "@/price-dashboard/price-dashboard-wire-contract";

// The check a draft write that deletes a row makes before it is stored (R4c2, ruling 8): the saved defaults, then one
// count of the saved designs using the row, both read in this request under one deadline. It runs after the plan has
// judged the change (which refuses a fixed default, an unknown row and a built-in accessory before any read), and only for
// a row the active book states: a row the draft created has no user. A refusal is the change's own, on the member
// `change`, and carries no count and no design. A read that fails or runs late is thrown, so it is `503` and nothing is
// written: it is never read as an unused row.

type CheckRefusalCode = Extract<
  DraftChangeRefusalCode,
  "ITEM_IS_DEFAULT" | "ITEM_IN_USE"
>;

/** A row the book states that no deletion guard could be built for: refused as a defect rather than left unguarded. */
export class UnguardedDeletionError extends Error {
  constructor() {
    super("A deleted row the book states has no usage guard.");
    this.name = "UnguardedDeletionError";
  }
}

export interface DeletionCheckBasis {
  readonly stores: Pick<PriceStores, "defaults" | "usage">;
  /** The active book: the one the draft deletes from, never the candidate it would make. */
  readonly book: PriceBook;
}

/** The answer that refuses the deletion `change` puts in the draft, or `undefined` when it may be stored. */
export async function refusalOfDeletionWrite(
  change: PutRequest,
  basis: DeletionCheckBasis,
): Promise<NextResponse | undefined> {
  const deleted = deletedBookRowOf(change, basis.book);
  if (deleted === undefined) return undefined;
  const code = await refusalCodeOf(deleted, basis);
  return code === undefined
    ? undefined
    : dashboardInvalidInputResponse([{ field: "change", code }]);
}

function deletedBookRowOf(
  change: PutRequest,
  book: PriceBook,
): DeletedItem | undefined {
  const { address } = change;
  if (address.kind !== "item-deleted") return undefined;
  if (!isItemStated(address.item, book)) return undefined;
  const [deleted] = deletedItemsOf([change as DraftChange], book);
  if (deleted === undefined || !isSameItem(deleted.item, address.item)) {
    throw new UnguardedDeletionError();
  }
  return deleted;
}

function refusalCodeOf(
  deleted: DeletedItem,
  { stores, book }: DeletionCheckBasis,
): Promise<CheckRefusalCode | undefined> {
  return withinUsageDeadline(async (signal) => {
    const { defaults } = await readSavedDefaults(stores);
    const isDefault = defaultItemsOf({ book, defaults }).some((item) =>
      isSameItem(item, deleted.item),
    );
    if (isDefault) return "ITEM_IS_DEFAULT";
    const usage = await countDeletedItems(
      { stores, book, deleted: [deleted] },
      signal,
    );
    return usageCountOf(usage, deleted.item) > 0 ? "ITEM_IN_USE" : undefined;
  });
}
