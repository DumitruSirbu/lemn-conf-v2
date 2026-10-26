// Reads a price book that arrives as untrusted data (ADR 0062 seam 1) and refuses a bad one with a
// `PricingFailure` (`INVALID_PRICE_BOOK`). It never throws: `use-priced-design.ts` parses at module
// scope, so a raise would stop the module loading rather than degrade a price.
//
// Reading a book runs the book's own code (a getter, a `toJSON`, a proxy trap, and `length` or an
// index on a proxy array), so no member is read bare below: fields go through `readDeclared`,
// enumerations through `enumerableFieldsOf`, lists through `boundedListOf`, descriptions through
// `renderedAsJson` or `describedLength`. `refuseAnythingRaised` is only a backstop; the per-read
// guards are what let a refusal name the member.
//
// Not decided here: whether a coefficient is an exact count (`usableCoefficientOf` refuses that; this
// module adds magnitude) and which formula shapes exist (`amountForBody` answers `UNKNOWN_FORMULA_SHAPE`
// per rule, which keeps the rule id).
//
// Hand-written rather than Zod: a schema would duplicate `PriceBook`'s hand-authored interfaces and
// would have to be opened up for both exceptions above.
import {
  MAX_DESIGN_DIMENSION_MM,
  MAX_IDENTIFIER_LENGTH,
} from "../design-bounds.js";
import { boundedFailureReason } from "../failure-text.js";

import {
  ANCHORED_SHAPES,
  anchoredShapeReadsDoorLeaves,
  anchoredShapeReadsHeight,
  PRICE_PER_SIZE_SHAPE,
  PRICE_STEP_MM,
  type AnchoredShape,
} from "./anchored-price-formula.js";
import {
  ACCESSORY_IDS,
  CABINET_SUPPLIERS,
  listRuleIds,
  PRICE_BOOK_CURRENCY,
  PRICE_BOOK_STATUSES,
  type PriceBook,
} from "./price-book.js";
import type { PricingFailure } from "./price-lines.js";

/** A book that has been read, or the one refusal that says why not. The parsed book is the same object
 *  handed in: nothing is copied or defaulted, since a default would be this module deciding a price. */
export type PriceBookParseResult =
  | { readonly ok: true; readonly book: PriceBook }
  | { readonly ok: false; readonly failure: PricingFailure };

/** The most cabinet rules a book may price; stops a book turning every render into an unbounded sweep. */
const MAX_CABINET_RULES = 500;

/** The most tiers one whole-kitchen group may offer: each is a radio on the settings sheet, and 1 000
 *  tiers cost ~200 ms of synchronous work and 2 000 rendered radios. */
const MAX_TIERS_PER_GROUP = 20;

/** The longest a tier's or an accessory's name may be: a radio label on one line. */
const MAX_BOOK_NAME_LENGTH = 80;

/** The longest a tier's or an accessory's one-line description may be. */
const MAX_BOOK_DESCRIPTION_LENGTH = 240;

/** The longest catalogue key a row may name for a rendered field (ADR 0106 decision 1); bounded for
 *  `MAX_IDENTIFIER_LENGTH`'s reason: an unbounded one multiplies every refusal message it reaches. */
const MAX_TEXT_KEY_LENGTH = 80;

/** The widest shape's term count: base, width, height and door-leaf terms (`amountForBody`'s
 *  `linear-in-width-height-and-door-leaves`). */
const TERMS_IN_THE_WIDEST_FORMULA = 4;

/** The largest count a book amount is multiplied by: a millimetre dimension, since every other
 *  multiplier (door leaves, hinges, drawers, latches, sinks) stays far below ten thousand. */
const MAX_BOOK_AMOUNT_MULTIPLIER = MAX_DESIGN_DIMENSION_MM;

/**
 * The largest magnitude a coefficient or a stated amount may carry, in minor units. Derived from the
 * arithmetic: at this bound every product and partial sum `amountForBody` forms stays in the
 * safe-integer range, so cancelling terms cannot lose precision. A bound on magnitude, not sign:
 * `refuseNegativeAmount` refuses the published line.
 */
export const MAX_PRICE_COEFFICIENT_MINOR = Math.floor(
  Number.MAX_SAFE_INTEGER /
    (TERMS_IN_THE_WIDEST_FORMULA * MAX_BOOK_AMOUNT_MULTIPLIER),
);

