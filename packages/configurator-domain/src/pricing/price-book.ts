// The shape of a price book: **what a price is made of, with none of the numbers.**
//
// Every amount in this module is a field, never a literal. The one file in this package that holds
// figures is `sample-price-book.ts`, whose name says what they are worth (ADR 0001 decision 4).
//
// **Shapes are code; coefficients are data** (ADR 0062 seam 1). ADR 0035 decision 8 requires price
// to be a *formula over width* rather than a table keyed on the width ladder, and
// `CONFIGURATION_MODEL.md`'s pricing boundary requires the book to hold *"data, not code or formula
// callbacks"*. Both hold at once only this way: this module names the arithmetic, once per shape,
// and a rule supplies the numbers it is made of. A hand-authored price function per cabinet would
// satisfy neither — it would make changing any price a deploy, which is the manufacturer dashboard's whole
// purpose defeated at the seam, and it is the one choice wave 6B makes whether or not anybody
// notices they are making it.
//
// **Four shapes since 2026-09-03 (ADR 0068), and the growth is the mechanism working rather than a
// hole in it.** Wave 6B shipped one shape and recorded the two things that would break it: a body
// whose price steps when its width gives it another door, and a body built to its opening, whose two
// instances differ in height. The owner ruled both real, so the terms are named once each and the
// shapes are the combinations the catalogue actually exhibits — `wall-cabinet` has both, the two
// hinged non-wall rows have only the step, the shelf and the lift have only the height. Twenty-one
// rows still resolve no per-row code, and a book carrying a shape this build has never heard of is
// still refused rather than evaluated.
//
// **The combinations are enumerated rather than made optional, deliberately.** A single shape with
// four coefficients, two of them zero on most rows, would price every row correctly and would stop
// saying anything: `perHeightMillimetreMinor: 0` reads the same whether a body's height is fixed or
// its height is free and costs nothing. A shape is a statement about the product, which is why
// `pricedFlat` exists rather than a bare zero coefficient. A **fifth axis** would be the moment to
// revisit this; a fourth combination is not.
//
// Nothing here keys on a width, and nothing under `pricing/` names the catalogue's width-step
// constant at all — `pricing-seams.test.ts` reads the source tree for it, so the comment cannot
// drift from the code. The 50 mm step is what the *panel* offers (ADR 0035); a body can be built at
// 575 and must therefore be priced at 575.

/** The literal currency of every book. Minor units throughout — bani — because an amount that is
 *  not a whole count of the smallest unit is an amount that has already been rounded, and
 *  presentation is the only layer allowed to round (§9's *De la*, rounded up to the thousand). */
export const PRICE_BOOK_CURRENCY = "MDL" as const;
export type PriceBookCurrency = typeof PRICE_BOOK_CURRENCY;

/** Every footing a book may be supplied on. A runtime list rather than a bare union, because the
 *  seam that supplies a book is not TypeScript (ADR 0062 seam 1) and the query has to be able to
 *  ask whether a declared value is one of these. The type is derived from the list, so the two
 *  cannot fork. */
export const PRICE_BOOK_STATUSES = ["estimate", "commercial"] as const;

/** Whether a priced result may be presented as a commercial offer.
 *
 *  `estimate` throughout M6 and every book this repository ships. It is a field rather than a
 *  constant because who supplies a book, and on what footing, is not a property of its shape
 *  (ADR 0062) — and it is deliberately **not** the same question as `amountsProvisional` below. */
export type PriceBookStatus = (typeof PRICE_BOOK_STATUSES)[number];

/** The two coefficients **every** shape is built on: what the body costs before any dimension is
 *  added, and what a millimetre of width adds to it.
 *
 *  Both are stated **per millimetre** rather than per metre so the arithmetic never divides: a
 *  per-metre coefficient would need a rounding rule inside the query, and the query is the one
 *  place this wave forbids rounding. */
