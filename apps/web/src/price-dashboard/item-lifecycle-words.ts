import type { AvailabilityRefusalCode } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";

import type { OffReason } from "./item-lifecycle-model";
import type { ItemFailure } from "./use-item-availability";

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
    case "cannot-judge":
      return translate("priceDashboard.lifecycle.cannotJudge");
  }
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
