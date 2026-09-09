// Frames 2D / D2D's breakdown, as a value.
//
// The same split the price bar uses: this module owns every rule and every string, the component
// owns the markup. A pure projection can be asserted as a value, which is what lets the rules below
// be pinned without a browser.
//
// **The rows are wave 6A's groups, in wave 6A's order, and nothing here changes either.** No sort,
// no grouping, no label of its own — `projectDesignForDisplay` decided all three before this
// function was called, and the wave's first criterion is that deleting that call **breaks** this
// surface rather than merely changing it. It does: the groups are the only source of the rows, so
// without them there are no rows, and a design that priced bodies nobody placed is refused rather
// than rendered short (`PriceBreakdownDivergenceError`). That refusal is the criterion's teeth —
// reading the population off `priced.lines` instead would produce a plausible list with the
// projection deleted, which is exactly the drift wave 6A exists to make unrepresentable.
//
// **Row-major within a group** ([ADR 0063](../../../../docs/decisions/0063-a-group-is-listed-row-major-height-before-position.md)):
// the whole hanging row left to right, then the whole top row. It arrives that way from the
// projection's one comparator; a rendered order that reads column-major is a defect *here* even
// though the comparator is 6A's, so `display-order-convergence.test.ts` reads the rendered order
// rather than trusting the projection.
//
// **Rounded lines and a rounded total need not sum.** Both round through `roundUpToThousandMdl`,
// the one site, and on the shipped design the difference exceeds a whole step. `ro.priceBreakdown`'s
// disclaimer and note are what carry that; nothing here adds a subtotal, an equality claim, or a
// row labelled *total*.
import type {
  AccessoryPriceLine,
  CabinetPriceLine,
  DisplayGroup,
  PriceLine,
  PricingResult,
  WholeKitchenPriceLine,
} from "@lemnaria/configurator-domain";

import { ro } from "@/content/ro";

import {
  describeFlaggedTotalWarning,
  describeRoundedAmount,
  describeStartingPrice,
  type PriceFigure,
  holdsNoCabinets,
} from "./starting-price";

/** One line of the breakdown: what it is, and what it costs. `key` is the id it traces back to —
 *  a placement id for a body, a line id for a whole-kitchen tier — so a row is never keyed on its
 *  position in a list that reorders. */
export interface BreakdownRow {
  readonly key: string;
  readonly label: string;
  /** Already rounded and grouped. *"inclus"* where the amount is zero — see `describeRowAmount`. */
  readonly amountText: string;
}

/** One of the projection's groups, rendered: the mockup's *Perete A · suspendate* and the bodies
 *  under it, in the order they arrived. */
export interface BreakdownGroup {
  readonly key: string;
  readonly heading: string;
  readonly rows: readonly BreakdownRow[];
}

/** Nothing is rendered for this, and no control offers it. A failed pricing query has no
 *  customer-facing form — the bar's own head comment gives the reason, and a breakdown of a total
 *  that could not be computed is a longer version of the same invented number. */
export interface UnavailableBreakdown {
  readonly kind: "unavailable";
}

export interface AvailableBreakdown {
  readonly kind: "available";
  readonly title: string;
  /** Frame 2D's exclusions and the on-site measurement, ADR 0036 decision 3's worktop among them. */
  readonly disclaimer: string;
  readonly groups: readonly BreakdownGroup[];
  /** Hardware and material, then the accessories billed per sink, **after** every placement row.
   *  Empty is a real answer: the inclusion list is book data, so a tier added later becomes a row
   *  with no change here — and an accessory the design earns none of is **no row**, because the
   *  query publishes no line for it rather than a zero this surface would render *inclus*. */
  readonly wholeKitchenRows: readonly BreakdownRow[];
  /** The sentence that says the amounts above are each rounded up on their own. */
  readonly note: string;
  /** The same figure the bar shows, restated because on mobile this sheet covers the bar it was
   *  opened from — the reason §9's footer carries one too (wave 6C). **Not a sum of the rows
   *  above**, and labelled *De la* rather than *total* precisely so it cannot read as one. */
  readonly figure: PriceFigure;
  /** ADR 0065 decision 6: the flag travels with the total wherever a total is shown, and this
   *  surface shows one. Absent — never empty — when the design overflows nothing. */
  readonly overflowWarning?: string;
  readonly closeLabel: string;
}

