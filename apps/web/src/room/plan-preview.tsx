"use client";

// Frame 1B's plan card (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:132-141`): the
// uppercase caption, the box, the walls and a label on each wall reading its own length.
//
// **A renderer with no geometry of its own.** Every coordinate below comes from `derivePlanPreview`,
// which is pure and swept (criteria 11, 12 and 13). Nothing here multiplies a length by a scale, and
// nothing here decides which way a wall runs — the anchor is adopted in that module and re-deriving
// it in a second place is how a 2D plan comes to disagree with the 3D room it produces.
//
// **The picture is `aria-hidden` and the labels are real text beside it** (the copy obligation's
// third deliberate absence): a screen reader reads *"A · 3600 mm"* rather than a drafted description
// of a drawing.
//
// **Frame 1C's red wall is marked, never drawn** (wave 7F2 criterion 7): `markPlanWalls` sets a
// reason on the walls the room refuses, and this renderer paints that wall red and writes the reason
// where its length was. The rectangle is the one `derivePlanPreview` placed, untouched.
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

import {
  PLAN_LABEL_LINE_PX,
  markPlanWalls,
  type MarkedPlanWall,
  type PlanBox,
  type PlanLabelAlignment,
  type PlanPreview as PlanPreviewModel,
  type PlanWallLabelPx,
  type PlanWallRect,
} from "./plan-preview-model";
import styles from "./room.module.css";

export interface PlanPreviewProps {
  readonly plan: PlanPreviewModel;
  /** The walls frame 1C draws red (`RoomIssueView.markedWalls`). None until the screen passes them. */
  readonly markedWalls?: readonly MarkedPlanWall[];
}

const NO_MARKED_WALLS: readonly MarkedPlanWall[] = [];

/** A wall's paint: the frame's accent (`:135`), or frame 1C's red (`:210-211`) on a wall the room refuses.
 *  The red is published by `.planBox` as `--plan-wall-issue`, so the bar and its label share one. */
const WALL_FILL = "var(--accent)";
const MARKED_WALL_FILL = "var(--plan-wall-issue)";

/** Frame 1B's own box as it is *painted* (`:134`): 104 px tall, and as wide as the card leaves it on
 *  a 390 px screen — the body's 18 px insets and the card's 16 px padding and 1 px border, taken off
 *  390. */
const PAINTED_PLAN_BOX: PlanBox = { widthPx: 320, heightPx: 104 };

/** The hairline `.planBox` draws. It is **published to the stylesheet** as `--plan-box-border`
 *  instead of being written there, so the line the customer sees and the pixels it costs the drawing
 *  are one number. They were two: `globals.css:53-55` puts every element in `border-box`, so a
 *  border stated only in CSS is spent out of the box's own 320 x 104 — and a drawing laid out in all
 *  of them ran 2 px under the border in every room. */
const PLAN_BOX_BORDER_PX = 1;

/** The border is drawn at both ends of each axis. */
const PLAN_BOX_BORDER_SPEND_PX = PLAN_BOX_BORDER_PX * 2;

/** **What the border leaves: the pixels the drawing is actually painted in**, and so the box the
 *  model is handed. Both the SVG and the labels are positioned against the padding box, which is
 *  this one — measure the drawing against the painted box instead and every extreme clips. */
export const PLAN_BOX: PlanBox = insideTheBorder(PAINTED_PLAN_BOX);

/** The two figures the stylesheet cannot import: the border already taken off `PLAN_BOX`, and the
 *  line height the model reserves a label lane for. Published rather than repeated in CSS — the same
 *  hop `price-bar.tsx:12-18` takes, and for the same reason. */
const PLAN_BOX_METRICS = {
  "--plan-box-border": `${String(PLAN_BOX_BORDER_PX)}px`,
  "--plan-label-line": `${String(PLAN_LABEL_LINE_PX)}px`,
} as CSSProperties;

