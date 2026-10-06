// The plan preview's geometry as plain numbers: a pure function from the draft to rectangles in the preview box's
// pixel space (no DOM, React, clock or module state). Seen from above, +X is right and +Z down the screen, the
// corner (0,0,0) is the origin, wall A runs along the top and wall B down the side (DEVELOPMENT-SPEC §2); flipping
// +Z as a plotted Y axis would mirrors the plan against its 3D room. Labels are placed here as an anchor plus the
// direction the text grows, since only the browser measures type.
import { wallsOf, type CornerDirection } from "@lemnaria/configurator-domain";

import type { RoomDraft, RoomLengthField } from "./room-draft";
import { fieldOfWall, hasOneHand } from "./room-url-state";

export type PlanWallId = "A" | "B" | "C";

/** Frame 1C's short reasons for a wall (*"B prea scurt"*): the leaves a marked wall's label may name. */
export type PlanWallIssueLabelKey =
  | "room.planWallIssue.tooShort"
  | "room.planWallIssue.tooLong";

/** A wall the plan paints red, and the reason written in place of its length — `markPlanWalls`'s
 *  input contract, which the issue model produces. */
export interface MarkedPlanWall {
  readonly wall: PlanWallId;
  readonly labelKey: PlanWallIssueLabelKey;
}

/**
 * The preview box in CSS pixels: the pixels painted in, so a `border-box` border is already taken off.
 */
