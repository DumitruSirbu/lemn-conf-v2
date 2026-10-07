// Wave 7D1: what the composition shell's tests measure it against, derived **independently of the
// builder** — the band a run lies in, where the reference's structural assembly ends in it, and how
// far wall B's run must stop short of the wall. The builder reads the chain off its tiles' source;
// this reads it off the corner's own floor piece, so the two routes agree only if the rule does.
// Also the two faces a loaded session holds the shell in, which criterion 4's insert goes through.
import { alongWallPositionAtMm } from "../../src/along-wall-chain-shift.js";
import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  deriveColumns,
  deriveRecordedColumns,
  derivePlacementRecords,
  deriveSlotBand,
  insertBody,
  KITCHEN_L_DESIGN,
  projectFrozenMap,
  recomputeVoids,
  setCabinetDepth,
  toMetres,
  toMillimetres,
  wallLengthMm,
  withFrozenMap,
  type Column,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type EmptyColumn,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/index.js";
import { CORNER_WALL_UNIT_TEMPLATES } from "../../src/fixtures/kitchen-l-design.js";
import { alongWallCoordinate, LEVELS } from "../../src/module-grid.js";
import {
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_THICKNESS_M,
  runEndPanelSeatM,
} from "../../src/run-end-panel.js";
import { createFakeProbe, createFakeProbeFactory } from "./fake-probe.js";

export const SHELL_OCCURRED_AT = "2026-09-11T12:00:00.000Z";

/** The body criterion 4 inserts: §7's sink base, the first thing composition places on a run. */
export const SINK_BUILD_ID = "base-sink";

export const SHELL_CABINET_DEPTH_MM = cabinetDepthMmOf(KITCHEN_L_DESIGN);
export const SHELL_CATALOG = buildKitchenLBodyCatalog(SHELL_CABINET_DEPTH_MM);

// M7B U1 slice S1's minimal type-level fix: `DesignWall` widened to include `"C"` (ADR 0132), but
// this whole support module measures `buildLShellDesign`'s own two walls. Wall C's shell is U2's.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

/** The shell for `room`, built at the one moment every shell test uses. */
export function shellIn(room: DesignRoom): Design {
  return buildLShellDesign({ room, occurredAt: SHELL_OCCURRED_AT });
}

/** `design` taken to another declared depth by the product's own command, with the fake probe. */
export function atCabinetDepth(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: SHELL_OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`setCabinetDepth: ${result.reason.code}`);
  return result.design;
}

/** Both walls of an L. */
export const WALLS: readonly TwoWallDispatch[] = ["A", "B"];

/** Half-open along-wall interval in millimetres. */
export interface IntervalMm {
  readonly startMm: number;
  readonly endMm: number;
}

/** One `LEVELS` row, in millimetres, cut at the room's ceiling. */
export interface BandMm extends IntervalMm {
  readonly name: string;
}

const BAND_NAMES = ["base", "wall", "top"] as const;

export function isStructuralBuildId(buildId: string): boolean {
  return SHELL_CATALOG.get(buildId)?.structuralReason !== undefined;
}

/** The whole structural assembly a shell is cut from — the pieces a low ceiling excludes included,
 *  because an excluded piece still reserves its footprint (Adjudication 7D1-P, P5 (iii)): the reference's
 *  own, then the corner wall unit's two (M7C wave C2), which the shell templates and the seeded kitchen
 *  does not carry. A base-only back wall (a large U) has the first part only. */
export const STRUCTURAL_ASSEMBLY: readonly DesignPlacement[] = [
  ...KITCHEN_L_DESIGN.placements.filter((placement) =>
    isStructuralBuildId(placement.body.buildId),
  ),
  ...CORNER_WALL_UNIT_TEMPLATES,
];

/** Every band a room of this height has any of, each cut at `min(height, grid top)`. */
export function bandsUnder(heightMm: number): readonly BandMm[] {
  return LEVELS.map(([startM, endM], index) => ({
    name: BAND_NAMES[index] ?? `level-${String(index)}`,
    startMm: toMillimetres(startM),
    endMm: Math.min(toMillimetres(endM), heightMm),
  })).filter((band) => band.endMm > band.startMm);
}

export function alongIntervalOf(entry: {
  readonly alongMm: number;
  readonly widthMm: number;
}): IntervalMm {
  return {
    startMm: entry.alongMm - entry.widthMm / 2,
    endMm: entry.alongMm + entry.widthMm / 2,
  };
}

/** Whether a vertical span `[floor, top]` shares a positive height with the band. */
export function reachesIntoBand(
  span: { readonly floorMm: number; readonly topMm: number },
  band: BandMm,
): boolean {
  return (
    Math.max(span.floorMm, band.startMm) < Math.min(span.topMm, band.endMm)
  );
}

