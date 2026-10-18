import {
  MAX_DESIGN_BYTES,
  MAX_PRESET_DESIGN_BYTES,
  MAX_PRESET_NAME_CHARACTERS,
  MAX_PRESET_THUMBNAIL_BYTES,
  PRESET_SHAPES,
  PRESET_THUMBNAIL_TYPES,
  isDesignId,
  isPresetShape,
  isPresetThumbnailType,
  isShowablePresetName,
  isUnstorableText,
} from "@lemnaria/configurator-domain";
import type { Design } from "@lemnaria/configurator-domain";

import type {
  PresetNeighbourhood,
  PresetToRecord,
  PresetWalls,
} from "./preset-repository.js";

/** The widest a `presets` integer column holds (`integer`); a wall or a window beyond it is the server's refusal. */
const INTEGER_COLUMN_MAX = 2_147_483_647;

/** Far above any room and far below `INTEGER_COLUMN_MAX`, so a window never overflows a wall's difference. */
const MAX_WINDOW_MM = 1_000_000;

/** More than a Step 1 screen shows (`PRESET_LIST_LIMIT`), so a caller's limit is a choice and not a way to read the table. */
const MAX_LISTED_PRESETS = 100;

const REFUSALS = {
  preset: "the preset must be an object",
  shape: `the shape must be ${listedWithOr(PRESET_SHAPES)}`,
  walls:
    "the walls must be whole millimetres, wall B for an L and a U, wall C for a U alone",
  heightMm: "the height must be a whole number of millimetres above zero",
  designSize: `the design must serialise to at most ${String(MAX_PRESET_DESIGN_BYTES)} bytes, as a listing sends it`,
  design: `the design must be an object with a room, in text the database can hold, of at most ${String(MAX_DESIGN_BYTES)} bytes`,
  room: "the shape, the walls and the height must be those of the design's own room",
  typedName: `the typed name must be 1 to ${String(MAX_PRESET_NAME_CHARACTERS)} characters, NFC, trimmed, with no control, format or separator character (the bidi overrides included)`,
  thumbnail: `the thumbnail must be 1 to ${String(MAX_PRESET_THUMBNAIL_BYTES)} bytes`,
  thumbnailType: `the thumbnail type must be ${listedWithOr(PRESET_THUMBNAIL_TYPES)}`,
  windowMm: `the window must be a whole number of millimetres from 0 to ${String(MAX_WINDOW_MM)}`,
  limit: `the limit must be a whole number from 1 to ${String(MAX_LISTED_PRESETS)}`,
} as const;

type Refusal = keyof typeof REFUSALS;

type RefusedOperation = "record" | "list";

/**
 * Refuses, before any statement and with no value in the refusal, what the table's checks would and what the
 * application's rules add: a shape outside the three, walls that do not fit it, a height that is not a positive
 * integer, a design that is not an object's JSON text, is larger than `MAX_DESIGN_BYTES` or has no room, a shape, walls
 * or height that are not the design's own room's, a typed name that fails the name rule, a thumbnail of no size or too
 * much, and a type outside the three. What the server refuses beyond this (an id taken by another preset) is the
 * repository error. Shared by both repositories, so the fake refuses exactly this list. Returns the design's JSON text,
 * which is what both store.
 */
export function requireValidPresetToRecord(preset: PresetToRecord): string {
  if (!isObject(preset as unknown)) throw refusalOf("record", "preset");
  requireShapeAndWalls("record", preset.shape, preset.walls);
  if (!isPositiveColumnInteger(preset.heightMm)) {
    throw refusalOf("record", "heightMm");
  }
  if (
    preset.typedName !== undefined &&
    !isShowablePresetName(preset.typedName)
  ) {
    throw refusalOf("record", "typedName");
  }
  if (!isStorableThumbnail(preset.thumbnail)) {
    throw refusalOf("record", "thumbnail");
  }
  if (!isPresetThumbnailType(preset.thumbnailType)) {
    throw refusalOf("record", "thumbnailType");
  }
  const documentJson = designJsonTextOf(preset.design);
  if (!isWithinPresetDesignBound(preset.design)) {
    throw refusalOf("record", "designSize");
  }
  requireRoomOfTheDesign(preset);
  return documentJson;
}

/** The same refusal for a listing: a shape and walls that fit, a window and a limit within their bounds. */
export function requireValidPresetNeighbourhood(
  neighbourhood: PresetNeighbourhood,
): void {
  if (!isObject(neighbourhood as unknown)) throw refusalOf("list", "preset");
  requireShapeAndWalls("list", neighbourhood.shape, neighbourhood.walls);
  if (!isWholeNumberWithin(neighbourhood.windowMm, 0, MAX_WINDOW_MM)) {
    throw refusalOf("list", "windowMm");
  }
  if (!isWholeNumberWithin(neighbourhood.limit, 1, MAX_LISTED_PRESETS)) {
    throw refusalOf("list", "limit");
  }
}

