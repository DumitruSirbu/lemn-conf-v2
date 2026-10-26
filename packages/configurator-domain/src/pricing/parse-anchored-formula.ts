// Reads the two formula shapes that carry their own structure: the anchored shapes and `price-per-size`. Each
// refusal is an `INVALID_PRICE_BOOK` naming the rule and the field, so a draft editor can point at it. Called from
// `parse-price-book.ts` for every cabinet rule, after the amounts have been held to a magnitude.
//
// Every field a shape declares is held to what the arithmetic needs (a whole, in-range anchor on the pricing step, an
// exact amount, a step that is not negative), and any field it does not read is refused: it would sit in the book
// unpriced while the dashboard offered it for editing. What a shape reads comes from the one table in
// `anchored-price-formula.ts`.
import { MAX_DESIGN_DIMENSION_MM } from "../design-bounds.js";

import {
  anchoredFieldsReadBy,
  isAnchoredShape,
  isWholePositiveStepMultiple,
  PRICE_PER_SIZE_SHAPE,
  PRICE_STEP_MM,
  type AnchoredField,
} from "./anchored-price-formula.js";
import {
  boundedListOf,
  describeDeclared,
  invalidBook,
  isRecord,
  readDeclared,
  refuseNegativeAmount,
  refuseNonWholeAmount,
  refuseOversizedAmount,
  refuseUnreadFields,
} from "./book-reading.js";
import type { PricingFailure } from "./price-lines.js";

/** The most sizes a fixed-size row may list: the catalogue's widest range is thirteen 50 mm steps. */
export const MAX_SIZES_PER_RULE = 20;

const FIELDS_READ_BY_PRICE_PER_SIZE: readonly string[] = ["shape", "sizes"];
const FIELDS_READ_BY_A_LISTED_SIZE: readonly string[] = [
  "widthMm",
  "amountMinor",
];

/** An anchored formula whose arithmetic can run, or `undefined` for a formula of another shape. */
export function refuseUnusableAnchoredFormula(
  formula: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  const shape = readDeclared(formula, "shape");
  if (!isAnchoredShape(shape)) return undefined;
  const fields = anchoredFieldsReadBy(shape);
  for (const field of fields) {
    const refused = refuseUnusableAnchoredField(formula, field, named);
    if (refused) return refused;
  }
  return refuseUnreadFields(
    formula,
    ["shape", ...fields.map((field) => field.name)],
    { shape, named },
  );
}

function refuseUnusableAnchoredField(
  formula: Record<string, unknown>,
  field: AnchoredField,
  named: string,
): PricingFailure | undefined {
  switch (field.kind) {
    case "dimension":
      return refuseUnusableAnchorDimension(formula, field.name, named);
    case "price":
      return refuseNegativeAmount(formula, field.name, named);
    case "step":
      return refuseNegativeStep(formula, field.name, named);
  }
}

/** An anchor dimension: whole, positive, within a design's dimensions and a multiple of the pricing step, since
 *  every step count from it is a whole number of steps. */
function refuseUnusableAnchorDimension(
  formula: Record<string, unknown>,
  field: string,
  named: string,
): PricingFailure | undefined {
  const read = readDeclared(formula, field);
  if (isQuotableDimension(read)) return undefined;
  return invalidBook(
    `The ${named} declares "${field}" as ${describeDeclared(read)}, which is not a positive multiple ` +
      `of ${String(PRICE_STEP_MM)} mm up to ${String(MAX_DESIGN_DIMENSION_MM)} mm`,
  );
}

/** A dimension a price is quoted at: on the pricing step, and within the dimensions of a design. */
function isQuotableDimension(declared: unknown): declared is number {
  return (
    isWholePositiveStepMultiple(declared) && declared <= MAX_DESIGN_DIMENSION_MM
  );
}

/** A step is what one pricing step adds or takes off: never negative, since its direction is its name. */
function refuseNegativeStep(
  formula: Record<string, unknown>,
  field: string,
  named: string,
): PricingFailure | undefined {
  const read = readDeclared(formula, field);
  const notWhole = refuseNonWholeAmount(read, { field, named });
  if (notWhole) return notWhole;
  if ((read as number) >= 0) return undefined;
  return invalidBook(
    `The ${named} declares "${field}" as ${String(read)}, a step below zero: ` +
      `the direction of a step is its name, never its sign`,
  );
}

/**
 * A fixed-size formula whose list can be searched: one to `MAX_SIZES_PER_RULE` sizes, ascending, no width twice,
 * each a width on the pricing step with an exact, non-negative amount in range, and no field beside those two. Read
 * through `boundedListOf`, so a raising or endless list is a refusal. `undefined` for a formula of another shape.
 */
export function refuseUnusablePerSizeFormula(
  formula: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  if (readDeclared(formula, "shape") !== PRICE_PER_SIZE_SHAPE) return undefined;
  const unread = refuseUnreadFields(formula, FIELDS_READ_BY_PRICE_PER_SIZE, {
    shape: PRICE_PER_SIZE_SHAPE,
    named,
  });
  if (unread) return unread;
  const declared = readDeclared(formula, "sizes");
  const sizes = boundedListOf(declared, MAX_SIZES_PER_RULE);
  if (sizes === undefined || sizes.length === 0)
    return invalidBook(
      `The ${named} declares "sizes" as ${describeDeclared(declared)}, ` +
        `which is a list of one to ${String(MAX_SIZES_PER_RULE)} sizes`,
    );
  return refuseUnusableSizes(sizes, named);
}

function refuseUnusableSizes(
  sizes: readonly unknown[],
  named: string,
): PricingFailure | undefined {
  let previousWidthMm = 0;
  for (const [index, size] of sizes.entries()) {
    const where = `${named} "sizes[${String(index)}]"`;
    const width = judgeSizeWidth(size, { where, previousWidthMm });
    if (isRefusedBook(width)) return width;
    previousWidthMm = width.widthMm;
    const refused =
      refuseUnreadFields(width.size, FIELDS_READ_BY_A_LISTED_SIZE, {
        shape: PRICE_PER_SIZE_SHAPE,
        named,
        within: `sizes[${String(index)}].`,
      }) ??
      refuseNegativeAmount(width.size, "amountMinor", where) ??
      refuseOversizedAmount(width.size, where);
    if (refused) return refused;
  }
  return undefined;
}

function isRefusedBook(judged: object): judged is PricingFailure {
  return "code" in judged;
}

/** A listed size's width, judged against the width before it: strictly wider, so a repeat and an unsorted list
 *  are both refused by the one comparison. Reads the width once and hands back the width it judged. */
function judgeSizeWidth(
  declared: unknown,
  position: { readonly where: string; readonly previousWidthMm: number },
):
  | PricingFailure
  | { readonly widthMm: number; readonly size: Record<string, unknown> } {
  const { where, previousWidthMm } = position;
  if (!isRecord(declared))
    return invalidBook(
      `The ${where} is an object. Found: ${describeDeclared(declared)}`,
    );
  const widthMm = readDeclared(declared, "widthMm");
  if (!isQuotableDimension(widthMm))
    return invalidBook(
      `The ${where} declares "widthMm" as ${describeDeclared(widthMm)}, which is not a positive multiple ` +
        `of ${String(PRICE_STEP_MM)} mm up to ${String(MAX_DESIGN_DIMENSION_MM)} mm`,
    );
  if (widthMm <= previousWidthMm)
    return invalidBook(
      `The ${where} declares "widthMm" as ${String(widthMm)}, which does not rise above the size before it ` +
        `(${String(previousWidthMm)}): sizes are ascending and no width is listed twice`,
    );
  return { widthMm, size: declared };
}
