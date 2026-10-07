// The review step as a value: this module owns every rule and string, the screen the markup.
//
// The groups and rows are `describeBreakdownRows`'s, the breakdown's own builder, so the two surfaces
// cannot print different amounts for one body. Nothing here sorts, groups, rounds or labels a row.
//
// The figure is `priceDesign`'s total rounded as the price bar rounds it, never a sum of the rows above
// it, and no row is labelled *total*.
//
// Whether the kitchen may be submitted is decided here and nowhere else. Fit is the domain query's answer,
// asked and believed: nothing here measures a wall. One refusal at a time, the first the customer can act on: a
// body past its wall, then nothing Lemnaria sells, then a price that cannot be computed.
//
// The model takes a design, its price and its projection, and throws if they are not one design's.
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
  holdsNothingToBreakDown,
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

/** A slot: the owner has not yet confirmed what the estimate leaves out, so the lines come from one
 *  place and nothing else writes them. */
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

/** The order the screen lays its sections out in: what is not included is read before the call to action. */
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
  const overflowingIds = findOverflowingPlacementIds(input.design);
  if (!input.pricing.ok) return describeUnpricedReview(input, overflowingIds);
  return describePricedReview(input, input.pricing.priced, overflowingIds);
}

function describeUnpricedReview(
  input: DescribeReviewInput,
  overflowingIds: readonly string[],
): UnavailableReview {
  assertEveryPlacementIsListed(input.design, input.groups);
  return {
    kind: "unavailable",
    submit:
      overflowingIds.length > 0
        ? refusePastTheWall(input, overflowingIds)
        : refuse(
            input.design.placements.length === 0
              ? "NO_CABINET"
              : "PRICING_FAILED",
          ),
  };
}

function describePricedReview(
  input: DescribeReviewInput,
  priced: PricedDesign,
  overflowingIds: readonly string[],
): ReviewView {
  const { content, design, groups } = input;
  if (holdsNothingToBreakDown(priced, groups)) {
    assertInputsAreOneDesigns(input, priced, overflowingIds);
    return refuseNothingToOffer(input, overflowingIds);
  }

  const rows = describeBreakdownRows({ content, priced, groups });
  assertInputsAreOneDesigns(input, priced, overflowingIds);
  if (holdsNothingLemnariaSupplies(priced)) {
    return refuseNothingToOffer(input, overflowingIds);
  }

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
    disclaimer: {
      rounding: content.review.roundedUpNote,
      notice: content.priceBreakdown.note,
    },
    figure: describeStartingPrice({
      totalMinor: priced.totalMinor,
      copy: content.price,
    }),
    submit:
      overflowingIds.length > 0
        ? refusePastTheWall(input, overflowingIds)
        : { kind: "allowed" },
    ...(warning === undefined ? {} : { overflowWarning: warning }),
  };
}

/** No figure to show, so `unavailable`; a body past its wall is still the reason given first. */
function refuseNothingToOffer(
  input: DescribeReviewInput,
  overflowingIds: readonly string[],
): UnavailableReview {
  return {
    kind: "unavailable",
    submit:
      overflowingIds.length > 0
        ? refusePastTheWall(input, overflowingIds)
        : refuse("NO_CABINET"),
  };
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
  const differences = symmetricDifference(listed, held);
  if (differences.length > 0 || listed.length !== held.length) {
    throw new ReviewInputDivergenceError(
      `the rows and the design differ over: ${differences.join(", ") || "a repeated id"}`,
    );
  }
}

function assertInputsAreOneDesigns(
  input: DescribeReviewInput,
  priced: PricedDesign,
  overflowingIds: readonly string[],
): void {
  assertEveryPlacementIsListed(input.design, input.groups);
  const differences = symmetricDifference(
    priced.overflowingPlacementIds,
    overflowingIds,
  );
  if (differences.length > 0) {
    throw new ReviewInputDivergenceError(
      `the price and the fit query differ over: ${differences.join(", ")}`,
    );
  }
}

function symmetricDifference(
  left: readonly string[],
  right: readonly string[],
): readonly string[] {
  const inLeft = new Set(left);
  const inRight = new Set(right);
  return [
    ...left.filter((id) => !inRight.has(id)),
    ...right.filter((id) => !inLeft.has(id)),
  ];
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

/** Drawn from the approved breakdown disclaimer until the owner confirms the list line by line. */
function describeNotIncludedSlot(content: Content): ReviewNotIncludedSlot {
  return { lines: [content.priceBreakdown.disclaimer] };
}