/** Reads a declared price book, or refuses it naming the first thing that is not what a book says it is.
 *  Takes `unknown`: a `PriceBook`-typed parameter would be the very promise this checks. */
export function parsePriceBook(declared: unknown): PriceBookParseResult {
  const failure = refuseAnythingRaised(declared);
  if (failure) return { ok: false, failure };
  return { ok: true, book: declared as PriceBook };
}

/**
 * Backstop that makes "refuses, never throws" true of the whole function. Each named cause has its own
 * refusal naming the member; a refusal wearing this message is a defect in the parser, not a fact about
 * the book, because every read goes through `readDeclared`, `enumerableFieldsOf` or `boundedListOf`
 * (`parse-price-book.test.ts` sweeps every list with a raising proxy to hold that true).
 */
function refuseAnythingRaised(declared: unknown): PricingFailure | undefined {
  try {
    return refuseUnreadableBook(declared);
  } catch {
    return invalidBook(
      "Reading the price book raised, so none of it can be trusted",
    );
  }
}

/** The object, then its header, then each section, then what its rules say about each other. Semantics
 *  last: a duplicate sweep over a section that is not a list would throw. */
function refuseUnreadableBook(declared: unknown): PricingFailure | undefined {
  if (!isRecord(declared))
    return invalidBook(
      `A price book is an object. Found: ${describeDeclared(declared)}`,
    );
  return (
    refuseUndeclaredHeader(declared) ??
    refuseUnreadableCabinetRules(readDeclared(declared, "cabinetRules")) ??
    refuseUnreadableTierGroup(readDeclared(declared, "hardware"), "hardware") ??
    refuseUnreadableTierGroup(readDeclared(declared, "material"), "material") ??
    refuseUnreadableAccessories(readDeclared(declared, "accessories")) ??
    // Every section above is established, so the semantic sweeps may read the book as the shape it
    // declares; this double assertion is the only line in the package that has earned it.
    refuseRepeatedId(declared as unknown as PriceBook)
  );
}

/** The book's identity, currency, footing and whether anybody has costed it; asked before any section,
 *  because a book on the wrong currency is refused whatever its rules hold. */
function refuseUndeclaredHeader(
  book: Record<string, unknown>,
): PricingFailure | undefined {
  return (
    refuseUnusableIdentifier(readDeclared(book, "version"), "version") ??
    refuseForeignCurrency(readDeclared(book, "currency")) ??
    refuseUndeclaredStatus(readDeclared(book, "status")) ??
    refuseUndeclaredProvisionalFlag(readDeclared(book, "amountsProvisional"))
  );
}

/** Read as a plain value: a book from outside TypeScript can carry any currency. */
function refuseForeignCurrency(declared: unknown): PricingFailure | undefined {
  if (declared === PRICE_BOOK_CURRENCY) return undefined;
  return invalidBook(
    `Book currency ${describeDeclared(declared)} is not ${PRICE_BOOK_CURRENCY}`,
  );
}

/** The status is carried onto the priced result, not acted on, so it is held to the union here:
 *  a surface spelling `status !== "estimate"` would present an unknown status as a commercial offer. */
function refuseUndeclaredStatus(declared: unknown): PricingFailure | undefined {
  if (
    typeof declared === "string" &&
    (PRICE_BOOK_STATUSES as readonly string[]).includes(declared)
  )
    return undefined;
  return invalidBook(
    `Book declares no "status", which is one of ${PRICE_BOOK_STATUSES.join(", ")}. ` +
      `Found: ${describeDeclared(declared)}`,
  );
}

/** Carried onto the priced result, not acted on: an omitted flag would read as `false` ("costed"), the
 *  one direction it must never fail in. Refused, not defaulted: only the book's author knows the fact. */
function refuseUndeclaredProvisionalFlag(
  declared: unknown,
): PricingFailure | undefined {
  if (typeof declared === "boolean") return undefined;
  return invalidBook(
    `Book declares no "amountsProvisional" flag, which is a boolean. ` +
      `Found: ${describeDeclared(declared)}`,
  );
}

