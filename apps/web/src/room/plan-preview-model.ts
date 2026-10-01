// The plan preview's geometry, as plain numbers: a pure function from the draft to rectangles in the
// preview box's own pixel space. No DOM, no React, no clock and no module state, so the drawing is
// provable without a browser — which is the reason this module exists apart from the component that
// paints it (criteria 11, 12 and 13).
//
// **The anchor is adopted here, never re-derived** (criterion 12). `DEVELOPMENT-SPEC.md` §2 fixes the
// world: *"Wall A = back wall, plane z = 0, fronts face +Z"*, *"Wall B = left wall, plane x = 0,
// fronts face +X"*. `packages/configurator-domain/src/room-transforms.ts:29-49` implements it and its
// doc comment adds the part this drawing turns on — *"Both walk 'along' from the corner where they
// meet (0,0,0)"*: wall A's tangent is +X and wall B's is +Z, out of one shared origin.
//
// **So, read from above with +X to the right and +Z down the screen:** the corner is the drawing's
// origin, wall A runs right along the top, wall B runs down the side. That is the view frame 1B
// draws, so the frame and the domain already agree and this module only writes the agreement down.
// **Flipping +Z the way a plotted Y axis would is the error to avoid**: a top-down view looks *down*.
// An inverted plan stays self-consistent — every test either side would still pass — while the
// drawing silently mirrors against the 3D room it produces, which only a customer comparing the two
// would ever see.
//
// **The labels are placed here too, and that is the point.** A label is placed against the *other*
// walls — the lane no bar is painted in, the side of a bar that has the room for it — and a renderer
// holding one rectangle at a time cannot see any of that. What this module never decides is how wide
// a label comes out: it places an anchor and states which way the text grows from it, and the
// browser measures the type.
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

/** The preview box the drawing is fitted into, in CSS pixels. **The pixels that are painted in**, not
 *  the box that is painted: a border is spent out of an element's own width under `border-box`, so
 *  the caller hands over what is left inside it (`plan-preview.tsx`). */
