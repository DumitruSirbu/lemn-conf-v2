// Books of the form that was retired at the cut-over (M10 P3), planted from the test side: the shipped sample is in the
// percentage form now, so a suite that needs "a version stored before the cut-over" cannot read one from production
// source. The dashboard still reads such a book (`readEditableFields` states no field the book lacks), so what a restore
// or a version comparison makes of an archived version that does not state a field is asserted against these.
import type {
  CabinetPriceRule,
  PriceBook,
} from "@lemnaria/configurator-domain";

const RETIRED_LINEAR_FORMULA = {
  shape: "linear-in-width",
  baseMinor: 100_000,
  perWidthMillimetreMinor: 400,
} as const;

type Mutable<Shape> = { -readonly [Key in keyof Shape]?: Shape[Key] };

/** The book as a version stored before the cut-over holds it: no depth rule. Every other field is the book's own. */
export function withoutDepthRule(book: PriceBook): PriceBook {
  const copy: Mutable<PriceBook> = structuredClone(book);
  delete copy.depthRule;
  return copy as PriceBook;
}

/**
 * The book with these cabinets priced in the retired linear shape, which states none of the three anchored amounts
 * (`anchorMinor`, `perStepWiderMinor`, `perStepNarrowerMinor`): a restore from it must leave a draft change on those
 * fields alone. Every cabinet not named keeps its own rule.
 */
export function withRetiredLinearRules(
  book: PriceBook,
  ruleIds: readonly string[],
): PriceBook {
  const retired = (rule: CabinetPriceRule): CabinetPriceRule =>
    ({
      ...rule,
      formula: RETIRED_LINEAR_FORMULA,
    }) as unknown as CabinetPriceRule;
  return {
    ...book,
    cabinetRules: book.cabinetRules.map((rule) =>
      ruleIds.includes(rule.ruleId) ? retired(rule) : rule,
    ),
  };
}

/** A version stored before the cut-over, whole: every cabinet linear and no depth rule. */
export function storedBeforeTheCutOver(book: PriceBook): PriceBook {
  return withoutDepthRule(
    withRetiredLinearRules(
      book,
      book.cabinetRules.map((rule) => rule.ruleId),
    ),
  );
}
