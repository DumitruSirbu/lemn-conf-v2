// The review step as a value: this module owns every rule and string, the screen the markup.
//
// Rows are `describeBreakdownRows`'s, the breakdown's own builder; nothing here sorts, groups, rounds or labels
// one. The figure is `priceDesign`'s total rounded as the price bar rounds it, never a sum of the rows.
//
// Whether the kitchen may be submitted is decided here only, and fit is the domain query's answer: nothing here
// measures a wall. The design, its price and its projection must be one design's, or `describeReview` throws.
import {
  cornerDirectionOf,
  findOverflowingPlacementIds,
  type Design,
  type DisplayGroup,
  type PricedDesign,
  type PricingResult,
  type WholeKitchenPriceLine,
} from "@lemnaria/configurator-domain";

import type { Content, ReviewRoomLine } from "@/i18n/content";
import {
  describeBreakdownRows,
  describePlacementLabel,
  type BreakdownGroup,
  type BreakdownRow,
} from "@/price/price-breakdown-model";
import {
  describeFlaggedTotalWarning,
  describeStartingPrice,
  holdsNothingLemnariaSupplies,
  type PriceFigure,
} from "@/price/starting-price";
import { parsedRoomLengthsOf } from "@/room/room-url-state";

/** Material and hardware as the settings sheet's pill words them, for the row that opens that sheet. */
export interface ReviewSettingsRow {
  readonly heading: string;
  readonly settings: readonly string[];
}

/** A slot drawn from the approved breakdown disclaimer: the lines come from one place and nothing else
 *  writes them. */
export interface ReviewNotIncludedSlot {
  readonly lines: readonly string[];
}

export interface ReviewDisclaimer {
  readonly rounding: string;
  readonly notice: string;
}

/** One closed set of reasons, tied to the sentences the content resolves: a reason without a sentence is a compile
 *  error. */
export type SubmitRefusalCode = keyof Content["review"]["refusalReasons"];

/** A body named by the words its row prints, so the refusal and the list read alike. */
export interface NamedBody {
  readonly placementId: string;
  readonly label: string;
}

/** The code and the bodies it names, in display order. The sentence is `content.review.refusalReasons[code]`,
 *  read by the screen. */
export interface RefusedSubmit {
  readonly kind: "refused";
  readonly code: SubmitRefusalCode;
  readonly bodies: readonly NamedBody[];
}

export type SubmitEligibility = { readonly kind: "allowed" } | RefusedSubmit;

/** Nothing is rendered: a kitchen that cannot be priced, or holds nothing Lemnaria supplies, has no figure to
 *  review. */
export interface UnavailableReview {
  readonly kind: "unavailable";
  readonly submit: RefusedSubmit;
}

export interface AvailableReview {
  readonly kind: "available";
  readonly title: string;
  readonly roomLine: string;
  readonly settingsRow: ReviewSettingsRow;
  readonly groups: readonly BreakdownGroup[];
  readonly wholeKitchenRows: readonly BreakdownRow[];
  readonly notIncluded: ReviewNotIncludedSlot;
  readonly disclaimer: ReviewDisclaimer;
  readonly figure: PriceFigure;
  readonly submit: SubmitEligibility;
  /** Present exactly when the priced total is flagged: the flag travels with the total wherever it is shown. */
  readonly overflowWarning?: string;
}

export type ReviewView = UnavailableReview | AvailableReview;

export type ReviewSection =
  | Exclude<keyof AvailableReview, "kind" | "overflowWarning" | "submit">
  | "callToAction";

/** The order the screen that renders this value lays its sections out in: what is not included is read before the
 *  call to action. `callToAction` is a control, not a field of the value. */
export const REVIEW_READING_ORDER: readonly ReviewSection[] = [
  "title",
  "roomLine",
  "settingsRow",
  "groups",
  "wholeKitchenRows",
  "notIncluded",
  "disclaimer",
  "figure",
  "callToAction",
];

export interface DescribeReviewInput {
  readonly content: Content;
  readonly design: Design;
  /** The design priced, as `usePricedDesign` derives it. */
  readonly pricing: PricingResult;
  /** `projectDesignForDisplay`'s answer for `design`, verbatim. */
  readonly groups: readonly DisplayGroup[];
}

