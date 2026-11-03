import {
  MAX_BULK_PERCENT,
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
  MAX_PRICE_COEFFICIENT_MINOR,
  MIN_BULK_PERCENT,
  TEN_LEI_MINOR,
} from "@lemnaria/configurator-domain";

import { BANI_PER_LEU, DECIMAL_PLACES, formatLeiAmount } from "./format-lei";

// What a person types into a price or a percentage field, read before anything is sent. A value that is not one of
// these is never sent: the field says why, in the words of `priceDashboard.errors` and `priceDashboard.bulk`, and stays
// where it is. No float is parsed: an amount is whole bani counted from the digits, and a percentage is whole. A price
// is set in whole tens of lei (ADR 0001, 2026-10-28 amendment): any other amount is refused, never rounded to one,
// except a price the screen already holds (the active one or the draft's), which a stored book may hold in any amount
// and which a person may type back.

const MINUS_SIGNS = /^[-−]/;
const SIGNED_WHOLE_NUMBER = /^([-−+])?(\d+)$/;
const WHITESPACE = /\s/g;
const LEI_SHAPE = /^(\d+)(?:[.,](\d*))?$/;
/** A whole percentage as it is written: an optional plus before and an optional percent sign after (spaces are gone by now). */
const WHOLE_PERCENT = /^\+?(\d+)%?$/;

export type LeiInputRefusal =
  | "empty"
  | "notNumber"
  | "negative"
  | "tooManyDecimals"
  | "notMultipleOfTen"
  | "tooBig";

export type LeiInputReading =
  | { readonly kind: "amount"; readonly minor: number }
  | { readonly kind: "refused"; readonly refusal: LeiInputRefusal };

/** An amount in lei (a comma or a point before at most two decimals) as whole bani; only a multiple of 10 lei. */
export function readLeiInput(text: string): LeiInputReading {
  return refusingNonTens(readLeiAmount(text));
}

/** As `readLeiInput`, except that an amount already held needs no ten-lei size: the ten-lei rule is for new ones. */
export function readLeiInputOverHeld(
  text: string,
  heldMinors: readonly number[],
): LeiInputReading {
  const amount = readLeiAmount(text);
  const isHeld = amount.kind === "amount" && heldMinors.includes(amount.minor);
  return isHeld ? amount : refusingNonTens(amount);
}

/** The amount as a person types it back: the grouping spaces of `formatLeiAmount` left out. */
export function plainLeiOf(minor: number): string {
  return formatLeiAmount(minor).replace(WHITESPACE, "");
}

function refusingNonTens(reading: LeiInputReading): LeiInputReading {
  const isNotTens =
    reading.kind === "amount" && reading.minor % TEN_LEI_MINOR !== 0;
  return isNotTens ? refusedLei("notMultipleOfTen") : reading;
}

/** An amount in lei as whole bani, up to the greatest the draft's own judgement takes. A digit string too long to be
 *  counted exactly parses to a figure past that greatest, so it is refused with the rest. */
function readLeiAmount(text: string): LeiInputReading {
  const typed = text.replace(WHITESPACE, "");
  if (typed === "") return refusedLei("empty");
  if (MINUS_SIGNS.test(typed)) return refusedLei("negative");
  const shape = LEI_SHAPE.exec(typed);
  if (shape === null) return refusedLei("notNumber");
  const [, wholeLei = "", decimals = ""] = shape;
  if (decimals.length > DECIMAL_PLACES) return refusedLei("tooManyDecimals");
  const minor =
    Number.parseInt(wholeLei, 10) * BANI_PER_LEU +
    Number.parseInt(decimals.padEnd(DECIMAL_PLACES, "0"), 10);
  return minor > MAX_PRICE_COEFFICIENT_MINOR
    ? refusedLei("tooBig")
    : { kind: "amount", minor };
}

function refusedLei(refusal: LeiInputRefusal): LeiInputReading {
  return { kind: "refused", refusal };
}

export type WholePercentRefusal = "empty" | "notWhole" | "negative" | "tooBig";

export type WholePercentReading =
  | { readonly kind: "percent"; readonly percent: number }
  | { readonly kind: "refused"; readonly refusal: WholePercentRefusal };

export type DepthPercentRefusal = WholePercentRefusal;
export type DepthPercentReading = WholePercentReading;

/** The depth rule's percentage: a whole number from 0 to the book's greatest. */
export function readDepthPercentInput(text: string): DepthPercentReading {
  return readWholePercent(text, MAX_DEEP_CABINET_PERCENT);
}

/** A material's surcharge over PAL: a whole number from 0 to the book's greatest. */
export function readMaterialPercentInput(text: string): WholePercentReading {
  return readWholePercent(text, MAX_MATERIAL_PERCENT);
}

function readWholePercent(text: string, greatest: number): WholePercentReading {
  const typed = text.replace(WHITESPACE, "");
  if (typed === "") return refusedWhole("empty");
  if (MINUS_SIGNS.test(typed)) return refusedWhole("negative");
  const [, digits] = WHOLE_PERCENT.exec(typed) ?? [];
  if (digits === undefined) return refusedWhole("notWhole");
  const percent = Number.parseInt(digits, 10);
  return percent > greatest
    ? refusedWhole("tooBig")
    : { kind: "percent", percent };
}

function refusedWhole(refusal: WholePercentRefusal): WholePercentReading {
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
