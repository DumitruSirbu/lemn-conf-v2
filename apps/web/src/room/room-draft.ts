// The room a customer is typing, as a value: each field's text, what it reads as in whole
// millimetres, and which way the corner turns. Presentation state, not domain: a draft judges
// nothing, and `validateRoomInput` alone says whether a room is allowed (ADR 0108 decision 1).
//
// A field's text is whole millimetres, digits only, and enters through `parse-millimetres.ts`, the
// one place that reading is written (ADR 0108 decision 4, notation per ADR 0126). `millimetres` is
// always derived from its own `text`, so the two cannot drift apart. The URL's metres are
// `room-query-sync.ts`'s concern.
import type { CornerDirection, RoomShape } from "@lemnaria/configurator-domain";

import { parseMillimetres } from "./parse-millimetres";
import { requiredFieldsFor } from "./room-url-state";

/** From the URL parser's own list, so a wall added to a shape there cannot leave a field behind here. */
export type RoomLengthField = ReturnType<typeof requiredFieldsFor>[number];

export interface RoomDraftLength {
  /** Exactly what the field shows, including a half-typed value. */
  readonly text: string;
  /** Whole millimetres, or `undefined` while the text is empty or not yet a readable length. An
   *  unreadable field stays at 1B and is not painted as an error; its message is shown on blur. */
  readonly millimetres: number | undefined;
}

export interface RoomDraft {
  readonly shape: RoomShape;
  /** Every field, whatever the shape requires, so changing the shape keeps what was typed.
   *  `requiredFieldsFor` decides which are asked for. */
  readonly lengths: Readonly<Record<RoomLengthField, RoomDraftLength>>;
  /** Carried by every draft, shown only by shapes that turn a corner. A URL that omits `direction`
   *  shows left, pre-selected; this changes neither the parser nor a stored room's reading. */
  readonly cornerDirection: CornerDirection;
}

/** What the customer just typed into one field, verbatim. */
export interface EnteredLength {
  readonly field: RoomLengthField;
  readonly text: string;
}

/** A length arriving from somewhere that already counts millimetres: the query string, or a room a
 *  design stored. */
export interface StoredLength {
  readonly field: RoomLengthField;
  readonly millimetres: number;
}

const EMPTY_LENGTH: RoomDraftLength = { text: "", millimetres: undefined };

/** *La stânga* is pre-selected, whether or not the URL says so. */
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

/** A different card chosen. Every typed length stays: the shape decides which fields are asked for. */
export function withRoomShape(draft: RoomDraft, shape: RoomShape): RoomDraft {
  return { ...draft, shape };
}

export function withCornerDirection(
  draft: RoomDraft,
  cornerDirection: CornerDirection,
): RoomDraft {
  return { ...draft, cornerDirection };
}

/** A keystroke. The text is kept exactly as typed: *"3,6"* is neither stripped nor corrected under
 *  the caret (ADR 0126). */
export function withEnteredText(
  draft: RoomDraft,
  entered: EnteredLength,
): RoomDraft {
  return withLengthText(draft, entered.field, entered.text);
}

/** Written as text and read back, not carried across as a number, so the field and the millimetres
 *  it reports cannot disagree. */
export function withStoredLength(
  draft: RoomDraft,
  stored: StoredLength,
): RoomDraft {
  return withLengthText(draft, stored.field, String(stored.millimetres));
}

/** The fields this shape asks for that do not yet read as a length: still to be filled, not wrong. */
export function missingLengthFields(
  draft: RoomDraft,
): readonly RoomLengthField[] {
  return requiredFieldsFor(draft.shape).filter(
    (field) => draft.lengths[field].millimetres === undefined,
  );
}

/** `room-url-state.ts` says whether a shape carries the toggle, as the URL parser needs the same
 *  answer; re-exported so the screens keep reading it from the draft. */
export { carriesCornerDirection } from "./room-url-state";

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
  const parsed = parseMillimetres(text);
  return parsed.ok ? parsed.mm : undefined;
}