export type PriceBreakdownView = UnavailableBreakdown | AvailableBreakdown;

export interface DescribePriceBreakdownInput {
  /** The current design priced, as `usePricedDesign` derived it this render. */
  readonly pricing: PricingResult;
  /** `projectDesignForDisplay`'s answer for the same design, **verbatim**. The only source of which
   *  rows exist, what order they are in, and what each one is called. */
  readonly groups: readonly DisplayGroup[];
}

/**
 * The scene and this surface disagree about which bodies the design holds.
 *
 * Unreachable while both read the same document — pricing derives its cabinet lines from the same
 * projection this takes — which is why it throws rather than rendering the intersection. A
 * breakdown quietly missing a body reads as a cheaper kitchen, and one quietly holding an extra
 * reads as a body the customer does not own; pricing already refuses to answer partially, and this
 * refuses to display partially for the same reason.
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

/** Every line that is **not** one body in the list above — the two whole-kitchen tiers, and the
 *  accessories billed per sink. They share a section because they share a shape: a category word, a
 *  name the book states, and an amount that traces to no placement row. */
type UnplacedPriceLine = WholeKitchenPriceLine | AccessoryPriceLine;

/** The category words, keyed by the kind of line the book produced. */
const UNPLACED_CATEGORIES: Readonly<Record<UnplacedPriceLine["kind"], string>> =
  ro.priceBreakdown.wholeKitchenCategories;

/** The heading word for a group, keyed by the **normalised** band the projection grouped on. */
const BAND_HEADINGS: Readonly<Record<DisplayGroup["band"], string>> =
  ro.priceBreakdown.bandHeadings;

export function describePriceBreakdown(
  input: DescribePriceBreakdownInput,
): PriceBreakdownView {
  if (!input.pricing.ok) return UNAVAILABLE_BREAKDOWN;

  const { priced } = input.pricing;
  // **M6-AUD-014**: there is no price to explain, so there is no breakdown and no control that opens
  // one. Reported as `unavailable` rather than as an empty breakdown, because the alternative is the
  // exact presentation the audit named — the two whole-kitchen tiers rendered *inclus* over a
  // kitchen with nothing in it, which reads as a costed answer. The bar carries the owner's prompt;
  // one surface says the one thing there is to say.
  //
  // **Both halves, and the second is what keeps the divergence guard below alive.** An empty kitchen
  // is a priced design with no cabinet lines *and* a projection with no groups. Absent cabinet lines
  // beside groups that name bodies is not emptiness — it is exactly the divergence this surface
  // refuses to render, and returning early on the first half alone would have swallowed it whenever
  // every line went missing at once.
  if (holdsNoCabinets(priced) && input.groups.length === 0)
    return UNAVAILABLE_BREAKDOWN;
  const amountByPlacement = indexCabinetAmounts(priced.lines);
  const groups = input.groups.map((group) =>
    toBreakdownGroup(group, amountByPlacement),
  );
  assertEveryPricedBodyIsPlaced(input.groups, amountByPlacement);

  const warning = describeFlaggedTotalWarning(priced);
  return {
    kind: "available",
    title: ro.priceBreakdown.title,
    disclaimer: ro.priceBreakdown.disclaimer,
    groups,
    wholeKitchenRows: priced.lines.filter(isUnplacedLine).map(toUnplacedRow),
    note: ro.priceBreakdown.note,
    figure: describeStartingPrice({ totalMinor: priced.totalMinor }),
    ...(warning === undefined ? {} : { overflowWarning: warning }),
    closeLabel: ro.priceBreakdown.close,
  };
}