export interface WidthCoefficients {
  /** What the body costs before any dimension is added — the carcass, the fittings, the labour. */
  readonly baseMinor: number;
  /** What each millimetre of width adds. `0` is a real answer: see `pricedFlat`. */
  readonly perWidthMillimetreMinor: number;
}

/**
 * **The base shape**, and the only arithmetic most rows need.
 *
 * `amountMinor = baseMinor + perWidthMillimetreMinor × widthMm`, exactly, in integer minor units.
 *
 * `shape` is a discriminant, and that is what lets a book carry a shape this build does not know and
 * be **refused** (`UNKNOWN_FORMULA_SHAPE`) rather than mis-evaluated. The union has grown from one
 * member to three and the refusal is unchanged in kind: a shape is known or it is not evaluated.
 */
export interface LinearWidthPriceFormula extends WidthCoefficients {
  readonly shape: "linear-in-width";
}

/**
 * **What another door costs** (ADR 0068 decision 1, owner 2026-09-03): its handle, its mechanisms —
 * hinges and slides — and the processing margin that is neither of those.
 *
 * The step lands exactly where `deriveDoorCount`'s threshold does and not smoothly, because that is
 * where all three arrive at once. Front material is roughly unchanged across it, which is why the
 * width term stays beside the step rather than steepening into it.
 *
 * `doorLeafCount` is the count **the query derives from the body**, never a number a book states —
 * `widthDerivedDoorLeafCount` in `cabinet-handles.ts`, the same composition the handle line is
 * billed from. So a banded cabinet steps once per band: `tall-pantry` gains two leaves at the
 * threshold and therefore two steps, while `wall-cabinet` gains one.
 */
interface DoorLeafCoefficient {
  /** What one width-derived door leaf adds: its handle, its mechanisms, its processing margin. */
  readonly perDoorLeafMinor: number;
}

/**
 * **What the height a body was built to costs** (ADR 0068 decision 2, owner 2026-09-03).
 *
 * A `heightFlex` row builds to the opening it is dropped into, so two instances of it stand at two
 * heights and priced identically until this term existed.
 *
 * **Height is an input beside width, not a replacement for it.** The owner did not rule price by
 * front area, and this is additive rather than a product on purpose: an area model is `k × w × h`,
 * a term no sum of a width term and a height term expresses, and it would need a shape of its own
 * rather than a coefficient (ADR 0068, *the third prediction*).
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

/** Both at once, which is not a hypothetical: `wall-cabinet` is `heightFlex` **and**
 *  `doorCountFollowsWidth`, so a rule expressing only one of the two would be silently wrong on the
 *  most-inserted row in the catalogue (ADR 0068's population correction). */
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

/** A body that costs the same at every width it is built to — an appliance, a hood, a niche.
 *
 *  Named rather than written as a bare `pricedByWidth({ perWidthMillimetreMinor: 0 })`, so a rule
 *  reads as a statement about the product instead of as an arithmetic no-op. Same discipline as
 *  `NO_CABINET_HANDLES` and `NO_FRONT_ASSEMBLY_MM`, and the same reason: a zero somebody has to
 *  interpret is a zero somebody will eventually interpret wrongly. */
export function pricedFlat(amountMinor: number): PriceFormula {
  return pricedByWidth({
    baseMinor: amountMinor,
    perWidthMillimetreMinor: 0,
  });
}

/** **Who puts this row in the finished kitchen.** A book states it; nothing infers it.
 *
 *  `customer` is a row the configurator **draws but the manufacturer does not sell** — the owner's
 *  ruling of 2026-09-10 about the free-standing fridge and the extractor hood: *"it's drawn, it's
 *  displayed, but it's not included in the price, and it's not provided by the manufacturer."*
 *
 *  **Never inferred from an amount, and that is the whole point of the field.** A `customer` row
 *  necessarily costs nothing, but so does a genuinely free `manufacturer` row — the melamine
 *  material tier is zero and *is* included — and the two must not print the same sentence. Reading
 *  `amountMinor === 0` conflates them, which is exactly the defect this replaces. */
export const CABINET_SUPPLIERS = ["manufacturer", "customer"] as const;