function refuseUnreadableCabinetRules(
  declared: unknown,
): PricingFailure | undefined {
  const rules = boundedListOf(declared, MAX_CABINET_RULES);
  if (rules === undefined)
    return invalidBook(
      `"cabinetRules" is a list of at most ${String(MAX_CABINET_RULES)} rules. ` +
        `Found: ${describeDeclared(declared)}`,
    );
  for (const rule of rules) {
    const unreadable = refuseUnreadableCabinetRule(rule);
    if (unreadable) return unreadable;
  }
  return undefined;
}

function refuseUnreadableCabinetRule(
  declared: unknown,
): PricingFailure | undefined {
  if (!isRecord(declared))
    return invalidBook(
      `A cabinet rule is an object. Found: ${describeDeclared(declared)}`,
    );
  const ruleId = readDeclared(declared, "ruleId");
  return (
    refuseUnusableIdentifier(ruleId, "ruleId") ??
    refuseUnusableIdentifier(readDeclared(declared, "buildId"), "buildId") ??
    refuseUnusableSupplier(readDeclared(declared, "suppliedBy"), ruleId) ??
    refuseUnreadableFormula(readDeclared(declared, "formula"), ruleId) ??
    refuseChargedCustomerSuppliedRule(declared, ruleId)
  );
}

/** Who supplies a row decides what the customer is told about its zero, so an unrecognised answer is
 *  refused: `"CUSTOMER"` would otherwise print *inclus* over a fridge. Absent is not a fault:
 *  `priceOnePlacement` defaults it to `DEFAULT_CABINET_SUPPLIER`. */
function refuseUnusableSupplier(
  declared: unknown,
  ruleId: unknown,
): PricingFailure | undefined {
  if (declared === undefined) return undefined;
  if (
    typeof declared === "string" &&
    (CABINET_SUPPLIERS as readonly string[]).includes(declared)
  )
    return undefined;
  return invalidBook(
    `The rule "${asText(ruleId)}" declares "suppliedBy" as ${describeDeclared(declared)}. ` +
      `It is one of: ${CABINET_SUPPLIERS.join(", ")}`,
  );
}

/** A row the manufacturer does not supply may not carry a price: every coefficient must be zero, swept
 *  by kind so a formula shape this build has never heard of is covered too. */
function refuseChargedCustomerSuppliedRule(
  declared: Record<string, unknown>,
  ruleId: unknown,
): PricingFailure | undefined {
  if (readDeclared(declared, "suppliedBy") !== "customer") return undefined;
  const formula = readDeclared(declared, "formula");
  if (!isRecord(formula)) return undefined;

  const named = `rule "${asText(ruleId)}"`;
  const fields = enumerableFieldsOf(formula);
  if (fields === undefined)
    return invalidBook(`The ${named} could not be enumerated for its amounts`);
  for (const field of fields) {
    if (isADimensionNotAnAmount(field)) continue;
    const read = readDeclared(formula, field);
    if (typeof read === "number" && read !== 0)
      return invalidBook(chargedCustomerRuleDetail(named, field, read));
  }
  return refuseChargedSize(formula, named);
}

/** The millimetre fields of an anchored formula say where its prices are quoted, never what is charged. */
function isADimensionNotAnAmount(field: string): boolean {
  return field === "anchorWidthMm" || field === "anchorHeightMm";
}

function chargedCustomerRuleDetail(
  named: string,
  field: string,
  charged: number,
): string {
  return (
    `The ${named} is supplied by the customer and may not be charged for, ` +
    `but it declares "${field}" as ${String(charged)}`
  );
}

/** A fixed-size row lists its prices inside `sizes`, which the sweep of top-level fields does not reach. */
function refuseChargedSize(
  formula: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  const sizes = boundedListOf(
    readDeclared(formula, "sizes"),
    MAX_SIZES_PER_RULE,
  );
  for (const size of sizes ?? []) {
    if (!isRecord(size)) continue;
    const charged = readDeclared(size, "amountMinor");
    if (typeof charged === "number" && charged !== 0)
      return invalidBook(
        chargedCustomerRuleDetail(named, "amountMinor", charged),
      );
  }
  return undefined;
}

