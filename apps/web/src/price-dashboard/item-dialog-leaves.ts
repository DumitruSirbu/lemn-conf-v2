import type { ItemRef } from "@lemnaria/configurator-domain";

// The sentences an item's dialogs say, chosen once by the kind of item. An accessory is earned and never chosen, so it
// has words of its own: it is not an option, and no other is offered in its place.

const CHOSEN_ITEM_LEAVES = {
  counting: "priceDashboard.lifecycle.counting",
  usedBy: "priceDashboard.lifecycle.usedBy",
  clientsCannotChoose: "priceDashboard.lifecycle.clientsCannotChoose",
  consequenceOfUse: "priceDashboard.lifecycle.replacementExplained",
  activateBody: "priceDashboard.lifecycle.activateBody",
  usageUnavailable: "priceDashboard.lifecycle.usageUnavailable",
  deleteBody: "priceDashboard.lifecycle.deleteBody",
  deleteCreatedBody: "priceDashboard.lifecycle.deleteCreatedBody",
  deleteBlockedBody: "priceDashboard.lifecycle.deleteBlockedBody",
  deleteBlockedInactiveBody:
    "priceDashboard.lifecycle.deleteBlockedInactiveBody",
  deleteBlockedUncountedBody:
    "priceDashboard.lifecycle.deleteBlockedUncountedBody",
} as const;

const ACCESSORY_LEAVES = {
  counting: "priceDashboard.lifecycle.countingAccessory",
  usedBy: "priceDashboard.lifecycle.usedByAccessory",
  clientsCannotChoose: "priceDashboard.lifecycle.clientsNoLongerGetAccessory",
  consequenceOfUse: "priceDashboard.lifecycle.accessoryRemovedExplained",
  activateBody: "priceDashboard.lifecycle.activateAccessoryBody",
  usageUnavailable: "priceDashboard.lifecycle.usageUnavailableAccessory",
  deleteBody: "priceDashboard.lifecycle.deleteBody",
  deleteCreatedBody: "priceDashboard.lifecycle.deleteCreatedAccessoryBody",
  deleteBlockedBody: "priceDashboard.lifecycle.deleteBlockedAccessoryBody",
  deleteBlockedInactiveBody:
    "priceDashboard.lifecycle.deleteBlockedAccessoryInactiveBody",
  deleteBlockedUncountedBody:
    "priceDashboard.lifecycle.deleteBlockedAccessoryUncountedBody",
} as const;

/** The sentences of the dialogs of this kind of item. */
export function dialogLeavesOf(item: ItemRef) {
  return item.kind === "accessory" ? ACCESSORY_LEAVES : CHOSEN_ITEM_LEAVES;
}
