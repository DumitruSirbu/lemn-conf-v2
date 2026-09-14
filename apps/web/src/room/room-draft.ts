// The room a customer is typing, as a value: what stands in each length field, what that text reads
// as in whole millimetres, and which way the corner turns. **Presentation state, not domain** — a
// draft judges nothing. `validateRoomInput` is the only thing that says whether a room is allowed
// (ADR 0108 decision 1), and a draft that answered the same question would be a second authority on
// it.
//
// Millimetres inward: text enters through `parse-metres.ts` and leaves through `metres-text.ts`, the
// one place either conversion is written (ADR 0108 decision 4). A field's `millimetres` is always
// derived from its own `text`, so the two cannot drift apart into a room the customer never entered.
import type { CornerDirection, RoomShape } from "@lemnaria/configurator-domain";

import { formatMetresForDisplay } from "./metres-text";
import { parseMetresToMillimetres } from "./parse-metres";
import { requiredFieldsFor } from "./room-url-state";

/** The length fields a room can be entered with, taken from the URL parser's own list rather than
 *  restated, so a wall added to a shape there cannot leave a field behind here (criterion 4). */
export type RoomLengthField = ReturnType<typeof requiredFieldsFor>[number];

export interface RoomDraftLength {
  /** Exactly what the field shows, including a half-typed value. */
  readonly text: string;
  /** Whole millimetres, or `undefined` while the text is empty or not yet a readable length. An
   *  unreadable field is 1B's ordinary state on the way to a value, not an error (criterion 10). */
  readonly millimetres: number | undefined;
}

export interface RoomDraft {
  readonly shape: RoomShape;
  /** Every field, whatever the shape requires: a customer who changes their mind about the shape
   *  keeps what they already typed. `requiredFieldsFor` decides which of them are asked for. */
  readonly lengths: Readonly<Record<RoomLengthField, RoomDraftLength>>;
  /** Carried by every draft and shown only by the shapes that turn a corner. A URL that omits
   *  `direction` shows **left** — frame 1B draws it pre-selected — which is ruling R6's draft
   *  layer and changes neither the parser nor a stored room's reading. */
  readonly cornerDirection: CornerDirection;
}

/** What the customer just typed into one field, verbatim. */
export interface EnteredLength {
  readonly field: RoomLengthField;
  readonly text: string;
}

/** A length arriving from somewhere that already counts millimetres: the query string, or a room a
 *  design stored. The locale decides the separator the field shows it with. */
export interface StoredLength {
  readonly field: RoomLengthField;
  readonly millimetres: number;
  readonly locale: string;
}

const EMPTY_LENGTH: RoomDraftLength = { text: "", millimetres: undefined };

/** Frame 1B draws *La stanga* pre-selected, and ruling R6 keeps that the draft's starting position
 *  whether or not the URL says so. */
const INITIAL_CORNER_DIRECTION: CornerDirection = "left";

export function createRoomDraft(shape: RoomShape): RoomDraft {
  return {
    shape,
    lengths: {
      wallA: EMPTY_LENGTH,
      wallB: EMPTY_LENGTH,
      wallC: EMPTY_LENGTH,
      height: EMPTY_LENGTH,
    },
    cornerDirection: INITIAL_CORNER_DIRECTION,
  };
}

/** A different card chosen at 1A. Every typed length stays where it is: the shape decides which
 *  fields are asked for, never what the customer has already said about a wall. */
export function withRoomShape(draft: RoomDraft, shape: RoomShape): RoomDraft {
  return { ...draft, shape };
}

export function withCornerDirection(
  draft: RoomDraft,
  cornerDirection: CornerDirection,
): RoomDraft {
  return { ...draft, cornerDirection };
}

/** A keystroke. The text is kept exactly as typed, so a value on its way to being readable —
 *  *"3,"* — neither disappears nor is corrected under the caret. */
export function withEnteredText(
  draft: RoomDraft,
  entered: EnteredLength,
): RoomDraft {
  return withLengthText(draft, entered.field, entered.text);
}

/** A length that already exists lands in its field in the customer's own notation. It is written as
 *  text and read back, rather than carried across as a number, so the field and the millimetres it
 *  reports can never disagree. */
export function withStoredLength(
  draft: RoomDraft,
  stored: StoredLength,
): RoomDraft {
  return withLengthText(
    draft,
    stored.field,
    formatMetresForDisplay(stored.millimetres, stored.locale),
  );
}

/** The fields this shape asks for that do not yet read as a length. At 1B these are the fields still
 *  to be filled, which is not the same claim as a field being wrong (criterion 10). */
export function missingLengthFields(
  draft: RoomDraft,
): readonly RoomLengthField[] {
  return requiredFieldsFor(draft.shape).filter(
    (field) => draft.lengths[field].millimetres === undefined,
  );
}

/** Whether a shape turns a corner, and so whether it carries the toggle at all (criterion 6). Stated
 *  once here so no component spells a shape's name to decide it. */
export function carriesCornerDirection(shape: RoomShape): boolean {
  return shape !== "linear";
}

function withLengthText(
  draft: RoomDraft,
  field: RoomLengthField,
  text: string,
): RoomDraft {
  return {
    ...draft,
    lengths: {
      ...draft.lengths,
      [field]: { text, millimetres: millimetresIn(text) },
    },
  };
}

function millimetresIn(text: string): number | undefined {
  const parsed = parseMetresToMillimetres(text);
  return parsed.ok ? parsed.mm : undefined;
}
