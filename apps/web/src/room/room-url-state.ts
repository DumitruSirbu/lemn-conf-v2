import {
  APPROVED_ROOM_POLICY,
  validateRoomInput,
  type CornerDirection,
  type DesignRoom,
  type RoomField,
  type RoomInput,
  type RoomIssue,
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
  readonly cornerDirection: CornerDirection;
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
      readonly input: ParsedLRoomInput;
      readonly room: DesignRoom;
      readonly markedFields: readonly [];
    };

const ROOM_SHAPES = new Set<RoomShape>(["linear", "L", "U"]);
const CORNER_DIRECTIONS = new Set<CornerDirection>(["left", "right"]);

/** Resolves the URL into the earliest room sub-state that can truthfully represent it. */
export function parseRoomUrlState(
  searchParams: RoomSearchParams,
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
  if (shapeValue !== "linear" && direction === undefined) {
    markedFields.push("direction");
  }
  if (markedFields.length > 0) {
    return { substate: "1B", shape: shapeValue, markedFields };
  }

  const input = constructParsedInput(shapeValue, parsedLengths, direction);
  const validation = validateRoomInput(input, APPROVED_ROOM_POLICY);
  if (!validation.ok) {
    return {
      substate: "1C",
      input,
      issues: validation.issues,
      markedFields: validation.issues.map((issue) => issue.field),
    };
  }
  if (input.shape !== "L") {
    throw new Error(
      "Domain accepted a room shape without a DesignRoom mapping",
    );
  }
  return {
    substate: "1D",
    input,
    room: validation.room,
    markedFields: [],
  };
}

/** Emits only the canonical room keys used by the input's shape. */
export function serialiseRoomInput(input: ParsedRoomInput): URLSearchParams {
  const params = new URLSearchParams();
  params.set("shape", input.shape);
  params.set("wallA", metresTextForUrl(input.wallAMm));
  if (input.shape !== "linear") {
    params.set("wallB", metresTextForUrl(input.wallBMm));
  }
  if (input.shape === "U") {
    params.set("wallC", metresTextForUrl(input.wallCMm));
  }
  params.set("height", metresTextForUrl(input.heightMm));
  if (input.shape !== "linear") {
    params.set("direction", input.cornerDirection);
  }
  return params;
}

/**
 * Reopens Step 1 from a stored room without carrying document or presentation state in the URL.
 * A stored L room has no corner direction yet, so its effective direction is left; wave 7I owns
 * persisting and serialising a customer's right-turning choice.
 */
export function roomHrefFromDesignRoom(room: DesignRoom): string {
  const input: ParsedRoomInput =
    room.shape === "linear"
      ? {
          shape: "linear",
          wallAMm: room.widthMm,
          heightMm: room.heightMm,
        }
      : {
          shape: "L",
          wallAMm: room.widthMm,
          wallBMm: room.depthMm,
          heightMm: room.heightMm,
          cornerDirection: "left",
        };

  return `/configurator/room?${serialiseRoomInput(input).toString()}`;
}

function invalidShape(): RoomUrlState {
  return { substate: "1A", markedFields: ["shape"] };
}

function singleValue(value: RoomSearchParams[string]): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRoomShape(value: string | undefined): value is RoomShape {
  return value !== undefined && ROOM_SHAPES.has(value as RoomShape);
}

function isCornerDirection(
  value: string | undefined,
): value is CornerDirection {
  return value !== undefined && CORNER_DIRECTIONS.has(value as CornerDirection);
}

/** The length fields a shape is entered with, in the order the URL and the form both read them.
 *  Exported rather than copied: a wall added to a shape here grows the query and the form together,
 *  so the two cannot disagree about what a shape is made of. */
export function requiredFieldsFor(
  shape: RoomShape,
): readonly ("wallA" | "wallB" | "wallC" | "height")[] {
  if (shape === "linear") return ["wallA", "height"];
  if (shape === "L") return ["wallA", "wallB", "height"];
  return ["wallA", "wallB", "wallC", "height"];
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
  if (shape === "linear") return undefined;
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
    cornerDirection: requireDirection(direction),
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