/** Where a free run starts on `wall` in `band`: the far edge of the reference's structural pieces
 *  there, or 0 where none stands in that band. */
export function runStartMm(wall: DesignWall, band: BandMm): number {
  const edgesMm = STRUCTURAL_ASSEMBLY.filter(
    (placement) =>
      placement.wall === wall &&
      reachesIntoBand(
        {
          floorMm: placement.y0Mm,
          topMm: placement.y0Mm + placement.body.heightMm,
        },
        band,
      ),
  ).map(
    (placement) =>
      alongIntervalOf({ ...placement.body, alongMm: placement.alongMm }).endMm,
  );
  return Math.max(0, ...edgesMm);
}

/** How far the corner's floor piece on wall B moves out from the shell's depth to the deepest
 *  declared one — the space wall B's run must leave so it still fits after a depth change. */
export function wallBReserveMm(): number {
  const floorPiece = STRUCTURAL_ASSEMBLY.find(
    (placement) => placement.wall === "B" && placement.y0Mm === 0,
  );
  if (!floorPiece) throw new Error("the reference has no floor corner on B");
  const shiftsMm = declaredCabinetDepthsMm().map(
    (toCabinetDepthMm) =>
      alongWallPositionAtMm({
        placement: floorPiece,
        catalog: SHELL_CATALOG,
        fromCabinetDepthMm: SHELL_CABINET_DEPTH_MM,
        toCabinetDepthMm,
        shape: "L",
      }) - floorPiece.alongMm,
  );
  return Math.max(0, ...shiftsMm);
}

/** The run-end panel's gap and slab, from `run-end-panel.ts`'s own constants: how far short of wall A's
 *  end a run must stop for its finished end to be drawn (ADR 0045 Amendment A). */
export const RUN_END_PANEL_FOOTPRINT_MM = toMillimetres(
  RUN_END_PANEL_GAP_M + RUN_END_PANEL_THICKNESS_M,
);

/** Where a wall's floor run must stop: wall A at its own end, wall B short of its slide. */
export function plannedEndMm(room: DesignRoom, wall: DesignWall): number {
  return wallLengthMm(wall, room) - (wall === "B" ? wallBReserveMm() : 0);
}

/** The last millimetre a run of whole-millimetre centres can reach from `startMm` (P3). */
export function reachableEndMm(startMm: number, endMm: number): number {
  return endMm - ((endMm - startMm) % 2);
}

/** The recorded empty columns on `wall` that reach into `band`, as along-wall intervals. */
export function emptyIntervalsIn(
  design: Design,
  wall: DesignWall,
  band: BandMm,
): readonly IntervalMm[] {
  return (design.emptyColumns ?? [])
    .filter(
      (entry: EmptyColumn) =>
        entry.wall === wall &&
        reachesIntoBand({ floorMm: entry.y0Mm, topMm: entry.topMm }, band),
    )
    .map(alongIntervalOf);
}

