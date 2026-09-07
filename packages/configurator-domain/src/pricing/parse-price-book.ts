// **The one place a price book stops being a promise and becomes a fact.**
//
// ADR 0062 seam 1 makes a book *versioned data assembled outside TypeScript*: `price-book.ts`
// describes what a book is supposed to be, and nothing in the language holds a book to it at the
// moment one arrives. Every reader downstream — `listRuleIds`, `selectTier`, `offeredGroup` —
// dereferences the section it needs directly, which is correct and cheap **once something has
// established the section is there**. This module is that something, and it is the only reason those
// readers may keep doing it.
//
// **It refuses; it never throws.** Both price surfaces run inside React's render and there is no
// error boundary above them, and `use-priced-design.ts` parses at **module scope** — so a raise out
// of this module is not a degraded price, it is the module failing to load before any component
// exists. The refusal is `PricingFailure` — the same shape, the same `INVALID_PRICE_BOOK` code and
// the same bounded `detail` `priceDesign` already answers with — so a caller has one error
// convention to read and not two.
//
// **The claim is about every input, and holding it takes more than not writing `throw`.** Reading a
// book runs the *book's* code: a getter, a `toJSON`, a proxy trap. So every property read, every
// enumeration and every describe below is guarded at the point it runs the foreign value, and
// `refuseAnythingRaised` backstops the lot. Narrowing the claim to the values `JSON.parse` can
// produce would be the easier answer and the wrong one — the sample book this build ships is a
// JavaScript value, and a manufacturer dashboard backed by model objects would be another.
//
// **Two things it deliberately does not decide.**
//
// - *Whether a coefficient is an exact count of minor units.* `usableCoefficientOf` already refuses
//   that, per field and per rule, naming the placement and the rule a whole-book parse failure could
//   not. What this module adds is the half nothing checked: **magnitude**, so a coefficient large
//   enough to make its own product inexact never reaches the arithmetic (M6-AUD-015).
// - *Which formula shapes exist, or whether a rule carries one.* A shape this build has never heard
//   of is `UNKNOWN_FORMULA_SHAPE`, answered by `amountForBody` against the design that carries it.
//   Refusing the whole book for it here would move a per-rule fact into a per-book one and lose the
//   rule id with it.
//
// Hand-written rather than a Zod schema, although this package uses Zod for the document wire shape.
// A schema would have to mirror `PriceBook`'s hand-authored interfaces — the parallel definition the
// conventions warn against — and would have to be opened up again for both exceptions above, since
// its whole value is rejecting what it does not recognise.
import {
  MAX_DESIGN_DIMENSION_MM,
  MAX_IDENTIFIER_LENGTH,
} from "../design-bounds.js";
import { boundedFailureReason } from "../failure-text.js";

import {
  ACCESSORY_IDS,
  listRuleIds,
  PRICE_BOOK_CURRENCY,
  PRICE_BOOK_STATUSES,
  type PriceBook,
} from "./price-book.js";
import type { PricingFailure } from "./price-lines.js";

/**
 * A book that has been read, or the one refusal that says why it could not be.
 *
 * `PricingResult`'s idiom, deliberately: success or refusal, no partial answer and no third branch.
 * The parsed book is the **same object** that was handed in — nothing is copied, renamed or
 * defaulted here, because a parser that silently supplied a missing field would be this module
 * deciding a price.
 */
export type PriceBookParseResult =
  | { readonly ok: true; readonly book: PriceBook }
  | { readonly ok: false; readonly failure: PricingFailure };

/** The most cabinet rules a book may price. This build's catalogue holds 26 insertable rows and 21
 *  seeded ones, so this is an order of magnitude above the largest range one manufacturer publishes
 *  — and it is what stops a book from turning every render into an unbounded sweep. */
const MAX_CABINET_RULES = 500;

/** The most tiers one whole-kitchen group may offer.
 *
 *  A tier is a radio the customer reads on the settings sheet, and the sheet draws them as a short
 *  list: the sample offers three per group and no grade ladder a manufacturer publishes runs past a
 *  dozen. The bound is what M6-AUD-010 named — 1 000 tiers per group costs ~200 ms of synchronous
 *  work and then asks React to render 2 000 radios. */
const MAX_TIERS_PER_GROUP = 20;

/** The longest a tier's or an accessory's name may be: a radio label on one line. The longest the
 *  sample ships is 47 characters. */
