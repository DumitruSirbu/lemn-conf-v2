"use client";

// The corner toggle and the length fields below the plan. Lengths are whole millimetres (ADR 0126).
//
// The fields are `type="text"` with `inputmode="numeric"`, and nothing else: `parse-millimetres.ts`
// alone says what a length may look like (ADR 0108 decision 4). `type="number"` draws spinners and
// reads floats, a `pattern` would be a second reading of that parser, a `maxLength` truncates a
// paste, and a placeholder would put an example figure in the box.
//
// At 1B nothing is painted as an error while the customer is in a field: no `aria-invalid`, message
// or red. Text the field refuses is explained once the customer leaves it (ADR 0126). At 1C a field
// the room refuses carries its reason, linked by `aria-describedby` after the hint and help, and the
// red is painted from `aria-invalid` (`room.module.css`), so nothing is red that a screen reader is
// not told is invalid.
//
// The wall fields say what number to type twice: a hint line above the fields, so a customer who taps
// nothing still reads it, and a help control per wall. The number is the run to furnish, not the wall
// (ADR 0120 Amendments C1 and D1). Neither states a bound (ADR 0108 decision 3).
import type { CornerDirection, RoomShape } from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { useAfterPress } from "@/lib/use-after-press";

import {
  carriesCornerDirection,
  type RoomDraft,
  type RoomLengthField,
} from "./room-draft";
import {
  UNREADABLE_LENGTH_MESSAGE_KEY,
  type RoomFieldReason,
  type RoomIssueMessageKey,
} from "./room-issue-model";
import { requiredFieldsFor, turnsACorner } from "./room-url-state";
import styles from "./room.module.css";
import { WallLengthHelp } from "./wall-length-help";

export interface DimensionsFormProps {
  readonly draft: RoomDraft;
  /** The reasons 1C shows beside their fields (`RoomIssueView.fieldReasons`); none at 1B. */
  readonly fieldReasons?: readonly RoomFieldReason[];
  /** The fields holding text the parser refuses (`RoomIssueView.unreadableFields`). The form
   *  explains each after the customer leaves it, never while they type. */
  readonly unreadableFields?: readonly RoomLengthField[];
  /** The linear suggestion's id while it shows, appended after each offending field's own
   *  reason in `aria-describedby`. */
  readonly suggestionId?: string | undefined;
  readonly onEnterLength: (field: RoomLengthField, text: string) => void;
  readonly onChooseCorner: (direction: CornerDirection) => void;
}

/** A `Record` over every field the URL parser knows, so a wall added there is a compile error here. */
const FIELD_LABEL = {
  wallA: "room.wallLabel.wallA",
  wallB: "room.wallLabel.wallB",
  wallC: "room.wallLabel.wallC",
  height: "room.heightLabel",
} as const satisfies Readonly<Record<RoomLengthField, string>>;

/** Named rather than derived as "not the height", so a new URL field is not taken for a wall. */
const WALL_LENGTH_FIELDS = [
  "wallA",
  "wallB",
  "wallC",
] as const satisfies readonly RoomLengthField[];

export type WallLengthField = (typeof WALL_LENGTH_FIELDS)[number];

/** The one wall a straight room is entered with (`requiredFieldsFor("linear")`). */
type StraightRoomWall = "wallA";

/** A wall's help copy, which depends on the room: with a corner the length is measured from it,
 *  corner cabinet included; a straight room has none. The type demands both readings of wall A and
 *  only the corner reading of the others. */
interface WallHelpCopy<Wall extends WallLengthField> {
  readonly name: string;
  readonly explanation: Wall extends StraightRoomWall
    ? { readonly straightRoom: string; readonly cornerRoom: string }
    : { readonly cornerRoom: string };
}

/** The help each wall's control opens, keyed over every wall; the height carries none. */
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

const CORNER_DIRECTIONS = [
  { direction: "left", name: "room.cornerLeft" },
  { direction: "right", name: "room.cornerRight" },
] as const satisfies readonly {
  readonly direction: CornerDirection;
  readonly name: string;
}[];

const CORNER_GROUP_NAME = "room-corner-direction";

