import {
  anchoredShapeReadsHeight,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  isAnchoredFormula,
  normaliseBand,
  previewCabinet,
  pricedRowOf,
  type BodyCatalog,
  type CabinetPriceRule,
  type MaterialTier,
  type PreviewRow,
  type PriceBook,
  type PricedRow,
} from "@lemnaria/configurator-domain";

import { shippedDeepeningRows } from "@/price/deepening-rows";

import { ruleIn } from "./cabinet-detail-fields";
import { isCountOfBani } from "./format-lei";
import { priceDashboardCatalogue } from "./price-dashboard-catalogue";

// What the cabinet costs at every width, in the active version and in the one the typed amounts make. Every figure is a
// cell of `previewCabinet`; this module chooses the requests and lays the answers side by side.

export interface PreviewControls {
  readonly withHardware: boolean;
  readonly hardwareTierId: string;
  readonly isDeepKitchen: boolean;
}

export type PreviewColumn =
  | {
      readonly kind: "material";
      readonly tierId: string;
      readonly name: {
        readonly authored: string;
        readonly key: string | undefined;
      };
      /** In the active version. */
      readonly percent: number;
      /** In the version the draft makes, where it differs from the active one. */
      readonly pendingPercent: number | undefined;
      readonly isDefault: boolean;
    }
  | {
      readonly kind: "height";
      readonly heightMm: number;
      readonly role: "wall" | "top" | "other";
    };

export interface PreviewCell {
  /** Absent where the active version prices the width at or below zero, which no screen draws as a figure. */
  readonly activeMinor: number | undefined;
  /** The price the typed amounts make; absent while they make none. */
  readonly nextMinor: number | undefined;
}

export interface PreviewTableRow {
  readonly widthMm: number;
  readonly pricedAsWidthMm: number;
  readonly isOffGridMinimum: boolean;
  readonly doorLeaves: number;
  readonly isDoorStep: boolean;
  readonly cells: readonly PreviewCell[];
}

export interface PreviewTable {
  readonly columns: readonly PreviewColumn[];
  readonly rows: readonly PreviewTableRow[];
  /** Some row steps by a door leaf, so the table carries the doors' column. */
  readonly hasDoorColumn: boolean;
}

export interface PreviewBooks {
  readonly active: PriceBook;
  /** The active book with the draft applied: where the percentages the new column is priced at come from. */
  readonly draft: PriceBook;
  /** The book the typed amounts make; absent while they make none. */
  readonly typed: PriceBook | undefined;
}

/** What the deep kitchen adds to the cabinets that get deeper: in the active version, and in the one the draft makes. */
export interface DepthPercents {
  readonly active: number;
  readonly pending: number;
}

export function depthPercentsOf({
  active,
  draft,
}: Pick<PreviewBooks, "active" | "draft">): DepthPercents {
  return {
    active: active.depthRule.deepCabinetPercent,
    pending: draft.depthRule.deepCabinetPercent,
  };
}

/** The table for one rule, or `undefined` when the active version cannot be drawn at all. */
export function previewTableOf(
  books: PreviewBooks,
  ruleId: string,
  controls: PreviewControls,
): PreviewTable | undefined {
  const catalog = priceDashboardCatalogue();
  const rule = ruleIn(books.active, ruleId);
  const row =
    rule === undefined ? undefined : pricedRowOf(catalog, rule.buildId);
  if (rule === undefined || row === undefined) return undefined;
  const lines = columnsOf(books, rule, row, catalog).flatMap((column) => {
    const line = lineOf(books, ruleId, column, controls);
    return line === undefined ? [] : [{ column, ...line }];
  });
  const [first] = lines;
  if (first === undefined) return undefined;
  return {
    columns: lines.map(({ column }) => column),
    rows: first.active.map((row, index) => ({
      widthMm: row.widthMm,
      pricedAsWidthMm: row.pricedAsWidthMm,
      isOffGridMinimum: row.isOffGridMinimum,
      doorLeaves: row.doorLeaves,
      isDoorStep: row.isDoorStep,
      cells: lines.map(({ active, next }) => ({
        activeMinor: drawablePriceOf(active[index]),
        nextMinor: next?.[index]?.priceMinor,
      })),
    })),
    hasDoorColumn: first.active.some(({ isDoorStep }) => isDoorStep),
  };
}

