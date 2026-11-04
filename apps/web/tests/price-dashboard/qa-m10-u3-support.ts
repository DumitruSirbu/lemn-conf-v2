// What the adversarial passes over wave U3 (one cabinet's page) share: oracles built apart from the page's own modules, so
// a test that holds the page to them cannot agree with it by sharing its mistake. The preview is asked of a catalogue
// built here and not of `priceDashboardCatalogue()`, the deepening rows are the test support's own measurement, and the
// whole-query price of a one-cabinet kitchen is the customer's side of the same figure.
import {
  applyChanges,
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  priceDesign,
  previewCabinet,
  SAMPLE_PRICE_BOOK,
  type BodyCatalog,
  type CabinetPriceRule,
  type Design,
  type DraftChange,
  type PreviewRow,
  type PriceBook,
  type PricedDesign,
} from "@lemnaria/configurator-domain";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { allIn } from "../support/render-with-intl";

export const INDEPENDENT_CATALOGUE: BodyCatalog = buildKitchenLBodyCatalog(
  DEFAULT_CABINET_DEPTH_MM,
);

export const ALL_RULE_IDS: readonly string[] =
  SAMPLE_PRICE_BOOK.cabinetRules.map(({ ruleId }) => ruleId);

export function ruleIn(book: PriceBook, ruleId: string): CabinetPriceRule {
  const found = book.cabinetRules.find((rule) => rule.ruleId === ruleId);
  if (found === undefined) throw new Error(`the book holds no ${ruleId}`);
  return found;
}

export interface PreviewAsk {
  readonly material: string;
  readonly isDeep: boolean;
  readonly hardwareTier?: string;
  readonly heightMm?: number;
}

/** `previewCabinet` asked afresh, for the book and the catalogue given here. */
export function independentPreview(
  book: PriceBook,
  ruleId: string,
  ask: PreviewAsk,
): readonly PreviewRow[] {
  const preview = previewCabinet({
    rule: ruleIn(book, ruleId),
    catalog: INDEPENDENT_CATALOGUE,
    book,
    material: ask.material,
    depth: ask.isDeep ? DEEP_CABINET_DEPTH_MM : DEFAULT_CABINET_DEPTH_MM,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    ...(ask.hardwareTier === undefined
      ? {}
      : { hardwareTier: ask.hardwareTier }),
    ...(ask.heightMm === undefined ? {} : { heightMm: ask.heightMm }),
  });
  if (!preview.ok) throw new Error(`${ruleId}: ${preview.code}`);
  return preview.rows;
}

/** The book with draft changes applied, or a failure that names it: a test never prices a book that is not one. */
export function bookWith(
  changes: readonly DraftChange[],
  book: PriceBook = SAMPLE_PRICE_BOOK,
): PriceBook {
  const applied = applyChanges(book, changes);
  if (!applied.ok)
    throw new Error(`the changes make no book: ${applied.reason}`);
  return applied.book;
}

/** What a table row reads, cell by cell, as the page drew it: the `data-role` of each price cell says which it is. */
export interface DrawnRow {
  readonly widthText: string;
  readonly active: readonly string[];
  readonly next: readonly string[];
}

export function drawnRows(container: HTMLElement): readonly DrawnRow[] {
  return allIn(container, '[data-testid="cabinet-preview"] tbody tr').map(
    (row) => ({
      widthText: row.querySelector("th")?.textContent.trim() ?? "",
      active: allIn(row, 'td[data-role="active"]').map((cell) =>
        cell.textContent.trim(),
      ),
      next: allIn(row, 'td[data-role="next"]').map((cell) =>
        cell.textContent.trim(),
      ),
    }),
  );
}

/** A kitchen of one cabinet at one width, priced by the whole query: the customer's side of a preview cell. */
export function priceOneCabinet(
  cabinet: {
    readonly buildId: string;
    readonly widthMm: number;
    readonly heightMm: number;
    readonly y0Mm: number;
  },
  setting: {
    readonly book: PriceBook;
    readonly isDeep: boolean;
    readonly materialTierId: string;
    readonly hardwareTierId: string;
  },
): PricedDesign {
  const depthMm = setting.isDeep
    ? DEEP_CABINET_DEPTH_MM
    : DEFAULT_CABINET_DEPTH_MM;
  const design: Design = {
    ...KITCHEN_L_DESIGN,
    settings: { cabinetDepthMm: depthMm },
    placements: [
      {
        id: "p-qa-u3",
        wall: "A",
        alongMm: 2000,
        y0Mm: cabinet.y0Mm,
        body: {
          buildId: cabinet.buildId,
          widthMm: cabinet.widthMm,
          heightMm: cabinet.heightMm,
        },
      },
    ],
  };
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(depthMm),
    book: setting.book,
    pricingVersion: setting.book.version,
    selections: {
      materialTierId: setting.materialTierId,
      hardwareTierId: setting.hardwareTierId,
    },
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) throw new Error(result.failure.code);
  return result.priced;
}

export function hardwareLineMinor(priced: PricedDesign): number {
  return priced.lines.find(({ kind }) => kind === "hardware")?.amountMinor ?? 0;
}
