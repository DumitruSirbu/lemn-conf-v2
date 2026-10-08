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
// Rounded lines and a rounded total need not sum: both round through `roundUpToThousandMdl` and the
// difference can exceed a whole step. The disclaimer and note carry that, so nothing here adds a
// subtotal, an equality claim, or a row labelled *total*.
import type {
  AccessoryPriceLine,
  CabinetPriceLine,
  DisplayEntry,
  DisplayGroup,
  PricedDesign,
  PriceLine,
  PricingResult,
  WholeKitchenPriceLine,
} from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";

import {
  describeFlaggedTotalWarning,
  describeRoundedAmount,
  describeStartingPrice,
  type PriceFigure,
  holdsNoCabinets,
} from "./starting-price";

/** One line of the breakdown. `key` is the id it traces back to (a placement id, or a line id for a
 *  whole-kitchen tier), never a list position. */
export interface BreakdownRow {
  readonly key: string;
  readonly label: string;
  /** Already rounded and grouped: *"inclus"* at zero, *"nu este inclus"* on a body the manufacturer
   *  does not supply (decided by `describeRowAmount` and `describeCabinetRowAmount`). */
  readonly amountText: string;
}

/** One of the projection's groups, rendered, with its bodies in the order they arrived. */
export interface BreakdownGroup {
  readonly key: string;
  readonly heading: string;
  readonly rows: readonly BreakdownRow[];
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
  /** The sentence that says the amounts above are each rounded up on their own. */
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
    note: input.content.priceBreakdown.note,
    figure: describeStartingPrice({
      totalMinor: priced.totalMinor,
      copy: input.content.price,
    }),
    ...(warning === undefined ? {} : { overflowWarning: warning }),
    closeLabel: input.content.priceBreakdown.close,
  };
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

  return {
    groups,
    wholeKitchenRows: priced.lines
      .filter((line) =>
        isUnplacedLine(line, content.priceBreakdown.wholeKitchenCategories),
      )
      .map((line) => toUnplacedRow(line, content)),
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

/** A zero reads *inclus* on any row, not only tier rows: rounding is upward, so only a genuinely free
 *  line reaches zero, and `0` beside a body is a number that is not a price. */
function describeRowAmount(amountMinor: number, content: Content): string {
  if (amountMinor === 0) return content.priceBreakdown.included;
  return describeRoundedAmount(amountMinor);
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

/**
 * An explicit membership test, never `kind !== "cabinet"` (ADR 0092 decision 11): the negation
 * selects a new line kind that has no category word and renders `undefined · …`. Membership is asked
 * of the category record itself, so a kind with no word is not selected, and adding a kind to
 * `UnplacedPriceLine` without a word is a compile error.
 */
function isUnplacedLine(
  line: PriceLine,
  categories: Readonly<Record<UnplacedPriceLine["kind"], string>>,
): line is UnplacedPriceLine {
  return Object.hasOwn(categories, line.kind);
}
