import {
  anchoredFieldsReadBy,
  anchoredShapeReadsHeight,
  isAnchoredShape,
  PRICE_PER_SIZE_SHAPE,
  roundUpToPriceStepMm,
  type AnchoredFormula,
  type PricePerSizeFormula,
} from "../pricing/anchored-price-formula.js";
import { MAX_CABINET_AMOUNT_MINOR } from "../pricing/percentage-lines.js";
import type {
  CabinetPriceRule,
  PriceBook,
  PriceFormula,
} from "../pricing/price-book.js";
import type { BodyCatalog } from "../void-engine.js";

import {
  CABINET_RULE_FIELDS,
  type CabinetRuleField,
} from "./book-field-address.js";
import {
  isDepthPercentInRange,
  isMaterialPercentInRange,
} from "./percent-bounds.js";
import {
  bookFaultOf,
  buildableHeightsMm,
  buildableWidthsMm,
  exactAmountOf,
  isInsertableRow,
  listBodiesPricedAs,
  listPricedRows,
  pricedRowOf,
  referenceCornerBuiltWidthsMm,
  type BuiltSize,
  type BuiltWidthsMm,
  type PricedRow,
} from "./priced-row.js";

// The judgement a price book gets against the catalogue it will price (ADR 0177 A-7, A-7b, A-5; the D3C frame): a book
// can parse, go live, and then refuse every price, because the parser has no catalogue. Publish and the owner-run seed
// ask this before a book is stored, and the editor shows D3C's error from it.
//
// Every row is evaluated over the whole grid it can be built on (every width, and every height of a row built to its
// opening), not at one point, so the rule does not rest on a coefficient being non-negative: any price at or below zero
// refuses the book, naming the row, the width, the height and the field that drives it. Each body that stands as the
// row is judged with its own door leaves, since a seeded variant counts them from its own fronts. A row the book does
// not price, a row priced twice, and a row whose formula this build cannot evaluate (a retired linear shape that still
// parses) are refused too. A customer-supplied row is held to the same shape and the same evaluation, but not to a
// positive price: it must be free at every size.

export const BOOK_JUDGEMENT_CODES = Object.freeze([
  "NO_RULE_FOR_BODY",
  "DUPLICATE_RULE_FOR_BODY",
  "UNKNOWN_FORMULA_SHAPE",
  "PRICE_NOT_EXACT",
  "ANCHOR_WIDTH_MISMATCH",
  "SIZE_LIST_MISMATCH",
  "STRUCTURAL_ROW_NOT_PER_SIZE",
  "NO_BUILT_WIDTH",
  "PRICE_NOT_POSITIVE",
  "PRICE_TOO_LARGE",
  "CUSTOMER_ROW_PRICED",
  "PERCENT_OUT_OF_RANGE",
] as const);
export type BookJudgementCode = (typeof BOOK_JUDGEMENT_CODES)[number];

/** The amount a price is driven by: a field of an anchored formula, or the one price of a listed size. */
export type PriceDrivingField = CabinetRuleField | "amountMinor";

/** One reason a book cannot price the catalogue. Names what it is about and never carries a sentence. */
export type BookRefusal =
  | {
      readonly code: "NO_RULE_FOR_BODY" | "DUPLICATE_RULE_FOR_BODY";
      readonly buildId: string;
    }
  | {
      readonly code:
        | "UNKNOWN_FORMULA_SHAPE"
        | "PRICE_NOT_EXACT"
        | "STRUCTURAL_ROW_NOT_PER_SIZE"
        | "NO_BUILT_WIDTH"
        | "CUSTOMER_ROW_PRICED";
      readonly ruleId: string;
      readonly buildId: string;
    }
  | {
      readonly code: "ANCHOR_WIDTH_MISMATCH";
      readonly ruleId: string;
      readonly buildId: string;
      readonly anchorWidthMm: number;
      /** `undefined` when the catalogue declares the row no default width. */
      readonly expectedWidthMm: number | undefined;
    }
  | {
      readonly code: "SIZE_LIST_MISMATCH";
      readonly ruleId: string;
      readonly buildId: string;
      readonly listedWidthsMm: readonly number[];
      readonly expectedWidthsMm: readonly number[];
    }
  | {
      readonly code: "PRICE_NOT_POSITIVE" | "PRICE_TOO_LARGE";
      readonly ruleId: string;
      readonly buildId: string;
      readonly widthMm: number;
      readonly heightMm: number;
      readonly field: PriceDrivingField;
    }
  | {
      readonly code: "PERCENT_OUT_OF_RANGE";
      /** `"depth"`, or the id of the material tier. */
      readonly item: string;
    };

