// The price breakdown as a value: this module owns every rule and string, the component the markup.
//
// The rows are the `projectDesignForDisplay` groups in its order, and nothing here sorts, groups or
// labels. The groups are the only source of rows, so a design that priced bodies nobody placed is
// refused (`PriceBreakdownDivergenceError`), not rendered short; reading the rows off `priced.lines`
// instead would give a plausible list with the projection deleted.
//
// Row-major within a group: the whole hanging row left to right, then the whole top row
// ([ADR 0063](../../../../docs/decisions/0063-a-group-is-listed-row-major-height-before-position.md)).
//
// The priced lines add to the priced total exactly, each rounded to ten lei at the domain's one seam (ADR 0177 A-1).
// A line is shown at that ten lei (`describeLineAmount`); the total is shown rounded up to the thousand MDL
// (`describeStartingPrice`), so shown lines and a shown total need not sum (owner ruling 2026-10-28). Nothing here
// adds a subtotal, an equality claim, or a row labelled *total*.
import {
  MAX_DEEP_CABINET_PERCENT,
  type AccessoryPriceLine,
  type CabinetPriceLine,
  type DepthPriceLine,
  type DisplayEntry,
  type DisplayGroup,
  type PricedDesign,
  type PriceLine,
  type PricingResult,
  type WholeKitchenPriceLine,
} from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";

import {
  describeFlaggedTotalWarning,
  describeLineAmount,
  describeStartingPrice,
  type PriceFigure,
  holdsNoCabinets,
} from "./starting-price";

/** One line of the breakdown. `key` is the id it traces back to (a placement id, or a line id for a
 *  whole-kitchen tier), never a list position. */
export interface BreakdownRow {
  readonly key: string;
  readonly label: string;
  /** Shown to the ten lei and grouped: *"inclus"* at zero, *"nu este inclus"* on a body the manufacturer
   *  does not supply (decided by `describeRowAmount` and `describeCabinetRowAmount`). */
  readonly amountText: string;
}

/** One of the projection's groups, rendered, with its bodies in the order they arrived. */
export interface BreakdownGroup {
  readonly key: string;
  readonly heading: string;
  readonly rows: readonly BreakdownRow[];
}

/** The uplift a 700 mm depth adds to the cabinets that get deeper, as the row of its own that every surface lists by:
 *  worded once by `describeDepthLine` from the priced line, the amount being the line's own. A row carrying `scope`,
 *  so it also fits a listing of whole-kitchen rows (`WholeKitchenListingRow`). */
export interface BreakdownDepthLine {
  readonly key: string;
  /** "Adâncime 700 mm · adaos {percent} %", the percent being the one the line was priced with. */
  readonly label: string;
  /** Which cabinets the percent applies to: the second line of the row. */
  readonly scope: string;
  /** Shown to the ten lei and grouped, *"inclus"* at zero (a book stating 0 %). */
  readonly amountText: string;
}

/** A whole-kitchen row as a surface lists it: the tier and accessory rows as built, and the depth line, the only one
 *  to carry `scope`, among them. */
export interface WholeKitchenListingRow extends BreakdownRow {
  readonly scope?: string;
}

/** The depth line and where it is listed, present exactly when the priced design carries a depth line. Absent, never
 *  zero, at 600 mm, so a surface that ignores it still prints every line that is not the uplift. */
export interface DepthLineFields {
  readonly depthLine?: BreakdownDepthLine;
  /** The key of the material row the builder produced, the one whose percent the depth line multiplies with: the row
   *  the line is listed after. Absent when no material row was built, which `listWholeKitchenRows` refuses. */
  readonly depthLineAfterKey?: string;
}

/** The whole-kitchen rows as built and the depth line to list among them: a breakdown, a review, anything with both. */
export interface WholeKitchenRowSet extends DepthLineFields {
  readonly wholeKitchenRows: readonly BreakdownRow[];
}

/** Nothing is rendered and no control offers it: a breakdown of a total that could not be computed
 *  would be a longer version of an invented number. */
export interface UnavailableBreakdown {
  readonly kind: "unavailable";
}

