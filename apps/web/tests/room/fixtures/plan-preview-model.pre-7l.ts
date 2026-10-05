// Frozen copy of `plan-preview-model.ts` at 7a6438a, the `pre-7l` base: the independent oracle for
// `plan-preview-model.pre-7l.test.ts`. Only its two relative imports are rewritten to `@/room/*`. Never edit it to
// make a test pass: it would stop being the base and the comparison would prove nothing.
//
// Axes (DEVELOPMENT-SPEC §2): from above, wall A runs along +X (right) and wall B along +Z (down the screen) out of
// the corner at (0,0,0). Flipping +Z like a plotted Y axis keeps every test green while the drawing mirrors against
// the 3D room.
import type { CornerDirection } from "@lemnaria/configurator-domain";

import type { RoomDraft, RoomLengthField } from "@/room/room-draft";
import { requiredFieldsFor } from "@/room/room-url-state";

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

/** The preview box in CSS pixels: the pixels painted in, since a border is spent out of an element's own width
 *  under `border-box` (`plan-preview.tsx`). */
export interface PlanBox {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface PlanPointPx {
  readonly xPx: number;
  readonly yPx: number;
}

/** Which edge of a label its anchor names. The model never places a width: that is a font's, a locale's and a
 *  translation's to decide. */
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
  /** Where that length is written; decided against the other bars, which one rectangle cannot see. */
  readonly labelPx: PlanWallLabelPx;
  /** Frame 1C's reason (*"B prea scurt"*) in place of the length on a refused wall; only `markPlanWalls` sets it. */
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

/** Not every wall the shape asks for reads as a length yet: an incomplete form is a state of the plan. The box keeps
 *  its size so the card does not jump when the drawing arrives. */
export interface EmptyPlanPreview {
  readonly kind: "empty";
  readonly boxPx: PlanBox;
}

export type PlanPreview = DrawnPlanPreview | EmptyPlanPreview;

/** Frame 1B's 12 px bar (`Lemnaria Configurator Mobil.dc.html:135-136`); never scales with the room, since the plan
 *  knows no depth (ADR 0083 decision 2). */
export const PLAN_WALL_THICKNESS_PX = 12;

/** The line a wall's label is written on. `plan-preview.tsx` publishes it to `.planWallLabel`'s `font`, so the lane
 *  reserved for a label and the type set in it cannot disagree. */
export const PLAN_LABEL_LINE_PX = 11;

/** How far a label stands off the wall it names, so the two are read together without touching. */
export const PLAN_LABEL_GAP_PX = 5;

/** The lane kept clear above the drawing: it comes off the box before the scale is taken, so no bar paints in it.
 *  A label under wall A would share the band the walls running down occupy and be overprinted (2500 x 5000 mm). */
export const PLAN_LABEL_LANE_PX = PLAN_LABEL_LINE_PX + PLAN_LABEL_GAP_PX;

/** The shortest box the plan can be drawn in: the lane, the wall's thickness and the label line. Below it the caller
 *  has handed over a box it has not sized. */
export const PLAN_MINIMUM_BOX_HEIGHT_PX =
  PLAN_LABEL_LANE_PX + PLAN_WALL_THICKNESS_PX + PLAN_LABEL_LINE_PX;

/** `left` is the drawn convention; `right` is that drawing reflected, and nothing else. A `linear` draft is mirrored
 *  too: every draft carries a corner direction, and a lone centred wall A reflects onto itself. */
const MIRRORED_CORNER_DIRECTION: CornerDirection = "right";

/** The wall the anchor sends along +X, which runs across the screen from above; every other wall runs down it. */
const WALL_ACROSS_THE_SCREEN: PlanWallId = "A";

/** The wall the anchor sends along +Z out of the corner itself (`placeLeftWall`); the others that run down the
 *  screen stand at the far end of wall A. */
const WALL_DOWN_FROM_THE_CORNER: PlanWallId = "B";

interface DrawableWall {
  readonly wall: PlanWallId;
  readonly field: RoomLengthField;
}

/** The walls a plan can draw, each with the field giving its length; the height is a field, not a wall. */
const DRAWABLE_WALLS: readonly DrawableWall[] = [
  { wall: "A", field: "wallA" },
  { wall: "B", field: "wallB" },
  { wall: "C", field: "wallC" },
];

interface DrawableLength {
  readonly wall: PlanWallId;
  readonly millimetres: number;
}

/** A wall's bar before its label is placed: the label side is read off the bars around it. */
type PlanWallBar = Omit<PlanWallRect, "labelPx">;

interface PlanLayout {
  readonly scalePxPerMm: number;
  readonly originPx: PlanPointPx;
  readonly contentPx: PlanBox;
}

/** The plan from the draft's lengths and corner direction alone: identical arguments give an identical drawing. */
export function derivePlanPreview(draft: RoomDraft, box: PlanBox): PlanPreview {
  assertBoxCanHoldTheDrawing(box);

  const walls = wallsAskedForBy(draft);
  if (!isEveryWallReadable(draft, walls)) return { kind: "empty", boxPx: box };

  const drawn = drawFromTheCorner(drawableLengthsIn(draft, walls), box);
  return draft.cornerDirection === MIRRORED_CORNER_DIRECTION
    ? reflectPlanPreview(drawn)
    : drawn;
}

/** The drawing reflected about the box's vertical centre line; applying it twice returns the original. */
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
 * Frame 1C's red wall, as a second pure step over the drawn plan: a marked wall keeps its rectangle and label anchor
 * and gains only the reason. Marks find a wall by id, never by index or side, and are set exactly, so a wall the list
 * does not name comes back unmarked; a mark for a wall the plan does not draw is dropped.
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

/** The wall as drawn, whatever an earlier marking set on it. Rebuilt field by field in the drawing's own order, so
 *  an unmarked wall serialises byte for byte as drawn. */
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
): DrawnPlanPreview {
  const regionPx = drawingRegionPx(box);
  const scalePxPerMm = isotropicScalePxPerMm(lengths, regionPx);
  const contentPx = contentExtentPx(lengths, scalePxPerMm);
  const layout: PlanLayout = {
    scalePxPerMm,
    contentPx,
    originPx: belowTheLabelLane(centredOriginPx(contentPx, regionPx)),
  };
  const bars = lengths.map((length) => placeWall(length, layout));

  return {
    kind: "drawn",
    boxPx: box,
    scalePxPerMm,
    contentPx,
    cornerPx: layout.originPx,
    walls: bars.map((bar) => ({ ...bar, labelPx: labelFor(bar, bars, box) })),
  };
}