const MAX_BOOK_NAME_LENGTH = 80;

/** The longest a tier's or an accessory's one-line description may be. The longest the sample ships
 *  is 90 characters. */
const MAX_BOOK_DESCRIPTION_LENGTH = 240;

/** The widest shape's term count: a base, a width term, a height term and a door-leaf term —
 *  `amountForBody`'s `linear-in-width-height-and-door-leaves`, and the shape a fifth axis would
 *  widen. */
const TERMS_IN_THE_WIDEST_FORMULA = 4;

/** The largest count a book amount is ever multiplied by.
 *
 *  A millimetre of width or of height is the biggest of them, and `MAX_DESIGN_DIMENSION_MM` is what
 *  a *document* may declare one as. Every other multiplier is a count of things standing in one
 *  design — door leaves, which `deriveDoorCount` caps at two per declared tier, and the hinges,
 *  drawers, latches and sinks counted across at most `MAX_PLACEMENTS` bodies — and none of them
 *  reaches ten thousand. */
const MAX_BOOK_AMOUNT_MULTIPLIER = MAX_DESIGN_DIMENSION_MM;

/**
 * The largest magnitude a coefficient or a stated amount may carry, in minor units.
 *
 * **Derived from the arithmetic rather than chosen**, and that is the point: what has to stay exact
 * is not one product but the *sum* of a shape's terms. At this bound every product and every partial
 * sum `amountForBody` forms is inside the safe-integer range, so a cancellation cannot lose a term.
 * That is the defect M6-AUD-015 measured: two coefficients that cancel exactly in integer arithmetic
 * and to a different number in floating point, published as a perfectly exact `0`.
 *
 * **A bound on magnitude and not on sign.** Whether a negative coefficient is commercially legal is
 * an owner question nobody has ruled; `refuseNegativeAmount` refuses the published *line* rather than
 * the coefficient, and this module does not pre-empt that ruling.
 */
export const MAX_PRICE_COEFFICIENT_MINOR = Math.floor(
  Number.MAX_SAFE_INTEGER /
    (TERMS_IN_THE_WIDEST_FORMULA * MAX_BOOK_AMOUNT_MULTIPLIER),
);

/**
 * Reads a declared price book, or refuses it naming the first thing that is not what a book says it
 * is.
 *
 * Takes `unknown` on purpose. A parameter typed `PriceBook` would be the very promise this exists to
 * check, and the four reproductions M6-AUD-002 recorded — an absent `hardware`, a `null`
 * `hardware.tiers`, a `null` `cabinetRules`, a `null` tier — all satisfy that type as far as a
 * caller is concerned.
 */
export function parsePriceBook(declared: unknown): PriceBookParseResult {
  const failure = refuseAnythingRaised(declared);
  if (failure) return { ok: false, failure };
  return { ok: true, book: declared as PriceBook };
}

/**
 * **The backstop that makes "it refuses; it never throws" true of the function rather than of the
 * checks inside it.**
 *
 * Every named cause has its own refusal below — a value `JSON.stringify` raises on, an accessor that
 * raises when it is read, a proxy whose enumeration traps raise — and each of those says which field
 * and why, which this cannot. **This is not a substitute for any of them**, and a refusal wearing
 * this message is a defect in the parser rather than a fact about the book.
 *
 * It exists because the argument for the specific fixes is an argument about a population, and the
 * population is *whatever a book assembled as a JavaScript value can be*. `use-priced-design.ts`
 * parses at module scope, so the cost of being wrong about that population once is the module
 * failing to load: no component, no error boundary, no price surface to degrade. A boundary this
 * total is cheaper than being right about every value JavaScript can express.
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

/** What a book has to be, in the order a reader needs it: the object, then what it says about
 *  itself, then each section, then what its rules say about each other. Semantics last, because a
 *  duplicate sweep over a section that is not a list is the throw this module exists to prevent. */
function refuseUnreadableBook(declared: unknown): PricingFailure | undefined {
  if (!isRecord(declared))
    return invalidBook(
      `A price book is an object. Found: ${describeDeclared(declared)}`,
    );
  return (
    refuseUndeclaredHeader(declared) ??
    refuseUnreadableCabinetRules(declared["cabinetRules"]) ??
    refuseUnreadableTierGroup(declared["hardware"], "hardware") ??
    refuseUnreadableTierGroup(declared["material"], "material") ??
    refuseUnreadableAccessories(declared["accessories"]) ??
    // Every section above has been established, so the semantic sweeps below may read the book as
    // the shape it declares. The double assertion is the moment the promise becomes a fact, and it
    // is here rather than anywhere else on purpose: it is the only line in this package that has
    // earned it.
    refuseRepeatedId(declared as unknown as PriceBook)
  );
}