export interface AvailableBreakdown {
  readonly kind: "available";
  readonly title: string;
  /** The exclusions and the on-site measurement, ADR 0036 decision 3's worktop among them. */
  readonly disclaimer: string;
  readonly groups: readonly BreakdownGroup[];
  /** Hardware and material, then the accessories billed per sink, after every placement row. Empty
   *  is a real answer: an accessory the design earns none of is no row, since the query publishes no
   *  line for it rather than a zero that would render *inclus*. */
  readonly wholeKitchenRows: readonly BreakdownRow[];
  /** `wholeKitchenRows` with the depth line listed directly after the material row (`listWholeKitchenRows`): what the
   *  sheet draws. The depth line is the one row carrying `scope`, present exactly when the query published one: a
   *  700 mm kitchen with a cabinet that gets deeper. `wholeKitchenRows` itself stays the tiers and the accessories. */
  readonly wholeKitchenListing: readonly WholeKitchenListingRow[];
  /** The sentence that says the amounts shown are estimates, not an offer. */
  readonly note: string;
  /** The bar's figure, restated because on mobile this sheet covers the bar. Not a sum of the rows,
   *  and labelled *De la* rather than *total* so it cannot read as one. */
  readonly figure: PriceFigure;
  /** ADR 0065 decision 6: the flag travels with the total. Absent, never empty, when nothing overflows. */
  readonly overflowWarning?: string;
  readonly closeLabel: string;
}

export type PriceBreakdownView = UnavailableBreakdown | AvailableBreakdown;

export interface DescribePriceBreakdownInput {
  readonly content: Content;
  /** The current design priced, as `usePricedDesign` derived it this render. */
  readonly pricing: PricingResult;
  /** `projectDesignForDisplay`'s answer for the same design, verbatim: the only source of which rows
   *  exist, their order and their names. */
  readonly groups: readonly DisplayGroup[];
}

/**
 * The priced design and the projection disagree about which bodies the design holds. Unreachable
 * while both read the same document, so it throws rather than rendering the intersection: a body
 * missing reads as a cheaper kitchen, an extra one as a body the customer does not own.
 */
export class PriceBreakdownDivergenceError extends Error {
  constructor(placementIds: readonly string[]) {
    super(
      "The breakdown and the priced design name different placements; " +
        `no row could be built for: ${placementIds.join(", ")}`,
    );
    this.name = "PriceBreakdownDivergenceError";
  }
}

/**
 * A depth line with no material row to list it after. Both come from one pricing, so this is a defect; thrown, not
 * rendered with the line dropped or put first: the total counts the uplift, so a sheet that lost the line would show
 * rows that explain less than the figure beside them.
 */
export class DepthLineWithoutMaterialRowError extends Error {
  constructor(depthLineKey: string) {
    super(
      "The priced design holds a depth line but no material row to list it after; " +
        `both come from one pricing: ${depthLineKey}`,
    );
    this.name = "DepthLineWithoutMaterialRowError";
  }
}

/** A line id is the key of a row and is named in errors: a few characters of word, colon and hyphen, never a break or
 *  markup. */
const LINE_ID_SHAPE = /^[A-Za-z0-9:_-]+$/u;

/** Stands for a refused id in the error, which must not carry the stored text. */
const REFUSED_LINE_ID = "(refused id)";

/** Why a depth line cannot be worded: its id is not an id, its depth or its percent is not a whole number the rule can
 *  state, or the priced design holds more than one. */
export type MalformedDepthLineReason = "id" | "depth" | "percent" | "multiple";

/**
 * A priced (or stored) depth line cannot be worded. The type says its depth and percent are always sound; a
 * snapshot stored by an earlier build, or a damaged one, may not be, and the query publishes one line, not several.
 * Thrown, never worded: a label would print "adaos undefined %", a percent no book could state, or rows that explain
 * less than the total, which counts every line. Names the reason and the line ids, an id not shaped like one
 * replaced by a fixed word, so it holds no stored text.
 */
export class MalformedDepthLineError extends Error {
  readonly reason: MalformedDepthLineReason;
  readonly lineIds: readonly string[];