const CORNER_GLYPH_VIEWBOX = { width: 60, height: 44 } as const;
const CORNER_GLYPH_SIZE = { widthPx: 36, heightPx: 26 } as const;

const NO_FIELD_REASONS: readonly RoomFieldReason[] = [];
const NO_UNREADABLE_FIELDS: readonly RoomLengthField[] = [];

/** A field whose unreadable text is explained says that and nothing else; unreadable text keeps the
 *  room at 1B, so no 1C reason can stand beside it. */
const UNREADABLE_REASON_KEYS: readonly ReasonMessageKey[] = [
  UNREADABLE_LENGTH_MESSAGE_KEY,
];

export function DimensionsForm({
  draft,
  fieldReasons = NO_FIELD_REASONS,
  unreadableFields = NO_UNREADABLE_FIELDS,
  suggestionId,
  onEnterLength,
  onChooseCorner,
}: DimensionsFormProps) {
  return (
    <>
      {/* A `linear` room has no corner, so the toggle is absent from the tree, not hidden by CSS.
          `room-draft.ts` alone says which shapes turn one. */}
      {carriesCornerDirection(draft.shape) ? (
        <CornerToggle
          chosen={draft.cornerDirection}
          onChoose={onChooseCorner}
        />
      ) : null}
      <LengthFields
        draft={draft}
        fieldReasons={fieldReasons}
        unreadableFields={unreadableFields}
        suggestionId={suggestionId}
        onEnterLength={onEnterLength}
      />
    </>
  );
}

interface CornerToggleProps {
  readonly chosen: CornerDirection;
  readonly onChoose: (direction: CornerDirection) => void;
}

/** The group is named by the visible question through `aria-labelledby`, with no invented name. */
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
  readonly fieldReasons: readonly RoomFieldReason[];
  readonly unreadableFields: readonly RoomLengthField[];
  readonly suggestionId: string | undefined;
  readonly onEnterLength: (field: RoomLengthField, text: string) => void;
}

/** One field per wall of the chosen shape plus the height, from the URL parser's own list. */
function LengthFields({
  draft,
  fieldReasons,
  unreadableFields,
  suggestionId,
  onEnterLength,
}: LengthFieldsProps) {
  const translate = useTranslations();
  const fieldIdPrefix = useId();
  const hintId = useId();
  const unreadableExplained = useUnreadableOnLeave(unreadableFields);

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
          reasonKeys={
            unreadableExplained.isShown(field)
              ? UNREADABLE_REASON_KEYS
              : reasonKeysFor(field, fieldReasons)
          }
          suggestionId={suggestionId}
          onEnter={(entered, text) => {
            unreadableExplained.forgetUnlessShown(entered);
            onEnterLength(entered, text);
          }}
          onLeave={unreadableExplained.noteLeave}
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
  /** This field's 1C reasons, or the unreadable text's once the field was left; never both. */
  readonly reasonKeys: readonly ReasonMessageKey[];
  /** The linear suggestion's id while shown, appended after this field's own reason. */
  readonly suggestionId: string | undefined;
  readonly onEnter: (field: RoomLengthField, text: string) => void;
  readonly onLeave: (field: RoomLengthField) => void;
}

type ReasonMessageKey =
  | RoomIssueMessageKey
  | typeof UNREADABLE_LENGTH_MESSAGE_KEY;

/** A wall's input is described by the hint and its own help. The help is referenced while hidden on
 *  purpose: a description is computed from hidden content, so a screen reader announces it on focus.
 *  The reason is described last. */
