// M7B wave U1, AC6 — `mirror(D)`: the reviewed test utility for mirror equivariance under α.
//
// ADR 0132 decision 1 makes wall C a world wall: origin `(W, 0, 0)`, tangent `+Z`, fronts `−X`. Its
// along is measured from the A∩C corner exactly as wall B's is from A∩B, so reflecting the room in
// `x = W/2` is, on the stored document:
//
// - walls B ↔ C swap, each keeping its own `alongMm` (both walk `+z` from wall A's plane);
// - a wall-A centre `a` goes to `W − a` (wall A walks `+x` from A∩B, and the reflection reverses it);
// - the room's two side runs swap, `depthMm ↔ wallCMm`, since each is its own wall's length;
// - world `x ↦ W − x`, `z` unchanged, yaw `θ ↦ −θ` — which is how every derived record maps.
//
// **It covers validation and voids only, never composition** (M7B plan AC6; the owner's Q-U5: the
// walls are laid out independently, so a generated U is not its own mirror image).
//
// **What does not survive the reflection, stated rather than hidden:** on wall A, a run before the
// wall's start becomes a run past its end, so `…_BEFORE_WALL_START` and `…_PAST_WALL_END` swap on a
// wall-A finding. Wall B and wall C carry theirs across unchanged, because both start at wall A.
import type {
  Design,
  DesignPlacement,
  DesignRoom,
  DesignWall,
  EmptyColumn,
} from "../../src/design.js";
import { deriveColumnKeyAt } from "../../src/module-grid.js";
import type {
  DesignValidationCode,
  DesignValidationIssue,
} from "../../src/validate-design.js";
import type { VoidRecord } from "../../src/void-engine.js";

const MILLIMETRES_PER_METRE = 1000;

/** Rounds away float noise from `W − x`, and folds `−0` into `0` so a wall-A yaw compares equal. */
const COMPARISON_DECIMALS = 6;

const MIRRORED_WALL: Readonly<Record<DesignWall, DesignWall>> = {
  A: "A",
  B: "C",
  C: "B",
};

const WALL_A_END_CODE_SWAP: Readonly<
  Partial<Record<DesignValidationCode, DesignValidationCode>>
> = {
  PLACEMENT_BEFORE_WALL_START: "PLACEMENT_PAST_WALL_END",
  PLACEMENT_PAST_WALL_END: "PLACEMENT_BEFORE_WALL_START",
  EMPTY_COLUMN_BEFORE_WALL_START: "EMPTY_COLUMN_PAST_WALL_END",
  EMPTY_COLUMN_PAST_WALL_END: "EMPTY_COLUMN_BEFORE_WALL_START",
  COLUMN_EXTENT_BEFORE_WALL_START: "COLUMN_EXTENT_PAST_WALL_END",
  COLUMN_EXTENT_PAST_WALL_END: "COLUMN_EXTENT_BEFORE_WALL_START",
};

/** The U document reflected in `x = W/2`. Throws on anything but a U: an L or a straight room has
 *  no wall C to swap wall B with, so its mirror is not a document of the same shape. */
export function mirrorUDesign(design: Design): Design {
  const room = mirroredRoom(design.room);
  const mirrorAlong = (wall: DesignWall, alongMm: number): number =>
    wall === "A" ? room.widthMm - alongMm : alongMm;
  const mirrorRun = <Run extends EmptyColumn>(run: Run): Run => ({
    ...run,
    wall: MIRRORED_WALL[run.wall],
    alongMm: mirrorAlong(run.wall, run.alongMm),
  });
  const mirrorPlacement = (placement: DesignPlacement): DesignPlacement => ({
    ...placement,
    wall: MIRRORED_WALL[placement.wall],
    alongMm: mirrorAlong(placement.wall, placement.alongMm),
  });
  return {
    ...design,
    room,
    placements: design.placements.map(mirrorPlacement),
    ...(design.emptyColumns
      ? { emptyColumns: design.emptyColumns.map(mirrorRun) }
      : {}),
    ...(design.columnExtents
      ? { columnExtents: design.columnExtents.map(mirrorRun) }
      : {}),
  };
}