export type CabinetSupplier = (typeof CABINET_SUPPLIERS)[number];

/** What a rule that says nothing means. Absence is *the manufacturer builds it*, so a new row —
 *  including a new zero-priced one — is cabinetry until somebody writes down that it is not. */
export const DEFAULT_CABINET_SUPPLIER: CabinetSupplier = "manufacturer";

/**
 * What one catalogue row costs.
 *
 * Keyed on `buildId` and on nothing else. A placement reaches its rule through
 * `resolveCatalogEquivalent` (ADR 0022, ADR 0029), because a price rule belongs to the catalogue row
 * a body is *named after* — every seeded body would otherwise resolve nothing and the whole design
 * would fail.
 */
export interface CabinetPriceRule {
  /** Unique across the whole book, and what a price line traces back to. */
  readonly ruleId: string;
  /** The catalogue entry this rule prices: a §7 row, or a seeded row that has no §7 equivalent —
   *  the four corner bodies, which ADR 0021 makes structural and which nothing in §7 builds. */
  readonly buildId: string;
  readonly formula: PriceFormula;
  /** Optional, and absent means `DEFAULT_CABINET_SUPPLIER`: the overwhelming majority of rows are
   *  joinery and should not have to say so. A row that declares `customer` must price to nothing —
   *  `parsePriceBook` refuses a book that charges for something it does not supply, so the claim on
   *  the screen and the arithmetic under the total cannot disagree. */
  readonly suppliedBy?: CabinetSupplier | undefined;
}

/** A row the configurator draws and the manufacturer does not sell. The two facts — *free* and
 *  *not ours* — are written by one call so a book cannot state one without the other, which is the
 *  authoring half of the guarantee `parsePriceBook` enforces for books assembled elsewhere. */
export function drawnButNotSupplied(): Pick<
  CabinetPriceRule,
  "formula" | "suppliedBy"
> {
  return { formula: pricedFlat(0), suppliedBy: "customer" };
}

/**
 * What every tier states about itself, whatever it is a tier *of*.
 *
 * The name and the one-line description live here rather than in the app's message catalogue
 * (`apps/web/src/messages/ro.json`) for ADR 0062's third prohibition: a tier is book data rendered,
 * never copy in a component that happens to agree with a number.
 *
 * **A tier may also name the catalogue leaf its rendered text is written in** — ADR 0106 decision 1. The
 * key wins where it is present and the authored text is what renders where it is not, so this
 * product's own book localises its rows while a book nobody at Lemnaria authored still renders.
 */
export interface TierIdentity {
  /** What a selection names. Stable, and not the rule id: one is a choice, the other is a price. */
  readonly tierId: string;
  /** Unique across the whole book, like a cabinet rule's. */
  readonly ruleId: string;
  readonly name: string;
  readonly description: string;
  /** Optional, and absence is an ordinary row rather than an omission (ADR 0106 decision 2): the
   *  authored `name` renders as typed.
   *
   *  **This product's own book** leaves it absent on a proper noun — *Hettich* and *Blum* are the
   *  same word in every locale — but that is a fact about the shipped rows, not a rule this
   *  interface can impose on every book it types, and nothing here enforces it. The guard is across
   *  the package boundary, where the catalogue is: `apps/web/tests/i18n/price-book-text.test.ts`
   *  names those two rows and fails if a later wave keys them. */
  readonly nameKey?: string | undefined;
  readonly descriptionKey?: string | undefined;
}

/** A hardware tier, priced **per mechanism** — ADR 0070 decision 1, which replaced the per-handle
 *  basis rather than extending it. A handle and a mechanism are different cost drivers, and a
 *  `handle: "push"` body carries mechanisms and no handle at all, so the old quantity billed a whole
 *  push-to-open kitchen at exactly zero.
 *
 *  Three rates because there are three mechanisms and they are priced independently — a tier can be
 *  the dearest on hinges and the cheapest on drawers, which is measurably true of Hettich and is the
 *  argument for pricing a whole design at each tier rather than by a flat per-tier figure.
 *
 *  `countHardwareMechanisms` (`hardware-mechanisms.ts`) answers the three quantities these are
 *  multiplied by. It lives outside `pricing/` on purpose: a mechanism count is a fact about bodies,
 *  not about money. */
