"use client";

import { useEffect, useState } from "react";

import {
  isItemDisabled,
  type CatalogueAvailability,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { orFailed } from "./async-seams";
import type { ItemLifecycleClient, UsageRead } from "./item-lifecycle-client";
import { countOfUse } from "./item-lifecycle-model";

// How many saved kitchens use each material that is switched off, for the chip and the banner that say so (frames D5E and
// D5F), and the one material a page is about, for its fact line. Asked one material at a time, so a material the reader
// cannot count leaves the others counted; one it cannot count has no entry, and a screen says nothing of a number it does
// not have.

export type MaterialUsage = ReadonlyMap<string, number>;

const TIER_SEPARATOR = "\n";
const NO_USAGE: MaterialUsage = new Map();
const UNREADABLE_USAGE: UsageRead = { kind: "unavailable" };

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
    const tierIds = countedKey === "" ? [] : countedKey.split(TIER_SEPARATOR);
    void countEach(client, tierIds).then((usage) => {
      if (isCurrent) setCounted(usage);
    });
    return () => {
      isCurrent = false;
    };
  }, [client, countedKey]);

  return counted;
}

async function countEach(
  client: ItemLifecycleClient,
  tierIds: readonly string[],
): Promise<MaterialUsage> {
  const answers = await Promise.all(
    tierIds.map(async (tierId) => {
      const item: ItemRef = { kind: "material", tierId };
      const read = await orFailed(
        () => client.readUsage([item]),
        UNREADABLE_USAGE,
      );
      return [
        tierId,
        read.kind === "counted" ? countOfUse(read.counts, item) : undefined,
      ] as const;
    }),
  );
  return new Map(
    answers.flatMap(([tierId, count]) =>
      count === undefined ? [] : [[tierId, count] as const],
    ),
  );
}
