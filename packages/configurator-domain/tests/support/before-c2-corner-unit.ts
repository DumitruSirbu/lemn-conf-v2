// What M7C wave C2 changed in a generated design where the corner wall unit stands, put back — so a
// digest recorded before it can be reproduced from today's output, and a rebaseline is shown to be
// exactly these changes and no others. Only a design whose back wall carries the unit is touched; a
// large U's, which keeps its strips, has nothing to put back.
//
// Three things moved, all over wall A's corner:
//  - the unit's two placements (`wall-corner-x-900`, `-top`) exist;
//  - the base X-leg's recorded column, which now holds the unit over it, spans the whole height and not
//    just the base row's;
//  - the wall-only strips over the corner, which the unit covers, are no longer recorded.
//
// It reproduces an L and a U of even width. An odd-width U is refused (see `asBeforeTheCornerUnit`).
import { splitEmptySpanAtCap } from "../../src/split-empty-span.js";

const UNIT_BUILD_IDS = new Set(["wall-corner-x-900", "wall-corner-x-900-top"]);
const X_LEG_BUILD_ID = "base-corner-x-900";
const STRIP_SOURCE = "wall-cabinet";

interface Row {
  id?: string;
  wall?: string;
  alongMm: number;
  y0Mm: number;
  topMm?: number;
  depthFromBuildId?: string;
  body: { buildId: string; widthMm: number; heightMm: number };
}

interface ColumnRow {
  wall?: string | undefined;
  alongMm: number;
  depthFromBuildId?: string;
  topMm?: number;
  [key: string]: unknown;
}

interface Wire {
  placements: Row[];
  emptyColumns?: ColumnRow[];
  columnExtents?: ColumnRow[];
  [key: string]: unknown;
}

/** `design` as it was before the unit stood over its corner bases: its placements gone, the X-leg's column
 *  back to the base row's height, and the strips it covers recorded again — at the left corner and, in a
 *  U, at the right one. */
export function asBeforeTheCornerUnit(
  design: Wire,
  stripDepthMm: number,
  roomTopMm: number,
): Wire {
  const middles = design.placements.filter(
    (placement) => placement.body.buildId === "wall-corner-x-900",
  );
  if (middles.length === 0) return design;
  const isRight = (unit: Row) => String(unit.id).startsWith("right-");
  const left = middles.find((unit) => !isRight(unit));
  const right = middles.find(isRight);
  const oddFloorMm =
    left !== undefined && right !== undefined
      ? (right.alongMm -
          right.body.widthMm / 2 -
          (left.alongMm + left.body.widthMm / 2)) %
        2
      : 0;
  if (oddFloorMm !== 0) {
    throw new Error(
      "before-c2-corner-unit: an odd-width U records its right strip from the floor run's trimmed end, " +
        "in whole millimetres, which this put-back does not reproduce; use an even width",
    );
  }
  const stripsOf = (unit: Row) => {
    const startMm = unit.alongMm - unit.body.widthMm / 2;
    const endMm = unit.alongMm + unit.body.widthMm / 2;
    return splitEmptySpanAtCap(startMm, endMm).map((piece) => ({
      wall: unit.wall,
      alongMm: piece.centreMm,
      widthMm: piece.widthMm,
      y0Mm: unit.y0Mm,
      topMm: roomTopMm,
      depthMm: stripDepthMm,
      depthFromBuildId: STRIP_SOURCE,
    }));
  };
  const xLegHeightAt = (alongMm: number) => {
    const xLeg = design.placements.find(
      (placement) =>
        placement.body.buildId === X_LEG_BUILD_ID &&
        placement.alongMm === alongMm,
    );
    return xLeg === undefined ? undefined : xLeg.y0Mm + xLeg.body.heightMm;
  };
  const restored: Wire = {
    ...design,
    placements: design.placements.filter(
      (placement) => !UNIT_BUILD_IDS.has(placement.body.buildId),
    ),
    columnExtents: (design.columnExtents ?? []).map((extent) => {
      const topMm =
        extent.depthFromBuildId === X_LEG_BUILD_ID
          ? xLegHeightAt(extent.alongMm)
          : undefined;
      return topMm === undefined ? extent : { ...extent, topMm };
    }),
    emptyColumns: withStripsInTheirOldPlaces(
      design.emptyColumns ?? [],
      left === undefined ? [] : stripsOf(left),
      right === undefined ? [] : stripsOf(right),
    ),
  };
  return inKeyOrderOf(design, restored);
}

/** The tiles as the shell wrote them: wall A's left strips, its floor run, then its right strips, ahead of
 *  every other wall's. Today's design holds only the floor run, first of the document's tiles. */
function withStripsInTheirOldPlaces(
  tiles: ColumnRow[],
  leftStrips: ColumnRow[],
  rightStrips: ColumnRow[],
): ColumnRow[] {
  const firstOtherWallAt = tiles.findIndex((tile) => tile.wall !== "A");
  const wallAEnd = firstOtherWallAt === -1 ? tiles.length : firstOtherWallAt;
  return [
    ...leftStrips,
    ...tiles.slice(0, wallAEnd),
    ...rightStrips,
    ...tiles.slice(wallAEnd),
  ];
}

/** A document's keys are written in the order the generator wrote them, and a digest over `JSON.stringify`
 *  reads it: the strips came before the extents in the design the unit replaced. */
function inKeyOrderOf(original: Wire, restored: Wire): Wire {
  const keys = Object.keys(original);
  const ordered = keys.includes("emptyColumns")
    ? keys
    : keys.flatMap((key) =>
        key === "columnExtents" ? ["emptyColumns", key] : [key],
      );
  return Object.fromEntries(ordered.map((key) => [key, restored[key]])) as Wire;
}

const WALL_STRIP_DEPTH_AT_600_MM = 330;
const TOP_ROW_FLOOR_CEILING_MM = 2600;

/** Every design inside `result` (a generation result, or a design) with the unit put back, read through
 *  JSON so the input is never mutated: the wall-only strips' depth is the wall cabinet's at the shell's
 *  600 mm, and their top is the room's, capped at the grid's. */
export function withTheCornerUnitPutBack(result: unknown): unknown {
  return JSON.parse(JSON.stringify(result), (_key, value: unknown) => {
    if (
      typeof value === "object" &&
      value !== null &&
      "placements" in value &&
      "room" in value
    ) {
      const design = value as Wire & { room: { heightMm: number } };
      return asBeforeTheCornerUnit(
        design,
        WALL_STRIP_DEPTH_AT_600_MM,
        Math.min(design.room.heightMm, TOP_ROW_FLOOR_CEILING_MM),
      );
    }
    return value;
  }) as unknown;
}