export interface HardwareTier extends TierIdentity {
  /** Charged per hinge — 2 on a door leaf, 3 on one taller than 900 mm. */
  readonly perHingeMinor: number;
  /** Charged **per drawer, not per runner** (ADR 0092 decision 2). ADR 0070's prose says *"2
   *  mechanisms per drawer"* and its own totals bill 5 drawers at 640 to reach 3 200; the totals are
   *  the owner's derivation and they win. A runner *set* is what one drawer takes, and one drawer's
   *  price buys the pair — which is why this field is named for the drawer and not for the runner. */
  readonly perDrawerMinor: number;
  /** Charged per push-to-open latch, one per opening front on a body whose fronts open **without a
   *  bar** — `isPushToOpen`, not the recorded mode alone (ADR 0092 Amendment C). A body records no
   *  handle and is still latched: all 16 latches on the seeded kitchen are the top row's, where the
   *  slot hides the bars and nothing is recorded. Reading `handle: "push"` here is the defect
   *  wave 6T-a removed, and it billed those 16 at zero. */
  readonly perPushToOpenMinor: number;
}

/** A material tier, priced once for the whole kitchen — the 2E sheet's *de la +9 000* delta. */
export interface MaterialTier extends TierIdentity {
  readonly wholeKitchenMinor: number;
}

/**
 * **One extra a design earns rather than chooses** — ADR 0070 decision 4's aluminium sink cover and
 * dish drying rack, and today no others.
 *
 * Not a tier: there are no grades to pick between and no control selects it, so it carries no
 * `tierId` and no default. What it carries is what a tier carries otherwise — an id a line traces
 * to, and the name and one-line description a surface renders (ADR 0062's third prohibition: an
 * accessory's words are book data, never copy in a component that happens to agree with a number).
 *
 * **Untiered in a second sense too**: the amount is the same whichever hardware or material tier a
 * design is priced at, which is what ADR 0070's own totals table says by giving *"Sink extras 600"*
 * identically in all three tier columns.
 */
export interface AccessoryRule {
  /** Unique across the whole book, like a cabinet rule's and a tier's. */
  readonly ruleId: string;
  readonly name: string;
  readonly description: string;
  /** The catalogue leaf this accessory's name is written in, on the same terms a tier's is — ADR
   *  0106 decision 1. */
  readonly nameKey?: string | undefined;
  readonly descriptionKey?: string | undefined;
  /** Charged per unit — per sink for both of today's two. The **quantity** is a fact about the
   *  design and is never stated here. */
  readonly perUnitMinor: number;
}

/**
 * **The accessories a book declares: two named fields, not a list keyed by id.**
 *
 * Named fields because the *rule* — when an accessory applies, and how many of it — is code. An
 * array would invite a book to declare a third accessory nothing implements, and it would arrive
 * through ADR 0062 seam 1 looking like data when it is a shape. A new accessory is a new field here
 * and a new rule in the query, which is exactly where ADR 0062 draws its line.
 */
export interface BookAccessories {
  /** ADR 0070 decision 4: mounted on the sink base against humidity and leaks. **Always present and
   *  never toggled** — it is protection, not an option — so no setting, no design field and no
   *  control reaches it. */
  readonly sinkProtectiveCover: AccessoryRule;
  /** ADR 0070 decision 4: hung in the wall cabinet above the sink. **Priced and never drawn** — the
   *  geometry stays untouched, and no builder has a part for it. */
  readonly dishDryingRack: AccessoryRule;
}

/** **Which accessory a line is for**, as the book's own field names spell it. A literal union rather
 *  than `string`, for the reason `PriceCoefficientField` is one: a typo is a compile error instead of
 *  a line naming an accessory no book holds. */
