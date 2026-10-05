"use client";

// The plan card: the caption, the box, the walls and a label on each wall reading its own length.
//
// A renderer with no geometry of its own: every coordinate comes from `derivePlanPreview`. Nothing
// here scales a length or decides which way a wall runs; a second derivation is how the 2D plan
// comes to disagree with the 3D room.
//
// The picture is `aria-hidden` and the labels are real text, so a screen reader reads
// *"A · 3600 mm"*, not a description of a drawing. A wall the room refuses is marked, never moved:
// `markPlanWalls` sets a reason, and this paints the wall red and writes the reason where its length was.
//
// On the desktop layout `.planBox` publishes a fill-mode flag (`--plan-fill`, read by
// `usePlanFillState`); the box is then measured (`ResizeObserver`) and the drawing derived against it
// with the desktop metrics, by the same `derivePlanPreview`. Without the flag (phone, server render,
// a test with no stylesheet) the box is `PLAN_BOX` and the metrics are `DEFAULT_PLAN_PREVIEW_METRICS`.
import { useTranslations } from "next-intl";
import type { CSSProperties, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import {
  DEFAULT_PLAN_PREVIEW_METRICS,
  derivePlanPreview,
  markPlanWalls,
  planPreviewMinimumBoxPx,
  type MarkedPlanWall,
  type PlanBox,
  type PlanLabelAlignment,
  type PlanPreview as PlanPreviewModel,
  type PlanPreviewMetrics,
  type PlanWallLabelPx,
  type PlanWallRect,
} from "./plan-preview-model";
import type { RoomDraft } from "./room-draft";
import styles from "./room.module.css";

export interface PlanPreviewProps {
  readonly draft: RoomDraft;
  /** The walls frame 1C draws red (`RoomIssueView.markedWalls`); none at 1B. */
  readonly markedWalls?: readonly MarkedPlanWall[];
}

const NO_MARKED_WALLS: readonly MarkedPlanWall[] = [];

/** Shared by both render branches and by `readPlanDrawing`/`readPlanPaints` in the e2e spec. */
const PLAN_BOX_TEST_ID = "room-plan-box";

/** The red is published by `.planBox` as `--plan-wall-issue`, so the bar and its label share one. */
const WALL_FILL = "var(--accent)";
const MARKED_WALL_FILL = "var(--plan-wall-issue)";

/** The box as painted on a 390 px screen: 104 px tall, 320 px wide after the body's and card's insets. */
const PAINTED_PLAN_BOX: PlanBox = { widthPx: 320, heightPx: 104 };

/** Published to the stylesheet as `--plan-box-border` rather than written there: `globals.css:53-55`
 *  sets `border-box`, so a border stated only in CSS is spent out of the 320 x 104 and the drawing
 *  would run 2 px under it. */
const PLAN_BOX_BORDER_PX = 1;

/** The border is drawn at both ends of each axis. */
const PLAN_BOX_BORDER_SPEND_PX = PLAN_BOX_BORDER_PX * 2;

/** The pixels left after the border, and so the box the model is handed: the SVG and the labels are
 *  positioned against the padding box, and measuring against the painted box clips every extreme. */
export const PLAN_BOX: PlanBox = insideTheBorder(PAINTED_PLAN_BOX);

/** The desktop set: 26 px walls, 14 px labels, a 20 px label gap. Kept here because the model has no
 *  opinion about which shell asks for which set. */
const DESKTOP_PLAN_PREVIEW_METRICS: PlanPreviewMetrics = {
  wallThicknessPx: 26,
  labelLinePx: 14,
  labelGapPx: 20,
};

/** What `.planBox` publishes under the desktop `@media` block. Read with `getComputedStyle`: CSS is
 *  the one place a width is known, so this component keeps no breakpoint of its own. */
const FILL_MODE_FLAG = "1";

export function PlanPreview({
  draft,
  markedWalls = NO_MARKED_WALLS,
}: PlanPreviewProps) {
  const translate = useTranslations();
  const boxRef = useRef<HTMLDivElement>(null);
  const fill = usePlanFillState(boxRef);

  if (fill.kind === "awaiting-measurement") {
    // Flagged but not yet measured: draw the box empty, so no drawing sized for the wrong box shows.
    return (
      <div className={styles.planCard} data-testid="room-plan">
        <span className={styles.planCaption}>
          {translate("room.planCaption")}
        </span>
        <div
          ref={boxRef}
          className={styles.planBox}
          data-testid={PLAN_BOX_TEST_ID}
          data-plan-measured="false"
          style={planBoxBorderStyle()}
        />
      </div>
    );
  }

  const metrics =
    fill.kind === "measured"
      ? DESKTOP_PLAN_PREVIEW_METRICS
      : DEFAULT_PLAN_PREVIEW_METRICS;
  const boxPx =
    fill.kind === "measured" ? flooredAtMinimum(fill.boxPx, metrics) : PLAN_BOX;
  const plan = markPlanWalls(
    derivePlanPreview(draft, boxPx, metrics),
    markedWalls,
  );

  return (
    <div className={styles.planCard} data-testid="room-plan">
      <span className={styles.planCaption}>
        {translate("room.planCaption")}
      </span>
      <div
        ref={boxRef}
        className={styles.planBox}
        data-testid={PLAN_BOX_TEST_ID}
        data-plan-measured={fill.kind === "measured" ? "true" : "false"}
        style={
          fill.kind === "measured"
            ? planBoxMetricsStyle(metrics)
            : {
                ...planBoxMetricsStyle(metrics),
                height: `${String(paintedHeightPx(plan.boxPx))}px`,
              }
        }
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

/** Never flagged (phone, server render, stylesheet-free test), flagged but not yet measured, or
 *  flagged and measured (the desktop panel's steady state). */
type PlanFillState =
  | { readonly kind: "not-fill" }
  | { readonly kind: "awaiting-measurement" }
  | { readonly kind: "measured"; readonly boxPx: PlanBox };

const NOT_FILL: PlanFillState = { kind: "not-fill" };
const AWAITING_MEASUREMENT: PlanFillState = { kind: "awaiting-measurement" };

/**
 * One observer, registered once the flag is read. The flag and the measurement are asked together in
 * the observer's callback, so a box that stops being flagged (a resize back to the phone layout) is
 * re-read. With no `ResizeObserver` (a bare jsdom) it never measures or throws and draws `PLAN_BOX`.
 *
 * `useLayoutEffect`, not `useEffect`: the server cannot know the viewport, so hydration must start
 * from the not-fill markup, and diverging the client's first render from it throws a hydration error.
 * The layout effect commits the real answer before the first paint rather than a frame behind it.
 */
function usePlanFillState(
  boxRef: RefObject<HTMLDivElement | null>,
): PlanFillState {
  const [state, setState] = useState<PlanFillState>(NOT_FILL);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box === null || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      if (!isFlaggedForFill(box)) {
        setState(NOT_FILL);
        return;
      }
      setState({ kind: "measured", boxPx: contentBoxPxOf(entry) });
    });
    setState(isFlaggedForFill(box) ? AWAITING_MEASUREMENT : NOT_FILL);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, [boxRef]);

  return state;
}

