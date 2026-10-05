// The shape of a price book: what a price is made of, with none of the numbers. Every amount here is
// a field; the only file in this package holding figures is `sample-price-book.ts` (ADR 0001 decision 4).
//
// Shapes are code, coefficients are data (ADR 0062 seam 1): this module names the arithmetic once per
// shape and a rule supplies the numbers, so changing a price is never a deploy. A book carrying a
// shape this build does not know is refused, not evaluated.
//
// The shapes are enumerated rather than one shape with optional zero coefficients: a zero reads the
// same whether a body's height is fixed or free and costs nothing, and a shape is a statement about
// the product (hence `pricedFlat`). A fifth axis, not a fourth combination, is the cue to revisit.
//
// Nothing here keys on a width and nothing under `pricing/` names the catalogue's width-step
// constant (`pricing-seams.test.ts` reads the source for it): a body built at 575 is priced at 575.

/** The currency of every book. Minor units throughout (bani): only presentation may round. */
export const PRICE_BOOK_CURRENCY = "MDL" as const;
export type PriceBookCurrency = typeof PRICE_BOOK_CURRENCY;

/** Every footing a book may be supplied on. A runtime list because the book seam is not TypeScript
 *  (ADR 0062 seam 1) and the query must test a declared value against it. */
export const PRICE_BOOK_STATUSES = ["estimate", "commercial"] as const;

/** Whether a priced result may be presented as a commercial offer. Not the same question as
 *  `amountsProvisional`. */
export type PriceBookStatus = (typeof PRICE_BOOK_STATUSES)[number];

/** The two coefficients every shape is built on. Per millimetre, not per metre, so the arithmetic
 *  never divides and the query never rounds. */
export interface WidthCoefficients {
  /** What the body costs before any dimension is added — the carcass, the fittings, the labour. */
  readonly baseMinor: number;
  /** What each millimetre of width adds. `0` is a real answer: see `pricedFlat`. */
  readonly perWidthMillimetreMinor: number;
}

/**
 * The base shape: `amountMinor = baseMinor + perWidthMillimetreMinor × widthMm`, exactly, in integer
 * minor units. `shape` is the discriminant that lets an unknown shape be refused
 * (`UNKNOWN_FORMULA_SHAPE`) rather than mis-evaluated.
 */
export interface LinearWidthPriceFormula extends WidthCoefficients {
  readonly shape: "linear-in-width";
}

/**
 * What another door costs: its handle, its mechanisms and the processing margin (ADR 0068 decision 1).
 *
 * `doorLeafCount` is derived by the query from the body (`widthDerivedDoorLeafCount` in
 * `cabinet-handles.ts`), never stated by a book, so a banded cabinet steps once per band.
 */
interface DoorLeafCoefficient {
  /** What one width-derived door leaf adds: its handle, its mechanisms, its processing margin. */
  readonly perDoorLeafMinor: number;
}

/**
 * What the height a body was built to costs (ADR 0068 decision 2). Additive beside width, not a
 * product: an area model `k × w × h` is not a sum of a width term and a height term.
 */
interface HeightCoefficient {
  /** What each millimetre of built height adds. */
  readonly perHeightMillimetreMinor: number;
}

/** A hinged row whose height is fixed at build: the base cabinet and the pantry column. */
export interface DoorLeafSteppedPriceFormula
  extends WidthCoefficients,
    DoorLeafCoefficient {
  readonly shape: "linear-in-width-and-door-leaves";
}

/** A row built to its opening with no door whose count follows width: the lift and the shelf. */
export interface WidthAndHeightPriceFormula
  extends WidthCoefficients,
    HeightCoefficient {
  readonly shape: "linear-in-width-and-height";
}

/** Both at once: `wall-cabinet` is `heightFlex` and `doorCountFollowsWidth`, so a rule expressing
 *  only one of the two would misprice it (ADR 0068). */
