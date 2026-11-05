"use client";

import { useEffect, useMemo, useState } from "react";

import {
  isItemDisabled,
  isItemStated,
  type CatalogueAvailability,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { orFailed } from "./async-seams";
import type { ItemLifecycleClient, UsageRead } from "./item-lifecycle-client";
import { countOfUse } from "./item-lifecycle-model";

// How many saved kitchens use each material that is switched off, for the chip and the banner that say so (frames D5E
// and D5F), and the one material a page is about, for its fact line. Asked once for all of them, so a read that fails
// leaves every count of it unknown. A material with no count has no entry, and a screen says nothing of a number it
// does not have; neither is a count kept for a material the book no longer states.

export type MaterialUsage = ReadonlyMap<string, number>;

const TIER_SEPARATOR = "\n";
const NO_USAGE: MaterialUsage = new Map();
const UNREADABLE_USAGE: UsageRead = { kind: "unavailable" };

type MaterialItem = Extract<ItemRef, { readonly kind: "material" }>;

export function useMaterialUsage({
  client,
  book,
  availability,
  alsoCount,
}: {
  readonly client: ItemLifecycleClient;
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
  /** A material to count whether or not it is switched off. */
  readonly alsoCount?: string | undefined;
}): MaterialUsage {
  const [counted, setCounted] = useState<MaterialUsage>(NO_USAGE);
  const countedKey = book.material.tiers
    .filter(
      (tier) =>
        tier.tierId === alsoCount ||
        isItemDisabled(availability, { kind: "material", tierId: tier.tierId }),
    )
    .map((tier) => tier.tierId)
    .join(TIER_SEPARATOR);

  useEffect(() => {
    let isCurrent = true;
    const unwanted = new AbortController();
    const tierIds = countedKey === "" ? [] : countedKey.split(TIER_SEPARATOR);
    void countAll(client, tierIds, unwanted.signal).then((usage) => {
      if (isCurrent) setCounted(usage);
    });
    return () => {
      isCurrent = false;
      unwanted.abort();
    };
  }, [client, countedKey]);

  return useMemo(() => statedBy(book, counted), [book, counted]);
}

function statedBy(book: PriceBook, usage: MaterialUsage): MaterialUsage {
  return new Map(
    [...usage].filter(([tierId]) =>
      isItemStated({ kind: "material", tierId }, book),
    ),
  );
}

async function countAll(
  client: ItemLifecycleClient,
  tierIds: readonly string[],
  signal: AbortSignal,
): Promise<MaterialUsage> {
  if (tierIds.length === 0) return NO_USAGE;
  const items = tierIds.map(
    (tierId): MaterialItem => ({ kind: "material", tierId }),
  );
  const read = await orFailed(
    () => client.readUsage(items, signal),
    UNREADABLE_USAGE,
  );
  if (read.kind !== "counted") return NO_USAGE;
  return new Map(
    items.flatMap((item) => {
      const count = countOfUse(read.counts, item);
      return count === undefined ? [] : [[item.tierId, count] as const];
    }),
  );
}