/** The intervals merged where they touch or overlap, in order. */
export function unionOf(
  intervals: readonly IntervalMm[],
): readonly IntervalMm[] {
  const sorted = [...intervals].sort((a, b) => a.startMm - b.startMm);
  const merged: IntervalMm[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.startMm <= last.endMm) {
      merged[merged.length - 1] = {
        startMm: last.startMm,
        endMm: Math.max(last.endMm, interval.endMm),
      };
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** The total length two or more intervals claim twice. Zero means none of them overlap. */
export function overlapMm(intervals: readonly IntervalMm[]): number {
  const claimedMm = intervals.reduce(
    (sum, interval) => sum + (interval.endMm - interval.startMm),
    0,
  );
  const coveredMm = unionOf(intervals).reduce(
    (sum, interval) => sum + (interval.endMm - interval.startMm),
    0,
  );
  return claimedMm - coveredMm;
}

/** `outer`'s coverage minus `inner`'s, as intervals — what the first records and the second does
 *  not. */
export function differenceOf(
  outer: readonly IntervalMm[],
  inner: readonly IntervalMm[],
): readonly IntervalMm[] {
  return unionOf(outer).flatMap((piece) =>
    unionOf(inner).reduce<IntervalMm[]>(
      (remaining, hole) => remaining.flatMap((part) => cut(part, hole)),
      [piece],
    ),
  );
}

function cut(part: IntervalMm, hole: IntervalMm): IntervalMm[] {
  const pieces: IntervalMm[] = [];
  if (hole.startMm > part.startMm) {
    pieces.push({
      startMm: part.startMm,
      endMm: Math.min(part.endMm, hole.startMm),
    });
  }
  if (hole.endMm < part.endMm) {
    pieces.push({
      startMm: Math.max(part.startMm, hole.endMm),
      endMm: part.endMm,
    });
  }
  return pieces.filter((piece) => piece.endMm > piece.startMm);
}

/** The shell as a loaded session holds it: the recorded face a command is handed, and the openings
 *  the published face offers (ADR 0090 Amendment B's two roles). */
export interface ShellFaces {
  readonly records: readonly PlacementRecord[];
  readonly recorded: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

export function facesOf(design: Design): ShellFaces {
  const records = derivePlacementRecords(design, SHELL_CATALOG);
  return {
    records,
    recorded: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
    voids: recomputeVoids(records, deriveColumns(records, design, design.room)),
  };
}

/** An opening's along-wall interval, in the millimetres a wall's length is written in. */
export function openingIntervalOf(opening: VoidRecord): IntervalMm {
  const centreM = alongWallCoordinate(opening.wall, opening);
  return {
    startMm: toMillimetres(centreM - opening.w / 2),
    endMm: toMillimetres(centreM + opening.w / 2),
  };
}

/** The base openings on `wall`, nearest the corner first. */
export function baseOpeningsOn(
  voids: readonly VoidRecord[],
  wall: DesignWall,
): readonly VoidRecord[] {
  return voids
    .filter((opening) => opening.wall === wall)
    .filter((opening) => deriveSlotBand(opening) === "base")
    .sort(
      (left, right) =>
        openingIntervalOf(left).startMm - openingIntervalOf(right).startMm,
    );
}

/** The base opening nearest the corner on `wall`, or none. */
export function firstBaseOpening(
  voids: readonly VoidRecord[],
  wall: DesignWall,
): VoidRecord | undefined {
  return baseOpeningsOn(voids, wall)[0];
}

/** How much floor run the shell records on `wall`: every empty column standing on the floor. */
export function freeFloorRunMm(design: Design, wall: DesignWall): number {
  return (design.emptyColumns ?? [])
    .filter((entry) => entry.wall === wall && entry.y0Mm === 0)
    .reduce((sum, entry) => sum + entry.widthMm, 0);
}

/** A sink base put into `opening` through the command every customer insert goes through, measured
 *  by the fake probe. */
export function insertSinkInto(design: Design, opening: VoidRecord) {
  return insertInto(design, { opening, buildId: SINK_BUILD_ID });
}

interface InsertRequest {
  readonly opening: VoidRecord;
  readonly buildId: string;
}

function insertInto(design: Design, request: InsertRequest) {
  const faces = facesOf(design);
  return insertBody({
    design,
    catalog: SHELL_CATALOG,
    columns: faces.recorded,
    voids: faces.voids,
    target: { kind: "void", id: request.opening.id },
    buildId: request.buildId,
    probe: createFakeProbe({ catalog: SHELL_CATALOG }),
    occurredAt: SHELL_OCCURRED_AT,
  });
}

/** The body composition fills a floor run with (ADR 0110 Amendment B2's floor-tile source). */
export const FLOOR_FILL_BUILD_ID = "base-cabinet";

/** The shell with **every** wall-A base opening filled by a base cabinet, one insert at a time, each
 *  saved the way the store saves it — the command's own map projected onto its design — so the next
 *  insert sees the kitchen the last one left. An opening the command refuses stays empty. */
export function withWallABaseRunFilled(shell: Design): Design {
  const targets = baseOpeningsOn(facesOf(shell).voids, "A").map(
    openingIntervalOf,
  );
  return targets.reduce(fillOpeningAt, shell);
}

function fillOpeningAt(design: Design, target: IntervalMm): Design {
  const opening = baseOpeningsOn(facesOf(design).voids, "A").find((candidate) =>
    sameInterval(openingIntervalOf(candidate), target),
  );
  if (!opening) return design;
  const result = insertInto(design, { opening, buildId: FLOOR_FILL_BUILD_ID });
  if (!result.ok) return design;
  const records = derivePlacementRecords(result.design, SHELL_CATALOG);
  return withFrozenMap(
    result.design,
    projectFrozenMap(result.effect.columns, records),
  );
}

function sameInterval(left: IntervalMm, right: IntervalMm): boolean {
  return left.startMm === right.startMm && left.endMm === right.endMm;
}

/** Where the run-end panel's outer face stands along wall A, in millimetres, or none when no panel
 *  is shown — `runEndPanelSeatM` plus half the slab. */
export function runEndPanelOuterFaceMm(design: Design): number | undefined {
  const seatM = runEndPanelSeatM(
    derivePlacementRecords(design, SHELL_CATALOG),
    design.room,
  );
  return seatM === undefined
    ? undefined
    : toMillimetres(seatM + RUN_END_PANEL_THICKNESS_M / 2);
}

/** Whether every interval lies inside the union of `container`. */
export function liesInside(
  intervals: readonly IntervalMm[],
  container: readonly IntervalMm[],
): boolean {
  return differenceOf(intervals, container).length === 0;
}
