import {
  isPresetShape,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_WIDTH_MM,
  PRESET_LIST_LIMIT,
  PRESET_WINDOW_MM,
  type PresetShape,
} from "@lemnaria/configurator-domain";
import type { PresetNeighbourhood, PresetWalls } from "@lemnaria/persistence";

export type PresetListQuery =
  | { readonly kind: "valid"; readonly neighbourhood: PresetNeighbourhood }
  | { readonly kind: "invalid" };

const INVALID: PresetListQuery = { kind: "invalid" };

const QUERY_KEYS: readonly string[] = ["shape", "a", "b", "c"];

/** A whole number written in digits with no sign, no point, no exponent and no leading zero. */
const WALL_DIGITS = /^[1-9][0-9]{0,4}$/;

/**
 * The room a listing is asked about, read strictly: the four keys and no other, each at most once, the shape one of the
 * three, and exactly the walls the shape has (`b` for an L and a U, `c` for a U alone), each a whole number of
 * millimetres from 1 to the room's own bound. Anything else is invalid and costs no query. The window and the limit are
 * the server's, never the caller's.
 */
export function parsePresetListQuery(
  searchParams: URLSearchParams,
): PresetListQuery {
  if (!hasOnlyEachKnownKeyOnce(searchParams)) return INVALID;
  const shape = searchParams.get("shape");
  if (shape === null || !isPresetShape(shape)) return INVALID;
  const walls = wallsOf(shape, searchParams);
  if (walls === undefined) return INVALID;
  return {
    kind: "valid",
    neighbourhood: {
      shape,
      walls,
      windowMm: PRESET_WINDOW_MM,
      limit: PRESET_LIST_LIMIT,
    },
  };
}

function hasOnlyEachKnownKeyOnce(searchParams: URLSearchParams): boolean {
  const keys = Array.from(searchParams.keys());
  return (
    keys.every((key) => QUERY_KEYS.includes(key)) &&
    new Set(keys).size === keys.length
  );
}

function wallsOf(
  shape: PresetShape,
  searchParams: URLSearchParams,
): PresetWalls | undefined {
  const aMm = wallMmOf(searchParams.get("a"), MAX_ROOM_WIDTH_MM);
  if (aMm === undefined) return undefined;
  if (shape === "linear") {
    return hasNoWall(searchParams, ["b", "c"]) ? { aMm } : undefined;
  }
  const bMm = wallMmOf(searchParams.get("b"), MAX_ROOM_DEPTH_MM);
  if (bMm === undefined) return undefined;
  if (shape === "L") {
    return hasNoWall(searchParams, ["c"]) ? { aMm, bMm } : undefined;
  }
  const cMm = wallMmOf(searchParams.get("c"), MAX_ROOM_DEPTH_MM);
  return cMm === undefined ? undefined : { aMm, bMm, cMm };
}

/** Whether none of the walls the shape lacks is named at all, whatever it is set to. */
function hasNoWall(
  searchParams: URLSearchParams,
  keys: readonly string[],
): boolean {
  return keys.every((key) => !searchParams.has(key));
}

/** The wall, or `undefined` for an absent key and for a value that is not a whole number in range. */
function wallMmOf(raw: string | null, maximumMm: number): number | undefined {
  if (raw === null || !WALL_DIGITS.test(raw)) return undefined;
  const millimetres = Number(raw);
  return millimetres <= maximumMm ? millimetres : undefined;
}