/** The group heading and its rows, both read off the projection: the wall letter and the band are
 *  the group's own, and every row's words are the entry's `label` and `widthMm` — the first is
 *  `describeBodyLabelAt`'s answer (ADR 0033), and neither is re-derived here from a kind and a
 *  dimension. */
function toBreakdownGroup(
  group: DisplayGroup,
  amountByPlacement: ReadonlyMap<string, number>,
): BreakdownGroup {
  return {
    key: `${group.wall}-${group.band}`,
    heading: ro.priceBreakdown.groupHeading(
      group.wall,
      BAND_HEADINGS[group.band],
    ),
    rows: group.entries.map((entry) => ({
      key: entry.placementId,
      label: ro.priceBreakdown.placementLabel(entry.label, entry.widthMm),
      amountText: describeRowAmount(
        amountFor(entry.placementId, amountByPlacement),
      ),
    })),
  };
}

function toUnplacedRow(line: UnplacedPriceLine): BreakdownRow {
  return {
    key: line.lineId,
    label: ro.priceBreakdown.wholeKitchenLabel(
      UNPLACED_CATEGORIES[line.kind],
      line.name,
    ),
    amountText: describeRowAmount(line.amountMinor),
  };
}

/**
 * What one row prints. **A zero reads *inclus*** — frame 2E's ruled word for a tier that costs
 * nothing extra, applied to whatever row reaches zero rather than to the tier rows alone: rounding
 * is upward, so only a line that is genuinely free can get here, and `0` beside a body is the same
 * number-that-is-not-a-price the tier rule exists to keep off the screen.
 */
function describeRowAmount(amountMinor: number): string {
  if (amountMinor === 0) return ro.priceBreakdown.included;
  return describeRoundedAmount(amountMinor);
}

function indexCabinetAmounts(
  lines: readonly PriceLine[],
): ReadonlyMap<string, number> {
  return new Map(
    lines
      .filter(isCabinetLine)
      .map((line) => [line.placementId, line.amountMinor]),
  );
}

function amountFor(
  placementId: string,
  amountByPlacement: ReadonlyMap<string, number>,
): number {
  const amountMinor = amountByPlacement.get(placementId);
  if (amountMinor === undefined)
    throw new PriceBreakdownDivergenceError([placementId]);
  return amountMinor;
}

/** The other direction, and the one that makes the projection load-bearing: a body pricing placed
 *  in the kitchen that no group holds would silently vanish from the list, and the total beneath it
 *  would still contain it. */
function assertEveryPricedBodyIsPlaced(
  groups: readonly DisplayGroup[],
  amountByPlacement: ReadonlyMap<string, number>,
): void {
  const placed = new Set(
    groups.flatMap((group) => group.entries.map((entry) => entry.placementId)),
  );
  const unplaced = [...amountByPlacement.keys()].filter(
    (placementId) => !placed.has(placementId),
  );
  if (unplaced.length > 0) throw new PriceBreakdownDivergenceError(unplaced);
}

function isCabinetLine(line: PriceLine): line is CabinetPriceLine {
  return line.kind === "cabinet";
}

/**
 * **An explicit membership test, and never `kind !== "cabinet"` again** (ADR 0092 decision 11).
 *
 * The negation is what a new line kind slips through: it compiles, it selects the new line, and
 * `UNPLACED_CATEGORIES` has no word for it — so the row renders `undefined · Uscător de vase`, which
 * is exactly what happened when the `accessory` kind arrived.
 *
 * **Membership is asked of the category record itself**, so the two can never disagree: a kind this
 * section is meant to list is a kind that has a word, and one with no word is not selected at all
 * rather than selected and rendered with a hole in its label. Adding a kind to `UnplacedPriceLine`
 * without also giving it a word is a **compile** error, because the record is keyed on that union.
 */
function isUnplacedLine(line: PriceLine): line is UnplacedPriceLine {
  return Object.hasOwn(UNPLACED_CATEGORIES, line.kind);
}