/** A formula's amounts, held to a magnitude the arithmetic can hold. A missing formula or an unknown
 *  shape passes through: `amountForBody` answers `UNKNOWN_FORMULA_SHAPE` naming the rule and placement.
 *  A formula that raised is this module's to refuse: nothing downstream gets a value to fail on. */
function refuseUnreadableFormula(
  declared: unknown,
  ruleId: unknown,
): PricingFailure | undefined {
  const named = `rule "${asText(ruleId)}"`;
  if (declared === UNREADABLE)
    return invalidBook(
      `The ${named} declares a formula that raised when it was read`,
    );
  if (!isRecord(declared)) return undefined;
  return (
    refuseOversizedAmount(declared, named) ??
    refuseUnusableAnchoredFormula(declared, named) ??
    refuseUnusablePerSizeFormula(declared, named)
  );
}

/** The most sizes a fixed-size row may list: the catalogue's widest range is thirteen 50 mm steps. */
const MAX_SIZES_PER_RULE = 20;

/** The amounts an anchored shape states and a step is quoted in: what each step adds or takes off. A step is
 *  never negative, since "narrower" is the direction and not the sign. */
const STEP_FIELDS = [
  "perStepWiderMinor",
  "perStepNarrowerMinor",
  "perHeightStepMinor",
] as const;

/** Every field an anchored shape reads: what a formula of that shape may carry, and nothing more. */
function fieldsReadByAnchoredShape(shape: AnchoredShape): readonly string[] {
  return [
    "shape",
    "anchorWidthMm",
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
    ...(anchoredShapeReadsDoorLeaves(shape) ? ["perExtraDoorLeafMinor"] : []),
    ...(anchoredShapeReadsHeight(shape)
      ? ["anchorHeightMm", "perHeightStepMinor"]
      : []),
  ];
}

const FIELDS_READ_BY_PRICE_PER_SIZE: readonly string[] = ["shape", "sizes"];
const FIELDS_READ_BY_A_LISTED_SIZE: readonly string[] = [
  "widthMm",
  "amountMinor",
];

/**
 * An anchored formula whose arithmetic can run: whole, in-range anchors that are multiples of the pricing step,
 * exact amounts, steps that are not negative, and exactly the fields its shape reads. Each refusal names the
 * field and the rule, so a draft editor can point at it.
 */
function refuseUnusableAnchoredFormula(
  formula: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  const shape = readDeclared(formula, "shape");
  if (!isAnchoredShape(shape)) return undefined;
  return (
    refuseUnusableAnchorDimension(formula, "anchorWidthMm", named) ??
    refuseNegativeAmount(formula, "anchorMinor", named) ??
    refuseUnusableSteps(formula, shape, named) ??
    refuseUnusableDoorField(formula, shape, named) ??
    refuseUnusableHeightFields(formula, shape, named) ??
    refuseUnreadFields(formula, fieldsReadByAnchoredShape(shape), {
      shape,
      named,
    })
  );
}

function isAnchoredShape(declared: unknown): declared is AnchoredShape {
  return (
    typeof declared === "string" &&
    (ANCHORED_SHAPES as readonly string[]).includes(declared)
  );
}

function refuseUnusableSteps(
  formula: Record<string, unknown>,
  shape: AnchoredShape,
  named: string,
): PricingFailure | undefined {
  for (const field of STEP_FIELDS) {
    const isHeightStep = field === "perHeightStepMinor";
    if (isHeightStep && !anchoredShapeReadsHeight(shape)) continue;
    const refused = refuseNegativeStep(formula, field, named);
    if (refused) return refused;
  }
  return undefined;
}

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

function refuseUnusableDoorField(
  formula: Record<string, unknown>,
  shape: AnchoredShape,
  named: string,
): PricingFailure | undefined {
  if (!anchoredShapeReadsDoorLeaves(shape)) return undefined;
  return refuseNegativeAmount(formula, "perExtraDoorLeafMinor", named);
}

function refuseUnusableHeightFields(
  formula: Record<string, unknown>,
  shape: AnchoredShape,
  named: string,
): PricingFailure | undefined {
  if (!anchoredShapeReadsHeight(shape)) return undefined;
  return refuseUnusableAnchorDimension(formula, "anchorHeightMm", named);
}