export type AccessoryId = keyof BookAccessories;

/** Both accessory ids, in the order their lines are published. Derived from nothing — it is the
 *  order itself — and read by every caller that sweeps the two, so a third accessory is added in one
 *  place rather than in each sweep. */
export const ACCESSORY_IDS: readonly AccessoryId[] = [
  "sinkProtectiveCover",
  "dishDryingRack",
];

/** One whole-kitchen choice: the tiers on offer and the one a design that has chosen nothing is
 *  priced at. The default is book data, so "what an unset kitchen costs" is not a rule living in
 *  the query. */
export interface TierGroup<TTier extends TierIdentity> {
  readonly defaultTierId: string;
  readonly tiers: readonly TTier[];
}

/**
 * **An immutable, versioned price book.** The query takes one as a parameter and imports none
 * (ADR 0062 seam 1), so a book from a manufacturer dashboard is later a substitution rather than a
 * refactor.
 */
export interface PriceBook {
  /** Matched for **equality** against the version the caller asked to price at. No "current
   *  version" fallback and no migration inside pricing (`CONFIGURATION_MODEL.md`). */
  readonly version: string;
  readonly currency: PriceBookCurrency;
  readonly status: PriceBookStatus;
  /** **The amounts in this book are placeholders, not measured prices.**
   *
   *  A different question from `status`, and both are needed. `status` says whether a priced result
   *  may be shown as a commercial offer; this says whether anybody has ever costed the numbers. A
   *  real book of real amounts that is still shown *De la* is `estimate` and not provisional. */
  readonly amountsProvisional: boolean;
  readonly cabinetRules: readonly CabinetPriceRule[];
  readonly hardware: TierGroup<HardwareTier>;
  readonly material: TierGroup<MaterialTier>;
  readonly accessories: BookAccessories;
}

/** **Everything a formula may read about one body, and nothing else.**
 *
 *  A closed list on purpose: it is what stops a shape from reaching into a placement, a catalogue
 *  entry or a scene for a fact nobody has ruled is a price input. Every field is derived by the
 *  query from the projection and the catalogue — none is stated by a book. */
export interface PricedBody {
  readonly widthMm: number;
  /** The height this body was **built** to, which for a body built to its opening is not its
   *  catalogue row's nominal height. */
  readonly heightMm: number;
  /** The leaves this body's width decides — `widthDerivedDoorLeafCount`, per cabinet and not per
   *  band. Zero for a row whose front population is fixed. */
  readonly doorLeafCount: number;
}

/** What one body costs, in minor units.
 *
 *  `undefined` for a formula whose shape this build does not know, so the caller refuses rather
 *  than guessing. Never `NaN`, never a partial answer.
 *
 *  **Throws `MalformedPriceCoefficientError`** for a shape it does know carrying a coefficient that
 *  is not an exact count of minor units, and `InexactPriceArithmeticError` where the coefficients
 *  are each exact but a product or a running sum of them is not. The three are different facts about
 *  a book — a shape nothing implements, a number that is not one, and an arithmetic the machine
 *  cannot perform — and a caller that must name them apart cannot do so from a single `undefined`.
 *
 *  The parameter is typed **wider than a rule declares it**, for the reason `cabinet-handles.ts`
 *  widens its own: the whole point of ADR 0062 seam 1 is that the book comes from somewhere else,
 *  so a formula assembled outside TypeScript can arrive carrying a shape nothing here implements,
 *  and that is the case this function exists to refuse. */
export function amountForBody(
  formula: PriceFormula | undefined,
  body: PricedBody,
): number | undefined {
  const terms = termsOfFormula(formula, body);
  return terms === undefined ? undefined : exactAmountOfTerms(terms);
}

/** Which terms one shape is made of, or `undefined` for a shape this build does not implement —
 *  including a **declared** one somebody added above without an arm, which is what the fourth shape
 *  did on its way in. TypeScript does not catch that here, because a missing arm is not a type error
 *  when the default returns; what catches it is `pricing-seams.test.ts`, which builds a formula from
 *  every exported constructor and asserts each one evaluates to a number. */
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

