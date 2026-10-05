"use client";

// Frame 1A's three shape cards. All three are drawn whatever the policy says: a card that is drawn
// but refused says the room is understood and not yet offered, where a hidden one would say it does
// not exist. Choosing a refused shape selects the card and leaves *Continuă* disabled.
//
// Nothing here asks whether a shape is buildable (`isShapeBuildable`, asked by the screen): this file
// draws the choice, reports it, and draws the refusal under it when told which shape is refused.
//
// `ShapePicker` (1A's cards) and `ShapeChips` (1B's row) share the glyph table, the copy table and
// the order, so a shape the domain adds reaches both or neither. The control in each is a native
// radio, which carries the roving focus, arrow keys and checked state.
import type { RoomShape } from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type RefObject } from "react";

import { SHAPE_REFUSAL_MESSAGE_KEY } from "./room-issue-model";
import styles from "./room.module.css";

export interface ShapePickerProps {
  /** The card the customer has chosen, or nothing chosen yet. */
  readonly chosenShape: RoomShape | undefined;
  /** The visible question that names this group, with no invented accessible name (ADR 0113). */
  readonly labelledBy: string;
  /** The refusal's id while the chosen card is refused; nothing otherwise. */
  readonly describedBy: string | undefined;
  readonly onChoose: (shape: RoomShape) => void;
}

/** One wall of the card's 2D plan glyph, in the 72 × 56 viewBox. */
interface GlyphWall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The card's and the chip's glyph are one drawing at two scales, both in this coordinate space. */
const GLYPH_VIEWBOX_WIDTH = 72;
const GLYPH_VIEWBOX_HEIGHT = 56;

const CARD_GLYPH_SIZE = { widthPx: 72, heightPx: 56 } as const;
const CHIP_GLYPH_SIZE = { widthPx: 46, heightPx: 30 } as const;

/** The back wall every shape has, the wall the L adds down the left and the one the U adds down the
 *  right. They agree with the plan preview's anchor: wall A along the top, wall B down the side from
 *  the corner where they meet. */
const BACK_WALL: GlyphWall = { x: 10, y: 12, width: 52, height: 8 };
const LEFT_WALL: GlyphWall = { x: 10, y: 20, width: 8, height: 26 };
const RIGHT_WALL: GlyphWall = { x: 54, y: 20, width: 8, height: 26 };

/** A `Record` over `RoomShape`: a shape added to the domain is a compile error, not a blank card. */
const GLYPH_WALLS: Readonly<Record<RoomShape, readonly GlyphWall[]>> = {
  linear: [BACK_WALL],
  L: [BACK_WALL, LEFT_WALL],
  U: [BACK_WALL, LEFT_WALL, RIGHT_WALL],
};

/** Keys written out in full so next-intl checks each one: a built key such as
 *  `` `room.shapes.${shape}.name` `` would defeat the generated declaration (ADR 0095 decision 1). */
const SHAPE_COPY = {
  linear: {
    name: "room.shapes.linear.name",
    detail: "room.shapes.linear.detail",
    short: "room.shapes.linear.short",
  },
  L: {
    name: "room.shapes.L.name",
    detail: "room.shapes.L.detail",
    short: "room.shapes.L.short",
  },
  U: {
    name: "room.shapes.U.name",
    detail: "room.shapes.U.detail",
    short: "room.shapes.U.short",
  },
} as const satisfies Readonly<
  Record<
    RoomShape,
    { readonly name: string; readonly detail: string; readonly short: string }
  >
>;

const SHAPES_IN_FRAME_ORDER: readonly RoomShape[] = ["linear", "L", "U"];

const SHAPE_GROUP_NAME = "room-shape";