/** What the label lane leaves of the box; the drawing is fitted into this, which keeps the lane clear. */
function drawingRegionPx(box: PlanBox): PlanBox {
  return {
    widthPx: box.widthPx,
    heightPx: box.heightPx - PLAN_LABEL_LANE_PX,
  };
}

function belowTheLabelLane(originPx: PlanPointPx): PlanPointPx {
  return { xPx: originPx.xPx, yPx: originPx.yPx + PLAN_LABEL_LANE_PX };
}

/**
 * One isotropic scale for both axes: the largest that leaves the room inside the region on both axes. Frames 1A and
 * 1B use two scales, which would draw a 6000 x 1000 mm room as a square. Handed the region, not the box, so the lane
 * is subtracted once.
 */
function isotropicScalePxPerMm(
  lengths: readonly DrawableLength[],
  regionPx: PlanBox,
): number {
  const limitsPxPerMm: number[] = [];
  const alongXMm = millimetresOf(lengths, "A");
  const alongZMm = deepestWallMm(lengths);

  if (alongXMm > 0) limitsPxPerMm.push(regionPx.widthPx / alongXMm);
  if (alongZMm > 0) limitsPxPerMm.push(usableDepthPx(regionPx) / alongZMm);
  return Math.min(...limitsPxPerMm);
}

/** Wall A's thickness is spent before any depth is drawn, because the walls running down start below it. */
function usableDepthPx(regionPx: PlanBox): number {
  return regionPx.heightPx - PLAN_WALL_THICKNESS_PX;
}

function contentExtentPx(
  lengths: readonly DrawableLength[],
  scalePxPerMm: number,
): PlanBox {
  return {
    widthPx: Math.max(
      millimetresOf(lengths, "A") * scalePxPerMm,
      PLAN_WALL_THICKNESS_PX,
    ),
    heightPx: PLAN_WALL_THICKNESS_PX + deepestWallMm(lengths) * scalePxPerMm,
  };
}

/** Centred in the region so the mirror line is the drawing's own centre and a toggled corner moves the walls without
 *  moving the room across the card. */
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
    heightPx: PLAN_WALL_THICKNESS_PX,
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
    widthPx: PLAN_WALL_THICKNESS_PX,
    heightPx: length.millimetres * layout.scalePxPerMm,
  };
}

/** A U's third wall closes the room at the far end of wall A, running down beside it. */
function placeFarWall(length: DrawableLength, layout: PlanLayout): PlanWallBar {
  return {
    wall: length.wall,
    lengthMm: length.millimetres,
    xPx:
      layout.originPx.xPx + layout.contentPx.widthPx - PLAN_WALL_THICKNESS_PX,
    yPx: belowTheBackWallPx(layout),
    widthPx: PLAN_WALL_THICKNESS_PX,
    heightPx: length.millimetres * layout.scalePxPerMm,
  };
}

function belowTheBackWallPx(layout: PlanLayout): number {
  return layout.originPx.yPx + PLAN_WALL_THICKNESS_PX;
}

/** Above the drawing for the wall across the screen, beside its own bar for one that runs down it. */
function labelFor(
  bar: PlanWallBar,
  bars: readonly PlanWallBar[],
  box: PlanBox,
): PlanWallLabelPx {
  return runsAcrossTheScreen(bar)
    ? aboveTheWall(bar)
    : besideTheWall(bar, bars, box);
}