/** The two terms every shape shares — the base and what width adds — so a shape that adds a term
 *  states only what it adds. Terms rather than their sum, because the sum is taken once, over every
 *  one of the shape's terms, by the checked arithmetic below. */
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

/** The base is charged once for the body. Written as a term with a count of one rather than as a
 *  bare addend, so every value entering the sum has been through the same checked multiplication and
 *  no addend reaches it by a second route. */
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

/** **One rate the book states, against the quantity it is charged over.** A coefficient and a
 *  millimetre of width, or a hardware rate and a count of hinges — the same shape, because they are
 *  the same arithmetic and the wave that let them be two arithmetics published a wrong figure. */
export interface PricedTerm {
  readonly coefficientMinor: number;
  readonly count: number;
  /** Carried so a refusal names which of a rule's amounts the arithmetic could not be done on. */
  readonly field: PriceCoefficientField;
}

/**
 * **Every term of one amount, multiplied and added with each step checked.**
 *
 * `Number.isSafeInteger` on the *result* is the whole test and it is exact in both directions: two
 * safe integers whose product or sum is below 2^53 are multiplied and added without error, and a
 * result at or above 2^53 is not a safe integer whatever rounding did to it. A **running** total is
 * what a cancellation hides in, so the check is per step: two terms that each overflow on their way
 * to a small answer are refused rather than published.
 *
 * **Exported so there is exactly one such arithmetic in this package.** The hardware line's three
 * rate × mechanism-count products go through this too. When they had their own plain `+` instead,
 * the M6-AUD-015 pattern reappeared one function over — `perHingeMinor` and `perDrawerMinor` past
 * the bound, two products that each leave the safe range, and a sum that lands back inside it,
 * publishing 8 where the integers give 11 and passing every downstream guard because 8 is exact and
 * non-negative. Two spellings of "add up some products" is how one of them stays unchecked.
 *
 * **Throws** rather than answering, like `usableCoefficientOf` and for the same reason: there is no
 * number to guess at. `price-design.ts` converts it to a coded refusal at the one place it already
 * converts the others.
 *
 * ---
 *
 * **The order of the terms decides whether there is a refusal at all** — not merely which step a
 * message names. Three terms of `+5e15`, `-5e15`, `+5e15` answer `5000000000000000` in that order
 * and are refused in the order `+5e15`, `+5e15`, `-5e15`, because the running total reaches `1e16`
 * before the fall brings it back. Same multiset, same mathematical total, two outcomes.
 *
 * **What that costs is never a figure.** Every prefix of an accepted sum is a safe integer, so every
 * addition on the way was exact, so an accepted total *is* the true integer total whatever ordering
 * produced it. The divergence is accept-versus-refuse and never figure-versus-figure, which is the
 * direction it has to fail in: the wave that let this arithmetic be two arithmetics published a
 * wrong number, and a refusal is the answer that is never wrong.
 *
 * **The two callers are not alike here, and the asymmetry is the honest residual of this wave.**
 *
 * - *A cabinet formula is order-invariant, and by the bound's derivation rather than by anything in
 *   this function.* For a book `parsePriceBook` accepted, every coefficient is at most
 *   `MAX_PRICE_COEFFICIENT_MINOR` and every count is a body dimension or a leaf count under
 *   `MAX_DESIGN_DIMENSION_MM`, so the largest prefix any ordering of a shape's four terms can form
 *   is `4 × 225 179 981 368 × 10 000 = 9 007 199 254 720 000`, under `2^53 − 1 = 9 007 199 254 740
 *   991`. No prefix can leave the safe range, so no ordering can refuse, so all of them agree.
 * - *The hardware line is not proved by a declared constant — which is a weaker claim than this
 *   said before, and the weaker one is the true one.* Its count is a whole design's mechanism count,
 *   and nothing in this package caps the mechanisms **one body** can carry: that is the same gap
 *   that let the wrong figure through before this function existed. What can be counted is the rest.
 *   A prefix leaves the safe range only past `(2^53 − 1) / (3 × MAX_PRICE_COEFFICIENT_MINOR)`, which
 *   is **13 333 mechanisms** and not the 20 000 this once estimated; `MAX_PLACEMENTS` is 168 bodies;
 *   and twelve mechanisms a body — generous against a tall door leaf's three hinges — puts the
 *   ceiling at 2 016, whose largest prefix is 1.36 × 10^15, **6.6× under 2^53 − 1**. The seeded
 *   kitchen carries 74 hinges, 5 drawers and 16 latches. So the residual is narrow and named: the
 *   per-body figure is assumed here rather than declared anywhere, and closing it outright means
 *   deriving that cap as a domain constant, which is its own decision and not a comment's to make.
 *
 * Accumulating in `BigInt` and range-checking once would retire the question outright. It is not
 * done here because the per-term check is what names the rate and the count in a refusal, and
 * because `qa-m6-wave-b-regate.adversarial.test.ts` pins the divergence above as a recorded fact
 * rather than as an accident — so retiring it is a decision to take with that suite, not around it.
 */