export function PlanPreview({
  plan: drawnPlan,
  markedWalls = NO_MARKED_WALLS,
}: PlanPreviewProps) {
  const translate = useTranslations();
  const plan = markPlanWalls(drawnPlan, markedWalls);

  return (
    <div className={styles.planCard} data-testid="room-plan">
      <span className={styles.planCaption}>
        {translate("room.planCaption")}
      </span>
      <div
        className={styles.planBox}
        data-testid="room-plan-box"
        style={{
          ...PLAN_BOX_METRICS,
          height: `${String(paintedHeightPx(plan.boxPx))}px`,
        }}
      >
        <PlanDrawing plan={plan} />
        {plan.kind === "drawn"
          ? plan.walls.map((wall) => (
              <PlanWallLabel key={wall.wall} wall={wall} />
            ))
          : null}
      </div>
    </div>
  );
}

function PlanDrawing({ plan }: { readonly plan: PlanPreviewModel }) {
  const walls = plan.kind === "drawn" ? plan.walls : [];

  return (
    <svg
      className={styles.planDrawing}
      width={plan.boxPx.widthPx}
      height={plan.boxPx.heightPx}
      viewBox={`0 0 ${String(plan.boxPx.widthPx)} ${String(plan.boxPx.heightPx)}`}
      fill="none"
      aria-hidden="true"
    >
      {walls.map((wall) => (
        <rect
          key={wall.wall}
          x={wall.xPx}
          y={wall.yPx}
          width={wall.widthPx}
          height={wall.heightPx}
          rx="2"
          fill={isMarked(wall) ? MARKED_WALL_FILL : WALL_FILL}
          data-marked={isMarked(wall)}
        />
      ))}
    </svg>
  );
}

/** The wall's letter and its whole millimetres, joined by the catalogue's own template: both are ICU
 *  arguments, so the number's form and the unit are the locale's to place and this component never
 *  spells either. Millimetres, the unit the customer types (ADR 0126). A marked wall reads its short
 *  reason instead, which names the wall and carries no digit (ADR 0120 decision 3). */
function PlanWallLabel({ wall }: { readonly wall: PlanWallRect }) {
  const translate = useTranslations();

  return (
    <span
      className={styles.planWallLabel}
      style={labelPositionFor(wall.labelPx)}
      data-testid={`room-plan-label-${wall.wall}`}
      data-marked={isMarked(wall)}
    >
      {wall.issueLabelKey === undefined
        ? translate("room.planWallLabel", {
            wall: wall.wall,
            millimetres: wall.lengthMm,
          })
        : translate(wall.issueLabelKey, { wall: wall.wall })}
    </span>
  );
}

function isMarked(wall: PlanWallRect): boolean {
  return wall.issueLabelKey !== undefined;
}

/** The label's own box, hung off the anchor the model placed. **Nothing here decides where a label
 *  goes**: which side of its wall it stands on, and the lane it stands clear in, are decided against
 *  the whole drawing — and a second decision taken here, over one rectangle, is how a label comes to
 *  sit on the bar the model placed it clear of. */
function labelPositionFor(label: PlanWallLabelPx): CSSProperties {
  return {
    left: `${String(label.xPx)}px`,
    top: `${String(label.topPx)}px`,
    transform: TEXT_HUNG_OFF_THE_ANCHOR[label.alignment],
  };
}

/** `left` places the label's left edge, so a label whose text must *end* at its anchor is pulled back
 *  by its own width and a centred one by half of it. This is the one part of the placement the model
 *  cannot do, because only the browser knows how wide the text came out. */
const TEXT_HUNG_OFF_THE_ANCHOR: Readonly<Record<PlanLabelAlignment, string>> = {
  centred: "translateX(-50%)",
  leftAligned: "none",
  rightAligned: "translateX(-100%)",
};

function insideTheBorder(box: PlanBox): PlanBox {
  return {
    widthPx: box.widthPx - PLAN_BOX_BORDER_SPEND_PX,
    heightPx: box.heightPx - PLAN_BOX_BORDER_SPEND_PX,
  };
}

/** The element is painted around the box the model was handed: the inverse of `insideTheBorder`, so
 *  the two can never be sized from different figures. */
function paintedHeightPx(box: PlanBox): number {
  return box.heightPx + PLAN_BOX_BORDER_SPEND_PX;
}