export type BookJudgement =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusals: readonly BookRefusal[] };

/** What the catalogue does not state and the caller may supply: the width each structural corner row is built at. */
export interface BookJudgementOptions {
  /** Defaults to the corner assembly's reference widths (`referenceCornerBuiltWidthsMm`). */
  readonly builtWidthsMm?: BuiltWidthsMm;
}

/** Judges `book` against `catalog`: ok, or every reason it would refuse a price. */
export function judgeBookAgainstCatalog(
  book: PriceBook,
  catalog: BodyCatalog,
  options: BookJudgementOptions = {},
): BookJudgement {
  const context = judgementContext(catalog, options);
  const rulesByBuildId = groupedByBuildId(book.cabinetRules);
  const refusals = [
    ...refusePercentages(book),
    ...refuseDuplicates(rulesByBuildId),
    ...listPricedRows(catalog).flatMap((row) =>
      judgeRow(rulesByBuildId.get(row.buildId)?.[0], row, context),
    ),
  ];
  return refusals.length === 0 ? { ok: true } : { ok: false, refusals };
}

/** The first price of one rule that is at or below zero, above what a cabinet may cost, or not exact, over every size
 *  the catalogue builds its row at. Whatever else is wrong with the rule is not looked at: its shape against the
 *  catalogue is `judgeBookAgainstCatalog`'s, and a size its list does not cover has no price to judge. `undefined` for
 *  a rule that prices well, a customer-supplied one, or one the catalogue does not hold. */
export function judgePricesOfRule(
  rule: CabinetPriceRule,
  catalog: BodyCatalog,
  options: BookJudgementOptions = {},
): BookRefusal | undefined {
  const row = pricedRowOf(catalog, rule.buildId);
  if (row === undefined || rule.suppliedBy === "customer") return undefined;
  return refusePrices(rule, row, judgementContext(catalog, options))[0];
}

/** What a judgement reads besides the rule: the catalogue, and the built widths of its structural rows. */
interface JudgementContext {
  readonly catalog: BodyCatalog;
  readonly builtWidthsMm: BuiltWidthsMm;
}

function judgementContext(
  catalog: BodyCatalog,
  options: BookJudgementOptions,
): JudgementContext {
  return {
    catalog,
    builtWidthsMm: options.builtWidthsMm ?? referenceCornerBuiltWidthsMm(),
  };
}

function groupedByBuildId(
  rules: readonly CabinetPriceRule[],
): ReadonlyMap<string, readonly CabinetPriceRule[]> {
  const grouped = new Map<string, CabinetPriceRule[]>();
  for (const rule of rules) {
    grouped.set(rule.buildId, [...(grouped.get(rule.buildId) ?? []), rule]);
  }
  return grouped;
}

/** A build id two rules price: which one a body is priced by would depend on the order of the book. */
function refuseDuplicates(
  rulesByBuildId: ReadonlyMap<string, readonly CabinetPriceRule[]>,
): readonly BookRefusal[] {
  return [...rulesByBuildId]
    .filter(([, rules]) => rules.length > 1)
    .map(([buildId]) => ({ code: "DUPLICATE_RULE_FOR_BODY", buildId }));
}

// ---------------------------------------------------------------------------------------------------------------------
// The percentages

function refusePercentages(book: PriceBook): readonly BookRefusal[] {
  const refusals: BookRefusal[] = book.material.tiers
    .filter((tier) => !isMaterialPercentInRange(book, tier))
    .map((tier) => ({ code: "PERCENT_OUT_OF_RANGE", item: tier.tierId }));
  if (!isDepthPercentInRange(book)) {
    refusals.push({ code: "PERCENT_OUT_OF_RANGE", item: "depth" });
  }
  return refusals;
}

// ---------------------------------------------------------------------------------------------------------------------
// One row

function judgeRow(
  rule: CabinetPriceRule | undefined,
  row: PricedRow,
  context: JudgementContext,
): readonly BookRefusal[] {
  if (rule === undefined) {
    return [{ code: "NO_RULE_FOR_BODY", buildId: row.buildId }];
  }
  const structural = refuseStructure(rule, row, context.builtWidthsMm);
  if (structural.length > 0) return structural;
  const priced = refusePrices(rule, row, context);
  return priced.length > 0 ? priced : refuseChargeFor(rule);
}

/** A customer-supplied row states no amount: evaluating it at every size finds a charge only where it shows, and a
 *  rate that happens to cancel is a charge all the same. */
