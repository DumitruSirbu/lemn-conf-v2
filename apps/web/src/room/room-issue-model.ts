// Wave 7F2: what sub-state 1C tells the customer, as data. **Presentation, and pure** — no React, no
// DOM, no clock. It judges nothing: the domain's `validateRoomInput` (through `parseRoomUrlState`) and
// `isShapeBuildable` are the only authorities on whether a room is allowed (ADR 0108 decision 1), and
// this module only decides *where* each of their answers is shown and *which leaf* says it.
//
// It keys on the domain's **codes and fields**, never on a bound or a string (ADR 0121 decision 2):
// no `minMm`, `maxMm` or `minimumKitchen` is read here, so no number can reach a sentence (ADR 0108
// decision 3, ADR 0120 decision 3).
import {
  isShapeBuildable,
  validateRoomInput,
  type RoomField,
  type RoomIssue,
  type RoomIssueCode,
  type RoomPolicy,
} from "@lemnaria/configurator-domain";

import { parseMillimetres } from "./parse-millimetres";
import type { PlanWallId } from "./plan-preview-model";
import type { RoomDraft, RoomLengthField } from "./room-draft";
import { requiredFieldsFor, type RoomUrlState } from "./room-url-state";

/**
 * **The two codes 1C can never carry.** `parseRoomUrlState` sends a field that does not read as whole
 * millimetres to 1B as a marked field, so `validateRoomInput` only ever sees whole positive
 * millimetres there. Excluded by name, so the table below stays total over what *can* arrive — and a
 * test asserts the reachability, so the exclusion goes red the day one of them becomes reachable.
 */
type RoomIssueCodeUnreachableAtOneC =
  | "VALUE_MISSING"
  | "VALUE_NOT_WHOLE_MILLIMETRES";

export type ReachableRoomIssueCode = Exclude<
  RoomIssueCode,
  RoomIssueCodeUnreachableAtOneC
>;

/**
 * **The one table from code to leaf, and the compile guard wave 7J inherits.** `satisfies` makes it
 * total: a code the domain adds stops this module compiling until its sentence exists, and a code
 * the domain removes is an excess property. Keys are spelled in full so next-intl's generated
 * declaration checks each one.
 */
export const ROOM_ISSUE_MESSAGE_KEYS = {
  SHAPE_NOT_BUILDABLE: "room.issue.shapeNotBuildable",
  ROOM_TOO_SMALL_FOR_KITCHEN: "room.issue.roomTooSmall",
  WALL_TOO_SHORT: "room.issue.wallTooShort",
  WALL_TOO_LONG: "room.issue.wallTooLong",
  HEIGHT_TOO_LOW: "room.issue.heightTooLow",
  HEIGHT_TOO_HIGH: "room.issue.heightTooHigh",
} as const satisfies Record<ReachableRoomIssueCode, string>;

export type RoomIssueMessageKey =
  (typeof ROOM_ISSUE_MESSAGE_KEYS)[ReachableRoomIssueCode];

/** Frame 1C's plan label (*"B prea scurt"*). Only a wall's own length codes can mark a wall. */
const PLAN_WALL_ISSUE_LABEL_KEYS = {
  WALL_TOO_SHORT: "room.planWallIssue.tooShort",
  WALL_TOO_LONG: "room.planWallIssue.tooLong",
} as const;

type WallLengthIssueCode = keyof typeof PLAN_WALL_ISSUE_LABEL_KEYS;

export type PlanWallIssueLabelKey =
  (typeof PLAN_WALL_ISSUE_LABEL_KEYS)[WallLengthIssueCode];

/** The refusal beside the shape choice at 1A, 1B and 1C — the same leaf the domain's code names. */
export const SHAPE_REFUSAL_MESSAGE_KEY =
  ROOM_ISSUE_MESSAGE_KEYS.SHAPE_NOT_BUILDABLE;

/** Frame 1C's note, as written. Shown at 1C and nowhere else. */
export const ONE_C_NOTE_MESSAGE_KEY = "room.presetsAfterValid";

/** Frame 1C's own clause, kept for the day wave 7J makes a straight kitchen true (section 8). */
export const LINEAR_SUGGESTION_MESSAGE_KEY = "room.issue.orChooseLinear";

/** Text in a field that does not read as whole millimetres (Q-7F2-4, ADR 0126). Shown once the field
 *  loses focus. */
export const UNREADABLE_LENGTH_MESSAGE_KEY = "room.issue.unreadable";

/** The plan's wall for each wall field — the structural dependency the red wall follows. */
const PLAN_WALL_OF_FIELD: Readonly<
  Record<Exclude<RoomLengthField, "height">, PlanWallId>
> = { wallA: "A", wallB: "B", wallC: "C" };

export interface RoomIssueInput {
  readonly draft: RoomDraft;
  /** `parseRoomUrlState` of **this draft's** canonical query — the question `roomInDraft` asks — never
   *  the address bar's, which trails the draft by the settle interval (7F2 addition 1). */
  readonly draftState: RoomUrlState;
  readonly policy: RoomPolicy;
}

export interface RoomFieldReason {
  readonly field: RoomLengthField;
  readonly messageKey: RoomIssueMessageKey;
}

