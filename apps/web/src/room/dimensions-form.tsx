"use client";

// Frame 1B's two controls below the plan: the corner toggle (`:142-163`) and the length fields
// (`:164-186`).
//
// **The fields are real `<input>` elements**, where the frame draws a `<span class="num">` inside a
// styled box. A static mockup cannot draw a text field; the box, its height, its inline unit and its
// tabular numerals are all the frame's, and the input is the control the frame is depicting. This is
// recorded in the wave's plan as a **non-departure**, so it is not something to correct back.
//
// **Whole millimetres, where the frame draws metres** (ADR 0126, a departure from frames 1B/1C
// recorded against ADR 0104): the box reads *"3600"* beside *mm*, where the frame draws *"3,60"*
// beside *m*.
//
// **`type="text"` with `inputmode="numeric"`, and nothing else.** The keypad is the prevention;
// `parse-millimetres.ts` is the one authority on what a length may look like (ADR 0108 decision 4).
// `type="number"` draws spinners and reports `valueAsNumber` as a float; a `pattern` would be a second
// reading of that parser; a `maxLength` truncates a paste into a room nobody entered; and a
// placeholder would put an example figure in the box.
//
// **Nothing is painted as an error.** At 1B a field that does not yet read as a length is a field
// still to be filled, not a wrong one (criterion 10): no `aria-invalid`, no message, no red. The
// reasons beside a field are wave 7F2's, and their copy is frame 1C's.
//
// **The wall fields say what number to type, twice** (wave 7A3, owner ruling Q-7A3-1). The number is
// the run the customer wants furnished, not the wall (ADR 0120 Amendments C1 and D1), and the labels
// stay the frame's *Perete A/B/C*. So one hint line above the fields says it to a customer who never
// taps anything — which is the criterion, and why a help control alone would not meet it — and a help
// control per wall carries the longer explanation on top. Neither states a bound (ADR 0108
// decision 3) and neither refuses anything: the refusal sentence is 7F2's.
import type { CornerDirection, RoomShape } from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
import { useId } from "react";

import {
  carriesCornerDirection,
  type RoomDraft,
  type RoomLengthField,
} from "./room-draft";
import { requiredFieldsFor } from "./room-url-state";
import styles from "./room.module.css";
import { WallLengthHelp } from "./wall-length-help";

export interface DimensionsFormProps {
  readonly draft: RoomDraft;
  readonly onEnterLength: (field: RoomLengthField, text: string) => void;
  readonly onChooseCorner: (direction: CornerDirection) => void;
}

/** The label each field carries. A `Record` over every field the URL parser knows, so a wall added
 *  to a shape there is a compile error here rather than a field with no name (criterion 4). */
const FIELD_LABEL = {
  wallA: "room.wallLabel.wallA",
  wallB: "room.wallLabel.wallB",
  wallC: "room.wallLabel.wallC",
  height: "room.heightLabel",
} as const satisfies Readonly<Record<RoomLengthField, string>>;

/** The fields that are walls a customer furnishes, named rather than derived as "not the height": a
 *  field the URL parser learns later is not taken for a wall until it is listed here. */
const WALL_LENGTH_FIELDS = [
  "wallA",
  "wallB",
  "wallC",
] as const satisfies readonly RoomLengthField[];

export type WallLengthField = (typeof WALL_LENGTH_FIELDS)[number];

/** The one wall a straight room is entered with (`requiredFieldsFor("linear")`), and so the one wall
 *  whose explanation also has a reading for a room with no corner. */
type StraightRoomWall = "wallA";

/** A wall's help copy. **The explanation depends on the room**: in a room that turns a corner the
 *  length is measured from the corner, corner cabinet included (owner ruling, 2026-09-17), and a
 *  straight room has no corner to measure from. The type demands both readings of wall A and admits
 *  only the corner reading of the others, so neither can be forgotten or invented. */
interface WallHelpCopy<Wall extends WallLengthField> {
  readonly name: string;
  readonly explanation: Wall extends StraightRoomWall
    ? { readonly straightRoom: string; readonly cornerRoom: string }
    : { readonly cornerRoom: string };
}

