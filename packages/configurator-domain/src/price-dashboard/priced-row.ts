import { widthDerivedDoorLeafCount } from "../cabinet-handles.js";
import {
  resolveCatalogEquivalent,
  resolveWidthRangesMm,
  toInsertableBody,
} from "../catalog.js";
import {
  CABINET_SIZED_OPENING_MAX_M,
  HEIGHT_FLEX_MIN_OPENING_MM,
} from "../commands/insert-fit.js";
import {
  cornerAssemblyWidthsMm,
  type CornerAssemblyPiece,
} from "../corner-assembly-size.js";
import type { DesignRoom } from "../design.js";
import { doorLeafCount, frontPopulationQueryFor } from "../front-population.js";
import { toMillimetres } from "../millimetres.js";
import {
  PRICE_STEP_MM,
  roundUpToPriceStepMm,
} from "../pricing/anchored-price-formula.js";
import {
  amountForBody,
  type PriceFormula,
  type PricedBody,
} from "../pricing/price-book.js";
import { WORKTOP_DEPTH_MM } from "../worktop-depth.js";
import type { BodyCatalog, BodyDefinition } from "../void-engine.js";

// What a price rule says about a catalogue row at one built size, shared by the book's judgement and the cabinet preview
// so the two read the same widths, the same heights and the same leaves. It builds the `PricedBody` the way
// `describePricedBody` in `pricing/price-design.ts` does for a placed body (that function is private to the query), and
// the one exact amount comes from `amountForBody`. A test holds this mirror to `priceDesign` on a one-cabinet design.

/** A catalogue row a rule prices: the row a body is priced as (ADR 0022), with its definition. */
export interface PricedRow {
  readonly buildId: string;
  readonly definition: BodyDefinition;
}

/** The size a body is built at, in whole millimetres. */
export interface BuiltSize {
  readonly widthMm: number;
  readonly heightMm: number;
}

/** The width a structural corner row is built at, by build id. The catalogue states none (the corner is sized from the
 *  room), so a caller holding another answer supplies it. */
export type BuiltWidthsMm = ReadonlyMap<string, number>;

/** The row a build id is priced as: its catalogue equivalent where it declares one, itself where it does not (the six
 *  structural corners). `undefined` for an id the catalogue does not hold. */
export function pricedRowOf(
  catalog: BodyCatalog,
  buildId: string,
): PricedRow | undefined {
  const equivalent = resolveCatalogEquivalent(catalog, buildId);
  if (equivalent !== undefined) return equivalent;
  const definition = catalog.get(buildId);
  return definition === undefined ? undefined : { buildId, definition };
}

/** Every row some body of the catalogue is priced as, each once, in catalogue order. */
export function listPricedRows(catalog: BodyCatalog): readonly PricedRow[] {
  const rows = new Map<string, PricedRow>();
  for (const buildId of catalog.keys()) {
    const row = pricedRowOf(catalog, buildId);
    if (row !== undefined && !rows.has(row.buildId)) {
      rows.set(row.buildId, row);
    }
  }
  return [...rows.values()];
}

/** Whether a customer can insert this row, as against one the catalogue only seeds (the six corners). */
export function isInsertableRow(row: PricedRow): boolean {
  return row.definition.insertable === true;
}

/** The exact amount a formula prices a row at, at one built size, or `undefined` for a shape this build cannot evaluate.
 *  Throws what `amountForBody` throws. */
export function exactAmountOf(
  formula: PriceFormula,
  row: PricedRow,
  size: BuiltSize,
): number | undefined {
  return amountForBody(formula, pricedBodyOf(row, size));
}

/** The leaves the row's body carries when built at this size: the count the door step and the hinges both bill. */
export function doorLeavesOf(row: PricedRow, size: BuiltSize): number {
  return doorLeafCount(
    frontPopulationQueryFor({
      body: { buildId: row.buildId, ...size },
      definition: row.definition,
    }),
  );
}

function pricedBodyOf(row: PricedRow, size: BuiltSize): PricedBody {
  return {
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    doorLeafCount: widthDerivedDoorLeafCount({
      buildId: row.buildId,
      rule: row.definition.cabinetHandles,
      widthMm: size.widthMm,
    }),
    doorLeafCountAt: (widthMm) =>
      doorLeavesOf(row, { widthMm, heightMm: size.heightMm }),
    builtDoorLeafCount: () => doorLeavesOf(row, size),
  };
}

/**
 * Every width a body of this row can be built at, ascending, with the widths a price can change between kept: each
 * range's own minimum and maximum (off the pricing grid, such a width is priced as the step above it), every step of the
 * pricing grid inside it, and the lowest width that rounds up to each step, since a door leaf is counted at the built
 * width and not the rounded one (ADR 0177 A-3). A structural row is built at one width, which the caller supplies.
 */
