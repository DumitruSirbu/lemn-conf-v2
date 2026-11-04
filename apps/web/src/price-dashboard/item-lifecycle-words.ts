import type {
  AvailabilityRefusalCode,
  DeletableItemRef,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";

import type { ActionReasons } from "./action-that-may-be-off";
import type { ItemFailure } from "./item-flows";
import {
  deleteStandOf,
  switchStandOf,
  type LifecycleContext,
  type OffReason,
} from "./item-lifecycle-model";

// The words of every refusal a switch or a deletion can meet, in the one place a code becomes a sentence, so a reason reads
// the same under a menu entry, beside a switch and in a dialog.

/** Why a control is off, said under it. */
export function offReasonWords(
  translate: ContentTranslator,
  reason: OffReason,
): string {
  switch (reason) {
    case "item-is-default":
      return translate("priceDashboard.lifecycle.defaultCannotChange");
    case "item-is-fixed-default":
      return translate("priceDashboard.lifecycle.fixedDefaultCannotChange");
    case "item-not-in-active-book":
      return translate("priceDashboard.lifecycle.activateNotPublished");
    case "item-always-present":
      return translate("priceDashboard.lifecycle.alwaysPresentCannotChange");
    case "built-in-accessory":
      return translate(
        "priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted",
      );
    case "cannot-judge":
      return translate("priceDashboard.lifecycle.cannotJudge");
  }
}

/**
 * Why each action on an item is off; absent, it can be taken. An item the draft deletes cannot be switched, and nothing is
 * offered of it once the deletion is published: `deletionPendingNotice` says so under both.
 */
export function reasonsOfItem({
  translate,
  item,
  context,
  deletionPendingNotice,
}: {
  readonly translate: ContentTranslator;
  readonly item: DeletableItemRef;
  readonly context: LifecycleContext;
  /** The notice of the item's screen when the draft deletes it; absent while it does not. */
  readonly deletionPendingNotice: string | undefined;
}): ActionReasons {
  if (deletionPendingNotice !== undefined) {
    return {
      switchReason: deletionPendingNotice,
      deleteReason: deletionPendingNotice,
    };
  }
  const switchStand = switchStandOf(item, context);
  const deleteStand = deleteStandOf(item, context);
  return {
    switchReason:
      switchStand.kind === "off"
        ? offReasonWords(translate, switchStand.reason)
        : undefined,
    deleteReason:
      deleteStand.kind === "off"
        ? offReasonWords(translate, deleteStand.reason)
        : undefined,
  };
}

/** What the answer to a confirmation says when nothing was written. */
export function itemFailureWords(
  translate: ContentTranslator,
  failure: ItemFailure,
): string {
  switch (failure.kind) {
    case "refused":
      return refusalWords(translate, failure.code);
    case "conflict":
      return translate("priceDashboard.errors.changedMeanwhile");
    case "failed":
      return translate("priceDashboard.errors.saveFailed");
  }
}

function refusalWords(
  translate: ContentTranslator,
  code: AvailabilityRefusalCode,
): string {
  return code === "last-active-option"
    ? translate("priceDashboard.lifecycle.lastActiveBody")
    : offReasonWords(translate, code);
}