/**
 * Whether a snapshot is small enough to be listed: the bytes of its JSON with `presetId` nulled, which is how the
 * listing sends it, at most `MAX_PRESET_DESIGN_BYTES`. The one measure, used by the write and by the listing.
 */
export function isWithinPresetDesignBound(design: Design): boolean {
  const text = jsonTextOf({ ...design, presetId: null });
  return (
    text !== undefined &&
    Buffer.byteLength(text, "utf8") <= MAX_PRESET_DESIGN_BYTES
  );
}

/** Whether a string has the shape of an id `record` made. Anything else names no row, so no statement is sent. */
export function isPresetId(value: unknown): value is string {
  return typeof value === "string" && isDesignId(value);
}

/** Whether every wall of `saved` is within `windowMm` of the same wall of `asked`, a missing wall matching only a
 *  missing wall. The SQL of `selectPublishedNearStatement` states the same rule over the columns. */
export function isWithinWindow(
  saved: PresetWalls,
  asked: PresetWalls,
  windowMm: number,
): boolean {
  return (
    isWallWithinWindow(saved.aMm, asked.aMm, windowMm) &&
    isWallWithinWindow(saved.bMm, asked.bMm, windowMm) &&
    isWallWithinWindow(saved.cMm, asked.cMm, windowMm)
  );
}

function isWallWithinWindow(
  saved: number | undefined,
  asked: number | undefined,
  windowMm: number,
): boolean {
  if (saved === undefined || asked === undefined) return saved === asked;
  return Math.abs(saved - asked) <= windowMm;
}

function listedWithOr(values: readonly string[]): string {
  return `${values.slice(0, -1).join(", ")} or ${values.at(-1) ?? ""}`;
}

function refusalOf(operation: RefusedOperation, part: Refusal): Error {
  const what = operation === "record" ? "record a preset" : "list presets";
  return new Error(`Refusing to ${what}: ${REFUSALS[part]}.`);
}

function requireShapeAndWalls(
  operation: RefusedOperation,
  shape: unknown,
  walls: PresetWalls,
): void {
  if (!isPresetShape(shape)) {
    throw refusalOf(operation, "shape");
  }
  if (!isObject(walls as unknown) || !wallsFitShape(shape, walls)) {
    throw refusalOf(operation, "walls");
  }
}

/** `presets_walls_match_shape`, with each wall a positive whole number that the column holds. */
function wallsFitShape(shape: string, walls: PresetWalls): boolean {
  const { aMm, bMm, cMm } = walls;
  if (!isPositiveColumnInteger(aMm)) return false;
  if (shape === "linear") return bMm === undefined && cMm === undefined;
  if (shape === "L") return isPositiveColumnInteger(bMm) && cMm === undefined;
  return isPositiveColumnInteger(bMm) && isPositiveColumnInteger(cMm);
}

/**
 * The columns are a copy of the design's own room, which the listing reads instead of the document, so a preset whose
 * columns say another room than its document would be listed for walls it does not fit. Wall A is the room's width,
 * wall B its depth (a `linear` room stores none) and wall C its `wallCMm`; the shape-and-walls check has already
 * judged which of the walls the shape has.
 */
function requireRoomOfTheDesign(preset: PresetToRecord): void {
  const { room } = preset.design;
  const { walls } = preset;
  const isSameRoom =
    room.shape === preset.shape &&
    room.widthMm === walls.aMm &&
    room.heightMm === preset.heightMm &&
    (preset.shape === "linear" || room.depthMm === walls.bMm) &&
    room.wallCMm === walls.cMm;
  if (!isSameRoom) throw refusalOf("record", "room");
}

function isPositiveColumnInteger(value: unknown): boolean {
  return isWholeNumberWithin(value, 1, INTEGER_COLUMN_MAX);
}

function isWholeNumberWithin(
  value: unknown,
  least: number,
  greatest: number,
): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= least &&
    value <= greatest
  );
}

function isStorableThumbnail(value: unknown): boolean {
  return (
    value instanceof Uint8Array &&
    value.byteLength >= 1 &&
    value.byteLength <= MAX_PRESET_THUMBNAIL_BYTES
  );
}

function designJsonTextOf(design: unknown): string {
  const text = jsonTextOf(design);
  if (
    text === undefined ||
    isUnstorableText(text) ||
    Buffer.byteLength(text, "utf8") > MAX_DESIGN_BYTES ||
    !isObjectJsonTextWithARoom(text)
  ) {
    throw refusalOf("record", "design");
  }
  return text;
}

function jsonTextOf(value: unknown): string | undefined {
  try {
    const text: unknown = JSON.stringify(value);
    return typeof text === "string" ? text : undefined;
  } catch {
    return undefined;
  }
}

function isObjectJsonTextWithARoom(text: string): boolean {
  const parsed = JSON.parse(text) as unknown;
  return isPlainObject(parsed) && isPlainObject(parsed["room"]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