export interface WidthHeightAndDoorLeafPriceFormula
  extends WidthCoefficients,
    HeightCoefficient,
    DoorLeafCoefficient {
  readonly shape: "linear-in-width-height-and-door-leaves";
}

export type PriceFormula =
  | LinearWidthPriceFormula
  | DoorLeafSteppedPriceFormula
  | WidthAndHeightPriceFormula
  | WidthHeightAndDoorLeafPriceFormula;

/** A body whose price follows its width. */
export function pricedByWidth(coefficients: WidthCoefficients): PriceFormula {
  return { shape: "linear-in-width", ...coefficients };
}

/** A body whose price follows its width and steps at every door its width adds. */
export function pricedByWidthAndDoorLeaves(
  coefficients: WidthCoefficients & DoorLeafCoefficient,
): PriceFormula {
  return { shape: "linear-in-width-and-door-leaves", ...coefficients };
}

/** A body whose price follows its width and the height it was built to. */
export function pricedByWidthAndHeight(
  coefficients: WidthCoefficients & HeightCoefficient,
): PriceFormula {
  return { shape: "linear-in-width-and-height", ...coefficients };
}

/** A body built to its opening whose door count also follows its width. */
export function pricedByWidthHeightAndDoorLeaves(
  coefficients: WidthCoefficients & HeightCoefficient & DoorLeafCoefficient,
): PriceFormula {
  return { shape: "linear-in-width-height-and-door-leaves", ...coefficients };
}

/** A body that costs the same at every width — an appliance, a hood, a niche. Named so a rule reads
 *  as a statement about the product rather than an arithmetic no-op. */
export function pricedFlat(amountMinor: number): PriceFormula {
  return pricedByWidth({
    baseMinor: amountMinor,
    perWidthMillimetreMinor: 0,
  });
}

/** Who puts this row in the finished kitchen. A book states it; nothing infers it.
 *
 *  `customer` is a row the configurator draws but the manufacturer does not sell (free-standing
 *  fridge, extractor hood). Never inferred from `amountMinor === 0`: a genuinely free
 *  `manufacturer` row (the melamine tier) is also zero and the two must not print the same sentence. */
export const CABINET_SUPPLIERS = ["manufacturer", "customer"] as const;

export type CabinetSupplier = (typeof CABINET_SUPPLIERS)[number];

/** What a rule that says nothing means: the manufacturer builds it. */
export const DEFAULT_CABINET_SUPPLIER: CabinetSupplier = "manufacturer";

/**
 * What one catalogue row costs, keyed on `buildId`. A placement reaches its rule through
 * `resolveCatalogEquivalent` (ADR 0022, ADR 0029), because a rule belongs to the catalogue row a
 * body is named after.
 */
export interface CabinetPriceRule {
  /** Unique across the whole book, and what a price line traces back to. */
  readonly ruleId: string;
  /** The catalogue entry this rule prices: a §7 row, or a seeded row with no §7 equivalent — the six
   *  corner bodies, which are structural (ADR 0021). */
  readonly buildId: string;
  readonly formula: PriceFormula;
  /** Absent means `DEFAULT_CABINET_SUPPLIER`. A `customer` row must price to nothing:
   *  `parsePriceBook` refuses a book that charges for what it does not supply. */
  readonly suppliedBy?: CabinetSupplier | undefined;
}

/** A row the configurator draws and the manufacturer does not sell. Free and not-ours are written by
 *  one call so a book cannot state one without the other. */
export function drawnButNotSupplied(): Pick<
  CabinetPriceRule,
  "formula" | "suppliedBy"
> {
  return { formula: pricedFlat(0), suppliedBy: "customer" };
}

/**
 * What every tier states about itself. Name and description are book data rendered, never copy in a
 * component that happens to agree with a number (ADR 0062's third prohibition).
 */