export function exactAmountOfTerms(terms: readonly PricedTerm[]): number {
  return terms.reduce(
    (runningMinor, term) => exactSum(runningMinor, exactProduct(term)),
    NOTHING_YET_MINOR,
  );
}

/** A sum with no term in it yet. Named because it is a starting amount rather than a price. */
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
 * **A term the machine cannot form exactly**, refused instead of returned.
 *
 * `Number.isSafeInteger` on the *result* is the whole test and it is exact in both directions: two
 * safe integers whose product or sum is below 2^53 are multiplied and added without error, and a
 * result at or above 2^53 is not a safe integer whatever rounding did to it.
 *
 * **The final amount cannot stand in for this, which is what M6-AUD-015 measured.** A `wall-cabinet`
 * rule with a base of 1 and two coefficients that cancel exactly in integer arithmetic prices at 1;
 * in floating point the base is lost in the addition and the cancellation yields `0`, which is a
 * perfectly exact, non-negative safe integer, so every downstream guard accepts it. What is wrong
 * with it is not the number it ended at but the arithmetic that got there.
 *
 * **Both layers, deliberately** (M6-AUD-015): `MAX_PRICE_COEFFICIENT_MINOR` keeps every legal book
 * far from this ceiling, and this keeps a loosened bound from ever publishing a wrong figure. The
 * bound is derived per *body*, and a hardware rate is charged over a whole design's mechanisms, so
 * the second layer is not decoration on that path — it is the only one that reaches.
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

/** Every amount the book states as a number a price is computed from — every coefficient any shape
 *  declares, and the two whole-kitchen tier amounts — the only things a malformed-amount refusal can
 *  name. A literal union rather than `string`, so a typo in a refusal message is a compile error
 *  instead of a message pointing at a field no rule has: the discipline `CabinetHandleCountField`
 *  keeps.
 *
 *  The tier amounts sit in the same union because they arrive through the same ADR 0062 seam 1
 *  population and fail in the same way: a hardware rate and `wholeKitchenMinor` are read straight
 *  off a book assembled outside TypeScript, and a `null` there multiplies to a perfectly exact `0`
 *  that the breakdown renders *inclus*.
 *
 *  **The three hardware rates are three fields and not one**, so a book that declares a usable hinge
 *  rate and an unusable drawer rate refuses naming the drawer — a single field would name the tier
 *  and leave the reader to find which of the three was wrong. */
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
 * **A formula that declares a coefficient the arithmetic cannot be performed on.** A programming
 * error in the *book*, and thrown rather than answered, exactly as `UndeclaredCabinetHandleCountError`
 * is for a handle count and for the same reason: there is no number to guess at.
 *
 * **The quiet half is what this exists for.** A coefficient of `undefined`, `NaN` or `Infinity`
 * already made the whole amount unusable and was refused downstream by its integrality. `null`,
 * `false`, `[]` and `""` do not: JavaScript multiplies every one of them by a millimetre count and
 * answers `0`, a perfectly exact integer, so the term vanishes and the row prices as though the
 * term the owner ruled for it did not apply — silently, on the most-inserted row in the catalogue
 * (QA 6B2). That is the population ADR 0062 seam 1 describes: a book is versioned data assembled
 * outside TypeScript, and its declared `number` is what the seam cannot guarantee.
 *
 * **The sign is deliberately not this function's question.** A negative coefficient is arithmetic
 * the machine can perform exactly; what is wrong with it is that it produces an amount nobody may
 * be quoted, which is a fact about the published line and is refused there.
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