export function buildableWidthsMm(
  row: PricedRow,
  builtWidthsMm: BuiltWidthsMm,
): readonly number[] {
  const insertable = toInsertableBody(row.buildId, row.definition);
  if (insertable === undefined) {
    const builtMm = builtWidthsMm.get(row.buildId);
    return builtMm === undefined ? [] : [builtMm];
  }
  const widths = new Set<number>();
  for (const range of resolveWidthRangesMm(insertable)) {
    widthsOfRange(range).forEach((widthMm) => widths.add(widthMm));
  }
  return [...widths].sort((left, right) => left - right);
}

function widthsOfRange(range: {
  readonly minMm: number;
  readonly maxMm: number;
}): readonly number[] {
  const widths = [range.minMm, range.maxMm];
  const firstStepMm = roundUpToPriceStepMm(range.minMm);
  for (
    let stepMm = firstStepMm;
    stepMm <= range.maxMm;
    stepMm += PRICE_STEP_MM
  ) {
    widths.push(stepMm, Math.max(range.minMm, stepMm - PRICE_STEP_MM + 1));
  }
  return widths;
}

/** The pricing-grid widths of a row, ascending: what the dashboard lists. An off-grid minimum is kept, flagged by the
 *  caller; a width that is only a leaf-count probe is not. */
export function listedWidthsMm(
  row: PricedRow,
  builtWidthsMm: BuiltWidthsMm,
): readonly number[] {
  const widths = buildableWidthsMm(row, builtWidthsMm);
  const minimumMm = widths[0];
  return widths.filter(
    (widthMm) => widthMm % PRICE_STEP_MM === 0 || widthMm === minimumMm,
  );
}

/** Every height a body of this row is built at: a row built to its opening takes any opening from the floor to the
 *  cabinet-sized ceiling (DEVELOPMENT-SPEC §5.2, §9), on the pricing grid; any other has its one nominal height. */
export function buildableHeightsMm(row: PricedRow): readonly number[] {
  if (row.definition.heightFlex === true) return flexibleHeightsMm();
  const { nominalHeightMm, frameHeightMm } = row.definition;
  return [nominalHeightMm ?? frameHeightMm ?? NO_DECLARED_HEIGHT_MM];
}

/** A row that declares no height is read at none: only a formula that prices by height asks for one, and that refuses. */
const NO_DECLARED_HEIGHT_MM = 0;

function flexibleHeightsMm(): readonly number[] {
  const heights: number[] = [];
  const ceilingMm = toMillimetres(CABINET_SIZED_OPENING_MAX_M);
  for (
    let heightMm = HEIGHT_FLEX_MIN_OPENING_MM;
    heightMm <= ceilingMm;
    heightMm += PRICE_STEP_MM
  ) {
    heights.push(heightMm);
  }
  return heights;
}

// ---------------------------------------------------------------------------------------------------------------------
// The structural corners' built widths

/** Which piece of the corner assembly each structural corner row is (`corner-assembly-size.ts`). The six ids are the
 *  ones the price book keys its corner rules on. */
const CORNER_PIECE_OF_BUILD_ID: Readonly<Record<string, CornerAssemblyPiece>> =
  {
    "base-corner-x-900": { wall: "A", band: "base" },
    "base-corner-return-320": { wall: "B", band: "base" },
    "wall-corner-x-900": { wall: "A", band: "wall" },
    "wall-corner-x-900-top": { wall: "A", band: "top" },
    "wall-corner-return-570": { wall: "B", band: "wall" },
    "wall-corner-return-570-top": { wall: "B", band: "top" },
  };

/** A room no wall of which constrains a corner, so the widths read are the assembly's reference ones, the widest a
 *  corner is ever built (a smaller room only narrows it, and a narrower body prices under the same listed size). */
const UNCONSTRAINING_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 20_000,
  depthMm: 20_000,
  heightMm: 2_600,
};

let referenceWidths: BuiltWidthsMm | undefined;

/**
 * The widest each structural corner row is built, from the corner assembly at the declared depth in a room that
 * does not narrow it: 900 on the wall-A pieces, 330 on the wall-B base return (its id says 320; ADR 0135), 570 on the
 * wall-B upper returns. Computed on first use: `corner-assembly-size.ts` imports the catalogue.
 */
export function referenceCornerBuiltWidthsMm(): BuiltWidthsMm {
  referenceWidths ??= measuredCornerWidths();
  return referenceWidths;
}

function measuredCornerWidths(): BuiltWidthsMm {
  const assembly = cornerAssemblyWidthsMm({
    cabinetDepthMm: WORKTOP_DEPTH_MM,
    room: UNCONSTRAINING_ROOM,
  });
  const widths = new Map<string, number>();
  for (const [buildId, piece] of Object.entries(CORNER_PIECE_OF_BUILD_ID)) {
    const sized = assembly.pieces.find(
      ({ wall, band }) => wall === piece.wall && band === piece.band,
    );
    if (sized !== undefined) widths.set(buildId, sized.widthMm);
  }
  return widths;
}
