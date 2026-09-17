"use client";

// Frame 1B's two controls below the plan: the corner toggle (`:142-163`) and the length fields
// (`:164-186`).
//
// **The fields are real `<input>` elements**, where the frame draws a `<span class="num">` inside a
// styled box. A static mockup cannot draw a text field; the box, its height, its inline *m* and its
// tabular numerals are all the frame's, and the input is the control the frame is depicting. This is
// recorded in the wave's plan as a **non-departure**, so it is not something to correct back.
//
// **`type="text"` with `inputmode="decimal"`, and nothing else.** `type="number"` refuses a comma in
// several locales, draws spinners, and reports `valueAsNumber` as a float; a `pattern` here would be
// a second reading of `parse-metres.ts`, which is the one authority on what a length may look like
// (ADR 0108 decision 4).
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
import type { CornerDirection } from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
import { type RefObject, useEffect, useId, useRef, useState } from "react";

import {
  carriesCornerDirection,
  type RoomDraft,
  type RoomLengthField,
} from "./room-draft";
import { requiredFieldsFor } from "./room-url-state";
import styles from "./room.module.css";

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

type WallLengthField = Exclude<RoomLengthField, "height">;

/** The help each wall's control opens: its accessible name and its explanation. Keyed over every wall
 *  the URL parser knows, so a wall added there is a compile error here as well — never a wall with no
 *  help (7A3 criterion 21). The height is not a run the customer furnishes, and carries none. */
export const WALL_LENGTH_HELP = {
  wallA: {
    name: "room.lengthHelp.wallA.name",
    text: "room.lengthHelp.wallA.text",
  },
  wallB: {
    name: "room.lengthHelp.wallB.name",
    text: "room.lengthHelp.wallB.text",
  },
  wallC: {
    name: "room.lengthHelp.wallC.name",
    text: "room.lengthHelp.wallC.text",
  },
} as const satisfies Readonly<
  Record<WallLengthField, { readonly name: string; readonly text: string }>
>;

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
  readonly hintId: string;
  readonly onEnter: (field: RoomLengthField, text: string) => void;
}

/** A wall's input is described by the hint and by its own help, so a screen reader announces both on
 *  focus without the customer opening anything. The help is referenced while hidden on purpose: a
 *  description is computed from hidden content, and that is what makes the explanation unconditional
 *  for a non-visual customer too. */
function LengthField({ id, field, text, hintId, onEnter }: LengthFieldProps) {
  const translate = useTranslations();
  const helpId = `${id}-help`;
  const isWall = isWallLengthField(field);

  return (
    <div className={styles.field}>
      <div className={styles.fieldHeading}>
        <label className={styles.fieldLabel} htmlFor={id}>
          {translate(FIELD_LABEL[field])}
        </label>
        {isWall ? <WallLengthHelp wall={field} helpId={helpId} /> : null}
      </div>
      <div className={styles.fieldBox}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          className={styles.fieldValue}
          value={text}
          aria-describedby={isWall ? `${hintId} ${helpId}` : undefined}
          data-testid={`room-length-${field}`}
          onChange={(event) => {
            onEnter(field, event.target.value);
          }}
        />
        <span className={styles.fieldUnit}>{translate("room.unitMetres")}</span>
      </div>
    </div>
  );
}

function isWallLengthField(field: RoomLengthField): field is WallLengthField {
  return field !== "height";
}

interface WallLengthHelpProps {
  readonly wall: WallLengthField;
  readonly helpId: string;
}

/**
 * **A toggletip, not a hover tooltip**: a real button that opens on click, tap, Enter or Space and
 * says so through `aria-expanded`, because a phone has no hover (engineering conventions: no
 * hover-only control). It closes on a second press, on Escape wherever focus is, on a pointer press
 * outside it, and when focus leaves it — so two can never be open from the keyboard at once.
 *
 * The explanation stays in the tree while closed, `hidden`, because the wall's input names it in
 * `aria-describedby`. Nothing here is an error state: no `aria-invalid`, no alert role, no red.
 */
function WallLengthHelp({ wall, helpId }: WallLengthHelpProps) {
  const translate = useTranslations();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useDismissOnOutsidePointerOrEscape({ rootRef, isOpen, setIsOpen });

  return (
    <span
      ref={rootRef}
      className={styles.lengthHelp}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setIsOpen(false);
      }}
    >
      <button
        type="button"
        className={styles.lengthHelpButton}
        aria-label={translate(WALL_LENGTH_HELP[wall].name)}
        aria-expanded={isOpen}
        aria-controls={helpId}
        data-testid={`room-length-help-${wall}`}
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        <HelpGlyph />
      </button>
      <span
        id={helpId}
        className={styles.lengthHelpText}
        hidden={!isOpen}
        data-testid={`room-length-help-text-${wall}`}
      >
        {translate(WALL_LENGTH_HELP[wall].text)}
      </span>
    </span>
  );
}

interface DismissalProps {
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly isOpen: boolean;
  readonly setIsOpen: (isOpen: boolean) => void;
}

/** Listens only while open, and never calls `stopPropagation` — the rule the application's other
 *  document-level Escape handlers share (`global-settings.tsx`'s `useEscapeToDismiss`). */
function useDismissOnOutsidePointerOrEscape({
  rootRef,
  isOpen,
  setIsOpen,
}: DismissalProps): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [rootRef, isOpen, setIsOpen]);
}

/** An *i* in a ring, drawn in the accent ink. `aria-hidden`, because the button's name says what it
 *  opens. */
function HelpGlyph() {
  return (
    <svg
      className={styles.lengthHelpGlyph}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="var(--accent)" strokeWidth="1.5" />
      <rect x="7.25" y="7" width="1.5" height="5" fill="var(--accent)" />
      <rect x="7.25" y="4" width="1.5" height="1.5" fill="var(--accent)" />
    </svg>
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
