import "server-only";

import {
  distinctItemsInOrder,
  usageCountOf,
  type ItemRef,
  type ItemUsage,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { usageProbesFor } from "@lemnaria/persistence";

import { reportUnreadableDesigns } from "@/lib/server/account/account-log";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";
import type { PriceStores } from "@/lib/server/price-stores";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

// How many saved designs use each of some items. The probes are built here from the server's own catalogue and the book
// they are asked against, never from a request, so no caller can hand the reader a build id, a fallback flag or a
// predicate. One catalogue serves kitchens of either depth: the probes' keys and `buildIdsPricedAs` are the same at
// 600 and 700.

/**
 * PROVISIONAL: how long a count may take before the read is given up. Past it nothing is answered, so a count that
 * arrives late is never sent. The database work behind it is not cancelled (`countEach` takes no signal).
 */
export const USAGE_READ_DEADLINE_MS = 10_000;

/** The count did not finish in time. Thrown, so that no caller can mistake what it has for counts. */
export class UsageReadDeadlineError extends Error {
  constructor() {
    super("The usage count did not finish within its deadline.");
    this.name = "UsageReadDeadlineError";
  }
}

/** The questions asked name more distinct items than one count may fan out to. */
export class TooManyUsageItemsError extends Error {
  constructor() {
    super("A usage count names more distinct items than it may.");
    this.name = "TooManyUsageItemsError";
  }
}

export interface UsageBasis {
  readonly stores: Pick<PriceStores, "usage">;
  /** The book whose fallback tiers and linked accessories decide what each item is used by. */
  readonly book: PriceBook;
}

/** Whether a list of items, once each is counted once, is no more than one count fans out to. */
export function isWithinUsageBound(items: readonly ItemRef[]): boolean {
  return distinctItemsInOrder(items).length <= MAX_USAGE_ITEMS;
}

/**
 * One entry per distinct item, in the domain's order, each the count of the designs that use it. A reader that leaves an
 * item out, repeats it or answers a number of designs it cannot is thrown on (`usageCountOf`), never read as 0. Throws
 * `UsageReadDeadlineError` past the deadline and `TooManyUsageItemsError` above the bound.
 */
export async function countItemUsage(
  items: readonly ItemRef[],
  { stores, book }: UsageBasis,
): Promise<readonly ItemUsage[]> {
  const distinct = distinctItemsInOrder(items);
  if (distinct.length > MAX_USAGE_ITEMS) throw new TooManyUsageItemsError();
  const probes = usageProbesFor(distinct, {
    catalog: shippedCatalogue(),
    book,
  });
  const { counts, unreadableDesigns } = await withinDeadline(
    stores.usage.countEach(probes),
  );
  reportUnreadableDesigns(unreadableDesigns);
  return distinct.map((item) => ({
    item,
    designCount: usageCountOf(counts, item),
  }));
}

async function withinDeadline<Result>(work: Promise<Result>): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new UsageReadDeadlineError());
    }, USAGE_READ_DEADLINE_MS);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