/** What the book says about itself: its identity, its currency, its footing, and whether anybody has
 *  costed it. Asked before any section, because a book on the wrong currency is refused whatever its
 *  rules turn out to hold. */
function refuseUndeclaredHeader(
  book: Record<string, unknown>,
): PricingFailure | undefined {
  return (
    refuseUnusableIdentifier(book["version"], "version") ??
    refuseForeignCurrency(book["currency"]) ??
    refuseUndeclaredStatus(book["status"]) ??
    refuseUndeclaredProvisionalFlag(book["amountsProvisional"])
  );
}

/** Read as a plain value, because a book supplied from outside TypeScript can carry any currency it
 *  likes and this is the boundary that says so. The declared type is what a caller *promises*; this
 *  is what the value is. */
function refuseForeignCurrency(declared: unknown): PricingFailure | undefined {
  if (declared === PRICE_BOOK_CURRENCY) return undefined;
  return invalidBook(
    `Book currency ${describeDeclared(declared)} is not ${PRICE_BOOK_CURRENCY}`,
  );
}

/** The status is **carried onto the priced result rather than acted on**, so a book declaring
 *  `"Commercial"` or `null` publishes a `PricedDesign` whose status no surface anticipates — and
 *  which way that fails depends on how a surface happens to spell one equality.
 *  `status === "commercial"` fails safe; `status !== "estimate"` presents an estimate as a
 *  commercial offer. Neither spelling should be load-bearing, so the value is held to the union
 *  here instead. */
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

/** The flag is **carried onto the priced result rather than acted on**, so a book that omits it
 *  would publish an `undefined` every surface reads as `false` — "these amounts have been costed" —
 *  which is the one direction this flag must never fail in. Refused rather than defaulted: a default
 *  would be this module deciding a fact about a book only its author knows. */
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
  if (!isBoundedList(declared, MAX_CABINET_RULES))
    return invalidBook(
      `"cabinetRules" is a list of at most ${String(MAX_CABINET_RULES)} rules. ` +
        `Found: ${describeDeclared(declared)}`,
    );
  for (const rule of declared) {
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
  return (
    refuseUnusableIdentifier(declared["ruleId"], "ruleId") ??
    refuseUnusableIdentifier(declared["buildId"], "buildId") ??
    refuseUnreadableFormula(declared["formula"], declared["ruleId"])
  );
}

/** A formula's amounts, held to a magnitude the arithmetic can hold.
 *
 *  **Nothing about the formula's shape is checked here, and a rule carrying no formula at all is
 *  passed through**: both are `amountForBody`'s question, answered as `UNKNOWN_FORMULA_SHAPE` against
 *  the design that reaches the rule, naming the rule and the placement. A missing formula is a shape
 *  this build has never heard of told in the shortest way there is, and refusing the whole book for
 *  it would turn a per-rule fact into a per-book one. */
function refuseUnreadableFormula(
  declared: unknown,
  ruleId: unknown,
): PricingFailure | undefined {
  if (!isRecord(declared)) return undefined;
  return refuseOversizedAmount(declared, `rule "${asText(ruleId)}"`);
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
    declared["defaultTierId"],
    `${kind}.defaultTierId`,
  );
  if (unusableDefault) return unusableDefault;
  return refuseUnreadableTiers(declared["tiers"], kind);
}

