// The review step as a value: this module owns every rule and string, the screen the markup.
//
// Rows are `describeBreakdownRows`'s, the breakdown's own builder; nothing here sorts, groups, rounds or labels
// one. The figure is `priceDesign`'s total rounded as the price bar rounds it, never a sum of the rows.
//
// Which refusal a kitchen gets is the domain's one rule (`judgeSubmissionEligibility`), given the fit query's
// answer: nothing here measures a wall or orders the refusals. Whether there is a figure to draw at all is this
// module's own question (see `describePricedReview`). The design, its price and its projection must be one
// design's, or `describeReview` throws.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  cornerDirectionOf,
  findOverflowingPlacementIds,
  holdsNothingLemnariaSupplies,
  isPushToOpen,
  judgeSubmissionEligibility,
  resolvedHandleAt,
  TOP_ROW_HANDLE,
  type BodyCatalog,
  type Design,
  type DisplayEntry,
  type DisplayGroup,
  type Finish,
  type Handle,
  type PricedDesign,
  type PricingResult,
  type SubmissionEligibility,
  type SubmissionRefusal,
  type WholeKitchenPriceLine,
} from "@lemnaria/configurator-domain";

import type { Content, ReviewRoomLine } from "@/i18n/content";
import {
  describeBreakdownRows,
  describePlacementLabel,
  describePlacementName,
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

/**
 * What a body's row says under the frame's two lines: its name without the width, then the facts that follow it, in
 * order. The width always; the body's own finish exactly when it carries one (ADR 0099: a body on the kitchen's colour
 * names none); and the handle it wears, resolved as the price and the scene resolve it (its own, else the kitchen's,
 * else the slot's), whenever it wears one or is latched. The row's `label` stays the breakdown's, the name and the width together, which is
 * what a refusal calls the body, so the two lines state what the label says and more.
 */
export interface ReviewRowDetail {
  readonly name: string;
  readonly facts: readonly string[];
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
  /** The two lines of each body's row, by placement id: the breakdown's rows are not touched. */
  readonly rowDetails: Readonly<Record<string, ReviewRowDetail>>;
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
  | Exclude<
      keyof AvailableReview,
      "kind" | "overflowWarning" | "submit" | "rowDetails"
    >
  | "overflowWarning"
  | "refusal"
  | "callToAction";

/** The order the screen that renders this value lays its sections out in: what is not included is read before the
 *  call to action. The flagged total's sentence stands with the figure it flags and a refusal's sentence with the
 *  control it explains. `callToAction` is a control, not a field of the value. */
export const REVIEW_READING_ORDER: readonly ReviewSection[] = [
  "title",
  "roomLine",
  "settingsRow",
  "groups",
  "wholeKitchenRows",
  "notIncluded",
  "disclaimer",
  "overflowWarning",
  "refusal",
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

/** The review holds no row detail for a body it lists: its rows and its details are built from one projection, so
 *  this is a defect, not a state to draw. */
export class MissingRowDetailError extends Error {
  constructor(placementId: string) {
    super(
      `The review holds no row detail for placement "${placementId}"; its rows and details are built from one projection`,
    );
    this.name = "MissingRowDetailError";
  }
}

/** The design, its price and its projection describe different designs. Never rendered. */
export class ReviewInputDivergenceError extends Error {
  constructor(detail: string) {
    super(`The review's inputs are not one design's: ${detail}`);
    this.name = "ReviewInputDivergenceError";
  }
}

/** The inputs are checked before the rule is asked, so a mismatch is this module's error and not the rule's. */
export function describeReview(input: DescribeReviewInput): ReviewView {
  const overflowingIds = findOverflowingPlacementIds(input.design);
  if (!input.pricing.ok) {
    assertEveryPlacementIsListed(input.design, input.groups);
    return unavailable(
      refusedSubmitOfUnavailable(input, judgeFor(input, overflowingIds)),
    );
  }
  const { priced } = input.pricing;
  assertInputsAreOneDesigns(input, priced, overflowingIds);
  return describePricedReview(input, priced, judgeFor(input, overflowingIds));
}

function judgeFor(
  input: DescribeReviewInput,
  overflowingPlacementIds: readonly string[],
): SubmissionEligibility {
  return judgeSubmissionEligibility({
    design: input.design,
    overflowingPlacementIds,
    pricing: input.pricing,
  });
}

function describePricedReview(
  input: DescribeReviewInput,
  priced: PricedDesign,
  eligibility: SubmissionEligibility,
): ReviewView {
  // What to draw is not the refusal rule: this asks the domain's predicate, which the rule uses too, for
  // whether any figure is worth showing. A kitchen past its wall that supplies nothing is refused for the wall
  // and also has nothing to draw; both are right.
  if (holdsNothingLemnariaSupplies(priced)) {
    return unavailable(refusedSubmitOfUnavailable(input, eligibility));
  }
  return describeAvailableReview(input, priced, eligibility);
}

function describeAvailableReview(
  input: DescribeReviewInput,
  priced: PricedDesign,
  eligibility: SubmissionEligibility,
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
    rowDetails: describeRowDetails(groups, content, design),
    wholeKitchenRows: rows.wholeKitchenRows,
    notIncluded: describeNotIncludedSlot(content),
    disclaimer: describeDisclaimer(content),
    figure: describeStartingPrice({
      totalMinor: priced.totalMinor,
      copy: content.price,
    }),
    submit:
      eligibility.kind === "refused"
        ? toRefusedSubmit(input, eligibility.refusal)
        : { kind: "allowed" },
    ...(warning === undefined ? {} : { overflowWarning: warning }),
  };
}

/** The two lines of a listed body's row. A body with none is the model's defect and throws; no screen picks another
 *  answer for it. */
export function rowDetailOf(
  rowDetails: Readonly<Record<string, ReviewRowDetail>>,
  placementId: string,
): ReviewRowDetail {
  const detail = Object.hasOwn(rowDetails, placementId)
    ? rowDetails[placementId]
    : undefined;
  if (detail === undefined) throw new MissingRowDetailError(placementId);
  return detail;
}

function describeRowDetails(
  groups: readonly DisplayGroup[],
  content: Content,
  design: Design,
): Readonly<Record<string, ReviewRowDetail>> {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return Object.fromEntries(
    groups
      .flatMap((group) => group.entries)
      .map((entry) => [
        entry.placementId,
        describeRowDetail(entry, { content, catalog }),
      ]),
  );
}

interface RowDetailReading {
  readonly content: Content;
  readonly catalog: BodyCatalog;
}

function describeRowDetail(
  entry: DisplayEntry,
  { content, catalog }: RowDetailReading,
): ReviewRowDetail {
  const handle = wornHandleOf(entry, catalog);
  return {
    name: describePlacementName(entry, content),
    facts: [
      content.panel.widthValue(entry.widthMm),
      ...(entry.finish === undefined
        ? []
        : [describeFinish(entry.finish, content)]),
      ...(handle === undefined ? [] : [content.panel.handleLabels[handle]]),
    ],
  };
}

/** The handle the price bills and the scene draws for this body, never the cabinet's own alone. A body whose
 *  definition takes none but whose slot is the top row opens by a latch, so it reads as the push-to-open it is billed
 *  as. */
function wornHandleOf(
  entry: DisplayEntry,
  catalog: BodyCatalog,
): Handle | undefined {
  const query = {
    y0Mm: entry.y0Mm,
    recordedHandle: entry.handle,
    kitchenSettings: entry.kitchenSettings ?? {},
    canHandle: catalog.get(entry.buildId)?.canHandle === true,
  };
  return (
    resolvedHandleAt(query) ??
    (isPushToOpen(query) ? TOP_ROW_HANDLE : undefined)
  );
}

/** A palette finish by its approved name; a free colour has no name, so by its value, as the settings pill speaks it. */
function describeFinish(finish: Finish, content: Content): string {
  return finish.kind === "palette-entry"
    ? content.finishName(finish.entryId)
    : content.globalSettings.pillColourValue(finish.value);
}

function unavailable(submit: RefusedSubmit): UnavailableReview {
  return { kind: "unavailable", submit };
}

/** The domain rule refuses every kitchen with nothing to draw, so an eligible one here is a defect. */
function refusedSubmitOfUnavailable(
  input: DescribeReviewInput,
  eligibility: SubmissionEligibility,
): RefusedSubmit {
  if (eligibility.kind === "allowed") {
    throw new ReviewInputDivergenceError(
      "an unavailable review was judged eligible for submission",
    );
  }
  return toRefusedSubmit(input, eligibility.refusal);
}

/** The one mapping from the domain's refusal onto the review's. */
function toRefusedSubmit(
  input: DescribeReviewInput,
  refusal: SubmissionRefusal,
): RefusedSubmit {
  return refusal.code === "BODIES_PAST_WALL"
    ? refusePastTheWall(input, refusal.placementIds)
    : { kind: "refused", code: refusal.code, bodies: [] };
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