export interface MarkedPlanWall {
  readonly wall: PlanWallId;
  readonly labelKey: PlanWallIssueLabelKey;
}

export interface RoomIssueView {
  /** One per issue on a length field at 1C, in the domain's field order. Never truncated to the first. */
  readonly fieldReasons: readonly RoomFieldReason[];
  /** Issues the domain states about the room rather than a field (minimum not met). */
  readonly roomReasons: readonly RoomIssueMessageKey[];
  /** The chosen shape is one the policy does not build — independent of every field. */
  readonly isShapeRefused: boolean;
  readonly markedWalls: readonly MarkedPlanWall[];
  /** Required fields holding text that is not a length; an empty field is not among them. */
  readonly unreadableFields: readonly RoomLengthField[];
  readonly isNoteShown: boolean;
  readonly isLinearSuggested: boolean;
}

/** Sub-state 1C's surface for the room being typed. */
export function deriveRoomIssueView(input: RoomIssueInput): RoomIssueView {
  const issues = oneCIssuesOf(input.draftState);
  const fieldReasons = issues.flatMap(fieldReasonOf);
  const roomReasons = issues.flatMap(roomReasonOf);
  return {
    fieldReasons,
    roomReasons,
    isShapeRefused: !isShapeBuildable(input.draft.shape, input.policy),
    markedWalls: issues.flatMap(markedWallOf),
    unreadableFields: unreadableFieldsOf(input.draft),
    isNoteShown: input.draftState.substate === "1C",
    isLinearSuggested:
      fieldReasons.length + roomReasons.length > 0 &&
      validatesAsStraightRoom(input),
  };
}

function oneCIssuesOf(state: RoomUrlState): readonly RoomIssue[] {
  return state.substate === "1C" ? state.issues : [];
}

function fieldReasonOf(issue: RoomIssue): readonly RoomFieldReason[] {
  if (!isLengthField(issue.field)) return [];
  return [{ field: issue.field, messageKey: messageKeyOf(issue) }];
}

/** A `shape` issue is the room's, except the shape refusal, which `isShapeRefused` carries from the
 *  policy so it shows at 1A and 1B too rather than only once every field is typed. */
function roomReasonOf(issue: RoomIssue): readonly RoomIssueMessageKey[] {
  if (isLengthField(issue.field)) return [];
  if (issue.code === "SHAPE_NOT_BUILDABLE") return [];
  return [messageKeyOf(issue)];
}

function markedWallOf(issue: RoomIssue): readonly MarkedPlanWall[] {
  if (!isWallField(issue.field)) return [];
  return [
    {
      wall: PLAN_WALL_OF_FIELD[issue.field],
      labelKey: planWallLabelKeyOf(issue),
    },
  ];
}

function messageKeyOf(issue: RoomIssue): RoomIssueMessageKey {
  if (!isReachableAtOneC(issue.code)) {
    throw new Error(
      `Room issue ${issue.code} on ${issue.field} reached sub-state 1C, which the URL parser rules out`,
    );
  }
  return ROOM_ISSUE_MESSAGE_KEYS[issue.code];
}

function planWallLabelKeyOf(issue: RoomIssue): PlanWallIssueLabelKey {
  if (!isWallLengthCode(issue.code)) {
    throw new Error(
      `Room issue ${issue.code} on ${issue.field} marks a wall with no plan label for it`,
    );
  }
  return PLAN_WALL_ISSUE_LABEL_KEYS[issue.code];
}

/** Asked of the field's own parser, never the URL's: since ADR 0126 a field reads whole millimetres,
 *  so *"3,6"* is unreadable here even though the metre wire would read it. */
function unreadableFieldsOf(draft: RoomDraft): readonly RoomLengthField[] {
  return requiredFieldsFor(draft.shape).filter((field) => {
    const parsed = parseMillimetres(draft.lengths[field].text);
    return !parsed.ok && parsed.reason !== "empty";
  });
}

/** Section 8's gate, asked of the domain and never of a bound: the same entry, as a straight room on
 *  wall A. Never true under the approved policy; wave 7J owes the positive arm. */
function validatesAsStraightRoom({ draft, policy }: RoomIssueInput): boolean {
  const straightRoom = {
    shape: "linear",
    wallAMm: draft.lengths.wallA.millimetres,
    heightMm: draft.lengths.height.millimetres,
  } as const;
  return validateRoomInput(straightRoom, policy).ok;
}

function isLengthField(field: RoomField): field is RoomLengthField {
  return field !== "shape";
}

function isWallField(
  field: RoomField,
): field is Exclude<RoomLengthField, "height"> {
  return Object.hasOwn(PLAN_WALL_OF_FIELD, field);
}

function isReachableAtOneC(
  code: RoomIssueCode,
): code is ReachableRoomIssueCode {
  return Object.hasOwn(ROOM_ISSUE_MESSAGE_KEYS, code);
}

function isWallLengthCode(code: RoomIssueCode): code is WallLengthIssueCode {
  return Object.hasOwn(PLAN_WALL_ISSUE_LABEL_KEYS, code);
}