/** The priced design holds no line for a tier every priced kitchen carries. */
export class MissingWholeKitchenTierError extends Error {
  constructor(kind: WholeKitchenPriceLine["kind"]) {
    super(
      `The priced design carries no ${kind} tier line; the review has no setting to name`,
    );
    this.name = "MissingWholeKitchenTierError";
  }
}

/** The design, its price and its projection describe different designs. Never rendered. */
export class ReviewInputDivergenceError extends Error {
  constructor(detail: string) {
    super(`The review's inputs are not one design's: ${detail}`);
    this.name = "ReviewInputDivergenceError";
  }
}

export function describeReview(input: DescribeReviewInput): ReviewView {
  // Asked before pricing is consulted, on every path: a body past its wall is the refusal the customer can act
  // on, whatever pricing answered.
  const overflowingIds = findOverflowingPlacementIds(input.design);
  if (!input.pricing.ok) {
    assertEveryPlacementIsListed(input.design, input.groups);
    return unavailable(refuseFirstActionable(input, overflowingIds));
  }
  return describePricedReview(input, input.pricing.priced, overflowingIds);
}

function describePricedReview(
  input: DescribeReviewInput,
  priced: PricedDesign,
  overflowingIds: readonly string[],
): ReviewView {
  assertInputsAreOneDesigns(input, priced, overflowingIds);
  if (holdsNothingLemnariaSupplies(priced)) {
    return unavailable(refuseFirstActionable(input, overflowingIds));
  }
  return describeAvailableReview(input, priced, overflowingIds);
}

function describeAvailableReview(
  input: DescribeReviewInput,
  priced: PricedDesign,
  overflowingIds: readonly string[],
): AvailableReview {
  const { content, design, groups } = input;
  const rows = describeBreakdownRows({ content, priced, groups });
  const warning = describeFlaggedTotalWarning(priced, content.price);
  return {
    kind: "available",
    title: content.review.title,
    roomLine: content.reviewRoomLine(
      describeRoomLine(design, countBodies(groups)),
    ),
    settingsRow: describeSettingsRow(priced, content),
    groups: rows.groups,
    wholeKitchenRows: rows.wholeKitchenRows,
    notIncluded: describeNotIncludedSlot(content),
    disclaimer: describeDisclaimer(content),
    figure: describeStartingPrice({
      totalMinor: priced.totalMinor,
      copy: content.price,
    }),
    submit:
      overflowingIds.length > 0
        ? refuseFirstActionable(input, overflowingIds)
        : { kind: "allowed" },
    ...(warning === undefined ? {} : { overflowWarning: warning }),
  };
}

function unavailable(submit: RefusedSubmit): UnavailableReview {
  return { kind: "unavailable", submit };
}

/**
 * The refusal order, in one place: a body past its wall, then nothing Lemnaria sells, then a price that cannot be
 * computed. Called only for a kitchen that is refused, so the last reason is the one left.
 */
function refuseFirstActionable(
  input: DescribeReviewInput,
  overflowingIds: readonly string[],
): RefusedSubmit {
  if (overflowingIds.length > 0)
    return refusePastTheWall(input, overflowingIds);
  if (holdsNothingToSell(input)) return refuse("NO_CABINET");
  return refuse("PRICING_FAILED");
}

/** Whether pricing shows nothing the customer buys; without a price, whether the design holds no body. */
function holdsNothingToSell(input: DescribeReviewInput): boolean {
  return input.pricing.ok
    ? holdsNothingLemnariaSupplies(input.pricing.priced)
    : input.design.placements.length === 0;
}

function refuse(code: "PRICING_FAILED" | "NO_CABINET"): RefusedSubmit {
  return { kind: "refused", code, bodies: [] };
}

function refusePastTheWall(
  input: DescribeReviewInput,
  overflowingIds: readonly string[],
): RefusedSubmit {
  const overflowing = new Set(overflowingIds);
  return {
    kind: "refused",
    code: "BODIES_PAST_WALL",
    bodies: input.groups
      .flatMap((group) => group.entries)
      .filter((entry) => overflowing.has(entry.placementId))
      .map((entry) => ({
        placementId: entry.placementId,
        label: describePlacementLabel(entry, input.content),
      })),
  };
}