function mirroredRoom(room: DesignRoom): DesignRoom {
  if (room.shape !== "U" || room.wallCMm === undefined) {
    throw new Error(`mirrorUDesign needs a U room, got ${room.shape}`);
  }
  return { ...room, depthMm: room.wallCMm, wallCMm: room.depthMm };
}

/** `design`'s findings as they read on `mirrorUDesign(design)`, sorted so the two sweeps' order —
 *  A∩B first, then A∩C — is not mistaken for a difference. Paths index the same arrays in the same
 *  order on both sides, so only a wall-A end code moves. */
export function mirroredFindings(
  design: Design,
  findings: readonly DesignValidationIssue[],
): string[] {
  return sortedFindings(
    findings.map((finding) =>
      isOnWallA(design, finding.path)
        ? {
            ...finding,
            code: WALL_A_END_CODE_SWAP[finding.code] ?? finding.code,
          }
        : finding,
    ),
  );
}

export function sortedFindings(
  findings: readonly Pick<DesignValidationIssue, "code" | "path">[],
): string[] {
  return findings.map(({ code, path }) => `${path} ${code}`).sort();
}

function isOnWallA(design: Design, path: string): boolean {
  const [arrayName, indexText] = path.split(".");
  const index = Number(indexText);
  if (arrayName === "placements") return design.placements[index]?.wall === "A";
  if (arrayName === "emptyColumns") {
    return design.emptyColumns?.[index]?.wall === "A";
  }
  if (arrayName === "columnExtents") {
    return design.columnExtents?.[index]?.wall === "A";
  }
  return false;
}

/** One void as the comparison reads it: its key re-derived on the mirrored wall, world `x ↦ W − x`
 *  and yaw `θ ↦ −θ`, every number rounded to `COMPARISON_DECIMALS`. */
export interface ComparableVoid {
  readonly id: string;
  readonly col: string;
  readonly wall: DesignWall;
  readonly numbers: readonly number[];
}

export function mirroredVoids(
  voids: readonly VoidRecord[],
  widthMm: number,
): ComparableVoid[] {
  return comparableVoids(
    voids.map((record) => {
      const col = mirroredColumnKey(record.col, widthMm);
      return {
        ...record,
        id: col + record.id.slice(record.col.length),
        col,
        wall: MIRRORED_WALL[record.wall],
        x: widthMm / MILLIMETRES_PER_METRE - record.x,
        ry: -record.ry,
      };
    }),
  );
}

export function comparableVoids(
  voids: readonly VoidRecord[],
): ComparableVoid[] {
  return voids
    .map((record) => ({
      id: record.id,
      col: record.col,
      wall: record.wall,
      numbers: [
        record.x,
        record.z,
        record.ry,
        record.w,
        record.d,
        record.y0,
        record.h,
        record.spanY0,
        record.spanH,
      ].map(rounded),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** `W|along` → the key the mirrored column is filed under. A side wall keeps its along text
 *  verbatim (`-0.00` included) and swaps its letter. Wall A's along is re-derived from whole
 *  millimetres (`W − a`), never from the rounded two-decimal text, so a centre the generator put on
 *  the 10 mm key grid lands on exactly the key the engine derives for it. */
function mirroredColumnKey(col: string, widthMm: number): string {
  const [wallText = "", alongText = ""] = col.split("|");
  const wall = wallText as DesignWall;
  if (wall !== "A") return `${MIRRORED_WALL[wall]}|${alongText}`;
  const alongMm = Math.round(Number(alongText) * MILLIMETRES_PER_METRE);
  return deriveColumnKeyAt("A", (widthMm - alongMm) / MILLIMETRES_PER_METRE);
}

function rounded(value: number): number {
  const result = Number(value.toFixed(COMPARISON_DECIMALS));
  return Object.is(result, -0) ? 0 : result;
}