function isFlaggedForFill(box: HTMLElement): boolean {
  return (
    getComputedStyle(box).getPropertyValue("--plan-fill").trim() ===
    FILL_MODE_FLAG
  );
}

/** The content box is already net of the border, like `PLAN_BOX`, so no second subtraction belongs
 *  here. `contentRect` is the fallback for an engine reporting an empty `contentBoxSize` (older Safari). */
function contentBoxPxOf(entry: ResizeObserverEntry): PlanBox {
  const contentBoxSize = entry.contentBoxSize.at(0);
  if (contentBoxSize !== undefined) {
    return {
      widthPx: contentBoxSize.inlineSize,
      heightPx: contentBoxSize.blockSize,
    };
  }
  return {
    widthPx: entry.contentRect.width,
    heightPx: entry.contentRect.height,
  };
}

/** A panel smaller than the set's minimum is drawn at that minimum and clipped by `.planBox`'s
 *  `overflow: hidden`, never a thrown `RangeError`. */
function flooredAtMinimum(box: PlanBox, metrics: PlanPreviewMetrics): PlanBox {
  const minimum = planPreviewMinimumBoxPx(metrics);
  return {
    widthPx: Math.max(box.widthPx, minimum.widthPx),
    heightPx: Math.max(box.heightPx, minimum.heightPx),
  };
}

/** Publishes the figures the stylesheet cannot import: the border and the label line height the lane
 *  is reserved for. In fill mode that is the desktop set's line height. */
function planBoxMetricsStyle(metrics: PlanPreviewMetrics): CSSProperties {
  return {
    ...planBoxBorderStyle(),
    "--plan-label-line": `${String(metrics.labelLinePx)}px`,
  } as CSSProperties;
}

/** The border alone, applied from the first render (including `awaiting-measurement`) so the first
 *  `ResizeObserver` measurement already excludes it. Without `--plan-box-border`, the `var()` in
 *  `room.module.css` fails to resolve and the whole `border` declaration is invalid, leaving no border. */
function planBoxBorderStyle(): CSSProperties {
  return {
    "--plan-box-border": `${String(PLAN_BOX_BORDER_PX)}px`,
  } as CSSProperties;
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

/** The wall's letter and its whole millimetres (ADR 0126) as ICU arguments, so the locale places
 *  the number and unit. A marked wall reads its short reason instead, with no digit (ADR 0120
 *  decision 3). */
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

/** The label's box, hung off the anchor the model placed. Which side of its wall a label stands on is
 *  decided against the whole drawing; a second decision here, over one rectangle, puts a label on a bar. */
function labelPositionFor(label: PlanWallLabelPx): CSSProperties {
  return {
    left: `${String(label.xPx)}px`,
    top: `${String(label.topPx)}px`,
    transform: TEXT_HUNG_OFF_THE_ANCHOR[label.alignment],
  };
}

/** `left` places the label's left edge, so a label that must end at its anchor is pulled back by its
 *  width and a centred one by half: only the browser knows how wide the text came out. */
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

/** The inverse of `insideTheBorder`, so the two cannot be sized from different figures. */
function paintedHeightPx(box: PlanBox): number {
  return box.heightPx + PLAN_BOX_BORDER_SPEND_PX;
}