/**
 * Any field a shape does not read, whichever shape it belongs to: it would sit in the book unpriced while the
 * dashboard offered it for editing. A key holding `undefined` is absent. Enumerated through `enumerableFieldsOf`, so
 * an inherited field counts too.
 */
function refuseUnreadFields(
  formula: Record<string, unknown>,
  readFields: readonly string[],
  context: {
    readonly shape: string;
    readonly named: string;
    /** The path a field is named under when the record sits inside the formula, such as `sizes[2].`. */
    readonly within?: string;
  },
): PricingFailure | undefined {
  const fields = enumerableFieldsOf(formula);
  if (fields === undefined)
    return invalidBook(
      `The ${context.named} could not be enumerated for its fields`,
    );
  for (const field of fields) {
    if (readFields.includes(field)) continue;
    if (readDeclared(formula, field) === undefined) continue;
    return invalidBook(
      `The ${context.named} declares "${context.within ?? ""}${field}", which its shape "${context.shape}" does not read`,
    );
  }
  return undefined;
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

/** A price in the book: a safe integer count of minor units, never below zero. Magnitude is
 *  `refuseOversizedAmount`'s. Reads the field once. */
function refuseNegativeAmount(
  record: Record<string, unknown>,
  field: string,
  named: string,
): PricingFailure | undefined {
  const read = readDeclared(record, field);
  const notWhole = refuseNonWholeAmount(read, { field, named });
  if (notWhole) return notWhole;
  if ((read as number) >= 0) return undefined;
  return invalidBook(
    `The ${named} declares "${field}" as ${String(read)}, a price below zero`,
  );
}

/** An amount that must be a safe integer count of minor units. Takes the value already read, so a caller that goes on to compare it judges the same read. */
function refuseNonWholeAmount(
  read: unknown,
  declaredAs: { readonly field: string; readonly named: string },
): PricingFailure | undefined {
  if (typeof read === "number" && Number.isSafeInteger(read)) return undefined;
  return invalidBook(
    `The ${declaredAs.named} declares "${declaredAs.field}" as ${describeDeclared(read)}, ` +
      `which is not a whole, exact count of minor units`,
  );
}

/**
 * A fixed-size formula whose list can be searched: one to `MAX_SIZES_PER_RULE` sizes, ascending, no width twice,
 * each a usable width with an exact amount in range. Read through `boundedListOf`, so a raising or endless list
 * is a refusal.
 */
function refuseUnusablePerSizeFormula(
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

/** A dimension a price is quoted at: whole, positive, within a design's dimensions and on the pricing step. */
function isQuotableDimension(declared: unknown): declared is number {
  return (
    typeof declared === "number" &&
    Number.isSafeInteger(declared) &&
    declared > 0 &&
    declared <= MAX_DESIGN_DIMENSION_MM &&
    declared % PRICE_STEP_MM === 0
  );
}

function refuseUnreadableTierGroup(
  declared: unknown,
  kind: string,
): PricingFailure | undefined {
  if (!isRecord(declared))
    return invalidBook(
      `"${kind}" is a tier group object. Found: ${describeDeclared(declared)}`,
    );
  const unusableDefault = refuseUnusableIdentifier(
    readDeclared(declared, "defaultTierId"),
    `${kind}.defaultTierId`,
  );
  if (unusableDefault) return unusableDefault;
  return refuseUnreadableTiers(readDeclared(declared, "tiers"), kind);
}

function refuseUnreadableTiers(
  declared: unknown,
  kind: string,
): PricingFailure | undefined {
  const tiers = boundedListOf(declared, MAX_TIERS_PER_GROUP);
  if (tiers === undefined)
    return invalidBook(
      `"${kind}.tiers" is a list of at most ${String(MAX_TIERS_PER_GROUP)} tiers. ` +
        `Found: ${describeDeclared(declared)}`,
    );
  for (const tier of tiers) {
    const unreadable = refuseUnreadableTier(tier, kind);
    if (unreadable) return unreadable;
  }
  return undefined;
}

function refuseUnreadableTier(
  declared: unknown,
  kind: string,
): PricingFailure | undefined {
  if (!isRecord(declared))
    return invalidBook(
      `A ${kind} tier is an object. Found: ${describeDeclared(declared)}`,
    );
  const tierId = readDeclared(declared, "tierId");
  const named = `${kind} tier "${asText(tierId)}"`;
  return (
    refuseUnusableIdentifier(tierId, `${kind}.tierId`) ??
    refuseUnusableIdentifier(
      readDeclared(declared, "ruleId"),
      `${kind}.ruleId`,
    ) ??
    refuseUnreadableWords(declared, named) ??
    refuseOversizedAmount(declared, named)
  );
}

/**
 * The accessory section. An absent rule is not a fault here: only a design that earns the accessory
 * refuses it (`accessoryLine`). This establishes that the section is readable, so `accessoryRuleOf`
 * and `listAccessoryRuleIds` may dereference it. see ADR 0092 decision 11
 */
function refuseUnreadableAccessories(
  declared: unknown,
): PricingFailure | undefined {
  if (!isRecord(declared))
    return invalidBook(
      `"accessories" is an object. Found: ${describeDeclared(declared)}`,
    );
  for (const accessoryId of ACCESSORY_IDS) {
    const rule = readDeclared(declared, accessoryId);
    if (rule === undefined) continue;
    const unreadable = refuseUnreadableAccessoryRule(rule, accessoryId);
    if (unreadable) return unreadable;
  }
  return undefined;
}

function refuseUnreadableAccessoryRule(
  declared: unknown,
  accessoryId: string,
): PricingFailure | undefined {
  const named = `accessory "${accessoryId}"`;
  if (!isRecord(declared))
    return invalidBook(
      `The ${named} is an object. Found: ${describeDeclared(declared)}`,
      {
        id: accessoryId,
      },
    );
  return (
    refuseUnusableIdentifier(
      readDeclared(declared, "ruleId"),
      `${accessoryId}.ruleId`,
    ) ??
    refuseUnreadableWords(declared, named) ??
    refuseOversizedAmount(declared, named)
  );
}

/** The words a tier or an accessory renders. Bounded because they are book data rendered, not copy a
 *  component holds. Both stay required even when the row names a catalogue key: a book nobody at
 *  Lemnaria wrote still renders by its authored words. see ADR 0106 decision 2 */
function refuseUnreadableWords(
  declared: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  return (
    refuseUnusableText(readDeclared(declared, "name"), {
      named: `${named} name`,
      maxLength: MAX_BOOK_NAME_LENGTH,
    }) ??
    refuseUnusableText(readDeclared(declared, "description"), {
      named: `${named} description`,
      maxLength: MAX_BOOK_DESCRIPTION_LENGTH,
    }) ??
    refuseUnusableTextKey(declared, named, "nameKey") ??
    refuseUnusableTextKey(declared, named, "descriptionKey")
  );
}

/**
 * The catalogue leaf a row names for a rendered field. Absence is the common case and never a fault
 * (ADR 0106 decision 2). Refused: a declared key that is not a string, is empty, or is too long.
 * Whether the key names a leaf is the app's question: it falls back to the authored word.
 */
function refuseUnusableTextKey(
  declared: Record<string, unknown>,
  named: string,
  field: "nameKey" | "descriptionKey",
): PricingFailure | undefined {
  const key = readDeclared(declared, field);
  if (key === undefined) return undefined;
  if (key === "")
    return invalidBook(
      `The ${named} declares an empty "${field}", which names no catalogue leaf`,
    );
  return refuseUnusableText(key, {
    named: `${named} ${field}`,
    maxLength: MAX_TEXT_KEY_LENGTH,
  });
}

/**
 * Every amount an object states, held to a magnitude the arithmetic can carry exactly. Swept by kind,
 * not by name, so a fifth coefficient is bounded the day it is added. Swept through the prototype
 * chain: readers reach an amount by `tier[field]`, which resolves inherited properties, and a book
 * backed by model objects states its rates there. Only safe integers are judged here;
 * `usableCoefficientOf` already refuses null, NaN, infinities, fractions and `2 ** 62`.
 */
function refuseOversizedAmount(
  declared: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  const fields = enumerableFieldsOf(declared);
  if (fields === undefined)
    return invalidBook(`The ${named} could not be enumerated for its amounts`);

  for (const field of fields) {
    const read = readDeclared(declared, field);
    if (read === UNREADABLE)
      return invalidBook(
        `The ${named} declares "${field}" as something that raised when it was read`,
      );
    if (isOversizedAmount(read)) {
      return invalidBook(
        `The ${named} declares "${field}" as ${String(read)}, whose magnitude is past ` +
          `${String(MAX_PRICE_COEFFICIENT_MINOR)} minor units — past what the arithmetic holds exactly`,
      );
    }
  }
  return undefined;
}

function isOversizedAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) > MAX_PRICE_COEFFICIENT_MINOR
  );
}

