import "server-only";

import {
  distinctItemsInOrder,
  isBuiltInAccessoryId,
  isItemStated,
  usageCountOf,
  type ItemRef,
  type ItemUsage,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { usageProbesFor, type ItemUsageProbe } from "@lemnaria/persistence";

import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";
import type { PriceStores } from "@/lib/server/price-stores";
import { isWholeCount } from "@/lib/server/whole-count";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

// How many saved designs use each of some items. The probes are built here from the server's own catalogue and the book
// they are asked against, never from a request, so no caller can hand the reader a build id, a fallback flag or a
// predicate. One catalogue serves kitchens of either depth: the probes' keys and `buildIdsPricedAs` are the same at
// 600 and 700.

/**
 * PROVISIONAL: how long a count may take before the read is given up. Past it nothing is answered, so a count that
 * arrives late is never sent, and the reader is told to stop (its signal aborts).
 */
export const USAGE_READ_DEADLINE_MS = 10_000;

/** The count did not finish in time. Thrown, so that no caller can mistake what it has for counts. */
export class UsageReadDeadlineError extends Error {
  constructor() {
    super("The usage count did not finish within its deadline.");
    this.name = "UsageReadDeadlineError";
  }
}

/** The reader's count of designs it left out is not a whole number of designs, so nothing it answered is trusted. */
export class MalformedUsageAnswerError extends Error {
  constructor() {
    super("The usage reader answered a count that is not a number of designs.");
    this.name = "MalformedUsageAnswerError";
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
  /** The caller's own deadline signal, when it already holds the count under `withinUsageDeadline`. */
  readonly signal?: AbortSignal;
}

/** What a count answers: one entry per item or probe, in order, and the designs the walk left out. */
export interface UsageCounts {
  readonly usage: readonly ItemUsage[];
  readonly unreadableDesigns: number;
}

/** Whether a list of items, once each is counted once, is no more than one count fans out to. */
export function isWithinUsageBound(items: readonly ItemRef[]): boolean {
  return distinctItemsInOrder(items).length <= MAX_USAGE_ITEMS;
}

/**
 * The count of the designs using each distinct item, in the domain's order. It returns data only: the caller logs the
 * designs the walk left out.
 *
 * A tier or a linked accessory that the given book does not state reads 0 and is never probed, unlike `usesItem`, which
 * counts a design that names it. So callers must ask about items of that same book. Throws `TooManyUsageItemsError` above
 * the bound, and what `countUsageProbes` throws.
 */
export async function countItemUsage(
  items: readonly ItemRef[],
  { stores, book, signal }: UsageBasis,
): Promise<UsageCounts> {
  const distinct = distinctItemsInOrder(items);
  if (distinct.length > MAX_USAGE_ITEMS) throw new TooManyUsageItemsError();
  const isProbed = isProbedIn(book);
  const probes = usageProbesFor(distinct.filter(isProbed), {
    catalog: shippedCatalogue(),
    book,
  });
  const counted = await countUsageProbes(probes, stores, signal);
  return {
    usage: distinct.map((item) => ({
      item,
      designCount: isProbed(item) ? usageCountOf(counted.usage, item) : 0,
    })),
    unreadableDesigns: counted.unreadableDesigns,
  };
}

/**
 * The items a count of this book can speak of: a tier or linked accessory the book does not state is left out, so a
 * caller that answers a person can say nothing of it rather than 0.
 */
export function itemsStatedIn(
  items: readonly ItemRef[],
  book: PriceBook,
): readonly ItemRef[] {
  return items.filter(isProbedIn(book));
}

function isProbedIn(book: PriceBook): (item: ItemRef) => boolean {
  return (item) => !isTierOrLinkedAccessory(item) || isItemStated(item, book);
}

function isTierOrLinkedAccessory(item: ItemRef): boolean {
  return (
    item.kind === "material" ||
    item.kind === "hardware" ||
    (item.kind === "accessory" && !isBuiltInAccessoryId(item.accessoryId))
  );
}

/**
 * One entry per probe, in the probes' order, each the count of the designs that use its item. A reader that leaves a
 * probe out, repeats it, or answers a number of designs it cannot is thrown on (`usageCountOf`), never read as 0; so is an
 * unreadable-design count that is not a whole number. Without a `signal` the count runs under its own deadline
 * (`UsageReadDeadlineError`, and the reader is aborted by then); with one, the caller holds the deadline. It returns data
 * only: the caller logs.
 */
export async function countUsageProbes(
  probes: readonly ItemUsageProbe[],
  stores: Pick<PriceStores, "usage">,
  signal?: AbortSignal,
): Promise<UsageCounts> {
  if (probes.length === 0) return { usage: [], unreadableDesigns: 0 };
  const { counts, unreadableDesigns } =
    signal === undefined
      ? await withinUsageDeadline((own) => stores.usage.countEach(probes, own))
      : await stores.usage.countEach(probes, signal);
  if (!isWholeCount(unreadableDesigns)) throw new MalformedUsageAnswerError();
  return {
    usage: probes.map(({ item }) => ({
      item,
      designCount: usageCountOf(counts, item),
    })),
    unreadableDesigns,
  };
}

/**
 * Runs `start` under the deadline, with a signal that aborts at it. Past the deadline this rejects with
 * `UsageReadDeadlineError`, whatever `start` is waiting on.
 */
export async function withinUsageDeadline<Result>(
  start: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> {
  const cancelled = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const late = new UsageReadDeadlineError();
      cancelled.abort(late);
      reject(late);
    }, USAGE_READ_DEADLINE_MS);
  });
  try {
    return await Promise.race([start(cancelled.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
