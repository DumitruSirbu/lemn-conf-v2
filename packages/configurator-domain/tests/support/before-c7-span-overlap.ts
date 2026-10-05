// What M7C wave C7 changed in a generated design, put back: a wall-row or top-row cabinet standing beside a
// full-height member (the fridge, a tall oven) was built deep, seat 561, because `overlapsAlongWall` read
// each run's centre as its start and so saw the abutting neighbour as overlapping by half the width
// difference. Today it takes the wall depth, seat 291. This helper re-applies the OLD predicate, centres as
// starts, to a generated design and writes the deep seat back on the cabinets it flags, so a digest recorded
// before C7 can be reproduced from today's output. It is meant for the 600 mm kitchens the digests cover.
import {
  CAPPED_SEAT_AT_600_MM,
  LIFTED_SEAT_AT_600_MM,
} from "./span-overlap-fixtures.js";

interface Placement {
  readonly wall: string;
  readonly alongMm: number;
  readonly y0Mm: number;
  readonly body: {
    readonly buildId: string;
    readonly widthMm: number;
    readonly heightMm: number;
    readonly seatDepthMm?: number;
  };
}

const WALL_ROW_FLOOR_MM = 1500;

/** The old predicate over millimetres: each centre taken as a start. */
function readsAsOverlapping(upper: Placement, tall: Placement): boolean {
  const overlapMm =
    Math.min(
      upper.alongMm + upper.body.widthMm,
      tall.alongMm + tall.body.widthMm,
    ) - Math.max(upper.alongMm, tall.alongMm);
  return upper.wall === tall.wall && overlapMm > 0;
}

function isFullHeight(placement: Placement): boolean {
  return placement.y0Mm === 0 && placement.body.heightMm > WALL_ROW_FLOOR_MM;
}

function wasBuiltDeep(
  placement: Placement,
  all: readonly Placement[],
): boolean {
  return (
    placement.y0Mm >= WALL_ROW_FLOOR_MM &&
    placement.body.buildId === "wall-cabinet" &&
    placement.body.seatDepthMm === CAPPED_SEAT_AT_600_MM &&
    all.filter(isFullHeight).some((tall) => readsAsOverlapping(placement, tall))
  );
}

/** `result` with the deep seat written back on every cabinet the old predicate lifted. A copy. */
export function withTheOldOverlapPutBack<T>(result: T): T {
  const generated = result as unknown as {
    readonly design?: { readonly placements: readonly Placement[] };
  };
  if (generated.design === undefined) return result;
  const { placements } = generated.design;
  const restored = placements.map((placement) =>
    wasBuiltDeep(placement, placements)
      ? {
          ...placement,
          body: { ...placement.body, seatDepthMm: LIFTED_SEAT_AT_600_MM },
        }
      : placement,
  );
  return {
    ...generated,
    design: { ...generated.design, placements: restored },
  } as unknown as T;
}
