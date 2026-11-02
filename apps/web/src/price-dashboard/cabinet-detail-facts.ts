import {
  buildableHeightsMm,
  countHardwareMechanisms,
  declaresASink,
  DEFAULT_CABINET_DEPTH_MM,
  DEEP_CABINET_DEPTH_MM,
  displayEntryOf,
  EXTRACTOR_HOOD_KIND,
  NO_DECLARED_HEIGHT_MM,
  occupiedDepthOfEntryM,
  previewCabinet,
  pricedRowOf,
  toMillimetres,
  WIDTH_STEP_MM,
  isAnchoredShape,
  type BodyCatalog,
  type CabinetPriceRule,
  type DefaultWidthSource,
  type PreviewRow,
  type PriceBook,
  type PricedRow,
} from "@lemnaria/configurator-domain";

import { shippedDeepeningRows } from "@/price/deepening-rows";

import type { ListedWidth } from "./cabinet-detail-fields";
import type { CabinetRuleFacts, CabinetWidthRange } from "./cabinet-list-model";
import {
  priceDashboardCatalogue,
  priceDashboardCatalogueAtDeepDepth,
} from "./price-dashboard-catalogue";

// What the cabinet's page states about the cabinet apart from its price: catalogue dimensions, doors, drawers, the door
// step and the hardware readout. Every figure is the catalogue's or a row of `previewCabinet`.

export type DetailHeight =
  | { readonly kind: "fixed"; readonly heightMm: number }
  | {
      readonly kind: "opening";
      readonly heightMm: number;
      readonly maxMm: number;
    };

export interface DetailDimensions {
  readonly defaultWidth: {
    readonly widthMm: number;
    readonly source: DefaultWidthSource;
    readonly isProposed: boolean;
  };
  readonly widths: CabinetWidthRange;
  /** The catalogue's width step; present only for a row that takes any width in a range. */
  readonly stepMm: number | undefined;
  readonly height: DetailHeight | undefined;
  readonly shallowDepth: DetailDepth;
  readonly deepDepth: DetailDepth;
}

/** The finished depth of the cabinet in a kitchen of `kitchenDepthMm`. */
export interface DetailDepth {
  readonly kitchenDepthMm: number;
  readonly depthMm: number;
}

export type DetailDoors =
  | { readonly kind: "none" }
  | { readonly kind: "fixed"; readonly leaves: number }
  | {
      readonly kind: "stepped";
      readonly lowLeaves: number;
      readonly highLeaves: number;
      readonly fromMm: number;
    };

/** Where the price steps because a door leaf is added, and by how many leaves. */
export interface DoorStep {
  readonly atMm: number;
  readonly leaves: number;
  /** The step falls at or below the anchor's width, so the anchor carries the more leaves. */
  readonly isBelowAnchor: boolean;
}

export interface HardwareReadout {
  readonly widthMm: number;
  readonly tierName: {
    readonly authored: string;
    readonly key: string | undefined;
  };
  readonly hinges: number;
  readonly drawers: number;
  readonly amountMinor: number;
}

export interface CabinetDetailFacts {
  readonly ruleId: string;
  readonly buildId: string;
  readonly name: string;
  readonly group: CabinetRuleFacts["group"];
  readonly isCustomerSupplied: boolean;
  readonly isStructural: boolean;
  readonly isHood: boolean;
  readonly holdsSink: boolean;
  readonly dimensions: DetailDimensions;
  readonly doors: DetailDoors;
  readonly drawers: number;
  readonly hasHandle: boolean;
  readonly canColour: boolean;
  readonly doorStep: DoorStep | undefined;
  readonly hardware: HardwareReadout | undefined;
  /** The priced-as row deepens in a deep kitchen and the manufacturer supplies it. */
  readonly canDeepen: boolean;
  /** The widths the cabinet is built at, with the grid width each is priced as. */
  readonly listedWidths: readonly ListedWidth[];
}

/** The facts of one cabinet in the active book; `undefined` for a rule the catalogue does not hold. */
export function describeCabinet(
  book: PriceBook,
  rule: CabinetPriceRule,
  listed: CabinetRuleFacts,
): CabinetDetailFacts | undefined {
  const catalog = priceDashboardCatalogue();
  const row = pricedRowOf(catalog, rule.buildId);
  if (row === undefined) return undefined;
  const rows = defaultPreviewRows(book, rule, catalog);
  const isCustomerSupplied = rule.suppliedBy === "customer";
  return {
    ruleId: rule.ruleId,
    buildId: rule.buildId,
    name: listed.name,
    group: listed.group,
    isCustomerSupplied,
    isStructural: listed.isStructural,
    isHood: isCustomerSupplied && row.definition.kind === EXTRACTOR_HOOD_KIND,
    holdsSink: declaresASink(row.definition),
    dimensions: dimensionsOf(row, listed),
    doors: doorsOf(rows),
    drawers: countsAt(rule, row, catalog, listed.widths.defaultMm).drawers,
    hasHandle: row.definition.canHandle,
    canColour: row.definition.canFinish,
    doorStep: doorStepOf(rule, rows),
    hardware: isCustomerSupplied ? undefined : hardwareOf(book, rule, listed),
    canDeepen: !isCustomerSupplied && shippedDeepeningRows().has(row.buildId),
    listedWidths: rows.map(({ widthMm, pricedAsWidthMm }) => ({
      widthMm,
      pricedAsWidthMm,
    })),
  };
}

