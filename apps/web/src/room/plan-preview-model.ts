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
import type { CornerDirection } from "@lemnaria/configurator-domain";

import type { RoomDraft, RoomLengthField } from "./room-draft";
import { requiredFieldsFor } from "./room-url-state";

export type PlanWallId = "A" | "B" | "C";

/** The preview box the drawing is fitted into, in CSS pixels. */
export interface PlanBox {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface PlanPointPx {
  readonly xPx: number;
  readonly yPx: number;
}

export interface PlanWallRect {
  readonly wall: PlanWallId;
  /** The wall's true length, so the label beside the drawing reads the room and not the pixels. */
  readonly lengthMm: number;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
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

/** Nothing readable to draw yet — an empty form is a state of the plan, not a missing plan, so the
 *  caller branches on it instead of receiving a drawing of a room nobody entered. */
export interface EmptyPlanPreview {
  readonly kind: "empty";
  readonly boxPx: PlanBox;
}

export type PlanPreview = DrawnPlanPreview | EmptyPlanPreview;

/** Frame 1B draws both wall bars 12 px thick (`Lemnaria Configurator Mobil.dc.html:135-136`). It is a
 *  drawing constant and **never scales with the room** (criterion 12): the plan knows no depth at all
 *  (ADR 0083 decision 2), so the thickness is only what makes a wall readable. */
export const PLAN_WALL_THICKNESS_PX = 12;

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

/** The walls a plan can draw, each with the field that gives it its length. The height is a field
 *  and not a wall: this is the view from above. */
const DRAWABLE_WALLS: readonly {
  readonly wall: PlanWallId;
  readonly field: RoomLengthField;
}[] = [
  { wall: "A", field: "wallA" },
  { wall: "B", field: "wallB" },
  { wall: "C", field: "wallC" },
];

interface DrawableLength {
  readonly wall: PlanWallId;
  readonly millimetres: number;
}

interface PlanLayout {
  readonly scalePxPerMm: number;
  readonly originPx: PlanPointPx;
  readonly contentPx: PlanBox;
}

/** The plan, from the draft's lengths and its corner direction and from nothing else: no cabinet, no
 *  placement, no catalogue and no depth. Identical arguments give an identical drawing. */
export function derivePlanPreview(draft: RoomDraft, box: PlanBox): PlanPreview {
  assertBoxCanHoldAWall(box);

  const lengths = drawableLengthsIn(draft);
  if (lengths.length === 0) return { kind: "empty", boxPx: box };

  const drawn = drawFromTheCorner(lengths, box);
  return draft.cornerDirection === MIRRORED_CORNER_DIRECTION
    ? reflectPlanPreview(drawn)
    : drawn;
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

function drawFromTheCorner(
  lengths: readonly DrawableLength[],
  box: PlanBox,
): DrawnPlanPreview {
  const scalePxPerMm = isotropicScalePxPerMm(lengths, box);
  const contentPx = contentExtentPx(lengths, scalePxPerMm);
  const layout: PlanLayout = {
    scalePxPerMm,
    contentPx,
    originPx: centredOriginPx(contentPx, box),
  };

  return {
    kind: "drawn",
    boxPx: box,
    scalePxPerMm,
    contentPx,
    cornerPx: layout.originPx,
    walls: lengths.map((length) => placeWall(length, layout)),
  };
}

/**
 * **One isotropic scale for both axes** (criterion 12), and this wave's single deliberate departure
 * from frames 1A and 1B (ruling R4): the frame draws wall A at 250 px for 3,60 m and wall B at 50 px
 * for 2,40 m — two scales — which would draw a 6,0 x 1,0 m room as a square. The scale is the
 * largest that leaves the whole room inside the box on both axes, and it is arithmetic nowhere else
 * in this module: if the frame's literal proportions are ruled for instead, this function is the only
 * thing that moves.
 */
function isotropicScalePxPerMm(
  lengths: readonly DrawableLength[],
  box: PlanBox,
): number {
  const limitsPxPerMm: number[] = [];
  const alongXMm = millimetresOf(lengths, "A");
  const alongZMm = deepestWallMm(lengths);

  if (alongXMm > 0) limitsPxPerMm.push(box.widthPx / alongXMm);
  if (alongZMm > 0) limitsPxPerMm.push(usableDepthPx(box) / alongZMm);
  return Math.min(...limitsPxPerMm);
}

/** Wall A's own thickness is spent before a single millimetre of depth is drawn, because the walls
 *  running down the screen start below it — so it comes off the box before the scale is taken. */
function usableDepthPx(box: PlanBox): number {
  return box.heightPx - PLAN_WALL_THICKNESS_PX;
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

/** The drawing sits in the middle of the box, so the mirror line is also the drawing's own centre and
 *  a toggled corner moves the walls without moving the room across the card. */
function centredOriginPx(content: PlanBox, box: PlanBox): PlanPointPx {
  return {
    xPx: (box.widthPx - content.widthPx) / 2,
    yPx: (box.heightPx - content.heightPx) / 2,
  };
}

function placeWall(length: DrawableLength, layout: PlanLayout): PlanWallRect {
  if (length.wall === "A") return placeBackWall(length, layout);
  if (length.wall === "B") return placeLeftWall(length, layout);
  return placeFarWall(length, layout);
}

/** Wall A leaves the corner along +X: right along the top. */
function placeBackWall(
  length: DrawableLength,
  layout: PlanLayout,
): PlanWallRect {
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
): PlanWallRect {
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
function placeFarWall(
  length: DrawableLength,
  layout: PlanLayout,
): PlanWallRect {
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

function reflectWall(wall: PlanWallRect, box: PlanBox): PlanWallRect {
  return { ...wall, xPx: reflectedXPx(wall.xPx + wall.widthPx, box) };
}

/** The mirror line is the box's vertical centre, so a point at `x` lands at `boxWidth - x` and a
 *  rectangle's left edge is the reflection of its right one. */
function reflectedXPx(xPx: number, box: PlanBox): number {
  return box.widthPx - xPx;
}

/** The walls this shape asks about that read as a length. A field the shape does not ask for is not
 *  drawn even when it still holds a value the customer typed under another shape. */
function drawableLengthsIn(draft: RoomDraft): readonly DrawableLength[] {
  const askedFor = requiredFieldsFor(draft.shape);
  return DRAWABLE_WALLS.filter((wall) => askedFor.includes(wall.field)).flatMap(
    (wall) => {
      const millimetres = draft.lengths[wall.field].millimetres;
      return millimetres === undefined
        ? []
        : [{ wall: wall.wall, millimetres }];
    },
  );
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

function assertBoxCanHoldAWall(box: PlanBox): void {
  const fitsAWall =
    Number.isFinite(box.widthPx) &&
    Number.isFinite(box.heightPx) &&
    box.widthPx >= PLAN_WALL_THICKNESS_PX &&
    box.heightPx > PLAN_WALL_THICKNESS_PX;
  if (!fitsAWall) {
    throw new RangeError(
      `derivePlanPreview: a preview box of ${String(box.widthPx)} x ${String(box.heightPx)} px cannot hold a wall ${String(PLAN_WALL_THICKNESS_PX)} px thick`,
    );
  }
}
