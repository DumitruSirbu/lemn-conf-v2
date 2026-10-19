import {
  DesignRoomShapeSchema,
  DesignSchema,
  FinishSchema,
  isDesignId,
  type Design,
  type DesignRoomShape,
  type KitchenSummary,
} from "@lemnaria/configurator-domain";

// What `GET /api/account/kitchens` answers, as this screen reads it. The body arrives as the classifier's untyped
// `received` data, and every member is checked here: an id goes into an address, a finish into a catalogue lookup, and a
// page that does not have the shape below is told as a failed request, never drawn half-understood.
//
// The contract (Lot 2 plan, E1): `{ total, kitchens: [{ id, name | null, updatedAt, isSent, summary }], nextCursor | null }`
// where `summary` is the domain's `KitchenSummary` (shape, walls in millimetres, finish). Each kitchen also carries its
// stored `document`, which prices the card; a document this build cannot read costs the card its price and nothing more.

/** One kitchen of the list. */
export interface ListedKitchen {
  readonly id: string;
  /** The name the person gave it; `undefined` when they gave none and the card says what the facts generate. */
  readonly name: string | undefined;
  /** When it was last changed, in epoch milliseconds. */
  readonly updatedAtMs: number;
  readonly updatedAtIso: string;
  readonly isSent: boolean;
  readonly summary: KitchenSummary;
  /** The stored design, checked by the domain's schema; `undefined` when it fails, and the card then shows no price. */
  readonly document: Design | undefined;
}

export interface KitchensPage {
  /** How many kitchens the account has, counted by the server. */
  readonly total: number;
  readonly kitchens: readonly ListedKitchen[];
  /** What the next page is asked with; `undefined` on the last page. */
  readonly nextCursor: string | undefined;
}

/** An opaque keyset cursor goes into the address of the next request; a longer one is not one the server made. */
const MAX_CURSOR_LENGTH = 512;

/** The walls a room of each shape has, in the order A, B, C. */
const WALL_COUNT_OF_SHAPE: Readonly<Record<DesignRoomShape, number>> = {
  linear: 1,
  L: 2,
  U: 3,
};

/** The page the body holds, or nothing when any part of it is not what the contract says. */
export function kitchensPageFrom(body: unknown): KitchensPage | undefined {
  const total = ownValueOf(body, "total");
  const rawKitchens = ownValueOf(body, "kitchens");
  const nextCursor = ownValueOf(body, "nextCursor");
  if (!isCount(total) || !Array.isArray(rawKitchens)) return undefined;
  if (!isCursorOrNull(nextCursor)) return undefined;
  const kitchens = (rawKitchens as readonly unknown[]).map(kitchenFrom);
  if (!kitchens.every(isListedKitchen)) return undefined;
  return { total, kitchens, nextCursor: nextCursor ?? undefined };
}

function isCursorOrNull(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_CURSOR_LENGTH)
  );
}

function kitchenFrom(raw: unknown): ListedKitchen | undefined {
  const id = ownValueOf(raw, "id");
  const name = ownValueOf(raw, "name");
  const updatedAt = ownValueOf(raw, "updatedAt");
  const isSent = ownValueOf(raw, "isSent");
  const summary = summaryFrom(ownValueOf(raw, "summary"));
  if (typeof id !== "string" || !isDesignId(id)) return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  if (typeof updatedAt !== "string" || typeof isSent !== "boolean") {
    return undefined;
  }
  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs) || summary === undefined) return undefined;
  return {
    id,
    name: name === null || name.trim() === "" ? undefined : name,
    updatedAtMs,
    updatedAtIso: updatedAt,
    isSent,
    summary,
    document: documentFrom(ownValueOf(raw, "document")),
  };
}

function documentFrom(raw: unknown): Design | undefined {
  const parsed = DesignSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function summaryFrom(raw: unknown): KitchenSummary | undefined {
  const shape = DesignRoomShapeSchema.safeParse(ownValueOf(raw, "shape"));
  const wallsMm = ownValueOf(raw, "wallsMm");
  if (!shape.success || !Array.isArray(wallsMm)) return undefined;
  const walls = wallsMm as readonly unknown[];
  const hasShapesWalls = walls.length === WALL_COUNT_OF_SHAPE[shape.data];
  if (!hasShapesWalls || !walls.every(isWallLength)) return undefined;
  return {
    shape: shape.data,
    wallsMm: walls,
    finish: finishFrom(ownValueOf(raw, "finish")),
  };
}

/** A finish this build does not know is left out, not refused: the card then names the room without a colour, and the
 *  catalogue lookup behind a finish is never given an id it has no entry for. */
function finishFrom(raw: unknown): KitchenSummary["finish"] {
  const parsed = FinishSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function isListedKitchen(
  kitchen: ListedKitchen | undefined,
): kitchen is ListedKitchen {
  return kitchen !== undefined;
}

function isWallLength(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Only what the body's own object holds; anything that is not an object holds nothing. */
function ownValueOf(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.hasOwn(value, name)
    ? (value as Readonly<Record<string, unknown>>)[name]
    : undefined;
}
