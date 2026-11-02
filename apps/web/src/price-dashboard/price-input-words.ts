import {
  MAX_BULK_PERCENT,
  MAX_DEEP_CABINET_PERCENT,
  MIN_BULK_PERCENT,
  type CreatedRowTextRefusalCode,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";

import type { BulkPreview } from "./bulk-preview";
import type {
  BulkPercentRefusal,
  DepthPercentRefusal,
  LeiInputRefusal,
} from "./price-field-input";
import type {
  BulkRefusalCode,
  DraftChangeRefusalCode,
} from "./price-dashboard-wire-contract";
import type { BulkWriteResult, FieldWriteResult } from "./use-price-draft";

// The words of every refusal a price or percentage field can meet, before a request is sent and after the server's
// answer. A refusal is a closed code (ADR 0095 decision 3) and these are the only places a code becomes a sentence, so
// a message is told in one way wherever it is shown. The examples are the illustrations the sentences ask for, not
// figures of the book.

const LEI_EXAMPLE = "450,00";
const LEI_EXAMPLE_WITH_DECIMALS = "450,25";
const LEI_STEP = "10";
const LEI_EXAMPLE_IN_TENS = "450";
const PERCENT_EXAMPLE = "15";
const BULK_PERCENT_EXAMPLE = "5";

export function leiRefusalWords(
  translate: ContentTranslator,
  refusal: LeiInputRefusal,
): string {
  switch (refusal) {
    case "empty":
      return translate("priceDashboard.errors.empty");
    case "notNumber":
      return translate("priceDashboard.errors.notNumber", {
        example: LEI_EXAMPLE,
      });
    case "negative":
      return translate("priceDashboard.errors.negative");
    case "tooManyDecimals":
      return translate("priceDashboard.errors.tooManyDecimals", {
        example: LEI_EXAMPLE_WITH_DECIMALS,
      });
    case "notMultipleOfTen":
      return translate("priceDashboard.errors.notMultipleOfTen", {
        step: LEI_STEP,
        example: LEI_EXAMPLE_IN_TENS,
      });
    case "tooBig":
      return translate("priceDashboard.errors.tooBig");
  }
}

/** Why the words of a row the dashboard creates were refused, before anything is sent. */
export function createdTextRefusalWords(
  translate: ContentTranslator,
  code: CreatedRowTextRefusalCode,
): string {
  switch (code) {
    case "TEXT_TOO_LONG":
      return translate("priceDashboard.errors.textTooLong");
    case "TEXT_FORBIDDEN_CHARACTER":
      return translate("priceDashboard.errors.textForbiddenCharacter");
    case "TEXT_STATES_AN_AMOUNT":
      return translate("priceDashboard.errors.textStatesAnAmount");
    case "TEXT_EMPTY":
    case "MISSING_VALUE":
      return translate("priceDashboard.errors.textEmpty");
  }
}

export function depthPercentRefusalWords(
  translate: ContentTranslator,
  refusal: DepthPercentRefusal,
): string {
  switch (refusal) {
    case "empty":
      return translate("priceDashboard.errors.percentEmpty");
    case "notWhole":
      return translate("priceDashboard.errors.percentNotWhole", {
        example: PERCENT_EXAMPLE,
      });
    case "negative":
      return translate("priceDashboard.errors.percentNegative");
    case "tooBig":
      return translate("priceDashboard.errors.percentTooBig", {
        max: String(MAX_DEEP_CABINET_PERCENT),
      });
  }
}

export function bulkPercentRefusalWords(
  translate: ContentTranslator,
  refusal: BulkPercentRefusal,
): string {
  switch (refusal) {
    case "empty":
      return translate("priceDashboard.bulk.errors.empty", {
        example: BULK_PERCENT_EXAMPLE,
      });
    case "notWhole":
      return translate("priceDashboard.errors.percentNotWhole", {
        example: BULK_PERCENT_EXAMPLE,
      });
    case "zero":
      return translate("priceDashboard.bulk.errors.zero");
    case "outOfRange":
      return translate("priceDashboard.bulk.errors.outOfRange", {
        lowest: translate("priceDashboard.common.percent", {
          percent: String(MIN_BULK_PERCENT),
        }),
        highest: translate("priceDashboard.common.percent", {
          percent: String(MAX_BULK_PERCENT),
        }),
      });
  }
}

/**
 * Why the bulk dialog would be refused, from its own preview. "Out of range" is said of a percentage past the bounds
 * and of nothing else: the server's `PERCENT_OUT_OF_RANGE` also answers an action whose every price rounds back to what
 * it is and one that scales a price past what a cabinet may cost, and each of those has a sentence of its own.
 */
export function bulkPreviewRefusalWords(
  translate: ContentTranslator,
  preview: Exclude<BulkPreview, { readonly kind: "ready" }>,
): string {
  switch (preview.kind) {
    case "nothing-changes":
      return translate("priceDashboard.bulk.errors.nothingChanges");
    case "no-cabinets":
      return translate("priceDashboard.bulk.errors.noCabinets");
    case "price-not-positive":
      return notPositivePriceWords(translate, preview);
    case "price-too-large":
      return translate("priceDashboard.bulk.errors.priceTooLarge");
    case "cannot-apply":
      return translate("priceDashboard.bulk.errors.cannotApply");
  }
}

type PriceNotPositivePreview = Extract<
  BulkPreview,
  { readonly kind: "price-not-positive" }
>;

function notPositivePriceWords(
  translate: ContentTranslator,
  { cabinetName, isHeldAlready }: PriceNotPositivePreview,
): string {
  if (cabinetName === undefined) {
    return translate("priceDashboard.bulk.errors.cannotApply");
  }
  return isHeldAlready === true
    ? translate("priceDashboard.bulk.errors.priceAlreadyNotPositive", {
        name: cabinetName,
      })
    : translate("priceDashboard.bulk.errors.priceNotPositive", {
        name: cabinetName,
      });
}

/** A write that came to nothing the person did not ask for: not one that landed, was not needed or was never sent. */
export type FailedFieldWrite = Exclude<
  FieldWriteResult,
  { kind: "saved" | "unchanged" | "busy" }
>;
export type FailedBulkWrite = Exclude<
  BulkWriteResult,
  { kind: "saved" | "busy" }
>;

/** What the server's answer to an inline price says, when a value that read well was still refused or not written. */
export function priceWriteFailureWords(
  translate: ContentTranslator,
  failure: FailedFieldWrite,
): string {
  if (failure.kind === "conflict") {
    return translate("priceDashboard.errors.changedMeanwhile");
  }
  if (failure.kind !== "refused") {
    return translate("priceDashboard.errors.saveFailed");
  }
  return refusedPriceWords(translate, failure.code);
}

function refusedPriceWords(
  translate: ContentTranslator,
  code: DraftChangeRefusalCode,
): string {
  switch (code) {
    case "NEGATIVE":
      return translate("priceDashboard.errors.negative");
    case "TOO_LARGE":
      return translate("priceDashboard.errors.tooBig");
    case "NOT_A_WHOLE_NUMBER":
    case "MISSING_VALUE":
      return translate("priceDashboard.errors.notNumber", {
        example: LEI_EXAMPLE,
      });
    default:
      return translate("priceDashboard.errors.saveFailed");
  }
}

/**
 * What the server's answer to the depth rule says, when a percentage that read well was still refused or not written.
 */
export function depthWriteFailureWords(
  translate: ContentTranslator,
  failure: FailedFieldWrite,
): string {
  if (failure.kind === "conflict") {
    return translate("priceDashboard.errors.changedMeanwhile");
  }
  if (failure.kind !== "refused") {
    return translate("priceDashboard.errors.saveFailed");
  }
  switch (failure.code) {
    case "NEGATIVE":
      return depthPercentRefusalWords(translate, "negative");
    case "TOO_LARGE":
      return depthPercentRefusalWords(translate, "tooBig");
    case "NOT_A_WHOLE_NUMBER":
    case "MISSING_VALUE":
      return depthPercentRefusalWords(translate, "notWhole");
    default:
      return translate("priceDashboard.errors.saveFailed");
  }
}

/** What the server's answer to a bulk action says, after a preview that found nothing wrong with it. */
export function bulkWriteFailureWords(
  translate: ContentTranslator,
  failure: FailedBulkWrite,
): string {
  if (failure.kind === "conflict") {
    return translate("priceDashboard.errors.changedMeanwhile");
  }
  if (failure.kind === "refused")
    return bulkRefusalWords(translate, failure.code);
  if (failure.kind === "candidate-refused") {
    return translate("priceDashboard.bulk.errors.cannotApply");
  }
  return translate("priceDashboard.errors.saveFailed");
}

function bulkRefusalWords(
  translate: ContentTranslator,
  code: BulkRefusalCode,
): string {
  switch (code) {
    case "NO_CABINETS_SELECTED":
      return translate("priceDashboard.bulk.errors.noCabinets");
    case "PERCENT_OUT_OF_RANGE":
    case "PRICE_WOULD_BE_NEGATIVE":
      // The server's code is shared by three causes, so a refusal the preview did not foresee says what is true of all
      // three and not which one it was.
      return translate("priceDashboard.bulk.errors.cannotApply");
    default:
      return translate("priceDashboard.errors.saveFailed");
  }
}