function columnsOf(
  { active, draft }: PreviewBooks,
  rule: CabinetPriceRule,
  row: PricedRow,
  catalog: BodyCatalog,
): readonly PreviewColumn[] {
  const heights = heightColumnsOf(rule, row, catalog);
  if (heights.length > 1) return heights;
  return active.material.tiers.map((tier) => ({
    kind: "material",
    tierId: tier.tierId,
    name: { authored: tier.name, key: tier.nameKey },
    percent: tier.percentOfCabinets,
    pendingPercent: pendingPercentOf(tier, draft),
    isDefault: tier.tierId === active.material.defaultTierId,
  }));
}

function pendingPercentOf(
  tier: MaterialTier,
  draft: PriceBook,
): number | undefined {
  const pending = draft.material.tiers.find(
    ({ tierId }) => tierId === tier.tierId,
  )?.percentOfCabinets;
  return pending === tier.percentOfCabinets ? undefined : pending;
}

/**
 * The heights a cabinet built to its opening is priced at: the wall row's own and the top row's, the height of the
 * lowest top-band body the catalogue prices as this row. A row that does not price by height has none.
 */
function heightColumnsOf(
  rule: CabinetPriceRule,
  row: PricedRow,
  catalog: BodyCatalog,
): readonly PreviewColumn[] {
  const { formula } = rule;
  if (!isAnchoredFormula(formula) || !anchoredShapeReadsHeight(formula.shape)) {
    return [];
  }
  const wallMm = formula.anchorHeightMm;
  if (wallMm === undefined) return [];
  const topMm = topRowHeightMmOf(row, catalog);
  const isWall = normaliseBand(row.definition.band) === "wall";
  const wall: PreviewColumn = {
    kind: "height",
    heightMm: wallMm,
    role: isWall ? "wall" : "other",
  };
  if (topMm === undefined || topMm === wallMm) return [wall];
  return [
    wall,
    { kind: "height", heightMm: topMm, role: isWall ? "top" : "other" },
  ];
}

function topRowHeightMmOf(
  row: PricedRow,
  catalog: BodyCatalog,
): number | undefined {
  const heights = [...catalog]
    .filter(
      ([buildId, definition]) =>
        definition.band === "top" &&
        pricedRowOf(catalog, buildId)?.buildId === row.buildId,
    )
    .flatMap(([, definition]) =>
      definition.frameHeightMm === undefined ? [] : [definition.frameHeightMm],
    );
  return heights.length === 0 ? undefined : Math.min(...heights);
}

interface ColumnLine {
  readonly active: readonly PreviewRow[];
  readonly next: readonly PreviewRow[] | undefined;
}

function lineOf(
  books: PreviewBooks,
  ruleId: string,
  column: PreviewColumn,
  controls: PreviewControls,
): ColumnLine | undefined {
  const active = rowsIn(books.active, ruleId, column, controls);
  if (active === undefined) return undefined;
  const next =
    books.typed === undefined
      ? undefined
      : rowsIn(books.typed, ruleId, column, controls);
  return { active, next: next?.every(isDrawable) ? next : undefined };
}

/** A price the table can write: the screen never draws a figure that is not a count of bani. */
function isDrawable(row: PreviewRow): boolean {
  return isCountOfBani(row.priceMinor);
}

function drawablePriceOf(row: PreviewRow | undefined): number | undefined {
  return row !== undefined && isDrawable(row) ? row.priceMinor : undefined;
}

function rowsIn(
  book: PriceBook,
  ruleId: string,
  column: PreviewColumn,
  controls: PreviewControls,
): readonly PreviewRow[] | undefined {
  const rule = ruleIn(book, ruleId);
  if (rule === undefined) return undefined;
  const preview = previewCabinet({
    rule,
    catalog: priceDashboardCatalogue(),
    book,
    material:
      column.kind === "material" ? column.tierId : book.material.defaultTierId,
    depth: controls.isDeepKitchen
      ? DEEP_CABINET_DEPTH_MM
      : DEFAULT_CABINET_DEPTH_MM,
    deepeningRows: shippedDeepeningRows(),
    ...(controls.withHardware ? { hardwareTier: controls.hardwareTierId } : {}),
    ...(column.kind === "height" ? { heightMm: column.heightMm } : {}),
  });
  return preview.ok ? preview.rows : undefined;
}