/** A read that raised, told apart from every value a book can carry: a symbol, not `undefined`,
 *  because an absent amount is an ordinary declaration. */
const UNREADABLE = Symbol("unreadable book amount");

/**
 * A property read that cannot take the parser with it: an accessor on a JavaScript-value book may
 * raise. Returns `UNREADABLE`; what raised is named, never rendered, since rendering the value is one
 * more place this boundary could raise.
 */
function readDeclared(
  declared: Record<string, unknown>,
  field: string,
): unknown {
  try {
    return declared[field];
  } catch {
    return UNREADABLE;
  }
}

/**
 * The enumerable keys of a declared object and of the prototypes it brings with it, which is what a
 * property read reaches. The walk stops at `Object.prototype`: a polluted
 * `Object.prototype.injectedAmountMinor` would otherwise refuse every well-formed book. Depth is
 * bounded because a proxy may answer `getPrototypeOf` with a fresh object indefinitely.
 */
function enumerableFieldsOf(
  declared: Record<string, unknown>,
): readonly string[] | undefined {
  try {
    const fields = new Set<string>();
    let level: object | null = declared;
    for (let depth = 0; depth < MAX_BOOK_PROTOTYPE_DEPTH; depth += 1) {
      if (level === null || level === Object.prototype) break;
      for (const field of Object.keys(level)) fields.add(field);
      level = Object.getPrototypeOf(level) as object | null;
    }
    return [...fields];
  } catch {
    return undefined;
  }
}