export interface PlanBox {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface PlanPointPx {
  readonly xPx: number;
  readonly yPx: number;
}

/** Which of a label's own edges its anchor names. The model places a point and says which way the
 *  text grows from it, and **never a width**: how wide *"A · 3600 mm"* comes out is a font's, a
 *  locale's and a translation's to decide, and this module measures no text. */
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
  /** Where that length is written. Placement is decided here rather than beside the paint, because
   *  it is decided **against the other bars** — a label the renderer placed on its own would have
   *  only one wall's rectangle to go on. */
  readonly labelPx: PlanWallLabelPx;
  /** Frame 1C's short reason (*"B prea scurt"*), written in place of the length on a wall the room
   *  refuses. Only `markPlanWalls` sets it, so its presence *is* the mark; absent on every other wall. */
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

/** Not every wall the chosen shape asks for reads as a length yet — an incomplete form is a state of
 *  the plan, not a missing plan, so the caller branches on it instead of receiving a drawing of a room
 *  nobody entered. The box stays the same size, so the card does not jump when the drawing arrives. */
export interface EmptyPlanPreview {
  readonly kind: "empty";
  readonly boxPx: PlanBox;
}

export type PlanPreview = DrawnPlanPreview | EmptyPlanPreview;

/** Frame 1B draws both wall bars 12 px thick (`Lemnaria Configurator Mobil.dc.html:135-136`). It is a
 *  drawing constant and **never scales with the room** (criterion 12): the plan knows no depth at all
 *  (ADR 0083 decision 2), so the thickness is only what makes a wall readable. */
export const PLAN_WALL_THICKNESS_PX = 12;

/** The line a wall's label is written on. `plan-preview.tsx` publishes it to `.planWallLabel`'s
 *  `font`, so the lane reserved for a label below and the type actually set in it are one number and
 *  cannot disagree — the frame's own `700 11px/1` (`:137-138`), unchanged. */
export const PLAN_LABEL_LINE_PX = 11;

/** How far a label stands off the wall it names, so the two are read together without touching. */
export const PLAN_LABEL_GAP_PX = 5;

/**
 * **Wave 7L D6a: the three figures above are the phone's own, kept as a named set rather than a
 * literal handed to `derivePlanPreview` at every call site.** Every caller before this wave gets
 * exactly this set by default, so its output is unchanged; the desktop panel (S2) hands over D1B's
 * own 26 / 14 / 20 px set instead, declared beside this one in `plan-preview.tsx`. Nothing here
 * scales with the room (criterion 12) — a metric set changes what is drawn *around* the room, never
 * the room itself.
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
 * **The lane kept clear above the drawing, and the reason a label cannot be overprinted.** Frame 1B
 * writes wall A's label above wall A (`:137`, over the bar at `:135`) and this is that placement made
 * structural: the lane comes off the box *before* the scale is taken, so no bar is ever painted in it
 * — whatever the room measures, and however wide the text turns out to be.
 *
 * A label written *under* wall A instead shares the band the walls running down the screen occupy,
 * and no anchor can save it there: at 2500 x 5000 mm the label is wider than wall A is long, so
 * wall B's bar ran through *"A · 2500 mm"* for its full height.
 */
export const PLAN_LABEL_LANE_PX = labelLanePxFor(DEFAULT_PLAN_PREVIEW_METRICS);

/** The shortest box the plan can be drawn in: the lane above the drawing, the wall's own thickness,
 *  and the line the label beside the deepest wall is written on. Below it either the drawing or a
 *  label would leave the box, and the caller is handing over a box it has not sized. */
export const PLAN_MINIMUM_BOX_HEIGHT_PX = minimumBoxHeightPxFor(
  DEFAULT_PLAN_PREVIEW_METRICS,
);

/**
 * **D6e: the box a measured panel is floored at, published so a caller can clamp before it ever
 * calls `derivePlanPreview`.** A panel a customer's window has genuinely made smaller than this is
 * drawn at this size and left to `.planBox`'s own `overflow: hidden` to clip — never a thrown
 * `RangeError`, and never a wider document.
 */
export function planPreviewMinimumBoxPx(metrics: PlanPreviewMetrics): PlanBox {
  return {
    widthPx: metrics.wallThicknessPx,
    heightPx: minimumBoxHeightPxFor(metrics),
  };
}

/** The lane a metric set reserves above the drawing — `PLAN_LABEL_LANE_PX`'s own arithmetic, worked
 *  out for whichever set the caller handed over instead of always the default one. */
function labelLanePxFor(metrics: PlanPreviewMetrics): number {
  return metrics.labelLinePx + metrics.labelGapPx;
}

/** The shortest box a metric set can be drawn in — `PLAN_MINIMUM_BOX_HEIGHT_PX`'s own arithmetic,
 *  worked out for whichever set the caller handed over. */
function minimumBoxHeightPxFor(metrics: PlanPreviewMetrics): number {
  return (
    labelLanePxFor(metrics) + metrics.wallThicknessPx + metrics.labelLinePx
  );
}

/** `left` is the drawn convention, with the corner at the origin the world puts it at; `right` is
 *  that same drawing reflected, and nothing else (criterion 13).
 *
 *  **A `linear` draft is mirrored too, and that is deliberate.** Every draft carries a corner
 *  direction whatever its shape (`room-draft.ts:59-83`) even though only `carriesCornerDirection`
 *  shapes show a control for it, so `right` reaches this branch under `linear` as well. All a linear
 *  plan draws is wall A, centred, which reflects onto itself — the rule is left unconditional
 *  because it already changes nothing there, not because the `linear` case went unconsidered. The
 *  corner point still swaps ends, which is the truth about a lone wall rather than a defect: it is
 *  the end the room would turn at, and no linear plan draws a turn. */
const MIRRORED_CORNER_DIRECTION: CornerDirection = "right";

/** The wall the anchor sends along +X, which on a view from above is the one that runs across the
 *  screen. Every other wall a plan draws runs down it. */
const WALL_ACROSS_THE_SCREEN: PlanWallId = "A";

/** The wall the anchor sends along +Z out of the corner itself (`placeLeftWall`); the others that run
 *  down the screen stand at the far end of wall A. */
const WALL_DOWN_FROM_THE_CORNER: PlanWallId = "B";

interface DrawableWall {
  readonly wall: PlanWallId;
  readonly field: RoomLengthField;
}

interface DrawableLength {
  readonly wall: PlanWallId;
  readonly millimetres: number;
}

/** A wall's bar before its label is placed: the side a label goes on is read off the bars around it,
 *  so the drawing is laid out once and then labelled once. */
type PlanWallBar = Omit<PlanWallRect, "labelPx">;

interface PlanLayout {
  readonly scalePxPerMm: number;
  readonly originPx: PlanPointPx;
  readonly contentPx: PlanBox;
  readonly metrics: PlanPreviewMetrics;
}

/** The plan, from the draft's lengths and its corner direction and from nothing else: no cabinet, no
 *  placement, no catalogue and no depth. Identical arguments give an identical drawing.
 *
 *  **`metrics` defaults to the phone's own set** (D6a): every call site before wave 7L's slice S2,
 *  and every one that still omits the argument, draws exactly what it always has. Only the desktop
 *  panel hands over a set of its own. */
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

/** A draft that says `right` is drawn reflected — except a U, which has one hand (ADR 0132 decision
 *  8, Q-U4 (b)): a `right` left over from an L the customer looked at first must not turn a U's
 *  plan into a right-hand one the 3D room will never be. */
function isDrawnReflected(draft: RoomDraft): boolean {
  return (
    draft.cornerDirection === MIRRORED_CORNER_DIRECTION &&
    !hasOneHand(draft.shape)
  );
}

/**
 * The drawing reflected about the preview box's vertical centre line — the whole of what mirroring
 * does (criterion 13). No length changes, no wall changes identity, and applying it twice returns
 * the drawing it started from, which is the property that says this is a reflection rather than a
 * second layout.
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
 * Frame 1C's red wall, as a **second pure step over the drawn plan** (wave 7F2 criterion 7). Marking
 * is not geometry: a marked wall keeps its exact rectangle and its label's anchor, and gains only the
 * reason written in place of its length. A mark finds its wall by **id**, never by array index or by
 * side, so a mirrored plan carries it on the same wall; a mark for a wall the plan does not draw is
 * dropped with nothing drawn for it. Marks are set **exactly**: a wall the list does not name comes
 * back unmarked, even from a plan that was marked before.
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

/** The wall as `derivePlanPreview` drew it, whatever an earlier marking set on it: marks are set
 *  exactly, so a plan marked again with fewer marks loses the ones it no longer names. Rebuilt field
 *  by field, in the drawing's own order, so an unmarked wall serialises byte for byte as drawn. */
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

/** What the label lane leaves of the box. The drawing is fitted into this and never into the whole
 *  box, which is the whole mechanism that keeps the lane clear. */
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
 * **One isotropic scale for both axes** (criterion 12), and this wave's single deliberate departure
 * from frames 1A and 1B (ruling R4): the frame draws wall A at 250 px for 3600 mm and wall B at 50
 * px for 2400 mm — two scales — which would draw a 6000 x 1000 mm room as a square. The scale is the
 * largest that leaves the whole room inside the **region** on both axes, and it is arithmetic
 * nowhere else in this module: if the frame's literal proportions are ruled for instead, this
 * function is the only thing that moves.
 *
 * It is handed the drawing region rather than the box, so the label lane is already off it. Taking
 * the lane off here instead would put a second subtraction beside the scale.
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

/** Wall A's own thickness is spent before a single millimetre of depth is drawn, because the walls
 *  running down the screen start below it — so it comes off the region before the scale is taken. */
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

/** The drawing sits in the middle of the region, so the mirror line is also the drawing's own centre
 *  and a toggled corner moves the walls without moving the room across the card. */
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

/** Where a wall's length is written: above the drawing for a wall that runs across the screen, beside
 *  its own bar for one that runs down it. Which of the two a wall is comes from the rectangle it was
 *  drawn as and never from its letter — the letters' directions are stated once, in the anchor. */
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

/** Frame 1B's own placement (`:135` and `:137`): centred over the wall, in the lane nothing is ever
 *  painted in. The drawing is centred in the box, so this anchor is the box's own middle and the
 *  text grows symmetrically out of it. */
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
 * Beside the bar, at its middle, on **whichever side of it has the more room** — the room's inside
 * where the drawing leaves space there (frame 1B `:138`), the box's own margin where it does not.
 *
 * Choosing the side is the fix for a label written into pixels that do not exist: a U's far wall
 * stands at the drawing's right edge, so "always to the right of the bar" put *"C · 1200 mm"* past the
 * box and the customer saw three walls and two labels. The obstructions counted are only the bars
 * that actually cross the line the label is written on, so a wall stopping short of it is not read
 * as one. **A bar blocks a side as soon as it reaches past the wall's edge on that side**, not only
 * when it lies wholly beyond it: a U with a very short wall A draws B and C overlapping, and a label
 * sent towards the bar it overlaps was printed on it (7F2 S2).
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
 * The line beside a wall that runs down the screen: centred on the bar, but **never starting above
 * the bar's own top**, which is where the wall across the screen ends. A bar drawn shorter than the
 * line is tall — wall B typed at 100 mm beside a 3600 mm wall A comes out under 9 px — would
 * otherwise centre the line up into wall A's bar, and a label beside B would be printed over A
 * (7F2 S2 QA finding 1). Held inside the box as well, so the floor never pushes a line off its
 * bottom. Decided from the bars and the line height only, never from the text.
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
 * **Two walls drawn on one bar.** A U whose wall A draws no wider than a wall is thick puts wall C
 * exactly where wall B is, and neither blocks a side of the other — so both labels took the same
 * anchor and were printed over each other (7F2 S2 review, R1.1). The tie is broken by the walls'
 * ids, following the anchor rather than the pixels: B, which leaves the corner, is labelled on the
 * corner's outside, and C on the far side. This layout is the left-turning one, so a mirrored plan
 * carries each label with its wall.
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
 * **Two walls that face each other write their labels so the labels cannot meet** (backlog 72). A
 * U's walls B and C both run down the screen and both used to label towards whichever side had more
 * room — the room's inside, for both — so a U drawn narrower than two labels put *"B · 2400 mm"* and
 * *"C · 2400 mm"* on the same pixels, and the customer read *"B · 24002400 mm"*.
 *
 * Four arrangements are proved not to meet, and they are tried in this order:
 *
 * 1. **Both inside**, when the gap between the two bars holds both labels each at its widest
 *    (`widestLabelPx`, which counts a marked wall's reason as well as its length) — frame 1B's own
 *    placement for wall B.
 * 2. **Both outside**, each on its own bar's outer side, when the box has the room for both there.
 *    B's label then lies wholly left of B's bar and C's wholly right of C's, and B's bar is never
 *    right of C's, so they cannot intersect however narrow the gap.
 * 3. **Beneath**, when neither fits: both labels on their own rows under the bars, the near wall's
 *    first, each held inside the box. No bar reaches those rows, so the pair cannot meet and neither is
 *    printed over a bar. It needs the room under the lower bar, which a short wall leaves and a deep
 *    one — whose drawing is narrow, so the outside arrangement fits — does not.
 * 4. **Stacked**, when the box is too narrow for either: C's line is moved below B's (or B's above
 *    C's, if the box floor stops it), so the two lines share no pixel row and the sides no longer
 *    matter. A label that is clipped is worse than one that is moved a line, so this is the last
 *    resort and not the first.
 *
 * Two walls are facing when their labels could meet: their lines share pixel rows, or either line
 * crosses the other wall's bar (a label wider than the gap between the bars reaches it from a row of
 * its own). A wall whose line is clear of the other's line and bar is not a facing wall at all.
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

/** Which side of its own bar a label takes in an arrangement that decides it; `undefined` for
 *  stacked, whose lines cannot meet whichever side each takes, for beneath, which places both labels
 *  itself, and for a wall with no facing wall. */
function sideOf(
  bar: PlanWallBar,
  arrangement: FacingArrangement | undefined,
): boolean | undefined {
  if (arrangement === "inside") return !isTheFarWall(bar);
  if (arrangement === "outside") return isTheFarWall(bar);
  return undefined;
}

/** The line this wall is written on once the two facing lines are stacked. The far wall's line goes
 *  below the near one's; when the box floor stops that, the near one's goes above the far one's,
 *  never above its own bar's top, where wall A's bar ends. **A box too short to hold both lines
 *  keeps each where it was**: moving a label off the box is worse than two that share a row. */
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

/** Below both bars there is a full box width of free pixel rows, and it is the one place a label the
 *  box's width barely holds can stand clear of every bar. Two rows are needed there (one per label, so
 *  the pair cannot meet), a gap under the lower bar, and a box at least as wide as the widest text. */
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

/** **Beneath**: the near wall's label on the first row under the bars, starting at its own bar's left
 *  edge, and the far wall's on the row after it, ending at its own bar's right edge — each pulled back
 *  just far enough to stay inside the box. The rows are the two walls' own and no bar reaches them, so
 *  the labels cannot meet each other or be printed over a bar, whatever the text. */
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

/** Em of `"{wall} · {n} mm"` that do not depend on the number: the letter, the two spaces and the
 *  middle dot, the unit, all at their widest. Measured at 64,2 px for *"A · 3600 mm"* in Chromium at
 *  `700 11px Helvetica` (7F2 S2 QA), which is 5,84 em; four digits are 2,4 em of that bound. */
const LABEL_FIXED_EM = 3.7;

/** The widest a digit is set in the screen's face, generously: tabular figures are 0,556 em. */
const LABEL_DIGIT_EM = 0.6;

/** **The widest a frame-1C reason can be set, in em of the label's own font** — `{wall} {reason}`, in
 *  either locale. The widest in the catalogues today is *"B слишком короткая"*, measured 10,60 em
 *  whole in Chromium at `700 Helvetica`; this is that with a tenth to spare (11,7 em), so a rounding
 *  in a browser's own metrics does not put a label a pixel wider than the room reserved.
 *
 *  **It is guarded by width, not by length of string.** A count of characters cannot see that *ш*,
 *  *щ*, *ж*, *ю* and *м* are 0,72–0,89 em where *т* is 0,50, so a future reason of the same length
 *  spelled in wide letters would have passed a character count and overlapped. The test sums every
 *  reason's glyph advances (`tests/support/plan-reason-glyphs.ts`, measured) and holds the sum to this
 *  number, and it fails on a letter the table has not measured. */
export const PLAN_LABEL_REASON_MAX_EM = 11.7;

/** An upper bound on the text a wall's label can be showing, from what the text says and never from a
 *  measured string. **It is the wider of the two things the label can read**: the length,
 *  `{wall} · {millimetres} mm`, bounded by its digit count; and frame 1C's reason
 *  (`markPlanWalls`), bounded by `PLAN_LABEL_REASON_MAX_EM`. Both times the line it is set on
 *  (`labelLinePx` is the font size, `plan-preview.tsx`'s `--plan-label-line`).
 *
 *  **Why the reason is always counted, marked or not.** Marking is a second step that keeps the
 *  geometry it is given (`markPlanWalls`), so a label placed for its length and later written as a
 *  reason — 52 px wider in ru at the phone — was already standing where the other wall's label
 *  reaches (QA, U5). The placement cannot know which walls will be refused, so it leaves room for the
 *  wider text on every facing wall. A bound and not a measurement, so it is allowed to be a little
 *  wide and never allowed to be narrow. */
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

/** Wall A leaves the corner along +X and is the one wall a plan draws across the screen; B and C
 *  leave it along +Z and run down it. The letter decides this *here*, where `placeWall` lays the bars
 *  out from the same constant — reading it back off the rectangle instead is ambiguous exactly where
 *  it matters, because a wall drawn shorter than a wall is thick is a bar taller than it is wide. */
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

/** The mirror line is the box's vertical centre, so a point at `x` lands at `boxWidth - x` and a
 *  rectangle's left edge is the reflection of its right one. */
function reflectedXPx(xPx: number, box: PlanBox): number {
  return box.widthPx - xPx;
}

/** The walls this shape has, from the domain's own answer (`wallsOf`) — the same enumeration
 *  `requiredFieldsFor` reads, so the plan and the form cannot disagree about a shape (backlog 76). A
 *  field the shape does not have is not drawn even when it still holds a value the customer typed
 *  under another shape. */
function wallsAskedForBy(draft: RoomDraft): readonly DrawableWall[] {
  return wallsOf(draft.shape).map((wall) => ({
    wall,
    field: fieldOfWall(wall),
  }));
}

/**
 * **The plan draws only once every wall the shape asks for reads as a length** (owner ruling
 * Q-7F2-3 = (a), wave 7F2 criterion 8): a part of one shape can be another shape's whole — a U
 * missing wall C is exactly an L, an L missing wall B exactly a linear room — so drawing whatever is
 * readable showed the customer a room they did not choose.
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
