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
//
// **Wave 7L D6: the box the plan is drawn in is no longer always a constant.** On the desktop layout
// `.planBox` publishes a fill-mode flag this component reads off the element itself (`--plan-fill`,
// `usePlanFillState` below); off that flag, the box is measured (`ResizeObserver`) rather than
// assumed, and the drawing is derived here, against the measured box, with D1B's own metrics — the
// same `derivePlanPreview` every phone room draws with, never a second layout function. Without the
// flag — the phone, a server render, a test with no stylesheet loaded — nothing below moves: the box
// is `PLAN_BOX`, the metrics are `DEFAULT_PLAN_PREVIEW_METRICS`, byte for byte (D6a, criterion 7's
// "with `PLAN_BOX` and the default set" clause).
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
  /** The walls frame 1C draws red (`RoomIssueView.markedWalls`). None until the screen passes them. */
  readonly markedWalls?: readonly MarkedPlanWall[];
}

const NO_MARKED_WALLS: readonly MarkedPlanWall[] = [];

/** The one test id `.planBox` is ever rendered with, named once so both render branches below agree
 *  with each other and with `readPlanDrawing`/`readPlanPaints` in the e2e spec. */
const PLAN_BOX_TEST_ID = "room-plan-box";

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

/** D1B's own set (`Desktop.dc.html:183, 185`; wave 7L D6b): 26 px walls, 14 px labels, a 20 px label
 *  gap. Declared beside `DEFAULT_PLAN_PREVIEW_METRICS` rather than in the model, which keeps no
 *  opinion about which shell asks for which set. */
const DESKTOP_PLAN_PREVIEW_METRICS: PlanPreviewMetrics = {
  wallThicknessPx: 26,
  labelLinePx: 14,
  labelGapPx: 20,
};

/** The value `.planBox` publishes under the desktop `@media` block (D6c). Read off the element with
 *  `getComputedStyle` rather than assumed from the viewport — CSS is the one place a width is known
 *  (7L D2), so this component asks the box rather than keeping a breakpoint of its own. */
const FILL_MODE_FLAG = "1";

export function PlanPreview({
  draft,
  markedWalls = NO_MARKED_WALLS,
}: PlanPreviewProps) {
  const translate = useTranslations();
  const boxRef = useRef<HTMLDivElement>(null);
  const fill = usePlanFillState(boxRef);

  if (fill.kind === "awaiting-measurement") {
    // D6d: fill mode is flagged but no measurement has arrived yet — draw the box and nothing in it,
    // so no drawing sized for the wrong box is ever visible.
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

/** The measurement state `.planBox` is in: never flagged (the phone, a server render, a stylesheet-
 *  free test — D6c), flagged but not yet measured (D6d), or flagged and measured (D6, the desktop
 *  panel's steady state). */
type PlanFillState =
  | { readonly kind: "not-fill" }
  | { readonly kind: "awaiting-measurement" }
  | { readonly kind: "measured"; readonly boxPx: PlanBox };

const NOT_FILL: PlanFillState = { kind: "not-fill" };
const AWAITING_MEASUREMENT: PlanFillState = { kind: "awaiting-measurement" };

/**
 * **One observer, registered once the flag is read.** The flag and the measurement are asked
 * together, in the observer's own callback, so a box that stops being flagged (a resize back onto
 * the phone layout) is read again rather than trusted from mount. Criterion 9: an environment with no
 * `ResizeObserver` (a bare jsdom) never measures and never throws — the component simply stays
 * unflagged and draws `PLAN_BOX`.
 *
 * **`useLayoutEffect`, not `useEffect`** (7L QA finding, defect 1): the server can never know the
 * client's own viewport, so hydration always starts from the not-fill markup (D6c) — deliberately
 * diverging the client's first render from it here (an `initialPlanFillState` read via `useState`'s
 * lazy initializer, tried and reverted) throws a hydration error instead, which is worse than the gap
 * it closes. `useLayoutEffect` still closes most of it: it commits the flag's real answer, and the
 * observer, synchronously after the DOM mutates and before the browser paints, rather than in a
 * passive effect queued a whole extra frame behind that first paint.
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

/** `ResizeObserver`'s content box already excludes the border (`globals.css:53-55` puts the element
 *  in `border-box`, but the *content* box is reported net of it either way) — exactly the pixels
 *  `derivePlanPreview` is handed for the phone's own `PLAN_BOX`, so no second subtraction belongs
 *  here. `contentBoxSize` is preferred; `contentRect` is the fallback for an engine reporting an
 *  empty array instead (older Safari's own `ResizeObserverEntry`). */
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

/** D6e: a panel a customer's window has made smaller than the set's own minimum is drawn at that
 *  minimum and left to `.planBox`'s `overflow: hidden` to clip — never a thrown `RangeError`. */
function flooredAtMinimum(box: PlanBox, metrics: PlanPreviewMetrics): PlanBox {
  const minimum = planPreviewMinimumBoxPx(metrics);
  return {
    widthPx: Math.max(box.widthPx, minimum.widthPx),
    heightPx: Math.max(box.heightPx, minimum.heightPx),
  };
}

/** The figures the stylesheet cannot import: the border already taken off `PLAN_BOX`, and the line
 *  height the drawing's metric set reserves a label lane for. Published rather than repeated in CSS
 *  — the same hop `price-bar.tsx:12-18` takes, and for the same reason. In fill mode this publishes
 *  the **desktop** set's own line height, so the type `.planWallLabel` sets is the type the lane was
 *  reserved for (D6c). */
function planBoxMetricsStyle(metrics: PlanPreviewMetrics): CSSProperties {
  return {
    ...planBoxBorderStyle(),
    "--plan-label-line": `${String(metrics.labelLinePx)}px`,
  } as CSSProperties;
}

/** The border alone, applied from the box's very first render (including `awaiting-measurement`,
 *  which draws nothing else) — never added a paint later, which is what let `ResizeObserver`'s first
 *  measurement include the 2 px a border added right after it (7L QA finding, defect 2). Without
 *  `--plan-box-border` at all, `room.module.css:374`'s `var()` fails to resolve and the whole `border`
 *  declaration is invalid at computed-value time, so the box is borderless rather than unstyled. */
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