/** Frame 1B's placement: centred over the wall in the lane nothing paints in, so the text grows symmetrically. */
function aboveTheWall(bar: PlanWallBar): PlanWallLabelPx {
  return {
    xPx: bar.xPx + bar.widthPx / 2,
    topPx: bar.yPx - PLAN_LABEL_LANE_PX,
    alignment: "centred",
  };
}

/**
 * Beside the bar at its middle, on whichever side has more room: the room's inside where the drawing leaves space,
 * else the box's margin ("always right" put a U's far wall label past the box). Only bars crossing the label's line
 * count, and a bar blocks a side as soon as it reaches past the wall's edge on that side, not only when wholly beyond.
 */
function besideTheWall(
  bar: PlanWallBar,
  bars: readonly PlanWallBar[],
  box: PlanBox,
): PlanWallLabelPx {
  const topPx = lineBesideTheWallTopPx(bar, box);
  const crossing = bars.filter((other) => crossesTheLine(other, topPx));
  const towardsTheRight = sharesItsBarWithAnother(bar, crossing)
    ? isTheFarWall(bar)
    : freeToTheRightPx(bar, crossing, box) >= freeToTheLeftPx(bar, crossing);

  return {
    xPx: insideTheBoxPx(anchorBesidePx(bar, towardsTheRight), box),
    topPx,
    alignment: towardsTheRight ? "leftAligned" : "rightAligned",
  };
}

/**
 * The line beside a wall running down the screen: centred on the bar but never above the bar's own top, where wall A
 * ends (a 100 mm wall B beside a 3600 mm wall A is under 9 px tall), and held inside the box. Never from the text.
 */
function lineBesideTheWallTopPx(bar: PlanWallBar, box: PlanBox): number {
  const centredTopPx = bar.yPx + bar.heightPx / 2 - PLAN_LABEL_LINE_PX / 2;
  const flooredAtTheBarTopPx = Math.max(centredTopPx, bar.yPx);
  return Math.min(flooredAtTheBarTopPx, box.heightPx - PLAN_LABEL_LINE_PX);
}

/**
 * Two walls drawn on one bar (a U whose wall A is no wider than a wall is thick puts C where B is): the tie is broken
 * by wall id, so B is labelled on the corner's outside and C on the far side. The layout is the left-turning one; a
 * mirrored plan carries each label with its wall.
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

/** Every wall but the one leaving the corner down the screen stands on the far side of the drawing. */
function isTheFarWall(bar: PlanWallBar): boolean {
  return bar.wall !== WALL_DOWN_FROM_THE_CORNER;
}

function anchorBesidePx(bar: PlanWallBar, towardsTheRight: boolean): number {
  return towardsTheRight
    ? rightEdgePx(bar) + PLAN_LABEL_GAP_PX
    : bar.xPx - PLAN_LABEL_GAP_PX;
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
function crossesTheLine(bar: PlanWallBar, topPx: number): boolean {
  return bar.yPx < topPx + PLAN_LABEL_LINE_PX && bottomEdgePx(bar) > topPx;
}

/** A box too narrow to stand a label beside a wall keeps the anchor inside it: a cramped label can be read. */
function insideTheBoxPx(xPx: number, box: PlanBox): number {
  return Math.min(Math.max(xPx, 0), box.widthPx);
}

/** Wall A is the one wall drawn across the screen; B and C run down it. The letter decides here, where `placeWall`
 *  lays the bars out from the same constant: a wall shorter than a wall is thick is a bar taller than wide. */
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

/** The mirror line is the box's vertical centre, so a point at `x` lands at `boxWidth - x`. */
function reflectedXPx(xPx: number, box: PlanBox): number {
  return box.widthPx - xPx;
}

/** The walls this shape asks about, from the parser's own field list. A field the shape does not ask
 *  for is not drawn even when it still holds a value the customer typed under another shape. */
function wallsAskedForBy(draft: RoomDraft): readonly DrawableWall[] {
  const askedFor = requiredFieldsFor(draft.shape);
  return DRAWABLE_WALLS.filter((wall) => askedFor.includes(wall.field));
}

/**
 * The plan draws only once every wall the shape asks for reads as a length: a U missing wall C is exactly an L, so
 * drawing the readable part would show a room the customer did not choose.
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

function assertBoxCanHoldTheDrawing(box: PlanBox): void {
  const fits =
    Number.isFinite(box.widthPx) &&
    Number.isFinite(box.heightPx) &&
    box.widthPx >= PLAN_WALL_THICKNESS_PX &&
    box.heightPx >= PLAN_MINIMUM_BOX_HEIGHT_PX;
  if (!fits) {
    throw new RangeError(
      `derivePlanPreview: a preview box of ${String(box.widthPx)} x ${String(box.heightPx)} px cannot hold a wall ${String(PLAN_WALL_THICKNESS_PX)} px thick and the lanes its labels are written in`,
    );
  }
}
