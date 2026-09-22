// Wave 7F2: **what of sub-state 1C is on screen, and whether *Continuă* leads on, at this moment.**
// Presentation policy, and pure: no React, no DOM, no clock. The clock is `use-typing-pause.ts`'s;
// this module is told only whether a burst of typing is running and which draft it began from.
//
// Which fields a room refuses, and with which sentence, is `room-issue-model.ts`'s answer over the
// domain's; this module decides only **when** each answer shows (C-7F2-1, extended by the
// coordinator on 2026-09-21): all of it once typing has paused, and mid-burst only what was already
// showing and still holds.
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

/** Where the customer is in a burst of typing. Mid-burst it remembers the draft the burst began
 *  from — the last one the customer saw with every 1C surface settled on it — and the draft the
 *  burst's own edits last produced, which is how an arrival is told apart from typing. */
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
 *  its own clock: once the customer leaves the field (Q-7F2-4). */
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
  const stateBeforeTyping = draftStateOf(inputs.typing.draftBeforeTyping);
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
 * **What of 1C stays on screen mid-burst:** what was showing when the burst began **and** still holds,
 * **sentence for sentence** (review finding R1.1). A field or wall whose reason changes — too long to
 * too short as *"6500"* is backspaced to *"650"* — is a new problem and waits for the pause, exactly as
 * a newly refused field does. So a reason appears on the clock, a reason the keystroke fixes goes at
 * once, and an ordinary keystroke on the way to a valid number paints nothing.
 *
 * **The shape refusal is not held** (slice S4): it answers the chip, never a keystroke, so it follows
 * the draft's shape at once — a chip chosen mid-burst is refused or cleared the moment it is chosen.
 * The linear suggestion is appended to a reason, so it shows only while a held reason does (review
 * R1.1): a burst that turns wall B from too short to too long holds neither sentence, nor the clause.
 *
 * **Unreadable fields are not held either** (slice S5b): they are passed as they are now, because the
 * pause is not their clock — the form explains one only once it is left, and drops the sentence on the
 * keystroke that makes the text readable or empty.
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

/** *Continuă* leads on once the shape can be built and every field the shape asks for reads as a
 *  length. Neither half is a bound: whether the lengths are **allowed** is `validateRoomInput`'s
 *  question, its reasons are wave 7F2's surface, and nothing here duplicates either. */
export function canContinueFrom(draft: RoomDraft, policy: RoomPolicy): boolean {
  return (
    isShapeBuildable(draft.shape, policy) &&
    missingLengthFields(draft).length === 0
  );
}

/**
 * **The room a composition runs for: the draft's, read through the parser the URL is read with**
 * (`draftStateOf`). A room reaches sub-state 1D here exactly when it would reach it from a URL, with
 * no second reading of what a valid room is.
 *
 * **Why the draft and not `useSearchParams`, which the screen branches on everywhere else.** The URL
 * trails the draft by the settle interval, so within 400 ms of a keystroke the query is a room the
 * customer has already moved past — or, at 1B, no room at all — while `departTo` is at that moment
 * flushing the draft to the address bar. This is the query the URL is about to hold.
 *
 * `undefined` for a room the domain refuses: sub-state 1C, where *Continuă* is inactive and the reasons
 * say why. A tap that still reaches the screen's handler over such a draft — mid-burst, on a button
 * held active — ends the pause and departs nowhere.
 */
export function roomInDraft(draftState: RoomUrlState): DesignRoom | undefined {
  return draftState.substate === "1D" ? draftState.room : undefined;
}

/** The draft's own canonical query, parsed: the room the URL is about to hold. */
export function draftStateOf(draft: RoomDraft): RoomUrlState {
  return parseRoomUrlState(
    queryEntriesOf(canonicalRoomQuery(draft).toString()),
  );
}

/**
 * ***Continuă* leads on exactly when the draft is a room the domain accepts** (7F2 criterion 5; ADR
 * 0120 decision 4). Its inactive state is on 1C's clock, so mid-burst the button **keeps** the answer
 * it had when the burst began: retyping a valid room's wall does not flicker it off on *"3"*, *"36"*.
 *
 * 7F1's `canContinueFrom` is asked first and never held: a field the shape needs going empty, or a
 * shape the screen's policy refuses, turns the button off at once. It is also what keeps a policy
 * handed to the screen authoritative, because the draft's parse judges against the approved one.
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
