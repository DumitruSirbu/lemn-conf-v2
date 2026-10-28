import { normaliseBand } from "../bands.js";
import { entryLabel } from "../catalog.js";
import { countHardwareMechanisms } from "../hardware-mechanisms.js";
import {
  anchoredShapeReadsDoorLeaves,
  isAnchoredShape,
  MalformedPriceDimensionError,
  NoPriceForSizeError,
  PRICE_PER_SIZE_SHAPE,
  PRICE_STEP_MM,
  roundUpToPriceStepMm,
} from "../pricing/anchored-price-formula.js";
import {
  DEEP_CABINET_DEPTH_MM,
  percentageStagesOf,
  roundHalfUpToTenLei,
} from "../pricing/percentage-lines.js";
import {
  exactAmountOfTerms,
  InexactPriceArithmeticError,
  MalformedPriceCoefficientError,
  usableCoefficientOf,
  type CabinetPriceRule,
  type HardwareTier,
  type PriceBook,
  type PriceFormula,
} from "../pricing/price-book.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../pricing/price-bounds.js";
import type { DisplayEntry } from "../queries/design-projection.js";
import type { BodyCatalog } from "../void-engine.js";
import { declaredCabinetDepthsMm } from "../worktop-depth.js";

import { isWholePercentWithin } from "./judge-book.js";
import {
  buildableHeightsMm,
  doorLeavesOf,
  exactAmountOf,
  listedWidthsMm,
  pricedRowOf,
  referenceCornerBuiltWidthsMm,
  type BuiltWidthsMm,
  type PricedRow,
} from "./priced-row.js";

// What one cabinet type costs at each width the owner can build it at (frames D3A to D3G): the table beside the price
// fields, recalculated as they are typed. Built only from the pricing module's own functions: the exact amount is
// `amountForBody`, the cell is the third stage of `percentageStagesOf` (ADR 0177 A-1: the one combined price a kitchen's
// cabinet, material and depth lines add up to), and hardware is added at its own `r10`. Nothing here multiplies a
// percentage or rounds a price itself.

export const PREVIEW_REFUSAL_CODES = Object.freeze([
  "NO_CATALOGUE_ROW",
  "UNKNOWN_FORMULA_SHAPE",
  "NO_BUILT_WIDTH",
  "UNKNOWN_MATERIAL",
  "UNKNOWN_HARDWARE",
  "UNKNOWN_DEPTH",
  "PERCENT_OUT_OF_RANGE",
  "NO_PRICE_FOR_SIZE",
  "PRICE_NOT_EXACT",
] as const);
export type PreviewRefusalCode = (typeof PREVIEW_REFUSAL_CODES)[number];

export interface CabinetPreviewOptions {
  /** The material tier the column is priced in; the book's PAL default is the 0 % reference. */
  readonly material: string;
  /** The kitchen's cabinet depth: one of the declared depths. Only the deep one takes the book's depth percentage. */
  readonly depth: number;
  /** The priced-as build ids that get deeper (`measureDeepeningRows`), the same set `priceDesign` takes. */
  readonly deepeningRows: ReadonlySet<string>;
  /** When given, each cell also carries that hardware class's mechanisms for a body of that width. */
  readonly hardwareTier?: string;
  /** The height a row built to its opening is shown at. Defaults to the formula's own anchor height. */
  readonly heightMm?: number;
  /** The widths of the structural corner rows; defaults to the corner assembly's reference ones. */
  readonly builtWidthsMm?: BuiltWidthsMm;
}

export interface PreviewRow {
  /** The width the body is built at: a grid width, or the narrowest buildable one when that is off the grid. */
  readonly widthMm: number;
  /** The grid width it is priced as (`⌈width / 50⌉ × 50`): "560 → priced as 600" reads from the two. */
  readonly pricedAsWidthMm: number;
  readonly isOffGridMinimum: boolean;
  /** The door leaves a body of this width carries; `0` for a body that has none. */
  readonly doorLeaves: number;
  /** Whether the price steps here because the leaf count differs from the row above. Only a formula that prices by door
   *  leaves has such a step. */
  readonly isDoorStep: boolean;
  /** The cabinet in its material at its depth, rounded once to ten lei, plus the hardware when it was asked for. */
  readonly priceMinor: number;
  /** The hardware part of `priceMinor`: `r10` of the body's mechanisms. Absent when no hardware was asked for. */
  readonly hardwareMinor?: number;
}

export type CabinetPreview =
  | { readonly ok: true; readonly rows: readonly PreviewRow[] }
  | { readonly ok: false; readonly code: PreviewRefusalCode };

/** The table for one rule, one row per width, narrowest first. */
export function previewCabinet(
  rule: CabinetPriceRule,
  catalog: BodyCatalog,
  book: PriceBook,
  options: CabinetPreviewOptions,
): CabinetPreview {
  const setting = settingOf(rule, catalog, book, options);
  if (!setting.ok) return setting;
  try {
    return { ok: true, rows: rowsOf(setting.value) };
  } catch (error) {
    const code = refusalCodeOf(error);
    if (code === undefined) throw error;
    return { ok: false, code };
  }
}