/** The number an amount is declared as, held to being an **exact count of minor units**: a number,
 *  whole, and small enough that the products above stay exact. `0` is a real answer and passes —
 *  `pricedFlat` is written out of one, and a tier that is included in the base price is another.
 *
 *  Exported so the whole-kitchen tier amounts pass through **this** guard rather than a second one
 *  that could drift from it: a per-handle rate and a per-kitchen delta are the same kind of promise
 *  as a coefficient, made by the same seam, and one convention is what keeps them refusing alike.
 *
 *  Typed `unknown` deliberately, although every coefficient and tier interface declares `number`.
 *  That declaration is what the book seam cannot guarantee, and this function exists for exactly the
 *  values TypeScript already believes are impossible. */
export function usableCoefficientOf(
  declared: unknown,
  field: PriceCoefficientField,
): number {
  if (typeof declared === "number" && Number.isSafeInteger(declared)) {
    return declared;
  }
  throw new MalformedPriceCoefficientError({ field, declared });
}

/** Every rule id in a book, in the order it is declared — cabinet rules, then the tiers, then the
 *  accessories. What `parse-price-book.ts` sweeps for duplicates, since a repeated id makes a line
 *  untraceable to one rule.
 *
 *  **The accessories are swept like everything else**, so two rules sharing an id *anywhere* in the
 *  book is `INVALID_PRICE_BOOK` rather than a rule family nobody checked.
 *
 *  The three lists are dereferenced bare, and that is safe **only because the parser establishes
 *  they are lists before it calls this** — it is the reason the parser's section checks run before
 *  its semantic ones, and the reason this sweep is no longer reachable from an unparsed book
 *  (M6-AUD-002). */
export function listRuleIds(book: PriceBook): readonly string[] {
  return [
    ...book.cabinetRules.map((rule) => rule.ruleId),
    ...book.hardware.tiers.map((tier) => tier.ruleId),
    ...book.material.tiers.map((tier) => tier.ruleId),
    ...listAccessoryRuleIds(book),
  ];
}

/** The ids of whatever accessory rules a book actually holds.
 *
 *  Reads the section as possibly-absent although `PriceBook` declares it required, for the reason
 *  `usableCoefficientOf` widens its own parameter: ADR 0062 seam 1 makes a book versioned data
 *  authored outside TypeScript, so a declared field is a promise and not a fact — and a duplicate
 *  sweep that threw on a book missing a section would refuse it with the wrong reason. */
function listAccessoryRuleIds(book: PriceBook): readonly string[] {
  return ACCESSORY_IDS.flatMap((accessoryId) => {
    const ruleId = accessoryRuleOf(book, accessoryId)?.ruleId;
    return ruleId === undefined ? [] : [ruleId];
  });
}

/** **The one reader of a book's accessory section**, so no caller spells the property access itself
 *  and every one of them treats an absent section alike.
 *
 *  Reads the section as **possibly absent** although `PriceBook` declares it required, for the
 *  reason `usableCoefficientOf` widens its own parameter: ADR 0062 seam 1 makes a book versioned
 *  data authored outside TypeScript, so a declared field is a promise and not a fact. The widening
 *  is done by the parameter below rather than by a local annotation, because a `const` is narrowed
 *  back to its initialiser's type and a parameter is not. */
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
