// What of sub-state 1C is on screen, and whether *Continuă* leads on, at this moment. Presentation policy, pure:
// no React, DOM or clock (the clock is `use-typing-pause.ts`'s; this module is told whether a burst of typing is
// running and which draft it began from). Which fields a room refuses, and with which sentence, is
// `room-issue-model.ts`'s answer; this module decides only when each answer shows: all of it once typing has
// paused, and mid-burst only what was already showing and still holds.
import {
  isShapeBuildable,
  type DesignRoom,
  type RoomPolicy,
} from "@lemnaria/configurator-domain";

import {
  deriveRoomIssueView,
  type MarkedPlanWall,
  type RoomFieldReason,
  type RoomIssueView,
} from "./room-issue-model";
import { canonicalRoomQuery, queryEntriesOf } from "./room-query-sync";
import { missingLengthFields, type RoomDraft } from "./room-draft";
import { parseRoomUrlState, type RoomUrlState } from "./room-url-state";

/** Where the customer is in a burst of typing. Mid-burst it remembers the draft the burst began from (the last
 *  one seen with every 1C surface settled) and the draft the burst's own edits last produced, which tells an
 *  arrival from typing. */
export type TypingState =
  | { readonly isTyping: false }
  | {
      readonly isTyping: true;
      readonly draftBeforeTyping: RoomDraft;
      readonly draftInBurst: RoomDraft;
    };

export const NOT_TYPING: TypingState = { isTyping: false };

export interface OneCInputs {
  readonly draft: RoomDraft;
  /** `draftStateOf(draft)`, parsed once by the caller for the render. */
  readonly draftState: RoomUrlState;
  readonly policy: RoomPolicy;
  readonly typing: TypingState;
}

/** The part of 1C the form draws, and the fields holding unreadable text, which the form explains on
 *  its own clock: once the customer leaves the field. */
export type OneCSurfaces = Pick<
  RoomIssueView,
  | "fieldReasons"
  | "roomReasons"
  | "isShapeRefused"
  | "markedWalls"
  | "isNoteShown"
  | "isLinearSuggested"
  | "unreadableFields"
>;

export interface OneCPresentation {
  readonly surfaces: OneCSurfaces;
  readonly isContinueActive: boolean;
}

/** 1C for this render: its surfaces and *Continuă*. The draft the burst began from is parsed here, at
 *  most once, and only while a burst runs. */
export function presentOneC(inputs: OneCInputs): OneCPresentation {
  const now = deriveRoomIssueView(inputs);
  if (!inputs.typing.isTyping) {
    return {
      surfaces: now,
      isContinueActive: isContinueActiveAt(inputs, false),
    };
  }
  const stateBeforeTyping = draftStateOf(
    inputs.typing.draftBeforeTyping,
    inputs.policy,
  );
  return {
    surfaces: stillShowing(
      now,
      deriveRoomIssueView({
        draft: inputs.typing.draftBeforeTyping,
        draftState: stateBeforeTyping,
        policy: inputs.policy,
      }),
    ),
    isContinueActive: isContinueActiveAt(
      inputs,
      roomInDraft(stateBeforeTyping) !== undefined,
    ),
  };
}

/**
 * What of 1C stays on screen mid-burst: what was showing when the burst began and still holds, sentence for sentence.
 * A reason that changes (too long to too short as *"6500"* is backspaced to *"650"*) is a new problem and waits for
 * the pause, so a keystroke towards a valid number paints nothing and one that fixes a reason removes it at once.
 * Not held: the shape refusal (it answers the chip and follows the draft's shape at once) and unreadable fields (the
 * form explains one only once the field is left). The linear suggestion shows only while a held reason does.
 */
export function stillShowing(
  now: RoomIssueView,
  beforeTyping: RoomIssueView,
): OneCSurfaces {
  const reasonsBefore = new Set(beforeTyping.fieldReasons.map(fieldReasonKey));
  const marksBefore = new Set(beforeTyping.markedWalls.map(markKey));
  const fieldReasons = now.fieldReasons.filter((reason) =>
    reasonsBefore.has(fieldReasonKey(reason)),
  );
  const roomReasons = now.roomReasons.filter((messageKey) =>
    beforeTyping.roomReasons.includes(messageKey),
  );
  return {
    fieldReasons,
    roomReasons,
    markedWalls: now.markedWalls.filter((marked) =>
      marksBefore.has(markKey(marked)),
    ),
    isShapeRefused: now.isShapeRefused,
    unreadableFields: now.unreadableFields,
    isNoteShown: now.isNoteShown && beforeTyping.isNoteShown,
    isLinearSuggested:
      now.isLinearSuggested && fieldReasons.length + roomReasons.length > 0,
  };
}

/** *Continuă* leads on once the shape can be built and every field the shape asks for reads as a length.
 *  Whether the lengths are allowed is `validateRoomInput`'s question, shown as 1C's reasons; nothing here
 *  duplicates either. */
export function canContinueFrom(draft: RoomDraft, policy: RoomPolicy): boolean {
  return (
    isShapeBuildable(draft.shape, policy) &&
    missingLengthFields(draft).length === 0
  );
}

/**
 * The room a composition runs for: the draft's, read through the parser the URL is read with (`draftStateOf`), so a
 * room reaches sub-state 1D exactly when it would from a URL. Not `useSearchParams`: the URL trails the draft by the
 * settle interval, so within 400 ms of a keystroke it holds a room the customer has moved past while `departTo`
 * flushes the draft. `undefined` for a room the domain refuses (sub-state 1C): a tap over such a draft departs nowhere.
 */
export function roomInDraft(draftState: RoomUrlState): DesignRoom | undefined {
  return draftState.substate === "1D" ? draftState.room : undefined;
}

/** The draft's own canonical query, parsed: the room the URL is about to hold. Judged against the screen's own
 *  policy, the one its cards and *Continuă* are offered against; otherwise a shape it offers would never reach
 *  1D. */
export function draftStateOf(
  draft: RoomDraft,
  policy: RoomPolicy,
): RoomUrlState {
  return parseRoomUrlState(
    queryEntriesOf(canonicalRoomQuery(draft).toString()),
    policy,
  );
}

/**
 * *Continuă* leads on exactly when the draft is a room the domain accepts (ADR 0120 decision 4). Mid-burst it keeps
 * the answer it had when the burst began, so retyping a valid room's wall does not flicker it off on *"3"*, *"36"*.
 * `canContinueFrom` is asked first and never held: a field going empty or a shape the policy refuses turns it off
 * at once, which also keeps a policy handed to the screen authoritative.
 */
function isContinueActiveAt(
  { draft, draftState, policy, typing }: OneCInputs,
  wasActiveBeforeTyping: boolean,
): boolean {
  if (!canContinueFrom(draft, policy)) return false;
  if (roomInDraft(draftState) !== undefined) return true;
  return typing.isTyping && wasActiveBeforeTyping;
}

function fieldReasonKey({ field, messageKey }: RoomFieldReason): string {
  return `${field} ${messageKey}`;
}

function markKey({ wall, labelKey }: MarkedPlanWall): string {
  return `${wall} ${labelKey}`;
}