function refuseUnreadableTiers(
  declared: unknown,
  kind: string,
): PricingFailure | undefined {
  if (!isBoundedList(declared, MAX_TIERS_PER_GROUP))
    return invalidBook(
      `"${kind}.tiers" is a list of at most ${String(MAX_TIERS_PER_GROUP)} tiers. ` +
        `Found: ${describeDeclared(declared)}`,
    );
  for (const tier of declared) {
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
  const named = `${kind} tier "${asText(declared["tierId"])}"`;
  return (
    refuseUnusableIdentifier(declared["tierId"], `${kind}.tierId`) ??
    refuseUnusableIdentifier(declared["ruleId"], `${kind}.ruleId`) ??
    refuseUnreadableWords(declared, named) ??
    refuseOversizedAmount(declared, named)
  );
}

/**
 * The accessory section, and whatever rules it holds.
 *
 * **An absent rule is not a fault here**, and that is ADR 0092 decision 11 rather than an omission:
 * a book holding no rule for an accessory is refused only by the design that *earns* it
 * (`accessoryLine`), which is a fact about the design and names the accessory the customer would
 * have been billed for. What this establishes is that the section is readable at all, so
 * `accessoryRuleOf` and `listAccessoryRuleIds` may dereference it.
 */
function refuseUnreadableAccessories(
  declared: unknown,
): PricingFailure | undefined {
  if (!isRecord(declared))
    return invalidBook(
      `"accessories" is an object. Found: ${describeDeclared(declared)}`,
    );
  for (const accessoryId of ACCESSORY_IDS) {
    const rule = declared[accessoryId];
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
    refuseUnusableIdentifier(declared["ruleId"], `${accessoryId}.ruleId`) ??
    refuseUnreadableWords(declared, named) ??
    refuseOversizedAmount(declared, named)
  );
}

/** The words a tier or an accessory renders. Bounded because they are **book data rendered**
 *  (ADR 0062's third prohibition) rather than copy a component holds, so their length is the book
 *  author's choice and not the surface's. */
function refuseUnreadableWords(
  declared: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  return (
    refuseUnusableText(declared["name"], {
      named: `${named} name`,
      maxLength: MAX_BOOK_NAME_LENGTH,
    }) ??
    refuseUnusableText(declared["description"], {
      named: `${named} description`,
      maxLength: MAX_BOOK_DESCRIPTION_LENGTH,
    })
  );
}

/**
 * Every amount an object states, held to a magnitude the arithmetic can carry exactly.
 *
 * **Swept by kind rather than by name**: any property declared as an exact count of minor units is
 * an amount, so a fifth coefficient is bounded the day it is added rather than the day somebody
 * remembers a list.
 *
 * **Swept through the prototype chain, because that is what the readers do.** `hardwareRate`,
 * `usableCoefficientOf` and `amountForBody` all reach an amount by `tier[field]`, which resolves
 * inherited properties. An own-property sweep therefore checked a different set of numbers from the
 * one that gets multiplied — and a book assembled from a model object rather than from `JSON.parse`,
 * which is the ADR 0062 dashboard's own population, states its rates exactly there. `for…in` is the
 * enumeration whose reach matches a property read's.
 *
 * **Only the safe integers are this module's to judge**, which is the whole seam between the two
 * checks. `usableCoefficientOf` already refuses `null`, `NaN`, an infinity, a fraction and `2 ** 62`
 * — per field, per rule, naming the placement a whole-book parse failure could not — so what is left
 * for the parser is exactly the value nothing checked: a coefficient that *is* an exact count and is
 * still large enough to make its own product inexact.
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

/** **A read that raised**, told apart from every value a book can actually carry. A unique symbol
 *  rather than `undefined`, because an absent amount is an ordinary declaration and this is not. */
const UNREADABLE = Symbol("unreadable book amount");

/**
 * **A property read that cannot take the parser with it.**
 *
 * Reading a property runs code once the property is an accessor, and a book assembled as a
 * JavaScript value — which `SAMPLE_PRICE_BOOK` is, and which a model-object-backed dashboard would
 * be — may present a computed amount. A getter that raises would otherwise leave through the one
 * function whose header promises it refuses rather than throws, and `use-priced-design.ts` parses at
 * module scope, so that is the module failing to load rather than a price degrading.
 *
 * The same read downstream is already guarded: `checkedBookAmount` and `evaluateFormula` convert
 * whatever a book's own code raises into a coded refusal. This is that discipline at the ingress.
 *
 * **What raised is named rather than rendered.** The value belongs to the book's own code, and
 * rendering it is one more place this boundary could be made to raise.
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

/** `for…in` reaches what a property read reaches — own **and inherited** enumerable keys — which is
 *  the whole point of using it here. It runs a proxy's own traps to do so, so the enumeration is
 *  guarded exactly as each read below it is. */
function enumerableFieldsOf(
  declared: Record<string, unknown>,
): readonly string[] | undefined {
  try {
    const fields: string[] = [];
    for (const field in declared) fields.push(field);
    return fields;
  } catch {
    return undefined;
  }
}

/**
 * What the book's rules say about each other, once every one of them is known to be readable.
 *
 * **Three sweeps and not one.** A repeated *rule* id makes a line untraceable to the rule that
 * produced it. A repeated *tier* id makes `selectTier`'s `Array.find` resolve on the book's
 * declaration order, so which of two tiers a customer is billed at depends on which was typed first
 * (M6-AUD-003). A row priced twice is a book that does not say what the cabinet costs at all.
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

/** **Across both groups, not within each.** `measureEveryDelta` used to flatten the two groups'
 *  measured deltas into one map keyed on the bare tier id, so a hardware id colliding with a material
 *  one overwrote the material amount and displayed an 18 000 MDL upgrade as 6 197,60. That surface
 *  now keys by group as well, and this refuses the book that would have needed it to. */
function refuseRepeatedTierId(book: PriceBook): PricingFailure | undefined {
  const declared = [...book.hardware.tiers, ...book.material.tiers];
  const repeated = firstDuplicate(declared.map((tier) => tier.tierId));
  if (repeated === undefined) return undefined;
  return invalidBook(`Tier id "${repeated}" is declared more than once`, {
    id: repeated,
  });
}

/** **A second rule for one catalogue row is not a redundancy — it is a book that does not say what
 *  the cabinet costs.** The two rules carry distinct ids, so the sweep above passes it, and
 *  `indexRulesByBuildId`'s `Map` keeps whichever came last with nothing anywhere saying so.
 *
 *  The population it bites is ADR 0062's manufacturer dashboard, whose whole purpose is editing
 *  prices: "price this cabinet differently" is a plausible edit for a non-developer to make by
 *  *adding* a rule rather than changing one. Since ADR 0068 the two rules can also differ in
 *  **shape**, so the discarded one is likelier to be the intended one. */
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

/** An id a rule, a tier or a book is known by: a non-empty string no longer than the identifier
 *  every other document bound in this domain is held to. An unbounded one is a free multiplier on
 *  every refusal message and every log line it reaches. */
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

function isBoundedList(
  declared: unknown,
  maxLength: number,
): declared is readonly unknown[] {
  return Array.isArray(declared) && declared.length <= maxLength;
}

/** The one place a parse failure is built, so its `detail` is bounded and scrubbed unconditionally
 *  rather than at each call site — `failWith`'s discipline in `price-design.ts`, for the same
 *  reason: every string here comes from a book ADR 0062 seam 1 puts outside TypeScript. */
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

/** What a declared value was, for a message. A list is summarised rather than rendered: a book that
 *  declares a thousand tiers must not turn its own refusal into a thousand-tier string. */
function describeDeclared(declared: unknown): string {
  if (declared === undefined) return "nothing";
  if (Array.isArray(declared)) return `a list of ${String(declared.length)}`;
  return renderedOr(renderedAsJson(declared), typeof declared);
}

/**
 * **`JSON.stringify` is the wrong shape for this boundary twice over, and the describer is inside
 * the refusal path** — so either failure loses the refusal the whole module exists to answer with.
 *
 * It *answers* `undefined` rather than a string for a function or a symbol, and its type does not
 * say so. And it *raises* for a BigInt, for a circular member, and for a `toJSON` or an accessory
 * getter of the book's own that raises. Every one of those is a value a book assembled as a
 * JavaScript object can carry — which `SAMPLE_PRICE_BOOK` is — and `use-priced-design.ts` parses at
 * module scope, so a raise here is the module failing to load rather than a price degrading.
 *
 * Falling back to `typeof` says less than the value would, and it is the most a describer at this
 * boundary can promise.
 */
function renderedAsJson(declared: unknown): string | undefined {
  try {
    return JSON.stringify(declared);
  } catch {
    return undefined;
  }
}

/** The widening is done by a parameter rather than by a local annotation, for the reason
 *  `accessoryRuleOf` gives: a `const` is narrowed back to its initialiser's type and a parameter is
 *  not. */
function renderedOr(rendered: string | undefined, fallback: string): string {
  return rendered ?? fallback;
}

/** An id as a message renders it, whatever the book declared it as. */
function asText(declared: unknown): string {
  return typeof declared === "string" ? declared : describeDeclared(declared);
}
