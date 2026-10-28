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
  isAnchoredShape,
  PRICE_PER_SIZE_SHAPE,
} from "./anchored-price-formula.js";
import {
  boundedListOf,
  describeDeclared,
  enumerableFieldsOf,
  invalidBook,
  isRecord,
  MAX_BOOK_DESCRIPTION_LENGTH,
  MAX_BOOK_NAME_LENGTH,
  readDeclared,
  refuseNonWholeAmount,
  refuseOversizedAmount,
  refuseUnusableIdentifier,
  refuseUnusableText,
  UNREADABLE,
} from "./book-reading.js";
import {
  MAX_LINKED_ACCESSORIES,
  refuseUnreadableLinkedAccessories,
} from "./parse-linked-accessories.js";
import { refuseUnusablePercentageForm } from "./parse-percentage-form.js";
import { refuseUndeclaredRowMembers } from "./parse-row-members.js";
import {
  MAX_SIZES_PER_RULE,
  refuseUnusableAnchoredFormula,
  refuseUnusablePerSizeFormula,
} from "./parse-anchored-formula.js";
import {
  ACCESSORY_IDS,
  CABINET_SUPPLIERS,
  listAccessoryIds,
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

/** The longest catalogue key a row may name for a rendered field (ADR 0106 decision 1); bounded for
 *  `MAX_IDENTIFIER_LENGTH`'s reason: an unbounded one multiplies every refusal message it reaches. */
const MAX_TEXT_KEY_LENGTH = 80;

export {
  MAX_BOOK_NAME_LENGTH,
  MAX_PRICE_COEFFICIENT_MINOR,
} from "./book-reading.js";

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
    refuseUnreadableLinkedAccessories(
      readDeclared(declared, "linkedAccessories"),
    ) ??
    refuseUnusablePercentageForm(declared, MAX_TIERS_PER_GROUP) ??
    refuseUndeclaredRowMembers(declared, {
      maxTiersPerGroup: MAX_TIERS_PER_GROUP,
      maxLinkedAccessories: MAX_LINKED_ACCESSORIES,
    }) ??
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
  const shape = readDeclared(formula, "shape");
  for (const field of fields) {
    if (isAnchoredShape(shape) && isADimensionNotAnAmount(field)) continue;
    const read = readDeclared(formula, field);
    if (typeof read === "number" && read !== 0)
      return invalidBook(chargedCustomerRuleDetail(named, field, read));
  }
  if (shape !== PRICE_PER_SIZE_SHAPE) return undefined;
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
    refuseOversizedAmount(declared, named) ??
    refuseUnusableRates(declared, named)
  );
}

/** A tier's or an accessory's rates, whole and never below zero, as a cabinet's are. A rate that is absent or not a
 *  number is the arithmetic's to refuse when it is priced. Runs after `refuseOversizedAmount`, which has enumerated the
 *  fields. */
function refuseUnusableRates(
  declared: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  for (const field of enumerableFieldsOf(declared) ?? []) {
    if (!field.endsWith("Minor")) continue;
    const read = readDeclared(declared, field);
    if (typeof read !== "number") continue;
    const notWhole = refuseNonWholeAmount(read, { field, named });
    if (notWhole) return notWhole;
    if (read < 0)
      return invalidBook(
        `The ${named} declares "${field}" as ${String(read)}, a price below zero`,
      );
  }
  return undefined;
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
    refuseOversizedAmount(declared, named) ??
    refuseUnusableRates(declared, named)
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
    refuseBlankUnkeyedName(declared, named) ??
    refuseUnusableText(readDeclared(declared, "description"), {
      named: `${named} description`,
      maxLength: MAX_BOOK_DESCRIPTION_LENGTH,
    }) ??
    refuseUnusableTextKey(declared, named, "nameKey") ??
    refuseUnusableTextKey(declared, named, "descriptionKey")
  );
}

/** A row naming no catalogue leaf renders its authored name as typed (ADR 0106 decision 2), so a blank one renders
 *  nothing: a created row has no key, and this is what keeps its Romanian name from being empty. A keyed row's authored
 *  word is the fallback and may be anything. */
function refuseBlankUnkeyedName(
  declared: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  const name = readDeclared(declared, "name");
  if (typeof name !== "string" || name.trim() !== "") return undefined;
  if (readDeclared(declared, "nameKey") !== undefined) return undefined;
  return invalidBook(
    `The ${named} declares a blank "name" and names no "nameKey", so it would render nothing`,
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
 * What the book's rules say about each other, once all are readable. A repeated rule id makes a line
 * untraceable; a repeated tier id makes `selectTier`'s `Array.find` resolve on declaration order; a row
 * priced twice does not say what the cabinet costs; a repeated accessory id gives two lines one id and one
 * availability switch; a linked accessory on a row the customer supplies would bill for what nobody sells.
 */
function refuseRepeatedId(book: PriceBook): PricingFailure | undefined {
  return (
    refuseRepeatedRuleId(book) ??
    refuseRepeatedTierId(book) ??
    refuseRowPricedTwice(book) ??
    refuseRepeatedAccessoryId(book) ??
    refuseLinkToCustomerSuppliedRow(book)
  );
}

/** Across the two built-ins' field names and every linked accessory, so a created accessory cannot take a built-in's
 *  line id (`accessory:sinkProtectiveCover`) or its availability switch. */
function refuseRepeatedAccessoryId(
  book: PriceBook,
): PricingFailure | undefined {
  const repeated = firstDuplicate(listAccessoryIds(book));
  if (repeated === undefined) return undefined;
  return invalidBook(`Accessory id "${repeated}" is declared more than once`, {
    id: repeated,
  });
}

/** Only where the book itself says the row is the customer's: whether the catalogue holds the row is the dashboard's
 *  judgement at publish, since pricing binds to no catalogue. */
function refuseLinkToCustomerSuppliedRow(
  book: PriceBook,
): PricingFailure | undefined {
  const customerRows = new Set(
    book.cabinetRules
      .filter((rule) => rule.suppliedBy === "customer")
      .map((rule) => rule.buildId),
  );
  const linked = book.linkedAccessories.find((accessory) =>
    customerRows.has(accessory.linkedBuildId),
  );
  if (linked === undefined) return undefined;
  return invalidBook(
    `Linked accessory "${linked.accessoryId}" is linked to "${linked.linkedBuildId}", a row the customer supplies`,
    { id: linked.accessoryId },
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

/** An id as a message renders it, whatever the book declared it as. */
function asText(declared: unknown): string {
  return typeof declared === "string" ? declared : describeDeclared(declared);
}