/** How far up a declared object's prototypes an amount may live: generous for class-backed books, short
 *  enough that a proxy cannot walk the parser in circles. */
const MAX_BOOK_PROTOTYPE_DEPTH = 8;

/**
 * What the book's rules say about each other, once all are readable. A repeated rule id makes a line
 * untraceable; a repeated tier id makes `selectTier`'s `Array.find` resolve on declaration order; a row
 * priced twice does not say what the cabinet costs.
 */
function refuseRepeatedId(book: PriceBook): PricingFailure | undefined {
  return (
    refuseRepeatedRuleId(book) ??
    refuseRepeatedTierId(book) ??
    refuseRowPricedTwice(book)
  );
}

function refuseRepeatedRuleId(book: PriceBook): PricingFailure | undefined {
  const repeated = firstDuplicate(listRuleIds(book));
  if (repeated === undefined) return undefined;
  return invalidBook(`Rule id "${repeated}" is declared more than once`, {
    id: repeated,
  });
}

/** Across both groups, not within each, so a hardware tier id cannot collide with a material one. */
function refuseRepeatedTierId(book: PriceBook): PricingFailure | undefined {
  const declared = [...book.hardware.tiers, ...book.material.tiers];
  const repeated = firstDuplicate(declared.map((tier) => tier.tierId));
  if (repeated === undefined) return undefined;
  return invalidBook(`Tier id "${repeated}" is declared more than once`, {
    id: repeated,
  });
}

/** A second rule for one catalogue row passes the distinct-id sweep, and `indexRulesByBuildId`'s `Map`
 *  would silently keep whichever came last; a book editor "pricing this cabinet differently" plausibly
 *  adds a rule rather than changing one. */
function refuseRowPricedTwice(book: PriceBook): PricingFailure | undefined {
  const repeated = firstDuplicate(
    book.cabinetRules.map((rule) => rule.buildId),
  );
  if (repeated === undefined) return undefined;
  return invalidBook(
    `Catalogue row "${repeated}" is priced by more than one rule`,
    { id: repeated },
  );
}