function LengthField({
  id,
  field,
  text,
  shape,
  hintId,
  reasonKeys,
  suggestionId,
  onEnter,
  onLeave,
}: LengthFieldProps) {
  const translate = useTranslations();
  const helpId = `${id}-help`;
  const isWall = isWallLengthField(field);
  const reasonIds = reasonKeys.map(
    (_, index) => `${id}-reason-${String(index)}`,
  );
  // D9: only a field that already carries a reason is described by the suggestion, after that reason.
  const suggestionIds =
    suggestionId !== undefined && reasonKeys.length > 0 ? [suggestionId] : [];
  const describedBy = [
    ...(isWall ? [hintId, helpId] : []),
    ...reasonIds,
    ...suggestionIds,
  ];

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
          aria-describedby={
            describedBy.length > 0 ? describedBy.join(" ") : undefined
          }
          aria-invalid={reasonKeys.length > 0 ? true : undefined}
          data-testid={`room-length-${field}`}
          onChange={(event) => {
            onEnter(field, event.target.value);
          }}
          onBlur={() => {
            onLeave(field);
          }}
        />
        <span className={styles.fieldUnit}>
          {translate("room.unitMillimetres")}
        </span>
      </div>
      {reasonKeys.map((messageKey, index) => (
        <p
          key={messageKey}
          id={reasonIds[index]}
          className={styles.reason}
          data-testid={`room-length-reason-${field}`}
        >
          {translate(messageKey)}
        </p>
      ))}
    </div>
  );
}

/** Never mutated: `withField` and `withoutField` return new sets. */
const NO_FIELDS_LEFT: ReadonlySet<RoomLengthField> = new Set();

interface UnreadableOnLeave {
  readonly isShown: (field: RoomLengthField) => boolean;
  /** The customer left the field: its unreadable text is explained, and readable text forgets it. */
  readonly noteLeave: (field: RoomLengthField) => void;
  /** A keystroke keeps the explanation only while it is showing, so a field fixed and then made
   *  unreadable again stays silent until it is left again. */
  readonly forgetUnlessShown: (field: RoomLengthField) => void;
}

/**
 * Shown means left while unreadable and unreadable still: the second half is read from the issue
 * model on every render, so text that turns readable or empty hides the sentence at once.
 *
 * A field left by a press is explained only once the press is over: the browser moves focus before
 * the click, and a sentence inserted then shifts the controls below the field and the click lands
 * elsewhere. A field left from the keyboard is explained at once.
 */
function useUnreadableOnLeave(
  unreadableFields: readonly RoomLengthField[],
): UnreadableOnLeave {
  const [leftUnreadable, setLeftUnreadable] = useState(NO_FIELDS_LEFT);
  const whenPressEnds = useAfterPress();

  function isShown(field: RoomLengthField): boolean {
    return leftUnreadable.has(field) && unreadableFields.includes(field);
  }

  function explain(field: RoomLengthField): void {
    setLeftUnreadable((current) => withField(current, field));
  }

  return {
    isShown,
    noteLeave: (field) => {
      if (unreadableFields.includes(field)) {
        whenPressEnds(() => {
          explain(field);
        });
        return;
      }
      setLeftUnreadable((current) => withoutField(current, field));
    },
    forgetUnlessShown: (field) => {
      if (isShown(field)) return;
      setLeftUnreadable((current) => withoutField(current, field));
    },
  };
}

function withField(
  fields: ReadonlySet<RoomLengthField>,
  field: RoomLengthField,
): ReadonlySet<RoomLengthField> {
  return fields.has(field) ? fields : new Set([...fields, field]);
}

function withoutField(
  fields: ReadonlySet<RoomLengthField>,
  field: RoomLengthField,
): ReadonlySet<RoomLengthField> {
  if (!fields.has(field)) return fields;
  return new Set([...fields].filter((member) => member !== field));
}

function reasonKeysFor(
  field: RoomLengthField,
  fieldReasons: readonly RoomFieldReason[],
): readonly RoomIssueMessageKey[] {
  return fieldReasons
    .filter((reason) => reason.field === field)
    .map((reason) => reason.messageKey);
}

function isWallLengthField(field: RoomLengthField): field is WallLengthField {
  return (WALL_LENGTH_FIELDS as readonly RoomLengthField[]).includes(field);
}

/** The throw is for a wall the shape does not have, never a customer's state. */
function explanationKeyFor(wall: WallLengthField, shape: RoomShape) {
  const explanation = WALL_LENGTH_HELP[wall].explanation;
  if (turnsACorner(shape)) return explanation.cornerRoom;
  if ("straightRoom" in explanation) return explanation.straightRoom;
  throw new Error(
    `No explanation for ${wall} in a ${shape} room: that shape has no such wall.`,
  );
}

/** The corner, drawn pointing the way its chip chooses. `aria-hidden`: the chip's name says which way. */
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
