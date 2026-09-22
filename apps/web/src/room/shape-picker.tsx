"use client";

// Frame 1A's three shape cards (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:66-91`),
// and the owner's F8 ruling of 2026-09-14 written down: **all three are drawn**, whatever the policy
// says today. *Liniară* is owner-approved and waits on wave 7J's bounds; *U* has never been put to
// the owner and is M7B. Choosing either selects the card and leaves *Continuă* disabled, which is
// the deliberate dead end M7 criterion 3 asserts — a card that is drawn but refused says the room is
// understood and not yet offered, where a hidden card would say it does not exist.
//
// **Nothing here asks whether a shape is buildable.** That question is `isShapeBuildable`'s and the
// screen asks it. This file draws the choice, reports it, and — told which chosen shape is refused —
// draws the refusal under it (wave 7F2 S4, criterion 9).
//
// **Two drawings of one choice.** `ShapePicker` is 1A's column of cards; `ShapeChips` is 1B's row of
// chips (`:116-131`), where the same three shapes stay changeable while the customer types. They
// share the glyph table, the copy table and the frame's order, so a shape the domain adds reaches
// both surfaces or neither — and the chip's picture is the card's picture at a second size rather
// than a second set of rectangles.
//
// **Cards, never a dropdown** (criterion 2), and the control inside each card is a native radio: it
// carries the group's roving focus, its arrow keys and its checked state without this file
// implementing any of them.
import type { RoomShape } from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";

import { SHAPE_REFUSAL_MESSAGE_KEY } from "./room-issue-model";
import styles from "./room.module.css";

export interface ShapePickerProps {
  /** The card the customer has chosen, or nothing chosen yet — frame 1A's *nimic selectat*. */
  readonly chosenShape: RoomShape | undefined;
  /** The visible question that names this group. The plan adds no invented accessible name: the
   *  heading a sighted customer reads is the one a screen reader announces (ADR 0113). */
  readonly labelledBy: string;
  /** The refusal's id while the chosen card is refused; nothing otherwise. */
  readonly describedBy: string | undefined;
  readonly onChoose: (shape: RoomShape) => void;
}

/** One wall of the card's 2D plan glyph, in the frame's own 72 × 56 viewBox. */
interface GlyphWall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The glyph's own coordinate space, which both sizes below are drawn in: the card's picture and the
 *  chip's are the same drawing at two scales, not two drawings. */
const GLYPH_VIEWBOX_WIDTH = 72;
const GLYPH_VIEWBOX_HEIGHT = 56;

/** Frame 1A draws the card's glyph at 72 × 56 (`:70`) and frame 1B the chip's at 46 × 30 (`:118`). */
const CARD_GLYPH_SIZE = { widthPx: 72, heightPx: 56 } as const;
const CHIP_GLYPH_SIZE = { widthPx: 46, heightPx: 30 } as const;

/** Frame 1A's own rects (`:71`, `:79`, `:87`): the back wall every shape has, the wall the L adds
 *  down the left, and the third the U adds down the right. They agree with the plan preview's
 *  anchor (M7 criterion 12): wall A runs along the top and wall B down the side, from the corner
 *  where they meet. */
const BACK_WALL: GlyphWall = { x: 10, y: 12, width: 52, height: 8 };
const LEFT_WALL: GlyphWall = { x: 10, y: 20, width: 8, height: 26 };
const RIGHT_WALL: GlyphWall = { x: 54, y: 20, width: 8, height: 26 };

/** A `Record` over `RoomShape` rather than three hand-drawn glyphs: a shape added to the domain is a
 *  compile error here instead of a card that silently draws nothing. */
const GLYPH_WALLS: Readonly<Record<RoomShape, readonly GlyphWall[]>> = {
  linear: [BACK_WALL],
  L: [BACK_WALL, LEFT_WALL],
  U: [BACK_WALL, LEFT_WALL, RIGHT_WALL],
};

/** The message keys each card reads, written out in full so next-intl checks every one of them. A
 *  built key — `` translate(`room.shapes.${shape}.name`) `` — would defeat the generated declaration,
 *  which is the property ADR 0095 decision 1 chose the library for. */
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

/** The frame's order down the screen. The two tables above are `Record`s over `RoomShape`, so a
 *  shape the domain adds cannot reach a card without its copy and its glyph; this line is only where
 *  that card stands. */
const SHAPES_IN_FRAME_ORDER: readonly RoomShape[] = ["linear", "L", "U"];

/** The radios' shared group name. Not customer-visible, so it is not copy. */
const SHAPE_GROUP_NAME = "room-shape";

export function ShapePicker({
  chosenShape,
  labelledBy,
  describedBy,
  onChoose,
}: ShapePickerProps) {
  const translate = useTranslations();

  return (
    <div
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

export interface ShapeChipsProps {
  /** At 1B a shape is always chosen: the query names it, and that is what puts the screen here. */
  readonly chosenShape: RoomShape;
  /** The refusal's id while the chosen chip is refused; nothing otherwise. Only the chosen chip
   *  carries it. */
  readonly describedBy: string | undefined;
  readonly onChoose: (shape: RoomShape) => void;
}

/**
 * The same three choices once the customer is entering lengths — frame 1B's chip row (`:116-131`),
 * the cards above compressed to a glyph and the shape's short name.
 *
 * **No `role="radiogroup"` and no group label**, unlike the cards: frame 1B draws no question over
 * this row, and the plan adds no invented accessible name for one (ADR 0113). The three radios share
 * a name, so the browser groups them and gives each its own visible label.
 *
 * **So the refusal is described on the chosen radio rather than on a group** (slice S4). A radiogroup
 * needs an accessible name, and this row has no visible text to take one from; the radio is what takes
 * focus, so it is where a screen reader reads a description. Only the chosen one carries it (review
 * R1.2): browse mode would otherwise read a sentence about the chosen shape on the other two.
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
 * **The refusal under the cards (1A) and under the chips (1B, 1C)** — frame 1C's reason box, saying
 * the chosen shape cannot be offered and naming no internal reason (ADR 0120 decisions 3–4). It is
 * independent of every field.
 *
 * **Its own polite status region, not 1C's** (`one-c-status.tsx`): it sits under the shape choice,
 * which 1C's region below the fields cannot, and 1A has no 1C region at all. The region is drawn empty
 * while nothing is refused, so it is in the tree before its sentence arrives. The sentence is keyed
 * by the refused shape, so moving from one refused chip to another replaces it and is announced again
 * rather than read as unchanged.
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

/** `aria-hidden`, because the card's own name and detail already say what the picture shows: a
 *  drafted description of a drawing would be a second author for copy the frames already wrote. */
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
