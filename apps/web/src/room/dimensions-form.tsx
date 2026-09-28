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
// **Nothing is painted as an error at 1B while the customer is in a field.** A field that does not
// yet read as a length is a field still to be filled, not a wrong one (7F1 criterion 10): no
// `aria-invalid`, no message, no red. **Text the field refuses is explained once the customer leaves
// it** (Q-7F2-4 (a), ADR 0126): that one sentence, in the reason's slot and with its wiring. It goes
// on the keystroke that makes the text readable or empty, and a keystroke that leaves it unreadable
// keeps it — the rule `stillShowing` applies to every other reason mid-burst: what is showing and
// still holds stays, what is fixed goes at once, and what is new waits for its trigger, here the blur.
// **At 1C a field the room refuses carries its reason beside it** (wave 7F2, frame 1C `:224-231`):
// the reason is linked by `aria-describedby` after the hint and the help, and the input carries
// `aria-invalid`. The red is painted **from** that attribute (`room.module.css`), so nothing can be
// red that a screen reader is not told is invalid. Which fields, and which sentence, is the issue
// model's answer; the screen decides when it shows.
//
// **The wall fields say what number to type, twice** (wave 7A3, owner ruling Q-7A3-1). The number is
// the run the customer wants furnished, not the wall (ADR 0120 Amendments C1 and D1), and the labels
// stay the frame's *Perete A/B/C*. So one hint line above the fields says it to a customer who never
// taps anything — which is the criterion, and why a help control alone would not meet it — and a help
// control per wall carries the longer explanation on top. Neither states a bound (ADR 0108
// decision 3) and neither refuses anything: the refusal sentence is 7F2's.
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
import { requiredFieldsFor } from "./room-url-state";
import styles from "./room.module.css";
import { WallLengthHelp } from "./wall-length-help";

export interface DimensionsFormProps {
  readonly draft: RoomDraft;
  /** The reasons 1C shows beside their fields (`RoomIssueView.fieldReasons`). None until the screen
   *  passes them, which is 1B's state. */
  readonly fieldReasons?: readonly RoomFieldReason[];
  /** The fields holding text the field's parser refuses (`RoomIssueView.unreadableFields`). The form
   *  decides when each is explained: after the customer leaves it, never while they type. */
  readonly unreadableFields?: readonly RoomLengthField[];
  /** The linear suggestion's id while it shows (D9); appended after each offending field's own
   *  reason, so `aria-describedby` reads the reason then the suggestion. Undefined while it does
   *  not, and for a field carrying no reason of its own. */
  readonly suggestionId?: string | undefined;
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

const NO_FIELD_REASONS: readonly RoomFieldReason[] = [];
const NO_UNREADABLE_FIELDS: readonly RoomLengthField[] = [];

/** A field whose unreadable text is explained says that and nothing else. A 1C reason cannot stand
 *  beside it — unreadable text keeps the room at 1B — and this keeps the two apart by construction. */
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
      {/* Criterion 6: for a `linear` room the toggle is **absent** from the tree rather than hidden
          by CSS — there is no corner to point anywhere. Which shapes turn one is `room-draft.ts`'s
          single statement of it, so no component here spells a shape's letter. */}
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
  readonly fieldReasons: readonly RoomFieldReason[];
  readonly unreadableFields: readonly RoomLengthField[];
  readonly suggestionId: string | undefined;
  readonly onEnterLength: (field: RoomLengthField, text: string) => void;
}

/** One field per wall of the chosen shape, plus the height — and the list is the URL parser's own,
 *  so a U's third field costs nothing and is never a hand-written branch (criterion 4). */
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
  /** This field's reasons: its 1C reasons, or the unreadable text's once the field was left. Never
   *  both — a field holding unreadable text keeps the room at 1B, where no field carries a 1C reason. */
  readonly reasonKeys: readonly ReasonMessageKey[];
  /** The linear suggestion's id while shown; appended after this field's own reason when it carries
   *  one (D9). */
  readonly suggestionId: string | undefined;
  readonly onEnter: (field: RoomLengthField, text: string) => void;
  readonly onLeave: (field: RoomLengthField) => void;
}

type ReasonMessageKey =
  | RoomIssueMessageKey
  | typeof UNREADABLE_LENGTH_MESSAGE_KEY;

/** A wall's input is described by the hint and by its own help, so a screen reader announces both on
 *  focus without the customer opening anything. The help is referenced while hidden on purpose: a
 *  description is computed from hidden content, and that is what makes the explanation unconditional
 *  for a non-visual customer too. At 1C the reason is described last, after what the field asks for. */
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
  // D9: only an *offending* field — one that already carries a reason of its own — is described by
  // the suggestion too, and always after that reason, which is how frame 1C's sentence reads.
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

/** No field left while unreadable: the state every form starts in. Never mutated — `withField` and
 *  `withoutField` return new sets. */
const NO_FIELDS_LEFT: ReadonlySet<RoomLengthField> = new Set();

interface UnreadableOnLeave {
  readonly isShown: (field: RoomLengthField) => boolean;
  /** The customer left the field: its unreadable text is explained, and readable text forgets it. */
  readonly noteLeave: (field: RoomLengthField) => void;
  /** A keystroke keeps the explanation only while it is on screen, so a field fixed and then made
   *  unreadable again says nothing until it is left again. */
  readonly forgetUnlessShown: (field: RoomLengthField) => void;
}

/**
 * **When unreadable text is explained, per field** (Q-7F2-4 (a)). Shown means *left while unreadable,
 * and unreadable still*: the second half is read from the issue model on every render, so text that
 * turns readable or empty — by a keystroke or by a refill from the URL — hides the sentence on that
 * very render, without waiting for the customer to leave the field.
 *
 * **A deep link never arrives explained.** The URL's refill writes only whole millimetres, so no field
 * arrives holding unreadable text; and a field is explained only once it has been left, so one that
 * did would wait for its blur too.
 *
 * **A field left by a press is explained once the press is over** (QA finding S5b-1). A browser moves
 * focus on the press, before the click; a sentence inserted then pushes every control below the field
 * down under the finger, and the click lands elsewhere — wall B's help did not open. So the sentence
 * waits for the press's click. A field left from the keyboard is explained at once.
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
