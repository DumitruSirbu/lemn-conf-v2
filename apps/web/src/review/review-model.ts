// The review step as a value: this module owns every rule and string, the screen the markup.
//
// The groups and rows are `describeBreakdownRows`'s, the breakdown's own builder, so the two surfaces
// cannot print different amounts for one body. Nothing here sorts, groups, rounds or labels a row.
//
// The figure is `priceDesign`'s total rounded as the price bar rounds it, never a sum of the rows above
// it, and no row is labelled *total*.
import {
  cornerDirectionOf,
  type Design,
  type DisplayGroup,
  type PricedDesign,
  type PricingResult,
  type WholeKitchenPriceLine,
} from "@lemnaria/configurator-domain";

import type { Content, ReviewRoomLine } from "@/i18n/content";
import {
  describeBreakdownRows,
  holdsNothingToBreakDown,
  type BreakdownGroup,
  type BreakdownRow,
} from "@/price/price-breakdown-model";
import {
  describeFlaggedTotalWarning,
  describeStartingPrice,
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

/** Nothing is rendered: a kitchen that cannot be priced, or holds no body, has no figure to review. */
export interface UnavailableReview {
  readonly kind: "unavailable";
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
  /** Present exactly when the priced total is flagged: the flag travels with the total wherever it is shown. */
  readonly overflowWarning?: string;
}

export type ReviewView = UnavailableReview | AvailableReview;

export type ReviewSection =
  | Exclude<keyof AvailableReview, "kind" | "overflowWarning">
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

const UNAVAILABLE_REVIEW: UnavailableReview = { kind: "unavailable" };

export function describeReview(input: DescribeReviewInput): ReviewView {
  if (!input.pricing.ok) return UNAVAILABLE_REVIEW;

  const { priced } = input.pricing;
  const { content, groups } = input;
  if (holdsNothingToBreakDown(priced, groups)) return UNAVAILABLE_REVIEW;

  const rows = describeBreakdownRows({ content, priced, groups });
  const warning = describeFlaggedTotalWarning(priced, content.price);
  return {
    kind: "available",
    title: content.review.title,
    roomLine: content.reviewRoomLine(
      describeRoomLine(input.design, countBodies(groups)),
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
    ...(warning === undefined ? {} : { overflowWarning: warning }),
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

/** Drawn from the approved breakdown disclaimer until the owner confirms the list line by line. */
function describeNotIncludedSlot(content: Content): ReviewNotIncludedSlot {
  return { lines: [content.priceBreakdown.disclaimer] };
}