/** The help each wall's control opens. Keyed over every wall, so a wall without help is a compile
 *  error here (7A3 criterion 21). The height is not a run the customer furnishes, and carries none. */
export const WALL_LENGTH_HELP = {
  wallA: {
    name: "room.lengthHelp.wallA.name",
    explanation: {
      straightRoom: "room.lengthHelp.wallA.text",
      cornerRoom: "room.lengthHelp.wallA.cornerText",
    },
  },
  wallB: {
    name: "room.lengthHelp.wallB.name",
    explanation: { cornerRoom: "room.lengthHelp.wallB.text" },
  },
  wallC: {
    name: "room.lengthHelp.wallC.name",
    explanation: { cornerRoom: "room.lengthHelp.wallC.text" },
  },
} as const satisfies { readonly [Wall in WallLengthField]: WallHelpCopy<Wall> };

/** Frame 1B's order: *La stânga* first and pre-selected. */
const CORNER_DIRECTIONS = [
  { direction: "left", name: "room.cornerLeft" },
  { direction: "right", name: "room.cornerRight" },
] as const satisfies readonly {
  readonly direction: CornerDirection;
  readonly name: string;
}[];

/** The corner radios' shared group name. Not customer-visible, so it is not copy. */
const CORNER_GROUP_NAME = "room-corner-direction";

/** The corner glyph's coordinate space, frame 1B's own (`:155`). */
const CORNER_GLYPH_VIEWBOX = { width: 60, height: 44 } as const;
const CORNER_GLYPH_SIZE = { widthPx: 36, heightPx: 26 } as const;

export function DimensionsForm({
  draft,
  onEnterLength,
  onChooseCorner,
}: DimensionsFormProps) {
  return (
    <>
      {/* Criterion 6: for a `linear` room the toggle is **absent** from the tree rather than hidden
          by CSS — there is no corner to point anywhere. Which shapes turn one is `room-draft.ts`'s
          single statement of it, so no component here spells a shape's letter. */}
      {carriesCornerDirection(draft.shape) ? (
        <CornerToggle
          chosen={draft.cornerDirection}
          onChoose={onChooseCorner}
        />
      ) : null}
      <LengthFields draft={draft} onEnterLength={onEnterLength} />
    </>
  );
}

interface CornerToggleProps {
  readonly chosen: CornerDirection;
  readonly onChoose: (direction: CornerDirection) => void;
}

/** The group is named by the visible question through `aria-labelledby` — no invented accessible
 *  name, which is the copy obligation's second deliberate absence. */