export interface TierIdentity {
  /** What a selection names. Stable, and not the rule id: one is a choice, the other is a price. */
  readonly tierId: string;
  /** Unique across the whole book, like a cabinet rule's. */
  readonly ruleId: string;
  readonly name: string;
  readonly description: string;
  /** The catalogue leaf the rendered text is written in; where absent the authored text renders as
   *  typed (ADR 0106 decisions 1, 2). Nothing here enforces that proper nouns (*Hettich*, *Blum*)
   *  stay unkeyed: `apps/web/tests/i18n/price-book-text.test.ts` does. */
  readonly nameKey?: string | undefined;
  readonly descriptionKey?: string | undefined;
}

/** A hardware tier, priced per mechanism (ADR 0070 decision 1). A `handle: "push"` body carries
 *  mechanisms and no handle, so a per-handle basis would bill a push-to-open kitchen at zero.
 *  The three rates are independent: a tier can be dearest on hinges and cheapest on drawers.
 *  `countHardwareMechanisms` (`hardware-mechanisms.ts`) supplies the quantities. */
export interface HardwareTier extends TierIdentity {
  /** Charged per hinge — 2 on a door leaf, 3 on one taller than 900 mm. */
  readonly perHingeMinor: number;
  /** Charged per drawer, not per runner: one drawer's price buys the pair (ADR 0092 decision 2). */
  readonly perDrawerMinor: number;
  /** Charged per push-to-open latch, one per opening front on a body whose fronts open without a
   *  bar — `isPushToOpen`, not the recorded mode alone, because a body can be latched with no handle
   *  recorded (ADR 0092 Amendment C). */
  readonly perPushToOpenMinor: number;
}

/** A material tier, priced once for the whole kitchen. */
export interface MaterialTier extends TierIdentity {
  readonly wholeKitchenMinor: number;
}

/**
 * One extra a design earns rather than chooses (ADR 0070 decision 4): the aluminium sink cover and
 * the dish drying rack. No tier and no default; the amount is the same at every hardware and
 * material tier. Its words are book data, like a tier's.
 */
export interface AccessoryRule {
  /** Unique across the whole book, like a cabinet rule's and a tier's. */
  readonly ruleId: string;
  readonly name: string;
  readonly description: string;
  /** The catalogue leaf this accessory's name is written in (ADR 0106 decision 1). */
  readonly nameKey?: string | undefined;
  readonly descriptionKey?: string | undefined;
  /** Charged per unit — per sink for both accessories. The quantity is a fact about the design and
   *  is never stated here. */
  readonly perUnitMinor: number;
}

/**
 * The accessories a book declares: named fields, not a list keyed by id. When an accessory applies
 * is code, and an array would let a book declare one nothing implements (ADR 0062 seam 1).
 */
export interface BookAccessories {
  /** Mounted on the sink base against humidity and leaks. Always present and never toggled
   *  (ADR 0070 decision 4). */
  readonly sinkProtectiveCover: AccessoryRule;
  /** Hung in the wall cabinet above the sink. Priced and never drawn: no builder has a part for it
   *  (ADR 0070 decision 4). */
  readonly dishDryingRack: AccessoryRule;
}

/** Which accessory a line is for, as the book's own field names spell it. */
export type AccessoryId = keyof BookAccessories;

/** Both accessory ids, in the order their lines are published. */
export const ACCESSORY_IDS: readonly AccessoryId[] = [
  "sinkProtectiveCover",
  "dishDryingRack",
];

/** One whole-kitchen choice: the tiers on offer and the one a design that has chosen nothing is
 *  priced at. */
export interface TierGroup<TTier extends TierIdentity> {
  readonly defaultTierId: string;
  readonly tiers: readonly TTier[];
}

/**
 * An immutable, versioned price book. The query takes one as a parameter and imports none
 * (ADR 0062 seam 1).
 */