/** The table at the book's default material and depth: the widths the cabinet is built at, with their door leaves. */
function defaultPreviewRows(
  book: PriceBook,
  rule: CabinetPriceRule,
  catalog: BodyCatalog,
): readonly PreviewRow[] {
  const preview = previewCabinet({
    rule,
    catalog,
    book,
    material: book.material.defaultTierId,
    depth: DEFAULT_CABINET_DEPTH_MM,
    deepeningRows: shippedDeepeningRows(),
  });
  return preview.ok ? preview.rows : [];
}

function dimensionsOf(
  row: PricedRow,
  listed: CabinetRuleFacts,
): DetailDimensions {
  const { widths } = listed;
  const { definition } = row;
  return {
    defaultWidth: {
      widthMm: widths.defaultMm,
      source: definition.defaultWidthSource ?? "only-width",
      isProposed: widths.isDefaultProposed,
    },
    widths: widths.range,
    stepMm: widths.range.kind === "range" ? WIDTH_STEP_MM : undefined,
    height: heightOf(row),
    shallowDepth: depthAt(
      row.buildId,
      priceDashboardCatalogue(),
      DEFAULT_CABINET_DEPTH_MM,
    ),
    deepDepth: depthAt(
      row.buildId,
      priceDashboardCatalogueAtDeepDepth(),
      DEEP_CABINET_DEPTH_MM,
    ),
  };
}

function depthAt(
  buildId: string,
  catalog: BodyCatalog,
  kitchenDepthMm: number,
): DetailDepth {
  const definition = catalog.get(buildId);
  const depthM =
    definition === undefined
      ? Number.NaN
      : occupiedDepthOfEntryM({ buildId, definition });
  return { kitchenDepthMm, depthMm: toMillimetres(depthM) };
}

function heightOf(row: PricedRow): DetailHeight | undefined {
  const heights = buildableHeightsMm(row);
  const [first] = heights;
  if (first === undefined || first === NO_DECLARED_HEIGHT_MM) return undefined;
  if (row.definition.heightFlex !== true) {
    return { kind: "fixed", heightMm: first };
  }
  const nominalMm = row.definition.nominalHeightMm ?? first;
  return {
    kind: "opening",
    heightMm: nominalMm,
    maxMm: heights[heights.length - 1] ?? nominalMm,
  };
}

function doorsOf(rows: readonly PreviewRow[]): DetailDoors {
  const [first] = rows;
  if (first === undefined || rows.every((row) => row.doorLeaves === 0)) {
    return { kind: "none" };
  }
  const changed = rows.find((row) => row.doorLeaves !== first.doorLeaves);
  const last = rows[rows.length - 1] ?? first;
  if (changed === undefined) return { kind: "fixed", leaves: first.doorLeaves };
  return {
    kind: "stepped",
    lowLeaves: first.doorLeaves,
    highLeaves: last.doorLeaves,
    fromMm: changed.widthMm,
  };
}

function doorStepOf(
  rule: CabinetPriceRule,
  rows: readonly PreviewRow[],
): DoorStep | undefined {
  const index = rows.findIndex((row) => row.isDoorStep);
  const step = rows[index];
  const before = rows[index - 1];
  if (step === undefined || before === undefined) return undefined;
  const { formula } = rule;
  const anchorMm = isAnchoredShape(formula.shape)
    ? (formula as { readonly anchorWidthMm: number }).anchorWidthMm
    : undefined;
  return {
    atMm: step.widthMm,
    leaves: step.doorLeaves - before.doorLeaves,
    isBelowAnchor: anchorMm !== undefined && step.widthMm <= anchorMm,
  };
}

/** The mechanisms a body of this row carries at one width, at the height the preview reads the cabinet at. */
function countsAt(
  rule: CabinetPriceRule,
  row: PricedRow,
  catalog: BodyCatalog,
  widthMm: number,
) {
  return countHardwareMechanisms(
    [displayEntryOf(row, { widthMm, heightMm: readHeightMmOf(rule, row) })],
    catalog,
  );
}

/** The height `previewCabinet` reads a cabinet at when it is not given one: the formula's anchor, else the first built. */
function readHeightMmOf(rule: CabinetPriceRule, row: PricedRow): number {
  const { formula } = rule;
  const anchorHeightMm = isAnchoredShape(formula.shape)
    ? (formula as { readonly anchorHeightMm?: number }).anchorHeightMm
    : undefined;
  return anchorHeightMm ?? buildableHeightsMm(row)[0] ?? NO_DECLARED_HEIGHT_MM;
}

/** What the default hardware class adds to the cabinet at its default width: the mechanisms and their `r10` amount. */
function hardwareOf(
  book: PriceBook,
  rule: CabinetPriceRule,
  listed: CabinetRuleFacts,
): HardwareReadout | undefined {
  const catalog = priceDashboardCatalogue();
  const row = pricedRowOf(catalog, rule.buildId);
  const tier = book.hardware.tiers.find(
    ({ tierId }) => tierId === book.hardware.defaultTierId,
  );
  if (row === undefined || tier === undefined) return undefined;
  const { defaultMm } = listed.widths;
  const counts = countsAt(rule, row, catalog, defaultMm);
  if (counts.hinges === 0 && counts.drawers === 0) return undefined;
  const preview = previewCabinet({
    rule,
    catalog,
    book,
    material: book.material.defaultTierId,
    depth: DEFAULT_CABINET_DEPTH_MM,
    deepeningRows: shippedDeepeningRows(),
    hardwareTier: tier.tierId,
  });
  const atDefault = preview.ok
    ? preview.rows.find(({ widthMm }) => widthMm === defaultMm)
    : undefined;
  if (atDefault?.hardwareMinor === undefined) return undefined;
  return {
    widthMm: defaultMm,
    tierName: { authored: tier.name, key: tier.nameKey },
    hinges: counts.hinges,
    drawers: counts.drawers,
    amountMinor: atDefault.hardwareMinor,
  };
}