  constructor(reason: MalformedDepthLineReason, lineIds: readonly string[]) {
    const namedIds = lineIds.map((lineId) =>
      isLineIdShaped(lineId) ? lineId : REFUSED_LINE_ID,
    );
    super(
      `The priced design holds a depth line that cannot be worded (${reason}): ` +
        namedIds.join(", "),
    );
    this.name = "MalformedDepthLineError";
    this.reason = reason;
    this.lineIds = namedIds;
  }
}

const UNAVAILABLE_BREAKDOWN: UnavailableBreakdown = { kind: "unavailable" };

/** Every line that is not one body above: the two whole-kitchen tiers and the per-sink accessories,
 *  which share a shape (a category word, a book name, an amount tracing to no placement row). */
type UnplacedPriceLine = WholeKitchenPriceLine | AccessoryPriceLine;

export function describePriceBreakdown(
  input: DescribePriceBreakdownInput,
): PriceBreakdownView {
  if (!input.pricing.ok) return UNAVAILABLE_BREAKDOWN;

  const { priced } = input.pricing;
  if (holdsNothingToBreakDown(priced, input.groups))
    return UNAVAILABLE_BREAKDOWN;

  const rows = describeBreakdownRows({
    content: input.content,
    priced,
    groups: input.groups,
  });
  const warning = describeFlaggedTotalWarning(priced, input.content.price);
  return {
    kind: "available",
    title: input.content.priceBreakdown.title,
    disclaimer: input.content.priceBreakdown.disclaimer,
    groups: rows.groups,
    wholeKitchenRows: rows.wholeKitchenRows,
    wholeKitchenListing: listWholeKitchenRows({
      wholeKitchenRows: rows.wholeKitchenRows,
      ...rows.depth,
    }),
    note: input.content.priceBreakdown.note,
    figure: describeStartingPrice({
      totalMinor: priced.totalMinor,
      copy: input.content.price,
    }),
    ...(warning === undefined ? {} : { overflowWarning: warning }),
    closeLabel: input.content.priceBreakdown.close,
  };
}

/**
 * The words of the depth row, from the priced (or stored) line alone: its depth, its amount and the percent it was
 * priced with, never one read from a book or derived from the amount, so a stored snapshot is worded by the percent it
 * was priced with. The one wording of the line, which every surface that lists it calls.
 */
export function describeDepthLine(
  line: DepthPriceLine,
  content: Content,
): BreakdownDepthLine {
  assertWordable(line);
  return {
    key: line.lineId,
    label: content.priceBreakdown.depthLine(
      line.depthMm,
      line.deepCabinetPercent,
    ),
    scope: content.priceBreakdown.depthLineScope,
    amountText: describeRowAmount(line.amountMinor, content),
  };
}

/** What a stored line must hold to be worded: a whole depth in millimetres and a whole percent the rule can state. */
function assertWordable(line: DepthPriceLine): void {
  if (!isLineIdShaped(line.lineId))
    throw new MalformedDepthLineError("id", [line.lineId]);
  if (!isPositiveWhole(line.depthMm))
    throw new MalformedDepthLineError("depth", [line.lineId]);
  if (!isWholePercent(line.deepCabinetPercent))
    throw new MalformedDepthLineError("percent", [line.lineId]);
}

function isLineIdShaped(lineId: string): boolean {
  return LINE_ID_SHAPE.test(lineId);
}

function isPositiveWhole(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isWholePercent(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_DEEP_CABINET_PERCENT
  );
}

/**
 * The rows a surface lists under the placement rows: the depth line directly after the material row, the other rows
 * in their order. Placed by the anchor key the builder took from the rows it built, never by index and never first;
 * a design with no depth line lists the rows untouched. A depth line with no material row to follow throws.
 */
