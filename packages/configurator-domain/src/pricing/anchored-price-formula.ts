// The anchored price shapes: a cabinet priced by an anchor at its default width plus signed steps, and a
// fixed-size row priced by a list of sizes (ADR 0175 decisions 2 and 3; ADR 0177 A-2, A-3, A-4, A-7).
//
// This module counts steps and never multiplies: it answers how many 50 mm steps, door leaves and height steps
// a body sits away from its anchor, in integers. `price-book.ts` pairs each count with the book's rate and sums
// them through the one checked arithmetic, so this file holds no amount and imports no value from the book.
import type { PricedBody } from "./price-book.js";

/** The unit a width or height is rounded up to and a step is quoted per ("+ lei per 50 mm"). Declared here
 *  as a pricing unit and never derived from the catalogue's own width module (ADR 0177 A-4). */
export const PRICE_STEP_MM = 50;

/** The four anchored shapes. One shape per combination of terms, as the linear shapes are: a shape is a statement
 *  about the product. */
export const ANCHORED_SHAPES = [
  "anchored-width",
  "anchored-width-and-door-leaves",
  "anchored-width-and-height",
  "anchored-width-height-and-door-leaves",
] as const;

export type AnchoredShape = (typeof ANCHORED_SHAPES)[number];

export const PRICE_PER_SIZE_SHAPE = "price-per-size" as const;

/**
 * A cabinet priced at its anchor and a signed number of steps from it. Every amount is in bani and exact.
 *
 * The door and height fields are required by the shapes that read them and refused by `parsePriceBook` on a shape
 * that does not, so a field the dashboard edits is always a field a price reads. Both anchors are book data: the
 * formula needs no catalogue (ADR 0177 A-2).
 */
export interface AnchoredFormula {
  readonly shape: AnchoredShape;
  /** The width the anchor is quoted at: a positive multiple of `PRICE_STEP_MM`. */
  readonly anchorWidthMm: number;
  /** The price at `anchorWidthMm` (at `anchorHeightMm` too, where the shape reads a height). */
  readonly anchorMinor: number;
  /** What each `PRICE_STEP_MM` wider than the anchor adds. Never negative. */
  readonly perStepWiderMinor: number;
  /** What each `PRICE_STEP_MM` narrower than the anchor takes off. Never negative. */
  readonly perStepNarrowerMinor: number;
  /** What one more door leaf than the anchor's adds: its panel only, since its hinges are hardware's. */
  readonly perExtraDoorLeafMinor?: number;
  /** The height the anchor is quoted at: a positive multiple of `PRICE_STEP_MM`. */
  readonly anchorHeightMm?: number;
  /** What each `PRICE_STEP_MM` taller than `anchorHeightMm` adds, and each shorter takes off. Never negative. */
  readonly perHeightStepMinor?: number;
}

/** One size a fixed-size row is made in, with its price. */
export interface PricedSize {
  readonly widthMm: number;
  readonly amountMinor: number;
}

/** A row made only in listed sizes: one price per size and no steps. `sizes` is non-empty, ascending, with no
 *  width twice and every width a multiple of `PRICE_STEP_MM` (`parsePriceBook` refuses anything else). */
export interface PricePerSizeFormula {
  readonly shape: typeof PRICE_PER_SIZE_SHAPE;
  readonly sizes: readonly PricedSize[];
}

/** Whether a shape carries the signed door-leaf term. */
export function anchoredShapeReadsDoorLeaves(shape: AnchoredShape): boolean {
  return (
    shape === "anchored-width-and-door-leaves" ||
    shape === "anchored-width-height-and-door-leaves"
  );
}

/** Whether a shape carries the signed height term. */
export function anchoredShapeReadsHeight(shape: AnchoredShape): boolean {
  return (
    shape === "anchored-width-and-height" ||
    shape === "anchored-width-height-and-door-leaves"
  );
}

/** How far a body sits from its anchor, in whole units. Each is signed: negative means narrower, fewer leaves,
 *  shorter. */
export interface AnchoredSteps {
  readonly widthSteps: number;
  readonly extraDoorLeaves: number;
  readonly heightSteps: number;
}

/** The steps a shape's terms are charged over. A term the shape does not read is `0` steps and is not built. */
export function stepsFromAnchor(
  formula: AnchoredFormula,
  body: PricedBody,
): AnchoredSteps {
  return {
    widthSteps: priceStepsFromAnchor(
      { declared: formula.anchorWidthMm, field: "anchorWidthMm" },
      { declared: body.widthMm, field: "widthMm" },
    ),
    extraDoorLeaves: anchoredShapeReadsDoorLeaves(formula.shape)
      ? extraDoorLeavesAgainstAnchor(body, formula.anchorWidthMm)
      : NO_STEPS,
    heightSteps: anchoredShapeReadsHeight(formula.shape)
      ? priceStepsFromAnchor(
          { declared: formula.anchorHeightMm, field: "anchorHeightMm" },
          { declared: body.heightMm, field: "heightMm" },
        )
      : NO_STEPS,
  };
}

const NO_STEPS = 0;

/**
 * How many door leaves the built body has beyond the anchor's: the leaves the body itself carries at its **actual**
 * width (the count hardware bills: `builtDoorLeafCount`, else `doorLeafCount`) minus the priced-as row's leaves at the
 * anchor width, signed (ADR 0177 A-3). The one place the door step is read, so a body narrower than the door
 * threshold gives one leaf's panel back. Never read from the rounded width.
 */
