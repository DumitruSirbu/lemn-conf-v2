import {
  APPROVED_ROOM_POLICY,
  carriesCornerDirection,
  cornerDirectionOf,
  validateRoomInput,
  wallsOf,
  type CornerDirection,
  type DesignRoom,
  type DesignWall,
  type RoomField,
  type RoomInput,
  type RoomIssue,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";

import { metresTextForUrl } from "./metres-text";
import { parseMetresToMillimetres } from "./parse-metres";

/** Next.js' page-level query shape. Arrays are repeated values and are never silently collapsed. */
export type RoomSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export type RoomUrlField = RoomField | "direction";

type ParsedLinearRoomInput = RoomInput & {
  readonly shape: "linear";
  readonly wallAMm: number;
  readonly heightMm: number;
};

type ParsedLRoomInput = RoomInput & {
  readonly shape: "L";
  readonly wallAMm: number;
  readonly wallBMm: number;
  readonly heightMm: number;
  readonly cornerDirection: CornerDirection;
};

type ParsedURoomInput = RoomInput & {
  readonly shape: "U";
  readonly wallAMm: number;
  readonly wallBMm: number;
  readonly wallCMm: number;
  readonly heightMm: number;
  /** A U has one hand (ADR 0132 decision 8): never read from the URL. `URoomInput` still names the field, and
   *  this is its one value. */
  readonly cornerDirection: typeof ONLY_HAND_OF_A_U;
};

export type ParsedRoomInput =
  | ParsedLinearRoomInput
  | ParsedLRoomInput
  | ParsedURoomInput;

export type RoomUrlState =
  | {
      readonly substate: "1A";
      readonly markedFields: readonly ["shape"];
    }
  | {
      readonly substate: "1B";
      readonly shape: RoomShape;
      readonly markedFields: readonly RoomUrlField[];
    }
  | {
      readonly substate: "1C";
      readonly input: ParsedRoomInput;
      readonly issues: readonly RoomIssue[];
      readonly markedFields: readonly RoomField[];
    }
  | {
      readonly substate: "1D";
      readonly input: ParsedRoomInput;
      readonly room: DesignRoom;
      readonly markedFields: readonly [];
    };

const ROOM_SHAPES = new Set<RoomShape>(["linear", "L", "U"]);
const CORNER_DIRECTIONS = new Set<CornerDirection>(["left", "right"]);

/** A U's one hand (ADR 0132 decision 8): the value `URoomInput` is given, never read from the URL. */
const ONLY_HAND_OF_A_U = "left" as const satisfies CornerDirection;

/** Whether a shape turns a corner yet has no direction to choose: a U shows no toggle and carries no `direction`
 *  (ADR 0132 decision 8). Derived from the domain's `wallsOf` and `carriesCornerDirection`, never spelled; a
 *  straight room is not one-handed, it has nothing to be handed. */
export function hasOneHand(shape: RoomShape): boolean {
  return turnsACorner(shape) && !carriesCornerDirection(shape);
}

/** Re-exported so the screens read whether a shape carries the toggle and a `direction` from here. */
export { carriesCornerDirection };

/** Whether a shape has more than the one wall a straight room has — read from the domain's own
 *  answer (`wallsOf`), so a wall count is never restated as a shape's name. */
export function turnsACorner(shape: RoomShape): boolean {
  return wallsOf(shape).length > 1;
}

/** Resolves the URL into the earliest room sub-state that can truthfully represent it. Judged against `policy`:
 *  the approved one, except in a test that states a shape it does not build yet (ADR 0116). */
export function parseRoomUrlState(
  searchParams: RoomSearchParams,
  policy: RoomPolicy = APPROVED_ROOM_POLICY,
): RoomUrlState {
  const shapeValue = singleValue(searchParams.shape);
  if (!isRoomShape(shapeValue)) return invalidShape();

  const fields = requiredFieldsFor(shapeValue);
  const parsedLengths = Object.fromEntries(
    fields.map((field) => [field, parseLength(searchParams[field])]),
  ) as Record<(typeof fields)[number], number | undefined>;
  const markedFields: RoomUrlField[] = fields.filter(
    (field) => parsedLengths[field] === undefined,
  );

  const direction = directionFor(shapeValue, searchParams.direction);
  if (carriesCornerDirection(shapeValue) && direction === undefined) {
    markedFields.push("direction");
  }
  if (markedFields.length > 0) {
    return { substate: "1B", shape: shapeValue, markedFields };
  }

  const input = constructParsedInput(shapeValue, parsedLengths, direction);
  const validation = validateRoomInput(input, policy);
  if (!validation.ok) {
    return {
      substate: "1C",
      input,
      issues: validation.issues,
      markedFields: validation.issues.map((issue) => issue.field),
    };
  }
  return {
    substate: "1D",
    input,
    room: validation.room,
    markedFields: [],
  };
}

/** Emits only the canonical room keys used by the input's shape, in `requiredFieldsFor`'s order, so
 *  the query cannot name a wall the shape does not have. */
export function serialiseRoomInput(input: ParsedRoomInput): URLSearchParams {
  const lengths = lengthsOfParsedInput(input);
  const params = new URLSearchParams();
  params.set("shape", input.shape);
  for (const field of requiredFieldsFor(input.shape)) {
    params.set(field, metresTextForUrl(requireParsed(lengths[field])));
  }
  if (carriesCornerDirection(input.shape)) {
    params.set("direction", requireDirection(directionOfParsedInput(input)));
  }
  return params;
}

function lengthsOfParsedInput(
  input: ParsedRoomInput,
): Readonly<Record<LengthField, number | undefined>> {
  return {
    wallA: input.wallAMm,
    wallB: "wallBMm" in input ? input.wallBMm : undefined,
    wallC: "wallCMm" in input ? input.wallCMm : undefined,
    height: input.heightMm,
  };
}

function directionOfParsedInput(
  input: ParsedRoomInput,
): CornerDirection | undefined {
  return "cornerDirection" in input ? input.cornerDirection : undefined;
}

/**
 * Reopens Step 1 from a stored room without document or presentation state in the URL. The direction is
 * `cornerDirectionOf(room)`, which maps an absent key to left (ADR 0129 D9); a U's URL carries none.
 */
export function roomHrefFromDesignRoom(room: DesignRoom): string {
  const lengths = Object.fromEntries(
    parsedRoomLengthsOf(room).map((length) => [
      length.field,
      length.millimetres,
    ]),
  );
  const input = constructParsedInput(
    room.shape,
    lengths,
    cornerDirectionOf(room),
  );

  return `/configurator/room?${serialiseRoomInput(input).toString()}`;
}

/** A length read off a stored `DesignRoom`, in the shape both `roomHrefFromDesignRoom`'s URL and
 *  `generation-steps.tsx`'s live 1F draft build a room draft's fields from. */
export interface DesignRoomLength {
  readonly field: "wallA" | "wallB" | "wallC" | "height";
  readonly millimetres: number;
}

/**
 * The one `DesignRoom` to wall/height mapping, shared with `generation-steps.tsx`'s `roomDraftFor`. `widthMm` is
 * wall A; `depthMm` is wall B only for a room that turns a corner (a straight room's `depthMm` is the drawn floor's
 * depth, not a typed wall; ADR 0130 decision 2). A `Record` over `DesignRoom["shape"]`, so a new shape is a compile
 * error here. The U arm maps `wallCMm` to `"wallC"`, as `room.wallLabel.wallC` and the URL do.
 */
const DESIGN_ROOM_LENGTHS = {
  linear: (room) => [
    { field: "wallA", millimetres: room.widthMm },
    { field: "height", millimetres: room.heightMm },
  ],
  L: (room) => [
    { field: "wallA", millimetres: room.widthMm },
    { field: "wallB", millimetres: room.depthMm },
    { field: "height", millimetres: room.heightMm },
  ],
  U: (room) => [
    { field: "wallA", millimetres: room.widthMm },
    { field: "wallB", millimetres: room.depthMm },
    { field: "wallC", millimetres: requireWallCMm(room) },
    { field: "height", millimetres: room.heightMm },
  ],
} as const satisfies Readonly<
  Record<DesignRoom["shape"], (room: DesignRoom) => readonly DesignRoomLength[]>
>;

/** `DesignRoom.wallCMm` is optional in the wire type though the schema requires it on a `"U"` (ADR 0132 decision
 *  6): a well-formed U room is asserted here rather than trusted. */
function requireWallCMm(room: DesignRoom): number {
  if (room.wallCMm === undefined) {
    throw new Error("a U room's own mapping carries no wallCMm");
  }
  return room.wallCMm;
}

export function parsedRoomLengthsOf(
  room: DesignRoom,
): readonly DesignRoomLength[] {
  return DESIGN_ROOM_LENGTHS[room.shape](room);
}

function invalidShape(): RoomUrlState {
  return { substate: "1A", markedFields: ["shape"] };
}

/** A repeated key is not a value. Exported rather than copied: the form reads the query by the same
 *  rule the parser does, so the two cannot disagree about what `?wallA=3.6&wallA=4.2` means. */
export function singleValue(
  value: RoomSearchParams[string],
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRoomShape(value: string | undefined): value is RoomShape {
  return value !== undefined && ROOM_SHAPES.has(value as RoomShape);
}

/** Exported rather than copied, for the same reason as `singleValue`: a third corner direction is
 *  added to `CORNER_DIRECTIONS` alone, and the form accepts it the moment the parser does. */
export function isCornerDirection(
  value: string | undefined,
): value is CornerDirection {
  return value !== undefined && CORNER_DIRECTIONS.has(value as CornerDirection);
}

type LengthField = "wallA" | "wallB" | "wallC" | "height";

/** The field a wall's length is entered in; a `Record` over the domain's walls, so a new wall is a compile error
 *  here. `fieldOfWall` is exported for the plan preview. */
const FIELD_OF_WALL = {
  A: "wallA",
  B: "wallB",
  C: "wallC",
} as const satisfies Readonly<Record<DesignWall, LengthField>>;

export function fieldOfWall(wall: DesignWall): Exclude<LengthField, "height"> {
  return FIELD_OF_WALL[wall];
}

/** The length fields a shape is entered with, in the order the URL and the form both read them: one per wall
 *  `wallsOf` says the shape has, then the height. Exported so query, form and plan agree what a shape is made of. */
export function requiredFieldsFor(shape: RoomShape): readonly LengthField[] {
  return [...wallsOf(shape).map(fieldOfWall), "height"];
}

function parseLength(value: RoomSearchParams[string]): number | undefined {
  const single = singleValue(value);
  if (single === undefined) return undefined;
  const parsed = parseMetresToMillimetres(single);
  return parsed.ok ? parsed.mm : undefined;
}

function directionFor(
  shape: RoomShape,
  value: RoomSearchParams[string],
): CornerDirection | undefined {
  if (!carriesCornerDirection(shape)) return undefined;
  const single = singleValue(value);
  return isCornerDirection(single) ? single : undefined;
}

function constructParsedInput(
  shape: RoomShape,
  lengths: Readonly<Record<string, number | undefined>>,
  direction: CornerDirection | undefined,
): ParsedRoomInput {
  if (shape === "linear") {
    return {
      shape,
      wallAMm: requireParsed(lengths.wallA),
      heightMm: requireParsed(lengths.height),
    };
  }
  if (shape === "L") {
    return {
      shape,
      wallAMm: requireParsed(lengths.wallA),
      wallBMm: requireParsed(lengths.wallB),
      heightMm: requireParsed(lengths.height),
      cornerDirection: requireDirection(direction),
    };
  }
  return {
    shape,
    wallAMm: requireParsed(lengths.wallA),
    wallBMm: requireParsed(lengths.wallB),
    wallCMm: requireParsed(lengths.wallC),
    heightMm: requireParsed(lengths.height),
    cornerDirection: ONLY_HAND_OF_A_U,
  };
}

function requireParsed(value: number | undefined): number {
  if (value === undefined) {
    throw new Error(
      "Room URL state constructed before every length was parsed",
    );
  }
  return value;
}

function requireDirection(
  direction: CornerDirection | undefined,
): CornerDirection {
  if (direction === undefined) {
    throw new Error("Room URL state constructed before direction was parsed");
  }
  return direction;
}