export function listWholeKitchenRows(
  set: WholeKitchenRowSet,
): readonly WholeKitchenListingRow[] {
  const { wholeKitchenRows, depthLine, depthLineAfterKey } = set;
  if (depthLine === undefined) return wholeKitchenRows;
  const anchorAt = wholeKitchenRows.findIndex(
    (row) => row.key === depthLineAfterKey,
  );
  if (anchorAt === -1)
    throw new DepthLineWithoutMaterialRowError(depthLine.key);
  return [
    ...wholeKitchenRows.slice(0, anchorAt + 1),
    depthLine,
    ...wholeKitchenRows.slice(anchorAt + 1),
  ];
}

/** An empty kitchen has no price to explain, so it is `unavailable`, not an empty breakdown: that
 *  would render both whole-kitchen tiers *inclus*, which reads as a costed answer. Both halves are
 *  required: no cabinet lines beside groups that name bodies is the divergence
 *  `describeBreakdownRows` must still throw on. */
export function holdsNothingToBreakDown(
  priced: PricedDesign,
  groups: readonly DisplayGroup[],
): boolean {
  return holdsNoCabinets(priced) && groups.length === 0;
}

interface DescribeBreakdownRowsInput {
  readonly content: Content;
  readonly priced: PricedDesign;
  /** `projectDesignForDisplay`'s answer for the design `priced` was computed from, verbatim. */
  readonly groups: readonly DisplayGroup[];
}

interface BreakdownRows {
  readonly groups: readonly BreakdownGroup[];
  readonly wholeKitchenRows: readonly BreakdownRow[];
  readonly depth: DepthLineFields;
}

/** The one builder of the rows every surface lists a priced design by; the review calls it too, so
 *  the two cannot print different amounts for one body. */
export function describeBreakdownRows(
  input: DescribeBreakdownRowsInput,
): BreakdownRows {
  const { content, priced } = input;
  const lineByPlacement = indexCabinetLines(priced.lines);
  const groups = input.groups.map((group) =>
    toBreakdownGroup(group, lineByPlacement, content),
  );
  assertEveryPricedBodyIsPlaced(input.groups, lineByPlacement);

  const unplacedLines = priced.lines.filter((line) =>
    isUnplacedLine(line, content.priceBreakdown.wholeKitchenCategories),
  );
  return {
    groups,
    wholeKitchenRows: unplacedLines.map((line) => toUnplacedRow(line, content)),
    depth: describeDepthFields({
      depthLines: priced.lines.filter(isDepthLine),
      materialRowKey: unplacedLines.find((line) => line.kind === "material")
        ?.lineId,
      content,
    }),
  };
}

interface DepthFieldsInput {
  readonly depthLines: readonly DepthPriceLine[];
  /** The key of the material row the builder produced, if it produced one. */
  readonly materialRowKey: string | undefined;
  readonly content: Content;
}

function describeDepthFields({
  depthLines,
  materialRowKey,
  content,
}: DepthFieldsInput): DepthLineFields {
  if (depthLines.length > 1) {
    throw new MalformedDepthLineError(
      "multiple",
      depthLines.map((line) => line.lineId),
    );
  }
  const [depthLine] = depthLines;
  if (depthLine === undefined) return {};
  return {
    depthLine: describeDepthLine(depthLine, content),
    ...(materialRowKey === undefined
      ? {}
      : { depthLineAfterKey: materialRowKey }),
  };
}

/** The heading and rows are read off the projection (the entry's `label` and `widthMm`), never
 *  re-derived here from a kind and a dimension. */
function toBreakdownGroup(
  group: DisplayGroup,
  lineByPlacement: ReadonlyMap<string, CabinetPriceLine>,
  content: Content,
): BreakdownGroup {
  return {
    key: `${group.wall}-${group.band}`,
    heading: content.priceBreakdown.groupHeading(
      group.wall,
      content.priceBreakdown.bandHeadings[group.band],
    ),
    rows: group.entries.map((entry) => ({
      key: entry.placementId,
      label: describePlacementLabel(entry, content),
      amountText: describeCabinetRowAmount(
        cabinetLineFor(entry.placementId, lineByPlacement),
        content,
      ),
    })),
  };
}

/** A body's name without its width: the first line of a two-line row. The label above is this and the width, from
 *  the same `bodyLabel`, so the two never name a body differently. */
