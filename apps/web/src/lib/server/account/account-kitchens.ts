import "server-only";

import { kitchenSummaryOf } from "@lemnaria/configurator-domain";
import type {
  KitchenCursor,
  KitchenPage,
  ListedKitchen,
} from "@lemnaria/persistence";

import {
  KITCHEN_PAGE_SIZE,
  type KitchenListWire,
  type ListedKitchenWire,
} from "@/account/kitchens/kitchens-wire-contract";
import { getAccountKitchenStore } from "@/lib/server/account/account-kitchen-store-instance";
import { encodeKitchenCursor } from "@/lib/server/account/kitchen-cursor";

// The kitchens "My kitchens" lists (M8B Lot 2 plan, E1). The account is the session's and the page size is ours; the
// store holds the rest: the account predicate, the exclusion of hidden and deleted kitchens, and the skipping of a
// stored document this build cannot read (`skippedCount`, counted in `total` and never returned).

/** One page of the account's listed kitchens, newest first. A failed read is thrown to the caller. */
export async function listKitchensOf(request: {
  readonly accountId: string;
  readonly after: KitchenCursor | undefined;
}): Promise<KitchenListWire> {
  const page = await getAccountKitchenStore().listPage({
    accountId: request.accountId,
    limit: KITCHEN_PAGE_SIZE,
    ...(request.after === undefined ? {} : { after: request.after }),
  });
  return wireOfPage(page);
}

function wireOfPage(page: KitchenPage): KitchenListWire {
  return {
    total: page.total,
    kitchens: page.kitchens.map(wireOfKitchen),
    nextCursor:
      page.nextCursor === null ? null : encodeKitchenCursor(page.nextCursor),
  };
}

function wireOfKitchen(kitchen: ListedKitchen): ListedKitchenWire {
  return {
    id: kitchen.id,
    name: kitchen.name,
    updatedAt: kitchen.updatedAt.toISOString(),
    isSent: kitchen.isSent,
    summary: kitchenSummaryOf(kitchen.design),
    document: kitchen.design,
  };
}
