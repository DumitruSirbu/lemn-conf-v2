// **The floor a design records, and the strips it does not.**
//
// §4 derives a void only *inside* a column, so a strip of floor between two frozen extents is
// invisible to every other instrument the suite has: it belongs to no placement, to no recorded
// empty column and to no derived void, and ADR 0031 says as much where it sets
// `EDGE_ABUTMENT_TOLERANCE_M`. This module is the one place the suite asks the question directly.
//
// It reads the **published column map** — the design as a customer sees it — and never a
// composition plan. The defect this was written for shipped a design that contradicted its own
// plan, so an instrument reading the plan agreed with a wrong kitchen.
import type { Column, DesignWall } from "../../src/index.js";

/** The height the floor is read at. A base column's region starts at the floor and a wall-row
 *  column's starts at the wall row, so reading at the floor separates the two rows exactly and
 *  leaves no threshold to tune. */
const FLOOR_M = 0;

/** Every gap **between** the recorded floor spans of one wall, as `"A:900-950"`.
 *
 *  Interior gaps only. The free floor beyond the last run is where the kitchen stops, not a strip
 *  something lost: a kitchen need not reach the end of its wall. What no design may hold is a piece
 *  of floor with recorded space on both sides of it and nothing recorded over it. */
export function unrecordedFloorStripsMm(
  columns: ReadonlyMap<string, Column>,
  wall: DesignWall,
): readonly string[] {
  const spans = recordedFloorSpansMm(columns, wall);
  const strips: string[] = [];
  let reached = spans[0]?.[0] ?? 0;
  for (const [startMm, endMm] of spans) {
    if (startMm > reached) {
      strips.push(`${wall}:${String(reached)}-${String(startMm)}`);
    }
    reached = Math.max(reached, endMm);
  }
  return strips;
}

/** The along-wall extents of every column standing on the floor, in ascending order. Two may
 *  overlap — §3.2 keys columns on a centre — so the caller walks them with a running reach rather
 *  than pairing them off. */
function recordedFloorSpansMm(
  columns: ReadonlyMap<string, Column>,
  wall: DesignWall,
): readonly (readonly [number, number])[] {
  return [...columns.values()]
    .filter((column) => column.wall === wall && standsOnTheFloor(column))
    .map((column): [number, number] => {
      const centreMm = Math.round(alongWallMm(column));
      const widthMm = Math.round(column.w * 1000);
      return [centreMm - widthMm / 2, centreMm + widthMm / 2];
    })
    .sort((left, right) => left[0] - right[0]);
}

function standsOnTheFloor(column: Column): boolean {
  return column.regions.some(
    ([lowM, highM]) => lowM <= FLOOR_M && FLOOR_M < highM,
  );
}

function alongWallMm(column: Column): number {
  return (column.wall === "A" ? column.x : column.z) * 1000;
}