export interface PriceBook {
  /** Matched for equality against the version the caller asked to price at: no "current version"
   *  fallback and no migration inside pricing (`CONFIGURATION_MODEL.md`). */
  readonly version: string;
  readonly currency: PriceBookCurrency;
  readonly status: PriceBookStatus;
  /** The amounts are placeholders, not measured prices. Distinct from `status`: a real book still
   *  shown *De la* is `estimate` and not provisional. */
  readonly amountsProvisional: boolean;
  readonly cabinetRules: readonly CabinetPriceRule[];
  readonly hardware: TierGroup<HardwareTier>;
  readonly material: TierGroup<MaterialTier>;
  readonly accessories: BookAccessories;
}

/** Everything a formula may read about one body, and nothing else. Every field is derived by the
 *  query from the projection and the catalogue; none is stated by a book. */
export interface PricedBody {
  readonly widthMm: number;
  /** The height this body was built to, which for a body built to its opening is not its catalogue
   *  row's nominal height. */
  readonly heightMm: number;
  /** The leaves this body's width decides — `widthDerivedDoorLeafCount`, per cabinet and not per
   *  band. Zero for a row whose front population is fixed. */
  readonly doorLeafCount: number;
}

/** What one body costs, in minor units.
 *
 *  `undefined` for a formula whose shape this build does not know. Never `NaN`, never partial.
 *  Throws `MalformedPriceCoefficientError` for a known shape with a coefficient that is not an exact
 *  count of minor units, and `InexactPriceArithmeticError` where a product or running sum is inexact.
 *
 *  The parameter is typed wider than a rule declares: the book comes from outside TypeScript
 *  (ADR 0062 seam 1), so a formula can arrive carrying a shape nothing here implements. */
export function amountForBody(
  formula: PriceFormula | undefined,
  body: PricedBody,
): number | undefined {
  const terms = termsOfFormula(formula, body);
  return terms === undefined ? undefined : exactAmountOfTerms(terms);
}

/** Which terms one shape is made of, or `undefined` for a shape without an arm. A missing arm is not
 *  a type error here because the default returns; `pricing-seams.test.ts` catches it by evaluating a
 *  formula from every exported constructor. */
function termsOfFormula(
  formula: PriceFormula | undefined,
  body: PricedBody,
): readonly PricedTerm[] | undefined {
  switch (formula?.shape) {
    case "linear-in-width":
      return widthTerms(formula, body);
    case "linear-in-width-and-door-leaves":
      return [...widthTerms(formula, body), doorLeafTerm(formula, body)];
    case "linear-in-width-and-height":
      return [...widthTerms(formula, body), heightTerm(formula, body)];
    case "linear-in-width-height-and-door-leaves":
      return [
        ...widthTerms(formula, body),
        heightTerm(formula, body),
        doorLeafTerm(formula, body),
      ];
    default:
      return undefined;
  }
}

/** The base and the width term every shape shares. Terms rather than their sum: the sum is taken
 *  once, over all of a shape's terms, by the checked arithmetic below. */
function widthTerms(
  coefficients: WidthCoefficients,
  body: PricedBody,
): readonly PricedTerm[] {
  return [
    {
      coefficientMinor: usableCoefficientOf(
        coefficients.baseMinor,
        "baseMinor",
      ),
      count: CHARGED_ONCE,
      field: "baseMinor",
    },
    {
      coefficientMinor: usableCoefficientOf(
        coefficients.perWidthMillimetreMinor,
        "perWidthMillimetreMinor",
      ),
      count: body.widthMm,
      field: "perWidthMillimetreMinor",
    },
  ];
}

/** The base is a term with a count of one, so every value entering the sum goes through the same
 *  checked multiplication. */
const CHARGED_ONCE = 1;

function heightTerm(
  coefficients: HeightCoefficient,
  body: PricedBody,
): PricedTerm {
  return {
    coefficientMinor: usableCoefficientOf(
      coefficients.perHeightMillimetreMinor,
      "perHeightMillimetreMinor",
    ),
    count: body.heightMm,
    field: "perHeightMillimetreMinor",
  };
}

