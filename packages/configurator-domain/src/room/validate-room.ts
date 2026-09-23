// ADR 0108: the room a customer typed, judged against a policy the caller hands in. Pure and
// locale-free — it publishes a field and a code per issue and never a sentence (ADR 0095 decision 3)
// nor a limit (decision 3), and it reads no cabinet depth (ADR 0083 decision 2).
import type { DesignRoom } from "../design.js";
import type {
  LWallBounds,
  MillimetreBounds,
  RoomPolicy,
} from "./room-policy.js";

export type RoomShape = "linear" | "L" | "U";

/** Which way the corner turns. Carried and **never read** by validation (ADR 0108 decision 5): the
 *  frames say it *"nu se deduce din lățimi"*, and what it does to the kitchen is owner question Q6. */
export type CornerDirection = "left" | "right";

/** A length as the form hands it over: millimetres, or `undefined` when the field is empty. */
export type EnteredMillimetres = number | undefined;

export interface LinearRoomInput {
  readonly shape: "linear";
  readonly wallAMm: EnteredMillimetres;
  readonly heightMm: EnteredMillimetres;
}

export interface LRoomInput {
  readonly shape: "L";
  readonly wallAMm: EnteredMillimetres;
  readonly wallBMm: EnteredMillimetres;
  readonly heightMm: EnteredMillimetres;
  readonly cornerDirection: CornerDirection;
}

export interface URoomInput {
  readonly shape: "U";
  readonly wallAMm: EnteredMillimetres;
  readonly wallBMm: EnteredMillimetres;
  readonly wallCMm: EnteredMillimetres;
  readonly heightMm: EnteredMillimetres;
  readonly cornerDirection: CornerDirection;
}

export type RoomInput = LinearRoomInput | LRoomInput | URoomInput;

export type RoomField = "shape" | "wallA" | "wallB" | "wallC" | "height";

export type RoomIssueCode =
  | "SHAPE_NOT_BUILDABLE"
  | "ROOM_TOO_SMALL_FOR_KITCHEN"
  | "VALUE_MISSING"
  | "VALUE_NOT_WHOLE_MILLIMETRES"
  | "WALL_TOO_SHORT"
  | "WALL_TOO_LONG"
  | "HEIGHT_TOO_LOW"
  | "HEIGHT_TOO_HIGH";

/** A field and a code, and **nothing else — in particular no number** (ADR 0108 decision 3). A
 *  refusal that carried its limit would be one ICU argument away from printing an unapproved bound. */
export interface RoomIssue {
  readonly field: RoomField;
  readonly code: RoomIssueCode;
}

export type RoomValidation =
  | { readonly ok: true; readonly room: DesignRoom }
  | { readonly ok: false; readonly issues: readonly RoomIssue[] };

/** A shape the policy does not build is refused alone, whatever the dimensions say; otherwise every
 *  field is judged and every issue returned, in field order, so each field carries its own reason
 *  (ADR 0108 decision 2). */
export function validateRoomInput(
  input: RoomInput,
  policy: RoomPolicy,
): RoomValidation {
  const lWallBounds = policy.buildableShapes.L;
  if (input.shape !== "L" || lWallBounds === undefined) {
    return {
      ok: false,
      issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
    };
  }
  return validateLRoom(input, {
    walls: lWallBounds,
    height: policy.heightBounds,
  });
}

interface LRoomBounds {
  readonly walls: LWallBounds;
  readonly height: MillimetreBounds;
}

interface FieldRule {
  readonly field: RoomField;
  readonly bounds: MillimetreBounds;
  readonly tooSmall: RoomIssueCode;
  readonly tooLarge: RoomIssueCode;
}

type FieldJudgement =
  | { readonly ok: true; readonly valueMm: number }
  | { readonly ok: false; readonly issue: RoomIssue };

function validateLRoom(input: LRoomInput, bounds: LRoomBounds): RoomValidation {
  const wallA = judgeField(
    input.wallAMm,
    wallRule("wallA", bounds.walls.wallA),
  );
  const wallB = judgeField(
    input.wallBMm,
    wallRule("wallB", bounds.walls.wallB),
  );
  const height = judgeField(input.heightMm, heightRule(bounds.height));
  if (!wallA.ok || !wallB.ok || !height.ok) {
    return { ok: false, issues: [wallA, wallB, height].flatMap(issuesOf) };
  }
  if (
    bounds.walls.minimumKitchen.isRequired &&
    !holdsMinimumKitchen(wallA.valueMm, wallB.valueMm, bounds.walls)
  ) {
    return {
      ok: false,
      issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
    };
  }
  // ADR 0108 decision 8: `wallLengthMm`'s mapping, so the fit gate reads back the walls entered.
  // ADR 0129 D2/D3: the direction is carried onto the room, never read to judge it (the issues
  // above are computed with no reference to `input.cornerDirection`) — and written only for
  // "right", so a left-hand room stays the same four keys it was before this wave.
  return {
    ok: true,
    room: {
      shape: "L",
      widthMm: wallA.valueMm,
      depthMm: wallB.valueMm,
      heightMm: height.valueMm,
      ...(input.cornerDirection === "right"
        ? { cornerDirection: "right" as const }
        : {}),
    },
  };
}

/** ADR 0108 Amendments C–E. Wall B is the reading-order prefix: if the required bodies split,
 *  the sink stands on B and the hob on A. The policy owns every dimension used here. */
function holdsMinimumKitchen(
  wallAMm: number,
  wallBMm: number,
  policy: LWallBounds,
): boolean {
  const { sinkWidthMm, hobWidthMm, cornerReachMm } = policy.minimumKitchen;
  const freeA = wallAMm - cornerReachMm.wallA;
  const freeB = wallBMm - cornerReachMm.wallB;
  const bothWidthMm = sinkWidthMm + hobWidthMm;
  return (
    freeA >= bothWidthMm ||
    freeB >= bothWidthMm ||
    (freeB >= sinkWidthMm && freeA >= hobWidthMm)
  );
}

function wallRule(
  field: "wallA" | "wallB",
  bounds: MillimetreBounds,
): FieldRule {
  return {
    field,
    bounds,
    tooSmall: "WALL_TOO_SHORT",
    tooLarge: "WALL_TOO_LONG",
  };
}

function heightRule(bounds: MillimetreBounds): FieldRule {
  return {
    field: "height",
    bounds,
    tooSmall: "HEIGHT_TOO_LOW",
    tooLarge: "HEIGHT_TOO_HIGH",
  };
}

/** Refuses a non-integral value rather than rounding it (ADR 0108 decision 4): `NaN` and `±Infinity`
 *  are not whole millimetres either. */
function judgeField(
  valueMm: EnteredMillimetres,
  rule: FieldRule,
): FieldJudgement {
  if (valueMm === undefined) {
    return refuseField(rule.field, "VALUE_MISSING");
  }
  if (!Number.isInteger(valueMm)) {
    return refuseField(rule.field, "VALUE_NOT_WHOLE_MILLIMETRES");
  }
  if (valueMm < rule.bounds.minMm) {
    return refuseField(rule.field, rule.tooSmall);
  }
  if (valueMm > rule.bounds.maxMm) {
    return refuseField(rule.field, rule.tooLarge);
  }
  return { ok: true, valueMm };
}

function refuseField(field: RoomField, code: RoomIssueCode): FieldJudgement {
  return { ok: false, issue: { field, code } };
}

function issuesOf(judgement: FieldJudgement): readonly RoomIssue[] {
  return judgement.ok ? [] : [judgement.issue];
}
