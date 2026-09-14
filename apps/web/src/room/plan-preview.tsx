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
// third deliberate absence): a screen reader reads *"A · 3,60 m"* rather than a drafted description
// of a drawing.
import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties } from "react";

import { formatMetresForDisplay } from "./metres-text";
import {
  type PlanBox,
  type PlanPreview as PlanPreviewModel,
  type PlanWallRect,
} from "./plan-preview-model";
import styles from "./room.module.css";

export interface PlanPreviewProps {
  readonly plan: PlanPreviewModel;
}

/** Frame 1B's own box (`:134`): 104 px tall, and as wide as the card leaves it on a 390 px screen —
 *  the body's 18 px insets and the card's 16 px padding and 1 px border, taken off 390. The box is
 *  the *model's* box too, so the drawing is laid out in the pixels it is painted in and the card
 *  clips rather than scrolls, exactly as the frame does. */
export const PLAN_BOX: PlanBox = { widthPx: 320, heightPx: 104 };

/** How far a label stands off the wall it names, so the two are read together without touching. */
const LABEL_OFFSET_PX = 5;

export function PlanPreview({ plan }: PlanPreviewProps) {
  const translate = useTranslations();

  return (
    <div className={styles.planCard} data-testid="room-plan">
      <span className={styles.planCaption}>
        {translate("room.planCaption")}
      </span>
      <div
        className={styles.planBox}
        style={{ height: `${String(plan.boxPx.heightPx)}px` }}
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

function PlanDrawing({ plan }: PlanPreviewProps) {
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
          fill="var(--accent)"
        />
      ))}
    </svg>
  );
}

/** The wall's letter and its length, joined by the catalogue's own template: both are ICU arguments,
 *  so the separator and the unit are the locale's to place and this component never spells either. */
function PlanWallLabel({ wall }: { readonly wall: PlanWallRect }) {
  const translate = useTranslations();
  const locale = useLocale();

  return (
    <span
      className={styles.planWallLabel}
      style={labelPositionFor(wall)}
      data-testid={`room-plan-label-${wall.wall}`}
    >
      {translate("room.planWallLabel", {
        wall: wall.wall,
        metres: formatMetresForDisplay(wall.lengthMm, locale),
      })}
    </span>
  );
}

/** Where a label sits against the rectangle it names — presentation only, and deliberately not a
 *  second reading of the room: a wall that runs across the screen is labelled under its middle, one
 *  that runs down it is labelled beside its middle. Which of the two a wall is comes from the rect
 *  the model handed over, never from the wall's letter. */
function labelPositionFor(wall: PlanWallRect): CSSProperties {
  if (runsAcrossTheScreen(wall)) {
    return {
      left: `${String(wall.xPx + wall.widthPx / 2)}px`,
      top: `${String(wall.yPx + wall.heightPx + LABEL_OFFSET_PX)}px`,
      transform: "translateX(-50%)",
    };
  }
  return {
    left: `${String(wall.xPx + wall.widthPx + LABEL_OFFSET_PX)}px`,
    top: `${String(wall.yPx + wall.heightPx / 2)}px`,
    transform: "translateY(-50%)",
  };
}

/** A wall is drawn as a bar one drawing-thickness deep, so the axis it is *long* on is the axis it
 *  runs along. Read off the rectangle rather than off the wall's letter: the letters' directions are
 *  the model's to state, and a second statement of them here is the disagreement criterion 12's
 *  anchor exists to prevent. */
function runsAcrossTheScreen(wall: PlanWallRect): boolean {
  return wall.widthPx > wall.heightPx;
}
