import {
  MAX_BULK_PERCENT,
  MAX_DEEP_CABINET_PERCENT,
  MIN_BULK_PERCENT,
} from "@lemnaria/configurator-domain";

// What a person types into a price or a percentage field, read before anything is sent. A value that is not one of these
// is never sent: the field says why, in the words of `priceDashboard.errors` and `priceDashboard.bulk`, and stays where
// it is. No float is parsed: an amount is whole bani counted from the digits, and a percentage is whole.

const BANI_PER_LEU = 100;
const DECIMAL_PLACES = 2;
const MAX_WHOLE_LEI_DIGITS = 13;
const MINUS_SIGNS = /^[-−]/;
const SIGNED_WHOLE_NUMBER = /^([-−+])?(\d+)$/;
const WHITESPACE = /\s/g;
const LEI_SHAPE = /^(\d+)(?:[.,](\d*))?$/;
const WHOLE_NUMBER = /^\d+$/;

export type LeiInputRefusal =
  | "empty"
  | "notNumber"
  | "negative"
  | "tooManyDecimals"
  | "tooBig";

export type LeiInputReading =
  | { readonly kind: "amount"; readonly minor: number }
  | { readonly kind: "refused"; readonly refusal: LeiInputRefusal };

/** An amount in lei, with a comma or a point before at most two decimals ("450", "450,5", "450,25"), as whole bani. */
export function readLeiInput(text: string): LeiInputReading {
  const typed = text.replace(WHITESPACE, "");
  if (typed === "") return refusedLei("empty");
  if (MINUS_SIGNS.test(typed)) return refusedLei("negative");
  const shape = LEI_SHAPE.exec(typed);
  if (shape === null) return refusedLei("notNumber");
  const [, wholeLei = "", decimals = ""] = shape;
  if (decimals.length > DECIMAL_PLACES) return refusedLei("tooManyDecimals");
  if (wholeLei.replace(/^0+/, "").length > MAX_WHOLE_LEI_DIGITS) {
    return refusedLei("tooBig");
  }
  const minor =
    Number.parseInt(wholeLei, 10) * BANI_PER_LEU +
    Number.parseInt(decimals.padEnd(DECIMAL_PLACES, "0"), 10);
  return Number.isSafeInteger(minor)
    ? { kind: "amount", minor }
    : refusedLei("tooBig");
}

function refusedLei(refusal: LeiInputRefusal): LeiInputReading {
  return { kind: "refused", refusal };
}

export type DepthPercentRefusal = "empty" | "notWhole" | "negative" | "tooBig";

export type DepthPercentReading =
  | { readonly kind: "percent"; readonly percent: number }
  | { readonly kind: "refused"; readonly refusal: DepthPercentRefusal };

/** The depth rule's percentage: a whole number from 0 to the book's greatest. */
export function readDepthPercentInput(text: string): DepthPercentReading {
  const typed = text.replace(WHITESPACE, "");
  if (typed === "") return refusedDepth("empty");
  if (MINUS_SIGNS.test(typed)) return refusedDepth("negative");
  if (!WHOLE_NUMBER.test(typed)) return refusedDepth("notWhole");
  const percent = Number.parseInt(typed, 10);
  return percent > MAX_DEEP_CABINET_PERCENT
    ? refusedDepth("tooBig")
    : { kind: "percent", percent };
}

function refusedDepth(refusal: DepthPercentRefusal): DepthPercentReading {
  return { kind: "refused", refusal };
}

export type BulkPercentRefusal = "empty" | "notWhole" | "zero" | "outOfRange";

export type BulkPercentReading =
  | { readonly kind: "percent"; readonly percent: number }
  | { readonly kind: "refused"; readonly refusal: BulkPercentRefusal };

/** A bulk percentage: whole, signed (a minus for a reduction), never 0, and within the action's bounds. */
export function readBulkPercentInput(text: string): BulkPercentReading {
  const typed = text.replace(WHITESPACE, "");
  if (typed === "") return refusedBulk("empty");
  const shape = SIGNED_WHOLE_NUMBER.exec(typed);
  if (shape === null) return refusedBulk("notWhole");
  const [, sign = "", digits = ""] = shape;
  const magnitude = Number.parseInt(digits, 10);
  if (magnitude === 0) return refusedBulk("zero");
  const percent = MINUS_SIGNS.test(sign) ? -magnitude : magnitude;
  return percent < MIN_BULK_PERCENT || percent > MAX_BULK_PERCENT
    ? refusedBulk("outOfRange")
    : { kind: "percent", percent };
}

function refusedBulk(refusal: BulkPercentRefusal): BulkPercentReading {
  return { kind: "refused", refusal };
}