function doorLeafTerm(
  coefficients: DoorLeafCoefficient,
  body: PricedBody,
): PricedTerm {
  return {
    coefficientMinor: usableCoefficientOf(
      coefficients.perDoorLeafMinor,
      "perDoorLeafMinor",
    ),
    count: body.doorLeafCount,
    field: "perDoorLeafMinor",
  };
}

/** One rate the book states, against the quantity it is charged over. Cabinet coefficients and
 *  hardware rates share this shape so there is one arithmetic. */
export interface PricedTerm {
  readonly coefficientMinor: number;
  readonly count: number;
  /** Carried so a refusal names which of a rule's amounts the arithmetic could not be done on. */
  readonly field: PriceCoefficientField;
}

/**
 * Every term of one amount, multiplied and added with each step checked: `Number.isSafeInteger` on
 * each product and each running sum. Throws, like `usableCoefficientOf`; `price-design.ts` converts
 * it to a coded refusal.
 *
 * Exported so there is one such arithmetic: the hardware line's rate × count products go through it
 * too, because a plain `+` there let two out-of-range products cancel into an exact wrong figure.
 *
 * The order of terms decides whether there is a refusal at all, never which figure: `+5e15, -5e15,
 * +5e15` answers `5000000000000000`, while `+5e15, +5e15, -5e15` is refused because the running
 * total reaches `1e16`. Every prefix of an accepted sum is safe, so an accepted total is the true
 * integer total.
 *
 * A cabinet formula is order-invariant: for a book `parsePriceBook` accepted, no prefix of a shape's
 * four terms exceeds `4 × MAX_PRICE_COEFFICIENT_MINOR × MAX_DESIGN_DIMENSION_MM` (9 007 199 254 720 000),
 * just under `2^53 − 1`. The hardware line is not proved: its count is a design's whole mechanism
 * count and nothing caps the mechanisms one body carries. A prefix leaves the safe range only past
 * 13 333 mechanisms; at `MAX_PLACEMENTS` (279) and an assumed twelve a body the ceiling is 3 348,
 * about 3.98× under. Closing it means a domain constant for that cap.
 *
 * `qa-m6-wave-b-regate.adversarial.test.ts` pins the order divergence as a recorded fact.
 */
export function exactAmountOfTerms(terms: readonly PricedTerm[]): number {
  return terms.reduce(
    (runningMinor, term) => exactSum(runningMinor, exactProduct(term)),
    NOTHING_YET_MINOR,
  );
}

/** A sum with no term in it yet: a starting amount, not a price. */
const NOTHING_YET_MINOR = 0;

function exactProduct(term: PricedTerm): number {
  const product = term.coefficientMinor * term.count;
  if (Number.isSafeInteger(product)) return product;
  throw new InexactPriceArithmeticError({
    describedAs: `"${term.field}" × ${String(term.count)}`,
    reached: product,
  });
}

function exactSum(runningMinor: number, termMinor: number): number {
  const total = runningMinor + termMinor;
  if (Number.isSafeInteger(total)) return total;
  throw new InexactPriceArithmeticError({
    describedAs: "a sum of priced terms",
    reached: total,
  });
}

/**
 * A term the machine cannot form exactly, refused instead of returned.
 *
 * Checking only the final amount is not enough: coefficients that cancel in integer arithmetic can
 * lose a small base in floating point and end at an exact, non-negative `0` that every downstream
 * guard accepts. `MAX_PRICE_COEFFICIENT_MINOR` keeps every legal book far from this ceiling; this
 * check keeps a loosened bound from publishing a wrong figure, and is the only layer that reaches a
 * hardware rate charged over a whole design's mechanisms.
 */
export class InexactPriceArithmeticError extends Error {
  constructor(operation: {
    readonly describedAs: string;
    readonly reached: number;
  }) {
    super(
      `Pricing ${operation.describedAs} reached ${String(operation.reached)}, which JavaScript ` +
        `cannot hold as an exact count of minor units.`,
    );
    this.name = "InexactPriceArithmeticError";
  }
}