/** The throws a book causes, as `priceDesign` names them; anything else is a defect and leaves as itself. */
function refusalCodeOf(error: unknown): PreviewRefusalCode | undefined {
  if (error instanceof NoPriceForSizeError) return "NO_PRICE_FOR_SIZE";
  const isABookFault =
    error instanceof MalformedPriceCoefficientError ||
    error instanceof MalformedPriceDimensionError ||
    error instanceof InexactPriceArithmeticError;
  return isABookFault ? "PRICE_NOT_EXACT" : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// The setting a table is drawn at

interface PreviewSetting {
  readonly rule: CabinetPriceRule;
  readonly row: PricedRow;
  readonly catalog: BodyCatalog;
  readonly widthsMm: readonly number[];
  readonly heightMm: number;
  readonly materialPercent: number;
  /** `0` for a row or a depth that takes no depth percentage. */
  readonly deepCabinetPercent: number;
  readonly hardware: HardwareTier | undefined;
}

type Reading<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly code: PreviewRefusalCode };

function settingOf(
  rule: CabinetPriceRule,
  catalog: BodyCatalog,
  book: PriceBook,
  options: CabinetPreviewOptions,
): Reading<PreviewSetting> {
  const row = pricedRowOf(catalog, rule.buildId);
  if (row === undefined) return refused("NO_CATALOGUE_ROW");
  const percentages = percentagesOf(rule, row, book, options);
  if (!percentages.ok) return percentages;
  const hardware = hardwareOf(book, options);
  if (!hardware.ok) return hardware;
  const widthsMm = widthsOf(rule, row, options);
  if (!widthsMm.ok) return widthsMm;
  return accepted({
    rule,
    row,
    catalog,
    widthsMm: widthsMm.value,
    heightMm: heightOf(rule.formula, row, options),
    ...percentages.value,
    hardware: hardware.value,
  });
}

/** The widths a table lists, for a shape this build can evaluate. */
function widthsOf(
  rule: CabinetPriceRule,
  row: PricedRow,
  options: CabinetPreviewOptions,
): Reading<readonly number[]> {
  if (!isKnownShape(rule.formula.shape)) {
    return refused("UNKNOWN_FORMULA_SHAPE");
  }
  const widthsMm = listedWidthsMm(
    row,
    options.builtWidthsMm ?? referenceCornerBuiltWidthsMm(),
  );
  return widthsMm.length === 0 ? refused("NO_BUILT_WIDTH") : accepted(widthsMm);
}

function refused(code: PreviewRefusalCode): Reading<never> {
  return { ok: false, code };
}

function accepted<Value>(value: Value): Reading<Value> {
  return { ok: true, value };
}

/** `unknown`, because a book comes from outside TypeScript and may carry a shape this build retired. */
function isKnownShape(declaredShape: unknown): boolean {
  return (
    isAnchoredShape(declaredShape) || declaredShape === PRICE_PER_SIZE_SHAPE
  );
}

interface Percentages {
  readonly materialPercent: number;
  readonly deepCabinetPercent: number;
}

/** The two percentages, each checked whole and within its range before `percentageStagesOf` is asked (it checks that a
 *  percentage is whole, and not its range). */
function percentagesOf(
  rule: CabinetPriceRule,
  row: PricedRow,
  book: PriceBook,
  options: CabinetPreviewOptions,
): Reading<Percentages> {
  if (!declaredCabinetDepthsMm().includes(options.depth)) {
    return refused("UNKNOWN_DEPTH");
  }
  const material = materialPercentOf(book, options.material);
  if (!material.ok) return material;
  const { deepCabinetPercent } = book.depthRule;
  if (!isWholePercentWithin(deepCabinetPercent, MAX_DEEP_CABINET_PERCENT)) {
    return refused("PERCENT_OUT_OF_RANGE");
  }
  return accepted({
    materialPercent: material.value,
    deepCabinetPercent: takesDepthPercent(rule, row, options)
      ? deepCabinetPercent
      : 0,
  });
}

function materialPercentOf(book: PriceBook, tierId: string): Reading<number> {
  const tier = book.material.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (tier === undefined) return refused("UNKNOWN_MATERIAL");
  return isWholePercentWithin(tier.percentOfCabinets, MAX_MATERIAL_PERCENT)
    ? accepted(tier.percentOfCabinets)
    : refused("PERCENT_OUT_OF_RANGE");
}

/** Only the deep depth, only a row that measures deeper, and never a customer-supplied one (ADR 0177 A-6). */
function takesDepthPercent(
  rule: CabinetPriceRule,
  row: PricedRow,
  options: CabinetPreviewOptions,
): boolean {
  return (
    options.depth === DEEP_CABINET_DEPTH_MM &&
    options.deepeningRows.has(row.buildId) &&
    rule.suppliedBy !== "customer"
  );
}