export function ShapePicker({
  chosenShape,
  labelledBy,
  describedBy,
  onChoose,
}: ShapePickerProps) {
  const translate = useTranslations();
  const groupRef = useRef<HTMLDivElement>(null);
  useAdoptShapeChosenBeforeHydration(groupRef, onChoose);

  return (
    <div
      ref={groupRef}
      className={styles.shapes}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-testid="room-shapes"
    >
      {SHAPES_IN_FRAME_ORDER.map((shape) => (
        <label
          key={shape}
          className={styles.shapeCard}
          data-testid={`room-shape-card-${shape}`}
        >
          <input
            type="radio"
            name={SHAPE_GROUP_NAME}
            value={shape}
            className={styles.shapeControl}
            checked={shape === chosenShape}
            data-testid={`room-shape-${shape}`}
            onChange={() => {
              onChoose(shape);
            }}
          />
          <ShapeGlyph shape={shape} size={CARD_GLYPH_SIZE} />
          <span className={styles.shapeText}>
            <span className={styles.shapeName}>
              {translate(SHAPE_COPY[shape].name)}
            </span>
            <span className={styles.shapeDetail}>
              {translate(SHAPE_COPY[shape].detail)}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * A card tapped before hydration is still the customer's choice. The server draws every radio
 * unchecked; an early tap checks the DOM radio natively, and hydration takes that as its baseline,
 * so the tap and every later tap on it raise no `onChange` and *Continuă* stays disabled for good.
 * Once mounted, the checked radio is therefore reported once. Later runs report what is already
 * chosen, which `onChoose` treats as a no-op.
 */
function useAdoptShapeChosenBeforeHydration(
  groupRef: RefObject<HTMLElement | null>,
  onChoose: (shape: RoomShape) => void,
): void {
  useEffect(() => {
    const tappedShape = shapeCheckedIn(groupRef.current);
    if (tappedShape !== undefined) onChoose(tappedShape);
  }, [groupRef, onChoose]);
}

function shapeCheckedIn(group: HTMLElement | null): RoomShape | undefined {
  const checkedValue = group?.querySelector<HTMLInputElement>(
    "input[type=radio]:checked",
  )?.value;
  return SHAPES_IN_FRAME_ORDER.find((shape) => shape === checkedValue);
}

export interface ShapeChipsProps {
  /** At 1B a shape is always chosen: the query names it, and that is what puts the screen here. */
  readonly chosenShape: RoomShape;
  /** The refusal's id while the chosen chip is refused; only the chosen chip carries it. */
  readonly describedBy: string | undefined;
  readonly onChoose: (shape: RoomShape) => void;
}

/**
 * The same three choices while the customer enters lengths: a glyph and the shape's short name.
 *
 * No `role="radiogroup"` and no group label, unlike the cards: this row has no visible question to
 * name one, and no accessible name is invented (ADR 0113). The radios share a name, so the browser
 * groups them. The refusal is therefore described on the chosen radio, the focus target, and only on
 * that one, so browse mode does not read it on the other two.
 */
export function ShapeChips({
  chosenShape,
  describedBy,
  onChoose,
}: ShapeChipsProps) {
  const translate = useTranslations();

  return (
    <div className={styles.shapeChips} data-testid="room-shape-chips">
      {SHAPES_IN_FRAME_ORDER.map((shape) => (
        <label
          key={shape}
          className={styles.shapeChip}
          data-testid={`room-shape-chip-${shape}`}
        >
          <input
            type="radio"
            name={SHAPE_GROUP_NAME}
            value={shape}
            className={styles.shapeChipControl}
            checked={shape === chosenShape}
            aria-describedby={shape === chosenShape ? describedBy : undefined}
            data-testid={`room-shape-chip-control-${shape}`}
            onChange={() => {
              onChoose(shape);
            }}
          />
          <ShapeGlyph shape={shape} size={CHIP_GLYPH_SIZE} />
          <span className={styles.shapeChipName}>
            {translate(SHAPE_COPY[shape].short)}
          </span>
        </label>
      ))}
    </div>
  );
}

export interface ShapeRefusalProps {
  /** The sentence's id, which the cards or the chips are described by. */
  readonly id: string;
  /** The chosen shape when the policy does not build it; nothing otherwise. */
  readonly refusedShape: RoomShape | undefined;
}

/**
 * The refusal under the cards (1A) and the chips (1B, 1C): the chosen shape cannot be offered, naming
 * no internal reason (ADR 0120 decisions 3-4).
 *
 * Its own polite status region, not `one-c-status.tsx`'s, which sits below the fields and does not
 * exist at 1A. The region is drawn empty while nothing is refused, so it is in the tree before its
 * sentence arrives; the sentence is keyed by the refused shape, so moving between refused chips is
 * announced again.
 */
export function ShapeRefusal({ id, refusedShape }: ShapeRefusalProps) {
  const translate = useTranslations();

  return (
    <div
      className={styles.shapeRefusal}
      role="status"
      data-testid="room-shape-refusal-status"
    >
      {refusedShape === undefined ? null : (
        <p
          key={refusedShape}
          id={id}
          className={styles.reason}
          data-testid="room-shape-refusal"
        >
          {translate(SHAPE_REFUSAL_MESSAGE_KEY)}
        </p>
      )}
    </div>
  );
}

interface GlyphSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** `aria-hidden`: the card's own name and detail already say what the picture shows. */
function ShapeGlyph({
  shape,
  size,
}: {
  readonly shape: RoomShape;
  readonly size: GlyphSize;
}) {
  return (
    <svg
      className={styles.shapeGlyph}
      width={size.widthPx}
      height={size.heightPx}
      viewBox={`0 0 ${String(GLYPH_VIEWBOX_WIDTH)} ${String(GLYPH_VIEWBOX_HEIGHT)}`}
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width={GLYPH_VIEWBOX_WIDTH - 2}
        height={GLYPH_VIEWBOX_HEIGHT - 2}
        rx="3"
        stroke="var(--line)"
      />
      {GLYPH_WALLS[shape].map((wall) => (
        <rect
          key={`${String(wall.x)}:${String(wall.y)}`}
          x={wall.x}
          y={wall.y}
          width={wall.width}
          height={wall.height}
          fill="var(--accent)"
        />
      ))}
    </svg>
  );
}