export function extraDoorLeavesAgainstAnchor(
  body: PricedBody,
  anchorWidthMm: number,
): number {
  const leavesAt = body.doorLeafCountAt;
  if (leavesAt === undefined) {
    throw new MissingAnchorLeafCountError();
  }
  const builtLeaves = body.builtDoorLeafCount?.() ?? body.doorLeafCount;
  return builtLeaves - leavesAt(anchorWidthMm);
}

/** A dimension and the book or body field it was declared in, held together so a refusal names the field. */
interface DeclaredDimension {
  readonly declared: unknown;
  readonly field: PriceDimensionField;
}

/** Signed `PRICE_STEP_MM` steps from the anchor to the built dimension rounded up (ADR 0177 A-2). The anchor is
 *  not rounded: it is a multiple by the parser's contract and refused here if it is not. */
function priceStepsFromAnchor(
  anchor: DeclaredDimension,
  built: DeclaredDimension,
): number {
  const anchorMm = wholePositiveMillimetres(anchor);
  const builtMm = roundUpToPriceStepMm(wholePositiveMillimetres(built));
  if (anchorMm % PRICE_STEP_MM !== 0) {
    throw new MalformedPriceDimensionError(anchor);
  }
  return (builtMm - anchorMm) / PRICE_STEP_MM;
}

/** `⌈mm / PRICE_STEP_MM⌉ × PRICE_STEP_MM` for a width or height in whole millimetres. */
export function roundUpToPriceStepMm(millimetres: number): number {
  return Math.ceil(millimetres / PRICE_STEP_MM) * PRICE_STEP_MM;
}

/** A dimension held to being whole, positive and safe: a fraction would be rounded up and billed as a step the
 *  body does not have. */
function wholePositiveMillimetres(dimension: DeclaredDimension): number {
  const { declared } = dimension;
  if (
    typeof declared === "number" &&
    Number.isSafeInteger(declared) &&
    declared > 0
  ) {
    return declared;
  }
  throw new MalformedPriceDimensionError(dimension);
}

/**
 * The listed size a body of this width is priced at: the smallest one at least as wide as the width rounded up to
 * the pricing step (ADR 0177 A-2, A-7). Throws `NoPriceForSizeError` above every listed size, never answering a
 * nearer size and never zero. Independent of the list's order, so a list the parser has not seen still cannot price
 * a body at a wider size than the next one up.
 */
export function listedSizeFor(
  declaredSizes: unknown,
  widthMm: number,
): PricedSize {
  const sizes = readListedSizes(declaredSizes);
  const builtMm = wholePositiveMillimetres({
    declared: widthMm,
    field: "widthMm",
  });
  const pricedMm = roundUpToPriceStepMm(builtMm);
  const reaching = sizes.filter((size) => size.widthMm >= pricedMm);
  const smallest = reaching.reduce<PricedSize | undefined>(
    (best, size) =>
      best === undefined || size.widthMm < best.widthMm ? size : best,
    undefined,
  );
  if (smallest === undefined) {
    throw new NoPriceForSizeError({
      widthMm: builtMm,
      listedWidthsMm: sizes.map((size) => size.widthMm),
    });
  }
  return smallest;
}

/** `unknown` although a formula declares a list: the book is data from outside TypeScript, and the parser is not
 *  the only caller. */
function readListedSizes(declared: unknown): readonly PricedSize[] {
  if (Array.isArray(declared)) return declared as readonly PricedSize[];
  throw new MalformedPriceDimensionError({ declared, field: "sizes" });
}

/** Every dimension a refusal can name: a book's anchors and sizes, and the body's own width and height. */
export type PriceDimensionField =
  | "anchorWidthMm"
  | "anchorHeightMm"
  | "widthMm"
  | "heightMm"
  | "sizes";

/** A dimension that is not a whole, positive count of millimetres: thrown, as a malformed coefficient is, because
 *  there is no number to guess at. `price-design.ts` converts it to a coded refusal. */
export class MalformedPriceDimensionError extends Error {
  constructor(dimension: DeclaredDimension) {
    super(
      `The price cannot be read on "${dimension.field}", which is a whole, positive count of millimetres ` +
        `and a multiple of ${String(PRICE_STEP_MM)} where a book states it. Found: ${describe(dimension.declared)}.`,
    );
    this.name = "MalformedPriceDimensionError";
  }
}

/** A fixed-size row asked for a width wider than every size it is made in. Its own class, so the query can answer
 *  `NO_PRICE_FOR_SIZE` and every other cause stays `INVALID_AMOUNT`. */
export class NoPriceForSizeError extends Error {
  constructor(refusal: {
    readonly widthMm: number;
    readonly listedWidthsMm: readonly number[];
  }) {
    super(
      `No listed size reaches ${String(refusal.widthMm)} mm; the sizes are ` +
        `${refusal.listedWidthsMm.map(String).join(", ")} mm.`,
    );
    this.name = "NoPriceForSizeError";
  }
}

/** An anchored door shape was evaluated for a body that cannot say how many leaves the anchor width has. A defect
 *  in the caller (`describePricedBody` always supplies it), never a fact about a book. */
export class MissingAnchorLeafCountError extends Error {
  constructor() {
    super(
      "An anchored door shape needs the leaf count at the anchor width, and the body supplies none.",
    );
    this.name = "MissingAnchorLeafCountError";
  }
}

/** Runs inside a refusal being built, so it must not raise: a book can declare a BigInt or a cycle. */
function describe(declared: unknown): string {
  if (declared === undefined) return "nothing";
  try {
    const rendered = JSON.stringify(declared) as string | undefined;
    return rendered ?? typeof declared;
  } catch {
    return typeof declared;
  }
}