/** Every amount a price is computed from — each shape's coefficients and the tier amounts — and so
 *  the only fields a malformed-amount refusal can name. A literal union so a typo is a compile error.
 *
 *  The three hardware rates are separate fields so a refusal names the unusable one. */
export type PriceCoefficientField =
  | "baseMinor"
  | "perWidthMillimetreMinor"
  | "perHeightMillimetreMinor"
  | "perDoorLeafMinor"
  | "perHingeMinor"
  | "perDrawerMinor"
  | "perPushToOpenMinor"
  | "perUnitMinor"
  | "wholeKitchenMinor";

/**
 * A formula that declares a coefficient the arithmetic cannot be performed on: an error in the book,
 * thrown rather than answered because there is no number to guess at.
 *
 * `null`, `false`, `[]` and `""` are the quiet cases: JavaScript multiplies each by a millimetre
 * count and answers an exact `0`, so the term would vanish and the row price as though it did not
 * apply (ADR 0062 seam 1: a book is data assembled outside TypeScript).
 *
 * The sign is not this error's question: a negative amount is exact arithmetic and is refused where
 * the line is published.
 */
export class MalformedPriceCoefficientError extends Error {
  constructor(refusal: {
    readonly field: PriceCoefficientField;
    readonly declared: unknown;
  }) {
    super(
      `The price book declares no usable "${refusal.field}" — a whole, exact count of minor units. ` +
        `Found: ${describeDeclared(refusal.declared)}.`,
    );
    this.name = "MalformedPriceCoefficientError";
  }
}

function describeDeclared(declared: unknown): string {
  return declared === undefined ? "nothing" : JSON.stringify(declared);
}

/** The number an amount is declared as, held to being an exact count of minor units: a number,
 *  whole, and safe. `0` passes. Exported so the whole-kitchen tier amounts use this guard and not a
 *  second one that could drift.
 *
 *  Typed `unknown` although every interface declares `number`: the declaration is what the book seam
 *  cannot guarantee. */
export function usableCoefficientOf(
  declared: unknown,
  field: PriceCoefficientField,
): number {
  if (typeof declared === "number" && Number.isSafeInteger(declared)) {
    return declared;
  }
  throw new MalformedPriceCoefficientError({ field, declared });
}

/** Every rule id in a book: cabinet rules, then tiers, then accessories. `parse-price-book.ts` sweeps
 *  it for duplicates, since a repeated id makes a line untraceable to one rule.
 *
 *  The three lists are dereferenced bare, which is safe only because the parser's section checks
 *  establish they are lists before it calls this. */
export function listRuleIds(book: PriceBook): readonly string[] {
  return [
    ...book.cabinetRules.map((rule) => rule.ruleId),
    ...book.hardware.tiers.map((tier) => tier.ruleId),
    ...book.material.tiers.map((tier) => tier.ruleId),
    ...listAccessoryRuleIds(book),
  ];
}

/** The ids of whatever accessory rules a book actually holds. Tolerates an absent section so a
 *  duplicate sweep never refuses a book for the wrong reason. */
function listAccessoryRuleIds(book: PriceBook): readonly string[] {
  return ACCESSORY_IDS.flatMap((accessoryId) => {
    const ruleId = accessoryRuleOf(book, accessoryId)?.ruleId;
    return ruleId === undefined ? [] : [ruleId];
  });
}

/** The one reader of a book's accessory section. Reads it as possibly absent although `PriceBook`
 *  declares it required (ADR 0062 seam 1); the widening is a parameter because a `const` is
 *  narrowed back to its initialiser's type. */
export function accessoryRuleOf(
  book: PriceBook,
  accessoryId: AccessoryId,
): AccessoryRule | undefined {
  return ruleIn(book.accessories, accessoryId);
}

function ruleIn(
  declared: Partial<BookAccessories> | undefined,
  accessoryId: AccessoryId,
): AccessoryRule | undefined {
  return declared?.[accessoryId];
}