function hardwareOf(
  book: PriceBook,
  options: CabinetPreviewOptions,
): Reading<HardwareTier | undefined> {
  if (options.hardwareTier === undefined) return accepted(undefined);
  const tier = book.hardware.tiers.find(
    ({ tierId }) => tierId === options.hardwareTier,
  );
  return tier === undefined ? refused("UNKNOWN_HARDWARE") : accepted(tier);
}

/** The height a row built to its opening is read at: the caller's, else the formula's anchor height, else the row's
 *  first buildable one. */
function heightOf(
  formula: PriceFormula,
  row: PricedRow,
  options: CabinetPreviewOptions,
): number {
  if (options.heightMm !== undefined) return options.heightMm;
  const anchorHeightMm = isAnchoredShape(formula.shape)
    ? (formula as { readonly anchorHeightMm?: number }).anchorHeightMm
    : undefined;
  return anchorHeightMm ?? buildableHeightsMm(row)[0] ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// The rows

function rowsOf(setting: PreviewSetting): readonly PreviewRow[] {
  const readsDoorLeaves =
    isAnchoredShape(setting.rule.formula.shape) &&
    anchoredShapeReadsDoorLeaves(setting.rule.formula.shape);
  let previousLeaves: number | undefined;
  return setting.widthsMm.map((widthMm) => {
    const leaves = doorLeavesOf(setting.row, {
      widthMm,
      heightMm: setting.heightMm,
    });
    const isDoorStep =
      readsDoorLeaves &&
      previousLeaves !== undefined &&
      leaves !== previousLeaves;
    previousLeaves = leaves;
    return rowAt(setting, { widthMm, leaves, isDoorStep });
  });
}

interface RowAt {
  readonly widthMm: number;
  readonly leaves: number;
  readonly isDoorStep: boolean;
}

function rowAt(setting: PreviewSetting, at: RowAt): PreviewRow {
  const pricedAsWidthMm = roundUpToPriceStepMm(at.widthMm);
  const hardwareMinor = hardwareMinorAt(setting, at.widthMm);
  return {
    widthMm: at.widthMm,
    pricedAsWidthMm,
    isOffGridMinimum: at.widthMm % PRICE_STEP_MM !== 0,
    doorLeaves: at.leaves,
    isDoorStep: at.isDoorStep,
    priceMinor: cabinetCellMinor(setting, at.widthMm) + (hardwareMinor ?? 0),
    ...(hardwareMinor === undefined ? {} : { hardwareMinor }),
  };
}

/** The cabinet in its material at its depth: the third stage of the percentage seam, on the exact amount. */
function cabinetCellMinor(setting: PreviewSetting, widthMm: number): number {
  const exactMinor = exactAmountOf(setting.rule.formula, setting.row, {
    widthMm,
    heightMm: setting.heightMm,
  });
  if (exactMinor === undefined) throw new UnreadableFormulaError();
  return percentageStagesOf(exactMinor, setting).withDepthMinor;
}

class UnreadableFormulaError extends Error {
  constructor() {
    super("A rule whose shape was read as known gave no amount.");
    this.name = "UnreadableFormulaError";
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Hardware

/** `r10` of the hardware class's mechanisms on one body of this width, as the kitchen's hardware line rounds its own:
 *  counted by `countHardwareMechanisms` on a body standing on the floor with the kitchen's default handles, so none is
 *  push-to-open. `undefined` when no hardware class was asked for. */
function hardwareMinorAt(
  setting: PreviewSetting,
  widthMm: number,
): number | undefined {
  const { hardware } = setting;
  if (hardware === undefined) return undefined;
  const counts = countHardwareMechanisms(
    [bodyOnTheFloor(setting, widthMm)],
    setting.catalog,
  );
  return roundHalfUpToTenLei(
    exactAmountOfTerms([
      termOf(hardware.perHingeMinor, counts.hinges, "perHingeMinor"),
      termOf(hardware.perDrawerMinor, counts.drawers, "perDrawerMinor"),
      termOf(
        hardware.perPushToOpenMinor,
        counts.pushToOpen,
        "perPushToOpenMinor",
      ),
    ]),
  );
}

function termOf(
  rateMinor: number,
  count: number,
  field: "perHingeMinor" | "perDrawerMinor" | "perPushToOpenMinor",
) {
  return {
    coefficientMinor: usableCoefficientOf(rateMinor, field),
    count,
    field,
  };
}

/** One body of the priced-as row at this width, the way a projection of a kitchen would list it. */
function bodyOnTheFloor(
  setting: PreviewSetting,
  widthMm: number,
): DisplayEntry {
  const { buildId, definition } = setting.row;
  return {
    placementId: "preview",
    buildId,
    label: entryLabel(buildId),
    wall: "A",
    band: normaliseBand(definition.band),
    rawBand: definition.band,
    alongMm: 0,
    y0Mm: 0,
    widthMm,
    heightMm: setting.heightMm,
    kitchenSettings: {},
  };
}
