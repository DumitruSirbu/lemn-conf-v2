import {
  isSameItem,
  judgeAvailabilityChange,
  type CatalogueAvailability,
  type ItemRef,
  type ItemUsageCounts,
} from "@lemnaria/configurator-domain";

import type {
  AvailabilityOutcome,
  ItemLifecycleClient,
  UsageRead,
} from "./item-lifecycle-client";
import type { LifecycleContext } from "./item-lifecycle-model";
import type { AvailabilityRequestWire } from "./price-dashboard-wire-contract";

// A client that keeps what the page showed in memory, for a build that is not a production one. It holds no data of its
// own: it is seeded with the facts the page was given, so it can sit in a browser chunk and name no invented count. It
// counts only the items its seed counts.

export interface ItemLifecycleSeed
  extends Omit<
    LifecycleContext,
    "canWrite" | "canDeleteStatedItems" | "isCreatedInDraft"
  > {
  readonly usage: ItemUsageCounts;
}

/**
 * A client over one in-memory copy of the availability, which judges a write the way a server would: the revision is
 * compared first, and the domain's own judgement refuses what it refuses, with nothing written. Another actor is a
 * second call on the same client.
 */
export function inMemoryItemLifecycleClient(
  seed: ItemLifecycleSeed,
): ItemLifecycleClient {
  let current = seed.availability;
  return {
    canWrite: true,
    canDeleteStatedItems: true,
    setActive: (request) => {
      const outcome = judgedWrite(seed, current, request);
      if (outcome.kind === "set") {
        current = switched(current, request, outcome.revision);
      }
      return Promise.resolve(outcome);
    },
    readUsage: (items) => Promise.resolve(countedFor(seed.usage, items)),
    readAvailability: () => Promise.resolve(current),
  };
}

function judgedWrite(
  seed: ItemLifecycleSeed,
  current: CatalogueAvailability,
  { expectedRevision, item, active }: AvailabilityRequestWire,
): AvailabilityOutcome {
  if (expectedRevision !== current.revision) return { kind: "conflict" };
  const verdict = judgeAvailabilityChange(
    { item, active },
    { book: seed.book, availability: current, defaults: seed.defaults ?? {} },
  );
  if (verdict.kind === "refused") {
    return { kind: "refused", code: verdict.code };
  }
  return { kind: "set", revision: String(Number(current.revision) + 1) };
}

function switched(
  current: CatalogueAvailability,
  { item, active }: AvailabilityRequestWire,
  revision: string,
): CatalogueAvailability {
  const others = current.disabled.filter(
    (disabled) => !isSameItem(disabled, item),
  );
  return { revision, disabled: active ? others : [...others, item] };
}

/** Counted only where every item asked about is in the seed: a count is never made up for one that is not. */
function countedFor(
  usage: ItemUsageCounts,
  items: readonly ItemRef[],
): UsageRead {
  const counts = items.flatMap((item) =>
    usage.filter((held) => isSameItem(held.item, item)),
  );
  return counts.length === items.length
    ? { kind: "counted", counts }
    : { kind: "unavailable" };
}
