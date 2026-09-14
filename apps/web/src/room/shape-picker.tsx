"use client";

// Frame 1A's three shape cards (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:66-91`),
// and the owner's F8 ruling of 2026-09-14 written down: **all three are drawn**, whatever the policy
// says today. *Liniară* is owner-approved and waits on wave 7J's bounds; *U* has never been put to
// the owner and is M7B. Choosing either selects the card and leaves *Continuă* disabled, which is
// the deliberate dead end M7 criterion 3 asserts — a card that is drawn but refused says the room is
// understood and not yet offered, where a hidden card would say it does not exist.
//
// **Nothing here asks whether a shape is buildable.** That question is `isShapeBuildable`'s and it
// is asked once, by the screen's CTA. This file draws cards and reports a choice.
//
// **Cards, never a dropdown** (criterion 2), and the control inside each card is a native radio: it
// carries the group's roving focus, its arrow keys and its checked state without this file
// implementing any of them.
import type { RoomShape } from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";

import styles from "./room.module.css";

export interface ShapePickerProps {
  /** The card the customer has chosen, or nothing chosen yet — frame 1A's *nimic selectat*. */
  readonly chosenShape: RoomShape | undefined;
  /** The visible question that names this group. The plan adds no invented accessible name: the
   *  heading a sighted customer reads is the one a screen reader announces (ADR 0113). */
  readonly labelledBy: string;
  readonly onChoose: (shape: RoomShape) => void;
}

/** One wall of the card's 2D plan glyph, in the frame's own 72 × 56 viewBox. */
interface GlyphWall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const GLYPH_WIDTH = 72;
const GLYPH_HEIGHT = 56;

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
  },
  L: { name: "room.shapes.L.name", detail: "room.shapes.L.detail" },
  U: { name: "room.shapes.U.name", detail: "room.shapes.U.detail" },
} as const satisfies Readonly<
  Record<RoomShape, { readonly name: string; readonly detail: string }>
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
  onChoose,
}: ShapePickerProps) {
  const translate = useTranslations();

  return (
    <div
      className={styles.shapes}
      role="radiogroup"
      aria-labelledby={labelledBy}
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
          <ShapeGlyph shape={shape} />
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

/** `aria-hidden`, because the card's own name and detail already say what the picture shows: a
 *  drafted description of a drawing would be a second author for copy the frames already wrote. */
function ShapeGlyph({ shape }: { readonly shape: RoomShape }) {
  return (
    <svg
      className={styles.shapeGlyph}
      width={GLYPH_WIDTH}
      height={GLYPH_HEIGHT}
      viewBox={`0 0 ${String(GLYPH_WIDTH)} ${String(GLYPH_HEIGHT)}`}
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width={GLYPH_WIDTH - 2}
        height={GLYPH_HEIGHT - 2}
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