export function describePlacementName(
  entry: DisplayEntry,
  content: Content,
): string {
  return content.bodyLabel(entry.label);
}

/** The words a body's row prints, from the projection's entry alone, so a surface that names a body without
 *  a price uses the same ones. */
export function describePlacementLabel(
  entry: DisplayEntry,
  content: Content,
): string {
  return content.priceBreakdown.placementLabel(
    describePlacementName(entry, content),
    entry.widthMm,
  );
}

function toUnplacedRow(
  line: UnplacedPriceLine,
  content: Content,
): BreakdownRow {
  return {
    key: line.lineId,
    label: content.priceBreakdown.wholeKitchenLabel(
      content.priceBreakdown.wholeKitchenCategories[line.kind],
      // A book row names the catalogue leaf holding its words (ADR 0106 decision 1); one naming no
      // leaf prints its own `name` (decision 2).
      content.bookText(line.name, line.nameKey),
    ),
    amountText: describeRowAmount(line.amountMinor, content),
  };
}

/** A zero reads *inclus* on any row, not only tier rows: only a genuinely free
 *  line reaches zero, and `0` beside a body is a number that is not a price. */
function describeRowAmount(amountMinor: number, content: Content): string {
  if (amountMinor === 0) return content.priceBreakdown.included;
  return describeLineAmount(amountMinor);
}

/**
 * What one body row prints, and the one place the two kinds of zero are told apart (ADR 0107): a
 * customer-supplied appliance is drawn but not priced. Keyed on `suppliedBy`, never on the amount:
 * `amountMinor === 0` would tell the customer a zero-priced manufacturer cabinet will not be supplied.
 * The shipped kitchen has no such cabinet, so this guard is never exercised in production.
 */
function describeCabinetRowAmount(
  line: CabinetPriceLine,
  content: Content,
): string {
  if (line.suppliedBy === "customer") return content.priceBreakdown.notIncluded;
  return describeRowAmount(line.amountMinor, content);
}

/** The whole line, not its amount: a body row prints from two published facts, cost and supplier. */
function indexCabinetLines(
  lines: readonly PriceLine[],
): ReadonlyMap<string, CabinetPriceLine> {
  return new Map(
    lines.filter(isCabinetLine).map((line) => [line.placementId, line]),
  );
}

function cabinetLineFor(
  placementId: string,
  lineByPlacement: ReadonlyMap<string, CabinetPriceLine>,
): CabinetPriceLine {
  const line = lineByPlacement.get(placementId);
  if (line === undefined)
    throw new PriceBreakdownDivergenceError([placementId]);
  return line;
}

/** The other direction: a priced body that no group holds would vanish from the list while the total
 *  still contained it. */
function assertEveryPricedBodyIsPlaced(
  groups: readonly DisplayGroup[],
  lineByPlacement: ReadonlyMap<string, CabinetPriceLine>,
): void {
  const placed = new Set(
    groups.flatMap((group) => group.entries.map((entry) => entry.placementId)),
  );
  const unplaced = [...lineByPlacement.keys()].filter(
    (placementId) => !placed.has(placementId),
  );
  if (unplaced.length > 0) throw new PriceBreakdownDivergenceError(unplaced);
}

function isCabinetLine(line: PriceLine): line is CabinetPriceLine {
  return line.kind === "cabinet";
}

function isDepthLine(line: PriceLine): line is DepthPriceLine {
  return line.kind === "depth";
}

/**
 * An explicit membership test, never `kind !== "cabinet"` (ADR 0092 decision 11): the negation
 * selects a new line kind that has no category word and renders `undefined · …`. Membership is asked
 * of the category record itself, so a kind with no word is not selected, and adding a kind to
 * `UnplacedPriceLine` without a word is a compile error. The depth line has no category word on purpose: it is not a
 * tier or an accessory, and `describeBreakdownRows` publishes it as the row of its own, `depth.depthLine`.
 */
function isUnplacedLine(
  line: PriceLine,
  categories: Readonly<Record<UnplacedPriceLine["kind"], string>>,
): line is UnplacedPriceLine {
  return Object.hasOwn(categories, line.kind);
}
