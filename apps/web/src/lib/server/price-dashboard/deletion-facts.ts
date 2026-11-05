import "server-only";

import {
  buildIdsPricedAs,
  deletedBookItemsOf,
  isItemStated,
  isSameItem,
  type DraftChange,
  type ItemRef,
  type ItemUsage,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  usageProbesFor,
  type DeletedItem,
  type ItemUsageProbe,
} from "@lemnaria/persistence";

import {
  countUsageProbes,
  UsageReadDeadlineError,
  withinUsageDeadline,
} from "@/lib/server/price-dashboard/item-usage-read";
import { readSavedDefaults } from "@/lib/server/price-dashboard/saved-defaults";
import { shippedCatalogue } from "@/lib/server/price-dashboard/shipped-catalogue";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import type { DeletionFacts } from "@/price-dashboard/publish-deletions";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

// What a draft's deletions are judged by: the deleted rows the active book holds, and the facts about them (how many saved
// designs use each, and the saved defaults) read in the request that judges, never carried from an earlier one. Reading
// them writes nothing and spends no bucket, so a page render can ask. Only the SQL probes are ever asked: the walk over
// every design is never started from here.

/** Nothing to ask: no deleted row the book states, so no usage and no default can refuse a deletion. */
const NO_DELETION_FACTS: DeletionFacts = Object.freeze({
  usage: [],
  defaults: {},
});

/** A probe that would walk every saved design reached a count that must be answered in SQL alone. Thrown: it is a defect. */
export class WalkedDeletionProbeError extends Error {
  constructor() {
    super("A deletion's usage count asked for the walk over every design.");
    this.name = "WalkedDeletionProbeError";
  }
}

export interface DeletionBasis {
  readonly stores: Pick<PriceStores, "defaults" | "usage">;
  /** The active book: the one the draft deletes from, never the candidate it would make. */
  readonly book: PriceBook;
  readonly deleted: readonly DeletedItem[];
}

/**
 * The deleted rows of the active book that the draft has not itself created, each a linked accessory with the build ids
 * the catalogue prices as its row, then that row itself where the catalogue no longer holds it. A kind a deletion cannot
 * be, or an accessory the book states no rule for, goes with none, and the store refuses the publish rather than leave it
 * unguarded. The one list the publish counts and the store's guard reads.
 */
export function deletedItemsOf(
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
    : { item, buildIds: withTheRulesOwnRow(rule.linkedBuildId) };
}

function withTheRulesOwnRow(linkedBuildId: string): readonly string[] {
  const priced = buildIdsPricedAs(shippedCatalogue(), linkedBuildId);
  return priced.includes(linkedBuildId) ? priced : [...priced, linkedBuildId];
}

/**
 * The usage of each deleted row the book states and the saved defaults, read now, under one deadline
 * (`UsageReadDeadlineError`). A defaults row that is not settings is thrown, never read as none saved.
 */
export async function readDeletionFacts({
  stores,
  book,
  deleted,
}: DeletionBasis): Promise<DeletionFacts> {
  const asked = deleted.filter(({ item }) => isItemStated(item, book));
  if (asked.length === 0) return NO_DELETION_FACTS;
  return withinUsageDeadline(async (signal) => {
    const { defaults } = await readSavedDefaults(stores);
    const usage = await countInChunks(probesOf(asked, book), stores, signal);
    signal.throwIfAborted();
    return { usage, defaults };
  });
}

export interface DraftDeletions {
  readonly book: PriceBook;
  readonly changes: readonly DraftChange[];
}

/**
 * The facts for a page, which only displays them: `undefined` where the count passes its deadline, so the page judges
 * nothing rather than guess. A store that fails is thrown, for the page's own read to absorb.
 */
export async function readDeletionFactsOfPage({
  book,
  changes,
}: DraftDeletions): Promise<DeletionFacts | undefined> {
  const stores = await getPriceStores();
  try {
    return await readDeletionFacts({
      stores,
      book,
      deleted: deletedItemsOf(changes, book),
    });
  } catch (failure) {
    if (failure instanceof UsageReadDeadlineError) return undefined;
    throw failure;
  }
}

/**
 * One probe per deleted row, against the active book. A linked accessory is counted by the build ids its deletion is
 * guarded by, so the count and the store's guard read one list (`usageProbesFor` alone drops a row the catalogue no
 * longer prices).
 */
function probesOf(
  deleted: readonly DeletedItem[],
  book: PriceBook,
): readonly ItemUsageProbe[] {
  const probes = usageProbesFor(
    deleted.map(({ item }) => item),
    { catalog: shippedCatalogue(), book },
  ).map((probe) => withGuardedBuildIds(probe, deleted));
  if (probes.some(({ via }) => via === "migrated-design")) {
    throw new WalkedDeletionProbeError();
  }
  return probes;
}

function withGuardedBuildIds(
  probe: ItemUsageProbe,
  deleted: readonly DeletedItem[],
): ItemUsageProbe {
  if (probe.via !== "placed-bodies") return probe;
  const guarded = deleted.find(({ item }) => isSameItem(item, probe.item));
  return guarded !== undefined && "buildIds" in guarded
    ? { ...probe, buildIds: guarded.buildIds }
    : probe;
}

/** A draft can delete more rows than one count fans out to, so they are counted a chunk at a time. */
async function countInChunks(
  probes: readonly ItemUsageProbe[],
  stores: Pick<PriceStores, "usage">,
  signal: AbortSignal,
): Promise<readonly ItemUsage[]> {
  const usage: ItemUsage[] = [];
  for (let start = 0; start < probes.length; start += MAX_USAGE_ITEMS) {
    const chunk = probes.slice(start, start + MAX_USAGE_ITEMS);
    usage.push(...(await countUsageProbes(chunk, stores, signal)).usage);
  }
  return usage;
}