function firstDuplicate(ids: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

/** An id a rule, tier or book is known by: a non-empty string within `MAX_IDENTIFIER_LENGTH`; an
 *  unbounded one multiplies every refusal message and log line it reaches. */
function refuseUnusableIdentifier(
  declared: unknown,
  field: string,
): PricingFailure | undefined {
  if (declared === "")
    return invalidBook(`Book declares an empty "${field}", which is not an id`);
  return refuseUnusableText(declared, {
    named: `"${field}"`,
    maxLength: MAX_IDENTIFIER_LENGTH,
  });
}

function refuseUnusableText(
  declared: unknown,
  bound: { readonly named: string; readonly maxLength: number },
): PricingFailure | undefined {
  if (typeof declared !== "string")
    return invalidBook(
      `Book declares no ${bound.named}, which is a string. Found: ${describeDeclared(declared)}`,
    );
  if (declared.length <= bound.maxLength) return undefined;
  return invalidBook(
    `Book declares a ${bound.named} of ${String(declared.length)} characters, ` +
      `past the ${String(bound.maxLength)} a book may state`,
  );
}

function isRecord(declared: unknown): declared is Record<string, unknown> {
  return (
    typeof declared === "object" &&
    declared !== null &&
    !Array.isArray(declared)
  );
}

/**
 * A list a book declared, copied out before anything sweeps it. `Array.isArray` is true of a proxy
 * over an array, so the length read, `Symbol.iterator` and each index run the book's own traps; the
 * snapshot makes those the last reads of the declared value. Copied by index within the one length
 * read, not through the iterator: a proxy may answer `length` with a larger number every time, and
 * `Array.from` would follow it forever. `undefined` for every way this is not a list a book may
 * declare; the caller knows which section it was.
 */
function boundedListOf(
  declared: unknown,
  maxLength: number,
): readonly unknown[] | undefined {
  if (!Array.isArray(declared)) return undefined;
  return snapshotOfDeclaredList(declared as readonly unknown[], maxLength);
}

function snapshotOfDeclaredList(
  declared: readonly unknown[],
  maxLength: number,
): readonly unknown[] | undefined {
  try {
    const declaredLength = declared.length;
    if (declaredLength > maxLength) return undefined;
    const snapshot: unknown[] = [];
    for (let index = 0; index < declaredLength; index += 1) {
      snapshot.push(declared[index]);
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

/** The one place a parse failure is built, so `detail` is bounded and scrubbed unconditionally: every
 *  string here comes from a book outside TypeScript (ADR 0062 seam 1). */
function invalidBook(
  detail: string,
  named?: { readonly id: string },
): PricingFailure {
  return {
    code: "INVALID_PRICE_BOOK",
    detail: boundedFailureReason(detail),
    ...named,
  };
}

/** What a declared value was, for a message. A list is summarised: a thousand-tier book must not turn
 *  its refusal into a thousand-tier string. */
function describeDeclared(declared: unknown): string {
  // The one place `UNREADABLE` becomes words: the symbol must never reach a logged, rendered failure.
  if (declared === UNREADABLE) return "something that raised when it was read";
  if (declared === undefined) return "nothing";
  if (Array.isArray(declared)) return describedLength(declared);
  return renderedOr(renderedAsJson(declared), typeof declared);
}

/** The describer runs inside the refusal path and `length` on a proxy is a trap, so a raise here would
 *  lose the refusal being built. */
function describedLength(declared: readonly unknown[]): string {
  try {
    return `a list of ${String(declared.length)}`;
  } catch {
    return "a list whose length raised when it was read";
  }
}

/**
 * `JSON.stringify` is the wrong shape here twice over: it answers `undefined` for a function or
 * symbol while its type says string, and it raises for a BigInt, a circular member or a raising
 * `toJSON`. The describer runs inside the refusal path, so either would lose the refusal. Falling back
 * to `typeof` says less but is all it can promise.
 */
function renderedAsJson(declared: unknown): string | undefined {
  try {
    return JSON.stringify(declared);
  } catch {
    return undefined;
  }
}

/** Widened by a parameter, not a local annotation: a `const` narrows back to its initialiser's type. */
function renderedOr(rendered: string | undefined, fallback: string): string {
  return rendered ?? fallback;
}

/** An id as a message renders it, whatever the book declared it as. */
function asText(declared: unknown): string {
  return typeof declared === "string" ? declared : describeDeclared(declared);
}
