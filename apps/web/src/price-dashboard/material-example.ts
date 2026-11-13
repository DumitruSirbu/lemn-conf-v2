import {
  applyChanges,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  previewCabinet,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { shippedDeepeningRows } from "@/price/deepening-rows";

import { ruleIn } from "./cabinet-detail-fields";
import { isCountOfBani } from "./format-lei";
import { surchargeAddressOf } from "./material-model";
import { priceDashboardCatalogue } from "./price-dashboard-catalogue";

// The example on a material's page (frame D5B): what one cabinet costs in PAL and in the material, at the default depth
// and at the deep one, with the surcharge as typed. Every figure is a cell of `previewCabinet`, the dashboard's one
// source of price arithmetic; this module chooses the request and reads the answer. Where the book cannot price the
// example, there is none, and nothing is drawn in its place.

/** The cabinet the example prices: a base cabinet without hardware, at the width the frame names. */
export const EXAMPLE_BUILD_ID = "base-cabinet";
export const EXAMPLE_WIDTH_MM = 600;

/** The cabinet in PAL, and the same cabinet in the material. */
export interface ExampleFigures {
  readonly referenceMinor: number;
  readonly materialMinor: number;
}

export interface MaterialExample {
  readonly buildId: string;
  readonly widthMm: number;
  readonly deepMm: number;
  /** In the version the draft makes, with the surcharge typed. */
  readonly next: {
    readonly standard: ExampleFigures;
    readonly deep: ExampleFigures;
  };
  /** In the active version; present only where it prices the example differently from `next`. */
  readonly active: ExampleFigures | undefined;
}

export interface MaterialExampleInput {
  readonly active: PriceBook;
  /** The active book with the draft applied. */
  readonly draft: PriceBook;
  readonly tierId: string;
  /** The surcharge to draw: the one typed, or the draft's where nothing is typed. */
  readonly percent: number;
}

export function materialExampleOf({
  active,
  draft,
  tierId,
  percent,
}: MaterialExampleInput): MaterialExample | undefined {
  const typed = withSurcharge(draft, tierId, percent);
  if (typed === undefined) return undefined;
  const standard = figuresIn(typed, tierId, DEFAULT_CABINET_DEPTH_MM);
  const deep = figuresIn(typed, tierId, DEEP_CABINET_DEPTH_MM);
  if (standard === undefined || deep === undefined) return undefined;
  const held = figuresIn(active, tierId, DEFAULT_CABINET_DEPTH_MM);
  return {
    buildId: EXAMPLE_BUILD_ID,
    widthMm: EXAMPLE_WIDTH_MM,
    deepMm: DEEP_CABINET_DEPTH_MM,
    next: { standard, deep },
    active:
      held === undefined || isSameFigures(held, standard) ? undefined : held,
  };
}

function withSurcharge(
  draft: PriceBook,
  tierId: string,
  percent: number,
): PriceBook | undefined {
  const applied = applyChanges(draft, [
    { address: surchargeAddressOf(tierId), value: percent },
  ]);
  return applied.ok ? applied.book : undefined;
}

function figuresIn(
  book: PriceBook,
  tierId: string,
  depth: number,
): ExampleFigures | undefined {
  const referenceMinor = priceIn(book, book.material.defaultTierId, depth);
  const materialMinor = priceIn(book, tierId, depth);
  return referenceMinor === undefined || materialMinor === undefined
    ? undefined
    : { referenceMinor, materialMinor };
}

function priceIn(
  book: PriceBook,
  material: string,
  depth: number,
): number | undefined {
  const rule = book.cabinetRules.find(
    ({ buildId }) => buildId === EXAMPLE_BUILD_ID,
  );
  const ofBook = rule === undefined ? undefined : ruleIn(book, rule.ruleId);
  if (ofBook === undefined) return undefined;
  const preview = previewCabinet({
    rule: ofBook,
    catalog: priceDashboardCatalogue(),
    book,
    material,
    depth,
    deepeningRows: shippedDeepeningRows(),
  });
  if (!preview.ok) return undefined;
  const row = preview.rows.find(({ widthMm }) => widthMm === EXAMPLE_WIDTH_MM);
  return row !== undefined && isCountOfBani(row.priceMinor)
    ? row.priceMinor
    : undefined;
}

function isSameFigures(one: ExampleFigures, other: ExampleFigures): boolean {
  return (
    one.referenceMinor === other.referenceMinor &&
    one.materialMinor === other.materialMinor
  );
}