function CornerToggle({ chosen, onChoose }: CornerToggleProps) {
  const translate = useTranslations();
  const questionId = useId();

  return (
    <div className={styles.corner} data-testid="room-corner">
      <div className={styles.cornerHeading}>
        <span className={styles.cornerQuestion} id={questionId}>
          {translate("room.cornerQuestion")}
        </span>
        <span className={styles.cornerHint}>
          {translate("room.cornerHint")}
        </span>
      </div>
      <div
        className={styles.cornerChoices}
        role="radiogroup"
        aria-labelledby={questionId}
      >
        {CORNER_DIRECTIONS.map(({ direction, name }) => (
          <label
            key={direction}
            className={styles.cornerChoice}
            data-testid={`room-corner-${direction}`}
          >
            <input
              type="radio"
              name={CORNER_GROUP_NAME}
              value={direction}
              className={styles.cornerControl}
              checked={direction === chosen}
              data-testid={`room-corner-control-${direction}`}
              onChange={() => {
                onChoose(direction);
              }}
            />
            <CornerGlyph direction={direction} />
            <span className={styles.cornerName}>{translate(name)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

interface LengthFieldsProps {
  readonly draft: RoomDraft;
  readonly onEnterLength: (field: RoomLengthField, text: string) => void;
}

/** One field per wall of the chosen shape, plus the height — and the list is the URL parser's own,
 *  so a U's third field costs nothing and is never a hand-written branch (criterion 4). */
function LengthFields({ draft, onEnterLength }: LengthFieldsProps) {
  const translate = useTranslations();
  const fieldIdPrefix = useId();
  const hintId = useId();

  return (
    <div className={styles.fields} data-testid="room-fields">
      <span
        id={hintId}
        className={styles.lengthsHint}
        data-testid="room-lengths-hint"
      >
        {translate("room.lengthsHint")}
      </span>
      {requiredFieldsFor(draft.shape).map((field) => (
        <LengthField
          key={field}
          id={`${fieldIdPrefix}${field}`}
          field={field}
          text={draft.lengths[field].text}
          shape={draft.shape}
          hintId={hintId}
          onEnter={onEnterLength}
        />
      ))}
    </div>
  );
}

interface LengthFieldProps {
  readonly id: string;
  readonly field: RoomLengthField;
  readonly text: string;
  readonly shape: RoomShape;
  readonly hintId: string;
  readonly onEnter: (field: RoomLengthField, text: string) => void;
}

/** A wall's input is described by the hint and by its own help, so a screen reader announces both on
 *  focus without the customer opening anything. The help is referenced while hidden on purpose: a
 *  description is computed from hidden content, and that is what makes the explanation unconditional
 *  for a non-visual customer too. */
function LengthField({
  id,
  field,
  text,
  shape,
  hintId,
  onEnter,
}: LengthFieldProps) {
  const translate = useTranslations();
  const helpId = `${id}-help`;
  const isWall = isWallLengthField(field);

  return (
    <div className={styles.field}>
      <div className={styles.fieldHeading}>
        <label className={styles.fieldLabel} htmlFor={id}>
          {translate(FIELD_LABEL[field])}
        </label>
        {isWall ? (
          <WallLengthHelp
            wall={field}
            helpId={helpId}
            accessibleName={translate(WALL_LENGTH_HELP[field].name)}
            explanation={translate(explanationKeyFor(field, shape))}
          />
        ) : null}
      </div>
      <div className={styles.fieldBox}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className={styles.fieldValue}
          value={text}
          aria-describedby={isWall ? `${hintId} ${helpId}` : undefined}
          data-testid={`room-length-${field}`}
          onChange={(event) => {
            onEnter(field, event.target.value);
          }}
        />
        <span className={styles.fieldUnit}>
          {translate("room.unitMillimetres")}
        </span>
      </div>
    </div>
  );
}

function isWallLengthField(field: RoomLengthField): field is WallLengthField {
  return (WALL_LENGTH_FIELDS as readonly RoomLengthField[]).includes(field);
}

/** The explanation a wall's help gives in a room of this shape. A straight room carries only wall A,
 *  so the throw is for a wall the shape does not have — never a customer's state. */
function explanationKeyFor(wall: WallLengthField, shape: RoomShape) {
  const explanation = WALL_LENGTH_HELP[wall].explanation;
  if (carriesCornerDirection(shape)) return explanation.cornerRoom;
  if ("straightRoom" in explanation) return explanation.straightRoom;
  throw new Error(
    `No explanation for ${wall} in a ${shape} room: that shape has no such wall.`,
  );
}

/** The corner, drawn pointing the way its chip chooses — frame 1B's two glyphs (`:155`, `:159`). The
 *  back wall is the same in both and only the side wall moves, which is the whole of what the toggle
 *  mirrors. `aria-hidden`, because the chip's name already says which way it points. */
function CornerGlyph({ direction }: { readonly direction: CornerDirection }) {
  return (
    <svg
      className={styles.cornerGlyph}
      width={CORNER_GLYPH_SIZE.widthPx}
      height={CORNER_GLYPH_SIZE.heightPx}
      viewBox={`0 0 ${String(CORNER_GLYPH_VIEWBOX.width)} ${String(CORNER_GLYPH_VIEWBOX.height)}`}
      fill="none"
      aria-hidden="true"
    >
      <rect x="6" y="7" width="48" height="7" fill="var(--accent)" />
      <rect
        x={direction === "left" ? 6 : 47}
        y="14"
        width="7"
        height="22"
        fill="var(--accent)"
      />
    </svg>
  );
}