export interface PlanBox {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface PlanPointPx {
  readonly xPx: number;
  readonly yPx: number;
}

/**
 * Which of a label's own edges its anchor names. The model places a point and the direction the text
 * grows, never a width: this module measures no text.
 */
export type PlanLabelAlignment = "centred" | "leftAligned" | "rightAligned";

/** Where a wall's length is written, in the same pixels the wall is drawn in. */
export interface PlanWallLabelPx {
  readonly xPx: number;
  /** The top of the line the label is written on; the line is `PLAN_LABEL_LINE_PX` tall. */
  readonly topPx: number;
  readonly alignment: PlanLabelAlignment;
}

export interface PlanWallRect {
  readonly wall: PlanWallId;
  /** The wall's true length, so the label beside the drawing reads the room and not the pixels. */
  readonly lengthMm: number;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Where that length is written, decided against the other bars rather than beside the paint. */
  readonly labelPx: PlanWallLabelPx;
  /** Frame 1C's short reason (*"B prea scurt"*), written in place of the length; set only by
   *  `markPlanWalls`, so its presence is the mark. */
  readonly issueLabelKey?: PlanWallIssueLabelKey;
}

export interface DrawnPlanPreview {
  readonly kind: "drawn";
  readonly boxPx: PlanBox;
  readonly scalePxPerMm: number;
  /** Where the walls meet: the drawing's origin, and (0,0,0) of the world this room produces. The
   *  top-left corner while the corner turns left, the top-right once it is mirrored. */
  readonly cornerPx: PlanPointPx;
  /** What the walls occupy, which is what "the drawing never leaves the box" is measured on. */
  readonly contentPx: PlanBox;
  readonly walls: readonly PlanWallRect[];
}

/** An incomplete form is a state of the plan, not a missing plan. The box keeps its size so the card does
 *  not jump when the drawing arrives. */
export interface EmptyPlanPreview {
  readonly kind: "empty";
  readonly boxPx: PlanBox;
}

export type PlanPreview = DrawnPlanPreview | EmptyPlanPreview;

/** Frame 1B draws both wall bars 12 px thick. A drawing constant that never scales with the room: the plan
 *  knows no depth (ADR 0139 decision 8). */
export const PLAN_WALL_THICKNESS_PX = 12;

/** The line a wall's label is written on. `plan-preview.tsx` publishes it as `.planWallLabel`'s font, so
 *  the reserved lane and the type set in it are one number. */
export const PLAN_LABEL_LINE_PX = 11;

/** How far a label stands off the wall it names, so the two are read together without touching. */
export const PLAN_LABEL_GAP_PX = 5;

/**
 * The phone's own metric set, the default for `derivePlanPreview`. The desktop panel hands over its own
 * 26 / 14 / 20 px set (declared in `plan-preview.tsx`). Metrics change what is drawn around the room,
 * never the room itself.
 */
export interface PlanPreviewMetrics {
  readonly wallThicknessPx: number;
  readonly labelLinePx: number;
  readonly labelGapPx: number;
}

export const DEFAULT_PLAN_PREVIEW_METRICS: PlanPreviewMetrics = {
  wallThicknessPx: PLAN_WALL_THICKNESS_PX,
  labelLinePx: PLAN_LABEL_LINE_PX,
  labelGapPx: PLAN_LABEL_GAP_PX,
};

/**
 * The lane kept clear above the drawing for wall A's label. It comes off the box before the scale is
 * taken, so no bar is ever painted there. A label under wall A would share the band wall B occupies and
 * be overprinted.
 */
export const PLAN_LABEL_LANE_PX = labelLanePxFor(DEFAULT_PLAN_PREVIEW_METRICS);

/** The shortest box the plan can be drawn in: the lane, the wall's thickness and the label line beside the
 *  deepest wall. A smaller box would clip the drawing or a label. */
export const PLAN_MINIMUM_BOX_HEIGHT_PX = minimumBoxHeightPxFor(
  DEFAULT_PLAN_PREVIEW_METRICS,
);

/**
 * The box a measured panel is floored at, so a caller clamps before `derivePlanPreview`, which throws a
 * `RangeError` below it. A smaller panel is drawn at this size and clipped by `.planBox`'s overflow.
 */
export function planPreviewMinimumBoxPx(metrics: PlanPreviewMetrics): PlanBox {
  return {
    widthPx: metrics.wallThicknessPx,
    heightPx: minimumBoxHeightPxFor(metrics),
  };
}

function labelLanePxFor(metrics: PlanPreviewMetrics): number {
  return metrics.labelLinePx + metrics.labelGapPx;
}

function minimumBoxHeightPxFor(metrics: PlanPreviewMetrics): number {
  return (
    labelLanePxFor(metrics) + metrics.wallThicknessPx + metrics.labelLinePx
  );
}

/** `left` is the drawn convention; `right` is the same drawing reflected and nothing else.
 *
 *  A `linear` draft is mirrored too: it draws only wall A, centred, which reflects onto itself, so the rule
 *  needs no `linear` exception. The corner point still swaps ends. */
const MIRRORED_CORNER_DIRECTION: CornerDirection = "right";

/** The wall the anchor sends along +X: across the screen on a view from above. Every other wall runs down it. */
const WALL_ACROSS_THE_SCREEN: PlanWallId = "A";

/** The wall leaving the corner along +Z (`placeLeftWall`); the others that run down stand at wall A's far end. */
const WALL_DOWN_FROM_THE_CORNER: PlanWallId = "B";

interface DrawableWall {
  readonly wall: PlanWallId;
  readonly field: RoomLengthField;
}

interface DrawableLength {
  readonly wall: PlanWallId;
  readonly millimetres: number;
}

/** A wall's bar before its label is placed: the label side is read off the surrounding bars. */
type PlanWallBar = Omit<PlanWallRect, "labelPx">;

interface PlanLayout {
  readonly scalePxPerMm: number;
  readonly originPx: PlanPointPx;
  readonly contentPx: PlanBox;
  readonly metrics: PlanPreviewMetrics;
}

/** The plan from the draft's lengths and corner direction alone: identical arguments give an identical
 *  drawing. `metrics` defaults to the phone's set. */
export function derivePlanPreview(
  draft: RoomDraft,
  box: PlanBox,
  metrics: PlanPreviewMetrics = DEFAULT_PLAN_PREVIEW_METRICS,
): PlanPreview {
  assertBoxCanHoldTheDrawing(box, metrics);

  const walls = wallsAskedForBy(draft);
  if (!isEveryWallReadable(draft, walls)) return { kind: "empty", boxPx: box };

  const drawn = drawFromTheCorner(
    drawableLengthsIn(draft, walls),
    box,
    metrics,
  );
  return isDrawnReflected(draft) ? reflectPlanPreview(drawn) : drawn;
}

/** A `right` draft is drawn reflected except a U, which has one hand (ADR 0132 decision 8): a `right`
 *  left over from an L must not turn a U's plan right-handed. */
function isDrawnReflected(draft: RoomDraft): boolean {
  return (
    draft.cornerDirection === MIRRORED_CORNER_DIRECTION &&
    !hasOneHand(draft.shape)
  );
}

/**
 * The drawing reflected about the box's vertical centre line. No length or wall identity changes, and
 * applying it twice returns the original.
 */
export function reflectPlanPreview(plan: PlanPreview): PlanPreview {
  if (plan.kind === "empty") return plan;
  return {
    ...plan,
    cornerPx: {
      xPx: reflectedXPx(plan.cornerPx.xPx, plan.boxPx),
      yPx: plan.cornerPx.yPx,
    },
    walls: plan.walls.map((wall) => reflectWall(wall, plan.boxPx)),
  };
}

/**
 * Frame 1C's red wall, as a second pure step over the drawn plan. A marked wall keeps its rectangle and
 * label anchor and gains only the reason. Marks are found by wall id and set exactly: an unnamed wall
 * comes back unmarked, and a mark for a wall the plan does not draw is dropped.
 */
export function markPlanWalls(
  plan: PlanPreview,
  markedWalls: readonly MarkedPlanWall[],
): PlanPreview {
  if (plan.kind === "empty") return plan;
  return {
    ...plan,
    walls: plan.walls.map((wall) => withIssueMark(wall, markedWalls)),
  };
}

function withIssueMark(
  wall: PlanWallRect,
  markedWalls: readonly MarkedPlanWall[],
): PlanWallRect {
  const mark = markedWalls.find((marked) => marked.wall === wall.wall);
  return mark === undefined
    ? withoutIssueMark(wall)
    : { ...withoutIssueMark(wall), issueLabelKey: mark.labelKey };
}

/** The wall as drawn, without any earlier mark. Rebuilt field by field in drawing order so an unmarked
 *  wall serialises byte for byte as drawn. */
function withoutIssueMark(wall: PlanWallRect): PlanWallRect {
  if (wall.issueLabelKey === undefined) return wall;
  return {
    wall: wall.wall,
    lengthMm: wall.lengthMm,
    xPx: wall.xPx,
    yPx: wall.yPx,
    widthPx: wall.widthPx,
    heightPx: wall.heightPx,
    labelPx: wall.labelPx,
  };
}

function drawFromTheCorner(
  lengths: readonly DrawableLength[],
  box: PlanBox,
  metrics: PlanPreviewMetrics,
): DrawnPlanPreview {
  const regionPx = drawingRegionPx(box, metrics);
  const scalePxPerMm = isotropicScalePxPerMm(lengths, regionPx, metrics);
  const contentPx = contentExtentPx(lengths, scalePxPerMm, metrics);
  const layout: PlanLayout = {
    scalePxPerMm,
    contentPx,
    metrics,
    originPx: belowTheLabelLane(centredOriginPx(contentPx, regionPx), metrics),
  };
  const bars = lengths.map((length) => placeWall(length, layout));

  return {
    kind: "drawn",
    boxPx: box,
    scalePxPerMm,
    contentPx,
    cornerPx: layout.originPx,
    walls: bars.map((bar) => ({
      ...bar,
      labelPx: labelFor(bar, bars, box, metrics),
    })),
  };
}

/** The box less the label lane. The drawing is fitted into this, never the whole box. */
function drawingRegionPx(box: PlanBox, metrics: PlanPreviewMetrics): PlanBox {
  return {
    widthPx: box.widthPx,
    heightPx: box.heightPx - labelLanePxFor(metrics),
  };
}

function belowTheLabelLane(
  originPx: PlanPointPx,
  metrics: PlanPreviewMetrics,
): PlanPointPx {
  return { xPx: originPx.xPx, yPx: originPx.yPx + labelLanePxFor(metrics) };
}

/**
 * One isotropic scale for both axes: the largest that fits the whole room in the region on both axes.
 * Frames 1A/1B use two scales (wall A 250 px for 3600 mm, wall B 50 px for 2400 mm), which would draw a
 * 6000 x 1000 mm room as a square. The scale is computed only here (see ADR 0139 decision 7); the region
 * already has the label lane off it, so there is no second subtraction.
 */
function isotropicScalePxPerMm(
  lengths: readonly DrawableLength[],
  regionPx: PlanBox,
  metrics: PlanPreviewMetrics,
): number {
  const limitsPxPerMm: number[] = [];
  const alongXMm = millimetresOf(lengths, "A");
  const alongZMm = deepestWallMm(lengths);

  if (alongXMm > 0) limitsPxPerMm.push(regionPx.widthPx / alongXMm);
  if (alongZMm > 0)
    limitsPxPerMm.push(usableDepthPx(regionPx, metrics) / alongZMm);
  return Math.min(...limitsPxPerMm);
}

/** Wall A's thickness comes off the depth before the scale is taken: the walls running down start below it. */
function usableDepthPx(regionPx: PlanBox, metrics: PlanPreviewMetrics): number {
  return regionPx.heightPx - metrics.wallThicknessPx;
}

function contentExtentPx(
  lengths: readonly DrawableLength[],
  scalePxPerMm: number,
  metrics: PlanPreviewMetrics,
): PlanBox {
  return {
    widthPx: Math.max(
      millimetresOf(lengths, "A") * scalePxPerMm,
      metrics.wallThicknessPx,
    ),
    heightPx: metrics.wallThicknessPx + deepestWallMm(lengths) * scalePxPerMm,
  };
}

/** Centred in the region, so the mirror line is the drawing's own centre and a toggled corner does not
 *  move the room across the card. */
function centredOriginPx(content: PlanBox, regionPx: PlanBox): PlanPointPx {
  return {
    xPx: (regionPx.widthPx - content.widthPx) / 2,
    yPx: (regionPx.heightPx - content.heightPx) / 2,
  };
}

function placeWall(length: DrawableLength, layout: PlanLayout): PlanWallBar {
  if (length.wall === WALL_ACROSS_THE_SCREEN)
    return placeBackWall(length, layout);
  if (length.wall === "B") return placeLeftWall(length, layout);
  return placeFarWall(length, layout);
}

/** Wall A leaves the corner along +X: right along the top. */
function placeBackWall(
  length: DrawableLength,
  layout: PlanLayout,
): PlanWallBar {
  return {
    wall: length.wall,
    lengthMm: length.millimetres,
    xPx: layout.originPx.xPx,
    yPx: layout.originPx.yPx,
    widthPx: length.millimetres * layout.scalePxPerMm,
    heightPx: layout.metrics.wallThicknessPx,
  };
}

/** Wall B leaves the same corner along +Z, which on a view from above is **down** the screen. */
function placeLeftWall(
  length: DrawableLength,
  layout: PlanLayout,
): PlanWallBar {
  return {
    wall: length.wall,
    lengthMm: length.millimetres,
    xPx: layout.originPx.xPx,
    yPx: belowTheBackWallPx(layout),
    widthPx: layout.metrics.wallThicknessPx,
    heightPx: length.millimetres * layout.scalePxPerMm,
  };
}

/** A U's third wall closes the room at the far end of wall A, running down beside it. */
function placeFarWall(length: DrawableLength, layout: PlanLayout): PlanWallBar {
  return {
    wall: length.wall,
    lengthMm: length.millimetres,
    xPx:
      layout.originPx.xPx +
      layout.contentPx.widthPx -
      layout.metrics.wallThicknessPx,
    yPx: belowTheBackWallPx(layout),
    widthPx: layout.metrics.wallThicknessPx,
    heightPx: length.millimetres * layout.scalePxPerMm,
  };
}

function belowTheBackWallPx(layout: PlanLayout): number {
  return layout.originPx.yPx + layout.metrics.wallThicknessPx;
}

/** Where a wall's length is written: above the drawing for a wall across the screen, beside its own bar for
 *  one running down it. */
function labelFor(
  bar: PlanWallBar,
  bars: readonly PlanWallBar[],
  box: PlanBox,
  metrics: PlanPreviewMetrics,
): PlanWallLabelPx {
  return runsAcrossTheScreen(bar)
    ? aboveTheWall(bar, metrics)
    : besideTheWall(bar, bars, box, metrics);
}

/** Frame 1B's placement: centred over the wall in the lane nothing is painted in, so the text grows
 *  symmetrically out of the box's own middle. */
function aboveTheWall(
  bar: PlanWallBar,
  metrics: PlanPreviewMetrics,
): PlanWallLabelPx {
  return {
    xPx: bar.xPx + bar.widthPx / 2,
    topPx: bar.yPx - labelLanePxFor(metrics),
    alignment: "centred",
  };
}

/**
 * Beside the bar at its middle, on whichever side has more room: the room's inside where it fits, else the
 * box's margin. Only bars that cross the label's line count as obstructions, and a bar blocks a side as
 * soon as it reaches past the wall's edge on that side (a U with a very short wall A overlaps B and C).
 */
function besideTheWall(
  bar: PlanWallBar,
  bars: readonly PlanWallBar[],
  box: PlanBox,
  metrics: PlanPreviewMetrics,
): PlanWallLabelPx {
  const facing = facingWallOf(bar, bars, box, metrics);
  const pair = facing === undefined ? undefined : { bar, facing, box, metrics };
  const arrangement = pair === undefined ? undefined : arrangementOf(pair);
  if (pair !== undefined && arrangement === "beneath") {
    return beneathLabel(pair);
  }
  const topPx =
    pair !== undefined && arrangement === "stacked"
      ? stackedTopPx(pair)
      : lineBesideTheWallTopPx(bar, box, metrics);
  const crossing = bars.filter((other) =>
    crossesTheLine(other, topPx, metrics),
  );
  const towardsTheRight = sharesItsBarWithAnother(bar, crossing)
    ? isTheFarWall(bar)
    : (sideOf(bar, arrangement) ??
      freeToTheRightPx(bar, crossing, box) >= freeToTheLeftPx(bar, crossing));

  return {
    xPx: insideTheBoxPx(anchorBesidePx(bar, towardsTheRight, metrics), box),
    topPx,
    alignment: towardsTheRight ? "leftAligned" : "rightAligned",
  };
}

/**
 * The line beside a wall running down the screen: centred on the bar but never starting above the bar's
 * top. A short wall B (100 mm beside a 3600 mm wall A is under 9 px) would otherwise print its label over
 * wall A. Held inside the box; decided from the bars and the line height, never from the text.
 */
function lineBesideTheWallTopPx(
  bar: PlanWallBar,
  box: PlanBox,
  metrics: PlanPreviewMetrics,
): number {
  const centredTopPx = bar.yPx + bar.heightPx / 2 - metrics.labelLinePx / 2;
  const flooredAtTheBarTopPx = Math.max(centredTopPx, bar.yPx);
  return Math.min(flooredAtTheBarTopPx, box.heightPx - metrics.labelLinePx);
}

/**
 * Two walls drawn on one bar (a U whose wall A is no wider than a wall is thick puts C where B is). The
 * tie breaks by id: B is labelled on the corner's outside and C on the far side, so the labels do not
 * overprint. This is the left-turning layout; a mirrored plan carries each label with its wall.
 */
function sharesItsBarWithAnother(
  bar: PlanWallBar,
  crossing: readonly PlanWallBar[],
): boolean {
  return crossing.some(
    (other) =>
      other.wall !== bar.wall &&
      other.xPx === bar.xPx &&
      other.widthPx === bar.widthPx,
  );
}

/**
 * Facing walls (a U's B and C, whose lines share pixel rows or cross each other's bar) must write labels that
 * cannot meet. Tried in order: inside the gap between the bars; outside on each bar's outer side; beneath the bars,
 * one row each, near wall first; stacked, C's line below B's. Stacked is the last resort, since a clipped label is
 * worse than a moved one.
 */
function facingWallOf(
  bar: PlanWallBar,
  bars: readonly PlanWallBar[],
  box: PlanBox,
  metrics: PlanPreviewMetrics,
): PlanWallBar | undefined {
  const lineTopPx = lineBesideTheWallTopPx(bar, box, metrics);
  return bars.find((other) => {
    if (other.wall === bar.wall || runsAcrossTheScreen(other)) return false;
    const otherLineTopPx = lineBesideTheWallTopPx(other, box, metrics);
    return (
      Math.abs(otherLineTopPx - lineTopPx) < metrics.labelLinePx ||
      crossesTheLine(other, lineTopPx, metrics) ||
      crossesTheLine(bar, otherLineTopPx, metrics)
    );
  });
}

interface FacingLabels {
  readonly bar: PlanWallBar;
  readonly facing: PlanWallBar;
  readonly box: PlanBox;
  readonly metrics: PlanPreviewMetrics;
}

type FacingArrangement = "inside" | "outside" | "beneath" | "stacked";

function arrangementOf(pair: FacingLabels): FacingArrangement {
  if (labelsFitBetween(pair)) return "inside";
  if (labelsFitOutside(pair)) return "outside";
  if (labelsFitBeneath(pair)) return "beneath";
  return "stacked";
}

/** Which side of its own bar a label takes; `undefined` for stacked, for beneath (which places both labels
 *  itself) and for a wall with no facing wall. */
function sideOf(
  bar: PlanWallBar,
  arrangement: FacingArrangement | undefined,
): boolean | undefined {
  if (arrangement === "inside") return !isTheFarWall(bar);
  if (arrangement === "outside") return isTheFarWall(bar);
  return undefined;
}

/** The line this wall is written on once the facing lines are stacked: the far wall's below the near one's,
 *  or the near one's above when the box floor stops that, never above its own bar's top. A box too short
 *  for both lines keeps each where it was. */
function stackedTopPx(pair: FacingLabels): number {
  const { bar, facing, box, metrics } = pair;
  const near = isTheFarWall(bar) ? facing : bar;
  const far = near === bar ? facing : bar;
  const nearNaturalPx = lineBesideTheWallTopPx(near, box, metrics);
  const farPx = Math.min(
    Math.max(
      lineBesideTheWallTopPx(far, box, metrics),
      nearNaturalPx + metrics.labelLinePx,
    ),
    box.heightPx - metrics.labelLinePx,
  );
  const nearPx = Math.max(
    Math.min(nearNaturalPx, farPx - metrics.labelLinePx),
    near.yPx,
  );
  const holdsBothLines = nearPx + metrics.labelLinePx <= farPx;
  if (!holdsBothLines) return lineBesideTheWallTopPx(bar, box, metrics);
  return bar === near ? nearPx : farPx;
}

function leftAndRightOf(
  pair: FacingLabels,
): readonly [PlanWallBar, PlanWallBar] {
  return pair.bar.xPx <= pair.facing.xPx
    ? [pair.bar, pair.facing]
    : [pair.facing, pair.bar];
}

function labelsFitBetween(pair: FacingLabels): boolean {
  const [left, right] = leftAndRightOf(pair);
  const gapPx = right.xPx - rightEdgePx(left);
  const neededPx =
    widestLabelPx(left, pair.metrics) +
    widestLabelPx(right, pair.metrics) +
    2 * pair.metrics.labelGapPx;
  return gapPx >= neededPx;
}

function labelsFitOutside(pair: FacingLabels): boolean {
  const [left, right] = leftAndRightOf(pair);
  const leftRoomPx = left.xPx - pair.metrics.labelGapPx;
  const rightRoomPx =
    pair.box.widthPx - rightEdgePx(right) - pair.metrics.labelGapPx;
  return (
    leftRoomPx >= widestLabelPx(left, pair.metrics) &&
    rightRoomPx >= widestLabelPx(right, pair.metrics)
  );
}

/** Beneath needs two rows below both bars (one per label), a gap under the lower bar, and a box at least
 *  as wide as the widest text. */
function labelsFitBeneath(pair: FacingLabels): boolean {
  const { bar, facing, box, metrics } = pair;
  const belowBothPx = Math.max(bottomEdgePx(bar), bottomEdgePx(facing));
  const lastRowBottomPx =
    belowBothPx + metrics.labelGapPx + 2 * metrics.labelLinePx;
  const widestPx = Math.max(
    widestLabelPx(bar, metrics),
    widestLabelPx(facing, metrics),
  );
  return lastRowBottomPx <= box.heightPx && widestPx <= box.widthPx;
}

/** Beneath: the near wall's label on the first row from its bar's left edge, the far wall's on the next row
 *  ending at its bar's right edge, each pulled back just far enough to stay inside the box. */
function beneathLabel(pair: FacingLabels): PlanWallLabelPx {
  const { bar, facing, box, metrics } = pair;
  const isFar = isTheFarWall(bar);
  const belowBothPx = Math.max(bottomEdgePx(bar), bottomEdgePx(facing));
  const firstRowPx = belowBothPx + metrics.labelGapPx;
  const labelPx = widestLabelPx(bar, metrics);
  return isFar
    ? {
        xPx: Math.max(Math.min(rightEdgePx(bar), box.widthPx), labelPx),
        topPx: firstRowPx + metrics.labelLinePx,
        alignment: "rightAligned",
      }
    : {
        xPx: Math.min(Math.max(bar.xPx, 0), box.widthPx - labelPx),
        topPx: firstRowPx,
        alignment: "leftAligned",
      };
}

/** Em of `"{wall} · {n} mm"` independent of the number: letter, spaces, middle dot and unit at their widest.
 *  Measured 5,84 em for *"A · 3600 mm"* in Chromium at `700 11px Helvetica`; the bound is 6,1 em, of which four
 *  digits at 0,6 em are 2,4. */
const LABEL_FIXED_EM = 3.7;

/** The widest a digit is set in the screen's face, generously: tabular figures are 0,556 em. */
const LABEL_DIGIT_EM = 0.6;

/** The widest a frame-1C reason can be set, in em of the label's font: `{wall} {reason}` in either locale.
 *  The widest today is *"B слишком короткая"*, 10,60 em in Chromium at `700 Helvetica`, plus a tenth to
 *  spare (11,7 em). Guarded by glyph width, not string length: `tests/support/plan-reason-glyphs.ts` sums
 *  measured advances and fails on a letter it has not measured. */
export const PLAN_LABEL_REASON_MAX_EM = 11.7;

/** An upper bound on a wall's label text, from what it says and never from a measured string: the wider of
 *  the length (`{wall} · {millimetres} mm`, bounded by digit count) and a frame-1C reason, times the line
 *  size. The reason is counted on every facing wall, marked or not: marking keeps the geometry it is given,
 *  so placement must leave room for the wider text. It may be a little wide, never narrow. */
function widestLabelPx(bar: PlanWallBar, metrics: PlanPreviewMetrics): number {
  const digits = String(bar.lengthMm).length;
  const lengthEm = LABEL_FIXED_EM + LABEL_DIGIT_EM * digits;
  return Math.max(lengthEm, PLAN_LABEL_REASON_MAX_EM) * metrics.labelLinePx;
}

/** Every wall but the one leaving the corner down the screen stands on the far side of the drawing. */
function isTheFarWall(bar: PlanWallBar): boolean {
  return bar.wall !== WALL_DOWN_FROM_THE_CORNER;
}

function anchorBesidePx(
  bar: PlanWallBar,
  towardsTheRight: boolean,
  metrics: PlanPreviewMetrics,
): number {
  return towardsTheRight
    ? rightEdgePx(bar) + metrics.labelGapPx
    : bar.xPx - metrics.labelGapPx;
}

function freeToTheLeftPx(
  bar: PlanWallBar,
  crossing: readonly PlanWallBar[],
): number {
  const edgesPx = crossing
    .filter((other) => other.xPx < bar.xPx)
    .map((other) => Math.min(rightEdgePx(other), bar.xPx));
  return bar.xPx - Math.max(0, ...edgesPx);
}

function freeToTheRightPx(
  bar: PlanWallBar,
  crossing: readonly PlanWallBar[],
  box: PlanBox,
): number {
  const edgesPx = crossing
    .filter((other) => rightEdgePx(other) > rightEdgePx(bar))
    .map((other) => Math.max(other.xPx, rightEdgePx(bar)));
  return Math.min(box.widthPx, ...edgesPx) - rightEdgePx(bar);
}

/** A bar stands between a label and the room only where it crosses the line the label is on. */
function crossesTheLine(
  bar: PlanWallBar,
  topPx: number,
  metrics: PlanPreviewMetrics,
): boolean {
  return bar.yPx < topPx + metrics.labelLinePx && bottomEdgePx(bar) > topPx;
}

/** A box too narrow to stand a label beside a wall keeps the anchor rather than putting it outside:
 *  a cramped label can still be read and a clipped one cannot. */
function insideTheBoxPx(xPx: number, box: PlanBox): number {
  return Math.min(Math.max(xPx, 0), box.widthPx);
}

/** Wall A runs across the screen; B and C run down it. Decided by the letter, not the rectangle: a wall
 *  drawn shorter than a wall is thick is a bar taller than it is wide. */
function runsAcrossTheScreen(bar: PlanWallBar): boolean {
  return bar.wall === WALL_ACROSS_THE_SCREEN;
}

function rightEdgePx(bar: PlanWallBar): number {
  return bar.xPx + bar.widthPx;
}

function bottomEdgePx(bar: PlanWallBar): number {
  return bar.yPx + bar.heightPx;
}

function reflectWall(wall: PlanWallRect, box: PlanBox): PlanWallRect {
  return {
    ...wall,
    xPx: reflectedXPx(rightEdgePx(wall), box),
    labelPx: reflectLabel(wall.labelPx, box),
  };
}

/** A label reflects with its wall: the anchor crosses the mirror line and the text grows the other
 *  way, which is what keeps a mirrored plan a reflection rather than a second layout. */
function reflectLabel(label: PlanWallLabelPx, box: PlanBox): PlanWallLabelPx {
  return {
    ...label,
    xPx: reflectedXPx(label.xPx, box),
    alignment: REFLECTED_ALIGNMENT[label.alignment],
  };
}

const REFLECTED_ALIGNMENT: Readonly<
  Record<PlanLabelAlignment, PlanLabelAlignment>
> = {
  centred: "centred",
  leftAligned: "rightAligned",
  rightAligned: "leftAligned",
};

/** The mirror line is the box's vertical centre: a point at `x` lands at `boxWidth - x`. */
function reflectedXPx(xPx: number, box: PlanBox): number {
  return box.widthPx - xPx;
}

/** The walls this shape has, from `wallsOf`, the enumeration `requiredFieldsFor` also reads. A field the
 *  shape lacks is not drawn even when it still holds a value typed under another shape. */
function wallsAskedForBy(draft: RoomDraft): readonly DrawableWall[] {
  return wallsOf(draft.shape).map((wall) => ({
    wall,
    field: fieldOfWall(wall),
  }));
}

/**
 * The plan draws only once every wall the shape asks for reads as a length: a U missing wall C is exactly
 * an L, so drawing the readable part would show a room the customer did not choose.
 */
function isEveryWallReadable(
  draft: RoomDraft,
  walls: readonly DrawableWall[],
): boolean {
  return walls.every(
    (wall) => draft.lengths[wall.field].millimetres !== undefined,
  );
}

/** The walls asked for that read as a length, each with its millimetres. */
function drawableLengthsIn(
  draft: RoomDraft,
  walls: readonly DrawableWall[],
): readonly DrawableLength[] {
  return walls.flatMap((wall) => {
    const millimetres = draft.lengths[wall.field].millimetres;
    return millimetres === undefined ? [] : [{ wall: wall.wall, millimetres }];
  });
}

function millimetresOf(
  lengths: readonly DrawableLength[],
  wall: PlanWallId,
): number {
  return lengths.find((length) => length.wall === wall)?.millimetres ?? 0;
}

/** How far down the screen the drawing reaches: the longer of the two walls that run down it. */
function deepestWallMm(lengths: readonly DrawableLength[]): number {
  return Math.max(millimetresOf(lengths, "B"), millimetresOf(lengths, "C"));
}

function assertBoxCanHoldTheDrawing(
  box: PlanBox,
  metrics: PlanPreviewMetrics,
): void {
  const fits =
    Number.isFinite(box.widthPx) &&
    Number.isFinite(box.heightPx) &&
    box.widthPx >= metrics.wallThicknessPx &&
    box.heightPx >= minimumBoxHeightPxFor(metrics);
  if (!fits) {
    throw new RangeError(
      `derivePlanPreview: a preview box of ${String(box.widthPx)} x ${String(box.heightPx)} px cannot hold a wall ${String(metrics.wallThicknessPx)} px thick and the lanes its labels are written in`,
    );
  }
}
