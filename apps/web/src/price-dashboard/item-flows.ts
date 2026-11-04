import {
  isSameItem,
  type AvailabilityRefusalCode,
  type CatalogueAvailability,
  type DeletableItemRef,
  type ItemRef,
  type ItemUsageCounts,
} from "@lemnaria/configurator-domain";

import type { UsageRead } from "./item-lifecycle-client";
import {
  countedDeletionOf,
  countOfUse,
  isItemOn,
  type LifecycleContext,
} from "./item-lifecycle-model";
import type { DraftChangeRefusalCode } from "./price-dashboard-wire-contract";
import type { FieldWriteResult } from "./use-price-draft";

// The dialogs an item's switch or deletion can open and what an answer to a confirmation leaves of them, worked out
// from facts alone, so a screen's desk only applies them.

/** How many saved kitchens use the item, or that nobody could say. */
export type UsageStand =
  | { readonly kind: "counted"; readonly count: number }
  | { readonly kind: "unavailable" };

/** The dialog that is open, and the facts it is drawn from. */
export type ItemFlow =
  | { readonly kind: "closed" }
  | {
      readonly kind: "deactivate";
      readonly item: ItemRef;
      readonly remaining: readonly ItemRef[];
      readonly usage: UsageStand;
    }
  | { readonly kind: "last-active-option"; readonly item: ItemRef }
  | { readonly kind: "activate"; readonly item: ItemRef }
  | {
      readonly kind: "delete";
      readonly item: DeletableItemRef;
      readonly usage: UsageStand;
      /** Only the draft holds the item, so deleting it takes it back out of the draft and nothing is published. */
      readonly isDraftOnly: boolean;
    }
  | {
      readonly kind: "delete-blocked";
      readonly item: DeletableItemRef;
      /** How many saved kitchens use it; absent where a server refused the deletion without saying. */
      readonly count: number | undefined;
      /** Customers are offered the item now, so switching it off is the way on that the dialog names. */
      readonly isOn: boolean;
    };

/** What the last confirmation came to when it was not written. */
export type ItemFailure =
  | { readonly kind: "refused"; readonly code: AvailabilityRefusalCode }
  | { readonly kind: "conflict" }
  | { readonly kind: "failed" };

/** What the answer to a deletion leaves of the dialog that asked it. */
export type DeletionSettlement =
  /** Another write is out, so this one was not sent: nothing changes. */
  | { readonly kind: "wait" }
  | { readonly kind: "close" }
  | { readonly kind: "fail"; readonly failure: ItemFailure }
  /** The dialog is replaced by another. */
  | { readonly kind: "replace"; readonly flow: ItemFlow };

export const CLOSED: ItemFlow = { kind: "closed" };
export const FAILED: ItemFailure = { kind: "failed" };

/** An item only the draft holds was never published, so no saved kitchen names it. */
const NO_SAVED_KITCHEN_CAN_USE_IT = 0;
const UNCOUNTED: UsageStand = { kind: "unavailable" };

interface CountedUse {
  readonly counts: ItemUsageCounts;
  readonly count: number;
}

/** The reader's count of the item, where it answered with one. */
function countedUseOf(read: UsageRead, item: ItemRef): CountedUse | undefined {
  if (read.kind !== "counted") return undefined;
  const count = countOfUse(read.counts, item);
  return count === undefined ? undefined : { counts: read.counts, count };
}

export function usageStandOf(read: UsageRead, item: ItemRef): UsageStand {
  const counted = countedUseOf(read, item);
  return counted === undefined
    ? UNCOUNTED
    : { kind: "counted", count: counted.count };
}

export function deactivateFlowOf({
  item,
  remaining,
  usage,
}: {
  readonly item: ItemRef;
  readonly remaining: readonly ItemRef[];
  readonly usage: UsageStand;
}): ItemFlow {
  return { kind: "deactivate", item, remaining, usage };
}

export function draftOnlyDeletionFlowOf(item: DeletableItemRef): ItemFlow {
  return {
    kind: "delete",
    item,
    usage: { kind: "counted", count: NO_SAVED_KITCHEN_CAN_USE_IT },
    isDraftOnly: true,
  };
}

/** The dialog a deletion opens once its saved kitchens are counted: a block where any use one, a confirmation where
 *  none. */
export function deletionFlowOf(
  item: DeletableItemRef,
  context: LifecycleContext,
  read: UsageRead,
): ItemFlow {
  const counted = countedUseOf(read, item);
  if (counted === undefined) {
    return { kind: "delete", item, usage: UNCOUNTED, isDraftOnly: false };
  }
  const verdict = countedDeletionOf(item, context, counted.counts);
  switch (verdict.kind) {
    case "in-use":
      return blockedFlowOf(item, context, verdict.count);
    case "allowed":
      return {
        kind: "delete",
        item,
        usage: { kind: "counted", count: counted.count },
        isDraftOnly: false,
      };
    case "off":
      return CLOSED;
  }
}

function blockedFlowOf(
  item: DeletableItemRef,
  context: LifecycleContext,
  count: number | undefined,
): ItemFlow {
  return {
    kind: "delete-blocked",
    item,
    count,
    isOn: isItemOn(item, context),
  };
}

export function deletionSettlementOf({
  result,
  item,
  context,
}: {
  readonly result: FieldWriteResult;
  readonly item: DeletableItemRef;
  readonly context: LifecycleContext;
}): DeletionSettlement {
  switch (result.kind) {
    case "saved":
    case "unchanged":
      return { kind: "close" };
    case "busy":
      return { kind: "wait" };
    case "conflict":
      return { kind: "fail", failure: { kind: "conflict" } };
    case "refused":
      return refusedDeletionSettlementOf(result.code, item, context);
    case "candidate-refused":
    case "failed":
      return { kind: "fail", failure: FAILED };
  }
}

/** A saved kitchen has come to use the item since it was counted: no retry changes that, so the block is said. */
function refusedDeletionSettlementOf(
  code: DraftChangeRefusalCode,
  item: DeletableItemRef,
  context: LifecycleContext,
): DeletionSettlement {
  switch (code) {
    case "ITEM_IN_USE":
      return {
        kind: "replace",
        flow: blockedFlowOf(item, context, undefined),
      };
    case "ITEM_IS_DEFAULT":
      return {
        kind: "fail",
        failure: { kind: "refused", code: "item-is-default" },
      };
    default:
      return { kind: "fail", failure: FAILED };
  }
}

export function afterSwitch(
  held: CatalogueAvailability,
  item: ItemRef,
  active: boolean,
  { revision }: { readonly revision: string },
): CatalogueAvailability {
  const others = held.disabled.filter(
    (disabled) => !isSameItem(disabled, item),
  );
  return { revision, disabled: active ? others : [...others, item] };
}