function refuseChargeFor(rule: CabinetPriceRule): readonly BookRefusal[] {
  const isCharging =
    rule.suppliedBy === "customer" && chargesAnything(rule.formula);
  return isCharging
    ? [
        {
          code: "CUSTOMER_ROW_PRICED",
          ruleId: rule.ruleId,
          buildId: rule.buildId,
        },
      ]
    : [];
}

/** Whether any amount a formula states is not zero. A shape this build does not know states none it can read. */
function chargesAnything(formula: PriceFormula): boolean {
  if (formula.shape === PRICE_PER_SIZE_SHAPE) {
    return formula.sizes.some((size) => size.amountMinor !== 0);
  }
  if (!isAnchoredShape(formula.shape)) return false;
  return CABINET_RULE_FIELDS.some(
    (field) => (Reflect.get(formula, field) ?? 0) !== 0,
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The shape of a row's formula against the catalogue (A-7)

function refuseStructure(
  rule: CabinetPriceRule,
  row: PricedRow,
  builtWidthsMm: BuiltWidthsMm,
): readonly BookRefusal[] {
  const named = { ruleId: rule.ruleId, buildId: rule.buildId };
  const { formula } = rule;
  if (formula.shape === PRICE_PER_SIZE_SHAPE) {
    return refuseSizeList({ named, formula, row, builtWidthsMm });
  }
  if (!isAnchoredShape(formula.shape)) {
    return [{ code: "UNKNOWN_FORMULA_SHAPE", ...named }];
  }
  return isInsertableRow(row)
    ? refuseAnchorWidth(named, formula, row)
    : [{ code: "STRUCTURAL_ROW_NOT_PER_SIZE", ...named }];
}

interface NamedRule {
  readonly ruleId: string;
  readonly buildId: string;
}

function refuseAnchorWidth(
  named: NamedRule,
  formula: AnchoredFormula,
  row: PricedRow,
): readonly BookRefusal[] {
  const expectedWidthMm = row.definition.defaultWidthMm;
  if (formula.anchorWidthMm === expectedWidthMm) return [];
  return [
    {
      code: "ANCHOR_WIDTH_MISMATCH",
      ...named,
      anchorWidthMm: formula.anchorWidthMm,
      expectedWidthMm,
    },
  ];
}

interface SizeListJudgement {
  readonly named: NamedRule;
  readonly formula: PricePerSizeFormula;
  readonly row: PricedRow;
  readonly builtWidthsMm: BuiltWidthsMm;
}

/** A fixed-size row lists, once each, the round-up of every width it can be built at: a body above every listed size
 *  would be refused, and a size nothing can be built at is a price nobody reads. */
function refuseSizeList(judged: SizeListJudgement): readonly BookRefusal[] {
  const { named, formula, row, builtWidthsMm } = judged;
  const builtMm = buildableWidthsMm(row, builtWidthsMm);
  if (builtMm.length === 0) return [{ code: "NO_BUILT_WIDTH", ...named }];
  const expectedWidthsMm = [...new Set(builtMm.map(roundUpToPriceStepMm))];
  const listedWidthsMm = formula.sizes.map((size) => size.widthMm);
  return isSameList(listedWidthsMm, expectedWidthsMm)
    ? []
    : [
        {
          code: "SIZE_LIST_MISMATCH",
          ...named,
          listedWidthsMm,
          expectedWidthsMm,
        },
      ];
}

function isSameList(
  listed: readonly number[],
  expected: readonly number[],
): boolean {
  const ascending = (left: number, right: number) => left - right;
  const sortedListed = [...listed].sort(ascending);
  const sortedExpected = [...expected].sort(ascending);
  return (
    sortedListed.length === sortedExpected.length &&
    sortedListed.every((widthMm, index) => widthMm === sortedExpected[index])
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The price at every buildable size (A-7b)

function refusePrices(
  rule: CabinetPriceRule,
  row: PricedRow,
  context: JudgementContext,
): readonly BookRefusal[] {
  for (const standing of listBodiesPricedAs(context.catalog, row)) {
    for (const size of sizesToJudge(rule.formula, row, context)) {
      const refusal = refusePriceAt(rule, { row, standing }, size);
      if (refusal !== undefined) return [refusal];
    }
  }
  return [];
}

/** Every width of the row, narrowest first, at every height its formula prices by (one nominal height otherwise). */
function sizesToJudge(
  formula: PriceFormula,
  row: PricedRow,
  context: JudgementContext,
): readonly BuiltSize[] {
  const heightsMm = pricesByHeight(formula)
    ? buildableHeightsMm(row)
    : buildableHeightsMm(row).slice(0, 1);
  return buildableWidthsMm(row, context.builtWidthsMm).flatMap((widthMm) =>
    heightsMm.map((heightMm) => ({ widthMm, heightMm })),
  );
}

function pricesByHeight(formula: PriceFormula): boolean {
  return (
    isAnchoredShape(formula.shape) && anchoredShapeReadsHeight(formula.shape)
  );
}

/** The row a rule prices, and the body of it that stands at the size judged. */
interface PricedBodyOfRow {
  readonly row: PricedRow;
  readonly standing: PricedRow;
}

function refusePriceAt(
  rule: CabinetPriceRule,
  body: PricedBodyOfRow,
  size: BuiltSize,
): BookRefusal | undefined {
  const named = { ruleId: rule.ruleId, buildId: rule.buildId };
  const amountMinor = evaluatedAmount(rule.formula, body, size);
  if (amountMinor === NO_LISTED_SIZE) return undefined;
  if (amountMinor === NOT_EXACT) return { code: "PRICE_NOT_EXACT", ...named };
  if (amountMinor === undefined) {
    return { code: "UNKNOWN_FORMULA_SHAPE", ...named };
  }
  if (rule.suppliedBy === "customer") {
    return amountMinor === 0
      ? undefined
      : { code: "CUSTOMER_ROW_PRICED", ...named };
  }
  if (amountMinor > 0 && amountMinor <= MAX_CABINET_AMOUNT_MINOR) {
    return undefined;
  }
  const isTooLarge = amountMinor > MAX_CABINET_AMOUNT_MINOR;
  return {
    code: isTooLarge ? "PRICE_TOO_LARGE" : "PRICE_NOT_POSITIVE",
    ...named,
    ...size,
    field: drivingField(rule.formula, { ...body, size, isTooLarge }),
  };
}

const NOT_EXACT = Symbol("a price the arithmetic cannot hold exactly");
/** A width no listed size reaches: refused by `refuseSizeList` before any price is read, and skipped where only prices
 *  are judged. */
const NO_LISTED_SIZE = Symbol("a width no listed size reaches");

/** What a book causes on a size it parsed for is a refusal or a skipped size; anything else is a defect and leaves as
 *  itself. */
function evaluatedAmount(
  formula: PriceFormula,
  body: PricedBodyOfRow,
  size: BuiltSize,
): number | undefined | typeof NOT_EXACT | typeof NO_LISTED_SIZE {
  try {
    return exactAmountOf(formula, body.row, size, body.standing);
  } catch (error) {
    const fault = bookFaultOf(error);
    if (fault === undefined) throw error;
    return fault === "NO_LISTED_SIZE" ? NO_LISTED_SIZE : NOT_EXACT;
  }
}

interface DrivenPrice extends PricedBodyOfRow {
  readonly size: BuiltSize;
  readonly isTooLarge: boolean;
}

/**
 * The field a bad price is owed to: the amount the formula would price highest without (for a price at or below
 * zero), or lowest without (for one too large). Found by pricing the body again with each amount taken out, so it
 * needs no second arithmetic; a fixed-size row has one price per size and it is that.
 */
function drivingField(
  formula: PriceFormula,
  driven: DrivenPrice,
): PriceDrivingField {
  if (!isAnchoredShape(formula.shape)) return "amountMinor";
  const anchored = formula as AnchoredFormula;
  const ranked = fieldsOfAmounts(anchored).map((field) => ({
    field,
    influenceMinor: influenceOf(anchored, field, driven),
  }));
  const [driving] = ranked.sort(
    (left, right) => right.influenceMinor - left.influenceMinor,
  );
  return driving?.field ?? "anchorMinor";
}

/** How far taking one amount out of the formula moves the price the way a fix would. */
function influenceOf(
  formula: AnchoredFormula,
  field: CabinetRuleField,
  driven: DrivenPrice,
): number {
  const { row, standing, size, isTooLarge } = driven;
  const without = { ...formula, [field]: 0 } as AnchoredFormula;
  const pricedMinor = exactAmountOf(formula, row, size, standing) ?? 0;
  const withoutMinor = exactAmountOf(without, row, size, standing) ?? 0;
  return isTooLarge ? pricedMinor - withoutMinor : withoutMinor - pricedMinor;
}

/** The money fields a shape reads. The anchors are dimensions and not amounts. */
function fieldsOfAmounts(
  formula: AnchoredFormula,
): readonly CabinetRuleField[] {
  const read = anchoredFieldsReadBy(formula.shape).map(({ name }) => name);
  return CABINET_RULE_FIELDS.filter((field) => read.includes(field));
}