/** The rows list exactly the design's bodies. Without a price there is no priced list to compare. */
function assertEveryPlacementIsListed(
  design: Design,
  groups: readonly DisplayGroup[],
): void {
  const listed = groups.flatMap((group) =>
    group.entries.map((entry) => entry.placementId),
  );
  const held = design.placements.map((placement) => placement.id);
  throwIfDifferent("the rows and the design", listed, held);
}

/** Run before the row builder, so a mismatch the builder would also see is this module's error, not the breakdown's. */
function assertInputsAreOneDesigns(
  input: DescribeReviewInput,
  priced: PricedDesign,
  overflowingIds: readonly string[],
): void {
  assertEveryPlacementIsListed(input.design, input.groups);
  const pricedBodyIds = priced.lines.flatMap((line) =>
    line.kind === "cabinet" ? [line.placementId] : [],
  );
  const listed = input.groups.flatMap((group) =>
    group.entries.map((entry) => entry.placementId),
  );
  throwIfDifferent("the price and the rows", pricedBodyIds, listed);
  throwIfDifferent(
    "the price and the fit query",
    priced.overflowingPlacementIds,
    overflowingIds,
  );
}

function throwIfDifferent(
  what: string,
  left: readonly string[],
  right: readonly string[],
): void {
  const differences = idsNotMatched(left, right);
  if (differences.length > 0) {
    throw new ReviewInputDivergenceError(
      `${what} differ over: ${differences.join(", ")}`,
    );
  }
}

/** The ids one list has more of than the other, counting repeats: `[a, a, b]` against `[a, b, b]` differs. */
function idsNotMatched(
  left: readonly string[],
  right: readonly string[],
): readonly string[] {
  const unmatched = [...right];
  const surplus: string[] = [];
  for (const id of left) {
    const at = unmatched.indexOf(id);
    if (at === -1) surplus.push(id);
    else unmatched.splice(at, 1);
  }
  return [...surplus, ...unmatched];
}

function describeDisclaimer(content: Content): ReviewDisclaimer {
  return {
    rounding: content.review.roundedUpNote,
    notice: content.priceBreakdown.note,
  };
}

function countBodies(groups: readonly DisplayGroup[]): number {
  return groups.reduce((count, group) => count + group.entries.length, 0);
}

function describeRoomLine(design: Design, bodyCount: number): ReviewRoomLine {
  const { room } = design;
  const wallAMm = wallLengthMm(design, "wallA");
  switch (room.shape) {
    case "linear":
      return { shape: "linear", wallAMm, bodyCount };
    case "L":
      return {
        shape: "L",
        wallAMm,
        wallBMm: wallLengthMm(design, "wallB"),
        corner: cornerDirectionOf(room),
        bodyCount,
      };
    case "U":
      return {
        shape: "U",
        wallAMm,
        wallBMm: wallLengthMm(design, "wallB"),
        wallCMm: wallLengthMm(design, "wallC"),
        bodyCount,
      };
  }
}

/** Through the one `DesignRoom` to wall mapping, so a straight room's drawn depth is never read as a wall. */
function wallLengthMm(
  design: Design,
  field: "wallA" | "wallB" | "wallC",
): number {
  const length = parsedRoomLengthsOf(design.room).find(
    (candidate) => candidate.field === field,
  );
  if (length === undefined) {
    throw new Error(`A ${design.room.shape} room has no ${field} length`);
  }
  return length.millimetres;
}

function describeSettingsRow(
  priced: PricedDesign,
  content: Content,
): ReviewSettingsRow {
  return {
    heading: content.globalSettings.title,
    settings: [
      content.globalSettings.pillMaterial(
        tierNameOf(priced, "material", content),
      ),
      content.globalSettings.pillHardware(
        content.priceBreakdown.wholeKitchenCategories.hardware,
        tierNameOf(priced, "hardware", content),
      ),
    ],
  };
}

function tierNameOf(
  priced: PricedDesign,
  kind: WholeKitchenPriceLine["kind"],
  content: Content,
): string {
  const line = priced.lines.find(
    (candidate): candidate is WholeKitchenPriceLine => candidate.kind === kind,
  );
  if (line === undefined) throw new MissingWholeKitchenTierError(kind);
  return content.bookText(line.name, line.nameKey);
}

/** This text is a slot drawn from the approved breakdown disclaimer. */
function describeNotIncludedSlot(content: Content): ReviewNotIncludedSlot {
  return { lines: [content.priceBreakdown.disclaimer] };
}
